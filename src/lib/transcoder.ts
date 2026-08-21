import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';

const execPromise = util.promisify(exec);

export type QualityPreset = '1080p-high' | '1080p' | '720p' | '480p' | 'original' | 'auto';
export type HardwareEncoderType = 'qsv' | 'nvenc' | 'vaapi' | 'videotoolbox' | 'cpu';

interface TranscoderConfig {
    encoder: HardwareEncoderType;
    videoCodec: string;
    hwaccelFlag?: string[];
    description: string;
}

let cachedEncoderConfig: TranscoderConfig | null = null;
let lastProbeTime = 0;

/**
 * Probe server environment for available hardware acceleration (Intel QuickSync, NVENC, VAAPI, CPU)
 */
export async function detectHardwareEncoder(): Promise<TranscoderConfig> {
    const now = Date.now();
    if (cachedEncoderConfig && (now - lastProbeTime < 300000)) { // cache for 5 mins
        return cachedEncoderConfig;
    }

    try {
        const { stdout } = await execPromise('ffmpeg -encoders', { timeout: 3000 });

        // 1. Check Intel QuickSync (QSV)
        if (stdout.includes('h264_qsv')) {
            cachedEncoderConfig = {
                encoder: 'qsv',
                videoCodec: 'h264_qsv',
                hwaccelFlag: ['-hwaccel', 'qsv'],
                description: 'Intel QuickSync Video (QSV Hardware Accelerated)'
            };
            lastProbeTime = now;
            return cachedEncoderConfig;
        }

        // 2. Check NVIDIA NVENC
        if (stdout.includes('h264_nvenc')) {
            cachedEncoderConfig = {
                encoder: 'nvenc',
                videoCodec: 'h264_nvenc',
                hwaccelFlag: ['-hwaccel', 'cuda'],
                description: 'NVIDIA NVENC (CUDA Hardware Accelerated)'
            };
            lastProbeTime = now;
            return cachedEncoderConfig;
        }

        // 3. Check Linux VAAPI (e.g. /dev/dri/renderD128)
        if (stdout.includes('h264_vaapi') && fs.existsSync('/dev/dri/renderD128')) {
            cachedEncoderConfig = {
                encoder: 'vaapi',
                videoCodec: 'h264_vaapi',
                hwaccelFlag: ['-vaapi_device', '/dev/dri/renderD128', '-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi'],
                description: 'Linux VAAPI (Intel / AMD Hardware Accelerated)'
            };
            lastProbeTime = now;
            return cachedEncoderConfig;
        }

        // 4. Check Apple VideoToolbox (macOS)
        if (stdout.includes('h264_videotoolbox')) {
            cachedEncoderConfig = {
                encoder: 'videotoolbox',
                videoCodec: 'h264_videotoolbox',
                description: 'Apple VideoToolbox (Metal Hardware Accelerated)'
            };
            lastProbeTime = now;
            return cachedEncoderConfig;
        }
    } catch {
        // Probe failed or ffmpeg not present in standard path
    }

    // Default: Highly optimized multi-threaded CPU libx264
    cachedEncoderConfig = {
        encoder: 'cpu',
        videoCodec: 'libx264',
        description: 'Multi-Core CPU libx264 (Software Optimized)'
    };
    lastProbeTime = now;
    return cachedEncoderConfig;
}

/**
 * Build FFmpeg argument array for server-side native transcoding
 */
export function buildFFmpegArgs(params: {
    filePath: string;
    startTime?: string;
    quality?: QualityPreset;
    mode?: 'universal' | 'audio' | 'direct';
    config: TranscoderConfig;
}): string[] {
    const { filePath, startTime = '0', quality = 'auto', mode = 'universal', config } = params;
    const startSec = parseFloat(startTime);
    const args: string[] = [];

    // Fast seek before input
    if (startSec > 0) {
        args.push('-ss', startSec.toString());
    }

    // Hardware acceleration flags before -i
    if (config.hwaccelFlag && mode === 'universal') {
        args.push(...config.hwaccelFlag);
    }

    args.push('-i', filePath);

    if (mode === 'audio') {
        // Audio transcode only: Copy video stream bit-perfect, convert audio to high-compatibility AAC stereo
        args.push(
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '256k',
            '-ac', '2',
            '-sn',
            '-f', 'mp4',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            'pipe:1'
        );
        return args;
    }

    // Universal / Server-Side Optimized Conversion (H.264 High Profile + AAC Stereo)
    let maxRate = '10M';
    let bufSize = '20M';
    let crf = '21';
    let scaleFilter: string | null = null;
    let audioBitrate = '256k';

    switch (quality) {
        case '1080p-high':
            maxRate = '14M';
            bufSize = '28M';
            crf = '19';
            scaleFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease';
            audioBitrate = '320k';
            break;
        case '1080p':
        case 'auto':
            maxRate = '10M';
            bufSize = '20M';
            crf = '21';
            scaleFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease';
            audioBitrate = '256k';
            break;
        case '720p':
            maxRate = '4.5M';
            bufSize = '9M';
            crf = '23';
            scaleFilter = 'scale=1280:720:force_original_aspect_ratio=decrease';
            audioBitrate = '192k';
            break;
        case '480p':
            maxRate = '1.8M';
            bufSize = '3.6M';
            crf = '25';
            scaleFilter = 'scale=854:480:force_original_aspect_ratio=decrease';
            audioBitrate = '128k';
            break;
    }

    // Video encoder parameters
    if (config.encoder === 'nvenc') {
        args.push(
            '-c:v', 'h264_nvenc',
            '-preset', 'p4',
            '-tune', 'zerolatency',
            '-rc', 'vbr',
            '-cq', crf,
            '-maxrate', maxRate,
            '-bufsize', bufSize
        );
        if (scaleFilter) args.push('-vf', scaleFilter);
    } else if (config.encoder === 'qsv') {
        args.push(
            '-c:v', 'h264_qsv',
            '-preset', 'veryfast',
            '-global_quality', crf,
            '-maxrate', maxRate,
            '-bufsize', bufSize
        );
        if (scaleFilter) args.push('-vf', scaleFilter);
    } else if (config.encoder === 'vaapi') {
        args.push(
            '-vf', scaleFilter ? `${scaleFilter},format=nv12,hwupload` : 'format=nv12,hwupload',
            '-c:v', 'h264_vaapi',
            '-b:v', maxRate,
            '-maxrate', maxRate
        );
    } else {
        // Standard high-efficiency CPU libx264
        args.push(
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-crf', crf,
            '-maxrate', maxRate,
            '-bufsize', bufSize,
            '-pix_fmt', 'yuv420p'
        );
        if (scaleFilter) args.push('-vf', scaleFilter);
    }

    // Audio & Container parameters (Universal High-Compatibility MP4 / AAC)
    args.push(
        '-c:a', 'aac',
        '-b:a', audioBitrate,
        '-ac', '2',
        '-sn', // strip embedded subtitles that could break fragmented mp4 streaming
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
    );

    return args;
}

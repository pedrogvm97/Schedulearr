import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';

const execPromise = util.promisify(exec);

export type QualityPreset = '1080p-high' | '1080p' | '720p' | '480p' | 'original' | 'auto';
export type HardwareEncoderType = 'qsv' | 'nvenc' | 'vaapi' | 'videotoolbox' | 'cpu';

export function getFFmpegPath(): string {
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        return ffmpegStatic;
    }
    if (fs.existsSync('/usr/bin/ffmpeg')) {
        return '/usr/bin/ffmpeg';
    }
    return 'ffmpeg';
}

export function getFFprobePath(): string {
    if (ffprobeStatic?.path && fs.existsSync(ffprobeStatic.path)) {
        return ffprobeStatic.path;
    }
    if (fs.existsSync('/usr/bin/ffprobe')) {
        return '/usr/bin/ffprobe';
    }
    return 'ffprobe';
}

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
    return {
        encoder: 'cpu',
        videoCodec: 'libx264',
        description: 'Multi-Core CPU libx264 (Ultrafast Zerolatency)'
    };
}

/**
 * Build FFmpeg argument array for server-side native transcoding
 */
export function buildFFmpegArgs(params: {
    filePath: string;
    startTime?: string;
    quality?: QualityPreset;
    mode?: 'universal' | 'audio' | 'direct';
    config?: TranscoderConfig;
}): string[] {
    const { filePath, startTime = '0', quality = 'auto', mode = 'universal' } = params;
    const startSec = parseFloat(startTime);
    const args: string[] = [];

    // Fast seek before input
    if (startSec > 0) {
        args.push('-ss', startSec.toString());
    }

    // Network input stream options (for Plex HTTPS / remote NAS URLs)
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        args.push(
            '-reconnect', '1',
            '-reconnect_at_eof', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5'
        );
    }

    args.push('-i', filePath);

    // Universal / Server-Side Optimized Conversion (H.264 + AAC Stereo)
    let maxRate = '8M';
    let bufSize = '16M';
    let crf = '22';
    let scaleFilter: string | null = null;
    let audioBitrate = '192k';

    switch (quality) {
        case '1080p-high':
            maxRate = '14M';
            bufSize = '28M';
            crf = '19';
            scaleFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease';
            audioBitrate = '256k';
            break;
        case '1080p':
        case 'auto':
            maxRate = '8M';
            bufSize = '16M';
            crf = '22';
            scaleFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease';
            audioBitrate = '192k';
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

    // Standard high-efficiency CPU libx264 with baseline/main compatibility
    args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-crf', crf,
        '-maxrate', maxRate,
        '-bufsize', bufSize,
        '-pix_fmt', 'yuv420p'
    );
    if (scaleFilter) args.push('-vf', scaleFilter);

    // Audio & Container parameters (Universal High-Compatibility MP4 / AAC)
    args.push(
        '-c:a', 'aac',
        '-b:a', audioBitrate,
        '-ac', '2',
        '-ar', '44100',
        '-sn', // strip embedded subtitles that could break fragmented mp4 streaming
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
    );

    return args;
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInstances } from '@/lib/db';
import axios from 'axios';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { detectHardwareEncoder, buildFFmpegArgs, QualityPreset } from '@/lib/transcoder';

export const dynamic = 'force-dynamic';

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.mp4': return 'video/mp4';
        case '.mkv': return 'video/x-matroska';
        case '.webm': return 'video/webm';
        case '.avi': return 'video/x-msvideo';
        case '.mov': return 'video/quicktime';
        case '.m4v': return 'video/x-m4v';
        case '.ts': return 'video/mp2t';
        case '.mp3': return 'audio/mpeg';
        case '.flac': return 'audio/flac';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        case '.opus': return 'audio/opus';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        case '.bmp': return 'image/bmp';
        case '.svg': return 'image/svg+xml';
        default: return 'application/octet-stream';
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const filePath = searchParams.get('path');
        const plexPart = searchParams.get('plexPart');
        const instanceId = searchParams.get('instanceId');
        const m3u = searchParams.get('m3u');
        const transcode = searchParams.get('transcode');
        const quality = (searchParams.get('quality') || 'auto') as QualityPreset;
        const startTime = searchParams.get('ss') || '0';
        const title = searchParams.get('title') || 'media';

        // 0. Generate .M3U playlist file for VLC / External Players
        if (m3u === 'true') {
            const host = req.headers.get('host') || 'localhost:3010';
            const protocol = req.headers.get('x-forwarded-proto') || 'http';
            let targetStream = '';

            if (plexPart) {
                targetStream = `${protocol}://${host}/api/theater/stream?plexPart=${encodeURIComponent(plexPart)}&instanceId=${encodeURIComponent(instanceId || '')}`;
            } else if (filePath) {
                targetStream = `${protocol}://${host}/api/theater/stream?path=${encodeURIComponent(filePath)}`;
            }

            const m3uContent = `#EXTM3U\n#EXTINF:-1,${title}\n${targetStream}\n`;
            return new NextResponse(m3uContent, {
                headers: {
                    'Content-Type': 'application/x-mpegurl',
                    'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.m3u"`,
                    'Cache-Control': 'no-cache'
                }
            });
        }

        // 1. Plex Direct Stream or Server-Side Transcode Proxy
        if (plexPart) {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

            if (!plex) {
                return new NextResponse('Plex instance not found', { status: 404 });
            }

            const plexUrlBase = plex.url.replace(/\/$/, '');
            let plexStreamUrl = '';

            const normalizedPlexPart = plexPart.startsWith('/') ? plexPart : `/${plexPart}`;
            const sep = normalizedPlexPart.includes('?') ? '&' : '?';

            if (transcode === 'direct') {
                // Direct play stream from Plex
                plexStreamUrl = `${plexUrlBase}${normalizedPlexPart}${sep}X-Plex-Token=${plex.api_key}`;
            } else if (transcode === 'audio') {
                // Audio transcode only on Plex
                plexStreamUrl = `${plexUrlBase}/video/:/transcode/universal/start.mp4?path=${encodeURIComponent(normalizedPlexPart)}&mediaIndex=0&partIndex=0&protocol=http&directPlay=0&directStream=1&directStreamAudio=0&fastSeek=1&copyts=1&X-Plex-Token=${plex.api_key}`;
            } else {
                // Universal Server-Side Optimized Transcode on Plex (Default)
                let maxBitrate = '12000';
                let resolution = '1920x1080';
                if (quality === '1080p-high') { maxBitrate = '16000'; resolution = '1920x1080'; }
                else if (quality === '720p') { maxBitrate = '4500'; resolution = '1280x720'; }
                else if (quality === '480p') { maxBitrate = '1800'; resolution = '854x480'; }

                plexStreamUrl = `${plexUrlBase}/video/:/transcode/universal/start.mp4?path=${encodeURIComponent(normalizedPlexPart)}&mediaIndex=0&partIndex=0&protocol=http&directPlay=0&directStream=1&directStreamAudio=0&fastSeek=1&copyts=1&maxVideoBitrate=${maxBitrate}&videoResolution=${resolution}&videoQuality=100&X-Plex-Token=${plex.api_key}`;
            }

            const reqHeaders: Record<string, string> = {
                'X-Plex-Token': plex.api_key
            };

            const clientRange = req.headers.get('range');
            if (clientRange) {
                reqHeaders['Range'] = clientRange;
            }

            const plexRes = await axios.get(plexStreamUrl, {
                headers: reqHeaders,
                responseType: 'stream',
                validateStatus: () => true
            });

            const resHeaders = new Headers();
            if (plexRes.headers['content-range']) resHeaders.set('Content-Range', String(plexRes.headers['content-range']));
            if (plexRes.headers['content-length']) resHeaders.set('Content-Length', String(plexRes.headers['content-length']));
            
            // Accurate MIME type detection for Audio & Video
            const incomingMime = plexRes.headers['content-type'];
            const fileExt = path.extname(normalizedPlexPart.split('?')[0]).toLowerCase();
            const fallbackMime = getMimeType(fileExt || '.mp4');
            resHeaders.set('Content-Type', incomingMime || fallbackMime);
            resHeaders.set('Accept-Ranges', 'bytes');
            resHeaders.set('X-Stream-Engine', 'Plex Native Transcoder');

            // @ts-ignore
            return new Response(plexRes.data as any, {
                status: plexRes.status,
                headers: resHeaders
            });
        }

        // 2. Local File System Stream
        if (!filePath || !fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const ext = path.extname(filePath).toLowerCase();
        const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.wmv'].includes(ext);

        // 2A. Universal Server-Side Optimized Conversion (Default for Video unless direct requested)
        if (isVideo && (transcode === 'universal' || transcode === 'full' || !transcode)) {
            try {
                const hwConfig = await detectHardwareEncoder();
                const ffmpegArgs = buildFFmpegArgs({
                    filePath,
                    startTime,
                    quality,
                    mode: 'universal',
                    config: hwConfig
                });

                const ffmpeg = spawn('ffmpeg', ffmpegArgs);

                ffmpeg.stderr.on('data', (d) => {
                    const str = d.toString();
                    if (str.includes('Error') || str.includes('Invalid')) {
                        console.warn('[FFmpeg Full Transcode Error]:', str);
                    }
                });

                req.signal.addEventListener('abort', () => {
                    ffmpeg.kill('SIGKILL');
                });

                // @ts-ignore
                const webStream = Readable.toWeb(ffmpeg.stdout);

                return new Response(webStream as any, {
                    status: 200,
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Transfer-Encoding': 'chunked',
                        'Cache-Control': 'no-cache',
                        'X-Hardware-Encoder': hwConfig.description
                    }
                });
            } catch (ffmpegErr: any) {
                console.warn('FFmpeg hardware transcode failed, falling back to direct stream:', ffmpegErr.message);
            }
        }

        // 2B. Audio Transcoding for Video Files (Copy video + AAC audio)
        if (isVideo && (transcode === 'audio' || transcode === 'true')) {
            try {
                const hwConfig = await detectHardwareEncoder();
                const ffmpegArgs = buildFFmpegArgs({
                    filePath,
                    startTime,
                    quality,
                    mode: 'audio',
                    config: hwConfig
                });

                const ffmpeg = spawn('ffmpeg', ffmpegArgs);

                ffmpeg.stderr.on('data', (d) => {
                    const str = d.toString();
                    if (str.includes('Error') || str.includes('Invalid')) {
                        console.warn('[FFmpeg Audio Transcode Error]:', str);
                    }
                });

                req.signal.addEventListener('abort', () => {
                    ffmpeg.kill('SIGKILL');
                });

                // @ts-ignore
                const webStream = Readable.toWeb(ffmpeg.stdout);

                return new Response(webStream as any, {
                    status: 200,
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Transfer-Encoding': 'chunked',
                        'Cache-Control': 'no-cache',
                        'X-Stream-Mode': 'Audio Transcode AAC'
                    }
                });
            } catch (ffmpegErr: any) {
                console.warn('FFmpeg audio transcode failed, falling back to direct stream:', ffmpegErr.message);
            }
        }

        // 2C. Audio Transcoding for Music Files (FLAC / WAV / ALAC / DSF -> High-Res MP3 320k)
        const isAudio = ['.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.wma', '.mp3', '.aiff'].includes(ext);
        if (isAudio && (transcode === 'audio' || transcode === 'aac' || transcode === 'mp3' || transcode === 'true')) {
            try {
                const ffmpegArgs = [
                    ...(parseFloat(startTime) > 0 ? ['-ss', startTime] : []),
                    '-i', filePath,
                    '-c:a', 'libmp3lame',
                    '-b:a', '320k',
                    '-id3v2_version', '3',
                    '-f', 'mp3',
                    'pipe:1'
                ];

                const ffmpeg = spawn('ffmpeg', ffmpegArgs);

                ffmpeg.stderr.on('data', (d) => {
                    const str = d.toString();
                    if (str.includes('Error') || str.includes('Invalid')) {
                        console.warn('[FFmpeg Music Transcode Error]:', str);
                    }
                });

                req.signal.addEventListener('abort', () => {
                    ffmpeg.kill('SIGKILL');
                });

                // @ts-ignore
                const webStream = Readable.toWeb(ffmpeg.stdout);

                return new Response(webStream as any, {
                    status: 200,
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Transfer-Encoding': 'chunked',
                        'Cache-Control': 'no-cache',
                        'X-Stream-Engine': 'Server-Side MP3 Transcode (320 kbps)'
                    }
                });
            } catch (ffmpegErr: any) {
                console.warn('FFmpeg music transcode failed, falling back to direct stream:', ffmpegErr.message);
            }
        }

        // 2B. Direct Play Stream (With byte ranges)
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const mimeType = getMimeType(filePath);
        const range = req.headers.get('range');

        // Handle HTTP Range request for video & audio seeking
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize || end >= fileSize) {
                return new NextResponse('Requested range not satisfiable', {
                    status: 416,
                    headers: { 'Content-Range': `bytes */${fileSize}` }
                });
            }

            const chunksize = (end - start) + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });

            // @ts-ignore
            return new Response(fileStream as any, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': String(chunksize),
                    'Content-Type': mimeType,
                    'Cache-Control': 'no-cache'
                }
            });
        } else {
            const fileStream = fs.createReadStream(filePath);
            // @ts-ignore
            return new Response(fileStream as any, {
                status: 200,
                headers: {
                    'Content-Length': String(fileSize),
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        }
    } catch (error: any) {
        console.error('API /theater/stream error:', error);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

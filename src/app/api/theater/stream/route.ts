import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInstances } from '@/lib/db';
import axios from 'axios';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { detectHardwareEncoder, buildFFmpegArgs, getFFmpegPath, QualityPreset } from '@/lib/transcoder';

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
        const ffmpegBin = getFFmpegPath();

        // 0. Generate .M3U playlist file for VLC / External Players
        if (m3u === 'true') {
            const clientOrigin = searchParams.get('origin');
            const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3010';
            const forwardedProto = req.headers.get('x-forwarded-proto');
            const cfVisitor = req.headers.get('cf-visitor');
            
            let baseOrigin = clientOrigin;
            if (!baseOrigin) {
                let protocol = 'http';
                if (forwardedProto) {
                    protocol = forwardedProto;
                } else if (cfVisitor && cfVisitor.includes('https')) {
                    protocol = 'https';
                } else if (host.includes('.') && !host.includes('localhost') && !host.startsWith('192.168.') && !host.startsWith('10.') && !host.startsWith('172.')) {
                    protocol = 'https';
                }
                baseOrigin = `${protocol}://${host}`;
            }
            baseOrigin = baseOrigin.replace(/\/$/, '');

            let targetStream = '';
            if (plexPart) {
                targetStream = `${baseOrigin}/api/theater/stream?plexPart=${encodeURIComponent(plexPart)}&instanceId=${encodeURIComponent(instanceId || '')}&transcode=${transcode || 'direct'}`;
            } else if (filePath) {
                targetStream = `${baseOrigin}/api/theater/stream?path=${encodeURIComponent(filePath)}&transcode=${transcode || 'direct'}`;
            }

            const m3uContent = `#EXTM3U\n#EXTINF:-1,${title}\n${targetStream}\n`;
            return new NextResponse(m3uContent, {
                headers: {
                    'Content-Type': 'application/x-mpegurl',
                    'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.m3u"`,
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        const ratingKey = searchParams.get('ratingKey');
        const localPath = searchParams.get('localPath');

        // Check if local file is directly accessible on the host / container filesystem
        const effectiveLocalPath = (localPath && fs.existsSync(localPath)) ? localPath : (filePath && fs.existsSync(filePath) ? filePath : null);

        // 1. Plex Stream or Server-Side Transcode Proxy
        if (plexPart && !effectiveLocalPath) {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

            if (!plex) {
                return new NextResponse('Plex instance not found', { status: 404 });
            }

            const plexUrlBase = plex.url.replace(/\/$/, '');
            const normalizedPlexPart = plexPart.startsWith('/') ? plexPart : `/${plexPart}`;
            const sep = normalizedPlexPart.includes('?') ? '&' : '?';
            const fileExt = path.extname(normalizedPlexPart.split('?')[0]).toLowerCase();
            const isAudioFile = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.wma', '.aiff', '.alac'].includes(fileExt);

            const directPlexUrl = `${plexUrlBase}${normalizedPlexPart}${sep}X-Plex-Token=${plex.api_key}`;

            if (isAudioFile) {
                // Audio file stream from Plex
                if (transcode === 'audio' || transcode === 'mp3') {
                    const plexMusicUrl = `${plexUrlBase}/music/:/transcode/universal/start.mp3?path=${encodeURIComponent(normalizedPlexPart)}&mediaIndex=0&partIndex=0&protocol=http&directPlay=0&directStream=1&directStreamAudio=1&fastSeek=1&copyts=1&X-Plex-Token=${plex.api_key}`;
                    const reqHeaders: Record<string, string> = { 'X-Plex-Token': plex.api_key };
                    const clientRange = req.headers.get('range');
                    if (clientRange) reqHeaders['Range'] = clientRange;

                    let plexRes = await axios.get(plexMusicUrl, {
                        headers: reqHeaders,
                        responseType: 'stream',
                        validateStatus: () => true
                    });

                    if (plexRes.status >= 400) {
                        plexRes = await axios.get(directPlexUrl, {
                            headers: reqHeaders,
                            responseType: 'stream',
                            validateStatus: () => true
                        });
                    }

                    const resHeaders = new Headers();
                    if (plexRes.headers['content-range']) resHeaders.set('Content-Range', String(plexRes.headers['content-range']));
                    if (plexRes.headers['content-length']) resHeaders.set('Content-Length', String(plexRes.headers['content-length']));
                    resHeaders.set('Content-Type', plexRes.headers['content-type'] || 'audio/mpeg');
                    resHeaders.set('Accept-Ranges', 'bytes');
                    resHeaders.set('X-Stream-Engine', 'Plex Audio Transcode');

                    // @ts-ignore
                    return new Response(plexRes.data as any, {
                        status: plexRes.status,
                        headers: resHeaders
                    });
                }

                // Direct Play Audio Stream
                const reqHeaders: Record<string, string> = { 'X-Plex-Token': plex.api_key };
                const clientRange = req.headers.get('range');
                if (clientRange) reqHeaders['Range'] = clientRange;

                const plexRes = await axios.get(directPlexUrl, {
                    headers: reqHeaders,
                    responseType: 'stream',
                    validateStatus: () => true
                });

                const resHeaders = new Headers();
                if (plexRes.headers['content-range']) resHeaders.set('Content-Range', String(plexRes.headers['content-range']));
                if (plexRes.headers['content-length']) resHeaders.set('Content-Length', String(plexRes.headers['content-length']));
                resHeaders.set('Content-Type', plexRes.headers['content-type'] || getMimeType(fileExt || '.mp3'));
                resHeaders.set('Accept-Ranges', 'bytes');
                resHeaders.set('X-Stream-Engine', 'Plex Direct Audio');

                // @ts-ignore
                return new Response(plexRes.data as any, {
                    status: plexRes.status,
                    headers: resHeaders
                });
            }

            // Video from Plex: FFmpeg Transcode (Audio-Only Copy or Universal H.264 + AAC)
            if (transcode === 'universal' || transcode === 'full' || transcode === 'audio') {
                try {
                    const transcodeMode = transcode === 'audio' ? 'audio' : 'universal';
                    const hwConfig = await detectHardwareEncoder();
                    const ffmpegArgs = buildFFmpegArgs({
                        filePath: directPlexUrl,
                        startTime,
                        quality,
                        mode: transcodeMode,
                        config: hwConfig
                    });

                    const ffmpeg = spawn(ffmpegBin, ffmpegArgs);

                    ffmpeg.stderr.on('data', (d) => {
                        const str = d.toString();
                        if (str.includes('Error') || str.includes('Invalid') || str.includes('fatal')) {
                            console.warn(`[FFmpeg Plex Video Transcode ${transcodeMode}]:`, str);
                        }
                    });

                    req.signal.addEventListener('abort', () => {
                        try { ffmpeg.kill('SIGKILL'); } catch {}
                    });

                    const webStream = new ReadableStream({
                        start(controller) {
                            ffmpeg.stdout.on('data', (chunk) => {
                                controller.enqueue(chunk);
                            });
                            ffmpeg.stdout.on('end', () => {
                                controller.close();
                            });
                            ffmpeg.stdout.on('error', (err) => {
                                controller.error(err);
                            });
                        },
                        cancel() {
                            try { ffmpeg.kill('SIGKILL'); } catch {}
                        }
                    });

                    return new Response(webStream as any, {
                        status: 200,
                        headers: {
                            'Content-Type': 'video/mp4',
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Accept-Ranges': 'none',
                            'X-Content-Type-Options': 'nosniff',
                            'Access-Control-Allow-Origin': '*',
                            'X-Hardware-Encoder': hwConfig.description,
                            'X-Stream-Engine': transcodeMode === 'audio'
                                ? 'Plex Video Copy + AAC 2.0 Audio Transcode'
                                : 'Plex Universal H.264 + AAC Transcode'
                        }
                    });
                } catch (ffmpegErr: any) {
                    console.warn('FFmpeg Plex transcode failed, falling back to direct stream:', ffmpegErr.message);
                }
            }

            // Direct Video Play Stream from Plex (with byte ranges)
            const reqHeaders: Record<string, string> = {
                'X-Plex-Token': plex.api_key
            };
            const clientRange = req.headers.get('range');
            if (clientRange) {
                reqHeaders['Range'] = clientRange;
            }

            const plexRes = await axios.get(directPlexUrl, {
                headers: reqHeaders,
                responseType: 'stream',
                validateStatus: () => true
            });

            const resHeaders = new Headers();
            if (plexRes.headers['content-range']) resHeaders.set('Content-Range', String(plexRes.headers['content-range']));
            if (plexRes.headers['content-length']) resHeaders.set('Content-Length', String(plexRes.headers['content-length']));
            
            const incomingMime = plexRes.headers['content-type'];
            const fallbackMime = getMimeType(fileExt || '.mp4');
            resHeaders.set('Content-Type', incomingMime || fallbackMime);
            resHeaders.set('Accept-Ranges', 'bytes');
            resHeaders.set('X-Stream-Engine', 'Plex Direct Video');

            // @ts-ignore
            return new Response(plexRes.data as any, {
                status: plexRes.status,
                headers: resHeaders
            });
        }

        // 2. Local File System Stream (Direct or Transcoded)
        const targetLocalFile = effectiveLocalPath || filePath;
        if (!targetLocalFile || !fs.existsSync(targetLocalFile)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const ext = path.extname(targetLocalFile).toLowerCase();
        const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.wmv'].includes(ext);

        // 2A. Universal / Audio Server-Side Stream (Audio-Only Copy or Universal H.264+AAC)
        if (isVideo && (transcode === 'universal' || transcode === 'full' || transcode === 'audio')) {
            try {
                const transcodeMode = transcode === 'audio' ? 'audio' : 'universal';
                const hwConfig = await detectHardwareEncoder();
                const ffmpegArgs = buildFFmpegArgs({
                    filePath: targetLocalFile,
                    startTime,
                    quality,
                    mode: transcodeMode,
                    config: hwConfig
                });

                const ffmpeg = spawn(ffmpegBin, ffmpegArgs);

                ffmpeg.stderr.on('data', (d) => {
                    const str = d.toString();
                    if (str.includes('Error') || str.includes('Invalid') || str.includes('fatal')) {
                        console.warn(`[FFmpeg Local Video Transcode ${transcodeMode}]:`, str);
                    }
                });

                req.signal.addEventListener('abort', () => {
                    try { ffmpeg.kill('SIGKILL'); } catch {}
                });

                const webStream = new ReadableStream({
                    start(controller) {
                        ffmpeg.stdout.on('data', (chunk) => {
                            controller.enqueue(chunk);
                        });
                        ffmpeg.stdout.on('end', () => {
                            controller.close();
                        });
                        ffmpeg.stdout.on('error', (err) => {
                            controller.error(err);
                        });
                    },
                    cancel() {
                        try { ffmpeg.kill('SIGKILL'); } catch {}
                    }
                });

                return new Response(webStream as any, {
                    status: 200,
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Accept-Ranges': 'none',
                        'X-Content-Type-Options': 'nosniff',
                        'Access-Control-Allow-Origin': '*',
                        'X-Hardware-Encoder': hwConfig.description,
                        'X-Stream-Engine': transcodeMode === 'audio'
                            ? 'Lossless Video Copy + AAC 2.0 Audio Transcode'
                            : 'Universal H.264 + AAC Transcode'
                    }
                });
            } catch (ffmpegErr: any) {
                console.warn('FFmpeg transcode failed, falling back to direct stream:', ffmpegErr.message);
            }
        }

        // 2B. Audio Transcoding for Music Files (FLAC / WAV / ALAC / DSF -> High-Res MP3 320k)
        const isAudio = ['.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.wma', '.mp3', '.aiff'].includes(ext);
        if (isAudio && (transcode === 'audio' || transcode === 'aac' || transcode === 'mp3' || transcode === 'true')) {
            try {
                const ffmpegArgs = [
                    ...(parseFloat(startTime) > 0 ? ['-ss', startTime] : []),
                    '-i', targetLocalFile,
                    '-c:a', 'libmp3lame',
                    '-b:a', '320k',
                    '-id3v2_version', '3',
                    '-f', 'mp3',
                    'pipe:1'
                ];

                const ffmpeg = spawn(ffmpegBin, ffmpegArgs);

                ffmpeg.stderr.on('data', (d) => {
                    const str = d.toString();
                    if (str.includes('Error') || str.includes('Invalid') || str.includes('fatal')) {
                        console.warn('[FFmpeg Music Transcode Error]:', str);
                    }
                });

                req.signal.addEventListener('abort', () => {
                    try { ffmpeg.kill('SIGKILL'); } catch {}
                });

                const webStream = new ReadableStream({
                    start(controller) {
                        ffmpeg.stdout.on('data', (chunk) => {
                            controller.enqueue(chunk);
                        });
                        ffmpeg.stdout.on('end', () => {
                            controller.close();
                        });
                        ffmpeg.stdout.on('error', (err) => {
                            controller.error(err);
                        });
                    },
                    cancel() {
                        try { ffmpeg.kill('SIGKILL'); } catch {}
                    }
                });

                return new Response(webStream as any, {
                    status: 200,
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Accept-Ranges': 'none',
                        'X-Stream-Engine': 'Server-Side MP3 Transcode (320 kbps)'
                    }
                });
            } catch (ffmpegErr: any) {
                console.warn('FFmpeg music transcode failed, falling back to direct stream:', ffmpegErr.message);
            }
        }

        // 2C. Direct Play Stream (With byte ranges)
        const stat = fs.statSync(targetLocalFile);
        const fileSize = stat.size;
        const mimeType = getMimeType(targetLocalFile);
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
            const fileStream = fs.createReadStream(targetLocalFile, { start, end });

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
            const fileStream = fs.createReadStream(targetLocalFile);
            // @ts-ignore
            return new Response(fileStream as any, {
                status: 200,
                headers: {
                    'Content-Length': String(fileSize),
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-cache'
                }
            });
        }
    } catch (error: any) {
        console.error('API /theater/stream error:', error);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInstances, getTheaterLibraries, getCachedTheaterItems } from '@/lib/db';
import axios from 'axios';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { detectHardwareEncoder, buildFFmpegArgs, getFFmpegPath, QualityPreset } from '@/lib/transcoder';
import { ensureFfmpegBinaries } from '@/lib/ytdlp';

export const dynamic = 'force-dynamic';

export function resolveLocalPath(filePath: string): string | null {
    if (!filePath) return null;
    const norm = (s: string) => s.normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim().toLowerCase();

    const candidates = [
        filePath,
        decodeURIComponent(filePath),
        filePath.replace(/'/g, '’'),
        decodeURIComponent(filePath).replace(/'/g, '’'),
        filePath.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
        decodeURIComponent(filePath).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
        filePath.replace(/^\/data\//, '/app/data/'),
        filePath.replace(/^\/app\/data\//, '/data/'),
        filePath.replace(/^\/music\//, '/app/data/music/'),
        filePath.replace(/^\/media\/music\//, '/app/data/music/'),
        filePath.replace(/^\/media\//, '/app/data/'),
        filePath.replace(/^\/mnt\/user\/music\//, '/app/data/music/'),
        filePath.replace(/^\/mnt\/user\/media\/music\//, '/app/data/music/'),
        filePath.replace(/^\/mnt\/user\/data\/music\//, '/app/data/music/'),
        path.join('/app/data/music', filePath.replace(/^\/(app\/)?(data\/)?(music\/)?/, '')),
        path.join('/music', filePath.replace(/^\/music\/?/, '')),
        path.join('/media/music', filePath.replace(/^\/(media\/)?(music\/)?/, '')),
        path.join(process.cwd(), filePath),
        path.join('/app', filePath),
        path.join('/app/data', filePath.replace(/^\/(app\/)?data\/?/, '')),
        path.join('/mnt/user/data', filePath.replace(/^\/data\/?/, '')),
        path.join('/mnt/user/appdata/schedulearr/data', filePath.replace(/^\/(app\/)?data\/?/, '')),
        path.join('/mnt/user', filePath.replace(/^\//, ''))
    ];

    try {
        const libs = getTheaterLibraries();
        for (const l of libs) {
            for (const f of (l.folders || [])) {
                if (f && typeof f === 'string') {
                    if (fs.existsSync(f)) {
                        candidates.push(path.join(f, path.basename(filePath)));
                        const rel = filePath.replace(/^\/(mnt\/user\/|data\/|media\/|app\/data\/)?(media\/|music\/)?/, '');
                        candidates.push(path.join(f, rel));
                    }
                }
            }
        }
    } catch {}

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            return c;
        }
    }

    // Segment-by-segment case & quote-insensitive directory walker
    try {
        const bases = [
            '/data',
            '/data/music',
            '/music',
            '/media',
            '/media/music',
            '/app/data',
            '/app/data/music',
            '/mnt/user/data',
            '/mnt/user/data/music',
            '/mnt/user/media',
            '/mnt/user/media/music',
            '/mnt/user/music',
            '/mnt/user/appdata/schedulearr/data',
            '/mnt/user/appdata/schedulearr/data/music',
            '/mnt/user',
            '/app',
            process.cwd()
        ];
        try {
            const libs = getTheaterLibraries();
            for (const l of libs) {
                for (const f of (l.folders || [])) {
                    if (f && typeof f === 'string' && fs.existsSync(f) && !bases.includes(f)) {
                        bases.push(f);
                    }
                }
            }
        } catch {}

        const rawSegments = decodeURIComponent(filePath).split(/[\/\\]/).filter(Boolean);

        for (const base of bases) {
            if (!fs.existsSync(base)) continue;
            let current = base;
            let matched = true;

            const remainingSegments = rawSegments.filter(seg => {
                const sNorm = norm(seg);
                return !base.toLowerCase().split(/[\/\\]/).filter(Boolean).includes(sNorm);
            });

            for (const seg of remainingSegments) {
                const segNorm = norm(seg);
                try {
                    const entries = fs.readdirSync(current);
                    const found = entries.find(e => norm(e) === segNorm);
                    if (found) {
                        current = path.join(current, found);
                    } else {
                        matched = false;
                        break;
                    }
                } catch {
                    matched = false;
                    break;
                }
            }

            if (matched && fs.existsSync(current)) {
                return current;
            }
        }
    } catch {}

    return null;
}

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
        const effectiveLocalPath = (localPath && resolveLocalPath(localPath)) || (filePath && resolveLocalPath(filePath)) || null;

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
        const targetLocalFile = effectiveLocalPath || (filePath && resolveLocalPath(filePath));
        if (!targetLocalFile || !fs.existsSync(targetLocalFile)) {
            // 2A. Check if this item is in Plex before redirecting to external streams!
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            if (plexInstances.length > 0 && filePath) {
                let matchedPlexPart: string | null = null;
                let matchedInstanceId: string | null = null;

                try {
                    const libs = getTheaterLibraries();
                    for (const lib of libs) {
                        const cached = getCachedTheaterItems(lib.id);
                        if (cached && Array.isArray(cached)) {
                            const found = cached.find((item: any) => {
                                if (!item.streamUrl) return false;
                                if (item.path && (item.path === filePath || item.path.toLowerCase() === filePath.toLowerCase())) return true;
                                if (path.basename(item.path || '') === path.basename(filePath)) return true;
                                return false;
                            });
                            if (found && found.streamUrl) {
                                const u = new URL(found.streamUrl, 'http://localhost');
                                matchedPlexPart = u.searchParams.get('plexPart');
                                matchedInstanceId = u.searchParams.get('instanceId');
                                if (matchedPlexPart) break;
                            }
                        }
                    }
                } catch {}

                if (!matchedPlexPart) {
                    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
                    for (const p of plexInstances) {
                        try {
                            const pBase = p.url.replace(/\/$/, '');
                            const searchUrl = `${pBase}/search?query=${encodeURIComponent(fileNameWithoutExt)}&type=10&X-Plex-Token=${p.api_key}`;
                            const pRes = await axios.get(searchUrl, { timeout: 3500, headers: { Accept: 'application/json' } });
                            const metadata = pRes.data?.MediaContainer?.Metadata || [];
                            for (const m of metadata) {
                                const mediaParts = (m.Media || []).flatMap((med: any) => med.Part || []);
                                const partMatch = mediaParts.find((pt: any) => {
                                    if (!pt.key) return false;
                                    if (pt.file && (pt.file === filePath || pt.file.toLowerCase() === filePath.toLowerCase())) return true;
                                    if (pt.file && path.basename(pt.file) === path.basename(filePath)) return true;
                                    return true;
                                });
                                if (partMatch && partMatch.key) {
                                    matchedPlexPart = partMatch.key;
                                    matchedInstanceId = p.id;
                                    break;
                                }
                            }
                            if (matchedPlexPart) break;
                        } catch {}
                    }
                }

                if (matchedPlexPart) {
                    const plex = matchedInstanceId ? plexInstances.find(i => i.id === matchedInstanceId) : plexInstances[0];
                    if (plex) {
                        const plexUrlBase = plex.url.replace(/\/$/, '');
                        const normalizedPlexPart = matchedPlexPart.startsWith('/') ? matchedPlexPart : `/${matchedPlexPart}`;
                        const sep = normalizedPlexPart.includes('?') ? '&' : '?';
                        const directPlexUrl = `${plexUrlBase}${normalizedPlexPart}${sep}X-Plex-Token=${plex.api_key}`;

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
                        resHeaders.set('Content-Type', plexRes.headers['content-type'] || getMimeType(filePath));
                        resHeaders.set('Accept-Ranges', 'bytes');
                        resHeaders.set('X-Stream-Engine', 'Plex Audio Proxy');
                        resHeaders.set('X-Stream-Source', 'Plex');

                        // @ts-ignore
                        return new Response(plexRes.data as any, {
                            status: plexRes.status,
                            headers: resHeaders
                        });
                    }
                }
            }

            const rawExt = path.extname(filePath || '').toLowerCase();
            const isAudioRequest = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma', '.alac'].includes(rawExt);

            // If requested an audio file that isn't accessible on disk, seamlessly redirect to online audio engine!
            if (isAudioRequest && filePath) {
                const parts = decodeURIComponent(filePath).split(/[\/\\]/).filter(Boolean);
                const rawName = path.basename(filePath, rawExt).replace(/[/\\?%*:|"<>]/g, '').trim();
                const parentFolder = parts.length > 1 ? parts[parts.length - 2] : '';
                const grandParentFolder = parts.length > 2 ? parts[parts.length - 3] : '';

                const candidateQuery = (grandParentFolder && !grandParentFolder.toLowerCase().includes('music') && !grandParentFolder.toLowerCase().includes('data'))
                    ? `${grandParentFolder} ${rawName}`
                    : (parentFolder && !parentFolder.toLowerCase().includes('music') && !parentFolder.toLowerCase().includes('data') ? `${parentFolder} ${rawName}` : rawName);

                console.warn(`[THEATER STREAM] Local audio file not accessible at "${filePath}". Transparently redirecting to online audio stream for "${candidateQuery}"...`);

                const streamUrl = new URL(`/api/theater/music/stream?q=${encodeURIComponent(candidateQuery)}&format=mp3`, req.url).toString();
                return NextResponse.redirect(streamUrl);
            }

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
        if (isAudio && ext !== '.mp3' && (transcode === 'audio' || transcode === 'aac' || transcode === 'mp3' || transcode === 'true')) {
            try {
                const { ffmpegPath } = ensureFfmpegBinaries();
                const ffmpegArgs = [
                    ...(parseFloat(startTime) > 0 ? ['-ss', startTime] : []),
                    '-i', targetLocalFile,
                    '-vn',
                    '-c:a', 'libmp3lame',
                    '-b:a', '320k',
                    '-ar', '44100',
                    '-id3v2_version', '3',
                    '-f', 'mp3',
                    'pipe:1'
                ];

                const ffmpeg = spawn(ffmpegPath, ffmpegArgs);

                ffmpeg.stderr.on('data', (d) => {
                    const str = d.toString();
                    if (str.includes('Error') || str.includes('Invalid') || str.includes('fatal')) {
                        console.warn('[FFmpeg Music Transcode Error]:', str);
                    }
                });

                req.signal.addEventListener('abort', () => {
                    try { ffmpeg.kill('SIGKILL'); } catch {}
                });

                // Pre-flight check: ensure FFmpeg successfully starts streaming audio data
                let firstChunk: Buffer | null = null;
                await new Promise<void>((resolve, reject) => {
                    const onData = (chunk: Buffer) => {
                        firstChunk = chunk;
                        ffmpeg.stdout.off('data', onData);
                        resolve();
                    };
                    ffmpeg.stdout.on('data', onData);
                    ffmpeg.once('error', reject);
                    ffmpeg.once('close', (code) => {
                        if (!firstChunk) reject(new Error(`FFmpeg exited with code ${code} without audio output`));
                    });
                    setTimeout(() => {
                        if (!firstChunk) reject(new Error('Audio transcode startup timeout'));
                    }, 5000);
                });

                const webStream = new ReadableStream({
                    start(controller) {
                        if (firstChunk) controller.enqueue(new Uint8Array(firstChunk));
                        ffmpeg.stdout.on('data', (chunk: Buffer) => {
                            controller.enqueue(new Uint8Array(chunk));
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
                        'Accept-Ranges': 'bytes',
                        'X-Stream-Engine': 'Server-Side MP3 Transcode (320 kbps)',
                        'X-Stream-Source': 'Local Disk Transcode'
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
            const webStream = Readable.toWeb(fileStream);

            return new Response(webStream as any, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': String(chunksize),
                    'Content-Type': mimeType,
                    'Cache-Control': 'no-cache',
                    'X-Stream-Source': 'Local Disk'
                }
            });
        } else {
            const fileStream = fs.createReadStream(targetLocalFile);
            const webStream = Readable.toWeb(fileStream);

            return new Response(webStream as any, {
                status: 200,
                headers: {
                    'Content-Length': String(fileSize),
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-cache',
                    'X-Stream-Source': 'Local Disk'
                }
            });
        }
    } catch (error: any) {
        console.error('API /theater/stream error:', error);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

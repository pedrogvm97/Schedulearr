import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import axios from 'axios';
import ffmpegStatic from 'ffmpeg-static';
import { ensureYtDlpBinary } from '@/lib/ytdlp';
import { downloadAudioFile, extractDirectAudioStreamUrl } from '@/lib/musicDownloader';

const ffmpegPath: string = ffmpegStatic || 'ffmpeg';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const ytId = searchParams.get('ytId');
        const directUrl = searchParams.get('url');
        const q = searchParams.get('q');
        const sourceFormat = (searchParams.get('sourceFormat') || searchParams.get('format') || 'm4a').toLowerCase();
        const isDownload = searchParams.get('download') === 'true';
        const saveFormat = (searchParams.get('saveFormat') || searchParams.get('format') || (isDownload ? 'original' : 'mp3')).toLowerCase();
        const isTranscode = searchParams.get('transcode') === 'audio' || searchParams.get('transcode') === 'true';

        let targetUrl = '';
        let cleanId = '';
        if (directUrl) {
            targetUrl = directUrl;
        } else if (ytId) {
            cleanId = ytId.replace(/^yt-/, '');
            targetUrl = `https://www.youtube.com/watch?v=${cleanId}`;
        } else if (q) {
            targetUrl = `ytsearch1:${q}`;
        } else {
            return new NextResponse('ytId, url or q parameter is required', { status: 400 });
        }

        const effectiveExt = (saveFormat === 'mp3' || isTranscode)
            ? 'mp3'
            : (saveFormat === 'original' ? (sourceFormat === 'opus' ? 'opus' : 'm4a') : saveFormat);
        const downloadFilename = searchParams.get('filename') || `track.${effectiveExt}`;
        const safeFilename = downloadFilename.replace(/[/\\?%*:|"<>]/g, '').trim() || `track.${effectiveExt}`;

        // Format selector for YouTube extraction
        const formatFilter = sourceFormat === 'opus'
            ? 'ba[ext=webm]/251/250/249/ba/b'
            : 'ba[ext=m4a]/140/139/ba/b';

        // ── MODE A: Clean File Downloads (Ensures 100% complete files with exact Content-Length) ──
        if (isDownload) {
            const outFormat = saveFormat === 'flac' ? 'flac' : saveFormat === 'wav' ? 'wav' : saveFormat === 'm4a' ? 'm4a' : saveFormat === 'opus' ? 'opus' : 'mp3';
            const mimeType = outFormat === 'flac' ? 'audio/flac' : outFormat === 'wav' ? 'audio/wav' : outFormat === 'm4a' ? 'audio/mp4' : outFormat === 'opus' ? 'audio/opus' : 'audio/mpeg';
            const tempFilePath = path.join(os.tmpdir(), `schdl_dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${outFormat}`);

            const dlResult = await downloadAudioFile({
                targetUrl,
                youtubeId: cleanId,
                query: q || undefined,
                outputPath: tempFilePath,
                format: outFormat as any
            });

            if (dlResult.success && fs.existsSync(tempFilePath)) {
                const fileBuffer = fs.readFileSync(tempFilePath);
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch {}
                const asciiName = safeFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
                const encodedName = encodeURIComponent(safeFilename);

                return new Response(new Uint8Array(fileBuffer), {
                    status: 200,
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Length': fileBuffer.length.toString(),
                        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
                        'Cache-Control': 'no-cache, no-store'
                    }
                });
            }

            return new NextResponse('Failed to process and download audio file.', { status: 502 });
        }

        // ── MODE B: Transcoded Live Audio Stream (For In-Browser Web Player) ──
        const ytDlpBin = await ensureYtDlpBinary();

        if (saveFormat === 'mp3' || saveFormat === 'flac' || saveFormat === 'wav' || isTranscode || !isDownload) {
            const outFormat = saveFormat === 'flac' ? 'flac' : saveFormat === 'wav' ? 'wav' : 'mp3';
            const mimeType = outFormat === 'flac' ? 'audio/flac' : outFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';

            // 1. Try spawning yt-dlp first with modern iOS/Android/web client rotation
            try {
                const ytdlArgs = [
                    '-f', formatFilter,
                    '--no-playlist',
                    '--no-check-certificates',
                    '--no-warnings',
                    '--extractor-args', 'youtube:player_client=android,web,tv,ios',
                    '--ffmpeg-location', ffmpegPath,
                    '-o', '-',
                    targetUrl
                ];

                const ffmpegArgs = [
                    '-i', 'pipe:0',
                    '-vn',
                    '-f', outFormat,
                    ...(outFormat === 'mp3' ? ['-b:a', '320k', '-ar', '44100'] : []),
                    'pipe:1'
                ];

                const ytdlProc = spawn(ytDlpBin, ytdlArgs);
                const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);

                ytdlProc.stdout.pipe(ffmpegProc.stdin);
                ytdlProc.stderr.on('data', () => {});
                ffmpegProc.stderr.on('data', () => {});

                const webStream = new ReadableStream({
                    start(controller) {
                        ffmpegProc.stdout.on('data', chunk => controller.enqueue(chunk));
                        ffmpegProc.stdout.on('end', () => controller.close());
                        ffmpegProc.stdout.on('error', err => controller.error(err));
                        ffmpegProc.on('error', err => controller.error(err));
                        ytdlProc.on('error', err => controller.error(err));
                    },
                    cancel() {
                        try { ytdlProc.kill(); } catch {}
                        try { ffmpegProc.kill(); } catch {}
                    }
                });

                return new Response(webStream, {
                    status: 200,
                    headers: {
                        'Content-Type': mimeType,
                        'Cache-Control': 'public, max-age=3600'
                    }
                });
            } catch (err: any) {
                console.warn('[AUDIO STREAM] yt-dlp transcode spawn failed, trying fallback API:', err.message);
            }

            // 2. Fallback: Extract direct audio stream URL from Cobalt/Piped/Invidious and transcode via ffmpeg
            if (cleanId) {
                const directAudioUrl = await extractDirectAudioStreamUrl(cleanId);
                if (directAudioUrl) {
                    const ffmpegArgs = [
                        '-i', directAudioUrl,
                        '-vn',
                        '-f', outFormat,
                        ...(outFormat === 'mp3' ? ['-b:a', '320k', '-ar', '44100'] : []),
                        'pipe:1'
                    ];
                    const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);
                    ffmpegProc.stderr.on('data', () => {});

                    const webStream = new ReadableStream({
                        start(controller) {
                            ffmpegProc.stdout.on('data', chunk => controller.enqueue(chunk));
                            ffmpegProc.stdout.on('end', () => controller.close());
                            ffmpegProc.stdout.on('error', err => controller.error(err));
                            ffmpegProc.on('error', err => controller.error(err));
                        },
                        cancel() {
                            try { ffmpegProc.kill(); } catch {}
                        }
                    });

                    return new Response(webStream, {
                        status: 200,
                        headers: {
                            'Content-Type': mimeType,
                            'Cache-Control': 'public, max-age=3600'
                        }
                    });
                }
            }
        }

        // ── MODE C: Direct Native Audio Stream (M4A / Opus) ──
        const contentType = effectiveExt === 'opus' ? 'audio/webm; codecs=opus' : 'audio/mp4';

        try {
            const ytdlArgs = [
                '-f', formatFilter,
                '--no-playlist',
                '--no-check-certificates',
                '--no-warnings',
                '--extractor-args', 'youtube:player_client=android,web,tv,ios',
                '--ffmpeg-location', ffmpegPath,
                '-o', '-',
                targetUrl
            ];

            const ytdlProc = spawn(ytDlpBin, ytdlArgs);
            ytdlProc.stderr.on('data', () => {});

            const webStream = new ReadableStream({
                start(controller) {
                    ytdlProc.stdout.on('data', chunk => controller.enqueue(chunk));
                    ytdlProc.stdout.on('end', () => controller.close());
                    ytdlProc.stdout.on('error', err => controller.error(err));
                    ytdlProc.on('error', err => controller.error(err));
                },
                cancel() {
                    try { ytdlProc.kill(); } catch {}
                }
            });

            return new Response(webStream, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        } catch (e: any) {
            console.warn('[AUDIO STREAM] Direct yt-dlp pipe failed:', e.message);
        }

        // Direct stream fallback via Cobalt / Piped / Invidious
        if (cleanId) {
            const directAudioUrl = await extractDirectAudioStreamUrl(cleanId);
            if (directAudioUrl) {
                const remoteRes = await axios.get(directAudioUrl, { responseType: 'stream', timeout: 10000 });
                const nodeStream = remoteRes.data;
                const webStream = new ReadableStream({
                    start(controller) {
                        nodeStream.on('data', (chunk: any) => controller.enqueue(chunk));
                        nodeStream.on('end', () => controller.close());
                        nodeStream.on('error', (err: any) => controller.error(err));
                    },
                    cancel() {
                        try { nodeStream.destroy(); } catch {}
                    }
                });

                return new Response(webStream, {
                    status: 200,
                    headers: {
                        'Content-Type': remoteRes.headers['content-type'] || contentType,
                        'Cache-Control': 'public, max-age=3600'
                    }
                });
            }
        }

        return new NextResponse('Failed to stream audio track: source unreachable or restricted.', { status: 502 });
    } catch (error: any) {
        console.error('Audio Stream API Error:', error.message);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

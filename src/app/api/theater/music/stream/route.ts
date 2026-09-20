import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import axios from 'axios';
import ffmpegStatic from 'ffmpeg-static';
import { ensureYtDlpBinary, ensureFfmpegBinaries } from '@/lib/ytdlp';
import { downloadAudioFile, extractDirectAudioStreamUrl, searchYouTubeVideoId } from '@/lib/musicDownloader';

export const dynamic = 'force-dynamic';

// In-memory cache for resolved direct audio stream URLs (4-hour TTL)
const directAudioCache = new Map<string, { url: string; expiresAt: number }>();

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
            cleanId = ytId.replace(/^yt-/, '').trim();
            targetUrl = `https://www.youtube.com/watch?v=${cleanId}`;
        } else if (q) {
            // Fast YouTube video ID search (200ms) to avoid slow CLI scraping timeouts
            cleanId = (await searchYouTubeVideoId(q)) || '';
            if (cleanId) {
                targetUrl = `https://www.youtube.com/watch?v=${cleanId}`;
            } else {
                targetUrl = `ytsearch1:${q}`;
            }
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

        // ── MODE B: In-Browser Stream Playback (Universal MP3 Transcoded Stream) ──
        const ytDlpBin = await ensureYtDlpBinary();
        const { ffmpegPath } = ensureFfmpegBinaries();

        let directAudioUrl: string | null = null;
        const cacheKey = cleanId || targetUrl;

        // Check in-memory URL cache first (0ms instantaneous start on replay or scrubbing)
        const cachedEntry = directAudioCache.get(cacheKey);
        if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
            directAudioUrl = cachedEntry.url;
        }

        // 1. If not cached and we have a clean YouTube ID, try fast parallel mirror probe
        if (!directAudioUrl && cleanId) {
            try {
                directAudioUrl = await extractDirectAudioStreamUrl(cleanId);
            } catch {}
        }

        // 2. Extract direct audio stream URL via yt-dlp -g
        if (!directAudioUrl) {
            try {
                const targetSpec = cleanId ? `https://www.youtube.com/watch?v=${cleanId}` : targetUrl;
                const ytDlpProc = spawn(ytDlpBin, [
                    '-f', 'ba/bestaudio',
                    '--no-playlist',
                    '--no-check-certificates',
                    '--no-warnings',
                    '-g',
                    targetSpec
                ]);

                let stdoutBuf = '';
                await new Promise<void>((resolve, reject) => {
                    ytDlpProc.stdout.on('data', (d) => { stdoutBuf += d.toString(); });
                    ytDlpProc.once('close', (code) => {
                        const lines = stdoutBuf.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
                        const audioLine = lines.find(l => l.includes('mime=audio') || l.includes('audio')) || lines[lines.length - 1];
                        if (code === 0 && audioLine) {
                            directAudioUrl = audioLine;
                            resolve();
                        } else {
                            reject(new Error(`yt-dlp -g exit code ${code}`));
                        }
                    });
                    ytDlpProc.once('error', reject);
                    setTimeout(() => {
                        try { ytDlpProc.kill(); } catch {}
                        reject(new Error('yt-dlp -g extraction timeout'));
                    }, 8000);
                });
            } catch (err: any) {
                console.warn('[AUDIO STREAM] yt-dlp -g URL extraction failed:', err.message);
            }
        }

        // Cache the resolved direct stream URL for 4 hours
        if (directAudioUrl && cacheKey) {
            directAudioCache.set(cacheKey, {
                url: directAudioUrl,
                expiresAt: Date.now() + 4 * 60 * 60 * 1000
            });
        }

        // 3. Transcode direct stream URL to universal MP3 via FFmpeg with pre-flight check
        if (directAudioUrl) {
            try {
                const ffmpegArgs = [
                    '-reconnect', '1',
                    '-reconnect_at_eof', '1',
                    '-reconnect_streamed', '1',
                    '-reconnect_delay_max', '4',
                    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    '-i', directAudioUrl,
                    '-vn',
                    '-f', 'mp3',
                    '-b:a', '192k',
                    '-ar', '44100',
                    'pipe:1'
                ];

                const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);
                ffmpegProc.stderr.on('data', () => {});

                // Pre-flight check: ensure audio frames are being generated before sending 200 OK
                let firstChunk: Buffer | null = null;
                await new Promise<void>((resolve, reject) => {
                    const onData = (chunk: Buffer) => {
                        firstChunk = chunk;
                        ffmpegProc.stdout.off('data', onData);
                        resolve();
                    };
                    ffmpegProc.stdout.on('data', onData);
                    ffmpegProc.once('error', reject);
                    ffmpegProc.once('close', (code) => {
                        if (!firstChunk) reject(new Error(`FFmpeg exited with code ${code} without output`));
                    });
                    setTimeout(() => {
                        if (!firstChunk) {
                            try { ffmpegProc.kill(); } catch {}
                            reject(new Error('FFmpeg stream timeout'));
                        }
                    }, 6000);
                });

                let isClosed = false;
                const safeEnqueue = (chunk: Uint8Array | Buffer, controller: ReadableStreamDefaultController<Uint8Array>) => {
                    if (isClosed) return;
                    try {
                        controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
                    } catch {
                        isClosed = true;
                    }
                };
                const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
                    if (isClosed) return;
                    isClosed = true;
                    try { controller.close(); } catch {}
                };
                const safeError = (err: any, controller: ReadableStreamDefaultController<Uint8Array>) => {
                    if (isClosed) return;
                    isClosed = true;
                    try { controller.error(err); } catch {}
                };

                req.signal.addEventListener('abort', () => {
                    isClosed = true;
                    try { ffmpegProc.kill('SIGKILL'); } catch {}
                });

                const webStream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        if (firstChunk) safeEnqueue(firstChunk, controller);
                        ffmpegProc.stdout.on('data', (chunk: Buffer) => safeEnqueue(chunk, controller));
                        ffmpegProc.stdout.on('end', () => safeClose(controller));
                        ffmpegProc.stdout.on('error', (err) => safeError(err, controller));
                        ffmpegProc.on('error', (err) => safeError(err, controller));
                    },
                    cancel() {
                        isClosed = true;
                        try { ffmpegProc.kill('SIGKILL'); } catch {}
                    }
                });

                return new Response(webStream, {
                    status: 200,
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'no-cache, no-store',
                        'X-Stream-Source': 'Online Transcode'
                    }
                });
            } catch (err: any) {
                console.warn('[AUDIO STREAM] FFmpeg direct URL transcode failed, attempting pipe fallback:', err.message);
            }
        }

        // 4. Fallback: yt-dlp stdin piped into FFmpeg with WebM Opus container (handles unseekable stdout)
        try {
            const ytdlArgs = [
                '-f', 'ba[ext=webm]/251/250/249/ba/b',
                '--no-playlist',
                '--no-check-certificates',
                '--no-warnings',
                '--ffmpeg-location', ffmpegPath,
                '-o', '-',
                targetUrl
            ];

            const ffmpegArgs = [
                '-i', 'pipe:0',
                '-vn',
                '-f', 'mp3',
                '-b:a', '192k',
                '-ar', '44100',
                'pipe:1'
            ];

            const ytdlProc = spawn(ytDlpBin, ytdlArgs);
            const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);

            ytdlProc.stdout.pipe(ffmpegProc.stdin);
            ytdlProc.stderr.on('data', () => {});
            ffmpegProc.stderr.on('data', () => {});

            let firstChunk: Buffer | null = null;
            await new Promise<void>((resolve, reject) => {
                const onData = (chunk: Buffer) => {
                    firstChunk = chunk;
                    ffmpegProc.stdout.off('data', onData);
                    resolve();
                };
                ffmpegProc.stdout.on('data', onData);
                ffmpegProc.once('error', reject);
                ffmpegProc.once('close', (code) => {
                    if (!firstChunk) reject(new Error(`FFmpeg pipe closed with code ${code}`));
                });
                setTimeout(() => {
                    if (!firstChunk) {
                        try { ytdlProc.kill(); } catch {}
                        try { ffmpegProc.kill(); } catch {}
                        reject(new Error('Audio stream pipe timeout'));
                    }
                }, 8000);
            });

            let isClosed = false;
            const safeEnqueue = (chunk: Uint8Array | Buffer, controller: ReadableStreamDefaultController<Uint8Array>) => {
                if (isClosed) return;
                try {
                    controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
                } catch {
                    isClosed = true;
                }
            };
            const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
                if (isClosed) return;
                isClosed = true;
                try { controller.close(); } catch {}
            };
            const safeError = (err: any, controller: ReadableStreamDefaultController<Uint8Array>) => {
                if (isClosed) return;
                isClosed = true;
                try { controller.error(err); } catch {}
            };

            req.signal.addEventListener('abort', () => {
                isClosed = true;
                try { ytdlProc.kill('SIGKILL'); } catch {}
                try { ffmpegProc.kill('SIGKILL'); } catch {}
            });

            const webStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    if (firstChunk) safeEnqueue(firstChunk, controller);
                    ffmpegProc.stdout.on('data', (chunk: Buffer) => safeEnqueue(chunk, controller));
                    ffmpegProc.stdout.on('end', () => safeClose(controller));
                    ffmpegProc.stdout.on('error', (err) => safeError(err, controller));
                    ffmpegProc.on('error', (err) => safeError(err, controller));
                    ytdlProc.on('error', (err) => safeError(err, controller));
                },
                cancel() {
                    isClosed = true;
                    try { ytdlProc.kill('SIGKILL'); } catch {}
                    try { ffmpegProc.kill('SIGKILL'); } catch {}
                }
            });

            return new Response(webStream, {
                status: 200,
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-cache, no-store',
                    'X-Stream-Source': 'Online Pipe'
                }
            });
        } catch (err: any) {
            console.error('[AUDIO STREAM] All stream pipelines failed:', err.message);
        }

        return new NextResponse('Audio stream temporarily unavailable from online engines.', { status: 502 });
    } catch (error: any) {
        console.error('Audio Stream API Error:', error.message);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

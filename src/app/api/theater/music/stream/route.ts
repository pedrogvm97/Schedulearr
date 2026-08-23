import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import { spawn, exec } from 'child_process';
import { Readable } from 'stream';
import axios from 'axios';
import ffmpegStatic from 'ffmpeg-static';
import { ensureYtDlpBinary, getYtDlpCommonArgs } from '@/lib/ytdlp';

const execPromise = util.promisify(exec);
const ffmpegPath: string = ffmpegStatic || 'ffmpeg';

export const dynamic = 'force-dynamic';

const INVIDIOUS_INSTANCES = [
    'https://invidious.nerdvpn.de',
    'https://inv.tux.pizza',
    'https://invidious.jing.rocks',
    'https://invidious.drgns.space',
    'https://yt.artemislena.eu'
];

const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://piped-api.garudalinux.org'
];

async function extractDirectAudioUrl(cleanYtId: string): Promise<string | null> {
    // 1. Try Invidious API
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const res = await axios.get(`${instance}/api/v1/videos/${cleanYtId}`, { timeout: 4000 });
            if (res.data && Array.isArray(res.data.adaptiveFormats)) {
                const audioFormats = res.data.adaptiveFormats.filter((f: any) => f.type && f.type.startsWith('audio/'));
                if (audioFormats.length > 0) {
                    audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
                    const best = audioFormats[0].url;
                    if (best) return best;
                }
            }
        } catch {}
    }

    // 2. Try Piped API
    for (const instance of PIPED_INSTANCES) {
        try {
            const res = await axios.get(`${instance}/streams/${cleanYtId}`, { timeout: 4000 });
            if (res.data && Array.isArray(res.data.audioStreams) && res.data.audioStreams.length > 0) {
                res.data.audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                const best = res.data.audioStreams[0].url;
                if (best) return best;
            }
        } catch {}
    }

    return null;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const ytId = searchParams.get('ytId');
        const directUrl = searchParams.get('url');
        const q = searchParams.get('q');
        const sourceFormat = (searchParams.get('sourceFormat') || searchParams.get('format') || 'm4a').toLowerCase();
        const saveFormat = (searchParams.get('saveFormat') || searchParams.get('format') || 'original').toLowerCase();
        const isDownload = searchParams.get('download') === 'true';
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

        const ytDlpBin = await ensureYtDlpBinary();

        // ── MODE A: Clean File Downloads (Ensures 100% complete files with exact Content-Length) ──
        if (isDownload) {
            const outFormat = saveFormat === 'flac' ? 'flac' : saveFormat === 'wav' ? 'wav' : saveFormat === 'm4a' ? 'm4a' : saveFormat === 'opus' ? 'opus' : 'mp3';
            const mimeType = outFormat === 'flac' ? 'audio/flac' : outFormat === 'wav' ? 'audio/wav' : outFormat === 'm4a' ? 'audio/mp4' : outFormat === 'opus' ? 'audio/opus' : 'audio/mpeg';
            const tempFilePath = path.join(os.tmpdir(), `schdl_dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${outFormat}`);

            let downloaded = false;

            // 1. Try downloading with standalone yt-dlp binary
            try {
                let cmd = '';
                if (outFormat === 'mp3' || outFormat === 'flac' || outFormat === 'wav') {
                    cmd = `"${ytDlpBin}" -f "ba/b" --no-playlist --no-check-certificates --no-warnings --extractor-args "youtube:player_client=ios,android,web,mweb" --extract-audio --audio-format ${outFormat} ${outFormat === 'mp3' ? '--audio-quality 320k' : ''} --ffmpeg-location "${ffmpegPath}" --force-overwrites -o "${tempFilePath}" "${targetUrl}"`;
                } else {
                    cmd = `"${ytDlpBin}" -f "${formatFilter}" --no-playlist --no-check-certificates --no-warnings --extractor-args "youtube:player_client=ios,android,web,mweb" --ffmpeg-location "${ffmpegPath}" --force-overwrites -o "${tempFilePath}" "${targetUrl}"`;
                }
                console.log(`[DOWNLOAD API] Fetching audio with yt-dlp: ${cmd}`);
                await execPromise(cmd, { timeout: 120000 });
                if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 1024) {
                    downloaded = true;
                }
            } catch (err: any) {
                console.warn('[DOWNLOAD API] yt-dlp download failed, attempting fallback API:', err.message);
            }

            // 2. Fallback: Extract direct stream URL from Invidious/Piped and transcode with ffmpeg
            if (!downloaded && cleanId) {
                try {
                    const directAudioUrl = await extractDirectAudioUrl(cleanId);
                    if (directAudioUrl) {
                        const ffmpegCmd = `"${ffmpegPath}" -y -i "${directAudioUrl}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} -f ${outFormat} "${tempFilePath}"`;
                        console.log(`[DOWNLOAD API] Fallback ffmpeg direct stream convert: ${ffmpegCmd}`);
                        await execPromise(ffmpegCmd, { timeout: 60000 });
                        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 1024) {
                            downloaded = true;
                        }
                    }
                } catch (fallbackErr: any) {
                    console.error('[DOWNLOAD API] Direct stream fallback error:', fallbackErr.message);
                }
            }

            if (downloaded && fs.existsSync(tempFilePath)) {
                const stat = fs.statSync(tempFilePath);
                const fileStream = fs.createReadStream(tempFilePath);

                fileStream.on('close', () => {
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                        } catch {}
                    }, 5000);
                });

                return new Response(Readable.toWeb(fileStream) as any, {
                    status: 200,
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Length': stat.size.toString(),
                        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
                        'Cache-Control': 'no-cache, no-store'
                    }
                });
            }

            return new NextResponse('Failed to process and download audio file.', { status: 502 });
        }

        // ── MODE B: Transcoded Live Audio Stream (For In-Browser Web Player) ──
        if (saveFormat === 'mp3' || saveFormat === 'flac' || saveFormat === 'wav' || isTranscode) {
            const outFormat = saveFormat === 'flac' ? 'flac' : saveFormat === 'wav' ? 'wav' : 'mp3';
            const mimeType = outFormat === 'flac' ? 'audio/flac' : outFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';

            // Try spawning yt-dlp first with modern iOS/Android/web client rotation
            try {
                const ytdlArgs = [
                    '-f', formatFilter,
                    '--no-playlist',
                    '--no-check-certificates',
                    '--no-warnings',
                    '--extractor-args', 'youtube:player_client=ios,android,web,mweb',
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

                let hasError = false;
                ytdlProc.on('error', () => { hasError = true; });
                ffmpegProc.on('error', () => { hasError = true; });

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

            // Fallback: Extract direct audio stream URL from Invidious/Piped and transcode via ffmpeg
            if (cleanId) {
                const directAudioUrl = await extractDirectAudioUrl(cleanId);
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

        // ── MODE B: Direct Native Audio Stream (M4A / Opus) ──
        const contentType = effectiveExt === 'opus' ? 'audio/webm; codecs=opus' : 'audio/mp4';

        try {
            const ytdlArgs = [
                '-f', formatFilter,
                '--no-playlist',
                '--no-check-certificates',
                '--no-warnings',
                '--extractor-args', 'youtube:player_client=ios,android,web,mweb',
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

            const headers: Record<string, string> = {
                'Content-Type': contentType,
                'Cache-Control': isDownload ? 'no-cache, no-store' : 'public, max-age=3600'
            };
            if (isDownload) {
                headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
            }

            return new Response(webStream, { status: 200, headers });
        } catch (e: any) {
            console.warn('[AUDIO STREAM] Direct yt-dlp pipe failed:', e.message);
        }

        // Direct stream fallback via Invidious / Piped
        if (cleanId) {
            const directAudioUrl = await extractDirectAudioUrl(cleanId);
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

                const headers: Record<string, string> = {
                    'Content-Type': remoteRes.headers['content-type'] || contentType,
                    'Cache-Control': 'public, max-age=3600'
                };
                if (isDownload) {
                    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
                }
                return new Response(webStream, { status: 200, headers });
            }
        }

        return new NextResponse('Failed to stream audio track: source unreachable or restricted.', { status: 502 });
    } catch (error: any) {
        console.error('Audio Stream API Error:', error.message);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

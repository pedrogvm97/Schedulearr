import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

const ffmpegPath: string = ffmpegStatic || 'ffmpeg';

function getYtDlpPath(): string {
    const localBin = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    if (fs.existsSync(localBin)) return localBin;
    return 'yt-dlp';
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const ytId = searchParams.get('ytId');
        const directUrl = searchParams.get('url');
        const q = searchParams.get('q');
        const sourceFormat = (searchParams.get('sourceFormat') || searchParams.get('format') || 'm4a').toLowerCase(); // 'm4a' or 'opus'
        const saveFormat = (searchParams.get('saveFormat') || searchParams.get('format') || 'original').toLowerCase(); // 'original', 'mp3', 'flac', 'wav', 'm4a', 'opus'
        const isDownload = searchParams.get('download') === 'true';

        let targetUrl = '';
        if (directUrl) {
            targetUrl = directUrl;
        } else if (ytId) {
            const cleanId = ytId.replace(/^yt-/, '');
            targetUrl = `https://www.youtube.com/watch?v=${cleanId}`;
        } else if (q) {
            targetUrl = `ytsearch1:${q}`;
        } else {
            return new NextResponse('ytId, url or q parameter is required', { status: 400 });
        }

        const effectiveExt = saveFormat === 'original'
            ? (sourceFormat === 'opus' ? 'opus' : 'm4a')
            : saveFormat;
        const downloadFilename = searchParams.get('filename') || `track.${effectiveExt}`;
        const safeFilename = downloadFilename.replace(/[/\\?%*:|"<>]/g, '').trim() || `track.${effectiveExt}`;

        // Format selector for YouTube extraction
        const formatFilter = sourceFormat === 'opus'
            ? 'ba[ext=webm]/251/250/249/bestaudio'
            : 'ba[ext=m4a]/140/139/bestaudio';

        const ytDlpBin = getYtDlpPath();

        // Mode A: Post-download conversion via FFmpeg (MP3, FLAC, WAV)
        if (saveFormat === 'mp3' || saveFormat === 'flac' || saveFormat === 'wav') {
            const mimeType = saveFormat === 'mp3' ? 'audio/mpeg' : saveFormat === 'flac' ? 'audio/flac' : 'audio/wav';

            const ytdlArgs = [
                '-f', formatFilter,
                '--no-playlist',
                '--no-check-certificates',
                '-o', '-',
                targetUrl
            ];

            const ffmpegArgs = [
                '-i', 'pipe:0',
                '-vn',
                '-f', saveFormat,
                ...(saveFormat === 'mp3' ? ['-b:a', '320k', '-ar', '44100'] : []),
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

            const headers: Record<string, string> = {
                'Content-Type': mimeType,
                'Cache-Control': 'no-cache, no-store'
            };
            if (isDownload) {
                headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
            }

            return new Response(webStream, { status: 200, headers });
        }

        // Mode B: Direct Native YouTube Audio Stream (M4A / Opus)
        const contentType = effectiveExt === 'opus' ? 'audio/webm; codecs=opus' : 'audio/mp4';

        const ytdlArgs = [
            '-f', formatFilter,
            '--no-playlist',
            '--no-check-certificates',
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
    } catch (error: any) {
        console.error('Audio Stream API Error:', error.message);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

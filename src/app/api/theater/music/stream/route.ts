import { NextResponse } from 'next/server';
import axios from 'axios';
import { exec, spawn } from 'child_process';
import util from 'util';
import ffmpegStatic from 'ffmpeg-static';

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

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const ytId = searchParams.get('ytId');
        const directUrl = searchParams.get('url');
        const formatParam = (searchParams.get('format') || 'm4a').toLowerCase(); // 'mp3', 'm4a', 'opus', 'flac'

        if (directUrl) {
            return NextResponse.redirect(directUrl);
        }

        if (!ytId) {
            return new NextResponse('ytId parameter is required', { status: 400 });
        }

        const cleanYtId = ytId.replace(/^yt-/, '');
        let directAudioUrl = '';

        // 1. Try local yt-dlp first for the audio stream
        try {
            const { stdout } = await execPromise(`yt-dlp -g -f "bestaudio" "https://www.youtube.com/watch?v=${cleanYtId}"`, { timeout: 8000 });
            if (stdout && stdout.trim().startsWith('http')) {
                directAudioUrl = stdout.trim().split('\n')[0];
            }
        } catch {}

        // 2. Try Invidious API instances
        if (!directAudioUrl) {
            for (const instance of INVIDIOUS_INSTANCES) {
                try {
                    const res = await axios.get(`${instance}/api/v1/videos/${cleanYtId}`, { timeout: 4000 });
                    if (res.data && Array.isArray(res.data.adaptiveFormats)) {
                        const audioFormats = res.data.adaptiveFormats.filter((f: any) => f.type && f.type.startsWith('audio/'));
                        if (audioFormats.length > 0) {
                            audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
                            directAudioUrl = audioFormats[0].url;
                            if (directAudioUrl) break;
                        }
                    }
                } catch {}
            }
        }

        // 3. Try Piped API instances
        if (!directAudioUrl) {
            for (const instance of PIPED_INSTANCES) {
                try {
                    const res = await axios.get(`${instance}/streams/${cleanYtId}`, { timeout: 4000 });
                    if (res.data && Array.isArray(res.data.audioStreams) && res.data.audioStreams.length > 0) {
                        res.data.audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                        directAudioUrl = res.data.audioStreams[0].url;
                        if (directAudioUrl) break;
                    }
                } catch {}
            }
        }

        if (!directAudioUrl) {
            return new NextResponse('Could not extract direct audio stream for this track', { status: 404 });
        }

        const isDownload = searchParams.get('download') === 'true';
        const defaultExt = formatParam === 'mp3' ? 'mp3' : formatParam === 'flac' ? 'flac' : formatParam === 'opus' ? 'opus' : 'm4a';
        const downloadFilename = searchParams.get('filename') || `track.${defaultExt}`;
        const safeFilename = downloadFilename.replace(/[/\\?%*:|"<>]/g, '').trim() || `track.${defaultExt}`;

        // 4. Handle Format Conversion via FFmpeg (MP3 320k or FLAC)
        if (formatParam === 'mp3' || formatParam === 'flac') {
            const mimeType = formatParam === 'mp3' ? 'audio/mpeg' : 'audio/flac';
            const ffmpegArgs = [
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5',
                '-i', directAudioUrl,
                '-vn',
                '-f', formatParam === 'flac' ? 'flac' : 'mp3',
                ...(formatParam === 'mp3' ? ['-b:a', '320k', '-ar', '44100'] : []),
                'pipe:1'
            ];

            const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);

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

            const headers: Record<string, string> = {
                'Content-Type': mimeType,
                'Cache-Control': 'no-cache, no-store'
            };
            if (isDownload) {
                headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
            }

            return new Response(webStream, {
                status: 200,
                headers
            });
        }

        // 5. Handle Native Stream / Direct Attachment (M4A / Opus)
        const contentType = formatParam === 'opus' ? 'audio/ogg; codecs=opus' : 'audio/mp4';

        const fetchHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        const range = req.headers.get('range');
        if (range && !isDownload) fetchHeaders['Range'] = range;

        const fetchRes = await fetch(directAudioUrl, { headers: fetchHeaders });

        if (fetchRes.ok && fetchRes.body) {
            const headers: Record<string, string> = {
                'Content-Type': contentType,
                'Cache-Control': isDownload ? 'no-cache, no-store' : 'public, max-age=3600'
            };

            if (isDownload) {
                headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
            } else {
                headers['Accept-Ranges'] = 'bytes';
            }

            const cl = fetchRes.headers.get('content-length');
            if (cl) headers['Content-Length'] = cl;
            const cr = fetchRes.headers.get('content-range');
            if (cr && !isDownload) headers['Content-Range'] = cr;

            return new Response(fetchRes.body, {
                status: fetchRes.status,
                headers
            });
        } else {
            return new NextResponse('Failed to proxy audio stream from media provider', { status: 502 });
        }
    } catch (error: any) {
        console.error('Audio Stream API Error:', error.message);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

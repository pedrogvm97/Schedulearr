import { NextResponse } from 'next/server';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

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
        const formatParam = searchParams.get('format') || 'm4a'; // 'm4a' or 'opus'

        if (directUrl) {
            return NextResponse.redirect(directUrl);
        }

        if (!ytId) {
            return new NextResponse('ytId parameter is required', { status: 400 });
        }

        const cleanYtId = ytId.replace(/^yt-/, '');
        let directAudioUrl = '';

        // 1. Try local yt-dlp first for the exact requested format
        try {
            const formatFilter = formatParam === 'm4a' ? 'bestaudio[ext=m4a]/bestaudio' : 'bestaudio[ext=webm]/bestaudio';
            const { stdout } = await execPromise(`yt-dlp -g -f "${formatFilter}" "https://www.youtube.com/watch?v=${cleanYtId}"`, { timeout: 8000 });
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
                        const targetMime = formatParam === 'm4a' ? 'audio/mp4' : 'audio/webm';
                        let audioFormats = res.data.adaptiveFormats.filter((f: any) => f.type && f.type.startsWith(targetMime));
                        if (audioFormats.length === 0) {
                            audioFormats = res.data.adaptiveFormats.filter((f: any) => f.type && f.type.startsWith('audio/'));
                        }
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
                        const targetMime = formatParam === 'm4a' ? 'm4a' : 'opus';
                        let matched = res.data.audioStreams.filter((s: any) => s.format === targetMime || (s.mimeType && s.mimeType.includes(targetMime)));
                        if (matched.length === 0) matched = res.data.audioStreams;
                        matched.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                        directAudioUrl = matched[0].url;
                        if (directAudioUrl) break;
                    }
                } catch {}
            }
        }

        if (!directAudioUrl) {
            return new NextResponse('Could not extract direct audio stream for this track', { status: 404 });
        }

        const isDownload = searchParams.get('download') === 'true';
        const defaultExt = formatParam === 'opus' ? 'opus' : 'm4a';
        const downloadFilename = searchParams.get('filename') || `track.${defaultExt}`;
        const safeFilename = downloadFilename.replace(/[/\\?%*:|"<>]/g, '').trim() || `track.${defaultExt}`;
        const contentType = formatParam === 'opus' ? 'audio/ogg; codecs=opus' : 'audio/mp4';

        // 4. Handle Direct Browser File Download (Native Streamed Attachment)
        if (isDownload) {
            try {
                const fetchRes = await fetch(directAudioUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });

                if (fetchRes.ok && fetchRes.body) {
                    const headers: Record<string, string> = {
                        'Content-Type': contentType,
                        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
                        'Cache-Control': 'no-cache, no-store'
                    };

                    const cl = fetchRes.headers.get('content-length');
                    if (cl) headers['Content-Length'] = cl;

                    return new Response(fetchRes.body, {
                        status: 200,
                        headers
                    });
                } else {
                    // Fallback to direct redirect if YouTube CDN IP blocks proxying
                    return NextResponse.redirect(directAudioUrl);
                }
            } catch (dlErr: any) {
                // If proxy fetch fails, redirect directly to audio URL so browser downloads it
                return NextResponse.redirect(directAudioUrl);
            }
        }

        // 5. Proxy live playback stream
        try {
            const range = req.headers.get('range');
            const streamHeaders: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
            if (range) streamHeaders['Range'] = range;

            const fetchRes = await fetch(directAudioUrl, {
                headers: streamHeaders
            });

            if (fetchRes.ok && fetchRes.body) {
                const headers: Record<string, string> = {
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600'
                };

                const cl = fetchRes.headers.get('content-length');
                if (cl) headers['Content-Length'] = cl;
                const cr = fetchRes.headers.get('content-range');
                if (cr) headers['Content-Range'] = cr;

                return new Response(fetchRes.body, {
                    status: fetchRes.status,
                    headers
                });
            } else {
                return NextResponse.redirect(directAudioUrl);
            }
        } catch {
            return NextResponse.redirect(directAudioUrl);
        }
    } catch (error: any) {
        console.error('Audio Stream API Error:', error.message);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

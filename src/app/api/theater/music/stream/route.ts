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

        if (directUrl) {
            return NextResponse.redirect(directUrl);
        }

        if (!ytId) {
            return new NextResponse('ytId parameter is required', { status: 400 });
        }

        const cleanYtId = ytId.replace(/^yt-/, '');
        let directAudioUrl = '';

        // 1. Try local yt-dlp first if available
        try {
            const { stdout } = await execPromise(`yt-dlp -g -f bestaudio/best "https://www.youtube.com/watch?v=${cleanYtId}"`, { timeout: 8000 });
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
                            // Sort by bitrate descending
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

        // Fetch and proxy the audio stream directly or redirect
        const audioRes = await axios.get(directAudioUrl, {
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...(req.headers.get('range') ? { Range: req.headers.get('range')! } : {})
            },
            timeout: 15000
        });

        const headers: Record<string, string> = {
            'Content-Type': audioRes.headers['content-type'] || 'audio/webm',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600'
        };

        if (audioRes.headers['content-length']) {
            headers['Content-Length'] = audioRes.headers['content-length'];
        }
        if (audioRes.headers['content-range']) {
            headers['Content-Range'] = audioRes.headers['content-range'];
        }

        const status = audioRes.status === 206 ? 206 : 200;

        // @ts-ignore
        return new NextResponse(audioRes.data, {
            status,
            headers
        });
    } catch (error: any) {
        console.error('Audio Stream API Error:', error.message);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

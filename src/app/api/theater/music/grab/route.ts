import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import db from '@/lib/db';

const execPromise = util.promisify(exec);

export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

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

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { youtubeId, title, artist, album, libraryId, coverUrl, targetFolder, audioFormat = 'mp3' } = body;

        if (!title || (!youtubeId && !body.streamUrl)) {
            return NextResponse.json({ error: 'title and youtubeId (or streamUrl) are required' }, { status: 400 });
        }

        // 1. Determine Music Library Root Folder
        let musicRoot = targetFolder;
        if (!musicRoot && libraryId) {
            try {
                const libRow: any = db.prepare('SELECT folders FROM theater_libraries WHERE id = ?').get(libraryId);
                if (libRow && libRow.folders) {
                    const folders = typeof libRow.folders === 'string' ? JSON.parse(libRow.folders) : libRow.folders;
                    if (Array.isArray(folders) && folders.length > 0) {
                        musicRoot = folders[0];
                    }
                }
            } catch {}
        }

        if (!musicRoot) {
            try {
                const anyMusicLib: any = db.prepare("SELECT folders FROM theater_libraries WHERE type = 'music' LIMIT 1").get();
                if (anyMusicLib && anyMusicLib.folders) {
                    const folders = typeof anyMusicLib.folders === 'string' ? JSON.parse(anyMusicLib.folders) : anyMusicLib.folders;
                    if (Array.isArray(folders) && folders.length > 0) {
                        musicRoot = folders[0];
                    }
                }
            } catch {}
        }

        if (!musicRoot) {
            for (const fallback of ['/music', '/media/music', './data/music', './downloads/music', 'C:\\music']) {
                if (fs.existsSync(fallback)) {
                    musicRoot = fallback;
                    break;
                }
            }
        }

        if (!musicRoot) {
            musicRoot = path.join(process.cwd(), 'data', 'music');
        }

        const cleanArtist = sanitizeFilename(artist || 'Unknown Artist');
        const cleanAlbum = sanitizeFilename(album || 'Singles');
        const cleanTitle = sanitizeFilename(title);

        const albumDir = path.join(musicRoot, cleanArtist, cleanAlbum);
        if (!fs.existsSync(albumDir)) {
            fs.mkdirSync(albumDir, { recursive: true });
        }

        const ext = audioFormat === 'aac' ? 'm4a' : audioFormat === 'opus' ? 'opus' : 'mp3';
        const finalAudioPath = path.join(albumDir, `${cleanTitle}.${ext}`);
        let cleanYtId = (youtubeId || '').replace(/^yt-/, '');

        if (!cleanYtId && body.streamUrl) {
            try {
                const u = new URL(body.streamUrl, 'http://localhost');
                const p = u.searchParams.get('ytId');
                if (p) cleanYtId = p.replace(/^yt-/, '');
            } catch {}
        }

        // Automatic YouTube search fallback if neither youtubeId nor direct stream was found
        if (!cleanYtId && (!body.streamUrl || body.streamUrl.includes('/api/theater/music/stream'))) {
            try {
                const searchQ = encodeURIComponent(`${cleanArtist} ${cleanTitle} audio`);
                const searchRes = await axios.get(`https://www.youtube.com/results?search_query=${searchQ}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 6000
                });
                const match = searchRes.data.match(/videoId":"([a-zA-Z0-9_-]{11})"/);
                if (match && match[1]) {
                    cleanYtId = match[1];
                }
            } catch (searchErr) {
                console.warn('Grab search fallback failed:', searchErr);
            }
        }

        // 2. Download Track Audio
        let downloaded = false;

        // Try yt-dlp first if available
        if (cleanYtId) {
            try {
                const cmd = `yt-dlp -x --audio-format ${ext === 'm4a' ? 'aac' : ext} --audio-quality 0 --embed-metadata -o "${path.join(albumDir, `${cleanTitle}.%(ext)s`)}" "https://www.youtube.com/watch?v=${cleanYtId}"`;
                await execPromise(cmd, { timeout: 45000 });
                downloaded = true;
            } catch {}
        }

        // Direct stream extraction fallback (Invidious / Piped / internal stream proxy)
        if (!downloaded && cleanYtId) {
            let directAudioUrl = '';

            // Try Invidious API instances
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

            // Try Piped API instances
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

            if (directAudioUrl) {
                try {
                    const writer = fs.createWriteStream(finalAudioPath);
                    const response = await axios({
                        url: directAudioUrl,
                        method: 'GET',
                        responseType: 'stream',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        timeout: 60000
                    });
                    response.data.pipe(writer);
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    downloaded = true;
                } catch (pipeErr: any) {
                    console.error('Audio pipe stream download error:', pipeErr.message);
                }
            }
        }

        // 3. Save Album Artwork
        if (coverUrl) {
            const coverPath = path.join(albumDir, 'cover.jpg');
            if (!fs.existsSync(coverPath)) {
                try {
                    const imgRes = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 8000 });
                    fs.writeFileSync(coverPath, Buffer.from(imgRes.data));
                    fs.writeFileSync(path.join(albumDir, 'folder.jpg'), Buffer.from(imgRes.data));
                } catch (imgErr) {
                    console.warn('Failed to download cover image:', imgErr);
                }
            }
        }

        if (downloaded || fs.existsSync(finalAudioPath)) {
            return NextResponse.json({
                success: true,
                message: `Successfully saved "${cleanTitle}" to ${cleanArtist} / ${cleanAlbum}`,
                path: finalAudioPath,
                artist: cleanArtist,
                album: cleanAlbum,
                title: cleanTitle
            });
        } else {
            return NextResponse.json({ error: 'Failed to extract audio stream for this track. Please check network connection.' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/music/grab error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

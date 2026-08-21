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

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { youtubeId, title, artist, album, libraryId, coverUrl, targetFolder } = body;

        if (!title || (!youtubeId && !body.streamUrl)) {
            return NextResponse.json({ error: 'title and youtubeId (or streamUrl) are required' }, { status: 400 });
        }

        // 1. Determine Music Library Root Folder
        let musicRoot = targetFolder;
        if (!musicRoot && libraryId) {
            const libRow: any = db.prepare('SELECT folders FROM theater_libraries WHERE id = ?').get(libraryId);
            if (libRow && libRow.folders) {
                const folders = JSON.parse(libRow.folders);
                if (Array.isArray(folders) && folders.length > 0) {
                    musicRoot = folders[0];
                }
            }
        }

        if (!musicRoot) {
            // Fallbacks for common mount points
            for (const fallback of ['/music', '/media/music', '/mnt/user/data/media/music', 'C:\\music']) {
                if (fs.existsSync(fallback)) {
                    musicRoot = fallback;
                    break;
                }
            }
        }

        if (!musicRoot) {
            return NextResponse.json({
                error: 'No target music directory found. Please ensure your Music Library has at least one valid folder configured.'
            }, { status: 400 });
        }

        const cleanArtist = sanitizeFilename(artist || 'Unknown Artist');
        const cleanAlbum = sanitizeFilename(album || 'Singles');
        const cleanTitle = sanitizeFilename(title);

        const albumDir = path.join(musicRoot, cleanArtist, cleanAlbum);
        if (!fs.existsSync(albumDir)) {
            fs.mkdirSync(albumDir, { recursive: true });
        }

        const finalAudioPath = path.join(albumDir, `${cleanTitle}.mp3`);
        const cleanYtId = (youtubeId || '').replace(/^yt-/, '');

        // 2. Download Track Audio
        let downloaded = false;

        // Try yt-dlp first
        if (cleanYtId) {
            try {
                const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --embed-metadata -o "${path.join(albumDir, `${cleanTitle}.%(ext)s`)}" "https://www.youtube.com/watch?v=${cleanYtId}"`;
                await execPromise(cmd, { timeout: 60000 });
                downloaded = true;
            } catch (ytErr: any) {
                console.warn('yt-dlp command failed, trying stream download fallback:', ytErr.message);
            }
        }

        // Direct stream download fallback if yt-dlp failed
        if (!downloaded) {
            const streamEndpoint = `https://pipedapi.kavin.rocks/streams/${cleanYtId}`;
            try {
                const pipeRes = await axios.get(streamEndpoint, { timeout: 6000 });
                const audioStreams = pipeRes.data?.audioStreams || [];
                if (audioStreams.length > 0) {
                    audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                    const bestStreamUrl = audioStreams[0].url;
                    const writer = fs.createWriteStream(finalAudioPath);
                    const response = await axios({
                        url: bestStreamUrl,
                        method: 'GET',
                        responseType: 'stream',
                        timeout: 30000
                    });
                    response.data.pipe(writer);
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    downloaded = true;
                }
            } catch (e: any) {
                console.error('Fallback audio download error:', e.message);
            }
        }

        // 3. Save Album Artwork if not already existing
        if (coverUrl) {
            const coverPath = path.join(albumDir, 'cover.jpg');
            if (!fs.existsSync(coverPath)) {
                try {
                    const imgRes = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 8000 });
                    fs.writeFileSync(coverPath, Buffer.from(imgRes.data));
                    // also save folder.jpg for Windows/Plex compatibility
                    fs.writeFileSync(path.join(albumDir, 'folder.jpg'), Buffer.from(imgRes.data));
                } catch (imgErr) {
                    console.warn('Failed to download cover image:', imgErr);
                }
            }
        }

        if (downloaded || fs.existsSync(finalAudioPath)) {
            return NextResponse.json({
                success: true,
                message: `Downloaded "${cleanTitle}" to ${cleanArtist} / ${cleanAlbum}`,
                path: finalAudioPath,
                artist: cleanArtist,
                album: cleanAlbum,
                title: cleanTitle
            });
        } else {
            return NextResponse.json({ error: 'Failed to download audio track. Please try again.' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/music/grab error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

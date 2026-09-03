import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import db, { getTheaterLibraries, clearCachedTheaterItems, getInstances } from '@/lib/db';
import { ensureFfmpegBinaries } from '@/lib/ytdlp';
import { downloadAudioFile } from '@/lib/musicDownloader';

const execPromise = util.promisify(exec);

export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

export async function POST(req: Request) {
    try {
        const contentType = req.headers.get('content-type') || '';
        let body: any = {};
        let uploadedBuffer: Buffer | null = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const file = formData.get('file') as File | null;
            if (file) {
                const arrayBuffer = await file.arrayBuffer();
                uploadedBuffer = Buffer.from(arrayBuffer);
            }
            body = {
                title: formData.get('title') as string,
                artist: formData.get('artist') as string,
                album: formData.get('album') as string,
                targetFolder: formData.get('targetFolder') as string,
                libraryId: formData.get('libraryId') as string,
                sourceFormat: formData.get('sourceFormat') as string,
                saveFormat: (formData.get('saveFormat') || formData.get('audioFormat')) as string,
                coverUrl: formData.get('coverUrl') as string,
                youtubeId: formData.get('youtubeId') as string
            };
        } else {
            body = await req.json();
            if (body.audioBase64) {
                uploadedBuffer = Buffer.from(body.audioBase64, 'base64');
            }
        }

        const {
            youtubeId,
            title,
            artist,
            album,
            libraryId,
            coverUrl,
            targetFolder,
            sourceFormat = 'm4a',
            saveFormat = (body.audioFormat || 'original')
        } = body;

        if (!title) {
            return NextResponse.json({ error: 'title is required' }, { status: 400 });
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
            try {
                fs.mkdirSync(albumDir, { recursive: true });
            } catch (mkdirErr: any) {
                console.error(`[GRAB] Failed to create album directory: ${albumDir}`, mkdirErr.message);
                return NextResponse.json({
                    error: `Cannot create directory "${albumDir}". Please verify folder permissions. (${mkdirErr.message})`
                }, { status: 500 });
            }
        }

        const { ffmpegPath } = ensureFfmpegBinaries();
        const effectiveExt = saveFormat === 'original'
            ? (sourceFormat === 'opus' ? 'opus' : 'm4a')
            : saveFormat;
        const finalAudioPath = path.join(albumDir, `${cleanTitle}.${effectiveExt}`);

        // Direct uploaded audio payload (Client-assisted upload)
        if (uploadedBuffer && uploadedBuffer.length > 0) {
            const tempUploadPath = path.join(albumDir, `temp_${Date.now()}.${sourceFormat === 'opus' ? 'opus' : 'm4a'}`);
            fs.writeFileSync(tempUploadPath, uploadedBuffer);

            if (saveFormat !== 'original' && saveFormat !== (sourceFormat === 'opus' ? 'opus' : 'm4a')) {
                try {
                    const convertCmd = `"${ffmpegPath}" -y -i "${tempUploadPath}" -vn ${saveFormat === 'mp3' ? '-b:a 320k' : ''} "${finalAudioPath}"`;
                    await execPromise(convertCmd);
                    if (fs.existsSync(tempUploadPath)) fs.unlinkSync(tempUploadPath);
                } catch {
                    if (fs.existsSync(tempUploadPath)) fs.renameSync(tempUploadPath, finalAudioPath);
                }
            } else {
                if (fs.existsSync(tempUploadPath)) fs.renameSync(tempUploadPath, finalAudioPath);
            }

            if (coverUrl) {
                const coverPath = path.join(albumDir, 'cover.jpg');
                if (!fs.existsSync(coverPath)) {
                    try {
                        const imgRes = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 8000 });
                        fs.writeFileSync(coverPath, Buffer.from(imgRes.data));
                        fs.writeFileSync(path.join(albumDir, 'folder.jpg'), Buffer.from(imgRes.data));
                    } catch {}
                }
            }
            return NextResponse.json({
                success: true,
                message: `Successfully saved "${cleanTitle}" to ${cleanArtist} / ${cleanAlbum}`,
                path: finalAudioPath,
                artist: cleanArtist,
                album: cleanAlbum,
                title: cleanTitle
            });
        }

        let cleanYtId = (youtubeId || '').replace(/^yt-/, '');

        if (!cleanYtId && body.streamUrl) {
            try {
                const u = new URL(body.streamUrl, 'http://localhost');
                const p = u.searchParams.get('ytId');
                if (p) cleanYtId = p.replace(/^yt-/, '');
            } catch {}
        }

        // 2. Download Track Audio using Multi-Tier Downloader Engine
        const isPreview = body.streamUrl && (body.streamUrl.includes('preview') || body.streamUrl.includes('dzcdn.net') || body.streamUrl.includes('mzstatic.com'));
        const dlResult = await downloadAudioFile({
            targetUrl: cleanYtId ? `https://www.youtube.com/watch?v=${cleanYtId}` : (body.streamUrl?.startsWith('http') && !isPreview ? body.streamUrl : undefined),
            youtubeId: cleanYtId || undefined,
            query: `${cleanArtist} ${cleanTitle}`,
            outputPath: finalAudioPath,
            format: (saveFormat === 'original' ? 'm4a' : saveFormat) as any,
            title: cleanTitle,
            artist: cleanArtist,
            album: cleanAlbum,
            coverUrl
        });

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

        if (dlResult.success && fs.existsSync(finalAudioPath)) {
            // Invalidate local SQLite Theater cache & trigger background Plex scan
            try {
                const allLibs = getTheaterLibraries();
                const matched = allLibs.filter(l => {
                    if (libraryId && l.id === libraryId) return true;
                    let folders: string[] = [];
                    try { folders = typeof l.folders === 'string' ? JSON.parse(l.folders) : (l.folders || []); } catch {}
                    return folders.some(f => f === musicRoot || musicRoot.startsWith(f) || f.startsWith(musicRoot));
                });
                for (const m of matched) clearCachedTheaterItems(m.id);

                setTimeout(async () => {
                    try {
                        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
                        for (const plex of plexInstances) {
                            const cleanUrl = plex.url.replace(/\/$/, '');
                            const secRes = await axios.get(`${cleanUrl}/library/sections`, {
                                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                timeout: 5000
                            }).catch(() => null);
                            if (secRes?.data?.MediaContainer?.Directory) {
                                for (const d of secRes.data.MediaContainer.Directory) {
                                    const locs = (d.Location || []).map((l: any) => l.path);
                                    const isMatch = locs.some((loc: string) => musicRoot === loc || musicRoot.startsWith(loc) || loc.startsWith(musicRoot));
                                    if (isMatch || d.type === 'artist') {
                                        await axios.get(`${cleanUrl}/library/sections/${d.key}/refresh`, {
                                            headers: { 'X-Plex-Token': plex.api_key },
                                            timeout: 8000
                                        }).catch(() => null);
                                    }
                                }
                            }
                        }
                    } catch {}
                }, 500);
            } catch {}

            return NextResponse.json({
                success: true,
                message: `Successfully saved "${cleanTitle}" to ${cleanArtist} / ${cleanAlbum}`,
                path: finalAudioPath,
                artist: cleanArtist,
                album: cleanAlbum,
                title: cleanTitle
            });
        } else {
            return NextResponse.json({ error: dlResult.error || 'Failed to extract audio stream for this track. Please check network connection.' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/music/grab error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

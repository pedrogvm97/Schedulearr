import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { Readable } from 'stream';
import { getInstances } from '@/lib/db';
import { exec } from 'child_process';
import util from 'util';
import ffmpegStatic from 'ffmpeg-static';
import { ensureYtDlpBinary } from '@/lib/ytdlp';

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

function getMimeType(filenameOrExt: string): string {
    const ext = filenameOrExt.startsWith('.') ? filenameOrExt.toLowerCase() : path.extname(filenameOrExt).toLowerCase();
    switch (ext) {
        case '.flac': return 'audio/flac';
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        case '.opus': return 'audio/opus';
        case '.mp4': return 'audio/mp4';
        default: return 'audio/mpeg';
    }
}

// ── GET: Instant File Retrieval (From Token, Local Path, or Remote Proxy) ──
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');
        const filePath = searchParams.get('path');
        const albumFolder = searchParams.get('albumFolder');
        const customTitle = searchParams.get('title') || 'track';
        const artist = searchParams.get('artist') || '';
        const streamUrlParam = searchParams.get('streamUrl') || '';
        const youtubeId = searchParams.get('youtubeId') || '';
        const extParam = searchParams.get('ext') || '';
        const filenameParam = searchParams.get('filename') || '';

        // 1. Pre-downloaded Temp File on Server (Instant Delivery)
        if (token) {
            const tempDir = path.join(os.tmpdir(), 'schedulearr_downloads');
            const safeToken = token.replace(/[^a-zA-Z0-9_-]/g, '');
            if (!fs.existsSync(tempDir)) {
                return NextResponse.json({ error: 'Download token expired or not found' }, { status: 404 });
            }

            const files = fs.readdirSync(tempDir);
            const matchedFile = files.find(f => f.startsWith(safeToken));
            if (!matchedFile) {
                return NextResponse.json({ error: 'File expired. Please re-download.' }, { status: 404 });
            }

            const fullPath = path.join(tempDir, matchedFile);
            const stat = fs.statSync(fullPath);
            const ext = path.extname(fullPath);
            const mimeType = getMimeType(ext);
            const downloadFilename = filenameParam || matchedFile;

            const fileStream = fs.createReadStream(fullPath);
            fileStream.on('close', () => {
                setTimeout(() => {
                    try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
                }, 15000);
            });

            return new Response(Readable.toWeb(fileStream) as any, {
                status: 200,
                headers: {
                    'Content-Type': mimeType,
                    'Content-Length': stat.size.toString(),
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFilename)}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
                    'Cache-Control': 'no-cache, no-store'
                }
            });
        }

        // 2. Album Files Listing
        if (albumFolder) {
            if (!fs.existsSync(albumFolder)) {
                return NextResponse.json({ error: 'Album folder not found on server disk' }, { status: 404 });
            }

            const entries = fs.readdirSync(albumFolder, { withFileTypes: true });
            const audioExtensions = new Set(['.flac', '.mp3', '.m4a', '.wav', '.aac', '.ogg', '.opus', '.mp4']);
            const audioFiles: Array<{ name: string; path: string; size: number; downloadUrl: string }> = [];

            for (const entry of entries) {
                if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (audioExtensions.has(ext)) {
                        const full = path.join(albumFolder, entry.name);
                        const stat = fs.statSync(full);
                        audioFiles.push({
                            name: entry.name,
                            path: full,
                            size: stat.size,
                            downloadUrl: `/api/theater/music/download?path=${encodeURIComponent(full)}&title=${encodeURIComponent(entry.name)}`
                        });
                    }
                }
            }

            return NextResponse.json({
                albumFolder,
                tracks: audioFiles,
                totalTracks: audioFiles.length
            });
        }

        // 3. Single Audio File Download - Local Filesystem
        if (filePath && fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                const baseFilename = path.basename(filePath);
                const downloadFilename = artist && customTitle 
                    ? `${artist.replace(/[/\\?%*:|"<>]/g, '')} - ${customTitle.replace(/[/\\?%*:|"<>]/g, '')}${path.extname(filePath)}`
                    : baseFilename;

                const mimeType = getMimeType(filePath);
                const nodeStream = fs.createReadStream(filePath);
                const webStream = Readable.toWeb(nodeStream);

                return new Response(webStream as any, {
                    status: 200,
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Length': stat.size.toString(),
                        'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFilename)}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
                        'Cache-Control': 'public, max-age=86400'
                    }
                });
            }
        }

        // 4. Plex Stream / Remote Stream Download
        if (streamUrlParam) {
            let targetStreamUrl = streamUrlParam;

            if (targetStreamUrl.includes('plexPart=')) {
                try {
                    const parsed = new URL(targetStreamUrl, req.url);
                    const plexPart = parsed.searchParams.get('plexPart');
                    const instanceId = parsed.searchParams.get('instanceId');

                    if (plexPart) {
                        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
                        const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

                        if (plex) {
                            const plexUrlBase = plex.url.replace(/\/$/, '');
                            const normalizedPart = plexPart.startsWith('/') ? plexPart : `/${plexPart}`;
                            const sep = normalizedPart.includes('?') ? '&' : '?';
                            targetStreamUrl = `${plexUrlBase}${normalizedPart}${sep}X-Plex-Token=${plex.api_key}`;
                        }
                    }
                } catch {}
            } else if (targetStreamUrl.startsWith('/')) {
                targetStreamUrl = new URL(targetStreamUrl, req.url).toString();
            }

            try {
                const remoteRes = await axios.get(targetStreamUrl, {
                    responseType: 'stream',
                    timeout: 20000,
                    validateStatus: () => true
                });

                if (remoteRes.status >= 200 && remoteRes.status < 300) {
                    const ext = extParam ? `.${extParam.toLowerCase().replace('.', '')}` : (path.extname(filePath || '') || '.mp3');
                    const cleanExt = (ext === '.stream' || ext === '.audio') ? '.mp3' : ext;
                    const downloadFilename = artist && customTitle 
                        ? `${artist.replace(/[/\\?%*:|"<>]/g, '')} - ${customTitle.replace(/[/\\?%*:|"<>]/g, '')}${cleanExt}`
                        : `${customTitle.replace(/[/\\?%*:|"<>]/g, '')}${cleanExt}`;

                    const mimeType = remoteRes.headers['content-type'] || getMimeType(cleanExt);
                    const webStream = Readable.toWeb(remoteRes.data);

                    const resHeaders = new Headers();
                    resHeaders.set('Content-Type', mimeType);
                    if (remoteRes.headers['content-length']) resHeaders.set('Content-Length', String(remoteRes.headers['content-length']));
                    resHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
                    resHeaders.set('Cache-Control', 'public, max-age=86400');

                    return new Response(webStream as any, {
                        status: 200,
                        headers: resHeaders
                    });
                }
            } catch (e: any) {
                console.error('Remote audio stream download proxy error:', e.message);
            }
        }

        // 5. YouTube Audio Download Redirect
        if (youtubeId) {
            const cleanYtId = youtubeId.replace(/^yt-/, '');
            const downloadFilename = artist && customTitle 
                ? `${artist.replace(/[/\\?%*:|"<>]/g, '')} - ${customTitle.replace(/[/\\?%*:|"<>]/g, '')}.mp3`
                : `${customTitle.replace(/[/\\?%*:|"<>]/g, '')}.mp3`;
            const streamUrl = `/api/theater/music/stream?ytId=${encodeURIComponent(cleanYtId)}&saveFormat=mp3&download=true&filename=${encodeURIComponent(downloadFilename)}`;
            return NextResponse.redirect(new URL(streamUrl, req.url));
        }

        return NextResponse.json({ error: 'Audio file not accessible on server or remote stream unavailable' }, { status: 404 });
    } catch (e: any) {
        console.error('Download route fatal error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ── POST: Download to Server Disk -> Return Instant Download URL ──
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            track,
            youtubeId,
            title,
            artist,
            album,
            saveFormat = 'mp3',
            path: localFilePath
        } = body;

        const effectiveTitle = (title || track?.title || track?.name || 'Track').replace(/[/\\?%*:|"<>]/g, '').trim();
        const effectiveArtist = (artist || track?.artist || 'Artist').replace(/[/\\?%*:|"<>]/g, '').trim();
        const outFormat = (saveFormat === 'original' ? (track?.extension || 'mp3') : saveFormat).toLowerCase().replace(/^\./, '');
        const filename = `${effectiveArtist} - ${effectiveTitle}.${outFormat}`;

        const token = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const tempDir = path.join(os.tmpdir(), 'schedulearr_downloads');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const targetFile = path.join(tempDir, `${token}.${outFormat}`);

        // 1. If it's a local file on server disk
        const filePath = localFilePath || track?.path;
        if (filePath && fs.existsSync(filePath)) {
            if (outFormat === path.extname(filePath).replace(/^\./, '').toLowerCase()) {
                fs.copyFileSync(filePath, targetFile);
            } else {
                const cmd = `"${ffmpegPath}" -y -i "${filePath}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} "${targetFile}"`;
                await execPromise(cmd, { timeout: 60000 });
            }

            if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 1024) {
                return NextResponse.json({
                    success: true,
                    token,
                    filename,
                    size: fs.statSync(targetFile).size,
                    downloadUrl: `/api/theater/music/download?token=${token}&filename=${encodeURIComponent(filename)}`
                });
            }
        }

        // 2. If it's a YouTube / Online Track
        let cleanYtId = (youtubeId || track?.youtubeId || '').replace(/^yt-/, '');
        if (!cleanYtId && (track?.id?.startsWith('yt-') || track?.id?.startsWith('online-'))) {
            cleanYtId = track.id.replace(/^(yt-|online-)/, '');
        }

        const query = cleanYtId ? `https://www.youtube.com/watch?v=${cleanYtId}` : `ytsearch1:${effectiveArtist} ${effectiveTitle} audio`;

        const ytDlpBin = await ensureYtDlpBinary();
        let downloaded = false;

        // Try yt-dlp first
        try {
            let cmd = '';
            if (outFormat === 'mp3' || outFormat === 'flac' || outFormat === 'wav') {
                cmd = `"${ytDlpBin}" -f "ba/b" --no-playlist --no-check-certificates --no-warnings --extractor-args "youtube:player_client=ios,android,web,mweb" --extract-audio --audio-format ${outFormat} ${outFormat === 'mp3' ? '--audio-quality 320k' : ''} --ffmpeg-location "${ffmpegPath}" --force-overwrites -o "${targetFile}" "${query}"`;
            } else {
                cmd = `"${ytDlpBin}" -f "ba/b" --no-playlist --no-check-certificates --no-warnings --extractor-args "youtube:player_client=ios,android,web,mweb" --ffmpeg-location "${ffmpegPath}" --force-overwrites -o "${targetFile}" "${query}"`;
            }
            console.log(`[DOWNLOAD TO SERVER] Executing yt-dlp: ${cmd}`);
            await execPromise(cmd, { timeout: 120000 });
            if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 1024) {
                downloaded = true;
            }
        } catch (err: any) {
            console.warn('[DOWNLOAD TO SERVER] yt-dlp failed, trying fallback API:', err.message);
        }

        // Fallback: Direct stream extraction via Invidious / Piped + ffmpeg
        if (!downloaded && cleanYtId) {
            try {
                const directAudioUrl = await extractDirectAudioUrl(cleanYtId);
                if (directAudioUrl) {
                    const ffmpegCmd = `"${ffmpegPath}" -y -i "${directAudioUrl}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} -f ${outFormat} "${targetFile}"`;
                    console.log(`[DOWNLOAD TO SERVER] Executing direct stream ffmpeg: ${ffmpegCmd}`);
                    await execPromise(ffmpegCmd, { timeout: 60000 });
                    if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 1024) {
                        downloaded = true;
                    }
                }
            } catch (fallbackErr: any) {
                console.error('[DOWNLOAD TO SERVER] Direct stream fallback error:', fallbackErr.message);
            }
        }

        if (downloaded && fs.existsSync(targetFile)) {
            const stat = fs.statSync(targetFile);
            return NextResponse.json({
                success: true,
                token,
                filename,
                size: stat.size,
                downloadUrl: `/api/theater/music/download?token=${token}&filename=${encodeURIComponent(filename)}`
            });
        }

        return NextResponse.json({ error: 'Failed to download audio file to server.' }, { status: 502 });
    } catch (e: any) {
        console.error('[DOWNLOAD TO SERVER] Fatal Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


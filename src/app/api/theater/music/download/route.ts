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
import { downloadAudioFile, extractDirectAudioStreamUrl } from '@/lib/musicDownloader';

const execPromise = util.promisify(exec);
const ffmpegPath: string = ffmpegStatic || 'ffmpeg';

export const dynamic = 'force-dynamic';

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
            const ext = path.extname(fullPath);
            const mimeType = getMimeType(ext);
            const downloadFilename = filenameParam || matchedFile;
            const asciiFilename = downloadFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const encodedFilename = encodeURIComponent(downloadFilename);

            const fileBuffer = fs.readFileSync(fullPath);
            const totalSize = fileBuffer.length;
            const rangeHeader = req.headers.get('range');

            // Clean up old downloads after 30 minutes in the background
            setTimeout(() => {
                try {
                    const now = Date.now();
                    const allFiles = fs.readdirSync(tempDir);
                    for (const f of allFiles) {
                        const fp = path.join(tempDir, f);
                        const fstat = fs.statSync(fp);
                        if (now - fstat.mtimeMs > 30 * 60 * 1000) {
                            fs.unlinkSync(fp);
                        }
                    }
                } catch {}
            }, 5000);

            if (rangeHeader) {
                const parts = rangeHeader.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10) || 0;
                const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
                const chunk = fileBuffer.subarray(start, end + 1);

                return new Response(chunk, {
                    status: 206,
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Length': chunk.length.toString(),
                        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
                        'Cache-Control': 'public, max-age=86400, immutable'
                    }
                });
            }

            return new Response(fileBuffer, {
                status: 200,
                headers: {
                    'Content-Type': mimeType,
                    'Content-Length': totalSize.toString(),
                    'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=86400, immutable'
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

export async function HEAD(req: NextRequest) {
    return GET(req);
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
            path: localFilePath,
            streamUrl: customStreamUrl,
            plexPart,
            instanceId
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

        // 1. Resolve Local File on Server Disk
        const candidatePaths = [
            localFilePath,
            track?.path,
            localFilePath ? decodeURIComponent(localFilePath) : null,
            track?.path ? decodeURIComponent(track.path) : null
        ].filter(Boolean) as string[];

        let resolvedLocalPath: string | null = null;
        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                resolvedLocalPath = p;
                break;
            }
            const relPath = path.resolve(process.cwd(), p);
            if (fs.existsSync(relPath)) {
                resolvedLocalPath = relPath;
                break;
            }
        }

        if (resolvedLocalPath) {
            const srcExt = path.extname(resolvedLocalPath).replace(/^\./, '').toLowerCase();
            if (outFormat === srcExt || saveFormat === 'original') {
                fs.copyFileSync(resolvedLocalPath, targetFile);
            } else {
                const cmd = `"${ffmpegPath}" -y -i "${resolvedLocalPath}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} "${targetFile}"`;
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

        // 2. Resolve Remote / Plex Stream URL
        const streamUrlCandidate = customStreamUrl || track?.streamUrl;
        if (streamUrlCandidate || plexPart) {
            let targetStreamUrl = streamUrlCandidate || '';

            if (plexPart || targetStreamUrl.includes('plexPart=')) {
                try {
                    const effectivePart = plexPart || new URL(targetStreamUrl, req.url).searchParams.get('plexPart');
                    const effectiveInst = instanceId || new URL(targetStreamUrl, req.url).searchParams.get('instanceId');

                    const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
                    const plex = effectiveInst ? plexInstances.find(i => i.id === effectiveInst) : plexInstances[0];

                    if (plex && effectivePart) {
                        const plexUrlBase = plex.url.replace(/\/$/, '');
                        const normalizedPart = effectivePart.startsWith('/') ? effectivePart : `/${effectivePart}`;
                        const sep = normalizedPart.includes('?') ? '&' : '?';
                        targetStreamUrl = `${plexUrlBase}${normalizedPart}${sep}X-Plex-Token=${plex.api_key}`;
                    }
                } catch {}
            } else if (targetStreamUrl.startsWith('/')) {
                targetStreamUrl = new URL(targetStreamUrl, req.url).toString();
            }

            const isPreviewUrl = targetStreamUrl.includes('preview') || targetStreamUrl.includes('dzcdn.net') || targetStreamUrl.includes('mzstatic.com');
            if (targetStreamUrl.startsWith('http') && !isPreviewUrl) {
                try {
                    console.log(`[DOWNLOAD TO SERVER] Fetching remote audio stream: ${targetStreamUrl}`);
                    const remoteRes = await axios.get(targetStreamUrl, {
                        responseType: 'arraybuffer',
                        timeout: 30000
                    });

                    if (remoteRes.status === 200 && remoteRes.data && remoteRes.data.length > 1024) {
                        const tempRawPath = path.join(tempDir, `raw_${token}`);
                        fs.writeFileSync(tempRawPath, Buffer.from(remoteRes.data));

                        if (outFormat === 'mp3' || saveFormat === 'original') {
                            // If raw file or convert needed
                            try {
                                const cmd = `"${ffmpegPath}" -y -i "${tempRawPath}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} "${targetFile}"`;
                                await execPromise(cmd, { timeout: 60000 });
                            } catch {
                                fs.copyFileSync(tempRawPath, targetFile);
                            }
                        } else {
                            const cmd = `"${ffmpegPath}" -y -i "${tempRawPath}" -vn "${targetFile}"`;
                            await execPromise(cmd, { timeout: 60000 });
                        }

                        try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch {}

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
                } catch (remoteErr: any) {
                    console.warn('[DOWNLOAD TO SERVER] Remote stream download error:', remoteErr.message);
                }
            }
        }

        // 3. Resolve YouTube / Online Track
        let cleanYtId = (youtubeId || track?.youtubeId || '').replace(/^yt-/, '');
        if (!cleanYtId && (track?.id?.startsWith('yt-') || track?.id?.startsWith('online-'))) {
            cleanYtId = track.id.replace(/^(yt-|online-)/, '');
        }

        const dlResult = await downloadAudioFile({
            targetUrl: cleanYtId ? `https://www.youtube.com/watch?v=${cleanYtId}` : undefined,
            youtubeId: cleanYtId || undefined,
            query: `${effectiveArtist} ${effectiveTitle}`,
            outputPath: targetFile,
            format: outFormat as any,
            title: effectiveTitle,
            artist: effectiveArtist,
            album: album || track?.album,
            coverUrl: track?.posterUrl
        });

        if (dlResult.success && fs.existsSync(targetFile)) {
            const stat = fs.statSync(targetFile);
            return NextResponse.json({
                success: true,
                token,
                filename,
                size: stat.size,
                downloadUrl: `/api/theater/music/download?token=${token}&filename=${encodeURIComponent(filename)}`
            });
        }

        return NextResponse.json({ error: dlResult.error || 'Failed to process audio file for download.' }, { status: 502 });
    } catch (e: any) {
        console.error('[DOWNLOAD TO SERVER] Fatal Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Readable } from 'stream';
import { getInstances } from '@/lib/db';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

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

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const filePath = searchParams.get('path');
        const albumFolder = searchParams.get('albumFolder');
        const customTitle = searchParams.get('title') || 'track';
        const artist = searchParams.get('artist') || '';
        const streamUrlParam = searchParams.get('streamUrl') || '';
        const youtubeId = searchParams.get('youtubeId') || '';
        const extParam = searchParams.get('ext') || '';

        // 1. Album Files Listing
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

        // 2. Single Audio File Download - Local Filesystem
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

        // 3. Plex Stream / Remote Stream Download
        if (streamUrlParam) {
            let targetStreamUrl = streamUrlParam;

            // If it's a relative Plex stream URL like /api/theater/stream?plexPart=...
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

        // 4. YouTube Audio Download via stream pipe
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


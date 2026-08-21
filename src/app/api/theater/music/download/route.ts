import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.flac': return 'audio/flac';
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        case '.opus': return 'audio/opus';
        default: return 'application/octet-stream';
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const filePath = searchParams.get('path');
        const albumFolder = searchParams.get('albumFolder');
        const customTitle = searchParams.get('title') || 'track';
        const artist = searchParams.get('artist') || '';
        const listOnly = searchParams.get('list') === 'true';

        // 1. Album Files Listing
        if (albumFolder) {
            if (!fs.existsSync(albumFolder)) {
                return NextResponse.json({ error: 'Album folder not found on server disk' }, { status: 404 });
            }

            const entries = fs.readdirSync(albumFolder, { withFileTypes: true });
            const audioExtensions = new Set(['.flac', '.mp3', '.m4a', '.wav', '.aac', '.ogg', '.opus']);
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

        // 2. Single Audio File Download
        if (!filePath) {
            return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
        }

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'Audio file not found on disk' }, { status: 404 });
        }

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            return NextResponse.json({ error: 'Specified path is not a file' }, { status: 400 });
        }

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
    } catch (e: any) {
        console.error('Download error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.mp4': return 'video/mp4';
        case '.mkv': return 'video/x-matroska';
        case '.webm': return 'video/webm';
        case '.avi': return 'video/x-msvideo';
        case '.mov': return 'video/quicktime';
        case '.m4v': return 'video/x-m4v';
        case '.mp3': return 'audio/mpeg';
        case '.flac': return 'audio/flac';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        case '.opus': return 'audio/opus';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        case '.bmp': return 'image/bmp';
        case '.svg': return 'image/svg+xml';
        default: return 'application/octet-stream';
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const filePath = searchParams.get('path');
        const plexPart = searchParams.get('plexPart');
        const instanceId = searchParams.get('instanceId');

        // 1. Plex Direct Stream Proxy
        if (plexPart) {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

            if (!plex) {
                return new NextResponse('Plex instance not found', { status: 404 });
            }

            const plexUrl = `${plex.url.replace(/\/$/, '')}${plexPart}`;
            const reqHeaders: Record<string, string> = {
                'X-Plex-Token': plex.api_key
            };

            const clientRange = req.headers.get('range');
            if (clientRange) {
                reqHeaders['Range'] = clientRange;
            }

            const plexRes = await axios.get(plexUrl, {
                headers: reqHeaders,
                responseType: 'stream',
                validateStatus: () => true
            });

            const resHeaders = new Headers();
            if (plexRes.headers['content-range']) resHeaders.set('Content-Range', String(plexRes.headers['content-range']));
            if (plexRes.headers['content-length']) resHeaders.set('Content-Length', String(plexRes.headers['content-length']));
            if (plexRes.headers['content-type']) resHeaders.set('Content-Type', String(plexRes.headers['content-type']));
            if (plexRes.headers['accept-ranges']) resHeaders.set('Accept-Ranges', String(plexRes.headers['accept-ranges']));

            // @ts-ignore
            return new Response(plexRes.data as any, {
                status: plexRes.status,
                headers: resHeaders
            });
        }

        // 2. Local File System Stream
        if (!filePath || !fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const mimeType = getMimeType(filePath);
        const range = req.headers.get('range');

        // Handle HTTP Range request for video & audio seeking
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize || end >= fileSize) {
                return new NextResponse('Requested range not satisfiable', {
                    status: 416,
                    headers: { 'Content-Range': `bytes */${fileSize}` }
                });
            }

            const chunksize = (end - start) + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });

            // @ts-ignore
            return new Response(fileStream as any, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': String(chunksize),
                    'Content-Type': mimeType,
                    'Cache-Control': 'no-cache'
                }
            });
        } else {
            const fileStream = fs.createReadStream(filePath);
            // @ts-ignore
            return new Response(fileStream as any, {
                status: 200,
                headers: {
                    'Content-Length': String(fileSize),
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        }
    } catch (error: any) {
        console.error('API /theater/stream error:', error);
        return new NextResponse(`Streaming error: ${error.message}`, { status: 500 });
    }
}

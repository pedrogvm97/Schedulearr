import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getAudiobookArtDir, getAudiobookEnhancedDir } from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const file = searchParams.get('file');
        const audio = searchParams.get('audio');

        if (file) {
            const safeName = path.basename(file);
            const fullPath = path.join(getAudiobookArtDir(), safeName);
            if (!fs.existsSync(fullPath)) {
                return new NextResponse('Artwork not found', { status: 404 });
            }
            const buf = fs.readFileSync(fullPath);
            const ext = path.extname(safeName).toLowerCase();
            const contentType = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
            return new NextResponse(buf, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        if (audio) {
            const safeName = path.basename(audio);
            const fullPath = path.join(getAudiobookEnhancedDir(), safeName);
            if (!fs.existsSync(fullPath)) {
                return new NextResponse('Enhanced audio not found', { status: 404 });
            }
            const stat = fs.statSync(fullPath);
            const range = request.headers.get('range');
            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                const chunkSize = end - start + 1;
                const stream = fs.createReadStream(fullPath, { start, end });
                return new NextResponse(stream as any, {
                    status: 206,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': String(chunkSize),
                        'Content-Type': 'audio/mp4'
                    }
                });
            }
            const stream = fs.createReadStream(fullPath);
            return new NextResponse(stream as any, {
                headers: {
                    'Content-Length': String(stat.size),
                    'Accept-Ranges': 'bytes',
                    'Content-Type': 'audio/mp4'
                }
            });
        }

        return new NextResponse('Missing file or audio param', { status: 400 });
    } catch (e: any) {
        return new NextResponse(e.message || 'Server error', { status: 500 });
    }
}

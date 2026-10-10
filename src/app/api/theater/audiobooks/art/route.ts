import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import {
    getAudiobookArtDir,
    getAudiobookEnhancedDir,
    getAudiobookTranscriptsDir,
    isValidImageBuffer
} from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const file = searchParams.get('file');
        const audio = searchParams.get('audio');
        const transcript = searchParams.get('transcript');

        if (file) {
            const safeName = path.basename(file);
            const ext = path.extname(safeName).toLowerCase();
            if (ext === '.svg') {
                const svgPath = path.join(getAudiobookArtDir(), safeName);
                try {
                    if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
                } catch {}
                return new NextResponse('SVG placeholder rejected', { status: 404 });
            }

            const fullPath = path.join(getAudiobookArtDir(), safeName);
            if (!fs.existsSync(fullPath)) {
                return new NextResponse('Illustration file not found', { status: 404 });
            }
            const buf = fs.readFileSync(fullPath);
            if (!isValidImageBuffer(buf)) {
                try { fs.unlinkSync(fullPath); } catch {}
                return new NextResponse('Invalid raster image file', { status: 404 });
            }

            const contentType = ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                ? 'image/webp'
                : ext === '.gif'
                ? 'image/gif'
                : 'image/jpeg';
            return new NextResponse(buf as any, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        if (transcript) {
            const safeName = path.basename(transcript);
            const fullPath = path.join(getAudiobookTranscriptsDir(), safeName);
            if (!fs.existsSync(fullPath)) {
                return new NextResponse('Transcript file not found on server', { status: 404 });
            }
            const text = fs.readFileSync(fullPath, 'utf8');
            return new NextResponse(text, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache',
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
            const ext = path.extname(safeName).toLowerCase();
            const contentType = ext === '.mp3' ? 'audio/mpeg' : 'audio/mp4';
            const range = request.headers.get('range');
            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                if (start >= stat.size || end >= stat.size) {
                    return new NextResponse('Requested range not satisfiable', {
                        status: 416,
                        headers: { 'Content-Range': `bytes */${stat.size}` }
                    });
                }
                const chunkSize = end - start + 1;
                const stream = fs.createReadStream(fullPath, { start, end });
                const webStream = Readable.toWeb(stream);
                return new Response(webStream as any, {
                    status: 206,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': String(chunkSize),
                        'Content-Type': contentType,
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            const stream = fs.createReadStream(fullPath);
            const webStream = Readable.toWeb(stream);
            return new Response(webStream as any, {
                headers: {
                    'Content-Length': String(stat.size),
                    'Accept-Ranges': 'bytes',
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        return new NextResponse('Missing file, transcript, or audio param', { status: 400 });
    } catch (e: any) {
        return new NextResponse(e.message || 'Server error', { status: 500 });
    }
}

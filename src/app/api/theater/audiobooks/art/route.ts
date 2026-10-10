import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
    getAudiobookArtDir,
    getAudiobookEnhancedDir,
    getAudiobookTranscriptsDir,
    isValidImageBuffer,
    createAtmosphericSvgBookplate
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
            const fullPath = path.join(getAudiobookArtDir(), safeName);
            if (!fs.existsSync(fullPath)) {
                const fallbackBuf = createAtmosphericSvgBookplate(
                    fullPath,
                    'Audiobook Studio',
                    '',
                    'Scene Illustration',
                    1,
                    'Cinematic Concept Art',
                    1280,
                    720
                );
                return new NextResponse(fallbackBuf as any, {
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            const buf = fs.readFileSync(fullPath);
            if (!isValidImageBuffer(buf)) {
                // Auto-repair previously saved HTML/corrupted image files on the server
                const repairedSvg = createAtmosphericSvgBookplate(
                    fullPath,
                    'Audiobook Studio',
                    '',
                    'Restored Scene Bookplate',
                    1,
                    'Atmospheric Edition',
                    1280,
                    720
                );
                return new NextResponse(repairedSvg as any, {
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            const ext = path.extname(safeName).toLowerCase();
            const headStr = buf.slice(0, 120).toString('utf8').trim().toLowerCase();
            const isSvg = ext === '.svg' || headStr.startsWith('<svg') || headStr.includes('<svg');
            const contentType = isSvg
                ? 'image/svg+xml'
                : ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                ? 'image/webp'
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

        return new NextResponse('Missing file, transcript, or audio param', { status: 400 });
    } catch (e: any) {
        return new NextResponse(e.message || 'Server error', { status: 500 });
    }
}


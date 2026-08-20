import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const filePath = searchParams.get('path');
        const plexPart = searchParams.get('plexPart');
        const instanceId = searchParams.get('instanceId');

        // 1. Plex Universal Transcode Proxy
        if (plexPart) {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

            if (!plex) {
                return new NextResponse('Plex instance not found', { status: 404 });
            }

            const plexUrlBase = plex.url.replace(/\/$/, '');
            // Universal Transcoder endpoint with auto-transcoding of audio to AAC and video to H.264
            const transcodeUrl = `${plexUrlBase}/video/:/transcode/universal/start.mp4?path=${encodeURIComponent(plexPart)}&mediaIndex=0&partIndex=0&protocol=http&directPlay=1&directStream=1&directStreamAudio=1&fastSeek=1&copyts=1&X-Plex-Token=${plex.api_key}`;

            const resHeaders = new Headers();
            resHeaders.set('Content-Type', 'video/mp4');
            resHeaders.set('Accept-Ranges', 'bytes');

            const clientRange = req.headers.get('range');
            const reqHeaders: Record<string, string> = {
                'X-Plex-Token': plex.api_key
            };
            if (clientRange) reqHeaders['Range'] = clientRange;

            const streamRes = await axios.get(transcodeUrl, {
                headers: reqHeaders,
                responseType: 'stream',
                validateStatus: () => true
            });

            if (streamRes.headers['content-range']) resHeaders.set('Content-Range', String(streamRes.headers['content-range']));
            if (streamRes.headers['content-length']) resHeaders.set('Content-Length', String(streamRes.headers['content-length']));

            // @ts-ignore
            return new Response(streamRes.data as any, {
                status: streamRes.status,
                headers: resHeaders
            });
        }

        // 2. Local File Streaming with Universal Headers
        if (filePath && fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.get('range');

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const fileStream = fs.createReadStream(filePath, { start, end });

                // @ts-ignore
                return new Response(fileStream as any, {
                    status: 206,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': String(chunksize),
                        'Content-Type': 'video/mp4',
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
                        'Content-Type': 'video/mp4',
                        'Accept-Ranges': 'bytes'
                    }
                });
            }
        }

        return new NextResponse('File or stream not found', { status: 404 });
    } catch (error: any) {
        console.error('API /theater/transcode error:', error);
        return new NextResponse(`Transcoding error: ${error.message}`, { status: 500 });
    }
}

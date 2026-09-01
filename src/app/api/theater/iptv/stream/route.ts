import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import axios from 'axios';
import { getFFmpegPath } from '@/lib/transcoder';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const streamUrl = searchParams.get('url');

        if (!streamUrl || (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://'))) {
            return new NextResponse('Invalid stream URL', { status: 400 });
        }

        const isDirectHls = streamUrl.toLowerCase().includes('.m3u8');
        const ffmpegBin = getFFmpegPath();

        // 1. If requesting an HLS Playlist (.m3u8), proxy & rewrite segment URLs to avoid Mixed Content & CORS
        if (isDirectHls) {
            try {
                const hlsRes = await axios.get(streamUrl, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.42' },
                    responseType: 'text',
                    validateStatus: () => true
                });

                if (typeof hlsRes.data === 'string' && hlsRes.data.includes('#EXTM3U')) {
                    const baseUrl = new URL(streamUrl);
                    const lines = hlsRes.data.split('\n');
                    const rewritten = lines.map(line => {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith('#')) return line;
                        let fullSegUrl = trimmed;
                        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                            fullSegUrl = new URL(trimmed, baseUrl.href).href;
                        }
                        return `/api/theater/iptv/stream?url=${encodeURIComponent(fullSegUrl)}`;
                    }).join('\n');

                    return new Response(rewritten, {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/vnd.apple.mpegurl',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-cache'
                        }
                    });
                }
            } catch (hlsErr) {
                // If direct HLS fetch failed, fall through to FFmpeg transmuxer
            }
        }

        // 2. High-Performance Universal Live Transmuxer (0% CPU - Video Copy to Fragmented MP4)
        // Solves Mixed Content, CORS, and raw MPEG-TS playback natively in all browsers
        try {
            const ffmpegArgs = [
                '-hide_banner',
                '-loglevel', 'error',
                '-reconnect', '1',
                '-reconnect_at_eof', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5',
                '-headers', 'User-Agent: VLC/3.0.18 LibVLC/3.0.18\r\n',
                '-i', streamUrl,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-f', 'mp4',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                'pipe:1'
            ];

            const ffmpeg = spawn(ffmpegBin, ffmpegArgs);

            const webStream = new ReadableStream({
                start(controller) {
                    ffmpeg.stdout.on('data', (chunk) => {
                        try { controller.enqueue(chunk); } catch {}
                    });
                    ffmpeg.stdout.on('end', () => {
                        try { controller.close(); } catch {}
                    });
                    ffmpeg.stdout.on('error', (err) => {
                        try { controller.error(err); } catch {}
                    });
                },
                cancel() {
                    try { ffmpeg.kill('SIGKILL'); } catch {}
                }
            });

            req.signal.addEventListener('abort', () => {
                try { ffmpeg.kill('SIGKILL'); } catch {}
            });

            return new Response(webStream as any, {
                status: 200,
                headers: {
                    'Content-Type': 'video/mp4',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Range',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
        } catch (spawnErr) {
            // 3. Fallback: Direct Pipe Proxy with CORS headers
            const pipeRes = await axios.get(streamUrl, {
                responseType: 'stream',
                timeout: 15000,
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' }
            });

            return new Response(pipeRes.data as any, {
                status: 200,
                headers: {
                    'Content-Type': pipeRes.headers['content-type'] || 'video/mp2t',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                }
            });
        }
    } catch (e: any) {
        console.error('[IPTV STREAM PROXY] Error:', e.message);
        return new NextResponse(`Stream error: ${e.message}`, { status: 502 });
    }
}

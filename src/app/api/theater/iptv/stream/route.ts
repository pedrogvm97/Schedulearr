import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { createSharedRemuxWebStream } from '@/lib/iptvStreamHub';
import { logSystemEvent } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const streamUrl = searchParams.get('url');
        const channelName = searchParams.get('channel') || 'Live TV';
        const isDownload = searchParams.get('download') === '1' || searchParams.get('download') === 'true';
        const formatParam = (searchParams.get('format') || 'mp4').toLowerCase();
        const format: 'mp4' | 'mp3' = formatParam === 'mp3' ? 'mp3' : 'mp4';
        const rawFilename = searchParams.get('filename') || `${channelName}.${format}`;
        const safeFilename = rawFilename
            .replace(/\.ts$/i, `.${format}`)
            .replace(/[/\\?%*:|"<>]/g, '-')
            .trim();

        if (!streamUrl || (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://'))) {
            return new NextResponse('Invalid stream URL', { status: 400 });
        }

        const isDirectHls = streamUrl.toLowerCase().includes('.m3u8') && !isDownload;
        const maskedUrl = streamUrl.replace(/password=[^&]+/i, 'password=***');
        logSystemEvent(
            'IPTV-STREAM',
            `${isDownload ? `Recording/Downloading (${format.toUpperCase()}) to Local Device Downloads` : 'Streaming Live TV (Shared Hub MP4)'}: "${channelName}" -> ${maskedUrl}`
        );

        // 1. If requesting an HLS Playlist (.m3u8) for live viewing (not downloading), proxy & rewrite segment URLs
        if (isDirectHls) {
            try {
                const hlsRes = await axios.get(streamUrl, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' },
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
            } catch {
                // Fall through to shared upstream hub remuxer
            }
        }

        // 2. Shared Upstream Hub Remuxer (Fragmented MP4 or MP3 — shares 1 IPTV connection across player + recorder!)
        const webStream = createSharedRemuxWebStream(streamUrl, channelName, format, req.signal);
        const headers: Record<string, string> = {
            'Content-Type': format === 'mp3' ? 'audio/mpeg' : 'video/mp4',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Range',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
        };

        if (isDownload) {
            headers['Content-Disposition'] = `attachment; filename="${safeFilename}"`;
        }

        return new Response(webStream as any, {
            status: 200,
            headers
        });
    } catch (e: any) {
        console.error('[IPTV STREAM PROXY] Error:', e.message);
        return new NextResponse(`Stream error: ${e.message}`, { status: 502 });
    }
}

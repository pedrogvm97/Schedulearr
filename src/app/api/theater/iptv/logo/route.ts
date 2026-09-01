import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const logoUrl = searchParams.get('url');

        if (!logoUrl || (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://'))) {
            return new NextResponse('Invalid logo URL', { status: 400 });
        }

        const res = await axios.get(logoUrl, {
            responseType: 'arraybuffer',
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            validateStatus: () => true
        });

        if (res.status < 200 || res.status >= 300 || !res.data) {
            return new NextResponse('Failed to fetch remote logo', { status: res.status || 502 });
        }

        const contentType = res.headers['content-type'] || 'image/png';
        const buffer = Buffer.from(res.data);

        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': buffer.length.toString(),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Range',
                'Cache-Control': 'public, max-age=604800, immutable'
            }
        });
    } catch (e: any) {
        console.warn('[IPTV LOGO PROXY] Error:', e.message);
        return new NextResponse('Logo proxy error', { status: 500 });
    }
}

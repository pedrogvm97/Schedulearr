import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

// In-memory cache for fast subsequent loads
const logoCache = new Map<string, { buffer: Buffer; contentType: string; expiry: number }>();
// Track URLs that failed/timed out to prevent spamming dead upstream hosts
const failedUrls = new Map<string, number>();

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const logoUrl = searchParams.get('url');

        if (!logoUrl || (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://'))) {
            return new NextResponse('Invalid logo URL', { status: 400 });
        }

        const now = Date.now();

        // 1. Check in-memory cache (valid for 24 hours)
        const cached = logoCache.get(logoUrl);
        if (cached && cached.expiry > now) {
            return new Response(cached.buffer, {
                status: 200,
                headers: {
                    'Content-Type': cached.contentType,
                    'Content-Length': cached.buffer.length.toString(),
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=604800, immutable'
                }
            });
        }

        // 2. Check failed URLs cooldown (10 minutes)
        const failedExpiry = failedUrls.get(logoUrl);
        if (failedExpiry && failedExpiry > now) {
            return new NextResponse('Logo temporarily unavailable', { status: 404 });
        }

        // 3. Fetch from remote with fast 3500ms timeout
        const res = await axios.get(logoUrl, {
            responseType: 'arraybuffer',
            timeout: 3500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            validateStatus: () => true
        });

        if (res.status < 200 || res.status >= 300 || !res.data) {
            failedUrls.set(logoUrl, now + 10 * 60 * 1000);
            return new NextResponse('Failed to fetch remote logo', { status: 404 });
        }

        const contentType = res.headers['content-type'] || 'image/png';
        const buffer = Buffer.from(res.data);

        // Store in cache (limit cache size to 500 items to conserve memory)
        if (logoCache.size > 500) {
            const firstKey = logoCache.keys().next().value;
            if (firstKey) logoCache.delete(firstKey);
        }
        logoCache.set(logoUrl, { buffer, contentType, expiry: now + 24 * 60 * 60 * 1000 });

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
    } catch {
        const { searchParams } = new URL(req.url);
        const logoUrl = searchParams.get('url');
        if (logoUrl) {
            failedUrls.set(logoUrl, Date.now() + 10 * 60 * 1000);
        }
        return new NextResponse('Logo unavailable', { status: 404 });
    }
}

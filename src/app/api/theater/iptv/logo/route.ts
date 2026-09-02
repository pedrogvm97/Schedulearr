import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

// 1x1 transparent PNG buffer
const TRANSPARENT_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
);

// In-memory cache for fast subsequent loads
const logoCache = new Map<string, { buffer: Buffer; contentType: string; expiry: number }>();
// Track URLs that failed/timed out
const failedUrls = new Map<string, number>();

function stringToHslColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 65%, 28%)`;
}

function generateSvgBadge(name: string): Response {
    const clean = (name || 'TV').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    let label = words.slice(0, 2).map(w => w.length > 3 ? w.slice(0, 3) : w).join(' ').toUpperCase();
    if (!label) label = 'TV';
    if (label.length > 5) label = label.slice(0, 5);

    const bg = stringToHslColor(name || 'tv');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${bg}" stop-opacity="1"/>
                <stop offset="100%" stop-color="#09090b" stop-opacity="1"/>
            </linearGradient>
        </defs>
        <rect width="128" height="128" rx="32" fill="url(#g)" stroke="#27272a" stroke-width="3"/>
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="${label.length > 3 ? 24 : 32}" letter-spacing="0.5px">${label}</text>
    </svg>`;

    return new Response(svg, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=604800, immutable'
        }
    });
}

function returnFallback(name?: string) {
    if (name) {
        return generateSvgBadge(name);
    }
    return new Response(TRANSPARENT_PNG, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Content-Length': TRANSPARENT_PNG.length.toString(),
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400, immutable'
        }
    });
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        let logoUrl = searchParams.get('url');
        const channelName = searchParams.get('name') || searchParams.get('channel') || '';

        if (!logoUrl) {
            return returnFallback(channelName);
        }

        // Unwrap if accidentally passed a nested proxy URL (e.g. /api/theater/iptv/logo?url=https...)
        while (logoUrl.includes('/api/theater/iptv/logo?url=')) {
            const parts = logoUrl.split('/api/theater/iptv/logo?url=');
            logoUrl = decodeURIComponent(parts[parts.length - 1]);
        }

        if (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) {
            return returnFallback(channelName);
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

        // 2. Check failed URLs cooldown (5 minutes)
        const failedExpiry = failedUrls.get(logoUrl);
        if (failedExpiry && failedExpiry > now) {
            return returnFallback(channelName);
        }

        // 3. Fetch from remote with IPTV/VLC headers & fallback to browser header
        let res: any = null;
        try {
            res = await axios.get(logoUrl, {
                responseType: 'arraybuffer',
                timeout: 5000,
                headers: {
                    'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.54',
                    'Accept': '*/*'
                },
                validateStatus: () => true
            });
        } catch {
            res = null;
        }

        if (!res || res.status < 200 || res.status >= 300 || !res.data) {
            // Retry once with standard browser UA
            try {
                res = await axios.get(logoUrl, {
                    responseType: 'arraybuffer',
                    timeout: 4000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                    },
                    validateStatus: () => true
                });
            } catch {
                res = null;
            }
        }

        if (!res || res.status < 200 || res.status >= 300 || !res.data) {
            failedUrls.set(logoUrl, now + 5 * 60 * 1000);
            return returnFallback(channelName);
        }

        const contentType = res.headers['content-type'] || 'image/png';
        const buffer = Buffer.from(res.data);

        // Store in cache (limit cache size to 600 items to conserve memory)
        if (logoCache.size > 600) {
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
        return returnFallback();
    }
}

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        
        const contentType = response.headers['content-type'] || 'image/jpeg';

        return new NextResponse(response.data, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error: any) {
        console.error('Proxy error for URL', url, ':', error.message);
        const svgFallback = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
            <rect width="120" height="120" rx="16" fill="#18181b"/>
            <circle cx="60" cy="60" r="30" fill="#27272a"/>
            <path d="M55 46v20.5a5.5 5.5 0 1 1-3.5-5.1V51h17v15.5a5.5 5.5 0 1 1-3.5-5.1V46h-10z" fill="#f59e0b" fill-opacity="0.6"/>
        </svg>`;
        return new NextResponse(svgFallback, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    }
}

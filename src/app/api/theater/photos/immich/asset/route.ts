import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const size = searchParams.get('size') || 'preview'; // 'preview' | 'thumbnail' | 'original'
        const instanceId = searchParams.get('instanceId');

        if (!id) {
            return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
        }

        const instances = getInstances();
        const immich = instanceId
            ? instances.find(i => i.type === 'immich' && i.id === instanceId)
            : instances.find(i => i.type === 'immich' && i.enabled);

        if (!immich || !immich.api_key) {
            return NextResponse.json({ error: 'Immich instance not configured' }, { status: 404 });
        }

        const cleanUrl = immich.url.replace(/\/$/, '');
        let targetUrl = size === 'original'
            ? `${cleanUrl}/api/assets/${id}/original`
            : `${cleanUrl}/api/assets/${id}/thumbnail?size=${size === 'thumbnail' ? 'thumbnail' : 'preview'}`;

        const headers = { 'x-api-key': immich.api_key };

        let streamRes;
        try {
            streamRes = await axios.get(targetUrl, {
                headers,
                responseType: 'stream',
                timeout: 30000
            });
        } catch (err: any) {
            // Fallback to original if thumbnail returned 404
            if (err.response?.status === 404 && size !== 'original') {
                targetUrl = `${cleanUrl}/api/assets/${id}/original`;
                streamRes = await axios.get(targetUrl, {
                    headers,
                    responseType: 'stream',
                    timeout: 30000
                });
            } else {
                throw err;
            }
        }

        const contentType = streamRes.headers['content-type'] || 'image/jpeg';
        const responseHeaders: Record<string, string> = {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, immutable'
        };

        if (streamRes.headers['content-length']) {
            responseHeaders['Content-Length'] = String(streamRes.headers['content-length']);
        }

        return new NextResponse(streamRes.data as any, {
            status: 200,
            headers: responseHeaders
        });
    } catch (e: any) {
        const status = e.response?.status || 500;
        return NextResponse.json({ error: e.message || 'Failed to proxy Immich asset' }, { status });
    }
}

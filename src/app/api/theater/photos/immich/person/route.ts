import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const instanceId = searchParams.get('instanceId');

        if (!id) {
            return NextResponse.json({ error: 'Person ID is required' }, { status: 400 });
        }

        const instances = getInstances();
        const immich = instanceId
            ? instances.find(i => i.type === 'immich' && i.id === instanceId)
            : instances.find(i => i.type === 'immich' && i.enabled);

        if (!immich || !immich.api_key) {
            return NextResponse.json({ error: 'Immich instance not configured' }, { status: 404 });
        }

        const cleanUrl = immich.url.replace(/\/$/, '');
        const targetUrl = `${cleanUrl}/api/people/${id}/thumbnail`;

        const streamRes = await axios.get(targetUrl, {
            headers: { 'x-api-key': immich.api_key },
            responseType: 'stream',
            timeout: 15000
        });

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
        return NextResponse.json({ error: e.message || 'Failed to proxy person thumbnail' }, { status });
    }
}

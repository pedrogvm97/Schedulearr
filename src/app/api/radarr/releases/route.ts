export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const movieId = searchParams.get('movieId');
        const instanceId = searchParams.get('instanceId');

        if (!movieId || !instanceId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(inst => inst.id === instanceId);

        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        // Fetch live releases for the specific movie ID from Radarr
        const response = await axios.get(`${instance.url}/api/v3/release`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { movieId }
        });

        // Radarr returns an array of release objects. We sort them by custom format score, then generic score or age.
        let releases = Array.isArray(response.data) ? response.data : [];

        releases.sort((a: any, b: any) => {
            const scoreA = Number(a.customFormatScore || 0);
            const scoreB = Number(b.customFormatScore || 0);
            return scoreB - scoreA;
        });

        const top10 = releases.slice(0, 10).map((r: any) => ({
            guid: r.guid,
            title: r.title,
            size: r.size,
            protocol: r.protocol,
            customFormatScore: r.customFormatScore || 0,
            indexer: r.indexer,
            rejected: r.rejected,
            rejections: r.rejections,
            quality: r.quality?.quality?.name
        }));

        return NextResponse.json(top10);
    } catch (e) {
        console.error('Error in radarr release lookup:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { guid, indexerId, instanceId } = await req.json();

        if (!guid || !indexerId || !instanceId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(inst => inst.id === instanceId);
        if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });

        // Post back the specific release GUID to download it
        await axios.post(`${instance.url}/api/v3/release`, {
            guid,
            indexerId
        }, {
            headers: { 'X-Api-Key': instance.api_key }
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Error triggering radarr download:', e);
        return NextResponse.json({ error: 'Failed to trigger download' }, { status: 500 });
    }
}

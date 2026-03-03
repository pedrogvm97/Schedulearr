export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const episodeId = searchParams.get('episodeId');
        const instanceId = searchParams.get('instanceId');

        if (!episodeId || !instanceId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(inst => inst.id === instanceId);

        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        // Fetch live releases for the specific episode ID from Sonarr
        const response = await axios.get(`${instance.url}/api/v3/release`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { episodeId }
        });

        let releases = Array.isArray(response.data) ? response.data : [];

        // Sort by custom format score descending
        releases.sort((a: any, b: any) => {
            const scoreA = Number(a.customFormatScore || 0);
            const scoreB = Number(b.customFormatScore || 0);
            return scoreB - scoreA;
        });

        // Map and slice top 10
        const top10 = releases.slice(0, 10).map((r: any) => ({
            guid: r.guid,
            title: r.title,
            size: r.size,
            protocol: r.protocol,
            customFormatScore: r.customFormatScore || 0,
            indexer: r.indexer,
            indexerId: r.indexerId, // Added for robust grab
            rejected: r.rejected,
            rejections: r.rejections,
            quality: r.quality?.quality?.name
        }));

        return NextResponse.json(top10);
    } catch (e) {
        console.error('Error in sonarr release lookup:', e);
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

        await axios.post(`${instance.url}/api/v3/release`, {
            guid,
            indexerId
        }, {
            headers: { 'X-Api-Key': instance.api_key }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        let errorMessage = 'Failed to trigger download';

        // Expose Sonarr's exact reason for rejecting the grab 
        if (e.response && e.response.data && Array.isArray(e.response.data) && e.response.data.length > 0) {
            errorMessage = e.response.data[0].errorMessage || errorMessage;
        } else if (e.response?.data?.message) {
            errorMessage = e.response.data.message;
        }

        console.error('Error triggering sonarr download:', errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
}

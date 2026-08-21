import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');

        const lidarrInstances = getInstances().filter(i => i.type === 'lidarr' && i.enabled);
        const instance = instanceId ? lidarrInstances.find(i => i.id === instanceId) : lidarrInstances[0];

        if (!instance) {
            return NextResponse.json({ error: 'No enabled Lidarr instance found' }, { status: 404 });
        }

        const lidarrUrl = instance.url.replace(/\/$/, '');
        const res = await axios.get(`${lidarrUrl}/api/v1/rootfolder`, {
            headers: { 'X-Api-Key': instance.api_key },
            timeout: 5000
        });

        return NextResponse.json(res.data);
    } catch (error: any) {
        console.error('API /lidarr/rootfolder error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');

        const lidarrInstances = getInstances().filter(i => i.type === 'lidarr' && i.enabled);

        if (lidarrInstances.length === 0) {
            return NextResponse.json({ artists: [] });
        }

        const targetInstances = instanceId
            ? lidarrInstances.filter(i => i.id === instanceId)
            : lidarrInstances;

        const allArtists: any[] = [];

        for (const inst of targetInstances) {
            try {
                const lidarrUrl = inst.url.replace(/\/$/, '');
                const res = await axios.get(`${lidarrUrl}/api/v1/artist`, {
                    headers: { 'X-Api-Key': inst.api_key },
                    timeout: 8000
                });

                if (Array.isArray(res.data)) {
                    for (const a of res.data) {
                        allArtists.push({
                            ...a,
                            instanceId: inst.id,
                            instanceName: inst.name,
                            instanceColor: inst.color
                        });
                    }
                }
            } catch (e: any) {
                console.warn(`Failed to fetch artists from Lidarr ${inst.name}:`, e.message);
            }
        }

        return NextResponse.json({ artists: allArtists });
    } catch (error: any) {
        console.error('API /lidarr/all error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

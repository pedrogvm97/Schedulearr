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

        // Fetch Quality Profiles & Metadata Profiles
        const [qualityRes, metaRes] = await Promise.allSettled([
            axios.get(`${lidarrUrl}/api/v1/qualityprofile`, { headers: { 'X-Api-Key': instance.api_key }, timeout: 5000 }),
            axios.get(`${lidarrUrl}/api/v1/metadataprofile`, { headers: { 'X-Api-Key': instance.api_key }, timeout: 5000 })
        ]);

        const qualityProfiles = qualityRes.status === 'fulfilled' ? qualityRes.value.data : [];
        const metadataProfiles = metaRes.status === 'fulfilled' ? metaRes.value.data : [];

        return NextResponse.json({
            qualityProfiles,
            metadataProfiles,
            instanceId: instance.id,
            instanceName: instance.name
        });
    } catch (error: any) {
        console.error('API /lidarr/profiles error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

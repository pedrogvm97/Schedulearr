import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getQualityProfiles as getRadarrProfiles } from '@/lib/radarr';
import { getQualityProfiles as getSonarrProfiles } from '@/lib/sonarr';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');

        if (!instanceId) {
            return NextResponse.json({ error: 'Instance ID is required' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(i => i.id.toString() === instanceId);

        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        let profiles: any[] = [];
        if (instance.type === 'radarr') {
            profiles = await getRadarrProfiles(instance.url, instance.api_key);
        } else if (instance.type === 'sonarr') {
            profiles = await getSonarrProfiles(instance.url, instance.api_key);
        }

        return NextResponse.json(profiles);
    } catch (error) {
        console.error('API /instances/profiles error:', error);
        return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }
}

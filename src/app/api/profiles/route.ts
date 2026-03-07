import { NextResponse } from 'next/server';
import { getInstances, getInstanceById } from '@/lib/db';
import { getQualityProfiles as getRadarrProfiles } from '@/lib/radarr';
import { getQualityProfiles as getSonarrProfiles } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    try {
        if (instanceId) {
            // Fetch for a single instance
            const instance = getInstanceById(instanceId);
            if (!instance) {
                return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
            }

            let profiles = [];
            if (instance.type === 'radarr') {
                profiles = await getRadarrProfiles(instance.url, instance.api_key);
            } else if (instance.type === 'sonarr') {
                profiles = await getSonarrProfiles(instance.url, instance.api_key);
            }

            return NextResponse.json(profiles);
        } else {
            // Global fetch - grab all profiles from all active instances
            // Useful for the global Profiles management page
            const radarrInstances = getInstances('radarr', true);
            const sonarrInstances = getInstances('sonarr', true);

            const allProfiles = [];

            // Fetch Radarr
            for (const r of radarrInstances) {
                const profiles = await getRadarrProfiles(r.url, r.api_key);
                profiles.forEach((p: any) => {
                    allProfiles.push({
                        ...p,
                        instanceId: r.id,
                        instanceName: r.name,
                        instanceType: r.type
                    });
                });
            }

            // Fetch Sonarr
            for (const s of sonarrInstances) {
                const profiles = await getSonarrProfiles(s.url, s.api_key);
                profiles.forEach((p: any) => {
                    allProfiles.push({
                        ...p,
                        instanceId: s.id,
                        instanceName: s.name,
                        instanceType: s.type
                    });
                });
            }

            return NextResponse.json(allProfiles);
        }
    } catch (error) {
        console.error('API /profiles error:', error);
        return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }
}

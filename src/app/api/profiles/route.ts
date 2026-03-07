import { NextResponse } from 'next/server';
import { getInstances, getInstanceById } from '@/lib/db';
import {
    getQualityProfiles as getRadarrProfiles,
    createQualityProfile as createRadarrProfile,
    deleteQualityProfile as deleteRadarrProfile
} from '@/lib/radarr';
import {
    getQualityProfiles as getSonarrProfiles,
    createQualityProfile as createSonarrProfile,
    deleteQualityProfile as deleteSonarrProfile
} from '@/lib/sonarr';

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

            let profiles: any[] = [];
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

            const allProfiles: any[] = [];

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
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { instanceId, profile } = body;

        if (!instanceId || !profile) {
            return NextResponse.json({ error: 'Missing instanceId or profile data' }, { status: 400 });
        }

        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        let newProfile;
        if (instance.type === 'radarr') {
            newProfile = await createRadarrProfile(instance.url, instance.api_key, profile);
        } else if (instance.type === 'sonarr') {
            newProfile = await createSonarrProfile(instance.url, instance.api_key, profile);
        }

        return NextResponse.json(newProfile);
    } catch (error: any) {
        console.error('API /profiles POST error:', error);
        return NextResponse.json({ error: error.response?.data?.message || 'Failed to create profile' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');
    const profileId = searchParams.get('profileId');

    if (!instanceId || !profileId) {
        return NextResponse.json({ error: 'Missing instanceId or profileId' }, { status: 400 });
    }

    try {
        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        if (instance.type === 'radarr') {
            await deleteRadarrProfile(instance.url, instance.api_key, parseInt(profileId));
        } else if (instance.type === 'sonarr') {
            await deleteSonarrProfile(instance.url, instance.api_key, parseInt(profileId));
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('API /profiles DELETE error:', error);
        return NextResponse.json({ error: error.response?.data?.[0]?.errorMessage || 'Failed to delete profile' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getQualityProfiles as getRadarrProfiles } from '@/lib/radarr';
import { getQualityProfiles as getSonarrProfiles } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const radarrs = getInstances('radarr', true);
        const sonarrs = getInstances('sonarr', true);

        // Map shape: { [instanceUrl]: { [profileId]: profileName } }
        const profileMap: Record<string, Record<number, string>> = {};

        // Fetch Radarr Profiles
        for (const instance of radarrs) {
            const profiles = await getRadarrProfiles(instance.url, instance.api_key);
            profileMap[instance.url] = {};
            profiles.forEach(p => {
                profileMap[instance.url][p.id] = p.name;
            });
        }

        // Fetch Sonarr Profiles
        for (const instance of sonarrs) {
            const profiles = await getSonarrProfiles(instance.url, instance.api_key);
            profileMap[instance.url] = {};
            profiles.forEach(p => {
                profileMap[instance.url][p.id] = p.name;
            });
        }

        return NextResponse.json({ profiles: profileMap });
    } catch (error) {
        console.error("Failed to fetch quality profiles", error);
        return NextResponse.json({ error: 'Failed to fetch quality profiles' }, { status: 500 });
    }
}

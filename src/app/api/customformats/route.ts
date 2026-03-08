import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { getCustomFormats as getRadarrFormats } from '@/lib/radarr';
import { getCustomFormats as getSonarrFormats, getLanguageProfiles } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
        return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
    }

    try {
        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        let formats: any[] = [];
        let languageProfiles: any[] = [];

        if (instance.type === 'radarr') {
            formats = await getRadarrFormats(instance.url, instance.api_key);
        } else if (instance.type === 'sonarr') {
            [formats, languageProfiles] = await Promise.all([
                getSonarrFormats(instance.url, instance.api_key),
                getLanguageProfiles(instance.url, instance.api_key).catch(() => [])
            ]);
        }

        return NextResponse.json({ formats, languageProfiles });
    } catch (error) {
        console.error('API /customformats error:', error);
        return NextResponse.json({ error: 'Failed to fetch custom formats' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { addMovie } from '@/lib/radarr';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const { instanceId, item, qualityProfileId, rootFolderPath, startSearch } = payload;

        if (!instanceId || !item) {
            return NextResponse.json({ error: 'Missing instanceId or item' }, { status: 400 });
        }

        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        // Build the Radarr-compatible movie payload from the lookup item
        const moviePayload: any = {
            title: item.title,
            year: item.year,
            qualityProfileId: qualityProfileId,
            rootFolderPath: rootFolderPath,
            monitored: true,
            minimumAvailability: 'announced',
            addOptions: {
                searchForMovie: startSearch ?? true
            }
        };

        // Include TMDB ID (required by Radarr for lookup resolution)
        if (item.tmdbId) moviePayload.tmdbId = item.tmdbId;
        if (item.imdbId) moviePayload.imdbId = item.imdbId;

        // If the item came from Radarr lookup, it may already have the full object – pass it through as-is with overrides
        if (item.id === 0 || item.id === undefined) {
            // It's a lookup result, not yet in library — use our built payload
        } else {
            // It already has an ID — just update profile/folder
            moviePayload.id = item.id;
        }

        const result = await addMovie(instance.url, instance.api_key, moviePayload);
        if (result.success) {
            return NextResponse.json(result.data, { status: 201 });
        } else {
            const errMsg = typeof result.error === 'string'
                ? result.error
                : Array.isArray(result.error)
                    ? result.error.map((e: any) => e.errorMessage).join(', ')
                    : JSON.stringify(result.error);
            return NextResponse.json({ error: errMsg }, { status: 400 });
        }
    } catch (error) {
        console.error('API /radarr/add error:', error);
        return NextResponse.json({ error: 'Failed to add movie' }, { status: 500 });
    }
}

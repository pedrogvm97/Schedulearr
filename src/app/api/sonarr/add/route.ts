import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { addSeries, searchSeries } from '@/lib/sonarr';

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

        // If item came from TMDB discovery it may only have tmdbId (no tvdbId).
        // Sonarr needs a tvdbId, so resolve it via Sonarr's own search first.
        let resolvedItem = { ...item };
        if (!resolvedItem.tvdbId && resolvedItem.title) {
            try {
                const searchResults = await searchSeries(instance.url, instance.api_key, resolvedItem.title);
                // Find the best match: same tmdbId or same year + closest title
                const best = searchResults.find((s: any) => s.tmdbId === resolvedItem.tmdbId)
                    || searchResults.find((s: any) => s.year === resolvedItem.year)
                    || searchResults[0];
                if (best?.tvdbId) resolvedItem.tvdbId = best.tvdbId;
                if (best?.seasons && !resolvedItem.seasons) resolvedItem.seasons = best.seasons;
            } catch (e) {
                console.warn('[sonarr/add] Could not resolve tvdbId via search:', e);
            }
        }

        // Build the Sonarr-compatible series payload
        const seriesPayload: any = {
            title: resolvedItem.title,
            year: resolvedItem.year,
            qualityProfileId: qualityProfileId,
            rootFolderPath: rootFolderPath,
            monitored: true,
            seasonFolder: true,
            addOptions: {
                searchForMissingEpisodes: startSearch ?? true,
                monitor: 'all'
            }
        };

        if (resolvedItem.tvdbId) seriesPayload.tvdbId = resolvedItem.tvdbId;
        if (resolvedItem.imdbId) seriesPayload.imdbId = resolvedItem.imdbId;
        if (resolvedItem.seasons) seriesPayload.seasons = resolvedItem.seasons;

        const result = await addSeries(instance.url, instance.api_key, seriesPayload);
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
        console.error('API /sonarr/add error:', error);
        return NextResponse.json({ error: 'Failed to add series' }, { status: 500 });
    }
}

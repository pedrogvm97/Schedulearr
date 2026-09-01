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
        let bestLookup: any = null;

        if (resolvedItem.title) {
            try {
                const searchResults = await searchSeries(instance.url, instance.api_key, resolvedItem.title);
                if (Array.isArray(searchResults) && searchResults.length > 0) {
                    bestLookup = (resolvedItem.tvdbId && searchResults.find((s: any) => s.tvdbId === resolvedItem.tvdbId))
                        || (resolvedItem.tmdbId && searchResults.find((s: any) => s.tmdbId === resolvedItem.tmdbId))
                        || (resolvedItem.year && searchResults.find((s: any) => s.year === resolvedItem.year))
                        || searchResults[0];

                    if (bestLookup?.tvdbId && !resolvedItem.tvdbId) resolvedItem.tvdbId = bestLookup.tvdbId;
                    if (bestLookup?.seasons && !resolvedItem.seasons) resolvedItem.seasons = bestLookup.seasons;
                    if (bestLookup?.titleSlug && !resolvedItem.titleSlug) resolvedItem.titleSlug = bestLookup.titleSlug;
                    if (bestLookup?.images && !resolvedItem.images) resolvedItem.images = bestLookup.images;
                }
            } catch (e) {
                console.warn('[sonarr/add] Could not resolve lookup via search:', e);
            }
        }

        // Build the Sonarr-compatible series payload
        const seriesPayload: any = {
            ...(bestLookup || {}),
            ...resolvedItem,
            title: resolvedItem.title || bestLookup?.title,
            year: resolvedItem.year || bestLookup?.year,
            qualityProfileId: Number(qualityProfileId),
            rootFolderPath: rootFolderPath,
            monitored: true,
            seasonFolder: true,
            addOptions: {
                searchForMissingEpisodes: startSearch ?? true,
                monitor: 'all'
            }
        };

        if (resolvedItem.tvdbId || bestLookup?.tvdbId) seriesPayload.tvdbId = resolvedItem.tvdbId || bestLookup?.tvdbId;
        if (resolvedItem.imdbId || bestLookup?.imdbId) seriesPayload.imdbId = resolvedItem.imdbId || bestLookup?.imdbId;
        if (resolvedItem.seasons || bestLookup?.seasons) seriesPayload.seasons = resolvedItem.seasons || bestLookup?.seasons;
        if (resolvedItem.titleSlug || bestLookup?.titleSlug) seriesPayload.titleSlug = resolvedItem.titleSlug || bestLookup?.titleSlug;

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

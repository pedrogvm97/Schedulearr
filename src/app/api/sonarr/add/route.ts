import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { addSeries } from '@/lib/sonarr';

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

        // Build the Sonarr-compatible series payload from the lookup item
        const seriesPayload: any = {
            title: item.title,
            year: item.year,
            qualityProfileId: qualityProfileId,
            rootFolderPath: rootFolderPath,
            monitored: true,
            seasonFolder: true,
            addOptions: {
                searchForMissingEpisodes: startSearch ?? true,
                monitor: 'all'
            }
        };

        // Sonarr needs tvdbId for series
        if (item.tvdbId) seriesPayload.tvdbId = item.tvdbId;
        if (item.imdbId) seriesPayload.imdbId = item.imdbId;

        // Pass through any seasons array if present (Sonarr lookup returns them)
        if (item.seasons) seriesPayload.seasons = item.seasons;

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

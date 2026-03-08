import { NextResponse } from 'next/server';
import { getInstanceById, getSetting } from '@/lib/db';
import { searchSeries } from '@/lib/sonarr';
import { getTrending, getTMDBDetails } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');
    const term = searchParams.get('term');

    if (!instanceId) {
        return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
    }

    const searchTerm = term || '';

    try {
        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const tmdbApiKey = getSetting('tmdb_api_key');

        if (!searchTerm && tmdbApiKey) {
            console.log('[LOOKUP] Using TMDB for discovery (series)');
            const tmdbResults = await getTrending(tmdbApiKey, 'tv');

            // Map and resolve TVDB IDs if possible
            const mappedResults = await Promise.all(tmdbResults.map(async m => {
                // Get external IDs to get TVDB ID
                const details = await getTMDBDetails(tmdbApiKey, m.id, 'tv');
                const tvdbId = details?.external_ids?.tvdb_id;

                return {
                    title: m.name,
                    year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined,
                    tmdbId: m.id,
                    tvdbId: tvdbId,
                    overview: m.overview,
                    remotePoster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
                    ratings: { value: m.vote_average },
                    popularity: m.popularity,
                    genres: [],
                    productionCompanies: details?.production_companies?.map((c: any) => c.name) || []
                };
            }));

            return NextResponse.json(mappedResults);
        }

        const results = await searchSeries(instance.url, instance.api_key, searchTerm);

        return NextResponse.json(results);
    } catch (error) {
        console.error('API /sonarr/lookup error:', error);
        return NextResponse.json({ error: 'Failed to lookup series' }, { status: 500 });
    }
}

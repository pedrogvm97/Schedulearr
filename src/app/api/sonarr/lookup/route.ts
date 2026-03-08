import { NextResponse } from 'next/server';
import { getInstanceById, getSetting } from '@/lib/db';
import { searchSeries } from '@/lib/sonarr';
import { getTrending, searchTMDB, discoverTMDB, TMDB_PROVIDERS, TMDB_GENRES, TMDB_REVERSE_GENRES } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');
    const term = searchParams.get('term');
    const platform = searchParams.get('platform');
    const genre = searchParams.get('genre');
    const minRating = parseFloat(searchParams.get('minRating') || '0');
    const page = parseInt(searchParams.get('page') || '1');

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

        // Use TMDB for discovery or text search if API key is available
        if (tmdbApiKey) {
            console.log(`[LOOKUP] TMDB ${searchTerm ? 'search' : 'discovery'} (series, Term: ${searchTerm}, Platform: ${platform || 'Any'}, Genre: ${genre || 'Any'}, MinRating: ${minRating})`);

            let tmdbResults: any[] = [];
            let totalPages = 1;

            if (searchTerm) {
                const response = await searchTMDB(tmdbApiKey, searchTerm, 'tv', page);
                tmdbResults = response.results;
                totalPages = response.total_pages;
            } else {
                const genreId = genre ? TMDB_GENRES[genre] : undefined;
                const providerId = platform ? TMDB_PROVIDERS[platform] : undefined;
                const yearVal = searchParams.get('year') || undefined;

                // Call discover if ANY filter is present, otherwise get trending
                if (providerId || genreId || minRating > 0 || (yearVal && yearVal !== 'All')) {
                    const response = await discoverTMDB(tmdbApiKey, 'tv', providerId, genreId, minRating, yearVal, page);
                    tmdbResults = response.results;
                    totalPages = response.total_pages;
                } else {
                    const response = await getTrending(tmdbApiKey, 'tv', 'day', page);
                    tmdbResults = response.results;
                    totalPages = response.total_pages;
                }
            }

            // Map results WITHOUT per-result detail fetches (those were causing timeouts and empty results)
            // TVDB ID is resolved on-demand when the user adds the show via Sonarr lookup
            const mappedResults = tmdbResults.map((m: any) => ({
                title: m.name,
                year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined,
                tmdbId: m.id,
                type: 'series',
                tvdbId: undefined,
                overview: m.overview,
                remotePoster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
                ratings: { value: m.vote_average },
                popularity: m.popularity,
                genres: (m.genre_ids?.map((id: number) => TMDB_REVERSE_GENRES[id]).filter(Boolean) || []),
                productionCompanies: platform ? [platform] : []
            }));

            return NextResponse.json({ results: mappedResults, total_pages: totalPages });
        }

        // Text search mode: use Sonarr's own search
        const results = await searchSeries(instance.url, instance.api_key, searchTerm);

        const mappedSearch = results.map((s: any) => ({
            title: s.title,
            year: s.year,
            tmdbId: s.tmdbId,
            type: 'series',
            tvdbId: s.tvdbId,
            overview: s.overview,
            remotePoster: s.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || s.remotePoster,
            ratings: s.ratings,
            popularity: s.popularity,
            genres: s.genres || [],
            network: s.network || undefined,
            productionCompanies: s.network ? [s.network] : []
        }));

        return NextResponse.json({ results: mappedSearch, total_pages: 1 });
    } catch (error) {
        console.error('API /sonarr/lookup error:', error);
        return NextResponse.json({ error: 'Failed to lookup series' }, { status: 500 });
    }
}

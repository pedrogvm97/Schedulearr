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
    const minPopularity = parseFloat(searchParams.get('minPopularity') || '0');
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

        if (searchTerm) {
            console.log(`[LOOKUP] Direct text search for series: "${searchTerm}" on Sonarr instance ${instance.name}`);
            let results: any[] = [];

            try {
                const sonarrResults = await searchSeries(instance.url, instance.api_key, searchTerm);
                if (Array.isArray(sonarrResults) && sonarrResults.length > 0) {
                    results = sonarrResults.map((s: any) => ({
                        title: s.title,
                        year: s.year,
                        tmdbId: s.tmdbId,
                        tvdbId: s.tvdbId,
                        type: 'series',
                        overview: s.overview,
                        remotePoster: s.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || s.remotePoster,
                        ratings: s.ratings,
                        popularity: s.popularity,
                        genres: s.genres || [],
                        network: s.network || undefined,
                        productionCompanies: s.network ? [s.network] : []
                    }));
                }
            } catch (err) {
                console.warn('Sonarr native lookup failed:', err);
            }

            // Fallback to TMDB text search if Sonarr lookup returned no results
            if (results.length === 0 && tmdbApiKey) {
                try {
                    const response = await searchTMDB(tmdbApiKey, searchTerm, 'tv', page);
                    if (response && Array.isArray(response.results)) {
                        results = response.results.map((m: any) => ({
                            title: m.name,
                            year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined,
                            tmdbId: m.id,
                            type: 'series',
                            overview: m.overview,
                            remotePoster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
                            ratings: { value: m.vote_average },
                            popularity: m.popularity,
                            genres: (m.genre_ids?.map((id: number) => TMDB_REVERSE_GENRES[id]).filter(Boolean) || []),
                            productionCompanies: platform ? [platform] : []
                        }));
                    }
                } catch (tmdbErr) {
                    console.warn('TMDB search fallback failed:', tmdbErr);
                }
            }

            return NextResponse.json({ results, total_pages: 1 });
        }

        // Discovery mode (no searchTerm)
        if (tmdbApiKey) {
            console.log(`[LOOKUP] TMDB discovery (series, Platform: ${platform || 'Any'}, Genre: ${genre || 'Any'}, MinRating: ${minRating})`);

            let tmdbResults: any[] = [];
            let totalPages = 1;

            const yearVal = searchParams.get('year') || undefined;
            const providerId = platform ? TMDB_PROVIDERS[platform] : undefined;

            if (providerId || genre || minRating > 0 || minPopularity > 0 || (yearVal && yearVal !== 'All')) {
                const response = await discoverTMDB(tmdbApiKey, 'tv', providerId, genre || undefined, minRating, yearVal, page, minPopularity);
                tmdbResults = response.results;
                totalPages = response.total_pages;
            } else {
                const response = await getTrending(tmdbApiKey, 'tv', 'day', page);
                tmdbResults = response.results;
                totalPages = response.total_pages;
            }

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

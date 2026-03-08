import { NextResponse } from 'next/server';
import { getInstanceById, getSetting } from '@/lib/db';
import { searchMovies } from '@/lib/radarr';
import { getTrending, searchTMDB, discoverTMDB, TMDB_PROVIDERS, TMDB_GENRES, TMDB_REVERSE_GENRES } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');
    const term = searchParams.get('term');
    const platform = searchParams.get('platform');
    const genre = searchParams.get('genre');
    const minRating = parseFloat(searchParams.get('minRating') || '0');

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
            console.log(`[LOOKUP] Using TMDB for ${searchTerm ? 'search' : 'discovery'} (Term: ${searchTerm}, Platform: ${platform || 'Any'}, Genre: ${genre || 'Any'}, MinRating: ${minRating})`);

            let tmdbResults = [];

            if (searchTerm) {
                tmdbResults = await searchTMDB(tmdbApiKey, searchTerm, 'movie');
            } else {
                const genreId = genre ? TMDB_GENRES[genre] : undefined;
                const providerId = platform ? TMDB_PROVIDERS[platform] : undefined;

                if (providerId || genreId) {
                    tmdbResults = await discoverTMDB(tmdbApiKey, 'movie', providerId, genreId, minRating);
                    if (tmdbResults.length < 10 && minRating > 0) {
                        const more = await discoverTMDB(tmdbApiKey, 'movie', providerId, genreId, minRating, 2);
                        tmdbResults = [...tmdbResults, ...more];
                    }
                } else {
                    tmdbResults = await getTrending(tmdbApiKey, 'movie');
                    if (minRating > 0) {
                        const more = await getTrending(tmdbApiKey, 'movie', 'day', 2);
                        tmdbResults = [...tmdbResults, ...more];
                    }
                }
            }

            const mappedResults = tmdbResults.map(m => ({
                title: m.title,
                year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
                tmdbId: m.id,
                type: 'movie',
                overview: m.overview,
                remotePoster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
                ratings: { value: m.vote_average },
                popularity: m.popularity,
                genres: Array.from(new Set([...(m.genre_ids?.map(id => TMDB_REVERSE_GENRES[id]).filter(Boolean) || []), ...(genre ? [genre] : [])])),
                productionCompanies: platform ? [platform] : []
            }));
            return NextResponse.json(mappedResults);
        }

        // Fallback to Radarr lookup if no TMDB key
        const results = await searchMovies(instance.url, instance.api_key, searchTerm);

        const mappedSearch = results.map(m => ({
            title: m.title,
            year: m.year,
            tmdbId: m.tmdbId,
            type: 'movie',
            overview: m.overview,
            remotePoster: m.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || m.remotePoster,
            ratings: m.ratings,
            popularity: m.popularity,
            genres: m.genres || [],
            productionCompanies: []
        }));

        return NextResponse.json(mappedSearch);
    } catch (error) {
        console.error('API /radarr/lookup error:', error);
        return NextResponse.json({ error: 'Failed to lookup movies' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstanceById, getSetting } from '@/lib/db';
import { searchMovies } from '@/lib/radarr';
import { getTrending, discoverTMDB, TMDB_PROVIDERS, TMDB_GENRES } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');
    const term = searchParams.get('term');
    const platform = searchParams.get('platform');
    const genre = searchParams.get('genre');

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
            console.log(`[LOOKUP] Using TMDB for discovery (Platform: ${platform || 'Any'}, Genre: ${genre || 'Any'})`);

            let tmdbResults = [];
            const genreId = genre ? TMDB_GENRES[genre] : undefined;
            const providerId = platform ? TMDB_PROVIDERS[platform] : undefined;

            if (providerId || genreId) {
                tmdbResults = await discoverTMDB(tmdbApiKey, 'movie', providerId, genreId);
            } else {
                tmdbResults = await getTrending(tmdbApiKey, 'movie');
            }

            const mappedResults = tmdbResults.map(m => ({
                title: m.title,
                year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
                tmdbId: m.id,
                overview: m.overview,
                remotePoster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
                ratings: { value: m.vote_average },
                popularity: m.popularity,
                genres: [],
                productionCompanies: platform ? [platform] : []
            }));
            return NextResponse.json(mappedResults);
        }

        const results = await searchMovies(instance.url, instance.api_key, searchTerm);

        return NextResponse.json(results);
    } catch (error) {
        console.error('API /radarr/lookup error:', error);
        return NextResponse.json({ error: 'Failed to lookup movies' }, { status: 500 });
    }
}

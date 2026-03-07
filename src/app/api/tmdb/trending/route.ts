import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Fetches trending movies or TV from TMDB directly.
 * Used by the Discover page as the default trending view.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'tv'; // 'movie' or 'tv'
    const page = parseInt(searchParams.get('page') || '1');

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'TMDB_API_KEY not configured' }, { status: 503 });
    }

    try {
        // Fetch trending (weekly) from TMDB - 20 items per page, fetch 3 pages for a full list
        const pages = [1, 2, 3].map(p =>
            fetch(`https://api.themoviedb.org/3/trending/${type}/week?api_key=${apiKey}&page=${p}`, {
                next: { revalidate: 3600 } // cache 1 hour
            }).then(r => r.ok ? r.json() : null)
        );

        const responses = await Promise.all(pages);
        const allResults: any[] = [];

        for (const resp of responses) {
            if (resp?.results) {
                allResults.push(...resp.results);
            }
        }

        // Map TMDB movie/tv format to the same shape as Radarr/Sonarr lookup results
        const mapped = allResults.map((item: any) => {
            const isMovie = item.media_type === 'movie' || type === 'movie';
            return {
                tmdbId: item.id,
                title: isMovie ? item.title : item.name,
                overview: item.overview,
                year: isMovie
                    ? item.release_date?.split('-')[0]
                    : item.first_air_date?.split('-')[0],
                remotePoster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                remoteBackdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
                genres: [],  // genres are IDs in trending endpoint, enriched per-item if needed
                ratings: { value: item.vote_average || 0, votes: item.vote_count || 0 },
                popularity: item.popularity,
                // Will be enriched with studio/network if TMDB key is present
                studio: '',
                network: '',
            };
        });

        // Enrich the top 30 items with production company / network info in parallel
        const TOP_ENRICH = 30;
        const enriched = await Promise.all(
            mapped.slice(0, TOP_ENRICH).map(async (item) => {
                try {
                    const endpoint = type === 'movie'
                        ? `https://api.themoviedb.org/3/movie/${item.tmdbId}?api_key=${apiKey}&append_to_response=credits`
                        : `https://api.themoviedb.org/3/tv/${item.tmdbId}?api_key=${apiKey}`;
                    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
                    if (!res.ok) return item;
                    const data = await res.json();
                    const networks: string[] = (data.networks || []).map((n: any) => n.name);
                    const companies: string[] = (data.production_companies || []).map((c: any) => c.name);
                    const genres: string[] = (data.genres || []).map((g: any) => g.name);
                    return {
                        ...item,
                        genres,
                        network: networks[0] || '',
                        studio: companies[0] || networks[0] || '',
                        productionCompanies: [...networks, ...companies],
                    };
                } catch {
                    return item;
                }
            })
        );

        // Merge enriched + remaining un-enriched
        const final = [...enriched, ...mapped.slice(TOP_ENRICH)];

        return NextResponse.json(final);
    } catch (error) {
        console.error('TMDB trending error:', error);
        return NextResponse.json({ error: 'Failed to fetch trending' }, { status: 500 });
    }
}

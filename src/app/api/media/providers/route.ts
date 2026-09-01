import { NextResponse } from 'next/server';
import axios from 'axios';
import { getInstances, getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TMDB_DEFAULT_KEY = '45dbdd59a37121e50c890834ba73055e';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const tmdbId = searchParams.get('tmdbId');
        const imdbId = searchParams.get('imdbId');
        const mediaType = (searchParams.get('type') || 'movie') as 'movie' | 'tv';

        let effectiveTmdbId = tmdbId;

        // 1. Resolve TMDB ID from IMDb ID if needed
        if (!effectiveTmdbId && imdbId) {
            try {
                const findRes = await axios.get(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_DEFAULT_KEY}&external_source=imdb_id`, {
                    timeout: 5000
                });
                if (mediaType === 'tv' && findRes.data?.tv_results?.length > 0) {
                    effectiveTmdbId = findRes.data.tv_results[0].id.toString();
                } else if (findRes.data?.movie_results?.length > 0) {
                    effectiveTmdbId = findRes.data.movie_results[0].id.toString();
                }
            } catch (e: any) {
                console.warn('[PROVIDERS] IMDb lookup error:', e.message);
            }
        }

        if (!effectiveTmdbId) {
            return NextResponse.json({ providers: {}, countryList: [] });
        }

        // 2. Fetch Watch Providers from TMDB
        const endpoint = mediaType === 'tv'
            ? `https://api.themoviedb.org/3/tv/${effectiveTmdbId}/watch/providers?api_key=${TMDB_DEFAULT_KEY}`
            : `https://api.themoviedb.org/3/movie/${effectiveTmdbId}/watch/providers?api_key=${TMDB_DEFAULT_KEY}`;

        const res = await axios.get(endpoint, { timeout: 6000 });
        const rawResults = res.data?.results || {};

        // 3. Retrieve User Country Shortlist from Settings (Default: Portugal PT, Spain ES, France FR, US, GB)
        let shortlist: string[] = ['PT', 'ES', 'FR', 'US', 'GB'];
        try {
            const rawShortlist = getSetting('streaming_countries_shortlist');
            if (rawShortlist) {
                const parsed = JSON.parse(rawShortlist);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    shortlist = parsed.map(c => c.toUpperCase());
                }
            }
        } catch {}

        // Format and structure providers
        const formattedProviders: Record<string, {
            link: string;
            flatrate: Array<{ id: number; name: string; logoUrl: string }>;
            rent: Array<{ id: number; name: string; logoUrl: string }>;
            buy: Array<{ id: number; name: string; logoUrl: string }>;
            free: Array<{ id: number; name: string; logoUrl: string }>;
            isShortlisted: boolean;
        }> = {};

        const mapProvider = (p: any) => ({
            id: p.provider_id,
            name: p.provider_name,
            logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : ''
        });

        for (const [countryCode, data] of Object.entries<any>(rawResults)) {
            const cc = countryCode.toUpperCase();
            formattedProviders[cc] = {
                link: data.link || '',
                flatrate: Array.isArray(data.flatrate) ? data.flatrate.map(mapProvider) : [],
                rent: Array.isArray(data.rent) ? data.rent.map(mapProvider) : [],
                buy: Array.isArray(data.buy) ? data.buy.map(mapProvider) : [],
                free: Array.isArray(data.free) ? data.free.map(mapProvider) : Array.isArray(data.ads) ? data.ads.map(mapProvider) : [],
                isShortlisted: shortlist.includes(cc)
            };
        }

        // Ordered country list with shortlisted countries prioritized at top
        const availableCountries = Object.keys(formattedProviders);
        const sortedCountries = [
            ...shortlist.filter(c => availableCountries.includes(c)),
            ...availableCountries.filter(c => !shortlist.includes(c)).sort()
        ];

        return NextResponse.json({
            tmdbId: effectiveTmdbId,
            mediaType,
            shortlist,
            sortedCountries,
            providers: formattedProviders
        });
    } catch (error: any) {
        console.error('API /media/providers error:', error.message);
        return NextResponse.json({ error: error.message, providers: {}, sortedCountries: [] }, { status: 500 });
    }
}

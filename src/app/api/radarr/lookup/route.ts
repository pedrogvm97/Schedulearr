import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { searchMovies } from '@/lib/radarr';

export const dynamic = 'force-dynamic';

// Fetch production company + overview from TMDB for a single movie
async function enrichMovieFromTMDB(tmdbId: number): Promise<{ studio?: string; productionCompanies?: string[] }> {
    try {
        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey || !tmdbId) return {};
        const res = await fetch(
            `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=production_companies`,
            { next: { revalidate: 3600 } } // cache for 1 hour
        );
        if (!res.ok) return {};
        const data = await res.json();
        const companies: string[] = (data.production_companies || []).map((c: any) => c.name);
        return { studio: companies[0] || '', productionCompanies: companies };
    } catch {
        return {};
    }
}

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

        const results = await searchMovies(instance.url, instance.api_key, searchTerm);

        // Enrich results with TMDB studio/production company data
        const enriched = await Promise.all(
            results.map(async (movie: any) => {
                // If studio is already populated by Radarr, skip the extra call
                if (movie.studio) return movie;
                if (!movie.tmdbId) return movie;
                const extra = await enrichMovieFromTMDB(movie.tmdbId);
                return { ...movie, ...extra };
            })
        );

        return NextResponse.json(enriched);
    } catch (error) {
        console.error('API /radarr/lookup error:', error);
        return NextResponse.json({ error: 'Failed to lookup movies' }, { status: 500 });
    }
}

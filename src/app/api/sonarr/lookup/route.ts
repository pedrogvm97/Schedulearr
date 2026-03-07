import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { searchSeries } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

// Fetch network + production company from TMDB for a TV series
async function enrichSeriesFromTMDB(tmdbId?: number, tvdbId?: number): Promise<{ network?: string; studio?: string; productionCompanies?: string[] }> {
    try {
        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) return {};

        let data: any = null;

        if (tmdbId) {
            const res = await fetch(
                `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}`,
                { next: { revalidate: 3600 } }
            );
            if (res.ok) data = await res.json();
        }

        // Fallback: try TMDB find by TVDB id
        if (!data && tvdbId) {
            const res = await fetch(
                `https://api.themoviedb.org/3/find/${tvdbId}?api_key=${apiKey}&external_source=tvdb_id`,
                { next: { revalidate: 3600 } }
            );
            if (res.ok) {
                const found = await res.json();
                const match = found.tv_results?.[0];
                if (match?.id) {
                    const detailRes = await fetch(
                        `https://api.themoviedb.org/3/tv/${match.id}?api_key=${apiKey}`,
                        { next: { revalidate: 3600 } }
                    );
                    if (detailRes.ok) data = await detailRes.json();
                }
            }
        }

        if (!data) return {};

        const networks: string[] = (data.networks || []).map((n: any) => n.name);
        const companies: string[] = (data.production_companies || []).map((c: any) => c.name);
        return {
            network: networks[0] || '',
            studio: companies[0] || networks[0] || '',
            productionCompanies: [...networks, ...companies]
        };
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

        const results = await searchSeries(instance.url, instance.api_key, searchTerm);

        // Enrich results with TMDB network/studio data
        const enriched = await Promise.all(
            results.map(async (series: any) => {
                // Skip enrichment if network data already present
                if (series.network) return series;
                const extra = await enrichSeriesFromTMDB(series.tmdbId, series.tvdbId);
                return { ...series, ...extra };
            })
        );

        return NextResponse.json(enriched);
    } catch (error) {
        console.error('API /sonarr/lookup error:', error);
        return NextResponse.json({ error: 'Failed to lookup series' }, { status: 500 });
    }
}

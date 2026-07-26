import { NextResponse } from 'next/server';
import { getInstances, getIndexerRules } from '@/lib/db';
import { getIndexerHealth, getProwlarrIndexerStats, testProwlarrIndexer } from '@/lib/prowlarr';

// GET all indexers and apply SQLite rules + Prowlarr stats data
export async function GET() {
    try {
        const prowlarrs = getInstances('prowlarr', true);
        const rules = getIndexerRules();

        const allIndexers: any[] = [];

        for (const prowlarr of prowlarrs) {
            const health = await getIndexerHealth(prowlarr.url, prowlarr.api_key);
            const stats = await getProwlarrIndexerStats(prowlarr.url, prowlarr.api_key);

            // Map the sqlite rules and prowlarr stats onto the active indexers payload
            const mappedIndexers = health.indexers.map(ind => {
                const existingRule = rules.find(r => r.indexer_id === ind.id && r.prowlarr_instance_id === prowlarr.id);
                const indexerStat = stats.find((s: any) => s.indexerId === ind.id || s.indexerName === ind.name);
                return {
                    ...ind,
                    prowlarr_name: prowlarr.name,
                    prowlarr_instance_id: prowlarr.id,
                    prowlarr_color: prowlarr.color || '#10b981', // emerald-500 fallback
                    rule: existingRule || null,
                    stats: indexerStat || null
                };
            });

            allIndexers.push(...mappedIndexers);
        }

        return NextResponse.json(allIndexers);
    } catch (e: any) {
        console.error("Error fetching indexers:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST test indexer
export async function POST(req: Request) {
    try {
        const { indexerId, prowlarrInstanceId } = await req.json();

        if (!indexerId || !prowlarrInstanceId) {
            return NextResponse.json({ error: 'Missing indexerId or prowlarrInstanceId' }, { status: 400 });
        }

        const prowlarrs = getInstances('prowlarr');
        const instance = prowlarrs.find(p => p.id === prowlarrInstanceId);

        if (!instance) {
            return NextResponse.json({ error: 'Prowlarr instance not found' }, { status: 404 });
        }

        const result = await testProwlarrIndexer(instance.url, instance.api_key, indexerId);
        return NextResponse.json(result);
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}


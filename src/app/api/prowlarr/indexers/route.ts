import { NextResponse } from 'next/server';
import { getInstances, getIndexerRules, saveIndexerRule, deleteIndexerRule } from '@/lib/db';
import { getIndexerHealth } from '@/lib/prowlarr';

// GET all indexers and apply SQLite rules data to them
export async function GET() {
    try {
        const prowlarrs = getInstances('prowlarr', true);
        const rules = getIndexerRules();

        const allIndexers: any[] = [];

        for (const prowlarr of prowlarrs) {
            const health = await getIndexerHealth(prowlarr.url, prowlarr.api_key);

            // Map the sqlite rules onto the prowlarr active indexers payload
            const mappedIndexers = health.indexers.map(ind => {
                const existingRule = rules.find(r => r.indexer_id === ind.id && r.prowlarr_instance_id === prowlarr.id);
                return {
                    ...ind,
                    prowlarr_name: prowlarr.name,
                    prowlarr_instance_id: prowlarr.id,
                    prowlarr_color: prowlarr.color || '#10b981', // emerald-500 fallback
                    rule: existingRule || null
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

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getIndexerHealth } from '@/lib/prowlarr';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const prowlarrInstances = getInstances('prowlarr', true);

        if (prowlarrInstances.length === 0) {
            return NextResponse.json({ instances: [] });
        }

        const healthData = await Promise.all(prowlarrInstances.map(async (inst) => {
            const health = await getIndexerHealth(inst.url, inst.api_key);
            return {
                id: inst.id,
                name: inst.name,
                url: inst.url,
                health
            };
        }));

        return NextResponse.json({ instances: healthData });
    } catch (error) {
        console.error('API /prowlarr/health error:', error);
        return NextResponse.json({ error: 'Failed to fetch Prowlarr health' }, { status: 500 });
    }
}

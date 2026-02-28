import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getIndexerHealth } from '@/lib/prowlarr';

export async function GET() {
    try {
        const instances = getInstances('prowlarr');

        if (instances.length === 0) {
            return NextResponse.json({ status: 'No Prowlarr instances configured.', health: { allHealthy: true, totalActive: 0, downIndexers: [] } });
        }

        // Usually only 1 Prowlarr instance, but we'll take the first one
        const instance = instances[0];
        const health = await getIndexerHealth(instance.url, instance.api_key);

        return NextResponse.json({ status: 'ok', health });

    } catch (error) {
        console.error('API /prowlarr/health error:', error);
        return NextResponse.json({ error: 'Failed to check Prowlarr health' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getMissingEpisodes } from '@/lib/sonarr';

export async function GET() {
    try {
        const instances = getInstances('sonarr');
        let allMissing: any[] = [];

        for (const instance of instances) {
            const missing = await getMissingEpisodes(instance.url, instance.api_key);
            allMissing = [...allMissing, ...missing.map(m => ({ ...m, instanceName: instance.name, instanceId: instance.id }))];
        }

        return NextResponse.json(allMissing);
    } catch (error) {
        console.error('API /sonarr/missing error:', error);
        return NextResponse.json({ error: 'Failed to fetch missing episodes' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getMissingMovies } from '@/lib/radarr';

export async function GET() {
    try {
        const instances = getInstances('radarr');
        let allMissing: any[] = [];

        for (const instance of instances) {
            const missing = await getMissingMovies(instance.url, instance.api_key);
            // Map instance name to the missing list so UI knows where it came from
            allMissing = [...allMissing, ...missing.map(m => ({ ...m, instanceName: instance.name, instanceId: instance.id }))];
        }

        // Sort by date added descending (newest first)
        allMissing.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());

        return NextResponse.json(allMissing);
    } catch (error) {
        console.error('API /radarr/missing error:', error);
        return NextResponse.json({ error: 'Failed to fetch missing movies' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getAllMovies } from '@/lib/radarr';

export async function GET() {
    try {
        const instances = getInstances('radarr');
        let allMedia: any[] = [];

        for (const instance of instances) {
            const movies = await getAllMovies(instance.url, instance.api_key);
            // Map instance name to the list so UI knows where it came from
            allMedia = [...allMedia, ...movies.map(m => ({ ...m, instanceName: instance.name, instanceId: instance.id }))];
        }

        // Sort by date added descending (newest first)
        allMedia.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());

        return NextResponse.json(allMedia);
    } catch (error) {
        console.error('API /radarr/all error:', error);
        return NextResponse.json({ error: 'Failed to fetch all movies' }, { status: 500 });
    }
}

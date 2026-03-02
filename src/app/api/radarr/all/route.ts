import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getAllMovies, getQueue } from '@/lib/radarr';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const instances = getInstances('radarr');
        let allMedia: any[] = [];

        for (const instance of instances) {
            const [movies, queue] = await Promise.all([
                getAllMovies(instance.url, instance.api_key),
                getQueue(instance.url, instance.api_key)
            ]);
            const queuedIds = new Set(queue.map(q => q.movieId));

            // Map instance name to the list so UI knows where it came from
            allMedia = [...allMedia, ...movies.map(m => ({
                ...m,
                instanceName: instance.name,
                instanceId: instance.id,
                isDownloading: queuedIds.has(m.id)
            }))];
        }

        // Sort by date added descending (newest first)
        allMedia.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());

        return NextResponse.json(allMedia);
    } catch (error) {
        console.error('API /radarr/all error:', error);
        return NextResponse.json({ error: 'Failed to fetch all movies' }, { status: 500 });
    }
}

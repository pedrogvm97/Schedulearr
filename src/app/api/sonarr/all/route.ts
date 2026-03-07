import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getAllSeries, getQueue } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const instances = getInstances('sonarr');
        let allMedia: any[] = [];

        for (const instance of instances) {
            const [series, queue] = await Promise.all([
                getAllSeries(instance.url, instance.api_key),
                getQueue(instance.url, instance.api_key)
            ]);
            const queuedEpisodeIds = queue.map(q => q.episodeId);

            allMedia = [...allMedia, ...series.map(s => ({
                ...s,
                instanceName: instance.name,
                instanceId: instance.id,
                instanceUrl: instance.url,
                queuedEpisodeIds: queue.filter(q => q.seriesId === s.id).map(q => q.episodeId)
            }))];
        }

        // Sort by date added descending
        allMedia.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());

        return NextResponse.json(allMedia);
    } catch (error) {
        console.error('API /sonarr/all error:', error);
        return NextResponse.json({ error: 'Failed to fetch all series' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getMovieQueueStatus } from '@/lib/radarr';
import { getEpisodeQueueStatus } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get('instanceId');
    const type = searchParams.get('type'); // 'movie' or 'series'
    const mediaId = searchParams.get('mediaId'); // Radarr movie ID or Sonarr episode ID

    if (!instanceId || !type || !mediaId) {
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const instances = getInstances();
    const instance = instances.find(inst => inst.id === instanceId);

    if (!instance) {
        return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    let status = null;

    try {
        if (type === 'movie') {
            status = await getMovieQueueStatus(instance.url, instance.api_key, parseInt(mediaId));
        } else if (type === 'series') {
            status = await getEpisodeQueueStatus(instance.url, instance.api_key, parseInt(mediaId));
        }

        return NextResponse.json({ status: status || 'Not in queue' });
    } catch (e) {
        console.error('Error fetching search status', e);
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}

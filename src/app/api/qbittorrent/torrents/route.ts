import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents } from '@/lib/qbittorrent';

export async function GET() {
    try {
        const instances = getInstances('qbittorrent', true);
        if (instances.length === 0) {
            return NextResponse.json({ error: 'No active qBittorrent instances configured.' }, { status: 404 });
        }

        // Support multiple qBit instances by aggregating them
        let allTorrents: any[] = [];

        for (const instance of instances) {
            try {
                const cookie = await authenticateQbittorrent(instance.url, instance.api_key);
                const torrents = await getActiveTorrents(instance.url, cookie);

                // Inject instance info for UI grouping
                const tagged = torrents.map(t => ({
                    ...t,
                    instanceId: instance.id,
                    instanceName: instance.name
                }));
                allTorrents = [...allTorrents, ...tagged];
            } catch (instError) {
                console.error(`Failed to fetch from ${instance.name}:`, instError);
                // Keep trying other instances if one fails
            }
        }

        return NextResponse.json({ torrents: allTorrents });
    } catch (error) {
        console.error('API /qbittorrent/torrents error:', error);
        return NextResponse.json({ error: 'Failed to fetch torrents' }, { status: 500 });
    }
}

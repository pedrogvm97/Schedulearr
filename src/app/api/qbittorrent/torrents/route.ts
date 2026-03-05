import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents } from '@/lib/qbittorrent';

interface QBitTorrent {
    hash: string;
    name: string;
    size: number;
    progress: number;
    dlspeed: number;
    upspeed: number;
    state: string;
    instanceId?: number;
    instanceName?: string;
    instanceColor?: string;
    [key: string]: any;
}

export async function GET() {
    try {
        const instances = getInstances('qbittorrent', true);
        if (instances.length === 0) {
            return NextResponse.json({ error: 'No active qBittorrent instances configured.' }, { status: 404 });
        }

        // 1. Fetch Radarr/Sonarr queues to build a hash -> indexer map
        const hashToIndexer: Record<string, string> = {};
        const radarrInstances = getInstances('radarr', true);
        const sonarrInstances = getInstances('sonarr', true);

        const arrPromises = [
            ...radarrInstances.map(inst => fetch(`${inst.url}/api/v3/queue?apiKey=${inst.api_key}`).then(r => r.json()).catch(() => ({ records: [] }))),
            ...sonarrInstances.map(inst => fetch(`${inst.url}/api/v3/queue?apiKey=${inst.api_key}`).then(r => r.json()).catch(() => ({ records: [] })))
        ];

        const arrResults = await Promise.all(arrPromises);
        arrResults.forEach(data => {
            if (data && data.records) {
                data.records.forEach((record: any) => {
                    const hash = record.downloadId?.toLowerCase();
                    if (hash && record.indexer) {
                        hashToIndexer[hash] = record.indexer;
                    }
                });
            }
        });

        // 2. Support multiple qBit instances by aggregating them
        let allTorrents: QBitTorrent[] = [];

        for (const instance of instances) {
            try {
                const cookie = await authenticateQbittorrent(instance.url, instance.api_key);
                const torrents = await getActiveTorrents(instance.url, cookie);

                // Inject instance info and indexer info for UI
                const tagged = torrents.map((t: any) => ({
                    ...t,
                    instanceId: instance.id,
                    instanceName: instance.name,
                    instanceColor: instance.color || 'bg-emerald-500',
                    indexer: hashToIndexer[t.hash.toLowerCase()] || 'Unknown'
                }));
                allTorrents = [...allTorrents, ...tagged];
            } catch (instError) {
                console.error(`Failed to fetch from ${instance.name}:`, instError);
            }
        }

        return NextResponse.json({ torrents: allTorrents });
    } catch (error) {
        console.error('API /qbittorrent/torrents error:', error);
        return NextResponse.json({ error: 'Failed to fetch torrents' }, { status: 500 });
    }
}

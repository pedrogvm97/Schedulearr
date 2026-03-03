import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { authenticateQbittorrent, deleteTorrents } from '@/lib/qbittorrent';
import { getQueue as getRadarrQueue, deleteFromQueue as deleteFromRadarrQueue } from '@/lib/radarr';
import { getQueue as getSonarrQueue, deleteFromQueue as deleteFromSonarrQueue } from '@/lib/sonarr';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { hashes, deleteFiles, blacklist, instanceId } = body;

        if (!hashes || !Array.isArray(hashes) || hashes.length === 0) {
            return NextResponse.json({ error: 'Missing or empty hashes array' }, { status: 400 });
        }
        if (!instanceId) {
            return NextResponse.json({ error: 'Missing qBittorrent instanceId' }, { status: 400 });
        }

        const qbInstance = getInstances('qbittorrent', true).find(i => i.id === instanceId);
        if (!qbInstance) {
            return NextResponse.json({ error: 'Active qBittorrent instance not found' }, { status: 404 });
        }

        // 1. If Blacklist is true, we must attempt to remove from Radarr/Sonarr queue
        let unhandledHashes = [...hashes];

        if (blacklist) {
            // Fetch queues from Radarr and Sonarr
            const radarrInstances = getInstances('radarr', true);
            const sonarrInstances = getInstances('sonarr', true);

            for (const rInstance of radarrInstances) {
                const queue = await getRadarrQueue(rInstance.url, rInstance.api_key);
                for (const item of queue) {
                    if (item.downloadId && unhandledHashes.includes(item.downloadId.toLowerCase())) {
                        // Found match in Radarr queue
                        await deleteFromRadarrQueue(rInstance.url, rInstance.api_key, item.id, true, true); // removeFromClient=true, blocklist=true
                        unhandledHashes = unhandledHashes.filter(h => h !== item.downloadId.toLowerCase());
                    }
                }
            }

            for (const sInstance of sonarrInstances) {
                const queue = await getSonarrQueue(sInstance.url, sInstance.api_key);
                for (const item of queue) {
                    if (item.downloadId && unhandledHashes.includes(item.downloadId.toLowerCase())) {
                        // Found match in Sonarr queue
                        await deleteFromSonarrQueue(sInstance.url, sInstance.api_key, item.id, true, true);
                        unhandledHashes = unhandledHashes.filter(h => h !== item.downloadId.toLowerCase());
                    }
                }
            }
        }

        // 2. Fallback: For anything that didn't get removed via *arr (or if blacklist is false), delete manually from qBittorrent
        if (unhandledHashes.length > 0) {
            try {
                const cookie = await authenticateQbittorrent(qbInstance.url, qbInstance.api_key);
                await deleteTorrents(qbInstance.url, cookie, unhandledHashes, deleteFiles);
            } catch (qbitError) {
                console.error('Error deleting directly from qBittorrent', qbitError);
                return NextResponse.json({ error: 'Failed to delete some torrents from qBittorrent' }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true, message: 'Torrents processed successfully' });

    } catch (error) {
        console.error('API /qbittorrent/action error:', error);
        return NextResponse.json({ error: 'Failed to execute action' }, { status: 500 });
    }
}

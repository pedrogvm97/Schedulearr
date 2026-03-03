import { NextResponse } from 'next/server';
import { getInstances, getSetting } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents, deleteTorrents } from '@/lib/qbittorrent';
import { getQueue as getRadarrQueue, deleteFromQueue as deleteFromRadarrQueue } from '@/lib/radarr';
import { getQueue as getSonarrQueue, deleteFromQueue as deleteFromSonarrQueue } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const enabled = getSetting('qbit_cleanup_enabled') === 'true';
        if (!enabled) {
            return NextResponse.json({ success: true, message: 'Auto-cleanup is disabled.' });
        }

        const stagnationMin = parseInt(getSetting('qbit_cleanup_stagnation_min') || '60');
        const deleteFiles = getSetting('qbit_cleanup_delete_files') !== 'false'; // default true
        const blacklist = getSetting('qbit_cleanup_blacklist') !== 'false'; // default true

        const qbInstances = getInstances('qbittorrent', true);
        if (qbInstances.length === 0) {
            return NextResponse.json({ success: true, message: 'No active qBittorrent instances configured.' });
        }

        const radarrInstances = getInstances('radarr', true);
        const sonarrInstances = getInstances('sonarr', true);

        // Caching the queues so we don't spam API for every stalled torrent
        const radarrQueues: any[] = [];
        for (const ri of radarrInstances) {
            try {
                const q = await getRadarrQueue(ri.url, ri.api_key);
                radarrQueues.push({ instance: ri, records: q });
            } catch (e) { console.error('Error fetching radarr queue for cleanup', e); }
        }

        const sonarrQueues: any[] = [];
        for (const si of sonarrInstances) {
            try {
                const q = await getSonarrQueue(si.url, si.api_key);
                sonarrQueues.push({ instance: si, records: q });
            } catch (e) { console.error('Error fetching sonarr queue for cleanup', e); }
        }

        let totalCleaned = 0;

        for (const qb of qbInstances) {
            try {
                const cookie = await authenticateQbittorrent(qb.url, qb.api_key);
                const torrents = await getActiveTorrents(qb.url, cookie);

                // Identify stalled torrents
                const stalled = torrents.filter(t => {
                    const isStalled = t.state.toLowerCase().includes('stalled');
                    if (!isStalled) return false;

                    const addedTimeMs = t.added_on * 1000;
                    const minutesSinceAdded = (Date.now() - addedTimeMs) / (1000 * 60);
                    return minutesSinceAdded >= stagnationMin;
                });

                if (stalled.length > 0) {
                    let unhandledHashes = stalled.map(t => t.hash.toLowerCase());

                    if (blacklist) {
                        const hashesToProcess = [...unhandledHashes];
                        for (const hash of hashesToProcess) {
                            let handled = false;

                            // Check Radarr queues
                            for (const rq of radarrQueues) {
                                const match = rq.records.find((r: any) => r.downloadId && r.downloadId.toLowerCase() === hash);
                                if (match) {
                                    await deleteFromRadarrQueue(rq.instance.url, rq.instance.api_key, match.id, true, true);
                                    handled = true;
                                    break;
                                }
                            }

                            // Check Sonarr queues
                            if (!handled) {
                                for (const sq of sonarrQueues) {
                                    const match = sq.records.find((r: any) => r.downloadId && r.downloadId.toLowerCase() === hash);
                                    if (match) {
                                        await deleteFromSonarrQueue(sq.instance.url, sq.instance.api_key, match.id, true, true);
                                        handled = true;
                                        break;
                                    }
                                }
                            }

                            if (handled) {
                                unhandledHashes = unhandledHashes.filter(h => h !== hash);
                                totalCleaned++;
                            }
                        }
                    }

                    // Fallback to qbittorrent manual delete for any remaining
                    if (unhandledHashes.length > 0) {
                        await deleteTorrents(qb.url, cookie, unhandledHashes, deleteFiles);
                        totalCleaned += unhandledHashes.length;
                    }
                }
            } catch (instError) {
                console.error(`Failed to cleanup qBittorrent instance ${qb.name}:`, instError);
            }
        }

        return NextResponse.json({ success: true, message: `Auto-cleanup complete. Cleaned ${totalCleaned} torrents.` });

    } catch (error) {
        console.error('API /qbittorrent/auto-cleanup error:', error);
        return NextResponse.json({ error: 'Failed to run auto-cleanup' }, { status: 500 });
    }
}

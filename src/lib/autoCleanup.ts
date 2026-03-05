import { getInstances, getSetting, getTorrentActivity, updateTorrentActivity, deleteTorrentActivity } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents, deleteTorrents } from '@/lib/qbittorrent';
import { getQueue as getRadarrQueue, deleteFromQueue as deleteFromRadarrQueue } from '@/lib/radarr';
import { getQueue as getSonarrQueue, deleteFromQueue as deleteFromSonarrQueue } from '@/lib/sonarr';

export async function runAutoCleanup() {
    const enabled = getSetting('qbit_cleanup_enabled') === 'true';
    if (!enabled) {
        return { success: true, message: 'Auto-cleanup is disabled.' };
    }

    const stagnationMin = parseInt(getSetting('qbit_cleanup_stagnation_min') || '60');
    const deleteFiles = getSetting('qbit_cleanup_delete_files') !== 'false'; // default true
    const blacklist = getSetting('qbit_cleanup_blacklist') !== 'false'; // default true
    const sizeCleanupEnabled = getSetting('qbit_cleanup_max_size_enabled') === 'true';
    const maxSizeGb = parseInt(getSetting('qbit_cleanup_max_size_gb') || '100');
    const maxSizeBytes = maxSizeGb * 1024 * 1024 * 1024;

    const qbInstances = getInstances('qbittorrent', true);
    if (qbInstances.length === 0) {
        return { success: true, message: 'No active qBittorrent instances configured.' };
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

            // Identify items to remove (stalled, oversized, or stagnant progress)
            const toRemove = torrents.filter(t => {
                // 1. Max Size Check
                if (sizeCleanupEnabled && t.size > maxSizeBytes) {
                    return true;
                }

                // 2. Filter states: only consider downloading/stalled/meta states
                const monitoringStates = ['downloading', 'stalleddl', 'metadl', 'forceddl'];
                const currentState = t.state.toLowerCase();
                const isMonitoring = monitoringStates.some(s => currentState.includes(s));

                if (!isMonitoring) {
                    // Item is seeding, paused, or completed - ignore for stagnation
                    // Also delete tracking info to save space
                    deleteTorrentActivity(t.hash);
                    return false;
                }

                // 3. Progress Tracking
                const activity = getTorrentActivity(t.hash);
                const currentProgress = t.progress;

                if (!activity) {
                    // First time seeing this torrent, start tracking
                    updateTorrentActivity(t.hash, currentProgress, true); // initial timestamp
                    return false;
                }

                // If progress has changed, update tracking and reset timestamp
                if (currentProgress > activity.last_progress) {
                    updateTorrentActivity(t.hash, currentProgress, true);
                    return false;
                }

                // Progress hasn't changed. Check how long it's been since the last change.
                const lastChangeMs = new Date(activity.last_change + 'Z').getTime(); // Add Z for UTF
                const minutesSinceChange = (Date.now() - lastChangeMs) / (1000 * 60);

                return minutesSinceChange >= stagnationMin;
            });

            if (toRemove.length > 0) {
                let unhandledHashes = toRemove.map(t => t.hash.toLowerCase());

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

    return { success: true, message: `Auto-cleanup complete. Cleaned ${totalCleaned} torrents.` };
}

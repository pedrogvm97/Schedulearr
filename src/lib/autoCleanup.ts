import { getInstances, getSetting, getTorrentActivity, updateTorrentActivity, deleteTorrentActivity, logSearchHistory } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents, deleteTorrents } from '@/lib/qbittorrent';
import { getQueue as getRadarrQueue, deleteFromQueue as deleteFromRadarrQueue } from '@/lib/radarr';
import { getQueue as getSonarrQueue, deleteFromQueue as deleteFromSonarrQueue } from '@/lib/sonarr';

export async function runAutoCleanup() {
    const enabled = getSetting('qbit_cleanup_enabled') === 'true';
    if (!enabled) {
        return { success: true, message: 'Auto-cleanup is disabled.' };
    }

    const stagnationEnabled = getSetting('qbit_cleanup_stagnation_enabled') !== 'false'; // default true
    const stagnationMin = parseInt(getSetting('qbit_cleanup_stagnation_min') || '60');
    const deleteFiles = getSetting('qbit_cleanup_delete_files') !== 'false'; // default true
    const blacklist = getSetting('qbit_cleanup_blacklist') !== 'false'; // default true
    const sizeCleanupEnabled = getSetting('qbit_cleanup_max_size_enabled') === 'true';
    const maxSizeGb = parseInt(getSetting('qbit_cleanup_max_size_gb') || '15');
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
    const cleanupLogs: string[] = [];

    for (const qb of qbInstances) {
        try {
            const cookie = await authenticateQbittorrent(qb.url, qb.api_key);
            const torrents = await getActiveTorrents(qb.url, cookie);

            // Identify items to remove (stalled, oversized, or stagnant progress)
            const toRemoveWithReason: { torrent: any; reason: string }[] = [];

            for (const t of torrents) {
                // 1. Max Size Check
                if (sizeCleanupEnabled && t.size > maxSizeBytes) {
                    toRemoveWithReason.push({
                        torrent: t,
                        reason: `Oversized release (${(t.size / (1024 ** 3)).toFixed(2)}GB > ${maxSizeGb}GB)`
                    });
                    continue;
                }

                if (!stagnationEnabled) continue;

                // 2. Filter states: only consider downloading/stalled/meta states
                const monitoringStates = ['downloading', 'stalleddl', 'metadl', 'forceddl'];
                const currentState = t.state.toLowerCase();
                const isMonitoring = monitoringStates.some(s => currentState.includes(s));

                if (!isMonitoring) {
                    // Item is seeding, paused, or completed - ignore for stagnation
                    // Also delete tracking info to save space
                    deleteTorrentActivity(t.hash);
                    continue;
                }

                    // 3. Exclusion Check
                    const exclusions = getSetting('qbit_cleanup_exclusions')?.toLowerCase().split(',').map(s => s.trim()).filter(Boolean) || [];
                    const isExcluded = exclusions.some(ex => 
                        t.hash.toLowerCase().includes(ex) || 
                        t.category?.toLowerCase().includes(ex) || 
                        t.name.toLowerCase().includes(ex)
                    );

                    if (isExcluded) continue;

                    // 4. Progress Tracking
                    const activity = getTorrentActivity(t.hash);
                const currentProgress = t.progress;

                if (!activity) {
                    // First time seeing this torrent, start tracking
                    updateTorrentActivity(t.hash, currentProgress, true); // initial timestamp
                    continue;
                }

                // If progress has changed, update tracking and reset timestamp
                if (currentProgress > activity.last_progress) {
                    updateTorrentActivity(t.hash, currentProgress, true);
                    continue;
                }

                // Progress hasn't changed. Check how long it's been since the last change.
                const lastChangeMs = new Date(activity.last_change + 'Z').getTime(); // Add Z for UTF
                const minutesSinceChange = (Date.now() - lastChangeMs) / (1000 * 60);

                if (minutesSinceChange >= stagnationMin) {
                    toRemoveWithReason.push({
                        torrent: t,
                        reason: `Stagnant progress (${Math.floor(minutesSinceChange)}m without change)`
                    });
                }
            }

            if (toRemoveWithReason.length > 0) {
                for (const { torrent, reason } of toRemoveWithReason) {
                    let handled = false;
                    const hash = torrent.hash.toLowerCase();

                    if (blacklist) {
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
                    }

                    // Fallback to qbittorrent manual delete for any remaining or if blacklist is off
                    if (!handled) {
                        await deleteTorrents(qb.url, cookie, [hash], deleteFiles);
                    }

                    cleanupLogs.push(`[${torrent.name}] ${reason}`);
                    totalCleaned++;
                }
            }
        } catch (instError) {
            console.error(`Failed to cleanup qBittorrent instance ${qb.name}:`, instError);
        }
    }

    if (cleanupLogs.length > 0) {
        logSearchHistory('qBit Cleaner', [], [], `Removed ${totalCleaned} items: ${cleanupLogs.join(' | ')}`);
    }

    return { success: true, message: `Auto-cleanup complete. Cleaned ${totalCleaned} torrents.` };
}

export async function runSmartCleanup() {
    const qbInstances = getInstances('qbittorrent', true);
    if (qbInstances.length === 0) return { success: false, message: 'No active qBittorrent instances.' };

    const mode = getSetting('qbit_smart_clean_mode') || 'largest';
    const immunityEnabled = getSetting('qbit_smart_clean_immunity_enabled') === 'true';
    const immunityDays = parseInt(getSetting('qbit_smart_clean_immunity_days') || '7');
    const deleteFiles = getSetting('qbit_cleanup_delete_files') !== 'false';
    const blacklist = getSetting('qbit_cleanup_blacklist') !== 'false';

    const radarrInstances = getInstances('radarr', true);
    const sonarrInstances = getInstances('sonarr', true);

    const radarrQueues: any[] = [];
    for (const ri of radarrInstances) {
        try {
            const q = await getRadarrQueue(ri.url, ri.api_key);
            radarrQueues.push({ instance: ri, records: q });
        } catch {}
    }

    const sonarrQueues: any[] = [];
    for (const si of sonarrInstances) {
        try {
            const q = await getSonarrQueue(si.url, si.api_key);
            sonarrQueues.push({ instance: si, records: q });
        } catch {}
    }

    let cleanedCount = 0;
    const cleanedNames: string[] = [];

    for (const qb of qbInstances) {
        try {
            const cookie = await authenticateQbittorrent(qb.url, qb.api_key);
            const torrents = await getActiveTorrents(qb.url, cookie);

            // Filter candidates
            let candidates = [...torrents];

            // 1. Filter out recently added if immunity enabled
            if (immunityEnabled) {
                const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                candidates = candidates.filter(t => {
                    const addedOn = t.added_on ? t.added_on * 1000 : Date.now();
                    return addedOn < cutoff;
                });
            }

            // 2. Sort candidates
            if (mode === 'largest') {
                candidates.sort((a, b) => b.size - a.size);
            } else if (mode === 'oldest') {
                candidates.sort((a, b) => (a.added_on || 0) - (b.added_on || 0));
            } else if (mode === 'unplayed') {
                candidates = candidates.filter(t => t.progress < 1);
                candidates.sort((a, b) => (a.added_on || 0) - (b.added_on || 0));
            }

            const target = candidates[0];
            if (!target) continue;

            let handled = false;
            const hash = target.hash.toLowerCase();

            if (blacklist) {
                for (const rq of radarrQueues) {
                    const match = rq.records.find((r: any) => r.downloadId && r.downloadId.toLowerCase() === hash);
                    if (match) {
                        await deleteFromRadarrQueue(rq.instance.url, rq.instance.api_key, match.id, true, true);
                        handled = true;
                        break;
                    }
                }

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
            }

            if (!handled) {
                await deleteTorrents(qb.url, cookie, [hash], deleteFiles);
            }

            cleanedNames.push(target.name);
            cleanedCount++;

        } catch (e: any) {
            console.error('Smart cleanup error for instance ' + qb.name, e);
        }
    }

    if (cleanedCount > 0) {
        return { success: true, message: `Removed ${cleanedCount} torrents: ${cleanedNames.join(', ')}` };
    }

    return { success: true, message: 'No eligible torrents found to clean.' };
}


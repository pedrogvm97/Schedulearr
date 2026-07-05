import { getInstances, getSetting, getTorrentActivity, updateTorrentActivity, deleteTorrentActivity, logSearchHistory } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents, deleteTorrents } from '@/lib/qbittorrent';
import { getQueue as getRadarrQueue, deleteFromQueue as deleteFromRadarrQueue, getAllMovies, deleteMovie } from '@/lib/radarr';
import { getQueue as getSonarrQueue, deleteFromQueue as deleteFromSonarrQueue, getAllSeries, deleteSeries, getEpisodeFiles, deleteSeason, deleteEpisodeFile } from '@/lib/sonarr';
import { getPlexWatchStatusMap } from '@/lib/plex';

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
        logSearchHistory('qBit Cleaner', [], [], `Removed ${totalCleaned} items: ${cleanupLogs.join(' | ')}`, 'qbit_clean');
    }

    return { success: true, message: `Auto-cleanup complete. Cleaned ${totalCleaned} torrents.` };
}

async function fetchDiskSpace(url: string, apiKey: string): Promise<any[]> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/diskspace?apiKey=${apiKey}`, {
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

async function fetchRootFolders(url: string, apiKey: string): Promise<any[]> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/rootfolder?apiKey=${apiKey}`, {
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export async function getDiskUsagePercent(): Promise<number> {
    const radarrs = getInstances('radarr', true);
    const sonarrs = getInstances('sonarr', true);

    let totalFreeBytes = 0;
    let totalBytes = 0;
    const byInstance: any[] = [];

    for (const inst of [...radarrs, ...sonarrs]) {
        let folders = await fetchDiskSpace(inst.url, inst.api_key);
        if (folders.length === 0) {
            folders = await fetchRootFolders(inst.url, inst.api_key);
        }
        const instFolders = folders.map((f: any) => {
            const free = f.freeSpace ?? 0;
            let total = f.totalSpace ?? 0;
            if (total < free) {
                total = free;
            }
            return {
                path: f.path,
                freeBytes: free,
                totalBytes: total
            };
        });

        const instFree = instFolders.reduce((s: number, f: any) => s + f.freeBytes, 0);
        const instTotal = instFolders.reduce((s: number, f: any) => s + f.totalBytes, 0);

        totalFreeBytes += instFree;
        totalBytes += instTotal;

        byInstance.push({
            folders: instFolders
        });
    }

    const uniqueInstances = new Map<number, any>();
    for (const inst of byInstance) {
        const total = inst.folders.reduce((s: number, f: any) => s + f.totalBytes, 0);
        if (!uniqueInstances.has(total) || inst.folders.some((f: any) => f.totalBytes > 0)) {
            uniqueInstances.set(total, inst);
        }
    }

    const deduped = Array.from(uniqueInstances.values());
    const dedupedTotal = deduped.reduce((s, inst) => s + inst.folders.reduce((fs: number, f: any) => fs + f.totalBytes, 0), 0);
    const dedupedFree = deduped.reduce((s, inst) => s + inst.folders.reduce((fs: number, f: any) => fs + f.freeBytes, 0), 0);
    const dedupedUsed = dedupedTotal - dedupedFree;
    return dedupedTotal > 0 ? Math.round((dedupedUsed / dedupedTotal) * 100) : 0;
}

export async function runSmartCleanup() {
    const radarrInstances = getInstances('radarr', true);
    const sonarrInstances = getInstances('sonarr', true);

    if (radarrInstances.length === 0 && sonarrInstances.length === 0) {
        return { success: false, message: 'No active Radarr or Sonarr instances.' };
    }

    const mode = getSetting('qbit_smart_clean_mode') || 'largest';
    const immunityEnabled = getSetting('qbit_smart_clean_immunity_enabled') === 'true';
    const immunityDays = parseInt(getSetting('qbit_smart_clean_immunity_days') || '7');
    const seriesLevel = (getSetting('media_smart_clean_series_level') || 'series') as 'series' | 'season' | 'episode';

    let cleanedCount = 0;
    const cleanedNames: string[] = [];

    // Load the ignore list of media keys
    const ignoredKeysStr = getSetting('media_smart_clean_ignored_keys') || '[]';
    let ignoredKeys: string[] = [];
    try {
        ignoredKeys = JSON.parse(ignoredKeysStr);
    } catch {
        ignoredKeys = [];
    }
    const ignoredSet = new Set(ignoredKeys.map(k => k.toLowerCase()));

    // Get configured threshold
    const thresholdStr = getSetting('disk_pause_threshold');
    const threshold = thresholdStr ? parseInt(thresholdStr) : 90;

    let currentUsage = await getDiskUsagePercent();
    console.log(`[SMART CLEANUP] Initial checking: Disk usage at ${currentUsage}%, threshold is ${threshold}%`);

    if (currentUsage < threshold) {
        return { success: true, message: `Disk usage (${currentUsage}%) is below threshold (${threshold}%). No clean needed.` };
    }

    // Accumulate all candidates globally from all active Radarr/Sonarr instances
    const allCandidates: {
        id: number;
        title: string;
        type: 'movie' | 'series' | 'season' | 'episode';
        size: number;
        added: string;
        path: string;
        instanceId: string;
        instanceName: string;
        key: string;
        instance: any;
        tmdbId?: number;
        tvdbId?: number;
        // For season/episode deletions
        seriesId?: number;
        seasonNumber?: number;
        episodeFileId?: number;
    }[] = [];

    // Gather movies
    for (const inst of radarrInstances) {
        try {
            const movies = await getAllMovies(inst.url, inst.api_key);
            for (const m of movies) {
                const size = m.sizeOnDisk || m.statistics?.sizeOnDisk || m.movieFile?.size || 0;
                if (size === 0) continue;

                const key = `movie-${inst.id}-${m.id}`.toLowerCase();
                if (ignoredSet.has(key)) continue;

                if (immunityEnabled) {
                    const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                    if (new Date(m.added).getTime() >= cutoff) continue;
                }

                allCandidates.push({
                    id: m.id, title: m.title, type: 'movie', size,
                    added: m.added, path: m.path || m.folder || '',
                    instanceId: inst.id, instanceName: inst.name,
                    key, instance: inst, tmdbId: m.tmdbId
                });
            }
        } catch (e) {
            console.error(`Failed to fetch movies from Radarr instance ${inst.name}:`, e);
        }
    }

    // Gather series — split by granularity level
    for (const inst of sonarrInstances) {
        try {
            const series = await getAllSeries(inst.url, inst.api_key);
            for (const s of series) {
                if (seriesLevel === 'series') {
                    const size = s.statistics?.sizeOnDisk || s.sizeOnDisk || 0;
                    if (size === 0) continue;
                    const key = `series-${inst.id}-${s.id}`.toLowerCase();
                    if (ignoredSet.has(key)) continue;
                    if (immunityEnabled) {
                        const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                        if (new Date(s.added).getTime() >= cutoff) continue;
                    }
                    allCandidates.push({
                        id: s.id, title: s.title, type: 'series',
                        size, added: s.added, path: s.path || '',
                        instanceId: inst.id, instanceName: inst.name,
                        key, instance: inst, tvdbId: s.tvdbId
                    });
                } else {
                    // Season or Episode level — fetch individual files
                    const epFiles = await getEpisodeFiles(inst.url, inst.api_key, s.id);
                    if (!epFiles.length) continue;

                    if (seriesLevel === 'season') {
                        // Group by season
                        const bySeasonMap = new Map<number, typeof epFiles>();
                        for (const f of epFiles) {
                            const sn = f.seasonNumber ?? 0;
                            if (!bySeasonMap.has(sn)) bySeasonMap.set(sn, []);
                            bySeasonMap.get(sn)!.push(f);
                        }
                        for (const [seasonNum, files] of bySeasonMap.entries()) {
                            const size = files.reduce((acc, f) => acc + (f.size || 0), 0);
                            if (size === 0) continue;
                            const key = `season-${inst.id}-${s.id}-${seasonNum}`.toLowerCase();
                            if (ignoredSet.has(key)) continue;
                            if (immunityEnabled) {
                                const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                                if (new Date(s.added).getTime() >= cutoff) continue;
                            }
                            allCandidates.push({
                                id: s.id,
                                title: `${s.title} — Season ${seasonNum}`,
                                type: 'season',
                                size, added: s.added, path: s.path || '',
                                instanceId: inst.id, instanceName: inst.name,
                                key, instance: inst, tvdbId: s.tvdbId,
                                seriesId: s.id, seasonNumber: seasonNum
                            });
                        }
                    } else if (seriesLevel === 'episode') {
                        for (const f of epFiles) {
                            const size = f.size || 0;
                            if (size === 0) continue;
                            const key = `episode-${inst.id}-${s.id}-${f.id}`.toLowerCase();
                            if (ignoredSet.has(key)) continue;
                            if (immunityEnabled) {
                                const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                                if (new Date(s.added).getTime() >= cutoff) continue;
                            }
                            const ep = f.episodes?.[0];
                            const epLabel = ep
                                ? `S${String(f.seasonNumber).padStart(2,'0')}E${String(ep.episodeNumber).padStart(2,'0')} - ${ep.title || 'Episode'}`
                                : `S${String(f.seasonNumber).padStart(2,'0')}`;
                            allCandidates.push({
                                id: f.id,
                                title: `${s.title} — ${epLabel}`,
                                type: 'episode',
                                size, added: f.dateAdded || s.added, path: f.relativePath || '',
                                instanceId: inst.id, instanceName: inst.name,
                                key, instance: inst, tvdbId: s.tvdbId,
                                seriesId: s.id, seasonNumber: f.seasonNumber, episodeFileId: f.id
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to fetch series from Sonarr instance ${inst.name}:`, e);
        }
    }

    // Sort candidates
    if (mode === 'largest') {
        allCandidates.sort((a, b) => b.size - a.size);
    } else if (mode === 'oldest') {
        allCandidates.sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());
    } else if (mode === 'unplayed') {
        const plexInstances = getInstances('plex', true);
        let plexWatchMap = new Map<string, boolean>();
        if (plexInstances.length > 0) {
            plexWatchMap = await getPlexWatchStatusMap(plexInstances[0].url, plexInstances[0].api_key);
        }
        let unplayed = allCandidates.filter(c => {
            const titleYearKey = `${c.title.toLowerCase()}-${c.added ? new Date(c.added).getFullYear() : ''}`;
            const tmdbKey = c.tmdbId ? `tmdb://${c.tmdbId}`.toLowerCase() : '';
            const tvdbKey = c.tvdbId ? `tvdb://${c.tvdbId}`.toLowerCase() : '';
            const isWatched =
                (tmdbKey && plexWatchMap.get(tmdbKey) === true) ||
                (tvdbKey && plexWatchMap.get(tvdbKey) === true) ||
                plexWatchMap.get(titleYearKey) === true;
            return !isWatched;
        });
        unplayed.sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());
        allCandidates.length = 0;
        allCandidates.push(...unplayed);
    }

    // Loop and delete until below threshold (capped at 10)
    let candidateIndex = 0;
    const maxDeletions = 10;

    while (currentUsage >= threshold && candidateIndex < allCandidates.length && cleanedCount < maxDeletions) {
        const candidate = allCandidates[candidateIndex];
        candidateIndex++;

        try {
            console.log(`[SMART CLEANUP] Deleting ${candidate.type} "${candidate.title}" (${(candidate.size / (1024 ** 3)).toFixed(2)} GB) from ${candidate.instanceName}`);

            let success = false;
            if (candidate.type === 'movie') {
                success = await deleteMovie(candidate.instance.url, candidate.instance.api_key, candidate.id, true);
            } else if (candidate.type === 'series') {
                success = await deleteSeries(candidate.instance.url, candidate.instance.api_key, candidate.id, true);
            } else if (candidate.type === 'season') {
                success = await deleteSeason(candidate.instance.url, candidate.instance.api_key, candidate.seriesId!, candidate.seasonNumber!);
            } else if (candidate.type === 'episode') {
                success = await deleteEpisodeFile(candidate.instance.url, candidate.instance.api_key, candidate.episodeFileId!);
            }

            if (success) {
                cleanedNames.push(candidate.title);
                cleanedCount++;
                await new Promise(resolve => setTimeout(resolve, 3500));
                currentUsage = await getDiskUsagePercent();
                console.log(`[SMART CLEANUP] Deleted "${candidate.title}". New usage: ${currentUsage}%. Threshold: ${threshold}%`);
            } else {
                console.error(`[SMART CLEANUP] Delete API returned failure for "${candidate.title}"`);
            }
        } catch (e: any) {
            console.error(`Smart cleanup error deleting ${candidate.title}:`, e);
        }
    }

    if (cleanedCount > 0) {
        const message = `Smart Clean deleted ${cleanedCount} items: [${cleanedNames.join(', ')}]. Remaining disk usage: ${currentUsage}%.`;
        logSearchHistory('Smart Cleaner', [], [], message, 'media_clean');
        return { success: true, message };
    }

    return { success: true, message: 'No eligible library items were deleted.' };
}




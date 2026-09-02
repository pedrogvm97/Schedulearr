import { getInstances, getSetting, logSearchHistory, getSchedulerConfig, getSchedulerTracking, incrementSchedulerAttempt } from '@/lib/db';
import { getAllMovies, triggerMovieSearch, RadarrMovie, getQueue as getRadarrQueue } from '@/lib/radarr';
import { getAllSeries, getMissingEpisodes, triggerEpisodeSearch, SonarrSeries, getQueue as getSonarrQueue } from '@/lib/sonarr';
import { getIndexerHealth } from '@/lib/prowlarr';
import { evaluateIndexerRules } from '@/lib/indexerAutomations';
import { runAutoCleanup, runSmartCleanup, checkAndCleanIndividualLibraries } from '@/lib/autoCleanup';
import axios from 'axios';

// Prevent multiple scheduler instances from running in dev mode HMR
declare global {
    var globalSchedulerRunning: boolean | undefined;
    var globalNextSchedulerRun: number | null;
}

import { startSpeedMonitor } from '@/lib/speedMonitor';
import { performStartupContainerCleanup } from '@/lib/docker';
import { checkAndRunScheduledEpgSyncs } from '@/lib/iptvEpgSync';

if (!global.globalSchedulerRunning && process.env.NEXT_PHASE !== 'phase-production-build') {
    global.globalSchedulerRunning = true;

    // Run container cleanup handoff on boot
    performStartupContainerCleanup().catch(() => {});

    const startScheduler = () => {
        console.log('🏁 Schedulearr background orchestrator started.');
        
        // Start network speed monitor with dynamic interval
        const { networkInterval } = getSchedulerConfig();
        startSpeedMonitor(networkInterval || 30);

        const runCycle = async () => {
            const now = new Date().toISOString();
            console.log(`[${now}] 🕒 Schedulearr running automated batch...`);
            try {
                await evaluateIndexerRules();
                await runBatchSearch();
            } catch (error) {
                console.error('❌ Scheduler error:', error);
            }

            // Fetch dynamic interval from database
            const { interval } = getSchedulerConfig();
            // Default 30 min if missing or invalid, with a minimum of 1 minute to prevent CPU spinning
            const validInterval = (!interval || isNaN(interval) || interval < 1) ? 30 : interval;
            const intervalMs = validInterval * 60 * 1000;

            global.globalNextSchedulerRun = Date.now() + intervalMs;
            setTimeout(runCycle, intervalMs);
        };

        // Start the first full search cycle after a short 5-second delay to let the server start up
        global.globalNextSchedulerRun = Date.now() + 5000;
        setTimeout(runCycle, 5000);

        // Auto-cleanup background orchestrator
        const runCleanupCycle = async () => {
            const now = new Date().toISOString();
            console.log(`[${now}] 🧹 Running automated qBittorrent cleanup...`);
            try {
                await runAutoCleanup();
                
                const autocleanEnabled = getSetting('disk_autoclean_enabled') === 'true';
                if (autocleanEnabled) {
                    console.log(`[${now}] 🧹 Running Smart Auto-Clean disk guard...`);
                    await runSmartCleanup();
                }
                
                // Check and enforce individual library storage limits
                await checkAndCleanIndividualLibraries();
            } catch (error) {
                console.error('❌ Auto-cleanup error:', error);
            }

            const intervalStr = getSetting('qbit_cleanup_interval_min');
            const intervalMin = intervalStr ? parseInt(intervalStr) : 15;
            const validInterval = (isNaN(intervalMin) || intervalMin < 1) ? 15 : intervalMin;
            const intervalMs = validInterval * 60 * 1000;

            setTimeout(runCleanupCycle, intervalMs);
        };
        setTimeout(runCleanupCycle, 15000); // Start 15s after boot

        // Automated EPG Guide sync background checker (checks every 10 minutes)
        const runEpgCycle = async () => {
            try {
                await checkAndRunScheduledEpgSyncs();
            } catch (err) {
                console.error('❌ Scheduled EPG sync checker error:', err);
            }
            setTimeout(runEpgCycle, 10 * 60 * 1000);
        };
        setTimeout(runEpgCycle, 20000); // Start 20s after boot
    };

    startScheduler();
}

export function getNextSchedulerRun() {
    return global.globalNextSchedulerRun || null;
}

export async function runBatchSearch(manualTrigger: boolean = false) {
    const defaultRes = { success: false, reason: '', movies: [], episodes: [] };
    const config = getSchedulerConfig();

    if (!config.enabled && !manualTrigger) {
        if (process.env.NODE_ENV !== 'production') {
            console.log('[SCHEDULER] Skipping execution because it is disabled in config.');
        }
        return defaultRes;
    }

    // ── 1. Independent Smart Auto-Clean Step ───────────────────────────────────
    try {
        const autocleanEnabled = getSetting('disk_autoclean_enabled') === 'true' || getSetting('storage_guard_autoclean_enabled') === 'true';
        if (autocleanEnabled) {
            const cleanThresholdStr = getSetting('disk_autoclean_threshold') || getSetting('storage_guard_autoclean_threshold') || getSetting('disk_pause_threshold') || '90';
            const cleanThreshold = parseInt(cleanThresholdStr) || 90;
            const { getDiskUsagePercent, runSmartCleanup } = require('@/lib/autoCleanup');
            const usedPercent = await getDiskUsagePercent();
            if (usedPercent >= cleanThreshold) {
                console.log(`[AUTO-CLEAN] ${usedPercent}% used ≥ ${cleanThreshold}% threshold. Triggering media cleanup...`);
                try {
                    await runSmartCleanup();
                } catch (cleanErr: any) {
                    console.error('❌ Smart Auto-Clean failed:', cleanErr.message);
                }
            }
        }
    } catch (e) {}

    // ── 2. Independent Search Pause Step ───────────────────────────────────────
    try {
        const diskGuardEnabled = getSetting('disk_pause_enabled') === 'true' || getSetting('storage_guard_pause_scheduler') === 'true';
        if (diskGuardEnabled) {
            const thresholdStr = getSetting('disk_pause_threshold') || getSetting('storage_guard_pause_threshold');
            const threshold = thresholdStr ? parseInt(thresholdStr) : 90;
            if (!isNaN(threshold) && threshold > 0) {
                const { getDiskUsagePercent } = require('@/lib/autoCleanup');
                const usedPercent = await getDiskUsagePercent();
                if (usedPercent >= threshold) {
                    const reason = `Disk guard: ${usedPercent}% used ≥ ${threshold}% threshold. Skipping search batch.`;
                    console.warn(`⚠️  [SCHEDULER] ${reason}`);
                    logSearchHistory('disk_guard', [], [], reason, 'disk_guard');
                    defaultRes.reason = reason;
                    return defaultRes;
                }
            }
        }
    } catch (diskErr) {
        console.warn('[SCHEDULER] Could not check disk usage, proceeding anyway:', diskErr);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const prowlarrs = getInstances('prowlarr');
    const { batchBehavior, maxAttempts, batchSize: configBatchSize } = config;

    let allowedBatchSize = configBatchSize || 10;
    const profile = getSetting('priority_profile') || 'recently_added';

    // 1. Check Prowlarr health first to avoid bans
    if (prowlarrs.length > 0) {
        const health = await getIndexerHealth(prowlarrs[0].url, prowlarrs[0].api_key);
        if (!health.allHealthy) {
            console.log('⚠️ Prowlarr indexers are unhealthy. Throttling batch size to 1 to avoid bans.');
            allowedBatchSize = 1;
        }
    } else {
        console.log('⚠️ No Prowlarr instance configured. Running blindly without health checks.');
    }

    // 2. Fetch ALL items to evaluate priority (from ENABLED instances only)
    const radarrs = getInstances('radarr', true);
    const sonarrs = getInstances('sonarr', true);
    const lidarrs = getInstances('lidarr', true);

    if (radarrs.length === 0 && sonarrs.length === 0 && lidarrs.length === 0) {
        defaultRes.reason = 'No Radarr, Sonarr, or Lidarr instances configured';
        logSearchHistory(profile, [], [], defaultRes.reason, 'scheduler');
        return defaultRes;
    }

    let allMovieTargets: any[] = [];

    // Radarr Movies
    for (const r of radarrs) {
        try {
            const [allMovies, queue] = await Promise.all([
                getAllMovies(r.url, r.api_key),
                getRadarrQueue(r.url, r.api_key)
            ]);
            const queuedMovieIds = new Set(queue.map(q => q.movieId));

            // Only target missing, published, monitored movies, AND NOT in the downloading queue
            const missing = allMovies.filter(m => !m.hasFile && m.monitored && m.isAvailable && !queuedMovieIds.has(m.id));

            for (const m of missing) {
                const tracking = getSchedulerTracking(m.id.toString(), r.id!, 'movie');
                const relDate = m.digitalRelease || m.physicalRelease || m.inCinemas;
                const relTime = relDate ? new Date(relDate).getTime() : 0;
                const now = Date.now();
                const isRecentlyReleased = relTime > 0 && relTime <= now && (now - relTime) <= (14 * 24 * 60 * 60 * 1000);

                allMovieTargets.push({
                    id: m.id,
                    apiUrl: r.url,
                    apiKey: r.api_key,
                    instanceId: r.id,
                    movie: m,
                    attempts: tracking?.attempts || 0,
                    isRecentlyReleased
                });
            }
        } catch (err) {
            console.error(`❌ [SCHEDULER] Error fetching from Radarr instance ${r.url}:`, err);
        }
    }

    let allEpTargets: any[] = [];

    // Sonarr Episodes
    for (const s of sonarrs) {
        try {
            const [missingEpisodes, queue] = await Promise.all([
                getMissingEpisodes(s.url, s.api_key),
                getSonarrQueue(s.url, s.api_key)
            ]);
            const queuedEpisodeIds = new Set(queue.map(q => q.episodeId));

            for (const ep of missingEpisodes) {
                if (ep.monitored && !ep.hasFile && !queuedEpisodeIds.has(ep.id)) {
                    const tracking = getSchedulerTracking(ep.id.toString(), s.id!, 'episode');
                    const airTime = ep.airDateUtc ? new Date(ep.airDateUtc).getTime() : 0;
                    const now = Date.now();
                    // Detect if newly aired or schedule release has arrived
                    const isRecentlyAired = airTime > 0 && airTime <= now && (now - airTime) <= (14 * 24 * 60 * 60 * 1000);

                    allEpTargets.push({
                        id: ep.id,
                        apiUrl: s.url,
                        apiKey: s.api_key,
                        instanceId: s.id,
                        seriesInfo: ep.seriesInfo,
                        seriesTitle: ep.seriesTitle,
                        seasonNumber: ep.seasonNumber,
                        episodeNumber: ep.episodeNumber,
                        airDateUtc: ep.airDateUtc,
                        attempts: tracking?.attempts || 0,
                        isRecentlyAired
                    });
                }
            }
        } catch (err) {
            console.error(`❌ [SCHEDULER] Error fetching missing episodes from Sonarr instance ${s.url}:`, err);
        }
    }

    let allMusicTargets: any[] = [];

    // Lidarr Music Albums
    for (const l of lidarrs) {
        try {
            const lidarrUrl = l.url.replace(/\/$/, '');
            const res = await axios.get(`${lidarrUrl}/api/v1/wanted/missing?page=1&pageSize=20&sortKey=releaseDate&sortDirection=descending`, {
                headers: { 'X-Api-Key': l.api_key },
                timeout: 6000
            });
            if (res.data?.records && Array.isArray(res.data.records)) {
                for (const album of res.data.records) {
                    allMusicTargets.push({
                        id: album.id,
                        apiUrl: lidarrUrl,
                        apiKey: l.api_key,
                        instanceId: l.id,
                        album,
                        title: `${album.artist?.artistName || 'Artist'} - ${album.title || 'Album'}`
                    });
                }
            }
        } catch (err) {
            console.error(`❌ [SCHEDULER] Error fetching missing albums from Lidarr instance ${l.url}:`, err);
        }
    }

    // 3. UI Frontend Filters Integration
    try {
        const uiSelectedGenresRaw = getSetting('ui_selected_genres');
        const uiGenreLogic = getSetting('ui_genre_logic') || 'OR';
        const uiInstanceFiltersRaw = getSetting('ui_instance_filters');
        const uiSearchTogglesRaw = getSetting('ui_search_toggles');

        const selectedGenres: string[] = uiSelectedGenresRaw ? JSON.parse(uiSelectedGenresRaw) : ['All'];
        const instanceFilters: Record<string, boolean> = uiInstanceFiltersRaw ? JSON.parse(uiInstanceFiltersRaw) : {};
        const searchToggles: Record<string, boolean> = uiSearchTogglesRaw ? JSON.parse(uiSearchTogglesRaw) : {};

        console.log(`[FILTER] Applying Frontend Constraints. Genres: ${selectedGenres.length > 1 ? selectedGenres.length : 'All'} | Logic: ${uiGenreLogic}`);

        // Define a universal filter function that mimics the frontend's visual culling logic
        const applyFilters = (targets: any[], type: 'movie' | 'series') => {
            return targets.filter(t => {
                const mediaId = type === 'movie' ? t.movie.id : (t.seriesInfo?.id || t.id);
                const idStr = `${type}-${t.instanceId}-${mediaId}`;

                // Explicit Pause Toggle Filter
                if (searchToggles[idStr] === false) return false;

                // Media Instance Filter by Instance ID
                if (t.instanceId && instanceFilters[t.instanceId] === false) return false;

                // Genre Logic Filter
                if (!selectedGenres.includes('All')) {
                    const itemGenres = type === 'movie' ? t.movie.genres : t.seriesInfo?.genres;
                    if (!itemGenres || !Array.isArray(itemGenres)) return false;

                    if (uiGenreLogic === 'OR') {
                        if (!itemGenres.some(g => selectedGenres.includes(g))) return false;
                    } else if (uiGenreLogic === 'AND') {
                        if (!selectedGenres.every(g => itemGenres.includes(g))) return false;
                    } else if (uiGenreLogic === 'EXCLUDE') {
                        if (itemGenres.some(g => selectedGenres.includes(g))) return false;
                    }
                }

                return true;
            });
        };

        const initialMovieCount = allMovieTargets.length;
        const initialEpCount = allEpTargets.length;

        allMovieTargets = applyFilters(allMovieTargets, 'movie');
        allEpTargets = applyFilters(allEpTargets, 'series');

        console.log(`[FILTER] Eliminated ${initialMovieCount - allMovieTargets.length} movies and ${initialEpCount - allEpTargets.length} episodes via UI constraints.`);

    } catch (filterError) {
        console.error('❌ Scheduler UI filter parsing failed. Falling back to unprotected raw prioritization.', filterError);
    }

    // 4. Priority Engine Sorting (Incorporating Rotate logic and Immediate Search for Newly Aired/Released)
    const sortWithRotation = (a: any, b: any, prioritySort: number) => {
        // Newly aired episodes / newly released movies always jump to the front regardless of attempts
        const aRecent = a.isRecentlyAired || a.isRecentlyReleased;
        const bRecent = b.isRecentlyAired || b.isRecentlyReleased;
        if (aRecent && !bRecent) return -1;
        if (!aRecent && bRecent) return 1;

        if (batchBehavior === 'rotate') {
            const aExceeded = a.attempts >= maxAttempts;
            const bExceeded = b.attempts >= maxAttempts;
            if (aExceeded && !bExceeded) return 1;
            if (!aExceeded && bExceeded) return -1;
            if (a.attempts !== b.attempts) return a.attempts - b.attempts; // Fewer attempts first
        }
        return prioritySort;
    };

    if (profile === 'recently_released') {
        allMovieTargets.sort((a, b) => {
            const dateA = a.movie.physicalRelease || a.movie.digitalRelease || a.movie.inCinemas || "1970-01-01";
            const dateB = b.movie.physicalRelease || b.movie.digitalRelease || b.movie.inCinemas || "1970-01-01";
            const prio = new Date(dateB).getTime() - new Date(dateA).getTime();
            return sortWithRotation(a, b, prio);
        });
        allEpTargets.sort((a, b) => {
            const prio = new Date(b.airDateUtc || "1970-01-01").getTime() - new Date(a.airDateUtc || "1970-01-01").getTime();
            return sortWithRotation(a, b, prio);
        });
    } else if (profile === 'nearly_complete') {
        allEpTargets.sort((a, b) => {
            const pctA = a.seriesInfo?.statistics?.percentOfEpisodes || 0;
            const pctB = b.seriesInfo?.statistics?.percentOfEpisodes || 0;
            const prio = pctB - pctA;
            return sortWithRotation(a, b, prio);
        });
        allMovieTargets.sort((a, b) => {
            const prio = new Date(b.movie.added).getTime() - new Date(a.movie.added).getTime();
            return sortWithRotation(a, b, prio);
        });
    } else if (profile === 'random') {
        allMovieTargets.sort((a, b) => sortWithRotation(a, b, Math.random() - 0.5));
        allEpTargets.sort((a, b) => sortWithRotation(a, b, Math.random() - 0.5));
    } else {
        // recently_added
        allMovieTargets.sort((a, b) => {
            const prio = new Date(b.movie.added).getTime() - new Date(a.movie.added).getTime();
            return sortWithRotation(a, b, prio);
        });
        allEpTargets.sort((a, b) => {
            const addedA = a.seriesInfo?.added || new Date().toISOString();
            const addedB = b.seriesInfo?.added || new Date().toISOString();
            const prio = new Date(addedB).getTime() - new Date(addedA).getTime();
            return sortWithRotation(a, b, prio);
        });
    }

    // 5. Select the batch (Dynamically shift unused allowance to the other type)
    let maxMovies = Math.floor(allowedBatchSize / 2);
    let maxSeries = Math.ceil(allowedBatchSize / 2);

    let moviesAvailable = allMovieTargets.length;
    let seriesAvailable = allEpTargets.length;

    let moviesNeeded = Math.min(moviesAvailable, maxMovies);
    let seriesNeeded = Math.min(seriesAvailable, maxSeries);

    let movieShortfall = maxMovies - moviesNeeded;
    let seriesShortfall = maxSeries - seriesNeeded;

    const movieBatch = allMovieTargets.slice(0, moviesNeeded + seriesShortfall);
    const epBatch = allEpTargets.slice(0, seriesNeeded + movieShortfall);

    // 6. Trigger the searches
    const radarrGroups = movieBatch.reduce((acc, curr) => {
        if (!acc[curr.apiUrl]) acc[curr.apiUrl] = { key: curr.apiKey, ids: [] };
        acc[curr.apiUrl].ids.push(curr.id);
        return acc;
    }, {} as Record<string, { key: string, ids: number[] }>);

    const triggeredMovies = [];
    for (const [url, data] of Object.entries(radarrGroups) as [string, any][]) {
        if (data.ids.length > 0) {
            console.log(`🎬 Triggering search for ${data.ids.length} movies on Radarr at ${url} using ${profile} profile`);
            try {
                await triggerMovieSearch(url, data.key, data.ids);
                triggeredMovies.push(...data.ids);

                // Increment attempts for each movie in this batch
                for (const id of data.ids) {
                    const target = movieBatch.find(m => m.id === id);
                    if (target) incrementSchedulerAttempt(id.toString(), target.instanceId, 'movie');
                }
            } catch (err) {
                console.error(`❌ [SCHEDULER] Failed to trigger movie search on Radarr at ${url}:`, err);
            }
        }
    }

    const sonarrGroups = epBatch.reduce((acc, curr) => {
        if (!acc[curr.apiUrl]) acc[curr.apiUrl] = { key: curr.apiKey, ids: [] };
        acc[curr.apiUrl].ids.push(curr.id);
        return acc;
    }, {} as Record<string, { key: string, ids: number[] }>);

    const triggeredEpisodes = [];
    for (const [url, data] of Object.entries(sonarrGroups) as [string, any][]) {
        if (data.ids.length > 0) {
            console.log(`📺 Triggering search for ${data.ids.length} episodes on Sonarr at ${url} using ${profile} profile`);
            try {
                await triggerEpisodeSearch(url, data.key, data.ids);
                triggeredEpisodes.push(...data.ids);

                // Increment attempts for each episode in this batch
                for (const id of data.ids) {
                    const target = epBatch.find(e => e.id === id);
                    if (target) incrementSchedulerAttempt(id.toString(), target.instanceId, 'episode');
                }
            } catch (err) {
                console.error(`❌ [SCHEDULER] Failed to trigger episode search on Sonarr at ${url}:`, err);
            }
        }
    }

    // Lidarr Music Search Execution
    const musicBatch = allMusicTargets.slice(0, Math.max(1, Math.floor(allowedBatchSize / 3)));
    const lidarrGroups = musicBatch.reduce((acc, curr) => {
        if (!acc[curr.apiUrl]) acc[curr.apiUrl] = { key: curr.apiKey, ids: [] };
        acc[curr.apiUrl].ids.push(curr.id);
        return acc;
    }, {} as Record<string, { key: string, ids: number[] }>);

    for (const [url, data] of Object.entries(lidarrGroups) as [string, any][]) {
        if (data.ids.length > 0) {
            console.log(`🎵 Triggering search for ${data.ids.length} albums on Lidarr at ${url}`);
            try {
                await axios.post(`${url}/api/v1/command`, {
                    name: 'AlbumSearch',
                    albumIds: data.ids
                }, {
                    headers: { 'X-Api-Key': data.key },
                    timeout: 8000
                });
            } catch (err) {
                console.error(`❌ [SCHEDULER] Failed to trigger album search on Lidarr at ${url}:`, err);
            }
        }
    }

    const mTitles = movieBatch.map(m => m.movie.title);
    const eTitles = epBatch.map(e => e.seriesInfo?.title ? `${e.seriesInfo.title} (S${e.seasonNumber || '?'}E${e.episodeNumber || '?'})` : e.seriesTitle ? `${e.seriesTitle} (Episode ID: ${e.id})` : `Episode ID: ${e.id}`);
    const muTitles = musicBatch.map(mu => mu.title);

    // Log the success to the interactive history ledger
    if (mTitles.length > 0 || eTitles.length > 0 || muTitles.length > 0) {
        console.log(`✅ Batch complete. Triggered ${mTitles.length} movies, ${eTitles.length} episodes, ${muTitles.length} albums.`);
        logSearchHistory(profile, [...mTitles, ...muTitles], eTitles, `Successfully triggered background priority searches.`, 'search');
    } else {
        console.log('ℹ️  No missing media matched priority criteria. Skipping triggers.');
        logSearchHistory(profile, [], [], `No missing media matched priority criteria. Queue is fully downloaded.`, 'scheduler');
    }

    return {
        success: true,
        movies: mTitles,
        episodes: eTitles,
        albums: muTitles
    };
}

// Export a dummy object to satisfy Next.js if this file is imported elsewhere
export const scheduler = { active: true };

import { getInstances, getSetting, logSearchHistory, getSchedulerConfig, getSchedulerTracking, incrementSchedulerAttempt } from '@/lib/db';
import { getAllMovies, triggerMovieSearch, RadarrMovie, getQueue as getRadarrQueue } from '@/lib/radarr';
import { getAllSeries, triggerEpisodeSearch, SonarrSeries, getQueue as getSonarrQueue } from '@/lib/sonarr';
import { getIndexerHealth } from '@/lib/prowlarr';
import { evaluateIndexerRules } from '@/lib/indexerAutomations';
import { runAutoCleanup } from '@/lib/autoCleanup';

// Prevent multiple scheduler instances from running in dev mode HMR
declare global {
    var globalSchedulerRunning: boolean | undefined;
    var globalNextSchedulerRun: number | null;
}

import { startSpeedMonitor } from '@/lib/speedMonitor';

if (!global.globalSchedulerRunning) {
    global.globalSchedulerRunning = true;

    // Note: For a robust Unraid app handling potential crashes, a library like `node-cron` or `bree` 
    // or a separate worker thread would be superior. For this single-container Next.js app, 
    // a `setInterval` initialized on startup is the simplest MVP approach.

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

    // ── Disk Space Guard ─────────────────────────────────────────────────────
    try {
        const thresholdStr = getSetting('disk_pause_threshold');
        const threshold = thresholdStr ? parseInt(thresholdStr) : 90;
        if (!isNaN(threshold) && threshold > 0) {
            // Internal fetch to our own disk API
            const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const diskRes = await fetch(`${baseUrl}/api/system/disk`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
            if (diskRes?.ok) {
                const diskData = await diskRes.json();
                if (diskData.usedPercent >= threshold) {
                    let reason = `Disk guard: ${diskData.usedPercent}% used ≥ ${threshold}% threshold. ${(diskData.freeBytes / 1e9).toFixed(1)} GB free. Skipping search batch.`;
                    console.warn(`⚠️  [SCHEDULER] ${reason}`);
                    
                    const autocleanEnabled = getSetting('disk_autoclean_enabled') === 'true';
                    if (autocleanEnabled) {
                        console.log(`[DISK GUARD] Auto-Clean is enabled. Running smart cleanup to free up space...`);
                        try {
                            const { runSmartCleanup } = require('@/lib/autoCleanup');
                            const cleanResult = await runSmartCleanup();
                            reason += ` Smart Auto-Clean triggered: ${cleanResult.message}`;
                        } catch (cleanErr: any) {
                            console.error('❌ Smart Auto-Clean during disk guard failed:', cleanErr.message);
                            reason += ` Smart Auto-Clean failed: ${cleanErr.message}`;
                        }
                    }
                    
                    logSearchHistory('disk_guard', [], [], reason);
                    defaultRes.reason = reason;
                    return defaultRes;
                } else {
                    console.log(`[DISK] ${diskData.usedPercent}% used (${(diskData.freeBytes / 1e9).toFixed(1)} GB free) — below ${threshold}% threshold, proceeding.`);
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

    if (radarrs.length === 0 && sonarrs.length === 0) {
        defaultRes.reason = 'No Radarr or Sonarr instances configured';
        logSearchHistory(profile, [], [], defaultRes.reason);
        return defaultRes;
    }

    let allMovieTargets: any[] = [];

    // Radarr Movies
    for (const r of radarrs) {
        const [allMovies, queue] = await Promise.all([
            getAllMovies(r.url, r.api_key),
            getRadarrQueue(r.url, r.api_key)
        ]);
        const queuedMovieIds = new Set(queue.map(q => q.movieId));

        // Only target missing, published, monitored movies, AND NOT in the downloading queue
        const missing = allMovies.filter(m => !m.hasFile && m.monitored && m.isAvailable && !queuedMovieIds.has(m.id));

        for (const m of missing) {
            const tracking = getSchedulerTracking(m.id.toString(), r.id!, 'movie');
            allMovieTargets.push({
                id: m.id,
                apiUrl: r.url,
                apiKey: r.api_key,
                instanceId: r.id,
                movie: m,
                attempts: tracking?.attempts || 0
            });
        }
    }

    let allEpTargets: any[] = [];

    // Sonarr Episodes
    // For episodes, getting missing directly is still efficient, but we need series data for priority sorting
    for (const s of sonarrs) {
        const [allSeries, queue] = await Promise.all([
            getAllSeries(s.url, s.api_key),
            getSonarrQueue(s.url, s.api_key)
        ]);
        const queuedEpisodeIds = new Set(queue.map(q => q.episodeId));
        const seriesMap = new Map(allSeries.map(series => [series.id, series]));

        for (const series of allSeries) {
            if (series.monitored && series.statistics && series.episodes) {
                const missingEpisodes = series.episodes.filter(ep =>
                    !ep.hasFile && ep.monitored && ep.episodeFileId === 0 && !queuedEpisodeIds.has(ep.id)
                );
                for (const ep of missingEpisodes) {
                    const tracking = getSchedulerTracking(ep.id.toString(), s.id!, 'episode');
                    allEpTargets.push({
                        id: ep.id,
                        apiUrl: s.url,
                        apiKey: s.api_key,
                        instanceId: s.id,
                        seriesInfo: seriesMap.get(ep.seriesId),
                        airDateUtc: ep.airDateUtc,
                        attempts: tracking?.attempts || 0
                    });
                }
            }
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
        const applyFilters = (targets: any[], type: 'movie' | 'series', idMapper: (t: any) => string) => {
            return targets.filter(t => {
                const idStr = `${type}-${idMapper(t)}`;

                // Explicit Pause Toggle Filter
                if (searchToggles[idStr] === false) return false;

                // Media Instance Filter (The instance URL/Name must map correctly, assuming instance filtering maps to Radarr/Sonarr name)
                const instanceName = type === 'movie' ? radarrs.find(r => r.url === t.apiUrl)?.name : sonarrs.find(s => s.url === t.apiUrl)?.name;
                if (instanceName && instanceFilters[instanceName] === false) return false;

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

        allMovieTargets = applyFilters(allMovieTargets, 'movie', t => t.movie.id.toString());
        allEpTargets = applyFilters(allEpTargets, 'series', t => t.id.toString());

        console.log(`[FILTER] Eliminated ${initialMovieCount - allMovieTargets.length} movies and ${initialEpCount - allEpTargets.length} episodes via UI constraints.`);

    } catch (filterError) {
        console.error('❌ Scheduler UI filter parsing failed. Falling back to unprotected raw prioritization.', filterError);
    }

    // 4. Priority Engine Sorting (Incorporating Rotate logic)
    const sortWithRotation = (a: any, b: any, prioritySort: number) => {
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
            await triggerMovieSearch(url, data.key, data.ids);
            triggeredMovies.push(...data.ids);

            // Increment attempts for each movie in this batch
            for (const id of data.ids) {
                const target = movieBatch.find(m => m.id === id);
                if (target) incrementSchedulerAttempt(id.toString(), target.instanceId, 'movie');
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
            await triggerEpisodeSearch(url, data.key, data.ids);
            triggeredEpisodes.push(...data.ids);

            // Increment attempts for each episode in this batch
            for (const id of data.ids) {
                const target = epBatch.find(e => e.id === id);
                if (target) incrementSchedulerAttempt(id.toString(), target.instanceId, 'episode');
            }
        }
    }

    const mTitles = movieBatch.map(m => m.movie.title);
    const eTitles = epBatch.map(e => e.seriesInfo ? `${e.seriesInfo.title} (Episode ID: ${e.id})` : `Episode ID: ${e.id}`);

    // Log the success to the interactive history ledger
    if (mTitles.length > 0 || eTitles.length > 0) {
        console.log(`✅ Batch complete. Triggered ${mTitles.length} movies and ${eTitles.length} episodes.`);
        logSearchHistory(profile, mTitles, eTitles, `Successfully triggered background priority searches.`);
    } else {
        console.log('ℹ️  No missing media matched priority criteria. Skipping triggers.');
        logSearchHistory(profile, [], [], `No missing media matched priority criteria. Queue is fully downloaded.`);
    }

    return {
        success: true,
        movies: mTitles,
        episodes: eTitles
    };
}

// Export a dummy object to satisfy Next.js if this file is imported elsewhere
export const scheduler = { active: true };

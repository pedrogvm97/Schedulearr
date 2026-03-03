import { getInstances, getSetting, logSearchHistory, getSchedulerConfig } from '@/lib/db';
import { getAllMovies, triggerMovieSearch, RadarrMovie, getQueue as getRadarrQueue } from '@/lib/radarr';
import { getAllSeries, triggerEpisodeSearch, SonarrSeries, getQueue as getSonarrQueue } from '@/lib/sonarr';
import { getIndexerHealth } from '@/lib/prowlarr';

// Prevent multiple scheduler instances from running in dev mode HMR
declare global {
    var globalSchedulerRunning: boolean | undefined;
    var globalNextSchedulerRun: number | null;
}

if (!global.globalSchedulerRunning) {
    global.globalSchedulerRunning = true;

    // Note: For a robust Unraid app handling potential crashes, a library like `node-cron` or `bree` 
    // or a separate worker thread would be superior. For this single-container Next.js app, 
    // a `setInterval` initialized on startup is the simplest MVP approach.

    const startScheduler = () => {
        console.log('🏁 Schedulearr background orchestrator started.');

        const runCycle = async () => {
            const now = new Date().toISOString();
            console.log(`[${now}] 🕒 Schedulearr running automated batch...`);
            try {
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
    };

    startScheduler();
}

export function getNextSchedulerRun() {
    return global.globalNextSchedulerRun || null;
}

export async function runBatchSearch() {
    const defaultRes = { success: false, reason: '', movies: [], episodes: [] };
    const prowlarrs = getInstances('prowlarr');
    const enabled = getSetting('scheduler_enabled') === 'true';
    if (!enabled) {
        console.log('⏸️  Scheduler is disabled in settings. Skipping run.');
        defaultRes.reason = 'Scheduler is disabled in settings';
        logSearchHistory('N/A', [], [], defaultRes.reason); // Log disabled status
        return defaultRes;
    }

    let allowedBatchSize = parseInt(getSetting('scheduler_batch') || '10');
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

    let allMovieTargets: { id: number, apiUrl: string, apiKey: string, movie: RadarrMovie }[] = [];

    // Radarr Movies
    for (const r of radarrs) {
        const [allMovies, queue] = await Promise.all([
            getAllMovies(r.url, r.api_key),
            getRadarrQueue(r.url, r.api_key)
        ]);
        const queuedMovieIds = new Set(queue.map(q => q.movieId));

        // Only target missing, published, monitored movies, AND NOT in the downloading queue
        const missing = allMovies.filter(m => !m.hasFile && m.monitored && m.isAvailable && !queuedMovieIds.has(m.id));
        console.log(`[RADARR] Found ${missing.length} missing/monitored (not queued) movies on ${r.name}`);
        allMovieTargets.push(...missing.map(m => ({ id: m.id, apiUrl: r.url, apiKey: r.api_key, movie: m })));
    }

    let allEpTargets: { id: number, apiUrl: string, apiKey: string, seriesInfo?: SonarrSeries, airDateUtc?: string }[] = [];

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
                if (missingEpisodes.length > 0) {
                    allEpTargets.push(...missingEpisodes.map(ep => ({
                        id: ep.id,
                        apiUrl: s.url,
                        apiKey: s.api_key,
                        seriesInfo: seriesMap.get(ep.seriesId),
                        airDateUtc: ep.airDateUtc
                    })));
                }
            }
        }
        console.log(`[SONARR] Found ${allEpTargets.length} missing episodes on ${s.name}`);
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

    // 4. Priority Engine Sorting
    if (profile === 'recently_released') {
        allMovieTargets.sort((a, b) => {
            const dateA = a.movie.physicalRelease || a.movie.digitalRelease || a.movie.inCinemas || "1970-01-01";
            const dateB = b.movie.physicalRelease || b.movie.digitalRelease || b.movie.inCinemas || "1970-01-01";
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
        allEpTargets.sort((a, b) => new Date(b.airDateUtc || "1970-01-01").getTime() - new Date(a.airDateUtc || "1970-01-01").getTime());
    } else if (profile === 'nearly_complete') {
        // Prioritize series that have a high percentage downloaded
        allEpTargets.sort((a, b) => {
            const pctA = a.seriesInfo?.statistics?.percentOfEpisodes || 0;
            const pctB = b.seriesInfo?.statistics?.percentOfEpisodes || 0;
            return pctB - pctA; // Highest percentage first
        });
        // Movies don't have partial completion, fallback to added date
        allMovieTargets.sort((a, b) => new Date(b.movie.added).getTime() - new Date(a.movie.added).getTime());
    } else if (profile === 'random') {
        allMovieTargets.sort(() => Math.random() - 0.5);
        allEpTargets.sort(() => Math.random() - 0.5);
    } else {
        // default: recently_added (or custom if not implemented yet)
        allMovieTargets.sort((a, b) => new Date(b.movie.added).getTime() - new Date(a.movie.added).getTime());
        allEpTargets.sort((a, b) => {
            const addedA = a.seriesInfo?.added || new Date().toISOString();
            const addedB = b.seriesInfo?.added || new Date().toISOString();
            return new Date(addedB).getTime() - new Date(addedA).getTime();
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
    for (const [url, data] of Object.entries(radarrGroups)) {
        if (data.ids.length > 0) {
            console.log(`🎬 Triggering search for ${data.ids.length} movies on Radarr at ${url} using ${profile} profile`);
            await triggerMovieSearch(url, data.key, data.ids);
            triggeredMovies.push(...data.ids);
        }
    }

    const sonarrGroups = epBatch.reduce((acc, curr) => {
        if (!acc[curr.apiUrl]) acc[curr.apiUrl] = { key: curr.apiKey, ids: [] };
        acc[curr.apiUrl].ids.push(curr.id);
        return acc;
    }, {} as Record<string, { key: string, ids: number[] }>);

    const triggeredEpisodes = [];
    for (const [url, data] of Object.entries(sonarrGroups)) {
        if (data.ids.length > 0) {
            console.log(`📺 Triggering search for ${data.ids.length} episodes on Sonarr at ${url} using ${profile} profile`);
            await triggerEpisodeSearch(url, data.key, data.ids);
            triggeredEpisodes.push(...data.ids);
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
} // <-- Missing closing bracket for runBatchSearch

// Export a dummy object to satisfy Next.js if this file is imported elsewhere
export const scheduler = { active: true };

import { getInstances, getSetting, logSearchHistory } from '@/lib/db';
import { getAllMovies, triggerMovieSearch, RadarrMovie } from '@/lib/radarr';
import { getAllSeries, triggerEpisodeSearch, SonarrSeries } from '@/lib/sonarr';
import { getIndexerHealth } from '@/lib/prowlarr';

// Prevent multiple scheduler instances from running in dev mode HMR
declare global {
    var globalSchedulerRunning: boolean | undefined;
}

if (!global.globalSchedulerRunning) {
    global.globalSchedulerRunning = true;

    // Note: For a robust Unraid app handling potential crashes, a library like `node-cron` or `bree` 
    // or a separate worker thread would be superior. For this single-container Next.js app, 
    // a `setInterval` initialized on startup is the simplest MVP approach.

    const startScheduler = () => {
        console.log('🏁 Arr Scheduler background orchestrator started.');

        // Default: run every 30 minutes. 
        // Real implementation would pull this from the `settings` SQLite table we defined earlier.
        const intervalMs = 30 * 60 * 1000;

        setInterval(async () => {
            console.log('🕒 Arr Scheduler running automated batch...');
            try {
                await runBatchSearch();
            } catch (error) {
                console.error('❌ Scheduler error:', error);
            }
        }, intervalMs);
    };

    // Start the background process, decoupled from any specific incoming HTTP request
    setTimeout(startScheduler, 5000);
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
        const allMovies = await getAllMovies(r.url, r.api_key);
        // Only target missing, published, monitored movies
        const missing = allMovies.filter(m => !m.hasFile && m.monitored && m.isAvailable);
        allMovieTargets.push(...missing.map(m => ({ id: m.id, apiUrl: r.url, apiKey: r.api_key, movie: m })));
    }

    let allEpTargets: { id: number, apiUrl: string, apiKey: string, seriesInfo?: SonarrSeries, airDateUtc?: string }[] = [];

    // Sonarr Episodes
    // For episodes, getting missing directly is still efficient, but we need series data for priority sorting
    for (const s of sonarrs) {
        // getMissingEpisodes is no longer used, we fetch all series and then filter for missing episodes
        const allSeries = await getAllSeries(s.url, s.api_key);
        const seriesMap = new Map(allSeries.map(series => [series.id, series]));

        for (const series of allSeries) {
            if (series.monitored && series.statistics && series.episodes) {
                const missingEpisodes = series.episodes.filter(ep => !ep.hasFile && ep.monitored && ep.episodeFileId === 0);
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

    // 3. Priority Engine Sorting
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

    // 4. Select the batch
    const movieBatch = allMovieTargets.slice(0, Math.floor(allowedBatchSize / 2));
    const epBatch = allEpTargets.slice(0, Math.ceil(allowedBatchSize / 2));

    // 5. Trigger the searches
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
        logSearchHistory(profile, mTitles, eTitles, `Successfully triggered background priority searches.`);
    } else {
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

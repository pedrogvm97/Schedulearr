import { getInstances } from '@/lib/db';
import { getMissingMovies, triggerMovieSearch } from '@/lib/radarr';
import { getMissingEpisodes, triggerEpisodeSearch } from '@/lib/sonarr';
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

async function runBatchSearch() {
    const prowlarrs = getInstances('prowlarr');
    let allowedBatchSize = 10; // Default pulling from DB

    // 1. Check Prowlarr health first to avoid bans
    if (prowlarrs.length > 0) {
        const health = await getIndexerHealth(prowlarrs[0].url, prowlarrs[0].api_key);

        if (!health.allHealthy) {
            console.log(`⚠️ Prowlarr reports ${health.downIndexers.length} indexers down. Throttling search batch.`);
            allowedBatchSize = Math.max(1, Math.floor(allowedBatchSize / 3)); // Reduce aggression dramatically
        }
    }

    // 2. Fetch missing items
    const radarrs = getInstances('radarr');
    const sonarrs = getInstances('sonarr');

    let allMovieTargets: { id: number, apiUrl: string, apiKey: string }[] = [];
    let allEpTargets: { id: number, apiUrl: string, apiKey: string }[] = [];

    // Radarr Movies
    for (const r of radarrs) {
        const missing = await getMissingMovies(r.url, r.api_key);
        allMovieTargets.push(...missing.map(m => ({ id: m.id, apiUrl: r.url, apiKey: r.api_key })));
    }

    // Sonarr Episodes
    for (const s of sonarrs) {
        const missing = await getMissingEpisodes(s.url, s.api_key);
        allEpTargets.push(...missing.map(m => ({ id: m.id, apiUrl: s.url, apiKey: s.api_key })));
    }

    // 3. Select a small batch to search to avoid overloading the instances/indexers
    // Prioritize older missing items (would require sorting by 'added' date)
    const movieBatch = allMovieTargets.slice(0, Math.floor(allowedBatchSize / 2));
    const epBatch = allEpTargets.slice(0, Math.ceil(allowedBatchSize / 2));

    // 4. Trigger the searches
    // Group by instance to send one combined API call where possible
    // For MVP demonstration, we fire them individually or map them per instance
    const radarrGroups = movieBatch.reduce((acc, curr) => {
        if (!acc[curr.apiUrl]) acc[curr.apiUrl] = { key: curr.apiKey, ids: [] };
        acc[curr.apiUrl].ids.push(curr.id);
        return acc;
    }, {} as Record<string, { key: string, ids: number[] }>);

    for (const [url, data] of Object.entries(radarrGroups)) {
        if (data.ids.length > 0) {
            console.log(`🎬 Triggering search for ${data.ids.length} movies on Radarr at ${url}`);
            await triggerMovieSearch(url, data.key, data.ids);
        }
    }

    const sonarrGroups = epBatch.reduce((acc, curr) => {
        if (!acc[curr.apiUrl]) acc[curr.apiUrl] = { key: curr.apiKey, ids: [] };
        acc[curr.apiUrl].ids.push(curr.id);
        return acc;
    }, {} as Record<string, { key: string, ids: number[] }>);

    for (const [url, data] of Object.entries(sonarrGroups)) {
        if (data.ids.length > 0) {
            console.log(`📺 Triggering search for ${data.ids.length} episodes on Sonarr at ${url}`);
            await triggerEpisodeSearch(url, data.key, data.ids);
        }
    }
}

// Export a dummy object to satisfy Next.js if this file is imported elsewhere
export const scheduler = { active: true };

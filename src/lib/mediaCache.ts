import { getInstances, getMediaCache, setMediaCache, getCombinedMediaCache } from '@/lib/db';
import { getAllMovies, getQueue as getRadarrQueue } from '@/lib/radarr';
import { getAllSeries, getQueue as getSonarrQueue } from '@/lib/sonarr';
import { twColorToHex } from '@/lib/instanceColor';

export async function refreshRadarrCacheForInstance(instance: any): Promise<any[]> {
    try {
        const [movies, queue] = await Promise.all([
            getAllMovies(instance.url, instance.api_key),
            getRadarrQueue(instance.url, instance.api_key)
        ]);
        const queuedIds = new Set(queue.map(q => q.movieId));

        const mapped = movies.map(m => ({
            ...m,
            instanceName: instance.name,
            instanceId: instance.id,
            instanceUrl: instance.url,
            instanceColor: instance.color,
            colorHex: twColorToHex(instance.color),
            isDownloading: queuedIds.has(m.id)
        }));

        setMediaCache(instance.id, 'radarr_movies', mapped);
        return mapped;
    } catch (e) {
        console.error(`[MEDIA_CACHE] Failed to refresh Radarr cache for instance ${instance.name}:`, e);
        return getMediaCache(instance.id, 'radarr_movies') || [];
    }
}

export async function refreshSonarrCacheForInstance(instance: any): Promise<any[]> {
    try {
        const [series, queue] = await Promise.all([
            getAllSeries(instance.url, instance.api_key),
            getSonarrQueue(instance.url, instance.api_key)
        ]);

        const mapped = series.map(s => ({
            ...s,
            instanceName: instance.name,
            instanceId: instance.id,
            instanceUrl: instance.url,
            instanceColor: instance.color,
            colorHex: twColorToHex(instance.color),
            queuedEpisodeIds: queue.filter(q => q.seriesId === s.id).map(q => q.episodeId)
        }));

        setMediaCache(instance.id, 'sonarr_series', mapped);
        return mapped;
    } catch (e) {
        console.error(`[MEDIA_CACHE] Failed to refresh Sonarr cache for instance ${instance.name}:`, e);
        return getMediaCache(instance.id, 'sonarr_series') || [];
    }
}

export async function getCachedRadarrMovies(forceFresh: boolean = false): Promise<any[]> {
    const instances = getInstances('radarr');
    if (instances.length === 0) return [];

    if (!forceFresh) {
        const cached = getCombinedMediaCache('radarr_movies');
        if (cached && cached.length > 0) {
            // Trigger asynchronous background refresh without blocking
            Promise.all(instances.map(inst => refreshRadarrCacheForInstance(inst))).catch(() => {});
            cached.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
            return cached;
        }
    }

    // Force fresh or no cache available yet
    let allMedia: any[] = [];
    const results = await Promise.all(instances.map(inst => refreshRadarrCacheForInstance(inst)));
    for (const res of results) {
        allMedia = allMedia.concat(res);
    }

    allMedia.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
    return allMedia;
}

export async function getCachedSonarrSeries(forceFresh: boolean = false): Promise<any[]> {
    const instances = getInstances('sonarr');
    if (instances.length === 0) return [];

    if (!forceFresh) {
        const cached = getCombinedMediaCache('sonarr_series');
        if (cached && cached.length > 0) {
            // Trigger asynchronous background refresh without blocking
            Promise.all(instances.map(inst => refreshSonarrCacheForInstance(inst))).catch(() => {});
            cached.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
            return cached;
        }
    }

    // Force fresh or no cache available yet
    let allMedia: any[] = [];
    const results = await Promise.all(instances.map(inst => refreshSonarrCacheForInstance(inst)));
    for (const res of results) {
        allMedia = allMedia.concat(res);
    }

    allMedia.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
    return allMedia;
}

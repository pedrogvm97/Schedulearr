import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents } from '@/lib/qbittorrent';

interface QBitTorrent {
    hash: string;
    name: string;
    size: number;
    progress: number;
    dlspeed: number;
    upspeed: number;
    state: string;
    instanceId?: number;
    instanceName?: string;
    instanceColor?: string;
    indexer?: string;
    poster?: string;
    tmdbId?: number;
    tvdbId?: number;
    mediaType?: 'movie' | 'series';
    [key: string]: any;
}

export async function GET() {
    try {
        const instances = getInstances('qbittorrent', true);
        if (instances.length === 0) {
            return NextResponse.json({ error: 'No active qBittorrent instances configured.' }, { status: 404 });
        }

        // 1. Fetch Radarr/Sonarr data to build a hash -> metadata map
        const hashToMetadata: Record<string, { indexer?: string, poster?: string, tmdbId?: number, tvdbId?: number, mediaType?: 'movie' | 'series', canonicalTitle?: string, year?: number }> = {};
        const radarrInstances = getInstances('radarr', true);
        const sonarrInstances = getInstances('sonarr', true);

        const resolvePoster = (instance: any, item: any) => {
            if (!item || !instance) return undefined;
            // 1. Prefer poster coverType (remoteUrl or local relative url)
            const posterImg = item.images?.find((img: any) => img.coverType === 'poster');
            // 2. Next prefer any image that is NOT fanart or banner, then fallback to first image
            const fallbackImg = item.images?.find((img: any) => img.coverType !== 'fanart' && img.coverType !== 'banner') || item.images?.[0];
            
            let poster = posterImg?.remoteUrl || posterImg?.url || fallbackImg?.remoteUrl || fallbackImg?.url;
            if (!poster) return undefined;

            if (!poster.startsWith('http')) {
                const baseUrl = instance.url.replace(/\/+$/, '');
                const cleanPoster = poster.startsWith('/') ? poster : `/${poster}`;
                poster = `${baseUrl}${cleanPoster}${cleanPoster.includes('?') ? '&' : '?'}apikey=${instance.api_key}`;
            }

            return `/api/proxy?url=${encodeURIComponent(poster)}`;
        };

        const arrQueuePromises = [
            ...radarrInstances.map(inst => fetch(`${inst.url}/api/v3/queue?apiKey=${inst.api_key}&pageSize=1000`).then(r => r.json()).then(data => ({ inst, data })).catch(() => ({ inst, data: { records: [] } }))),
            ...sonarrInstances.map(inst => fetch(`${inst.url}/api/v3/queue?apiKey=${inst.api_key}&pageSize=1000`).then(r => r.json()).then(data => ({ inst, data })).catch(() => ({ inst, data: { records: [] } })))
        ];

        const arrHistoryPromises = [
            ...radarrInstances.map(inst => fetch(`${inst.url}/api/v3/history?apiKey=${inst.api_key}&pageSize=1000&eventType=1`).then(r => r.json()).then(data => ({ inst, data })).catch(() => ({ inst, data: { records: [] } }))),
            ...sonarrInstances.map(inst => fetch(`${inst.url}/api/v3/history?apiKey=${inst.api_key}&pageSize=1000&eventType=1`).then(r => r.json()).then(data => ({ inst, data })).catch(() => ({ inst, data: { records: [] } })))
        ];

        const [queueResults, historyResults, radarrLib, sonarrLib] = await Promise.all([
            Promise.all(arrQueuePromises),
            Promise.all(arrHistoryPromises),
            Promise.all(radarrInstances.map(inst => fetch(`${inst.url}/api/v3/movie?apiKey=${inst.api_key}`).then(r => r.json()).catch(() => []))),
            Promise.all(sonarrInstances.map(inst => fetch(`${inst.url}/api/v3/series?apiKey=${inst.api_key}`).then(r => r.json()).catch(() => [])))
        ]);

        // Process Queues with instance context
        queueResults.forEach(({ inst, data }) => {
            if (data && data.records) {
                data.records.forEach((record: any) => {
                    const hash = record.downloadId?.toLowerCase();
                    if (hash) {
                        const movie = record.movie;
                        const series = record.series;
                        const poster = resolvePoster(inst, movie || series);
                        
                        hashToMetadata[hash] = {
                            indexer: record.indexer,
                            poster: poster || undefined,
                            canonicalTitle: movie?.title || series?.title,
                            year: movie?.year || series?.year,
                            tmdbId: movie?.tmdbId || series?.tmdbId,
                            tvdbId: movie?.tvdbId || series?.tvdbId,
                            mediaType: movie ? 'movie' : 'series'
                        };
                    }
                });
            }
        });

        // Process History (Grabs have the indexer info) with instance context
        historyResults.forEach(({ inst, data }) => {
            const records = Array.isArray(data) ? data : (data?.records || []);
            records.forEach((record: any) => {
                const hash = record.downloadId?.toLowerCase();
                const typeStr = String(record.eventType).toLowerCase();
                const isGrab = record.eventType === 1 || typeStr.includes('grabbed');
                if (hash && isGrab) {
                    if (!hashToMetadata[hash]) hashToMetadata[hash] = {};
                    if (record.data?.indexer) hashToMetadata[hash].indexer = record.data.indexer;
                    
                    const movie = record.movie;
                    const series = record.series;
                    const poster = resolvePoster(inst, movie || series);

                    if (poster && !hashToMetadata[hash].poster) {
                        hashToMetadata[hash].poster = poster;
                    }
                    if (!hashToMetadata[hash].canonicalTitle && (movie?.title || series?.title)) {
                        hashToMetadata[hash].canonicalTitle = movie?.title || series?.title;
                    }
                    if (!hashToMetadata[hash].year && (movie?.year || series?.year)) {
                        hashToMetadata[hash].year = movie?.year || series?.year;
                    }
                    if (!hashToMetadata[hash].tmdbId && (movie?.tmdbId || series?.tmdbId)) {
                        hashToMetadata[hash].tmdbId = movie?.tmdbId || series?.tmdbId;
                    }
                    if (!hashToMetadata[hash].tvdbId && (movie?.tvdbId || series?.tvdbId)) {
                        hashToMetadata[hash].tvdbId = movie?.tvdbId || series?.tvdbId;
                    }
                    if (!hashToMetadata[hash].mediaType) {
                        hashToMetadata[hash].mediaType = movie ? 'movie' : 'series';
                    }
                }
            });
        });

        // 1.5 Title-based library matching fallback
        const titleToMetadata: Record<string, any> = {};
        const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Better way to process libraries with instance context
        radarrInstances.forEach((inst, idx) => {
            const lib = radarrLib[idx];
            if (!Array.isArray(lib)) return;
            lib.forEach((m: any) => {
                const poster = resolvePoster(inst, m);
                const meta = { poster, tmdbId: m.tmdbId, mediaType: 'movie', canonicalTitle: m.title, year: m.year };
                titleToMetadata[slugify(m.title)] = meta;
                if (m.originalTitle) titleToMetadata[slugify(m.originalTitle)] = meta;
                if (m.title && m.year) titleToMetadata[slugify(`${m.title} ${m.year}`)] = meta;
                if (m.alternateTitles) {
                    m.alternateTitles.forEach((alt: any) => {
                        titleToMetadata[slugify(alt.title)] = meta;
                    });
                }
            });
        });

        sonarrInstances.forEach((inst, idx) => {
            const lib = sonarrLib[idx];
            if (!Array.isArray(lib)) return;
            lib.forEach((s: any) => {
                const poster = resolvePoster(inst, s);
                const meta = { poster, tvdbId: s.tvdbId, mediaType: 'series', canonicalTitle: s.title, year: s.year };
                titleToMetadata[slugify(s.title)] = meta;
                if (s.title && s.year) titleToMetadata[slugify(`${s.title} ${s.year}`)] = meta;
                if (s.alternateTitles) {
                    s.alternateTitles.forEach((alt: any) => {
                        titleToMetadata[slugify(alt.title)] = meta;
                    });
                }
            });
        });

        // 2. Support multiple qBit instances by aggregating them
        let allTorrents: QBitTorrent[] = [];

        for (const instance of instances) {
            try {
                const cookie = await authenticateQbittorrent(instance.url, instance.api_key);
                const torrents = await getActiveTorrents(instance.url, cookie);

                // Inject instance info and indexer info for UI
                const tagged = torrents.map((t: any) => {
                    const hashMeta = hashToMetadata[t.hash.toLowerCase()] || {};
                    
                    // If no hash matching, try title matching
                    let titleMeta = {};
                    if (!hashMeta.poster) {
                        const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const name = t.name.toLowerCase();
                        
                        // Aggressive cleanup for matching TV shows and movies
                        const isTvShow = /s\d{1,2}e\d{1,2}|\bseason\s*\d+|\b\d{1,2}x\d{1,2}\b/i.test(name);
                        const cleaned = name
                            .replace(/s\d{1,2}e\d{1,2}.*$/i, '')
                            .replace(/\bseason\s*\d+.*$/i, '')
                            .replace(/\b\d{1,2}x\d{1,2}.*$/i, '')
                            .replace(/\b(1080p|720p|2160p|4k|uhd|bluray|web-dl|webrip|h\.264|h\.265|x264|x265|hevc|ddp5\.1|dts|aac|atmos|truehd|ac3|repack|proper|remux|multi|vostfr|subfrench|dual|amzn|nf|dsnp|hmax|web|dvdrip)\b/gi, '')
                            .replace(/\b(19\d{2}|20\d{2})\b/g, '')
                            .replace(/[\[\(\]\)]/g, ' ')
                            .replace(/[\.\-_]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        
                        const slug = slugify(cleaned);
                        
                        // 1. Try exact slug match
                        if (titleToMetadata[slug]) {
                            titleMeta = {
                                ...titleToMetadata[slug],
                                mediaType: isTvShow ? 'series' : (titleToMetadata[slug].mediaType || 'movie')
                            };
                        } else {
                            // 2. Try substring match (longest matching movie or show title)
                            const matchedKey = Object.keys(titleToMetadata)
                                .filter(k => k.length > 3 && (slug.includes(k) || (slug.length > 5 && k.includes(slug))))
                                .sort((a, b) => b.length - a.length)[0];
                            
                            if (matchedKey) {
                                titleMeta = {
                                    ...titleToMetadata[matchedKey],
                                    mediaType: isTvShow ? 'series' : (titleToMetadata[matchedKey].mediaType || 'movie')
                                };
                            }
                        }
                    }

                    // Special case: ensure poster is proxied if it's from hashMeta and not already proxied
                    if (hashMeta.poster && !hashMeta.poster.includes('/api/proxy')) {
                        hashMeta.poster = `/api/proxy?url=${encodeURIComponent(hashMeta.poster)}`;
                    }

                    // Cleanly merge metadata without letting undefined fields in hashMeta overwrite valid titleMeta
                    const mergedMeta: any = { ...titleMeta };
                    for (const [key, val] of Object.entries(hashMeta)) {
                        if (val !== undefined && val !== null && val !== '') {
                            mergedMeta[key] = val;
                        }
                    }

                    return {
                        ...t,
                        instanceId: instance.id,
                        instanceName: instance.name,
                        instanceColor: instance.color || 'bg-emerald-500',
                        ...mergedMeta
                    };
                });
                allTorrents = [...allTorrents, ...tagged];
            } catch (instError) {
                console.error(`Failed to fetch from ${instance.name}:`, instError);
            }
        }

        return NextResponse.json({ torrents: allTorrents });
    } catch (error) {
        console.error('API /qbittorrent/torrents error:', error);
        return NextResponse.json({ error: 'Failed to fetch torrents' }, { status: 500 });
    }
}

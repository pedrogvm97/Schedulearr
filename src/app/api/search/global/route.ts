import { NextResponse } from 'next/server';
import db, { getInstances } from '@/lib/db';
import axios from 'axios';
import { sanitizeSongMetadata } from '@/lib/songSanitizer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const q = (searchParams.get('q') || '').trim();

        if (!q) {
            return NextResponse.json({ inLibraries: [], externalAvailable: [] });
        }

        const cleanQ = encodeURIComponent(q);
        const inLibraries: any[] = [];
        const externalAvailable: any[] = [];

        // 1. Search Local Theater Libraries in SQLite
        try {
            const localItems: any[] = db.prepare(`
                SELECT * FROM theater_media_items 
                WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? 
                LIMIT 20
            `).all(`%${q}%`, `%${q}%`, `%${q}%`);

            for (const item of localItems) {
                inLibraries.push({
                    id: item.id,
                    name: item.title || item.name,
                    title: item.title || item.name,
                    artist: item.artist,
                    album: item.album,
                    category: item.category,
                    extension: item.extension,
                    posterUrl: item.poster_url,
                    streamUrl: item.stream_url,
                    source: 'Local Server Library',
                    location: item.folder || item.path,
                    isLocal: true
                });
            }
        } catch (e: any) {
            console.warn('Theater local search error:', e.message);
        }

        // 2. Query Radarr & Sonarr for Movies & TV Series
        const instances = getInstances().filter(i => i.enabled);
        const radarrInst = instances.find(i => i.type === 'radarr');
        const sonarrInst = instances.find(i => i.type === 'sonarr');

        const promises: Promise<any>[] = [];

        // Radarr Lookup
        if (radarrInst) {
            promises.push(
                axios.get(`${radarrInst.url.replace(/\/$/, '')}/api/v3/movie/lookup?term=${cleanQ}`, {
                    headers: { 'X-Api-Key': radarrInst.api_key },
                    timeout: 5000
                }).then(res => {
                    if (Array.isArray(res.data)) {
                        res.data.slice(0, 6).forEach((movie: any) => {
                            const isDownloaded = movie.hasFile || movie.isAvailable;
                            const poster = movie.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl;
                            const entry = {
                                id: `radarr-${movie.tmdbId || movie.id}`,
                                title: movie.title,
                                year: movie.year,
                                overview: movie.overview,
                                posterUrl: poster,
                                category: 'video',
                                type: 'movie',
                                source: 'Radarr / TMDB',
                                isLocal: isDownloaded,
                                ratings: movie.ratings?.imdb?.value || movie.ratings?.tmdb?.value,
                                raw: movie
                            };
                            if (isDownloaded) {
                                inLibraries.push(entry);
                            } else {
                                externalAvailable.push(entry);
                            }
                        });
                    }
                }).catch(() => null)
            );
        }

        // Sonarr Lookup
        if (sonarrInst) {
            promises.push(
                axios.get(`${sonarrInst.url.replace(/\/$/, '')}/api/v3/series/lookup?term=${cleanQ}`, {
                    headers: { 'X-Api-Key': sonarrInst.api_key },
                    timeout: 5000
                }).then(res => {
                    if (Array.isArray(res.data)) {
                        res.data.slice(0, 6).forEach((series: any) => {
                            const isDownloaded = (series.statistics?.episodeFileCount || 0) > 0;
                            const poster = series.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl;
                            const entry = {
                                id: `sonarr-${series.tvdbId || series.id}`,
                                title: series.title,
                                year: series.year,
                                overview: series.overview,
                                posterUrl: poster,
                                category: 'video',
                                type: 'series',
                                network: series.network,
                                source: 'Sonarr / TVDB',
                                isLocal: isDownloaded,
                                ratings: series.ratings?.value,
                                raw: series
                            };
                            if (isDownloaded) {
                                inLibraries.push(entry);
                            } else {
                                externalAvailable.push(entry);
                            }
                        });
                    }
                }).catch(() => null)
            );
        }

        // 3. Query Online Music (Deezer + iTunes + YouTube Scrape)
        promises.push(
            (async () => {
                const addedMusicKeys = new Set<string>();

                // Deezer Search
                try {
                    const deezerRes = await axios.get(`https://api.deezer.com/search?q=${cleanQ}&limit=8`, {
                        headers: { 'User-Agent': 'Schedulearr/0.5.28' },
                        timeout: 4000
                    });
                    if (Array.isArray(deezerRes.data?.data)) {
                        for (const item of deezerRes.data.data) {
                            const title = item.title || 'Track';
                            const artist = item.artist?.name || 'Artist';
                            const dedupeKey = `${artist.toLowerCase()} - ${title.toLowerCase()}`;
                            if (!addedMusicKeys.has(dedupeKey)) {
                                addedMusicKeys.add(dedupeKey);
                                externalAvailable.push({
                                    id: `deezer-${item.id}`,
                                    name: title,
                                    title,
                                    artist,
                                    album: item.album?.title || 'Single',
                                    duration: `${Math.floor((item.duration || 180) / 60)}:${Math.floor((item.duration || 180) % 60).toString().padStart(2, '0')}`,
                                    category: 'audio',
                                    type: 'music',
                                    extension: 'MP3',
                                    posterUrl: item.album?.cover_xl || item.album?.cover_medium || item.artist?.picture_medium || '',
                                    source: 'Deezer / Studio',
                                    previewUrl: item.preview || '',
                                    streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${artist} ${title}`)}`,
                                    isLocal: false
                                });
                            }
                        }
                    }
                } catch (e: any) {
                    console.warn('Global Deezer search error:', e.message);
                }

                // iTunes Search
                try {
                    const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${cleanQ}&media=music&limit=8`, {
                        headers: { 'User-Agent': 'Schedulearr/0.5.28' },
                        timeout: 4000
                    });
                    if (itunesRes.data?.results) {
                        itunesRes.data.results.forEach((track: any) => {
                            const title = track.trackName || 'Track';
                            const artist = track.artistName || 'Artist';
                            const dedupeKey = `${artist.toLowerCase()} - ${title.toLowerCase()}`;
                            if (!addedMusicKeys.has(dedupeKey)) {
                                addedMusicKeys.add(dedupeKey);
                                const artwork = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                                externalAvailable.push({
                                    id: `itunes-${track.trackId}`,
                                    name: title,
                                    title,
                                    artist,
                                    album: track.collectionName || 'Single',
                                    duration: `${Math.floor((track.trackTimeMillis || 180000) / 60000)}:${Math.floor(((track.trackTimeMillis || 180000) % 60000) / 1000).toString().padStart(2, '0')}`,
                                    category: 'audio',
                                    type: 'music',
                                    extension: 'AAC',
                                    posterUrl: artwork,
                                    streamUrl: track.previewUrl || `/api/theater/music/stream?q=${encodeURIComponent(`${artist} ${title}`)}`,
                                    previewUrl: track.previewUrl || '',
                                    source: 'Apple Music',
                                    isLocal: false
                                });
                            }
                        });
                    }
                } catch (e: any) {
                    console.warn('Global iTunes search error:', e.message);
                }

                // YouTube Music Scrape
                try {
                    const searchUrl = `https://www.youtube.com/results?search_query=${cleanQ}+audio`;
                    const ytRes = await axios.get(searchUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Cookie': 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg'
                        },
                        timeout: 5000
                    });

                    const html = ytRes.data;
                    const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
                    if (jsonMatch && jsonMatch[1]) {
                        const data = JSON.parse(jsonMatch[1]);
                        const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

                        for (const item of contents) {
                            const video = item.videoRenderer;
                            if (video && video.videoId) {
                                const title = video.title?.runs?.[0]?.text || 'Track';
                                const artist = video.ownerText?.runs?.[0]?.text || video.channelTitle || 'Artist';
                                const dedupeKey = `${artist.toLowerCase()} - ${title.toLowerCase()}`;
                                if (!addedMusicKeys.has(dedupeKey)) {
                                    addedMusicKeys.add(dedupeKey);
                                    const duration = video.lengthText?.simpleText || '3:30';
                                    const thumbnail = video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || '';

                                    externalAvailable.push({
                                        id: `yt-${video.videoId}`,
                                        name: title,
                                        title,
                                        artist,
                                        album: 'YouTube Music',
                                        duration,
                                        category: 'audio',
                                        type: 'music',
                                        extension: 'STREAM',
                                        posterUrl: thumbnail,
                                        source: 'YouTube Music',
                                        streamUrl: `/api/theater/music/stream?ytId=${video.videoId}`,
                                        youtubeId: video.videoId,
                                        isLocal: false
                                    });
                                }
                                if (addedMusicKeys.size >= 25) break;
                            }
                        }
                    }
                } catch (e: any) {
                    console.warn('Global YouTube search error:', e.message);
                }
            })()
        );

        await Promise.all(promises);

        return NextResponse.json({
            query: q,
            inLibraries,
            externalAvailable,
            totalFound: inLibraries.length + externalAvailable.length
        });
    } catch (error: any) {
        console.error('API /search/global error:', error);
        return NextResponse.json({ error: error.message, inLibraries: [], externalAvailable: [] }, { status: 500 });
    }
}

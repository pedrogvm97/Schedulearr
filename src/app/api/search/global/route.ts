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

        // 3. Query Online Music (YouTube / Apple Music)
        promises.push(
            axios.get(`https://itunes.apple.com/search?term=${cleanQ}&media=music&limit=8`, { timeout: 4000 }).then(res => {
                if (res.data?.results) {
                    res.data.results.forEach((track: any) => {
                        const artwork = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                        externalAvailable.push({
                            id: `itunes-${track.trackId}`,
                            title: track.trackName,
                            artist: track.artistName,
                            album: track.collectionName || 'Single',
                            duration: `${Math.floor((track.trackTimeMillis || 180000) / 60000)}:${Math.floor(((track.trackTimeMillis || 180000) % 60000) / 1000).toString().padStart(2, '0')}`,
                            category: 'audio',
                            posterUrl: artwork,
                            previewUrl: track.previewUrl,
                            source: 'Apple Music / Spotify',
                            isLocal: false
                        });
                    });
                }
            }).catch(() => null)
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

import { NextResponse } from 'next/server';
import axios from 'axios';
import { sanitizeSongMetadata } from '@/lib/songSanitizer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');
        const action = searchParams.get('action');

        // 0. Top Charts / Trending Releases (when query is empty or action=charts/trending)
        if (!query || !query.trim() || action === 'charts' || action === 'trending') {
            try {
                const genre = searchParams.get('genre') || '';
                const feedRes = await axios.get('https://itunes.apple.com/us/rss/topalbums/limit=24/json', {
                    headers: { 'User-Agent': 'Schedulearr/0.5.28' },
                    timeout: 6000
                });

                const entries = feedRes.data?.feed?.entry || [];
                let results = entries.map((e: any) => {
                    const albumName = e['im:name']?.label || 'Album';
                    const artistName = e['im:artist']?.label || 'Artist';
                    const rawImg = e['im:image']?.[2]?.label || e['im:image']?.[1]?.label || '';
                    const posterUrl = rawImg ? rawImg.replace(/170x170bb/g, '600x600bb') : '';
                    const genreName = e.category?.attributes?.label || 'Music';
                    const collectionId = e.id?.attributes?.['im:id'] || '';

                    return {
                        id: `chart-${collectionId || albumName}`,
                        name: albumName,
                        title: albumName,
                        artist: artistName,
                        artistName: artistName,
                        albumTitle: albumName,
                        album: albumName,
                        genre: genreName,
                        category: 'audio',
                        extension: 'ALBUM',
                        posterUrl,
                        source: 'Top Charts',
                        collectionId,
                        streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${artistName} ${albumName}`)}`
                    };
                });

                if (genre) {
                    results = results.filter((r: any) => r.genre.toLowerCase().includes(genre.toLowerCase()));
                }

                return NextResponse.json({ results });
            } catch (e: any) {
                console.warn('Error fetching top charts:', e.message);
                return NextResponse.json({ results: [] });
            }
        }

        const cleanQ = encodeURIComponent(query.trim());
        const resultsMap = new Map<string, any>();

        // Multi-Source Search Execution in Parallel (Deezer + iTunes + YouTube + Invidious)
        const [deezerRes, itunesRes, ytRes] = await Promise.allSettled([
            // 1. Deezer API (Fast, comprehensive, studio album info, 1000x1000 cover art)
            axios.get(`https://api.deezer.com/search?q=${cleanQ}&limit=20`, {
                headers: { 'User-Agent': 'Schedulearr/0.5.28' },
                timeout: 5000
            }),
            // 2. iTunes API (Official release dates, collections, high-res covers)
            axios.get(`https://itunes.apple.com/search?term=${cleanQ}&media=music&entity=song&limit=20`, {
                headers: { 'User-Agent': 'Schedulearr/0.5.28' },
                timeout: 5000
            }),
            // 3. YouTube Music Web Scraper with Consent Cookie
            axios.get(`https://www.youtube.com/results?search_query=${cleanQ}+audio`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Cookie': 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg'
                },
                timeout: 6000
            })
        ]);

        // Process Deezer Results
        if (deezerRes.status === 'fulfilled' && Array.isArray(deezerRes.value.data?.data)) {
            for (const item of deezerRes.value.data.data) {
                const title = item.title || item.title_short || 'Track';
                const artist = item.artist?.name || 'Artist';
                const album = item.album?.title || 'Single';
                const posterUrl = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || item.artist?.picture_xl || '';
                const duration = `${Math.floor((item.duration || 180) / 60)}:${Math.floor((item.duration || 180) % 60).toString().padStart(2, '0')}`;
                const dedupeKey = `${artist.toLowerCase()} - ${title.toLowerCase()}`;

                if (!resultsMap.has(dedupeKey)) {
                    resultsMap.set(dedupeKey, {
                        id: `deezer-${item.id}`,
                        name: title,
                        title,
                        artist,
                        album,
                        duration,
                        category: 'audio',
                        extension: 'MP3',
                        posterUrl,
                        source: 'Deezer / Studio',
                        previewUrl: item.preview || '',
                        streamUrl: item.preview || `/api/theater/music/stream?q=${encodeURIComponent(`${artist} ${title}`)}`
                    });
                }
            }
        }

        // Process iTunes Results
        if (itunesRes.status === 'fulfilled' && Array.isArray(itunesRes.value.data?.results)) {
            for (const item of itunesRes.value.data.results) {
                const title = item.trackName || 'Track';
                const artist = item.artistName || 'Artist';
                const album = item.collectionName || 'Single';
                const posterUrl = item.artworkUrl100 ? item.artworkUrl100.replace('100x100', '600x600') : '';
                const durationMs = item.trackTimeMillis || 180000;
                const duration = `${Math.floor(durationMs / 60000)}:${Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0')}`;
                const dedupeKey = `${artist.toLowerCase()} - ${title.toLowerCase()}`;

                if (!resultsMap.has(dedupeKey)) {
                    resultsMap.set(dedupeKey, {
                        id: `itunes-${item.trackId}`,
                        name: title,
                        title,
                        artist,
                        album,
                        duration,
                        category: 'audio',
                        extension: 'AAC',
                        posterUrl,
                        source: 'Apple Music',
                        previewUrl: item.previewUrl || '',
                        streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${artist} ${title}`)}`
                    });
                }
            }
        }

        // Process YouTube Scrape Results
        if (ytRes.status === 'fulfilled' && ytRes.value.data) {
            const html = ytRes.value.data;
            const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const data = JSON.parse(jsonMatch[1]);
                    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

                    for (const item of contents) {
                        const video = item.videoRenderer;
                        if (video && video.videoId) {
                            const rawTitle = video.title?.runs?.[0]?.text || 'Track';
                            const rawUploader = video.ownerText?.runs?.[0]?.text || video.channelTitle || 'Artist';
                            const { cleanArtist, cleanTitle } = sanitizeSongMetadata(rawTitle, rawUploader);
                            const duration = video.lengthText?.simpleText || '3:30';
                            const thumbnail = video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || '';
                            const dedupeKey = `${(cleanArtist || rawUploader).toLowerCase()} - ${(cleanTitle || rawTitle).toLowerCase()}`;

                            if (!resultsMap.has(dedupeKey)) {
                                resultsMap.set(dedupeKey, {
                                    id: `yt-${video.videoId}`,
                                    name: cleanTitle || rawTitle,
                                    title: cleanTitle || rawTitle,
                                    artist: cleanArtist || rawUploader,
                                    uploader: rawUploader,
                                    album: 'YouTube Music',
                                    duration,
                                    category: 'audio',
                                    extension: 'STREAM',
                                    posterUrl: thumbnail,
                                    source: 'YouTube Music',
                                    streamUrl: `/api/theater/music/stream?ytId=${video.videoId}`,
                                    youtubeId: video.videoId
                                });
                            }
                        }
                    }
                } catch {}
            }
        }

        const results = Array.from(resultsMap.values());
        return NextResponse.json({ results });
    } catch (error: any) {
        console.error('API /theater/music/online error:', error);
        return NextResponse.json({ error: error.message, results: [] }, { status: 500 });
    }
}

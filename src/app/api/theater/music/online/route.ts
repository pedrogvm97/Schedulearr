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
                    headers: { 'User-Agent': 'Schedulearr/0.5.16' },
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
        let results: any[] = [];

        // 1. Search YouTube Music / YouTube Search Scrape
        try {
            const searchUrl = `https://www.youtube.com/results?search_query=${cleanQ}+audio`;
            const ytRes = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 7000
            });

            const html = ytRes.data;
            const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);

            if (jsonMatch && jsonMatch[1]) {
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

                        results.push({
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

                        if (results.length >= 15) break;
                    }
                }
            }
        } catch (e: any) {
            console.error('YouTube search fallback error:', e.message);
        }

        // 2. Search Spotify metadata mirror if YouTube yielded few results
        if (results.length < 5) {
            try {
                const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${cleanQ}&media=music&limit=10`, { timeout: 5000 });
                if (itunesRes.data?.results) {
                    for (const track of itunesRes.data.results) {
                        results.push({
                            id: `itunes-${track.trackId}`,
                            name: track.trackName,
                            title: track.trackName,
                            artist: track.artistName,
                            album: track.collectionName || 'Single',
                            duration: `${Math.floor((track.trackTimeMillis || 180000) / 60000)}:${Math.floor(((track.trackTimeMillis || 180000) % 60000) / 1000).toString().padStart(2, '0')}`,
                            category: 'audio',
                            extension: 'AAC',
                            posterUrl: track.artworkUrl100 ? track.artworkUrl100.replace('100x100', '600x600') : '',
                            source: 'Apple Music / Spotify',
                            streamUrl: track.previewUrl || ''
                        });
                    }
                }
            } catch (e: any) {
                console.error('Music metadata fallback error:', e.message);
            }
        }

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error('API /theater/music/online error:', error);
        return NextResponse.json({ error: error.message, results: [] }, { status: 500 });
    }
}

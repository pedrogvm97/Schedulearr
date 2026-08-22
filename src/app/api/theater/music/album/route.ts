import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const collectionId = searchParams.get('id') || searchParams.get('collectionId');
        const artist = searchParams.get('artist') || '';
        const albumTitle = searchParams.get('album') || searchParams.get('title') || '';
        const query = searchParams.get('q') || `${artist} ${albumTitle}`.trim();

        let albumInfo: any = null;
        let tracks: any[] = [];

        // 1. Direct iTunes lookup by collectionId
        if (collectionId) {
            try {
                const cleanId = collectionId.replace(/^(itunes-|album-)/, '');
                const res = await axios.get(`https://itunes.apple.com/lookup?id=${cleanId}&entity=song`, {
                    headers: { 'User-Agent': 'Schedulearr/0.5.8' },
                    timeout: 6000
                });

                if (Array.isArray(res.data?.results) && res.data.results.length > 0) {
                    const rawAlbum = res.data.results[0];
                    const rawTracks = res.data.results.slice(1).filter((r: any) => r.wrapperType === 'track');

                    albumInfo = {
                        id: `itunes-${rawAlbum.collectionId}`,
                        collectionId: rawAlbum.collectionId,
                        title: rawAlbum.collectionName || albumTitle || 'Album',
                        artist: rawAlbum.artistName || artist || 'Artist',
                        artistId: rawAlbum.artistId,
                        coverUrl: rawAlbum.artworkUrl100 ? rawAlbum.artworkUrl100.replace('100x100bb', '600x600bb') : '',
                        releaseYear: rawAlbum.releaseDate ? rawAlbum.releaseDate.slice(0, 4) : '',
                        releaseDate: rawAlbum.releaseDate,
                        genre: rawAlbum.primaryGenreName,
                        trackCount: rawAlbum.trackCount || rawTracks.length,
                        copyright: rawAlbum.copyright,
                        source: 'Apple Music / iTunes'
                    };

                    tracks = rawTracks.map((t: any) => {
                        const mins = Math.floor((t.trackTimeMillis || 0) / 60000);
                        const secs = Math.floor(((t.trackTimeMillis || 0) % 60000) / 1000);
                        const durStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                        return {
                            id: `itunes-track-${t.trackId}`,
                            trackId: t.trackId,
                            trackNumber: t.trackNumber || 1,
                            discNumber: t.discNumber || 1,
                            title: t.trackName,
                            name: t.trackName,
                            artist: t.artistName || albumInfo.artist,
                            album: rawAlbum.collectionName,
                            duration: durStr,
                            durationMs: t.trackTimeMillis,
                            previewUrl: t.previewUrl,
                            posterUrl: albumInfo.coverUrl,
                            streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${t.artistName || albumInfo.artist} ${t.trackName}`)}`,
                            category: 'audio',
                            extension: 'M4A'
                        };
                    });
                }
            } catch (e: any) {
                console.warn('iTunes collection lookup error:', e.message);
            }
        }

        // 2. Search iTunes if not found by collectionId
        if (!albumInfo && query) {
            try {
                const searchRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=3`, {
                    headers: { 'User-Agent': 'Schedulearr/0.5.8' },
                    timeout: 6000
                });

                if (Array.isArray(searchRes.data?.results) && searchRes.data.results.length > 0) {
                    const matchedAlbum = searchRes.data.results[0];
                    const lookupRes = await axios.get(`https://itunes.apple.com/lookup?id=${matchedAlbum.collectionId}&entity=song`, {
                        headers: { 'User-Agent': 'Schedulearr/0.5.8' },
                        timeout: 6000
                    });

                    if (Array.isArray(lookupRes.data?.results) && lookupRes.data.results.length > 0) {
                        const rawAlbum = lookupRes.data.results[0];
                        const rawTracks = lookupRes.data.results.slice(1).filter((r: any) => r.wrapperType === 'track');

                        albumInfo = {
                            id: `itunes-${rawAlbum.collectionId}`,
                            collectionId: rawAlbum.collectionId,
                            title: rawAlbum.collectionName || albumTitle || 'Album',
                            artist: rawAlbum.artistName || artist || 'Artist',
                            artistId: rawAlbum.artistId,
                            coverUrl: rawAlbum.artworkUrl100 ? rawAlbum.artworkUrl100.replace('100x100bb', '600x600bb') : '',
                            releaseYear: rawAlbum.releaseDate ? rawAlbum.releaseDate.slice(0, 4) : '',
                            releaseDate: rawAlbum.releaseDate,
                            genre: rawAlbum.primaryGenreName,
                            trackCount: rawAlbum.trackCount || rawTracks.length,
                            copyright: rawAlbum.copyright,
                            source: 'Apple Music / iTunes'
                        };

                        tracks = rawTracks.map((t: any) => {
                            const mins = Math.floor((t.trackTimeMillis || 0) / 60000);
                            const secs = Math.floor(((t.trackTimeMillis || 0) % 60000) / 1000);
                            const durStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                            return {
                                id: `itunes-track-${t.trackId}`,
                                trackId: t.trackId,
                                trackNumber: t.trackNumber || 1,
                                discNumber: t.discNumber || 1,
                                title: t.trackName,
                                name: t.trackName,
                                artist: t.artistName || albumInfo.artist,
                                album: rawAlbum.collectionName,
                                duration: durStr,
                                durationMs: t.trackTimeMillis,
                                previewUrl: t.previewUrl,
                                posterUrl: albumInfo.coverUrl,
                                streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${t.artistName || albumInfo.artist} ${t.trackName}`)}`,
                                category: 'audio',
                                extension: 'M4A'
                            };
                        });
                    }
                }
            } catch (e: any) {
                console.warn('iTunes album search error:', e.message);
            }
        }

        // 3. Fallback: Search Deezer if iTunes did not return tracks
        if ((!tracks || tracks.length === 0) && query) {
            try {
                const deezerRes = await axios.get(`https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=1`, { timeout: 5000 });
                const dzAlbum = deezerRes.data?.data?.[0];
                if (dzAlbum && dzAlbum.id) {
                    const dzTracksRes = await axios.get(`https://api.deezer.com/album/${dzAlbum.id}`, { timeout: 5000 });
                    if (dzTracksRes.data) {
                        const dData = dzTracksRes.data;
                        if (!albumInfo) {
                            albumInfo = {
                                id: `deezer-${dData.id}`,
                                collectionId: dData.id,
                                title: dData.title || albumTitle,
                                artist: dData.artist?.name || artist,
                                coverUrl: dData.cover_xl || dData.cover_big,
                                releaseYear: dData.release_date ? dData.release_date.slice(0, 4) : '',
                                genre: dData.genres?.data?.[0]?.name,
                                trackCount: dData.nb_tracks,
                                copyright: dData.label,
                                source: 'Deezer'
                            };
                        }

                        if (Array.isArray(dData.tracks?.data)) {
                            tracks = dData.tracks.data.map((t: any, idx: number) => {
                                const mins = Math.floor((t.duration || 0) / 60);
                                const secs = Math.floor((t.duration || 0) % 60);
                                const durStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                                return {
                                    id: `deezer-track-${t.id}`,
                                    trackId: t.id,
                                    trackNumber: t.track_position || idx + 1,
                                    title: t.title,
                                    name: t.title,
                                    artist: t.artist?.name || albumInfo.artist,
                                    album: albumInfo.title,
                                    duration: durStr,
                                    durationMs: (t.duration || 0) * 1000,
                                    previewUrl: t.preview,
                                    posterUrl: albumInfo.coverUrl,
                                    streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${t.artist?.name || albumInfo.artist} ${t.title}`)}`,
                                    category: 'audio',
                                    extension: 'MP3'
                                };
                            });
                        }
                    }
                }
            } catch (e: any) {
                console.warn('Deezer album fallback error:', e.message);
            }
        }

        if (!albumInfo && tracks.length === 0) {
            return NextResponse.json({
                error: 'Album details not found',
                album: null,
                tracks: []
            }, { status: 404 });
        }

        return NextResponse.json({
            album: albumInfo,
            tracks
        });
    } catch (error: any) {
        console.error('API /theater/music/album error:', error);
        return NextResponse.json({ error: error.message, album: null, tracks: [] }, { status: 500 });
    }
}

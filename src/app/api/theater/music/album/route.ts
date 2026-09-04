import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

function normalizeText(str: string): string {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getBaseTitle(str: string): string {
    if (!str) return '';
    return str.split(/[:\-\—\(\[]/)[0].trim();
}

function isWordMatch(container: string, word: string): boolean {
    if (!container || !word) return false;
    const tokens = container.split(' ').filter(Boolean);
    return tokens.includes(word);
}

function computeSimilarity(candidateTitle: string, targetTitle: string, candidateArtist?: string, targetArtist?: string): number {
    const normTarget = normalizeText(targetTitle);
    const normCandidate = normalizeText(candidateTitle);
    if (!normTarget || !normCandidate) return 0;

    // 1. Exact match
    if (normTarget === normCandidate) return 1.0;

    // 2. Base title match (e.g. "A Symphonic Celebration" matching "A Symphonic Celebration: Music From...")
    const normBaseTarget = normalizeText(getBaseTitle(targetTitle));
    const normBaseCandidate = normalizeText(getBaseTitle(candidateTitle));
    if (normBaseTarget && normBaseCandidate && normBaseTarget === normBaseCandidate) return 0.95;

    // 3. For short titles (<= 2 chars, like 'x', '+', '='), ONLY allow exact word matches
    if (normBaseTarget.length <= 2) {
        if (isWordMatch(normCandidate, normBaseTarget) || isWordMatch(normBaseCandidate, normBaseTarget)) {
            return 0.9;
        }
        return 0.0;
    }

    // 4. Substring / startsWith containment for normal length titles
    if (normCandidate.startsWith(normBaseTarget) || normBaseTarget.startsWith(normCandidate)) return 0.9;
    if (isWordMatch(normCandidate, normTarget) || isWordMatch(normTarget, normCandidate)) return 0.85;

    // 5. Token overlap
    const targetTokens = new Set(normTarget.split(' ').filter(t => t.length > 1));
    const candidateTokens = new Set(normCandidate.split(' ').filter(t => t.length > 1));
    if (targetTokens.size === 0 || candidateTokens.size === 0) {
        return normTarget === normCandidate ? 1.0 : 0.0;
    }

    let matchCount = 0;
    for (const t of targetTokens) {
        if (candidateTokens.has(t)) matchCount++;
    }
    const tokenScore = matchCount / Math.max(targetTokens.size, candidateTokens.size);

    // Artist verification check
    if (candidateArtist && targetArtist) {
        const normCandArt = normalizeText(candidateArtist);
        const normTargArt = normalizeText(targetArtist);
        if (normCandArt && normTargArt) {
            if (normCandArt !== normTargArt && !normCandArt.includes(normTargArt) && !normTargArt.includes(normCandArt)) {
                return tokenScore * 0.25; // Heavily penalize mismatching artist
            }
        }
    }

    return tokenScore;
}

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
                    headers: { 'User-Agent': 'Schedulearr/0.5.81' },
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

        // 2. Search iTunes if not found by collectionId with Candidate Scoring
        if (!albumInfo && (albumTitle || query)) {
            const searchQueries = [
                query,
                albumTitle && artist ? `${artist} ${getBaseTitle(albumTitle)}`.trim() : '',
                albumTitle ? albumTitle.trim() : ''
            ].filter(Boolean);

            for (const q of searchQueries) {
                if (albumInfo) break;
                try {
                    const searchRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=20`, {
                        headers: { 'User-Agent': 'Schedulearr/0.5.81' },
                        timeout: 6000
                    });

                    if (Array.isArray(searchRes.data?.results) && searchRes.data.results.length > 0) {
                        // Score candidates based on title and artist similarity
                        const candidates = searchRes.data.results.map((cand: any) => {
                            const score = computeSimilarity(cand.collectionName, albumTitle || query, cand.artistName, artist);
                            return { cand, score };
                        }).filter((c: any) => c.score >= 0.65)
                          .sort((a: any, b: any) => b.score - a.score);

                        if (candidates.length > 0) {
                            const matchedAlbum = candidates[0].cand;
                            const lookupRes = await axios.get(`https://itunes.apple.com/lookup?id=${matchedAlbum.collectionId}&entity=song`, {
                                headers: { 'User-Agent': 'Schedulearr/0.5.81' },
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
                    }
                } catch (e: any) {
                    console.warn('iTunes album search error:', e.message);
                }
            }
        }

        // 3. Fallback: Search Deezer if iTunes did not return a high-confidence match
        if ((!tracks || tracks.length === 0) && (albumTitle || query)) {
            const deezerQueries = [
                query,
                albumTitle && artist ? `${artist} ${getBaseTitle(albumTitle)}`.trim() : '',
                albumTitle ? albumTitle.trim() : ''
            ].filter(Boolean);

            for (const dq of deezerQueries) {
                if (albumInfo && tracks.length > 0) break;
                try {
                    const deezerRes = await axios.get(`https://api.deezer.com/search/album?q=${encodeURIComponent(dq)}&limit=15`, { timeout: 5000 });
                    if (Array.isArray(deezerRes.data?.data) && deezerRes.data.data.length > 0) {
                        const candidates = deezerRes.data.data.map((cand: any) => {
                            const score = computeSimilarity(cand.title, albumTitle || query, cand.artist?.name, artist);
                            return { cand, score };
                        }).filter((c: any) => c.score >= 0.65)
                          .sort((a: any, b: any) => b.score - a.score);

                        if (candidates.length > 0) {
                            const dzAlbum = candidates[0].cand;
                            const dzTracksRes = await axios.get(`https://api.deezer.com/album/${dzAlbum.id}`, { timeout: 5000 });
                            if (dzTracksRes.data) {
                                const dData = dzTracksRes.data;
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
                    }
                } catch (e: any) {
                    console.warn('Deezer album fallback error:', e.message);
                }
            }
        }

        if (!albumInfo && tracks.length === 0) {
            return NextResponse.json({
                error: 'No confident album match found',
                album: null,
                tracks: []
            }, { status: 200 });
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

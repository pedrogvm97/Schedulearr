import { NextResponse } from 'next/server';
import { getTheaterLibraries, getCachedTheaterItems, getMusicPlaylists } from '@/lib/db';
import axios from 'axios';
import { sanitizeSongMetadata } from '@/lib/songSanitizer';

export const dynamic = 'force-dynamic';

function normalizeText(text: string): string {
    return (text || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractArtists(rawArtist: string): string[] {
    if (!rawArtist) return [];
    return rawArtist
        .split(/[,;&]|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b/i)
        .map(a => a.trim())
        .filter(a => a.length > 1);
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        let { playlistId, items } = body || {};

        if ((!items || !Array.isArray(items) || items.length === 0) && playlistId) {
            const allPlaylists = getMusicPlaylists();
            const found = allPlaylists.find((p: any) => p.id === playlistId);
            if (found && Array.isArray(found.items)) {
                items = found.items;
            }
        }

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ recommendations: [] });
        }

        // 1. Build set of existing songs to avoid recommending duplicates
        const existingTrackIds = new Set<string>();
        const existingTrackSignatures = new Set<string>();
        const artistFrequencies = new Map<string, number>();
        const primaryArtistNames = new Set<string>();

        for (const item of items) {
            if (item.id) existingTrackIds.add(String(item.id));
            if (item.streamUrl) existingTrackIds.add(String(item.streamUrl));

            const normTitle = normalizeText(item.title || item.name || '');
            const normArtist = normalizeText(item.artist || item.uploader || '');
            if (normTitle) {
                existingTrackSignatures.add(`${normArtist}:::${normTitle}`);
            }

            const artists = extractArtists(item.artist || item.uploader || '');
            for (const a of artists) {
                const norm = normalizeText(a);
                if (norm) {
                    primaryArtistNames.add(a);
                    artistFrequencies.set(norm, (artistFrequencies.get(norm) || 0) + 1);
                }
            }
        }

        // Top artists in playlist sorted by frequency
        const sortedArtists = Array.from(primaryArtistNames).sort((a, b) => {
            const countA = artistFrequencies.get(normalizeText(a)) || 0;
            const countB = artistFrequencies.get(normalizeText(b)) || 0;
            return countB - countA;
        });

        const candidatesMap = new Map<string, any>();

        // 2. Scan Local / Server Music Libraries
        const libraries = getTheaterLibraries();
        const musicLibs = libraries.filter(l => l.type === 'music');
        
        for (const lib of musicLibs) {
            const cached = getCachedTheaterItems(lib.id);
            const libItems = cached?.items || (Array.isArray(cached) ? cached : []);
            if (!Array.isArray(libItems)) continue;

            for (const track of libItems) {
                if (track.category !== 'audio') continue;
                if (existingTrackIds.has(String(track.id)) || existingTrackIds.has(String(track.streamUrl))) continue;

                const normTitle = normalizeText(track.title || track.name || '');
                const normArtist = normalizeText(track.artist || track.uploader || '');
                const sig = `${normArtist}:::${normTitle}`;
                if (existingTrackSignatures.has(sig)) continue;

                const trackArtists = extractArtists(track.artist || track.uploader || '');
                let maxWeight = 0;
                let matchedArtistName = '';

                for (const ta of trackArtists) {
                    const weight = artistFrequencies.get(normalizeText(ta)) || 0;
                    if (weight > maxWeight) {
                        maxWeight = weight;
                        matchedArtistName = ta;
                    }
                }

                if (maxWeight > 0) {
                    const score = 150 + (maxWeight * 25);
                    candidatesMap.set(sig, {
                        ...track,
                        score,
                        matchReason: `Artist in playlist (${matchedArtistName})`,
                        matchType: 'artist',
                        sourceType: 'server'
                    });
                }
            }
        }

        // 3. Scan Online Sources (Deezer & iTunes) for the Top Artists
        const topArtistsToQuery = sortedArtists.slice(0, 3);
        const onlinePromises = topArtistsToQuery.map(async (artist) => {
            const cleanArtist = encodeURIComponent(artist);
            try {
                const [deezerRes, itunesRes] = await Promise.allSettled([
                    axios.get(`https://api.deezer.com/search?q=artist:"${cleanArtist}"&limit=12`, {
                        headers: { 'User-Agent': 'Schedulearr/0.5.98' },
                        timeout: 4500
                    }),
                    axios.get(`https://itunes.apple.com/search?term=${cleanArtist}&entity=song&limit=12`, {
                        headers: { 'User-Agent': 'Schedulearr/0.5.98' },
                        timeout: 4500
                    })
                ]);

                const onlineTracks: any[] = [];

                if (deezerRes.status === 'fulfilled' && Array.isArray(deezerRes.value.data?.data)) {
                    for (const item of deezerRes.value.data.data) {
                        const title = item.title || item.title_short || 'Track';
                        const itemArtist = item.artist?.name || artist;
                        const posterUrl = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || '';
                        const durationSec = parseInt(item.duration, 10) || 180;
                        const duration = `${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}`;

                        onlineTracks.push({
                            id: `deezer-${item.id}`,
                            title,
                            name: title,
                            artist: itemArtist,
                            album: item.album?.title || 'Single',
                            posterUrl,
                            duration,
                            durationMs: durationSec * 1000,
                            category: 'audio',
                            extension: 'STREAM',
                            streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${itemArtist} ${title}`)}`,
                            source: 'Deezer'
                        });
                    }
                }

                if (itunesRes.status === 'fulfilled' && Array.isArray(itunesRes.value.data?.results)) {
                    for (const item of itunesRes.value.data.results) {
                        const title = item.trackName || 'Track';
                        const itemArtist = item.artistName || artist;
                        const rawArt = item.artworkUrl100 || '';
                        const posterUrl = rawArt ? rawArt.replace(/100x100bb/g, '600x600bb') : '';
                        const durationMs = item.trackTimeMillis || 180000;
                        const totalSec = Math.floor(durationMs / 1000);
                        const duration = `${Math.floor(totalSec / 60)}:${Math.floor(totalSec % 60).toString().padStart(2, '0')}`;

                        onlineTracks.push({
                            id: `itunes-${item.trackId}`,
                            title,
                            name: title,
                            artist: itemArtist,
                            album: item.collectionName || 'Single',
                            posterUrl,
                            duration,
                            durationMs,
                            category: 'audio',
                            extension: 'STREAM',
                            streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(`${itemArtist} ${title}`)}`,
                            source: 'iTunes'
                        });
                    }
                }

                return { artist, tracks: onlineTracks };
            } catch {
                return { artist, tracks: [] };
            }
        });

        const onlineResults = await Promise.all(onlinePromises);

        for (const { artist, tracks } of onlineResults) {
            const weight = artistFrequencies.get(normalizeText(artist)) || 1;
            for (const track of tracks) {
                const normTitle = normalizeText(track.title || track.name || '');
                const normArtist = normalizeText(track.artist || artist);
                const sig = `${normArtist}:::${normTitle}`;

                if (existingTrackSignatures.has(sig)) continue;
                if (existingTrackIds.has(track.id)) continue;
                if (candidatesMap.has(sig)) continue; // Server library version takes precedence!

                const score = 90 + (weight * 15);
                candidatesMap.set(sig, {
                    ...track,
                    score,
                    matchReason: `Artist in playlist (${artist})`,
                    matchType: 'artist',
                    sourceType: 'online'
                });
            }
        }

        // 4. Sort and return top candidates
        const sortedCandidates = Array.from(candidatesMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 16);

        return NextResponse.json({ recommendations: sortedCandidates });
    } catch (error: any) {
        console.error('API /theater/music/playlists/recommendations error:', error);
        return NextResponse.json({ recommendations: [], error: error.message }, { status: 500 });
    }
}

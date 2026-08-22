import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const term = searchParams.get('term') || searchParams.get('query');
        const instanceId = searchParams.get('instanceId');

        if (!term) {
            return NextResponse.json({ error: 'Search term is required' }, { status: 400 });
        }

        const lidarrInstances = getInstances().filter(i => i.type === 'lidarr' && i.enabled);
        const instance = instanceId ? lidarrInstances.find(i => i.id === instanceId) : lidarrInstances[0];

        // 1. Query Lidarr API if instance exists
        if (instance) {
            try {
                const lidarrUrl = `${instance.url.replace(/\/$/, '')}/api/v1/artist/lookup?term=${encodeURIComponent(term)}`;
                const res = await axios.get(lidarrUrl, {
                    headers: { 'X-Api-Key': instance.api_key },
                    timeout: 8000
                });

                if (Array.isArray(res.data) && res.data.length > 0) {
                    const results = res.data.map((artist: any) => {
                        const posterImg = artist.images?.find((img: any) => img.coverType === 'poster' || img.coverType === 'disc' || img.coverType === 'cover')?.remoteUrl;
                        return {
                            id: artist.foreignArtistId || artist.id,
                            artistName: artist.artistName,
                            title: artist.artistName,
                            overview: artist.overview,
                            genres: artist.genres || [],
                            posterUrl: posterImg || artist.remotePoster,
                            remotePoster: posterImg || artist.remotePoster,
                            status: artist.status,
                            foreignArtistId: artist.foreignArtistId,
                            albums: artist.albums || [],
                            links: artist.links || [],
                            recordLabel: artist.disambiguation || 'Artist',
                            raw: artist
                        };
                    });
                    return NextResponse.json({ results, source: 'lidarr', instanceName: instance.name });
                }
            } catch (e: any) {
                console.warn('Lidarr instance lookup error, trying iTunes / MusicBrainz fallback:', e.message);
            }
        }

        // 2. High-Quality Online Fallback: Aggregate Artist Biography + Full Discography Albums
        try {
            // A. Search for albums by the artist on iTunes
            const itunesPromise = axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=50`, { timeout: 6000 }).catch(() => null);
            
            // B. Fetch rich artist summary from Wikipedia
            const cleanTerm = term.replace(/VEVO$/i, '').trim();
            const wikiPromise = axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTerm)}`, {
                headers: { 'User-Agent': 'Schedulearr/0.3.98 (https://github.com/pedrogvm97/Schedulearr)' },
                timeout: 5000
            }).catch(async () => {
                // Try with "(band)" or "(musician)" suffix if initial query misses
                try {
                    const fallbackWiki = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(`${cleanTerm} (band)`)}`, {
                        headers: { 'User-Agent': 'Schedulearr/0.3.98' },
                        timeout: 4000
                    });
                    return fallbackWiki;
                } catch {
                    return null;
                }
            });

            const [itunesRes, wikiRes] = await Promise.all([itunesPromise, wikiPromise]);

            let overview = '';
            let wikiThumbnail = '';
            if (wikiRes?.data) {
                overview = wikiRes.data.extract || '';
                wikiThumbnail = wikiRes.data.thumbnail?.source || wikiRes.data.originalimage?.source || '';
            }

            if (itunesRes?.data?.results && itunesRes.data.results.length > 0) {
                const rawAlbums = itunesRes.data.results;
                const canonicalArtist = rawAlbums[0].artistName || term;
                const genresSet = new Set<string>();

                const albumMap = new Map<string, any>();
                for (const item of rawAlbums) {
                    if (item.primaryGenreName) genresSet.add(item.primaryGenreName);
                    const albumKey = (item.collectionName || '').toLowerCase().trim();
                    if (albumKey && !albumMap.has(albumKey)) {
                        const artwork = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : null;
                        const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined;
                        albumMap.set(albumKey, {
                            id: String(item.collectionId),
                            title: item.collectionName,
                            albumTitle: item.collectionName,
                            artistName: item.artistName,
                            coverArt: artwork,
                            posterUrl: artwork,
                            remotePoster: artwork,
                            year,
                            releaseDate: item.releaseDate,
                            trackCount: item.trackCount || 0,
                            recordLabel: item.copyright || item.artistName,
                            copyright: item.copyright,
                            foreignArtistId: item.artistId,
                            genres: [item.primaryGenreName].filter(Boolean)
                        });
                    }
                }

                const sortedAlbums = Array.from(albumMap.values()).sort((a, b) => (b.year || 0) - (a.year || 0));
                const topArtwork = sortedAlbums[0]?.posterUrl || wikiThumbnail;

                const aggregatedArtist = {
                    id: String(rawAlbums[0].artistId || cleanTerm.toLowerCase()),
                    artistName: canonicalArtist,
                    title: canonicalArtist,
                    overview: overview || `${canonicalArtist} is a recording artist with ${sortedAlbums.length} catalogued albums.`,
                    genres: Array.from(genresSet),
                    posterUrl: wikiThumbnail || topArtwork,
                    remotePoster: wikiThumbnail || topArtwork,
                    bannerUrl: topArtwork,
                    foreignArtistId: rawAlbums[0].artistId,
                    albums: sortedAlbums,
                    totalAlbums: sortedAlbums.length,
                    recordLabel: sortedAlbums[0]?.recordLabel || 'Universal / Independent',
                    raw: rawAlbums
                };

                return NextResponse.json({
                    results: [aggregatedArtist],
                    source: 'aggregated_online',
                    totalAlbums: sortedAlbums.length
                });
            } else if (overview) {
                // If only Wikipedia found
                const singleArtist = {
                    id: cleanTerm.toLowerCase(),
                    artistName: cleanTerm,
                    title: cleanTerm,
                    overview,
                    genres: ['Music'],
                    posterUrl: wikiThumbnail,
                    remotePoster: wikiThumbnail,
                    albums: [],
                    totalAlbums: 0
                };
                return NextResponse.json({ results: [singleArtist], source: 'wikipedia' });
            }
        } catch (fallbackErr: any) {
            console.error('Music lookup fallback error:', fallbackErr.message);
        }

        return NextResponse.json({ results: [], source: 'none' });
    } catch (error: any) {
        console.error('API /lidarr/lookup error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

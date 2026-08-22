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

        // 1. Fetch iTunes Discography (up to 50 albums) & Wikipedia Biography concurrently
        const cleanTerm = term.replace(/VEVO$/i, '').trim();
        const itunesPromise = axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTerm)}&entity=album&limit=50`, { timeout: 6000 }).catch(() => null);
        const wikiPromise = axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTerm)}`, {
            headers: { 'User-Agent': 'Schedulearr/0.3.100 (https://github.com/pedrogvm97/Schedulearr)' },
            timeout: 5000
        }).catch(async () => {
            try {
                return await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(`${cleanTerm} (band)`)}`, {
                    headers: { 'User-Agent': 'Schedulearr/0.3.100' },
                    timeout: 4000
                });
            } catch {
                return null;
            }
        });

        // 2. Query Lidarr if instance exists
        let lidarrPromise = Promise.resolve<any>(null);
        if (instance) {
            const lidarrUrl = `${instance.url.replace(/\/$/, '')}/api/v1/artist/lookup?term=${encodeURIComponent(cleanTerm)}`;
            lidarrPromise = axios.get(lidarrUrl, {
                headers: { 'X-Api-Key': instance.api_key },
                timeout: 6000
            }).catch(() => null);
        }

        const [itunesRes, wikiRes, lidarrRes] = await Promise.all([itunesPromise, wikiPromise, lidarrPromise]);

        // Parse Wikipedia
        let overview = '';
        let wikiThumbnail = '';
        if (wikiRes?.data) {
            overview = wikiRes.data.extract || '';
            wikiThumbnail = wikiRes.data.thumbnail?.source || wikiRes.data.originalimage?.source || '';
        }

        // Parse iTunes Discography Albums
        const rawAlbums = itunesRes?.data?.results || [];
        const albumMap = new Map<string, any>();
        const genresSet = new Set<string>();

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
                    remoteCover: artwork,
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
        const canonicalArtist = rawAlbums[0]?.artistName || cleanTerm;

        // Parse Lidarr results if present
        let lidarrArtist: any = null;
        if (lidarrRes?.data && Array.isArray(lidarrRes.data) && lidarrRes.data.length > 0) {
            const lMatch = lidarrRes.data.find((a: any) => a.artistName?.toLowerCase() === cleanTerm.toLowerCase()) || lidarrRes.data[0];
            const posterImg = lMatch.images?.find((img: any) => img.coverType === 'poster' || img.coverType === 'disc' || img.coverType === 'cover')?.remoteUrl;
            lidarrArtist = {
                id: lMatch.foreignArtistId || lMatch.id,
                artistName: lMatch.artistName || canonicalArtist,
                overview: lMatch.overview || overview,
                genres: lMatch.genres?.length ? lMatch.genres : Array.from(genresSet),
                posterUrl: posterImg || lMatch.remotePoster || wikiThumbnail || topArtwork,
                status: lMatch.status,
                foreignArtistId: lMatch.foreignArtistId,
                albums: (lMatch.albums && lMatch.albums.length > 0) ? lMatch.albums : sortedAlbums,
                links: lMatch.links || [],
                recordLabel: lMatch.disambiguation || sortedAlbums[0]?.recordLabel || 'Recording Artist',
                raw: lMatch
            };
        }

        if (lidarrArtist) {
            return NextResponse.json({
                results: [lidarrArtist],
                source: 'lidarr_enriched',
                totalAlbums: lidarrArtist.albums?.length || sortedAlbums.length
            });
        }

        // Return aggregated online artist & discography
        if (sortedAlbums.length > 0 || overview) {
            const aggregatedArtist = {
                id: String(rawAlbums[0]?.artistId || cleanTerm.toLowerCase()),
                artistName: canonicalArtist,
                title: canonicalArtist,
                overview: overview || `${canonicalArtist} is a recording artist with ${sortedAlbums.length} albums in their discography.`,
                genres: Array.from(genresSet),
                posterUrl: wikiThumbnail || topArtwork,
                remotePoster: wikiThumbnail || topArtwork,
                bannerUrl: topArtwork,
                foreignArtistId: rawAlbums[0]?.artistId,
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
        }

        return NextResponse.json({ results: [], source: 'none' });
    } catch (error: any) {
        console.error('API /lidarr/lookup error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

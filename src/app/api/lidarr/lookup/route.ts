import { NextResponse } from 'next/server';
import { getInstances, getTheaterLibraries, getCachedTheaterItems } from '@/lib/db';
import musicDownloadQueue from '@/lib/musicDownloadQueue';
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
        const instances = getInstances();
        const instance = instanceId
            ? instances.find(i => i.id === instanceId)
            : instances.find(i => i.type === 'lidarr' && i.enabled);

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
        const isUserVarious = cleanTerm.toLowerCase().includes('various');

        for (const item of rawAlbums) {
            // Ignore generic Various Artists compilation releases unless user searched for Various Artists
            if (!isUserVarious && (item.artistName?.toLowerCase() === 'various artists' || item.artistName?.toLowerCase() === 'various')) {
                continue;
            }

            if (item.primaryGenreName) genresSet.add(item.primaryGenreName);
            const albumKey = (item.collectionName || '').toLowerCase().trim();
            if (albumKey && !albumMap.has(albumKey)) {
                const rawArt = item.artworkUrl100 || item.artworkUrl60 || item.artworkUrl30 || '';
                const artwork = rawArt ? rawArt.replace(/\d+x\d+(bb)?/, '600x600bb') : null;
                const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined;
                albumMap.set(albumKey, {
                    id: String(item.collectionId),
                    title: item.collectionName,
                    albumTitle: item.collectionName,
                    artistName: item.artistName,
                    coverUrl: artwork,
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

        // Resolve canonical artist name: strictly avoid "Various Artists" / "Various" unless user explicitly searched for it
        const candidateArtists = rawAlbums
            .map((item: any) => item.artistName)
            .filter((name: string) => {
                if (!name) return false;
                if (!isUserVarious && (name.toLowerCase() === 'various artists' || name.toLowerCase() === 'various')) return false;
                return true;
            });
        const exactMatch = candidateArtists.find((name: string) => name.toLowerCase() === cleanTerm.toLowerCase());
        const partialMatch = candidateArtists.find((name: string) => 
            name.toLowerCase().includes(cleanTerm.toLowerCase()) || cleanTerm.toLowerCase().includes(name.toLowerCase())
        );
        const wikiName = wikiRes?.data?.title && !wikiRes.data.title.toLowerCase().includes('various') ? wikiRes.data.title : null;
        const canonicalArtist = exactMatch || partialMatch || candidateArtists[0] || wikiName || cleanTerm;

        // Retrieve active local download queue jobs
        const queueStatus = musicDownloadQueue.getStatus();
        const activeQueueJobs = queueStatus.jobs || [];

        // Retrieve local library items for music
        const musicLibs = getTheaterLibraries().filter(l => l.type === 'music');
        const localTracks: any[] = [];
        for (const lib of musicLibs) {
            const cached = getCachedTheaterItems(lib.id);
            if (cached?.items && Array.isArray(cached.items)) {
                for (const item of cached.items) {
                    if (item.category === 'audio' || item.type === 'music' || item.artist) {
                        localTracks.push(item);
                    }
                }
            }
        }

        const norm = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normArtist = norm(cleanTerm);

        // Filter local tracks for this artist
        const artistLocalTracks = localTracks.filter(t => {
            const a = norm(t.artist || '');
            return a && (a === normArtist || a.includes(normArtist) || normArtist.includes(a));
        });

        // Parse Lidarr results if present
        let lidarrArtist: any = null;
        let lidarrAlbums: any[] = [];
        if (lidarrRes?.data && Array.isArray(lidarrRes.data) && lidarrRes.data.length > 0) {
            const lMatch = lidarrRes.data.find((a: any) => a.artistName?.toLowerCase() === cleanTerm.toLowerCase()) || lidarrRes.data[0];
            const posterImg = lMatch.images?.find((img: any) => img.coverType === 'poster' || img.coverType === 'disc' || img.coverType === 'cover')?.remoteUrl;
            
            // If artist is added in Lidarr (id > 0), fetch live album stats
            if (lMatch.id && lMatch.id > 0 && instance) {
                try {
                    const albumRes = await axios.get(`${instance.url.replace(/\/$/, '')}/api/v1/album?artistId=${lMatch.id}`, {
                        headers: { 'X-Api-Key': instance.api_key },
                        timeout: 5000
                    });
                    if (Array.isArray(albumRes.data)) {
                        lidarrAlbums = albumRes.data;
                    }
                } catch {}
            }
            if (lidarrAlbums.length === 0 && Array.isArray(lMatch.albums)) {
                lidarrAlbums = lMatch.albums;
            }

            lidarrArtist = {
                id: lMatch.foreignArtistId || lMatch.id,
                artistName: lMatch.artistName || canonicalArtist,
                overview: lMatch.overview || overview,
                genres: lMatch.genres?.length ? lMatch.genres : Array.from(genresSet),
                posterUrl: posterImg || lMatch.remotePoster || wikiThumbnail || topArtwork,
                status: lMatch.status,
                foreignArtistId: lMatch.foreignArtistId,
                links: lMatch.links || [],
                recordLabel: lMatch.disambiguation || sortedAlbums[0]?.recordLabel || 'Recording Artist',
                raw: lMatch
            };
        }

        // Merge iTunes discography with Lidarr albums and local disk status
        // Create unified list of albums with 4-state discrimination:
        // 1. 'downloading' -> in download queue or Lidarr queue
        // 2. 'downloaded'  -> on disk in local library or Lidarr 100%
        // 3. 'missing'     -> monitored/added in Lidarr, but 0 tracks on disk
        // 4. 'catalog'     -> in iTunes / MusicBrainz catalog, not monitored or added
        const processedAlbumMap = new Map<string, any>();

        // First pass: add all iTunes albums
        for (const alb of sortedAlbums) {
            const key = norm(alb.title);
            processedAlbumMap.set(key, { ...alb });
        }

        // Second pass: merge / add Lidarr albums
        for (const lAlb of lidarrAlbums) {
            const key = norm(lAlb.title);
            const existing = processedAlbumMap.get(key);
            const coverArt = lAlb.images?.find((img: any) => img.coverType === 'cover')?.remoteUrl || existing?.coverUrl;
            if (existing) {
                processedAlbumMap.set(key, {
                    ...existing,
                    lidarrId: lAlb.id,
                    monitored: lAlb.monitored,
                    statistics: lAlb.statistics,
                    hasFile: Boolean(lAlb.hasFile || (lAlb.statistics?.trackFileCount > 0)),
                    grabbed: lAlb.grabbed,
                    coverUrl: existing.coverUrl || coverArt,
                    posterUrl: existing.posterUrl || coverArt
                });
            } else {
                processedAlbumMap.set(key, {
                    id: String(lAlb.id || Math.random()),
                    lidarrId: lAlb.id,
                    title: lAlb.title,
                    albumTitle: lAlb.title,
                    artistName: canonicalArtist,
                    monitored: lAlb.monitored,
                    statistics: lAlb.statistics,
                    hasFile: Boolean(lAlb.hasFile || (lAlb.statistics?.trackFileCount > 0)),
                    grabbed: lAlb.grabbed,
                    coverUrl: coverArt,
                    posterUrl: coverArt,
                    year: lAlb.releaseDate ? new Date(lAlb.releaseDate).getFullYear() : undefined,
                    releaseDate: lAlb.releaseDate,
                    trackCount: lAlb.statistics?.totalTrackCount || lAlb.statistics?.trackCount || 0
                });
            }
        }

        // Third pass: compute the 4-state discrimination for every album
        const finalAlbums = Array.from(processedAlbumMap.values()).map(alb => {
            const albNorm = norm(alb.title);
            
            // Check 1: Is this album actively downloading in music queue?
            const isDownloadingInQueue = activeQueueJobs.some((j: any) => {
                const jStatus = j.status === 'downloading' || j.status === 'queued';
                if (!jStatus) return false;
                const jAlb = norm(j.album || '');
                const jArt = norm(j.artist || '');
                return (jAlb && (jAlb === albNorm || albNorm.includes(jAlb))) ||
                       (jArt && (jArt === normArtist || normArtist.includes(jArt)) && jAlb === albNorm);
            });

            const activeJob = activeQueueJobs.find((j: any) => {
                const jAlb = norm(j.album || '');
                return jAlb && (jAlb === albNorm || albNorm.includes(jAlb));
            });

            // Check 2: Does it exist on disk locally?
            const localAlbumTracks = artistLocalTracks.filter(t => {
                const tAlb = norm(t.album || '');
                return tAlb && (tAlb === albNorm || albNorm.includes(tAlb) || tAlb.includes(albNorm));
            });
            const hasLocalTracksOnDisk = localAlbumTracks.length > 0 && localAlbumTracks.some(t => Boolean(t.path));

            // Check 3: Lidarr downloaded status
            const isLidarrDownloaded = Boolean(
                alb.hasFile || 
                (alb.statistics && alb.statistics.percentOfTracks >= 100) ||
                (alb.statistics && alb.statistics.trackFileCount > 0 && alb.statistics.trackFileCount >= alb.statistics.trackCount)
            );

            // Check 4: Is monitored/added in Lidarr
            const isMonitoredInLidarr = Boolean(alb.monitored === true || (alb.lidarrId && alb.monitored !== false));

            let downloadStatus: 'downloading' | 'downloaded' | 'missing' | 'catalog' = 'catalog';
            let downloadPercent = 0;

            if (isDownloadingInQueue || alb.grabbed) {
                downloadStatus = 'downloading';
                downloadPercent = activeJob?.progress || 15;
            } else if (isLidarrDownloaded || hasLocalTracksOnDisk) {
                downloadStatus = 'downloaded';
                downloadPercent = 100;
            } else if (isMonitoredInLidarr) {
                downloadStatus = 'missing';
                downloadPercent = 0;
            } else {
                downloadStatus = 'catalog';
                downloadPercent = 0;
            }

            return {
                ...alb,
                downloadStatus,
                downloadPercent,
                hasLocalTracks: hasLocalTracksOnDisk,
                localTrackCount: localAlbumTracks.length,
                isMonitored: isMonitoredInLidarr
            };
        }).sort((a, b) => (b.year || 0) - (a.year || 0));

        if (lidarrArtist) {
            lidarrArtist.albums = finalAlbums;
            return NextResponse.json({
                results: [lidarrArtist],
                source: 'lidarr_enriched',
                totalAlbums: finalAlbums.length
            });
        }

        // Return aggregated online artist & discography
        if (finalAlbums.length > 0 || overview) {
            const aggregatedArtist = {
                id: String(rawAlbums[0]?.artistId || cleanTerm.toLowerCase()),
                artistName: canonicalArtist,
                title: canonicalArtist,
                overview: overview || `${canonicalArtist} is a recording artist with ${finalAlbums.length} albums in their discography.`,
                genres: Array.from(genresSet),
                posterUrl: wikiThumbnail || topArtwork,
                remotePoster: wikiThumbnail || topArtwork,
                bannerUrl: topArtwork,
                foreignArtistId: rawAlbums[0]?.artistId,
                albums: finalAlbums,
                totalAlbums: finalAlbums.length,
                recordLabel: sortedAlbums[0]?.recordLabel || 'Universal / Independent',
                raw: rawAlbums
            };

            return NextResponse.json({
                results: [aggregatedArtist],
                source: 'aggregated_online',
                totalAlbums: finalAlbums.length
            });
        }

        return NextResponse.json({ results: [], source: 'none' });
    } catch (error: any) {
        console.error('API /lidarr/lookup error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

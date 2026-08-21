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

        // 2. High-Quality Online Fallback via iTunes Search API (Fast, comprehensive metadata & hi-res art)
        try {
            const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=25`, { timeout: 6000 });
            if (itunesRes.data?.results) {
                const results = itunesRes.data.results.map((item: any) => {
                    const artwork = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : null;
                    return {
                        id: String(item.collectionId),
                        artistName: item.artistName,
                        albumTitle: item.collectionName,
                        title: item.collectionName,
                        genres: [item.primaryGenreName].filter(Boolean),
                        posterUrl: artwork,
                        remotePoster: artwork,
                        year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
                        releaseDate: item.releaseDate,
                        trackCount: item.trackCount,
                        recordLabel: item.copyright || item.artistName,
                        copyright: item.copyright,
                        foreignArtistId: item.artistId,
                        raw: item
                    };
                });
                return NextResponse.json({ results, source: 'itunes' });
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

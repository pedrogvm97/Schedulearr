import { NextResponse } from 'next/server';
import axios from 'axios';
import { sanitizeSongMetadata } from '@/lib/songSanitizer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q') || '';
        const rawArtist = searchParams.get('artist') || '';
        const rawTitle = searchParams.get('title') || '';

        const searchTerm = query || `${rawArtist} ${rawTitle}`.trim();
        if (!searchTerm) {
            return NextResponse.json({ results: [] });
        }

        const { searchQueries } = sanitizeSongMetadata(rawTitle || searchTerm, rawArtist);
        const activeQuery = searchQueries[0] || searchTerm;

        let results: Array<{
            id: string;
            title: string;
            artist: string;
            album: string;
            releaseYear?: string;
            coverUrl?: string;
            durationMs?: number;
            source: string;
        }> = [];

        // 1. Query iTunes Search API (Fast, comprehensive metadata & high-res artwork)
        try {
            const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(activeQuery)}&entity=song&limit=8`, {
                headers: { 'User-Agent': 'Schedulearr/0.5.8' },
                timeout: 5000
            });
            if (Array.isArray(itunesRes.data?.results)) {
                for (const item of itunesRes.data.results) {
                    const cover = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : undefined;
                    results.push({
                        id: `itunes-${item.trackId}`,
                        title: item.trackName,
                        artist: item.artistName,
                        album: item.collectionName,
                        releaseYear: item.releaseDate ? item.releaseDate.slice(0, 4) : undefined,
                        coverUrl: cover,
                        durationMs: item.trackTimeMillis,
                        source: 'Apple Music / iTunes'
                    });
                }
            }
        } catch {}

        // 2. Query Deezer Search API (Supplementary high-res metadata)
        if (results.length < 5) {
            try {
                const deezerRes = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(activeQuery)}&limit=8`, {
                    timeout: 5000
                });
                if (Array.isArray(deezerRes.data?.data)) {
                    for (const item of deezerRes.data.data) {
                        results.push({
                            id: `deezer-${item.id}`,
                            title: item.title,
                            artist: item.artist?.name || 'Artist',
                            album: item.album?.title || 'Album',
                            coverUrl: item.album?.cover_big || item.album?.cover_medium,
                            durationMs: item.duration ? item.duration * 1000 : undefined,
                            source: 'Deezer'
                        });
                    }
                }
            } catch {}
        }

        // Deduplicate results by normalized Artist + Title
        const seen = new Set<string>();
        const unique = results.filter(r => {
            const key = `${(r.artist || '').toLowerCase().trim()}___${(r.title || '').toLowerCase().trim()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return NextResponse.json({ results: unique.slice(0, 12) });
    } catch (e: any) {
        console.error('Error in music match route:', e);
        return NextResponse.json({ error: e.message, results: [] }, { status: 500 });
    }
}

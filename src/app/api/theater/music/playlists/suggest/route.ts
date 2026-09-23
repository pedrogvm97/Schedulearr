import { NextResponse } from 'next/server';
import db, { getTheaterLibraries, getCachedTheaterItems } from '@/lib/db';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');

        // Gather all music items across configured music libraries
        const libraries = getTheaterLibraries();
        const musicLibs = libraries.filter(l => l.type === 'music' || l.type === 'audiobooks');
        
        let allTracks: any[] = [];

        for (const lib of musicLibs) {
            if (libraryId && lib.id !== libraryId) continue;
            const cached = getCachedTheaterItems(lib.id);
            const items = cached?.items || (Array.isArray(cached) ? (cached as any[]) : []);
            if (Array.isArray(items) && items.length > 0) {
                allTracks.push(...items.filter((i: any) => i.category === 'audio'));
            }
        }

        // Deduplicate tracks by id or path/title
        const seenIds = new Set<string>();
        const uniqueTracks = allTracks.filter(t => {
            const key = t.id || `${t.artist}-${t.title}`;
            if (seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
        });

        // Fetch user star ratings from sqlite if available
        let trackRatings: Record<string, number> = {};
        try {
            const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'track_rating_%'").all() as Array<{ key: string; value: string }>;
            for (const r of rows) {
                const trackKey = (r.key as string).replace('track_rating_', '');
                trackRatings[trackKey] = parseInt(r.value, 10) || 0;
            }
        } catch {}

        const suggestions: Array<{
            id: string;
            title: string;
            description: string;
            badge: string;
            category: string;
            coverUrl?: string;
            items: any[];
        }> = [];

        // 1. Lossless Master Vault (FLAC, WAV, ALAC)
        const losslessTracks = uniqueTracks.filter(t => {
            const ext = (t.extension || '').toUpperCase();
            return ext === 'FLAC' || ext === 'WAV' || ext === 'ALAC';
        }).slice(0, 50);

        if (losslessTracks.length >= 3) {
            suggestions.push({
                id: 'lossless-master-vault',
                title: 'Lossless Master Vault',
                description: 'Studio-quality, uncompressed and bit-perfect audio tracks directly from your server.',
                badge: 'FLAC / Hi-Res',
                category: 'Audiophile',
                coverUrl: losslessTracks[0]?.posterUrl,
                items: losslessTracks
            });
        }

        // 2. Recently Added Grooves
        const recentTracks = [...uniqueTracks]
            .sort((a, b) => new Date(b.addedAt || b.modifiedAt || 0).getTime() - new Date(a.addedAt || a.modifiedAt || 0).getTime())
            .slice(0, 30);

        if (recentTracks.length >= 3) {
            suggestions.push({
                id: 'recently-added-grooves',
                title: 'Recently Added Grooves',
                description: 'The latest audio additions landed on your server disks and Plex sections.',
                badge: 'Fresh Cuts',
                category: 'Timeline',
                coverUrl: recentTracks[0]?.posterUrl,
                items: recentTracks
            });
        }

        // 3. Top Star Gems / Favorites
        const ratedTracks = uniqueTracks.filter(t => {
            const rating = trackRatings[t.id] || trackRatings[t.title] || 0;
            return rating >= 4;
        }).slice(0, 40);

        if (ratedTracks.length >= 2) {
            suggestions.push({
                id: 'top-server-gems',
                title: 'Top Server Gems',
                description: 'Your highest rated 4-star and 5-star master tracks on repeat.',
                badge: '★ 5-Star Rated',
                category: 'Favorites',
                coverUrl: ratedTracks[0]?.posterUrl,
                items: ratedTracks
            });
        }

        // 4. Acoustic & Unplugged
        const acousticKeywords = /acoustic|unplugged|piano|strings|folk|acoustic session|live at|stripped/i;
        const acousticTracks = uniqueTracks.filter(t => {
            const text = `${t.title || ''} ${t.album || ''} ${t.genre || ''}`;
            return acousticKeywords.test(text);
        }).slice(0, 35);

        if (acousticTracks.length >= 3) {
            suggestions.push({
                id: 'acoustic-unplugged',
                title: 'Acoustic & Unplugged',
                description: 'Intimate acoustic sessions, melodic strings, stripped arrangements, and unplugged concerts.',
                badge: 'Acoustic',
                category: 'Mood',
                coverUrl: acousticTracks[0]?.posterUrl,
                items: acousticTracks
            });
        }

        // 5. High Energy & Synth Drive
        const energeticKeywords = /dance|rock|electronic|synth|workout|electro|pump|energy|club|remix|upbeat/i;
        const energyTracks = uniqueTracks.filter(t => {
            const text = `${t.title || ''} ${t.album || ''} ${t.genre || ''}`;
            return energeticKeywords.test(text);
        }).slice(0, 35);

        if (energyTracks.length >= 3) {
            suggestions.push({
                id: 'high-energy-workout',
                title: 'High-Energy Drive & Workout',
                description: 'High-tempo anthems, driving rhythms, and punchy mixes for workouts and motivation.',
                badge: 'High BPM',
                category: 'Energy',
                coverUrl: energyTracks[0]?.posterUrl,
                items: energyTracks
            });
        }

        // 6. Deep Focus & Ambient Chill
        const chillKeywords = /chill|ambient|focus|lofi|lo-fi|soundtrack|classical|study|relax|mellow|night/i;
        const chillTracks = uniqueTracks.filter(t => {
            const text = `${t.title || ''} ${t.album || ''} ${t.genre || ''}`;
            return chillKeywords.test(text);
        }).slice(0, 35);

        if (chillTracks.length >= 3) {
            suggestions.push({
                id: 'deep-focus-chill',
                title: 'Deep Focus & Ambient Chill',
                description: 'Smooth, atmospheric soundscapes and calming rhythms perfect for coding and focus.',
                badge: 'Relax & Code',
                category: 'Focus',
                coverUrl: chillTracks[0]?.posterUrl,
                items: chillTracks
            });
        }

        // 7. Top Artist Anthology
        const artistCounts: Record<string, any[]> = {};
        for (const t of uniqueTracks) {
            const art = (t.artist || '').trim();
            if (art && art !== 'Unknown Artist' && art !== 'Various Artists') {
                if (!artistCounts[art]) artistCounts[art] = [];
                artistCounts[art].push(t);
            }
        }

        const sortedArtists = Object.entries(artistCounts).sort((a, b) => b[1].length - a[1].length);
        if (sortedArtists.length > 0 && sortedArtists[0][1].length >= 4) {
            const [topArtistName, topArtistTracks] = sortedArtists[0];
            suggestions.push({
                id: `artist-anthology-${encodeURIComponent(topArtistName.toLowerCase().replace(/\s+/g, '-'))}`,
                title: `${topArtistName}: The Anthology`,
                description: `Complete collection of tracks and albums by ${topArtistName} on your server.`,
                badge: 'Essential Artist',
                category: 'Anthology',
                coverUrl: topArtistTracks[0]?.posterUrl,
                items: topArtistTracks.slice(0, 40)
            });
        }

        // If no library items were loaded yet, supply smart defaults
        if (suggestions.length === 0 && uniqueTracks.length > 0) {
            suggestions.push({
                id: 'all-time-shuffled',
                title: 'Server Discovery Shuffle',
                description: 'An eclectic 25-track selection sampled across your server albums.',
                badge: 'Discovery',
                category: 'Mix',
                coverUrl: uniqueTracks[0]?.posterUrl,
                items: [...uniqueTracks].sort(() => 0.5 - Math.random()).slice(0, 25)
            });
        }

        return NextResponse.json({
            suggestions,
            totalTracksScanned: uniqueTracks.length
        });
    } catch (error: any) {
        console.error('API /theater/music/playlists/suggest GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

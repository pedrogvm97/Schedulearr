import { NextResponse } from 'next/server';
import axios from 'axios';
import { getSavedLyrics, saveLyrics } from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseLrc(lrcText: string): Array<{ time: number; text: string }> {
    if (!lrcText) return [];
    const lines = lrcText.split('\n');
    const result: Array<{ time: number; text: string }> = [];
    const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const matches = [...line.matchAll(timeRegex)];
        if (matches.length > 0) {
            const text = line.replace(timeRegex, '').trim();
            for (const match of matches) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const msStr = match[3] || '0';
                const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr, 10);
                const time = minutes * 60 + seconds + ms / 1000;
                result.push({ time, text });
            }
        }
    }

    return result.sort((a, b) => a.time - b.time);
}

function generateTrackKey(artist: string, title: string): string {
    const clean = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${clean(artist)}_${clean(title)}`;
}

import { sanitizeSongMetadata } from '@/lib/songSanitizer';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const rawArtist = searchParams.get('artist') || '';
        const rawTitle = searchParams.get('title') || '';
        const album = searchParams.get('album') || '';
        const duration = searchParams.get('duration'); // in seconds
        const searchQuery = searchParams.get('q'); // for manual search query
        const isSearch = searchParams.get('search') === 'true';

        const { cleanArtist, cleanTitle, searchQueries } = sanitizeSongMetadata(rawTitle, rawArtist);
        const artist = cleanArtist;
        const title = cleanTitle;

        // 1. If explicit search mode requested (for lyrics matching modal)
        if (isSearch || searchQuery) {
            const queryTerm = searchQuery || searchQueries[0] || `${rawArtist} ${rawTitle}`.trim();
            if (!queryTerm) {
                return NextResponse.json({ results: [] });
            }

            try {
                const searchRes = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(queryTerm)}`, {
                    headers: { 'User-Agent': 'Schedulearr/0.3.98 (https://github.com/pedrogvm97/Schedulearr)' },
                    timeout: 8000
                });

                const rawResults = Array.isArray(searchRes.data) ? searchRes.data : [];
                const formatted = rawResults.map((item: any) => ({
                    id: item.id,
                    trackName: item.trackName,
                    artistName: item.artistName,
                    albumName: item.albumName,
                    duration: item.duration,
                    instrumental: item.instrumental,
                    hasSyncedLyrics: !!item.syncedLyrics,
                    syncedLyrics: item.syncedLyrics || '',
                    plainLyrics: item.plainLyrics || '',
                    lines: parseLrc(item.syncedLyrics || '')
                }));

                return NextResponse.json({ results: formatted });
            } catch (e: any) {
                console.error('LRCLib search error:', e.message);
                return NextResponse.json({ results: [] });
            }
        }

        if (!title && !artist && !rawTitle && !rawArtist) {
            return NextResponse.json({ error: 'Artist or Title required' }, { status: 400 });
        }

        const trackKey = generateTrackKey(artist, title);
        const rawTrackKey = generateTrackKey(rawArtist, rawTitle);

        // 2. Check local SQLite database for manual override or cached lyrics (try both clean and raw keys)
        const saved = getSavedLyrics(trackKey) || getSavedLyrics(rawTrackKey);
        if (saved && (saved.synced_lyrics || saved.plain_lyrics)) {
            return NextResponse.json({
                trackKey,
                artist: saved.artist,
                title: saved.title,
                syncedLyrics: saved.synced_lyrics,
                plainLyrics: saved.plain_lyrics,
                source: saved.source || 'db_saved',
                lines: parseLrc(saved.synced_lyrics || ''),
                isSynced: !!saved.synced_lyrics
            });
        }

        // 3. Query LRCLib API directly using clean metadata
        let lrcData: any = null;
        try {
            const getParams = new URLSearchParams();
            if (artist) getParams.set('artist_name', artist);
            if (title) getParams.set('track_name', title);
            if (album) getParams.set('album_name', album);
            if (duration && !isNaN(Number(duration))) getParams.set('duration', String(Math.round(Number(duration))));

            const getRes = await axios.get(`https://lrclib.net/api/get?${getParams.toString()}`, {
                headers: { 'User-Agent': 'Schedulearr/0.3.98 (https://github.com/pedrogvm97/Schedulearr)' },
                timeout: 6000
            });
            lrcData = getRes.data;
        } catch {
            // If exact get failed, cascade through searchQueries variations
            for (const q of searchQueries) {
                try {
                    const searchRes = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
                        headers: { 'User-Agent': 'Schedulearr/0.3.98' },
                        timeout: 5000
                    });
                    if (Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                        // Prefer result with synced lyrics
                        lrcData = searchRes.data.find((d: any) => d.syncedLyrics) || searchRes.data[0];
                        break;
                    }
                } catch {}
            }
        }

        if (lrcData && (lrcData.syncedLyrics || lrcData.plainLyrics)) {
            const syncedLyrics = lrcData.syncedLyrics || '';
            const plainLyrics = lrcData.plainLyrics || '';

            // Auto-cache in SQLite under both sanitized and original keys
            saveLyrics(trackKey, artist || lrcData.artistName || '', title || lrcData.trackName || '', syncedLyrics, plainLyrics, 'lrclib_auto');
            if (rawTrackKey !== trackKey) {
                saveLyrics(rawTrackKey, artist || lrcData.artistName || '', title || lrcData.trackName || '', syncedLyrics, plainLyrics, 'lrclib_auto');
            }

            return NextResponse.json({
                trackKey,
                artist: artist || lrcData.artistName,
                title: title || lrcData.trackName,
                syncedLyrics,
                plainLyrics,
                source: 'lrclib',
                lines: parseLrc(syncedLyrics),
                isSynced: !!syncedLyrics
            });
        }

        return NextResponse.json({
            trackKey,
            artist,
            title,
            syncedLyrics: null,
            plainLyrics: null,
            lines: [],
            isSynced: false,
            message: 'No lyrics found'
        });
    } catch (e: any) {
        console.error('Error in lyrics route:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { artist, title, syncedLyrics, plainLyrics, trackKey: customKey } = body;

        if (!title && !artist) {
            return NextResponse.json({ error: 'Artist and Title required' }, { status: 400 });
        }

        const trackKey = customKey || generateTrackKey(artist, title);
        const success = saveLyrics(trackKey, artist || '', title || '', syncedLyrics || '', plainLyrics || '', 'manual_override');

        if (success) {
            return NextResponse.json({
                success: true,
                trackKey,
                lines: parseLrc(syncedLyrics || ''),
                message: 'Lyrics saved successfully'
            });
        }

        return NextResponse.json({ success: false, error: 'Failed to save lyrics in database' }, { status: 500 });
    } catch (e: any) {
        console.error('Error saving lyrics:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

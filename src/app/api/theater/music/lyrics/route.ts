import { NextResponse } from 'next/server';
import fs from 'fs';
import axios from 'axios';
import { getSavedLyrics, saveLyrics } from '@/lib/db';
import { sanitizeSongMetadata } from '@/lib/songSanitizer';
import {
    resolveAccessibleMediaPath,
    transcribeAudioChunk,
    alignPlainLyricsWithAudioTimestamps,
    generateLrcFromLines,
    parseLrcStringToLines
} from '@/lib/speechToText';
import { resolveLocalPath } from '@/app/api/theater/stream/route';

export const dynamic = 'force-dynamic';

function parseLrc(lrcText: string): Array<{ time: number; text: string }> {
    return parseLrcStringToLines(lrcText);
}

function generateTrackKey(artist: string, title: string): string {
    const clean = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${clean(artist)}_${clean(title)}`;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const rawArtist = searchParams.get('artist') || '';
        const rawTitle = searchParams.get('title') || '';
        const album = searchParams.get('album') || '';
        const duration = searchParams.get('duration'); // in seconds
        const searchQuery = searchParams.get('q'); // for manual search query
        const isSearch = searchParams.get('search') === 'true';
        const rawPath = searchParams.get('path') || '';
        const action = searchParams.get('action') || '';
        const forceTranscribe = action === 'transcribe' || searchParams.get('transcribe') === 'true';

        const { cleanArtist, cleanTitle, searchQueries } = sanitizeSongMetadata(rawTitle, rawArtist);
        const artist = cleanArtist;
        const title = cleanTitle;

        // 1. Explicit search mode requested (for lyrics matching modal)
        if (isSearch || searchQuery) {
            const queryTerm = searchQuery || searchQueries[0] || `${rawArtist} ${rawTitle}`.trim();
            if (!queryTerm) {
                return NextResponse.json({ results: [] });
            }

            try {
                const searchRes = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(queryTerm)}`, {
                    headers: { 'User-Agent': 'Schedulearr/0.6.38 (https://github.com/pedrogvm97/Schedulearr)' },
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

        if (!title && !artist && !rawTitle && !rawArtist && !rawPath) {
            return NextResponse.json({ error: 'Artist, Title, or Path required' }, { status: 400 });
        }

        const trackKey = generateTrackKey(artist, title);
        const rawTrackKey = generateTrackKey(rawArtist, rawTitle);

        // 2. Check local SQLite database for manual override or cached lyrics (unless forceTranscribe is requested)
        if (!forceTranscribe) {
            const saved = getSavedLyrics(trackKey) || getSavedLyrics(rawTrackKey);
            if (saved && saved.synced_lyrics) {
                return NextResponse.json({
                    trackKey,
                    artist: saved.artist,
                    title: saved.title,
                    syncedLyrics: saved.synced_lyrics,
                    plainLyrics: saved.plain_lyrics,
                    source: saved.source || 'db_saved',
                    lines: parseLrc(saved.synced_lyrics || ''),
                    isSynced: true
                });
            }
        }

        // 3. Query LRCLib API directly using clean metadata
        let lrcData: any = null;
        if (!forceTranscribe) {
            try {
                const getParams = new URLSearchParams();
                if (artist) getParams.set('artist_name', artist);
                if (title) getParams.set('track_name', title);
                if (album) getParams.set('album_name', album);
                if (duration && !isNaN(Number(duration))) getParams.set('duration', String(Math.round(Number(duration))));

                const getRes = await axios.get(`https://lrclib.net/api/get?${getParams.toString()}`, {
                    headers: { 'User-Agent': 'Schedulearr/0.6.38' },
                    timeout: 6000
                });
                lrcData = getRes.data;
            } catch {}

            if (!lrcData || !lrcData.syncedLyrics) {
                const targetSec = duration && !isNaN(Number(duration)) ? Number(duration) : null;
                for (const q of searchQueries) {
                    try {
                        const searchRes = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
                            headers: { 'User-Agent': 'Schedulearr/0.6.38' },
                            timeout: 5000
                        });
                        if (Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                            const syncedItems = searchRes.data.filter((d: any) => Boolean(d.syncedLyrics));
                            const pool = syncedItems.length > 0 ? syncedItems : searchRes.data;
                            if (targetSec !== null) {
                                pool.sort((a: any, b: any) => {
                                    const diffA = Math.abs((a.duration || 0) - targetSec);
                                    const diffB = Math.abs((b.duration || 0) - targetSec);
                                    return diffA - diffB;
                                });
                                const matched = pool.find((item: any) => Math.abs((item.duration || 0) - targetSec) <= 15);
                                lrcData = matched || pool[0];
                            } else {
                                lrcData = pool[0];
                            }
                            if (lrcData?.syncedLyrics) break;
                        }
                    } catch {}
                }
            }
        }

        // 4. If synchronized lyrics were found from LRCLib
        if (lrcData?.syncedLyrics && !forceTranscribe) {
            const syncedLyrics = lrcData.syncedLyrics || '';
            const plainLyrics = lrcData.plainLyrics || '';

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
                isSynced: true
            });
        }

        // 5. Speech-to-Text Fallback: When lyrics are missing, mismatched, or plain-only, transcribe audio!
        const audioFileCandidate = rawPath ? (resolveAccessibleMediaPath(rawPath, 'music') || resolveLocalPath(rawPath)) : null;

        if (audioFileCandidate && fs.existsSync(audioFileCandidate)) {
            try {
                const trackDurationSec = duration && !isNaN(Number(duration)) ? Number(duration) : 0;
                const sttRes = await transcribeAudioChunk({
                    audioPath: audioFileCandidate,
                    startOffsetSec: 0,
                    durationSec: trackDurationSec > 0 ? trackDurationSec : 600,
                    cpuThreads: 2
                });

                if (sttRes.success && sttRes.lines.length > 0) {
                    let finalLines = sttRes.lines;
                    const existingPlain = lrcData?.plainLyrics || '';

                    // If plain lyrics exist from LRCLib, align them to audio timestamps for perfect wording
                    if (existingPlain && existingPlain.trim().length > 10) {
                        finalLines = alignPlainLyricsWithAudioTimestamps(existingPlain, sttRes.lines);
                    }

                    const syncedLyrics = generateLrcFromLines(finalLines);
                    const plainLyrics = existingPlain || sttRes.plainText;

                    saveLyrics(trackKey, artist || 'Artist', title || 'Title', syncedLyrics, plainLyrics, 'speech_to_text');
                    if (rawTrackKey !== trackKey) {
                        saveLyrics(rawTrackKey, artist || 'Artist', title || 'Title', syncedLyrics, plainLyrics, 'speech_to_text');
                    }

                    return NextResponse.json({
                        trackKey,
                        artist,
                        title,
                        syncedLyrics,
                        plainLyrics,
                        source: `stt_${sttRes.provider.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                        lines: parseLrc(syncedLyrics),
                        isSynced: true
                    });
                }
            } catch (sttErr: any) {
                console.warn('Speech-to-text music lyrics error:', sttErr.message);
            }
        }

        // 6. If plain lyrics exist without synced timestamps
        if (lrcData?.plainLyrics) {
            return NextResponse.json({
                trackKey,
                artist: artist || lrcData.artistName,
                title: title || lrcData.trackName,
                syncedLyrics: null,
                plainLyrics: lrcData.plainLyrics,
                source: 'lrclib_plain',
                lines: [],
                isSynced: false
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
        const { artist, title, syncedLyrics, plainLyrics, trackKey: customKey, action, path: rawPath, duration } = body;

        // If action is transcribe, run STT on the audio file
        if (action === 'transcribe' && rawPath) {
            const resolved = resolveAccessibleMediaPath(rawPath, 'music') || resolveLocalPath(rawPath);
            if (resolved && fs.existsSync(resolved)) {
                const trackDurationSec = duration && !isNaN(Number(duration)) ? Number(duration) : 0;
                const sttRes = await transcribeAudioChunk({
                    audioPath: resolved,
                    startOffsetSec: 0,
                    durationSec: trackDurationSec > 0 ? trackDurationSec : 600,
                    cpuThreads: 2
                });

                if (sttRes.success && sttRes.lines.length > 0) {
                    let finalLines = sttRes.lines;
                    if (plainLyrics && plainLyrics.trim().length > 10) {
                        finalLines = alignPlainLyricsWithAudioTimestamps(plainLyrics, sttRes.lines);
                    }
                    const newSynced = generateLrcFromLines(finalLines);
                    const newPlain = plainLyrics || sttRes.plainText;
                    const trackKey = customKey || generateTrackKey(artist, title);

                    saveLyrics(trackKey, artist || '', title || '', newSynced, newPlain, 'speech_to_text');

                    return NextResponse.json({
                        success: true,
                        trackKey,
                        syncedLyrics: newSynced,
                        plainLyrics: newPlain,
                        lines: parseLrc(newSynced),
                        isSynced: true,
                        source: sttRes.provider
                    });
                }
            }
        }

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

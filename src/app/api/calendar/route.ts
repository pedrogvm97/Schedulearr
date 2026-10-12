import { NextResponse } from 'next/server';
import {
    getSearchHistory,
    getPlaybackHistory,
    getRecentAudiobookActivity,
    getDvrRecordings,
    getCachedCalendarReleases,
    getTotalCachedCalendarReleasesCount,
    getCalendarSyncConfig
} from '@/lib/db';
import { fetchAndCacheCalendarReleasesRange, runPeriodicCalendarSync } from '@/lib/calendarSync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');
        const unmonitored = searchParams.get('unmonitored') !== 'false'; // default to true
        const forceRefresh = searchParams.get('refresh') === 'true';

        if (!start || !end) {
            return NextResponse.json({ error: 'start and end dates are required (YYYY-MM-DD)' }, { status: 400 });
        }

        let releaseEvents: any[] = [];
        let cacheStatus = 'HIT';

        if (!forceRefresh) {
            const cached = getCachedCalendarReleases(start, end);
            if (cached.length > 0 || getTotalCachedCalendarReleasesCount() > 0) {
                releaseEvents = cached;
                cacheStatus = 'HIT';
            } else {
                // First ever load with empty cache: fetch live and populate cache
                const synced = await fetchAndCacheCalendarReleasesRange(start, end, unmonitored);
                releaseEvents = synced.events;
                cacheStatus = 'MISS_POPULATED';
                // Also kick off full 210-day window sync in background
                runPeriodicCalendarSync(true).catch(() => {});
            }
        } else {
            const synced = await fetchAndCacheCalendarReleasesRange(start, end, unmonitored);
            releaseEvents = synced.events;
            cacheStatus = 'REFRESHED';
        }

        const events: any[] = [...releaseEvents];

        // 2. Include Actual Downloads / Snatches / Automated Batches
        try {
            const history = getSearchHistory(200);
            for (const h of history) {
                const movies = Array.isArray(h.movies_searched) ? h.movies_searched : [];
                const episodes = Array.isArray(h.episodes_searched) ? h.episodes_searched : [];
                const allItems = [...movies, ...episodes];
                if (allItems.length === 0 && !h.reason) continue;
                const dateIso = h.timestamp
                    ? new Date(h.timestamp.replace(' ', 'T') + (h.timestamp.includes('Z') ? '' : 'Z')).toISOString()
                    : new Date().toISOString();
                const summaryTitle =
                    allItems.length > 0
                        ? `Downloaded / Snatched: ${allItems.slice(0, 3).join(', ')}${allItems.length > 3 ? ` (+${allItems.length - 3} more)` : ''}`
                        : h.reason || `Batch Activity (${h.profile})`;

                events.push({
                    id: `dl-${h.id}`,
                    eventCategory: 'download',
                    instanceId: 'schedulearr-downloads',
                    instanceName: 'Downloads & Snatches',
                    instanceColor: '#3b82f6',
                    type: 'radarr',
                    mediaType: movies.length >= episodes.length ? 'movie' : 'series',
                    title: summaryTitle,
                    releaseDate: dateIso,
                    releaseType: 'download',
                    monitored: true,
                    hasFile: true,
                    overview: h.reason || `Profile: ${h.profile} • ${movies.length} movie(s), ${episodes.length} episode(s)`,
                    genres: ['Download', h.category || 'Search'],
                    mediaItem: null
                });
            }
        } catch {}

        // 3. Include Audiobook Transcriptions, Scene Art & Audio Enhancements
        try {
            const bookActs = getRecentAudiobookActivity(200);
            for (const act of bookActs) {
                const badges: string[] = [];
                if (act.transcription_status === 'completed') badges.push('Synced Transcription');
                if (act.illustration_status === 'completed') badges.push('AI Scene Art');
                if (act.audio_enhance_status === 'completed') badges.push('Audio Clarity DSP');
                if (badges.length === 0) badges.push('Processing in Studio');

                let firstSceneImg = act.book_thumb || '';
                try {
                    const imgs = JSON.parse(act.images_json || '[]');
                    const kept = imgs.find((i: any) => i.kept) || imgs[0];
                    if (kept?.url) firstSceneImg = kept.url;
                } catch {}

                events.push({
                    id: `book-ai-${act.chapter_key}`,
                    eventCategory: 'transcription',
                    instanceId: 'audiobook-studio',
                    instanceName: 'Audiobook AI Studio',
                    instanceColor: '#f59e0b',
                    type: 'radarr',
                    mediaType: 'audiobook',
                    title: `${act.book_title || 'Audiobook'} — ${act.title}`,
                    releaseDate: act.updated_at || new Date().toISOString(),
                    releaseType: 'transcription',
                    monitored: true,
                    hasFile: true,
                    overview: `${badges.join(' • ')}${act.plain_transcript ? ` — "${String(act.plain_transcript).slice(0, 180)}..."` : ''}`,
                    posterUrl: firstSceneImg,
                    genres: badges,
                    mediaItem: null
                });
            }
        } catch {}

        // 4. Include Actual Playbacks (Movies, Series, Music, Audiobooks, Live TV)
        try {
            const playbacks = getPlaybackHistory(250);
            for (const pb of playbacks) {
                const dateIso = pb.viewedAt ? new Date(Number(pb.viewedAt)).toISOString() : new Date().toISOString();
                events.push({
                    id: `play-${pb.id}-${pb.viewedAt}`,
                    eventCategory: 'playback',
                    instanceId: 'playback-history',
                    instanceName: pb.instanceName || 'Theater Playback',
                    instanceColor: '#a855f7',
                    type: 'radarr',
                    mediaType: pb.mediaType === 'series' ? 'series' : 'movie',
                    title: pb.seriesTitle ? `${pb.seriesTitle} — ${pb.title}` : pb.title,
                    releaseDate: dateIso,
                    releaseType: 'playback',
                    monitored: true,
                    hasFile: true,
                    overview: `Played by ${pb.user?.name || 'Pedro'} on ${pb.player?.title || 'Web Player'} (${pb.player?.platform || 'Web'})`,
                    posterUrl: pb.poster || '',
                    genres: ['Playback', pb.mediaType || 'Media'],
                    mediaItem: null
                });
            }
        } catch {}

        // 5. Include Live TV DVR Recordings
        try {
            const recs = getDvrRecordings(150);
            for (const r of recs) {
                events.push({
                    id: `dvr-${r.id}`,
                    eventCategory: 'dvr',
                    instanceId: 'iptv-dvr',
                    instanceName: `Live DVR (${r.channel_name})`,
                    instanceColor: '#ef4444',
                    type: 'sonarr',
                    mediaType: 'series',
                    title: `${r.program_title} (${r.channel_name})`,
                    releaseDate: r.start_time || r.created_at || new Date().toISOString(),
                    releaseType: 'dvr',
                    monitored: true,
                    hasFile: r.status === 'completed',
                    overview: `DVR Status: ${r.status.toUpperCase()} • Destination: ${r.destination_path}`,
                    posterUrl: r.channel_logo || '',
                    genres: ['Live TV DVR', r.status],
                    mediaItem: null
                });
            }
        } catch {}

        // Filter events strictly by the requested range
        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setUTCHours(23, 59, 59, 999);

        const filteredEvents = events.filter(e => {
            const d = new Date(e.releaseDate);
            return !isNaN(d.getTime()) && d >= startDate && d <= endDate;
        });

        filteredEvents.sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());

        const syncCfg = getCalendarSyncConfig();
        return NextResponse.json(filteredEvents, {
            headers: {
                'X-Calendar-Cache': cacheStatus,
                'X-Calendar-Last-Sync': syncCfg.lastSync || ''
            }
        });
    } catch (error) {
        console.error('API /calendar error:', error);
        return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import {
    getInstances,
    getSearchHistory,
    getPlaybackHistory,
    getRecentAudiobookActivity,
    getDvrRecordings
} from '@/lib/db';
import { getCalendar as getRadarrCalendar } from '@/lib/radarr';
import { getCalendar as getSonarrCalendar } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');
        const unmonitored = searchParams.get('unmonitored') !== 'false'; // default to true

        if (!start || !end) {
            return NextResponse.json({ error: 'start and end dates are required (YYYY-MM-DD)' }, { status: 400 });
        }

        const instances = getInstances(undefined, true);
        const radarrInstances = instances.filter(i => i.type === 'radarr');
        const sonarrInstances = instances.filter(i => i.type === 'sonarr');

        let events: any[] = [];

        await Promise.all([
            ...radarrInstances.map(async (instance) => {
                const data = await getRadarrCalendar(instance.url, instance.api_key, start, end, unmonitored);
                (Array.isArray(data) ? data : []).forEach((movie: any) => {
                    const poster = movie.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || 
                                   movie.images?.find((img: any) => img.coverType === 'poster')?.url || 
                                   movie.remotePoster || '';

                    const sizeOnDisk = movie.sizeOnDisk || movie.movieFile?.size || 0;
                    const addEvent = (dateStr: string | undefined, type: 'cinemas' | 'physical' | 'digital') => {
                        if (dateStr) {
                            events.push({
                                id: `${instance.id}-radarr-${movie.id}-${type}`,
                                eventCategory: 'release',
                                instanceId: instance.id,
                                instanceName: instance.name,
                                instanceColor: instance.color,
                                type: 'radarr',
                                mediaType: 'movie',
                                title: movie.title,
                                releaseDate: dateStr,
                                releaseType: type,
                                monitored: movie.monitored,
                                hasFile: movie.hasFile,
                                overview: movie.overview,
                                posterUrl: poster,
                                year: movie.year,
                                rating: movie.ratings?.value || movie.ratings?.tmdb?.value,
                                genres: movie.genres || [],
                                mediaItem: {
                                    ...movie,
                                    id: movie.id,
                                    sizeOnDisk,
                                    type: 'movie',
                                    mediaType: 'movie',
                                    remotePoster: poster
                                }
                            });
                        }
                    };
                    addEvent(movie.inCinemas, 'cinemas');
                    addEvent(movie.physicalRelease, 'physical');
                    addEvent(movie.digitalRelease, 'digital');
                });
            }),
            ...sonarrInstances.map(async (instance) => {
                const data = await getSonarrCalendar(instance.url, instance.api_key, start, end, unmonitored);
                (Array.isArray(data) ? data : []).forEach((ep: any) => {
                    const series = ep.series || {};
                    const seriesId = ep.seriesId || series.id;
                    const seriesTitle = series.title || ep.seriesTitle || 'Unknown Series';
                    const seriesPoster = series.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || 
                                         series.images?.find((img: any) => img.coverType === 'poster')?.url || 
                                         series.remotePoster ||
                                         ep.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || 
                                         ep.images?.find((img: any) => img.coverType === 'poster')?.url || '';
                    const sizeOnDisk = series.statistics?.sizeOnDisk || ep.episodeFile?.size || 0;

                    events.push({
                        id: `${instance.id}-sonarr-${ep.id}`,
                        eventCategory: 'release',
                        instanceId: instance.id,
                        instanceName: instance.name,
                        instanceColor: instance.color,
                        type: 'sonarr',
                        mediaType: 'series',
                        seriesTitle,
                        episodeTitle: ep.title,
                        seasonNumber: ep.seasonNumber,
                        episodeNumber: ep.episodeNumber,
                        title: `${seriesTitle} - S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
                        fullTitle: `${seriesTitle} - S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`,
                        releaseDate: ep.airDateUtc,
                        releaseType: 'tv',
                        monitored: ep.monitored,
                        hasFile: ep.hasFile,
                        overview: ep.overview || series.overview,
                        posterUrl: seriesPoster,
                        rating: series.ratings?.value || ep.ratings?.value,
                        genres: series.genres || ep.genres || [],
                        mediaItem: {
                            ...series,
                            ...ep,
                            id: seriesId,
                            seriesId: seriesId,
                            title: seriesTitle,
                            year: series.year || ep.year,
                            tvdbId: series.tvdbId || ep.tvdbId,
                            tmdbId: series.tmdbId || ep.tmdbId,
                            imdbId: series.imdbId || ep.imdbId,
                            overview: series.overview || ep.overview,
                            ratings: series.ratings || ep.ratings,
                            genres: series.genres || ep.genres || [],
                            seasons: series.seasons || [],
                            sizeOnDisk,
                            qualityProfileId: series.qualityProfileId || ep.qualityProfileId,
                            remotePoster: seriesPoster,
                            images: series.images || ep.images || [],
                            type: 'series',
                            mediaType: 'series'
                        }
                    });
                });
            })
        ]);

        // 2. Include Actual Downloads / Snatches / Automated Batches
        try {
            const history = getSearchHistory(200);
            for (const h of history) {
                const movies = Array.isArray(h.movies_searched) ? h.movies_searched : [];
                const episodes = Array.isArray(h.episodes_searched) ? h.episodes_searched : [];
                const allItems = [...movies, ...episodes];
                if (allItems.length === 0 && !h.reason) continue;
                const dateIso = h.timestamp ? new Date(h.timestamp.replace(' ', 'T') + (h.timestamp.includes('Z') ? '' : 'Z')).toISOString() : new Date().toISOString();
                const summaryTitle = allItems.length > 0
                    ? `Downloaded / Snatched: ${allItems.slice(0, 3).join(', ')}${allItems.length > 3 ? ` (+${allItems.length - 3} more)` : ''}`
                    : (h.reason || `Batch Activity (${h.profile})`);

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

        return NextResponse.json(filteredEvents);
    } catch (error) {
        console.error('API /calendar error:', error);
        return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
    }
}


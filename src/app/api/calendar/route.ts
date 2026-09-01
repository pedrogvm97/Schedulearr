import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
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

        // Filter events strictly by the requested range
        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setUTCHours(23, 59, 59, 999);

        const filteredEvents = events.filter(e => {
            const d = new Date(e.releaseDate);
            return d >= startDate && d <= endDate;
        });

        filteredEvents.sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());

        return NextResponse.json(filteredEvents);
    } catch (error) {
        console.error('API /calendar error:', error);
        return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
    }
}

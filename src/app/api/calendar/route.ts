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
                data.forEach((movie: any) => {
                    const addEvent = (dateStr: string | undefined, type: string) => {
                        if (dateStr) {
                            events.push({
                                id: `${instance.id}-radarr-${movie.id}-${type}`,
                                instanceId: instance.id,
                                instanceName: instance.name,
                                instanceColor: instance.color,
                                type: 'radarr',
                                title: movie.title,
                                releaseDate: dateStr,
                                releaseType: type,
                                monitored: movie.monitored,
                                hasFile: movie.hasFile,
                                overview: movie.overview,
                                mediaItem: movie
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
                data.forEach((ep: any) => {
                    events.push({
                        id: `${instance.id}-sonarr-${ep.id}`,
                        instanceId: instance.id,
                        instanceName: instance.name,
                        instanceColor: instance.color,
                        type: 'sonarr',
                        title: `${ep.series?.title || 'Unknown Series'} - S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`,
                        releaseDate: ep.airDateUtc,
                        releaseType: 'tv',
                        monitored: ep.monitored,
                        hasFile: ep.hasFile,
                        overview: ep.overview,
                        mediaItem: ep
                    });
                });
            })
        ]);

        // Filter events strictly by the requested range to avoid leaking outside of [start, end]
        const startDate = new Date(start);
        const endDate = new Date(end);
        // end date should include the whole day
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

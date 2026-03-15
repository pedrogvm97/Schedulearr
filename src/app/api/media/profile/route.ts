import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { updateMovie, getAllMovies } from '@/lib/radarr';
import { updateSeries, getAllSeries } from '@/lib/sonarr';

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { instanceId, type, mediaId, profileId } = body;

        if (!instanceId || !type || !mediaId || profileId === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(i => i.id.toString() === instanceId);

        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        if (type === 'movie') {
            const movies = await getAllMovies(instance.url, instance.api_key);
            const movie = movies.find(m => m.id === mediaId);
            if (!movie) return NextResponse.json({ error: 'Movie not found on instance' }, { status: 404 });

            movie.qualityProfileId = profileId;
            const result = await updateMovie(instance.url, instance.api_key, movie);
            return NextResponse.json(result);
        } else if (type === 'series') {
            const seriesList = await getAllSeries(instance.url, instance.api_key);
            const series = seriesList.find(s => s.id === mediaId);
            if (!series) return NextResponse.json({ error: 'Series not found on instance' }, { status: 404 });

            series.qualityProfileId = profileId;
            const result = await updateSeries(instance.url, instance.api_key, series);
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Invalid media type' }, { status: 400 });
    } catch (error) {
        console.error('API /media/profile error:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getAllMovies, getQueue as getRadarrQueue } from '@/lib/radarr';
import { getAllSeries, getQueue as getSonarrQueue } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title');
    const type = searchParams.get('type') as 'movie' | 'series';

    if (!title || !type) {
        return NextResponse.json({ error: 'Missing title or type' }, { status: 400 });
    }

    try {
        const instances = getInstances(type === 'movie' ? 'radarr' : 'sonarr');
        const results = {
            exists: false,
            hasFile: false,
            isDownloading: false,
            percentage: 0,
            sizeOnDisk: 0,
            instances: [] as any[]
        };

        const searchLower = title.toLowerCase();

        for (const instance of instances) {
            try {
                if (type === 'movie') {
                    const [movies, queue] = await Promise.all([
                        getAllMovies(instance.url, instance.api_key),
                        getRadarrQueue(instance.url, instance.api_key)
                    ]);

                    const movie = movies.find(m => m.title.toLowerCase() === searchLower || (m as any).originalTitle?.toLowerCase() === searchLower);
                    if (movie) {
                        results.exists = true;
                        const isDownloading = queue.some(q => q.movieId === movie.id);
                        const hasFile = movie.hasFile || (movie.movieFile?.size && movie.movieFile.size > 0) || (movie.sizeOnDisk && movie.sizeOnDisk > 0);
                        const size = movie.sizeOnDisk || movie.movieFile?.size || 0;

                        results.hasFile = results.hasFile || !!hasFile;
                        results.isDownloading = results.isDownloading || isDownloading;
                        results.sizeOnDisk = Math.max(results.sizeOnDisk, size);
                        if (hasFile) results.percentage = 100;
                        
                        results.instances.push({
                            id: instance.id,
                            name: instance.name,
                            internalId: movie.id
                        });
                    }
                } else {
                    const [allSeries, queue] = await Promise.all([
                        getAllSeries(instance.url, instance.api_key),
                        getSonarrQueue(instance.url, instance.api_key)
                    ]);

                    const series = allSeries.find(s => s.title.toLowerCase() === searchLower);
                    if (series) {
                        results.exists = true;
                        const isDownloading = queue.some(q => q.seriesId === series.id);
                        const hasFile = (series.statistics?.percentOfEpisodes === 100) || (series.statistics?.episodeFileCount && series.statistics.episodeFileCount > 0);
                        const pct = series.statistics?.percentOfEpisodes || 0;
                        const size = series.statistics?.sizeOnDisk || 0;

                        results.hasFile = results.hasFile || !!hasFile;
                        results.isDownloading = results.isDownloading || isDownloading;
                        results.percentage = Math.max(results.percentage, pct);
                        results.sizeOnDisk = Math.max(results.sizeOnDisk, size);
                        
                        results.instances.push({
                            id: instance.id,
                            name: instance.name,
                            internalId: series.id
                        });
                    }
                }
            } catch (err) {
                console.error(`Error checking status on instance ${instance.name}:`, err);
            }
        }

        return NextResponse.json(results);
    } catch (error) {
        console.error('API /media/status error:', error);
        return NextResponse.json({ error: 'Failed to fetch media status' }, { status: 500 });
    }
}

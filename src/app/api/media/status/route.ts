import { NextRequest, NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getAllMovies, getQueue as getRadarrQueue, getCommands as getRadarrCommands } from '@/lib/radarr';
import { getAllSeries, getQueue as getSonarrQueue, getCommands as getSonarrCommands } from '@/lib/sonarr';

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
            isSearching: false,
            isStalled: false,
            percentage: 0,
            sizeOnDisk: 0,
            statusLabel: 'Not Added',
            instances: [] as any[]
        };

        const searchLower = title.toLowerCase();

        for (const instance of instances) {
            try {
                if (type === 'movie') {
                    const [movies, queue, commands] = await Promise.all([
                        getAllMovies(instance.url, instance.api_key),
                        getRadarrQueue(instance.url, instance.api_key),
                        getRadarrCommands(instance.url, instance.api_key)
                    ]);

                    const movie = movies.find(m => m.title.toLowerCase() === searchLower || (m as any).originalTitle?.toLowerCase() === searchLower);
                    if (movie) {
                        results.exists = true;
                        const queueItem = queue.find(q => q.movieId === movie.id);
                        const isDownloading = !!queueItem;
                        const isStalled = queueItem?.status?.toLowerCase() === 'stalled' || queueItem?.trackedDownloadStatus?.toLowerCase() === 'warning';
                        const isSearching = commands.some(c => 
                            (c.name === 'MoviesSearch' || c.name === 'MovieSearch') && 
                            (c.body?.movieIds?.includes(movie.id) || c.body?.movieId === movie.id)
                        );

                        const hasFile = movie.hasFile || (movie.movieFile?.size && movie.movieFile.size > 0) || (movie.sizeOnDisk && movie.sizeOnDisk > 0);
                        const size = movie.sizeOnDisk || movie.movieFile?.size || 0;

                        results.hasFile = results.hasFile || !!hasFile;
                        results.isDownloading = results.isDownloading || isDownloading;
                        results.isStalled = results.isStalled || isStalled;
                        results.isSearching = results.isSearching || isSearching;
                        results.sizeOnDisk = Math.max(results.sizeOnDisk, size);
                        if (hasFile) results.percentage = 100;
                        
                        results.instances.push({
                            id: instance.id,
                            name: instance.name,
                            internalId: movie.id
                        });
                    }
                } else {
                    const [allSeries, queue, commands] = await Promise.all([
                        getAllSeries(instance.url, instance.api_key),
                        getSonarrQueue(instance.url, instance.api_key),
                        getSonarrCommands(instance.url, instance.api_key)
                    ]);

                    const series = allSeries.find(s => s.title.toLowerCase() === searchLower);
                    if (series) {
                        results.exists = true;
                        const queueItem = queue.find(q => q.seriesId === series.id);
                        const isDownloading = !!queueItem;
                        const isStalled = queueItem?.status?.toLowerCase() === 'stalled' || queueItem?.trackedDownloadDownloadStatus?.toLowerCase() === 'warning';
                        const isSearching = commands.some(c => 
                            (c.name === 'SeriesSearch' || c.name === 'SeasonSearch' || c.name === 'EpisodeSearch') && 
                            (c.body?.seriesId === series.id)
                        );

                        const hasFile = (series.statistics?.percentOfEpisodes === 100) || (series.statistics?.episodeFileCount && series.statistics.episodeFileCount > 0);
                        const pct = series.statistics?.percentOfEpisodes || 0;
                        const size = series.statistics?.sizeOnDisk || 0;

                        results.hasFile = results.hasFile || !!hasFile;
                        results.isDownloading = results.isDownloading || isDownloading;
                        results.isStalled = results.isStalled || isStalled;
                        results.isSearching = results.isSearching || isSearching;
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

        // Determine final label
        if (!results.exists) {
            results.statusLabel = 'Not Added';
        } else if (results.hasFile) {
            results.statusLabel = 'Available';
        } else if (results.isStalled) {
            results.statusLabel = 'Stalled';
        } else if (results.isDownloading) {
            results.statusLabel = 'Downloading';
        } else if (results.isSearching) {
            results.statusLabel = 'Searching';
        } else {
            results.statusLabel = 'In Library';
        }

        return NextResponse.json(results);
    } catch (error) {
        console.error('API /media/status error:', error);
        return NextResponse.json({ error: 'Failed to fetch media status' }, { status: 500 });
    }
}

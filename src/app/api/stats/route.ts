import { NextResponse } from 'next/server';
import { getInstances, Instance } from '@/lib/db';
import { getGrabHistory as getRadarrHistory } from '@/lib/radarr';
import { getGrabHistory as getSonarrHistory } from '@/lib/sonarr';

export async function GET() {
    try {
        const instances = getInstances();

        if (!instances || instances.length === 0) {
            return NextResponse.json({ data: [] });
        }

        // Calculate 30 days ago limit
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

        // Prepare data map: YYYY-MM-DD -> { [instanceId]: string[] } (array of titles)
        const dailyStats: Record<string, Record<string, string[]>> = {};

        // Initialize 30 days of empty maps
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            const dateStr = d.toISOString().split('T')[0];
            dailyStats[dateStr] = {};
        }

        const instanceMetadata: Record<string, { name: string, color: string, type: string }> = {};

        // Fetch history across all instances concurrently
        const fetchPromises = instances.map(async (instance: Instance) => {
            const id = instance.id.toString();
            instanceMetadata[id] = {
                name: instance.name,
                color: instance.color || '#3b82f6', // fallback blue
                type: instance.type
            };

            try {
                let records: any[] = [];
                if (instance.type === 'radarr') {
                    records = await getRadarrHistory(instance.url, instance.api_key, 1000);
                } else if (instance.type === 'sonarr') {
                    records = await getSonarrHistory(instance.url, instance.api_key, 1000);
                }

                records.forEach(record => {
                    const recordDate = new Date(record.date);
                    if (recordDate >= thirtyDaysAgo && recordDate <= now) {
                        const dateStr = recordDate.toISOString().split('T')[0];
                        if (dailyStats[dateStr]) {
                            if (!dailyStats[dateStr][id]) dailyStats[dateStr][id] = [];

                            // Try to extract clean title, fallback to sourceTitle
                            let title = record.sourceTitle || 'Unknown Release';
                            if (record.movie && record.movie.title) title = record.movie.title;
                            if (record.series && record.series.title) {
                                let epInfo = '';
                                if (record.episode && record.episode.seasonNumber !== undefined && record.episode.episodeNumber !== undefined) {
                                    epInfo = ` S${record.episode.seasonNumber.toString().padStart(2, '0')}E${record.episode.episodeNumber.toString().padStart(2, '0')}`;
                                }
                                title = record.series.title + epInfo;
                            }

                            dailyStats[dateStr][id].push(title);
                        }
                    }
                });
            } catch (err) {
                console.error(`Failed to fetch history for instance ${instance.name}`, err);
            }
        });

        await Promise.all(fetchPromises);

        // Convert the map to an array for recharts
        const chartData = Object.keys(dailyStats).sort().map(date => {
            const dayObj: any = { date };
            Object.keys(instanceMetadata).forEach(instanceId => {
                const titles = dailyStats[date][instanceId] || [];
                dayObj[instanceId] = titles.length;
                dayObj[`${instanceId}_titles`] = titles;
            });
            return dayObj;
        });

        return NextResponse.json({ data: chartData, instances: instanceMetadata });
    } catch (error) {
        console.error('API /stats error:', error);
        return NextResponse.json({ error: 'Failed to generate statistics' }, { status: 500 });
    }
}

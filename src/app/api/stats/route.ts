import { NextResponse } from 'next/server';
import { getInstances, Instance } from '@/lib/db';
import { getGrabHistory as getRadarrHistory } from '@/lib/radarr';
import { getGrabHistory as getSonarrHistory } from '@/lib/sonarr';

const tailwindToHex = (twClass: string) => {
    if (!twClass) return '#3b82f6';
    if (twClass.startsWith('#')) return twClass;
    if (twClass.includes('slate')) return '#64748b';
    if (twClass.includes('gray')) return '#6b7280';
    if (twClass.includes('zinc')) return '#71717a';
    if (twClass.includes('neutral')) return '#737373';
    if (twClass.includes('stone')) return '#78716c';
    if (twClass.includes('red')) return '#ef4444';
    if (twClass.includes('orange')) return '#f97316';
    if (twClass.includes('amber')) return '#f59e0b';
    if (twClass.includes('yellow')) return '#eab308';
    if (twClass.includes('lime')) return '#84cc16';
    if (twClass.includes('green')) return '#22c55e';
    if (twClass.includes('emerald')) return '#10b981';
    if (twClass.includes('teal')) return '#14b8a6';
    if (twClass.includes('cyan')) return '#06b6d4';
    if (twClass.includes('sky')) return '#0ea5e9';
    if (twClass.includes('blue')) return '#3b82f6';
    if (twClass.includes('indigo')) return '#6366f1';
    if (twClass.includes('violet')) return '#8b5cf6';
    if (twClass.includes('purple')) return '#a855f7';
    if (twClass.includes('fuchsia')) return '#d946ef';
    if (twClass.includes('pink')) return '#ec4899';
    if (twClass.includes('rose')) return '#f43f5e';
    return '#3b82f6'; // fallback blue
};

export async function GET() {
    try {
        const allInstances = getInstances();
        const instances = allInstances.filter(i => i.type === 'radarr' || i.type === 'sonarr');

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
                color: tailwindToHex(instance.color || ''),
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
                            if (record.movie && record.movie.title) title = `${record.movie.title} (Movie)`;
                            if (record.series && record.series.title) {
                                let epInfo = '';
                                if (record.episode && record.episode.seasonNumber !== undefined && record.episode.episodeNumber !== undefined) {
                                    epInfo = ` S${record.episode.seasonNumber.toString().padStart(2, '0')}E${record.episode.episodeNumber.toString().padStart(2, '0')}`;
                                }
                                title = `${record.series.title}${epInfo} (Series)`;
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

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
        const allRecentRecords: { title: string, date: string, instanceId: string, status: string, size?: number }[] = [];

        // Track stats by type: grabbed, imported, failed, size
        const statsSummary: Record<string, Record<string, { grabbed: number, imported: number, failed: number, sizeBytes: number }>> = {};
        // Initialize summary structure
        Object.keys(dailyStats).forEach(date => {
            statsSummary[date] = {};
        });

        // Fetch history across all instances concurrently
        const fetchPromises = instances.map(async (instance: Instance) => {
            const id = instance.id.toString();
            instanceMetadata[id] = {
                name: instance.name,
                color: tailwindToHex(instance.color || ''),
                type: instance.type
            };

            // Initialize summary for this instance
            Object.keys(statsSummary).forEach(date => {
                statsSummary[date][id] = { grabbed: 0, imported: 0, failed: 0, sizeBytes: 0 };
            });

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
                            // Event Types: 1=Grabbed, 3=Imported (Radarr), 4=Failed, 7=Imported (Sonarr)
                            const eventType = record.eventType;
                            const isImport = eventType === 'movieFileImported' || eventType === 'episodeFileImported' || record.eventType === 3 || record.eventType === 7;
                            const isGrab = eventType === 'grabbed' || record.eventType === 1;
                            const isFailed = eventType === 'downloadFailed' || record.eventType === 4;

                            // Update numerical stats
                            if (statsSummary[dateStr][id]) {
                                if (isGrab) statsSummary[dateStr][id].grabbed++;
                                if (isImport) {
                                    statsSummary[dateStr][id].imported++;
                                    // Try to get size
                                    const size = record.movieFile?.size || record.episodeFile?.size || 0;
                                    statsSummary[dateStr][id].sizeBytes += size;
                                }
                                if (isFailed) statsSummary[dateStr][id].failed++;
                            }

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

                            if (!dailyStats[dateStr][id].includes(title)) {
                                dailyStats[dateStr][id].push(title);
                            }

                            // Determine status for the record list
                            let status = 'Grabbed';
                            if (isImport) status = 'Finalized';
                            if (isFailed) status = 'Failed';

                            // Calculate size
                            const sizeBytes = record.movieFile?.size || record.episodeFile?.size || 0;

                            allRecentRecords.push({
                                title,
                                date: record.date,
                                instanceId: id,
                                status,
                                size: sizeBytes
                            });
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
                const summary = statsSummary[date][instanceId];
                dayObj[`${instanceId}_grabbed`] = summary.grabbed;
                dayObj[`${instanceId}_imported`] = summary.imported;
                dayObj[`${instanceId}_failed`] = summary.failed;
                dayObj[`${instanceId}_sizeGB`] = parseFloat((summary.sizeBytes / (1024 ** 3)).toFixed(2));

                // Legacy support/Titles
                dayObj[instanceId] = summary.grabbed; // default to grabbed for main chart
                dayObj[`${instanceId}_titles`] = dailyStats[date][instanceId] || [];
            });
            return dayObj;
        });

        allRecentRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // Filter out duplicate titles within short time to avoid history bloat if multiple events exist
        const seen = new Set();
        const recentDownloads = allRecentRecords.filter(r => {
            const key = `${r.title}-${r.status}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 20);

        return NextResponse.json({ data: chartData, instances: instanceMetadata, recentDownloads });
    } catch (error) {
        console.error('API /stats error:', error);
        return NextResponse.json({ error: 'Failed to generate statistics' }, { status: 500 });
    }
}

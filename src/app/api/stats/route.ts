import { NextResponse } from 'next/server';
import { getInstances, Instance } from '@/lib/db';
import { getGrabHistory as getRadarrHistory, RadarrHistoryRecord } from '@/lib/radarr';
import { getGrabHistory as getSonarrHistory, SonarrHistoryRecord } from '@/lib/sonarr';

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

// --- Interfaces ---
interface HistoryRecord {
    date: string;
    eventType: number | string;
    sourceTitle?: string;
    movie?: { title: string };
    series?: { title: string };
    episode?: { seasonNumber: number, episodeNumber: number };
    data?: {
        importedSize?: string;
        size?: string;
        message?: string;
        reason?: string;
    };
    movieFile?: { size: string | number };
    episodeFile?: { size: string | number };
    size?: string | number;
}

interface QueueItem {
    title?: string;
    size?: number;
    movie?: { title: string };
    series?: { title: string };
    episode?: { seasonNumber: number, episodeNumber: number };
}

interface ChartDay {
    date: string;
    [key: string]: string | number | string[] | any;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const timeframe = searchParams.get('timeframe') || 'month';

        const allInstances = getInstances();
        const instances = allInstances.filter(i => i.type === 'radarr' || i.type === 'sonarr');

        if (!instances || instances.length === 0) {
            return NextResponse.json({ data: [] });
        }

        // Calculate timeframe limit
        const now = new Date();
        let daysToFetch = 30;
        if (timeframe === 'day') daysToFetch = 1;
        else if (timeframe === 'week') daysToFetch = 7;
        else if (timeframe === 'month') daysToFetch = 30;
        else if (timeframe === 'year') daysToFetch = 365;
        else if (timeframe === 'all') daysToFetch = 5000; // Large enough for "all"

        const startDate = new Date(now.getTime() - (daysToFetch * 24 * 60 * 60 * 1000));

        // Prepare data map: YYYY-MM-DD -> instanceId -> { status -> titles[] }
        const dailyStats: Record<string, Record<string, Record<string, string[]>>> = {};

        // Initialize empty maps for the range
        for (let i = daysToFetch - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            const dateStr = d.toISOString().split('T')[0];
            dailyStats[dateStr] = {};
        }

        const instanceMetadata: Record<string, { name: string, color: string, type: string }> = {};
        const allRecentRecords: {
            title: string,
            date: string,
            instanceId: string,
            status: string,
            size?: number,
            failureReason?: string,
            indexer?: string
        }[] = [];

        // Aggregate totals for the left panel
        const instanceTotals: Record<string, { grabbed: number, imported: number, failed: number, sizeBytes: number, downloading: number }> = {};
        const indexerTotals: Record<string, { grabbed: number, imported: number, failed: number, sizeBytes: number }> = {};

        // Track stats by type: grabbed, imported, failed, size
        const statsSummary: Record<string, Record<string, { grabbed: number, imported: number, failed: number, sizeBytes: number, downloading: number }>> = {};
        // Initialize summary structure
        Object.keys(dailyStats).forEach(date => {
            statsSummary[date] = {};
        });

        // Fetch history and queue across all instances concurrently
        const fetchPromises = instances.map(async (instance: Instance) => {
            const id = instance.id.toString();
            instanceMetadata[id] = {
                name: instance.name,
                color: tailwindToHex(instance.color || ''),
                type: instance.type
            };

            // Initialize total for this instance
            instanceTotals[id] = { grabbed: 0, imported: 0, failed: 0, sizeBytes: 0, downloading: 0 };

            // Initialize summary for this instance
            Object.keys(statsSummary).forEach(date => {
                statsSummary[date][id] = { grabbed: 0, imported: 0, failed: 0, sizeBytes: 0, downloading: 0 };
                if (!dailyStats[date][id]) {
                    dailyStats[date][id] = { grabbed: [], imported: [], failed: [], downloading: [] };
                }
            });

            try {
                let records: (RadarrHistoryRecord | SonarrHistoryRecord)[] = [];
                let queue: QueueItem[] = [];
                if (instance.type === 'radarr') {
                    const [historyRes, queueRes] = await Promise.all([
                        getRadarrHistory(instance.url, instance.api_key, 1000),
                        fetch(`${instance.url}/api/v3/queue?apikey=${instance.api_key}`).then(r => r.json())
                    ]);
                    records = historyRes;
                    queue = queueRes.records || [];
                } else if (instance.type === 'sonarr') {
                    const [historyRes, queueRes] = await Promise.all([
                        getSonarrHistory(instance.url, instance.api_key, 1000),
                        fetch(`${instance.url}/api/v3/queue?apikey=${instance.api_key}`).then(r => r.json())
                    ]);
                    records = historyRes;
                    queue = queueRes.records || [];
                }

                // Add queue items as "Downloading"
                queue.forEach(item => {
                    const dateStr = new Date().toISOString().split('T')[0];
                    if (statsSummary[dateStr]?.[id]) {
                        statsSummary[dateStr][id].downloading++;
                    }

                    let title = item.title || 'Unknown Release';
                    if (item.movie && item.movie.title) {
                        title = item.movie.title;
                    } else if (item.series && item.series.title) {
                        let epInfo = '';
                        if (item.episode && item.episode.seasonNumber !== undefined && item.episode.episodeNumber !== undefined) {
                            epInfo = ` S${item.episode.seasonNumber.toString().padStart(2, '0')}E${item.episode.episodeNumber.toString().padStart(2, '0')}`;
                        }
                        title = `${item.series.title}${epInfo}`;
                    } else {
                        title = title
                            .replace(/\b(1080p|720p|2160p|4k|uhd|bluray|web-dl|webrip|h\.264|h\.265|x264|x265|hevc|ddp5\.1|dts|aac|repack|proper)\b/gi, '')
                            .replace(/[\.\-]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                    }

                    allRecentRecords.push({
                        title,
                        date: new Date().toISOString(), // Use current date for queue items
                        instanceId: id,
                        status: 'Downloading',
                        size: item.size || 0,
                        indexer: (item as any).indexer || 'Unknown'
                    });

                    // Add to chart stats for "today"
                    const todayStr = new Date().toISOString().split('T')[0];
                    if (statsSummary[todayStr] && statsSummary[todayStr][id]) {
                        statsSummary[todayStr][id].downloading++;
                        if (!dailyStats[todayStr][id].downloading.includes(title)) {
                            dailyStats[todayStr][id].downloading.push(title);
                        }
                    }
                });

                // First pass: Build a map of sourceTitle -> indexer for this instance
                const sourceToIndexer: Record<string, string> = {};
                records.forEach(r => {
                    const typeStr = String(r.eventType).toLowerCase();
                    const isGrab = r.eventType === 1 || typeStr.includes('grabbed');
                    if (isGrab && r.sourceTitle) {
                        sourceToIndexer[r.sourceTitle] = (r.data as any)?.indexer || 'Unknown';
                    }
                });

                records.forEach(record => {
                    const recordDate = new Date(record.date);
                    if (recordDate >= startDate && recordDate <= now) {
                        const dateStr = recordDate.toISOString().split('T')[0];

                        // Event Types: 1=Grabbed, 3=Imported, 4=Failed
                        const typeStr = String(record.eventType).toLowerCase();
                        const isImport = record.eventType === 3 || typeStr.includes('import');
                        const isGrab = record.eventType === 1 || typeStr.includes('grabbed');
                        const isFailed = record.eventType === 4 || typeStr.includes('failed');

                        // Indexer name resolution
                        let indexerName = (record.data as any)?.indexerName || (record.data as any)?.indexer;
                        if (!indexerName && record.sourceTitle) {
                            indexerName = sourceToIndexer[record.sourceTitle];
                        }
                        if (!indexerName) indexerName = 'Unknown';

                        if (!indexerTotals[indexerName]) {
                            indexerTotals[indexerName] = { grabbed: 0, imported: 0, failed: 0, sizeBytes: 0 };
                        }

                        // Extract size
                        let size = 0;
                        if (record.data?.importedSize) size = parseInt(String(record.data.importedSize), 10);
                        else if (record.data?.size) size = parseInt(String(record.data.size), 10);
                        else if (record.movieFile?.size) size = parseInt(String(record.movieFile.size), 10);
                        else if (record.episodeFile?.size) size = parseInt(String(record.episodeFile.size), 10);
                        else if (record.size) size = parseInt(String(record.size), 10);
                        if (isNaN(size) || !size) size = 0;

                        // Update numerical stats
                        if (statsSummary[dateStr] && statsSummary[dateStr][id]) {
                            if (isGrab) statsSummary[dateStr][id].grabbed++;
                            if (isImport) {
                                statsSummary[dateStr][id].imported++;
                                statsSummary[dateStr][id].sizeBytes += size;
                            }
                            if (isFailed) statsSummary[dateStr][id].failed++;
                        }

                        // Update instance totals
                        if (isGrab) instanceTotals[id].grabbed++;
                        if (isImport) {
                            instanceTotals[id].imported++;
                            instanceTotals[id].sizeBytes += size;
                        }
                        if (isFailed) instanceTotals[id].failed++;

                        // Update indexer totals
                        if (isGrab) indexerTotals[indexerName].grabbed++;
                        if (isImport) {
                            indexerTotals[indexerName].imported++;
                            indexerTotals[indexerName].sizeBytes += size;
                        }
                        if (isFailed) indexerTotals[indexerName].failed++;

                        if (dailyStats[dateStr] && dailyStats[dateStr][id]) {
                            let title = record.sourceTitle || 'Unknown Release';

                            if (record.movie && record.movie.title) {
                                title = record.movie.title;
                            } else if (record.series && record.series.title) {
                                let epInfo = '';
                                if (record.episode && record.episode.seasonNumber !== undefined && record.episode.episodeNumber !== undefined) {
                                    epInfo = ` S${record.episode.seasonNumber.toString().padStart(2, '0')}E${record.episode.episodeNumber.toString().padStart(2, '0')}`;
                                }
                                title = `${record.series.title}${epInfo}`;
                            } else {
                                title = title
                                    .replace(/\b(1080p|720p|2160p|4k|uhd|bluray|web-dl|webrip|h\.264|h\.265|x264|x265|hevc|ddp5\.1|dts|aac|repack|proper)\b/gi, '')
                                    .replace(/[\.\-]/g, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim();
                            }

                            if (isGrab && !dailyStats[dateStr][id].grabbed.includes(title)) {
                                dailyStats[dateStr][id].grabbed.push(title);
                            }
                            if (isImport && !dailyStats[dateStr][id].imported.includes(title)) {
                                dailyStats[dateStr][id].imported.push(title);
                            }
                            if (isFailed && !dailyStats[dateStr][id].failed.includes(title)) {
                                dailyStats[dateStr][id].failed.push(title);
                            }

                            // Determine status for the record list
                            let status = 'Grabbed';
                            if (isImport) status = 'Finalized';
                            if (isFailed) status = 'Failed';

                            allRecentRecords.push({
                                title,
                                date: record.date,
                                instanceId: id,
                                status,
                                size,
                                failureReason: isFailed ? (record.data?.message || record.data?.reason || 'Unknown failure reason') : '',
                                indexer: indexerName
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
            const dayObj: ChartDay = { date };
            Object.keys(instanceMetadata).forEach(instanceId => {
                const summary = statsSummary[date][instanceId];
                dayObj[`${instanceId}_grabbed`] = summary.grabbed;
                dayObj[`${instanceId}_imported`] = summary.imported;
                dayObj[`${instanceId}_failed`] = summary.failed;
                dayObj[`${instanceId}_downloading`] = summary.downloading;
                dayObj[`${instanceId}_sizeGB`] = parseFloat((summary.sizeBytes / (1024 ** 3)).toFixed(2));

                const titles = dailyStats[date][instanceId];
                dayObj[`${instanceId}_grabbed_titles`] = titles?.grabbed || [];
                dayObj[`${instanceId}_imported_titles`] = titles?.imported || [];
                dayObj[`${instanceId}_failed_titles`] = titles?.failed || [];
                dayObj[`${instanceId}_downloading_titles`] = titles?.downloading || [];
                dayObj[`${instanceId}_sizeGB_titles`] = titles?.imported || []; // Use imported titles for size

                dayObj[instanceId] = summary.grabbed;
                dayObj[`${instanceId}_titles`] = Array.from(new Set([
                    ...(titles?.grabbed || []),
                    ...(titles?.imported || []),
                    ...(titles?.failed || []),
                    ...(titles?.downloading || [])
                ]));
            });
            return dayObj;
        });

        allRecentRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const seen = new Set();
        const recentDownloads = allRecentRecords.filter(r => {
            const key = `${r.title}-${r.status}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 20);

        return NextResponse.json({
            data: chartData,
            instances: instanceMetadata,
            recentDownloads,
            summary: {
                instanceTotals,
                indexerTotals
            }
        });
    } catch (error) {
        console.error('API /stats error:', error);
        return NextResponse.json({ error: 'Failed to generate statistics' }, { status: 500 });
    }
}

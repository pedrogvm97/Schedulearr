import { NextResponse } from 'next/server';
import { getAllActiveEpgSyncs } from '@/lib/iptvEpgSync';
import {
    getAudiobookStudioConfig,
    saveAudiobookStudioConfig,
    getAudiobookStudioStatus,
    getQueueBreakdownAndHistory,
    getStudioQueueHistory,
    triggerAudiobookQueueWorker,
    purgeAllFakeSvgArtFromDbAndDisk
} from '@/lib/audiobookStudio';
import {
    getDvrRecordings,
    getDvrRules,
    getAllAudiobooksMeta,
    getRecentAudiobookActivity,
    getSetting,
    getSystemLogs
} from '@/lib/db';
import { getActiveStreamHubsSummary } from '@/lib/iptvStreamHub';
import { cancelRecordingProcess } from '@/lib/iptvDvrScheduler';
import musicDownloadQueue from '@/lib/musicDownloadQueue';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Live TV Stream Hubs (Shared Single-Connection FFmpeg Hubs)
        const activeStreamHubs = getActiveStreamHubsSummary();

        // 2. Live TV EPG Syncs
        const activeEpgSyncs = getAllActiveEpgSyncs();

        // 3. Live TV DVR Recordings & Rules
        const allDvrRecordings = getDvrRecordings();
        const activeDvrRecordings = allDvrRecordings.filter(r => r.status === 'recording');
        const scheduledDvrRecordings = allDvrRecordings.filter(r => r.status === 'scheduled');
        const recentDvrRecordings = allDvrRecordings
            .filter(r => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled')
            .slice(0, 15);
        const dvrRules = getDvrRules();

        // 4. Audiobook Studio Background Worker & Queues
        const studioConfig = getAudiobookStudioConfig();
        const studioStatus = getAudiobookStudioStatus();
        const queueBreakdown = getQueueBreakdownAndHistory();
        const studioHistory = getStudioQueueHistory().slice(0, 25);
        const allBooks = getAllAudiobooksMeta();
        const queuedBooks = allBooks.filter(b => b.queue_enabled);
        const recentAudiobookChapters = getRecentAudiobookActivity(15);

        // 5. Music & Audio Transfers / Downloads
        const transferJobs = musicDownloadQueue.getJobs();
        const activeTransfers = transferJobs.filter((t: any) => t.status === 'downloading' || t.status === 'queued');
        const recentTransfers = transferJobs.filter((t: any) => t.status === 'completed' || t.status === 'failed').slice(0, 15);

        // 6. Housekeeping & Automated Maintenance
        const housekeepingEnabled = getSetting('cleanup_enabled') === 'true';
        const housekeepingSchedule = getSetting('cleanup_schedule') || 'daily';
        const recentSystemLogs = getSystemLogs(20);

        // 7. Upcoming / Planned AI & Server Pipelines
        const upcomingPipelines = [
            {
                id: 'photos-face-recognition',
                name: 'Photos AI Face Recognition & Clustering',
                category: 'Photos Library',
                status: 'planned',
                description: 'Local multi-face detection, person clustering, and family timeline indexing across your Photos libraries.',
                persistenceNote: 'Runs in background daemon — safe to close browser.'
            },
            {
                id: 'smart-audiobook-voice-pack',
                name: 'Multi-Voice Audiobook Batch Renderer',
                category: 'Audiobook Studio',
                status: 'ready',
                description: 'Pre-renders Deep Narrator, Warm Storyteller, Crisp & Clear, Soft & Velvet, and Late Night Radio M4A files on the server.',
                persistenceNote: 'Triggered from the player Voice Picker ("Generate" button) or Audiobook Studio.'
            },
            {
                id: 'iptv-epg-auto-refresh',
                name: 'Automated Live TV Guide (XMLTV) Sync & Rule Matcher',
                category: 'Live TV & DVR',
                status: 'scheduled',
                description: 'Periodically refreshes XMLTV program schedules and matches your automated DVR recording rules.',
                persistenceNote: 'Runs automatically on the server schedule.'
            }
        ];

        const activeCount =
            activeStreamHubs.length +
            activeEpgSyncs.length +
            activeDvrRecordings.length +
            (studioStatus.isRunning ? 1 : 0) +
            activeTransfers.length;

        const queuedCount =
            scheduledDvrRecordings.length +
            queuedBooks.length;

        return NextResponse.json({
            ok: true,
            activeCount,
            queuedCount,
            daemonPersistenceGuarantee:
                'All background tasks (Audiobook Studio transcriptions, story illustrations, voice rendering, Live TV DVR recordings, EPG syncs, and downloads) run inside the Node.js server daemon. Closing any modal, switching tabs, or closing your browser completely does NOT stop or interrupt them.',
            liveStreams: activeStreamHubs,
            epgSyncs: activeEpgSyncs,
            dvr: {
                active: activeDvrRecordings,
                scheduled: scheduledDvrRecordings,
                recent: recentDvrRecordings,
                rulesCount: dvrRules.length
            },
            audiobookStudio: {
                config: {
                    enabled: studioConfig.enabled,
                    scheduleMode: studioConfig.scheduleMode,
                    sttEngine: studioConfig.sttEngine,
                    artProvider: studioConfig.artProvider,
                    detectedProvider: studioConfig.detectedProvider,
                    imagesPerChapter: studioConfig.imagesPerChapter,
                    dailyImageQuota: studioConfig.dailyImageQuota,
                    imagesGeneratedToday: studioConfig.imagesGeneratedToday,
                    apiMetrics: studioConfig.apiMetrics
                },
                status: studioStatus,
                queuedBooksCount: queuedBooks.length,
                totalBooksCount: allBooks.length,
                queuedBooks: queuedBooks.slice(0, 20),
                queueBreakdown,
                history: studioHistory,
                recentChapters: recentAudiobookChapters
            },
            transfers: {
                active: activeTransfers,
                recent: recentTransfers
            },
            housekeeping: {
                enabled: housekeepingEnabled,
                schedule: housekeepingSchedule
            },
            upcomingPipelines,
            recentSystemLogs,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'trigger_audiobook_worker') {
            triggerAudiobookQueueWorker();
            return NextResponse.json({
                ok: true,
                message: 'Audiobook Studio background worker triggered on server.'
            });
        }

        if (action === 'toggle_audiobook_worker') {
            const current = getAudiobookStudioConfig();
            const nextEnabled = typeof body.enabled === 'boolean' ? body.enabled : !current.enabled;
            const saved = saveAudiobookStudioConfig({ ...current, enabled: nextEnabled });
            if (nextEnabled) {
                triggerAudiobookQueueWorker();
            }
            return NextResponse.json({
                ok: true,
                enabled: saved.enabled,
                message: saved.enabled ? 'Audiobook Studio worker enabled.' : 'Audiobook Studio worker paused.'
            });
        }

        if (action === 'purge_fake_svg') {
            const res = purgeAllFakeSvgArtFromDbAndDisk(true);
            return NextResponse.json({
                ok: true,
                ...res,
                message: `Purged ${res.deletedFiles} fake SVG files and cleaned ${res.cleanedChapters} chapter(s) + ${res.cleanedBooks} book cover(s).`
            });
        }

        if (action === 'stop_dvr_recording' && body.recordingId) {
            cancelRecordingProcess(String(body.recordingId));
            return NextResponse.json({
                ok: true,
                message: 'Stopped active DVR recording.'
            });
        }

        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

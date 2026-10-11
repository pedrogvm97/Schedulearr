import { NextResponse } from 'next/server';
import {
    getAllActiveEpgSyncs,
    checkAndRunScheduledEpgSyncs,
    getEpgSyncStatus,
    deriveXtreamEpgUrl,
    executeEpgSync
} from '@/lib/iptvEpgSync';
import {
    getAudiobookStudioConfig,
    saveAudiobookStudioConfig,
    getAudiobookStudioStatus,
    getQueueBreakdownAndHistory,
    getStudioQueueHistory,
    triggerAudiobookQueueWorker,
    resetAndRedoAudiobookAssets,
    purgeAllFakeSvgArtFromDbAndDisk
} from '@/lib/audiobookStudio';
import {
    getDvrRecordings,
    getDvrRules,
    getAllAudiobooksMeta,
    getAudiobookMeta,
    getAudiobookChaptersMeta,
    upsertAudiobookMeta,
    upsertAudiobookChapterMeta,
    resetAudiobookAssetsInDb,
    recalculateAudiobookTotals,
    getRecentAudiobookActivity,
    getSetting,
    setSetting,
    getSchedulerConfig,
    setSchedulerConfig,
    getSystemLogs,
    getTheaterLibraries,
    updateTheaterLibrary,
    getIptvEpgCountForLibrary
} from '@/lib/db';
import { getActiveStreamHubsSummary } from '@/lib/iptvStreamHub';
import { cancelRecordingProcess } from '@/lib/iptvDvrScheduler';
import { getNextSchedulerRun, runBatchSearch } from '@/lib/scheduler';
import { runAutoCleanup, runSmartCleanup } from '@/lib/autoCleanup';
import musicDownloadQueue from '@/lib/musicDownloadQueue';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Live TV Stream Hubs
        const activeStreamHubs = getActiveStreamHubsSummary();

        // 2. Live TV EPG Syncs & Per-Library EPG Sync Schedules
        const activeEpgSyncs = getAllActiveEpgSyncs();
        const theaterLibs = getTheaterLibraries();
        const liveLibs = theaterLibs.filter(l => l.type === 'live');
        const epgSchedules = liveLibs.map(lib => {
            const streamUrl = lib.folders?.[0] || '';
            const epgUrl = (lib.folders?.[1] || deriveXtreamEpgUrl(streamUrl)).trim();
            const intervalHoursRaw = parseInt(lib.folders?.[2] || '24', 10);
            const intervalHours = isNaN(intervalHoursRaw) ? 24 : intervalHoursRaw;
            const lastSync = lib.folders?.[3] || null;
            const scope = lib.folders?.[4] || 'all';
            const lastSyncMs = lastSync ? new Date(lastSync).getTime() : 0;
            const nextSyncTimestamp = (intervalHours > 0 && lastSyncMs > 0)
                ? new Date(lastSyncMs + intervalHours * 3600 * 1000).toISOString()
                : (intervalHours > 0 && epgUrl ? new Date(Date.now() + 60 * 1000).toISOString() : null);
            const liveSyncState = getEpgSyncStatus(lib.id);
            const dbProgCount = getIptvEpgCountForLibrary(lib.id);
            return {
                libraryId: lib.id,
                libraryName: lib.name,
                hasEpgUrl: Boolean(epgUrl),
                intervalHours,
                lastSync,
                nextSyncTimestamp,
                scope,
                programCount: dbProgCount || liveSyncState.programCount || 0,
                status: liveSyncState.status,
                progressPercent: liveSyncState.progressPercent,
                message: liveSyncState.message
            };
        });

        // 3. Live TV DVR Recordings & Rules
        const allDvrRecordings = getDvrRecordings();
        const activeDvrRecordings = allDvrRecordings.filter(r => r.status === 'recording');
        const scheduledDvrRecordings = allDvrRecordings.filter(r => r.status === 'scheduled');
        const recentDvrRecordings = allDvrRecordings
            .filter(r => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled')
            .slice(0, 15);
        const dvrRules = getDvrRules();

        // 4. Audiobook Studio Background Worker & Real Telemetry
        const studioConfig = getAudiobookStudioConfig();
        const studioStatus = getAudiobookStudioStatus();
        const queueBreakdown = getQueueBreakdownAndHistory();
        const studioHistory = getStudioQueueHistory().slice(0, 20);
        const allBooks = getAllAudiobooksMeta();
        const queuedBooksRaw = allBooks.filter(b => b.queue_enabled);
        const availableBooks = allBooks
            .filter(b => !b.queue_enabled)
            .slice(0, 100)
            .map(b => ({
                book_key: b.book_key,
                title: b.title,
                author: b.author,
                total_chapters: b.total_chapters
            }));

        // Compute exact chapter-level totals across queued books (and fallback to all books if none queued)
        let sttDone = 0;
        let sttTotal = 0;
        let sttPending = 0;
        let sttFailed = 0;

        let llmScenesDoneChapters = 0;
        let llmScenesTotalChapters = 0;
        let llmDetectedScenesCount = 0;
        let llmScenesPendingChapters = 0;

        let artDoneChapters = 0;
        let artTotalChapters = 0;
        let artKeptScenes = 0;
        let artPendingChapters = 0;
        let artFailedChapters = 0;

        let voiceDone = 0;
        let voiceTotal = 0;
        let voicePending = 0;
        let voiceFailed = 0;

        let lastErrorMsg = '';

        const queuedBooks = queuedBooksRaw.map(book => {
            const chapters = getAudiobookChaptersMeta(book.book_key);
            const chCount = Math.max(book.total_chapters || 0, chapters.length);
            let bookFailedCount = 0;
            let bookLastError = '';
            let bookDetectedScenes = 0;
            let bookPaintedScenes = 0;

            for (const ch of chapters) {
                const hasTranscript = ch.transcription_status === 'completed' && Boolean(ch.synced_lyrics && ch.synced_lyrics.trim().length > 20);
                if (book.transcribe_enabled) {
                    if (hasTranscript) sttDone++;
                    else if (ch.transcription_status === 'failed') {
                        sttFailed++;
                        bookFailedCount++;
                        if (ch.error_message && !bookLastError) bookLastError = ch.error_message;
                    } else sttPending++;
                }
                const validScenes = (ch.images || []).filter(i => i.kept !== false && !String(i.url || '').toLowerCase().includes('.svg'));
                const paintedImgs = validScenes.filter(i => Boolean(i.url));
                llmDetectedScenesCount += validScenes.length;
                bookDetectedScenes += validScenes.length;
                artKeptScenes += paintedImgs.length;
                bookPaintedScenes += paintedImgs.length;

                if (book.illustrate_enabled) {
                    if (validScenes.length > 0) llmScenesDoneChapters++;
                    else llmScenesPendingChapters++;

                    if (ch.illustration_status === 'completed' && paintedImgs.length > 0 && paintedImgs.length >= validScenes.length) artDoneChapters++;
                    else if (ch.illustration_status === 'failed') {
                        artFailedChapters++;
                        bookFailedCount++;
                        if (ch.error_message && !bookLastError) bookLastError = ch.error_message;
                    } else artPendingChapters++;
                }
                if (book.enhance_audio_enabled) {
                    if (ch.audio_enhance_status === 'completed') voiceDone++;
                    else if (ch.audio_enhance_status === 'failed') {
                        voiceFailed++;
                        bookFailedCount++;
                        if (ch.error_message && !bookLastError) bookLastError = ch.error_message;
                    } else voicePending++;
                }
            }

            if (book.transcribe_enabled) sttTotal += chCount;
            if (book.illustrate_enabled) {
                llmScenesTotalChapters += chCount;
                artTotalChapters += chCount;
            }
            if (book.enhance_audio_enabled) voiceTotal += chCount;
            if (bookLastError && !lastErrorMsg) lastErrorMsg = bookLastError;

            return {
                ...book,
                synced_chapters_count: chapters.length,
                detected_scenes_count: bookDetectedScenes,
                painted_scenes_count: bookPaintedScenes,
                failed_chapters_count: bookFailedCount,
                last_error: bookLastError
            };
        });

        // Compute explicit live idleReason so UI never shows a vague "Idle / Ready" when blocked
        let idleReason = studioStatus.lastLog || 'Idle';
        const quotaReached = studioConfig.imagesGeneratedToday >= studioConfig.dailyImageQuota;
        if (!studioStatus.isRunning) {
            if (!studioConfig.enabled) {
                idleReason = 'Paused by user';
            } else if (queuedBooks.length === 0) {
                idleReason = 'No books in queue';
            } else if (quotaReached && artPendingChapters > 0 && sttPending === 0 && llmScenesPendingChapters === 0 && voicePending === 0) {
                idleReason = `Quota Paused: ${studioConfig.imagesGeneratedToday} / ${studioConfig.dailyImageQuota} daily images used (${artPendingChapters} chapters waiting)`;
            } else if ((sttFailed + artFailedChapters + voiceFailed) > 0 && sttPending === 0 && (!quotaReached || artPendingChapters === 0) && voicePending === 0) {
                idleReason = `Failed: ${sttFailed + artFailedChapters + voiceFailed} chapter task(s) errored${lastErrorMsg ? ` — ${lastErrorMsg.slice(0, 80)}` : ''}`;
            } else if (queuedBooks.every(b => b.synced_chapters_count === 0)) {
                idleReason = 'Waiting: Queued books have 0 synced chapters (open book in Media tab first)';
            } else if (studioConfig.scheduleMode === 'manual_only') {
                idleReason = 'Schedule set to Manual Only — Click Run to start';
            } else if (studioConfig.scheduleMode === 'overnight') {
                const hour = new Date().getHours();
                if (hour < 1 || hour >= 7) {
                    idleReason = 'Scheduled for Overnight (01:00–07:00) — Click Run to start now';
                }
            }
        }

        // 5. Arr Batch Scheduler & Cleanup Guard Telemetry
        const arrCfg = getSchedulerConfig();
        const nextArrRun = getNextSchedulerRun();
        const diskAutocleanEnabled = getSetting('disk_autoclean_enabled') === 'true';
        const diskThresholdPercent = parseInt(getSetting('disk_autoclean_threshold') || getSetting('disk_pause_threshold') || '85') || 85;
        const qbitCleanupIntervalMin = parseInt(getSetting('qbit_cleanup_interval_min') || '15') || 15;

        // 6. Music & Audio Transfers
        const transferJobs = musicDownloadQueue.getJobs();
        const activeTransfers = transferJobs.filter((t: any) => t.status === 'downloading' || t.status === 'queued');
        const recentTransfers = transferJobs.filter((t: any) => t.status === 'completed' || t.status === 'failed').slice(0, 10);

        const recentAudiobookChapters = getRecentAudiobookActivity(12);
        const recentSystemLogs = getSystemLogs(15);

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
            liveStreams: activeStreamHubs,
            epgSyncs: activeEpgSyncs,
            epgSchedules,
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
                    rateLimitRpm: studioConfig.maxRequestsPerMinute || 10,
                    apiKeysCount: (studioConfig.apiKeys || []).length,
                    apiKeys: (studioConfig.apiKeys || []).map(k => ({
                        id: k.id,
                        label: k.label,
                        provider: k.provider,
                        status: k.valid ? 'valid' : 'invalid',
                        rpmLimit: k.rateLimitInfo
                    })),
                    apiMetrics: studioConfig.apiMetrics
                },
                status: {
                    ...studioStatus,
                    idleReason
                },
                totals: {
                    transcriptions: {
                        done: sttDone,
                        total: sttTotal,
                        pending: sttPending,
                        failed: sttFailed
                    },
                    llmScenes: {
                        doneChapters: llmScenesDoneChapters,
                        totalChapters: llmScenesTotalChapters,
                        detectedScenes: llmDetectedScenesCount,
                        pendingChapters: llmScenesPendingChapters
                    },
                    art: {
                        doneChapters: artDoneChapters,
                        totalChapters: artTotalChapters,
                        keptScenes: artKeptScenes,
                        pendingChapters: artPendingChapters,
                        failedChapters: artFailedChapters
                    },
                    voices: {
                        done: voiceDone,
                        total: voiceTotal,
                        pending: voicePending,
                        failed: voiceFailed
                    }
                },
                queuedBooksCount: queuedBooks.length,
                totalBooksCount: allBooks.length,
                queuedBooks,
                availableBooks,
                queueBreakdown,
                history: studioHistory,
                recentChapters: recentAudiobookChapters
            },
            arrScheduler: {
                enabled: arrCfg.enabled,
                interval: arrCfg.interval,
                batchSize: arrCfg.batchSize,
                nextRunTimestamp: nextArrRun,
                diskAutocleanEnabled,
                diskThresholdPercent,
                qbitCleanupIntervalMin
            },
            transfers: {
                active: activeTransfers,
                recent: recentTransfers
            },
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
            const current = getAudiobookStudioConfig();
            if (!current.enabled) {
                saveAudiobookStudioConfig({ ...current, enabled: true });
            }
            triggerAudiobookQueueWorker(body.bookKey || undefined, body.chapterKey || undefined, true);
            return NextResponse.json({
                ok: true,
                message: 'Started Audiobook worker (bypassing quota & retrying failed chapters).'
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
                message: saved.enabled ? 'Worker enabled.' : 'Worker paused.'
            });
        }

        if (action === 'update_studio_limits') {
            const current = getAudiobookStudioConfig();
            const next = { ...current };
            if (typeof body.dailyImageQuota === 'number') {
                next.dailyImageQuota = Math.max(1, body.dailyImageQuota);
            }
            if (typeof body.imagesPerChapter === 'number') {
                next.imagesPerChapter = Math.max(1, Math.min(12, body.imagesPerChapter));
            }
            if (typeof body.rateLimitRpm === 'number') {
                next.maxRequestsPerMinute = Math.max(1, Math.min(120, body.rateLimitRpm));
            }
            if (typeof body.scheduleMode === 'string') {
                next.scheduleMode = body.scheduleMode as any;
            }
            if (body.resetDailyUsage === true) {
                next.imagesGeneratedToday = 0;
            }
            const saved = saveAudiobookStudioConfig(next);
            if (saved.enabled && (body.resetDailyUsage || typeof body.dailyImageQuota === 'number')) {
                triggerAudiobookQueueWorker();
            }
            return NextResponse.json({
                ok: true,
                config: saved,
                message: body.resetDailyUsage ? 'Daily art counter reset to 0.' : 'Updated Studio limits.'
            });
        }

        if (action === 'book_queue_action' && body.bookKey) {
            const bookKey = String(body.bookKey);
            const subAction = String(body.subAction || '');
            const existing = getAudiobookMeta(bookKey);
            if (!existing) {
                return NextResponse.json({ ok: false, error: 'Book not found' }, { status: 404 });
            }

            if (subAction === 'start_now') {
                upsertAudiobookMeta({
                    ...existing,
                    queue_enabled: true,
                    status: 'queued'
                });
                triggerAudiobookQueueWorker(bookKey, undefined, true);
                return NextResponse.json({ ok: true, message: `Started "${existing.title}".` });
            }

            if (subAction === 'prioritize_top') {
                const all = getAllAudiobooksMeta().filter(b => b.queue_enabled);
                const minPriority = all.reduce((m, b) => Math.min(m, b.queue_priority || 100), 10);
                upsertAudiobookMeta({
                    ...existing,
                    queue_enabled: true,
                    queue_priority: Math.max(1, minPriority - 1)
                });
                triggerAudiobookQueueWorker(bookKey, undefined, true);
                return NextResponse.json({ ok: true, message: `Moved "${existing.title}" to top of queue.` });
            }

            if (subAction === 'add_queue') {
                upsertAudiobookMeta({
                    ...existing,
                    queue_enabled: true,
                    transcribe_enabled: true,
                    illustrate_enabled: true,
                    status: 'queued'
                });
                triggerAudiobookQueueWorker();
                return NextResponse.json({ ok: true, message: `Queued "${existing.title}".` });
            }

            if (subAction === 'remove_queue') {
                upsertAudiobookMeta({
                    ...existing,
                    queue_enabled: false,
                    status: 'idle'
                });
                return NextResponse.json({ ok: true, message: `Removed "${existing.title}" from queue.` });
            }

            if (subAction === 'toggle_flag') {
                const field = String(body.field || '');
                if (field === 'transcribe_enabled' || field === 'illustrate_enabled' || field === 'enhance_audio_enabled') {
                    upsertAudiobookMeta({
                        ...existing,
                        [field]: !existing[field]
                    });
                    recalculateAudiobookTotals(bookKey);
                    return NextResponse.json({ ok: true, message: `Updated ${existing.title}.` });
                }
            }

            if (subAction === 'retry_failed') {
                const chapters = getAudiobookChaptersMeta(bookKey);
                for (const ch of chapters) {
                    if (ch.transcription_status === 'failed' || ch.illustration_status === 'failed' || ch.audio_enhance_status === 'failed') {
                        upsertAudiobookChapterMeta({
                            chapter_key: ch.chapter_key,
                            book_key: bookKey,
                            transcription_status: ch.transcription_status === 'failed' ? 'queued' : ch.transcription_status,
                            illustration_status: ch.illustration_status === 'failed' ? 'queued' : ch.illustration_status,
                            audio_enhance_status: ch.audio_enhance_status === 'failed' ? 'queued' : ch.audio_enhance_status,
                            error_message: ''
                        });
                    }
                }
                recalculateAudiobookTotals(bookKey);
                triggerAudiobookQueueWorker(bookKey, undefined, true);
                return NextResponse.json({ ok: true, message: `Retrying failed chapters for "${existing.title}".` });
            }

            if (subAction === 'redo_art' || subAction === 'redo_transcriptions' || subAction === 'redo_all') {
                const target = subAction === 'redo_art' ? 'art' : subAction === 'redo_transcriptions' ? 'transcriptions' : 'all';
                await resetAndRedoAudiobookAssets({ bookKey, target, redoNow: true });
                return NextResponse.json({ ok: true, message: `Reset ${target} for "${existing.title}" and queued regeneration.` });
            }
        }

        if (action === 'update_arr_scheduler') {
            const current = getSchedulerConfig();
            const next = {
                enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
                interval: typeof body.interval === 'number' ? Math.max(1, body.interval) : current.interval,
                batchSize: typeof body.batchSize === 'number' ? Math.max(1, body.batchSize) : current.batchSize,
                batchBehavior: current.batchBehavior,
                maxAttempts: current.maxAttempts
            };
            setSchedulerConfig(next);
            if (body.runNow) {
                runBatchSearch(true).catch(() => {});
                return NextResponse.json({ ok: true, message: 'Arr batch search triggered.' });
            }
            return NextResponse.json({ ok: true, message: 'Arr scheduler updated.' });
        }

        if (action === 'update_cleanup_scheduler') {
            if (typeof body.diskAutocleanEnabled === 'boolean') {
                setSetting('disk_autoclean_enabled', body.diskAutocleanEnabled ? 'true' : 'false');
            }
            if (typeof body.diskThresholdPercent === 'number') {
                setSetting('disk_autoclean_threshold', String(body.diskThresholdPercent));
                setSetting('disk_pause_threshold', String(body.diskThresholdPercent));
            }
            if (typeof body.qbitCleanupIntervalMin === 'number') {
                setSetting('qbit_cleanup_interval_min', String(Math.max(1, body.qbitCleanupIntervalMin)));
            }
            if (body.runNow) {
                Promise.all([runAutoCleanup(), runSmartCleanup()]).catch(() => {});
                return NextResponse.json({ ok: true, message: 'Cleanup & Disk Guard triggered.' });
            }
            return NextResponse.json({ ok: true, message: 'Cleanup guard updated.' });
        }

        if (action === 'update_epg_schedule') {
            const libs = getTheaterLibraries().filter(l => l.type === 'live');
            const targets = body.libraryId ? libs.filter(l => l.id === body.libraryId) : libs;
            for (const lib of targets) {
                const streamUrl = lib.folders?.[0] || '';
                const epgUrl = lib.folders?.[1] || deriveXtreamEpgUrl(streamUrl);
                const nextInterval = body.intervalHours !== undefined ? String(body.intervalHours) : (lib.folders?.[2] || '24');
                const lastSync = lib.folders?.[3] || '';
                const nextScope = body.scope !== undefined ? String(body.scope) : (lib.folders?.[4] || 'all');
                updateTheaterLibrary(lib.id, [streamUrl, epgUrl, nextInterval, lastSync, nextScope]);
                if (body.runNow && epgUrl) {
                    executeEpgSync(lib.id, epgUrl, nextScope).catch(() => {});
                }
            }
            return NextResponse.json({
                ok: true,
                message: body.runNow ? 'EPG schedule saved and sync started.' : 'EPG sync schedule updated.'
            });
        }

        if (action === 'trigger_epg_sync') {
            const libs = getTheaterLibraries().filter(l => l.type === 'live');
            const targets = body.libraryId ? libs.filter(l => l.id === body.libraryId) : libs;
            let started = 0;
            for (const lib of targets) {
                const streamUrl = lib.folders?.[0] || '';
                const epgUrl = (lib.folders?.[1] || deriveXtreamEpgUrl(streamUrl)).trim();
                const scope = lib.folders?.[4] || 'all';
                if (epgUrl) {
                    started++;
                    executeEpgSync(lib.id, epgUrl, scope).catch(() => {});
                }
            }
            if (started === 0) {
                checkAndRunScheduledEpgSyncs().catch(() => {});
            }
            return NextResponse.json({
                ok: true,
                message: started > 0 ? `EPG sync started for ${started} provider(s).` : 'Checked scheduled EPG syncs.'
            });
        }

        if (action === 'purge_fake_svg') {
            const res = purgeAllFakeSvgArtFromDbAndDisk(true);
            return NextResponse.json({
                ok: true,
                ...res,
                message: `Purged ${res.deletedFiles} fake SVG files.`
            });
        }

        if (action === 'stop_dvr_recording' && body.recordingId) {
            cancelRecordingProcess(String(body.recordingId));
            return NextResponse.json({
                ok: true,
                message: 'Stopped DVR recording.'
            });
        }

        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

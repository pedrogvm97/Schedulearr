import { NextResponse } from 'next/server';
import { getAllActiveEpgSyncs } from '@/lib/iptvEpgSync';
import { getAudiobookStudioStatus } from '@/lib/audiobookStudio';
import { getDvrRecordings, getAllAudiobooksMeta } from '@/lib/db';
import { getActiveStreamHubsSummary } from '@/lib/iptvStreamHub';
import musicDownloadQueue from '@/lib/musicDownloadQueue';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const items: Array<{
            id: string;
            category: 'epg' | 'audiobook' | 'dvr' | 'download' | 'housekeeping' | 'stream';
            title: string;
            detail: string;
            progress?: number;
        }> = [];

        // 0. Active Shared IPTV Stream Hubs
        const streamHubs = getActiveStreamHubsSummary();
        for (const hub of streamHubs) {
            items.push({
                id: `hub-${hub.channelName}`,
                category: 'stream',
                title: `Live Stream: ${hub.channelName}`,
                detail: `${hub.subscribersCount} consumer(s) sharing 1 line`
            });
        }

        // 1. Active EPG Syncs
        const epgSyncs = getAllActiveEpgSyncs();
        for (const sync of epgSyncs) {
            items.push({
                id: `epg-${sync.libraryId}`,
                category: 'epg',
                title: `EPG Sync: ${sync.libraryName || 'Live TV'}`,
                detail: `${sync.message} (${sync.progressPercent}%)`,
                progress: sync.progressPercent
            });
        }

        // 2. Active Audiobook Studio Worker (Transcription / Scene Art / Audio Clarity)
        const abStatus = getAudiobookStudioStatus();
        if (abStatus.isRunning) {
            items.push({
                id: `ab-${abStatus.activeChapterKey || 'active'}`,
                category: 'audiobook',
                title: `Book Studio (${abStatus.activeTask || 'processing'}): ${abStatus.activeBookTitle || 'Audiobook'}`,
                detail: abStatus.lastLog || abStatus.activeChapterTitle || 'Processing...'
            });
        } else {
            const queuedBooks = getAllAudiobooksMeta().filter(b => b.queue_enabled);
            if (queuedBooks.length > 0) {
                const top = queuedBooks[0];
                const total = Math.max(1, top.total_chapters || 1);
                const done = Math.round((((top.transcribed_chapters || 0) + (top.illustrated_chapters || 0)) / (total * 2)) * 100);
                if (done < 100) {
                    items.push({
                        id: `ab-queue-${top.book_key}`,
                        category: 'audiobook',
                        title: `Book Queue (${queuedBooks.length}): ${top.title}`,
                        detail: `${done}% complete`,
                        progress: done
                    });
                }
            }
        }

        // 3. Active Live TV DVR Recordings
        const dvrRecs = getDvrRecordings().filter(r => r.status === 'recording');
        for (const rec of dvrRecs) {
            items.push({
                id: `dvr-${rec.id}`,
                category: 'dvr',
                title: `Recording Live TV: ${rec.channel_name}`,
                detail: rec.program_title || 'Live Capture'
            });
        }

        // 4. Active Music / Audio Transfers & Downloads
        const transfers = musicDownloadQueue.getJobs().filter((t: any) => t.status === 'downloading' || t.status === 'queued');
        for (const tr of transfers.slice(0, 3)) {
            items.push({
                id: `dl-${tr.id}`,
                category: 'download',
                title: `Downloading: ${tr.title}`,
                detail: `${tr.artist || ''} (${tr.progress || 0}%)`,
                progress: tr.progress || 50
            });
        }

        return NextResponse.json({
            ok: true,
            items,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, items: [], error: e.message }, { status: 500 });
    }
}

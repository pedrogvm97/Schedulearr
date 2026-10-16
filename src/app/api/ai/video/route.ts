import { NextResponse } from 'next/server';
import fs from 'fs';
import {
    getCpuTelemetry,
    getQueuePriorityRule,
    setQueuePriorityRule,
    getCpuThreadsAllocation,
    setCpuThreadsAllocation,
    getLibraryAutoProcessSettings,
    setLibraryAutoProcess,
    scanExistingSubtitles,
    getVideoAiQueueList,
    processVideoSubtitleLocallyOnCpu
} from '@/lib/videoAi';
import {
    getVideoAiSubtitles,
    deleteVideoAiSubtitle,
    getVideoAiHistory,
    clearVideoAiHistory
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const cpu = getCpuTelemetry();
        const subtitles = scanExistingSubtitles();
        const history = getVideoAiHistory(100);
        const { libraries } = getLibraryAutoProcessSettings();
        const priorityRule = getQueuePriorityRule();
        const cpuThreads = getCpuThreadsAllocation();
        const queue = getVideoAiQueueList();

        return NextResponse.json({
            ok: true,
            cpu,
            subtitles,
            history,
            libraries,
            priorityRule,
            cpuThreads,
            queue
        });
    } catch (err: any) {
        console.error('GET /api/ai/video error:', err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'toggle_library') {
            const { libraryId, enabled } = body;
            if (!libraryId) {
                return NextResponse.json({ ok: false, error: 'Missing libraryId' }, { status: 400 });
            }
            setLibraryAutoProcess(libraryId, Boolean(enabled));
            return NextResponse.json({ ok: true, message: `Library auto-processing updated` });
        }

        if (action === 'set_priority_rule') {
            const { rule } = body;
            if (!rule) {
                return NextResponse.json({ ok: false, error: 'Missing priority rule' }, { status: 400 });
            }
            setQueuePriorityRule(rule);
            return NextResponse.json({ ok: true, message: `Queue priority rule updated to ${rule}` });
        }

        if (action === 'set_cpu_threads') {
            const { threads } = body;
            const parsed = parseInt(String(threads), 10);
            if (isNaN(parsed) || parsed < 1) {
                return NextResponse.json({ ok: false, error: 'Invalid thread count' }, { status: 400 });
            }
            setCpuThreadsAllocation(parsed);
            return NextResponse.json({ ok: true, message: `CPU threads set to ${parsed}` });
        }

        if (action === 'transcribe_now') {
            const { videoPath, mediaTitle, targetLang, libraryId, libraryName, mediaType } = body;
            if (!videoPath) {
                return NextResponse.json({ ok: false, error: 'Missing videoPath' }, { status: 400 });
            }
            const result = await processVideoSubtitleLocallyOnCpu({
                videoPath,
                mediaTitle,
                targetLang,
                libraryId,
                libraryName,
                mediaType
            });
            return NextResponse.json({ ok: result.success, ...result });
        }

        if (action === 'delete_subtitle') {
            const { id, subPath } = body;
            if (!id) {
                return NextResponse.json({ ok: false, error: 'Missing subtitle id' }, { status: 400 });
            }
            deleteVideoAiSubtitle(id);
            if (subPath && fs.existsSync(subPath)) {
                try { fs.unlinkSync(subPath); } catch {}
            }
            return NextResponse.json({ ok: true, message: 'Subtitle removed' });
        }

        if (action === 'clear_history') {
            clearVideoAiHistory();
            return NextResponse.json({ ok: true, message: 'Processing history cleared' });
        }

        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
        console.error('POST /api/ai/video error:', err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}

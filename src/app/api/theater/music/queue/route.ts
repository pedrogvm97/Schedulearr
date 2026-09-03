import { NextRequest, NextResponse } from 'next/server';
import musicDownloadQueue from '@/lib/musicDownloadQueue';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const status = musicDownloadQueue.getStatus();
        return NextResponse.json(status);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const items = Array.isArray(body.items) ? body.items : [body];

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items provided' }, { status: 400 });
        }

        const added = musicDownloadQueue.addJobs(items);
        return NextResponse.json({
            success: true,
            count: added.length,
            jobs: added,
            message: `Added ${added.length} track${added.length > 1 ? 's' : ''} to background download queue.`
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const clear = searchParams.get('clear');

        if (clear === 'completed') {
            musicDownloadQueue.clearCompleted();
            return NextResponse.json({ success: true, message: 'Cleared finished jobs.' });
        }

        if (id) {
            const canceled = musicDownloadQueue.cancelJob(id);
            return NextResponse.json({ success: canceled, id });
        }

        return NextResponse.json({ error: 'Missing id or clear param' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

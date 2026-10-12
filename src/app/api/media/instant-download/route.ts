import { NextResponse } from 'next/server';
import {
    enqueueInstantStreamDownload,
    getInstantStreamDownloads,
    deleteInstantStreamDownload,
    reconcileInstantStreamUpgrades
} from '@/lib/instantStreamDownloader';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await reconcileInstantStreamUpgrades();
        const items = getInstantStreamDownloads();
        return NextResponse.json({ items });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to load instant downloads' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'reconcile') {
            const res = await reconcileInstantStreamUpgrades();
            return NextResponse.json({ success: true, ...res, items: getInstantStreamDownloads() });
        }

        if (action === 'delete' && body.id) {
            deleteInstantStreamDownload(body.id);
            return NextResponse.json({ success: true, items: getInstantStreamDownloads() });
        }

        const item = await enqueueInstantStreamDownload({
            mediaType: body.mediaType === 'series' ? 'series' : 'movie',
            title: body.title || 'Untitled',
            year: body.year ? Number(body.year) : null,
            tmdbId: body.tmdbId ? Number(body.tmdbId) : null,
            tvdbId: body.tvdbId ? Number(body.tvdbId) : null,
            imdbId: body.imdbId || null,
            seasonNumber: body.seasonNumber ? Number(body.seasonNumber) : null,
            episodeNumber: body.episodeNumber ? Number(body.episodeNumber) : null,
            instanceId: body.instanceId || '',
            arrMediaId: body.arrMediaId ? Number(body.arrMediaId) : null,
            rootFolderPath: body.rootFolderPath || '/Media'
        });

        return NextResponse.json({ success: true, item });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to enqueue instant stream download' }, { status: 500 });
    }
}

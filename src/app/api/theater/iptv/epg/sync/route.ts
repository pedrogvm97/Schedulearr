import { NextRequest, NextResponse } from 'next/server';
import {
    getEpgSyncStatus, executeEpgSync, updateEpgSyncStatus
} from '@/lib/iptvEpgSync';
import { getTheaterLibraries, updateTheaterLibrary } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const status = getEpgSyncStatus(libraryId);
        return NextResponse.json({ success: true, ...status });
    } catch (e: any) {
        console.error('API /theater/iptv/epg/sync GET error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { libraryId, epgUrl, background } = body;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libs = getTheaterLibraries();
        const currentLib = libs.find(l => l.id === libraryId);
        if (!currentLib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        const activeEpgUrl = epgUrl || currentLib.folders?.[1];
        if (!activeEpgUrl) {
            return NextResponse.json({ error: 'No XMLTV EPG URL configured for this provider.' }, { status: 400 });
        }

        // Start EPG sync in background or await if not background
        if (background) {
            // Fire and forget
            executeEpgSync(libraryId, activeEpgUrl).catch(err => {
                console.error(`Background EPG sync error for library ${libraryId}:`, err);
            });
            return NextResponse.json({
                success: true,
                message: 'EPG sync started in background',
                status: getEpgSyncStatus(libraryId)
            });
        }

        // Trigger sync asynchronously and return initial progress state so client can poll
        executeEpgSync(libraryId, activeEpgUrl).catch(err => {
            console.error(`EPG sync error for library ${libraryId}:`, err);
        });

        return NextResponse.json({
            success: true,
            status: getEpgSyncStatus(libraryId)
        });
    } catch (e: any) {
        console.error('API /theater/iptv/epg/sync POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { libraryId, intervalHours } = body;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libs = getTheaterLibraries();
        const currentLib = libs.find(l => l.id === libraryId);
        if (!currentLib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        const streamUrl = currentLib.folders?.[0] || '';
        const epgUrl = currentLib.folders?.[1] || '';
        const lastSync = currentLib.folders?.[3] || '';
        const newInterval = String(intervalHours ?? '24');

        updateTheaterLibrary(libraryId, [streamUrl, epgUrl, newInterval, lastSync]);

        return NextResponse.json({
            success: true,
            intervalHours: newInterval
        });
    } catch (e: any) {
        console.error('API /theater/iptv/epg/sync PATCH error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

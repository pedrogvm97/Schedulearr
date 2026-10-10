import { NextRequest, NextResponse } from 'next/server';
import {
    getEpgSyncStatus, executeEpgSync, deriveXtreamEpgUrl, getAllActiveEpgSyncs
} from '@/lib/iptvEpgSync';
import { getTheaterLibraries, updateTheaterLibrary } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');

        if (!libraryId) {
            return NextResponse.json({
                success: true,
                activeSyncs: getAllActiveEpgSyncs()
            });
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
        const { libraryId, epgUrl, intervalHours, scopeConfig } = body;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libs = getTheaterLibraries();
        const currentLib = libs.find(l => l.id === libraryId);
        if (!currentLib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        const streamUrl = currentLib.folders?.[0] || '';
        const activeEpgUrl = (epgUrl || currentLib.folders?.[1] || deriveXtreamEpgUrl(streamUrl)).trim();
        if (!activeEpgUrl) {
            return NextResponse.json({ error: 'No XMLTV EPG URL configured or derivable for this provider.' }, { status: 400 });
        }

        const effectiveInterval = String(intervalHours ?? currentLib.folders?.[2] ?? '24');
        const effectiveScope = String(scopeConfig ?? currentLib.folders?.[4] ?? 'all');
        const lastSync = currentLib.folders?.[3] || '';

        // Persist updated EPG URL, interval, and channel/shortlist scope before syncing
        updateTheaterLibrary(libraryId, [streamUrl, activeEpgUrl, effectiveInterval, lastSync, effectiveScope]);

        // Fire and forget in background so client can poll or close the window at any time
        executeEpgSync(libraryId, activeEpgUrl, effectiveScope).catch(err => {
            console.error(`Background EPG sync error for library ${libraryId}:`, err);
        });

        return NextResponse.json({
            success: true,
            message: `EPG sync started in background for "${currentLib.name}"`,
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
        const { libraryId, intervalHours, scopeConfig, epgUrl } = body;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libs = getTheaterLibraries();
        const currentLib = libs.find(l => l.id === libraryId);
        if (!currentLib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        const streamUrl = currentLib.folders?.[0] || '';
        const activeEpg = (epgUrl ?? currentLib.folders?.[1] ?? deriveXtreamEpgUrl(streamUrl)).trim();
        const lastSync = currentLib.folders?.[3] || '';
        const newInterval = String(intervalHours ?? currentLib.folders?.[2] ?? '24');
        const newScope = String(scopeConfig ?? currentLib.folders?.[4] ?? 'all');

        updateTheaterLibrary(libraryId, [streamUrl, activeEpg, newInterval, lastSync, newScope]);

        return NextResponse.json({
            success: true,
            intervalHours: newInterval,
            scopeConfig: newScope
        });
    } catch (e: any) {
        console.error('API /theater/iptv/epg/sync PATCH error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

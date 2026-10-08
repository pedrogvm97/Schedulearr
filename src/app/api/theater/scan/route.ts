import { NextResponse } from 'next/server';
import { getTheaterLibraries, clearCachedTheaterItems } from '@/lib/db';
import { executeEpgSync } from '@/lib/iptvEpgSync';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const libraryId = body.libraryId;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libraries = getTheaterLibraries();
        const lib = libraries.find(l => l.id === libraryId);

        if (!lib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        if (lib.type === 'live') {
            // Live TV EPG / channel sync
            const epgUrl = lib.folders?.[1] || '';
            if (epgUrl) {
                executeEpgSync(lib.id, epgUrl).catch(e => console.warn('Scan EPG sync warning:', e.message));
            }
            return NextResponse.json({
                success: true,
                message: `Live TV sync triggered for "${lib.name}"`,
                type: 'live'
            });
        }

        // Clear cache so items are freshly scanned
        clearCachedTheaterItems(libraryId);

        // Fetch refreshed items from items route
        const url = new URL(req.url);
        const origin = url.origin;
        const res = await fetch(`${origin}/api/theater/items?libraryId=${encodeURIComponent(libraryId)}&refresh=true`);
        if (res.ok) {
            const data = await res.json();
            return NextResponse.json({
                success: true,
                message: `Rescanned "${lib.name}"`,
                count: data.total || data.items?.length || 0,
                items: data.items || []
            });
        } else {
            return NextResponse.json({
                success: false,
                error: `Failed to refresh items for "${lib.name}"`
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/scan error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');
        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId required' }, { status: 400 });
        }
        return POST(new Request(req.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ libraryId, force: true })
        }));
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

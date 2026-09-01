import { NextRequest, NextResponse } from 'next/server';
import { getIptvEpg, getBatchIptvEpg } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');
        const tvgId = searchParams.get('tvgId');
        const tvgIdsParam = searchParams.get('tvgIds');

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        // 1. Batch lookup
        if (tvgIdsParam) {
            const ids = tvgIdsParam.split(',').map(s => s.trim()).filter(Boolean);
            const batch = getBatchIptvEpg(libraryId, ids);
            return NextResponse.json({ success: true, epg: batch });
        }

        // 2. Single channel lookup
        if (tvgId) {
            const programs = getIptvEpg(libraryId, tvgId);
            return NextResponse.json({ success: true, programs });
        }

        return NextResponse.json({ error: 'tvgId or tvgIds parameter required' }, { status: 400 });
    } catch (e: any) {
        console.error('API /theater/iptv/epg error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getTotalActiveDownloadsCount } from '@/lib/deviceSync';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const counts = await getTotalActiveDownloadsCount();
        return NextResponse.json(counts);
    } catch (error: any) {
        console.error('[API-DOWNLOADS-COUNT] Error getting downloads count:', error);
        return NextResponse.json(
            { totalActive: 0, torrentsCount: 0, mediaJobsCount: 0, deviceSyncCount: 0 },
            { status: 200 }
        );
    }
}

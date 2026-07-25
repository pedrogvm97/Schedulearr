import { NextResponse } from 'next/server';
import { getCachedSonarrSeries } from '@/lib/mediaCache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceFresh = searchParams.get('fresh') === 'true';

        const allMedia = await getCachedSonarrSeries(forceFresh);
        return NextResponse.json(allMedia);
    } catch (error) {
        console.error('API /sonarr/all error:', error);
        return NextResponse.json({ error: 'Failed to fetch all series' }, { status: 500 });
    }
}


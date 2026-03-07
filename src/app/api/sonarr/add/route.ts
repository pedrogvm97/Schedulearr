import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { addSeries } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const { instanceId, seriesData } = payload;

        if (!instanceId || !seriesData) {
            return NextResponse.json({ error: 'Missing instanceId or seriesData' }, { status: 400 });
        }

        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const result = await addSeries(instance.url, instance.api_key, seriesData);
        if (result.success) {
            return NextResponse.json(result.data, { status: 201 });
        } else {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
    } catch (error) {
        console.error('API /sonarr/add error:', error);
        return NextResponse.json({ error: 'Failed to add series' }, { status: 500 });
    }
}

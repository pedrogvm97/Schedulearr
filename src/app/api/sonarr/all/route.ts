import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { getAllSeries } from '@/lib/sonarr';

export async function GET() {
    try {
        const instances = getInstances('sonarr');
        let allMedia: any[] = [];

        for (const instance of instances) {
            const series = await getAllSeries(instance.url, instance.api_key);
            allMedia = [...allMedia, ...series.map(s => ({ ...s, instanceName: instance.name, instanceId: instance.id }))];
        }

        // Sort by date added descending
        allMedia.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());

        return NextResponse.json(allMedia);
    } catch (error) {
        console.error('API /sonarr/all error:', error);
        return NextResponse.json({ error: 'Failed to fetch all series' }, { status: 500 });
    }
}

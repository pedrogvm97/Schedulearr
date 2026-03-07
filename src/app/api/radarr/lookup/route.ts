import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { searchMovies } from '@/lib/radarr';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');
    const term = searchParams.get('term');

    if (!instanceId) {
        return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
    }

    const searchTerm = term || '';

    try {
        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const results = await searchMovies(instance.url, instance.api_key, searchTerm);
        return NextResponse.json(results);
    } catch (error) {
        console.error('API /radarr/lookup error:', error);
        return NextResponse.json({ error: 'Failed to lookup movies' }, { status: 500 });
    }
}

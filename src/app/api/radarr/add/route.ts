import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { addMovie } from '@/lib/radarr';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const { instanceId, movieData } = payload;

        if (!instanceId || !movieData) {
            return NextResponse.json({ error: 'Missing instanceId or movieData' }, { status: 400 });
        }

        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const result = await addMovie(instance.url, instance.api_key, movieData);
        if (result.success) {
            return NextResponse.json(result.data, { status: 201 });
        } else {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
    } catch (error) {
        console.error('API /radarr/add error:', error);
        return NextResponse.json({ error: 'Failed to add movie' }, { status: 500 });
    }
}

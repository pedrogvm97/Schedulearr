import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import { getRootFolders } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
        return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
    }

    try {
        const instance = getInstanceById(instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const folders = await getRootFolders(instance.url, instance.api_key);
        return NextResponse.json(folders);
    } catch (error) {
        console.error('API /sonarr/rootfolder error:', error);
        return NextResponse.json({ error: 'Failed to fetch root folders' }, { status: 500 });
    }
}

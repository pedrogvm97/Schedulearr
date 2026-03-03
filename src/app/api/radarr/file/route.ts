import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { deleteMovieFile } from '@/lib/radarr';

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const movieFileId = searchParams.get('movieFileId');
        const instanceId = searchParams.get('instanceId');

        if (!movieFileId || !instanceId) {
            return NextResponse.json({ error: 'Missing movieFileId or instanceId' }, { status: 400 });
        }

        const instance = getInstances('radarr').find(i => i.id === instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const success = await deleteMovieFile(instance.url, instance.api_key, parseInt(movieFileId));
        return NextResponse.json({ success });
    } catch (error) {
        console.error('API /radarr/file DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete movie file' }, { status: 500 });
    }
}

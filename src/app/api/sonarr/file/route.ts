import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { deleteEpisodeFile } from '@/lib/sonarr';

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const episodeFileId = searchParams.get('episodeFileId');
        const instanceId = searchParams.get('instanceId');

        if (!episodeFileId || !instanceId) {
            return NextResponse.json({ error: 'Missing episodeFileId or instanceId' }, { status: 400 });
        }

        const instance = getInstances('sonarr').find(i => i.id === instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const success = await deleteEpisodeFile(instance.url, instance.api_key, parseInt(episodeFileId));
        return NextResponse.json({ success });
    } catch (error) {
        console.error('API /sonarr/file DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete episode file' }, { status: 500 });
    }
}

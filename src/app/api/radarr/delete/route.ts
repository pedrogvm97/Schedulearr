import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');
        const movieId = searchParams.get('movieId');
        const deleteFiles = searchParams.get('deleteFiles') === 'true';

        if (!instanceId || !movieId) {
            return NextResponse.json({ error: 'instanceId and movieId are required' }, { status: 400 });
        }

        const instance = getInstances().find(i => i.id === instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        await axios.delete(`${instance.url}/api/v3/movie/${movieId}`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { deleteFiles, addImportExclusion: false }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Radarr delete error:', error.response?.data || error.message);
        return NextResponse.json({ error: error.response?.data?.[0]?.errorMessage || 'Failed to delete movie' }, { status: 500 });
    }
}

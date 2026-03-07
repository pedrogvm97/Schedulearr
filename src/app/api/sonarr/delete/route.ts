import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');
        const seriesId = searchParams.get('seriesId');
        const deleteFiles = searchParams.get('deleteFiles') === 'true';

        if (!instanceId || !seriesId) {
            return NextResponse.json({ error: 'instanceId and seriesId are required' }, { status: 400 });
        }

        const instance = getInstances().find(i => i.id === instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        await axios.delete(`${instance.url}/api/v3/series/${seriesId}`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { deleteFiles, addImportListExclusion: false }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Sonarr delete error:', error.response?.data || error.message);
        return NextResponse.json({ error: error.response?.data?.[0]?.errorMessage || 'Failed to delete series' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');
        const seriesId = searchParams.get('seriesId');
        const deleteFiles = searchParams.get('deleteFiles') === 'true';
        const deleteFilesOnly = searchParams.get('deleteFilesOnly') === 'true';

        if (!instanceId || !seriesId) {
            return NextResponse.json({ error: 'instanceId and seriesId are required' }, { status: 400 });
        }

        const instance = getInstances().find(i => i.id === instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        if (deleteFilesOnly) {
            // Fetch all episode files for this series
            const filesRes = await axios.get(`${instance.url}/api/v3/episodefile`, {
                headers: { 'X-Api-Key': instance.api_key },
                params: { seriesId }
            });
            const files = filesRes.data;

            if (Array.isArray(files) && files.length > 0) {
                // Delete them sequentially or in parallel? Parallel is faster.
                await Promise.all(files.map(file =>
                    axios.delete(`${instance.url}/api/v3/episodefile/${file.id}`, {
                        headers: { 'X-Api-Key': instance.api_key }
                    })
                ));
                return NextResponse.json({ success: true, message: `Deleted ${files.length} episode files.` });
            } else {
                return NextResponse.json({ error: 'No episode files found to delete for this series.' }, { status: 404 });
            }
        }

        await axios.delete(`${instance.url}/api/v3/series/${seriesId}`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { deleteFiles, addImportListExclusion: false }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Sonarr delete error:', error.response?.data || error.message);
        const errMsg = Array.isArray(error.response?.data)
            ? error.response?.data[0]?.errorMessage
            : (error.response?.data?.error || error.message);
        return NextResponse.json({ error: errMsg || 'Failed to delete series' }, { status: 500 });
    }
}

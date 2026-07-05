import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');
        const seriesId = searchParams.get('seriesId');
        const episodeFileId = searchParams.get('episodeFileId'); // Direct episode file deletion
        const seasonNumber = searchParams.get('seasonNumber');   // Season-level deletion
        const deleteFiles = searchParams.get('deleteFiles') === 'true';
        const deleteFilesOnly = searchParams.get('deleteFilesOnly') === 'true';

        if (!instanceId) {
            return NextResponse.json({ error: 'instanceId is required' }, { status: 400 });
        }

        const instance = getInstances().find(i => i.id === instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        // Case 1: Delete a single episode file by ID
        if (episodeFileId && deleteFilesOnly) {
            await axios.delete(`${instance.url}/api/v3/episodefile/${episodeFileId}`, {
                headers: { 'X-Api-Key': instance.api_key }
            });
            return NextResponse.json({ success: true, message: 'Episode file deleted.' });
        }

        if (!seriesId) {
            return NextResponse.json({ error: 'seriesId or episodeFileId is required' }, { status: 400 });
        }

        // Case 2: Delete a specific season's files only
        if (seasonNumber !== null && deleteFilesOnly) {
            const filesRes = await axios.get(`${instance.url}/api/v3/episodefile`, {
                headers: { 'X-Api-Key': instance.api_key },
                params: { seriesId }
            });
            const files = filesRes.data || [];
            const seasonFiles = files.filter((f: any) => f.seasonNumber === parseInt(seasonNumber));

            if (seasonFiles.length > 0) {
                await Promise.all(seasonFiles.map((file: any) =>
                    axios.delete(`${instance.url}/api/v3/episodefile/${file.id}`, {
                        headers: { 'X-Api-Key': instance.api_key }
                    })
                ));
                return NextResponse.json({ success: true, message: `Deleted ${seasonFiles.length} files from Season ${seasonNumber}.` });
            } else {
                return NextResponse.json({ error: 'No episode files found for this season.' }, { status: 404 });
            }
        }

        // Case 3: Delete all files for a series (files only, keep entry)
        if (deleteFilesOnly) {
            const filesRes = await axios.get(`${instance.url}/api/v3/episodefile`, {
                headers: { 'X-Api-Key': instance.api_key },
                params: { seriesId }
            });
            const files = filesRes.data;

            if (Array.isArray(files) && files.length > 0) {
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

        // Case 4: Delete entire series entry + files
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


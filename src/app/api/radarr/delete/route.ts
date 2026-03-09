import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');
        const movieId = searchParams.get('movieId');
        const deleteFiles = searchParams.get('deleteFiles') === 'true';
        const deleteFilesOnly = searchParams.get('deleteFilesOnly') === 'true';

        if (!instanceId || !movieId) {
            return NextResponse.json({ error: 'instanceId and movieId are required' }, { status: 400 });
        }

        const instance = getInstances().find(i => i.id === instanceId);
        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        if (deleteFilesOnly) {
            // Fetch movie info to get file ID
            const movieRes = await axios.get(`${instance.url}/api/v3/movie/${movieId}`, {
                headers: { 'X-Api-Key': instance.api_key }
            });
            const movie = movieRes.data;

            if (movie.movieFile?.id) {
                await axios.delete(`${instance.url}/api/v3/moviefile/${movie.movieFile.id}`, {
                    headers: { 'X-Api-Key': instance.api_key }
                });
                return NextResponse.json({ success: true, message: 'Files deleted, entry kept.' });
            } else {
                return NextResponse.json({ error: 'No files found to delete for this movie.' }, { status: 404 });
            }
        }

        await axios.delete(`${instance.url}/api/v3/movie/${movieId}`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { deleteFiles, addImportExclusion: false }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Radarr delete error:', error.response?.data || error.message);
        const errMsg = Array.isArray(error.response?.data)
            ? error.response?.data[0]?.errorMessage
            : (error.response?.data?.error || error.message);
        return NextResponse.json({ error: errMsg || 'Failed to delete movie' }, { status: 500 });
    }
}

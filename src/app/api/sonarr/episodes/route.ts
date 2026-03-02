import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get('instanceId');
    const seriesId = searchParams.get('seriesId');

    if (!instanceId || !seriesId) {
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const instances = getInstances();
    const instance = instances.find(inst => inst.id === instanceId);

    if (!instance || instance.type !== 'sonarr') {
        return NextResponse.json({ error: 'Valid Sonarr instance not found' }, { status: 404 });
    }

    try {
        const response = await axios.get(`${instance.url}/api/v3/episode`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { seriesId }
        });

        const episodes = response.data;

        // Optionally fetch episode files to get media info like quality and subtitles
        const filesResponse = await axios.get(`${instance.url}/api/v3/episodefile`, {
            headers: { 'X-Api-Key': instance.api_key },
            params: { seriesId }
        });

        const files = filesResponse.data;
        const fileMap = new Map();
        files.forEach((f: any) => fileMap.set(f.id, f));

        // Merge file metadata into episode data
        const enrichedEpisodes = episodes.map((ep: any) => {
            if (ep.episodeFileId && fileMap.has(ep.episodeFileId)) {
                return { ...ep, episodeFile: fileMap.get(ep.episodeFileId) };
            }
            return ep;
        });

        // Sort by season and episode number
        enrichedEpisodes.sort((a: any, b: any) => {
            if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
            return a.episodeNumber - b.episodeNumber;
        });

        return NextResponse.json(enrichedEpisodes);
    } catch (e) {
        console.error(`Error fetching episodes for series ${seriesId}`, e);
        return NextResponse.json({ error: 'Failed to fetch episodes' }, { status: 500 });
    }
}

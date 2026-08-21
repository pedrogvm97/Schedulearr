import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            instanceId,
            artist,
            artistName,
            foreignArtistId,
            qualityProfileId,
            metadataProfileId,
            rootFolderPath,
            monitored = true,
            searchForMissingAlbums = true
        } = body;

        const lidarrInstances = getInstances().filter(i => i.type === 'lidarr' && i.enabled);
        const instance = instanceId ? lidarrInstances.find(i => i.id === instanceId) : lidarrInstances[0];

        if (!instance) {
            return NextResponse.json({ error: 'No enabled Lidarr instance found' }, { status: 404 });
        }

        const lidarrUrl = instance.url.replace(/\/$/, '');

        // If artist object already resolved from Lidarr lookup
        let payload: any = null;

        if (artist && artist.foreignArtistId) {
            payload = {
                ...artist,
                qualityProfileId: qualityProfileId || artist.qualityProfileId || 1,
                metadataProfileId: metadataProfileId || artist.metadataProfileId || 1,
                rootFolderPath: rootFolderPath || artist.rootFolderPath,
                monitored: monitored !== undefined ? monitored : true,
                addOptions: {
                    searchForMissingAlbums: Boolean(searchForMissingAlbums)
                }
            };
        } else {
            // Need to lookup first in Lidarr
            const lookupName = artistName || foreignArtistId;
            const lookupRes = await axios.get(`${lidarrUrl}/api/v1/artist/lookup?term=${encodeURIComponent(lookupName)}`, {
                headers: { 'X-Api-Key': instance.api_key },
                timeout: 8000
            });

            if (!Array.isArray(lookupRes.data) || lookupRes.data.length === 0) {
                return NextResponse.json({ error: `Artist "${lookupName}" not found in Lidarr database` }, { status: 404 });
            }

            const foundArtist = lookupRes.data[0];
            payload = {
                ...foundArtist,
                qualityProfileId: qualityProfileId || 1,
                metadataProfileId: metadataProfileId || 1,
                rootFolderPath: rootFolderPath || (await axios.get(`${lidarrUrl}/api/v1/rootfolder`, { headers: { 'X-Api-Key': instance.api_key } })).data[0]?.path,
                monitored: monitored !== undefined ? monitored : true,
                addOptions: {
                    searchForMissingAlbums: Boolean(searchForMissingAlbums)
                }
            };
        }

        const addRes = await axios.post(`${lidarrUrl}/api/v1/artist`, payload, {
            headers: { 'X-Api-Key': instance.api_key },
            timeout: 10000
        });

        return NextResponse.json({
            success: true,
            artist: addRes.data,
            message: `Added "${addRes.data.artistName || artistName}" to ${instance.name}`
        });
    } catch (error: any) {
        console.error('API /lidarr/add error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.[0]?.errorMessage || error.response?.data?.message || error.message;
        return NextResponse.json({ error: errMsg }, { status: error.response?.status || 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { instanceId, name, artistId, albumIds, albumId } = body;

        const lidarrInstances = getInstances().filter(i => i.type === 'lidarr' && i.enabled);
        const instance = instanceId ? lidarrInstances.find(i => i.id === instanceId) : lidarrInstances[0];

        if (!instance) {
            return NextResponse.json({ error: 'No enabled Lidarr instance found' }, { status: 404 });
        }

        const lidarrUrl = instance.url.replace(/\/$/, '');
        let commandPayload: any = { name: name || 'AlbumSearch' };

        if (albumIds && Array.isArray(albumIds)) {
            commandPayload = { name: 'AlbumSearch', albumIds };
        } else if (albumId) {
            commandPayload = { name: 'AlbumSearch', albumIds: [albumId] };
        } else if (artistId) {
            commandPayload = { name: 'ArtistSearch', artistId };
        }

        const res = await axios.post(`${lidarrUrl}/api/v1/command`, commandPayload, {
            headers: { 'X-Api-Key': instance.api_key },
            timeout: 8000
        });

        return NextResponse.json(res.data);
    } catch (error: any) {
        console.error('API /lidarr/command error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

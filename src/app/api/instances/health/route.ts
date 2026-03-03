export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Instance ID required' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(inst => inst.id === id);

        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        let isOnline = false;

        try {
            if (instance.type === 'radarr' || instance.type === 'sonarr' || instance.type === 'prowlarr') {
                // The standard endpoint for Arr apps to check system status
                const res = await axios.get(`${instance.url}/api/v3/system/status`, {
                    headers: { 'X-Api-Key': instance.api_key },
                    timeout: 5000
                });
                if (res.status === 200) isOnline = true;
            } else if (instance.type === 'qbittorrent') {
                // The standard endpoint for qBittorrent to check API version (no auth needed usually, or basic auth checks out if alive)
                const res = await axios.get(`${instance.url}/api/v2/app/webapiVersion`, {
                    timeout: 5000
                });
                if (res.status === 200) isOnline = true;
            }
        } catch (e: any) {
            // Expected if offline, wrong port, wrong API key, etc.
            isOnline = false;
        }

        return NextResponse.json({ status: isOnline ? 'online' : 'offline' });
    } catch (e) {
        console.error('Error fetching instance health:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

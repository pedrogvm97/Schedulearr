import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export async function POST(req: Request) {
    try {
        const { instanceId, name, ...params } = await req.json();

        if (!instanceId || !name) {
            return NextResponse.json({ error: 'Missing instanceId or command name' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(inst => inst.id === instanceId);

        if (!instance || instance.type !== 'sonarr') {
            return NextResponse.json({ error: 'Valid Sonarr instance not found' }, { status: 404 });
        }

        const response = await axios.post(`${instance.url}/api/v3/command`, {
            name,
            ...params
        }, {
            headers: { 'X-Api-Key': instance.api_key }
        });

        return NextResponse.json(response.data);
    } catch (e: any) {
        console.error('Error triggering Sonarr command:', e.response?.data || e.message);
        return NextResponse.json({ error: e.response?.data?.[0]?.errorMessage || 'Failed to trigger command' }, { status: 500 });
    }
}

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

        if (!instance || instance.type !== 'radarr') {
            return NextResponse.json({ error: 'Valid Radarr instance not found' }, { status: 404 });
        }

        // Support both MoviesSearch and MovieSearch aliases
        const commandName = name === 'MovieSearch' ? 'MoviesSearch' : name;
        const response = await axios.post(`${instance.url}/api/v3/command`, {
            name: commandName,
            ...params
        }, {
            headers: { 'X-Api-Key': instance.api_key },
            timeout: 10000
        });

        return NextResponse.json(response.data);
    } catch (e: any) {
        console.error('Error triggering Radarr command:', e.response?.data || e.message);
        const errMsg = e.response?.data?.message || e.response?.data?.[0]?.errorMessage || e.response?.data?.description || e.message || 'Failed to trigger command';
        return NextResponse.json({ error: errMsg }, { status: e.response?.status || 500 });
    }
}

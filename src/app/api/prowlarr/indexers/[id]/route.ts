import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

// PUT toggle indexer state directly in prowlarr
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const indexerId = parseInt(id);
        const { instanceId, enable } = await req.json();

        if (!instanceId) return NextResponse.json({ error: 'Instance ID is required' }, { status: 400 });

        const prowlarrs = getInstances('prowlarr', true);
        const targetInstance = prowlarrs.find(p => p.id === instanceId);

        if (!targetInstance) {
            return NextResponse.json({ error: 'Prowlarr instance not found or disabled' }, { status: 404 });
        }

        // 1. Fetch current indexer configuration to resubmit it with 'enable' modified
        const getRes = await axios.get(`${targetInstance.url}/api/v1/indexer/${indexerId}`, {
            headers: { 'X-Api-Key': targetInstance.api_key }
        });

        const indexerConfig = getRes.data;
        indexerConfig.enable = enable; // toggle bool

        // 2. Put back the modified config
        const putRes = await axios.put(`${targetInstance.url}/api/v1/indexer/${indexerId}`, indexerConfig, {
            headers: { 'X-Api-Key': targetInstance.api_key }
        });

        // 3. Optional: Trigger a stats clear if they enabled it manually? (Skipping for now)
        return NextResponse.json({ success: true, indexer: putRes.data });
    } catch (e: any) {
        console.error("Error toggling indexer state:", e);
        return NextResponse.json({ error: e.response?.data || e.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { authenticateQbittorrent, pauseTorrents, resumeTorrents } from '@/lib/qbittorrent';

export async function POST(req: NextRequest) {
    try {
        const { action, hash, instanceId } = await req.json();

        if (!action || !hash || !instanceId) {
            return NextResponse.json({ error: 'Missing action, hash, or instanceId' }, { status: 400 });
        }

        const instances = getInstances('qbittorrent', true);
        const instance = instances.find(inst => inst.id === instanceId || inst.id === parseInt(instanceId));

        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const cookie = await authenticateQbittorrent(instance.url, instance.api_key);

        if (action === 'pause') {
            await pauseTorrents(instance.url, cookie, [hash]);
        } else if (action === 'resume') {
            await resumeTorrents(instance.url, cookie, [hash]);
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('API qbittorrent/action error:', error);
        return NextResponse.json({ error: error.message || 'Failed to perform action' }, { status: 500 });
    }
}

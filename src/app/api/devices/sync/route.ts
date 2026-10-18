import { NextResponse } from 'next/server';
import {
    getDeviceSyncQueue,
    getMediaDeviceSyncMap,
    toggleMediaDeviceSync,
    processDeviceSyncCycle
} from '@/lib/deviceSync';
import { setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const mediaId = searchParams.get('mediaId');

        const queue = getDeviceSyncQueue();

        if (mediaId) {
            const syncMap = getMediaDeviceSyncMap(mediaId);
            const mediaItems = queue.filter(q => q.mediaId === mediaId);
            return NextResponse.json({
                success: true,
                syncMap,
                items: mediaItems
            });
        }

        return NextResponse.json({
            success: true,
            items: queue
        });
    } catch (error: any) {
        console.error('[API-DEVICES-SYNC] Error getting sync status:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { deviceId, media, enable } = body;

        if (!deviceId || !media || !media.id) {
            return NextResponse.json(
                { success: false, error: 'deviceId and media (with id) are required' },
                { status: 400 }
            );
        }

        const res = await toggleMediaDeviceSync(deviceId, media, Boolean(enable));

        return NextResponse.json({
            success: true,
            ...res
        });
    } catch (error: any) {
        console.error('[API-DEVICES-SYNC] Error toggling device sync:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let id = searchParams.get('id');

        if (!id) {
            try {
                const body = await req.json();
                id = body.id;
            } catch {}
        }

        if (!id) {
            return NextResponse.json({ success: false, error: 'Sync Item ID is required' }, { status: 400 });
        }

        const queue = getDeviceSyncQueue().filter(q => q.id !== id);
        setSetting('device_sync_queue', JSON.stringify(queue));

        return NextResponse.json({ success: true, message: 'Sync item removed' });
    } catch (error: any) {
        console.error('[API-DEVICES-SYNC] Error deleting sync item:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

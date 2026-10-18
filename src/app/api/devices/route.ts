import { NextResponse } from 'next/server';
import {
    getConnectedDevices,
    saveConnectedDevice,
    deleteConnectedDevice,
    testDeviceConnection,
    getDeviceSyncQueue,
    ConnectedDevice
} from '@/lib/deviceSync';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const shouldTest = searchParams.get('test') === 'true';

        let devices = getConnectedDevices();
        if (shouldTest) {
            await Promise.all(
                devices.filter(d => d.enabled).map(d => testDeviceConnection(d).catch(() => null))
            );
            devices = getConnectedDevices();
        }

        const queue = getDeviceSyncQueue();

        return NextResponse.json({
            success: true,
            devices,
            queue
        });
    } catch (error: any) {
        console.error('[API-DEVICES] Error fetching devices:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const action = body.action || 'save';

        if (action === 'test') {
            const device = body.device as ConnectedDevice;
            if (!device || !device.target) {
                return NextResponse.json({ ok: false, message: 'Invalid device parameters' }, { status: 400 });
            }
            const testResult = await testDeviceConnection(device);
            return NextResponse.json(testResult);
        }

        const deviceData = body.device || body;
        if (!deviceData || !deviceData.name || !deviceData.target) {
            return NextResponse.json({ success: false, error: 'Name and Target are required' }, { status: 400 });
        }

        const saved = saveConnectedDevice(deviceData);
        // Automatically test & create folder on device asynchronously
        testDeviceConnection(saved).catch(err => {
            console.warn('[API-DEVICES] Initial connection test warn:', err.message);
        });

        return NextResponse.json({
            success: true,
            device: saved
        });
    } catch (error: any) {
        console.error('[API-DEVICES] Error saving device:', error);
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
            return NextResponse.json({ success: false, error: 'Device ID is required' }, { status: 400 });
        }

        deleteConnectedDevice(id);
        return NextResponse.json({ success: true, message: 'Device removed' });
    } catch (error: any) {
        console.error('[API-DEVICES] Error deleting device:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

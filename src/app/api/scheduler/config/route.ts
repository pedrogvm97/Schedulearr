export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSchedulerConfig, setSchedulerConfig } from '@/lib/db';

export async function GET() {
    try {
        const config = getSchedulerConfig();
        return NextResponse.json(config);
    } catch (e) {
        console.error('Error fetching scheduler config', e);
        return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { enabled, interval, batchSize } = body;
        if (typeof enabled !== 'boolean' || typeof interval !== 'number' || typeof batchSize !== 'number') {
            return NextResponse.json({ error: 'Invalid config payload' }, { status: 400 });
        }
        setSchedulerConfig({ enabled, interval, batchSize });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Error updating scheduler config', e);
        return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
    }
}

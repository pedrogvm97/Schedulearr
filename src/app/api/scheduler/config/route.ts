import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';

export async function GET() {
    try {
        const config = {
            interval: getSetting('scheduler_interval') || '60',
            batchSize: getSetting('scheduler_batch') || '10',
            enabled: getSetting('scheduler_enabled') === 'true'
        };
        return NextResponse.json(config);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        if (body.interval) setSetting('scheduler_interval', body.interval.toString());
        if (body.batchSize) setSetting('scheduler_batch', body.batchSize.toString());
        if (body.enabled !== undefined) setSetting('scheduler_enabled', body.enabled.toString());

        return NextResponse.json({ success: true, config: body });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}

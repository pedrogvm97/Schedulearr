import { NextResponse } from 'next/server';
import { getStreamGuardStatus, updateStreamGuardSettings, runStreamGuardCycle } from '@/lib/streamGuard';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const status = getStreamGuardStatus();
        return NextResponse.json(status);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { action, settings } = body;

        if (action === 'check') {
            await runStreamGuardCycle();
            return NextResponse.json(getStreamGuardStatus());
        }

        if (settings) {
            const updated = updateStreamGuardSettings(settings);
            // Run a cycle immediately to apply changes
            await runStreamGuardCycle();
            return NextResponse.json({
                success: true,
                settings: updated,
                status: getStreamGuardStatus()
            });
        }

        return NextResponse.json({ error: 'Invalid action or settings' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

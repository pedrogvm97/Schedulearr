export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { logSearchHistory } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const { instanceId, type } = await req.json();
        if (!instanceId || !type) {
            return NextResponse.json({ error: 'Missing instanceId or type' }, { status: 400 });
        }
        // Here we simply log the trigger; actual triggering is handled by the scheduler's runBatchSearch or separate endpoint.
        // For immediate trigger, we could call the appropriate function directly, but for now we log and return success.
        logSearchHistory('manual', [], [], `Manual trigger for ${type} on instance ${instanceId}`);
        return NextResponse.json({ success: true, message: 'Search triggered' });
    } catch (e) {
        console.error('Error in search trigger', e);
        return NextResponse.json({ error: 'Failed to trigger search' }, { status: 500 });
    }
}

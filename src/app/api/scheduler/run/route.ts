export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { runBatchSearch } from '@/lib/scheduler';

export async function POST() {
    try {
        const result = await runBatchSearch();
        return NextResponse.json({ success: true, result });
    } catch (e) {
        console.error('Error triggering manual batch run', e);
        return NextResponse.json({ error: 'Failed to trigger batch run' }, { status: 500 });
    }
}

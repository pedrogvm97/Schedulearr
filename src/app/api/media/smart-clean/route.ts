import { NextResponse } from 'next/server';
import { runSmartCleanup } from '@/lib/autoCleanup';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const result = await runSmartCleanup();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('API /api/media/smart-clean error:', error);
        return NextResponse.json({ error: error.message || 'Failed to run smart cleanup' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { runAutoCleanup } from '@/lib/autoCleanup';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const result = await runAutoCleanup();
        return NextResponse.json(result);
    } catch (error) {
        console.error('API /qbittorrent/auto-cleanup error:', error);
        return NextResponse.json({ error: 'Failed to run auto-cleanup' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getDatabaseStats } from '@/lib/db';

export async function GET() {
    try {
        const stats = getDatabaseStats();
        // Normalize to the shape the Settings page expects
        return NextResponse.json({
            totalSizeBytes: stats.sizeBytes,
            tableStats: stats.tables,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

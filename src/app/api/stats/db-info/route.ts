import { NextResponse } from 'next/server';
import { getDatabaseStats } from '@/lib/db';

export async function GET() {
    try {
        const stats = getDatabaseStats();
        return NextResponse.json(stats);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

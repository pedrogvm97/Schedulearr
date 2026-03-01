import { NextResponse } from 'next/server';
import { runBatchSearch } from '@/lib/scheduler'; // We need to export runBatchSearch

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        // Run the search batch immediately
        const results = await runBatchSearch();
        return NextResponse.json(results);
    } catch (error) {
        console.error('API /scheduler/trigger error:', error);
        return NextResponse.json({ error: 'Failed to trigger search' }, { status: 500 });
    }
}

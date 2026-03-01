import { NextResponse } from 'next/server';
import { runBatchSearch } from '@/lib/scheduler'; // We need to export runBatchSearch

export async function POST() {
    try {
        // Run the search batch immediately
        await runBatchSearch();
        return NextResponse.json({ success: true, message: 'Search batch triggered successfully.' });
    } catch (error) {
        console.error('API /scheduler/trigger error:', error);
        return NextResponse.json({ error: 'Failed to trigger search' }, { status: 500 });
    }
}

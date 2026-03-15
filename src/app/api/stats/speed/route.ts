import { NextResponse } from 'next/server';
import { getNetworkSpeedHistory } from '@/lib/db';

export async function GET() {
    try {
        const history = getNetworkSpeedHistory(120); // Last hour if 30s interval
        return NextResponse.json(history.reverse()); // Chronological order
    } catch (error) {
        console.error('API /stats/speed error:', error);
        return NextResponse.json({ error: 'Failed to fetch speed history' }, { status: 500 });
    }
}

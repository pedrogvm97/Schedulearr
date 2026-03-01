import { NextResponse } from 'next/server';
import { getSearchHistory } from '@/lib/db';

export async function GET() {
    try {
        const history = getSearchHistory(50);
        return NextResponse.json({ success: true, history });
    } catch (error) {
        console.error('Failed to fetch history:', error);
        return NextResponse.json({ success: false, history: [] }, { status: 500 });
    }
}

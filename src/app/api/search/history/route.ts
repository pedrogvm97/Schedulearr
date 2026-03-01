export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSearchHistory } from '@/lib/db';

export async function GET() {
    try {
        const history = getSearchHistory();
        return NextResponse.json(history);
    } catch (e) {
        console.error('------- Error fetching search history ACTUAL ERROR -------', e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}

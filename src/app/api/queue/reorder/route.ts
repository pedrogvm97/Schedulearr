import { NextResponse } from 'next/server';
import { reorder } from '../../../lib/queue';

/**
 * POST /api/queue/reorder
 * Body: { orderedIds: number[] }
 * Reorders the processing queue priorities according to the supplied array.
 */
export async function POST(request: Request) {
  try {
    const { orderedIds } = await request.json();
    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 });
    }
    await reorder(orderedIds);
    return NextResponse.json({ status: 'ok' });
  } catch (e) {
    console.error('[QUEUE REORDER] error', e);
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }
}

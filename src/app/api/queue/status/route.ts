import { NextResponse } from 'next/server';
import { queue } from '../../../lib/queue';

/**
 * GET /api/queue/status?trackId=123
 * Returns the queue entry for the given track, if any.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const trackId = url.searchParams.get('trackId');
  if (!trackId) {
    return NextResponse.json({ error: 'trackId required' }, { status: 400 });
  }

  const entry = await queue.getByTrack(Number(trackId));
  if (!entry) {
    return NextResponse.json({ error: 'no queue entry' }, { status: 404 });
  }

  return NextResponse.json({
    id: entry.id,
    jobType: entry.job_type,
    status: entry.status,
    progress: entry.progress,
    priority: entry.priority,
  });
}

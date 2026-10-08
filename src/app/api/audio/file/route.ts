import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { queue } from '../../../lib/queue';
import { getTrackById } from '../../../lib/db'; // assumed helper

/**
 * GET /api/audio/file?trackId=123&mode=original|optimized
 * Serves the requested audio file. If optimized mode is requested and the file does not exist,
 * enqueues an audio‑enhancement job and returns 202 Accepted.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const trackId = url.searchParams.get('trackId');
  const mode = url.searchParams.get('mode') ?? 'original';

  if (!trackId) {
    return NextResponse.json({ error: 'trackId required' }, { status: 400 });
  }

  console.info('[AUDIO FILE] Request', { trackId, mode });

  // Resolve original file path from DB (placeholder implementation)
  const track = await getTrackById(Number(trackId));
  if (!track) {
    return NextResponse.json({ error: 'track not found' }, { status: 404 });
  }
  const originalPath = track.filePath; // absolute path stored in DB

  if (mode === 'original') {
    const stream = fs.createReadStream(originalPath);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `inline; filename="${path.basename(originalPath)}"`,
      },
    });
  }

  // Optimized mode – check if enhanced file exists
  const enhancedPath = path.join(
    process.cwd(),
    'data',
    'enhanced',
    `${trackId}_opt.m4a`
  );

  if (fs.existsSync(enhancedPath)) {
    const stream = fs.createReadStream(enhancedPath);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Disposition': `inline; filename="${path.basename(enhancedPath)}"`,
      },
    });
  }

  // No optimized file – enqueue a job
  await queue.enqueue({
    bookId: track.bookId,
    trackId: Number(trackId),
    jobType: 'enhance',
    status: 'queued',
    progress: 0,
    priority: 0,
  });

  return NextResponse.json({ status: 'queued' }, { status: 202 });
}

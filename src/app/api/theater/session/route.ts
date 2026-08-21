import { NextResponse } from 'next/server';
import { recordPlaybackHeartbeat, endPlaybackSession, getActivePlaybackSessions } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const sessions = getActivePlaybackSessions();
        return NextResponse.json({ sessions });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to fetch sessions' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action = 'heartbeat', sessionId } = body;

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        if (action === 'end') {
            endPlaybackSession(sessionId);
            return NextResponse.json({ success: true, ended: true });
        }

        recordPlaybackHeartbeat({
            sessionId,
            userName: body.userName || 'Pedro',
            mediaId: body.mediaId,
            title: body.title || 'Unknown Track',
            artist: body.artist,
            album: body.album,
            mediaType: body.mediaType || body.category || 'music',
            poster: body.poster,
            deviceName: body.deviceName || 'Web Music Player',
            platform: body.platform || 'Web',
            state: body.state || 'playing',
            progressPercent: body.progressPercent || 0,
            viewOffsetMs: body.viewOffsetMs || 0,
            durationMs: body.durationMs || 0,
            bandwidthMbps: body.bandwidthMbps || '0.3',
            transcodeDecision: body.transcodeDecision || 'Direct Play'
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to record session' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');
        if (sessionId) {
            endPlaybackSession(sessionId);
        }
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to end session' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { createTvSession, getTvSession, approveTvSession, castToTvSession, getPairedTvSessions, deleteTvSession } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function generatePinCode(): string {
    const num = Math.floor(100000 + Math.random() * 900000);
    const s = String(num);
    return `${s.slice(0, 3)}-${s.slice(3)}`;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');
        const listSessions = searchParams.get('listSessions');

        if (listSessions === 'true') {
            const sessions = getPairedTvSessions();
            return NextResponse.json({ sessions });
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const session = getTvSession(sessionId);
        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({ session });
    } catch (error: any) {
        console.error('API /theater/tv GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action } = body;

        // 1. Create a 6-digit TV Pairing Code
        if (action === 'create_code') {
            const sessionId = `tv-${crypto.randomUUID()}`;
            const code = generatePinCode();
            const deviceName = body.deviceName || 'Smart TV';

            createTvSession(sessionId, code, deviceName);
            return NextResponse.json({ sessionId, code });
        }

        // 2. Approve TV Session Code from Phone / PC
        if (action === 'approve_code') {
            const { code } = body;
            if (!code) {
                return NextResponse.json({ error: 'Pairing code is required' }, { status: 400 });
            }

            const success = approveTvSession(code);
            if (success) {
                return NextResponse.json({ success: true, message: 'TV Paired Successfully!' });
            } else {
                return NextResponse.json({ error: 'Invalid or expired pairing code' }, { status: 404 });
            }
        }

        // 3. Cast Media to TV Session
        if (action === 'cast') {
            const { sessionId, media } = body;
            if (!media) {
                return NextResponse.json({ error: 'media payload is required' }, { status: 400 });
            }

            const paired = getPairedTvSessions();
            if (!paired || paired.length === 0) {
                return NextResponse.json({ error: 'No paired Smart TVs found. Pair a TV via /tv first.' }, { status: 404 });
            }

            const success = castToTvSession(sessionId || 'all', media);
            if (success) {
                return NextResponse.json({ success: true, message: 'Casting to TV...' });
            } else {
                return NextResponse.json({ error: 'Selected TV is not connected or paired' }, { status: 404 });
            }
        }

        // 4. Unpair TV Session
        if (action === 'unpair') {
            const { sessionId } = body;
            if (sessionId) {
                deleteTvSession(sessionId);
                return NextResponse.json({ success: true });
            }
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API /theater/tv POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');
        if (sessionId) {
            deleteTvSession(sessionId);
            return NextResponse.json({ success: true });
        }
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const category = String(body.category || 'UI-ACTION').toUpperCase().trim();
        const message = String(body.message || '').trim();
        const level = String(body.level || 'info').toLowerCase().trim();
        const details = body.details ? (typeof body.details === 'string' ? body.details : JSON.stringify(body.details)) : '';

        if (!message) {
            return NextResponse.json({ ok: true });
        }

        const ts = new Date().toISOString();
        const icon =
            level === 'error' ? '❌' :
            level === 'warn' ? '⚠️' :
            category.includes('PLAYBACK') || category.includes('STREAM') ? '🎬' :
            category.includes('LIVE') || category.includes('IPTV') ? '📺' :
            category.includes('AUDIOBOOK') ? '📖' :
            category.includes('MUSIC') ? '🎵' :
            '📋';

        const formatted = `[${ts}] ${icon} [${category}] ${message}${details ? ` | ${details}` : ''}`;

        if (level === 'error') {
            console.error(formatted);
        } else if (level === 'warn') {
            console.warn(formatted);
        } else {
            console.log(formatted);
        }

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false }, { status: 200 });
    }
}

import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Fetch all settings as a key-value object
        const stmt = db.prepare('SELECT * FROM settings');
        const rows = stmt.all() as { key: string; value: string }[];

        const settings: Record<string, string> = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('API /api/settings GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { key, value } = await req.json();

        if (!key) {
            return NextResponse.json({ error: 'Missing key' }, { status: 400 });
        }

        console.log(`[SETTINGS] Updating ${key} to: ${value}`);
        setSetting(key, value.toString());

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API /api/settings POST error:', error);
        return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
    }
}

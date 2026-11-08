import { NextResponse } from 'next/server';
import fs from 'fs';
import db, { getDbPath } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const dbPath = getDbPath();
        if (!fs.existsSync(dbPath)) {
            return NextResponse.json({ error: 'Database file not found' }, { status: 404 });
        }

        // Flush WAL to disk before export
        try {
            db.pragma('wal_checkpoint(PASSIVE)');
        } catch {}

        const stat = fs.statSync(dbPath);
        const fileBuffer = fs.readFileSync(dbPath);
        const dateStr = new Date().toISOString().split('T')[0];

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-sqlite3',
                'Content-Disposition': `attachment; filename="schedulearr-backup-${dateStr}.db"`,
                'Content-Length': String(stat.size)
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Export failed' }, { status: 500 });
    }
}

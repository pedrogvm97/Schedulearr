import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import db from '@/lib/db';
import { encrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { password } = await req.json();

        if (!password) {
            return NextResponse.json({ error: 'Password is required' }, { status: 400 });
        }

        const instances = getInstances();
        const settings: Record<string, string> = {};
        const rows = db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[];
        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        const encryptedData = encrypt({ instances, settings }, password);

        return NextResponse.json({
            success: true,
            encryptedData,
            filename: `backup_${new Date().toISOString().split('T')[0]}.json`
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Failed to export instances' }, { status: 500 });
    }
}

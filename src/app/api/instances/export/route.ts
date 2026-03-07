import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { password } = await req.json();

        if (!password) {
            return NextResponse.json({ error: 'Password is required' }, { status: 400 });
        }

        const instances = getInstances();
        const encryptedData = encrypt(instances, password);

        return NextResponse.json({
            success: true,
            encryptedData,
            filename: `instances_backup_${new Date().toISOString().split('T')[0]}.json`
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Failed to export instances' }, { status: 500 });
    }
}

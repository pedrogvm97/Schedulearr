import { NextResponse } from 'next/server';
import { addInstance, updateInstance, getInstanceById, Instance } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { encryptedData, password } = await req.json();

        if (!encryptedData || !password) {
            return NextResponse.json({ error: 'Encrypted data and password are required' }, { status: 400 });
        }

        let instances: Instance[];
        try {
            instances = decrypt(encryptedData, password);
        } catch (e) {
            return NextResponse.json({ error: 'Incorrect password or invalid data format' }, { status: 401 });
        }

        if (!Array.isArray(instances)) {
            return NextResponse.json({ error: 'Invalid data structure in backup' }, { status: 400 });
        }

        // Import instances
        for (const inst of instances) {
            const existing = getInstanceById(inst.id);
            if (existing) {
                updateInstance(inst);
            } else {
                addInstance(inst);
            }
        }

        return NextResponse.json({ success: true, count: instances.length });
    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json({ error: 'Failed to import instances' }, { status: 500 });
    }
}

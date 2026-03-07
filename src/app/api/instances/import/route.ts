import { NextResponse } from 'next/server';
import { addInstance, updateInstance, getInstanceById, getInstances, Instance } from '@/lib/db';
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

        // Fetch all existing instances once for efficient matching
        const existingInstances = getInstances();

        // Import instances
        for (const inst of instances) {
            // 1. Try to find by ID first
            let existing = getInstanceById(inst.id);

            // 2. If no ID match, try to find by URL + Type (case-insensitive URL)
            if (!existing) {
                const normalizedUrl = inst.url.replace(/\/$/, "").toLowerCase();
                existing = existingInstances.find((ei: Instance) =>
                    ei.type === inst.type &&
                    ei.url.replace(/\/$/, "").toLowerCase() === normalizedUrl
                );
            }

            if (existing) {
                // Use the existing record's ID to ensure we update the right row,
                // but keep the data from the backup.
                updateInstance({ ...inst, id: existing.id });
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

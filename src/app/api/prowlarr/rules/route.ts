import { NextResponse } from 'next/server';
import { saveIndexerRule, deleteIndexerRule } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { id, indexer_id, prowlarr_instance_id, name, max_snatches, max_size_bytes, interval, auto_manage } = body;

        if (!indexer_id || !prowlarr_instance_id || !name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        saveIndexerRule({
            id,
            indexer_id,
            prowlarr_instance_id,
            name,
            max_snatches: max_snatches || null,
            max_size_bytes: max_size_bytes || null,
            interval: interval || 'monthly',
            current_snatches: 0,
            current_size_bytes: 0,
            last_reset: new Date().toISOString(),
            auto_manage: auto_manage !== undefined ? auto_manage : true
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error("Error saving indexer rule:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

        deleteIndexerRule(id);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

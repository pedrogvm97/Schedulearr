import { NextResponse } from 'next/server';
import { getInstances, addInstance, removeInstance, toggleInstanceEnabled, updateInstance, Instance } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const instances = getInstances();
        return NextResponse.json(instances);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch instances' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body: Instance = await req.json();

        // basic validation
        if (!body.id || !body.type || !body.name || !body.url || !body.api_key) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        addInstance(body);
        return NextResponse.json({ success: true, instance: body });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to add instance' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();

        // If it's a full update
        if (body.id && body.type && body.name && body.url && body.api_key) {
            updateInstance(body);
            return NextResponse.json({ success: true, instance: body });
        }

        // If it's just a toggle
        if (!body.id || typeof body.enabled !== 'boolean') {
            return NextResponse.json({ error: 'Missing id or enabled boolean for toggle, or missing fields for full update' }, { status: 400 });
        }

        toggleInstanceEnabled(body.id, body.enabled);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update instance' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Instance ID required' }, { status: 400 });
        }

        removeInstance(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete instance' }, { status: 500 });
    }
}

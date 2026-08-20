import { NextResponse } from 'next/server';
import { getIptvShortlists, saveIptvShortlist, deleteIptvShortlist } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const shortlists = getIptvShortlists(libraryId);
        return NextResponse.json({ shortlists });
    } catch (error: any) {
        console.error('API /theater/iptv/shortlists GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { id, libraryId, name, channelIds } = body;

        if (!libraryId || !name || !Array.isArray(channelIds)) {
            return NextResponse.json({ error: 'libraryId, name, and channelIds array are required' }, { status: 400 });
        }

        const targetId = id || `shortlist-${crypto.randomUUID()}`;
        const success = saveIptvShortlist(targetId, libraryId, name, channelIds);

        if (success) {
            return NextResponse.json({ success: true, id: targetId });
        } else {
            return NextResponse.json({ error: 'Failed to save shortlist' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/iptv/shortlists POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const success = deleteIptvShortlist(id);
        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Failed to delete shortlist' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/iptv/shortlists DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

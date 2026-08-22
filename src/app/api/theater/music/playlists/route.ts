import { NextResponse } from 'next/server';
import { getMusicPlaylists, saveMusicPlaylist, deleteMusicPlaylist } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');

        const playlists = getMusicPlaylists(libraryId || undefined);
        return NextResponse.json({ playlists });
    } catch (error: any) {
        console.error('API /theater/music/playlists GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const targetLibId = libraryId || 'global';
        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const playlistId = id || `playlist-${crypto.randomUUID()}`;
        const playlistItems = Array.isArray(items) ? items : [];

        const success = saveMusicPlaylist(playlistId, targetLibId, name, playlistItems, coverUrl);
        if (success) {
            return NextResponse.json({ success: true, id: playlistId });
        } else {
            return NextResponse.json({ error: 'Failed to save playlist' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/music/playlists POST error:', error);
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

        const success = deleteMusicPlaylist(id);
        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/music/playlists DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

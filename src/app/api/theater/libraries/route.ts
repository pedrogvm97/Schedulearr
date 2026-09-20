import { NextResponse } from 'next/server';
import { getTheaterLibraries, createTheaterLibrary, deleteTheaterLibrary, updateTheaterLibrary } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

import axios from 'axios';
import { getInstances } from '@/lib/db';

export async function GET() {
    try {
        const libraries = getTheaterLibraries();
        const plexMusicLibraries: Array<{ id: string; name: string; path: string; instanceName: string; instanceId?: string; sectionId: string }> = [];

        try {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            for (const plex of plexInstances) {
                const cleanUrl = plex.url.replace(/\/$/, '');
                const res = await axios.get(`${cleanUrl}/library/sections`, {
                    headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                    timeout: 4000
                }).catch(() => null);

                const sections = res?.data?.MediaContainer?.Directory || [];
                for (const sec of sections) {
                    if (sec.type === 'artist') {
                        const locations = (sec.Location || []).map((l: any) => l.path).filter(Boolean);
                        locations.forEach((loc: string, idx: number) => {
                            plexMusicLibraries.push({
                                id: `plex-${sec.key}-${idx}`,
                                name: `${sec.title || 'Music'} (${plex.name || 'Plex'})`,
                                path: loc,
                                instanceName: plex.name || 'Plex',
                                instanceId: plex.id,
                                sectionId: String(sec.key)
                            });
                        });
                    }
                }
            }
        } catch {}

        return NextResponse.json({ libraries, plexMusicLibraries });
    } catch (error: any) {
        console.error('API /theater/libraries GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, type, folders, plexSectionId, instanceId } = body;

        if (!name || !type || !Array.isArray(folders) || folders.length === 0) {
            return NextResponse.json({ error: 'name, type, and at least one folder path are required' }, { status: 400 });
        }

        const id = `theater-${crypto.randomUUID()}`;
        const success = createTheaterLibrary(id, name.trim(), type, folders, plexSectionId, instanceId);

        if (success) {
            return NextResponse.json({ success: true, id });
        } else {
            return NextResponse.json({ error: 'Failed to create theater library' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/libraries POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, folders, name } = body;

        if (!id || !Array.isArray(folders)) {
            return NextResponse.json({ error: 'id and folders array are required' }, { status: 400 });
        }

        const success = updateTheaterLibrary(id, folders, name);
        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Failed to update theater library' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/libraries PATCH error:', error);
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

        const success = deleteTheaterLibrary(id);
        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Failed to delete theater library' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('API /theater/libraries DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

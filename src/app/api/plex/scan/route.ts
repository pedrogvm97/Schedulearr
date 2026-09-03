import { NextResponse } from 'next/server';
import { getInstances, getTheaterLibraries, clearCachedTheaterItems } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { sectionId, libraryId, all, instanceId } = body;

        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        if (plexInstances.length === 0) {
            return NextResponse.json({ error: 'No active Plex instance configured' }, { status: 404 });
        }

        const refreshed: Array<{ instance: string; sectionId: string; title?: string }> = [];

        // 1. Scan ALL sections across all Plex instances
        if (all === true || (!sectionId && !libraryId)) {
            clearCachedTheaterItems(); // clear all local cache
            for (const plex of plexInstances) {
                const cleanUrl = plex.url.replace(/\/$/, '');
                try {
                    await axios.get(`${cleanUrl}/library/sections/all/refresh`, {
                        headers: { 'X-Plex-Token': plex.api_key },
                        timeout: 10000
                    });
                    refreshed.push({ instance: plex.name || 'Plex', sectionId: 'all', title: 'All Libraries' });
                } catch (e: any) {
                    console.error(`Plex scan all error (${plex.name}):`, e.message);
                }
            }

            return NextResponse.json({
                success: true,
                message: `Triggered scan for all Plex libraries across ${plexInstances.length} instance(s)`,
                refreshed
            });
        }

        // 2. Scan specific Schedulearr library
        if (libraryId) {
            clearCachedTheaterItems(libraryId);
            const libraries = getTheaterLibraries();
            const lib = libraries.find(l => l.id === libraryId);

            if (lib) {
                let targetSectionId = lib.plex_section_id;
                let targetInstance = plexInstances.find(p => lib.instance_id && p.id === lib.instance_id) || plexInstances[0];

                // If no section ID stored, search Plex sections by location/name
                if (!targetSectionId) {
                    let folderList: string[] = [];
                    try {
                        folderList = typeof lib.folders === 'string' ? JSON.parse(lib.folders) : (lib.folders || []);
                    } catch {}

                    for (const plex of plexInstances) {
                        try {
                            const cleanUrl = plex.url.replace(/\/$/, '');
                            const secRes = await axios.get(`${cleanUrl}/library/sections`, {
                                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                timeout: 6000
                            });
                            const dirs = secRes.data?.MediaContainer?.Directory || [];
                            const match = dirs.find((d: any) => {
                                const nameMatch = d.title.toLowerCase() === lib.name.toLowerCase();
                                const locs = (d.Location || []).map((l: any) => l.path);
                                const locMatch = folderList.some((f: string) => locs.includes(f));
                                return nameMatch || locMatch;
                            });
                            if (match) {
                                targetSectionId = String(match.key);
                                targetInstance = plex;
                                break;
                            }
                        } catch {}
                    }
                }

                if (targetSectionId && targetInstance) {
                    const cleanUrl = targetInstance.url.replace(/\/$/, '');
                    try {
                        await axios.get(`${cleanUrl}/library/sections/${targetSectionId}/refresh`, {
                            headers: { 'X-Plex-Token': targetInstance.api_key },
                            timeout: 10000
                        });
                        refreshed.push({ instance: targetInstance.name || 'Plex', sectionId: targetSectionId, title: lib.name });
                        return NextResponse.json({
                            success: true,
                            message: `Plex library "${lib.name}" scan triggered`,
                            refreshed
                        });
                    } catch (e: any) {
                        return NextResponse.json({ error: `Plex scan failed: ${e.message}` }, { status: 502 });
                    }
                }

                // If not in Plex, local cache was cleared anyway
                return NextResponse.json({
                    success: true,
                    message: `Cleared local cache for "${lib.name}". No direct Plex section mapping found.`,
                    refreshed: []
                });
            }
        }

        // 3. Scan by explicit sectionId
        if (sectionId) {
            const plex = plexInstances.find(p => (instanceId && p.id === instanceId)) || plexInstances[0];
            const cleanUrl = plex.url.replace(/\/$/, '');
            try {
                await axios.get(`${cleanUrl}/library/sections/${sectionId}/refresh`, {
                    headers: { 'X-Plex-Token': plex.api_key },
                    timeout: 10000
                });
                return NextResponse.json({
                    success: true,
                    message: `Plex section ${sectionId} scan triggered`,
                    refreshed: [{ instance: plex.name, sectionId }]
                });
            } catch (e: any) {
                return NextResponse.json({ error: `Plex section scan failed: ${e.message}` }, { status: 502 });
            }
        }

        return NextResponse.json({ error: 'No sectionId, libraryId, or all=true specified' }, { status: 400 });
    } catch (e: any) {
        console.error('API /plex/scan error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const sectionId = searchParams.get('sectionId');
    const libraryId = searchParams.get('libraryId');
    const all = searchParams.get('all') === 'true';
    const instanceId = searchParams.get('instanceId');

    const fakeReq = new Request(req.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, libraryId, all, instanceId })
    });
    return POST(fakeReq);
}

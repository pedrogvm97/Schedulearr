import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const instances = getInstances().filter(i => i.enabled);
        
        let plexLibraries: any[] = [];
        let radarrFolders: any[] = [];
        let sonarrFolders: any[] = [];

        // 1. Fetch Plex Sections
        const plexInstances = instances.filter(i => i.type === 'plex');
        for (const plex of plexInstances) {
            try {
                const res = await axios.get(`${plex.url}/library/sections`, {
                    headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                    timeout: 6000
                });
                const dirs = res.data?.MediaContainer?.Directory || [];
                const dirList = Array.isArray(dirs) ? dirs : [dirs].filter(Boolean);

                for (const d of dirList) {
                    const rawLocs = d.Location || d.location || [];
                    const locList = Array.isArray(rawLocs) ? rawLocs : [rawLocs].filter(Boolean);
                    const locations: string[] = locList.map((l: any) => l.path || l['@_path']).filter(Boolean);

                    const sectionType = d.type || 'movie';
                    const mediaType = sectionType === 'movie' ? 'movie' :
                                      sectionType === 'show' ? 'show' :
                                      (sectionType === 'artist' || sectionType === 'music') ? 'music' :
                                      sectionType === 'photo' ? 'photo' : 'other';

                    plexLibraries.push({
                        instanceId: plex.id,
                        instanceName: plex.name,
                        sectionKey: String(d.key),
                        title: d.title || 'Plex Library',
                        plexType: sectionType,
                        mediaType,
                        locations: locations.length > 0 ? locations : ['/media'],
                        count: d.count || 0,
                        exists: locations.some(p => fs.existsSync(p))
                    });
                }
            } catch (err: any) {
                console.error(`Failed to fetch Plex libraries for ${plex.name}:`, err.message);
            }
        }

        // 2. Fetch Radarr Root Folders
        const radarrInstances = instances.filter(i => i.type === 'radarr');
        for (const radarr of radarrInstances) {
            try {
                const res = await axios.get(`${radarr.url}/api/v3/rootfolder`, {
                    headers: { 'X-Api-Key': radarr.api_key },
                    timeout: 5000
                });
                if (Array.isArray(res.data)) {
                    for (const rf of res.data) {
                        if (rf.path) {
                            radarrFolders.push({
                                instanceId: radarr.id,
                                instanceName: radarr.name,
                                title: `${radarr.name} (${rf.path})`,
                                mediaType: 'movie',
                                path: rf.path,
                                freeSpace: rf.freeSpace || 0,
                                exists: fs.existsSync(rf.path)
                            });
                        }
                    }
                }
            } catch (err: any) {
                console.error(`Failed to fetch Radarr folders for ${radarr.name}:`, err.message);
            }
        }

        // 3. Fetch Sonarr Root Folders
        const sonarrInstances = instances.filter(i => i.type === 'sonarr');
        for (const sonarr of sonarrInstances) {
            try {
                const res = await axios.get(`${sonarr.url}/api/v3/rootfolder`, {
                    headers: { 'X-Api-Key': sonarr.api_key },
                    timeout: 5000
                });
                if (Array.isArray(res.data)) {
                    for (const rf of res.data) {
                        if (rf.path) {
                            sonarrFolders.push({
                                instanceId: sonarr.id,
                                instanceName: sonarr.name,
                                title: `${sonarr.name} (${rf.path})`,
                                mediaType: 'show',
                                path: rf.path,
                                freeSpace: rf.freeSpace || 0,
                                exists: fs.existsSync(rf.path)
                            });
                        }
                    }
                }
            } catch (err: any) {
                console.error(`Failed to fetch Sonarr folders for ${sonarr.name}:`, err.message);
            }
        }

        // 4. Common Host Mount Points on Linux / Docker
        const commonPaths = [
            '/mnt/user/data/media',
            '/mnt/user/data',
            '/mnt/user/appdata',
            '/media',
            '/movies',
            '/tv',
            '/shows',
            '/music',
            '/photos',
            '/data',
            '/data/media'
        ];
        const accessibleMounts = commonPaths.filter(p => fs.existsSync(p));

        return NextResponse.json({
            plex: plexLibraries,
            radarr: radarrFolders,
            sonarr: sonarrFolders,
            commonMounts: accessibleMounts
        });
    } catch (error: any) {
        console.error('API /theater/sources error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

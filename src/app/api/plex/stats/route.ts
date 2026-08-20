import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const instances = getInstances().filter(i => i.type === 'plex');

        if (instances.length === 0) {
            return NextResponse.json({ stats: [] });
        }

        const libraryStats: any[] = [];

        for (const plex of instances) {
            try {
                const res = await axios.get(`${plex.url}/library/sections`, {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'Accept': 'application/json'
                    },
                    timeout: 5000
                });

                const directories = res.data?.MediaContainer?.Directory || [];
                
                for (const dir of directories) {
                    const locations: string[] = (dir.Location || []).map((l: any) => l.path).filter(Boolean);
                    libraryStats.push({
                        instanceName: plex.name,
                        instanceId: plex.id,
                        id: dir.key,
                        title: dir.title,
                        type: dir.type, // 'movie', 'show', 'artist', etc.
                        language: dir.language,
                        locations,
                        count: dir.count || 0,
                        createdAt: dir.createdAt,
                        updatedAt: dir.updatedAt
                    });
                }
            } catch (err) {
                console.error(`Failed to fetch stats for ${plex.name}:`, err);
            }
        }

        return NextResponse.json({ stats: libraryStats });
    } catch (error) {
        console.error('API /plex/stats error:', error);
        return NextResponse.json({ error: 'Failed to fetch Plex stats' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const instances = getInstances().filter(i => i.type === 'plex');

        if (instances.length === 0) {
            return NextResponse.json({ history: [] });
        }

        const allHistory: any[] = [];

        for (const plex of instances) {
            try {
                // Fetch recent history
                const res = await axios.get(`${plex.url}/status/sessions/history/all`, {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'Accept': 'application/json'
                    },
                    timeout: 5000,
                    params: {
                        sort: 'viewedAt:desc',
                        limit: 50
                    }
                });

                const metadata = res.data?.MediaContainer?.Metadata || [];

                metadata.forEach((item: any) => {
                    let poster = item.thumb || item.parentThumb || item.grandparentThumb || '';
                    if (poster && !poster.startsWith('http')) {
                        poster = `${plex.url}${poster}?X-Plex-Token=${plex.api_key}`;
                    }

                    allHistory.push({
                        id: item.historyKey || item.ratingKey || Math.random().toString(),
                        instanceName: plex.name,
                        title: item.title,
                        seriesTitle: item.grandparentTitle,
                        seasonNumber: item.parentIndex,
                        episodeNumber: item.index,
                        mediaType: item.type === 'episode' ? 'series' : 'movie',
                        poster,
                        viewedAt: item.viewedAt * 1000, // Convert to JS ms
                        user: {
                            name: item.accountID === 1 ? 'Admin' : (item.User?.title || item.User?.name || 'Local User'),
                            thumb: item.User?.thumb || null
                        },
                        player: {
                            title: item.Player?.title || item.Player?.product || item.Player?.device || 'Plex Client',
                            platform: item.Player?.platform || item.Player?.device || 'Unknown'
                        }
                    });
                });
            } catch (err) {
                console.error(`Failed to fetch history for ${plex.name}:`, err);
            }
        }

        // Sort combined history across instances
        allHistory.sort((a, b) => b.viewedAt - a.viewedAt);

        return NextResponse.json({ history: allHistory.slice(0, 50) });
    } catch (error) {
        console.error('API /plex/history error:', error);
        return NextResponse.json({ error: 'Failed to fetch Plex history' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limitStr = searchParams.get('limit') || '500';
        const limit = parseInt(limitStr, 10);

        const instances = getInstances().filter(i => i.type === 'plex');

        if (instances.length === 0) {
            return NextResponse.json({ history: [] });
        }

        const allHistory: any[] = [];

        for (const plex of instances) {
            try {
                // Fetch history
                const res = await axios.get(`${plex.url}/status/sessions/history/all`, {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'Accept': 'application/json'
                    },
                    timeout: 8000,
                    params: {
                        sort: 'viewedAt:desc',
                        limit: limit
                    }
                });

                const metadata = res.data?.MediaContainer?.Metadata || [];

                metadata.forEach((item: any) => {
                    let poster = item.thumb || item.parentThumb || item.grandparentThumb || '';
                    if (poster && !poster.startsWith('http')) {
                        poster = `${plex.url}${poster}?X-Plex-Token=${plex.api_key}`;
                    }

                    // Determine media type
                    let mediaType = item.type === 'episode' ? 'series' : 'movie';
                    if (item.type === 'livetv' || item.type === 'channel') {
                        mediaType = 'livetv';
                    }

                    // Plex /history/all does not return duration/viewOffset natively.
                    // If missing, provide reasonable estimates so watch time charts function.
                    let durationMs = item.duration || 0;
                    if (!durationMs) {
                        if (mediaType === 'movie') durationMs = 120 * 60 * 1000; // 2 hours
                        else if (mediaType === 'series') durationMs = 45 * 60 * 1000; // 45 mins
                        else durationMs = 30 * 60 * 1000; // 30 mins
                    }
                    let viewOffsetMs = item.viewOffset || durationMs; // Assume fully watched if in history

                    allHistory.push({
                        id: item.historyKey || item.ratingKey || Math.random().toString(),
                        instanceName: plex.name,
                        title: item.title,
                        seriesTitle: item.grandparentTitle,
                        seasonNumber: item.parentIndex,
                        episodeNumber: item.index,
                        mediaType,
                        poster,
                        viewedAt: item.viewedAt * 1000, // Convert to JS ms
                        durationMs,
                        viewOffsetMs,
                        user: {
                            name: item.User?.title || item.User?.name || `User ${item.accountID}`,
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

        return NextResponse.json({ history: allHistory.slice(0, limit) });
    } catch (error) {
        console.error('API /plex/history error:', error);
        return NextResponse.json({ error: 'Failed to fetch Plex history' }, { status: 500 });
    }
}

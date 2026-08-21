import { NextResponse } from 'next/server';
import { getInstances, getPlaybackHistory } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limitStr = searchParams.get('limit') || '500';
        const limit = parseInt(limitStr, 10);

        const localHistory = getPlaybackHistory(limit);
        const instances = getInstances().filter(i => i.type === 'plex');

        if (instances.length === 0) {
            return NextResponse.json({ history: localHistory });
        }

        const allHistory: any[] = [...localHistory];
        let plexUsers: Record<string, {name: string, thumb: string | null}> = {};

        for (const plex of instances) {
            // Fetch friendly names from plex.tv if we have a token
            if (Object.keys(plexUsers).length === 0 && plex.api_key) {
                try {
                    // Fetch owner info
                    const ownerRes = await axios.get('https://plex.tv/api/v2/user', {
                        headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                        timeout: 5000,
                        validateStatus: () => true
                    });
                    if (ownerRes.status === 200 && ownerRes.data?.id) {
                        plexUsers[String(ownerRes.data.id)] = { 
                            name: ownerRes.data.title || ownerRes.data.username || 'Admin', 
                            thumb: ownerRes.data.thumb || null 
                        };
                        // Also map local ID 1 to admin just in case Plex local history uses 1
                        plexUsers['1'] = { 
                            name: ownerRes.data.title || ownerRes.data.username || 'Admin', 
                            thumb: ownerRes.data.thumb || null 
                        };
                    }

                    // Fetch friends
                    const tvRes = await axios.get('https://plex.tv/api/users', {
                        headers: { 'X-Plex-Token': plex.api_key },
                        timeout: 5000,
                        validateStatus: () => true
                    });
                    if (tvRes.status === 200 && typeof tvRes.data === 'string') {
                        const users = tvRes.data.split('<User ').slice(1);
                        for (const u of users) {
                            const idMatch = u.match(/id="([^"]+)"/);
                            const titleMatch = u.match(/title="([^"]+)"/) || u.match(/username="([^"]+)"/);
                            const thumbMatch = u.match(/thumb="([^"]+)"/);
                            if (idMatch && titleMatch) {
                                plexUsers[idMatch[1]] = { name: titleMatch[1], thumb: thumbMatch ? thumbMatch[1] : null };
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to map plex.tv users');
                }
            }

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
                        const plexUrlBase = plex.url.endsWith('/') ? plex.url.slice(0, -1) : plex.url;
                        poster = `/api/proxy?url=${encodeURIComponent(plexUrlBase + poster + '?X-Plex-Token=' + plex.api_key)}`;
                    }

                    // Determine media type
                    let mediaType = item.type === 'episode' ? 'series' : 'movie';
                    if (item.type === 'livetv' || item.type === 'channel') {
                        mediaType = 'livetv';
                    } else if (item.type === 'track') {
                        mediaType = 'track';
                    }

                    // Plex /history/all does not return duration/viewOffset natively.
                    // If missing, provide reasonable estimates so watch time charts function.
                    let durationMs = item.duration || 0;
                    if (!durationMs) {
                        if (mediaType === 'movie') durationMs = 120 * 60 * 1000; // 2 hours
                        else if (mediaType === 'series') durationMs = 45 * 60 * 1000; // 45 mins
                        else if (mediaType === 'track') durationMs = 3 * 60 * 1000; // 3 mins
                        else durationMs = 30 * 60 * 1000; // 30 mins
                    }
                    let viewOffsetMs = item.viewOffset || durationMs; // Assume fully watched if in history

                    const knownUser = item.accountID ? plexUsers[String(item.accountID)] : null;
                    allHistory.push({
                        id: item.historyKey || item.ratingKey || Math.random().toString(),
                        instanceName: plex.name,
                        title: item.title,
                        type: item.type,
                        mediaType,
                        seriesTitle: item.grandparentTitle,
                        seasonNumber: item.parentIndex,
                        episodeNumber: item.index,
                        poster,
                        viewedAt: item.viewedAt ? item.viewedAt * 1000 : Date.now(),
                        durationMs,
                        viewOffsetMs,
                        user: {
                            name: knownUser?.name || item.User?.title || item.User?.name || `User ${item.accountID}`,
                            thumb: knownUser?.thumb || item.User?.thumb || null
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

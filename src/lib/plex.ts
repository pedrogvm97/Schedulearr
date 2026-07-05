import axios from 'axios';

export interface PlexSession {
    id: string;
    title: string;
    user: string;
    player: string;
    bandwidth: number; // in kbps
}

export const getPlexSessions = async (url: string, token: string): Promise<PlexSession[]> => {
    try {
        const response = await axios.get(`${url}/status/sessions`, {
            headers: {
                'X-Plex-Token': token,
                'Accept': 'application/json'
            }
        });

        const activeSessions = response.data.MediaContainer.Metadata || [];
        return activeSessions.map((s: any) => ({
            id: s.sessionKey,
            title: s.title || s.grandparentTitle || 'Unknown',
            user: s.User?.title || 'Unknown',
            player: s.Player?.product || 'Unknown',
            bandwidth: s.Session?.bandwidth || 0
        }));
    } catch (error) {
        console.error(`Error fetching Plex sessions (${url}):`, error);
        return [];
    }
};

export async function getPlexWatchStatusMap(url: string, token: string): Promise<Map<string, boolean>> {
    const watchMap = new Map<string, boolean>();
    try {
        const sectionsRes = await axios.get(`${url.replace(/\/$/, '')}/library/sections`, {
            headers: { 'X-Plex-Token': token, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        const sections = sectionsRes.data?.MediaContainer?.Directory || [];
        for (const sec of sections) {
            const secId = sec.key;
            const itemsRes = await axios.get(`${url.replace(/\/$/, '')}/library/sections/${secId}/all`, {
                headers: { 'X-Plex-Token': token, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(8000)
            });
            const items = itemsRes.data?.MediaContainer?.Metadata || [];
            for (const item of items) {
                // viewCount > 0 means it has been watched/played
                const isWatched = (item.viewCount || 0) > 0;
                
                // Match by title + year
                if (item.title) {
                    const key = `${item.title.toLowerCase()}-${item.year || ''}`;
                    watchMap.set(key, isWatched);
                }
                
                // Match by tmdb/tvdb if Guid matches are present
                if (item.Guid) {
                    for (const g of item.Guid) {
                        if (g.id) watchMap.set(g.id.toLowerCase(), isWatched);
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error fetching Plex watch status:', e);
    }
    return watchMap;
}

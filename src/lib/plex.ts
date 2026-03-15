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

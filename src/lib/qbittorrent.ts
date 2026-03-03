import axios from 'axios';

export interface QbittorrentTorrent {
    hash: string;
    name: string;
    size: number;
    progress: number;
    dlspeed: number;
    upspeed: number;
    priority: number;
    num_seeds: number;
    num_leechs: number;
    num_incomplete: number;
    ratio: number;
    eta: number;
    state: string; // downloading, pausedUP, pausedDL, queuedUP, queuedDL, uploading, stalledUP, stalledDL, checkingUP, checkingDL, downloading, etc.
    seq_dl: boolean;
    f_l_piece_prio: boolean;
    category: string;
    super_seeding: boolean;
    force_start: boolean;
    added_on: number;
}

/**
 * Authenticate with qBittorrent and return the session cookie.
 */
export const authenticateQbittorrent = async (url: string, credentials: string): Promise<string> => {
    // credentials format is username:password from the db api_key field
    const [username, password] = credentials.split(':');
    if (!username || !password) {
        throw new Error('Invalid qBittorrent credentials format. Expected username:password');
    }

    try {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        // qBittorrent uses application/x-www-form-urlencoded
        const response = await axios.post(`${url}/api/v2/auth/login`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // qBittorrent sometimes requires an Origin or Referer header to accept the login, we mock it via the URL
                'Referer': url
            }
        });

        // The cookie is returned in the set-cookie header
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader && Array.isArray(setCookieHeader)) {
            const sidCookie = setCookieHeader.find(c => c.startsWith('SID='));
            if (sidCookie) {
                return sidCookie.split(';')[0]; // Return just the "SID=xxxxx" part
            }
        }

        throw new Error('Authentication failed: No session cookie returned.');
    } catch (error) {
        console.error(`Error authenticating with qBittorrent at ${url}:`, error);
        throw error;
    }
};

/**
 * Fetch all active torrents from qBittorrent
 */
export const getActiveTorrents = async (url: string, cookie: string): Promise<QbittorrentTorrent[]> => {
    try {
        const response = await axios.get(`${url}/api/v2/sync/maindata`, {
            headers: {
                'Cookie': cookie
            }
        });

        // The maindata endpoint returns an object of torrents keyed by hash
        const torrentsMap = response.data.torrents || {};

        // Convert map to array and inject the hash into the object
        const torrents: QbittorrentTorrent[] = Object.keys(torrentsMap).map(hash => ({
            hash,
            ...torrentsMap[hash]
        }));

        return torrents;
    } catch (error) {
        console.error(`Error fetching torrents from qBittorrent at ${url}:`, error);
        throw error;
    }
};

/**
 * Delete torrents from qBittorrent. 
 * @param deleteFiles true to also delete the downloaded data payload.
 */
export const deleteTorrents = async (url: string, cookie: string, hashes: string[], deleteFiles: boolean = false): Promise<void> => {
    try {
        const params = new URLSearchParams();
        params.append('hashes', hashes.join('|'));
        params.append('deleteFiles', deleteFiles.toString());

        await axios.post(`${url}/api/v2/torrents/delete`, params, {
            headers: {
                'Cookie': cookie,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    } catch (error) {
        console.error(`Error deleting torrents from qBittorrent at ${url}:`, error);
        throw error;
    }
};

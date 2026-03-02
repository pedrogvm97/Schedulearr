import axios from 'axios';

// Interfaces for Sonarr API responses
export interface SonarrEpisode {
    seriesId: number;
    episodeFileId: number;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    id: number;
    hasFile: boolean;
    monitored: boolean;
    airDateUtc: string;
}

export interface SonarrSeries {
    title: string;
    id: number;
    added: string;
    status: string;
    monitored: boolean;
    nextAiring?: string;
    previousAiring?: string;
    statistics?: {
        episodeFileCount: number;
        episodeCount: number;
        totalEpisodeCount: number;
        sizeOnDisk: number;
        percentOfEpisodes: number;
    };
    episodes?: SonarrEpisode[];
    genres?: string[];
    qualityProfileId: number;
}

export interface SonarrQualityProfile {
    id: number;
    name: string;
}

// Fetch all series with their statistics
export const getAllSeries = async (url: string, apiKey: string): Promise<SonarrSeries[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/series`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching all series from Sonarr (${url}):`, error);
        return [];
    }
};

// Fetch all missing episodes and map them to their series titles
export const getQueue = async (url: string, apiKey: string): Promise<any[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/queue`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data.records || [];
    } catch (error) {
        console.error(`Error fetching Sonarr queue (${url}):`, error);
        return [];
    }
};

// Function to fetch download grab history
export const getGrabHistory = async (url: string, apiKey: string, limit: number = 500): Promise<any[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/history`, {
            headers: { 'X-Api-Key': apiKey },
            params: {
                page: 1,
                pageSize: limit,
                sortKey: 'date',
                sortDirection: 'descending',
                eventType: 1 // 1 = Grabbed
            }
        });
        return response.data.records || [];
    } catch (error) {
        console.error(`Error fetching Sonarr grab history (${url}):`, error);
        return [];
    }
};

export interface MissingEpisode extends SonarrEpisode {
    seriesTitle: string;
    seriesAdded: string;
}

// Fetch all missing episodes and map them to their series titles
export const getMissingEpisodes = async (url: string, apiKey: string): Promise<MissingEpisode[]> => {
    try {
        // 1. Fetch missing episodes
        // We use the wanted/missing endpoint to let Sonarr do the heavy lifting
        const wantedResponse = await axios.get(`${url}/api/v3/wanted/missing`, {
            headers: { 'X-Api-Key': apiKey },
            params: {
                page: 1,
                pageSize: 1000,
                sortKey: 'airDateUtc',
                sortDir: 'desc'
            }
        });

        const episodes: SonarrEpisode[] = wantedResponse.data.records;

        if (episodes.length === 0) return [];

        // 2. Fetch series list to map IDs to Names and Added Dates
        const seriesResponse = await axios.get(`${url}/api/v3/series`, {
            headers: { 'X-Api-Key': apiKey }
        });
        const seriesList: SonarrSeries[] = seriesResponse.data;

        // Create a dictionary for quick lookup O(1)
        const seriesMap = new Map<number, SonarrSeries>();
        seriesList.forEach(s => seriesMap.set(s.id, s));

        // 3. Map episodes to include series info
        return episodes.map(ep => {
            const series = seriesMap.get(ep.seriesId);
            return {
                ...ep,
                seriesTitle: series ? series.title : 'Unknown Series',
                seriesAdded: series ? series.added : new Date().toISOString()
            };
        });

    } catch (error) {
        console.error(`Error fetching from Sonarr (${url}):`, error);
        return [];
    }
};

// Function to trigger a search for specific episodes on a Sonarr instance
export const triggerEpisodeSearch = async (url: string, apiKey: string, episodeIds: number[]): Promise<boolean> => {
    if (episodeIds.length === 0) return true;

    try {
        console.log(`📺 [SONARR] Triggering search for episode IDs: ${episodeIds.join(', ')}`);
        const response = await axios.post(`${url}/api/v3/command`, {
            name: 'EpisodeSearch',
            episodeIds: episodeIds
        }, {
            headers: { 'X-Api-Key': apiKey }
        });

        if (response.status === 201) {
            console.log(`✅ [SONARR] Search command accepted successfully.`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error triggering search on Sonarr (${url}):`, error);
        return false;
    }
};

// Function to get Quality Profiles
export const getQualityProfiles = async (url: string, apiKey: string): Promise<SonarrQualityProfile[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/qualityprofile`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching Sonarr Quality Profiles (${url}):`, error);
        return [];
    }
};

// Check queue for a specific episode ID
export const getEpisodeQueueStatus = async (url: string, apiKey: string, episodeId: number): Promise<string | null> => {
    try {
        const response = await axios.get(`${url}/api/v3/queue`, {
            headers: { 'X-Api-Key': apiKey },
            params: { episodeId }
        });
        const records = response.data.records;
        if (records && records.length > 0) {
            const match = records.find((r: any) => r.episodeId === episodeId);
            if (match) return match.status; // e.g., 'downloading', 'completed', 'delay'
        }
        return null; // Not in queue (could be already imported or not grabbed)
    } catch (error) {
        console.error(`Error fetching queue from Sonarr (${url}):`, error);
        return null;
    }
};


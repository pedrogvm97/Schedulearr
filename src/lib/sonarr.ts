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
        const response = await axios.post(`${url}/api/v3/command`, {
            name: 'EpisodeSearch',
            episodeIds: episodeIds
        }, {
            headers: { 'X-Api-Key': apiKey }
        });

        return response.status === 201;
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

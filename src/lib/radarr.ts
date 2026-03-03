import axios from 'axios';

// Interfaces for Radarr API responses
export interface RadarrMovie {
    title: string;
    id: number;
    monitored: boolean;
    hasFile: boolean;
    added: string;
    sizeOnDisk: number;
    status: string; // 'released', 'inCinemas', etc.
    isAvailable: boolean;
    inCinemas?: string;
    physicalRelease?: string;
    digitalRelease?: string;
    genres: string[];
    qualityProfileId: number;
    movieFile?: {
        size: number;
        quality: {
            quality: {
                name: string;
                resolution: number;
            }
        }
    };
}

export interface RadarrQualityProfile {
    id: number;
    name: string;
}

// Function to fetch all movies
export const getAllMovies = async (url: string, apiKey: string): Promise<RadarrMovie[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/movie`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching all movies from Radarr (${url}):`, error);
        return [];
    }
};

// Function to fetch missing movies from a single Radarr instance
export const getMissingMovies = async (url: string, apiKey: string): Promise<RadarrMovie[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/movie`, {
            headers: { 'X-Api-Key': apiKey },
            params: { unmonitored: false }
        });

        const allMovies: RadarrMovie[] = response.data;

        // Filter for movies that are monitored, don't have a file, and are considered "available"
        const missing = allMovies.filter(movie =>
            movie.monitored &&
            !movie.hasFile &&
            movie.isAvailable
        );

        return missing;
    } catch (error) {
        console.error(`Error fetching from Radarr (${url}):`, error);
        return [];
    }
};

// Function to fetch active queue (downloading/importing)
export const getQueue = async (url: string, apiKey: string): Promise<any[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/queue`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data.records || [];
    } catch (error) {
        console.error(`Error fetching Radarr queue (${url}):`, error);
        return [];
    }
};

// Function to fetch download grab history (includes Grabs, Imports, and Failures for rich status)
export const getGrabHistory = async (url: string, apiKey: string, limit: number = 500): Promise<any[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/history`, {
            headers: { 'X-Api-Key': apiKey },
            params: {
                page: 1,
                pageSize: limit,
                sortKey: 'date',
                sortDirection: 'descending'
                // Removed eventType: 1 to fetch all (Grabs, Imports, etc.)
            }
        });
        return response.data.records || [];
    } catch (error) {
        console.error(`Error fetching Radarr grab history (${url}):`, error);
        return [];
    }
};

// Function to trigger a search for specific movies on a Radarr instance
export const triggerMovieSearch = async (url: string, apiKey: string, movieIds: number[]): Promise<boolean> => {
    if (movieIds.length === 0) return true;

    try {
        console.log(`🎬 [RADARR] Triggering search for movie IDs: ${movieIds.join(', ')}`);
        const response = await axios.post(`${url}/api/v3/command`, {
            name: 'MoviesSearch',
            movieIds: movieIds
        }, {
            headers: { 'X-Api-Key': apiKey }
        });

        if (response.status === 201) {
            console.log(`✅ [RADARR] Search command accepted successfully.`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error triggering search on Radarr (${url}):`, error);
        return false;
    }
};

// Function to get Quality Profiles
export const getQualityProfiles = async (url: string, apiKey: string): Promise<RadarrQualityProfile[]> => {
    try {
        const response = await axios.get(`${url}/api/v3/qualityprofile`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching Radarr Quality Profiles (${url}):`, error);
        return [];
    }
};

// Check queue for a specific movie ID
export const getMovieQueueStatus = async (url: string, apiKey: string, movieId: number): Promise<string | null> => {
    try {
        const response = await axios.get(`${url}/api/v3/queue`, {
            headers: { 'X-Api-Key': apiKey },
            params: { movieId }
        });
        const records = response.data.records;
        if (records && records.length > 0) {
            const match = records.find((r: any) => r.movieId === movieId);
            if (match) return match.status; // e.g., 'downloading', 'completed', 'delay'
        }
        return null;
    } catch (error) {
        console.error(`Error fetching queue from Radarr (${url}):`, error);
        return null;
    }
};

// Function to delete an item from the Radarr queue (and optionally blocklist/remove from client)
export const deleteFromQueue = async (url: string, apiKey: string, queueId: number, removeFromClient: boolean = true, blocklist: boolean = true): Promise<boolean> => {
    try {
        const response = await axios.delete(`${url}/api/v3/queue/${queueId}`, {
            headers: { 'X-Api-Key': apiKey },
            params: { removeFromClient, blocklist }
        });
        return response.status === 200;
    } catch (error) {
        console.error(`Error deleting from Radarr queue (${url}):`, error);
        return false;
    }
};
// Function to delete a movie file
export const deleteMovieFile = async (url: string, apiKey: string, movieFileId: number): Promise<boolean> => {
    try {
        const response = await axios.delete(`${url}/api/v3/moviefile/${movieFileId}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.status === 200;
    } catch (error) {
        console.error(`Error deleting movie file from Radarr (${url}):`, error);
        return false;
    }
};

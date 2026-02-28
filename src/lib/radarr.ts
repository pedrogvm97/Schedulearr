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
}

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

// Function to trigger a search for specific movies on a Radarr instance
export const triggerMovieSearch = async (url: string, apiKey: string, movieIds: number[]): Promise<boolean> => {
    if (movieIds.length === 0) return true;

    try {
        const response = await axios.post(`${url}/api/v3/command`, {
            name: 'MoviesSearch',
            movieIds: movieIds
        }, {
            headers: { 'X-Api-Key': apiKey }
        });

        return response.status === 201;
    } catch (error) {
        console.error(`Error triggering search on Radarr (${url}):`, error);
        return false;
    }
};

import axios from 'axios';

const BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBResult {
    id: number;
    title?: string;
    name?: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average: number;
    popularity: number;
    media_type?: 'movie' | 'tv';
    genre_ids: number[];
}

export const getTrending = async (apiKey: string, type: 'movie' | 'tv', timeWindow: 'day' | 'week' = 'day'): Promise<TMDBResult[]> => {
    try {
        const response = await axios.get(`${BASE_URL}/trending/${type === 'movie' ? 'movie' : 'tv'}/${timeWindow}`, {
            params: { api_key: apiKey }
        });
        return response.data.results || [];
    } catch (error) {
        console.error(`TMDB getTrending error (${type}):`, error);
        return [];
    }
};

export const searchTMDB = async (apiKey: string, query: string, type: 'movie' | 'tv'): Promise<TMDBResult[]> => {
    try {
        const response = await axios.get(`${BASE_URL}/search/${type === 'movie' ? 'movie' : 'tv'}`, {
            params: {
                api_key: apiKey,
                query: query
            }
        });
        return response.data.results || [];
    } catch (error) {
        console.error(`TMDB search error (${type}):`, error);
        return [];
    }
};

export const getTMDBDetails = async (apiKey: string, id: number, type: 'movie' | 'tv'): Promise<any> => {
    try {
        const response = await axios.get(`${BASE_URL}/${type === 'movie' ? 'movie' : 'tv'}/${id}`, {
            params: {
                api_key: apiKey,
                append_to_response: 'external_ids'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`TMDB getDetails error (${id}):`, error);
        return null;
    }
};

export const TMDB_PROVIDERS: Record<string, number> = {
    'Netflix': 8,
    'HBO': 118,
    'Disney+': 337,
    'Amazon': 9,
    'Apple TV+': 350,
    'Hulu': 15,
    'Paramount+': 531,
    'Peacock': 386
};

export const discoverTMDB = async (apiKey: string, type: 'movie' | 'tv', providerId?: number): Promise<TMDBResult[]> => {
    try {
        const params: any = {
            api_key: apiKey,
            sort_by: 'popularity.desc',
            include_adult: false,
            include_video: false,
            page: 1,
            watch_region: 'US'
        };

        if (providerId) {
            params.with_watch_providers = providerId;
        }

        const response = await axios.get(`${BASE_URL}/discover/${type === 'movie' ? 'movie' : 'tv'}`, { params });
        return response.data.results || [];
    } catch (error) {
        console.error(`TMDB discover error (${type}):`, error);
        return [];
    }
};

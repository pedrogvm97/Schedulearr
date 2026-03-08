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

export interface TMDBPaginatedResponse {
    results: TMDBResult[];
    total_pages: number;
    total_results: number;
}

export const getTrending = async (apiKey: string, type: 'movie' | 'tv', timeWindow: 'day' | 'week' = 'day', page: number = 1): Promise<TMDBPaginatedResponse> => {
    try {
        const response = await axios.get(`${BASE_URL}/trending/${type === 'movie' ? 'movie' : 'tv'}/${timeWindow}`, {
            params: { api_key: apiKey, page }
        });
        return {
            results: response.data.results || [],
            total_pages: response.data.total_pages || 1,
            total_results: response.data.total_results || 0
        };
    } catch (error) {
        console.error(`TMDB getTrending error (${type}):`, error);
        return { results: [], total_pages: 0, total_results: 0 };
    }
};

export const searchTMDB = async (apiKey: string, query: string, type: 'movie' | 'tv', page: number = 1): Promise<TMDBPaginatedResponse> => {
    try {
        const response = await axios.get(`${BASE_URL}/search/${type === 'movie' ? 'movie' : 'tv'}`, {
            params: {
                api_key: apiKey,
                query: query,
                page
            }
        });
        return {
            results: response.data.results || [],
            total_pages: response.data.total_pages || 1,
            total_results: response.data.total_results || 0
        };
    } catch (error) {
        console.error(`TMDB search error (${type}):`, error);
        return { results: [], total_pages: 0, total_results: 0 };
    }
};

export const getTMDBDetails = async (apiKey: string, id: number, type: 'movie' | 'tv' | 'person'): Promise<any> => {
    try {
        const response = await axios.get(`${BASE_URL}/${type === 'tv' ? 'tv' : type}/${id}`, {
            params: {
                api_key: apiKey,
                append_to_response: 'external_ids,combined_credits,images'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`TMDB getDetails error (${id}):`, error);
        return null;
    }
};

export const getPersonCredits = async (apiKey: string, personId: number): Promise<any> => {
    try {
        const response = await axios.get(`${BASE_URL}/person/${personId}/combined_credits`, {
            params: { api_key: apiKey }
        });
        return response.data;
    } catch (error) {
        console.error(`TMDB getPersonCredits error (${personId}):`, error);
        return null;
    }
};

export const TMDB_PROVIDERS: Record<string, string | number> = {
    'Netflix': 8,
    'HBO': '118|1899|384', // HBO, Max, HBO Max
    'Disney+': 337,
    'Amazon': '119|9|10', // Prime Video, Amazon Video
    'Apple TV+': 350,
    'Hulu': 15,
    'Paramount+': 531,
    'Peacock': 386
};

export const TMDB_GENRES: Record<string, number> = {
    'Action': 28,
    'Adventure': 12,
    'Animation': 16,
    'Comedy': 35,
    'Crime': 80,
    'Documentary': 99,
    'Drama': 18,
    'Family': 10751,
    'Fantasy': 14,
    'History': 36,
    'Horror': 27,
    'Music': 10402,
    'Mystery': 9648,
    'Romance': 10749,
    'Science Fiction': 878,
    'Sci-Fi & Fantasy': 10765, // TV only
    'TV Movie': 10770,
    'Thriller': 53,
    'War': 10752,
    'Western': 37,
    'Action & Adventure': 10759, // TV only
    'Kids': 10762,
    'News': 10763,
    'Reality': 10764,
    'Soap': 10766,
    'Talk': 10767,
    'War & Politics': 10768
};

export const TMDB_REVERSE_GENRES: Record<number, string> = Object.entries(TMDB_GENRES).reduce((acc, [name, id]) => {
    acc[id] = name;
    return acc;
}, {} as Record<number, string>);

export const discoverTMDB = async (apiKey: string, type: 'movie' | 'tv', providerId?: string | number, genreId?: number, minRating: number = 0, page: number = 1): Promise<TMDBPaginatedResponse> => {
    try {
        const params: any = {
            api_key: apiKey,
            sort_by: 'popularity.desc',
            include_adult: false,
            include_video: false,
            page: page,
            watch_region: 'US',
            watch_monetization_types: 'flatrate|free'
        };

        if (providerId) {
            params.with_watch_providers = providerId;
        }

        if (genreId) {
            params.with_genres = genreId;
        }

        if (minRating > 0) {
            params['vote_average.gte'] = minRating;
            // Relax vote count requirement for high ratings to ensure results for specific providers/genres
            params['vote_count.gte'] = minRating >= 8 ? 20 : 50;
        }

        const response = await axios.get(`${BASE_URL}/discover/${type === 'movie' ? 'movie' : 'tv'}`, { params });
        return {
            results: response.data.results || [],
            total_pages: response.data.total_pages || 1,
            total_results: response.data.total_results || 0
        };
    } catch (error) {
        console.error(`TMDB discover error (${type}):`, error);
        return { results: [], total_pages: 0, total_results: 0 };
    }
};

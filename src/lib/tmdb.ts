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

// Streamlined unified genre list
export const UNIFIED_GENRES: Record<string, { movie?: number; tv?: number }> = {
    'Action': { movie: 28, tv: 10759 },
    'Adventure': { movie: 12, tv: 10759 },
    'Animation': { movie: 16, tv: 16 },
    'Anime': { movie: 16, tv: 16 }, // Special case: handled with origin_country=JP
    'Comedy': { movie: 35, tv: 35 },
    'Crime': { movie: 80, tv: 80 },
    'Documentary': { movie: 99, tv: 99 },
    'Drama': { movie: 18, tv: 18 },
    'Family': { movie: 10751, tv: 10751 },
    'Fantasy': { movie: 14, tv: 10765 },
    'History': { movie: 36, tv: undefined },
    'Horror': { movie: 27, tv: undefined },
    'Music': { movie: 10402, tv: undefined },
    'Mystery': { movie: 9648, tv: 9648 },
    'Romance': { movie: 10749, tv: 10749 },
    'Sci-Fi': { movie: 878, tv: 10765 },
    'Science Fiction': { movie: 878, tv: 10765 },
    'Thriller': { movie: 53, tv: undefined },
    'War': { movie: 10752, tv: 10768 },
    'Western': { movie: 37, tv: 37 },
    'Talk': { movie: undefined, tv: 10767 },
    'Reality': { movie: undefined, tv: 10764 }
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
    'Sci-Fi & Fantasy': 10765,
    'TV Movie': 10770,
    'Thriller': 53,
    'War': 10752,
    'Western': 37,
    'Action & Adventure': 10759,
    'Kids': 10762,
    'News': 10763,
    'Reality': 10764,
    'Soap': 10766,
    'Talk': 10767,
    'War & Politics': 10768
};

export const TMDB_REVERSE_GENRES: Record<number, string> = {
    ...Object.entries(TMDB_GENRES).reduce((acc, [name, id]) => {
        acc[id] = name;
        return acc;
    }, {} as Record<number, string>),
    // Ensure "Sci-Fi & Fantasy" is mapped back to "Sci-Fi" for consistent UI
    10765: 'Sci-Fi',
    878: 'Sci-Fi',
    10759: 'Action & Adventure',
    10768: 'War'
};

export const discoverTMDB = async (apiKey: string, type: 'movie' | 'tv', providerId?: string | number, genre?: string, minRating: number = 0, year?: string, page: number = 1): Promise<TMDBPaginatedResponse> => {
    try {
        const params: any = {
            api_key: apiKey,
            sort_by: 'popularity.desc',
            include_adult: false,
            include_video: false,
            page: page,
        };

        if (providerId) {
            params.watch_region = 'US';
            params.watch_monetization_types = 'flatrate|free|ads|rent|buy';
            params.with_watch_providers = providerId;

            // For Apple TV+ (350), if searching for future/unscheduled content (2025+), 
            // use company ID (2553) instead of watch provider to ensure result density.
            if ((providerId === 350 || providerId === '350') && year && parseInt(year) >= 2025) {
                delete params.with_watch_providers;
                params.with_companies = 2553;
                delete params.watch_region;
                delete params.watch_monetization_types;
            }
        }

        if (genre) {
            if (genre === 'Anime') {
                params.with_genres = 16;
                params.with_origin_country = 'JP';
                // Don't restrict by region/monetization for anime as it's often globally licensed differently
            } else {
                const mapping = UNIFIED_GENRES[genre];
                const genreIdForType = type === 'movie' ? mapping?.movie : mapping?.tv;
                if (genreIdForType) {
                    params.with_genres = genreIdForType;
                }
            }
        }

        if (year && year !== 'All') {
            if (type === 'movie') {
                params.primary_release_year = year;
            } else {
                params.first_air_date_year = year;
            }
        }

        if (minRating > 0) {
            params['vote_average.gte'] = minRating;
            // Relax vote count requirement significantly for high ratings
            // This ensures we get high quality results even if they aren't "mainstream" blockbusters
            params['vote_count.gte'] = minRating >= 9 ? 2 : minRating >= 8.5 ? 5 : minRating >= 8 ? 10 : 20;
        }

        const response = await axios.get(`${BASE_URL}/discover/${type === 'movie' ? 'movie' : 'tv'}`, { params });

        let results = response.data.results || [];

        return {
            results: results,
            total_pages: response.data.total_pages || 1,
            total_results: response.data.total_results || 0
        };
    } catch (error) {
        console.error(`TMDB discover error (${type}):`, error);
        return { results: [], total_pages: 0, total_results: 0 };
    }
};

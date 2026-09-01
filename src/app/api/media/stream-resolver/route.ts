import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const TMDB_DEFAULT_KEY = '45dbdd59a37121e50c890834ba73055e';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const imdbId = (searchParams.get('imdbId') || '').trim();
        const tmdbId = (searchParams.get('tmdbId') || '').trim();
        const mediaType = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
        const season = parseInt(searchParams.get('season') || '1', 10);
        const episode = parseInt(searchParams.get('episode') || '1', 10);

        let resolvedImdbId = imdbId;
        let resolvedTmdbId = tmdbId;

        // Resolve TMDB ID <-> IMDb ID if one is missing
        if (!resolvedImdbId && resolvedTmdbId) {
            try {
                const endpoint = mediaType === 'tv'
                    ? `https://api.themoviedb.org/3/tv/${resolvedTmdbId}/external_ids?api_key=${TMDB_DEFAULT_KEY}`
                    : `https://api.themoviedb.org/3/movie/${resolvedTmdbId}/external_ids?api_key=${TMDB_DEFAULT_KEY}`;
                const extRes = await axios.get(endpoint, { timeout: 4000 });
                if (extRes.data?.imdb_id) resolvedImdbId = extRes.data.imdb_id;
            } catch {}
        } else if (resolvedImdbId && !resolvedTmdbId) {
            try {
                const findRes = await axios.get(`https://api.themoviedb.org/3/find/${encodeURIComponent(resolvedImdbId)}?api_key=${TMDB_DEFAULT_KEY}&external_source=imdb_id`, {
                    timeout: 4000
                });
                if (mediaType === 'tv' && findRes.data?.tv_results?.length > 0) {
                    resolvedTmdbId = findRes.data.tv_results[0].id.toString();
                } else if (findRes.data?.movie_results?.length > 0) {
                    resolvedTmdbId = findRes.data.movie_results[0].id.toString();
                }
            } catch {}
        }

        if (!resolvedImdbId && !resolvedTmdbId) {
            return NextResponse.json({
                available: false,
                message: 'No IMDb or TMDB ID available to resolve stream',
                sources: []
            });
        }

        // Multi-tier Embed & Stream Resolvers
        const sources: Array<{ name: string; url: string; type: 'embed' | 'direct'; quality: string }> = [];

        if (mediaType === 'movie') {
            if (resolvedImdbId) {
                sources.push({
                    name: 'VidSrc (IMDb Fast)',
                    url: `https://vidsrc.to/embed/movie/${resolvedImdbId}`,
                    type: 'embed',
                    quality: '1080p'
                });
                sources.push({
                    name: 'AutoEmbed (IMDb Mirror)',
                    url: `https://autoembed.to/movie/imdb/${resolvedImdbId}`,
                    type: 'embed',
                    quality: '1080p'
                });
                sources.push({
                    name: '2Embed (IMDb Server)',
                    url: `https://www.2embed.cc/embed/${resolvedImdbId}`,
                    type: 'embed',
                    quality: '1080p'
                });
            }
            if (resolvedTmdbId) {
                sources.push({
                    name: 'Embed.su (TMDB Multi-Audio)',
                    url: `https://embed.su/embed/movie/${resolvedTmdbId}`,
                    type: 'embed',
                    quality: '1080p'
                });
                sources.push({
                    name: 'SuperEmbed (TMDB)',
                    url: `https://multiembed.mov/?video_id=${resolvedTmdbId}&tmdb=1`,
                    type: 'embed',
                    quality: '1080p'
                });
            }
        } else {
            // TV Show / Episode
            if (resolvedImdbId) {
                sources.push({
                    name: 'VidSrc (IMDb TV)',
                    url: `https://vidsrc.to/embed/tv/${resolvedImdbId}/${season}/${episode}`,
                    type: 'embed',
                    quality: '1080p'
                });
                sources.push({
                    name: 'AutoEmbed (IMDb TV)',
                    url: `https://autoembed.to/tv/imdb/${resolvedImdbId}/${season}/${episode}`,
                    type: 'embed',
                    quality: '1080p'
                });
                sources.push({
                    name: '2Embed (IMDb TV)',
                    url: `https://www.2embed.cc/embedtv/${resolvedImdbId}&s=${season}&e=${episode}`,
                    type: 'embed',
                    quality: '1080p'
                });
            }
            if (resolvedTmdbId) {
                sources.push({
                    name: 'Embed.su (TMDB Episode)',
                    url: `https://embed.su/embed/tv/${resolvedTmdbId}/${season}/${episode}`,
                    type: 'embed',
                    quality: '1080p'
                });
                sources.push({
                    name: 'SuperEmbed (TMDB TV)',
                    url: `https://multiembed.mov/?video_id=${resolvedTmdbId}&tmdb=1&s=${season}&e=${episode}`,
                    type: 'embed',
                    quality: '1080p'
                });
            }
        }

        return NextResponse.json({
            available: sources.length > 0,
            mediaType,
            imdbId: resolvedImdbId,
            tmdbId: resolvedTmdbId,
            season: mediaType === 'tv' ? season : undefined,
            episode: mediaType === 'tv' ? episode : undefined,
            defaultSource: sources[0]?.url || '',
            sources
        });
    } catch (error: any) {
        console.error('API /media/stream-resolver error:', error.message);
        return NextResponse.json({ available: false, error: error.message, sources: [] }, { status: 500 });
    }
}

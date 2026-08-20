import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const sectionId = searchParams.get('sectionId');
        const instanceName = searchParams.get('instanceName');
        const instanceId = searchParams.get('instanceId');

        if (!sectionId) {
            return NextResponse.json({ error: 'Missing sectionId' }, { status: 400 });
        }

        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        let plex = plexInstances.find(i => (instanceId && i.id === instanceId) || (instanceName && i.name === instanceName));
        if (!plex && plexInstances.length > 0) {
            plex = plexInstances[0];
        }

        if (!plex) {
            return NextResponse.json({ error: 'No active Plex instance found' }, { status: 404 });
        }

        const plexUrlBase = plex.url.endsWith('/') ? plex.url.slice(0, -1) : plex.url;

        // Fetch section metadata and all items
        const res = await axios.get(`${plexUrlBase}/library/sections/${sectionId}/all`, {
            headers: {
                'X-Plex-Token': plex.api_key,
                'Accept': 'application/json'
            },
            timeout: 12000
        });

        const container = res.data?.MediaContainer || {};
        const metadata = container.Metadata || [];

        const items = metadata.map((item: any) => {
            let poster = item.thumb || item.parentThumb || item.grandparentThumb || '';
            if (poster && !poster.startsWith('http')) {
                poster = `/api/proxy?url=${encodeURIComponent(plexUrlBase + poster + '?X-Plex-Token=' + plex.api_key)}`;
            }

            // Extract IDs from Guid array if present
            let tmdbId: number | undefined;
            let tvdbId: number | undefined;
            let imdbId: string | undefined;

            if (Array.isArray(item.Guid)) {
                for (const g of item.Guid) {
                    const idStr = g.id || '';
                    if (idStr.startsWith('tmdb://')) {
                        const parsed = parseInt(idStr.replace('tmdb://', ''), 10);
                        if (!isNaN(parsed)) tmdbId = parsed;
                    } else if (idStr.startsWith('tvdb://')) {
                        const parsed = parseInt(idStr.replace('tvdb://', ''), 10);
                        if (!isNaN(parsed)) tvdbId = parsed;
                    } else if (idStr.startsWith('imdb://')) {
                        imdbId = idStr.replace('imdb://', '');
                    }
                }
            }

            // Also check root item.guid
            if (!tmdbId && item.guid?.includes('themoviedb://')) {
                const match = item.guid.match(/themoviedb:\/\/(\d+)/);
                if (match) tmdbId = parseInt(match[1], 10);
            }
            if (!tvdbId && item.guid?.includes('thetvdb://')) {
                const match = item.guid.match(/thetvdb:\/\/(\d+)/);
                if (match) tvdbId = parseInt(match[1], 10);
            }

            // Extract file path and size if available
            const filePath = item.Media?.[0]?.Part?.[0]?.file || '';
            const sizeOnDisk = item.Media?.[0]?.Part?.[0]?.size || 0;

            const isMovie = item.type === 'movie';
            const isShow = item.type === 'show';

            return {
                id: item.ratingKey,
                ratingKey: item.ratingKey,
                title: item.title,
                year: item.year || (item.originallyAvailableAt ? parseInt(item.originallyAvailableAt.split('-')[0], 10) : 0),
                type: isMovie ? 'movie' : isShow ? 'series' : item.type,
                summary: item.summary,
                duration: item.duration,
                poster,
                tmdbId,
                tvdbId,
                imdbId,
                filePath,
                sizeOnDisk,
                hasFile: true,
                addedAt: item.addedAt
            };
        });

        return NextResponse.json({
            sectionTitle: container.title1 || container.librarySectionTitle,
            sectionType: container.viewGroup || container.librarySectionViewGroup,
            totalSize: container.totalSize || items.length,
            items
        });
    } catch (error: any) {
        console.error('API /plex/section error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch Plex section items' }, { status: 500 });
    }
}

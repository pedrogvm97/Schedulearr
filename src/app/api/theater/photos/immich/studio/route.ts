import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';
import path from 'path';

export const dynamic = 'force-dynamic';

interface CacheEntry {
    data: any;
    timestamp: number;
}

let overviewCache: { [instanceId: string]: CacheEntry } = {};

function mapImmichAssetsToTheaterItems(rawAssets: any[], immich: any) {
    return (rawAssets || []).map((asset: any) => {
        const isVideo = asset.type === 'VIDEO';
        const title = asset.originalFileName || `Photo ${asset.id.slice(0, 8)}`;
        return {
            id: `immich-${asset.id}`,
            assetId: asset.id,
            name: asset.originalFileName,
            title: title,
            path: asset.originalPath || asset.originalFileName,
            folder: asset.originalPath ? path.dirname(asset.originalPath) : 'Immich',
            category: isVideo ? 'video' : 'photo',
            extension: asset.originalFileName ? path.extname(asset.originalFileName).replace('.', '').toUpperCase() : (isVideo ? 'MP4' : 'JPG'),
            sizeBytes: asset.exifInfo?.fileSizeInByte || 0,
            width: asset.width,
            height: asset.height,
            duration: asset.duration,
            modifiedAt: asset.fileModifiedAt || asset.updatedAt,
            addedAt: asset.fileCreatedAt || asset.createdAt,
            posterUrl: `/api/theater/photos/immich/asset?id=${asset.id}&size=preview&instanceId=${immich.id}`,
            streamUrl: `/api/theater/photos/immich/asset?id=${asset.id}&size=original&instanceId=${immich.id}`,
            libraryId: `immich-${immich.id}`,
            libraryName: immich.name || 'Immich',
            libraryType: 'photos',
            source: 'Immich',
            isImmich: true,
            city: asset.exifInfo?.city || null,
            country: asset.exifInfo?.country || null,
            dateTimeOriginal: asset.exifInfo?.dateTimeOriginal || null
        };
    });
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action') || 'overview';
        const instanceId = searchParams.get('instanceId');
        const force = searchParams.get('force') === 'true';

        const instances = getInstances();
        const immich = instanceId
            ? instances.find(i => i.type === 'immich' && i.id === instanceId)
            : instances.find(i => i.type === 'immich' && i.enabled);

        if (!immich || !immich.api_key) {
            return NextResponse.json({ error: 'Immich instance not configured' }, { status: 404 });
        }

        const cleanUrl = immich.url.replace(/\/$/, '');
        const headers = {
            'x-api-key': immich.api_key,
            'Content-Type': 'application/json'
        };

        // ── 1. ALBUM ASSETS ──
        if (action === 'album_assets') {
            const albumId = searchParams.get('albumId');
            if (!albumId) return NextResponse.json({ error: 'albumId required' }, { status: 400 });

            const res = await axios.post(`${cleanUrl}/api/search/metadata`, {
                albumId,
                isArchived: false,
                isTrashed: false,
                take: 500
            }, { headers, timeout: 20000 });

            const rawItems = res.data?.assets?.items || [];
            const mapped = mapImmichAssetsToTheaterItems(rawItems, immich);
            return NextResponse.json({ success: true, count: mapped.length, items: mapped });
        }

        // ── 2. PERSON ASSETS ──
        if (action === 'person_assets') {
            const personId = searchParams.get('personId');
            if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 });

            const res = await axios.post(`${cleanUrl}/api/search/metadata`, {
                personIds: [personId],
                isArchived: false,
                isTrashed: false,
                take: 500
            }, { headers, timeout: 20000 });

            const rawItems = res.data?.assets?.items || [];
            const mapped = mapImmichAssetsToTheaterItems(rawItems, immich);
            return NextResponse.json({ success: true, count: mapped.length, items: mapped });
        }

        // ── 3. PLACE / CITY ASSETS ──
        if (action === 'place_assets') {
            const city = searchParams.get('city');
            const country = searchParams.get('country');
            const payload: any = {
                isArchived: false,
                isTrashed: false,
                take: 500
            };
            if (city) payload.city = city;
            if (country) payload.country = country;

            const res = await axios.post(`${cleanUrl}/api/search/metadata`, payload, { headers, timeout: 20000 });
            const rawItems = res.data?.assets?.items || [];
            const mapped = mapImmichAssetsToTheaterItems(rawItems, immich);
            return NextResponse.json({ success: true, count: mapped.length, items: mapped });
        }

        // ── 4. RAW MAP MARKERS ──
        if (action === 'markers') {
            const res = await axios.get(`${cleanUrl}/api/map/markers`, { headers, timeout: 15000 });
            return NextResponse.json({ success: true, markers: res.data || [] });
        }

        // ── 5. STUDIO OVERVIEW (ALBUMS + PEOPLE + PLACES) ──
        const now = Date.now();
        const cached = overviewCache[immich.id];
        if (!force && cached && (now - cached.timestamp < 45000)) {
            return NextResponse.json(cached.data);
        }

        const [albumsRes, peopleRes, markersRes] = await Promise.all([
            axios.get(`${cleanUrl}/api/albums`, { headers, timeout: 10000 }).catch(() => ({ data: [] })),
            axios.get(`${cleanUrl}/api/people`, { headers, timeout: 10000 }).catch(() => ({ data: [] })),
            axios.get(`${cleanUrl}/api/map/markers`, { headers, timeout: 15000 }).catch(() => ({ data: [] }))
        ]);

        // Format Albums
        const rawAlbums = Array.isArray(albumsRes.data) ? albumsRes.data : [];
        const albums = rawAlbums.map((a: any) => ({
            id: a.id,
            name: a.albumName || 'Untitled Album',
            description: a.description || '',
            assetCount: a.assetCount || 0,
            thumbnailAssetId: a.albumThumbnailAssetId || null,
            coverUrl: a.albumThumbnailAssetId
                ? `/api/theater/photos/immich/asset?id=${a.albumThumbnailAssetId}&size=preview&instanceId=${immich.id}`
                : null,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            isShared: Boolean(a.shared)
        }));

        // Format People
        const rawPeople = Array.isArray(peopleRes.data) ? peopleRes.data : (peopleRes.data?.people || []);
        const people = rawPeople
            .filter((p: any) => !p.isHidden)
            .map((p: any) => ({
                id: p.id,
                name: p.name ? p.name.trim() : '',
                avatarUrl: `/api/theater/photos/immich/person?id=${p.id}&instanceId=${immich.id}`,
                isFavorite: Boolean(p.isFavorite),
                updatedAt: p.updatedAt
            }))
            .sort((a: any, b: any) => {
                // Named people first, then favorites, then alphabetical
                if (a.name && !b.name) return -1;
                if (!a.name && b.name) return 1;
                if (a.isFavorite && !b.isFavorite) return -1;
                if (!a.isFavorite && b.isFavorite) return 1;
                return (a.name || '').localeCompare(b.name || '');
            });

        // Group Map Markers into Places
        const rawMarkers = Array.isArray(markersRes.data) ? markersRes.data : [];
        const placeDict: { [key: string]: { name: string; country: string; count: number; sampleAssetId: string; lat: number; lon: number } } = {};

        for (const m of rawMarkers) {
            const locName = m.city || m.state || m.country;
            if (!locName) continue;
            const key = `${locName}__${m.country || ''}`.toLowerCase();
            if (!placeDict[key]) {
                placeDict[key] = {
                    name: locName,
                    country: m.country || '',
                    count: 0,
                    sampleAssetId: m.id,
                    lat: m.lat,
                    lon: m.lon
                };
            }
            placeDict[key].count++;
        }

        const places = Object.values(placeDict)
            .sort((a, b) => b.count - a.count)
            .slice(0, 40)
            .map(p => ({
                ...p,
                coverUrl: `/api/theater/photos/immich/asset?id=${p.sampleAssetId}&size=preview&instanceId=${immich.id}`
            }));

        const overviewData = {
            success: true,
            instance: {
                id: immich.id,
                name: immich.name,
                url: cleanUrl
            },
            albumsCount: albums.length,
            peopleCount: people.length,
            placesCount: places.length,
            totalGeotaggedCount: rawMarkers.length,
            albums,
            people,
            places
        };

        overviewCache[immich.id] = {
            data: overviewData,
            timestamp: Date.now()
        };

        return NextResponse.json(overviewData);
    } catch (e: any) {
        const status = e.response?.status || 500;
        return NextResponse.json({ error: e.message || 'Failed to query Immich Studio' }, { status });
    }
}

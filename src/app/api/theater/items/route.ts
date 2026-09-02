import { NextResponse } from 'next/server';
import { getTheaterLibraries, getInstances, getCachedTheaterItems, saveCachedTheaterItems } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.wmv']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma']);
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']);

function scanDirectory(dirPath: string, maxDepth = 8, currentDepth = 0): any[] {
    if (currentDepth > maxDepth || !fs.existsSync(dirPath)) return [];

    let items: any[] = [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== '$RECYCLE.BIN' && entry.name !== 'node_modules') {
                    items.push(...scanDirectory(fullPath, maxDepth, currentDepth + 1));
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                let mediaCategory: 'video' | 'audio' | 'photo' | null = null;

                if (VIDEO_EXTS.has(ext)) mediaCategory = 'video';
                else if (AUDIO_EXTS.has(ext)) mediaCategory = 'audio';
                else if (PHOTO_EXTS.has(ext)) mediaCategory = 'photo';

                if (mediaCategory) {
                    try {
                        const stat = fs.statSync(fullPath);
                        const cleanTitle = path.basename(entry.name, ext)
                            .replace(/[._]/g, ' ')
                            .replace(/\b(1080p|720p|2160p|4k|hdr|bluray|web-dl|x264|x265|hevc|aac|flac)\b/gi, '')
                            .trim();

                        let posterUrl: string | undefined = undefined;
                        let artist: string | undefined = undefined;
                        let album: string | undefined = undefined;

                        if (mediaCategory === 'audio') {
                            album = path.basename(dirPath);
                            const parentDir = path.dirname(dirPath);
                            artist = path.basename(parentDir);

                            // Auto-detect local companion album cover
                            for (const coverName of ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'album.jpg', 'albumart.jpg']) {
                                const coverPath = path.join(dirPath, coverName);
                                if (fs.existsSync(coverPath)) {
                                    posterUrl = `/api/theater/stream?path=${encodeURIComponent(coverPath)}`;
                                    break;
                                }
                            }
                        }

                        items.push({
                            id: Buffer.from(fullPath).toString('base64'),
                            name: entry.name,
                            title: cleanTitle || entry.name,
                            path: fullPath,
                            folder: path.basename(dirPath),
                            artist,
                            album,
                            category: mediaCategory,
                            extension: ext.replace('.', '').toUpperCase(),
                            sizeBytes: stat.size,
                            modifiedAt: stat.mtime.toISOString(),
                            addedAt: (stat.birthtime && stat.birthtime.getTime() > 0 ? stat.birthtime : (stat.ctime || stat.mtime)).toISOString(),
                            posterUrl,
                            streamUrl: `/api/theater/stream?path=${encodeURIComponent(fullPath)}`
                        });
                    } catch {
                        // ignore unreadable file
                    }
                }
            }
        }
    } catch (e) {
        console.error(`Error reading directory ${dirPath}:`, e);
    }
    return items;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');
        const browsePath = searchParams.get('browsePath');
        const refresh = searchParams.get('refresh') === 'true';

        // ── 1. Directory Browser ──
        if (browsePath !== null) {
            let targetDir = browsePath;
            if (!targetDir) {
                if (fs.existsSync('/media')) targetDir = '/media';
                else if (fs.existsSync('/data')) targetDir = '/data';
                else targetDir = process.platform === 'win32' ? 'C:\\' : '/';
            }

            if (!fs.existsSync(targetDir)) {
                return NextResponse.json({ folders: [], currentPath: targetDir, error: 'Path does not exist on server' });
            }

            try {
                const entries = fs.readdirSync(targetDir, { withFileTypes: true });
                const folders = entries
                    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
                    .map(e => ({
                        name: e.name,
                        path: path.join(targetDir, e.name)
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name));

                const parent = path.dirname(targetDir);
                return NextResponse.json({
                    folders,
                    currentPath: targetDir,
                    parentPath: parent !== targetDir ? parent : null
                });
            } catch (e: any) {
                return NextResponse.json({ error: e.message, folders: [] }, { status: 400 });
            }
        }

        const showRatingKey = searchParams.get('showRatingKey') || searchParams.get('ratingKey');

        // ── 2. On-Demand Show Episodes Fetching ──
        if (showRatingKey) {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            let episodes: any[] = [];

            for (const plex of plexInstances) {
                try {
                    const plexUrl = plex.url.replace(/\/$/, '');
                    const epRes = await axios.get(`${plexUrl}/library/metadata/${showRatingKey}/allLeaves`, {
                        headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                        timeout: 10000
                    });

                    const metadata = epRes.data?.MediaContainer?.Metadata || [];
                    for (const item of metadata) {
                        const part = item.Media?.[0]?.Part?.[0];
                        const partKey = part?.key || '';
                        const rawThumb = item.thumb || item.parentThumb || item.grandparentThumb || '';
                        const thumb = rawThumb && !rawThumb.endsWith('/-1') && rawThumb !== '-1' ? rawThumb : '';
                        const posterUrl = thumb ? `/api/proxy?url=${encodeURIComponent(`${plexUrl}${thumb}?X-Plex-Token=${plex.api_key}`)}` : undefined;

                        episodes.push({
                            id: `plex-ep-${item.ratingKey || item.key}`,
                            name: item.title,
                            title: item.title,
                            seriesTitle: item.grandparentTitle,
                            showTitle: item.grandparentTitle,
                            seasonNumber: item.parentIndex !== undefined ? item.parentIndex : 1,
                            episodeNumber: item.index !== undefined ? item.index : 1,
                            durationMs: item.duration,
                            category: 'video',
                            extension: part?.container ? part.container.toUpperCase() : 'VIDEO',
                            sizeBytes: part?.size || 0,
                            modifiedAt: item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString(),
                            addedAt: item.addedAt ? new Date(item.addedAt * 1000).toISOString() : new Date().toISOString(),
                            posterUrl,
                            streamUrl: partKey ? `/api/theater/stream?plexPart=${encodeURIComponent(partKey)}&instanceId=${plex.id}&ratingKey=${encodeURIComponent(item.ratingKey)}&localPath=${encodeURIComponent(part?.file || '')}` : ''
                        });
                    }

                    if (episodes.length > 0) break;
                } catch (e: any) {
                    console.error('Failed to fetch show episodes:', e.message);
                }
            }

            return NextResponse.json({
                showRatingKey,
                episodes,
                total: episodes.length
            });
        }

        // ── 3. Scan / Fetch Items in Library ──
        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libraries = getTheaterLibraries();
        const lib = libraries.find(l => l.id === libraryId);

        if (!lib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        // Check local SQLite cache first for instant (<5ms) responses
        if (!refresh) {
            const cached = getCachedTheaterItems(libraryId);
            if (cached && cached.items && cached.items.length > 0) {
                return NextResponse.json({
                    library: lib,
                    items: cached.items,
                    total: cached.items.length,
                    cached: true,
                    cachedAt: cached.updatedAt
                });
            }
        }

        let allItems: any[] = [];
        let folderList: string[] = [];
        try {
            if (typeof lib.folders === 'string') {
                folderList = JSON.parse(lib.folders);
            } else if (Array.isArray(lib.folders)) {
                folderList = lib.folders;
            }
        } catch {
            folderList = [];
        }

        // A. Attempt local filesystem scan
        for (const folder of folderList) {
            if (fs.existsSync(folder)) {
                allItems.push(...scanDirectory(folder, 8));
            }
        }

        // B. If local scan returned 0 items (e.g. Docker container volume isolation) or linked to Plex:
        if (allItems.length === 0) {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            
            for (const plex of plexInstances) {
                try {
                    const plexUrl = plex.url.replace(/\/$/, '');
                    let targetSectionId = lib.plex_section_id;

                    // If no explicit section ID, search Plex sections by name or folder match
                    if (!targetSectionId) {
                        const secRes = await axios.get(`${plexUrl}/library/sections`, {
                            headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                            timeout: 5000
                        });
                        const dirs = secRes.data?.MediaContainer?.Directory || [];
                        const match = dirs.find((d: any) => {
                            const nameMatch = d.title.toLowerCase() === lib.name.toLowerCase();
                            const locs = (d.Location || []).map((l: any) => l.path);
                            const locMatch = folderList.some((f: string) => locs.includes(f));
                            return nameMatch || locMatch;
                        });
                        if (match) {
                            targetSectionId = String(match.key);
                        }
                    }

                    if (targetSectionId) {
                        const isMusic = lib.type === 'music';
                        const endpoint = isMusic 
                            ? `${plexUrl}/library/sections/${targetSectionId}/all?type=10`
                            : `${plexUrl}/library/sections/${targetSectionId}/all`;

                        let itemsRes;
                        try {
                            itemsRes = await axios.get(endpoint, {
                                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                timeout: 10000
                            });
                        } catch (err: any) {
                            itemsRes = await axios.get(`${plexUrl}/library/sections/${targetSectionId}/all`, {
                                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                timeout: 10000
                            });
                        }

                        let metadata = itemsRes.data?.MediaContainer?.Metadata || [];
                        if (isMusic && metadata.length === 0) {
                            try {
                                const fallbackRes = await axios.get(`${plexUrl}/library/sections/${targetSectionId}/all`, {
                                    headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                    timeout: 10000
                                });
                                metadata = fallbackRes.data?.MediaContainer?.Metadata || [];
                            } catch {}
                        }

                        for (const item of metadata) {
                            const part = item.Media?.[0]?.Part?.[0];
                            const partKey = part?.key || '';
                            const rawThumb = item.thumb || item.parentThumb || item.grandparentThumb || '';
                            const thumb = rawThumb && !rawThumb.endsWith('/-1') && rawThumb !== '-1' ? rawThumb : '';
                            const posterUrl = thumb ? `/api/proxy?url=${encodeURIComponent(`${plexUrl}${thumb}?X-Plex-Token=${plex.api_key}`)}` : undefined;

                            let mediaCategory: 'video' | 'audio' | 'photo' = 'video';
                            if (lib.type === 'music' || item.type === 'artist' || item.type === 'track' || item.type === 'album') mediaCategory = 'audio';
                            else if (lib.type === 'photo' || item.type === 'photo') mediaCategory = 'photo';

                            const isShow = item.type === 'show' || lib.type === 'show';
                            const ratingKey = item.ratingKey || item.key || '';
                            const localFilePath = part?.file || '';

                            const defaultExt = isShow ? 'SERIES' : (mediaCategory === 'video' ? 'MKV' : (mediaCategory === 'audio' ? 'MP3' : 'FILE'));
                            const fileExt = part?.container 
                                ? part.container.toUpperCase() 
                                : (part?.file ? path.extname(part.file).replace('.', '').toUpperCase() : defaultExt);

                            allItems.push({
                                id: `plex-${item.ratingKey || item.key}`,
                                name: item.title,
                                title: item.title,
                                seriesTitle: isShow ? item.title : item.grandparentTitle,
                                showTitle: isShow ? item.title : item.grandparentTitle,
                                ratingKey: String(ratingKey),
                                isSeries: isShow,
                                seasonCount: item.childCount || 1,
                                episodeCount: item.leafCount || 0,
                                artist: mediaCategory === 'audio' ? (item.grandparentTitle || item.originalTitle || item.parentTitle || 'Unknown Artist') : undefined,
                                album: mediaCategory === 'audio' ? (item.parentTitle || 'Unknown Album') : undefined,
                                trackNumber: item.index,
                                durationMs: item.duration,
                                path: part?.file || item.title,
                                folder: isShow ? item.title : (item.parentTitle || lib.name),
                                category: mediaCategory,
                                extension: fileExt,
                                sizeBytes: part?.size || 0,
                                modifiedAt: item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString(),
                                addedAt: item.addedAt ? new Date(item.addedAt * 1000).toISOString() : (item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString()),
                                posterUrl,
                                streamUrl: partKey ? `/api/theater/stream?plexPart=${encodeURIComponent(partKey)}&instanceId=${plex.id}&ratingKey=${encodeURIComponent(ratingKey)}&localPath=${encodeURIComponent(localFilePath)}` : ''
                            });
                        }
                    }
                } catch (e: any) {
                    console.error('Failed to load Plex items:', e.message);
                }
            }
        }

        allItems.sort((a, b) => a.title.localeCompare(b.title));

        if (allItems.length > 0) {
            saveCachedTheaterItems(libraryId, allItems);
        }

        return NextResponse.json({
            library: lib,
            items: allItems,
            total: allItems.length,
            cached: false
        });
    } catch (error: any) {
        console.error('API /theater/items error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getTheaterLibraries, getInstances } from '@/lib/db';
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

        // ── 2. Scan Items in Library ──
        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libraries = getTheaterLibraries();
        const lib = libraries.find(l => l.id === libraryId);

        if (!lib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
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

                        let itemsRes = await axios.get(endpoint, {
                            headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                            timeout: 15000
                        });

                        let metadata = itemsRes.data?.MediaContainer?.Metadata || [];
                        if (isMusic && metadata.length === 0) {
                            // Try general fallback without type=10
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
                            const rawThumb = item.parentThumb || item.thumb || item.grandparentThumb || '';
                            const thumb = rawThumb && !rawThumb.endsWith('/-1') && rawThumb !== '-1' ? rawThumb : '';
                            const posterUrl = thumb ? `/api/proxy?url=${encodeURIComponent(`${plexUrl}${thumb}?X-Plex-Token=${plex.api_key}`)}` : undefined;

                            let mediaCategory: 'video' | 'audio' | 'photo' = 'video';
                            if (lib.type === 'music' || item.type === 'artist' || item.type === 'track' || item.type === 'album') mediaCategory = 'audio';
                            else if (lib.type === 'photo' || item.type === 'photo') mediaCategory = 'photo';

                            let displayTitle = item.title;
                            if (item.grandparentTitle && item.parentIndex !== undefined && item.index !== undefined && mediaCategory === 'video') {
                                displayTitle = `${item.grandparentTitle} - S${item.parentIndex}E${item.index} - ${item.title}`;
                            }

                            const artist = item.grandparentTitle || item.originalTitle || item.parentTitle || 'Unknown Artist';
                            const album = item.parentTitle || 'Unknown Album';

                            const ratingKey = item.ratingKey || item.key || '';
                            const localFilePath = part?.file || '';

                            allItems.push({
                                id: `plex-${item.ratingKey || item.key}`,
                                name: item.title,
                                title: displayTitle,
                                artist: mediaCategory === 'audio' ? artist : undefined,
                                album: mediaCategory === 'audio' ? album : undefined,
                                trackNumber: item.index,
                                durationMs: item.duration,
                                path: part?.file || item.title,
                                folder: item.grandparentTitle || item.parentTitle || lib.name,
                                category: mediaCategory,
                                extension: part?.container ? part.container.toUpperCase() : (part?.file ? path.extname(part.file).replace('.', '').toUpperCase() : 'AUDIO'),
                                sizeBytes: part?.size || 0,
                                modifiedAt: item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString(),
                                addedAt: item.addedAt ? new Date(item.addedAt * 1000).toISOString() : (item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString()),
                                posterUrl,
                                streamUrl: partKey ? `/api/theater/stream?plexPart=${encodeURIComponent(partKey)}&instanceId=${plex.id}&ratingKey=${encodeURIComponent(ratingKey)}&localPath=${encodeURIComponent(localFilePath)}` : ''
                            });
                        }
                    }
                } catch (e: any) {
                    console.error('Failed to load Plex items fallback:', e.message);
                }
            }
        }

        allItems.sort((a, b) => a.title.localeCompare(b.title));

        return NextResponse.json({
            library: lib,
            items: allItems,
            total: allItems.length
        });
    } catch (error: any) {
        console.error('API /theater/items error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

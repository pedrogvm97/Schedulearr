import { NextResponse } from 'next/server';
import { getTheaterLibraries, getInstances } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.wmv']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma']);
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']);

function scanDirectory(dirPath: string, maxDepth = 4, currentDepth = 0): any[] {
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

                        items.push({
                            id: Buffer.from(fullPath).toString('base64'),
                            name: entry.name,
                            title: cleanTitle || entry.name,
                            path: fullPath,
                            folder: path.basename(dirPath),
                            category: mediaCategory,
                            extension: ext.replace('.', '').toUpperCase(),
                            sizeBytes: stat.size,
                            modifiedAt: stat.mtime.toISOString(),
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
        const suggest = searchParams.get('suggest');

        // ── 1. Suggest Folder Paths from Plex & Arr Instances ──
        if (suggest === 'true') {
            const suggestions: Array<{ path: string; label: string; source: string; exists: boolean; mediaType?: string }> = [];
            const seenPaths = new Set<string>();

            const instances = getInstances().filter(i => i.enabled);

            // A. Fetch Plex Library Locations
            const plexInstances = instances.filter(i => i.type === 'plex');
            for (const plex of plexInstances) {
                try {
                    const res = await axios.get(`${plex.url}/library/sections`, {
                        headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                        timeout: 5000
                    });
                    const dirs = res.data?.MediaContainer?.Directory || [];
                    for (const d of (Array.isArray(dirs) ? dirs : [dirs])) {
                        const locs = (d.Location || []).map((l: any) => l.path).filter(Boolean);
                        for (const p of locs) {
                            if (!seenPaths.has(p)) {
                                seenPaths.add(p);
                                suggestions.push({
                                    path: p,
                                    label: `${plex.name}: ${d.title} (${d.type})`,
                                    source: 'plex',
                                    mediaType: d.type === 'movie' ? 'movie' : d.type === 'show' ? 'show' : d.type === 'artist' ? 'music' : d.type === 'photo' ? 'photo' : 'other',
                                    exists: fs.existsSync(p)
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Ignore Plex fetch errors
                }
            }

            // B. Fetch Radarr Root Folders
            const radarrInstances = instances.filter(i => i.type === 'radarr');
            for (const radarr of radarrInstances) {
                try {
                    const res = await axios.get(`${radarr.url}/api/v3/rootfolder`, {
                        headers: { 'X-Api-Key': radarr.api_key },
                        timeout: 5000
                    });
                    if (Array.isArray(res.data)) {
                        for (const rf of res.data) {
                            if (rf.path && !seenPaths.has(rf.path)) {
                                seenPaths.add(rf.path);
                                suggestions.push({
                                    path: rf.path,
                                    label: `${radarr.name}: Root Folder`,
                                    source: 'radarr',
                                    mediaType: 'movie',
                                    exists: fs.existsSync(rf.path)
                                });
                            }
                        }
                    }
                } catch {
                    // Ignore Radarr errors
                }
            }

            // C. Fetch Sonarr Root Folders
            const sonarrInstances = instances.filter(i => i.type === 'sonarr');
            for (const sonarr of sonarrInstances) {
                try {
                    const res = await axios.get(`${sonarr.url}/api/v3/rootfolder`, {
                        headers: { 'X-Api-Key': sonarr.api_key },
                        timeout: 5000
                    });
                    if (Array.isArray(res.data)) {
                        for (const rf of res.data) {
                            if (rf.path && !seenPaths.has(rf.path)) {
                                seenPaths.add(rf.path);
                                suggestions.push({
                                    path: rf.path,
                                    label: `${sonarr.name}: Root Folder`,
                                    source: 'sonarr',
                                    mediaType: 'show',
                                    exists: fs.existsSync(rf.path)
                                });
                            }
                        }
                    }
                } catch {
                    // Ignore Sonarr errors
                }
            }

            // D. Common Standard Media Mount Points
            const commonCheckPaths = [
                '/media', '/movies', '/tv', '/shows', '/music', '/photos', '/data', '/data/media',
                'D:\\Movies', 'D:\\TV', 'D:\\Media', 'E:\\Movies', 'E:\\TV', 'E:\\Media'
            ];
            for (const cp of commonCheckPaths) {
                if (fs.existsSync(cp) && !seenPaths.has(cp)) {
                    seenPaths.add(cp);
                    suggestions.push({
                        path: cp,
                        label: `Mounted Path: ${cp}`,
                        source: 'common',
                        exists: true
                    });
                }
            }

            return NextResponse.json({ suggestions });
        }

        // ── 2. Directory Browser ──
        if (browsePath !== null) {
            let targetDir = browsePath;
            if (!targetDir) {
                // If on Linux/Docker, default to / or /media if exists
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

        // ── 3. Scan Items in Library ──
        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const libraries = getTheaterLibraries();
        const lib = libraries.find(l => l.id === libraryId);

        if (!lib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        let allItems: any[] = [];
        for (const folder of lib.folders) {
            allItems.push(...scanDirectory(folder));
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

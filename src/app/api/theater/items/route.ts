import { NextResponse } from 'next/server';
import { getTheaterLibraries, getInstances, getCachedTheaterItems, saveCachedTheaterItems, clearCachedTheaterItems } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.wmv']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma', '.m4b']);
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']);

const GENERIC_FOLDER_OR_TAG_REGEX = /^(\[?unknown(\s+(album|artist|author|book|title))?\]?|various(\s+artists)?|audiobooks?|books?|spoken(\s+word)?|literature|music|audio|media|downloads?|torrents?|mnt|user|data|app|share|storage|library|root|singles?)$/i;

function isGenericOrUnknown(val?: string, libName?: string): boolean {
    if (!val) return true;
    const trimmed = val.trim();
    if (!trimmed || trimmed.length <= 1) return true;
    if (GENERIC_FOLDER_OR_TAG_REGEX.test(trimmed)) return true;
    if (libName && trimmed.toLowerCase() === libName.trim().toLowerCase()) return true;
    return false;
}

function stripChapterOrPartSuffix(raw: string): string {
    return raw
        .replace(/^(\d{1,3}[\s.\-_]+)+/, '')
        .replace(/[\s.\-_]*\b(chapter|ch|part|pt|track|trk|disc|cd|disk|book|vol|volume|section|episode|ep)\.?\s*\d+(\s*of\s*\d+)?\b.*$/i, '')
        .replace(/[\s.\-_]*\(\s*(unabridged|abridged|audiobook|part\s*\d+|ch\s*\d+)\s*\)/gi, '')
        .replace(/[\s.\-_]*\[\s*(unabridged|abridged|audiobook|part\s*\d+|ch\s*\d+)\s*\]/gi, '')
        .replace(/\s+\d{1,3}$/, '')
        .trim();
}

function deriveBookAndAuthor(
    cleanTitle: string,
    fullPath: string,
    libName?: string,
    rawArtist?: string,
    rawAlbum?: string
): { artist: string; album: string; chapterNumber?: number } {
    const normPath = (fullPath || '').replace(/\\/g, '/');
    const parts = normPath.split('/').filter(Boolean);
    // parts[parts.length - 1] is filename, parts[parts.length - 2] is parent dir, parts[parts.length - 3] is grandparent dir
    const parentDirName = parts.length >= 2 ? parts[parts.length - 2] : '';
    const grandParentDirName = parts.length >= 3 ? parts[parts.length - 3] : '';

    let artist = !isGenericOrUnknown(rawArtist, libName) ? rawArtist!.trim() : '';
    let album = !isGenericOrUnknown(rawAlbum, libName) ? rawAlbum!.trim() : '';

    // Check if parent folder is a chapter/CD subfolder (e.g. "CD 1", "Part 1")
    const isParentDiscFolder = /^(cd|disc|disk|part|pt|book)\s*\d+$/i.test(parentDirName.trim());
    const effectiveBookDir = isParentDiscFolder ? grandParentDirName : parentDirName;
    const effectiveAuthorDir = isParentDiscFolder ? (parts.length >= 4 ? parts[parts.length - 4] : '') : grandParentDirName;

    if (!album && !isGenericOrUnknown(effectiveBookDir, libName)) {
        album = effectiveBookDir.replace(/[._]/g, ' ').trim();
    }
    if (!artist && !isGenericOrUnknown(effectiveAuthorDir, libName)) {
        artist = effectiveAuthorDir.replace(/[._]/g, ' ').trim();
    }

    // Parse "Author - Book Title" from folder name if folder contains " - "
    if (album && album.includes(' - ') && (!artist || artist.toLowerCase() === album.toLowerCase())) {
        const segs = album.split(/\s+[-–—]\s+/);
        if (segs.length >= 2) {
            artist = segs[0].trim();
            album = stripChapterOrPartSuffix(segs.slice(1).join(' - ').trim()) || segs[1].trim();
        }
    }

    // Parse "Book Title by Author" from folder or title
    const byMatch = (album || cleanTitle).match(/^(.+?)\s+by\s+([A-Z][a-zA-Z.\s'-]{2,40})$/i);
    if (byMatch) {
        if (!album || isGenericOrUnknown(album, libName)) album = stripChapterOrPartSuffix(byMatch[1].trim());
        if (!artist) artist = byMatch[2].trim();
    }

    // If album or artist is still missing, parse from filename / cleanTitle (e.g., "Franz Kafka - The Trial - 01")
    if (!album || !artist) {
        const titleWithoutLeadingNum = cleanTitle.replace(/^(\d{1,3}[\s.\-_]+)/, '').trim();
        const dashSegs = titleWithoutLeadingNum.split(/\s+[-–—]\s+/).filter(Boolean);
        if (dashSegs.length >= 2) {
            if (!artist && isNaN(Number(dashSegs[0]))) {
                artist = dashSegs[0].trim();
            }
            if (!album) {
                const candidateBook = stripChapterOrPartSuffix(dashSegs[1].trim());
                album = candidateBook || dashSegs[1].trim();
            }
        }
    }

    if (!album) {
        const stripped = stripChapterOrPartSuffix(cleanTitle);
        album = stripped || cleanTitle || 'Audiobook';
    }
    if (!artist) {
        artist = 'Unknown Author';
    }

    // Extract track/chapter number if present
    let chapterNumber: number | undefined = undefined;
    const chMatch = cleanTitle.match(/(?:chapter|ch|part|pt|track)\s*(\d{1,3})/i) || cleanTitle.match(/^(\d{1,3})\b/);
    if (chMatch) {
        chapterNumber = parseInt(chMatch[1], 10);
    }

    return { artist, album, chapterNumber };
}

function scanDirectory(dirPath: string, maxDepth = 8, currentDepth = 0, lib?: any): any[] {
    if (currentDepth > maxDepth || !fs.existsSync(dirPath)) return [];

    let items: any[] = [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== '$RECYCLE.BIN' && entry.name !== 'node_modules') {
                    items.push(...scanDirectory(fullPath, maxDepth, currentDepth + 1, lib));
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
                        let trackNumber: number | undefined = undefined;
                        const isAudiobookItem = lib?.type === 'audiobooks' || ext === '.m4b';

                        if (mediaCategory === 'audio') {
                            const rawDirAlbum = path.basename(dirPath);
                            const parentDir = path.dirname(dirPath);
                            const rawDirArtist = path.basename(parentDir);

                            if (isAudiobookItem) {
                                const derived = deriveBookAndAuthor(cleanTitle, fullPath, lib?.name, rawDirArtist, rawDirAlbum);
                                artist = derived.artist;
                                album = derived.album;
                                trackNumber = derived.chapterNumber;
                            } else {
                                album = !isGenericOrUnknown(rawDirAlbum, lib?.name) ? rawDirAlbum : cleanTitle;
                                artist = !isGenericOrUnknown(rawDirArtist, lib?.name) ? rawDirArtist : 'Unknown Artist';
                            }

                            // Auto-detect local companion album/book cover
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
                            trackNumber,
                            isAudiobook: isAudiobookItem,
                            category: mediaCategory,
                            extension: ext.replace('.', '').toUpperCase(),
                            sizeBytes: stat.size,
                            modifiedAt: stat.mtime.toISOString(),
                            addedAt: (stat.birthtime && stat.birthtime.getTime() > 0 ? stat.birthtime : (stat.ctime || stat.mtime)).toISOString(),
                            posterUrl,
                            streamUrl: `/api/theater/stream?path=${encodeURIComponent(fullPath)}`,
                            libraryId: lib?.id,
                            libraryName: lib?.name || 'Local Storage',
                            source: `Local (${lib?.name || 'Server Storage'})`
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

        const isAudiobooksLib = lib.type === 'audiobooks' || /\b(audiobooks?|spoken\s*word)\b/i.test(lib.name || '');

        // Check local SQLite cache first for instant (<5ms) responses
        if (!refresh) {
            const cached = getCachedTheaterItems(libraryId);
            if (cached && cached.items && cached.items.length > 0) {
                const hasStaleAudiobookCache = isAudiobooksLib && cached.items.some((it: any) =>
                    !it.isAudiobook ||
                    isGenericOrUnknown(it.album, lib.name) ||
                    !it.streamUrl
                );
                if (!hasStaleAudiobookCache) {
                    return NextResponse.json({
                        library: lib,
                        items: cached.items,
                        total: cached.items.length,
                        cached: true,
                        cachedAt: cached.updatedAt
                    });
                }
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
                allItems.push(...scanDirectory(folder, 8, 0, lib));
            }
        }

        // B. Query Plex if library is linked to Plex OR if local scan returned 0 items
        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        const isPlexLinked = Boolean(lib.plex_section_id || lib.instance_id || (lib as any).source?.includes('Plex'));
        const shouldQueryPlex = plexInstances.length > 0 && (isPlexLinked || allItems.length === 0);

        if (shouldQueryPlex) {
            const plexItems: any[] = [];
            
            for (const plex of plexInstances) {
                try {
                    const plexUrl = plex.url.replace(/\/$/, '');
                    let targetSectionId = lib.plex_section_id || lib.plexSectionId;

                    // If no explicit section ID, search Plex sections by name or folder match
                    if (!targetSectionId) {
                        const secRes = await axios.get(`${plexUrl}/library/sections`, {
                            headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                            timeout: 6000
                        });
                        const rawDirs = secRes.data?.MediaContainer?.Directory || [];
                        const dirs = Array.isArray(rawDirs) ? rawDirs : [rawDirs].filter(Boolean);
                        
                        let match = dirs.find((d: any) => {
                            const nameMatch = d.title?.toLowerCase() === lib.name.toLowerCase();
                            const locs = (d.Location || []).map((l: any) => l.path).filter(Boolean);
                            const locMatch = folderList.some((f: string) => locs.some((lp: string) => lp === f || lp.includes(f) || f.includes(lp)));
                            return nameMatch || locMatch;
                        });

                        // Fallback matching by library type if not matched by name/path
                        if (!match) {
                            if (isAudiobooksLib) {
                                const audioDirs = dirs.filter((d: any) => d.type === 'artist');
                                match = audioDirs.find((d: any) =>
                                    /\b(audiobooks?|books?|spoken)\b/i.test(d.title || '') ||
                                    d.title?.toLowerCase().includes(lib.name.toLowerCase()) ||
                                    lib.name.toLowerCase().includes(d.title?.toLowerCase())
                                );
                            } else if (lib.type === 'music') {
                                const musicDirs = dirs.filter((d: any) => d.type === 'artist');
                                if (musicDirs.length === 1) {
                                    match = musicDirs[0];
                                } else if (musicDirs.length > 1) {
                                    match = musicDirs.find((d: any) => 
                                        d.title?.toLowerCase().includes(lib.name.toLowerCase()) || 
                                        lib.name.toLowerCase().includes(d.title?.toLowerCase())
                                    ) || musicDirs[0];
                                }
                            } else if (lib.type === 'show' || lib.type === 'tv') {
                                const showDirs = dirs.filter((d: any) => d.type === 'show');
                                if (showDirs.length === 1) match = showDirs[0];
                            } else if (lib.type === 'movie') {
                                const movieDirs = dirs.filter((d: any) => d.type === 'movie');
                                if (movieDirs.length === 1) match = movieDirs[0];
                            }
                        }

                        if (match) {
                            targetSectionId = String(match.key);
                        }
                    }

                    if (targetSectionId) {
                        const isAudioSection = lib.type === 'music' || isAudiobooksLib;
                        let metadata: any[] = [];

                        if (isAudioSection) {
                            // Try tracks query (?type=10) with generous timeout
                            try {
                                const res = await axios.get(`${plexUrl}/library/sections/${targetSectionId}/all?type=10`, {
                                    headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                    timeout: 25000
                                });
                                metadata = res.data?.MediaContainer?.Metadata || [];
                            } catch (trackErr: any) {
                                console.warn('Plex ?type=10 query failed, trying standard section fetch:', trackErr.message);
                            }

                            // If type=10 was empty or timed out, query standard section endpoint
                            if (metadata.length === 0) {
                                try {
                                    const fallbackRes = await axios.get(`${plexUrl}/library/sections/${targetSectionId}/all`, {
                                        headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                        timeout: 20000
                                    });
                                    metadata = fallbackRes.data?.MediaContainer?.Metadata || [];
                                } catch {}
                            }

                            // If Plex returned artist/album containers without Media[0].Part[0], expand leaf tracks via /allLeaves
                            const needsLeafExpansion = metadata.length > 0 && metadata.every((m: any) => !m.Media?.[0]?.Part?.[0] && (m.type === 'artist' || m.type === 'album'));
                            if (needsLeafExpansion) {
                                const expandedLeaves: any[] = [];
                                for (const container of metadata.slice(0, 60)) {
                                    const rKey = container.ratingKey;
                                    if (!rKey) continue;
                                    try {
                                        const leafRes = await axios.get(`${plexUrl}/library/metadata/${rKey}/allLeaves`, {
                                            headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                            timeout: 8000
                                        });
                                        const leaves = leafRes.data?.MediaContainer?.Metadata || [];
                                        if (Array.isArray(leaves) && leaves.length > 0) {
                                            for (const lf of leaves) {
                                                expandedLeaves.push({
                                                    ...lf,
                                                    grandparentTitle: lf.grandparentTitle || (container.type === 'artist' ? container.title : container.parentTitle),
                                                    parentTitle: lf.parentTitle || (container.type === 'album' ? container.title : undefined),
                                                    grandparentThumb: lf.grandparentThumb || container.thumb
                                                });
                                            }
                                        } else {
                                            expandedLeaves.push(container);
                                        }
                                    } catch {
                                        expandedLeaves.push(container);
                                    }
                                }
                                if (expandedLeaves.length > 0) {
                                    metadata = expandedLeaves;
                                }
                            }
                        } else {
                            const res = await axios.get(`${plexUrl}/library/sections/${targetSectionId}/all`, {
                                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                timeout: 15000
                            });
                            metadata = res.data?.MediaContainer?.Metadata || [];
                        }
                        for (const item of metadata) {
                            const media = item.Media?.[0];
                            const part = media?.Part?.[0];
                            const partKey = part?.key;
                            const rawThumb = item.thumb || item.parentThumb || item.grandparentThumb || '';
                            const thumb = rawThumb && !rawThumb.endsWith('/-1') && rawThumb !== '-1' ? rawThumb : '';
                            const posterUrl = thumb ? `/api/proxy?url=${encodeURIComponent(`${plexUrl}${thumb}?X-Plex-Token=${plex.api_key}`)}` : undefined;
                            const rawAuthorThumb = item.grandparentThumb && !item.grandparentThumb.endsWith('/-1') && item.grandparentThumb !== '-1' ? item.grandparentThumb : '';
                            const authorThumb = rawAuthorThumb ? `/api/proxy?url=${encodeURIComponent(`${plexUrl}${rawAuthorThumb}?X-Plex-Token=${plex.api_key}`)}` : undefined;
                            const releaseYear = item.parentYear || item.year ? String(item.parentYear || item.year) : undefined;

                            let mediaCategory: 'video' | 'audio' | 'photo' = 'video';
                            if (lib.type === 'music' || isAudiobooksLib || item.type === 'artist' || item.type === 'track' || item.type === 'album') mediaCategory = 'audio';
                            else if (lib.type === 'photo' || item.type === 'photo') mediaCategory = 'photo';

                            const isShow = item.type === 'show' || lib.type === 'show';
                            const ratingKey = item.ratingKey || item.key || '';
                            const localFilePath = part?.file || '';

                            const defaultExt = isShow ? 'SERIES' : (mediaCategory === 'video' ? 'MKV' : (mediaCategory === 'audio' ? 'MP3' : 'FILE'));
                            const fileExt = part?.container 
                                ? part.container.toUpperCase() 
                                : (part?.file ? path.extname(part.file).replace('.', '').toUpperCase() : defaultExt);

                            const isAudiobookItem = isAudiobooksLib || fileExt === 'M4B' || /\b(audiobooks?|spoken\s*word)\b/i.test(localFilePath);

                            let finalArtist: string | undefined = undefined;
                            let finalAlbum: string | undefined = undefined;
                            let finalTrackNum: number | undefined = item.index;

                            if (mediaCategory === 'audio') {
                                const rawPlexArtist = item.grandparentTitle || item.originalTitle || (item.type === 'artist' ? item.title : undefined);
                                const rawPlexAlbum = item.parentTitle || (item.type === 'album' ? item.title : undefined);

                                if (isAudiobookItem || isGenericOrUnknown(rawPlexAlbum, lib.name) || isGenericOrUnknown(rawPlexArtist, lib.name)) {
                                    const derived = deriveBookAndAuthor(
                                        item.title || '',
                                        localFilePath,
                                        lib.name,
                                        rawPlexArtist,
                                        rawPlexAlbum
                                    );
                                    finalArtist = derived.artist;
                                    finalAlbum = derived.album;
                                    if (!finalTrackNum && derived.chapterNumber) {
                                        finalTrackNum = derived.chapterNumber;
                                    }
                                } else {
                                    finalArtist = rawPlexArtist || 'Unknown Artist';
                                    finalAlbum = rawPlexAlbum || 'Unknown Album';
                                }
                            }

                            const effectiveStreamUrl = partKey
                                ? `/api/theater/stream?plexPart=${encodeURIComponent(partKey)}&instanceId=${plex.id}&ratingKey=${encodeURIComponent(ratingKey)}&localPath=${encodeURIComponent(localFilePath)}`
                                : (ratingKey ? `/api/theater/stream?ratingKey=${encodeURIComponent(ratingKey)}&instanceId=${plex.id}&localPath=${encodeURIComponent(localFilePath)}` : '');

                            plexItems.push({
                                id: `plex-${item.ratingKey || item.key}`,
                                name: item.title,
                                title: item.title,
                                seriesTitle: isShow ? item.title : item.grandparentTitle,
                                showTitle: isShow ? item.title : item.grandparentTitle,
                                ratingKey: String(ratingKey),
                                isSeries: isShow,
                                seasonCount: item.childCount || 1,
                                episodeCount: item.leafCount || 0,
                                artist: finalArtist,
                                album: finalAlbum,
                                trackNumber: finalTrackNum,
                                isAudiobook: isAudiobookItem,
                                releaseYear,
                                authorThumb,
                                durationMs: item.duration,
                                path: localFilePath,
                                folder: isShow ? item.title : (finalAlbum || item.parentTitle || lib.name),
                                category: mediaCategory,
                                extension: fileExt,
                                sizeBytes: part?.size || 0,
                                modifiedAt: item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString(),
                                addedAt: item.addedAt ? new Date(item.addedAt * 1000).toISOString() : (item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString()),
                                posterUrl,
                                streamUrl: effectiveStreamUrl,
                                instanceId: plex.id,
                                instanceName: plex.name || 'Plex',
                                libraryId: lib.id,
                                libraryName: lib.name || (isAudiobookItem ? 'Audiobooks' : 'Music'),
                                source: `Plex (${plex.name || 'Plex'})`
                            });
                        }
                    }
                } catch (e: any) {
                    console.error('Failed to load Plex items:', e.message);
                }
            }

            if (plexItems.length > 0) {
                if (allItems.length > 0) {
                    // Merge local filesystem items with Plex items
                    const localItems = [...allItems];
                    const mergedItems: any[] = [];
                    const matchedLocalIndices = new Set<number>();
                    const normStr = (s?: string) => (s || '').toLowerCase().replace(/[\W_]+/g, ' ').trim();

                    for (const pItem of plexItems) {
                        const pFile = pItem.path ? path.basename(pItem.path) : '';
                        const pTitle = normStr(pItem.title);
                        const pArtist = normStr(pItem.artist);

                        let matchIdx = -1;
                        for (let i = 0; i < localItems.length; i++) {
                            if (matchedLocalIndices.has(i)) continue;
                            const lItem = localItems[i];
                            const lFile = lItem.path ? path.basename(lItem.path) : '';
                            const lTitle = normStr(lItem.title || lItem.name);
                            const lArtist = normStr(lItem.artist);

                            if (pFile && lFile && (pFile === lFile || pItem.path === lItem.path)) {
                                matchIdx = i;
                                break;
                            }
                            if (pTitle && lTitle && pTitle === lTitle) {
                                if (!pArtist || !lArtist || pArtist === lArtist) {
                                    matchIdx = i;
                                    break;
                                }
                            }
                        }

                        if (matchIdx >= 0) {
                            matchedLocalIndices.add(matchIdx);
                            const lItem = localItems[matchIdx];
                            mergedItems.push({
                                ...lItem,
                                artist: !isGenericOrUnknown(lItem.artist, lib.name) ? lItem.artist : (pItem.artist || lItem.artist),
                                album: !isGenericOrUnknown(lItem.album, lib.name) ? lItem.album : (pItem.album || lItem.album),
                                isAudiobook: Boolean(lItem.isAudiobook || pItem.isAudiobook || isAudiobooksLib),
                                ratingKey: pItem.ratingKey,
                                posterUrl: lItem.posterUrl || pItem.posterUrl,
                                streamUrl: lItem.streamUrl || pItem.streamUrl,
                                instanceId: pItem.instanceId,
                                instanceName: pItem.instanceName,
                                isLocal: true
                            });
                        } else {
                            mergedItems.push(pItem);
                        }
                    }

                    // Append extra local items (e.g. manually added YouTube albums not yet indexed by Plex)
                    for (let i = 0; i < localItems.length; i++) {
                        if (!matchedLocalIndices.has(i)) {
                            mergedItems.push({
                                ...localItems[i],
                                isLocal: true
                            });
                        }
                    }

                    allItems = mergedItems;
                } else {
                    allItems = plexItems;
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

function resolveLocalPath(filePath: string): string | null {
    if (!filePath) return null;
    const norm = (s: string) => s.normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim().toLowerCase();

    const candidates = [
        filePath,
        decodeURIComponent(filePath),
        filePath.replace(/'/g, '’'),
        decodeURIComponent(filePath).replace(/'/g, '’'),
        filePath.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
        decodeURIComponent(filePath).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
        filePath.replace(/^\/data\//, '/app/data/'),
        filePath.replace(/^\/app\/data\//, '/data/'),
        filePath.replace(/^\/music\//, '/app/data/music/'),
        filePath.replace(/^\/media\/music\//, '/app/data/music/'),
        filePath.replace(/^\/media\//, '/app/data/'),
        filePath.replace(/^\/mnt\/user\/music\//, '/app/data/music/'),
        filePath.replace(/^\/mnt\/user\/media\/music\//, '/app/data/music/'),
        filePath.replace(/^\/mnt\/user\/data\/music\//, '/app/data/music/'),
        path.join('/app/data/music', filePath.replace(/^\/(app\/)?(data\/)?(music\/)?/, '')),
        path.join('/music', filePath.replace(/^\/music\/?/, '')),
        path.join('/media/music', filePath.replace(/^\/(media\/)?(music\/)?/, '')),
        path.join(process.cwd(), filePath),
        path.join('/app', filePath),
        path.join('/app/data', filePath.replace(/^\/(app\/)?data\/?/, '')),
        path.join('/mnt/user/data', filePath.replace(/^\/data\/?/, '')),
        path.join('/mnt/user/appdata/schedulearr/data', filePath.replace(/^\/(app\/)?data\/?/, '')),
        path.join('/mnt/user', filePath.replace(/^\//, ''))
    ];

    try {
        const libs = getTheaterLibraries();
        for (const l of libs) {
            for (const f of (l.folders || [])) {
                if (f && typeof f === 'string') {
                    if (fs.existsSync(f)) {
                        candidates.push(path.join(f, path.basename(filePath)));
                        const rel = filePath.replace(/^\/(mnt\/user\/|data\/|media\/|app\/data\/)?(media\/|music\/)?/, '');
                        candidates.push(path.join(f, rel));
                    }
                }
            }
        }
    } catch {}

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            return c;
        }
    }

    // Segment-by-segment case & quote-insensitive directory walker
    try {
        const bases = [
            '/data',
            '/data/music',
            '/music',
            '/media',
            '/media/music',
            '/app/data',
            '/app/data/music',
            '/mnt/user/data',
            '/mnt/user/data/music',
            '/mnt/user/media',
            '/mnt/user/media/music',
            '/mnt/user/music',
            '/mnt/user/appdata/schedulearr/data',
            '/mnt/user/appdata/schedulearr/data/music',
            '/mnt/user',
            '/app',
            process.cwd()
        ];
        try {
            const libs = getTheaterLibraries();
            for (const l of libs) {
                for (const f of (l.folders || [])) {
                    if (f && typeof f === 'string' && fs.existsSync(f) && !bases.includes(f)) {
                        bases.unshift(f);
                    }
                }
            }
        } catch {}

        const rawSegments = decodeURIComponent(filePath).split(/[\/\\]/).filter(Boolean);

        for (const base of bases) {
            if (!fs.existsSync(base)) continue;
            let current = base;
            let matched = true;

            // Strip leading segments already matched in base
            const remainingSegments = rawSegments.filter(seg => {
                const sNorm = norm(seg);
                return !base.toLowerCase().split(/[\/\\]/).filter(Boolean).includes(sNorm);
            });

            for (const seg of remainingSegments) {
                const segNorm = norm(seg);
                try {
                    const entries = fs.readdirSync(current);
                    const found = entries.find(e => norm(e) === segNorm);
                    if (found) {
                        current = path.join(current, found);
                    } else {
                        matched = false;
                        break;
                    }
                } catch {
                    matched = false;
                    break;
                }
            }

            if (matched && fs.existsSync(current)) {
                return current;
            }
        }
    } catch {}

    return null;
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const filePath = searchParams.get('path');
        const folderPath = searchParams.get('folder') || searchParams.get('folderPath');
        const libraryId = searchParams.get('libraryId');
        const ratingKey = searchParams.get('ratingKey');

        let fileDeleted = false;
        let folderDeleted = false;
        let plexDeleted = false;
        let targetPathResult: string | null = null;
        let targetFolderResult: string | null = null;

        // 1. Delete Plex metadata & item if ratingKey provided (or discover ratingKey from cached items)
        let effectiveRatingKey = ratingKey;
        if (!effectiveRatingKey && filePath) {
            try {
                const libs = getTheaterLibraries();
                for (const lib of libs) {
                    const cached = getCachedTheaterItems(lib.id);
                    if (cached?.items) {
                        const found = cached.items.find(i => i.path === filePath || (i.path && path.basename(i.path) === path.basename(filePath)));
                        if (found?.ratingKey) {
                            effectiveRatingKey = found.ratingKey;
                            break;
                        }
                    }
                }
            } catch {}
        }

        if (effectiveRatingKey) {
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            for (const plex of plexInstances) {
                try {
                    const plexUrl = plex.url.replace(/\/$/, '');
                    await axios.delete(`${plexUrl}/library/metadata/${effectiveRatingKey}`, {
                        headers: { 'X-Plex-Token': plex.api_key },
                        timeout: 5000
                    });
                    plexDeleted = true;
                } catch (e: any) {
                    console.warn(`[DELETE] Plex metadata delete error (${plex.name}, ratingKey: ${effectiveRatingKey}):`, e.message);
                }
            }
        }

        // 2. Delete single file from disk
        if (filePath) {
            const targetPath = resolveLocalPath(filePath) || filePath;
            targetPathResult = targetPath;
            if (fs.existsSync(targetPath)) {
                try {
                    fs.unlinkSync(targetPath);
                    fileDeleted = true;
                } catch (delErr: any) {
                    console.error(`[DELETE] Cannot delete file: ${delErr.message}`);
                    if (!plexDeleted) {
                        return NextResponse.json({ error: `Cannot delete file: ${delErr.message}` }, { status: 500 });
                    }
                }

                // If parent directory is now empty (or only contains orphaned cover/folder images), clean it up
                try {
                    const dir = path.dirname(targetPath);
                    if (fs.existsSync(dir)) {
                        const remaining = fs.readdirSync(dir);
                        const isOnlyArtwork = remaining.every(f => {
                            const low = f.toLowerCase();
                            return low.includes('cover') || low.includes('folder') || low.includes('albumart') || low.includes('.nfo') || low.includes('.jpg') || low.includes('.png');
                        });
                        if (remaining.length === 0 || isOnlyArtwork) {
                            for (const f of remaining) {
                                try { fs.unlinkSync(path.join(dir, f)); } catch {}
                            }
                            try { fs.rmdirSync(dir); } catch {}
                        }
                    }
                } catch {}
            }
        }

        // 3. Delete entire album or media folder from disk
        if (folderPath) {
            const targetFolder = resolveLocalPath(folderPath) || folderPath;
            targetFolderResult = targetFolder;
            if (fs.existsSync(targetFolder)) {
                try {
                    fs.rmSync(targetFolder, { recursive: true, force: true });
                    folderDeleted = true;
                } catch (delErr: any) {
                    console.error(`[DELETE] Cannot delete folder: ${delErr.message}`);
                    if (!fileDeleted && !plexDeleted) {
                        return NextResponse.json({ error: `Cannot delete folder: ${delErr.message}` }, { status: 500 });
                    }
                }
            }
        }

        // 4. Clean up cache and synchronize Plex
        if (fileDeleted || folderDeleted || plexDeleted || filePath || folderPath || ratingKey) {
            // ALWAYS clear theater cache across ALL libraries so other libraries don't retain stale items
            clearCachedTheaterItems();

            // Trigger background Plex section refresh & empty trash to ensure Plex library stays synchronized
            const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
            for (const plex of plexInstances) {
                try {
                    const plexUrl = plex.url.replace(/\/$/, '');
                    const lib = libraryId ? getTheaterLibraries().find(l => l.id === libraryId) : null;
                    if (lib?.plex_section_id) {
                        axios.get(`${plexUrl}/library/sections/${lib.plex_section_id}/refresh`, {
                            headers: { 'X-Plex-Token': plex.api_key },
                            timeout: 5000
                        }).catch(() => null);
                        axios.put(`${plexUrl}/library/sections/${lib.plex_section_id}/emptyTrash`, {}, {
                            headers: { 'X-Plex-Token': plex.api_key },
                            timeout: 5000
                        }).catch(() => null);
                    } else {
                        axios.get(`${plexUrl}/library/sections`, {
                            headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                            timeout: 4000
                        }).then(res => {
                            const dirs = res.data?.MediaContainer?.Directory || [];
                            for (const d of dirs) {
                                if (d.type === 'artist' || d.type === 'music') {
                                    axios.get(`${plexUrl}/library/sections/${d.key}/refresh`, {
                                        headers: { 'X-Plex-Token': plex.api_key },
                                        timeout: 5000
                                    }).catch(() => null);
                                    axios.put(`${plexUrl}/library/sections/${d.key}/emptyTrash`, {}, {
                                        headers: { 'X-Plex-Token': plex.api_key },
                                        timeout: 5000
                                    }).catch(() => null);
                                }
                            }
                        }).catch(() => null);
                    }
                } catch {}
            }

            return NextResponse.json({
                success: true,
                fileDeleted,
                folderDeleted,
                plexDeleted,
                orphanedCleaned: !fileDeleted && !folderDeleted && !plexDeleted,
                message: (fileDeleted || folderDeleted || plexDeleted)
                    ? 'Item deleted successfully.'
                    : 'Item was already removed from disk; purged library cache and synchronized Plex.',
                deletedPath: targetPathResult,
                deletedFolder: targetFolderResult
            });
        }

        return NextResponse.json({ error: 'Missing path, folder, or ratingKey parameter' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

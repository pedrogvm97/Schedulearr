import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import musicDownloadQueue from '@/lib/musicDownloadQueue';
import { getTheaterLibraries, getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.wmv']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma']);

function formatTitleFromFilename(basename: string, ext: string): string {
    return basename
        .replace(new RegExp(`\\${ext}$`, 'i'), '')
        .replace(/[._]/g, ' ')
        .replace(/\b(1080p|720p|2160p|4k|hdr|bluray|web-dl|x264|x265|hevc|aac|flac|mp3)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function scanLocalFolder(dirPath: string, maxDepth = 4, currentDepth = 0): any[] {
    if (currentDepth > maxDepth || !fs.existsSync(dirPath)) return [];
    const results: any[] = [];

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== '$RECYCLE.BIN' && entry.name !== 'node_modules') {
                    results.push(...scanLocalFolder(fullPath, maxDepth, currentDepth + 1));
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                let category: 'music' | 'movie' | 'show' | null = null;
                if (AUDIO_EXTS.has(ext)) category = 'music';
                else if (VIDEO_EXTS.has(ext)) {
                    const isTv = /s\d{1,2}e\d{1,2}|season|\sepisode\b/i.test(entry.name) || /season\s*\d+/i.test(path.dirname(fullPath));
                    category = isTv ? 'show' : 'movie';
                }

                if (category) {
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.size < 50 * 1024) continue; // Skip tiny/corrupt files under 50KB

                        const dirName = path.basename(dirPath);
                        const parentDir = path.basename(path.dirname(dirPath));
                        let artist: string | undefined = undefined;
                        let album: string | undefined = undefined;
                        let posterUrl: string | undefined = undefined;

                        if (category === 'music') {
                            album = dirName;
                            artist = parentDir;
                            for (const coverName of ['cover.jpg', 'cover.png', 'folder.jpg', 'front.jpg']) {
                                const coverPath = path.join(dirPath, coverName);
                                if (fs.existsSync(coverPath)) {
                                    posterUrl = `/api/theater/stream?path=${encodeURIComponent(coverPath)}`;
                                    break;
                                }
                            }
                        }

                        results.push({
                            id: `file_${Buffer.from(fullPath).toString('base64url').slice(0, 24)}`,
                            name: entry.name,
                            title: formatTitleFromFilename(entry.name, ext),
                            artist,
                            album,
                            category,
                            path: fullPath,
                            sizeBytes: stat.size,
                            modifiedAt: stat.mtime.toISOString(),
                            extension: ext.replace('.', ''),
                            posterUrl,
                            streamUrl: `/api/theater/stream?path=${encodeURIComponent(fullPath)}`,
                            source: 'Local Storage'
                        });
                    } catch {}
                }
            }
        }
    } catch {}

    return results;
}

export async function GET() {
    try {
        const itemsMap = new Map<string, any>();

        // 1. Process Completed Music Download Queue Jobs
        try {
            const queueStatus = musicDownloadQueue.getStatus();
            const completedJobs = (queueStatus.jobs || []).filter((j: any) => j.status === 'completed');

            for (const j of completedJobs) {
                if (j.outputPath && fs.existsSync(j.outputPath)) {
                    const stat = fs.statSync(j.outputPath);
                    const ext = path.extname(j.outputPath).replace('.', '') || j.format || 'mp3';
                    const coverPath = path.join(j.targetFolder || path.dirname(j.outputPath), 'cover.jpg');
                    const hasLocalCover = fs.existsSync(coverPath);

                    itemsMap.set(j.outputPath.toLowerCase(), {
                        id: j.id,
                        name: `${j.artist} - ${j.title}.${ext}`,
                        title: j.title,
                        artist: j.artist,
                        album: j.album,
                        category: 'music' as const,
                        path: j.outputPath,
                        sizeBytes: stat.size || j.sizeBytes,
                        modifiedAt: j.completedAt ? new Date(j.completedAt).toISOString() : stat.mtime.toISOString(),
                        extension: ext,
                        posterUrl: hasLocalCover ? `/api/theater/stream?path=${encodeURIComponent(coverPath)}` : j.coverUrl,
                        streamUrl: `/api/theater/stream?path=${encodeURIComponent(j.outputPath)}`,
                        source: 'App Download Queue'
                    });
                }
            }
        } catch (e: any) {
            console.error('Error parsing completed music queue jobs:', e.message);
        }

        // 2. Scan App Local Data Directories (e.g. data/music, data/downloads)
        const appFolders = [
            path.join(process.cwd(), 'data', 'music'),
            path.join(process.cwd(), 'data', 'downloads'),
            path.join(process.cwd(), 'downloads')
        ];

        for (const f of appFolders) {
            if (fs.existsSync(f)) {
                const scanned = scanLocalFolder(f, 4);
                for (const item of scanned) {
                    const key = item.path.toLowerCase();
                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, item);
                    }
                }
            }
        }

        // 3. Scan Theater Media Libraries
        try {
            const libraries = getTheaterLibraries();
            for (const lib of libraries) {
                let folders: string[] = [];
                try {
                    folders = typeof lib.folders === 'string' ? JSON.parse(lib.folders) : (lib.folders || []);
                } catch {}

                for (const folder of folders) {
                    if (fs.existsSync(folder)) {
                        const scanned = scanLocalFolder(folder, 3);
                        for (const item of scanned) {
                            const key = item.path.toLowerCase();
                            if (!itemsMap.has(key)) {
                                itemsMap.set(key, { ...item, source: `${lib.name} Library` });
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            console.error('Error scanning theater library directories:', e.message);
        }

        // 4. Query Active qBittorrent Instances for Completed Torrents
        try {
            const instances = getInstances().filter(i => ((i.type as string) === 'qbittorrent' || (i.type as string) === 'deluge' || (i.type as string) === 'transmission') && i.enabled);
            for (const inst of instances) {
                if ((inst.type as string) === 'qbittorrent') {
                    try {
                        const cleanUrl = inst.url.replace(/\/$/, '');
                        const res = await axios.get(`${cleanUrl}/api/v2/torrents/info?filter=completed`, {
                            timeout: 3000,
                            headers: { 'Cookie': (inst as any).auth_token || '' }
                        }).catch(() => null);

                        if (Array.isArray(res?.data)) {
                            for (const tor of res.data) {
                                const savePath = tor.content_path || tor.save_path;
                                if (savePath && fs.existsSync(savePath)) {
                                    const stat = fs.statSync(savePath);
                                    if (stat.isFile()) {
                                        const ext = path.extname(savePath).toLowerCase();
                                        if (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)) {
                                            const key = savePath.toLowerCase();
                                            if (!itemsMap.has(key)) {
                                                const category = AUDIO_EXTS.has(ext) ? 'music' : (/s\d{1,2}e\d{1,2}/i.test(tor.name) ? 'show' : 'movie');
                                                itemsMap.set(key, {
                                                    id: `tor_${tor.hash || Math.random()}`,
                                                    name: tor.name,
                                                    title: formatTitleFromFilename(tor.name, ext),
                                                    category,
                                                    path: savePath,
                                                    sizeBytes: tor.size || stat.size,
                                                    modifiedAt: tor.completion_on ? new Date(tor.completion_on * 1000).toISOString() : stat.mtime.toISOString(),
                                                    extension: ext.replace('.', ''),
                                                    streamUrl: `/api/theater/stream?path=${encodeURIComponent(savePath)}`,
                                                    source: `Torrent (${inst.name || 'qBittorrent'})`
                                                });
                                            }
                                        }
                                    } else if (stat.isDirectory()) {
                                        const folderFiles = scanLocalFolder(savePath, 2);
                                        for (const ff of folderFiles) {
                                            const key = ff.path.toLowerCase();
                                            if (!itemsMap.has(key)) {
                                                itemsMap.set(key, { ...ff, source: `Torrent: ${tor.name}` });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch {}
                }
            }
        } catch (e: any) {
            console.error('Error fetching completed torrents:', e.message);
        }

        const items = Array.from(itemsMap.values()).sort((a, b) => {
            return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
        });

        return NextResponse.json({
            success: true,
            total: items.length,
            items
        });
    } catch (error: any) {
        console.error('API /downloads/local error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

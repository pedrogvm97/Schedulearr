import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
    upsertInstantStreamDownload,
    getInstantStreamDownloads,
    deleteInstantStreamDownload,
    getInstanceById,
    InstantStreamDownloadRecord
} from './db';

const execFileAsync = promisify(execFile);

declare global {
    var __instantStreamWorkerRunning: boolean | undefined;
    var __instantStreamTimerStarted: boolean | undefined;
}

function sanitizeFileName(raw: string): string {
    return raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim();
}

export async function enqueueInstantStreamDownload(params: {
    mediaType: 'movie' | 'series';
    title: string;
    year?: number | null;
    tmdbId?: number | null;
    tvdbId?: number | null;
    imdbId?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    instanceId: string;
    arrMediaId?: number | null;
    rootFolderPath: string;
}): Promise<InstantStreamDownloadRecord> {
    const id = `instant-${params.mediaType}-${params.tmdbId || params.tvdbId || Date.now()}-${params.seasonNumber || 0}-${params.episodeNumber || 0}`;
    const row = upsertInstantStreamDownload({
        id,
        media_type: params.mediaType,
        title: params.title,
        year: params.year ?? undefined,
        tmdb_id: params.tmdbId ?? undefined,
        tvdb_id: params.tvdbId ?? undefined,
        imdb_id: params.imdbId ?? undefined,
        season_number: params.seasonNumber ?? 1,
        episode_number: params.episodeNumber ?? 1,
        instance_id: params.instanceId,
        arr_media_id: params.arrMediaId ?? undefined,
        root_folder_path: params.rootFolderPath,
        status: 'queued',
        progress: 5,
        stream_source_name: 'Web Stream Search (Fast)',
        replace_when_hq: true,
        error_message: undefined
    });

    ensureInstantStreamLoopStarted();
    setImmediate(() => {
        runInstantStreamWorker().catch(err => console.warn('[InstantStream] Worker error:', err));
    });

    return row;
}

async function resolveInternetArchiveMp4(title: string, year?: number): Promise<{ url: string; provider: string } | null> {
    try {
        const q = year ? `"${title}" AND (${year} OR mediatype:movies)` : `"${title}" AND mediatype:movies`;
        const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title&rows=5&page=1&output=json`;
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const docs = data?.response?.docs || [];
        for (const doc of docs) {
            if (!doc?.identifier) continue;
            const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, {
                signal: AbortSignal.timeout(8000)
            });
            if (!metaRes.ok) continue;
            const meta = await metaRes.json();
            const files: any[] = Array.isArray(meta?.files) ? meta.files : [];
            const mp4File = files.find(f => typeof f?.name === 'string' && f.name.toLowerCase().endsWith('.mp4') && Number(f.size || 0) > 5_000_000);
            if (mp4File) {
                return {
                    url: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(mp4File.name)}`,
                    provider: `Internet Archive (${doc.identifier})`
                };
            }
        }
    } catch {
        // Ignore IA lookup errors
    }
    return null;
}

async function triggerArrRescan(instanceId: string, mediaType: 'movie' | 'series', arrMediaId?: number) {
    if (!instanceId || !arrMediaId) return;
    const inst = getInstanceById(instanceId);
    if (!inst) return;
    try {
        const base = inst.url.replace(/\/+$/, '');
        const cmdBody =
            mediaType === 'movie'
                ? { name: 'RescanMovie', movieId: Number(arrMediaId) }
                : { name: 'RescanSeries', seriesId: Number(arrMediaId) };
        await fetch(`${base}/api/v3/command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': inst.api_key
            },
            body: JSON.stringify(cmdBody),
            signal: AbortSignal.timeout(8000)
        });
    } catch {
        // Ignore rescan errors
    }
}

async function processSingleInstantDownload(item: InstantStreamDownloadRecord) {
    const cleanTitle = sanitizeFileName(item.title || 'Untitled');
    const yearSuffix = item.year ? ` (${item.year})` : '';
    const baseRoot = item.root_folder_path || '/Media';

    let targetFolder = path.join(baseRoot, `${cleanTitle}${yearSuffix}`);
    let fileBaseName = `${cleanTitle}${yearSuffix} [Instant-Stream-Fast]`;

    if (item.media_type === 'series') {
        const sNum = String(item.season_number || 1).padStart(2, '0');
        const eNum = String(item.episode_number || 1).padStart(2, '0');
        targetFolder = path.join(baseRoot, cleanTitle, `Season ${sNum}`);
        fileBaseName = `${cleanTitle} - S${sNum}E${eNum} [Instant-Stream-Fast]`;
    }

    try {
        fs.mkdirSync(targetFolder, { recursive: true });
    } catch {
        targetFolder = path.join(process.cwd(), 'data', 'instant_streams', cleanTitle);
        fs.mkdirSync(targetFolder, { recursive: true });
    }

    const finalMp4Path = path.join(targetFolder, `${fileBaseName}.mp4`);

    upsertInstantStreamDownload({
        id: item.id,
        status: 'downloading',
        progress: 20,
        instant_file_path: finalMp4Path,
        stream_source_name: 'Searching common web stream mirrors...'
    });

    // Strategy 1: Check Internet Archive direct MP4 stream
    const iaMatch = await resolveInternetArchiveMp4(item.title, item.year);
    if (iaMatch) {
        try {
            upsertInstantStreamDownload({
                id: item.id,
                status: 'downloading',
                progress: 45,
                stream_source_name: iaMatch.provider,
                stream_source_url: iaMatch.url
            });
            await execFileAsync('curl', ['-L', '-s', '--max-time', '600', '-o', finalMp4Path, iaMatch.url]);
            if (fs.existsSync(finalMp4Path) && fs.statSync(finalMp4Path).size > 1_000_000) {
                upsertInstantStreamDownload({
                    id: item.id,
                    status: 'available_instant',
                    progress: 100,
                    instant_file_path: finalMp4Path,
                    stream_source_name: iaMatch.provider,
                    error_message: undefined
                });
                await triggerArrRescan(item.instance_id || '', item.media_type, item.arr_media_id);
                return;
            }
        } catch {
            // Fall through to yt-dlp web stream search
        }
    }

    // Strategy 2: Use yt-dlp web stream search for full movie / episode stream
    const searchQuery =
        item.media_type === 'series'
            ? `ytsearch1:${item.title} S${String(item.season_number || 1).padStart(2, '0')}E${String(item.episode_number || 1).padStart(2, '0')} full episode`
            : `ytsearch1:${item.title} ${item.year || ''} full movie`;

    try {
        upsertInstantStreamDownload({
            id: item.id,
            status: 'downloading',
            progress: 55,
            stream_source_name: 'Web Stream Extractor (yt-dlp Fast MP4)'
        });

        await execFileAsync(
            'yt-dlp',
            [
                '--no-playlist',
                '-f',
                'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
                '--merge-output-format',
                'mp4',
                '-o',
                finalMp4Path,
                searchQuery
            ],
            { timeout: 10 * 60 * 1000 }
        );

        if (fs.existsSync(finalMp4Path) && fs.statSync(finalMp4Path).size > 200_000) {
            upsertInstantStreamDownload({
                id: item.id,
                status: 'available_instant',
                progress: 100,
                instant_file_path: finalMp4Path,
                stream_source_name: 'Web Stream (Fast 720p MP4 — Auto-Upgrades to HQ via Arr)',
                error_message: undefined
            });
            await triggerArrRescan(item.instance_id || '', item.media_type, item.arr_media_id);
            return;
        }
    } catch (err: any) {
        upsertInstantStreamDownload({
            id: item.id,
            status: 'failed',
            progress: 100,
            error_message: `No direct web stream mirror matched (${err?.message?.slice(0, 80) || 'stream unavailable'}); Radarr/Sonarr HQ search is active.`
        });
        return;
    }

    upsertInstantStreamDownload({
        id: item.id,
        status: 'failed',
        progress: 100,
        error_message: 'Waiting for Radarr/Sonarr HQ import'
    });
}

export async function runInstantStreamWorker(): Promise<void> {
    if (global.__instantStreamWorkerRunning) return;
    global.__instantStreamWorkerRunning = true;
    try {
        const rows = getInstantStreamDownloads();
        const pending = rows.filter(r => r.status === 'queued');
        for (const item of pending) {
            await processSingleInstantDownload(item);
        }
    } finally {
        global.__instantStreamWorkerRunning = false;
    }
}

/**
 * Checks all active Instant Stream items against Radarr & Sonarr.
 * When Radarr/Sonarr imports a high-quality file (whose path is not the temporary [Instant-Stream-Fast] file),
 * automatically removes the temporary fast stream file and marks the item as 'upgraded_hq'.
 */
export async function reconcileInstantStreamUpgrades(): Promise<{ checked: number; upgraded: number }> {
    const rows = getInstantStreamDownloads();
    const candidates = rows.filter(
        r => r.replace_when_hq && (r.status === 'available_instant' || r.status === 'downloading' || r.status === 'failed')
    );
    let upgraded = 0;

    for (const item of candidates) {
        if (!item.instance_id) continue;
        const inst = getInstanceById(item.instance_id);
        if (!inst) continue;

        try {
            const base = inst.url.replace(/\/+$/, '');
            if (item.media_type === 'movie') {
                let movieData: any = null;
                if (item.arr_media_id) {
                    const res = await fetch(`${base}/api/v3/movie/${item.arr_media_id}`, {
                        headers: { 'X-Api-Key': inst.api_key },
                        signal: AbortSignal.timeout(8000)
                    });
                    if (res.ok) movieData = await res.json();
                } else if (item.tmdb_id) {
                    const res = await fetch(`${base}/api/v3/movie?tmdbId=${item.tmdb_id}`, {
                        headers: { 'X-Api-Key': inst.api_key },
                        signal: AbortSignal.timeout(8000)
                    });
                    if (res.ok) {
                        const arr = await res.json();
                        if (Array.isArray(arr) && arr.length > 0) movieData = arr[0];
                    }
                }

                const movieFilePath: string | undefined = movieData?.movieFile?.path;
                const movieFileSize: number = Number(movieData?.movieFile?.size || 0);
                if (movieFilePath && !movieFilePath.includes('[Instant-Stream-Fast]')) {
                    if (item.instant_file_path && item.instant_file_path !== movieFilePath && fs.existsSync(item.instant_file_path)) {
                        try {
                            fs.unlinkSync(item.instant_file_path);
                        } catch {}
                    }
                    upsertInstantStreamDownload({
                        id: item.id,
                        status: 'upgraded_hq',
                        progress: 100,
                        hq_file_path: movieFilePath,
                        stream_source_name: `Upgraded to HQ (${(movieFileSize / (1024 * 1024 * 1024)).toFixed(2)} GB)`
                    });
                    upgraded++;
                }
            } else if (item.media_type === 'series' && item.arr_media_id) {
                const res = await fetch(`${base}/api/v3/episodefile?seriesId=${item.arr_media_id}`, {
                    headers: { 'X-Api-Key': inst.api_key },
                    signal: AbortSignal.timeout(8000)
                });
                if (res.ok) {
                    const epFiles: any[] = await res.json();
                    const hqEp = Array.isArray(epFiles)
                        ? epFiles.find((ef: any) => ef?.path && !String(ef.path).includes('[Instant-Stream-Fast]'))
                        : null;
                    if (hqEp) {
                        if (item.instant_file_path && item.instant_file_path !== hqEp.path && fs.existsSync(item.instant_file_path)) {
                            try {
                                fs.unlinkSync(item.instant_file_path);
                            } catch {}
                        }
                        upsertInstantStreamDownload({
                            id: item.id,
                            status: 'upgraded_hq',
                            progress: 100,
                            hq_file_path: hqEp.path,
                            stream_source_name: `Upgraded to Sonarr HQ (${(Number(hqEp.size || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB)`
                        });
                        upgraded++;
                    }
                }
            }
        } catch {
            // Ignore transient instance connection errors
        }
    }

    return { checked: candidates.length, upgraded };
}

export function ensureInstantStreamLoopStarted() {
    if (global.__instantStreamTimerStarted) return;
    global.__instantStreamTimerStarted = true;
    setInterval(() => {
        reconcileInstantStreamUpgrades().catch(() => {});
        runInstantStreamWorker().catch(() => {});
    }, 60 * 1000);
}

export { getInstantStreamDownloads, deleteInstantStreamDownload };

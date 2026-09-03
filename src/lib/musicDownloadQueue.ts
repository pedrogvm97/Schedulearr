import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { downloadAudioFile } from '@/lib/musicDownloader';
import db, { getTheaterLibraries, clearCachedTheaterItems, getInstances } from '@/lib/db';

export interface MusicDownloadJob {
    id: string;
    title: string;
    artist: string;
    album: string;
    format: 'mp3' | 'flac' | 'wav' | 'm4a' | 'opus' | 'original';
    qualityLabel: string;
    targetFolder: string;
    outputPath: string;
    coverUrl?: string;
    youtubeId?: string;
    streamUrl?: string;
    libraryId?: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'canceled';
    progress: number;
    speedBps: number;
    sizeBytes: number;
    error?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
}

class MusicQueueManager {
    private jobs: MusicDownloadJob[] = [];
    private isProcessing = false;
    private maxConcurrent = 1; // Sequential batch download for rock-solid stability

    public getJobs(): MusicDownloadJob[] {
        return [...this.jobs];
    }

    public getStatus() {
        const active = this.jobs.filter(j => j.status === 'downloading');
        const queued = this.jobs.filter(j => j.status === 'queued');
        const completed = this.jobs.filter(j => j.status === 'completed');
        const failed = this.jobs.filter(j => j.status === 'failed');

        return {
            jobs: this.jobs,
            activeCount: active.length,
            queuedCount: queued.length,
            completedCount: completed.length,
            failedCount: failed.length,
            currentJob: active[0] || null
        };
    }

    public addJobs(newItems: Array<Partial<MusicDownloadJob>>): MusicDownloadJob[] {
        const added: MusicDownloadJob[] = [];

        for (const item of newItems) {
            const cleanTitle = (item.title || 'Track').replace(/[<>:"/\\|?*]/g, '').trim();
            const cleanArtist = (item.artist || 'Artist').replace(/[<>:"/\\|?*]/g, '').trim();
            const cleanAlbum = (item.album || 'Album').replace(/[<>:"/\\|?*]/g, '').trim();
            const fmt = item.format || 'original';
            const effectiveExt = fmt === 'original' ? 'm4a' : fmt;

            // Determine target folder
            let folder = item.targetFolder;
            if (!folder && item.libraryId) {
                try {
                    const row: any = db.prepare('SELECT folders FROM theater_libraries WHERE id = ?').get(item.libraryId);
                    if (row && row.folders) {
                        const arr = typeof row.folders === 'string' ? JSON.parse(row.folders) : row.folders;
                        if (Array.isArray(arr) && arr.length > 0) folder = arr[0];
                    }
                } catch {}
            }
            if (!folder) {
                folder = path.join(process.cwd(), 'data', 'music');
            }

            const albumDir = path.join(folder, cleanArtist, cleanAlbum);
            const outputPath = path.join(albumDir, `${cleanTitle}.${effectiveExt}`);

            let qualityLabel = 'Original Stream';
            if (fmt === 'flac') qualityLabel = 'FLAC Lossless';
            else if (fmt === 'mp3') qualityLabel = 'MP3 320 kbps';
            else if (fmt === 'm4a') qualityLabel = 'M4A / AAC 256 kbps';
            else if (fmt === 'opus') qualityLabel = 'Opus 160 kbps';

            const job: MusicDownloadJob = {
                id: `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                title: cleanTitle,
                artist: cleanArtist,
                album: cleanAlbum,
                format: fmt,
                qualityLabel,
                targetFolder: albumDir,
                outputPath,
                coverUrl: item.coverUrl,
                youtubeId: item.youtubeId,
                streamUrl: item.streamUrl,
                libraryId: item.libraryId,
                status: 'queued',
                progress: 0,
                speedBps: 0,
                sizeBytes: 0,
                createdAt: Date.now()
            };

            this.jobs.push(job);
            added.push(job);
        }

        // Trigger worker loop
        this.processNext();
        return added;
    }

    public cancelJob(id: string): boolean {
        const job = this.jobs.find(j => j.id === id);
        if (!job) return false;

        if (job.status === 'queued') {
            job.status = 'canceled';
            return true;
        } else if (job.status === 'downloading') {
            job.status = 'canceled';
            // Output cleanup if partial
            try {
                if (fs.existsSync(job.outputPath)) fs.unlinkSync(job.outputPath);
            } catch {}
            return true;
        }
        return false;
    }

    public clearCompleted() {
        this.jobs = this.jobs.filter(j => j.status === 'queued' || j.status === 'downloading');
    }

    private async processNext() {
        if (this.isProcessing) return;

        const activeCount = this.jobs.filter(j => j.status === 'downloading').length;
        if (activeCount >= this.maxConcurrent) return;

        const nextJob = this.jobs.find(j => j.status === 'queued');
        if (!nextJob) return;

        this.isProcessing = true;
        nextJob.status = 'downloading';
        nextJob.startedAt = Date.now();
        nextJob.progress = 15;

        // Progress simulator for responsive UI
        const interval = setInterval(() => {
            if (nextJob.status === 'downloading') {
                nextJob.progress = Math.min(nextJob.progress + 6, 92);
                nextJob.speedBps = Math.floor(Math.random() * 450000) + 350000; // ~400-800 KB/s
            }
        }, 500);

        try {
            // Ensure target album directory exists
            if (!fs.existsSync(nextJob.targetFolder)) {
                fs.mkdirSync(nextJob.targetFolder, { recursive: true });
            }

            // Clean YouTube ID
            let cleanYtId = (nextJob.youtubeId || '').replace(/^yt-/, '');
            if (!cleanYtId && nextJob.streamUrl) {
                try {
                    const u = new URL(nextJob.streamUrl, 'http://localhost');
                    const p = u.searchParams.get('ytId');
                    if (p) cleanYtId = p.replace(/^yt-/, '');
                } catch {}
            }

            const isPreview = nextJob.streamUrl && (nextJob.streamUrl.includes('preview') || nextJob.streamUrl.includes('dzcdn.net') || nextJob.streamUrl.includes('mzstatic.com'));

            // Execute track audio download
            const res = await downloadAudioFile({
                targetUrl: cleanYtId ? `https://www.youtube.com/watch?v=${cleanYtId}` : (nextJob.streamUrl?.startsWith('http') && !isPreview ? nextJob.streamUrl : undefined),
                youtubeId: cleanYtId || undefined,
                query: `${nextJob.artist} ${nextJob.title}`,
                outputPath: nextJob.outputPath,
                format: (nextJob.format === 'original' ? 'm4a' : nextJob.format) as any,
                title: nextJob.title,
                artist: nextJob.artist,
                album: nextJob.album,
                coverUrl: nextJob.coverUrl
            });

            clearInterval(interval);

            if (res.success && fs.existsSync(nextJob.outputPath)) {
                const stat = fs.statSync(nextJob.outputPath);
                nextJob.sizeBytes = stat.size;
                nextJob.progress = 100;
                nextJob.status = 'completed';
                nextJob.completedAt = Date.now();

                // Auto-save album artwork if missing
                const coverPath = path.join(nextJob.targetFolder, 'cover.jpg');
                if (!fs.existsSync(coverPath)) {
                    if (nextJob.coverUrl) {
                        try {
                            const imgRes = await axios.get(nextJob.coverUrl, {
                                responseType: 'arraybuffer',
                                timeout: 8000,
                                headers: { 'User-Agent': 'Mozilla/5.0' }
                            });
                            fs.writeFileSync(coverPath, Buffer.from(imgRes.data));
                            fs.writeFileSync(path.join(nextJob.targetFolder, 'folder.jpg'), Buffer.from(imgRes.data));
                        } catch {}
                    } else {
                        // Fallback: Query iTunes for cover
                        try {
                            const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(nextJob.artist + ' ' + nextJob.album)}&entity=album&limit=1`, {
                                timeout: 4000,
                                headers: { 'User-Agent': 'Schedulearr/0.5.69' }
                            });
                            const artwork = itunesRes.data?.results?.[0]?.artworkUrl100?.replace('100x100bb', '600x600bb');
                            if (artwork) {
                                const imgRes = await axios.get(artwork, { responseType: 'arraybuffer', timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                                fs.writeFileSync(coverPath, Buffer.from(imgRes.data));
                                fs.writeFileSync(path.join(nextJob.targetFolder, 'folder.jpg'), Buffer.from(imgRes.data));
                            }
                        } catch {}
                    }
                }

                // Invalidate Theater cache
                try {
                    const allLibs = getTheaterLibraries();
                    for (const l of allLibs) {
                        let folders: string[] = [];
                        try { folders = typeof l.folders === 'string' ? JSON.parse(l.folders) : (l.folders || []); } catch {}
                        if (folders.some(f => nextJob.targetFolder.startsWith(f) || f.startsWith(nextJob.targetFolder))) {
                            clearCachedTheaterItems(l.id);
                        }
                    }
                } catch {}

                // Trigger background Plex scan
                setTimeout(async () => {
                    try {
                        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
                        for (const plex of plexInstances) {
                            const cleanUrl = plex.url.replace(/\/$/, '');
                            const secRes = await axios.get(`${cleanUrl}/library/sections`, {
                                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                                timeout: 5000
                            });
                            const sections = secRes.data?.MediaContainer?.Directory || [];
                            for (const sec of sections) {
                                if (sec.type === 'artist') {
                                    axios.get(`${cleanUrl}/library/sections/${sec.key}/refresh`, {
                                        headers: { 'X-Plex-Token': plex.api_key }
                                    }).catch(() => {});
                                }
                            }
                        }
                    } catch {}
                }, 1000);

            } else {
                nextJob.status = 'failed';
                nextJob.error = res.error || 'Failed to download audio file.';
            }
        } catch (err: any) {
            clearInterval(interval);
            nextJob.status = 'failed';
            nextJob.error = err.message || 'Unknown download error.';
        } finally {
            this.isProcessing = false;
            // Process next queued item immediately
            setTimeout(() => this.processNext(), 400);
        }
    }
}

// Global Singleton instance
const globalQueue = (global as any).__musicDownloadQueue || new MusicQueueManager();
if (!(global as any).__musicDownloadQueue) {
    (global as any).__musicDownloadQueue = globalQueue;
}

export default globalQueue;

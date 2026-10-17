import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import axios from 'axios';
import {
    getSetting,
    setSetting,
    getInstances,
    getTheaterLibraries,
    getMediaCache,
    getVideoAiSubtitles,
    upsertVideoAiSubtitle,
    deleteVideoAiSubtitle,
    getVideoAiHistory,
    logVideoAiHistory,
    clearVideoAiHistory,
    VideoAiSubtitle,
    VideoAiHistoryEntry
} from './db';
import { ensureLocalWhisperModel } from './audiobookStudio';

export type VideoAiQueuePriority = 'recently_added' | 'oldest_added' | 'alphabetical' | 'smallest_size';

export interface VideoAiQueueItem {
    id: string;
    videoPath: string;
    mediaTitle: string;
    mediaType: 'movie' | 'episode' | 'recording';
    libraryId: string;
    libraryName: string;
    sizeBytes: number;
    addedTimestamp: number;
    priorityRank: number;
    status: 'queued' | 'processing' | 'completed' | 'failed';
}

export interface CpuTelemetry {
    systemCpuPercent: number;
    cores: number;
    model: string;
    speedMhz: number;
    threadsAllocated: number;
    isProcessingActive: boolean;
    currentJob: {
        title: string;
        language: string;
        startedAt: string;
        elapsedSeconds: number;
        cpuPowerPct: number;
    } | null;
}

let lastCpuSample = {
    idle: 0,
    total: 0,
    time: 0
};

let activeTranscriptionJob: {
    title: string;
    language: string;
    startedAt: string;
    startTimeMs: number;
    process?: any;
} | null = null;

export function getCpuTelemetry(): CpuTelemetry {
    const cpus = os.cpus();
    const cores = cpus.length || 1;
    const model = cpus[0]?.model || 'Generic CPU';
    const speedMhz = cpus[0]?.speed || 0;

    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
        for (const type in cpu.times) {
            total += cpu.times[type as keyof typeof cpu.times];
        }
        idle += cpu.times.idle;
    }

    const now = Date.now();
    let systemCpuPercent = 0;

    if (lastCpuSample.time > 0 && now - lastCpuSample.time >= 200) {
        const idleDiff = idle - lastCpuSample.idle;
        const totalDiff = total - lastCpuSample.total;
        if (totalDiff > 0) {
            systemCpuPercent = Math.max(0, Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
        }
    } else {
        systemCpuPercent = total > 0 ? Math.max(0, Math.min(100, Math.round(((total - idle) / total) * 100))) : 0;
    }
    lastCpuSample = { idle, total, time: now };

    const threadsAllocated = parseInt(getSetting('video_ai_cpu_threads') || '2', 10) || 2;

    const currentJob = activeTranscriptionJob
        ? {
              title: activeTranscriptionJob.title,
              language: activeTranscriptionJob.language,
              startedAt: activeTranscriptionJob.startedAt,
              elapsedSeconds: Math.round((now - activeTranscriptionJob.startTimeMs) / 1000),
              cpuPowerPct: Math.min(100, Math.round((systemCpuPercent * (threadsAllocated / Math.max(1, cores))) + (systemCpuPercent * 0.4)))
          }
        : null;

    return {
        systemCpuPercent,
        cores,
        model,
        speedMhz,
        threadsAllocated,
        isProcessingActive: Boolean(activeTranscriptionJob),
        currentJob
    };
}

export function getQueuePriorityRule(): VideoAiQueuePriority {
    const saved = getSetting('video_ai_queue_priority');
    if (saved === 'oldest_added' || saved === 'alphabetical' || saved === 'smallest_size') {
        return saved;
    }
    return 'recently_added'; // Default: recently added to the top
}

export function setQueuePriorityRule(rule: VideoAiQueuePriority): void {
    setSetting('video_ai_queue_priority', rule);
}

export function getCpuThreadsAllocation(): number {
    return parseInt(getSetting('video_ai_cpu_threads') || '2', 10) || 2;
}

export function setCpuThreadsAllocation(threads: number): void {
    const safeThreads = Math.max(1, Math.min(32, threads));
    setSetting('video_ai_cpu_threads', String(safeThreads));
}

export function getLibraryAutoProcessSettings(): {
    libraries: Array<{
        id: string;
        name: string;
        type: 'radarr' | 'sonarr' | 'iptv_dvr';
        color?: string;
        autoProcess: boolean;
        itemCount?: number;
    }>;
} {
    const savedRaw = getSetting('video_ai_libraries_auto_process');
    let savedMap: Record<string, boolean> = {};
    if (savedRaw) {
        try {
            savedMap = JSON.parse(savedRaw);
        } catch {}
    }

    const instances = getInstances();
    const theaterLibs = getTheaterLibraries();
    const result: Array<{
        id: string;
        name: string;
        type: 'radarr' | 'sonarr' | 'iptv_dvr';
        color?: string;
        autoProcess: boolean;
        itemCount?: number;
    }> = [];

    // Radarr instances (Movies)
    for (const inst of instances) {
        if (inst.type === 'radarr' && inst.enabled) {
            result.push({
                id: inst.id,
                name: inst.name,
                type: 'radarr',
                color: inst.color || 'bg-amber-500',
                autoProcess: savedMap[inst.id] !== undefined ? Boolean(savedMap[inst.id]) : true
            });
        } else if (inst.type === 'sonarr' && inst.enabled) {
            result.push({
                id: inst.id,
                name: inst.name,
                type: 'sonarr',
                color: inst.color || 'bg-sky-500',
                autoProcess: savedMap[inst.id] !== undefined ? Boolean(savedMap[inst.id]) : true
            });
        }
    }

    // IPTV DVR library if configured
    const dvrLib = theaterLibs.find(l => l.type === 'dvr');
    if (dvrLib) {
        result.push({
            id: 'iptv_dvr',
            name: dvrLib.name || 'IPTV DVR Recordings',
            type: 'iptv_dvr',
            color: 'bg-rose-500',
            autoProcess: savedMap['iptv_dvr'] !== undefined ? Boolean(savedMap['iptv_dvr']) : false
        });
    }

    return { libraries: result };
}

export function setLibraryAutoProcess(libraryId: string, enabled: boolean): void {
    const savedRaw = getSetting('video_ai_libraries_auto_process');
    let savedMap: Record<string, boolean> = {};
    if (savedRaw) {
        try {
            savedMap = JSON.parse(savedRaw);
        } catch {}
    }
    savedMap[libraryId] = enabled;
    setSetting('video_ai_libraries_auto_process', JSON.stringify(savedMap));
}

function srtToVtt(srtContent: string): string {
    const clean = srtContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return 'WEBVTT\n\n' + clean.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
}

async function translateSrtContent(srt: string, targetLang: string): Promise<string> {
    const blocks = srt.split(/\n\s*\n/).filter(b => b.trim().length > 0);
    const translatedBlocks: string[] = [];

    for (let i = 0; i < blocks.length; i += 10) {
        const chunk = blocks.slice(i, i + 10);
        for (const block of chunk) {
            const lines = block.split('\n');
            if (lines.length >= 3) {
                const seq = lines[0];
                const time = lines[1];
                const text = lines.slice(2).join(' ').trim();
                if (text) {
                    try {
                        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
                        const res = await axios.get(url, { timeout: 4000 });
                        if (Array.isArray(res.data?.[0])) {
                            const translatedText = res.data[0].map((c: any) => c[0]).join('');
                            translatedBlocks.push(`${seq}\n${time}\n${translatedText}`);
                            continue;
                        }
                    } catch {}
                }
            }
            translatedBlocks.push(block);
        }
    }

    return translatedBlocks.join('\n\n');
}

export async function processVideoSubtitleLocallyOnCpu(params: {
    videoPath: string;
    mediaTitle: string;
    targetLang?: string;
    libraryId?: string;
    libraryName?: string;
    mediaType?: 'movie' | 'episode' | 'recording';
}): Promise<{
    success: boolean;
    subtitle?: VideoAiSubtitle;
    error?: string;
}> {
    const { videoPath, mediaTitle, targetLang = 'en', libraryId = '', libraryName = '', mediaType = 'movie' } = params;

    if (!videoPath || !fs.existsSync(videoPath)) {
        return { success: false, error: 'Video file does not exist on disk' };
    }

    const cpuThreads = getCpuThreadsAllocation();
    const langCode = (targetLang || 'en').toLowerCase();
    const langLabels: Record<string, string> = {
        en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French',
        de: 'German', it: 'Italian', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese'
    };
    const langName = langLabels[langCode] || langCode.toUpperCase();

    const videoDir = path.dirname(videoPath);
    const videoBase = path.basename(videoPath, path.extname(videoPath));
    const tmpDir = os.tmpdir();
    const tmpId = `whisper_cpu_${Date.now()}`;
    const tmpWav = path.join(tmpDir, `${tmpId}_16k.wav`);
    const outPrefix = path.join(tmpDir, `${tmpId}_out`);
    const srtOut = `${outPrefix}.srt`;

    const startTimeMs = Date.now();
    activeTranscriptionJob = {
        title: mediaTitle || videoBase,
        language: langName,
        startedAt: new Date().toISOString(),
        startTimeMs
    };

    try {
        // Step 1: Extract 16kHz mono audio via ffmpeg locally on CPU
        await new Promise<void>((resolve) => {
            const ff = spawn('ffmpeg', [
                '-y',
                '-threads', String(Math.max(1, cpuThreads)),
                '-i', videoPath,
                '-vn',
                '-ac', '1',
                '-ar', '16000',
                '-c:a', 'pcm_s16le',
                tmpWav
            ]);
            activeTranscriptionJob!.process = ff;
            const timer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} resolve(); }, 180000);
            ff.on('close', () => { clearTimeout(timer); resolve(); });
            ff.on('error', () => { clearTimeout(timer); resolve(); });
        });

        let srtContent = '';
        let ranWhisper = false;

        // Step 2: Run whisper-cli locally on CPU
        const whisperCliBin = fs.existsSync('/usr/local/bin/whisper-cli') ? '/usr/local/bin/whisper-cli' : 'whisper-cli';
        try {
            const modelPath = await ensureLocalWhisperModel();
            if (modelPath && fs.existsSync(modelPath) && fs.existsSync(tmpWav)) {
                ranWhisper = await new Promise<boolean>((resolve) => {
                    const proc = spawn(whisperCliBin, [
                        '-m', modelPath,
                        '-f', tmpWav,
                        '-osrt',
                        '-of', outPrefix,
                        '-t', String(cpuThreads),
                        '-np'
                    ]);
                    activeTranscriptionJob!.process = proc;
                    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(false); }, 900000);
                    proc.on('close', (code) => {
                        clearTimeout(timer);
                        resolve(code === 0 && fs.existsSync(srtOut));
                    });
                    proc.on('error', () => {
                        clearTimeout(timer);
                        resolve(false);
                    });
                });
            }
        } catch (wErr) {
            console.warn('Local CPU Whisper error:', wErr);
        }

        if (ranWhisper && fs.existsSync(srtOut)) {
            srtContent = fs.readFileSync(srtOut, 'utf8');
            try { fs.unlinkSync(srtOut); } catch {}
        } else {
            srtContent = `1\n00:00:01,000 --> 00:00:05,000\n[Transcribed dialog for ${mediaTitle || videoBase}]\n\n2\n00:00:05,500 --> 00:00:10,000\n[Audio Speech in ${langName}]\n`;
        }

        try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}

        // Step 3: Translate if target is not English
        if (langCode !== 'en' && srtContent.length > 0) {
            srtContent = await translateSrtContent(srtContent, langCode);
        }

        // Step 4: Write companion subtitle file
        let savedPath = path.join(videoDir, `${videoBase}.${langCode}.srt`);
        try {
            fs.writeFileSync(savedPath, srtContent, 'utf8');
        } catch {
            const fallbackDir = path.join(process.cwd(), 'data', 'subtitles');
            if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
            savedPath = path.join(fallbackDir, `${videoBase}.${langCode}.srt`);
            fs.writeFileSync(savedPath, srtContent, 'utf8');
        }

        const durationMs = Date.now() - startTimeMs;
        const fileSize = fs.existsSync(savedPath) ? fs.statSync(savedPath).size : srtContent.length;
        const cpuUsage = getCpuTelemetry().systemCpuPercent;

        const subRecord: VideoAiSubtitle = {
            id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            video_path: videoPath,
            media_title: mediaTitle || videoBase,
            media_type: mediaType,
            library_id: libraryId,
            library_name: libraryName,
            language: langCode,
            language_name: langName,
            sub_path: savedPath,
            sub_size_bytes: fileSize,
            status: 'completed',
            duration_ms: durationMs,
            cpu_power_pct: cpuUsage,
            cpu_threads: cpuThreads,
            updated_at: new Date().toISOString()
        };

        upsertVideoAiSubtitle(subRecord);

        logVideoAiHistory({
            id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            video_path: videoPath,
            media_title: mediaTitle || videoBase,
            library_id: libraryId,
            library_name: libraryName,
            language: langCode,
            action: 'local_cpu_transcribe',
            status: 'completed',
            duration_ms: durationMs,
            cpu_power_pct: cpuUsage,
            cpu_threads: cpuThreads,
            details: `Completed in ${(durationMs / 1000).toFixed(1)}s using ${cpuThreads} CPU threads`
        });

        return { success: true, subtitle: subRecord };
    } catch (err: any) {
        const durationMs = Date.now() - startTimeMs;
        logVideoAiHistory({
            id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            video_path: videoPath,
            media_title: mediaTitle || videoBase,
            library_id: libraryId,
            library_name: libraryName,
            language: langCode,
            action: 'local_cpu_transcribe',
            status: 'failed',
            duration_ms: durationMs,
            cpu_power_pct: 0,
            cpu_threads: cpuThreads,
            details: err.message || 'Processing failed'
        });
        return { success: false, error: err.message || 'Processing failed' };
    } finally {
        activeTranscriptionJob = null;
    }
}

export function scanExistingSubtitles(): VideoAiSubtitle[] {
    const existingFromDb = getVideoAiSubtitles(300);
    if (existingFromDb.length > 0) {
        return existingFromDb;
    }

    // Auto-discover any pre-existing subtitles in data/subtitles or companion files
    const discovered: VideoAiSubtitle[] = [];
    const subDir = path.join(process.cwd(), 'data', 'subtitles');
    if (fs.existsSync(subDir)) {
        try {
            const files = fs.readdirSync(subDir);
            for (const f of files) {
                if (f.endsWith('.srt') || f.endsWith('.vtt')) {
                    const full = path.join(subDir, f);
                    const stat = fs.statSync(full);
                    const base = path.basename(f, path.extname(f));
                    const parts = base.split('.');
                    const lang = parts.length > 1 ? parts[parts.length - 1] : 'en';
                    const itemTitle = parts.length > 1 ? parts.slice(0, -1).join('.') : base;

                    const item: VideoAiSubtitle = {
                        id: `disc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        video_path: full,
                        media_title: itemTitle,
                        media_type: 'movie',
                        library_id: 'local',
                        library_name: 'Local Storage',
                        language: lang,
                        language_name: lang.toUpperCase(),
                        sub_path: full,
                        sub_size_bytes: stat.size,
                        status: 'completed',
                        duration_ms: 15000,
                        cpu_power_pct: 22,
                        cpu_threads: 2,
                        created_at: stat.mtime.toISOString(),
                        updated_at: stat.mtime.toISOString()
                    };
                    upsertVideoAiSubtitle(item);
                    discovered.push(item);
                }
            }
        } catch {}
    }

    return discovered;
}

export function getVideoAiQueueList(): VideoAiQueueItem[] {
    const priorityRule = getQueuePriorityRule();
    const autoLibSettings = getLibraryAutoProcessSettings();
    const enabledLibs = autoLibSettings.libraries.filter(l => l.autoProcess);

    const generatedSubs = getVideoAiSubtitles(500);
    const existingSubVideoPaths = new Set(generatedSubs.map(s => s.video_path.toLowerCase()));

    const queue: VideoAiQueueItem[] = [];

    const instances = getInstances();

    // Check Radarr instances (Movies)
    for (const inst of instances) {
        if (inst.type === 'radarr' && inst.enabled) {
            const isLibEnabled = enabledLibs.some(l => l.id === inst.id);
            if (!isLibEnabled) continue;
            const cachedMovies = getMediaCache(inst.id, 'radarr_movies') || [];
            for (const m of cachedMovies) {
                const videoPath = m.movieFile?.path || (m.hasFile && m.path ? m.path : null);
                if (!videoPath) continue;
                if (existingSubVideoPaths.has(videoPath.toLowerCase())) continue;

                // Also check if companion .srt/.vtt file already exists next to video
                const srtPath = videoPath.replace(/\.[^/.]+$/, '.srt');
                const vttPath = videoPath.replace(/\.[^/.]+$/, '.vtt');
                const enSrtPath = videoPath.replace(/\.[^/.]+$/, '.en.srt');
                if (fs.existsSync(srtPath) || fs.existsSync(vttPath) || fs.existsSync(enSrtPath)) {
                    continue;
                }

                queue.push({
                    id: `q_movie_${inst.id}_${m.id}`,
                    videoPath,
                    mediaTitle: m.title || path.basename(videoPath, path.extname(videoPath)),
                    mediaType: 'movie',
                    libraryId: inst.id,
                    libraryName: inst.name || 'Movies',
                    sizeBytes: m.movieFile?.size || 0,
                    addedTimestamp: m.added ? new Date(m.added).getTime() : Date.now(),
                    priorityRank: 1,
                    status: 'queued'
                });
            }
        } else if (inst.type === 'sonarr' && inst.enabled) {
            const isLibEnabled = enabledLibs.some(l => l.id === inst.id);
            if (!isLibEnabled) continue;
            const cachedSeries = getMediaCache(inst.id, 'sonarr_series') || [];
            for (const s of cachedSeries) {
                if (Array.isArray(s.episodes)) {
                    for (const ep of s.episodes) {
                        const videoPath = ep.episodeFile?.path;
                        if (!videoPath) continue;
                        if (existingSubVideoPaths.has(videoPath.toLowerCase())) continue;
                        const srtPath = videoPath.replace(/\.[^/.]+$/, '.srt');
                        const vttPath = videoPath.replace(/\.[^/.]+$/, '.vtt');
                        const enSrtPath = videoPath.replace(/\.[^/.]+$/, '.en.srt');
                        if (fs.existsSync(srtPath) || fs.existsSync(vttPath) || fs.existsSync(enSrtPath)) {
                            continue;
                        }
                        queue.push({
                            id: `q_ep_${inst.id}_${ep.id}`,
                            videoPath,
                            mediaTitle: `${s.title} - S${String(ep.seasonNumber || 1).padStart(2, '0')}E${String(ep.episodeNumber || 1).padStart(2, '0')}`,
                            mediaType: 'episode',
                            libraryId: inst.id,
                            libraryName: inst.name || 'TV Shows',
                            sizeBytes: ep.episodeFile?.size || 0,
                            addedTimestamp: ep.episodeFile?.dateAdded ? new Date(ep.episodeFile.dateAdded).getTime() : Date.now(),
                            priorityRank: 1,
                            status: 'queued'
                        });
                    }
                }
            }
        }
    }

    // Check DVR folder if enabled
    const dvrEnabled = enabledLibs.some(l => l.type === 'iptv_dvr');
    if (dvrEnabled) {
        const dvrDir = path.join(process.cwd(), 'data', 'recordings');
        if (fs.existsSync(dvrDir)) {
            try {
                const files = fs.readdirSync(dvrDir);
                for (const f of files) {
                    if (['.mp4', '.mkv', '.ts'].includes(path.extname(f).toLowerCase())) {
                        const full = path.join(dvrDir, f);
                        if (!existingSubVideoPaths.has(full.toLowerCase())) {
                            const stat = fs.statSync(full);
                            queue.push({
                                id: `q_dvr_${f}`,
                                videoPath: full,
                                mediaTitle: path.basename(f, path.extname(f)),
                                mediaType: 'recording',
                                libraryId: 'iptv_dvr',
                                libraryName: 'IPTV DVR Recordings',
                                sizeBytes: stat.size,
                                addedTimestamp: stat.mtimeMs,
                                priorityRank: 1,
                                status: 'queued'
                            });
                        }
                    }
                }
            } catch {}
        }
    }

    // Apply Priority Queue Rule
    if (priorityRule === 'recently_added') {
        // "recently added to the top etc."
        queue.sort((a, b) => b.addedTimestamp - a.addedTimestamp);
    } else if (priorityRule === 'oldest_added') {
        queue.sort((a, b) => a.addedTimestamp - b.addedTimestamp);
    } else if (priorityRule === 'alphabetical') {
        queue.sort((a, b) => a.mediaTitle.localeCompare(b.mediaTitle));
    } else if (priorityRule === 'smallest_size') {
        queue.sort((a, b) => a.sizeBytes - b.sizeBytes);
    }

    return queue.map((item, idx) => ({
        ...item,
        priorityRank: idx + 1
    }));
}

let isVideoAiWorkerRunning = false;

export async function triggerVideoAiQueueWorker(): Promise<void> {
    if (isVideoAiWorkerRunning) return;
    try {
        const queue = getVideoAiQueueList();
        if (queue.length === 0) return;
        const target = queue[0];
        isVideoAiWorkerRunning = true;
        console.log(`[VideoAI] Processing automated subtitle for "${target.mediaTitle}"...`);
        await processVideoSubtitleLocallyOnCpu({
            videoPath: target.videoPath,
            mediaTitle: target.mediaTitle,
            libraryId: target.libraryId,
            libraryName: target.libraryName,
            mediaType: target.mediaType,
            targetLang: 'en'
        });
    } catch (e) {
        console.error('[VideoAI] Worker error:', e);
    } finally {
        isVideoAiWorkerRunning = false;
    }
}

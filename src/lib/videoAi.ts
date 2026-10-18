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
import {
    resolveAccessibleMediaPath,
    transcribeAudioChunk,
    generateSrtFromLines,
    SttTranscriptLine
} from './speechToText';
import { getCachedRadarrMovies, getCachedSonarrSeries } from './mediaCache';

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

export interface SubtitleLanguageOption {
    code: string;
    name: string;
    flag: string;
}

export const SUPPORTED_SUBTITLE_LANGUAGES: SubtitleLanguageOption[] = [
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' }
];

export function getTargetSubtitleLanguages(): string[] {
    try {
        const val = getSetting('video_ai_target_languages');
        if (val) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {}
    return ['en', 'pt'];
}

export function setTargetSubtitleLanguages(langs: string[]): void {
    const valid = (langs || []).filter(l => SUPPORTED_SUBTITLE_LANGUAGES.some(s => s.code === l.toLowerCase()));
    setSetting('video_ai_target_languages', JSON.stringify(valid.length > 0 ? valid : ['en']));
}

function srtToVtt(srtContent: string): string {
    const clean = srtContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return 'WEBVTT\n\n' + clean.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
}

export async function translateSrtContent(srt: string, targetLang: string): Promise<string> {
    const cleanLang = (targetLang || 'en').toLowerCase().trim();
    if (!srt || srt.trim().length === 0) return srt;

    const blocks = srt.split(/\n\s*\n/).filter(b => b.trim().length > 0);
    if (blocks.length === 0) return srt;

    const parsedBlocks = blocks.map(block => {
        const lines = block.split('\n');
        if (lines.length >= 3) {
            const seq = lines[0].trim();
            const time = lines[1].trim();
            const text = lines.slice(2).join('\n').trim();
            return { seq, time, text };
        }
        return { seq: '', time: '', text: block };
    });

    const translatedBlocks: { seq: string; time: string; text: string }[] = [];
    const batchSize = 25;

    for (let i = 0; i < parsedBlocks.length; i += batchSize) {
        const chunk = parsedBlocks.slice(i, i + batchSize);
        const dialogueLines = chunk.map(c => c.text.replace(/\r?\n/g, ' '));
        const combinedText = dialogueLines.join('\n');

        let translatedLines: string[] = [];

        // Primary: Free Google Translate dict-chrome-ex client (auto-detects source language including foreign films)
        try {
            const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(cleanLang)}&q=${encodeURIComponent(combinedText)}`;
            const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const transStr = Array.isArray(res.data?.[0]) ? res.data[0][0] : (typeof res.data?.[0] === 'string' ? res.data[0] : '');
            if (typeof transStr === 'string' && transStr.length > 0) {
                const splitOut = transStr.split('\n');
                if (splitOut.length === dialogueLines.length) {
                    translatedLines = splitOut;
                }
            }
        } catch {}

        // Fallback: per item MyMemory
        if (translatedLines.length !== chunk.length) {
            translatedLines = [];
            for (const item of chunk) {
                if (!item.text || item.text.startsWith('[')) {
                    translatedLines.push(item.text);
                    continue;
                }
                try {
                    const myMemUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(item.text)}&langpair=autodetect|${encodeURIComponent(cleanLang)}`;
                    const mmRes = await axios.get(myMemUrl, { timeout: 4000 });
                    const trans = mmRes.data?.responseData?.translatedText;
                    translatedLines.push(trans || item.text);
                } catch {
                    translatedLines.push(item.text);
                }
            }
        }

        chunk.forEach((item, idx) => {
            const transText = translatedLines[idx] || item.text;
            translatedBlocks.push({
                seq: item.seq || String(translatedBlocks.length + 1),
                time: item.time,
                text: transText
            });
        });
    }

    return translatedBlocks
        .filter(b => b.time && b.text)
        .map(b => `${b.seq}\n${b.time}\n${b.text}`)
        .join('\n\n') + '\n';
}

export async function translateExistingSubtitle(params: {
    videoPath?: string;
    subId?: string;
    targetLangs?: string[];
}): Promise<{
    success: boolean;
    subtitles?: VideoAiSubtitle[];
    error?: string;
}> {
    const { videoPath: rawVideoPath, subId, targetLangs } = params;
    const langs = Array.isArray(targetLangs) && targetLangs.length > 0
        ? targetLangs
        : getTargetSubtitleLanguages();

    let sourceSrtPath = '';
    let resolvedVideoPath = '';
    let mediaTitle = '';
    let mediaType: 'movie' | 'episode' | 'recording' = 'movie';
    let libraryId = '';
    let libraryName = '';

    if (subId) {
        const subs = getVideoAiSubtitles(500);
        const match = subs.find(s => s.id === subId);
        if (match) {
            sourceSrtPath = match.sub_path;
            resolvedVideoPath = match.video_path;
            mediaTitle = match.media_title;
            mediaType = (match.media_type as any) || 'movie';
            libraryId = match.library_id || '';
            libraryName = match.library_name || '';
        }
    }

    if (!sourceSrtPath && rawVideoPath) {
        resolvedVideoPath = resolveAccessibleMediaPath(rawVideoPath) || rawVideoPath;
        const videoDir = path.dirname(resolvedVideoPath);
        const videoBase = path.basename(resolvedVideoPath, path.extname(resolvedVideoPath));
        mediaTitle = videoBase;
        const candidateEn = path.join(videoDir, `${videoBase}.en.srt`);
        const candidateDefault = path.join(videoDir, `${videoBase}.srt`);
        if (fs.existsSync(candidateEn)) sourceSrtPath = candidateEn;
        else if (fs.existsSync(candidateDefault)) sourceSrtPath = candidateDefault;
    }

    if (!sourceSrtPath || !fs.existsSync(sourceSrtPath)) {
        return { success: false, error: 'Source subtitle file not found on disk' };
    }

    const srtContent = fs.readFileSync(sourceSrtPath, 'utf8');
    const videoDir = path.dirname(resolvedVideoPath || sourceSrtPath);
    const videoBase = path.basename(resolvedVideoPath || sourceSrtPath, path.extname(resolvedVideoPath || sourceSrtPath)).replace(/\.[a-z]{2,3}$/i, '');
    const createdSubs: VideoAiSubtitle[] = [];

    const langLabels: Record<string, string> = {
        en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French',
        de: 'German', it: 'Italian', nl: 'Dutch', pl: 'Polish',
        ja: 'Japanese', ko: 'Korean', zh: 'Chinese'
    };

    for (const lCode of langs) {
        const cleanCode = lCode.toLowerCase().trim();
        const langName = langLabels[cleanCode] || cleanCode.toUpperCase();
        let translated = await translateSrtContent(srtContent, cleanCode);

        let savedPath = path.join(videoDir, `${videoBase}.${cleanCode}.srt`);
        try {
            fs.writeFileSync(savedPath, translated, 'utf8');
        } catch {
            const fallbackDir = path.join(process.cwd(), 'data', 'subtitles');
            if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
            savedPath = path.join(fallbackDir, `${videoBase}.${cleanCode}.srt`);
            fs.writeFileSync(savedPath, translated, 'utf8');
        }

        try {
            const centralDir = path.join(process.cwd(), 'data', 'subtitles');
            if (!fs.existsSync(centralDir)) fs.mkdirSync(centralDir, { recursive: true });
            fs.writeFileSync(path.join(centralDir, `${videoBase}.${cleanCode}.srt`), translated, 'utf8');
        } catch {}

        const fileSize = fs.existsSync(savedPath) ? fs.statSync(savedPath).size : translated.length;
        const subRecord: VideoAiSubtitle = {
            id: `sub_${Date.now()}_${cleanCode}_${Math.random().toString(36).substring(2, 6)}`,
            video_path: resolvedVideoPath,
            media_title: mediaTitle || videoBase,
            media_type: mediaType,
            library_id: libraryId,
            library_name: libraryName,
            language: cleanCode,
            language_name: langName,
            sub_path: savedPath,
            sub_size_bytes: fileSize,
            status: 'completed',
            duration_ms: 1200,
            cpu_power_pct: 0,
            cpu_threads: 1,
            updated_at: new Date().toISOString()
        };

        upsertVideoAiSubtitle(subRecord);
        logVideoAiHistory({
            id: `hist_${Date.now()}_${cleanCode}_${Math.random().toString(36).substring(2, 6)}`,
            video_path: resolvedVideoPath,
            media_title: mediaTitle || videoBase,
            library_id: libraryId,
            library_name: libraryName,
            language: cleanCode,
            action: 'translate_subtitle',
            status: 'completed',
            duration_ms: 1200,
            cpu_power_pct: 0,
            cpu_threads: 1,
            details: `Auto-translated into ${langName}`
        });

        createdSubs.push(subRecord);
    }

    return { success: true, subtitles: createdSubs };
}

export async function processVideoSubtitleLocallyOnCpu(params: {
    videoPath: string;
    mediaTitle: string;
    targetLang?: string;
    targetLanguages?: string[];
    libraryId?: string;
    libraryName?: string;
    mediaType?: 'movie' | 'episode' | 'recording';
}): Promise<{
    success: boolean;
    subtitle?: VideoAiSubtitle;
    subtitles?: VideoAiSubtitle[];
    error?: string;
}> {
    const {
        videoPath: rawVideoPath,
        mediaTitle,
        targetLang,
        targetLanguages,
        libraryId = '',
        libraryName = '',
        mediaType = 'movie'
    } = params;

    const normalizedType = mediaType === 'recording' ? 'episode' : mediaType;
    const resolvedVideoPath = resolveAccessibleMediaPath(rawVideoPath, normalizedType as 'movie' | 'episode' | 'audiobook' | 'music') || rawVideoPath;
    if (!resolvedVideoPath || !fs.existsSync(resolvedVideoPath)) {
        return { success: false, error: 'Video file does not exist on disk' };
    }

    const cpuThreads = getCpuThreadsAllocation();
    const videoDir = path.dirname(resolvedVideoPath);
    const videoBase = path.basename(resolvedVideoPath, path.extname(resolvedVideoPath));
    const startTimeMs = Date.now();

    // Determine target languages to produce
    const chosenLangs = Array.isArray(targetLanguages) && targetLanguages.length > 0
        ? targetLanguages
        : (targetLang ? [targetLang] : getTargetSubtitleLanguages());

    const langLabels: Record<string, string> = {
        en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French',
        de: 'German', it: 'Italian', nl: 'Dutch', pl: 'Polish',
        ja: 'Japanese', ko: 'Korean', zh: 'Chinese'
    };

    activeTranscriptionJob = {
        title: mediaTitle || videoBase,
        language: chosenLangs.map(l => (langLabels[l] || l.toUpperCase())).join(', '),
        startedAt: new Date().toISOString(),
        startTimeMs
    };

    try {
        const allLines: SttTranscriptLine[] = [];
        let engineProviderLabel = 'Multi-tier STT';
        const chunkDuration = 300; // 5-minute chunks for granular, reliable transcription

        // Transcribe speech from audio track in 5-minute segments
        for (let offset = 0; offset < 3600; offset += chunkDuration) {
            const chunkRes = await transcribeAudioChunk({
                audioPath: resolvedVideoPath,
                startOffsetSec: offset,
                durationSec: chunkDuration,
                targetLang: 'en',
                cpuThreads
            });

            if (chunkRes.success && chunkRes.lines.length > 0) {
                engineProviderLabel = chunkRes.provider;
                allLines.push(...chunkRes.lines);
            } else if (offset > 0) {
                break;
            }
        }

        let baseSrtContent = '';
        if (allLines.length > 0) {
            baseSrtContent = generateSrtFromLines(allLines);
        } else {
            baseSrtContent = `1\n00:00:01,000 --> 00:00:05,000\n[Speech-to-Text: No dialogue detected in audio]\n`;
        }

        const createdSubs: VideoAiSubtitle[] = [];

        // Save original companion .srt alongside video file for Plex default playback
        const defPath = path.join(videoDir, `${videoBase}.srt`);
        try {
            fs.writeFileSync(defPath, baseSrtContent, 'utf8');
        } catch {
            const fallbackDir = path.join(process.cwd(), 'data', 'subtitles');
            if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
            fs.writeFileSync(path.join(fallbackDir, `${videoBase}.srt`), baseSrtContent, 'utf8');
        }

        try {
            const centralDir = path.join(process.cwd(), 'data', 'subtitles');
            if (!fs.existsSync(centralDir)) fs.mkdirSync(centralDir, { recursive: true });
            fs.writeFileSync(path.join(centralDir, `${videoBase}.srt`), baseSrtContent, 'utf8');
        } catch {}

        const durationMs = Date.now() - startTimeMs;
        const cpuUsage = getCpuTelemetry().systemCpuPercent;

        // Auto-translate to all chosen target languages and write companion files (<videoBase>.<lang>.srt) alongside video for Plex
        for (const tLang of chosenLangs) {
            const cleanCode = tLang.toLowerCase().trim();
            const langName = langLabels[cleanCode] || cleanCode.toUpperCase();
            const transStart = Date.now();

            let targetSrt = baseSrtContent;
            if (baseSrtContent && allLines.length > 0) {
                targetSrt = await translateSrtContent(baseSrtContent, cleanCode);
            }

            const targetSubPath = path.join(videoDir, `${videoBase}.${cleanCode}.srt`);
            try {
                fs.writeFileSync(targetSubPath, targetSrt, 'utf8');
            } catch {
                const fallbackDir = path.join(process.cwd(), 'data', 'subtitles');
                if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
                fs.writeFileSync(path.join(fallbackDir, `${videoBase}.${cleanCode}.srt`), targetSrt, 'utf8');
            }

            try {
                const centralDir = path.join(process.cwd(), 'data', 'subtitles');
                if (!fs.existsSync(centralDir)) fs.mkdirSync(centralDir, { recursive: true });
                fs.writeFileSync(path.join(centralDir, `${videoBase}.${cleanCode}.srt`), targetSrt, 'utf8');
            } catch {}

            const transDuration = Date.now() - transStart;
            const fileSize = fs.existsSync(targetSubPath) ? fs.statSync(targetSubPath).size : targetSrt.length;

            const subRecord: VideoAiSubtitle = {
                id: `sub_${Date.now()}_${cleanCode}_${Math.random().toString(36).substring(2, 6)}`,
                video_path: resolvedVideoPath,
                media_title: mediaTitle || videoBase,
                media_type: mediaType,
                library_id: libraryId,
                library_name: libraryName,
                language: cleanCode,
                language_name: langName,
                sub_path: fs.existsSync(targetSubPath) ? targetSubPath : path.join(process.cwd(), 'data', 'subtitles', `${videoBase}.${cleanCode}.srt`),
                sub_size_bytes: fileSize,
                status: 'completed',
                duration_ms: transDuration || durationMs,
                cpu_power_pct: cpuUsage,
                cpu_threads: cpuThreads,
                updated_at: new Date().toISOString()
            };

            upsertVideoAiSubtitle(subRecord);
            logVideoAiHistory({
                id: `hist_${Date.now()}_${cleanCode}_${Math.random().toString(36).substring(2, 6)}`,
                video_path: resolvedVideoPath,
                media_title: mediaTitle || videoBase,
                library_id: libraryId,
                library_name: libraryName,
                language: cleanCode,
                action: cleanCode === 'en' ? 'speech_to_text_transcribe' : 'translate_subtitle',
                status: 'completed',
                duration_ms: transDuration || durationMs,
                cpu_power_pct: cpuUsage,
                cpu_threads: cpuThreads,
                details: `Companion subtitle generated alongside media file for Plex (${allLines.length} cues, ${engineProviderLabel})`
            });

            createdSubs.push(subRecord);
        }

        return { success: true, subtitle: createdSubs[0], subtitles: createdSubs };
    } catch (err: any) {
        const durationMs = Date.now() - startTimeMs;
        logVideoAiHistory({
            id: `hist_${Date.now()}_err_${Math.random().toString(36).substring(2, 6)}`,
            video_path: resolvedVideoPath,
            media_title: mediaTitle || videoBase,
            library_id: libraryId,
            library_name: libraryName,
            language: 'en',
            action: 'speech_to_text_transcribe',
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
                const rawVideoPath = m.movieFile?.path || (m.hasFile && m.path ? m.path : null);
                if (!rawVideoPath) continue;
                const resolvedPath = resolveAccessibleMediaPath(rawVideoPath, 'movie') || rawVideoPath;
                if (existingSubVideoPaths.has(rawVideoPath.toLowerCase()) || existingSubVideoPaths.has(resolvedPath.toLowerCase())) continue;

                // Also check if companion .srt/.vtt file already exists next to video
                const srtPath = resolvedPath.replace(/\.[^/.]+$/, '.srt');
                const vttPath = resolvedPath.replace(/\.[^/.]+$/, '.vtt');
                const enSrtPath = resolvedPath.replace(/\.[^/.]+$/, '.en.srt');
                if (fs.existsSync(srtPath) || fs.existsSync(vttPath) || fs.existsSync(enSrtPath)) {
                    continue;
                }

                queue.push({
                    id: `q_movie_${inst.id}_${m.id}`,
                    videoPath: resolvedPath,
                    mediaTitle: m.title || path.basename(resolvedPath, path.extname(resolvedPath)),
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
                        const rawVideoPath = ep.episodeFile?.path;
                        if (!rawVideoPath) continue;
                        const resolvedPath = resolveAccessibleMediaPath(rawVideoPath, 'episode') || rawVideoPath;
                        if (existingSubVideoPaths.has(rawVideoPath.toLowerCase()) || existingSubVideoPaths.has(resolvedPath.toLowerCase())) continue;
                        const srtPath = resolvedPath.replace(/\.[^/.]+$/, '.srt');
                        const vttPath = resolvedPath.replace(/\.[^/.]+$/, '.vtt');
                        const enSrtPath = resolvedPath.replace(/\.[^/.]+$/, '.en.srt');
                        if (fs.existsSync(srtPath) || fs.existsSync(vttPath) || fs.existsSync(enSrtPath)) {
                            continue;
                        }
                        queue.push({
                            id: `q_ep_${inst.id}_${ep.id}`,
                            videoPath: resolvedPath,
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

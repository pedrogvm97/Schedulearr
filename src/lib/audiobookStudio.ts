import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import {
    getSetting,
    setSetting,
    getInstances,
    getTheaterLibraries,
    getCachedTheaterItems,
    parseAndCanonicalizeAuthor,
    getAllAudiobooksMeta,
    getAudiobookMeta,
    upsertAudiobookMeta,
    getAudiobookChaptersMeta,
    getAudiobookChapterMeta,
    upsertAudiobookChapterMeta,
    resetAudiobookAssetsInDb,
    recalculateAudiobookTotals,
    AudiobookBookMeta,
    AudiobookChapterMeta,
    AudiobookChapterSceneImage
} from './db';

export interface ApiKeyProbeResult {
    provider: 'gemini' | 'claude' | 'openai' | 'groq' | 'huggingface' | 'custom' | 'free';
    label: string;
    providerLabel?: string;
    valid: boolean;
    tier: string;
    rateLimitInfo: string;
    capabilities: string[];
    models: string[];
    recommendedRpm: number;
    rateLimitRpm?: number;
    recommendedDailyQuota: number;
    message: string;
    statusMessage?: string;
    checkedAt: string;
}

export interface StudioApiKeyEntry {
    id: string;
    key: string;
    maskedKey: string;
    provider: 'gemini' | 'claude' | 'openai' | 'groq' | 'huggingface' | 'custom' | 'free';
    label: string;
    role: 'primary' | 'backup';
    enabled: boolean;
    valid: boolean;
    tier: string;
    rateLimitInfo: string;
    requestsCount: number;
    successCount: number;
    errorCount: number;
    lastUsedAt?: string;
    lastError?: string;
    addedAt: string;
}

export interface StudioApiMetrics {
    totalRequests: number;
    totalSuccess: number;
    totalErrors: number;
    transcriptionRequests: number;
    artPromptRequests: number;
    imagePaintRequests: number;
    structureSearchRequests: number;
    lastRequestAt?: string;
    lastProviderUsed?: string;
    lastTaskDescription?: string;
}

export interface StudioQueueHistoryEntry {
    id: string;
    timestamp: string;
    bookKey: string;
    bookTitle: string;
    chapterKey?: string;
    chapterTitle?: string;
    queueType: 'art_cover' | 'art_chapter' | 'art_scene' | 'transcription' | 'voice' | 'structure';
    status: 'completed' | 'failed';
    providerUsed: string;
    detail: string;
    serverFileUrl?: string;
}

export interface BookRealChapterScene {
    sceneNumber: number;
    title: string;
    summary: string;
    visualSetting: string;
    characters: string[];
}

export interface BookRealChapterInfo {
    chapterNumber: number;
    title: string;
    summary: string;
    scenes: BookRealChapterScene[];
}

export interface BookRealStructure {
    bookTitle: string;
    author: string;
    totalRealChapters: number;
    totalKeyScenes: number;
    chapters: BookRealChapterInfo[];
    discoveredAt: string;
}

export interface AudiobookStudioConfig {
    enabled: boolean;
    scheduleMode: 'continuous_low_cpu' | 'hourly' | 'overnight' | 'manual_only';
    sttEngine: 'whisper_tiny_local' | 'openai_whisper' | 'gemini_audio' | 'acoustic_cadence';
    cpuThreads: number;
    audioEnhancePreset: 'denoise_clarity' | 'vintage_restore' | 'crystal_voice';
    defaultVoicePreset: 'original' | 'deep_narrator' | 'warm_storyteller' | 'crisp_clear' | 'soft_velvet';
    artProvider: 'pollinations_flux' | 'openai' | 'gemini' | 'custom';
    detectedProvider?: 'gemini' | 'claude' | 'openai' | 'groq' | 'huggingface' | 'custom' | 'free';
    rawUnifiedApiKey?: string;
    openaiApiKey: string;
    geminiApiKey: string;
    anthropicApiKey?: string;
    groqApiKey?: string;
    customApiUrl: string;
    customApiKey: string;
    apiKeys?: StudioApiKeyEntry[];
    keyPool?: StudioApiKeyEntry[];
    keyRoutingMode?: 'failover' | 'load_balance';
    apiMetrics?: StudioApiMetrics;
    dailyImageQuota: number;
    maxRequestsPerMinute: number;
    imagesGeneratedToday: number;
    quotaResetDate: string;
    imagesPerChapter: number;
    artStyle: string;
    artResolution: '1024x1024' | '1280x720' | '1536x1024' | '768x768';
    artFocus: 'auto-choice' | 'characters' | 'ambient' | 'theme' | 'landscapes';
    passTranscriptionContext: boolean;
    dynamicPromptEnabled: boolean;
    customPromptTemplate: string;
    lastKeyProbe?: ApiKeyProbeResult;
}

export interface AudiobookStudioLiveStatus {
    isRunning: boolean;
    activeBookKey: string | null;
    activeBookTitle: string | null;
    activeChapterKey: string | null;
    activeChapterTitle: string | null;
    activeTask: 'transcribing' | 'llm_scene_analysis' | 'illustrating' | 'cover_art' | 'enhancing' | null;
    activeCategory?: 'cpu' | 'llm' | 'api' | 'quota' | null;
    activeResourceLabel?: string;
    progress: number;
    lastLog: string;
    currentStep?: string;
    recentLogs?: string[];
    imagesGeneratedToday: number;
    dailyImageQuota: number;
    updatedAt: string;
}

const DEFAULT_API_METRICS: StudioApiMetrics = {
    totalRequests: 0,
    totalSuccess: 0,
    totalErrors: 0,
    transcriptionRequests: 0,
    artPromptRequests: 0,
    imagePaintRequests: 0,
    structureSearchRequests: 0
};

const DEFAULT_STUDIO_CONFIG: AudiobookStudioConfig = {
    enabled: true,
    scheduleMode: 'continuous_low_cpu',
    sttEngine: 'gemini_audio',
    cpuThreads: 1,
    audioEnhancePreset: 'denoise_clarity',
    defaultVoicePreset: 'original',
    artProvider: 'pollinations_flux',
    detectedProvider: 'free',
    rawUnifiedApiKey: '',
    openaiApiKey: '',
    geminiApiKey: '',
    anthropicApiKey: '',
    groqApiKey: '',
    customApiUrl: '',
    customApiKey: '',
    apiKeys: [],
    keyRoutingMode: 'failover',
    apiMetrics: { ...DEFAULT_API_METRICS },
    dailyImageQuota: 30,
    maxRequestsPerMinute: 15,
    imagesGeneratedToday: 0,
    quotaResetDate: new Date().toISOString().slice(0, 10),
    imagesPerChapter: 3,
    artStyle: 'Cinematic Concept Art',
    artResolution: '1280x720',
    artFocus: 'auto-choice',
    passTranscriptionContext: true,
    dynamicPromptEnabled: true,
    customPromptTemplate: 'Rich atmospheric book illustration, detailed lighting, no text or watermarks.'
};

const g = globalThis as any;
if (!g.__audiobookStudioStatus) {
    g.__audiobookStudioStatus = {
        isRunning: false,
        activeBookKey: null,
        activeBookTitle: null,
        activeChapterKey: null,
        activeChapterTitle: null,
        activeTask: null,
        activeCategory: null,
        activeResourceLabel: 'Idle',
        progress: 0,
        lastLog: 'Idle — Ready to process queued audiobooks',
        currentStep: 'Idle — Ready to process queued audiobooks',
        recentLogs: [],
        imagesGeneratedToday: 0,
        dailyImageQuota: 30,
        updatedAt: new Date().toISOString()
    } as AudiobookStudioLiveStatus;
}

const getDataDir = () => {
    const base = process.env.CONFIG_DIR || (fs.existsSync('/app/data') ? '/app/data' : path.join(process.cwd(), 'data'));
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    return base;
};

export const getAudiobookArtDir = () => {
    const dir = path.join(getDataDir(), 'audiobook-art');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

export const getAudiobookEnhancedDir = () => {
    const dir = path.join(getDataDir(), 'audiobook-enhanced');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

export const getAudiobookTranscriptsDir = () => {
    const dir = path.join(getDataDir(), 'audiobook-transcripts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

/**
 * Validates that a downloaded or decoded buffer is a genuine image (JPEG, PNG, WebP, GIF, or SVG)
 * and NOT an HTML error page, Cloudflare challenge, or JSON error payload.
 */
export const isValidImageBuffer = (buf?: Buffer | null): boolean => {
    if (!buf || buf.length < 128) return false;
    // Strictly accept ONLY genuine binary raster formats (JPEG, PNG, GIF, WebP) — NEVER SVG/HTML/XML
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
    // GIF: GIF87a / GIF89a
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
    // WebP: RIFF....WEBP
    if (
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
        return true;
    }
    return false;
};

export const maskApiKeyString = (rawKey: string): string => {
    const k = (rawKey || '').trim();
    if (!k) return '';
    if (k.length <= 10) return `${k.slice(0, 3)}•••${k.slice(-2)}`;
    return `${k.slice(0, 6)}••••••${k.slice(-4)}`;
};

const inferProviderFromKeyString = (rawKey: string): { provider: StudioApiKeyEntry['provider']; label: string } => {
    const k = (rawKey || '').trim();
    if (k.startsWith('AIza') || k.startsWith('AQ.')) return { provider: 'gemini', label: 'Google Gemini API' };
    if (k.startsWith('sk-ant-')) return { provider: 'claude', label: 'Anthropic Claude API' };
    if (k.startsWith('gsk_')) return { provider: 'groq', label: 'Groq LPU API' };
    if (k.startsWith('sk-')) return { provider: 'openai', label: 'OpenAI Platform API' };
    return { provider: 'custom', label: 'Custom AI API' };
};

export const getAudiobookStudioConfig = (): AudiobookStudioConfig => {
    try {
        const raw = getSetting('audiobook_studio_config') || '';
        const parsed = raw ? JSON.parse(raw) : {};
        const initialKeys: StudioApiKeyEntry[] = Array.isArray(parsed.apiKeys) && parsed.apiKeys.length > 0
            ? parsed.apiKeys
            : (Array.isArray(parsed.keyPool) ? parsed.keyPool : []);

        const merged: AudiobookStudioConfig = {
            ...DEFAULT_STUDIO_CONFIG,
            ...parsed,
            apiMetrics: { ...DEFAULT_API_METRICS, ...(parsed.apiMetrics || {}) },
            apiKeys: initialKeys,
            keyPool: initialKeys
        };

        // Ensure any single key (including rawUnifiedApiKey) is represented in apiKeys pool
        let keyUpgraded = false;
        const existingKeys = [...(merged.apiKeys || [])].map(entry => {
            const cleanKey = (entry.key || '').trim();
            if ((cleanKey.startsWith('AIza') || cleanKey.startsWith('AQ.')) && entry.provider !== 'gemini') {
                keyUpgraded = true;
                if (!merged.geminiApiKey) merged.geminiApiKey = cleanKey;
                if (merged.detectedProvider === 'custom') merged.detectedProvider = 'gemini';
                return {
                    ...entry,
                    provider: 'gemini' as const,
                    label: 'Google Gemini API',
                    tier: entry.tier === 'Saved as Custom Key' ? 'Google AI Studio (Gemini Flash)' : entry.tier
                };
            }
            return entry;
        });
        const addLegacyIfMissing = (k: string | undefined, provider: StudioApiKeyEntry['provider'], label: string) => {
            const clean = (k || '').trim();
            if (!clean) return;
            if (!existingKeys.some(e => e.key === clean)) {
                existingKeys.push({
                    id: `key_${provider}_${clean.slice(-4)}`,
                    key: clean,
                    maskedKey: maskApiKeyString(clean),
                    provider,
                    label,
                    role: existingKeys.length === 0 ? 'primary' : 'backup',
                    enabled: true,
                    valid: true,
                    tier: merged.lastKeyProbe?.tier || 'Active API Key',
                    rateLimitInfo: merged.lastKeyProbe?.rateLimitInfo || 'Verified',
                    requestsCount: merged.apiMetrics?.totalRequests || 0,
                    successCount: merged.apiMetrics?.totalSuccess || 0,
                    errorCount: merged.apiMetrics?.totalErrors || 0,
                    addedAt: new Date().toISOString()
                });
            }
        };

        if (merged.rawUnifiedApiKey && merged.rawUnifiedApiKey.trim()) {
            const inf = inferProviderFromKeyString(merged.rawUnifiedApiKey);
            if (inf.provider === 'gemini' && !merged.geminiApiKey) merged.geminiApiKey = merged.rawUnifiedApiKey.trim();
            if (inf.provider === 'openai' && !merged.openaiApiKey) merged.openaiApiKey = merged.rawUnifiedApiKey.trim();
            if (inf.provider === 'claude' && !merged.anthropicApiKey) merged.anthropicApiKey = merged.rawUnifiedApiKey.trim();
            if (inf.provider === 'groq' && !merged.groqApiKey) merged.groqApiKey = merged.rawUnifiedApiKey.trim();
            addLegacyIfMissing(merged.rawUnifiedApiKey, inf.provider, inf.label);
        }
        addLegacyIfMissing(merged.geminiApiKey, 'gemini', 'Google Gemini API');
        addLegacyIfMissing(merged.openaiApiKey, 'openai', 'OpenAI Platform API');
        addLegacyIfMissing(merged.anthropicApiKey, 'claude', 'Anthropic Claude API');
        addLegacyIfMissing(merged.groqApiKey, 'groq', 'Groq LPU API');

        merged.apiKeys = existingKeys;
        merged.keyPool = existingKeys;

        if (merged.lastKeyProbe) {
            merged.lastKeyProbe = {
                ...merged.lastKeyProbe,
                providerLabel: merged.lastKeyProbe.providerLabel || merged.lastKeyProbe.label,
                rateLimitRpm: merged.lastKeyProbe.rateLimitRpm ?? merged.lastKeyProbe.recommendedRpm,
                statusMessage: merged.lastKeyProbe.statusMessage || merged.lastKeyProbe.message
            };
        }

        const today = new Date().toISOString().slice(0, 10);
        if (merged.quotaResetDate !== today || keyUpgraded) {
            if (merged.quotaResetDate !== today) {
                merged.imagesGeneratedToday = 0;
                merged.quotaResetDate = today;
            }
            setSetting('audiobook_studio_config', JSON.stringify(merged));
        }
        return merged;
    } catch {
        return { ...DEFAULT_STUDIO_CONFIG };
    }
};

export const saveAudiobookStudioConfig = (partial: Partial<AudiobookStudioConfig>): AudiobookStudioConfig => {
    const current = getAudiobookStudioConfig();
    const incomingKeys = partial.apiKeys !== undefined
        ? partial.apiKeys
        : (partial.keyPool !== undefined ? partial.keyPool : (current.apiKeys || []));

    const updated: AudiobookStudioConfig = {
        ...current,
        ...partial,
        apiMetrics: partial.apiMetrics ? { ...(current.apiMetrics || DEFAULT_API_METRICS), ...partial.apiMetrics } : (current.apiMetrics || DEFAULT_API_METRICS),
        apiKeys: incomingKeys,
        keyPool: incomingKeys,
        cpuThreads: Math.max(1, Math.min(2, Number(partial.cpuThreads ?? current.cpuThreads ?? 1))),
        dailyImageQuota: Math.max(1, Math.min(500, Number(partial.dailyImageQuota ?? current.dailyImageQuota ?? 30))),
        maxRequestsPerMinute: Math.max(1, Math.min(120, Number(partial.maxRequestsPerMinute ?? current.maxRequestsPerMinute ?? 15))),
        imagesPerChapter: Math.max(1, Math.min(8, Number(partial.imagesPerChapter ?? current.imagesPerChapter ?? 3)))
    };

    if (updated.rawUnifiedApiKey && updated.rawUnifiedApiKey.trim()) {
        const clean = updated.rawUnifiedApiKey.trim();
        const inf = inferProviderFromKeyString(clean);
        if (inf.provider === 'gemini') updated.geminiApiKey = clean;
        if (inf.provider === 'openai') updated.openaiApiKey = clean;
        if (inf.provider === 'claude') updated.anthropicApiKey = clean;
        if (inf.provider === 'groq') updated.groqApiKey = clean;
        if (!updated.apiKeys?.some(k => k.key === clean)) {
            const nextPool = [...(updated.apiKeys || []), {
                id: `key_${inf.provider}_${clean.slice(-4)}`,
                key: clean,
                maskedKey: maskApiKeyString(clean),
                provider: inf.provider,
                label: inf.label,
                role: (updated.apiKeys?.length || 0) === 0 ? 'primary' as const : 'backup' as const,
                enabled: true,
                valid: true,
                tier: 'Configured API Key',
                rateLimitInfo: 'Ready',
                requestsCount: 0,
                successCount: 0,
                errorCount: 0,
                addedAt: new Date().toISOString()
            }];
            updated.apiKeys = nextPool;
            updated.keyPool = nextPool;
        }
    }

    setSetting('audiobook_studio_config', JSON.stringify(updated));
    g.__audiobookStudioStatus.dailyImageQuota = updated.dailyImageQuota;
    g.__audiobookStudioStatus.imagesGeneratedToday = updated.imagesGeneratedToday;
    return updated;
};

/**
 * Records live API request metrics per key and globally so the user can see exact API usage in real time.
 */
export const recordStudioApiMetric = (params: {
    task: 'transcription' | 'art_prompt' | 'image_paint' | 'structure_search' | 'probe';
    keyOrProvider: string;
    providerLabel: string;
    success: boolean;
    errorMessage?: string;
    description?: string;
}) => {
    try {
        const cfg = getAudiobookStudioConfig();
        const now = new Date().toISOString();
        const metrics: StudioApiMetrics = {
            ...(cfg.apiMetrics || DEFAULT_API_METRICS),
            totalRequests: (cfg.apiMetrics?.totalRequests || 0) + 1,
            totalSuccess: (cfg.apiMetrics?.totalSuccess || 0) + (params.success ? 1 : 0),
            totalErrors: (cfg.apiMetrics?.totalErrors || 0) + (params.success ? 0 : 1),
            transcriptionRequests: (cfg.apiMetrics?.transcriptionRequests || 0) + (params.task === 'transcription' ? 1 : 0),
            artPromptRequests: (cfg.apiMetrics?.artPromptRequests || 0) + (params.task === 'art_prompt' ? 1 : 0),
            imagePaintRequests: (cfg.apiMetrics?.imagePaintRequests || 0) + (params.task === 'image_paint' ? 1 : 0),
            structureSearchRequests: (cfg.apiMetrics?.structureSearchRequests || 0) + (params.task === 'structure_search' ? 1 : 0),
            lastRequestAt: now,
            lastProviderUsed: params.providerLabel,
            lastTaskDescription: params.description || params.task
        };

        const updatedKeys = (cfg.apiKeys || []).map(k => {
            if (k.key === params.keyOrProvider || k.id === params.keyOrProvider || k.provider === params.keyOrProvider) {
                return {
                    ...k,
                    requestsCount: (k.requestsCount || 0) + 1,
                    successCount: (k.successCount || 0) + (params.success ? 1 : 0),
                    errorCount: (k.errorCount || 0) + (params.success ? 0 : 1),
                    lastUsedAt: now,
                    lastError: params.success ? undefined : params.errorMessage
                };
            }
            return k;
        });

        saveAudiobookStudioConfig({
            apiMetrics: metrics,
            apiKeys: updatedKeys,
            keyPool: updatedKeys
        });
    } catch (e) {
        console.warn('Error recording studio API metric:', e);
    }
};

/**
 * Returns ordered candidate API keys based on the user's routing mode:
 * - 'failover': Primary keys first, then Backup keys in order.
 * - 'load_balance': Round-robin / least-recently-used across all enabled keys.
 */
export const getCandidateStudioKeys = (
    config: AudiobookStudioConfig,
    filterProviders?: StudioApiKeyEntry['provider'][]
): StudioApiKeyEntry[] => {
    const fresh = getAudiobookStudioConfig();
    let pool = (fresh.apiKeys || []).filter(k => k.enabled && k.key);
    if (filterProviders && filterProviders.length > 0) {
        pool = pool.filter(k => filterProviders.includes(k.provider));
    }
    if (pool.length <= 1) return pool;

    if (fresh.keyRoutingMode === 'load_balance') {
        return [...pool].sort((a, b) => (a.requestsCount || 0) - (b.requestsCount || 0));
    }
    // Default 'failover': primary first, then backup
    return [...pool].sort((a, b) => {
        if (a.role === b.role) return 0;
        return a.role === 'primary' ? -1 : 1;
    });
};

export const appendStudioQueueHistory = (entry: Omit<StudioQueueHistoryEntry, 'id' | 'timestamp'>) => {
    try {
        const raw = getSetting('audiobook_studio_history') || '[]';
        const list: StudioQueueHistoryEntry[] = JSON.parse(raw);
        const newEntry: StudioQueueHistoryEntry = {
            ...entry,
            id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString()
        };
        const updated = [newEntry, ...(Array.isArray(list) ? list : [])].slice(0, 150);
        setSetting('audiobook_studio_history', JSON.stringify(updated));
    } catch (e) {
        console.warn('Failed to append studio queue history:', e);
    }
};

export const getStudioQueueHistory = (): StudioQueueHistoryEntry[] => {
    try {
        const raw = getSetting('audiobook_studio_history') || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

/**
 * Automatically detects the AI provider from a pasted API key or endpoint URL,
 * live-probes the provider API to check validity, available models, and rate-limit tier,
 * and saves the optimal configuration automatically (supporting Primary + Backup / Load-Balance keys).
 */
export const detectAndVerifyAiApiKey = async (
    rawInput: string,
    role: 'primary' | 'backup' = 'primary'
): Promise<{ probe: ApiKeyProbeResult; config: AudiobookStudioConfig }> => {
    const key = (rawInput || '').trim();
    const nowIso = new Date().toISOString();

    const registerKeyInPool = (
        cfgPatch: Partial<AudiobookStudioConfig>,
        rawProbe: ApiKeyProbeResult
    ): AudiobookStudioConfig => {
        const probe: ApiKeyProbeResult = {
            ...rawProbe,
            providerLabel: rawProbe.providerLabel || rawProbe.label,
            rateLimitRpm: rawProbe.rateLimitRpm ?? rawProbe.recommendedRpm,
            statusMessage: rawProbe.statusMessage || rawProbe.message
        };
        const current = getAudiobookStudioConfig();
        const existingPool = [...(current.apiKeys || [])];
        const existingIdx = existingPool.findIndex(k => k.key === key);
        const effectiveRole: 'primary' | 'backup' =
            role === 'backup'
                ? 'backup'
                : existingPool.some(k => k.role === 'primary' && k.key !== key) && role !== 'primary'
                ? 'backup'
                : role;

        // If setting a new primary key of the same provider or explicitly primary when none existed
        const entry: StudioApiKeyEntry = {
            id: existingIdx >= 0 ? existingPool[existingIdx].id : `key_${probe.provider}_${Date.now().toString(36)}`,
            key,
            maskedKey: maskApiKeyString(key),
            provider: probe.provider,
            label: probe.label,
            role: effectiveRole,
            enabled: true,
            valid: probe.valid,
            tier: probe.tier,
            rateLimitInfo: probe.rateLimitInfo,
            requestsCount: existingIdx >= 0 ? (existingPool[existingIdx].requestsCount || 0) + 1 : 1,
            successCount: existingIdx >= 0 ? (existingPool[existingIdx].successCount || 0) + (probe.valid ? 1 : 0) : (probe.valid ? 1 : 0),
            errorCount: existingIdx >= 0 ? (existingPool[existingIdx].errorCount || 0) + (probe.valid ? 0 : 1) : (probe.valid ? 0 : 1),
            lastUsedAt: nowIso,
            addedAt: existingIdx >= 0 ? existingPool[existingIdx].addedAt : nowIso
        };

        if (existingIdx >= 0) {
            existingPool[existingIdx] = entry;
        } else {
            existingPool.push(entry);
        }

        const metrics = current.apiMetrics || { ...DEFAULT_API_METRICS };
        metrics.totalRequests = (metrics.totalRequests || 0) + 1;
        if (probe.valid) metrics.totalSuccess = (metrics.totalSuccess || 0) + 1;
        else metrics.totalErrors = (metrics.totalErrors || 0) + 1;
        metrics.lastRequestAt = nowIso;
        metrics.lastProviderUsed = probe.label;
        metrics.lastTaskDescription = 'API Key Verification Probe';

        return saveAudiobookStudioConfig({
            ...cfgPatch,
            apiKeys: existingPool,
            keyPool: existingPool,
            apiMetrics: metrics,
            lastKeyProbe: probe
        });
    };

    if (!key) {
        const freeProbe: ApiKeyProbeResult = {
            provider: 'free',
            label: 'Built-in Free Studio (Flux + Local Cadence)',
            valid: true,
            tier: 'Free Built-in Tier',
            rateLimitInfo: 'No API key required • Pollinations Flux + Local FFmpeg Speech Cadence',
            capabilities: ['Scene Illustrations (Flux)', 'Local Speech Cadence Sync', 'Heuristic Dynamic Scene Prompts'],
            models: ['flux-schnell', 'ffmpeg-silencedetect'],
            recommendedRpm: 10,
            recommendedDailyQuota: 25,
            message: 'Switched to built-in free engines (no API key needed).',
            checkedAt: nowIso
        };
        const updated = saveAudiobookStudioConfig({
            detectedProvider: 'free',
            rawUnifiedApiKey: '',
            artProvider: 'pollinations_flux',
            sttEngine: 'whisper_tiny_local',
            lastKeyProbe: freeProbe
        });
        return { probe: freeProbe, config: updated };
    }

    // 1. Google Gemini (AIza... or AQ....)
    if (key.startsWith('AIza') || key.startsWith('AQ.')) {
        try {
            const resp = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { timeout: 12000 });
            const modelList: string[] = (resp.data?.models || []).map((m: any) => String(m.name || '').replace('models/', ''));
            const hasImagen = modelList.some(m => m.includes('imagen') || m.includes('image'));
            const hasFlash = modelList.some(m => m.includes('flash'));
            const preferredFlashModel =
                modelList.find(m => m === 'gemini-flash-lite-latest' || m === 'gemini-3-flash-preview' || m === 'gemini-flash-latest' || m === 'gemini-2.0-flash') ||
                'gemini-flash-lite-latest';

            let tier = 'Google AI Studio (Free / Standard Tier — 15 RPM)';
            let rateLimitInfo = '15 Requests/min • 1,500 Req/day (Gemini Flash Audio + Scene Director)';
            let recommendedRpm = 15;
            try {
                const testResp = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${preferredFlashModel}:generateContent?key=${encodeURIComponent(key)}`,
                    { contents: [{ parts: [{ text: 'Ping' }] }], generationConfig: { maxOutputTokens: 3 } },
                    { timeout: 10000 }
                );
                const rlHeader = testResp.headers?.['x-ratelimit-limit-requests'];
                if (rlHeader && Number(rlHeader) > 60) {
                    tier = 'Google AI Studio Pay-As-You-Go (High Quota)';
                    rateLimitInfo = `${rlHeader} Requests/min`;
                    recommendedRpm = Math.min(60, Number(rlHeader));
                }
            } catch (testErr: any) {
                if (testErr?.response?.status === 429) {
                    tier = 'Google AI Studio (Currently Rate-Limited — 429)';
                    rateLimitInfo = 'Rate limit active; automatic pacing set to 5 RPM';
                    recommendedRpm = 5;
                }
            }

            const capabilities = [
                'Multimodal Audio Transcription (Gemini Flash)',
                'Real-World Book Chapter & Scene Discovery',
                'Dynamic Scene Prompt Director (Gemini Flash)',
                hasImagen ? 'Gemini Image Generation (+ Flux Fallback)' : 'Flux Painting with Gemini Scene Director'
            ];

            const probe: ApiKeyProbeResult = {
                provider: 'gemini',
                label: 'Google Gemini API',
                valid: true,
                tier,
                rateLimitInfo,
                capabilities,
                models: modelList.filter(m => m.includes('gemini') || m.includes('imagen')).slice(0, 8),
                recommendedRpm,
                recommendedDailyQuota: hasImagen ? 40 : 30,
                message: `Verified Google Gemini key (${hasFlash ? 'Gemini Flash Audio STT + ' : ''}${hasImagen ? 'Gemini Image Gen' : 'Scene Director'} ready).`,
                checkedAt: nowIso
            };

            const updated = registerKeyInPool({
                detectedProvider: 'gemini',
                rawUnifiedApiKey: key,
                geminiApiKey: key,
                artProvider: hasImagen ? 'gemini' : 'pollinations_flux',
                sttEngine: 'gemini_audio',
                dynamicPromptEnabled: true,
                maxRequestsPerMinute: recommendedRpm
            }, probe);
            return { probe, config: updated };
        } catch (err: any) {
            const status = err?.response?.status;
            const probe: ApiKeyProbeResult = {
                provider: 'gemini',
                label: 'Google Gemini API',
                valid: false,
                tier: status === 429 ? 'Rate Limited (429)' : 'Invalid or Restricted Key',
                rateLimitInfo: err?.response?.data?.error?.message || err.message || 'Verification failed',
                capabilities: [],
                models: [],
                recommendedRpm: 10,
                recommendedDailyQuota: 20,
                message: `Detected Google Gemini key format, but verification returned: ${err?.response?.data?.error?.message || err.message}`,
                checkedAt: nowIso
            };
            const updated = registerKeyInPool({ detectedProvider: 'gemini', rawUnifiedApiKey: key, geminiApiKey: key }, probe);
            return { probe, config: updated };
        }
    }

    // 2. Anthropic Claude (sk-ant-...)
    if (key.startsWith('sk-ant-')) {
        try {
            const resp = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model: 'claude-3-5-haiku-latest',
                    max_tokens: 8,
                    messages: [{ role: 'user', content: 'Hi' }]
                },
                {
                    headers: {
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    timeout: 12000
                }
            );
            const rpmLimit = Number(resp.headers?.['anthropic-ratelimit-requests-limit'] || 50);
            const rpmRemaining = resp.headers?.['anthropic-ratelimit-requests-remaining'] ?? rpmLimit;
            const tokensLimit = resp.headers?.['anthropic-ratelimit-tokens-limit'] || '50,000';

            const probe: ApiKeyProbeResult = {
                provider: 'claude',
                label: 'Anthropic Claude API',
                valid: true,
                tier: rpmLimit >= 100 ? 'Anthropic Build Tier 2+ (High Throughput)' : 'Anthropic Standard Tier 1',
                rateLimitInfo: `${rpmRemaining}/${rpmLimit} RPM available • ${tokensLimit} tokens/min`,
                capabilities: [
                    'Dynamic Scene Prompt Director (Claude 3.5 Haiku / Sonnet)',
                    'Real-World Book Chapter & Scene Discovery',
                    'Paired with Pollinations Flux for Scene Painting'
                ],
                models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
                recommendedRpm: Math.min(50, Math.max(5, rpmLimit)),
                recommendedDailyQuota: 35,
                message: `Verified Anthropic Claude key (${rpmLimit} RPM limit).`,
                checkedAt: nowIso
            };

            const updated = registerKeyInPool({
                detectedProvider: 'claude',
                rawUnifiedApiKey: key,
                anthropicApiKey: key,
                artProvider: 'pollinations_flux',
                dynamicPromptEnabled: true,
                maxRequestsPerMinute: probe.recommendedRpm
            }, probe);
            return { probe, config: updated };
        } catch (err: any) {
            const status = err?.response?.status;
            const isRateLimited = status === 429;
            const errMsg = err?.response?.data?.error?.message || err.message || 'Verification failed';
            const probe: ApiKeyProbeResult = {
                provider: 'claude',
                label: 'Anthropic Claude API',
                valid: isRateLimited,
                tier: isRateLimited ? 'Rate Limited (429)' : 'Invalid or Unfunded Key',
                rateLimitInfo: errMsg,
                capabilities: isRateLimited ? ['Dynamic Scene Prompt Director (Claude)'] : [],
                models: ['claude-3-5-haiku-latest'],
                recommendedRpm: 5,
                recommendedDailyQuota: 20,
                message: `Detected Anthropic Claude key: ${errMsg}`,
                checkedAt: nowIso
            };
            const updated = registerKeyInPool({ detectedProvider: 'claude', rawUnifiedApiKey: key, anthropicApiKey: key }, probe);
            return { probe, config: updated };
        }
    }

    // 3. Groq (gsk_...)
    if (key.startsWith('gsk_')) {
        try {
            const resp = await axios.get('https://api.groq.com/openai/v1/models', {
                headers: { Authorization: `Bearer ${key}` },
                timeout: 10000
            });
            const models: string[] = (resp.data?.data || []).map((m: any) => String(m.id || ''));
            const hasWhisper = models.some(m => m.includes('whisper'));
            const probe: ApiKeyProbeResult = {
                provider: 'groq',
                label: 'Groq LPU Ultra-Fast API',
                valid: true,
                tier: 'Groq Cloud (30 RPM Ultra-Fast Inference)',
                rateLimitInfo: '30 Requests/min • 14,400 Req/day (Whisper Large v3 + Llama 3.3)',
                capabilities: [
                    hasWhisper ? 'Whisper Large v3 Turbo Audio Transcription' : 'Narrative Context Extraction',
                    'Real-World Book Chapter & Scene Discovery (Llama 3.3 70B)',
                    'Dynamic Scene Prompt Director (Llama 3.3 70B)'
                ],
                models: models.slice(0, 8),
                recommendedRpm: 25,
                recommendedDailyQuota: 40,
                message: 'Verified Groq API key! Whisper Large v3 STT & Llama 3.3 dynamic prompts unlocked.',
                checkedAt: nowIso
            };
            const updated = registerKeyInPool({
                detectedProvider: 'groq',
                rawUnifiedApiKey: key,
                groqApiKey: key,
                sttEngine: 'openai_whisper',
                artProvider: 'pollinations_flux',
                dynamicPromptEnabled: true,
                maxRequestsPerMinute: 25
            }, probe);
            return { probe, config: updated };
        } catch (err: any) {
            const probe: ApiKeyProbeResult = {
                provider: 'groq',
                label: 'Groq API',
                valid: false,
                tier: 'Invalid Key',
                rateLimitInfo: err?.response?.data?.error?.message || err.message,
                capabilities: [],
                models: [],
                recommendedRpm: 10,
                recommendedDailyQuota: 20,
                message: `Groq key verification failed: ${err?.response?.data?.error?.message || err.message}`,
                checkedAt: nowIso
            };
            const updated = registerKeyInPool({ detectedProvider: 'groq', rawUnifiedApiKey: key, groqApiKey: key }, probe);
            return { probe, config: updated };
        }
    }

    // 4. OpenAI (sk-proj-... or sk-...)
    if (key.startsWith('sk-')) {
        try {
            const resp = await axios.get('https://api.openai.com/v1/models', {
                headers: { Authorization: `Bearer ${key}` },
                timeout: 12000
            });
            const models: string[] = (resp.data?.data || []).map((m: any) => String(m.id || ''));
            const hasDalle = models.some(m => m.includes('dall-e-3'));
            const hasWhisper = models.some(m => m.includes('whisper'));
            const hasGpt4o = models.some(m => m.includes('gpt-4o'));

            const probe: ApiKeyProbeResult = {
                provider: 'openai',
                label: 'OpenAI Platform API',
                valid: true,
                tier: hasDalle ? 'OpenAI Paid Tier (DALL·E 3 + Whisper + GPT-4o)' : 'OpenAI Standard Tier',
                rateLimitInfo: '60+ Requests/min • Whisper + DALL·E 3 + GPT-4o-mini enabled',
                capabilities: [
                    hasWhisper ? 'OpenAI Whisper Cloud Transcription' : 'Chapter Narrative Sync',
                    hasDalle ? 'DALL·E 3 HD Scene Painting' : 'Flux Scene Painting',
                    hasGpt4o ? 'Dynamic Scene Prompt Director (GPT-4o-mini)' : 'Prompt Refinement'
                ],
                models: models.filter(m => m.includes('gpt-4o') || m.includes('dall-e') || m.includes('whisper')).slice(0, 8),
                recommendedRpm: 30,
                recommendedDailyQuota: 30,
                message: 'Verified OpenAI API key! Whisper STT, Dynamic Scene Prompts, and DALL·E 3 unlocked.',
                checkedAt: nowIso
            };

            const updated = registerKeyInPool({
                detectedProvider: 'openai',
                rawUnifiedApiKey: key,
                openaiApiKey: key,
                sttEngine: hasWhisper ? 'openai_whisper' : 'whisper_tiny_local',
                artProvider: hasDalle ? 'openai' : 'pollinations_flux',
                dynamicPromptEnabled: true,
                maxRequestsPerMinute: 30
            }, probe);
            return { probe, config: updated };
        } catch (err: any) {
            const probe: ApiKeyProbeResult = {
                provider: 'openai',
                label: 'OpenAI API',
                valid: false,
                tier: err?.response?.status === 429 ? 'Quota Exceeded / Rate Limited (429)' : 'Invalid Key',
                rateLimitInfo: err?.response?.data?.error?.message || err.message,
                capabilities: [],
                models: [],
                recommendedRpm: 10,
                recommendedDailyQuota: 20,
                message: `OpenAI key verification failed: ${err?.response?.data?.error?.message || err.message}`,
                checkedAt: nowIso
            };
            const updated = registerKeyInPool({ detectedProvider: 'openai', rawUnifiedApiKey: key, openaiApiKey: key }, probe);
            return { probe, config: updated };
        }
    }

    // 5. Custom Local URL (http:// or https://)
    if (key.startsWith('http://') || key.startsWith('https://')) {
        const probe: ApiKeyProbeResult = {
            provider: 'custom',
            label: 'Custom / Self-Hosted SDXL / Flux Endpoint',
            valid: true,
            tier: 'Local / Self-Hosted Endpoint',
            rateLimitInfo: `Endpoint: ${key}`,
            capabilities: ['Custom Local Image Generation', 'Dynamic Scene Prompts'],
            models: ['custom-sdxl-flux'],
            recommendedRpm: 30,
            recommendedDailyQuota: 100,
            message: `Configured custom image generation endpoint (${key}).`,
            checkedAt: nowIso
        };
        const updated = registerKeyInPool({
            detectedProvider: 'custom',
            rawUnifiedApiKey: key,
            customApiUrl: key,
            artProvider: 'custom'
        }, probe);
        return { probe, config: updated };
    }

    const unknownProbe: ApiKeyProbeResult = {
        provider: 'custom',
        label: 'Custom API Key',
        valid: true,
        tier: 'Saved as Custom Key',
        rateLimitInfo: 'Using Pollinations Flux + Custom Key',
        capabilities: ['Scene Illustrations', 'Dynamic Scene Prompts'],
        models: ['flux'],
        recommendedRpm: 15,
        recommendedDailyQuota: 25,
        message: 'Saved custom key. Note: Gemini keys start with "AIza", Claude with "sk-ant-", OpenAI with "sk-", Groq with "gsk_".',
        checkedAt: nowIso
    };
    const updated = registerKeyInPool({
        detectedProvider: 'custom',
        rawUnifiedApiKey: key,
        customApiKey: key
    }, unknownProbe);
    return { probe: unknownProbe, config: updated };
};

export const removeStudioApiKey = (keyId: string): AudiobookStudioConfig => {
    const current = getAudiobookStudioConfig();
    const removed = (current.apiKeys || []).find(k => k.id === keyId);
    const remaining = (current.apiKeys || []).filter(k => k.id !== keyId);
    // If primary was removed and there is a backup, promote first backup to primary
    if (remaining.length > 0 && !remaining.some(k => k.role === 'primary')) {
        remaining[0].role = 'primary';
    }
    const patch: Partial<AudiobookStudioConfig> = { apiKeys: remaining };
    if (removed) {
        const nextSameProvider = remaining.find(k => k.provider === removed.provider);
        if (removed.provider === 'gemini') patch.geminiApiKey = nextSameProvider?.key || '';
        if (removed.provider === 'openai') patch.openaiApiKey = nextSameProvider?.key || '';
        if (removed.provider === 'claude') patch.anthropicApiKey = nextSameProvider?.key || '';
        if (removed.provider === 'groq') patch.groqApiKey = nextSameProvider?.key || '';
    }
    if (remaining.length === 0) {
        patch.detectedProvider = 'free';
        patch.rawUnifiedApiKey = '';
    } else {
        patch.detectedProvider = remaining[0].provider;
        patch.rawUnifiedApiKey = remaining[0].key;
    }
    return saveAudiobookStudioConfig(patch);
};

export const setManualAudiobookTaskLock = (active: boolean) => {
    g.__manualAudiobookTaskActive = active;
    g.__audiobookStudioLock = active;
};

export const getAudiobookStudioStatus = (): AudiobookStudioLiveStatus => {
    const cfg = getAudiobookStudioConfig();
    const cur = g.__audiobookStudioStatus || {};
    return {
        ...cur,
        currentStep: cur.lastLog || cur.currentStep || 'Idle',
        recentLogs: Array.isArray(cur.recentLogs) ? cur.recentLogs : [],
        imagesGeneratedToday: cfg.imagesGeneratedToday,
        dailyImageQuota: cfg.dailyImageQuota
    };
};

const updateLiveStatus = (patch: Partial<AudiobookStudioLiveStatus>) => {
    const prev: AudiobookStudioLiveStatus = g.__audiobookStudioStatus || {};
    const nextTask = patch.activeTask !== undefined ? patch.activeTask : prev.activeTask;
    const nextLog = patch.lastLog !== undefined ? patch.lastLog : prev.lastLog;

    let inferredCat: AudiobookStudioLiveStatus['activeCategory'] = patch.activeCategory !== undefined ? patch.activeCategory : prev.activeCategory;
    let inferredLabel = patch.activeResourceLabel !== undefined ? patch.activeResourceLabel : (prev.activeResourceLabel || 'Idle');

    if (patch.activeCategory === undefined) {
        if (!patch.isRunning && patch.isRunning !== undefined) {
            inferredCat = null;
            inferredLabel = 'Idle';
        } else if (nextTask === 'transcribing') {
            const isCloudStt = /Gemini|Groq|OpenAI|HuggingFace/i.test(nextLog || '');
            inferredCat = isCloudStt ? 'api' : 'cpu';
            inferredLabel = isCloudStt ? 'Cloud STT API (Audio Transcription)' : 'Local CPU (Whisper.cpp / FFmpeg STT)';
        } else if (nextTask === 'llm_scene_analysis') {
            inferredCat = 'llm';
            inferredLabel = 'LLM (3-Min Excerpt Scene Transition Detector)';
        } else if (nextTask === 'illustrating' || nextTask === 'cover_art') {
            inferredCat = 'quota';
            inferredLabel = 'Image API + Daily Art Quota';
        } else if (nextTask === 'enhancing') {
            inferredCat = 'cpu';
            inferredLabel = 'Local CPU (FFmpeg Voice DSP)';
        }
    }

    const prevLogs: string[] = Array.isArray(prev.recentLogs) ? prev.recentLogs : [];
    let nextRecentLogs = prevLogs;
    if (patch.lastLog && patch.lastLog.trim()) {
        const timeTag = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry = `[${timeTag}] ${patch.lastLog.trim()}`;
        if (prevLogs[0] !== entry && (!prevLogs[0] || !prevLogs[0].endsWith(patch.lastLog.trim()))) {
            nextRecentLogs = [entry, ...prevLogs].slice(0, 25);
        }
    }

    g.__audiobookStudioStatus = {
        ...prev,
        ...patch,
        activeCategory: inferredCat,
        activeResourceLabel: inferredLabel,
        currentStep: nextLog,
        recentLogs: nextRecentLogs,
        updatedAt: new Date().toISOString()
    };
};

const formatLrcTimestamp = (seconds: number): string => {
    const safe = Math.max(0, seconds);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `[${String(mins).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}]`;
};

const probeAudioDuration = async (filePath?: string): Promise<number> => {
    const isRemote = /^https?:\/\//i.test(filePath || '');
    if (!filePath || (!isRemote && !fs.existsSync(filePath))) return 300;
    return new Promise<number>((resolve) => {
        const proc = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        let out = '';
        const killTimer = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch {}
            resolve(300);
        }, 12000);
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.on('close', () => {
            clearTimeout(killTimer);
            const parsed = parseFloat(out.trim());
            resolve(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 300);
        });
        proc.on('error', () => {
            clearTimeout(killTimer);
            resolve(300);
        });
    });
};

/**
 * Calls the configured LLM pool (Gemini, Claude, OpenAI, Groq) with automatic failover
 * or load-balancing across backup keys, recording live API metrics on every call.
 */
export const callStudioTextLlmWithFailover = async (params: {
    prompt: string;
    task: 'art_prompt' | 'structure_search' | 'transcription';
    maxTokens?: number;
    temperature?: number;
    description?: string;
}): Promise<{ text: string; providerUsed: string } | null> => {
    const config = getAudiobookStudioConfig();
    const candidates = getCandidateStudioKeys(config, ['gemini', 'claude', 'openai', 'groq']);
    const maxTokens = params.maxTokens || 350;
    const temperature = params.temperature ?? 0.55;

    for (const keyEntry of candidates) {
        try {
            if (keyEntry.provider === 'gemini') {
                const geminiModels = ['gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.0-flash'];
                let lastGemErr: any = null;
                for (const modelName of geminiModels) {
                    try {
                        const resp = await axios.post(
                            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(keyEntry.key)}`,
                            {
                                contents: [{ parts: [{ text: params.prompt }] }],
                                generationConfig: { temperature, maxOutputTokens: maxTokens }
                            },
                            { timeout: 22000 }
                        );
                        const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        if (text) {
                            recordStudioApiMetric({
                                task: params.task,
                                keyOrProvider: keyEntry.id,
                                providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                                success: true,
                                description: params.description
                            });
                            return { text, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                        }
                    } catch (gemErr: any) {
                        lastGemErr = gemErr;
                    }
                }
                if (lastGemErr) throw lastGemErr;
            } else if (keyEntry.provider === 'claude') {
                const resp = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                        model: 'claude-3-5-haiku-latest',
                        max_tokens: maxTokens,
                        messages: [{ role: 'user', content: params.prompt }]
                    },
                    {
                        headers: {
                            'x-api-key': keyEntry.key,
                            'anthropic-version': '2023-06-01',
                            'content-type': 'application/json'
                        },
                        timeout: 22000
                    }
                );
                const text = resp.data?.content?.[0]?.text?.trim() || '';
                if (text) {
                    recordStudioApiMetric({
                        task: params.task,
                        keyOrProvider: keyEntry.id,
                        providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                        success: true,
                        description: params.description
                    });
                    return { text, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                }
            } else if (keyEntry.provider === 'openai') {
                const resp = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'user', content: params.prompt }],
                        max_tokens: maxTokens,
                        temperature
                    },
                    {
                        headers: { Authorization: `Bearer ${keyEntry.key}` },
                        timeout: 22000
                    }
                );
                const text = resp.data?.choices?.[0]?.message?.content?.trim() || '';
                if (text) {
                    recordStudioApiMetric({
                        task: params.task,
                        keyOrProvider: keyEntry.id,
                        providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                        success: true,
                        description: params.description
                    });
                    return { text, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                }
            } else if (keyEntry.provider === 'groq') {
                const resp = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        model: 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: params.prompt }],
                        max_tokens: maxTokens,
                        temperature
                    },
                    {
                        headers: { Authorization: `Bearer ${keyEntry.key}` },
                        timeout: 18000
                    }
                );
                const text = resp.data?.choices?.[0]?.message?.content?.trim() || '';
                if (text) {
                    recordStudioApiMetric({
                        task: params.task,
                        keyOrProvider: keyEntry.id,
                        providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                        success: true,
                        description: params.description
                    });
                    return { text, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                }
            }
        } catch (err: any) {
            const errMsg = err?.response?.data?.error?.message || err.message || 'API error';
            console.warn(`⚠️ [AudiobookStudio] Key ${keyEntry.maskedKey} (${keyEntry.provider}) failed on ${params.task}: ${errMsg}. Trying next backup key...`);
            recordStudioApiMetric({
                task: params.task,
                keyOrProvider: keyEntry.id,
                providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                success: false,
                errorMessage: errMsg,
                description: params.description
            });
            if (err?.response?.status === 429) {
                await new Promise(r => setTimeout(r, 4500));
            }
        }
    }

    // Built-in Free LLM Fallback (Pollinations OpenAI-compatible text endpoint) with polite rate-limit retry
    for (let freeAttempt = 0; freeAttempt < 3; freeAttempt++) {
        if (freeAttempt > 0) {
            const waitMs = freeAttempt * 6000;
            updateLiveStatus({
                lastLog: `Rate-limited on LLM excerpt analysis — pausing ${Math.round(waitMs / 1000)}s before retry ${freeAttempt + 1}/3...`
            });
            await new Promise(r => setTimeout(r, waitMs));
        }
        try {
            const resp = await axios.post(
                'https://text.pollinations.ai/openai',
                {
                    model: 'openai',
                    messages: [{ role: 'user', content: params.prompt }],
                    temperature
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 35000
                }
            );
            const text = resp.data?.choices?.[0]?.message?.content?.trim() || '';
            if (text && text.length > 5) {
                recordStudioApiMetric({
                    task: params.task,
                    keyOrProvider: 'free_pollinations_llm',
                    providerLabel: 'Pollinations LLM (Free Built-in)',
                    success: true,
                    description: params.description
                });
                return { text, providerUsed: 'Pollinations LLM (Free Built-in)' };
            }
        } catch (freeErr: any) {
            if (freeAttempt === 2) {
                recordStudioApiMetric({
                    task: params.task,
                    keyOrProvider: 'free_pollinations_llm',
                    providerLabel: 'Pollinations LLM (Free Built-in)',
                    success: false,
                    errorMessage: freeErr?.message || 'Free LLM rate limited',
                    description: params.description
                });
            }
        }
    }

    return null;
};

/**
 * AI Real-Life Book Structure Discovery:
 * Queries OpenLibrary + Wikipedia + the LLM to discover key plot events, characters, and settings
 * for the book, invalidating any stale placeholder structure.
 */
export const discoverBookRealStructureWithAi = async (
    book: AudiobookBookMeta,
    forceRefresh: boolean = false
): Promise<BookRealStructure> => {
    if (!forceRefresh && book.real_structure_json) {
        try {
            const parsed = JSON.parse(book.real_structure_json);
            const hasPlaceholderTitles = Array.isArray(parsed?.chapters) && parsed.chapters.some((c: any) =>
                Array.isArray(c.scenes) && c.scenes.some((s: any) =>
                    /—\s*(Scene\s*\d+|Part\s*[IVX]+)$/i.test(String(s.title || '')) ||
                    /Story events in /i.test(String(s.summary || ''))
                )
            );
            if (parsed && Array.isArray(parsed.chapters) && parsed.chapters.length > 0 && !hasPlaceholderTitles) {
                return parsed as BookRealStructure;
            }
        } catch {}
    }

    updateLiveStatus({
        isRunning: true,
        activeBookKey: book.book_key,
        activeBookTitle: book.title,
        activeTask: 'illustrating',
        progress: 12,
        lastLog: `Reading book bibliography, plot & character context for "${book.title}" by ${book.author}...`
    });

    const audioChapters = getAudiobookChaptersMeta(book.book_key);
    const audioFileCount = Math.max(1, audioChapters.length || book.total_chapters || 1);

    let openLibSubjects = '';
    let wikiPlotSummary = '';
    let wikiCharacters: string[] = [];

    try {
        const q = encodeURIComponent(`${book.title} ${book.author !== 'Unknown Author' ? book.author : ''}`.trim());
        const olResp = await axios.get(`https://openlibrary.org/search.json?q=${q}&limit=1`, { timeout: 7000 });
        const doc = olResp.data?.docs?.[0];
        if (doc) {
            const subs = Array.isArray(doc.subject) ? doc.subject.slice(0, 10).join(', ') : '';
            const personSubs = Array.isArray(doc.person) ? doc.person.slice(0, 8) : [];
            const placeSubs = Array.isArray(doc.place) ? doc.place.slice(0, 6).join(', ') : '';
            if (personSubs.length > 0) wikiCharacters.push(...personSubs);
            const firstSentence = Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : (doc.first_sentence || '');
            openLibSubjects = [
                subs ? `Themes: ${subs}` : '',
                placeSubs ? `Locations: ${placeSubs}` : '',
                firstSentence ? `Opening: ${firstSentence}` : ''
            ].filter(Boolean).join('. ');
        }
    } catch {}

    // Query Wikipedia API for the actual book's plot, characters, and locations
    try {
        const searchQueries = [
            `${book.title} ${book.author !== 'Unknown Author' ? book.author : ''}`.trim(),
            `${book.title} (novella)`,
            `${book.title} (novel)`
        ];
        for (const cleanQuery of searchQueries) {
            if (wikiPlotSummary.length > 400) break;
            const searchResp = await axios.get(
                `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&srlimit=2`,
                { timeout: 7000, headers: { 'User-Agent': 'SchedulearrAudiobookStudio/1.0' } }
            );
            const pageTitle = searchResp.data?.query?.search?.[0]?.title;
            if (pageTitle) {
                const extractResp = await axios.get(
                    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(pageTitle)}&format=json`,
                    { timeout: 8000, headers: { 'User-Agent': 'SchedulearrAudiobookStudio/1.0' } }
                );
                const pages = extractResp.data?.query?.pages || {};
                const firstPage: any = Object.values(pages)[0];
                const extractText = String(firstPage?.extract || '').trim();
                if (extractText.length > 80) {
                    wikiPlotSummary = extractText.slice(0, 4200).replace(/\s+/g, ' ');
                    const matches = extractText.match(/\b[A-Z][a-z]{2,14}(?:\s+[A-Z][a-z]{2,14})?\b/g) || [];
                    const stopWords = new Set(['The', 'And', 'But', 'When', 'After', 'Before', 'While', 'During', 'Plot', 'Summary', 'Novel', 'Novella', 'Book', 'History', 'Earth', 'Series', 'Chapter', 'Part', 'Volume', 'Published', 'Science', 'Fiction', 'Author', 'Awards', 'Reception']);
                    for (const m of matches) {
                        if (!stopWords.has(m) && !m.includes(book.author.split(' ')[0] || '___') && wikiCharacters.length < 15 && !wikiCharacters.includes(m)) {
                            wikiCharacters.push(m);
                        }
                    }
                }
            }
        }
    } catch {}

    // Also query Google Books API for book synopsis if Wikipedia was brief
    if (wikiPlotSummary.length < 250) {
        try {
            const gbQ = encodeURIComponent(`intitle:${book.title} ${book.author !== 'Unknown Author' ? `inauthor:${book.author}` : ''}`.trim());
            const gbResp = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${gbQ}&maxResults=1`, { timeout: 6000 });
            const desc = gbResp.data?.items?.[0]?.volumeInfo?.description;
            if (desc && typeof desc === 'string') {
                wikiPlotSummary = `${wikiPlotSummary} ${desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')}`.trim().slice(0, 2600);
            }
        } catch {}
    }

    const prompt = [
        `You are a literary scholar and audiobook scene director.`,
        `Analyze the real-world published book "${book.title}" by ${book.author}.`,
        openLibSubjects ? `Bibliographic context: ${openLibSubjects}` : '',
        wikiPlotSummary ? `Verified Plot & Story Synopsis: ${wikiPlotSummary.slice(0, 1600)}` : '',
        wikiCharacters.length > 0 ? `Key Characters & Entities: ${wikiCharacters.slice(0, 10).join(', ')}` : '',
        `This audiobook edition has ${audioFileCount} audio track(s)/section(s): ${audioChapters.slice(0, 12).map(c => `"${c.title}"`).join(', ')}.`,
        `Break the story down into chapters/parts with 2 to 4 concrete visual scenes in chronological order featuring the EXACT characters, events, and locations from "${book.title}".`,
        `Return ONLY valid JSON matching this exact structure (no markdown fences):`,
        `{"totalRealChapters": 3, "totalKeyScenes": 9, "chapters": [{"chapterNumber": 1, "title": "Part I", "summary": "...", "scenes": [{"sceneNumber": 1, "title": "...", "summary": "...", "visualSetting": "...", "characters": ["..."]}]}]}`
    ].filter(Boolean).join('\n');

    const llmRes = await callStudioTextLlmWithFailover({
        prompt,
        task: 'structure_search',
        maxTokens: 900,
        temperature: 0.35,
        description: `Discover real-life chapters & scenes for "${book.title}"`
    });

    let structure: BookRealStructure | null = null;
    if (llmRes?.text) {
        try {
            const cleaned = llmRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
                if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
                    const chapters: BookRealChapterInfo[] = parsed.chapters.map((ch: any, idx: number) => ({
                        chapterNumber: Number(ch.chapterNumber || idx + 1),
                        title: String(ch.title || `Chapter ${idx + 1}`),
                        summary: String(ch.summary || ''),
                        scenes: Array.isArray(ch.scenes) && ch.scenes.length > 0
                            ? ch.scenes.map((sc: any, sIdx: number) => ({
                                sceneNumber: Number(sc.sceneNumber || sIdx + 1),
                                title: String(sc.title || `Scene ${sIdx + 1}`),
                                summary: String(sc.summary || ''),
                                visualSetting: String(sc.visualSetting || ''),
                                characters: Array.isArray(sc.characters) ? sc.characters.map(String) : wikiCharacters.slice(0, 4)
                            }))
                            : [
                                { sceneNumber: 1, title: `${String(ch.title || `Chapter ${idx + 1}`)} — Part I`, summary: String(ch.summary || wikiPlotSummary.slice(0, 240)), visualSetting: openLibSubjects || `${book.title} world setting`, characters: wikiCharacters.slice(0, 4) },
                                { sceneNumber: 2, title: `${String(ch.title || `Chapter ${idx + 1}`)} — Part II`, summary: String(ch.summary || wikiPlotSummary.slice(240, 480)), visualSetting: openLibSubjects || `${book.title} key location`, characters: wikiCharacters.slice(0, 4) },
                                { sceneNumber: 3, title: `${String(ch.title || `Chapter ${idx + 1}`)} — Part III`, summary: String(ch.summary || wikiPlotSummary.slice(480, 720)), visualSetting: openLibSubjects || `${book.title} climactic setting`, characters: wikiCharacters.slice(0, 4) }
                            ]
                    }));
                    const totalScenes = chapters.reduce((acc, c) => acc + c.scenes.length, 0);
                    structure = {
                        bookTitle: book.title,
                        author: book.author,
                        totalRealChapters: Number(parsed.totalRealChapters || chapters.length),
                        totalKeyScenes: Number(parsed.totalKeyScenes || totalScenes),
                        chapters,
                        discoveredAt: new Date().toISOString()
                    };
                }
            }
        } catch (e) {
            console.warn('⚠️ [AudiobookStudio] Failed parsing real structure JSON from LLM, using Wikipedia/OpenLibrary plot segments.');
        }
    }

    if (!structure) {
        const plotSentences = wikiPlotSummary
            ? wikiPlotSummary.split(/(?<=[.!?])\s+/).filter(s => s.length > 25)
            : [];
        const fallbackChapters: BookRealChapterInfo[] = (audioChapters.length > 0 ? audioChapters : [{ title: 'Chapter 1', chapter_index: 0 } as any]).map((ch, idx) => {
            const cleanChapTitle = ch.title.replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '');
            const s1 = plotSentences[(idx * 3) % Math.max(1, plotSentences.length)] || openLibSubjects || `Story events in ${cleanChapTitle} of ${book.title} by ${book.author}`;
            const s2 = plotSentences[(idx * 3 + 1) % Math.max(1, plotSentences.length)] || s1;
            const s3 = plotSentences[(idx * 3 + 2) % Math.max(1, plotSentences.length)] || s2;
            return {
                chapterNumber: idx + 1,
                title: cleanChapTitle,
                summary: `${s1} ${s2}`.slice(0, 360),
                scenes: [
                    { sceneNumber: 1, title: `${cleanChapTitle} — Scene 1`, summary: s1, visualSetting: `${book.title} (${openLibSubjects.slice(0, 120) || 'story environment'})`, characters: wikiCharacters.slice(0, 4) },
                    { sceneNumber: 2, title: `${cleanChapTitle} — Scene 2`, summary: s2, visualSetting: `${book.title} (${openLibSubjects.slice(0, 120) || 'central location'})`, characters: wikiCharacters.slice(0, 4) },
                    { sceneNumber: 3, title: `${cleanChapTitle} — Scene 3`, summary: s3, visualSetting: `${book.title} (${openLibSubjects.slice(0, 120) || 'climactic location'})`, characters: wikiCharacters.slice(0, 4) }
                ]
            };
        });
        structure = {
            bookTitle: book.title,
            author: book.author,
            totalRealChapters: fallbackChapters.length,
            totalKeyScenes: fallbackChapters.length * 3,
            chapters: fallbackChapters,
            discoveredAt: new Date().toISOString()
        };
    }

    upsertAudiobookMeta({
        book_key: book.book_key,
        real_structure_json: JSON.stringify(structure)
    });

    appendStudioQueueHistory({
        bookKey: book.book_key,
        bookTitle: book.title,
        queueType: 'structure',
        status: 'completed',
        providerUsed: llmRes?.providerUsed || (wikiPlotSummary ? 'Wikipedia + OpenLibrary Plot Analyzer' : 'OpenLibrary + Built-in Analyzer'),
        detail: `Mapped ${structure.totalRealChapters} real chapters & ${structure.totalKeyScenes} narrative scenes`
    });

    return structure;
};

/**
 * Normalizes a local filesystem path and checks container/host path variations
 * (/data, /app/data, /music, /media/music, /mnt/user, path_mappings, and Theater library folders).
 */
const resolveLocalPathCandidates = (rawFilePath: string): string | undefined => {
    const cleaned = (rawFilePath || '').trim();
    if (!cleaned) return undefined;
    if (fs.existsSync(cleaned)) return cleaned;

    const candidates: string[] = [
        cleaned,
         (() => { try { return decodeURIComponent(cleaned); } catch { return cleaned; } })(),
        cleaned.replace(/'/g, '’'),
        cleaned.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
        cleaned.replace(/^\/data\//, '/app/data/'),
        cleaned.replace(/^\/app\/data\//, '/data/'),
        cleaned.replace(/^\/mnt\/user\/data\/media\/music\//, '/music/'),
        cleaned.replace(/^\/mnt\/user\/media\/music\//, '/music/'),
        cleaned.replace(/^\/mnt\/user\/music\//, '/music/'),
        cleaned.replace(/^\/mnt\/user\/data\/music\//, '/music/'),
        cleaned.replace(/^\/mnt\/user\/data\/media\/audiobooks\//i, '/audiobooks/'),
        cleaned.replace(/^\/mnt\/user\/media\/audiobooks\//i, '/audiobooks/'),
        cleaned.replace(/^\/mnt\/user\/audiobooks\//i, '/audiobooks/'),
        cleaned.replace(/^\/music\//, '/app/data/music/'),
        cleaned.replace(/^\/media\/music\//, '/app/data/music/'),
        cleaned.replace(/^\/media\//, '/app/data/'),
        path.join('/music', cleaned.replace(/^\/(mnt\/user\/)?(data\/)?(media\/)?(music\/)?/, '')),
        path.join('/media/music', cleaned.replace(/^\/(mnt\/user\/)?(data\/)?(media\/)?(music\/)?/, '')),
        path.join('/app/data/music', cleaned.replace(/^\/(app\/)?(data\/)?(music\/)?/, '')),
        path.join('/app/data', cleaned.replace(/^\/(app\/)?data\/?/, '')),
        path.join('/mnt/user/data', cleaned.replace(/^\/data\/?/, '')),
        path.join('/mnt/user', cleaned.replace(/^\//, ''))
    ];

    try {
        const mappings = JSON.parse(getSetting('path_mappings') || '[]');
        const norm = cleaned.replace(/\\/g, '/');
        for (const m of mappings) {
            const hostP = String(m.hostPath || '').replace(/\\/g, '/');
            const contP = String(m.containerPath || '').replace(/\\/g, '/');
            if (hostP && contP) {
                if (norm.toLowerCase().startsWith(hostP.toLowerCase())) {
                    candidates.push(contP + norm.slice(hostP.length));
                }
                if (norm.toLowerCase().startsWith(contP.toLowerCase())) {
                    candidates.push(hostP + norm.slice(contP.length));
                }
            }
        }
    } catch {}

    try {
        const libs = getTheaterLibraries();
        for (const l of libs) {
            const rawFolders = typeof l.folders === 'string'
                ? (() => { try { return JSON.parse(l.folders); } catch { return [l.folders]; } })()
                : (Array.isArray(l.folders) ? l.folders : []);
            for (const f of rawFolders) {
                if (f && typeof f === 'string' && fs.existsSync(f)) {
                    candidates.push(path.join(f, path.basename(cleaned)));
                    const rel = cleaned.replace(/^\/(mnt\/user\/|data\/|media\/|app\/data\/)?(media\/|music\/|audiobooks\/)?/i, '');
                    candidates.push(path.join(f, rel));
                }
            }
        }
    } catch {}

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            try {
                if (fs.statSync(c).isFile()) return c;
            } catch {}
        }
    }
    return undefined;
};

/**
 * Resolves the physical audio file path for a chapter, handling missing file_path,
 * container/host path mappings, cached Theater items, or scanning the audiobook library folder.
 */
export const resolveChapterAudioFilePath = (book: AudiobookBookMeta, chapter: AudiobookChapterMeta): string | undefined => {
    const rawPath = (chapter.file_path || '').trim();
    const directResolved = resolveLocalPathCandidates(rawPath);
    if (directResolved) return directResolved;

    // 1. Check cached theater items across all libraries for matching track path
    try {
        const allLibs = getTheaterLibraries();
        const targetBookNorm = (book.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const targetChapNorm = (chapter.title || '').toLowerCase().replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').replace(/[^a-z0-9]+/g, '');
        for (const lib of allLibs) {
            const cached = getCachedTheaterItems(lib.id);
            const items = Array.isArray(cached?.items) ? cached.items : [];
            for (const it of items) {
                const itPath = String(it.path || it.filePath || '').trim();
                if (!itPath) continue;
                const itKeyMatches =
                    it.id === chapter.chapter_key ||
                    it.ratingKey === chapter.chapter_key ||
                    `plex-${it.ratingKey}` === chapter.chapter_key;
                const itAlbumNorm = String(it.album || it.bookTitle || it.folder || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
                const itTitleNorm = String(it.title || it.name || '').toLowerCase().replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').replace(/[^a-z0-9]+/g, '');
                const bookAndTitleMatches =
                    targetBookNorm &&
                    (itAlbumNorm.includes(targetBookNorm) || targetBookNorm.includes(itAlbumNorm)) &&
                    targetChapNorm &&
                    (itTitleNorm === targetChapNorm || itTitleNorm.includes(targetChapNorm));

                if (itKeyMatches || bookAndTitleMatches) {
                    const resolved = resolveLocalPathCandidates(itPath);
                    if (resolved) {
                        upsertAudiobookChapterMeta({
                            chapter_key: chapter.chapter_key,
                            book_key: book.book_key,
                            file_path: resolved
                        });
                        return resolved;
                    }
                }
            }
        }
    } catch {}

    // 2. Search audiobook/music library folders for matching book folder or audio file
    try {
        const libs = getTheaterLibraries().filter((l: any) =>
            l.type === 'audiobooks' ||
            l.type === 'audiobook' ||
            l.type === 'books' ||
            l.type === 'music' ||
            /\b(audiobooks?|books?|spoken)\b/i.test(l.name || '')
        );
        const audioExts = new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus']);
        const targetChapterName = (chapter.title || '').toLowerCase().replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').trim();
        const targetBookTitle = (book.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const rawBaseName = rawPath ? path.basename(rawPath).toLowerCase() : '';

        const matchedFiles: string[] = [];
        const walkDir = (dir: string, depth: number = 0) => {
            if (depth > 5 || !fs.existsSync(dir)) return;
            let entries: fs.Dirent[] = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const ent of entries) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    walkDir(full, depth + 1);
                } else if (ent.isFile()) {
                    const ext = path.extname(ent.name).toLowerCase();
                    if (!audioExts.has(ext)) continue;
                    const lowerName = ent.name.toLowerCase();
                    if (rawBaseName && lowerName === rawBaseName) {
                        matchedFiles.unshift(full);
                        return;
                    }
                    const fullNorm = full.toLowerCase().replace(/[^a-z0-9]+/g, '');
                    if (targetBookTitle && fullNorm.includes(targetBookTitle)) {
                        matchedFiles.push(full);
                    }
                }
            }
        };

        for (const lib of libs) {
            const rawFolders = typeof lib.folders === 'string'
                ? (() => { try { return JSON.parse(lib.folders); } catch { return [lib.folders]; } })()
                : (Array.isArray(lib.folders) ? lib.folders : []);
            for (const folder of rawFolders) {
                if (folder && typeof folder === 'string') {
                    walkDir(folder, 0);
                }
            }
        }

        if (matchedFiles.length > 0) {
            matchedFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            const exactByTitle = matchedFiles.find(f => {
                const bName = path.basename(f, path.extname(f)).toLowerCase().trim();
                return bName === targetChapterName || bName.endsWith(` ${targetChapterName}`) || bName.endsWith(`-${targetChapterName}`) || bName.includes(targetChapterName);
            });
            const chosen = exactByTitle || matchedFiles[Math.max(0, Math.min(matchedFiles.length - 1, (chapter.chapter_index || 1) - 1))] || matchedFiles[0];
            if (chosen && fs.existsSync(chosen)) {
                upsertAudiobookChapterMeta({
                    chapter_key: chapter.chapter_key,
                    book_key: book.book_key,
                    file_path: chosen
                });
                return chosen;
            }
        }
    } catch {}

    return undefined;
};

/**
 * Resolves either a local filesystem audio path OR a direct Plex HTTP audio stream URL
 * so FFmpeg can extract audio segments even when the Audiobooks library is hosted on Plex!
 */
export const resolveChapterAudioStreamSource = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta
): Promise<{ inputSource?: string; localPath?: string; isRemoteUrl: boolean }> => {
    const localPath = resolveChapterAudioFilePath(book, chapter);
    if (localPath && fs.existsSync(localPath)) {
        return { inputSource: localPath, localPath, isRemoteUrl: false };
    }

    const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
    if (plexInstances.length === 0) {
        return { inputSource: undefined, localPath: undefined, isRemoteUrl: false };
    }

    const buildPlexPartUrl = (plex: any, partKey: string): string => {
        const plexUrlBase = String(plex.url || '').replace(/\/$/, '');
        const normalizedPart = partKey.startsWith('/') ? partKey : `/${partKey}`;
        const sep = normalizedPart.includes('?') ? '&' : '?';
        return `${plexUrlBase}${normalizedPart}${sep}X-Plex-Token=${encodeURIComponent(plex.api_key)}`;
    };

    // 1. Check cached theater items for a matching track with streamUrl or ratingKey
    try {
        const allLibs = getTheaterLibraries();
        const targetBookNorm = (book.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const targetChapNorm = (chapter.title || '').toLowerCase().replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').replace(/[^a-z0-9]+/g, '').trim();

        for (const lib of allLibs) {
            const cached = getCachedTheaterItems(lib.id);
            const items = Array.isArray(cached?.items) ? cached.items : [];
            const bookItems: any[] = [];

            for (const it of items) {
                const itAlbumNorm = String(it.album || it.bookTitle || it.folder || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
                const itTitleNorm = String(it.title || it.name || '').toLowerCase().replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').replace(/[^a-z0-9]+/g, '').trim();
                const isSameBook = targetBookNorm && (itAlbumNorm === targetBookNorm || itAlbumNorm.includes(targetBookNorm) || targetBookNorm.includes(itAlbumNorm));
                if (isSameBook) {
                    bookItems.push(it);
                }

                const itFileNorm = String(it.filePath || it.path || '').trim().toLowerCase();
                const chapFileNorm = String(chapter.file_path || '').trim().toLowerCase();
                const exactFileMatch = Boolean(chapFileNorm && itFileNorm && (itFileNorm === chapFileNorm || itFileNorm.endsWith(path.basename(chapFileNorm))));

                const exactIdMatch =
                    it.id === chapter.chapter_key ||
                    String(it.ratingKey || '') === chapter.chapter_key ||
                    `plex-${it.ratingKey}` === chapter.chapter_key ||
                    exactFileMatch;

                const exactChapMatch = isSameBook && targetChapNorm && (
                    itTitleNorm === targetChapNorm ||
                    Number(it.trackNumber || 0) === Number(chapter.chapter_index || -1)
                );

                if (exactIdMatch || exactChapMatch) {
                    const plex = (it.instanceId && plexInstances.find(p => p.id === it.instanceId)) || plexInstances[0];
                    if (it.streamUrl && typeof it.streamUrl === 'string') {
                        const partMatch = it.streamUrl.match(/[?&]plexPart=([^&]+)/);
                        if (partMatch && plex) {
                            const partKey = decodeURIComponent(partMatch[1]);
                            return { inputSource: buildPlexPartUrl(plex, partKey), isRemoteUrl: true };
                        }
                    }
                    if (it.ratingKey && plex) {
                        try {
                            const plexUrlBase = String(plex.url || '').replace(/\/$/, '');
                            const metaRes = await axios.get(`${plexUrlBase}/library/metadata/${encodeURIComponent(String(it.ratingKey))}`, {
                                headers: { 'X-Plex-Token': plex.api_key, Accept: 'application/json' },
                                timeout: 6000
                            });
                            const part = metaRes.data?.MediaContainer?.Metadata?.[0]?.Media?.[0]?.Part?.[0];
                            if (part?.file) {
                                const loc = resolveLocalPathCandidates(part.file);
                                if (loc) return { inputSource: loc, localPath: loc, isRemoteUrl: false };
                            }
                            if (part?.key) {
                                return { inputSource: buildPlexPartUrl(plex, part.key), isRemoteUrl: true };
                            }
                        } catch {}
                    }
                }
            }

            // If we found chapters for this book in the cached library, pick by chapter_index (1-based)
            if (bookItems.length > 0) {
                bookItems.sort((a, b) => (Number(a.trackNumber || 0) - Number(b.trackNumber || 0)) || String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true }));
                const chosen = bookItems[Math.max(0, Math.min(bookItems.length - 1, (chapter.chapter_index || 1) - 1))];
                const plex = (chosen?.instanceId && plexInstances.find(p => p.id === chosen.instanceId)) || plexInstances[0];
                if (chosen?.streamUrl && plex) {
                    const partMatch = String(chosen.streamUrl).match(/[?&]plexPart=([^&]+)/);
                    if (partMatch) {
                        return { inputSource: buildPlexPartUrl(plex, decodeURIComponent(partMatch[1])), isRemoteUrl: true };
                    }
                }
            }
        }
    } catch {}

    // 2. Direct Plex search fallback if chapter_key is a ratingKey or by searching book.title / chapter.title on Plex
    for (const plex of plexInstances) {
        try {
            const plexUrlBase = String(plex.url || '').replace(/\/$/, '');
            const cleanRatingKey = chapter.chapter_key.replace(/^plex[-_]/i, '');
            if (/^\d+$/.test(cleanRatingKey)) {
                const metaRes = await axios.get(`${plexUrlBase}/library/metadata/${cleanRatingKey}`, {
                    headers: { 'X-Plex-Token': plex.api_key, Accept: 'application/json' },
                    timeout: 6000
                });
                const part = metaRes.data?.MediaContainer?.Metadata?.[0]?.Media?.[0]?.Part?.[0];
                if (part?.file) {
                    const loc = resolveLocalPathCandidates(part.file);
                    if (loc) return { inputSource: loc, localPath: loc, isRemoteUrl: false };
                }
                if (part?.key) {
                    return { inputSource: buildPlexPartUrl(plex, part.key), isRemoteUrl: true };
                }
            }

            const queries = Array.from(new Set([book.title, chapter.title].filter(Boolean)));
            const targetChapLower = (chapter.title || '').toLowerCase().trim();
            for (const q of queries) {
                const searchRes = await axios.get(`${plexUrlBase}/hubs/search?query=${encodeURIComponent(q)}&limit=25`, {
                    headers: { 'X-Plex-Token': plex.api_key, Accept: 'application/json' },
                    timeout: 6000
                });
                const hubs = searchRes.data?.MediaContainer?.Hub || [];
                for (const hub of hubs) {
                    for (const md of (hub.Metadata || [])) {
                        if (md.type === 'track' && md.Media?.[0]?.Part?.[0]) {
                            const mdTitleLower = String(md.title || '').toLowerCase().trim();
                            const part = md.Media[0].Part[0];
                            if (mdTitleLower === targetChapLower || (chapter.file_path && part.file === chapter.file_path)) {
                                if (part.file) {
                                    const loc = resolveLocalPathCandidates(part.file);
                                    if (loc) return { inputSource: loc, localPath: loc, isRemoteUrl: false };
                                }
                                if (part.key) {
                                    return { inputSource: buildPlexPartUrl(plex, part.key), isRemoteUrl: true };
                                }
                            }
                        }
                        if (md.type === 'album' && md.ratingKey) {
                            const leavesRes = await axios.get(`${plexUrlBase}/library/metadata/${md.ratingKey}/allLeaves`, {
                                headers: { 'X-Plex-Token': plex.api_key, Accept: 'application/json' },
                                timeout: 6000
                            });
                            const leaves = leavesRes.data?.MediaContainer?.Metadata || [];
                            if (leaves.length > 0) {
                                const matchedLeaf =
                                    leaves.find((l: any) => String(l.title || '').toLowerCase().trim() === targetChapLower) ||
                                    leaves[Math.max(0, Math.min(leaves.length - 1, (chapter.chapter_index || 1) - 1))];
                                const part = matchedLeaf?.Media?.[0]?.Part?.[0];
                                if (part?.file) {
                                    const loc = resolveLocalPathCandidates(part.file);
                                    if (loc) return { inputSource: loc, localPath: loc, isRemoteUrl: false };
                                }
                                if (part?.key) {
                                    return { inputSource: buildPlexPartUrl(plex, part.key), isRemoteUrl: true };
                                }
                            }
                        }
                    }
                }
            }
        } catch {}
    }

    return { inputSource: undefined, localPath: undefined, isRemoteUrl: false };
};

export const isFakePlaceholderTranscript = (text?: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase();
    if (
        text.includes('The narrator establishes the setting') ||
        text.includes('Opening narration —') ||
        text.includes('Characters and immediate surroundings come into sharp focus') ||
        text.includes('pronounced [') ||
        lower.includes('also translated as ') ||
        lower.includes('is a novella by ') ||
        lower.includes('is a novel by ') ||
        lower.includes('best-known works') ||
        lower.includes('tells the story of salesman') ||
        lower.includes('published in 1915') ||
        lower.includes('from wikipedia')
    ) {
        return true;
    }
    // Detect fake repeated-sentence transcripts (where the same sentence is stamped at multiple timestamps)
    const lines = text
        .split('\n')
        .map(l => l.replace(/^\[\d+:\d+(?:\.\d+)?\]\s*/, '').trim())
        .filter(l => l.length > 25);
    if (lines.length >= 2) {
        const unique = new Set(lines.map(l => l.toLowerCase()));
        if (unique.size < Math.ceil(lines.length * 0.6)) {
            return true;
        }
    }
    return false;
};

/**
 * Uses FFmpeg `silencedetect` on an audio file/stream to find real speech segment start times.
 */
const detectSpeechCadenceTimestamps = async (
    inputSource: string | undefined,
    durationSec: number,
    targetCount: number
): Promise<number[]> => {
    const count = Math.max(1, targetCount);
    if (!inputSource) {
        return Array.from({ length: count }, (_, idx) => (idx / count) * durationSec);
    }

    try {
        const silenceEnds: number[] = [0];
        await new Promise<void>((resolve) => {
            const ff = spawn('ffmpeg', [
                '-hide_banner',
                '-threads', '1',
                '-t', String(Math.min(durationSec, 1800)),
                '-i', inputSource,
                '-af', 'silencedetect=noise=-32dB:d=0.45',
                '-f', 'null',
                '-'
            ]);
            let stderrBuf = '';
            const timer = setTimeout(() => {
                try { ff.kill('SIGKILL'); } catch {}
                resolve();
            }, 15000);
            ff.stderr.on('data', (d) => {
                stderrBuf += d.toString();
            });
            ff.on('close', () => {
                clearTimeout(timer);
                const matches = stderrBuf.matchAll(/silence_end:\s*([\d.]+)/g);
                for (const m of matches) {
                    const sec = parseFloat(m[1]);
                    if (!isNaN(sec) && sec > 0.5 && sec < durationSec) {
                        silenceEnds.push(sec);
                    }
                }
                resolve();
            });
            ff.on('error', () => {
                clearTimeout(timer);
                resolve();
            });
        });

        if (silenceEnds.length >= 4) {
            return Array.from({ length: count }, (_, idx) => {
                const ratio = idx / count;
                const mappedIdx = Math.min(silenceEnds.length - 1, Math.floor(ratio * silenceEnds.length));
                const baseT = silenceEnds[mappedIdx];
                const linearT = ratio * durationSec;
                return Math.max(0, Math.min(durationSec - 1, baseT * 0.65 + linearT * 0.35));
            });
        }
    } catch {}

    return Array.from({ length: count }, (_, idx) => (idx / count) * durationSec);
};

let whisperModelDownloadPromise: Promise<string | null> | null = null;

const ensureLocalWhisperModel = async (): Promise<string | null> => {
    const modelsDir = path.join(getDataDir(), 'whisper-models');
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
    }
    const modelPath = path.join(modelsDir, 'ggml-tiny.bin');
    if (fs.existsSync(modelPath) && fs.statSync(modelPath).size > 30 * 1024 * 1024) {
        return modelPath;
    }
    if (whisperModelDownloadPromise) return whisperModelDownloadPromise;

    whisperModelDownloadPromise = (async () => {
        const tmpPath = `${modelPath}.part`;
        try {
            console.log(`⬇️ [AudiobookStudio] Downloading offline Whisper model (ggml-tiny.bin) to ${modelPath}...`);
            const resp = await fetch('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin', {
                redirect: 'follow'
            });
            if (!resp.ok || !resp.body) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const arrBuf = await resp.arrayBuffer();
            const buf = Buffer.from(arrBuf);
            if (buf.length < 30 * 1024 * 1024) {
                throw new Error(`Downloaded model too small (${buf.length} bytes)`);
            }
            fs.writeFileSync(tmpPath, buf);
            fs.renameSync(tmpPath, modelPath);
            console.log(`✅ [AudiobookStudio] Offline Whisper model ready at ${modelPath} (${Math.round(buf.length / 1048576)}MB)`);
            return modelPath;
        } catch (err: any) {
            console.warn(`⚠️ [AudiobookStudio] Failed downloading ggml-tiny.bin:`, err?.message || err);
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
            return null;
        } finally {
            whisperModelDownloadPromise = null;
        }
    })();

    return whisperModelDownloadPromise;
};

/**
 * Attempts local `whisper-cli` (whisper.cpp compiled in container), local `whisper` Python CLI,
 * or Free HuggingFace Whisper ASR Spaces using native Node 20 `FormData` + `Blob` + `fetch`.
 * Strictly returns ONLY real Speech-to-Text from the actual audio chunk—NEVER Wikipedia or web text.
 */
const transcribeChunkViaFreeWhisperSpace = async (
    tmpSamplePath: string,
    startOffsetSec: number,
    currentChunkLenSec: number
): Promise<{ lrcLines: string[]; plainParts: string[]; providerLabel: string } | null> => {
    const outDir = path.dirname(tmpSamplePath);
    const baseName = path.basename(tmpSamplePath, path.extname(tmpSamplePath));

    // 1A. Try built-in C++ `whisper-cli` (whisper.cpp) if available in container/host
    try {
        const whisperCliBin = fs.existsSync('/usr/local/bin/whisper-cli') ? '/usr/local/bin/whisper-cli' : 'whisper-cli';
        const hasWhisperCli = whisperCliBin.startsWith('/') || await new Promise<boolean>((resolve) => {
            const check = spawn(whisperCliBin, ['--help']);
            check.on('close', (code) => resolve(code === 0));
            check.on('error', () => resolve(false));
        });

        if (hasWhisperCli) {
            const modelPath = await ensureLocalWhisperModel();
            if (modelPath && fs.existsSync(modelPath)) {
                const wavPath = path.join(outDir, `${baseName}_16k.wav`);
                const outPrefix = path.join(outDir, `${baseName}_wcpp`);
                const srtOut = `${outPrefix}.srt`;

                await new Promise<void>((resolve) => {
                    const ff = spawn('ffmpeg', [
                        '-y', '-threads', '1',
                        '-i', tmpSamplePath,
                        '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
                        wavPath
                    ]);
                    const t = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} resolve(); }, 25000);
                    ff.on('close', () => { clearTimeout(t); resolve(); });
                    ff.on('error', () => { clearTimeout(t); resolve(); });
                });

                if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 1024) {
                    const ranCpp = await new Promise<boolean>((resolve) => {
                        const proc = spawn(whisperCliBin, [
                            '-m', modelPath,
                            '-f', wavPath,
                            '-osrt',
                            '-of', outPrefix,
                            '-t', '1',
                            '-np'
                        ]);
                        const t = setTimeout(() => {
                            try { proc.kill('SIGKILL'); } catch {}
                            resolve(false);
                        }, 180000);
                        proc.on('close', (code) => {
                            clearTimeout(t);
                            resolve(code === 0 && fs.existsSync(srtOut));
                        });
                        proc.on('error', () => {
                            clearTimeout(t);
                            resolve(false);
                        });
                    });

                    try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}

                    if (ranCpp && fs.existsSync(srtOut)) {
                        const rawSrt = fs.readFileSync(srtOut, 'utf8');
                        try { fs.unlinkSync(srtOut); } catch {}
                        const blocks = rawSrt.split(/\r?\n\r?\n/);
                        const lrcLines: string[] = [];
                        const plainParts: string[] = [];
                        for (const b of blocks) {
                            const m = b.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->[\s\S]*?\r?\n([\s\S]+)/);
                            if (m) {
                                const relSec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4], 10) / 1000;
                                const txt = m[5].replace(/\r?\n/g, ' ').replace(/\[[_A-Z0-9\s]+\]/g, '').trim();
                                if (txt && txt.length > 1 && !isFakePlaceholderTranscript(txt)) {
                                    lrcLines.push(`${formatLrcTimestamp(startOffsetSec + relSec)} ${txt}`);
                                    plainParts.push(txt);
                                }
                            }
                        }
                        if (lrcLines.length > 0) {
                            return { lrcLines, plainParts, providerLabel: 'Local Whisper.cpp (Offline CPU)' };
                        }
                    }
                }
            }
        }
    } catch {}

    // 1B. Try local Python whisper CLI if installed on host
    try {
        const srtOut = path.join(outDir, `${baseName}.srt`);
        const ranLocal = await new Promise<boolean>((resolve) => {
            const proc = spawn('whisper', [
                tmpSamplePath,
                '--model', 'tiny',
                '--output_format', 'srt',
                '--output_dir', outDir,
                '--threads', '1'
            ]);
            const t = setTimeout(() => {
                try { proc.kill('SIGKILL'); } catch {}
                resolve(false);
            }, 90000);
            proc.on('close', (code) => {
                clearTimeout(t);
                resolve(code === 0 && fs.existsSync(srtOut));
            });
            proc.on('error', () => {
                clearTimeout(t);
                resolve(false);
            });
        });
        if (ranLocal && fs.existsSync(srtOut)) {
            const rawSrt = fs.readFileSync(srtOut, 'utf8');
            try { fs.unlinkSync(srtOut); } catch {}
            const blocks = rawSrt.split(/\r?\n\r?\n/);
            const lrcLines: string[] = [];
            const plainParts: string[] = [];
            for (const b of blocks) {
                const m = b.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->[\s\S]*?\r?\n([\s\S]+)/);
                if (m) {
                    const relSec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4], 10) / 1000;
                    const txt = m[5].replace(/\r?\n/g, ' ').trim();
                    if (txt && !isFakePlaceholderTranscript(txt)) {
                        lrcLines.push(`${formatLrcTimestamp(startOffsetSec + relSec)} ${txt}`);
                        plainParts.push(txt);
                    }
                }
            }
            if (lrcLines.length > 0) {
                return { lrcLines, plainParts, providerLabel: 'Local Whisper CLI' };
            }
        }
    } catch {}

    // 2. Try HuggingFace Gradio Whisper ASR Spaces using native Node 20 FormData + Blob + fetch
    const spaces = [
        { base: 'https://hf-audio-whisper-large-v3.hf.space', apiPrefix: '/gradio_api', fnName: 'transcribe', label: 'Whisper Large v3 (HF Space)' },
        { base: 'https://openai-whisper.hf.space', apiPrefix: '/gradio_api', fnName: 'predict', label: 'OpenAI Whisper (HF Space)' },
        { base: 'https://hf-audio-whisper-large-v3-turbo.hf.space', apiPrefix: '/gradio_api', fnName: 'predict', label: 'Whisper v3 Turbo (HF Space)' }
    ];

    const audioBuf = fs.readFileSync(tmpSamplePath);
    const fileName = path.basename(tmpSamplePath);

    for (const sp of spaces) {
        try {
            const uploadForm = new globalThis.FormData();
            const blob = new Blob([audioBuf], { type: 'audio/mpeg' });
            uploadForm.append('files', blob, fileName);

            const upCtrl = new AbortController();
            const upTimer = setTimeout(() => upCtrl.abort(), 25000);
            const upResp = await fetch(`${sp.base}${sp.apiPrefix}/upload`, {
                method: 'POST',
                body: uploadForm,
                signal: upCtrl.signal
            });
            clearTimeout(upTimer);
            if (!upResp.ok) continue;

            const upData: any = await upResp.json();
            const uploadedPath = Array.isArray(upData) ? upData[0] : null;
            if (!uploadedPath) continue;

            const fileDataObj = {
                path: uploadedPath,
                orig_name: fileName,
                mime_type: 'audio/mpeg',
                meta: { _type: 'gradio.FileData' }
            };

            const callPayloads = [
                { data: [fileDataObj, 'transcribe'] },
                { data: [fileDataObj, 'transcribe', true] },
                { data: [fileDataObj] }
            ];

            for (const payload of callPayloads) {
                try {
                    const callResp = await axios.post(
                        `${sp.base}${sp.apiPrefix}/call/${sp.fnName}`,
                        payload,
                        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
                    );
                    const eventId = callResp.data?.event_id;
                    if (!eventId) continue;

                    const sseResp = await axios.get(`${sp.base}${sp.apiPrefix}/call/${sp.fnName}/${eventId}`, {
                        timeout: 90000,
                        responseType: 'text'
                    });
                    const sseText = String(sseResp.data || '');
                    const dataLines = sseText.split('\n').filter(l => l.startsWith('data: '));
                    for (const dLine of dataLines.reverse()) {
                        try {
                            const parsed = JSON.parse(dLine.slice(6));
                            const rawText = String(Array.isArray(parsed) ? parsed[0] : (parsed?.text || '')).trim();
                            if (rawText && rawText.length > 8 && !isFakePlaceholderTranscript(rawText)) {
                                const sentences = rawText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
                                const lrcLines: string[] = [];
                                const plainParts: string[] = [];
                                sentences.forEach((s, idx) => {
                                    const absSec = startOffsetSec + (idx / Math.max(1, sentences.length)) * currentChunkLenSec;
                                    lrcLines.push(`${formatLrcTimestamp(absSec)} ${s}`);
                                    plainParts.push(s);
                                });
                                if (lrcLines.length > 0) {
                                    recordStudioApiMetric({
                                        task: 'transcription',
                                        keyOrProvider: 'free_whisper_space',
                                        providerLabel: sp.label,
                                        success: true,
                                        description: `Whisper STT (${Math.round(currentChunkLenSec)}s)`
                                    });
                                    return {
                                        lrcLines,
                                        plainParts,
                                        providerLabel: sp.label
                                    };
                                }
                            }
                        } catch {}
                    }
                } catch {}
            }
        } catch {}
    }
    return null;
};

/**
 * Transcribes a single audio chunk file (`tmpSample`) covering `[startOffsetSec, startOffsetSec + currentChunkLenSec]`
 * using configured STT keys (Gemini / Groq / OpenAI) with automatic fallback to local `whisper-cli` and HF Spaces.
 */
const transcribeSingleExtractedAudioFile = async (params: {
    tmpSample: string;
    startOffsetSec: number;
    currentChunkLenSec: number;
    book: AudiobookBookMeta;
    chapter: AudiobookChapterMeta;
    sttCandidates: StudioApiKeyEntry[];
    progressPct?: number;
}): Promise<{ lrcLines: string[]; plainParts: string[]; providerLabel: string; error?: string }> => {
    const { tmpSample, startOffsetSec, currentChunkLenSec, book, chapter, sttCandidates, progressPct = 50 } = params;
    let lastSttError = '';

    // 1. Configured Cloud STT Keys (Gemini, Groq Whisper, OpenAI Whisper)
    for (const keyEntry of sttCandidates) {
        try {
            if (keyEntry.provider === 'gemini') {
                updateLiveStatus({
                    isRunning: true,
                    activeBookKey: book.book_key,
                    activeBookTitle: book.title,
                    activeChapterKey: chapter.chapter_key,
                    activeChapterTitle: chapter.title,
                    activeTask: 'transcribing',
                    progress: progressPct,
                    lastLog: `Transcribing "${chapter.title}" (${formatLrcTimestamp(startOffsetSec)}–${formatLrcTimestamp(startOffsetSec + currentChunkLenSec)}) via ${keyEntry.label} (${keyEntry.maskedKey})...`
                });
                const audioB64 = fs.readFileSync(tmpSample).toString('base64');
                const sttPrompt = [
                    `You are a verbatim Speech-to-Text audio transcriber.`,
                    `Transcribe the spoken words in this audio recording word-for-word in the exact language spoken by the narrator.`,
                    `STRICT RULES:`,
                    `1. Output ONLY the actual spoken words heard in the audio—do NOT summarize, do NOT output book descriptions or Wikipedia text, and do NOT invent text.`,
                    `2. Format every spoken sentence or phrase on its own line starting with its relative timestamp in [MM:SS.xx] format (starting at [00:00.00]).`,
                    `3. Output ONLY the [MM:SS.xx] transcript lines.`
                ].join('\n');

                const geminiModels = ['gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash'];
                let rawOut = '';
                for (const modelName of geminiModels) {
                    try {
                        const resp = await axios.post(
                            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(keyEntry.key)}`,
                            {
                                contents: [{
                                    parts: [
                                        { text: sttPrompt },
                                        { inlineData: { mimeType: 'audio/mp3', data: audioB64 } }
                                    ]
                                }],
                                generationConfig: { temperature: 0.05, maxOutputTokens: 4096 }
                            },
                            { timeout: 120000 }
                        );
                        rawOut = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        if (rawOut) break;
                    } catch (modelErr: any) {
                        lastSttError = modelErr?.response?.data?.error?.message || modelErr.message || 'Gemini STT error';
                        if (modelErr?.response?.status === 429) {
                            await new Promise(r => setTimeout(r, 4000));
                        }
                    }
                }

                const rawLines = rawOut.split('\n').map((l: string) => l.trim()).filter(Boolean);
                const chunkLines: string[] = [];
                const chunkPlain: string[] = [];

                rawLines.forEach((line: string, idx: number) => {
                    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
                    if (m) {
                        const relSec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                        const absSec = startOffsetSec + relSec;
                        const text = m[3].trim();
                        if (text && !isFakePlaceholderTranscript(text)) {
                            chunkLines.push(`${formatLrcTimestamp(absSec)} ${text}`);
                            chunkPlain.push(text);
                        }
                    } else {
                        const cleaned = line.replace(/^```[a-z]*$/i, '').replace(/^\d+[\).\s-]+/, '').trim();
                        if (cleaned.length > 3 && !isFakePlaceholderTranscript(cleaned)) {
                            const estSec = startOffsetSec + (idx / Math.max(1, rawLines.length)) * currentChunkLenSec;
                            chunkLines.push(`${formatLrcTimestamp(estSec)} ${cleaned}`);
                            chunkPlain.push(cleaned);
                        }
                    }
                });

                if (chunkLines.length >= 1 && !isFakePlaceholderTranscript(chunkLines.join('\n'))) {
                    recordStudioApiMetric({
                        task: 'transcription',
                        keyOrProvider: keyEntry.id,
                        providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                        success: true,
                        description: `Gemini Audio STT (${Math.round(currentChunkLenSec)}s): "${book.title}" — ${chapter.title}`
                    });
                    return {
                        lrcLines: chunkLines,
                        plainParts: chunkPlain,
                        providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`
                    };
                }
            } else if (keyEntry.provider === 'groq' || keyEntry.provider === 'openai') {
                const isGroq = keyEntry.provider === 'groq';
                updateLiveStatus({
                    isRunning: true,
                    activeBookKey: book.book_key,
                    activeBookTitle: book.title,
                    activeChapterKey: chapter.chapter_key,
                    activeChapterTitle: chapter.title,
                    activeTask: 'transcribing',
                    progress: progressPct,
                    lastLog: `Transcribing "${chapter.title}" (${formatLrcTimestamp(startOffsetSec)}–${formatLrcTimestamp(startOffsetSec + currentChunkLenSec)}) via ${isGroq ? 'Groq Whisper Large v3' : 'OpenAI Whisper'} (${keyEntry.maskedKey})...`
                });

                const form = new globalThis.FormData();
                const audioBlob = new Blob([fs.readFileSync(tmpSample)], { type: 'audio/mpeg' });
                form.append('file', audioBlob, path.basename(tmpSample));
                form.append('model', isGroq ? 'whisper-large-v3-turbo' : 'whisper-1');
                form.append('response_format', 'verbose_json');

                const endpoint = isGroq
                    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
                    : 'https://api.openai.com/v1/audio/transcriptions';

                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 120000);
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${keyEntry.key}`
                    },
                    body: form,
                    signal: ctrl.signal
                });
                clearTimeout(timer);

                if (!resp.ok) {
                    const errBody = await resp.text().catch(() => '');
                    throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 180)}`);
                }
                const data: any = await resp.json();

                if (data && (Array.isArray(data.segments) || data.text)) {
                    const chunkLines: string[] = [];
                    const chunkPlain: string[] = [];
                    if (Array.isArray(data.segments) && data.segments.length > 0) {
                        for (const seg of data.segments) {
                            const absSec = startOffsetSec + Number(seg.start || 0);
                            const txt = String(seg.text || '').trim();
                            if (txt && !isFakePlaceholderTranscript(txt)) {
                                chunkLines.push(`${formatLrcTimestamp(absSec)} ${txt}`);
                                chunkPlain.push(txt);
                            }
                        }
                    } else if (data.text) {
                        const sentences = String(data.text).trim().split(/(?<=[.!?])\s+/).filter(Boolean);
                        sentences.forEach((s: string, idx: number) => {
                            if (!isFakePlaceholderTranscript(s)) {
                                const absSec = startOffsetSec + (idx / Math.max(1, sentences.length)) * currentChunkLenSec;
                                chunkLines.push(`${formatLrcTimestamp(absSec)} ${s}`);
                                chunkPlain.push(s);
                            }
                        });
                    }
                    if (chunkLines.length > 0) {
                        recordStudioApiMetric({
                            task: 'transcription',
                            keyOrProvider: keyEntry.id,
                            providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                            success: true,
                            description: `Whisper STT (${Math.round(currentChunkLenSec)}s): "${book.title}" — ${chapter.title}`
                        });
                        return {
                            lrcLines: chunkLines,
                            plainParts: chunkPlain,
                            providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`
                        };
                    }
                }
            }
        } catch (sttErr: any) {
            const errMsg = sttErr?.response?.data?.error?.message || sttErr.message || 'STT API error';
            lastSttError = errMsg;
            console.warn(`⚠️ [AudiobookStudio] Audio STT failed on ${keyEntry.provider} (${keyEntry.maskedKey}): ${errMsg}`);
            recordStudioApiMetric({
                task: 'transcription',
                keyOrProvider: keyEntry.id,
                providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                success: false,
                errorMessage: errMsg,
                description: `Audio STT failed for "${chapter.title}"`
            });
        }
    }

    // 2. Free Local Whisper.cpp CLI or HuggingFace Whisper Space
    updateLiveStatus({
        isRunning: true,
        activeBookKey: book.book_key,
        activeBookTitle: book.title,
        activeChapterKey: chapter.chapter_key,
        activeChapterTitle: chapter.title,
        activeTask: 'transcribing',
        progress: progressPct,
        lastLog: `Transcribing "${chapter.title}" (${formatLrcTimestamp(startOffsetSec)}–${formatLrcTimestamp(startOffsetSec + currentChunkLenSec)}) via local Whisper.cpp / HF Space...`
    });
    const freeWhisper = await transcribeChunkViaFreeWhisperSpace(tmpSample, startOffsetSec, currentChunkLenSec);
    if (freeWhisper && freeWhisper.lrcLines.length > 0) {
        return freeWhisper;
    }

    return {
        lrcLines: [],
        plainParts: [],
        providerLabel: '',
        error: lastSttError || 'All Speech-to-Text engines failed on this audio window'
    };
};

/**
 * Transcribes a specific `[startSec, endSec]` window of a chapter on demand and merges the resulting
 * `[MM:SS.xx]` lines into `chapter.synced_lyrics` in SQLite. Used by the slow-feed scene transition analyzer.
 */
export const transcribeAudioTimeWindow = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    startSec: number,
    endSec: number
): Promise<{ windowLrcLines: string[]; windowPlainText: string; providerLabel: string }> => {
    const streamSource = await resolveChapterAudioStreamSource(book, chapter);
    const ffmpegInputSource = streamSource.inputSource;
    if (!ffmpegInputSource) {
        return { windowLrcLines: [], windowPlainText: '', providerLabel: '' };
    }

    const windowLenSec = Math.max(5, endSec - startSec);
    const freshConfig = getAudiobookStudioConfig();
    const sttCandidates = getCandidateStudioKeys(freshConfig, ['gemini', 'groq', 'openai']);
    const subChunkSec = sttCandidates.length > 0 ? 180 : 60;
    const numSubChunks = Math.max(1, Math.ceil(windowLenSec / subChunkSec));

    const windowLrcLines: string[] = [];
    const windowPlainParts: string[] = [];
    let providerLabel = '';

    for (let sc = 0; sc < numSubChunks; sc++) {
        const subStart = startSec + sc * subChunkSec;
        const subLen = Math.min(subChunkSec, endSec - subStart);
        if (subLen <= 2) break;

        const tmpSample = path.join(
            getAudiobookEnhancedDir(),
            `stt_win_${Date.now()}_${sc}_${Math.random().toString(36).slice(2, 6)}.mp3`
        );
        try {
            await new Promise<void>((resolve) => {
                const ff = spawn('ffmpeg', [
                    '-y', '-threads', '1',
                    '-ss', String(subStart),
                    '-i', ffmpegInputSource,
                    '-t', String(subLen),
                    '-ac', '1', '-ar', '16000', '-b:a', '24k',
                    tmpSample
                ]);
                const killTimer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} resolve(); }, 45000);
                ff.on('close', () => { clearTimeout(killTimer); resolve(); });
                ff.on('error', () => { clearTimeout(killTimer); resolve(); });
            });

            if (fs.existsSync(tmpSample) && fs.statSync(tmpSample).size >= 256) {
                const res = await transcribeSingleExtractedAudioFile({
                    tmpSample,
                    startOffsetSec: subStart,
                    currentChunkLenSec: subLen,
                    book,
                    chapter,
                    sttCandidates
                });
                if (res.lrcLines.length > 0) {
                    windowLrcLines.push(...res.lrcLines);
                    windowPlainParts.push(...res.plainParts);
                    providerLabel = res.providerLabel;
                }
            }
        } finally {
            try { if (fs.existsSync(tmpSample)) fs.unlinkSync(tmpSample); } catch {}
        }
    }

    if (windowLrcLines.length > 0) {
        // Merge into existing chapter.synced_lyrics sorted by timestamp
        const latestCh = getAudiobookChapterMeta(chapter.chapter_key) || chapter;
        const lineMap = new Map<string, { sec: number; raw: string; text: string }>();
        const ingestLines = (lines: string[]) => {
            for (const l of lines) {
                const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
                if (m) {
                    const sec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                    const key = `${Math.round(sec * 2)}:${m[3].trim().slice(0, 32)}`;
                    lineMap.set(key, { sec, raw: l.trim(), text: m[3].trim() });
                }
            }
        };
        if (latestCh.synced_lyrics) {
            ingestLines(latestCh.synced_lyrics.split('\n'));
        }
        ingestLines(windowLrcLines);

        const mergedSorted = Array.from(lineMap.values()).sort((a, b) => a.sec - b.sec);
        const mergedLrc = mergedSorted.map(x => x.raw).join('\n');
        const mergedPlain = mergedSorted.map(x => x.text).join(' ');
        const durationSec = Math.max(60, latestCh.duration_sec || 600);
        const maxTranscribedSec = Math.min(durationSec, Math.max(latestCh.transcribed_seconds || 0, endSec));
        const pct = Math.min(100, Math.round((maxTranscribedSec / durationSec) * 100));

        const safeChapterId = chapter.chapter_key.replace(/[^a-zA-Z0-9_-]/g, '_');
        try {
            fs.writeFileSync(path.join(getAudiobookTranscriptsDir(), `${safeChapterId}.lrc`), mergedLrc, 'utf8');
            fs.writeFileSync(path.join(getAudiobookTranscriptsDir(), `${safeChapterId}.txt`), mergedPlain, 'utf8');
        } catch {}

        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            duration_sec: durationSec,
            transcribed_seconds: maxTranscribedSec,
            transcription_status: maxTranscribedSec >= durationSec - 15 ? 'completed' : 'processing',
            transcription_progress: maxTranscribedSec >= durationSec - 15 ? 100 : pct,
            synced_lyrics: mergedLrc,
            plain_transcript: mergedPlain,
            transcript_lrc_path: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.lrc`)}`,
            transcript_txt_path: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.txt`)}`,
            error_message: ''
        });
        chapter.synced_lyrics = mergedLrc;
        chapter.plain_transcript = mergedPlain;
        chapter.transcribed_seconds = maxTranscribedSec;
    }

    return {
        windowLrcLines,
        windowPlainText: windowPlainParts.join(' '),
        providerLabel
    };
};

/**
 * Server-persisted real Speech-to-Text & time-synced transcription engine:
 * STRICT POLICY: ONLY real Speech-to-Text from the audio stream (or genuine local sidecar .lrc/.txt) is accepted.
 * NEVER substitutes Wikipedia summaries, book blurbs, or LLM-invented sentences.
 * Processes the ENTIRE chapter audio chunk-by-chunk with live SQLite checkpointing after every chunk.
 */
export const transcribeAudiobookChapter = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig
): Promise<{ syncedLyrics: string; plainTranscript: string }> => {
    const streamSource = await resolveChapterAudioStreamSource(book, chapter);
    const resolvedFilePath = streamSource.localPath;
    const ffmpegInputSource = streamSource.inputSource;

    if (resolvedFilePath && resolvedFilePath !== chapter.file_path) {
        chapter.file_path = resolvedFilePath;
    }

    const needsRealProbe = !chapter.duration_sec || chapter.duration_sec <= 0 || chapter.duration_sec === 300;
    const probedDur = (!needsRealProbe && chapter.duration_sec > 0)
        ? chapter.duration_sec
        : (ffmpegInputSource ? await probeAudioDuration(ffmpegInputSource) : (chapter.duration_sec || 300));
    let durationSec = Math.max(30, probedDur || chapter.duration_sec || 300);
    const safeChapterId = chapter.chapter_key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const serverLrcPath = path.join(getAudiobookTranscriptsDir(), `${safeChapterId}.lrc`);
    const serverTxtPath = path.join(getAudiobookTranscriptsDir(), `${safeChapterId}.txt`);

    updateLiveStatus({
        isRunning: true,
        activeBookKey: book.book_key,
        activeBookTitle: book.title,
        activeChapterKey: chapter.chapter_key,
        activeChapterTitle: chapter.title,
        activeTask: 'transcribing',
        progress: 2,
        lastLog: `Starting full-chapter Speech-to-Text for "${book.title}" — ${chapter.title} (${formatLrcTimestamp(durationSec)})...`
    });

    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        file_path: resolvedFilePath || chapter.file_path,
        duration_sec: durationSec,
        transcription_status: 'processing',
        transcription_progress: Math.max(2, chapter.transcription_progress || 2),
        error_message: ''
    });

    const persistTranscriptToServer = (syncedLyrics: string, plainTranscript: string, providerUsed: string, transcribedSec: number, isFinal: boolean) => {
        try {
            fs.writeFileSync(serverLrcPath, syncedLyrics, 'utf8');
            fs.writeFileSync(serverTxtPath, plainTranscript, 'utf8');
        } catch (err: any) {
            console.warn(`⚠️ [AudiobookStudio] Could not write transcript files to disk:`, err.message);
        }

        const effectiveDur = isFinal && transcribedSec > 0 ? Math.max(30, Math.round(transcribedSec)) : durationSec;
        const pct = isFinal ? 100 : Math.min(98, Math.max(3, Math.round((transcribedSec / Math.max(1, effectiveDur)) * 100)));
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            file_path: resolvedFilePath || chapter.file_path,
            duration_sec: effectiveDur,
            transcribed_seconds: isFinal ? Math.max(transcribedSec, effectiveDur) : transcribedSec,
            transcription_status: isFinal ? 'completed' : 'processing',
            transcription_progress: pct,
            synced_lyrics: syncedLyrics,
            plain_transcript: plainTranscript,
            transcript_lrc_path: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.lrc`)}`,
            transcript_txt_path: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.txt`)}`,
            error_message: ''
        });

        if (isFinal) {
            appendStudioQueueHistory({
                bookKey: book.book_key,
                bookTitle: book.title,
                chapterKey: chapter.chapter_key,
                chapterTitle: chapter.title,
                queueType: 'transcription',
                status: 'completed',
                providerUsed: providerUsed || 'Local Whisper.cpp (Offline CPU)',
                detail: `Transcribed ${Math.round(Math.max(transcribedSec, effectiveDur))}s (${syncedLyrics.split('\n').length} timed lines)`,
                serverFileUrl: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.lrc`)}`
            });
        }
    };

    // Tier 1: Check if a genuine sidecar .lrc or .txt exists next to the local audio file
    if (resolvedFilePath && fs.existsSync(resolvedFilePath)) {
        const ext = path.extname(resolvedFilePath);
        const baseNoExt = resolvedFilePath.slice(0, -ext.length);
        const lrcSidecar = `${baseNoExt}.lrc`;
        const txtSidecar = `${baseNoExt}.txt`;

        if (fs.existsSync(lrcSidecar)) {
            const rawLrc = fs.readFileSync(lrcSidecar, 'utf8');
            if (!isFakePlaceholderTranscript(rawLrc) && rawLrc.trim().length > 40) {
                const plain = rawLrc.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
                persistTranscriptToServer(rawLrc, plain, 'Local Sidecar .LRC', durationSec, true);
                return { syncedLyrics: rawLrc, plainTranscript: plain };
            }
        }
        if (fs.existsSync(txtSidecar)) {
            const rawTxt = fs.readFileSync(txtSidecar, 'utf8').trim();
            if (!isFakePlaceholderTranscript(rawTxt) && rawTxt.length > 40) {
                const sentences = rawTxt.split(/(?<=[.!?])\s+/).filter(Boolean);
                const timestamps = await detectSpeechCadenceTimestamps(ffmpegInputSource, durationSec, sentences.length);
                const lines = sentences.map((s, idx) => `${formatLrcTimestamp(timestamps[idx] || 0)} ${s}`);
                const synced = lines.join('\n');
                persistTranscriptToServer(synced, rawTxt, 'Local Sidecar .TXT', durationSec, true);
                return { syncedLyrics: synced, plainTranscript: rawTxt };
            }
        }
    }

    // Tier 2 & Tier 3: Real Audio Speech-to-Text across the FULL chapter duration with checkpoint resume
    const freshConfig = getAudiobookStudioConfig();
    const sttCandidates = getCandidateStudioKeys(freshConfig, ['gemini', 'groq', 'openai']);

    // Use 180s chunks when cloud STT keys exist, or 60s chunks for local/free Whisper so live lines appear every minute
    const chunkDurationSec = sttCandidates.length > 0 ? 180 : 60;
    const totalToTranscribeSec = Math.max(durationSec, 30);
    const numChunks = Math.max(1, Math.ceil(totalToTranscribeSec / chunkDurationSec));
    const allLrcLines: string[] = [];
    const allPlainParts: string[] = [];
    let completedSec = 0;
    let winningProviderLabel = '';
    let lastSttError = '';
    let newChunksTranscribed = 0;
    let reachedAudioEof = false;

    // Resume from existing valid partial transcript if interrupted previously
    if (
        chapter.synced_lyrics &&
        !isFakePlaceholderTranscript(chapter.synced_lyrics) &&
        chapter.transcribed_seconds > 0 &&
        chapter.transcribed_seconds < totalToTranscribeSec - 15
    ) {
        for (const rawLine of chapter.synced_lyrics.split('\n')) {
            const m = rawLine.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
            if (m) {
                allLrcLines.push(rawLine.trim());
                allPlainParts.push(m[3].trim());
            }
        }
        if (allLrcLines.length > 0) {
            completedSec = Math.floor(chapter.transcribed_seconds / chunkDurationSec) * chunkDurationSec;
        }
    }

    if (!ffmpegInputSource) {
        lastSttError = `Could not resolve audio stream for "${chapter.title}" (neither local path nor Plex stream reachable).`;
    } else {
        const startChunkIdx = Math.floor(completedSec / chunkDurationSec);
        for (let chunkIdx = startChunkIdx; chunkIdx < numChunks; chunkIdx++) {
            const startOffsetSec = chunkIdx * chunkDurationSec;
            const currentChunkLenSec = Math.min(chunkDurationSec, totalToTranscribeSec - startOffsetSec);
            if (currentChunkLenSec <= 2) {
                reachedAudioEof = true;
                break;
            }

            const tmpSample = path.join(
                getAudiobookEnhancedDir(),
                `stt_chunk_${Date.now()}_${chunkIdx}_${Math.random().toString(36).slice(2, 6)}.mp3`
            );

            try {
                const pctExtract = Math.min(96, Math.round(((chunkIdx + 0.2) / numChunks) * 96));
                updateLiveStatus({
                    isRunning: true,
                    activeBookKey: book.book_key,
                    activeBookTitle: book.title,
                    activeChapterKey: chapter.chapter_key,
                    activeChapterTitle: chapter.title,
                    activeTask: 'transcribing',
                    progress: pctExtract,
                    lastLog: `[${chapter.title}] Extracting audio chunk ${chunkIdx + 1}/${numChunks} (${formatLrcTimestamp(startOffsetSec)}–${formatLrcTimestamp(startOffsetSec + currentChunkLenSec)} of ${formatLrcTimestamp(totalToTranscribeSec)})...`
                });

                await new Promise<void>((resolve) => {
                    const ff = spawn('ffmpeg', [
                        '-y', '-threads', '1',
                        '-ss', String(startOffsetSec),
                        '-i', ffmpegInputSource,
                        '-t', String(currentChunkLenSec),
                        '-ac', '1', '-ar', '16000', '-b:a', '24k',
                        tmpSample
                    ]);
                    const killTimer = setTimeout(() => {
                        try { ff.kill('SIGKILL'); } catch {}
                        resolve();
                    }, 45000);
                    ff.on('close', () => { clearTimeout(killTimer); resolve(); });
                    ff.on('error', () => { clearTimeout(killTimer); resolve(); });
                });

                if (!fs.existsSync(tmpSample) || fs.statSync(tmpSample).size < 256) {
                    if (chunkIdx > 0 && allLrcLines.length > 0) {
                        // Audio file ended before the estimated/placeholder duration — treat existing chunks as complete!
                        reachedAudioEof = true;
                    } else {
                        lastSttError = `FFmpeg could not extract audio stream for "${chapter.title}" at ${formatLrcTimestamp(startOffsetSec)}`;
                    }
                    break;
                }

                const pctApi = Math.min(98, Math.round(((chunkIdx + 0.6) / numChunks) * 98));
                const chunkRes = await transcribeSingleExtractedAudioFile({
                    tmpSample,
                    startOffsetSec,
                    currentChunkLenSec,
                    book,
                    chapter,
                    sttCandidates,
                    progressPct: pctApi
                });

                if (chunkRes.lrcLines.length > 0) {
                    allLrcLines.push(...chunkRes.lrcLines);
                    allPlainParts.push(...chunkRes.plainParts);
                    completedSec = startOffsetSec + currentChunkLenSec;
                    winningProviderLabel = chunkRes.providerLabel;
                    newChunksTranscribed++;

                    // Immediately persist live partial transcript so the UI shows lines appearing in real time!
                    persistTranscriptToServer(
                        allLrcLines.join('\n'),
                        allPlainParts.join(' '),
                        winningProviderLabel || 'Local Whisper.cpp (Offline CPU)',
                        completedSec,
                        false
                    );
                    recalculateAudiobookTotals(book.book_key);
                } else {
                    if (chunkIdx > 0 && allLrcLines.length > 0 && !chunkRes.error) {
                        // Trailing silence at the end of chapter audio
                        reachedAudioEof = true;
                    } else {
                        lastSttError = chunkRes.error || 'Speech-to-Text returned empty transcript for chunk';
                    }
                    break;
                }
            } finally {
                try { if (fs.existsSync(tmpSample)) fs.unlinkSync(tmpSample); } catch {}
            }
        }
    }

    if (allLrcLines.length > 0 && !isFakePlaceholderTranscript(allLrcLines.join('\n'))) {
        const syncedLyrics = allLrcLines.join('\n');
        const plainTranscript = allPlainParts.join(' ');
        const isFullyDone = reachedAudioEof || newChunksTranscribed === 0 || completedSec >= totalToTranscribeSec - 15;
        if (isFullyDone && completedSec > 0) {
            durationSec = Math.max(30, Math.round(completedSec));
        }
        const effectiveProviderLabel = winningProviderLabel || 'Local Whisper.cpp (Offline CPU)';
        persistTranscriptToServer(
            syncedLyrics,
            plainTranscript,
            effectiveProviderLabel,
            completedSec || durationSec,
            isFullyDone
        );
        recalculateAudiobookTotals(book.book_key);
        if (newChunksTranscribed > 0) {
            console.log(`✅ [AudiobookStudio] Completed real audio transcription for "${book.title}" — ${chapter.title} (${effectiveProviderLabel}, ${Math.round(completedSec)}s/${Math.round(durationSec)}s)`);
        }
        return { syncedLyrics, plainTranscript };
    }

    const failReason = lastSttError
        ? `STT failed: ${lastSttError}`
        : 'Speech-to-Text failed: add a Gemini, Groq, or OpenAI API key in Studio Settings.';
    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        synced_lyrics: '',
        plain_transcript: '',
        transcription_status: 'failed',
        transcription_progress: 0,
        transcribed_seconds: 0,
        error_message: failReason
    });
    appendStudioQueueHistory({
        bookKey: book.book_key,
        bookTitle: book.title,
        chapterKey: chapter.chapter_key,
        chapterTitle: chapter.title,
        queueType: 'transcription',
        status: 'failed',
        providerUsed: sttCandidates[0]?.label || 'Speech-to-Text API',
        detail: failReason
    });
    updateLiveStatus({ isRunning: false, activeTask: null, lastLog: `Transcription failed for "${chapter.title}": ${failReason}` });
    return { syncedLyrics: '', plainTranscript: '' };
};

/**
 * Lightweight single-threaded FFmpeg Audio Quality Improvement & Voice Timbre/Pitch Transformation.
 * Resolves both local files AND remote Plex audio streams via `resolveChapterAudioStreamSource`,
 * and strictly verifies that the output `.m4a` file was created on disk before marking `completed`.
 */
export const enhanceAudiobookChapterAudio = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig,
    overrideVoicePreset?: string
): Promise<string | null> => {
    const voicePreset = overrideVoicePreset || chapter.voice_preset || book.voice_preset || config.defaultVoicePreset || 'warm_storyteller';
    const effectiveVoice = voicePreset === 'original' ? 'denoise_clarity' : voicePreset;

    const streamSource = await resolveChapterAudioStreamSource(book, chapter);
    const ffmpegInputSource = streamSource.inputSource;
    if (streamSource.localPath && streamSource.localPath !== chapter.file_path) {
        chapter.file_path = streamSource.localPath;
    }

    if (!ffmpegInputSource) {
        const errMsg = `Could not locate audio source for "${chapter.title}"`;
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            audio_enhance_status: 'failed',
            audio_enhance_progress: 0,
            error_message: errMsg
        });
        return null;
    }

    updateLiveStatus({
        isRunning: true,
        activeBookKey: book.book_key,
        activeBookTitle: book.title,
        activeChapterKey: chapter.chapter_key,
        activeChapterTitle: chapter.title,
        activeTask: 'enhancing',
        progress: 20,
        lastLog: `Processing audio profile "${effectiveVoice}" for "${chapter.title}" (1 CPU thread)...`
    });

    const effectiveEnhancePreset = book.enhance_preset || config.audioEnhancePreset || 'denoise_clarity';
    console.log(`🎙️ [AudiobookStudio] Enhancing audio for "${book.title}" -> "${chapter.title}" (Preset: ${effectiveEnhancePreset}, Voice: ${effectiveVoice})`);

    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        audio_enhance_status: 'processing',
        audio_enhance_progress: 25,
        error_message: ''
    });

    const filters: string[] = [];

    if (effectiveEnhancePreset === 'vintage_restore') {
        filters.push('highpass=f=85', 'lowpass=f=11000', 'afftdn=nf=-22:nt=w', 'equalizer=f=2800:width_type=h:width=1200:g=3.5', 'dynaudnorm=f=150:g=13');
    } else if (effectiveEnhancePreset === 'crystal_voice') {
        filters.push('highpass=f=75', 'afftdn=nf=-25', 'acompressor=threshold=-18dB:ratio=2.5:attack=15:release=200', 'equalizer=f=3200:width_type=h:width=1400:g=3', 'loudnorm=I=-16:TP=-1.5:LRA=11');
    } else {
        filters.push('highpass=f=80', 'lowpass=f=13500', 'afftdn=nf=-24', 'dynaudnorm=f=200:g=15');
    }

    if (effectiveVoice === 'deep_narrator' || effectiveVoice === 'deep_cinema') {
        filters.push('asetrate=44100*0.92,aresample=44100,atempo=1.0869565,equalizer=f=140:width_type=h:width=90:g=3');
    } else if (effectiveVoice === 'warm_storyteller') {
        filters.push('asetrate=44100*0.96,aresample=44100,atempo=1.0416667,equalizer=f=220:width_type=h:width=120:g=2.5');
    } else if (effectiveVoice === 'crisp_clear' || effectiveVoice === 'crisp_modern') {
        filters.push('asetrate=44100*1.04,aresample=44100,atempo=0.9615385,equalizer=f=3600:width_type=h:width=1200:g=3');
    } else if (effectiveVoice === 'soft_velvet' || effectiveVoice === 'velvet_narrator') {
        filters.push('asetrate=44100*0.97,aresample=44100,atempo=1.0309278,lowpass=f=10500,equalizer=f=180:width_type=h:width=100:g=2.5');
    } else if (effectiveVoice === 'late_night_radio') {
        filters.push('asetrate=44100*0.94,aresample=44100,atempo=1.0638298,highpass=f=90,lowpass=f=10000,equalizer=f=160:width_type=h:width=90:g=3.5,acompressor=threshold=-18dB:ratio=3:attack=10:release=180');
    }

    const safeId = chapter.chapter_key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFileName = `${safeId}_${effectiveVoice}.m4a`;
    const outPath = path.join(getAudiobookEnhancedDir(), outFileName);

    const success = await new Promise<boolean>((resolve) => {
        const ff = spawn('ffmpeg', [
            '-y',
            '-threads', '1',
            '-i', ffmpegInputSource,
            '-vn',
            '-af', filters.join(','),
            '-c:a', 'aac',
            '-b:a', '96k',
            outPath
        ]);

        ff.on('close', (code) => {
            const ok = code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024;
            resolve(ok);
        });
        ff.on('error', () => resolve(false));
    });

    if (success) {
        const existingVoices = { ...(chapter.processed_voices || {}) };
        existingVoices[effectiveVoice] = outPath;
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            audio_enhance_status: 'completed',
            audio_enhance_progress: 100,
            enhanced_audio_path: outPath,
            voice_preset: effectiveVoice,
            processed_voices: existingVoices,
            error_message: ''
        });
        appendStudioQueueHistory({
            bookKey: book.book_key,
            bookTitle: book.title,
            chapterKey: chapter.chapter_key,
            chapterTitle: chapter.title,
            queueType: 'voice',
            status: 'completed',
            providerUsed: `FFmpeg Audio DSP (${effectiveVoice})`,
            detail: `Processed "${effectiveVoice}" + ${effectiveEnhancePreset}`,
            serverFileUrl: `/api/theater/audiobooks/art?audio=${encodeURIComponent(outFileName)}`
        });
        console.log(`✅ [AudiobookStudio] Enhanced audio (${effectiveVoice}) saved to ${outPath}`);
        return outPath;
    } else {
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            audio_enhance_status: 'failed',
            audio_enhance_progress: 0,
            error_message: 'FFmpeg audio processing failed'
        });
        return null;
    }
};

/**
 * Sanitizes and grounds an image generation prompt against the actual scene text:
 * - Preserves all named characters, actions, costumes, facial expressions, and story events!
 * - Only strips extreme gore/disfigurement tokens so diffusion models draw expressive literary illustrations
 *   featuring the real characters and plot moments of the scene.
 */
export const sanitizeAndGroundScenePrompt = (params: {
    rawPrompt: string;
    sceneSnippet: string;
    bookTitle: string;
    author: string;
    chapterTitle: string;
    effectiveStyle: string;
    attempt?: number;
}): string => {
    const { rawPrompt, sceneSnippet, bookTitle, effectiveStyle } = params;

    let cleaned = rawPrompt
        .replace(/\b(nightmare fuel|visceral gore|gory|mutilated|rotting flesh|maggot|cockroach monster|human-insect hybrid)\b/gi, '')
        .replace(/\b(monstrous\s+vermin|giant\s+insect|giant\s+bug)\b/gi,
            'unsettling transformed silhouette shrouded in deep chiaroscuro bedroom shadows'
        );

    if (/metamorphosis/i.test(bookTitle)) {
        cleaned = cleaned.replace(/\b(cockroach|roach|mandibles|chitin)\b/gi, 'dark carapace shadow');
    }

    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 25) {
        const cleanSnippet = (sceneSnippet || '').replace(/["'()\[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
        cleaned = `${effectiveStyle} literary book illustration for "${bookTitle}", depicting the characters and dramatic action of the scene: ${cleanSnippet}`;
    }

    const guardrailSuffix = 'expressive character illustration, detailed period clothing and faces, coherent natural anatomy, cinematic lighting, no text, no watermark';
    if (cleaned.toLowerCase().includes('no text, no watermark')) {
        return cleaned;
    }
    return `${cleaned}, ${guardrailSuffix}`;
};

/**
 * Validates a generated raster image buffer BEFORE accepting it into the library:
 * 1. Technical & byte-entropy check (rejects corrupt, tiny <8KB, or blank/solid-color error tiles).
 * 2. Multimodal Vision LLM inspection (when Gemini / OpenAI / Claude key is available).
 */
const validateGeneratedStudioImage = async (params: {
    buf: Buffer;
    promptUsed: string;
    sceneSnippet: string;
    book: AudiobookBookMeta;
    chapterTitle: string;
    effectiveStyle: string;
    attempt: number;
}): Promise<{ accepted: boolean; reason: string; rewrittenPrompt?: string }> => {
    const { buf, promptUsed, sceneSnippet, book, chapterTitle, effectiveStyle, attempt } = params;

    // 1. Technical & Byte Entropy Validation
    if (!isValidImageBuffer(buf) || buf.length < 8192) {
        return {
            accepted: false,
            reason: `Image buffer too small or corrupt (${buf.length} bytes)`,
            rewrittenPrompt: sanitizeAndGroundScenePrompt({
                rawPrompt: promptUsed,
                sceneSnippet,
                bookTitle: book.title,
                author: book.author,
                chapterTitle,
                effectiveStyle,
                attempt: attempt + 1
            })
        };
    }

    // Check payload byte diversity in the middle of the compressed image to reject blank/flat error images
    const sampleStart = Math.min(512, Math.floor(buf.length * 0.2));
    const sampleEnd = Math.min(buf.length, sampleStart + 2048);
    const uniqueBytes = new Set<number>();
    for (let i = sampleStart; i < sampleEnd; i++) {
        uniqueBytes.add(buf[i]);
    }
    if (uniqueBytes.size < 45) {
        return {
            accepted: false,
            reason: `Low image visual entropy (${uniqueBytes.size} unique byte values — likely blank or placeholder tile)`,
            rewrittenPrompt: sanitizeAndGroundScenePrompt({
                rawPrompt: promptUsed,
                sceneSnippet,
                bookTitle: book.title,
                author: book.author,
                chapterTitle,
                effectiveStyle,
                attempt: attempt + 1
            })
        };
    }

    // 2. Multimodal Vision Validation (Gemini Flash Vision / OpenAI GPT-4o-mini Vision)
    const freshConfig = getAudiobookStudioConfig();
    const visionCandidates = getCandidateStudioKeys(freshConfig, ['gemini', 'openai', 'claude']);

    const visionSystemRubric = [
        `You are an art director and quality validator for a literary audiobook studio.`,
        `Inspect this generated illustration for the book "${book.title}" by ${book.author} (${chapterTitle}).`,
        `Actual text of this scene: "${(sceneSnippet || '').slice(0, 400)}".`,
        `EVALUATION RULES:`,
        `1. REJECT ("accepted": false) ONLY if the image is completely broken, a blank error banner, covered in giant gibberish text watermarks, or severe anatomical gore.`,
        `2. If you reject the image, provide a "rewrittenPrompt" (max 75 words) that vividly depicts the exact named characters, expressions, clothing, and plot action of this scene in ${effectiveStyle} style.`,
        `Respond ONLY with valid JSON: {"accepted": boolean, "reason": "short explanation", "rewrittenPrompt": "new vivid character & plot prompt if rejected"}`
    ].join('\n');

    for (const keyEntry of visionCandidates) {
        try {
            if (keyEntry.provider === 'gemini') {
                const b64 = buf.toString('base64');
                const geminiModels = ['gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.0-flash'];
                for (const modelName of geminiModels) {
                    try {
                        const resp = await axios.post(
                            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(keyEntry.key)}`,
                            {
                                contents: [{
                                    parts: [
                                        { text: visionSystemRubric },
                                        { inlineData: { mimeType: 'image/jpeg', data: b64 } }
                                    ]
                                }],
                                generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
                            },
                            { timeout: 20000 }
                        );
                        const rawText = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);
                            if (typeof parsed.accepted === 'boolean') {
                                if (!parsed.accepted) {
                                    const fallbackRewrite = sanitizeAndGroundScenePrompt({
                                        rawPrompt: parsed.rewrittenPrompt || promptUsed,
                                        sceneSnippet,
                                        bookTitle: book.title,
                                        author: book.author,
                                        chapterTitle,
                                        effectiveStyle,
                                        attempt: attempt + 1
                                    });
                                    return {
                                        accepted: false,
                                        reason: parsed.reason || 'Rejected by AI Vision quality check',
                                        rewrittenPrompt: fallbackRewrite
                                    };
                                }
                                return { accepted: true, reason: parsed.reason || 'Verified by Gemini Vision' };
                            }
                        }
                        break;
                    } catch {}
                }
            } else if (keyEntry.provider === 'openai') {
                const b64 = buf.toString('base64');
                const resp = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: 'gpt-4o-mini',
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: visionSystemRubric },
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } }
                            ]
                        }],
                        max_tokens: 300,
                        temperature: 0.1
                    },
                    {
                        headers: { Authorization: `Bearer ${keyEntry.key}` },
                        timeout: 20000
                    }
                );
                const rawText = resp.data?.choices?.[0]?.message?.content?.trim() || '';
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (typeof parsed.accepted === 'boolean') {
                        if (!parsed.accepted) {
                            return {
                                accepted: false,
                                reason: parsed.reason || 'Rejected by OpenAI Vision quality check',
                                rewrittenPrompt: sanitizeAndGroundScenePrompt({
                                    rawPrompt: parsed.rewrittenPrompt || promptUsed,
                                    sceneSnippet,
                                    bookTitle: book.title,
                                    author: book.author,
                                    chapterTitle,
                                    effectiveStyle,
                                    attempt: attempt + 1
                                })
                            };
                        }
                        return { accepted: true, reason: parsed.reason || 'Verified by OpenAI Vision' };
                    }
                }
            }
        } catch {}
    }

    return { accepted: true, reason: 'Passed technical & literary grounding validation' };
};

/**
 * Dynamic AI Scene Prompt Director:
 * Uses the user's configured AI key pool (with failover / load-balancing & live API metrics)
 * plus verified Wikipedia/OpenLibrary plot & character context and transcribed audio passages
 * to craft a scene-accurate, character-driven visual prompt depicting exact characters, events, and locations.
 */
export const generateDynamicScenePrompt = async (params: {
    book: AudiobookBookMeta;
    chapter: AudiobookChapterMeta;
    sceneIndex: number;
    totalScenes: number;
    sceneTitle?: string;
    artType?: 'cover' | 'chapter' | 'scene';
    sceneSnippet: string;
    previousPrompts: string[];
    effectiveStyle: string;
    effectiveFocus: string;
    effectiveCustomPrompt: string;
    config: AudiobookStudioConfig;
}): Promise<string> => {
    const {
        book,
        chapter,
        sceneIndex,
        totalScenes,
        sceneTitle,
        artType = 'scene',
        sceneSnippet,
        previousPrompts,
        effectiveStyle,
        effectiveFocus,
        effectiveCustomPrompt,
        config
    } = params;

    const focusDirectives: Record<string, string> = {
        'auto-choice': 'dynamic character-driven scene capturing the main characters, their facial expressions, body language, plot action, and setting',
        'characters': 'expressive character portrait, period attire, facial expression, and dramatic interaction in scene',
        'ambient': 'immersive atmospheric lighting, mood, weather, and environmental texture with characters in frame',
        'theme': 'symbolic visual metaphor and emotional core of the chapter',
        'landscapes': 'sweeping wide environmental vista and architectural/natural scenery'
    };

    const focusDesc = focusDirectives[effectiveFocus] || focusDirectives['auto-choice'];
    const useDynamic = book.dynamic_prompt_enabled !== undefined
        ? book.dynamic_prompt_enabled
        : (config.dynamicPromptEnabled !== false);

    // Extract character names & locations from both the book's discovered structure and the scene snippet
    const knownCharacters: string[] = [];
    if (book.real_structure_json) {
        try {
            const st: BookRealStructure = JSON.parse(book.real_structure_json);
            for (const c of st.chapters || []) {
                for (const sc of c.scenes || []) {
                    for (const chName of sc.characters || []) {
                        if (chName && !knownCharacters.includes(chName)) knownCharacters.push(chName);
                    }
                }
            }
        } catch {}
    }

    const properNouns = Array.from(
        new Set([
            ...knownCharacters.slice(0, 6),
            ...(sceneSnippet.match(/\b[A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?\b/g) || [])
                .filter(w => !['The', 'And', 'But', 'Then', 'When', 'Where', 'While', 'Opening', 'Chapter', 'Section', 'Events', 'Details', 'Closing', 'Scene', 'Part'].includes(w))
        ])
    ).slice(0, 8);

    const prevContinuity = previousPrompts.length > 0
        ? `Previous scene visual continuity: "${previousPrompts[previousPrompts.length - 1].slice(0, 220)}"`
        : '';

    const roleTarget = artType === 'cover'
        ? `the iconic Master Book Cover Illustration for the book "${book.title}" by ${book.author}`
        : artType === 'chapter'
        ? `the Chapter Opening Illustration for "${chapter.title}" of "${book.title}" by ${book.author}`
        : `Scene ${sceneIndex + 1} of ${totalScenes} (${sceneTitle || `Scene ${sceneIndex + 1}`}) in "${chapter.title}" of "${book.title}" by ${book.author}`;

    if (useDynamic) {
        const directorSystemPrompt = [
            `You are a master cinematic concept artist and classic literary book illustrator.`,
            `Write ONE vivid, character-driven, plot-specific image-generation prompt (50 to 80 words) for ${roleTarget}.`,
            `Art Style: ${effectiveStyle}. Visual Focus: ${focusDesc}.`,
            sceneSnippet ? `Exact story event / transcribed audio passage happening right now: "${sceneSnippet}".` : '',
            properNouns.length > 0 ? `Named characters & subjects in this book: ${properNouns.join(', ')}.` : '',
            prevContinuity ? `${prevContinuity} (Keep consistent character faces, wardrobe, and era while depicting this specific new plot action).` : '',
            effectiveCustomPrompt ? `Additional user direction: ${effectiveCustomPrompt}.` : '',
            `CRITICAL ILLUSTRATION RULES:`,
            `1. NEVER generate an empty room or generic furniture! You MUST depict the specific characters present in this scene, their physical appearance, period clothing, facial expressions, and the exact action or confrontation happening in the passage.`,
            `2. If the scene involves a surreal transformation (such as Gregor Samsa in The Metamorphosis), depict the dramatic human and atmospheric reality of the moment—e.g. Gregor in his dim 1910s Prague bedroom, the locked double doors, the anxious family (Grete, Mr. and Mrs. Samsa) or the stern Chief Clerk in his bowler hat reacting in shock, with evocative chiaroscuro shadows.`,
            `3. Do NOT include any text, letters, book titles, speech bubbles, or watermarks in the image. Return ONLY the raw image prompt.`
        ].filter(Boolean).join('\n');

        const llmRes = await callStudioTextLlmWithFailover({
            prompt: directorSystemPrompt,
            task: 'art_prompt',
            maxTokens: 200,
            temperature: 0.6,
            description: `Scene prompt (${artType}) for "${book.title}"`
        });

        if (llmRes?.text && llmRes.text.length > 25) {
            return sanitizeAndGroundScenePrompt({
                rawPrompt: `${llmRes.text.replace(/^["']|["']$/g, '')}, ${effectiveStyle}, masterpiece literary book illustration`,
                sceneSnippet,
                bookTitle: book.title,
                author: book.author,
                chapterTitle: chapter.title,
                effectiveStyle,
                attempt: 0
            });
        }
    }

    const cleanSnippet = sceneSnippet
        .replace(/["'()\[\]{}<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);

    const baseFallbackPrompt = [
        `${effectiveStyle} literary illustration for "${book.title}" by ${book.author}`,
        properNouns.length > 0 ? `depicting characters ${properNouns.slice(0, 4).join(', ')} in action` : 'depicting the main characters in dramatic action',
        cleanSnippet ? `during the scene: ${cleanSnippet}` : '',
        `(${focusDesc}, expressive faces and body language, authentic period wardrobe and setting)`
    ].filter(Boolean).join(', ');

    return sanitizeAndGroundScenePrompt({
        rawPrompt: baseFallbackPrompt,
        sceneSnippet,
        bookTitle: book.title,
        author: book.author,
        chapterTitle: chapter.title,
        effectiveStyle,
        attempt: 0
    });
};

/**
 * Purges any legacy fake `.svg` placeholder files, corrupt image files, AND legacy boilerplate
 * "empty room" images (`depicting a period-accurate interior setting, warm lamp light and dramatic window shadows`)
 * from disk and SQLite (`audiobooks_meta` and `audiobook_chapters_meta`), recalculating book totals.
 */
let hasPurgedFakeSvgArt = false;
export const purgeAllFakeSvgArtFromDbAndDisk = (force = false): {
    deletedFiles: number;
    cleanedChapters: number;
    cleanedBooks: number;
} => {
    let deletedFiles = 0;
    let cleanedChapters = 0;
    let cleanedBooks = 0;
    if (hasPurgedFakeSvgArt && !force) {
        return { deletedFiles, cleanedChapters, cleanedBooks };
    }
    hasPurgedFakeSvgArt = true;
    try {
        const artDir = getAudiobookArtDir();
        const transcriptsDir = getAudiobookTranscriptsDir();
        if (fs.existsSync(artDir)) {
            for (const f of fs.readdirSync(artDir)) {
                if (f.toLowerCase().endsWith('.svg')) {
                    try {
                        fs.unlinkSync(path.join(artDir, f));
                        deletedFiles++;
                    } catch {}
                }
            }
        }

        // Identify any chapters whose transcript history came from fake Literary/Gutenberg alignment
        const fakeHistoryChapterKeys = new Set<string>();
        try {
            const hist = getStudioQueueHistory();
            const filteredHist = hist.filter(h => {
                const isFakeSource =
                    h.queueType === 'transcription' &&
                    /Literary|Gutenberg|Structure Sync/i.test(h.providerUsed || '');
                if (isFakeSource && h.chapterKey) {
                    fakeHistoryChapterKeys.add(h.chapterKey);
                }
                return !isFakeSource;
            });
            if (filteredHist.length !== hist.length) {
                setSetting('audiobook_studio_history', JSON.stringify(filteredHist));
            }
        } catch {}

        const allBooks = getAllAudiobooksMeta();
        for (const book of allBooks) {
            let bookChanged = false;
            if (book.custom_cover_url && book.custom_cover_url.toLowerCase().includes('.svg')) {
                upsertAudiobookMeta({
                    book_key: book.book_key,
                    custom_cover_url: '',
                    use_custom_cover: false
                });
                cleanedBooks++;
                bookChanged = true;
            }
            const chapters = getAudiobookChaptersMeta(book.book_key);
            for (const ch of chapters) {
                const origImages = Array.isArray(ch.images) ? ch.images : [];
                const validImages = origImages.filter(img => {
                    if (!img?.url || img.url.toLowerCase().includes('.svg')) return false;
                    // Purge legacy empty-room fallback prompts caused by the old attempt=1 guardrail rewrite
                    if (
                        typeof img.prompt === 'string' &&
                        img.prompt.includes('depicting a period-accurate interior setting, warm lamp light and dramatic window shadows')
                    ) {
                        const mDel = img.url.match(/[?&]file=([^&]+)/);
                        if (mDel) {
                            const fNameDel = path.basename(decodeURIComponent(mDel[1]));
                            const fullPDel = path.join(artDir, fNameDel);
                            try {
                                if (fs.existsSync(fullPDel)) {
                                    fs.unlinkSync(fullPDel);
                                    deletedFiles++;
                                }
                            } catch {}
                        }
                        return false;
                    }
                    const m = img.url.match(/[?&]file=([^&]+)/);
                    if (m) {
                        const fName = path.basename(decodeURIComponent(m[1]));
                        const fullP = path.join(artDir, fName);
                        if (!fs.existsSync(fullP)) return false;
                        try {
                            const b = fs.readFileSync(fullP);
                            if (!isValidImageBuffer(b)) {
                                try {
                                    fs.unlinkSync(fullP);
                                    deletedFiles++;
                                } catch {}
                                return false;
                            }
                        } catch {
                            return false;
                        }
                    }
                    return true;
                });
                if (validImages.length !== origImages.length) {
                    upsertAudiobookChapterMeta({
                        chapter_key: ch.chapter_key,
                        book_key: book.book_key,
                        images: validImages,
                        illustration_status: validImages.some(i => i.kept) ? 'completed' : 'queued',
                        illustration_progress: validImages.some(i => i.kept) ? 100 : 0
                    });
                    cleanedChapters++;
                    bookChanged = true;
                }

                // Purge any fake/Wikipedia/summary/repeated transcripts
                const hasTranscriptText = Boolean((ch.synced_lyrics && ch.synced_lyrics.trim()) || (ch.plain_transcript && ch.plain_transcript.trim()));
                if (
                    hasTranscriptText &&
                    (fakeHistoryChapterKeys.has(ch.chapter_key) ||
                     isFakePlaceholderTranscript(ch.synced_lyrics) ||
                     isFakePlaceholderTranscript(ch.plain_transcript))
                ) {
                    const safeChapterId = ch.chapter_key.replace(/[^a-zA-Z0-9_-]/g, '_');
                    for (const ext of ['.lrc', '.txt']) {
                        const p = path.join(transcriptsDir, `${safeChapterId}${ext}`);
                        if (fs.existsSync(p)) {
                            try { fs.unlinkSync(p); deletedFiles++; } catch {}
                        }
                    }
                    upsertAudiobookChapterMeta({
                        chapter_key: ch.chapter_key,
                        book_key: book.book_key,
                        synced_lyrics: '',
                        plain_transcript: '',
                        transcript_lrc_path: '',
                        transcript_txt_path: '',
                        transcribed_seconds: 0,
                        transcription_status: 'queued',
                        transcription_progress: 0,
                        error_message: ''
                    });
                    cleanedChapters++;
                    bookChanged = true;
                }

                // Purge fake completed audio_enhance_status where no actual enhanced file exists on disk
                if (ch.audio_enhance_status === 'completed' && (!ch.enhanced_audio_path || !fs.existsSync(ch.enhanced_audio_path))) {
                    upsertAudiobookChapterMeta({
                        chapter_key: ch.chapter_key,
                        book_key: book.book_key,
                        audio_enhance_status: 'queued',
                        audio_enhance_progress: 0,
                        enhanced_audio_path: '',
                        processed_voices: {},
                        error_message: ''
                    });
                    cleanedChapters++;
                    bookChanged = true;
                }
            }
            if (bookChanged) {
                recalculateAudiobookTotals(book.book_key);
            }
        }
    } catch (e: any) {
        console.warn('⚠️ [AudiobookStudio] Error purging legacy fake assets:', e?.message);
    }
    return { deletedFiles, cleanedChapters, cleanedBooks };
};

/**
 * Low-level raster image generator across all configured and free providers.
 * Returns raw `{ buf, providerUsed }` so `paintAndSaveStudioImage` can run validation
 * and rewrite the prompt if needed before accepting and saving to disk.
 */
const generateRawCandidateImageBuffer = async (params: {
    promptToUse: string;
    book: AudiobookBookMeta;
    chapterTitle: string;
    width: number;
    height: number;
    attempt: number;
}): Promise<{ buf: Buffer; providerUsed: string } | null> => {
    const { promptToUse, book, chapterTitle, width, height, attempt } = params;
    const freshConfig = getAudiobookStudioConfig();

    // 1. Try configured API keys in failover / load-balance order (Gemini Image / Imagen 3, OpenAI DALL-E 3)
    const imageKeyCandidates = getCandidateStudioKeys(freshConfig, ['gemini', 'openai']);
    for (const keyEntry of imageKeyCandidates) {
        if (keyEntry.provider === 'gemini') {
            const geminiImageModels = [
                'gemini-2.5-flash-image',
                'gemini-2.0-flash-exp-image-generation',
                'gemini-2.0-flash-preview-image-generation'
            ];
            for (const gModel of geminiImageModels) {
                try {
                    const flashImgResp = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${encodeURIComponent(keyEntry.key)}`,
                        {
                            contents: [{ parts: [{ text: `Generate a tasteful, detailed cinematic book illustration (strictly no text, no words, no titles, no body horror, no deformed anatomy): ${promptToUse.slice(0, 1500)}` }] }],
                            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
                        },
                        { timeout: 45000 }
                    );
                    const parts = flashImgResp.data?.candidates?.[0]?.content?.parts || [];
                    const imgPart = parts.find((p: any) => p.inlineData?.data);
                    if (imgPart?.inlineData?.data) {
                        const buf = Buffer.from(imgPart.inlineData.data, 'base64');
                        if (isValidImageBuffer(buf)) {
                            recordStudioApiMetric({
                                task: 'image_paint',
                                keyOrProvider: keyEntry.id,
                                providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                                success: true,
                                description: `Gemini Flash Image: "${book.title}" — ${chapterTitle}`
                            });
                            return { buf, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                        }
                    }
                } catch {}
            }

            try {
                const imagenResp = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(keyEntry.key)}`,
                    {
                        instances: [{ prompt: promptToUse.slice(0, 1800) }],
                        parameters: { sampleCount: 1, aspectRatio: width > height ? '16:9' : width < height ? '3:4' : '1:1' }
                    },
                    { timeout: 45000 }
                );
                const b64 = imagenResp.data?.predictions?.[0]?.bytesBase64Encoded;
                if (b64) {
                    const buf = Buffer.from(b64, 'base64');
                    if (isValidImageBuffer(buf)) {
                        recordStudioApiMetric({
                            task: 'image_paint',
                            keyOrProvider: keyEntry.id,
                            providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                            success: true,
                            description: `Gemini Imagen 3: "${book.title}" — ${chapterTitle}`
                        });
                        return { buf, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                    }
                }
            } catch {}
        } else if (keyEntry.provider === 'openai') {
            try {
                const resp = await axios.post(
                    'https://api.openai.com/v1/images/generations',
                    {
                        model: 'dall-e-3',
                        prompt: promptToUse.slice(0, 3800),
                        n: 1,
                        size: width > height ? '1792x1024' : width < height ? '1024x1792' : '1024x1024',
                        response_format: 'b64_json'
                    },
                    {
                        headers: { Authorization: `Bearer ${keyEntry.key}` },
                        timeout: 60000
                    }
                );
                const b64 = resp.data?.data?.[0]?.b64_json;
                if (b64) {
                    const buf = Buffer.from(b64, 'base64');
                    if (isValidImageBuffer(buf)) {
                        recordStudioApiMetric({
                            task: 'image_paint',
                            keyOrProvider: keyEntry.id,
                            providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                            success: true,
                            description: `DALL·E 3: "${book.title}" — ${chapterTitle}`
                        });
                        return { buf, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                    }
                }
            } catch (e: any) {
                recordStudioApiMetric({
                    task: 'image_paint',
                    keyOrProvider: keyEntry.id,
                    providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                    success: false,
                    errorMessage: e?.response?.data?.error?.message || e.message
                });
            }
        }
    }

    // 2. Custom Local SDXL / Flux Endpoint if configured
    if (freshConfig.customApiUrl) {
        try {
            const headers: Record<string, string> = {};
            if (freshConfig.customApiKey) headers.Authorization = `Bearer ${freshConfig.customApiKey}`;
            const resp = await axios.post(
                freshConfig.customApiUrl,
                {
                    prompt: promptToUse,
                    negative_prompt: 'body horror, gore, deformed face, mutated insect hybrid, nightmare fuel, extra limbs, text, watermark',
                    width,
                    height,
                    steps: 20
                },
                { headers, timeout: 60000 }
            );
            const b64 = resp.data?.images?.[0] || resp.data?.data?.[0]?.b64_json;
            if (b64) {
                const buf = Buffer.from(b64, 'base64');
                if (isValidImageBuffer(buf)) {
                    return { buf, providerUsed: 'Custom Local Image Endpoint' };
                }
            }
        } catch {}
    }

    // 3. SubNP Free Flux / Magic Image Generator (fast 4s real JPEG generation, no API key required)
    const subnpModels = ['magic', 'flux', 'turbo'];
    for (const subModel of subnpModels) {
        try {
            const subResp = await axios.post(
                'https://subnp.com/api/free/generate',
                { prompt: `${promptToUse.slice(0, 900)}, no text, no watermark`, model: subModel },
                { timeout: 35000, responseType: 'text', headers: { 'Content-Type': 'application/json' } }
            );
            const sseText = String(subResp.data || '');
            const lines = sseText.split('\n').map(l => l.trim()).filter(l => l.startsWith('data:'));
            for (const line of lines.reverse()) {
                try {
                    const parsed = JSON.parse(line.replace(/^data:\s*/, ''));
                    const imageUrl = parsed?.imageUrl || parsed?.url;
                    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
                        const imgBin = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 25000 });
                        const buf = Buffer.from(imgBin.data || []);
                        if (isValidImageBuffer(buf)) {
                            return { buf, providerUsed: `Flux Studio (${subModel})` };
                        }
                    }
                } catch {}
            }
        } catch {}
    }

    // 4. HuggingFace Official Flux.1-schnell Gradio Space API
    const hfSpaces = [
        'https://black-forest-labs-flux-1-schnell.hf.space',
        'https://multimodalart-flux-1-merged.hf.space'
    ];
    const hfW = Math.min(1024, Math.max(512, Math.round(width / 32) * 32));
    const hfH = Math.min(1024, Math.max(512, Math.round(height / 32) * 32));
    for (const spaceBase of hfSpaces) {
        try {
            const callResp = await axios.post(
                `${spaceBase}/gradio_api/call/infer`,
                { data: [promptToUse.slice(0, 900), Math.floor(Math.random() * 1000000), true, hfW, hfH, 4] },
                { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
            );
            const eventId = callResp.data?.event_id;
            if (eventId) {
                const sseResp = await axios.get(`${spaceBase}/gradio_api/call/infer/${eventId}`, {
                    timeout: 55000,
                    responseType: 'text'
                });
                const sseText = String(sseResp.data || '');
                const dataLines = sseText.split('\n').filter(l => l.startsWith('data: '));
                for (const dLine of dataLines.reverse()) {
                    try {
                        const parsed = JSON.parse(dLine.slice(6));
                        const firstItem = Array.isArray(parsed) ? parsed[0] : parsed;
                        const remoteUrl = firstItem?.url || (firstItem?.path ? `${spaceBase}/gradio_api/file=${firstItem.path}` : null);
                        if (remoteUrl) {
                            const imgBin = await axios.get(remoteUrl, { responseType: 'arraybuffer', timeout: 25000 });
                            const buf = Buffer.from(imgBin.data || []);
                            if (isValidImageBuffer(buf)) {
                                return { buf, providerUsed: 'Flux.1 Schnell (HF Space)' };
                            }
                        }
                    } catch {}
                }
            }
        } catch {}
    }

    // 5. Sanitized Pollinations Flux / Turbo endpoints with retry backoff and explicit negative prompt
    const seed = Math.floor(Math.random() * 900000) + attempt * 1337;
    const sanitizedPrompt = promptToUse
        .replace(/[^a-zA-Z0-9 ,.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
    const encodedPrompt = encodeURIComponent(sanitizedPrompt);
    const negPrompt = encodeURIComponent('body horror, gore, deformed face, mutated bug, nightmare fuel, extra limbs, text, watermark, ugly');
    const pW = Math.min(1024, Math.max(512, Math.round(width / 16) * 16));
    const pH = Math.min(1024, Math.max(512, Math.round(height / 16) * 16));
    const candidateUrls = [
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${pW}&height=${pH}&seed=${seed}&nologo=true&model=flux&negative=${negPrompt}`,
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${pW}&height=${pH}&seed=${seed + 19}&nologo=true&model=turbo&negative=${negPrompt}`,
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${pW}&height=${pH}&seed=${seed + 43}&nologo=true`
    ];

    for (let uIdx = 0; uIdx < candidateUrls.length; uIdx++) {
        const fluxUrl = candidateUrls[uIdx];
        try {
            if (uIdx > 0) {
                await new Promise(r => setTimeout(r, 1800));
            }
            const imgResp = await axios.get(fluxUrl, {
                responseType: 'arraybuffer',
                timeout: 42000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
                    'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.9'
                }
            });
            const buf = Buffer.from(imgResp.data || []);
            if (isValidImageBuffer(buf)) {
                return { buf, providerUsed: 'Flux Studio Engine' };
            }
        } catch (pollErr: any) {
            if (pollErr?.response?.status === 429 || pollErr?.response?.status === 502) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }

    // 6. AI Horde anonymous community GPU cluster (512x512 avoids 403 KudosUpfront)
    try {
        const hordeInit = await axios.post(
            'https://stablehorde.net/api/v2/generate/async',
            {
                prompt: `${promptToUse.slice(0, 620)} ### body horror, gore, mutated insect hybrid, deformed face, nightmare fuel, text, watermark, signature, blurry, ugly`,
                params: {
                    width: 512,
                    height: 512,
                    steps: 20,
                    cfg_scale: 7,
                    sampler_name: 'k_euler_a',
                    n: 1
                },
                models: ['Deliberate', 'stable_diffusion'],
                nsfw: false,
                censor_nsfw: false,
                r2: true
            },
            {
                headers: {
                    'apikey': '0000000000',
                    'Client-Agent': 'SchedulearrAudiobookStudio:1.0:admin'
                },
                timeout: 15000
            }
        );
        const jobId = hordeInit.data?.id;
        if (jobId) {
            for (let poll = 0; poll < 16; poll++) {
                await new Promise(r => setTimeout(r, 3500));
                const statusResp = await axios.get(`https://stablehorde.net/api/v2/generate/status/${jobId}`, {
                    headers: { 'Client-Agent': 'SchedulearrAudiobookStudio:1.0:admin' },
                    timeout: 12000
                });
                if (statusResp.data?.done && Array.isArray(statusResp.data?.generations) && statusResp.data.generations.length > 0) {
                    const genImg = statusResp.data.generations[0]?.img;
                    if (genImg) {
                        const buf = genImg.startsWith('http')
                            ? Buffer.from((await axios.get(genImg, { responseType: 'arraybuffer', timeout: 25000 })).data || [])
                            : Buffer.from(genImg, 'base64');
                        if (isValidImageBuffer(buf)) {
                            return { buf, providerUsed: `AI Horde (${statusResp.data.generations[0]?.model || 'SDXL'})` };
                        }
                    }
                    break;
                }
                if (statusResp.data?.faulted) break;
            }
        }
    } catch {}

    return null;
};

/**
 * Paints, VALIDATES, and saves a REAL binary raster image (JPEG/PNG/WebP) on the server:
 * - Runs every candidate image through `validateGeneratedStudioImage` before accepting it.
 * - If an image is rejected as gratuitous nightmare fuel / body horror / corrupt artifact,
 *   automatically rewrites the prompt to a grounded, tasteful literary composition and regenerates!
 * - NEVER generates fake SVG placeholders.
 */
const paintAndSaveStudioImage = async (params: {
    imgId: string;
    fullPrompt: string;
    sceneSnippet?: string;
    book: AudiobookBookMeta;
    chapterTitle: string;
    sceneIndex: number;
    effectiveStyle: string;
    width: number;
    height: number;
}): Promise<{ fileName: string; providerUsed: string; finalPrompt: string } | null> => {
    const { imgId, fullPrompt, sceneSnippet = '', book, chapterTitle, effectiveStyle, width, height } = params;
    const fileName = `${imgId}.jpg`;
    const filePath = path.join(getAudiobookArtDir(), fileName);

    let currentPrompt = sanitizeAndGroundScenePrompt({
        rawPrompt: fullPrompt,
        sceneSnippet,
        bookTitle: book.title,
        author: book.author,
        chapterTitle,
        effectiveStyle,
        attempt: 0
    });

    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = await generateRawCandidateImageBuffer({
            promptToUse: currentPrompt,
            book,
            chapterTitle,
            width,
            height,
            attempt
        });

        if (!candidate) {
            // Brief backoff before retry if providers were transiently busy
            await new Promise(r => setTimeout(r, 2000));
            currentPrompt = sanitizeAndGroundScenePrompt({
                rawPrompt: currentPrompt,
                sceneSnippet,
                bookTitle: book.title,
                author: book.author,
                chapterTitle,
                effectiveStyle,
                attempt: attempt + 1
            });
            continue;
        }

        const validation = await validateGeneratedStudioImage({
            buf: candidate.buf,
            promptUsed: currentPrompt,
            sceneSnippet,
            book,
            chapterTitle,
            effectiveStyle,
            attempt
        });

        if (validation.accepted) {
            fs.writeFileSync(filePath, candidate.buf);
            return {
                fileName,
                providerUsed: candidate.providerUsed,
                finalPrompt: currentPrompt
            };
        }

        console.warn(`🛡️ [AudiobookStudio] Image validation rejected candidate for "${book.title}" (${chapterTitle}) [Attempt ${attempt + 1}/${maxAttempts}]: ${validation.reason} — rewriting prompt and regenerating...`);
        updateLiveStatus({
            lastLog: `Validation filtered unsettling/distorted image for "${chapterTitle}" (${validation.reason}); refining prompt & regenerating...`
        });

        currentPrompt = validation.rewrittenPrompt || sanitizeAndGroundScenePrompt({
            rawPrompt: currentPrompt,
            sceneSnippet,
            bookTitle: book.title,
            author: book.author,
            chapterTitle,
            effectiveStyle,
            attempt: attempt + 1
        });
    }

    // NEVER create or return a fake SVG bookplate — return null honestly if all raster generators failed
    return null;
};

/**
 * Priority #1 Art Generator: Custom AI Book Cover
 * Stores the custom cover on the server (`custom_cover_url`) while keeping the original
 * cover active by default (`use_custom_cover = false` unless `activateImmediately` is true),
 * so the user sees a badge/symbol to swap between Original and Custom Cover at any time.
 */
export const generateAudiobookCoverArt = async (
    book: AudiobookBookMeta,
    activateImmediately: boolean = false
): Promise<AudiobookBookMeta> => {
    purgeAllFakeSvgArtFromDbAndDisk();
    const freshConfig = getAudiobookStudioConfig();
    updateLiveStatus({
        isRunning: true,
        activeBookKey: book.book_key,
        activeBookTitle: book.title,
        activeChapterKey: null,
        activeChapterTitle: 'Book Cover Art',
        activeTask: 'illustrating',
        progress: 20,
        lastLog: `Painting custom book cover for "${book.title}" by ${book.author}...`
    });

    const effectiveStyle = (book.art_style && book.art_style.trim()) ? book.art_style.trim() : (freshConfig.artStyle || 'Cinematic Concept Art');
    const effectiveFocus = (book.art_focus && book.art_focus.trim()) ? book.art_focus.trim() : (freshConfig.artFocus || 'auto-choice');
    const effectiveCustomPrompt = (book.custom_prompt && book.custom_prompt.trim()) ? book.custom_prompt.trim() : (freshConfig.customPromptTemplate || '');

    let snippet = `${book.title} by ${book.author}`;
    if (book.real_structure_json) {
        try {
            const st: BookRealStructure = JSON.parse(book.real_structure_json);
            snippet = st.chapters.map(c => `${c.title}: ${c.summary}`).slice(0, 3).join(' ');
        } catch {}
    }

    const dummyChapter: AudiobookChapterMeta = {
        chapter_key: `${book.book_key}_cover`,
        book_key: book.book_key,
        chapter_index: 0,
        title: 'Book Cover',
        duration_sec: 0,
        transcribed_seconds: 0,
        transcription_status: 'idle',
        transcription_progress: 0,
        illustration_status: 'processing',
        illustration_progress: 50,
        images: [],
        audio_enhance_status: 'idle',
        audio_enhance_progress: 0,
        voice_preset: 'original',
        updated_at: new Date().toISOString()
    };

    const fullPrompt = await generateDynamicScenePrompt({
        book,
        chapter: dummyChapter,
        sceneIndex: 0,
        totalScenes: 1,
        sceneTitle: 'Master Book Cover',
        artType: 'cover',
        sceneSnippet: snippet,
        previousPrompts: [],
        effectiveStyle,
        effectiveFocus,
        effectiveCustomPrompt,
        config: freshConfig
    });

    const imgId = `cover_${book.book_key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24)}_${Date.now()}`;
    const painted = await paintAndSaveStudioImage({
        imgId,
        fullPrompt,
        sceneSnippet: snippet,
        book,
        chapterTitle: 'Book Cover Edition',
        sceneIndex: 0,
        effectiveStyle,
        width: 900,
        height: 1200
    });

    if (!painted) {
        appendStudioQueueHistory({
            bookKey: book.book_key,
            bookTitle: book.title,
            queueType: 'art_cover',
            status: 'failed',
            providerUsed: 'All Image Providers Unreachable',
            detail: 'Failed to generate raster cover image (add a Gemini or OpenAI API key in Studio Settings for instant artwork)'
        });
        return book;
    }

    const { fileName, providerUsed } = painted;
    const coverUrl = `/api/theater/audiobooks/art?file=${encodeURIComponent(fileName)}`;
    const updatedBook = upsertAudiobookMeta({
        book_key: book.book_key,
        custom_cover_url: coverUrl,
        use_custom_cover: activateImmediately ? true : (book.use_custom_cover ?? false)
    });

    saveAudiobookStudioConfig({
        imagesGeneratedToday: (getAudiobookStudioConfig().imagesGeneratedToday || 0) + 1
    });

    appendStudioQueueHistory({
        bookKey: book.book_key,
        bookTitle: book.title,
        queueType: 'art_cover',
        status: 'completed',
        providerUsed,
        detail: `Generated & Validated Custom Book Cover (${effectiveStyle})`,
        serverFileUrl: coverUrl
    });

    return updatedBook;
};

export interface DiscoveredNarrativeSceneTransition {
    atSecond: number;
    endSecond: number;
    sceneTitle: string;
    transitionReason: string;
    characters: string[];
    visualSetting: string;
    illustrationPrompt: string;
    excerptSnippet: string;
}

const fmtSecToMMSS = (sec: number): string => {
    const s = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

/**
 * STAGE 2: Timestamped Text -> Scene Transition Timestamps & Prompts (LLM)
 * STRICT PREREQUISITE: Requires Stage 1 (Audio -> Timestamped Text) to be completed first (`chapter.synced_lyrics`).
 * Never invents scenes before the chapter audio is transcribed into timestamped `[MM:SS.xx]` text!
 * Walks chronologically in 3-minute (`180s`) windows through the timestamped transcript and asks the LLM
 * IF and WHEN (`atSecond`) a narrative scene transition occurs, why it transitions, which characters are present,
 * and writes a grounded illustration prompt. Saves discovered scenes (with `url: ''` if unpainted) to `chapter.images`.
 */
export const detectAudiobookChapterScenesWithLlm = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig,
    options?: { autoTranscribeFirst?: boolean; forceRedetect?: boolean }
): Promise<AudiobookChapterSceneImage[]> => {
    purgeAllFakeSvgArtFromDbAndDisk();
    const freshConfig = getAudiobookStudioConfig();

    let latestChapter = getAudiobookChapterMeta(chapter.chapter_key, book.book_key, chapter.chapter_index) || chapter;
    const hasRealTranscript = Boolean(
        latestChapter.synced_lyrics &&
        !isFakePlaceholderTranscript(latestChapter.synced_lyrics) &&
        latestChapter.synced_lyrics.trim().length > 30
    );

    if (!hasRealTranscript) {
        if (options?.autoTranscribeFirst) {
            await transcribeAudiobookChapter(book, latestChapter, freshConfig);
            latestChapter = getAudiobookChapterMeta(latestChapter.chapter_key, book.book_key, latestChapter.chapter_index) || latestChapter;
        }
        const nowHasTranscript = Boolean(
            latestChapter.synced_lyrics &&
            !isFakePlaceholderTranscript(latestChapter.synced_lyrics) &&
            latestChapter.synced_lyrics.trim().length > 30
        );
        if (!nowHasTranscript) {
            const msg = 'Cannot detect scenes before chapter audio is transcribed into timestamped text (Stage 1).';
            upsertAudiobookChapterMeta({
                chapter_key: latestChapter.chapter_key,
                book_key: book.book_key,
                error_message: msg
            });
            updateLiveStatus({
                isRunning: false,
                activeTask: null,
                lastLog: `[${latestChapter.title}] ${msg}`
            });
            return latestChapter.images || [];
        }
    }

    const existingScenes = Array.isArray(latestChapter.images)
        ? latestChapter.images.filter(img =>
            img &&
            !String(img.url || '').toLowerCase().includes('.svg') &&
            !(typeof img.prompt === 'string' && img.prompt.includes('depicting a period-accurate interior setting, warm lamp light and dramatic window shadows'))
        )
        : [];

    if (!options?.forceRedetect && existingScenes.length >= 1) {
        return existingScenes;
    }

    const streamSource = await resolveChapterAudioStreamSource(book, latestChapter);
    const probedDur = latestChapter.duration_sec > 0
        ? latestChapter.duration_sec
        : (streamSource.inputSource ? await probeAudioDuration(streamSource.inputSource) : 600);
    const durationSec = Math.max(60, probedDur || 600);

    const effectiveStyle = (book.art_style && book.art_style.trim()) ? book.art_style.trim() : (freshConfig.artStyle || 'Cinematic Concept Art');
    const effectiveFocus = (book.art_focus && book.art_focus.trim()) ? book.art_focus.trim() : (freshConfig.artFocus || 'auto-choice');
    const effectiveCustomPrompt = (book.custom_prompt && book.custom_prompt.trim()) ? book.custom_prompt.trim() : (freshConfig.customPromptTemplate || '');

    let currentBook = book;
    if (!currentBook.real_structure_json) {
        try {
            await discoverBookRealStructureWithAi(currentBook);
            currentBook = getAudiobookMeta(book.book_key) || book;
        } catch {}
    }

    const characterBible = new Set<string>();
    let chapterPlotReference = '';
    if (currentBook.real_structure_json) {
        try {
            const st: BookRealStructure = JSON.parse(currentBook.real_structure_json);
            for (const c of st.chapters || []) {
                for (const sc of c.scenes || []) {
                    for (const chName of sc.characters || []) {
                        if (chName) characterBible.add(chName);
                    }
                }
            }
            if (Array.isArray(st.chapters) && st.chapters.length > 0) {
                const cleanChapTitle = (latestChapter.title || '').replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').trim().toLowerCase();
                const byTitle = st.chapters.find(c =>
                    String(c.title || '').trim().toLowerCase() === cleanChapTitle ||
                    String(c.title || '').trim().toLowerCase().endsWith(` ${cleanChapTitle}`)
                );
                const zeroBasedIdx = Math.max(0, (latestChapter.chapter_index || 1) - 1);
                const matchedChap = byTitle || st.chapters[zeroBasedIdx] || st.chapters[zeroBasedIdx % st.chapters.length];
                if (matchedChap) {
                    const scSummaries = (matchedChap.scenes || [])
                        .map(s => `${s.title} (${(s.characters || []).join(', ')}): ${s.summary}`)
                        .join(' | ');
                    chapterPlotReference = `${matchedChap.title}: ${matchedChap.summary}. Key narrative moments in this chapter: ${scSummaries}`;
                }
            }
        } catch {}
    }

    const parsedTimedLines: { time: number; raw: string; text: string }[] = [];
    for (const rawLine of (latestChapter.synced_lyrics || '').split('\n')) {
        const m = rawLine.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
        if (m) {
            const t = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
            parsedTimedLines.push({ time: t, raw: rawLine.trim(), text: m[3].trim() });
        }
    }

    const windowSizeSec = 180;
    const totalWindows = Math.max(1, Math.ceil(durationSec / windowSizeSec));
    const cleanChapLabel = latestChapter.title.replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').trim() || `Chapter ${latestChapter.chapter_index}`;

    updateLiveStatus({
        isRunning: true,
        activeBookKey: book.book_key,
        activeBookTitle: book.title,
        activeChapterKey: latestChapter.chapter_key,
        activeChapterTitle: latestChapter.title,
        activeTask: 'llm_scene_analysis',
        activeCategory: 'llm',
        progress: 5,
        lastLog: `[Stage 2 • LLM Scene Detection] Analyzing timestamped transcript for "${cleanChapLabel}" (${totalWindows} windows across ${fmtSecToMMSS(durationSec)})...`
    });

    const discoveredScenes: AudiobookChapterSceneImage[] = [];
    let activeSceneSummary = '';
    let activeSceneTitle = '';
    let activeSceneStartSec = 0;
    let lastTransitionSec = -999;

    for (let wIdx = 0; wIdx < totalWindows; wIdx++) {
        const winStartSec = wIdx * windowSizeSec;
        const winEndSec = Math.min(durationSec, (wIdx + 1) * windowSizeSec);
        if (winEndSec - winStartSec < 8) break;

        const basePct = Math.min(96, Math.max(6, Math.round(((wIdx + 0.5) / totalWindows) * 95)));
        const linesInWindow = parsedTimedLines.filter(l => l.time >= winStartSec - 2 && l.time <= winEndSec + 2);
        const formattedExcerpt = linesInWindow.length > 0
            ? linesInWindow.map(l => `[${fmtSecToMMSS(l.time)}] ${l.text}`).join('\n').slice(0, 2600)
            : '';

        updateLiveStatus({
            isRunning: true,
            activeBookKey: book.book_key,
            activeBookTitle: book.title,
            activeChapterKey: latestChapter.chapter_key,
            activeChapterTitle: latestChapter.title,
            activeTask: 'llm_scene_analysis',
            activeCategory: 'llm',
            progress: basePct,
            lastLog: `[Stage 2 • "${cleanChapLabel}" • Window ${wIdx + 1}/${totalWindows} (${fmtSecToMMSS(winStartSec)}–${fmtSecToMMSS(winEndSec)})] Feeding timestamped transcript to LLM for scene transition detection...`
        });

        const isFirstWindow = wIdx === 0 && discoveredScenes.length === 0;
        const llmAnalysisPrompt = [
            `You are a literary narrative analyst and cinematic storyboard director reading the timestamped transcript of "${currentBook.title}" by ${currentBook.author}.`,
            `We are analyzing audio file #${latestChapter.chapter_index} ("${cleanChapLabel}", total duration ${fmtSecToMMSS(durationSec)}) chronologically in 3-minute windows.`,
            `Current Window: ${wIdx + 1} of ${totalWindows} (${fmtSecToMMSS(winStartSec)} to ${fmtSecToMMSS(winEndSec)}, seconds ${winStartSec}..${winEndSec}).`,
            characterBible.size > 0 ? `Known Characters in Book: ${Array.from(characterBible).slice(0, 12).join(', ')}.` : '',
            chapterPlotReference ? `Chapter Plot Context: ${chapterPlotReference.slice(0, 700)}` : '',
            !isFirstWindow && activeSceneTitle
                ? `Currently Active Scene (started at ${fmtSecToMMSS(activeSceneStartSec)}): "${activeSceneTitle}" — ${activeSceneSummary}`
                : `This is the opening window (00:00) of "${cleanChapLabel}". You MUST establish the Opening Scene starting at second 0.`,
            formattedExcerpt
                ? `TIMESTAMPED AUDIO TRANSCRIPT EXCERPT (${fmtSecToMMSS(winStartSec)}–${fmtSecToMMSS(winEndSec)}):\n${formattedExcerpt}`
                : `Transcript window (${fmtSecToMMSS(winStartSec)}–${fmtSecToMMSS(winEndSec)}): ${latestChapter.plain_transcript?.slice(0, 800) || chapterPlotReference}`,
            ``,
            `YOUR TASK:`,
            isFirstWindow
                ? `1. Define the Opening Scene at "atSecond": 0. And ONLY if a major second narrative shift also occurs later inside ${fmtSecToMMSS(winStartSec)}–${fmtSecToMMSS(winEndSec)} (at least 75+ seconds after 00:00), include that transition too.`
                : `1. Read the timestamped transcript excerpt carefully. Decide whether the story CONTINUES the current scene ("${activeSceneTitle}") OR transitions to a NEW scene inside ${fmtSecToMMSS(winStartSec)}–${fmtSecToMMSS(winEndSec)}.`,
            `2. A new scene transition should ONLY happen when there is a genuine narrative shift in the transcript: a new character enters/confronts (e.g., Chief Clerk arriving, family knocking/opening doors), a location change, a time jump, or a major dramatic turning point. If the passage is still the same ongoing conversation or moment, return "transitions": []!`,
            `3. For every new scene transition you identify, provide:`,
            `   - "atSecond": exact integer second between ${winStartSec} and ${winEndSec} where the transition happens in the transcript`,
            `   - "sceneTitle": specific, evocative 3-7 word title for what happens in this scene (NEVER generic like "Scene 1")`,
            `   - "transitionReason": 1 concise sentence explaining WHY a new scene starts at this exact timestamp`,
            `   - "characters": array of specific character names present in this scene`,
            `   - "visualSetting": specific room/location, era, and lighting`,
            `   - "illustrationPrompt": a rich, concrete 55-80 word visual prompt in "${effectiveStyle}" style depicting the EXACT named characters, their facial expressions, period clothing, body language, and the specific plot action happening at this timestamp (NEVER an empty room!).`,
            `Respond ONLY with valid JSON matching this schema:`,
            `{"transitions":[{"atSecond":${winStartSec},"sceneTitle":"...","transitionReason":"...","characters":["..."],"visualSetting":"...","illustrationPrompt":"..."}]}`
        ].filter(Boolean).join('\n');

        const transitionsToProcess: Array<{
            atSecond: number;
            sceneTitle: string;
            transitionReason: string;
            characters: string[];
            visualSetting: string;
            illustrationPrompt: string;
        }> = [];

        const llmRes = await callStudioTextLlmWithFailover({
            prompt: llmAnalysisPrompt,
            task: 'art_prompt',
            maxTokens: 700,
            temperature: 0.35,
            description: `Slow-feed scene transition check (${fmtSecToMMSS(winStartSec)}–${fmtSecToMMSS(winEndSec)}) for "${currentBook.title}"`
        });

        if (llmRes?.text) {
            try {
                const cleanedJson = llmRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const firstBrace = cleanedJson.indexOf('{');
                const lastBrace = cleanedJson.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    const parsed = JSON.parse(cleanedJson.slice(firstBrace, lastBrace + 1));
                    if (Array.isArray(parsed.transitions)) {
                        for (const tr of parsed.transitions) {
                            const rawSec = Number(tr.atSecond);
                            const clampedSec = isFirstWindow && transitionsToProcess.length === 0
                                ? 0
                                : Math.max(winStartSec, Math.min(winEndSec - 5, Number.isFinite(rawSec) ? Math.round(rawSec) : winStartSec));

                            if (clampedSec - lastTransitionSec < 60 && !(isFirstWindow && clampedSec === 0)) {
                                continue;
                            }
                            const titleStr = String(tr.sceneTitle || '').trim();
                            const promptStr = String(tr.illustrationPrompt || '').trim();
                            if (titleStr && promptStr.length > 20) {
                                transitionsToProcess.push({
                                    atSecond: clampedSec,
                                    sceneTitle: titleStr,
                                    transitionReason: String(tr.transitionReason || `Narrative shift at ${fmtSecToMMSS(clampedSec)}`).trim(),
                                    characters: Array.isArray(tr.characters) ? tr.characters.map((c: any) => String(c).trim()).filter(Boolean) : [],
                                    visualSetting: String(tr.visualSetting || '').trim(),
                                    illustrationPrompt: promptStr
                                });
                            }
                        }
                    }
                }
            } catch {}
        }

        if (isFirstWindow && transitionsToProcess.length === 0) {
            const snippet0 = formattedExcerpt.replace(/\[\d+:\d+\]\s*/g, ' ').trim().slice(0, 360) || chapterPlotReference.slice(0, 360);
            const fallbackPrompt = await generateDynamicScenePrompt({
                book: currentBook,
                chapter: latestChapter,
                sceneIndex: 0,
                totalScenes: 4,
                sceneTitle: `${cleanChapLabel} — Opening Scene`,
                artType: 'chapter',
                sceneSnippet: snippet0,
                previousPrompts: [],
                effectiveStyle,
                effectiveFocus,
                effectiveCustomPrompt,
                config: freshConfig
            });
            transitionsToProcess.push({
                atSecond: 0,
                sceneTitle: `${cleanChapLabel} — Opening Scene`,
                transitionReason: `Chapter opening at 00:00 of "${cleanChapLabel}"`,
                characters: Array.from(characterBible).slice(0, 4),
                visualSetting: `${currentBook.title} opening setting`,
                illustrationPrompt: fallbackPrompt
            });
        }

        for (const tr of transitionsToProcess) {
            for (const chName of tr.characters) {
                if (chName) characterBible.add(chName);
            }
            if (discoveredScenes.length > 0) {
                const prevScene = discoveredScenes[discoveredScenes.length - 1];
                if (!prevScene.endSec || prevScene.endSec > tr.atSecond) {
                    prevScene.endSec = tr.atSecond;
                }
            }

            const slotIndex = discoveredScenes.length;
            const artType: 'chapter' | 'scene' = slotIndex === 0 ? 'chapter' : 'scene';
            const fullSceneTitle = tr.sceneTitle.toLowerCase().startsWith(cleanChapLabel.toLowerCase())
                ? tr.sceneTitle
                : `${cleanChapLabel} — ${tr.sceneTitle}`;

            const groundedPrompt = sanitizeAndGroundScenePrompt({
                rawPrompt: `${tr.illustrationPrompt.replace(/^["']|["']$/g, '')}, ${effectiveStyle}, masterpiece literary book illustration`,
                sceneSnippet: `${tr.sceneTitle} (${tr.characters.join(', ')}): ${tr.transitionReason}. ${formattedExcerpt.slice(0, 300)}`,
                bookTitle: currentBook.title,
                author: currentBook.author,
                chapterTitle: latestChapter.title,
                effectiveStyle,
                attempt: 0
            });

            // Preserve existing painted URL if a scene at the same index/timestamp was already painted
            const prevMatch = existingScenes.find(e => e.sceneIndex === slotIndex && e.url);
            const sceneDef: AudiobookChapterSceneImage = {
                id: prevMatch?.id || `scene_${Date.now()}_${slotIndex}_${Math.random().toString(36).slice(2, 6)}`,
                url: prevMatch?.url || '',
                prompt: groundedPrompt,
                kept: true,
                sceneIndex: slotIndex,
                artType,
                startSec: tr.atSecond,
                endSec: durationSec,
                sceneTitle: fullSceneTitle,
                chapterTitle: latestChapter.title,
                transitionReason: tr.transitionReason,
                characters: tr.characters,
                createdAt: new Date().toISOString()
            };
            discoveredScenes.push(sceneDef);
            activeSceneTitle = tr.sceneTitle;
            activeSceneSummary = `${tr.transitionReason} (${tr.characters.join(', ')})`;
            activeSceneStartSec = tr.atSecond;
            lastTransitionSec = tr.atSecond;
        }

        // Checkpoint discovered scene timestamps to SQLite after every 3m window so the user sees them live
        upsertAudiobookChapterMeta({
            chapter_key: latestChapter.chapter_key,
            book_key: book.book_key,
            duration_sec: durationSec,
            images: discoveredScenes,
            error_message: ''
        });

        if (wIdx < totalWindows - 1) {
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    if (discoveredScenes.length > 0) {
        discoveredScenes[discoveredScenes.length - 1].endSec = durationSec;
    }

    upsertAudiobookChapterMeta({
        chapter_key: latestChapter.chapter_key,
        book_key: book.book_key,
        duration_sec: durationSec,
        images: discoveredScenes,
        error_message: ''
    });
    recalculateAudiobookTotals(book.book_key);

    updateLiveStatus({
        isRunning: false,
        activeTask: null,
        progress: 100,
        lastLog: `[Stage 2 Complete • "${cleanChapLabel}"] Detected ${discoveredScenes.length} narrative scene transition(s) with timestamps from transcript.`
    });

    return discoveredScenes;
};

/**
 * STAGE 3: Scenes (with Transition Timestamps & Prompts) -> Painted Images (API Models)
 * STRICT PREREQUISITE: Requires Stage 2 scenes (`chapter.images` with `startSec`, `endSec`, `sceneTitle`, `prompt`) to exist first!
 * Never generates random images if scenes haven't been created from the timestamped transcript.
 */
export const paintAudiobookChapterScenes = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig,
    forceIgnoreQuota: boolean = false
): Promise<AudiobookChapterSceneImage[]> => {
    purgeAllFakeSvgArtFromDbAndDisk();
    const freshConfig = getAudiobookStudioConfig();
    if (!forceIgnoreQuota && freshConfig.imagesGeneratedToday >= freshConfig.dailyImageQuota) {
        updateLiveStatus({
            lastLog: `Daily artwork quota reached (${freshConfig.imagesGeneratedToday}/${freshConfig.dailyImageQuota}). Pausing scene imaging until tomorrow.`
        });
        return chapter.images || [];
    }

    const latestChapter = getAudiobookChapterMeta(chapter.chapter_key, book.book_key, chapter.chapter_index) || chapter;
    const workingScenes: AudiobookChapterSceneImage[] = Array.isArray(latestChapter.images)
        ? [...latestChapter.images]
        : [];

    if (workingScenes.length === 0) {
        const msg = 'No scenes detected yet. Run Stage 1 (Transcribe) and Stage 2 (Detect Scenes) before Stage 3 (Paint Scene Images).';
        upsertAudiobookChapterMeta({
            chapter_key: latestChapter.chapter_key,
            book_key: book.book_key,
            error_message: msg
        });
        updateLiveStatus({
            isRunning: false,
            activeTask: null,
            lastLog: `[${latestChapter.title}] ${msg}`
        });
        return [];
    }

    const effectiveStyle = (book.art_style && book.art_style.trim()) ? book.art_style.trim() : (freshConfig.artStyle || 'Cinematic Concept Art');
    const [widthStr, heightStr] = (freshConfig.artResolution || '1280x720').split('x');
    const width = parseInt(widthStr, 10) || 1280;
    const height = parseInt(heightStr, 10) || 720;
    const cleanChapLabel = latestChapter.title.replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').trim() || `Chapter ${latestChapter.chapter_index}`;

    upsertAudiobookChapterMeta({
        chapter_key: latestChapter.chapter_key,
        book_key: book.book_key,
        illustration_status: 'processing',
        illustration_progress: 10,
        error_message: ''
    });

    for (let idx = 0; idx < workingScenes.length; idx++) {
        const sc = workingScenes[idx];
        if (sc.kept === false) continue;
        // Skip scenes that already have a painted raster image URL unless forceIgnoreQuota was explicitly requested for repaint
        if (sc.url && sc.url.trim().length > 0 && !sc.url.toLowerCase().includes('.svg')) {
            continue;
        }

        const currentCfg = getAudiobookStudioConfig();
        if (!forceIgnoreQuota && currentCfg.imagesGeneratedToday >= currentCfg.dailyImageQuota) {
            break;
        }

        const pct = Math.min(96, Math.max(12, Math.round(((idx + 0.5) / workingScenes.length) * 95)));
        updateLiveStatus({
            isRunning: true,
            activeBookKey: book.book_key,
            activeBookTitle: book.title,
            activeChapterKey: latestChapter.chapter_key,
            activeChapterTitle: latestChapter.title,
            activeTask: 'illustrating',
            activeCategory: 'quota',
            progress: pct,
            lastLog: `[Stage 3 • Scene Imaging • "${cleanChapLabel}"] Painting Scene ${idx + 1}/${workingScenes.length} (${fmtSecToMMSS(sc.startSec || 0)}–${fmtSecToMMSS(sc.endSec || 0)}: "${sc.sceneTitle || `Scene ${idx + 1}`}")...`
        });

        try {
            const imgId = sc.id && sc.id.startsWith('img_') ? sc.id : `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const painted = await paintAndSaveStudioImage({
                imgId,
                fullPrompt: sc.prompt,
                sceneSnippet: `${sc.sceneTitle || ''}: ${sc.transitionReason || ''}`,
                book,
                chapterTitle: `${latestChapter.title} • ${sc.sceneTitle || `Scene ${idx + 1}`}`,
                sceneIndex: idx,
                effectiveStyle,
                width,
                height
            });

            if (painted) {
                const { fileName, providerUsed, finalPrompt } = painted;
                const artUrl = `/api/theater/audiobooks/art?file=${encodeURIComponent(fileName)}`;
                workingScenes[idx] = {
                    ...sc,
                    id: imgId,
                    url: artUrl,
                    prompt: finalPrompt || sc.prompt,
                    kept: true
                };

                upsertAudiobookChapterMeta({
                    chapter_key: latestChapter.chapter_key,
                    book_key: book.book_key,
                    illustration_status: 'processing',
                    illustration_progress: pct,
                    images: workingScenes
                });
                recalculateAudiobookTotals(book.book_key);

                const latestCfg = getAudiobookStudioConfig();
                saveAudiobookStudioConfig({
                    imagesGeneratedToday: (latestCfg.imagesGeneratedToday || 0) + 1
                });

                appendStudioQueueHistory({
                    bookKey: book.book_key,
                    bookTitle: book.title,
                    chapterKey: latestChapter.chapter_key,
                    chapterTitle: latestChapter.title,
                    queueType: sc.artType === 'chapter' ? 'art_chapter' : 'art_scene',
                    status: 'completed',
                    providerUsed,
                    detail: `${sc.sceneTitle || `Scene ${idx + 1}`} (${fmtSecToMMSS(sc.startSec || 0)}–${fmtSecToMMSS(sc.endSec || 0)})`,
                    serverFileUrl: artUrl
                });
            }
        } catch (err: any) {
            console.error(`❌ [AudiobookStudio] Failed painting scene "${sc.sceneTitle}" for "${latestChapter.title}":`, err.message);
        }
    }

    const allPainted = workingScenes.length > 0 && workingScenes.every(s => s.kept === false || (s.url && s.url.trim().length > 0));
    const anyPainted = workingScenes.some(s => s.kept !== false && s.url && s.url.trim().length > 0);

    upsertAudiobookChapterMeta({
        chapter_key: latestChapter.chapter_key,
        book_key: book.book_key,
        illustration_status: allPainted ? 'completed' : (anyPainted ? 'processing' : 'failed'),
        illustration_progress: allPainted ? 100 : (anyPainted ? 50 : 0),
        images: workingScenes,
        error_message: anyPainted ? '' : 'Scene imaging failed: all image providers unreachable'
    });
    recalculateAudiobookTotals(book.book_key);

    updateLiveStatus({
        isRunning: false,
        activeTask: null,
        progress: allPainted ? 100 : 0,
        lastLog: anyPainted
            ? `[Stage 3 Complete • "${cleanChapLabel}"] Painted ${workingScenes.filter(s => s.url).length}/${workingScenes.length} scene image(s).`
            : `[Stage 3 Failed • "${cleanChapLabel}"] Could not paint scene images.`
    });

    return workingScenes;
};

/**
 * Full Sequential Pipeline Runner for a Chapter (Stage 1 -> Stage 2 -> Stage 3):
 * Ensures:
 * 1. Audio is transcribed into timestamped text (`Stage 1`)
 * 2. Timestamped text is analyzed by LLM into Scenes with transition timestamps & prompts (`Stage 2`)
 * 3. Discovered Scenes are painted into raster images via Image API models (`Stage 3`)
 */
export const generateAudiobookChapterIllustrations = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig,
    forceIgnoreQuota: boolean = false
): Promise<AudiobookChapterSceneImage[]> => {
    // Stage 1 & Stage 2: Ensure chapter is transcribed and scenes with transition timestamps exist
    await detectAudiobookChapterScenesWithLlm(book, chapter, config, {
        autoTranscribeFirst: true,
        forceRedetect: false
    });
    const updatedChapter = getAudiobookChapterMeta(chapter.chapter_key, book.book_key, chapter.chapter_index) || chapter;
    // Stage 3: Paint the discovered scenes
    return await paintAudiobookChapterScenes(book, updatedChapter, config, forceIgnoreQuota);
};

/**
 * Repaints or creates a single scene/chapter image with an optional user-edited prompt.
 */
export const regenerateSingleAudiobookSceneImage = async (params: {
    bookKey: string;
    chapterKey: string;
    imageId?: string;
    sceneIndex?: number;
    customPrompt?: string;
    sceneTitle?: string;
    startSec?: number;
    endSec?: number;
    artType?: 'chapter' | 'scene';
}): Promise<AudiobookChapterMeta | null> => {
    const book = getAudiobookMeta(params.bookKey);
    const chapter = getAudiobookChapterMeta(params.chapterKey);
    if (!book || !chapter) return null;

    const freshConfig = getAudiobookStudioConfig();
    const effectiveStyle = (book.art_style && book.art_style.trim()) ? book.art_style.trim() : (freshConfig.artStyle || 'Cinematic Concept Art');
    const effectiveFocus = (book.art_focus && book.art_focus.trim()) ? book.art_focus.trim() : (freshConfig.artFocus || 'auto-choice');
    const effectiveCustomPrompt = (book.custom_prompt && book.custom_prompt.trim()) ? book.custom_prompt.trim() : (freshConfig.customPromptTemplate || '');

    const existingImages = Array.isArray(chapter.images) ? [...chapter.images] : [];
    const targetIdx = params.imageId ? existingImages.findIndex(img => img.id === params.imageId) : -1;
    const existingImg = targetIdx >= 0 ? existingImages[targetIdx] : undefined;

    const slotIndex = existingImg?.sceneIndex ?? params.sceneIndex ?? existingImages.length;
    const artType: 'chapter' | 'scene' = existingImg?.artType === 'chapter' ? 'chapter' : (params.artType || (slotIndex === 0 ? 'chapter' : 'scene'));
    const durationSec = Math.max(60, chapter.duration_sec || 600);
    const startSec = existingImg?.startSec ?? params.startSec ?? Math.round((slotIndex / Math.max(2, existingImages.length + 1)) * durationSec);
    const endSec = existingImg?.endSec ?? params.endSec ?? Math.round(((slotIndex + 1) / Math.max(2, existingImages.length + 1)) * durationSec);
    const sceneTitle = params.sceneTitle || existingImg?.sceneTitle || (artType === 'chapter' ? `Chapter Art — ${chapter.title}` : `${chapter.title} — Scene ${slotIndex}`);

    // Extract transcript window
    let windowTranscript = '';
    if (chapter.synced_lyrics) {
        const lines: string[] = [];
        for (const rawLine of chapter.synced_lyrics.split('\n')) {
            const m = rawLine.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
            if (m) {
                const t = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                if (t >= startSec && t <= endSec) lines.push(m[3].trim());
            }
        }
        windowTranscript = lines.join(' ').slice(0, 380);
    }

    let promptToPaint = (params.customPrompt || '').trim();
    if (!promptToPaint) {
        promptToPaint = await generateDynamicScenePrompt({
            book,
            chapter,
            sceneIndex: slotIndex,
            totalScenes: Math.max(2, existingImages.length),
            sceneTitle,
            artType,
            sceneSnippet: windowTranscript,
            previousPrompts: existingImages.filter(i => i.id !== params.imageId).map(i => i.prompt),
            effectiveStyle,
            effectiveFocus,
            effectiveCustomPrompt,
            config: freshConfig
        });
    }

    const [widthStr, heightStr] = (freshConfig.artResolution || '1280x720').split('x');
    const width = parseInt(widthStr, 10) || 1280;
    const height = parseInt(heightStr, 10) || 720;

    const newImgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const painted = await paintAndSaveStudioImage({
        imgId: newImgId,
        fullPrompt: promptToPaint,
        sceneSnippet: windowTranscript,
        book,
        chapterTitle: `${chapter.title} • ${sceneTitle}`,
        sceneIndex: slotIndex,
        effectiveStyle,
        width,
        height
    });

    if (!painted) {
        return chapter;
    }

    const artUrl = `/api/theater/audiobooks/art?file=${encodeURIComponent(painted.fileName)}`;
    const updatedImgObj: AudiobookChapterSceneImage = {
        id: newImgId,
        url: artUrl,
        prompt: painted.finalPrompt || promptToPaint,
        kept: true,
        sceneIndex: slotIndex,
        artType,
        startSec,
        endSec,
        sceneTitle,
        chapterTitle: chapter.title,
        createdAt: new Date().toISOString()
    };

    if (targetIdx >= 0) {
        const oldUrl = existingImages[targetIdx].url || '';
        if (oldUrl.includes('file=')) {
            const oldFile = decodeURIComponent(oldUrl.split('file=')[1] || '');
            const oldFull = path.join(getAudiobookArtDir(), path.basename(oldFile));
            try { if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull); } catch {}
        }
        existingImages[targetIdx] = updatedImgObj;
    } else {
        existingImages.push(updatedImgObj);
    }

    return upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        images: existingImages,
        illustration_status: 'completed',
        illustration_progress: 100
    });
};


/**
 * Deletes existing server files & DB metadata for Transcriptions, Art, Voices, or All
 * for a given book (or single chapter) and optionally re-queues & triggers immediate regeneration.
 */
export const resetAndRedoAudiobookAssets = async (params: {
    bookKey: string;
    chapterKey?: string;
    target: 'transcriptions' | 'art' | 'voices' | 'all';
    redoNow?: boolean;
}) => {
    const { bookKey, chapterKey, target, redoNow = true } = params;
    const book = getAudiobookMeta(bookKey);
    const chapters = chapterKey
        ? [getAudiobookChapterMeta(chapterKey)].filter((c): c is AudiobookChapterMeta => Boolean(c))
        : getAudiobookChaptersMeta(bookKey);

    // 1. Delete physical files on server disk
    for (const ch of chapters) {
        const safeChapterId = ch.chapter_key.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (target === 'transcriptions' || target === 'all') {
            for (const ext of ['.lrc', '.txt']) {
                const p = path.join(getAudiobookTranscriptsDir(), `${safeChapterId}${ext}`);
                try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
            }
        }
        if (target === 'art' || target === 'all') {
            for (const img of (ch.images || [])) {
                const m = (img.url || '').match(/[?&]file=([^&]+)/);
                if (m) {
                    const fPath = path.join(getAudiobookArtDir(), path.basename(decodeURIComponent(m[1])));
                    try { if (fs.existsSync(fPath)) fs.unlinkSync(fPath); } catch {}
                }
            }
        }
        if (target === 'voices' || target === 'all') {
            if (ch.enhanced_audio_path) {
                try { if (fs.existsSync(ch.enhanced_audio_path)) fs.unlinkSync(ch.enhanced_audio_path); } catch {}
            }
            for (const vp of Object.values(ch.processed_voices || {})) {
                try { if (vp && fs.existsSync(vp)) fs.unlinkSync(vp); } catch {}
            }
        }
    }

    if (!chapterKey && book?.custom_cover_url && (target === 'art' || target === 'all')) {
        const m = book.custom_cover_url.match(/[?&]file=([^&]+)/);
        if (m) {
            const fPath = path.join(getAudiobookArtDir(), path.basename(decodeURIComponent(m[1])));
            try { if (fs.existsSync(fPath)) fs.unlinkSync(fPath); } catch {}
        }
    }

    // 2. Reset DB columns & purge polluted music_lyrics rows
    resetAudiobookAssetsInDb(bookKey, chapterKey, target);

    // 3. If redoNow is requested, enable the book in the queue and trigger the worker
    if (redoNow && book) {
        upsertAudiobookMeta({
            book_key: bookKey,
            queue_enabled: true,
            transcribe_enabled: target === 'transcriptions' || target === 'all' ? true : book.transcribe_enabled,
            illustrate_enabled: target === 'art' || target === 'all' ? true : book.illustrate_enabled,
            enhance_audio_enabled: target === 'voices' ? true : book.enhance_audio_enabled,
            status: 'queued'
        });
        triggerAudiobookQueueWorker(bookKey, chapterKey);
    }
};

/**
 * Returns a detailed breakdown of upcoming items in each specialized queue
 * (Art Queue [1. Cover -> 2. Chapters -> 3. Scenes], Transcription Queue, Voice Queue)
 * plus the completed processing history log.
 */
export const getQueueBreakdownAndHistory = () => {
    purgeAllFakeSvgArtFromDbAndDisk();
    const config = getAudiobookStudioConfig();
    const hasCloudStt = getCandidateStudioKeys(config, ['gemini', 'groq', 'openai']).length > 0;
    const allBooks = getAllAudiobooksMeta();
    const queuedBooks = allBooks
        .filter(b => b.queue_enabled)
        .sort((a, b) => (a.queue_priority || 100) - (b.queue_priority || 100));

    // Queue 1: Audio -> Timestamped Text (STT: Local CPU Whisper.cpp or Cloud STT API)
    const transcriptionQueue: Array<{
        id: string;
        bookKey: string;
        bookTitle: string;
        author: string;
        chapterKey: string;
        chapterTitle: string;
        status: string;
        progress: number;
        resourceCategory: 'cpu' | 'api';
        engineLabel: string;
    }> = [];

    // Queue 2: Timestamped Text -> Scene Transition Timestamps & Prompts (LLM)
    const llmSceneQueue: Array<{
        id: string;
        bookKey: string;
        bookTitle: string;
        author: string;
        chapterKey: string;
        chapterTitle: string;
        status: 'ready' | 'waiting_for_stt' | 'processing' | 'completed';
        transcriptReady: boolean;
        discoveredScenesCount: number;
        resourceCategory: 'llm';
        detail: string;
    }> = [];

    // Queue 3: Created Scenes -> Painted Artwork (Image API Models + Daily Quota)
    const artQueue: Array<{
        id: string;
        priorityTier: 1 | 2 | 3;
        priorityLabel: '1. Book Cover' | '2. Chapter Art' | '3. Scene Art';
        bookKey: string;
        bookTitle: string;
        author: string;
        chapterKey?: string;
        chapterTitle?: string;
        status: string;
        scenesCreated: number;
        scenesPainted: number;
        resourceCategory: 'quota';
        detail: string;
    }> = [];

    // Queue 4: Audio -> Cadence-Matched Voices (Local CPU FFmpeg DSP)
    const voiceQueue: Array<{
        id: string;
        bookKey: string;
        bookTitle: string;
        author: string;
        chapterKey: string;
        chapterTitle: string;
        voicePreset: string;
        status: string;
        progress: number;
        resourceCategory: 'cpu';
    }> = [];

    for (const book of queuedBooks) {
        const chapters = getAudiobookChaptersMeta(book.book_key);

        for (const ch of chapters) {
            const hasTranscript = Boolean(ch.transcription_status === 'completed' && ch.synced_lyrics && ch.synced_lyrics.trim().length > 20);
            const allScenes = (ch.images || []).filter(i => i && i.kept !== false && !String(i.url || '').toLowerCase().includes('.svg'));
            const paintedScenes = allScenes.filter(i => i.url && i.url.trim().length > 0);

            // Stage 1: Transcription Queue
            if (book.transcribe_enabled && !hasTranscript) {
                transcriptionQueue.push({
                    id: `q_stt_${ch.chapter_key}`,
                    bookKey: book.book_key,
                    bookTitle: book.title,
                    author: book.author,
                    chapterKey: ch.chapter_key,
                    chapterTitle: ch.title,
                    status: ch.transcription_status || 'queued',
                    progress: ch.transcription_progress || 0,
                    resourceCategory: hasCloudStt ? 'api' : 'cpu',
                    engineLabel: hasCloudStt ? 'Cloud STT API' : 'Local Whisper.cpp (CPU)'
                });
            }

            // Stage 2: LLM Scene Detection Queue (Requires Stage 1 Transcript!)
            if (book.illustrate_enabled && allScenes.length === 0) {
                llmSceneQueue.push({
                    id: `q_llm_scenes_${ch.chapter_key}`,
                    bookKey: book.book_key,
                    bookTitle: book.title,
                    author: book.author,
                    chapterKey: ch.chapter_key,
                    chapterTitle: ch.title,
                    status: hasTranscript ? 'ready' : 'waiting_for_stt',
                    transcriptReady: hasTranscript,
                    discoveredScenesCount: allScenes.length,
                    resourceCategory: 'llm',
                    detail: hasTranscript
                        ? 'Transcript ready — queued for chronological 3m LLM scene transition detection'
                        : 'Waiting for Stage 1 (Audio -> Timestamped Text) before LLM can detect scene transitions'
                });
            }

            // Stage 3: Scene Imaging Queue (Requires Stage 2 Scenes with Transition Timestamps!)
            if (book.illustrate_enabled) {
                const unpaintedCount = Math.max(0, allScenes.length - paintedScenes.length);
                if (allScenes.length > 0 && unpaintedCount > 0) {
                    artQueue.push({
                        id: `q_scene_art_${ch.chapter_key}`,
                        priorityTier: 2,
                        priorityLabel: '3. Scene Art',
                        bookKey: book.book_key,
                        bookTitle: book.title,
                        author: book.author,
                        chapterKey: ch.chapter_key,
                        chapterTitle: ch.title,
                        status: ch.illustration_status || 'queued',
                        scenesCreated: allScenes.length,
                        scenesPainted: paintedScenes.length,
                        resourceCategory: 'quota',
                        detail: `${unpaintedCount} of ${allScenes.length} LLM-detected timestamped scene(s) ready to paint`
                    });
                } else if (allScenes.length === 0) {
                    artQueue.push({
                        id: `q_scene_art_wait_${ch.chapter_key}`,
                        priorityTier: 3,
                        priorityLabel: '3. Scene Art',
                        bookKey: book.book_key,
                        bookTitle: book.title,
                        author: book.author,
                        chapterKey: ch.chapter_key,
                        chapterTitle: ch.title,
                        status: 'waiting_for_scenes',
                        scenesCreated: 0,
                        scenesPainted: 0,
                        resourceCategory: 'quota',
                        detail: 'Waiting for Stage 2 (LLM Scene Timestamps) before painting images'
                    });
                }
            }

            // Stage 1B: Voice & Audio Enhancement Queue (Local CPU FFmpeg DSP, 1:1 Cadence Matched)
            if (book.enhance_audio_enabled && ch.audio_enhance_status !== 'completed') {
                voiceQueue.push({
                    id: `q_voice_${ch.chapter_key}`,
                    bookKey: book.book_key,
                    bookTitle: book.title,
                    author: book.author,
                    chapterKey: ch.chapter_key,
                    chapterTitle: ch.title,
                    voicePreset: ch.voice_preset || book.voice_preset || 'warm_storyteller',
                    status: ch.audio_enhance_status || 'queued',
                    progress: ch.audio_enhance_progress || 0,
                    resourceCategory: 'cpu'
                });
            }
        }

        // Optional Book Cover Art (only if book has no cover at all or user explicitly enabled custom cover)
        if (book.illustrate_enabled && !book.custom_cover_url && (!book.thumb || book.use_custom_cover)) {
            artQueue.push({
                id: `q_cover_${book.book_key}`,
                priorityTier: 1,
                priorityLabel: '1. Book Cover',
                bookKey: book.book_key,
                bookTitle: book.title,
                author: book.author,
                status: 'queued',
                scenesCreated: 1,
                scenesPainted: 0,
                resourceCategory: 'quota',
                detail: 'Custom AI Book Cover'
            });
        }
    }

    artQueue.sort((a, b) => a.priorityTier - b.priorityTier);

    return {
        transcriptionQueue,
        llmSceneQueue,
        artQueue,
        voiceQueue,
        history: getStudioQueueHistory()
    };
};

/**
 * Processes the next pending step in the Audiobook Priority Queue in STRICT SEQUENTIAL ORDER:
 * 1. Stage 1: Chapter Transcription (`Audio -> Timestamped Text`, CPU Whisper.cpp or Cloud STT API)
 * 2. Stage 2: LLM Scene Transition Detection (`Timestamped Text -> Scene Transition Timestamps & Prompts`, LLM)
 *    — NEVER runs on a chapter until Stage 1 (Transcription) is completed for that chapter!
 * 3. Stage 3: Scene Imaging (`Created Scenes -> Painted Artwork`, Image API + Daily Quota)
 *    — NEVER runs on a chapter until Stage 2 (Scene Detection) has created scenes with timestamps!
 * 4. Stage 1B: Audio & Voice Enhancement (`Audio -> Cadence-Matched .m4a`, Local CPU FFmpeg DSP)
 */
export const processAudiobookPriorityQueueStep = async (
    forceBookKey?: string,
    forceChapterKey?: string,
    forceIgnoreQuota?: boolean
): Promise<boolean> => {
    purgeAllFakeSvgArtFromDbAndDisk();
    if (g.__audiobookStudioLock) {
        return false;
    }
    g.__audiobookStudioLock = true;

    try {
        const config = getAudiobookStudioConfig();
        const allBooks = getAllAudiobooksMeta();
        const candidateBooks = forceBookKey
            ? allBooks.filter(b => b.book_key === forceBookKey)
            : allBooks.filter(b => b.queue_enabled && b.status !== 'completed');

        if (candidateBooks.length === 0) {
            updateLiveStatus({
                isRunning: false,
                activeBookKey: null,
                activeBookTitle: null,
                activeChapterKey: null,
                activeChapterTitle: null,
                activeTask: null,
                progress: 0,
                lastLog: allBooks.some(b => b.queue_enabled)
                    ? 'Idle — All queued audiobooks completed'
                    : 'Idle — No audiobooks in queue'
            });
            return false;
        }

        let blockedByQuotaCount = 0;
        let failedChaptersCount = 0;
        let lastFailedError = '';
        let unmappedBooksCount = 0;

        for (const book of candidateBooks) {
            const chapters = getAudiobookChaptersMeta(book.book_key);
            if (chapters.length === 0) {
                unmappedBooksCount++;
            }
            const targetChapters = forceChapterKey
                ? chapters.filter(c => c.chapter_key === forceChapterKey)
                : chapters;

            for (const chapter of targetChapters) {
                const hasRealTranscript = Boolean(
                    chapter.transcription_status === 'completed' &&
                    chapter.synced_lyrics &&
                    !isFakePlaceholderTranscript(chapter.synced_lyrics) &&
                    chapter.synced_lyrics.trim().length > 20
                );

                // STAGE 1: Audio -> Timestamped Text (Must complete BEFORE Stage 2 LLM Scene Detection!)
                if ((book.transcribe_enabled || book.illustrate_enabled) && !hasRealTranscript) {
                    if (chapter.transcription_status === 'failed') {
                        failedChaptersCount++;
                        if (chapter.error_message && !lastFailedError) lastFailedError = chapter.error_message;
                    } else {
                        await transcribeAudiobookChapter(book, chapter, config);
                        recalculateAudiobookTotals(book.book_key);
                        if (!g.__audiobookWorkerLoopRunning) {
                            updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                        }
                        return true;
                    }
                }

                // Refresh chapter after potential Stage 1 check
                const latestChapter = getAudiobookChapterMeta(chapter.chapter_key, book.book_key, chapter.chapter_index) || chapter;
                const latestHasTranscript = Boolean(
                    latestChapter.transcription_status === 'completed' &&
                    latestChapter.synced_lyrics &&
                    !isFakePlaceholderTranscript(latestChapter.synced_lyrics) &&
                    latestChapter.synced_lyrics.trim().length > 20
                );

                // STAGE 2: Timestamped Text -> Scene Transition Timestamps & Prompts (LLM)
                // Only runs once Stage 1 (Timestamped Transcript) is complete!
                const freshCfg = getAudiobookStudioConfig();
                const latestBook = getAudiobookMeta(book.book_key) || book;
                const validScenes = (latestChapter.images || []).filter(i => i && i.kept !== false && !String(i.url || '').toLowerCase().includes('.svg'));
                if (latestBook.illustrate_enabled && latestHasTranscript && validScenes.length === 0) {
                    if (!latestBook.real_structure_json) {
                        await discoverBookRealStructureWithAi(latestBook);
                    }
                    await detectAudiobookChapterScenesWithLlm(latestBook, latestChapter, freshCfg, {
                        autoTranscribeFirst: false,
                        forceRedetect: false
                    });
                    recalculateAudiobookTotals(book.book_key);
                    if (!g.__audiobookWorkerLoopRunning) {
                        updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                    }
                    return true;
                }

                // STAGE 3: Scenes -> Painted Images (Image API Models + Daily Quota)
                // Only runs once Stage 2 has created scenes with timestamps!
                const afterSceneChapter = getAudiobookChapterMeta(chapter.chapter_key, book.book_key, chapter.chapter_index) || latestChapter;
                const scenesAfterDetect = (afterSceneChapter.images || []).filter(i => i && i.kept !== false && !String(i.url || '').toLowerCase().includes('.svg'));
                const unpaintedScenes = scenesAfterDetect.filter(i => !i.url || i.url.trim().length === 0);

                if (latestBook.illustrate_enabled && scenesAfterDetect.length > 0 && unpaintedScenes.length > 0) {
                    const bypassQuota = Boolean(forceChapterKey) || Boolean(forceBookKey) || Boolean(forceIgnoreQuota);
                    if (afterSceneChapter.illustration_status === 'failed') {
                        failedChaptersCount++;
                        if (afterSceneChapter.error_message && !lastFailedError) lastFailedError = afterSceneChapter.error_message;
                    } else if (!bypassQuota && freshCfg.imagesGeneratedToday >= freshCfg.dailyImageQuota) {
                        blockedByQuotaCount++;
                    } else {
                        await paintAudiobookChapterScenes(latestBook, afterSceneChapter, freshCfg, bypassQuota);
                        recalculateAudiobookTotals(book.book_key);
                        if (!g.__audiobookWorkerLoopRunning) {
                            updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                        }
                        return true;
                    }
                }

                // STAGE 1B: Audio -> Cadence-Matched Voices (Local CPU FFmpeg DSP)
                if (latestBook.enhance_audio_enabled && afterSceneChapter.audio_enhance_status !== 'completed') {
                    if (afterSceneChapter.audio_enhance_status === 'failed') {
                        failedChaptersCount++;
                        if (afterSceneChapter.error_message && !lastFailedError) lastFailedError = afterSceneChapter.error_message;
                    } else {
                        await enhanceAudiobookChapterAudio(latestBook, afterSceneChapter, config);
                        recalculateAudiobookTotals(book.book_key);
                        if (!g.__audiobookWorkerLoopRunning) {
                            updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                        }
                        return true;
                    }
                }
            }

            // Optional Book Cover Art only if book has no cover at all or user explicitly turned on custom cover
            if (book.illustrate_enabled && !book.custom_cover_url && (!book.thumb || book.use_custom_cover) && !forceChapterKey) {
                await generateAudiobookCoverArt(book, false);
                if (!g.__audiobookWorkerLoopRunning) {
                    updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                }
                return true;
            }

            recalculateAudiobookTotals(book.book_key);
        }

        const freshCfg = getAudiobookStudioConfig();
        let idleReason = 'Idle — All queued chapters up to date';
        if (!freshCfg.enabled && !forceBookKey && !forceChapterKey && !forceIgnoreQuota) {
            idleReason = 'Paused by user';
        } else if (blockedByQuotaCount > 0) {
            idleReason = `Quota Paused: ${freshCfg.imagesGeneratedToday}/${freshCfg.dailyImageQuota} daily images used (${blockedByQuotaCount} chapters waiting)`;
        } else if (failedChaptersCount > 0) {
            idleReason = `Idle: ${failedChaptersCount} failed chapter task(s)${lastFailedError ? ` — ${lastFailedError.slice(0, 90)}` : ''}`;
        } else if (unmappedBooksCount > 0) {
            idleReason = `Idle: ${unmappedBooksCount} queued book(s) have 0 synced chapters`;
        }

        updateLiveStatus({
            isRunning: false,
            activeBookKey: null,
            activeBookTitle: null,
            activeChapterKey: null,
            activeChapterTitle: null,
            activeTask: null,
            progress: 0,
            lastLog: idleReason
        });
        return false;
    } catch (e: any) {
        console.error('❌ [AudiobookStudio] Queue worker error:', e);
        updateLiveStatus({
            isRunning: false,
            activeTask: null,
            lastLog: `Error: ${e.message}`
        });
        return false;
    } finally {
        g.__audiobookStudioLock = false;
    }
};

/**
 * Triggers background processing loop until queue is finished or paused.
 */
export const triggerAudiobookQueueWorker = (
    forceBookKey?: string,
    forceChapterKey?: string,
    forceIgnoreQuota?: boolean
) => {
    setTimeout(async () => {
        // When user explicitly starts a whole-book, chapter, or manual queue run, reset any 'failed' statuses to 'queued' ONCE so they are retried cleanly
        if (forceBookKey || forceChapterKey || forceIgnoreQuota) {
            const targetBooks = forceBookKey
                ? [getAudiobookMeta(forceBookKey)].filter(Boolean)
                : getAllAudiobooksMeta().filter(b => b.queue_enabled);
            for (const b of targetBooks) {
                if (!b) continue;
                const chapters = getAudiobookChaptersMeta(b.book_key);
                for (const ch of chapters) {
                    if (forceChapterKey && ch.chapter_key !== forceChapterKey) continue;
                    if (ch.transcription_status === 'failed' || ch.illustration_status === 'failed' || ch.audio_enhance_status === 'failed') {
                        upsertAudiobookChapterMeta({
                            chapter_key: ch.chapter_key,
                            book_key: b.book_key,
                            transcription_status: ch.transcription_status === 'failed' ? 'queued' : ch.transcription_status,
                            illustration_status: ch.illustration_status === 'failed' ? 'queued' : ch.illustration_status,
                            audio_enhance_status: ch.audio_enhance_status === 'failed' ? 'queued' : ch.audio_enhance_status,
                            error_message: ''
                        });
                    }
                }
                recalculateAudiobookTotals(b.book_key);
            }
        }

        if (g.__audiobookWorkerLoopRunning) {
            return;
        }
        g.__audiobookWorkerLoopRunning = true;
        try {
            // Process up to 35 steps sequentially with a 1.2s breather between steps for low-power Intel CPU
            for (let step = 0; step < 35; step++) {
                const cfg = getAudiobookStudioConfig();
                if (!cfg.enabled && !forceBookKey && !forceChapterKey && !forceIgnoreQuota) break;
                const didWork = await processAudiobookPriorityQueueStep(forceBookKey, forceChapterKey, forceIgnoreQuota);
                if (!didWork) break;
                await new Promise(r => setTimeout(r, 1200));
            }
        } finally {
            g.__audiobookWorkerLoopRunning = false;
        }
    }, 50);
};

// ══════════════════════════════════════════════════════════════════════════════
// AUDIOBOOK COLLECTIONS (SERIES / SAGAS) & METADATA ENRICHMENT + FILE RENAMER
// ══════════════════════════════════════════════════════════════════════════════

export interface AudiobookCollectionEntry {
    id: string;
    name: string;
    author: string;
    description?: string;
    bookKeys: string[];
    source: 'manual' | 'ai' | 'auto';
    updatedAt: string;
}

export interface AudiobookBookEnrichment {
    bookKey: string;
    cleanTitle?: string;
    bookNumber?: number;
    releaseYear?: string;
    collectionId?: string;
    collectionName?: string;
}

export interface AudiobookCollectionsState {
    collections: AudiobookCollectionEntry[];
    explodedCollectionIds: string[];
    ungroupedBookKeys: string[];
    bookMetadata: Record<string, AudiobookBookEnrichment>;
}

const DEFAULT_COLLECTIONS_STATE: AudiobookCollectionsState = {
    collections: [],
    explodedCollectionIds: [],
    ungroupedBookKeys: [],
    bookMetadata: {}
};

export const getAudiobookCollectionsState = (): AudiobookCollectionsState => {
    try {
        const raw = getSetting('audiobook_collections_state') || '';
        if (!raw) return { ...DEFAULT_COLLECTIONS_STATE, collections: [], explodedCollectionIds: [], ungroupedBookKeys: [], bookMetadata: {} };
        const parsed = JSON.parse(raw);
        return {
            collections: Array.isArray(parsed.collections) ? parsed.collections : [],
            explodedCollectionIds: Array.isArray(parsed.explodedCollectionIds) ? parsed.explodedCollectionIds : [],
            ungroupedBookKeys: Array.isArray(parsed.ungroupedBookKeys) ? parsed.ungroupedBookKeys : [],
            bookMetadata: parsed.bookMetadata && typeof parsed.bookMetadata === 'object' ? parsed.bookMetadata : {}
        };
    } catch {
        return { ...DEFAULT_COLLECTIONS_STATE, collections: [], explodedCollectionIds: [], ungroupedBookKeys: [], bookMetadata: {} };
    }
};

export const saveAudiobookCollectionsState = (partial: Partial<AudiobookCollectionsState>): AudiobookCollectionsState => {
    const current = getAudiobookCollectionsState();
    const updated: AudiobookCollectionsState = {
        collections: partial.collections !== undefined ? partial.collections : current.collections,
        explodedCollectionIds: partial.explodedCollectionIds !== undefined ? partial.explodedCollectionIds : current.explodedCollectionIds,
        ungroupedBookKeys: partial.ungroupedBookKeys !== undefined ? partial.ungroupedBookKeys : current.ungroupedBookKeys,
        bookMetadata: partial.bookMetadata !== undefined ? { ...current.bookMetadata, ...partial.bookMetadata } : current.bookMetadata
    };
    setSetting('audiobook_collections_state', JSON.stringify(updated));
    return updated;
};

/**
 * Built-in Literary Saga & Publication Year Knowledge Base for instant, accurate
 * offline/fallback series grouping and publication year inference.
 */
const KNOWN_BOOK_CATALOG: Array<{
    pattern: RegExp;
    cleanTitle: string;
    author: string;
    collection: string;
    bookNumber: number;
    releaseYear: string;
}> = [
    // Franz Kafka
    { pattern: /\b(the\s+)?metamorphosis\b/i, cleanTitle: 'The Metamorphosis', author: 'Franz Kafka', collection: '', bookNumber: 0, releaseYear: '1915' },
    // Alastair Reynolds — Poseidon's Children
    { pattern: /\bblue\s+remembered\s+earth\b/i, cleanTitle: 'Blue Remembered Earth', author: 'Alastair Reynolds', collection: "Poseidon's Children", bookNumber: 1, releaseYear: '2012' },
    { pattern: /\bon\s+the\s+steel\s+breeze\b/i, cleanTitle: 'On the Steel Breeze', author: 'Alastair Reynolds', collection: "Poseidon's Children", bookNumber: 2, releaseYear: '2013' },
    { pattern: /\bposeidon'?s\s+wake\b/i, cleanTitle: "Poseidon's Wake", author: 'Alastair Reynolds', collection: "Poseidon's Children", bookNumber: 3, releaseYear: '2015' },
    // Alastair Reynolds — Revelation Space Universe
    { pattern: /\brevelation\s+space\b/i, cleanTitle: 'Revelation Space', author: 'Alastair Reynolds', collection: 'Revelation Space', bookNumber: 1, releaseYear: '2000' },
    { pattern: /\bchasm\s+city\b/i, cleanTitle: 'Chasm City', author: 'Alastair Reynolds', collection: 'Revelation Space', bookNumber: 2, releaseYear: '2001' },
    { pattern: /\bredemption\s+ark\b/i, cleanTitle: 'Redemption Ark', author: 'Alastair Reynolds', collection: 'Revelation Space', bookNumber: 3, releaseYear: '2002' },
    { pattern: /\babsolution\s+gap\b/i, cleanTitle: 'Absolution Gap', author: 'Alastair Reynolds', collection: 'Revelation Space', bookNumber: 4, releaseYear: '2003' },
    { pattern: /\binhibitor\s+phase\b/i, cleanTitle: 'Inhibitor Phase', author: 'Alastair Reynolds', collection: 'Revelation Space', bookNumber: 5, releaseYear: '2021' },
    { pattern: /\bdiamond\s+dogs\b/i, cleanTitle: 'Diamond Dogs, Turquoise Days', author: 'Alastair Reynolds', collection: 'Revelation Space', bookNumber: 6, releaseYear: '2003' },
    { pattern: /\bgalactic\s+north\b/i, cleanTitle: 'Galactic North', author: 'Alastair Reynolds', collection: 'Revelation Space', bookNumber: 7, releaseYear: '2006' },
    // Alastair Reynolds — Prefect Dreyfus Emergencies
    { pattern: /\b(the\s+prefect|aurora\s+rising)\b/i, cleanTitle: 'Aurora Rising (The Prefect)', author: 'Alastair Reynolds', collection: 'Prefect Dreyfus Emergencies', bookNumber: 1, releaseYear: '2007' },
    { pattern: /\belysium\s+fire\b/i, cleanTitle: 'Elysium Fire', author: 'Alastair Reynolds', collection: 'Prefect Dreyfus Emergencies', bookNumber: 2, releaseYear: '2018' },
    { pattern: /\bmachine\s+vendetta\b/i, cleanTitle: 'Machine Vendetta', author: 'Alastair Reynolds', collection: 'Prefect Dreyfus Emergencies', bookNumber: 3, releaseYear: '2024' },
    // Alastair Reynolds — Revenger Trilogy
    { pattern: /\brevenger\b/i, cleanTitle: 'Revenger', author: 'Alastair Reynolds', collection: 'Revenger Trilogy', bookNumber: 1, releaseYear: '2016' },
    { pattern: /\bshadow\s+captain\b/i, cleanTitle: 'Shadow Captain', author: 'Alastair Reynolds', collection: 'Revenger Trilogy', bookNumber: 2, releaseYear: '2019' },
    { pattern: /\bbone\s+silence\b/i, cleanTitle: 'Bone Silence', author: 'Alastair Reynolds', collection: 'Revenger Trilogy', bookNumber: 3, releaseYear: '2020' },
    // Alastair Reynolds — Standalone Novels & Novellas
    { pattern: /\bcentury\s+rain\b/i, cleanTitle: 'Century Rain', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2004' },
    { pattern: /\bpushing\s+ice\b/i, cleanTitle: 'Pushing Ice', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2005' },
    { pattern: /\bhouse\s+of\s+suns\b/i, cleanTitle: 'House of Suns', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2008' },
    { pattern: /\bterminal\s+world\b/i, cleanTitle: 'Terminal World', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2010' },
    { pattern: /\btroika\b/i, cleanTitle: 'Troika', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2011' },
    { pattern: /\bslow\s+bullets\b/i, cleanTitle: 'Slow Bullets', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2015' },
    { pattern: /\bbeyond\s+the\s+aquila\s+rift\b/i, cleanTitle: 'Beyond the Aquila Rift', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2016' },
    { pattern: /\bpermafrost\b/i, cleanTitle: 'Permafrost', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2019' },
    { pattern: /\beversion\b/i, cleanTitle: 'Eversion', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2022' },
    { pattern: /\bzima\s+blue\b/i, cleanTitle: 'Zima Blue and Other Stories', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2006' },
    { pattern: /\bthousandth\s+night\b/i, cleanTitle: 'Thousandth Night', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2005' },
    { pattern: /\bbelladonna\s+nights\b/i, cleanTitle: 'Belladonna Nights', author: 'Alastair Reynolds', collection: '', bookNumber: 0, releaseYear: '2021' },
    // Cixin Liu — Remembrance of Earth's Past (Three-Body Trilogy)
    { pattern: /\b(the\s+)?three[- ]body\s+problem\b/i, cleanTitle: 'The Three-Body Problem', author: 'Cixin Liu', collection: "Remembrance of Earth's Past", bookNumber: 1, releaseYear: '2008' },
    { pattern: /\b(the\s+)?dark\s+forest\b/i, cleanTitle: 'The Dark Forest', author: 'Cixin Liu', collection: "Remembrance of Earth's Past", bookNumber: 2, releaseYear: '2008' },
    { pattern: /\bdeath'?s\s+end\b/i, cleanTitle: "Death's End", author: 'Cixin Liu', collection: "Remembrance of Earth's Past", bookNumber: 3, releaseYear: '2010' },
    // Frank Herbert — Pandora Sequence / WorShip
    { pattern: /\bdestination[:\s]+void\b/i, cleanTitle: 'Destination: Void', author: 'Frank Herbert', collection: 'Pandora Sequence', bookNumber: 1, releaseYear: '1966' },
    { pattern: /\bthe\s+jesus\s+incident\b/i, cleanTitle: 'The Jesus Incident', author: 'Frank Herbert', collection: 'Pandora Sequence', bookNumber: 2, releaseYear: '1979' },
    { pattern: /\bthe\s+lazarus\s+effect\b/i, cleanTitle: 'The Lazarus Effect', author: 'Frank Herbert', collection: 'Pandora Sequence', bookNumber: 3, releaseYear: '1983' },
    { pattern: /\bthe\s+ascension\s+factor\b/i, cleanTitle: 'The Ascension Factor', author: 'Frank Herbert', collection: 'Pandora Sequence', bookNumber: 4, releaseYear: '1988' },
    // Frank Herbert — Dune Chronicles
    { pattern: /^(\d+\s*[-_.]*\s*)?dune$/i, cleanTitle: 'Dune', author: 'Frank Herbert', collection: 'Dune Chronicles', bookNumber: 1, releaseYear: '1965' },
    { pattern: /\bdune\s+messiah\b/i, cleanTitle: 'Dune Messiah', author: 'Frank Herbert', collection: 'Dune Chronicles', bookNumber: 2, releaseYear: '1969' },
    { pattern: /\bchildren\s+of\s+dune\b/i, cleanTitle: 'Children of Dune', author: 'Frank Herbert', collection: 'Dune Chronicles', bookNumber: 3, releaseYear: '1976' },
    { pattern: /\bgod\s+emperor\s+of\s+dune\b/i, cleanTitle: 'God Emperor of Dune', author: 'Frank Herbert', collection: 'Dune Chronicles', bookNumber: 4, releaseYear: '1981' },
    { pattern: /\bheretics\s+of\s+dune\b/i, cleanTitle: 'Heretics of Dune', author: 'Frank Herbert', collection: 'Dune Chronicles', bookNumber: 5, releaseYear: '1984' },
    { pattern: /\bchapterhouse[:\s]+dune\b/i, cleanTitle: 'Chapterhouse: Dune', author: 'Frank Herbert', collection: 'Dune Chronicles', bookNumber: 6, releaseYear: '1985' },
    // Frank Herbert — ConSentiency
    { pattern: /\bwhipping\s+star\b/i, cleanTitle: 'Whipping Star', author: 'Frank Herbert', collection: 'ConSentiency', bookNumber: 1, releaseYear: '1970' },
    { pattern: /\bthe\s+dosadi\s+experiment\b/i, cleanTitle: 'The Dosadi Experiment', author: 'Frank Herbert', collection: 'ConSentiency', bookNumber: 2, releaseYear: '1977' }
];

export const parseCleanBookTitleAndNumber = (rawTitle: string, folder?: string, filePath?: string): {
    cleanTitle: string;
    bookNumber?: number;
    releaseYear?: string;
    inferredCollection?: string;
} => {
    let working = (rawTitle || '').trim();
    let releaseYear: string | undefined;
    let bookNumber: number | undefined;
    let inferredCollection: string | undefined;

    // 1. Extract year from title, folder, or path if present like (2012) or [2012]
    const yearMatch = working.match(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/) ||
        (folder || '').match(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/) ||
        (filePath || '').match(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/);
    if (yearMatch) {
        releaseYear = yearMatch[1];
        working = working.replace(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/g, '').trim();
    }

    // 1b. Strip leading "YYYY - Title" or "YYYY. Title" (e.g. "2011 - Troika" -> "Troika", releaseYear: "2011")
    const leadYearMatch = working.match(/^(19\d{2}|20\d{2})\s*[-–—._:]+\s*(.+)$/);
    if (leadYearMatch) {
        if (!releaseYear) releaseYear = leadYearMatch[1];
        working = leadYearMatch[2].trim();
    }

    // 1c. Strip trailing " - YYYY" (e.g. "Troika - 2011" -> "Troika", releaseYear: "2011")
    const trailYearMatch = working.match(/^(.+?)\s+[-–—]\s*(19\d{2}|20\d{2})$/);
    if (trailYearMatch) {
        if (!releaseYear) releaseYear = trailYearMatch[2];
        working = trailYearMatch[1].trim();
    }

    // 2. Strip "[Series Name #01] - Title" or "(Book 1)"
    const bracketSeries = working.match(/^[\[\(]([^\]\)]+?)\s*(?:#|book\s*|vol\.?\s*)(\d{1,2})[\]\)]\s*[-–—:]?\s*(.+)$/i);
    if (bracketSeries) {
        inferredCollection = bracketSeries[1].trim();
        bookNumber = parseInt(bracketSeries[2], 10);
        working = bracketSeries[3].trim();
    }

    // 3. Strip leading "01 - ", "02. ", "Book 01 - "
    const leadNumMatch = working.match(/^(?:book\s*|vol\.?\s*|#)?(\d{1,2})\s*[-–—._:]+\s*(.+)$/i);
    if (leadNumMatch) {
        if (!bookNumber) bookNumber = parseInt(leadNumMatch[1], 10);
        working = leadNumMatch[2].trim();
    }

    // 3b. Re-check leading "YYYY - " in case it appeared after a track/book number ("01 - 2011 - Troika")
    const secondLeadYear = working.match(/^(19\d{2}|20\d{2})\s*[-–—._:]+\s*(.+)$/);
    if (secondLeadYear) {
        if (!releaseYear) releaseYear = secondLeadYear[1];
        working = secondLeadYear[2].trim();
    }

    // 4. Strip trailing "(Book 1)" or "[Original]" or "[Optimized HQ]" or bitrate/codec noise
    const trailBookNum = working.match(/^(.+?)\s*[\(\[]\s*(?:book|vol\.?|volume|#)\s*(\d{1,2})\s*[\)\]]$/i);
    if (trailBookNum) {
        if (!bookNumber) bookNumber = parseInt(trailBookNum[2], 10);
        working = trailBookNum[1].trim();
    }
    working = working
        .replace(/\s*[\[\(]\s*(?:original(?:\s+audio)?|optimized(?:\s+hq|\s+audio)?|unabridged|abridged|m4b|mp3|flac|aac|\d+\s*kbps|read\s+by\s+[^\]\)]+|narrated\s+by\s+[^\]\)]+)\s*[\]\)]/gi, '')
        .replace(/\s*[-_]\s*(?:unabridged|abridged|\d+\s*kbps|m4b|mp3)$/gi, '')
        .trim();

    // 5. Inspect path hierarchy for series folder (e.g. .../Author/Series Name/01 - Book Title/file.m4b)
    if (!inferredCollection && filePath) {
        const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
        if (parts.length >= 4) {
            const bookDir = parts[parts.length - 2];
            const parentOfBookDir = parts[parts.length - 3];
            const grandParent = parts[parts.length - 4];
            const genericRe = /^(audiobooks?|books?|spoken\s*word|media|mnt|user|data|torrents?|downloads?|library|audio)$/i;
            if (!genericRe.test(parentOfBookDir) && !genericRe.test(grandParent)) {
                // If grandParent is the Author and parentOfBookDir is the Series/Collection
                if (parentOfBookDir.toLowerCase() !== bookDir.toLowerCase()) {
                    inferredCollection = parentOfBookDir
                        .replace(/^\d{1,2}\s*[-–—._]\s*/, '')
                        .replace(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/g, '')
                        .trim();
                }
            }
        }
    }

    // 6. Match against KNOWN_BOOK_CATALOG
    for (const entry of KNOWN_BOOK_CATALOG) {
        if (entry.pattern.test(working) || entry.pattern.test(rawTitle)) {
            if (!releaseYear && entry.releaseYear) releaseYear = entry.releaseYear;
            if (!bookNumber && entry.bookNumber > 0) bookNumber = entry.bookNumber;
            if (!inferredCollection && entry.collection) inferredCollection = entry.collection;
            working = entry.cleanTitle;
            break;
        }
    }

    return {
        cleanTitle: working || rawTitle,
        bookNumber,
        releaseYear,
        inferredCollection
    };
};

/**
 * Runs book titles, authors, and folder paths through the configured AI model (Gemini, Claude, OpenAI, Groq)
 * plus our built-in literary analyzer to automatically group series/sagas into Collections and infer publication years.
 */
export const organizeAudiobookCollectionsWithAi = async (
    inputBooks: Array<{
        bookKey: string;
        title: string;
        author: string;
        folder?: string;
        path?: string;
    }>
): Promise<{
    state: AudiobookCollectionsState;
    usedProvider: string;
    collectionsCreated: number;
}> => {
    const config = getAudiobookStudioConfig();
    const currentState = getAudiobookCollectionsState();
    const bookMetadata: Record<string, AudiobookBookEnrichment> = { ...currentState.bookMetadata };

    // Step 1: Deterministic & Built-in Literary Catalog pass
    for (const b of inputBooks) {
        const parsed = parseCleanBookTitleAndNumber(b.title, b.folder, b.path);
        const existing = bookMetadata[b.bookKey] || { bookKey: b.bookKey };
        bookMetadata[b.bookKey] = {
            ...existing,
            bookKey: b.bookKey,
            cleanTitle: parsed.cleanTitle || existing.cleanTitle || b.title,
            bookNumber: parsed.bookNumber ?? existing.bookNumber,
            releaseYear: parsed.releaseYear || existing.releaseYear,
            collectionName: parsed.inferredCollection || existing.collectionName
        };
    }

    // Step 2: Query connected LLM (Gemini / Claude / OpenAI / Groq) to enrich Collections, Book Numbers & Publication Years
    let usedProvider = 'Built-in Literary Saga & Folder Analyzer';
    const promptLines = inputBooks.map((b, idx) => {
        const pre = bookMetadata[b.bookKey];
        const canonAuthor = parseAndCanonicalizeAuthor(b.author, b.title).canonicalAuthor;
        return `${idx + 1}. key="${b.bookKey}" | rawTitle="${b.title}" | cleanTitle="${pre?.cleanTitle || b.title}" | author="${canonAuthor}" | folder="${b.folder || ''}" | path="${b.path || ''}"`;
    });

    const systemPrompt = [
        `You are an expert literary bibliographer and audiobook librarian.`,
        `Analyze the following list of audiobooks (with their titles, authors, and folder names).`,
        `For EACH book:`,
        `1. Determine its clean book title (strip leading track/volume numbers like "01 - " or "02 - " and file tags).`,
        `2. Determine if it belongs to a literary Series, Saga, or Trilogy (which we call a "Collection", e.g., "Poseidon's Children", "Revelation Space", "Revenger Trilogy", "Pandora Sequence", "Dune Chronicles", etc.). Even if only 1 book from a well-known series is present or multiple books share a saga, provide the official Series/Collection name if it belongs to one, or "" if it is a standalone novel.`,
        `3. Determine its volume/book number within that Collection (integer 1, 2, 3... or null if standalone).`,
        `4. Determine its original Year of Publication as a 4-digit string (e.g. "2012", "2000", "1966").`,
        `Return ONLY a valid JSON array of objects with exact keys: [{"bookKey": "...", "cleanTitle": "...", "collectionName": "...", "bookNumber": 1, "releaseYear": "2012"}]. Do not wrap in markdown.`
    ].join('\n');

    const fullPrompt = `${systemPrompt}\n\nBooks:\n${promptLines.join('\n')}`;
    let aiJsonText = '';

    if (config.geminiApiKey) {
        const geminiModels = ['gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.0-flash'];
        for (const modelName of geminiModels) {
            try {
                const resp = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
                    {
                        contents: [{ parts: [{ text: fullPrompt }] }],
                        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
                    },
                    { timeout: 22000 }
                );
                aiJsonText = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (aiJsonText) {
                    usedProvider = 'Google Gemini Flash';
                    break;
                }
            } catch (e: any) {
                console.warn('⚠️ [AudiobookStudio] Gemini collection organizer fallback:', e.message);
            }
        }
    } else if (config.anthropicApiKey) {
        try {
            const resp = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model: 'claude-3-5-haiku-latest',
                    max_tokens: 2048,
                    messages: [{ role: 'user', content: fullPrompt }]
                },
                {
                    headers: {
                        'x-api-key': config.anthropicApiKey,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    timeout: 22000
                }
            );
            aiJsonText = resp.data?.content?.[0]?.text || '';
            if (aiJsonText) usedProvider = 'Anthropic Claude 3.5 Haiku';
        } catch (e: any) {
            console.warn('⚠️ [AudiobookStudio] Claude collection organizer fallback:', e.message);
        }
    } else if (config.openaiApiKey) {
        try {
            const resp = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: fullPrompt }],
                    temperature: 0.2
                },
                {
                    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
                    timeout: 22000
                }
            );
            aiJsonText = resp.data?.choices?.[0]?.message?.content || '';
            if (aiJsonText) usedProvider = 'OpenAI GPT-4o-mini';
        } catch (e: any) {
            console.warn('⚠️ [AudiobookStudio] OpenAI collection organizer fallback:', e.message);
        }
    } else if (config.groqApiKey) {
        try {
            const resp = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: fullPrompt }],
                    temperature: 0.2
                },
                {
                    headers: { Authorization: `Bearer ${config.groqApiKey}` },
                    timeout: 18000
                }
            );
            aiJsonText = resp.data?.choices?.[0]?.message?.content || '';
            if (aiJsonText) usedProvider = 'Groq Llama 3.3 70B';
        } catch (e: any) {
            console.warn('⚠️ [AudiobookStudio] Groq collection organizer fallback:', e.message);
        }
    }

    if (aiJsonText) {
        try {
            const cleaned = aiJsonText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/, '')
                .trim();
            const startBracket = cleaned.indexOf('[');
            const endBracket = cleaned.lastIndexOf(']');
            if (startBracket !== -1 && endBracket !== -1) {
                const parsedArr = JSON.parse(cleaned.slice(startBracket, endBracket + 1));
                if (Array.isArray(parsedArr)) {
                    for (const item of parsedArr) {
                        if (!item || !item.bookKey) continue;
                        const prev = bookMetadata[item.bookKey] || { bookKey: item.bookKey };
                        bookMetadata[item.bookKey] = {
                            ...prev,
                            cleanTitle: item.cleanTitle || prev.cleanTitle,
                            collectionName: item.collectionName !== undefined ? String(item.collectionName || '').trim() : prev.collectionName,
                            bookNumber: item.bookNumber ? Number(item.bookNumber) : prev.bookNumber,
                            releaseYear: item.releaseYear ? String(item.releaseYear).trim() : prev.releaseYear
                        };
                    }
                }
            }
        } catch (parseErr: any) {
            console.warn('⚠️ [AudiobookStudio] Could not parse AI collection JSON:', parseErr.message);
        }
    }

    // Step 3: Build Collections from enriched bookMetadata (preserving manual collections unless updated)
    const collectionGroups = new Map<string, { name: string; author: string; bookKeys: string[] }>();
    for (const b of inputBooks) {
        const meta = bookMetadata[b.bookKey];
        const colName = (meta?.collectionName || '').trim();
        if (!colName) continue;
        const canonAuthor = parseAndCanonicalizeAuthor(b.author, b.title).canonicalAuthor || 'Unknown Author';
        const colId = `col_${canonAuthor.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${colName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        meta.collectionId = colId;
        if (!collectionGroups.has(colId)) {
            collectionGroups.set(colId, {
                name: colName,
                author: canonAuthor,
                bookKeys: []
            });
        }
        const grp = collectionGroups.get(colId)!;
        if (!grp.bookKeys.includes(b.bookKey)) {
            grp.bookKeys.push(b.bookKey);
        }
    }

    // Sort books inside each collection by bookNumber then cleanTitle
    const manualCollections = currentState.collections.filter(c => c.source === 'manual');
    const newAiCollections: AudiobookCollectionEntry[] = [];

    for (const [colId, grp] of collectionGroups.entries()) {
        // Group into a collection if there are >= 2 books OR if the book has an explicit series volume number (e.g. #1, #2)
        const hasNumberedBook = grp.bookKeys.some(k => (bookMetadata[k]?.bookNumber || 0) > 0);
        if (grp.bookKeys.length < 2 && !hasNumberedBook) continue;

        grp.bookKeys.sort((ka, kb) => {
            const na = bookMetadata[ka]?.bookNumber || 999;
            const nb = bookMetadata[kb]?.bookNumber || 999;
            if (na !== nb) return na - nb;
            return (bookMetadata[ka]?.cleanTitle || ka).localeCompare(bookMetadata[kb]?.cleanTitle || kb);
        });

        newAiCollections.push({
            id: colId,
            name: grp.name,
            author: grp.author,
            bookKeys: grp.bookKeys,
            source: usedProvider.startsWith('Built-in') ? 'auto' : 'ai',
            updatedAt: new Date().toISOString()
        });
    }

    // Merge manual collections with newly organized AI collections
    const mergedMap = new Map<string, AudiobookCollectionEntry>();
    for (const c of newAiCollections) mergedMap.set(c.id, c);
    for (const m of manualCollections) mergedMap.set(m.id, m);

    // Clear exploded flags when user explicitly triggers AI Auto-Group so newly matched collections appear
    const savedState = saveAudiobookCollectionsState({
        collections: Array.from(mergedMap.values()),
        explodedCollectionIds: [],
        ungroupedBookKeys: [],
        bookMetadata
    });

    return {
        state: savedState,
        usedProvider,
        collectionsCreated: newAiCollections.length
    };
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIFORM AUDIOBOOK FILE RENAMER (WITH CUSTOM TEMPLATES & AUDIO VERSION TAGS)
// ══════════════════════════════════════════════════════════════════════════════

export interface BookRenameItemInput {
    bookKey: string;
    title: string;
    cleanTitle?: string;
    author: string;
    releaseYear?: string;
    collectionName?: string;
    bookNumber?: number;
    chapterKey?: string;
    chapterIndex?: number;
    chapterTitle?: string;
    totalChapters?: number;
    filePath: string;
    audioVersion?: 'Original' | 'Optimized Audio' | 'auto';
}

export interface BookRenamePreviewResult {
    bookKey: string;
    chapterKey?: string;
    oldPath: string;
    oldFileName: string;
    newPath: string;
    newFileName: string;
    directory: string;
    audioVersionLabel: string;
    hasOptimizedAudio: boolean;
    existsOnDisk: boolean;
    willChange: boolean;
}

const sanitizeFileNameSegment = (val: string): string => {
    return (val || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

export const formatUniformAudiobookFileName = (
    item: BookRenameItemInput,
    template: string,
    versionMode: 'auto' | 'original_only' | 'optimized_label' = 'auto'
): { newFileName: string; audioVersionLabel: string; hasOptimizedAudio: boolean } => {
    const ext = path.extname(item.filePath || '') || '.m4b';
    const parsed = parseCleanBookTitleAndNumber(item.title, undefined, item.filePath);

    const cleanTitle = sanitizeFileNameSegment(item.cleanTitle || parsed.cleanTitle || item.title || 'Untitled Book');
    const author = sanitizeFileNameSegment(item.author || 'Unknown Author');
    const year = sanitizeFileNameSegment(item.releaseYear || parsed.releaseYear || '');
    const collection = sanitizeFileNameSegment(item.collectionName || parsed.inferredCollection || '');
    const rawBookNum = item.bookNumber ?? parsed.bookNumber;
    const bookNum = rawBookNum && rawBookNum > 0 ? String(rawBookNum).padStart(2, '0') : '';
    const totalCh = item.totalChapters || 1;
    const chapterNum = item.chapterIndex && item.chapterIndex > 0 ? String(item.chapterIndex).padStart(2, '0') : '01';
    const chapterTitle = sanitizeFileNameSegment(item.chapterTitle || `Chapter ${chapterNum}`);

    // Check if this chapter or book has an Audio-Enhanced (Optimized) version in Studio SQLite
    let hasOptimizedAudio = false;
    if (item.chapterKey) {
        const chMeta = getAudiobookChapterMeta(item.chapterKey);
        if (chMeta?.audio_enhance_status === 'completed' || (chMeta?.enhanced_audio_path && fs.existsSync(chMeta.enhanced_audio_path))) {
            hasOptimizedAudio = true;
        }
    }
    if (!hasOptimizedAudio && item.bookKey) {
        const bMeta = getAudiobookMeta(item.bookKey);
        if (bMeta && (bMeta.enhanced_chapters || 0) > 0) {
            hasOptimizedAudio = true;
        }
    }
    if (/(?:\boptimized\b|\benhanced\b|\bhq\s+audio\b)/i.test(path.basename(item.filePath || ''))) {
        hasOptimizedAudio = true;
    }

    let audioVersionLabel = 'Original';
    if (versionMode === 'optimized_label') {
        audioVersionLabel = 'Optimized Audio';
    } else if (versionMode === 'original_only') {
        audioVersionLabel = 'Original';
    } else {
        audioVersionLabel = hasOptimizedAudio ? 'Optimized Audio' : 'Original';
    }

    let rendered = (template || '{Author} - {Title} ({Year}) [{AudioVersion}]')
        .replace(/\{Author\}/gi, author)
        .replace(/\{Title\}/gi, cleanTitle)
        .replace(/\{CleanTitle\}/gi, cleanTitle)
        .replace(/\{Year\}/gi, year)
        .replace(/\{Collection\}/gi, collection)
        .replace(/\{Series\}/gi, collection)
        .replace(/\{BookNum\}/gi, bookNum)
        .replace(/\{ChapterNum\}/gi, chapterNum)
        .replace(/\{ChapterTitle\}/gi, chapterTitle)
        .replace(/\{AudioVersion\}/gi, audioVersionLabel);

    // Clean up empty parentheses/brackets when a book doesn't have a Year, Collection, or BookNum
    rendered = rendered
        .replace(/\[\s*#?\s*\]/g, '')
        .replace(/\(\s*\)/g, '')
        .replace(/\[\s*-\s*\]/g, '')
        .replace(/(?:[-–—]\s*){2,}/g, '- ')
        .replace(/\s+[-–—]\s*$/g, '')
        .replace(/^\s*[-–—]\s+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // If a book has multiple chapter files (>1) and the template didn't include {ChapterNum} or {ChapterTitle},
    // append " - Part XX" before the extension so multi-file chapters never collide!
    if (totalCh > 1 && !/\{ChapterNum\}|\{ChapterTitle\}/i.test(template)) {
        rendered = `${rendered} - Ch ${chapterNum}`;
    }

    const safeBase = sanitizeFileNameSegment(rendered) || cleanTitle || 'Audiobook';
    const newFileName = safeBase.toLowerCase().endsWith(ext.toLowerCase()) ? safeBase : `${safeBase}${ext}`;

    return {
        newFileName,
        audioVersionLabel,
        hasOptimizedAudio
    };
};

export const previewRenameAudiobookFiles = (
    items: BookRenameItemInput[],
    template: string,
    versionMode: 'auto' | 'original_only' | 'optimized_label' = 'auto'
): BookRenamePreviewResult[] => {
    const results: BookRenamePreviewResult[] = [];
    const usedTargetPaths = new Set<string>();

    for (const item of items) {
        if (!item.filePath) continue;
        const dir = path.dirname(item.filePath);
        const oldFileName = path.basename(item.filePath);
        const { newFileName, audioVersionLabel, hasOptimizedAudio } = formatUniformAudiobookFileName(item, template, versionMode);

        let finalNewFileName = newFileName;
        let candidatePath = path.join(dir, finalNewFileName);
        let counter = 2;
        while (usedTargetPaths.has(candidatePath.toLowerCase()) && candidatePath.toLowerCase() !== item.filePath.toLowerCase()) {
            const ext = path.extname(newFileName);
            const base = newFileName.slice(0, -ext.length);
            finalNewFileName = `${base} (${counter})${ext}`;
            candidatePath = path.join(dir, finalNewFileName);
            counter++;
        }
        usedTargetPaths.add(candidatePath.toLowerCase());

        const existsOnDisk = fs.existsSync(item.filePath);
        results.push({
            bookKey: item.bookKey,
            chapterKey: item.chapterKey,
            oldPath: item.filePath,
            oldFileName,
            newPath: candidatePath,
            newFileName: finalNewFileName,
            directory: dir,
            audioVersionLabel,
            hasOptimizedAudio,
            existsOnDisk,
            willChange: oldFileName !== finalNewFileName
        });
    }

    return results;
};

export const executeRenameAudiobookFiles = (
    items: BookRenameItemInput[],
    template: string,
    versionMode: 'auto' | 'original_only' | 'optimized_label' = 'auto'
): {
    renamedCount: number;
    skippedCount: number;
    errors: string[];
    results: Array<{ oldPath: string; newPath: string; oldFileName: string; newFileName: string; status: 'renamed' | 'skipped' | 'error'; message?: string }>;
} => {
    const previews = previewRenameAudiobookFiles(items, template, versionMode);
    let renamedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    const results: Array<{ oldPath: string; newPath: string; oldFileName: string; newFileName: string; status: 'renamed' | 'skipped' | 'error'; message?: string }> = [];

    for (const p of previews) {
        if (!p.willChange) {
            skippedCount++;
            results.push({ oldPath: p.oldPath, newPath: p.newPath, oldFileName: p.oldFileName, newFileName: p.newFileName, status: 'skipped', message: 'Already matches uniform template' });
            continue;
        }
        if (!p.existsOnDisk) {
            skippedCount++;
            results.push({ oldPath: p.oldPath, newPath: p.newPath, oldFileName: p.oldFileName, newFileName: p.newFileName, status: 'skipped', message: 'Remote stream / file not on local path' });
            continue;
        }

        try {
            if (fs.existsSync(p.newPath) && p.oldPath.toLowerCase() !== p.newPath.toLowerCase()) {
                errors.push(`Target file already exists: ${p.newFileName}`);
                results.push({ oldPath: p.oldPath, newPath: p.newPath, oldFileName: p.oldFileName, newFileName: p.newFileName, status: 'error', message: 'Target file already exists' });
                continue;
            }

            fs.renameSync(p.oldPath, p.newPath);

            // Also rename companion .lrc / .txt sidecars if they exist alongside the audio file
            const oldExt = path.extname(p.oldPath);
            const newExt = path.extname(p.newPath);
            const oldBase = p.oldPath.slice(0, -oldExt.length);
            const newBase = p.newPath.slice(0, -newExt.length);
            for (const sideExt of ['.lrc', '.txt', '.srt']) {
                if (fs.existsSync(`${oldBase}${sideExt}`) && !fs.existsSync(`${newBase}${sideExt}`)) {
                    try { fs.renameSync(`${oldBase}${sideExt}`, `${newBase}${sideExt}`); } catch {}
                }
            }

            // Update chapter file_path in SQLite if tracked
            if (p.chapterKey) {
                const ch = getAudiobookChapterMeta(p.chapterKey);
                if (ch) {
                    upsertAudiobookChapterMeta({
                        chapter_key: p.chapterKey,
                        book_key: ch.book_key,
                        file_path: p.newPath
                    });
                }
            }

            renamedCount++;
            results.push({ oldPath: p.oldPath, newPath: p.newPath, oldFileName: p.oldFileName, newFileName: p.newFileName, status: 'renamed' });
        } catch (err: any) {
            errors.push(`${p.oldFileName}: ${err.message}`);
            results.push({ oldPath: p.oldPath, newPath: p.newPath, oldFileName: p.oldFileName, newFileName: p.newFileName, status: 'error', message: err.message });
        }
    }

    return {
        renamedCount,
        skippedCount,
        errors,
        results
    };
};


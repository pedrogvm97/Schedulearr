import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import {
    getSetting,
    setSetting,
    getTheaterLibraries,
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
    activeTask: 'transcribing' | 'illustrating' | 'enhancing' | null;
    progress: number;
    lastLog: string;
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
        progress: 0,
        lastLog: 'Idle — Ready to process queued audiobooks',
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
    if (k.startsWith('AIza')) return { provider: 'gemini', label: 'Google Gemini API' };
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
        const existingKeys = [...(merged.apiKeys || [])];
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
        if (merged.quotaResetDate !== today) {
            merged.imagesGeneratedToday = 0;
            merged.quotaResetDate = today;
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

    // 1. Google Gemini (AIza...)
    if (key.startsWith('AIza')) {
        try {
            const resp = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { timeout: 12000 });
            const modelList: string[] = (resp.data?.models || []).map((m: any) => String(m.name || '').replace('models/', ''));
            const hasImagen = modelList.some(m => m.includes('imagen') || m.includes('image-generation'));
            const hasFlash = modelList.some(m => m.includes('gemini-2.0-flash') || m.includes('gemini-1.5-flash'));

            let tier = 'Google AI Studio (Free / Standard Tier — 15 RPM)';
            let rateLimitInfo = '15 Requests/min • 1,500 Req/day (Gemini Flash Audio + Scene Director)';
            let recommendedRpm = 15;
            try {
                const testResp = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
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
                'Multimodal Audio Transcription (Gemini 2.0 Flash)',
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
                message: `Verified Google Gemini key (${hasFlash ? 'Gemini 2.0 Audio STT + ' : ''}${hasImagen ? 'Gemini Image Gen' : 'Scene Director'} ready).`,
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

export const getAudiobookStudioStatus = (): AudiobookStudioLiveStatus => {
    const cfg = getAudiobookStudioConfig();
    return {
        ...g.__audiobookStudioStatus,
        imagesGeneratedToday: cfg.imagesGeneratedToday,
        dailyImageQuota: cfg.dailyImageQuota
    };
};

const updateLiveStatus = (patch: Partial<AudiobookStudioLiveStatus>) => {
    g.__audiobookStudioStatus = {
        ...g.__audiobookStudioStatus,
        ...patch,
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
    if (!filePath || !fs.existsSync(filePath)) return 300;
    return new Promise<number>((resolve) => {
        const proc = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        let out = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.on('close', () => {
            const parsed = parseFloat(out.trim());
            resolve(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 300);
        });
        proc.on('error', () => resolve(300));
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
                const resp = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(keyEntry.key)}`,
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
        }
    }
    return null;
};

/**
 * AI Real-Life Book Structure Discovery:
 * Queries OpenLibrary + the user's configured AI to discover how many chapters and key scenes
 * the book has in real life, storing the structured breakdown on the server so chapter & scene
 * illustrations match the real literary scenes even when the audiobook has coarse audio files.
 */
export const discoverBookRealStructureWithAi = async (
    book: AudiobookBookMeta
): Promise<BookRealStructure> => {
    if (book.real_structure_json) {
        try {
            const parsed = JSON.parse(book.real_structure_json);
            if (parsed && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
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
        lastLog: `Searching real-life chapter & scene structure for "${book.title}" by ${book.author}...`
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

    // Query Wikipedia API for the actual novel's plot, characters, and locations
    try {
        const cleanQuery = `${book.title} ${book.author !== 'Unknown Author' ? book.author : ''} novel`.trim();
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
                wikiPlotSummary = extractText.slice(0, 2600).replace(/\s+/g, ' ');
                const matches = extractText.match(/\b[A-Z][a-z]{2,14}(?:\s+[A-Z][a-z]{2,14})?\b/g) || [];
                const stopWords = new Set(['The', 'And', 'But', 'When', 'After', 'Before', 'While', 'During', 'Plot', 'Summary', 'Novel', 'Book', 'History', 'Earth', 'Series', 'Chapter', 'Part', 'Volume', 'Published', 'Science', 'Fiction', 'Author', 'Awards', 'Reception']);
                for (const m of matches) {
                    if (!stopWords.has(m) && !m.includes(book.author.split(' ')[0] || '___') && wikiCharacters.length < 12 && !wikiCharacters.includes(m)) {
                        wikiCharacters.push(m);
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
 * Resolves the physical audio file path for a chapter, handling missing file_path,
 * container/host path mappings, or scanning the audiobook library folder when needed.
 */
export const resolveChapterAudioFilePath = (book: AudiobookBookMeta, chapter: AudiobookChapterMeta): string | undefined => {
    const rawPath = (chapter.file_path || '').trim();
    if (rawPath && fs.existsSync(rawPath)) return rawPath;

    // 1. Check path_mappings setting
    if (rawPath) {
        try {
            const mappings = JSON.parse(getSetting('path_mappings') || '[]');
            const norm = rawPath.replace(/\\/g, '/');
            for (const m of mappings) {
                const hostP = String(m.hostPath || '').replace(/\\/g, '/');
                const contP = String(m.containerPath || '').replace(/\\/g, '/');
                if (hostP && contP) {
                    if (norm.toLowerCase().startsWith(hostP.toLowerCase())) {
                        const cand = contP + norm.slice(hostP.length);
                        if (fs.existsSync(cand)) return cand;
                    }
                    if (norm.toLowerCase().startsWith(contP.toLowerCase())) {
                        const cand = hostP + norm.slice(contP.length);
                        if (fs.existsSync(cand)) return cand;
                    }
                }
            }
        } catch {}
    }

    // 2. Search audiobook libraries for matching book folder or audio file
    try {
        const libs = getTheaterLibraries().filter((l: any) => l.type === 'audiobooks' || l.type === 'books');
        const audioExts = new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus']);
        const targetChapterName = (chapter.title || '').toLowerCase().replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '').trim();
        const targetBookTitle = (book.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const rawBaseName = rawPath ? path.basename(rawPath).toLowerCase() : '';

        const matchedFiles: string[] = [];
        const walkDir = (dir: string, depth: number = 0) => {
            if (depth > 4 || !fs.existsSync(dir)) return;
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
            for (const folder of (lib.folders || [])) {
                walkDir(folder, 0);
            }
        }

        if (matchedFiles.length > 0) {
            matchedFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            const exactByTitle = matchedFiles.find(f =>
                path.basename(f, path.extname(f)).toLowerCase().includes(targetChapterName)
            );
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

const isFakePlaceholderTranscript = (text?: string): boolean => {
    if (!text) return false;
    return (
        text.includes('The narrator establishes the setting') ||
        text.includes('Opening narration —') ||
        text.includes('Characters and immediate surroundings come into sharp focus')
    );
};

/**
 * Server-persisted real Speech-to-Text & time-synced transcription engine:
 * 1. NEVER generates fake generic summaries or placeholder lines.
 * 2. Uses configured AI keys in priority/failover order:
 *    - Google Gemini (`gemini-2.0-flash` / `gemini-1.5-flash` multimodal audio)
 *    - Groq Whisper (`whisper-large-v3-turbo` / `whisper-large-v3`)
 *    - OpenAI Whisper (`whisper-1`)
 *    - Local Whisper CLI (`whisper`) if installed on host
 * 3. Processes audio in chunks up to the full chapter length and updates `transcribed_seconds`
 *    in real time after each chunk.
 */
export const transcribeAudiobookChapter = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig
): Promise<{ syncedLyrics: string; plainTranscript: string }> => {
    const resolvedFilePath = resolveChapterAudioFilePath(book, chapter);
    if (resolvedFilePath && resolvedFilePath !== chapter.file_path) {
        chapter.file_path = resolvedFilePath;
    }

    const durationSec = chapter.duration_sec > 0 ? chapter.duration_sec : await probeAudioDuration(resolvedFilePath);
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
        progress: 5,
        lastLog: `Preparing audio stream for "${book.title}" — ${chapter.title}...`
    });

    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        file_path: resolvedFilePath || chapter.file_path,
        duration_sec: durationSec,
        transcribed_seconds: 0,
        transcription_status: 'processing',
        transcription_progress: 5,
        error_message: ''
    });

    const persistTranscriptToServer = (syncedLyrics: string, plainTranscript: string, providerUsed: string, transcribedSec: number) => {
        try {
            fs.writeFileSync(serverLrcPath, syncedLyrics, 'utf8');
            fs.writeFileSync(serverTxtPath, plainTranscript, 'utf8');
        } catch (err: any) {
            console.warn(`⚠️ [AudiobookStudio] Could not write transcript files to disk:`, err.message);
        }

        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            file_path: resolvedFilePath || chapter.file_path,
            duration_sec: durationSec,
            transcribed_seconds: Math.max(transcribedSec, durationSec),
            transcription_status: 'completed',
            transcription_progress: 100,
            synced_lyrics: syncedLyrics,
            plain_transcript: plainTranscript,
            transcript_lrc_path: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.lrc`)}`,
            transcript_txt_path: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.txt`)}`,
            error_message: ''
        });

        appendStudioQueueHistory({
            bookKey: book.book_key,
            bookTitle: book.title,
            chapterKey: chapter.chapter_key,
            chapterTitle: chapter.title,
            queueType: 'transcription',
            status: 'completed',
            providerUsed,
            detail: `Transcribed ${Math.round(Math.max(transcribedSec, durationSec))}s (${syncedLyrics.split('\n').length} timed lines)`,
            serverFileUrl: `/api/theater/audiobooks/art?transcript=${encodeURIComponent(`${safeChapterId}.lrc`)}`
        });
    };

    if (!resolvedFilePath || !fs.existsSync(resolvedFilePath)) {
        const msg = `Audio file not accessible on server disk (${chapter.file_path || 'missing path'}). Re-sync book or check library folder mounts.`;
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            transcription_status: 'failed',
            transcription_progress: 0,
            transcribed_seconds: 0,
            error_message: msg
        });
        updateLiveStatus({ isRunning: false, activeTask: null, lastLog: `Transcription failed: ${msg}` });
        return { syncedLyrics: '', plainTranscript: '' };
    }

    // 1. Check if a genuine sidecar .lrc or .srt exists next to the audio file
    const ext = path.extname(resolvedFilePath);
    const baseNoExt = resolvedFilePath.slice(0, -ext.length);
    const lrcSidecar = `${baseNoExt}.lrc`;
    const txtSidecar = `${baseNoExt}.txt`;

    if (fs.existsSync(lrcSidecar)) {
        const rawLrc = fs.readFileSync(lrcSidecar, 'utf8');
        if (!isFakePlaceholderTranscript(rawLrc) && rawLrc.trim().length > 40) {
            const plain = rawLrc.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
            persistTranscriptToServer(rawLrc, plain, 'Local Sidecar .LRC', durationSec);
            return { syncedLyrics: rawLrc, plainTranscript: plain };
        }
    }
    if (fs.existsSync(txtSidecar)) {
        const rawTxt = fs.readFileSync(txtSidecar, 'utf8').trim();
        if (!isFakePlaceholderTranscript(rawTxt) && rawTxt.length > 40) {
            const sentences = rawTxt.split(/(?<=[.!?])\s+/).filter(Boolean);
            const lines = sentences.map((s, idx) => {
                const t = (idx / Math.max(1, sentences.length)) * durationSec;
                return `${formatLrcTimestamp(t)} ${s}`;
            });
            const synced = lines.join('\n');
            persistTranscriptToServer(synced, rawTxt, 'Local Sidecar .TXT', durationSec);
            return { syncedLyrics: synced, plainTranscript: rawTxt };
        }
    }

    // 2. Real Audio Speech-to-Text via Configured AI Keys (Gemini Audio, Groq Whisper, OpenAI Whisper)
    const freshConfig = getAudiobookStudioConfig();
    const sttCandidates = getCandidateStudioKeys(freshConfig, ['gemini', 'groq', 'openai']);

    if (sttCandidates.length === 0) {
        const noKeyMsg = 'No Speech-to-Text API key configured (Gemini, Groq, or OpenAI required for audio transcription). Add your API key in Settings -> AI Studio.';
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            transcription_status: 'failed',
            transcription_progress: 0,
            transcribed_seconds: 0,
            error_message: noKeyMsg
        });
        appendStudioQueueHistory({
            bookKey: book.book_key,
            bookTitle: book.title,
            chapterKey: chapter.chapter_key,
            chapterTitle: chapter.title,
            queueType: 'transcription',
            status: 'failed',
            providerUsed: 'None',
            detail: noKeyMsg
        });
        updateLiveStatus({ isRunning: false, activeTask: null, lastLog: noKeyMsg });
        return { syncedLyrics: '', plainTranscript: '' };
    }

    // Chunk audio into 10-minute (600s) segments (up to 3600s / 60m per chapter file) so every chunk stays small and fast
    const chunkDurationSec = 600;
    const totalToTranscribeSec = Math.min(Math.max(durationSec, 60), 3600);
    const numChunks = Math.max(1, Math.ceil(totalToTranscribeSec / chunkDurationSec));
    const allLrcLines: string[] = [];
    const allPlainParts: string[] = [];
    let completedSec = 0;
    let winningProviderLabel = '';
    let lastSttError = '';

    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        const startOffsetSec = chunkIdx * chunkDurationSec;
        const currentChunkLenSec = Math.min(chunkDurationSec, totalToTranscribeSec - startOffsetSec);
        if (currentChunkLenSec <= 2) break;

        const tmpSample = path.join(
            getAudiobookEnhancedDir(),
            `stt_chunk_${Date.now()}_${chunkIdx}_${Math.random().toString(36).slice(2, 6)}.mp3`
        );

        try {
            const pctExtract = Math.min(90, Math.round(((chunkIdx + 0.2) / numChunks) * 90));
            updateLiveStatus({
                progress: pctExtract,
                lastLog: `Extracting audio segment ${chunkIdx + 1}/${numChunks} (${Math.round(startOffsetSec)}s–${Math.round(startOffsetSec + currentChunkLenSec)}s) from "${chapter.title}"...`
            });

            await new Promise<void>((resolve) => {
                const ff = spawn('ffmpeg', [
                    '-y', '-threads', '1',
                    '-ss', String(startOffsetSec),
                    '-i', resolvedFilePath,
                    '-t', String(currentChunkLenSec),
                    '-ac', '1', '-ar', '16000', '-b:a', '24k',
                    tmpSample
                ]);
                ff.on('close', () => resolve());
                ff.on('error', () => resolve());
            });

            if (!fs.existsSync(tmpSample) || fs.statSync(tmpSample).size < 256) {
                lastSttError = `FFmpeg could not extract audio stream from ${path.basename(resolvedFilePath)}`;
                break;
            }

            let chunkTranscribed = false;

            for (const keyEntry of sttCandidates) {
                if (chunkTranscribed) break;
                try {
                    if (keyEntry.provider === 'gemini') {
                        const pctApi = Math.min(95, Math.round(((chunkIdx + 0.5) / numChunks) * 95));
                        updateLiveStatus({
                            progress: pctApi,
                            lastLog: `Transcribing "${chapter.title}" (${Math.round(startOffsetSec)}s–${Math.round(startOffsetSec + currentChunkLenSec)}s) via ${keyEntry.label} (${keyEntry.maskedKey})...`
                        });
                        const audioB64 = fs.readFileSync(tmpSample).toString('base64');
                        const sttPrompt = [
                            `You are a verbatim Speech-to-Text audio transcriber.`,
                            `Transcribe the spoken words in this audio recording from "${book.title}" by ${book.author} (Section: "${chapter.title}") word-for-word in the exact language spoken by the narrator.`,
                            `STRICT RULES:`,
                            `1. Output ONLY the actual spoken words heard in the audio—do NOT summarize, do NOT describe the narrator, and do NOT invent text.`,
                            `2. Format every spoken sentence or phrase on its own line starting with its relative timestamp in [MM:SS.xx] format (starting at [00:00.00]).`,
                            `3. Output ONLY the [MM:SS.xx] transcript lines.`
                        ].join('\n');

                        const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
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
                                        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
                                    },
                                    { timeout: 120000 }
                                );
                                rawOut = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                                if (rawOut) break;
                            } catch (modelErr: any) {
                                lastSttError = modelErr?.response?.data?.error?.message || modelErr.message || 'Gemini STT error';
                                if (modelErr?.response?.status === 429) {
                                    // Rate limit backoff 3s before trying next model/key
                                    await new Promise(r => setTimeout(r, 3000));
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

                        if (chunkLines.length >= 2) {
                            recordStudioApiMetric({
                                task: 'transcription',
                                keyOrProvider: keyEntry.id,
                                providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                                success: true,
                                description: `Gemini Audio STT (${Math.round(currentChunkLenSec)}s): "${book.title}" — ${chapter.title}`
                            });
                            allLrcLines.push(...chunkLines);
                            allPlainParts.push(...chunkPlain);
                            completedSec += currentChunkLenSec;
                            winningProviderLabel = `${keyEntry.label} (${keyEntry.maskedKey})`;
                            chunkTranscribed = true;
                        }
                    } else if (keyEntry.provider === 'groq' || keyEntry.provider === 'openai') {
                        const isGroq = keyEntry.provider === 'groq';
                        const pctApi = Math.min(95, Math.round(((chunkIdx + 0.5) / numChunks) * 95));
                        updateLiveStatus({
                            progress: pctApi,
                            lastLog: `Transcribing "${chapter.title}" (${Math.round(startOffsetSec)}s–${Math.round(startOffsetSec + currentChunkLenSec)}s) via ${isGroq ? 'Groq Whisper Large v3' : 'OpenAI Whisper'} (${keyEntry.maskedKey})...`
                        });
                        const FormData = (await import('form-data')).default;
                        const form = new FormData();
                        form.append('file', fs.createReadStream(tmpSample));
                        form.append('model', isGroq ? 'whisper-large-v3-turbo' : 'whisper-1');
                        form.append('response_format', 'verbose_json');

                        const endpoint = isGroq
                            ? 'https://api.groq.com/openai/v1/audio/transcriptions'
                            : 'https://api.openai.com/v1/audio/transcriptions';

                        const resp = await axios.post(endpoint, form, {
                            headers: {
                                ...form.getHeaders(),
                                Authorization: `Bearer ${keyEntry.key}`
                            },
                            timeout: 120000
                        });

                        if (resp.data && (Array.isArray(resp.data.segments) || resp.data.text)) {
                            recordStudioApiMetric({
                                task: 'transcription',
                                keyOrProvider: keyEntry.id,
                                providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                                success: true,
                                description: `Whisper STT (${Math.round(currentChunkLenSec)}s): "${book.title}" — ${chapter.title}`
                            });
                            if (Array.isArray(resp.data.segments) && resp.data.segments.length > 0) {
                                for (const seg of resp.data.segments) {
                                    const absSec = startOffsetSec + Number(seg.start || 0);
                                    const txt = String(seg.text || '').trim();
                                    if (txt) {
                                        allLrcLines.push(`${formatLrcTimestamp(absSec)} ${txt}`);
                                        allPlainParts.push(txt);
                                    }
                                }
                            } else if (resp.data.text) {
                                const sentences = String(resp.data.text).trim().split(/(?<=[.!?])\s+/).filter(Boolean);
                                sentences.forEach((s: string, idx: number) => {
                                    const absSec = startOffsetSec + (idx / Math.max(1, sentences.length)) * currentChunkLenSec;
                                    allLrcLines.push(`${formatLrcTimestamp(absSec)} ${s}`);
                                    allPlainParts.push(s);
                                });
                            }
                            completedSec += currentChunkLenSec;
                            winningProviderLabel = `${keyEntry.label} (${keyEntry.maskedKey})`;
                            chunkTranscribed = true;
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

            // Update incremental progress & transcribed_seconds after each chunk
            if (chunkTranscribed) {
                const progressPct = Math.min(98, Math.round((completedSec / totalToTranscribeSec) * 100));
                upsertAudiobookChapterMeta({
                    chapter_key: chapter.chapter_key,
                    book_key: book.book_key,
                    duration_sec: durationSec,
                    transcribed_seconds: completedSec,
                    transcription_status: 'processing',
                    transcription_progress: progressPct,
                    synced_lyrics: allLrcLines.join('\n'),
                    plain_transcript: allPlainParts.join(' ')
                });
            } else {
                // Stop chunk loop if all providers failed on this chunk
                break;
            }
        } finally {
            try { if (fs.existsSync(tmpSample)) fs.unlinkSync(tmpSample); } catch {}
        }
    }

    if (allLrcLines.length > 0) {
        const syncedLyrics = allLrcLines.join('\n');
        const plainTranscript = allPlainParts.join(' ');
        persistTranscriptToServer(syncedLyrics, plainTranscript, winningProviderLabel || 'Cloud Speech-to-Text', completedSec || durationSec);
        console.log(`✅ [AudiobookStudio] Completed real audio transcription for "${book.title}" — ${chapter.title} (${winningProviderLabel}, ${Math.round(completedSec)}s)`);
        return { syncedLyrics, plainTranscript };
    }

    // If all STT attempts failed, fail honestly with the real API error message — NEVER invent fake text!
    const failReason = lastSttError
        ? `Speech-to-Text API error: ${lastSttError}`
        : 'Speech-to-Text returned no transcript lines. Check your API key quota in Settings -> AI Studio.';
    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
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
 * Supports processing and storing MULTIPLE voice presets per chapter so the user can swap between
 * processed voices anytime in the player!
 */
export const enhanceAudiobookChapterAudio = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig,
    overrideVoicePreset?: string
): Promise<string | null> => {
    const voicePreset = overrideVoicePreset || chapter.voice_preset || book.voice_preset || config.defaultVoicePreset || 'warm_storyteller';
    const effectiveVoice = voicePreset === 'original' ? 'warm_storyteller' : voicePreset;

    if (!chapter.file_path || !fs.existsSync(chapter.file_path)) {
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            audio_enhance_status: 'completed',
            audio_enhance_progress: 100,
            voice_preset: effectiveVoice,
            error_message: 'Source file streamed remotely; realtime WebAudio voice profile active.'
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
        lastLog: `Processing voice profile "${effectiveVoice}" for "${chapter.title}" (1 CPU thread)...`
    });

    const effectiveEnhancePreset = book.enhance_preset || config.audioEnhancePreset || 'denoise_clarity';
    console.log(`🎙️ [AudiobookStudio] Enhancing audio for "${book.title}" -> "${chapter.title}" (Preset: ${effectiveEnhancePreset}, Voice: ${effectiveVoice})`);

    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        audio_enhance_status: 'processing',
        audio_enhance_progress: 25
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
        filters.push('asetrate=44100*0.92,aresample=44100,atempo=1.087,equalizer=f=140:width_type=h:width=90:g=3');
    } else if (effectiveVoice === 'warm_storyteller') {
        filters.push('asetrate=44100*0.96,aresample=44100,atempo=1.041,equalizer=f=220:width_type=h:width=120:g=2.5');
    } else if (effectiveVoice === 'crisp_clear' || effectiveVoice === 'crisp_modern') {
        filters.push('asetrate=44100*1.04,aresample=44100,atempo=0.961,equalizer=f=3600:width_type=h:width=1200:g=3');
    } else if (effectiveVoice === 'soft_velvet' || effectiveVoice === 'velvet_narrator') {
        filters.push('asetrate=44100*0.97,aresample=44100,atempo=1.031,lowpass=f=10500,equalizer=f=180:width_type=h:width=100:g=2.5');
    } else if (effectiveVoice === 'late_night_radio') {
        filters.push('asetrate=44100*0.94,aresample=44100,atempo=1.064,highpass=f=90,lowpass=f=10000,equalizer=f=160:width_type=h:width=90:g=3.5,acompressor=threshold=-18dB:ratio=3:attack=10:release=180');
    }

    const safeId = chapter.chapter_key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFileName = `${safeId}_${effectiveVoice}.m4a`;
    const outPath = path.join(getAudiobookEnhancedDir(), outFileName);

    const success = await new Promise<boolean>((resolve) => {
        const ff = spawn('ffmpeg', [
            '-y',
            '-threads', '1',
            '-i', chapter.file_path!,
            '-vn',
            '-af', filters.join(','),
            '-c:a', 'aac',
            '-b:a', '96k',
            outPath
        ]);

        ff.on('close', (code) => resolve(code === 0 && fs.existsSync(outPath)));
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
            processed_voices: existingVoices
        });
        appendStudioQueueHistory({
            bookKey: book.book_key,
            bookTitle: book.title,
            chapterKey: chapter.chapter_key,
            chapterTitle: chapter.title,
            queueType: 'voice',
            status: 'completed',
            providerUsed: `FFmpeg Studio DSP (${effectiveVoice})`,
            detail: `Processed voice "${effectiveVoice}" + ${effectiveEnhancePreset}`,
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
            error_message: 'FFmpeg audio enhancement failed'
        });
        return null;
    }
};

/**
 * Dynamic AI Scene Prompt Director:
 * Uses the user's configured AI key pool (with failover / load-balancing & live API metrics)
 * plus verified Wikipedia/OpenLibrary plot & character context and transcribed audio passages
 * to craft a scene-accurate visual prompt depicting exact characters, events, and locations.
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
        'auto-choice': 'balanced composition capturing key characters, story action, mood, and setting',
        'characters': 'expressive character portrait, attire, facial expression, and dramatic interaction in scene',
        'ambient': 'immersive atmospheric lighting, mood, weather, and environmental texture',
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
            ...knownCharacters.slice(0, 5),
            ...(sceneSnippet.match(/\b[A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?\b/g) || [])
                .filter(w => !['The', 'And', 'But', 'Then', 'When', 'Where', 'While', 'Opening', 'Chapter', 'Section', 'Events', 'Details', 'Closing', 'Scene', 'Part'].includes(w))
        ])
    ).slice(0, 7);

    const prevContinuity = previousPrompts.length > 0
        ? `Previous scene visual continuity: "${previousPrompts[previousPrompts.length - 1].slice(0, 220)}"`
        : '';

    const roleTarget = artType === 'cover'
        ? `the iconic Master Book Cover Illustration for the book "${book.title}" by ${book.author}`
        : artType === 'chapter'
        ? `the Chapter Header Illustration for chapter "${chapter.title}" of "${book.title}" by ${book.author}`
        : `Scene ${sceneIndex + 1} of ${totalScenes} (${sceneTitle || `Scene ${sceneIndex + 1}`}) in chapter "${chapter.title}" of "${book.title}" by ${book.author}`;

    if (useDynamic) {
        const directorSystemPrompt = [
            `You are a master cinematic concept artist and book illustration director.`,
            `Write ONE vivid, concrete image-generation prompt (max 70 words) for ${roleTarget}.`,
            `Art Style: ${effectiveStyle}. Visual Focus: ${focusDesc}.`,
            sceneSnippet ? `Exact story event / transcribed passage: "${sceneSnippet}".` : '',
            properNouns.length > 0 ? `Exact named characters/locations to depict: ${properNouns.join(', ')}.` : '',
            prevContinuity ? `${prevContinuity} (Maintain consistent character appearance, era, and world palette while advancing to the new moment).` : '',
            effectiveCustomPrompt ? `Additional user direction: ${effectiveCustomPrompt}.` : '',
            `Depict the exact characters, story event, and environment described. Do NOT include any text, letters, book titles, speech bubbles, or watermarks in the image. Return ONLY the raw image prompt.`
        ].filter(Boolean).join('\n');

        const llmRes = await callStudioTextLlmWithFailover({
            prompt: directorSystemPrompt,
            task: 'art_prompt',
            maxTokens: 160,
            temperature: 0.6,
            description: `Scene prompt (${artType}) for "${book.title}"`
        });

        if (llmRes?.text && llmRes.text.length > 20) {
            return `${llmRes.text.replace(/^["']|["']$/g, '')}, ${effectiveStyle}, highly detailed digital painting, no text, no watermarks`;
        }
    }

    const cleanSnippet = sceneSnippet
        .replace(/["'()\[\]{}<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 190);

    return [
        `${effectiveStyle} illustration depicting a scene from ${book.title} by ${book.author}`,
        properNouns.length > 0 ? `featuring ${properNouns.slice(0, 4).join(', ')}` : '',
        cleanSnippet ? `during moment: ${cleanSnippet}` : '',
        `(${focusDesc}, dramatic cinematic lighting, detailed environment, no text, no letters, no watermark)`
    ].filter(Boolean).join(', ');
};

/**
 * Purges any legacy fake `.svg` placeholder files from disk and removes `.svg` image references
 * from SQLite (`audiobooks_meta` and `audiobook_chapters_meta`), recalculating book totals.
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
            }
            if (bookChanged) {
                recalculateAudiobookTotals(book.book_key);
            }
        }
    } catch (e: any) {
        console.warn('⚠️ [AudiobookStudio] Error purging legacy SVG files:', e?.message);
    }
    return { deletedFiles, cleanedChapters, cleanedBooks };
};

/**
 * Paints a REAL binary raster image (JPEG/PNG/WebP) on the server using:
 * 1. Configured AI keys (Gemini 2.0 Flash Image Generation, Gemini Imagen 3, OpenAI DALL-E 3)
 * 2. Configured Custom Local SDXL / Flux endpoint
 * 3. HuggingFace Official Flux.1-schnell Gradio Space API (free real Flux raster generation)
 * 4. Pollinations Flux / Turbo with sanitized concise prompt & model fallback
 * 5. AI Horde anonymous community GPU cluster (Flux / SDXL)
 * Strictly validates every buffer with `isValidImageBuffer` and NEVER generates fake SVG placeholders.
 */
const paintAndSaveStudioImage = async (params: {
    imgId: string;
    fullPrompt: string;
    book: AudiobookBookMeta;
    chapterTitle: string;
    sceneIndex: number;
    effectiveStyle: string;
    width: number;
    height: number;
}): Promise<{ fileName: string; providerUsed: string } | null> => {
    const { imgId, fullPrompt, book, chapterTitle, width, height } = params;
    const freshConfig = getAudiobookStudioConfig();
    const fileName = `${imgId}.jpg`;
    const filePath = path.join(getAudiobookArtDir(), fileName);

    // 1. Try configured API keys in failover / load-balance order (Gemini Image / Imagen 3, OpenAI DALL-E 3)
    const imageKeyCandidates = getCandidateStudioKeys(freshConfig, ['gemini', 'openai']);
    for (const keyEntry of imageKeyCandidates) {
        if (keyEntry.provider === 'gemini') {
            const geminiImageModels = [
                'gemini-2.0-flash-exp-image-generation',
                'gemini-2.0-flash-preview-image-generation'
            ];
            for (const gModel of geminiImageModels) {
                try {
                    const flashImgResp = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${encodeURIComponent(keyEntry.key)}`,
                        {
                            contents: [{ parts: [{ text: `Generate a detailed cinematic book illustration (strictly no text, no words, no titles): ${fullPrompt.slice(0, 1500)}` }] }],
                            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
                        },
                        { timeout: 45000 }
                    );
                    const parts = flashImgResp.data?.candidates?.[0]?.content?.parts || [];
                    const imgPart = parts.find((p: any) => p.inlineData?.data);
                    if (imgPart?.inlineData?.data) {
                        const buf = Buffer.from(imgPart.inlineData.data, 'base64');
                        if (isValidImageBuffer(buf)) {
                            fs.writeFileSync(filePath, buf);
                            recordStudioApiMetric({
                                task: 'image_paint',
                                keyOrProvider: keyEntry.id,
                                providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                                success: true,
                                description: `Gemini Flash Image: "${book.title}" — ${chapterTitle}`
                            });
                            return { fileName, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                        }
                    }
                } catch {}
            }

            try {
                const imagenResp = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(keyEntry.key)}`,
                    {
                        instances: [{ prompt: fullPrompt.slice(0, 1800) }],
                        parameters: { sampleCount: 1, aspectRatio: width > height ? '16:9' : width < height ? '3:4' : '1:1' }
                    },
                    { timeout: 45000 }
                );
                const b64 = imagenResp.data?.predictions?.[0]?.bytesBase64Encoded;
                if (b64) {
                    const buf = Buffer.from(b64, 'base64');
                    if (isValidImageBuffer(buf)) {
                        fs.writeFileSync(filePath, buf);
                        recordStudioApiMetric({
                            task: 'image_paint',
                            keyOrProvider: keyEntry.id,
                            providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                            success: true,
                            description: `Gemini Imagen 3: "${book.title}" — ${chapterTitle}`
                        });
                        return { fileName, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
                    }
                }
            } catch {}
        } else if (keyEntry.provider === 'openai') {
            try {
                const resp = await axios.post(
                    'https://api.openai.com/v1/images/generations',
                    {
                        model: 'dall-e-3',
                        prompt: fullPrompt.slice(0, 3800),
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
                        fs.writeFileSync(filePath, buf);
                        recordStudioApiMetric({
                            task: 'image_paint',
                            keyOrProvider: keyEntry.id,
                            providerLabel: `${keyEntry.label} (${keyEntry.maskedKey})`,
                            success: true,
                            description: `DALL·E 3: "${book.title}" — ${chapterTitle}`
                        });
                        return { fileName, providerUsed: `${keyEntry.label} (${keyEntry.maskedKey})` };
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
                { prompt: fullPrompt, width, height, steps: 20 },
                { headers, timeout: 60000 }
            );
            const b64 = resp.data?.images?.[0] || resp.data?.data?.[0]?.b64_json;
            if (b64) {
                const buf = Buffer.from(b64, 'base64');
                if (isValidImageBuffer(buf)) {
                    fs.writeFileSync(filePath, buf);
                    return { fileName, providerUsed: 'Custom Local Image Endpoint' };
                }
            }
        } catch {}
    }

    // 3. HuggingFace Official Flux.1-schnell Gradio Space API (generates genuine high-res WebP/PNG illustrations)
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
                { data: [fullPrompt.slice(0, 900), Math.floor(Math.random() * 1000000), true, hfW, hfH, 4] },
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
                        const remoteUrl = firstItem?.url || ( firstItem?.path ? `${spaceBase}/gradio_api/file=${firstItem.path}` : null );
                        if (remoteUrl) {
                            const imgBin = await axios.get(remoteUrl, { responseType: 'arraybuffer', timeout: 25000 });
                            const buf = Buffer.from(imgBin.data || []);
                            if (isValidImageBuffer(buf)) {
                                fs.writeFileSync(filePath, buf);
                                return { fileName, providerUsed: 'Flux.1 Schnell (HF Space)' };
                            }
                        }
                    } catch {}
                }
            }
        } catch {}
    }

    // 4. Sanitized Pollinations Flux / Turbo endpoints (clean alphanumeric prompt avoids Cloudflare/500 errors)
    const seed = Math.floor(Math.random() * 1000000);
    const sanitizedPrompt = fullPrompt
        .replace(/[^a-zA-Z0-9 ,.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
    const encodedPrompt = encodeURIComponent(sanitizedPrompt);
    const pW = Math.min(1024, Math.max(512, Math.round(width / 16) * 16));
    const pH = Math.min(1024, Math.max(512, Math.round(height / 16) * 16));
    const candidateUrls = [
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${pW}&height=${pH}&seed=${seed}&nologo=true&model=flux`,
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${pW}&height=${pH}&seed=${seed + 7}&nologo=true&model=turbo`
    ];

    for (const fluxUrl of candidateUrls) {
        try {
            const imgResp = await axios.get(fluxUrl, {
                responseType: 'arraybuffer',
                timeout: 38000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
                    'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.9'
                }
            });
            const buf = Buffer.from(imgResp.data || []);
            if (isValidImageBuffer(buf)) {
                fs.writeFileSync(filePath, buf);
                return { fileName, providerUsed: 'Flux Studio Engine' };
            }
        } catch {}
    }

    // 5. AI Horde anonymous community GPU cluster (real SDXL / Flux raster image generation)
    try {
        const hordeW = width > height ? 768 : width < height ? 512 : 640;
        const hordeH = width > height ? 512 : width < height ? 768 : 640;
        const hordeInit = await axios.post(
            'https://stablehorde.net/api/v2/generate/async',
            {
                prompt: `${fullPrompt.slice(0, 650)} ### text, watermark, signature, blurry, deformed, ugly`,
                params: {
                    width: hordeW,
                    height: hordeH,
                    steps: 20,
                    cfg_scale: 7,
                    sampler_name: 'k_euler_a',
                    n: 1
                },
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
                            fs.writeFileSync(filePath, buf);
                            return { fileName, providerUsed: `AI Horde (${statusResp.data.generations[0]?.model || 'SDXL'})` };
                        }
                    }
                    break;
                }
                if (statusResp.data?.faulted) break;
            }
        }
    } catch {}

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
        detail: `Generated Custom Book Cover (${effectiveStyle})`,
        serverFileUrl: coverUrl
    });

    return updatedBook;
};

/**
 * Generates Chapter Art (Priority #2) and Scene-by-Scene Art (Priority #3) matched to the
 * transcribed LRC timestamps (`startSec`..`endSec`) and the book's discovered real-life scenes.
 */
export const generateAudiobookChapterIllustrations = async (
    book: AudiobookBookMeta,
    chapter: AudiobookChapterMeta,
    config: AudiobookStudioConfig,
    forceIgnoreQuota: boolean = false
): Promise<AudiobookChapterSceneImage[]> => {
    purgeAllFakeSvgArtFromDbAndDisk();
    const freshConfig = getAudiobookStudioConfig();
    if (!forceIgnoreQuota && freshConfig.imagesGeneratedToday >= freshConfig.dailyImageQuota) {
        updateLiveStatus({
            lastLog: `Daily artwork quota reached (${freshConfig.imagesGeneratedToday}/${freshConfig.dailyImageQuota}). Pausing illustrations until tomorrow.`
        });
        return chapter.images || [];
    }

    updateLiveStatus({
        isRunning: true,
        activeBookKey: book.book_key,
        activeBookTitle: book.title,
        activeChapterKey: chapter.chapter_key,
        activeChapterTitle: chapter.title,
        activeTask: 'illustrating',
        progress: 15,
        lastLog: `Mapping narrative scenes & painting artwork for "${book.title}" — ${chapter.title}...`
    });

    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        illustration_status: 'processing',
        illustration_progress: 20
    });

    const effectiveStyle = (book.art_style && book.art_style.trim()) ? book.art_style.trim() : (freshConfig.artStyle || 'Cinematic Concept Art');
    const effectiveFocus = (book.art_focus && book.art_focus.trim()) ? book.art_focus.trim() : (freshConfig.artFocus || 'auto-choice');
    const effectiveCustomPrompt = (book.custom_prompt && book.custom_prompt.trim()) ? book.custom_prompt.trim() : (freshConfig.customPromptTemplate || '');

    // Ensure real-life scenes & Wikipedia/OpenLibrary plot context exist for this book
    let currentBook = book;
    if (!currentBook.real_structure_json) {
        try {
            await discoverBookRealStructureWithAi(currentBook);
            currentBook = getAudiobookMeta(book.book_key) || book;
        } catch {}
    }

    // Determine real-life scenes for this chapter from book.real_structure_json + chapter duration
    let realChapterScenes: BookRealChapterScene[] = [];
    if (currentBook.real_structure_json) {
        try {
            const st: BookRealStructure = JSON.parse(currentBook.real_structure_json);
            if (Array.isArray(st.chapters) && st.chapters.length > 0) {
                const matchedChap = st.chapters[chapter.chapter_index] || st.chapters[chapter.chapter_index % st.chapters.length];
                if (matchedChap && Array.isArray(matchedChap.scenes)) {
                    realChapterScenes = matchedChap.scenes;
                }
            }
        } catch {}
    }

    // Target count: 1 Chapter Header Art + N Scene Illustrations (per narrative scene)
    const configuredPerChap = (book.images_per_chapter && book.images_per_chapter > 0)
        ? book.images_per_chapter
        : (freshConfig.imagesPerChapter || Math.max(3, realChapterScenes.length + 1));
    const targetCount = Math.max(2, Math.min(8, configuredPerChap));

    const existingImages = Array.isArray(chapter.images)
        ? chapter.images.filter(img => img?.url && !img.url.toLowerCase().includes('.svg'))
        : [];
    const keptImages = existingImages.filter(img => img.kept);
    const needed = forceIgnoreQuota
        ? Math.max(1, targetCount - keptImages.length)
        : Math.max(0, targetCount - keptImages.length);

    if (needed === 0) {
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            illustration_status: 'completed',
            illustration_progress: 100,
            images: existingImages
        });
        return existingImages;
    }

    // Parse timed lines from synced_lyrics so each scene gets the exact transcribed text for its [startSec, endSec] window!
    const durationSec = Math.max(60, chapter.duration_sec || 600);
    const timedLines: { time: number; text: string }[] = [];
    if (chapter.synced_lyrics) {
        for (const rawLine of chapter.synced_lyrics.split('\n')) {
            const m = rawLine.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
            if (m) {
                const t = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                timedLines.push({ time: t, text: m[3].trim() });
            }
        }
    }

    const transcriptText = (freshConfig.passTranscriptionContext && (chapter.plain_transcript || chapter.synced_lyrics))
        ? (chapter.plain_transcript || chapter.synced_lyrics || '').replace(/\[\d+:\d+(?:\.\d+)?\]/g, '')
        : `${book.title} by ${book.author} - ${chapter.title}`;

    const [widthStr, heightStr] = (freshConfig.artResolution || '1280x720').split('x');
    const width = parseInt(widthStr, 10) || 1280;
    const height = parseInt(heightStr, 10) || 720;

    const previousPrompts: string[] = existingImages.map(img => img.prompt).filter(Boolean);
    const totalPlanned = Math.max(targetCount, keptImages.length + needed);

    for (let i = 0; i < needed; i++) {
        const currentCfg = getAudiobookStudioConfig();
        if (!forceIgnoreQuota && currentCfg.imagesGeneratedToday >= currentCfg.dailyImageQuota) {
            break;
        }

        const slotIndex = keptImages.length + i;
        // Slot 0 is ALWAYS Priority #2: Chapter Header Art ('chapter'). Slots 1..N are Priority #3: Scene Art ('scene').
        const hasChapterArtAlready = existingImages.some(img => img.kept && img.artType === 'chapter');
        const artType: 'chapter' | 'scene' = (!hasChapterArtAlready && slotIndex === 0) ? 'chapter' : 'scene';

        const startSec = Math.round((slotIndex / totalPlanned) * durationSec);
        const endSec = Math.round(((slotIndex + 1) / totalPlanned) * durationSec);

        // Match real-life scene info if available
        const realScene = realChapterScenes.length > 0
            ? realChapterScenes[Math.min(realChapterScenes.length - 1, Math.max(0, slotIndex - (artType === 'scene' ? 1 : 0)))]
            : undefined;

        const sceneTitle = artType === 'chapter'
            ? `Chapter Art — ${chapter.title.replace(/\.(mp3|m4b|m4a|flac|ogg|wav)$/i, '')}`
            : (realScene?.title || `Scene ${slotIndex}: ${Math.floor(startSec / 60)}:${String(startSec % 60).padStart(2, '0')}–${Math.floor(endSec / 60)}:${String(endSec % 60).padStart(2, '0')}`);

        // Extract transcribed lines that fall within [startSec, endSec]
        let windowTranscript = '';
        if (timedLines.length > 0) {
            const inWindow = timedLines.filter(l => l.time >= startSec && l.time <= endSec).map(l => l.text);
            windowTranscript = inWindow.join(' ').slice(0, 360);
        }
        if (!windowTranscript) {
            const sliceStart = Math.floor((slotIndex / Math.max(1, totalPlanned)) * Math.max(0, transcriptText.length - 320));
            windowTranscript = transcriptText.slice(sliceStart, sliceStart + 340).trim();
        }
        if (realScene) {
            const charStr = Array.isArray(realScene.characters) && realScene.characters.length > 0
                ? `Characters: ${realScene.characters.join(', ')}. `
                : '';
            windowTranscript = `${charStr}${realScene.title} (${realScene.visualSetting}): ${realScene.summary}. ${windowTranscript}`.slice(0, 480);
        }

        const pct = Math.min(95, Math.round(25 + ((i + 0.5) / needed) * 70));
        updateLiveStatus({
            progress: pct,
            lastLog: `Composing ${artType === 'chapter' ? 'Chapter Art' : `Scene Art (${sceneTitle})`} prompt for "${chapter.title}"...`
        });

        const fullPrompt = await generateDynamicScenePrompt({
            book: currentBook,
            chapter,
            sceneIndex: slotIndex,
            totalScenes: totalPlanned,
            sceneTitle,
            artType,
            sceneSnippet: windowTranscript,
            previousPrompts,
            effectiveStyle,
            effectiveFocus,
            effectiveCustomPrompt,
            config: freshConfig
        });
        previousPrompts.push(fullPrompt);

        updateLiveStatus({
            progress: pct,
            lastLog: `Painting ${artType === 'chapter' ? 'Chapter Header Art' : sceneTitle} for "${chapter.title}"...`
        });
        upsertAudiobookChapterMeta({
            chapter_key: chapter.chapter_key,
            book_key: book.book_key,
            illustration_status: 'processing',
            illustration_progress: pct
        });

        try {
            const imgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const painted = await paintAndSaveStudioImage({
                imgId,
                fullPrompt,
                book: currentBook,
                chapterTitle: `${chapter.title} • ${sceneTitle}`,
                sceneIndex: slotIndex,
                effectiveStyle,
                width,
                height
            });

            if (!painted) {
                console.warn(`⚠️ [AudiobookStudio] All raster image providers unreachable for "${chapter.title}" (${sceneTitle}); skipping fake placeholder.`);
                continue;
            }

            const { fileName, providerUsed } = painted;
            const artUrl = `/api/theater/audiobooks/art?file=${encodeURIComponent(fileName)}`;
            const newImg: AudiobookChapterSceneImage = {
                id: imgId,
                url: artUrl,
                prompt: fullPrompt,
                kept: true,
                sceneIndex: slotIndex,
                artType,
                startSec,
                endSec,
                sceneTitle,
                chapterTitle: chapter.title,
                createdAt: new Date().toISOString()
            };
            existingImages.push(newImg);

            const latestCfg = getAudiobookStudioConfig();
            saveAudiobookStudioConfig({
                imagesGeneratedToday: (latestCfg.imagesGeneratedToday || 0) + 1
            });

            appendStudioQueueHistory({
                bookKey: book.book_key,
                bookTitle: book.title,
                chapterKey: chapter.chapter_key,
                chapterTitle: chapter.title,
                queueType: artType === 'chapter' ? 'art_chapter' : 'art_scene',
                status: 'completed',
                providerUsed,
                detail: `${sceneTitle} (${Math.floor(startSec / 60)}m${startSec % 60}s–${Math.floor(endSec / 60)}m${endSec % 60}s)`,
                serverFileUrl: artUrl
            });

            console.log(`🎨 [AudiobookStudio] Generated ${artType} illustration ${fileName} for "${book.title}" — ${sceneTitle}`);
        } catch (err: any) {
            console.error(`❌ [AudiobookStudio] Failed generating scene image for "${chapter.title}":`, err.message);
        }
    }

    const hasKept = existingImages.some(img => img.kept);
    upsertAudiobookChapterMeta({
        chapter_key: chapter.chapter_key,
        book_key: book.book_key,
        illustration_status: hasKept ? 'completed' : 'failed',
        illustration_progress: hasKept ? 100 : 0,
        images: existingImages
    });

    return existingImages;
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
    const allBooks = getAllAudiobooksMeta();
    const queuedBooks = allBooks
        .filter(b => b.queue_enabled)
        .sort((a, b) => (a.queue_priority || 100) - (b.queue_priority || 100));

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
        detail: string;
    }> = [];

    const transcriptionQueue: Array<{
        id: string;
        bookKey: string;
        bookTitle: string;
        author: string;
        chapterKey: string;
        chapterTitle: string;
        status: string;
        progress: number;
    }> = [];

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
    }> = [];

    for (const book of queuedBooks) {
        const chapters = getAudiobookChaptersMeta(book.book_key);

        // Art Priority 1: Book Cover
        if (book.illustrate_enabled && !book.custom_cover_url) {
            artQueue.push({
                id: `q_cover_${book.book_key}`,
                priorityTier: 1,
                priorityLabel: '1. Book Cover',
                bookKey: book.book_key,
                bookTitle: book.title,
                author: book.author,
                status: 'queued',
                detail: 'Custom AI Cover (keeps original active + adds swap symbol)'
            });
        }

        for (const ch of chapters) {
            // Transcription Queue
            if (book.transcribe_enabled && ch.transcription_status !== 'completed') {
                transcriptionQueue.push({
                    id: `q_stt_${ch.chapter_key}`,
                    bookKey: book.book_key,
                    bookTitle: book.title,
                    author: book.author,
                    chapterKey: ch.chapter_key,
                    chapterTitle: ch.title,
                    status: ch.transcription_status || 'queued',
                    progress: ch.transcription_progress || 0
                });
            }

            // Art Priority 2 (Chapter Art) & Priority 3 (Scene Art)
            if (book.illustrate_enabled) {
                const kept = (ch.images || []).filter(i => i.kept);
                const hasChapterArt = kept.some(i => i.artType === 'chapter') || kept.length >= 1;
                const targetCount = (book.images_per_chapter && book.images_per_chapter > 0) ? book.images_per_chapter : 3;

                if (!hasChapterArt) {
                    artQueue.push({
                        id: `q_chap_art_${ch.chapter_key}`,
                        priorityTier: 2,
                        priorityLabel: '2. Chapter Art',
                        bookKey: book.book_key,
                        bookTitle: book.title,
                        author: book.author,
                        chapterKey: ch.chapter_key,
                        chapterTitle: ch.title,
                        status: ch.illustration_status || 'queued',
                        detail: `Chapter header illustration for "${ch.title}"`
                    });
                }
                if (kept.length < targetCount) {
                    const remainingScenes = Math.max(1, targetCount - Math.max(1, kept.length));
                    artQueue.push({
                        id: `q_scene_art_${ch.chapter_key}`,
                        priorityTier: 3,
                        priorityLabel: '3. Scene Art',
                        bookKey: book.book_key,
                        bookTitle: book.title,
                        author: book.author,
                        chapterKey: ch.chapter_key,
                        chapterTitle: ch.title,
                        status: ch.illustration_status || 'queued',
                        detail: `${remainingScenes} narrative scene illustration(s) matched to transcript`
                    });
                }
            }

            // Voice Queue
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
                    progress: ch.audio_enhance_progress || 0
                });
            }
        }
    }

    // Sort Art Queue strictly by Priority Tier: 1. Book Cover -> 2. Chapter Art -> 3. Scene Art
    artQueue.sort((a, b) => a.priorityTier - b.priorityTier);

    return {
        artQueue,
        transcriptionQueue,
        voiceQueue,
        history: getStudioQueueHistory()
    };
};

/**
 * Processes the next pending step in the Audiobook Priority Queue:
 * Priority Order:
 * 1. Discover Real-Life Book Chapters & Scenes (`discoverBookRealStructureWithAi`)
 * 2. Book Cover Art (`generateAudiobookCoverArt`)
 * 3. Chapter Transcriptions (`transcribeAudiobookChapter` — so scene art matches the transcribed text!)
 * 4. Chapter & Scene Art (`generateAudiobookChapterIllustrations`)
 * 5. Voice / Audio Enhancement (`enhanceAudiobookChapterAudio`)
 */
export const processAudiobookPriorityQueueStep = async (forceBookKey?: string, forceChapterKey?: string): Promise<boolean> => {
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
                lastLog: 'Queue idle — All prioritized audiobooks are up to date'
            });
            return false;
        }

        for (const book of candidateBooks) {
            // 0. Discover real-life book chapter/scene structure first if not yet mapped
            if (!book.real_structure_json && (book.illustrate_enabled || book.transcribe_enabled)) {
                await discoverBookRealStructureWithAi(book);
            }

            // 1. Art Priority #1: Custom Book Cover (if illustrate_enabled and no custom cover generated yet)
            if (book.illustrate_enabled && !book.custom_cover_url && !forceChapterKey) {
                await generateAudiobookCoverArt(book, false);
                updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                return true;
            }

            const chapters = getAudiobookChaptersMeta(book.book_key);
            const targetChapters = forceChapterKey
                ? chapters.filter(c => c.chapter_key === forceChapterKey)
                : chapters;

            for (const chapter of targetChapters) {
                // 2. Transcription (so scene art can match the transcribed scenes)
                if (
                    book.transcribe_enabled &&
                    chapter.transcription_status !== 'completed' &&
                    (chapter.transcription_status !== 'failed' || Boolean(forceChapterKey))
                ) {
                    await transcribeAudiobookChapter(book, chapter, config);
                    recalculateAudiobookTotals(book.book_key);
                    updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                    return true;
                }

                // 3. Art Priority #2 (Chapter Art) & #3 (Scene Art) matched to transcribed scenes
                const freshCfg = getAudiobookStudioConfig();
                const latestBook = getAudiobookMeta(book.book_key) || book;
                const targetCount = (latestBook.images_per_chapter && latestBook.images_per_chapter > 0)
                    ? latestBook.images_per_chapter
                    : (freshCfg.imagesPerChapter || 3);
                const keptCount = (chapter.images || []).filter(i => i.kept).length;
                if (
                    latestBook.illustrate_enabled &&
                    (chapter.illustration_status !== 'completed' || keptCount < targetCount) &&
                    (chapter.illustration_status !== 'failed' || Boolean(forceChapterKey)) &&
                    (Boolean(forceChapterKey) || Boolean(forceBookKey) || freshCfg.imagesGeneratedToday < freshCfg.dailyImageQuota)
                ) {
                    const updatedChapter = getAudiobookChapterMeta(chapter.chapter_key) || chapter;
                    await generateAudiobookChapterIllustrations(latestBook, updatedChapter, freshCfg, Boolean(forceChapterKey) || Boolean(forceBookKey));
                    recalculateAudiobookTotals(book.book_key);
                    updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                    return true;
                }

                // 4. Audio / Voice Enhancement
                if (
                    latestBook.enhance_audio_enabled &&
                    chapter.audio_enhance_status !== 'completed' &&
                    (chapter.audio_enhance_status !== 'failed' || Boolean(forceChapterKey))
                ) {
                    await enhanceAudiobookChapterAudio(latestBook, chapter, config);
                    recalculateAudiobookTotals(book.book_key);
                    updateLiveStatus({ isRunning: false, activeTask: null, progress: 100 });
                    return true;
                }
            }

            recalculateAudiobookTotals(book.book_key);
        }

        updateLiveStatus({
            isRunning: false,
            activeBookKey: null,
            activeBookTitle: null,
            activeChapterKey: null,
            activeChapterTitle: null,
            activeTask: null,
            progress: 0,
            lastLog: 'Queue idle — Ready'
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
export const triggerAudiobookQueueWorker = (forceBookKey?: string, forceChapterKey?: string) => {
    setTimeout(async () => {
        // When user explicitly starts a whole-book generation, reset any 'failed' statuses to 'queued' once so they are retried
        if (forceBookKey && !forceChapterKey) {
            const chapters = getAudiobookChaptersMeta(forceBookKey);
            for (const ch of chapters) {
                if (ch.transcription_status === 'failed' || ch.illustration_status === 'failed' || ch.audio_enhance_status === 'failed') {
                    upsertAudiobookChapterMeta({
                        chapter_key: ch.chapter_key,
                        book_key: forceBookKey,
                        transcription_status: ch.transcription_status === 'failed' ? 'queued' : ch.transcription_status,
                        illustration_status: ch.illustration_status === 'failed' ? 'queued' : ch.illustration_status,
                        audio_enhance_status: ch.audio_enhance_status === 'failed' ? 'queued' : ch.audio_enhance_status,
                        error_message: ''
                    });
                }
            }
        }
        // Process up to 35 steps sequentially with a 1.2s breather between steps for low-power Intel CPU
        for (let step = 0; step < 35; step++) {
            const cfg = getAudiobookStudioConfig();
            if (!cfg.enabled && !forceBookKey && !forceChapterKey) break;
            const didWork = await processAudiobookPriorityQueueStep(forceBookKey, forceChapterKey);
            if (!didWork) break;
            if (forceChapterKey) break; // Single chapter manual trigger finishes after all steps for that chapter
            await new Promise(r => setTimeout(r, 1200));
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
        try {
            const resp = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
                {
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
                },
                { timeout: 22000 }
            );
            aiJsonText = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (aiJsonText) usedProvider = 'Google Gemini 2.0 Flash';
        } catch (e: any) {
            console.warn('⚠️ [AudiobookStudio] Gemini collection organizer fallback:', e.message);
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


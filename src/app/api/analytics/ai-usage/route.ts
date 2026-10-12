import { NextResponse } from 'next/server';
import { getSetting, setSetting, getAiApiUsageTimeSeries } from '@/lib/db';
import {
    getAudiobookStudioConfig,
    saveAudiobookStudioConfig,
    getAudiobookStudioStatus,
    isAiGloballyPaused,
    setAiGloballyPaused,
    cleanGeneratedAudiobookData
} from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export interface ProviderTierPreset {
    id: string;
    label: string;
    rpmLimit: number;
    tpmLimit: number;
    rpdLimit: number;
    dailyImagesLimit: number;
    dailyAudioHoursLimit: number;
}

export const PROVIDER_TIER_PRESETS: Record<string, ProviderTierPreset[]> = {
    gemini: [
        { id: 'free_flash_lite', label: 'Gemini Flash-Lite — Free Tier (15 RPM / 250K TPM / 500 RPD)', rpmLimit: 15, tpmLimit: 250000, rpdLimit: 500, dailyImagesLimit: 500, dailyAudioHoursLimit: 12 },
        { id: 'free', label: 'Gemini Flash — Free Tier (15 RPM / 1M TPM / 1,500 RPD)', rpmLimit: 15, tpmLimit: 1000000, rpdLimit: 1500, dailyImagesLimit: 500, dailyAudioHoursLimit: 18 },
        { id: 'tier1_paid', label: 'Gemini Pay-As-You-Go — Tier 1 (1,000 RPM / 4M TPM / 10K RPD)', rpmLimit: 1000, tpmLimit: 4000000, rpdLimit: 10000, dailyImagesLimit: 2500, dailyAudioHoursLimit: 120 },
        { id: 'tier2_pro', label: 'Gemini Enterprise / Tier 2 (2,000 RPM / 10M TPM / 50K RPD)', rpmLimit: 2000, tpmLimit: 10000000, rpdLimit: 50000, dailyImagesLimit: 10000, dailyAudioHoursLimit: 500 }
    ],
    pollinations: [
        { id: 'free', label: 'Pollinations Flux — Community Free', rpmLimit: 30, tpmLimit: 500000, rpdLimit: 3000, dailyImagesLimit: 3000, dailyAudioHoursLimit: 0 },
        { id: 'tier1_paid', label: 'Pollinations Flux — Priority / Seed', rpmLimit: 120, tpmLimit: 2000000, rpdLimit: 15000, dailyImagesLimit: 15000, dailyAudioHoursLimit: 0 }
    ],
    whisper_local: [
        { id: 'local_cpu', label: 'Local Whisper C++ (CPU / Offline)', rpmLimit: 999, tpmLimit: 9999999, rpdLimit: 99999, dailyImagesLimit: 0, dailyAudioHoursLimit: 48 }
    ],
    openai: [
        { id: 'free', label: 'Groq / OpenAI — Free / Starter Tier (30 RPM / 100K TPM / 14.4K RPD)', rpmLimit: 30, tpmLimit: 100000, rpdLimit: 2000, dailyImagesLimit: 200, dailyAudioHoursLimit: 24 },
        { id: 'tier1_paid', label: 'Groq / OpenAI — Usage Tier 2+', rpmLimit: 500, tpmLimit: 2000000, rpdLimit: 20000, dailyImagesLimit: 2000, dailyAudioHoursLimit: 240 }
    ],
    openlibrary: [
        { id: 'public', label: 'OpenLibrary & Google Books Public API', rpmLimit: 100, tpmLimit: 1000000, rpdLimit: 10000, dailyImagesLimit: 5000, dailyAudioHoursLimit: 0 }
    ]
};

interface SavedProviderQuotaConfig {
    tierId: string;
    autoSetLimits: boolean;
    rpmLimit: number;
    tpmLimit: number;
    rpdLimit: number;
    dailyImagesLimit: number;
    dailyAudioHoursLimit: number;
    detectedModel?: string | null;
    lastPingAt?: string | null;
    lastPingLatencyMs?: number | null;
    lastPingStatus?: 'healthy' | 'rate_limited' | 'unconfigured' | 'error';
    detectedRemoteRemaining?: number | null;
    detectedRemoteLimit?: number | null;
    detectedRemoteTokensRemaining?: number | null;
    detectedRemoteTokensLimit?: number | null;
}

const DEFAULT_QUOTA_CONFIG: Record<string, SavedProviderQuotaConfig> = {
    gemini: {
        tierId: 'free_flash_lite',
        autoSetLimits: true,
        rpmLimit: 15,
        tpmLimit: 250000,
        rpdLimit: 500,
        dailyImagesLimit: 500,
        dailyAudioHoursLimit: 12,
        detectedModel: 'Gemini Flash Lite'
    },
    pollinations: {
        tierId: 'free',
        autoSetLimits: true,
        rpmLimit: 30,
        tpmLimit: 500000,
        rpdLimit: 3000,
        dailyImagesLimit: 3000,
        dailyAudioHoursLimit: 0,
        detectedModel: 'Flux Raster'
    },
    whisper_local: {
        tierId: 'local_cpu',
        autoSetLimits: true,
        rpmLimit: 999,
        tpmLimit: 9999999,
        rpdLimit: 99999,
        dailyImagesLimit: 0,
        dailyAudioHoursLimit: 48,
        detectedModel: 'Whisper.cpp Local'
    },
    openai: {
        tierId: 'free',
        autoSetLimits: true,
        rpmLimit: 30,
        tpmLimit: 100000,
        rpdLimit: 2000,
        dailyImagesLimit: 200,
        dailyAudioHoursLimit: 24,
        detectedModel: 'Whisper / Llama'
    },
    openlibrary: {
        tierId: 'public',
        autoSetLimits: true,
        rpmLimit: 100,
        tpmLimit: 1000000,
        rpdLimit: 10000,
        dailyImagesLimit: 5000,
        dailyAudioHoursLimit: 0,
        detectedModel: 'Public Catalog'
    }
};

function loadQuotaConfigs(): Record<string, SavedProviderQuotaConfig> {
    const raw = getSetting('ai_api_quotas_config');
    if (!raw) return { ...DEFAULT_QUOTA_CONFIG };
    try {
        const parsed = JSON.parse(raw);
        const merged: Record<string, SavedProviderQuotaConfig> = {};
        for (const key of Object.keys(DEFAULT_QUOTA_CONFIG)) {
            const p = parsed[key] || {};
            merged[key] = {
                ...DEFAULT_QUOTA_CONFIG[key],
                ...p,
                tpmLimit: p.tpmLimit || DEFAULT_QUOTA_CONFIG[key].tpmLimit
            };
        }
        return merged;
    } catch {
        return { ...DEFAULT_QUOTA_CONFIG };
    }
}

function saveQuotaConfigs(cfg: Record<string, SavedProviderQuotaConfig>) {
    setSetting('ai_api_quotas_config', JSON.stringify(cfg));
}

async function pingProvidersLive(
    quotaConfigs: Record<string, SavedProviderQuotaConfig>,
    deepAutoDetect: boolean = false
): Promise<Record<string, SavedProviderQuotaConfig>> {
    const studioCfg = getAudiobookStudioConfig();
    const pool = studioCfg.apiKeys || [];
    const geminiKey = (
        studioCfg.geminiApiKey ||
        pool.find(k => k.provider === 'gemini' && k.enabled)?.key ||
        process.env.GEMINI_API_KEY ||
        ''
    ).trim();
    const groqKey = (
        studioCfg.groqApiKey ||
        pool.find(k => k.provider === 'groq' && k.enabled)?.key ||
        ''
    ).trim();
    const openaiKey = (
        studioCfg.openaiApiKey ||
        pool.find(k => k.provider === 'openai' && k.enabled)?.key ||
        process.env.OPENAI_API_KEY ||
        ''
    ).trim();
    const nowIso = new Date().toISOString();

    // 1. Ping & Auto-Detect Google Gemini API Limits
    if (geminiKey) {
        const t0 = Date.now();
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`,
                { signal: AbortSignal.timeout(6000) }
            );
            const latency = Date.now() - t0;
            const remHeader = res.headers.get('x-ratelimit-remaining-requests') || res.headers.get('x-ratelimit-remaining');
            const limHeader = res.headers.get('x-ratelimit-limit-requests') || res.headers.get('x-ratelimit-limit');
            const tokLimHeader = res.headers.get('x-ratelimit-limit-tokens');

            quotaConfigs.gemini.lastPingAt = nowIso;
            quotaConfigs.gemini.lastPingLatencyMs = latency;
            quotaConfigs.gemini.lastPingStatus = res.status === 429 ? 'rate_limited' : res.ok ? 'healthy' : 'error';

            if (res.ok) {
                const modelsJson: any = await res.json().catch(() => ({}));
                const modelNames: string[] = (modelsJson?.models || []).map((m: any) => String(m.name || ''));
                const hasFlashLite = modelNames.some(n => /flash-lite/i.test(n));
                if (hasFlashLite) {
                    quotaConfigs.gemini.detectedModel = 'Gemini Flash Lite';
                }

                // If deepAutoDetect is requested, run a lightweight 1-token probe on flash-lite to inspect headers or 429 QuotaFailure payload
                if (deepAutoDetect) {
                    try {
                        const targetModel = modelNames.find(n => /gemini-2\.5-flash-lite|gemini-2\.0-flash-lite/i.test(n)) || 'models/gemini-2.0-flash-lite';
                        const probeRes = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${encodeURIComponent(geminiKey)}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: 'ok' }] }],
                                    generationConfig: { maxOutputTokens: 1 }
                                }),
                                signal: AbortSignal.timeout(6000)
                            }
                        );
                        if (probeRes.status === 429) {
                            quotaConfigs.gemini.lastPingStatus = 'rate_limited';
                            const errData: any = await probeRes.json().catch(() => ({}));
                            const errStr = JSON.stringify(errData);
                            if (/FreeTier|free_tier/i.test(errStr) && quotaConfigs.gemini.autoSetLimits) {
                                quotaConfigs.gemini.tierId = 'free_flash_lite';
                                quotaConfigs.gemini.rpmLimit = 15;
                                quotaConfigs.gemini.tpmLimit = 250000;
                                quotaConfigs.gemini.rpdLimit = 500;
                                quotaConfigs.gemini.detectedRemoteLimit = 500;
                                quotaConfigs.gemini.detectedRemoteTokensLimit = 250000;
                            }
                        } else if (probeRes.ok && quotaConfigs.gemini.autoSetLimits) {
                            // Standard AI Studio Free Tier for Flash-Lite is 15 RPM / 250K TPM / 500 RPD
                            if (quotaConfigs.gemini.tierId === 'free_flash_lite' || !limHeader) {
                                quotaConfigs.gemini.rpmLimit = 15;
                                quotaConfigs.gemini.tpmLimit = 250000;
                                quotaConfigs.gemini.rpdLimit = 500;
                                quotaConfigs.gemini.detectedRemoteLimit = 500;
                                quotaConfigs.gemini.detectedRemoteTokensLimit = 250000;
                            }
                        }
                    } catch {}
                }
            }

            if (remHeader) quotaConfigs.gemini.detectedRemoteRemaining = Number(remHeader);
            if (tokLimHeader) quotaConfigs.gemini.detectedRemoteTokensLimit = Number(tokLimHeader);
            if (limHeader) {
                const detectedLim = Number(limHeader);
                quotaConfigs.gemini.detectedRemoteLimit = detectedLim;
                if (quotaConfigs.gemini.autoSetLimits && detectedLim > 0) {
                    if (detectedLim >= 2000) {
                        quotaConfigs.gemini.tierId = 'tier1_paid';
                        quotaConfigs.gemini.rpmLimit = 1000;
                        quotaConfigs.gemini.tpmLimit = 4000000;
                        quotaConfigs.gemini.rpdLimit = 10000;
                        quotaConfigs.gemini.dailyImagesLimit = 2500;
                        quotaConfigs.gemini.dailyAudioHoursLimit = 120;
                    } else if (detectedLim <= 600) {
                        quotaConfigs.gemini.tierId = 'free_flash_lite';
                        quotaConfigs.gemini.rpmLimit = 15;
                        quotaConfigs.gemini.tpmLimit = 250000;
                        quotaConfigs.gemini.rpdLimit = 500;
                        quotaConfigs.gemini.dailyImagesLimit = 500;
                        quotaConfigs.gemini.dailyAudioHoursLimit = 12;
                    } else {
                        quotaConfigs.gemini.tierId = 'free';
                        quotaConfigs.gemini.rpmLimit = 15;
                        quotaConfigs.gemini.tpmLimit = 1000000;
                        quotaConfigs.gemini.rpdLimit = 1500;
                        quotaConfigs.gemini.dailyImagesLimit = 500;
                        quotaConfigs.gemini.dailyAudioHoursLimit = 18;
                    }
                }
            }

            if (quotaConfigs.gemini.autoSetLimits) {
                saveAudiobookStudioConfig({ maxRequestsPerMinute: Math.min(120, quotaConfigs.gemini.rpmLimit || 15) });
            }
        } catch {
            quotaConfigs.gemini.lastPingAt = nowIso;
            quotaConfigs.gemini.lastPingStatus = 'error';
        }
    } else {
        quotaConfigs.gemini.lastPingAt = nowIso;
        quotaConfigs.gemini.lastPingStatus = 'unconfigured';
    }

    // 2. Ping Pollinations Flux API
    {
        const t0 = Date.now();
        try {
            const res = await fetch('https://image.pollinations.ai/models', { signal: AbortSignal.timeout(6000) });
            quotaConfigs.pollinations.lastPingAt = nowIso;
            quotaConfigs.pollinations.lastPingLatencyMs = Date.now() - t0;
            quotaConfigs.pollinations.lastPingStatus = res.status === 429 ? 'rate_limited' : res.ok ? 'healthy' : 'error';
        } catch {
            quotaConfigs.pollinations.lastPingAt = nowIso;
            quotaConfigs.pollinations.lastPingStatus = 'error';
        }
    }

    // 3. Ping & Auto-Detect OpenAI / Groq API Limits (reads live x-ratelimit-limit-* headers)
    const activeCloudKey = groqKey || openaiKey;
    if (activeCloudKey) {
        const isGroq = activeCloudKey.startsWith('gsk_');
        const t0 = Date.now();
        try {
            const modelsUrl = isGroq ? 'https://api.groq.com/openai/v1/models' : 'https://api.openai.com/v1/models';
            const res = await fetch(modelsUrl, {
                headers: { Authorization: `Bearer ${activeCloudKey}` },
                signal: AbortSignal.timeout(6000)
            });
            quotaConfigs.openai.lastPingAt = nowIso;
            quotaConfigs.openai.lastPingLatencyMs = Date.now() - t0;
            quotaConfigs.openai.lastPingStatus = res.status === 429 ? 'rate_limited' : res.ok ? 'healthy' : 'error';
            quotaConfigs.openai.detectedModel = isGroq ? 'Groq Whisper / Llama 3.3' : 'OpenAI Whisper / GPT-4o';

            let remReq = res.headers.get('x-ratelimit-remaining-requests');
            let limReq = res.headers.get('x-ratelimit-limit-requests');
            let remTok = res.headers.get('x-ratelimit-remaining-tokens');
            let limTok = res.headers.get('x-ratelimit-limit-tokens');

            // Groq & OpenAI return exact rate-limit headers on chat completion calls
            if (deepAutoDetect && res.ok) {
                try {
                    const chatUrl = isGroq
                        ? 'https://api.groq.com/openai/v1/chat/completions'
                        : 'https://api.openai.com/v1/chat/completions';
                    const chatModel = isGroq ? 'llama-3.1-8b-instant' : 'gpt-4o-mini';
                    const chatRes = await fetch(chatUrl, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${activeCloudKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: chatModel,
                            messages: [{ role: 'user', content: 'ok' }],
                            max_tokens: 1
                        }),
                        signal: AbortSignal.timeout(6000)
                    });
                    remReq = chatRes.headers.get('x-ratelimit-remaining-requests') || remReq;
                    limReq = chatRes.headers.get('x-ratelimit-limit-requests') || limReq;
                    remTok = chatRes.headers.get('x-ratelimit-remaining-tokens') || remTok;
                    limTok = chatRes.headers.get('x-ratelimit-limit-tokens') || limTok;
                } catch {}
            }

            if (remReq) quotaConfigs.openai.detectedRemoteRemaining = Number(remReq);
            if (limReq) {
                const parsedRpd = Number(limReq);
                quotaConfigs.openai.detectedRemoteLimit = parsedRpd;
                if (quotaConfigs.openai.autoSetLimits && parsedRpd > 0) {
                    quotaConfigs.openai.rpdLimit = parsedRpd;
                    quotaConfigs.openai.rpmLimit = parsedRpd >= 10000 ? 30 : 20;
                }
            }
            if (remTok) quotaConfigs.openai.detectedRemoteTokensRemaining = Number(remTok);
            if (limTok) {
                const parsedTpm = Number(limTok);
                quotaConfigs.openai.detectedRemoteTokensLimit = parsedTpm;
                if (quotaConfigs.openai.autoSetLimits && parsedTpm > 0) {
                    quotaConfigs.openai.tpmLimit = parsedTpm;
                }
            }
        } catch {
            quotaConfigs.openai.lastPingAt = nowIso;
            quotaConfigs.openai.lastPingStatus = 'error';
        }
    } else {
        quotaConfigs.openai.lastPingAt = nowIso;
        quotaConfigs.openai.lastPingStatus = 'unconfigured';
    }

    // 4. Local Whisper C++ Engine
    quotaConfigs.whisper_local.lastPingAt = nowIso;
    quotaConfigs.whisper_local.lastPingLatencyMs = 1;
    quotaConfigs.whisper_local.lastPingStatus = 'healthy';

    // 5. OpenLibrary / Google Books Metadata
    {
        const t0 = Date.now();
        try {
            const res = await fetch('https://openlibrary.org/books/OL7353617M.json', { signal: AbortSignal.timeout(6000) });
            quotaConfigs.openlibrary.lastPingAt = nowIso;
            quotaConfigs.openlibrary.lastPingLatencyMs = Date.now() - t0;
            quotaConfigs.openlibrary.lastPingStatus = res.ok ? 'healthy' : 'error';
        } catch {
            quotaConfigs.openlibrary.lastPingAt = nowIso;
            quotaConfigs.openlibrary.lastPingStatus = 'error';
        }
    }

    saveQuotaConfigs(quotaConfigs);
    return quotaConfigs;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const range = (searchParams.get('range') || '24h') as '24h' | '7d' | '30d' | 'all';
        const providerFilter = searchParams.get('provider') || 'all';
        const forcePing = searchParams.get('ping') === 'true';

        let quotaConfigs = loadQuotaConfigs();

        // Periodically ping providers if forcePing or last ping > 3 minutes ago
        const lastPingMs = quotaConfigs.gemini?.lastPingAt ? new Date(quotaConfigs.gemini.lastPingAt).getTime() : 0;
        if (forcePing || Date.now() - lastPingMs > 180_000) {
            quotaConfigs = await pingProvidersLive(quotaConfigs, forcePing);
        }

        const timeSeries = getAiApiUsageTimeSeries(range, providerFilter);
        const daySeries = getAiApiUsageTimeSeries('24h');
        const liveStudio: any = getAudiobookStudioStatus();
        const aiPaused = isAiGloballyPaused();

        // Combine live runtime metrics with SQLite historical usage per provider
        const PROVIDER_META = [
            {
                id: 'gemini',
                name: 'Google Gemini (Flash Lite — STT, Scening LLM & Imagen)',
                category: 'Multimodal STT + LLM + Art'
            },
            {
                id: 'pollinations',
                name: 'Pollinations Flux (Scene & Cover Illustration)',
                category: 'Raster Artwork Generation'
            },
            {
                id: 'whisper_local',
                name: 'Whisper C++ Local Engine (Offline Synced STT)',
                category: 'Local Audio Transcription'
            },
            {
                id: 'openai',
                name: 'Groq / OpenAI Whisper & LLM',
                category: 'Cloud Audio & LLM API'
            },
            {
                id: 'openlibrary',
                name: 'OpenLibrary & Google Books Catalog',
                category: 'Book Metadata & Covers'
            }
        ];

        const providersReport = PROVIDER_META.map(pm => {
            const qCfg = quotaConfigs[pm.id] || DEFAULT_QUOTA_CONFIG[pm.id];
            const rangeRow = timeSeries.byProvider.find((r: any) => r.provider === pm.id || (pm.id === 'openai' && r.provider === 'groq')) || {
                requests: 0,
                images_generated: 0,
                audio_seconds: 0,
                tokens_used: 0,
                errors: 0,
                rate_limited: 0,
                peak_rpm: 0,
                peak_tpm: 0
            };
            const dayRow = daySeries.byProvider.find((r: any) => r.provider === pm.id || (pm.id === 'openai' && r.provider === 'groq')) || {
                requests: 0,
                images_generated: 0,
                audio_seconds: 0,
                tokens_used: 0,
                errors: 0,
                rate_limited: 0,
                peak_rpm: 0,
                peak_tpm: 0
            };

            const liveMem = (liveStudio?.apiUsage || []).find((a: any) => a.provider === pm.id);
            const requestsToday = Math.max(Number(dayRow.requests || 0), Number(liveMem?.requestsToday || 0));
            const imagesToday = Number(dayRow.images_generated || 0);
            const audioHoursToday = Number((Number(dayRow.audio_seconds || 0) / 3600).toFixed(2));
            const rpdLimit = Math.max(1, Number(qCfg.rpdLimit || 500));
            const pushPercent = Math.min(100, Math.round((requestsToday / rpdLimit) * 100));

            return {
                id: pm.id,
                name: pm.name,
                category: pm.category,
                detectedModel: qCfg.detectedModel || pm.name,
                tierId: qCfg.tierId,
                availableTiers: PROVIDER_TIER_PRESETS[pm.id] || [],
                autoSetLimits: qCfg.autoSetLimits,
                rpmLimit: qCfg.rpmLimit,
                tpmLimit: qCfg.tpmLimit || 250000,
                rpdLimit: qCfg.rpdLimit,
                dailyImagesLimit: qCfg.dailyImagesLimit,
                dailyAudioHoursLimit: qCfg.dailyAudioHoursLimit,
                lastPingAt: qCfg.lastPingAt || null,
                lastPingLatencyMs: qCfg.lastPingLatencyMs ?? null,
                status: liveMem?.status === 'rate_limited' ? 'rate_limited' : (qCfg.lastPingStatus || 'healthy'),
                detectedRemoteRemaining: qCfg.detectedRemoteRemaining ?? null,
                detectedRemoteLimit: qCfg.detectedRemoteLimit ?? null,
                detectedRemoteTokensRemaining: qCfg.detectedRemoteTokensRemaining ?? null,
                detectedRemoteTokensLimit: qCfg.detectedRemoteTokensLimit ?? null,
                requestsToday,
                imagesToday,
                audioHoursToday,
                pushPercent,
                peakRpm: Number(rangeRow.peak_rpm || 0),
                peakTpm: Number(rangeRow.peak_tpm || 0),
                rangeStats: {
                    requests: Math.max(Number(rangeRow.requests || 0), Number(liveMem?.requestsTotal || 0)),
                    imagesGenerated: Number(rangeRow.images_generated || 0),
                    audioHours: Number((Number(rangeRow.audio_seconds || 0) / 3600).toFixed(2)),
                    tokensUsed: Math.max(Number(rangeRow.tokens_used || 0), Number(liveMem?.estimatedTokens || 0)),
                    errors: Math.max(Number(rangeRow.errors || 0), Number(liveMem?.errorsCount || 0)),
                    rateLimited: Number(rangeRow.rate_limited || 0)
                }
            };
        });

        return NextResponse.json({
            range,
            providerFilter,
            aiPaused,
            providers: providersReport,
            buckets: timeSeries.buckets,
            totals: timeSeries.totals,
            recentEvents: timeSeries.recentEvents
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to load AI API usage analytics' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;
        let quotaConfigs = loadQuotaConfigs();

        if (action === 'ping_providers' || action === 'auto_detect_limits') {
            quotaConfigs = await pingProvidersLive(quotaConfigs, true);
            return NextResponse.json({ success: true, quotaConfigs });
        }

        if (action === 'set_ai_paused') {
            const nextPaused = typeof body.paused === 'boolean' ? body.paused : !isAiGloballyPaused();
            setAiGloballyPaused(nextPaused);
            return NextResponse.json({ success: true, aiPaused: nextPaused });
        }

        if (action === 'clean_generated_data') {
            const target = (body.target || 'all') as 'images' | 'scenes' | 'transcripts' | 'voices' | 'api_history' | 'all';
            const bookKey = body.bookKey ? String(body.bookKey) : undefined;
            const pauseAiFirst = Boolean(body.pauseAiFirst);
            const res = cleanGeneratedAudiobookData({ target, bookKey, pauseAiFirst });
            return NextResponse.json({ success: true, ...res });
        }

        if (action === 'update_provider_limits') {
            const providerId = String(body.providerId || '');
            if (!quotaConfigs[providerId]) {
                return NextResponse.json({ error: 'Unknown providerId' }, { status: 400 });
            }

            const current = quotaConfigs[providerId];
            const nextTierId = body.tierId ?? current.tierId;
            const nextAutoSet = body.autoSetLimits !== undefined ? Boolean(body.autoSetLimits) : current.autoSetLimits;

            const preset = (PROVIDER_TIER_PRESETS[providerId] || []).find(t => t.id === nextTierId);

            if (nextAutoSet && preset) {
                quotaConfigs[providerId] = {
                    ...current,
                    tierId: preset.id,
                    autoSetLimits: true,
                    rpmLimit: preset.rpmLimit,
                    tpmLimit: preset.tpmLimit,
                    rpdLimit: preset.rpdLimit,
                    dailyImagesLimit: preset.dailyImagesLimit,
                    dailyAudioHoursLimit: preset.dailyAudioHoursLimit
                };
            } else {
                quotaConfigs[providerId] = {
                    ...current,
                    tierId: nextTierId,
                    autoSetLimits: nextAutoSet,
                    rpmLimit: body.rpmLimit !== undefined ? Math.max(1, Number(body.rpmLimit)) : current.rpmLimit,
                    tpmLimit: body.tpmLimit !== undefined ? Math.max(100, Number(body.tpmLimit)) : (current.tpmLimit || 250000),
                    rpdLimit: body.rpdLimit !== undefined ? Math.max(1, Number(body.rpdLimit)) : current.rpdLimit,
                    dailyImagesLimit: body.dailyImagesLimit !== undefined ? Math.max(0, Number(body.dailyImagesLimit)) : current.dailyImagesLimit,
                    dailyAudioHoursLimit: body.dailyAudioHoursLimit !== undefined ? Math.max(0, Number(body.dailyAudioHoursLimit)) : current.dailyAudioHoursLimit
                };
            }

            if (providerId === 'gemini') {
                saveAudiobookStudioConfig({ maxRequestsPerMinute: Math.min(120, quotaConfigs.gemini.rpmLimit || 15) });
            }

            saveQuotaConfigs(quotaConfigs);
            return NextResponse.json({ success: true, quotaConfigs });
        }

        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to update AI API usage config' }, { status: 500 });
    }
}

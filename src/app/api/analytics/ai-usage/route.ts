import { NextResponse } from 'next/server';
import { getSetting, setSetting, getAiApiUsageTimeSeries } from '@/lib/db';
import { getAudiobookStudioConfig, getAudiobookStudioStatus } from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export interface ProviderTierPreset {
    id: string;
    label: string;
    rpmLimit: number;
    rpdLimit: number;
    dailyImagesLimit: number;
    dailyAudioHoursLimit: number;
}

export const PROVIDER_TIER_PRESETS: Record<string, ProviderTierPreset[]> = {
    gemini: [
        { id: 'free', label: 'Google AI Studio — Free Tier', rpmLimit: 15, rpdLimit: 1500, dailyImagesLimit: 500, dailyAudioHoursLimit: 12 },
        { id: 'tier1_paid', label: 'Gemini Pay-As-You-Go — Tier 1', rpmLimit: 1000, rpdLimit: 10000, dailyImagesLimit: 2500, dailyAudioHoursLimit: 120 },
        { id: 'tier2_pro', label: 'Gemini Enterprise / Tier 2', rpmLimit: 2000, rpdLimit: 50000, dailyImagesLimit: 10000, dailyAudioHoursLimit: 500 }
    ],
    pollinations: [
        { id: 'free', label: 'Pollinations Flux — Community Free', rpmLimit: 30, rpdLimit: 3000, dailyImagesLimit: 3000, dailyAudioHoursLimit: 0 },
        { id: 'tier1_paid', label: 'Pollinations Flux — Priority / Seed', rpmLimit: 120, rpdLimit: 15000, dailyImagesLimit: 15000, dailyAudioHoursLimit: 0 }
    ],
    whisper_local: [
        { id: 'local_cpu', label: 'Local Whisper C++ (CPU / Offline)', rpmLimit: 999, rpdLimit: 99999, dailyImagesLimit: 0, dailyAudioHoursLimit: 48 }
    ],
    openai: [
        { id: 'free', label: 'OpenAI / Groq — Tier 1 Starter', rpmLimit: 50, rpdLimit: 2000, dailyImagesLimit: 200, dailyAudioHoursLimit: 24 },
        { id: 'tier1_paid', label: 'OpenAI / Groq — Usage Tier 2+', rpmLimit: 500, rpdLimit: 20000, dailyImagesLimit: 2000, dailyAudioHoursLimit: 240 }
    ],
    openlibrary: [
        { id: 'public', label: 'OpenLibrary & Google Books Public API', rpmLimit: 100, rpdLimit: 10000, dailyImagesLimit: 5000, dailyAudioHoursLimit: 0 }
    ]
};

interface SavedProviderQuotaConfig {
    tierId: string;
    autoSetLimits: boolean;
    rpmLimit: number;
    rpdLimit: number;
    dailyImagesLimit: number;
    dailyAudioHoursLimit: number;
    lastPingAt?: string | null;
    lastPingLatencyMs?: number | null;
    lastPingStatus?: 'healthy' | 'rate_limited' | 'unconfigured' | 'error';
    detectedRemoteRemaining?: number | null;
    detectedRemoteLimit?: number | null;
}

const DEFAULT_QUOTA_CONFIG: Record<string, SavedProviderQuotaConfig> = {
    gemini: {
        tierId: 'free',
        autoSetLimits: true,
        rpmLimit: 15,
        rpdLimit: 1500,
        dailyImagesLimit: 500,
        dailyAudioHoursLimit: 12
    },
    pollinations: {
        tierId: 'free',
        autoSetLimits: true,
        rpmLimit: 30,
        rpdLimit: 3000,
        dailyImagesLimit: 3000,
        dailyAudioHoursLimit: 0
    },
    whisper_local: {
        tierId: 'local_cpu',
        autoSetLimits: true,
        rpmLimit: 999,
        rpdLimit: 99999,
        dailyImagesLimit: 0,
        dailyAudioHoursLimit: 48
    },
    openai: {
        tierId: 'free',
        autoSetLimits: true,
        rpmLimit: 50,
        rpdLimit: 2000,
        dailyImagesLimit: 200,
        dailyAudioHoursLimit: 24
    },
    openlibrary: {
        tierId: 'public',
        autoSetLimits: true,
        rpmLimit: 100,
        rpdLimit: 10000,
        dailyImagesLimit: 5000,
        dailyAudioHoursLimit: 0
    }
};

function loadQuotaConfigs(): Record<string, SavedProviderQuotaConfig> {
    const raw = getSetting('ai_api_quotas_config');
    if (!raw) return { ...DEFAULT_QUOTA_CONFIG };
    try {
        const parsed = JSON.parse(raw);
        const merged: Record<string, SavedProviderQuotaConfig> = {};
        for (const key of Object.keys(DEFAULT_QUOTA_CONFIG)) {
            merged[key] = {
                ...DEFAULT_QUOTA_CONFIG[key],
                ...(parsed[key] || {})
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
    quotaConfigs: Record<string, SavedProviderQuotaConfig>
): Promise<Record<string, SavedProviderQuotaConfig>> {
    const studioCfg = getAudiobookStudioConfig();
    const geminiKey = (studioCfg.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    const openaiKey = (studioCfg.openaiApiKey || process.env.OPENAI_API_KEY || '').trim();
    const nowIso = new Date().toISOString();

    // 1. Ping Google Gemini API
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
            quotaConfigs.gemini.lastPingAt = nowIso;
            quotaConfigs.gemini.lastPingLatencyMs = latency;
            quotaConfigs.gemini.lastPingStatus = res.status === 429 ? 'rate_limited' : res.ok ? 'healthy' : 'error';
            if (remHeader) quotaConfigs.gemini.detectedRemoteRemaining = Number(remHeader);
            if (limHeader) {
                const detectedLim = Number(limHeader);
                quotaConfigs.gemini.detectedRemoteLimit = detectedLim;
                if (quotaConfigs.gemini.autoSetLimits && detectedLim > 0) {
                    if (detectedLim >= 500) {
                        quotaConfigs.gemini.tierId = 'tier1_paid';
                        quotaConfigs.gemini.rpmLimit = 1000;
                        quotaConfigs.gemini.rpdLimit = 10000;
                        quotaConfigs.gemini.dailyImagesLimit = 2500;
                        quotaConfigs.gemini.dailyAudioHoursLimit = 120;
                    } else {
                        quotaConfigs.gemini.tierId = 'free';
                        quotaConfigs.gemini.rpmLimit = 15;
                        quotaConfigs.gemini.rpdLimit = 1500;
                        quotaConfigs.gemini.dailyImagesLimit = 500;
                        quotaConfigs.gemini.dailyAudioHoursLimit = 12;
                    }
                }
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

    // 3. Ping OpenAI / Groq Whisper API (if key configured)
    if (openaiKey) {
        const t0 = Date.now();
        try {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: { Authorization: `Bearer ${openaiKey}` },
                signal: AbortSignal.timeout(6000)
            });
            quotaConfigs.openai.lastPingAt = nowIso;
            quotaConfigs.openai.lastPingLatencyMs = Date.now() - t0;
            quotaConfigs.openai.lastPingStatus = res.status === 429 ? 'rate_limited' : res.ok ? 'healthy' : 'error';
            const rem = res.headers.get('x-ratelimit-remaining-requests');
            const lim = res.headers.get('x-ratelimit-limit-requests');
            if (rem) quotaConfigs.openai.detectedRemoteRemaining = Number(rem);
            if (lim) quotaConfigs.openai.detectedRemoteLimit = Number(lim);
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
        const forcePing = searchParams.get('ping') === 'true';

        let quotaConfigs = loadQuotaConfigs();

        // Periodically ping providers if forcePing or last ping > 3 minutes ago
        const lastPingMs = quotaConfigs.gemini?.lastPingAt ? new Date(quotaConfigs.gemini.lastPingAt).getTime() : 0;
        if (forcePing || Date.now() - lastPingMs > 180_000) {
            quotaConfigs = await pingProvidersLive(quotaConfigs);
        }

        const timeSeries = getAiApiUsageTimeSeries(range);
        const daySeries = getAiApiUsageTimeSeries('24h');
        const liveStudio: any = getAudiobookStudioStatus();

        // Combine live runtime metrics with SQLite historical usage per provider
        const PROVIDER_META = [
            {
                id: 'gemini',
                name: 'Google Gemini (Audio STT, Scening LLM & Imagen)',
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
                name: 'OpenAI / Groq Whisper & DALL-E',
                category: 'Cloud Audio & Image API'
            },
            {
                id: 'openlibrary',
                name: 'OpenLibrary & Google Books Catalog',
                category: 'Book Metadata & Covers'
            }
        ];

        const providersReport = PROVIDER_META.map(pm => {
            const qCfg = quotaConfigs[pm.id] || DEFAULT_QUOTA_CONFIG[pm.id];
            const rangeRow = timeSeries.byProvider.find((r: any) => r.provider === pm.id) || {
                requests: 0,
                images_generated: 0,
                audio_seconds: 0,
                tokens_used: 0,
                errors: 0,
                rate_limited: 0
            };
            const dayRow = daySeries.byProvider.find((r: any) => r.provider === pm.id) || {
                requests: 0,
                images_generated: 0,
                audio_seconds: 0,
                tokens_used: 0,
                errors: 0,
                rate_limited: 0
            };

            // Also include live in-memory counters from Audiobook Studio if higher
            const liveMem = (liveStudio?.apiUsage || []).find((a: any) => a.provider === pm.id);
            const requestsToday = Math.max(Number(dayRow.requests || 0), Number(liveMem?.requestsToday || 0));
            const imagesToday = Number(dayRow.images_generated || 0);
            const audioHoursToday = Number((Number(dayRow.audio_seconds || 0) / 3600).toFixed(2));
            const rpdLimit = Math.max(1, Number(qCfg.rpdLimit || 1000));
            const pushPercent = Math.min(100, Math.round((requestsToday / rpdLimit) * 100));

            return {
                id: pm.id,
                name: pm.name,
                category: pm.category,
                tierId: qCfg.tierId,
                availableTiers: PROVIDER_TIER_PRESETS[pm.id] || [],
                autoSetLimits: qCfg.autoSetLimits,
                rpmLimit: qCfg.rpmLimit,
                rpdLimit: qCfg.rpdLimit,
                dailyImagesLimit: qCfg.dailyImagesLimit,
                dailyAudioHoursLimit: qCfg.dailyAudioHoursLimit,
                lastPingAt: qCfg.lastPingAt || null,
                lastPingLatencyMs: qCfg.lastPingLatencyMs ?? null,
                status: liveMem?.status === 'rate_limited' ? 'rate_limited' : (qCfg.lastPingStatus || 'healthy'),
                detectedRemoteRemaining: qCfg.detectedRemoteRemaining ?? null,
                detectedRemoteLimit: qCfg.detectedRemoteLimit ?? null,
                requestsToday,
                imagesToday,
                audioHoursToday,
                pushPercent,
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

        if (action === 'ping_providers') {
            quotaConfigs = await pingProvidersLive(quotaConfigs);
            return NextResponse.json({ success: true, quotaConfigs });
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
                    rpdLimit: body.rpdLimit !== undefined ? Math.max(1, Number(body.rpdLimit)) : current.rpdLimit,
                    dailyImagesLimit: body.dailyImagesLimit !== undefined ? Math.max(0, Number(body.dailyImagesLimit)) : current.dailyImagesLimit,
                    dailyAudioHoursLimit: body.dailyAudioHoursLimit !== undefined ? Math.max(0, Number(body.dailyAudioHoursLimit)) : current.dailyAudioHoursLimit
                };
            }

            saveQuotaConfigs(quotaConfigs);
            return NextResponse.json({ success: true, quotaConfigs });
        }

        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to update AI API usage config' }, { status: 500 });
    }
}

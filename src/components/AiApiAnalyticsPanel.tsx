'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Activity, RefreshCw, Image as ImageIcon, Headphones,
    Sliders, CheckCircle2, AlertTriangle, Zap, Save, Clock, Server
} from 'lucide-react';
import { toast } from 'sonner';

export function AiApiAnalyticsPanel() {
    const [range, setRange] = useState<'24h' | '7d' | '30d' | 'all'>('24h');
    const [loading, setLoading] = useState(true);
    const [pinging, setPinging] = useState(false);
    const [data, setData] = useState<{
        range: string;
        providers: any[];
        buckets: Array<{
            bucket: string;
            requests: number;
            imagesGenerated: number;
            audioSeconds: number;
            audioHours: number;
            tokensUsed: number;
            errors: number;
        }>;
        totals: {
            totalRequests: number;
            totalImages: number;
            totalAudioSeconds: number;
            totalAudioHours: number;
            totalTokens: number;
            totalErrors: number;
        };
        recentEvents: any[];
    } | null>(null);

    const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
    const [draftTierId, setDraftTierId] = useState<string>('free');
    const [draftAutoSet, setDraftAutoSet] = useState<boolean>(true);
    const [draftRpm, setDraftRpm] = useState<number>(15);
    const [draftRpd, setDraftRpd] = useState<number>(1500);
    const [draftDailyImages, setDraftDailyImages] = useState<number>(500);
    const [draftDailyAudioHours, setDraftDailyAudioHours] = useState<number>(12);

    const fetchAnalytics = useCallback(async (forcePing = false) => {
        if (forcePing) setPinging(true);
        else setLoading(true);
        try {
            const res = await fetch(`/api/analytics/ai-usage?range=${range}${forcePing ? '&ping=true' : ''}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
                if (forcePing) toast.success('Queried all API providers for live quota & rate-limit status');
            }
        } catch {
            if (forcePing) toast.error('Failed to ping API providers');
        } finally {
            setLoading(false);
            setPinging(false);
        }
    }, [range]);

    useEffect(() => {
        fetchAnalytics(false);
        const timer = setInterval(() => fetchAnalytics(false), 15000);
        return () => clearInterval(timer);
    }, [fetchAnalytics]);

    const handleStartEditProvider = (p: any) => {
        if (editingProviderId === p.id) {
            setEditingProviderId(null);
            return;
        }
        setEditingProviderId(p.id);
        setDraftTierId(p.tierId || 'free');
        setDraftAutoSet(Boolean(p.autoSetLimits));
        setDraftRpm(Number(p.rpmLimit || 15));
        setDraftRpd(Number(p.rpdLimit || 1500));
        setDraftDailyImages(Number(p.dailyImagesLimit || 0));
        setDraftDailyAudioHours(Number(p.dailyAudioHoursLimit || 0));
    };

    const handleTierChange = (p: any, newTierId: string) => {
        setDraftTierId(newTierId);
        const preset = (p.availableTiers || []).find((t: any) => t.id === newTierId);
        if (preset && draftAutoSet) {
            setDraftRpm(preset.rpmLimit);
            setDraftRpd(preset.rpdLimit);
            setDraftDailyImages(preset.dailyImagesLimit);
            setDraftDailyAudioHours(preset.dailyAudioHoursLimit);
        }
    };

    const handleSaveProviderLimits = async (providerId: string) => {
        try {
            const res = await fetch('/api/analytics/ai-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_provider_limits',
                    providerId,
                    tierId: draftTierId,
                    autoSetLimits: draftAutoSet,
                    rpmLimit: draftRpm,
                    rpdLimit: draftRpd,
                    dailyImagesLimit: draftDailyImages,
                    dailyAudioHoursLimit: draftDailyAudioHours
                })
            });
            if (res.ok) {
                toast.success('Saved API tier & quota limits');
                setEditingProviderId(null);
                fetchAnalytics(false);
            } else {
                toast.error('Failed to save API quota limits');
            }
        } catch {
            toast.error('Error saving API quota limits');
        }
    };

    const buckets = data?.buckets || [];
    const maxImagesBucket = Math.max(1, ...buckets.map(b => b.imagesGenerated || 0));
    const maxAudioHoursBucket = Math.max(0.1, ...buckets.map(b => b.audioHours || 0));

    return (
        <div className="space-y-8">
            {/* ── TOP BAR: TIMEFRAME SELECTOR & LIVE PROVIDER PING ── */}
            <div className="p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
                <div className="flex flex-wrap items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
                    {(
                        [
                            { id: '24h', label: '24 Hours' },
                            { id: '7d', label: '7 Days' },
                            { id: '30d', label: '30 Days' },
                            { id: 'all', label: 'All Time' }
                        ] as const
                    ).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setRange(t.id)}
                            title={`Show API usage and generated assets for ${t.label}`}
                            className={`px-5 py-2.5 rounded-xl text-sm sm:text-base font-black uppercase tracking-wider transition-all cursor-pointer ${
                                range === t.id
                                    ? 'bg-indigo-500 text-black shadow-lg shadow-indigo-500/25'
                                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchAnalytics(true)}
                        disabled={pinging}
                        title="Query all API providers right now to check live rate limits and usage"
                        className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm sm:text-base uppercase tracking-wider flex items-center gap-2.5 shadow-lg cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={20} className={pinging ? 'animate-spin' : ''} />
                        <span>Ping Providers</span>
                    </button>
                </div>
            </div>

            {/* ── SUMMARY TOTALS CARDS FOR SELECTED TIMEFRAME ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-6 rounded-3xl bg-zinc-900/80 border border-purple-500/30 space-y-2 shadow-xl">
                    <div className="flex items-center justify-between text-purple-400">
                        <span className="text-sm font-black uppercase tracking-wider">Images Generated</span>
                        <ImageIcon size={24} />
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-white font-mono">
                        {data?.totals?.totalImages ?? 0}
                    </div>
                </div>

                <div className="p-6 rounded-3xl bg-zinc-900/80 border border-amber-500/30 space-y-2 shadow-xl">
                    <div className="flex items-center justify-between text-amber-400">
                        <span className="text-sm font-black uppercase tracking-wider">Audio Converted</span>
                        <Headphones size={24} />
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-white font-mono">
                        {data?.totals?.totalAudioHours ?? 0} <span className="text-lg text-zinc-400">hrs</span>
                    </div>
                </div>

                <div className="p-6 rounded-3xl bg-zinc-900/80 border border-sky-500/30 space-y-2 shadow-xl">
                    <div className="flex items-center justify-between text-sky-400">
                        <span className="text-sm font-black uppercase tracking-wider">API Requests</span>
                        <Zap size={24} />
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-white font-mono">
                        {data?.totals?.totalRequests ?? 0}
                    </div>
                </div>

                <div className="p-6 rounded-3xl bg-zinc-900/80 border border-emerald-500/30 space-y-2 shadow-xl">
                    <div className="flex items-center justify-between text-emerald-400">
                        <span className="text-sm font-black uppercase tracking-wider">Tokens Processed</span>
                        <Activity size={24} />
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-white font-mono">
                        {(data?.totals?.totalTokens ?? 0).toLocaleString()}
                    </div>
                </div>
            </div>

            {/* ── DUAL TIME-SERIES GRAPHS: IMAGES GENERATED & HOURS OF AUDIO CONVERTED ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Graph 1: Images Generated */}
                <div className="p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-5 shadow-2xl">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                                <ImageIcon size={22} />
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-white">Images Generated</h3>
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    Time Frame: {range.toUpperCase()}
                                </span>
                            </div>
                        </div>
                        <span className="px-4 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono text-base font-black">
                            {data?.totals?.totalImages ?? 0} Artworks
                        </span>
                    </div>

                    {buckets.length === 0 ? (
                        <div className="h-56 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-center text-zinc-500 font-bold text-base">
                            No images generated in this time window yet
                        </div>
                    ) : (
                        <div className="h-56 rounded-2xl bg-zinc-950 border border-zinc-800/80 p-4 flex items-end gap-2 overflow-x-auto">
                            {buckets.map((b, i) => {
                                const val = Number(b.imagesGenerated || 0);
                                const pct = Math.max(6, Math.round((val / maxImagesBucket) * 100));
                                const label = b.bucket.split(' ')[1] || b.bucket.slice(5);
                                return (
                                    <div
                                        key={b.bucket || i}
                                        title={`${b.bucket}: ${val} images generated`}
                                        className="flex-1 min-w-[28px] h-full flex flex-col justify-end items-center gap-1.5 group"
                                    >
                                        <span className="text-[11px] font-mono font-black text-purple-300 opacity-85 group-hover:opacity-100">
                                            {val > 0 ? val : ''}
                                        </span>
                                        <div
                                            className="w-full rounded-t-xl bg-gradient-to-t from-purple-700 via-purple-500 to-fuchsia-400 transition-all duration-500 group-hover:brightness-125"
                                            style={{ height: `${val === 0 ? 4 : pct}%` }}
                                        />
                                        <span className="text-[10px] font-mono font-bold text-zinc-500 truncate max-w-[48px]">
                                            {label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Graph 2: Hours of Audio Converted */}
                <div className="p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-5 shadow-2xl">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                                <Headphones size={22} />
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-white">Hours of Audio Converted</h3>
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    Time Frame: {range.toUpperCase()}
                                </span>
                            </div>
                        </div>
                        <span className="px-4 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-base font-black">
                            {data?.totals?.totalAudioHours ?? 0} Hours
                        </span>
                    </div>

                    {buckets.length === 0 ? (
                        <div className="h-56 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-center text-zinc-500 font-bold text-base">
                            No audio converted in this time window yet
                        </div>
                    ) : (
                        <div className="h-56 rounded-2xl bg-zinc-950 border border-zinc-800/80 p-4 flex items-end gap-2 overflow-x-auto">
                            {buckets.map((b, i) => {
                                const val = Number(b.audioHours || 0);
                                const pct = Math.max(6, Math.round((val / maxAudioHoursBucket) * 100));
                                const label = b.bucket.split(' ')[1] || b.bucket.slice(5);
                                return (
                                    <div
                                        key={b.bucket || i}
                                        title={`${b.bucket}: ${val} hours (${Math.round((b.audioSeconds || 0) / 60)} min) converted`}
                                        className="flex-1 min-w-[28px] h-full flex flex-col justify-end items-center gap-1.5 group"
                                    >
                                        <span className="text-[11px] font-mono font-black text-amber-300 opacity-85 group-hover:opacity-100">
                                            {val > 0 ? `${val}h` : ''}
                                        </span>
                                        <div
                                            className="w-full rounded-t-xl bg-gradient-to-t from-amber-700 via-amber-500 to-yellow-400 transition-all duration-500 group-hover:brightness-125"
                                            style={{ height: `${val === 0 ? 4 : pct}%` }}
                                        />
                                        <span className="text-[10px] font-mono font-bold text-zinc-500 truncate max-w-[48px]">
                                            {label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── API PROVIDERS LOAD, AUTO-TIER QUOTAS & MANUAL LIMIT OVERRIDES ── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3">
                        <Server size={24} className="text-indigo-400" />
                        <span>API Providers — Load &amp; Quota Limits</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 gap-5">
                    {(data?.providers || []).map((p: any) => {
                        const isEditing = editingProviderId === p.id;
                        const activeTierObj = (p.availableTiers || []).find((t: any) => t.id === p.tierId);
                        const reqPct = Math.min(100, Math.round(((p.requestsToday || 0) / Math.max(1, p.rpdLimit || 1)) * 100));
                        const imgPct = p.dailyImagesLimit > 0 ? Math.min(100, Math.round(((p.imagesToday || 0) / p.dailyImagesLimit) * 100)) : 0;
                        const audPct = p.dailyAudioHoursLimit > 0 ? Math.min(100, Math.round(((p.audioHoursToday || 0) / p.dailyAudioHoursLimit) * 100)) : 0;

                        return (
                            <div
                                key={p.id}
                                className="p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-5 shadow-xl"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h3 className="text-lg sm:text-xl font-black text-white">{p.name}</h3>
                                            <span
                                                className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border ${
                                                    p.status === 'healthy'
                                                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                                        : p.status === 'rate_limited'
                                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                                        : p.status === 'unconfigured'
                                                        ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                        : 'bg-red-500/20 text-red-300 border-red-500/40'
                                                }`}
                                            >
                                                {p.status === 'healthy' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                                                <span>{p.status}</span>
                                            </span>
                                            <span className="px-3 py-1 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-black">
                                                {activeTierObj?.label || p.tierId} {p.autoSetLimits ? '(Auto Limits)' : '(Manual Limits)'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zinc-400">
                                            <span>RPM Limit: <strong className="text-white font-mono">{p.rpmLimit}/min</strong></span>
                                            <span>Daily Quota: <strong className="text-white font-mono">{p.rpdLimit}/day</strong></span>
                                            {p.lastPingLatencyMs != null && (
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} className="text-emerald-400" />
                                                    Ping: <strong className="text-emerald-300 font-mono">{p.lastPingLatencyMs}ms</strong>
                                                </span>
                                            )}
                                            {p.detectedRemoteRemaining != null && (
                                                <span>
                                                    Provider Header Remaining: <strong className="text-amber-300 font-mono">{p.detectedRemoteRemaining}</strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleStartEditProvider(p)}
                                        title="Configure subscription tier or set manual quota limits for this API"
                                        className={`px-4 py-2.5 rounded-2xl border font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all ${
                                            isEditing
                                                ? 'bg-indigo-500 text-black border-indigo-400'
                                                : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border-zinc-800'
                                        }`}
                                    >
                                        <Sliders size={16} />
                                        <span>{isEditing ? 'Close Limits' : 'Tier & Limits'}</span>
                                    </button>
                                </div>

                                {/* ── 3 HORIZONTAL PUSH BARS (REQUESTS, IMAGES, AUDIO HOURS) ── */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Bar 1: Daily Requests Push */}
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                                        <div className="flex items-center justify-between text-xs font-black">
                                            <span className="text-sky-300 uppercase tracking-wider">Daily Requests Load</span>
                                            <span className="font-mono text-white">
                                                {p.requestsToday} / {p.rpdLimit} ({reqPct}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-3.5 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800">
                                            <div
                                                className={`h-full transition-all duration-500 ${
                                                    reqPct >= 85 ? 'bg-red-500' : reqPct >= 60 ? 'bg-amber-500' : 'bg-sky-500'
                                                }`}
                                                style={{ width: `${reqPct}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Bar 2: Daily Images Push */}
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                                        <div className="flex items-center justify-between text-xs font-black">
                                            <span className="text-purple-300 uppercase tracking-wider">Daily Images Quota</span>
                                            <span className="font-mono text-white">
                                                {p.dailyImagesLimit > 0 ? `${p.imagesToday} / ${p.dailyImagesLimit} (${imgPct}%)` : `${p.imagesToday} (N/A)`}
                                            </span>
                                        </div>
                                        <div className="w-full h-3.5 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800">
                                            <div
                                                className="h-full bg-purple-500 transition-all duration-500"
                                                style={{ width: `${imgPct}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Bar 3: Daily Audio Hours Push */}
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                                        <div className="flex items-center justify-between text-xs font-black">
                                            <span className="text-amber-300 uppercase tracking-wider">Daily Audio Hours Quota</span>
                                            <span className="font-mono text-white">
                                                {p.dailyAudioHoursLimit > 0 ? `${p.audioHoursToday}h / ${p.dailyAudioHoursLimit}h (${audPct}%)` : `${p.audioHoursToday}h (N/A)`}
                                            </span>
                                        </div>
                                        <div className="w-full h-3.5 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800">
                                            <div
                                                className="h-full bg-amber-500 transition-all duration-500"
                                                style={{ width: `${audPct}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ── EXPANDABLE SUBSCRIPTION TIER & MANUAL LIMITS EDITOR ── */}
                                {isEditing && (
                                    <div className="p-5 rounded-2xl bg-zinc-950 border-2 border-indigo-500/40 space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs font-black text-indigo-300 uppercase tracking-wider mb-1.5">
                                                    Subscription Tier
                                                </label>
                                                <select
                                                    value={draftTierId}
                                                    onChange={e => handleTierChange(p, e.target.value)}
                                                    className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm font-bold text-white cursor-pointer"
                                                >
                                                    {(p.availableTiers || []).map((t: any) => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.label} ({t.rpmLimit} RPM / {t.rpdLimit} RPD)
                                                        </option>
                                                    ))}
                                                    <option value="custom">Custom Manual Override</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-black text-indigo-300 uppercase tracking-wider mb-1.5">
                                                    Limit Mode
                                                </label>
                                                <button
                                                    onClick={() => {
                                                        const nextAuto = !draftAutoSet;
                                                        setDraftAutoSet(nextAuto);
                                                        if (nextAuto) {
                                                            const preset = (p.availableTiers || []).find((t: any) => t.id === draftTierId);
                                                            if (preset) {
                                                                setDraftRpm(preset.rpmLimit);
                                                                setDraftRpd(preset.rpdLimit);
                                                                setDraftDailyImages(preset.dailyImagesLimit);
                                                                setDraftDailyAudioHours(preset.dailyAudioHoursLimit);
                                                            }
                                                        }
                                                    }}
                                                    className={`w-full px-4 py-3 rounded-xl border font-black text-sm uppercase tracking-wider flex items-center justify-between cursor-pointer ${
                                                        draftAutoSet
                                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                    }`}
                                                >
                                                    <span>{draftAutoSet ? 'Auto-Set From Tier & Headers' : 'Manual Limits Override'}</span>
                                                    <span>{draftAutoSet ? 'AUTO' : 'MANUAL'}</span>
                                                </button>
                                            </div>

                                            <div className="flex items-end">
                                                <button
                                                    onClick={() => handleSaveProviderLimits(p.id)}
                                                    className="w-full py-3 px-5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                                                >
                                                    <Save size={18} />
                                                    <span>Save Limits</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                                            <div>
                                                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">
                                                    Requests / Min (RPM)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={draftRpm}
                                                    onChange={e => {
                                                        setDraftAutoSet(false);
                                                        setDraftRpm(Number(e.target.value));
                                                    }}
                                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-base font-mono font-bold text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">
                                                    Requests / Day (RPD)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={draftRpd}
                                                    onChange={e => {
                                                        setDraftAutoSet(false);
                                                        setDraftRpd(Number(e.target.value));
                                                    }}
                                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-base font-mono font-bold text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">
                                                    Daily Images Limit
                                                </label>
                                                <input
                                                    type="number"
                                                    value={draftDailyImages}
                                                    onChange={e => {
                                                        setDraftAutoSet(false);
                                                        setDraftDailyImages(Number(e.target.value));
                                                    }}
                                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-base font-mono font-bold text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">
                                                    Daily Audio Hours Limit
                                                </label>
                                                <input
                                                    type="number"
                                                    value={draftDailyAudioHours}
                                                    onChange={e => {
                                                        setDraftAutoSet(false);
                                                        setDraftDailyAudioHours(Number(e.target.value));
                                                    }}
                                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-base font-mono font-bold text-white"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

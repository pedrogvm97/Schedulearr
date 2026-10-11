'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
    Activity,
    Sparkles,
    Tv,
    Radio,
    Clock,
    Play,
    Pause,
    RefreshCw,
    BookOpen,
    Mic,
    Image as ImageIcon,
    Volume2,
    Trash2,
    Square,
    ArrowUp,
    RotateCcw,
    Sliders,
    Plus,
    X,
    HardDrive,
    Search,
    Terminal,
    Cpu,
    Brain,
    Globe,
    Gauge,
    Wand2
} from 'lucide-react';

export default function TasksPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [selectedBookToAdd, setSelectedBookToAdd] = useState<string>('');
    const [nowMs, setNowMs] = useState<number>(Date.now());

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(prev => (prev === msg ? null : prev)), 3500);
    };

    const fetchTasks = useCallback(async () => {
        try {
            const res = await fetch('/api/tasks', { cache: 'no-store' });
            const json = await res.json();
            if (json.ok) {
                setData(json);
            }
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        const pollTimer = setInterval(fetchTasks, 2000);
        const clockTimer = setInterval(() => setNowMs(Date.now()), 1000);
        return () => {
            clearInterval(pollTimer);
            clearInterval(clockTimer);
        };
    }, [fetchTasks]);

    const runAction = async (key: string, payload: Record<string, any>) => {
        setBusyKey(key);
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.message) showToast(json.message);
            await fetchTasks();
        } catch (e: any) {
            showToast(`Error: ${e.message}`);
        } finally {
            setBusyKey(null);
        }
    };

    const studio = data?.audiobookStudio;
    const studioCfg = studio?.config || {};
    const studioStatus = studio?.status || {};
    const totals = studio?.totals || {
        transcriptions: { done: 0, total: 0, pending: 0, failed: 0 },
        llmScenes: { doneChapters: 0, totalChapters: 0, detectedScenes: 0, pendingChapters: 0 },
        art: { doneChapters: 0, totalChapters: 0, keptScenes: 0, pendingChapters: 0, failedChapters: 0 },
        voices: { done: 0, total: 0, pending: 0, failed: 0 }
    };
    const queueBreakdown = studio?.queueBreakdown || {
        transcriptionQueue: [],
        llmSceneQueue: [],
        artQueue: [],
        voiceQueue: []
    };
    const queuedBooks: any[] = studio?.queuedBooks || [];
    const availableBooks: any[] = studio?.availableBooks || [];
    const arrScheduler = data?.arrScheduler || {};
    const liveStreams: any[] = data?.liveStreams || [];
    const epgSyncs: any[] = data?.epgSyncs || [];
    const epgSchedules: any[] = data?.epgSchedules || [];
    const dvrActive: any[] = data?.dvr?.active || [];
    const dvrScheduled: any[] = data?.dvr?.scheduled || [];
    const transfersActive: any[] = data?.transfers?.active || [];
    const recentLogs: any[] = data?.recentSystemLogs || [];

    const quotaReached = (studioCfg.imagesGeneratedToday ?? 0) >= (studioCfg.dailyImageQuota ?? 20);
    const totalFailedChapters =
        (totals.transcriptions?.failed || 0) +
        (totals.art?.failedChapters || 0) +
        (totals.voices?.failed || 0);

    const formatNextRun = (ts: number | string | null) => {
        if (!ts) return '—';
        const targetMs = typeof ts === 'string' ? new Date(ts).getTime() : ts;
        if (isNaN(targetMs)) return '—';
        const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
        if (diffSec <= 0) return 'Due now';
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        const s = diffSec % 60;
        if (h > 0) return `${h}h ${m}m`;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const activeTaskText = String(studioStatus.activeTask || '').toLowerCase();
    const isSttRunning = studioStatus.isRunning && activeTaskText.includes('transcrib');
    const isLlmRunning = studioStatus.isRunning && (activeTaskText.includes('llm') || activeTaskText.includes('scene') && !activeTaskText.includes('paint'));
    const isArtRunning = studioStatus.isRunning && (activeTaskText.includes('paint') || activeTaskText.includes('illustrat') || activeTaskText.includes('cover'));
    const isVoiceRunning = studioStatus.isRunning && (activeTaskText.includes('voice') || activeTaskText.includes('audio'));
    const sttUsesLocalCpu = !studioCfg.sttEngine || studioCfg.sttEngine === 'local_whisper' || (studioCfg.sttEngine === 'auto' && (studioCfg.apiKeysCount ?? 0) === 0);

    return (
        <div className="min-h-screen bg-[#07090e] text-white px-4 py-5 md:px-8 max-w-[1750px] mx-auto space-y-6">
            {/* Compact Top Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <Activity className="w-7 h-7 text-indigo-400 shrink-0" />
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Tasks & Schedulers</h1>
                    <span className={`px-3 py-1 rounded-lg text-sm font-black uppercase border ${
                        (data?.activeCount ?? 0) > 0
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                            : 'bg-white/5 text-gray-300 border-white/10'
                    }`}>
                        {data?.activeCount ?? 0} Running
                    </span>
                    <span className="px-3 py-1 rounded-lg text-sm font-black uppercase bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        {data?.queuedCount ?? 0} Queued
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {toast && (
                        <div className="px-3.5 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-sm font-bold">
                            {toast}
                        </div>
                    )}
                    <button
                        onClick={fetchTasks}
                        title="Refresh live status"
                        className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-base font-bold text-gray-200 flex items-center gap-2 whitespace-nowrap cursor-pointer"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* 0. RESOURCE CATEGORY MATRIX: WHAT'S USING LLMs, CPU, APIs, AND QUOTAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Category 1: What's Using LLMs */}
                <div className={`rounded-2xl p-4 border space-y-3 ${isLlmRunning ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-[#0d111a] border-white/10'}`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Brain className="w-6 h-6 text-cyan-400 shrink-0" />
                            <h2 className="text-lg font-black text-white">Using LLMs</h2>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase border ${
                            isLlmRunning
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                                : 'bg-white/5 text-gray-400 border-white/10'
                        }`}>
                            {isLlmRunning ? 'Active' : 'Idle'}
                        </span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-white/5">
                            <span className="font-bold text-gray-300">Stage 2: Scene Transitions</span>
                            <span className="font-mono font-black text-cyan-300">
                                {totals.llmScenes?.doneChapters ?? 0}/{totals.llmScenes?.totalChapters ?? 0} Ch
                            </span>
                        </div>
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-white/5">
                            <span className="font-bold text-gray-300">Created Scene Windows</span>
                            <span className="font-mono font-black text-white">
                                {totals.llmScenes?.detectedScenes ?? 0} Scenes
                            </span>
                        </div>
                    </div>
                </div>

                {/* Category 2: What's Using Local CPU */}
                <div className={`rounded-2xl p-4 border space-y-3 ${(isVoiceRunning || (isSttRunning && sttUsesLocalCpu) || epgSyncs.length > 0 || liveStreams.length > 0 || dvrActive.length > 0) ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-[#0d111a] border-white/10'}`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Cpu className="w-6 h-6 text-emerald-400 shrink-0" />
                            <h2 className="text-lg font-black text-white">Using Local CPU</h2>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase border ${
                            (isVoiceRunning || (isSttRunning && sttUsesLocalCpu) || epgSyncs.length > 0 || liveStreams.length > 0 || dvrActive.length > 0)
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                                : 'bg-white/5 text-gray-400 border-white/10'
                        }`}>
                            {(isVoiceRunning || (isSttRunning && sttUsesLocalCpu) || epgSyncs.length > 0 || liveStreams.length > 0 || dvrActive.length > 0) ? 'Active' : 'Idle'}
                        </span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-white/5">
                            <span className="font-bold text-gray-300">Local Whisper / FFmpeg DSP</span>
                            <span className="font-mono font-black text-emerald-300">
                                {totals.voices.done}/{totals.voices.total} Voice
                            </span>
                        </div>
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-white/5">
                            <span className="font-bold text-gray-300">Live Streams / DVR / EPG Parse</span>
                            <span className="font-mono font-black text-white">
                                {liveStreams.length} TV • {dvrActive.length} DVR • {epgSyncs.length} EPG
                            </span>
                        </div>
                    </div>
                </div>

                {/* Category 3: What's Using External APIs */}
                <div className={`rounded-2xl p-4 border space-y-3 ${(isArtRunning || (isSttRunning && !sttUsesLocalCpu)) ? 'bg-purple-500/10 border-purple-500/40' : 'bg-[#0d111a] border-white/10'}`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Globe className="w-6 h-6 text-purple-400 shrink-0" />
                            <h2 className="text-lg font-black text-white">Using External APIs</h2>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30 truncate max-w-[150px]">
                            {studioCfg.detectedProvider || 'Pollinations / Whisper'}
                        </span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-white/5">
                            <span className="font-bold text-gray-300">Stage 3: Scene Image API</span>
                            <span className="font-mono font-black text-purple-300">
                                {totals.art.keptScenes} Painted ({totals.art.doneChapters}/{totals.art.totalChapters} Ch)
                            </span>
                        </div>
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-2 border border-white/5">
                            <span className="font-bold text-gray-300">Arr Indexer API / Cloud STT</span>
                            <span className="font-mono font-black text-white">
                                {arrScheduler.enabled ? `Every ${arrScheduler.interval || 30}m` : 'Arr Paused'} • {studioCfg.apiKeysCount ?? 0} Keys
                            </span>
                        </div>
                    </div>
                </div>

                {/* Category 4: What's Consuming Quotas */}
                <div className={`rounded-2xl p-4 border space-y-3 ${quotaReached ? 'bg-rose-500/10 border-rose-500/40' : 'bg-[#0d111a] border-white/10'}`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Gauge className="w-6 h-6 text-amber-400 shrink-0" />
                            <h2 className="text-lg font-black text-white">Consuming Quotas</h2>
                        </div>
                        <button
                            onClick={() => runAction('reset_quota_top', { action: 'update_studio_limits', resetDailyUsage: true })}
                            title="Reset daily generated image count to 0"
                            className="text-xs font-black uppercase px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 cursor-pointer"
                        >
                            Reset (0)
                        </button>
                    </div>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-1.5 border border-white/5 gap-2">
                            <span className="font-bold text-gray-300">Daily Art Quota</span>
                            <div className="flex items-center gap-1.5">
                                <span className={`font-mono font-black ${quotaReached ? 'text-rose-400' : 'text-amber-300'}`}>
                                    {studioCfg.imagesGeneratedToday ?? 0} /
                                </span>
                                <select
                                    value={studioCfg.dailyImageQuota ?? 20}
                                    onChange={(e) => runAction('daily_quota', { action: 'update_studio_limits', dailyImageQuota: Number(e.target.value) })}
                                    className="bg-[#141a29] border border-white/15 rounded-lg px-2 py-1 text-xs font-black text-white cursor-pointer"
                                >
                                    {[20, 50, 100, 200, 500, 1000, 5000].map(q => (
                                        <option key={q} value={q}>{q}/day</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-1.5 border border-white/5 gap-2">
                            <span className="font-bold text-gray-300">Rate Limit & Hits</span>
                            <div className="flex items-center gap-2">
                                <select
                                    value={studioCfg.rateLimitRpm ?? 10}
                                    onChange={(e) => runAction('rpm_limit', { action: 'update_studio_limits', rateLimitRpm: Number(e.target.value) })}
                                    className="bg-[#141a29] border border-white/15 rounded-lg px-2 py-1 text-xs font-black text-white cursor-pointer"
                                >
                                    {[5, 10, 15, 30, 60, 120].map(rpm => (
                                        <option key={rpm} value={rpm}>{rpm} RPM</option>
                                    ))}
                                </select>
                                <span className="font-mono text-xs font-black text-emerald-300">{studioCfg.apiMetrics?.totalSuccess ?? 0} OK</span>
                                <span className={`font-mono text-xs font-black ${(studioCfg.apiMetrics?.totalErrors ?? 0) > 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                                    {studioCfg.apiMetrics?.totalErrors ?? 0} Err
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 1. AUDIOBOOK SEQUENTIAL PIPELINE WORKER & 4 SEPARATE QUEUES */}
            <section className="rounded-2xl bg-[#0d111a] border border-white/10 p-5 space-y-5">
                {/* Single-Row Header + Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Sparkles className="w-6 h-6 text-amber-400 shrink-0" />
                        <h2 className="text-xl font-black text-white">Audiobook Sequential Pipeline</h2>
                        {studioStatus.isRunning ? (
                            <span className="px-3 py-1 rounded-lg text-sm font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                                {studioStatus.activeTask || 'RUNNING'}
                            </span>
                        ) : !studioCfg.enabled ? (
                            <span className="px-3 py-1 rounded-lg text-sm font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                PAUSED
                            </span>
                        ) : quotaReached && totals.art.pendingChapters > 0 ? (
                            <span className="px-3 py-1 rounded-lg text-sm font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                QUOTA REACHED ({studioCfg.imagesGeneratedToday}/{studioCfg.dailyImageQuota})
                            </span>
                        ) : totalFailedChapters > 0 ? (
                            <span className="px-3 py-1 rounded-lg text-sm font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                {totalFailedChapters} FAILED
                            </span>
                        ) : (
                            <span className="px-3 py-1 rounded-lg text-sm font-black uppercase bg-white/10 text-gray-300 border border-white/15">
                                IDLE
                            </span>
                        )}
                        <select
                            value={studioCfg.scheduleMode || 'continuous_low_cpu'}
                            onChange={(e) => runAction('sched_mode', { action: 'update_studio_limits', scheduleMode: e.target.value })}
                            title="Worker schedule mode"
                            className="bg-[#141a29] border border-white/15 rounded-xl px-3 py-2 text-sm font-bold text-white cursor-pointer"
                        >
                            <option value="continuous_low_cpu">Continuous (24/7)</option>
                            <option value="hourly">Hourly Batch</option>
                            <option value="overnight">Overnight (01:00–07:00)</option>
                            <option value="manual_only">Manual Only</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                            onClick={() => runAction('run_worker', { action: 'trigger_audiobook_worker' })}
                            disabled={busyKey === 'run_worker'}
                            title="Run pipeline queue immediately (bypasses daily quota and retries failed chapters)"
                            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-base flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                            <Play className="w-5 h-5 fill-current" />
                            Run
                        </button>
                        <button
                            onClick={() => runAction('toggle_worker', { action: 'toggle_audiobook_worker', enabled: !studioCfg.enabled })}
                            disabled={busyKey === 'toggle_worker'}
                            title={studioCfg.enabled ? 'Pause background worker' : 'Resume background worker'}
                            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-base flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                            {studioCfg.enabled ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                            {studioCfg.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <button
                            onClick={() => runAction('purge_svg', { action: 'purge_fake_svg' })}
                            disabled={busyKey === 'purge_svg'}
                            title="Purge any legacy placeholder SVG files"
                            className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 font-bold text-base flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                            <Trash2 className="w-5 h-5" />
                            Purge
                        </button>
                        <Link
                            href="/discover?tab=audiobooks"
                            title="Open Audiobooks in Media tab"
                            className="px-4 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 font-bold text-base flex items-center gap-2 whitespace-nowrap shrink-0"
                        >
                            <BookOpen className="w-5 h-5" />
                            Media
                        </Link>
                    </div>
                </div>

                {/* Live Execution / Idle Reason Bar */}
                <div className={`rounded-xl p-4 border flex flex-wrap items-center justify-between gap-4 ${
                    studioStatus.isRunning
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : quotaReached && totals.art.pendingChapters > 0
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-black/40 border-white/10'
                }`}>
                    <div className="space-y-1 min-w-[260px] flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-sm font-black uppercase tracking-wider text-gray-400">Active Step:</span>
                            <span className="text-lg font-black text-white">
                                {studioStatus.isRunning
                                    ? `[${studioStatus.activeTask || 'Working'}] ${studioStatus.activeBookTitle || 'Book'} — ${studioStatus.activeChapterTitle || ''}`
                                    : (studioStatus.idleReason || studioStatus.lastLog || 'Idle')}
                            </span>
                        </div>
                        {studioStatus.isRunning && studioStatus.lastLog && (
                            <p className="text-base text-emerald-300 font-semibold">{studioStatus.lastLog}</p>
                        )}
                    </div>

                    {studioStatus.isRunning && (
                        <div className="w-full md:w-72 space-y-1">
                            <div className="flex justify-between text-sm font-black text-emerald-300">
                                <span>{studioStatus.activeTask || 'Processing'}</span>
                                <span>{studioStatus.progress ?? 0}%</span>
                            </div>
                            <div className="w-full h-3 rounded-full bg-black/60 overflow-hidden border border-white/10">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                                    style={{ width: `${Math.max(5, studioStatus.progress || 10)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* 4 SEPARATE SEQUENTIAL PIPELINE QUEUES */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {/* Queue 1: Stage 1 Transcription (Audio -> Timestamped Text) */}
                    <div className="rounded-xl bg-black/40 border border-indigo-500/30 p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-indigo-300 font-black text-base">
                                    <Mic className="w-5 h-5 shrink-0" />
                                    <span>1. Audio → Text</span>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 text-xs font-black uppercase">
                                    {sttUsesLocalCpu ? 'CPU STT' : 'API STT'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400 font-bold">
                                    {totals.transcriptions.pending} queued
                                    {totals.transcriptions.failed > 0 && <span className="text-rose-400 ml-1">({totals.transcriptions.failed} err)</span>}
                                </span>
                                <span className="font-mono font-black text-white text-base">
                                    {totals.transcriptions.done}/{totals.transcriptions.total} Ch
                                </span>
                            </div>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 pt-1">
                                {(queueBreakdown.transcriptionQueue || []).length === 0 ? (
                                    <div className="text-xs text-gray-500 font-bold py-2">Queue empty — all chapters transcribed</div>
                                ) : (
                                    (queueBreakdown.transcriptionQueue || []).slice(0, 6).map((item: any) => (
                                        <div key={item.chapterKey} className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs flex items-center justify-between gap-2">
                                            <span className="font-bold text-white truncate">{item.bookTitle} · Ch {item.chapterIndex}</span>
                                            <span className={`font-black uppercase shrink-0 ${item.status === 'processing' ? 'text-emerald-300' : item.status === 'failed' ? 'text-rose-400' : 'text-indigo-300'}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Queue 2: Stage 2 LLM Scene Detection (Timestamped Text -> Scene Transition Timestamps) */}
                    <div className="rounded-xl bg-black/40 border border-cyan-500/30 p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-cyan-300 font-black text-base">
                                    <Wand2 className="w-5 h-5 shrink-0" />
                                    <span>2. Text → Scenes</span>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 text-xs font-black uppercase">
                                    LLM
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400 font-bold">
                                    {totals.llmScenes?.detectedScenes ?? 0} scenes • {totals.llmScenes?.pendingChapters ?? 0} ch waiting
                                </span>
                                <span className="font-mono font-black text-white text-base">
                                    {totals.llmScenes?.doneChapters ?? 0}/{totals.llmScenes?.totalChapters ?? 0} Ch
                                </span>
                            </div>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 pt-1">
                                {(queueBreakdown.llmSceneQueue || []).length === 0 ? (
                                    <div className="text-xs text-gray-500 font-bold py-2">Queue empty — scene timestamps ready</div>
                                ) : (
                                    (queueBreakdown.llmSceneQueue || []).slice(0, 6).map((item: any) => (
                                        <div key={item.chapterKey} className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs flex items-center justify-between gap-2">
                                            <span className="font-bold text-white truncate">{item.bookTitle} · Ch {item.chapterIndex}</span>
                                            <span className={`font-black uppercase shrink-0 ${item.status === 'processing' ? 'text-emerald-300' : String(item.detail || '').includes('Blocked') ? 'text-amber-300' : 'text-cyan-300'}`}>
                                                {String(item.detail || '').includes('Blocked') ? 'Needs STT' : item.status}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Queue 3: Stage 3 Scene Imaging (Created Scenes -> Painted Artwork) */}
                    <div className="rounded-xl bg-black/40 border border-purple-500/30 p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-purple-300 font-black text-base">
                                    <ImageIcon className="w-5 h-5 shrink-0" />
                                    <span>3. Scenes → Art</span>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 text-xs font-black uppercase">
                                    API • Quota
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400 font-bold">
                                    {totals.art.keptScenes} painted • {totals.art.pendingChapters} ch waiting
                                </span>
                                <span className="font-mono font-black text-white text-base">
                                    {totals.art.doneChapters}/{totals.art.totalChapters} Ch
                                </span>
                            </div>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 pt-1">
                                {(queueBreakdown.artQueue || []).length === 0 ? (
                                    <div className="text-xs text-gray-500 font-bold py-2">Queue empty — all scenes painted</div>
                                ) : (
                                    (queueBreakdown.artQueue || []).slice(0, 6).map((item: any) => (
                                        <div key={item.chapterKey} className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs flex items-center justify-between gap-2">
                                            <span className="font-bold text-white truncate">{item.bookTitle} · Ch {item.chapterIndex}</span>
                                            <span className={`font-black uppercase shrink-0 ${item.status === 'processing' ? 'text-emerald-300' : String(item.detail || '').includes('Waiting') ? 'text-amber-300' : 'text-purple-300'}`}>
                                                {String(item.detail || '').includes('Waiting') ? 'Needs Scenes' : item.status}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Queue 4: Stage 1B Voice Enhancement (Audio -> Cadence-Matched .m4a) */}
                    <div className="rounded-xl bg-black/40 border border-emerald-500/30 p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-emerald-300 font-black text-base">
                                    <Volume2 className="w-5 h-5 shrink-0" />
                                    <span>1B. Audio → Voices</span>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-xs font-black uppercase">
                                    CPU • 1:1 Time
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400 font-bold">
                                    {totals.voices.pending} queued
                                    {totals.voices.failed > 0 && <span className="text-rose-400 ml-1">({totals.voices.failed} err)</span>}
                                </span>
                                <span className="font-mono font-black text-white text-base">
                                    {totals.voices.done}/{totals.voices.total} Ch
                                </span>
                            </div>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 pt-1">
                                {(queueBreakdown.voiceQueue || []).length === 0 ? (
                                    <div className="text-xs text-gray-500 font-bold py-2">Queue empty — all voices rendered</div>
                                ) : (
                                    (queueBreakdown.voiceQueue || []).slice(0, 6).map((item: any) => (
                                        <div key={item.chapterKey} className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs flex items-center justify-between gap-2">
                                            <span className="font-bold text-white truncate">{item.bookTitle} · Ch {item.chapterIndex}</span>
                                            <span className={`font-black uppercase shrink-0 ${item.status === 'processing' ? 'text-emerald-300' : 'text-emerald-200'}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Interactive Queued Books Table + Add Book Picker */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-lg font-black text-white">
                            Queued Books ({queuedBooks.length})
                        </h3>

                        {availableBooks.length > 0 && (
                            <div className="flex items-center gap-2">
                                <select
                                    value={selectedBookToAdd}
                                    onChange={(e) => setSelectedBookToAdd(e.target.value)}
                                    className="bg-[#141a29] border border-white/15 rounded-xl px-3 py-2 text-base font-bold text-white max-w-xs"
                                >
                                    <option value="">+ Add audiobook to queue...</option>
                                    {availableBooks.map((b: any) => (
                                        <option key={b.book_key} value={b.book_key}>
                                            {b.title} {b.author ? `— ${b.author}` : ''}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    disabled={!selectedBookToAdd || busyKey === 'add_book'}
                                    onClick={() => {
                                        if (!selectedBookToAdd) return;
                                        runAction('add_book', {
                                            action: 'book_queue_action',
                                            bookKey: selectedBookToAdd,
                                            subAction: 'add_queue'
                                        });
                                        setSelectedBookToAdd('');
                                    }}
                                    title="Add selected book to queue"
                                    className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-base flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                                >
                                    <Plus className="w-5 h-5" />
                                    Queue
                                </button>
                            </div>
                        )}
                    </div>

                    {queuedBooks.length === 0 ? (
                        <div className="rounded-xl bg-black/30 border border-white/10 p-5 text-base text-gray-400 font-semibold">
                            No audiobooks queued.
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {queuedBooks.map((book: any, idx: number) => {
                                const isBookActive = studioStatus.isRunning && studioStatus.activeBookKey === book.book_key;
                                const totalCh = Math.max(book.total_chapters || 0, book.synced_chapters_count || 0);
                                return (
                                    <div
                                        key={book.book_key}
                                        className={`rounded-xl p-4 border flex flex-wrap items-center justify-between gap-4 ${
                                            isBookActive
                                                ? 'bg-emerald-500/10 border-emerald-500/40'
                                                : 'bg-black/40 border-white/10'
                                        }`}
                                    >
                                        {/* Book Title + 4-Stage Pipeline Toggles */}
                                        <div className="flex items-center gap-3.5 min-w-[260px] flex-1">
                                            <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-base font-black text-gray-300 shrink-0">
                                                #{idx + 1}
                                            </span>
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    <span className="text-lg font-black text-white">
                                                        {book.title}
                                                    </span>
                                                    {book.author && (
                                                        <span className="text-sm font-bold text-gray-400">
                                                            by {book.author}
                                                        </span>
                                                    )}
                                                    {isBookActive && (
                                                        <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase">
                                                            {studioStatus.activeTask || 'Active'}
                                                        </span>
                                                    )}
                                                    {book.failed_chapters_count > 0 && (
                                                        <span
                                                            title={book.last_error || 'Chapters failed'}
                                                            className="px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-xs font-black uppercase"
                                                        >
                                                            {book.failed_chapters_count} Failed
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Clickable Stage Pills */}
                                                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                                    <button
                                                        onClick={() => runAction(`flag_stt_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'toggle_flag',
                                                            field: 'transcribe_enabled'
                                                        })}
                                                        title="Stage 1: Toggle Audio -> Timestamped Text Transcription"
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-black border cursor-pointer ${
                                                            book.transcribe_enabled
                                                                ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                                                                : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                        }`}
                                                    >
                                                        1. STT: {book.transcribed_chapters || 0}/{totalCh}
                                                    </button>

                                                    <span
                                                        title="Stage 2: LLM Scene Transitions created from timestamped transcripts"
                                                        className="px-2.5 py-1 rounded-lg text-xs font-black border bg-cyan-500/15 text-cyan-200 border-cyan-500/35"
                                                    >
                                                        2. Scenes: {book.detected_scenes_count ?? book.illustrated_scenes ?? 0}
                                                    </span>

                                                    <button
                                                        onClick={() => runAction(`flag_art_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'toggle_flag',
                                                            field: 'illustrate_enabled'
                                                        })}
                                                        title="Stage 3: Toggle Scene Painting (requires Stage 1 & 2)"
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-black border cursor-pointer ${
                                                            book.illustrate_enabled
                                                                ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                                                                : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                        }`}
                                                    >
                                                        3. Art: {book.painted_scenes_count ?? book.illustrated_scenes ?? 0}/{book.detected_scenes_count ?? book.illustrated_scenes ?? 0} painted
                                                    </button>

                                                    <button
                                                        onClick={() => runAction(`flag_voice_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'toggle_flag',
                                                            field: 'enhance_audio_enabled'
                                                        })}
                                                        title="Stage 1B: Toggle Cadence-Matched Narrator Voice Rendering"
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-black border cursor-pointer ${
                                                            book.enhance_audio_enabled
                                                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                                : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                        }`}
                                                    >
                                                        1B. Voice: {book.enhanced_chapters || 0}/{totalCh}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Direct Book Actions (Single Row) */}
                                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                                            <button
                                                onClick={() => runAction(`start_${book.book_key}`, {
                                                    action: 'book_queue_action',
                                                    bookKey: book.book_key,
                                                    subAction: 'start_now'
                                                })}
                                                title="Start running pipeline for this book right now"
                                                className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-black text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                            >
                                                <Play className="w-4 h-4 fill-current" />
                                                Start
                                            </button>

                                            {idx > 0 && (
                                                <button
                                                    onClick={() => runAction(`top_${book.book_key}`, {
                                                        action: 'book_queue_action',
                                                        bookKey: book.book_key,
                                                        subAction: 'prioritize_top'
                                                    })}
                                                    title="Move book to #1 priority in queue"
                                                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                                >
                                                    <ArrowUp className="w-4 h-4" />
                                                    Top
                                                </button>
                                            )}

                                            {book.failed_chapters_count > 0 && (
                                                <button
                                                    onClick={() => runAction(`retry_${book.book_key}`, {
                                                        action: 'book_queue_action',
                                                        bookKey: book.book_key,
                                                        subAction: 'retry_failed'
                                                    })}
                                                    title="Reset failed chapters and retry now"
                                                    className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                    Retry
                                                </button>
                                            )}

                                            <button
                                                onClick={() => runAction(`redo_${book.book_key}`, {
                                                    action: 'book_queue_action',
                                                    bookKey: book.book_key,
                                                    subAction: 'redo_art'
                                                })}
                                                title="Reset and regenerate scenes & art for this book"
                                                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-gray-200 font-bold text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                                Redo Art
                                            </button>

                                            <Link
                                                href={`/discover?tab=audiobooks&bookKey=${encodeURIComponent(book.book_key)}`}
                                                title="Open this book in Media"
                                                className="px-3.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 font-bold text-sm flex items-center gap-1.5 whitespace-nowrap"
                                            >
                                                <Sliders className="w-4 h-4" />
                                                Open
                                            </Link>

                                            <button
                                                onClick={() => runAction(`rm_${book.book_key}`, {
                                                    action: 'book_queue_action',
                                                    bookKey: book.book_key,
                                                    subAction: 'remove_queue'
                                                })}
                                                title="Remove book from queue"
                                                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-sm flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                            >
                                                <X className="w-4 h-4" />
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* 2. EPG SYNCING SCHEDULER & FREQUENCY */}
            <section className="rounded-2xl bg-[#0d111a] border border-white/10 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Tv className="w-6 h-6 text-sky-400 shrink-0" />
                        <h2 className="text-xl font-black text-white">EPG Sync Scheduler & Frequency</h2>
                        <span className="px-3 py-1 rounded-lg text-xs font-black uppercase bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            {epgSchedules.length} Provider(s) • {liveStreams.length} Active Stream(s)
                        </span>
                    </div>
                    <button
                        onClick={() => runAction('epg_sync_all', { action: 'trigger_epg_sync' })}
                        disabled={busyKey === 'epg_sync_all'}
                        title="Sync XMLTV EPG guide across all Live TV providers now"
                        className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-base flex items-center gap-2 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${epgSyncs.length > 0 ? 'animate-spin' : ''}`} />
                        Sync All EPG
                    </button>
                </div>

                {epgSchedules.length === 0 ? (
                    <div className="rounded-xl bg-black/30 border border-white/10 p-4 text-base text-gray-400 font-semibold">
                        No Live TV / IPTV providers configured yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {epgSchedules.map((epg: any) => {
                            const isSyncing = epg.status === 'downloading' || epg.status === 'parsing' || epg.status === 'saving' || epg.status === 'scanning_rules';
                            return (
                                <div key={epg.libraryId} className="rounded-xl bg-black/40 border border-white/10 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-lg font-black text-white">{epg.libraryName}</span>
                                            <span className="px-2.5 py-0.5 rounded-lg bg-sky-500/15 text-sky-300 text-xs font-mono font-black border border-sky-500/30">
                                                {(epg.programCount || 0).toLocaleString()} Progs
                                            </span>
                                            {isSyncing && (
                                                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase animate-pulse">
                                                    {epg.status} ({epg.progressPercent || 0}%)
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => runAction(`epg_sync_${epg.libraryId}`, { action: 'trigger_epg_sync', libraryId: epg.libraryId })}
                                            disabled={busyKey === `epg_sync_${epg.libraryId}` || isSyncing}
                                            title="Sync this provider's XMLTV EPG now"
                                            className="px-3.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 font-black text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                            Sync
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="rounded-lg bg-black/50 border border-white/10 p-2.5 space-y-1">
                                            <span className="text-xs font-black uppercase text-gray-400">Sync Frequency</span>
                                            <select
                                                value={epg.intervalHours ?? 24}
                                                onChange={(e) => runAction(`epg_int_${epg.libraryId}`, {
                                                    action: 'update_epg_schedule',
                                                    libraryId: epg.libraryId,
                                                    intervalHours: Number(e.target.value)
                                                })}
                                                className="w-full bg-[#141a29] border border-white/15 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white cursor-pointer"
                                            >
                                                <option value={1}>Every 1h</option>
                                                <option value={3}>Every 3h</option>
                                                <option value={6}>Every 6h</option>
                                                <option value={12}>Every 12h</option>
                                                <option value={24}>Every 24h</option>
                                                <option value={48}>Every 48h</option>
                                                <option value={0}>Manual Only</option>
                                            </select>
                                        </div>

                                        <div className="rounded-lg bg-black/50 border border-white/10 p-2.5 space-y-1">
                                            <span className="text-xs font-black uppercase text-gray-400">Channel Scope</span>
                                            <select
                                                value={epg.scope || 'all'}
                                                onChange={(e) => runAction(`epg_scope_${epg.libraryId}`, {
                                                    action: 'update_epg_schedule',
                                                    libraryId: epg.libraryId,
                                                    scope: e.target.value
                                                })}
                                                className="w-full bg-[#141a29] border border-white/15 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white cursor-pointer"
                                            >
                                                <option value="all">All Channels</option>
                                                <option value="shortlists">Shortlists Only</option>
                                            </select>
                                        </div>

                                        <div className="rounded-lg bg-black/50 border border-white/10 p-2.5 space-y-1">
                                            <span className="text-xs font-black uppercase text-gray-400">Next Auto-Sync</span>
                                            <div className="text-base font-black text-white">
                                                {epg.intervalHours > 0 ? formatNextRun(epg.nextSyncTimestamp) : 'Manual Only'}
                                            </div>
                                            <div className="text-xs text-gray-400 truncate">
                                                Last: {epg.lastSync ? new Date(epg.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* 3. SERVER SCHEDULERS: ARR BATCH SEARCH & DISK / TORRENT GUARD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Arr Batch Search Scheduler */}
                <section className="rounded-2xl bg-[#0d111a] border border-white/10 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Search className="w-6 h-6 text-indigo-400 shrink-0" />
                            <h2 className="text-xl font-black text-white">Arr Batch Search</h2>
                            <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase border ${
                                arrScheduler.enabled
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}>
                                {arrScheduler.enabled ? 'Enabled' : 'Paused'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => runAction('arr_run', { action: 'update_arr_scheduler', runNow: true })}
                                disabled={busyKey === 'arr_run'}
                                title="Run Sonarr/Radarr/Lidarr missing search batch now"
                                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-base flex items-center gap-2 whitespace-nowrap cursor-pointer"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                Run
                            </button>
                            <button
                                onClick={() => runAction('arr_toggle', { action: 'update_arr_scheduler', enabled: !arrScheduler.enabled })}
                                disabled={busyKey === 'arr_toggle'}
                                title={arrScheduler.enabled ? 'Pause Arr Scheduler' : 'Enable Arr Scheduler'}
                                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-base flex items-center gap-2 whitespace-nowrap cursor-pointer"
                            >
                                {arrScheduler.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                {arrScheduler.enabled ? 'Pause' : 'Resume'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-1">
                            <span className="text-xs font-black uppercase text-gray-400">Next Run</span>
                            <div className="text-lg font-black text-white">
                                {arrScheduler.enabled ? formatNextRun(arrScheduler.nextRunTimestamp) : 'Paused'}
                            </div>
                        </div>

                        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-1">
                            <span className="text-xs font-black uppercase text-gray-400">Interval</span>
                            <select
                                value={arrScheduler.interval || 30}
                                onChange={(e) => runAction('arr_int', { action: 'update_arr_scheduler', interval: Number(e.target.value) })}
                                className="w-full bg-[#141a29] border border-white/15 rounded-lg px-2.5 py-1.5 text-base font-bold text-white cursor-pointer"
                            >
                                {[15, 30, 60, 120, 360, 720].map(m => (
                                    <option key={m} value={m}>Every {m}m</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-1">
                            <span className="text-xs font-black uppercase text-gray-400">Batch Limit</span>
                            <select
                                value={arrScheduler.batchSize || 10}
                                onChange={(e) => runAction('arr_batch', { action: 'update_arr_scheduler', batchSize: Number(e.target.value) })}
                                className="w-full bg-[#141a29] border border-white/15 rounded-lg px-2.5 py-1.5 text-base font-bold text-white cursor-pointer"
                            >
                                {[1, 5, 10, 20, 50].map(b => (
                                    <option key={b} value={b}>{b} items</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* Smart Disk Guard & qBittorrent Cleanup */}
                <section className="rounded-2xl bg-[#0d111a] border border-white/10 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <HardDrive className="w-6 h-6 text-emerald-400 shrink-0" />
                            <h2 className="text-xl font-black text-white">Disk Guard & qBit Cleanup</h2>
                            <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase border ${
                                arrScheduler.diskAutocleanEnabled
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-white/10 text-gray-300 border-white/15'
                            }`}>
                                {arrScheduler.diskAutocleanEnabled ? 'Auto-Clean ON' : 'Auto-Clean OFF'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => runAction('clean_run', { action: 'update_cleanup_scheduler', runNow: true })}
                                disabled={busyKey === 'clean_run'}
                                title="Run torrent & disk cleanup immediately"
                                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-base flex items-center gap-2 whitespace-nowrap cursor-pointer"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                Clean
                            </button>
                            <button
                                onClick={() => runAction('clean_toggle', {
                                    action: 'update_cleanup_scheduler',
                                    diskAutocleanEnabled: !arrScheduler.diskAutocleanEnabled
                                })}
                                disabled={busyKey === 'clean_toggle'}
                                title="Toggle Smart Disk Auto-Clean"
                                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-base flex items-center gap-2 whitespace-nowrap cursor-pointer"
                            >
                                {arrScheduler.diskAutocleanEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                {arrScheduler.diskAutocleanEnabled ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-1">
                            <span className="text-xs font-black uppercase text-gray-400">Disk Threshold</span>
                            <select
                                value={arrScheduler.diskThresholdPercent || 85}
                                onChange={(e) => runAction('disk_thresh', {
                                    action: 'update_cleanup_scheduler',
                                    diskThresholdPercent: Number(e.target.value)
                                })}
                                className="w-full bg-[#141a29] border border-white/15 rounded-lg px-2.5 py-1.5 text-base font-bold text-white cursor-pointer"
                            >
                                {[75, 80, 85, 90, 95].map(p => (
                                    <option key={p} value={p}>Clean above {p}%</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-1">
                            <span className="text-xs font-black uppercase text-gray-400">qBit Check Interval</span>
                            <select
                                value={arrScheduler.qbitCleanupIntervalMin || 15}
                                onChange={(e) => runAction('qbit_int', {
                                    action: 'update_cleanup_scheduler',
                                    qbitCleanupIntervalMin: Number(e.target.value)
                                })}
                                className="w-full bg-[#141a29] border border-white/15 rounded-lg px-2.5 py-1.5 text-base font-bold text-white cursor-pointer"
                            >
                                {[5, 10, 15, 30, 60].map(m => (
                                    <option key={m} value={m}>Every {m}m</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>
            </div>

            {/* 4. DVR RECORDINGS & LIVE SERVER LOG */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* DVR Recordings */}
                <section className="rounded-2xl bg-[#0d111a] border border-white/10 p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Radio className="w-6 h-6 text-rose-400" />
                            <h2 className="text-lg font-black text-white">DVR Recordings</h2>
                        </div>
                        <span className="text-sm font-black text-gray-400">
                            {dvrActive.length} Rec • {dvrScheduled.length} Sched
                        </span>
                    </div>
                    {dvrActive.length === 0 && dvrScheduled.length === 0 ? (
                        <div className="text-base text-gray-400 font-semibold">No active or scheduled recordings.</div>
                    ) : (
                        <div className="space-y-2">
                            {dvrActive.map((rec: any) => (
                                <div key={rec.id} className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-base font-black text-white truncate">{rec.title}</div>
                                        <div className="text-xs font-bold text-rose-300">{rec.channel_name} • Recording</div>
                                    </div>
                                    <button
                                        onClick={() => runAction(`stop_dvr_${rec.id}`, { action: 'stop_dvr_recording', recordingId: rec.id })}
                                        title="Stop recording"
                                        className="px-3 py-1.5 rounded-lg bg-rose-500 text-white font-black text-xs flex items-center gap-1 cursor-pointer"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                        Stop
                                    </button>
                                </div>
                            ))}
                            {dvrScheduled.slice(0, 3).map((rec: any) => (
                                <div key={rec.id} className="rounded-xl bg-black/40 border border-white/10 p-3 flex items-center justify-between gap-2">
                                    <span className="text-base font-bold text-white truncate">{rec.title}</span>
                                    <span className="text-xs font-bold text-indigo-300 whitespace-nowrap">
                                        {new Date(rec.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Active Audio Transfers & Recent Logs */}
                <section className="rounded-2xl bg-[#0d111a] border border-white/10 p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Terminal className="w-6 h-6 text-emerald-400" />
                            <h2 className="text-lg font-black text-white">Live Server Log</h2>
                        </div>
                        <span className="text-sm font-bold text-gray-400">
                            {transfersActive.length} Transfers
                        </span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {(studio?.history || []).slice(0, 6).map((h: any, i: number) => (
                            <div key={h.id || i} className="text-sm font-mono bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2">
                                <span className={h.status === 'failed' ? 'text-rose-300 truncate' : 'text-gray-200 truncate'}>
                                    [{(h.queueType || h.taskType || 'TASK').toUpperCase()}] {h.bookTitle}{h.chapterTitle ? ` — ${h.chapterTitle}` : ''}: {h.detail || h.details}
                                </span>
                                <span className="text-xs text-gray-500 shrink-0">
                                    {h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                                </span>
                            </div>
                        ))}
                        {recentLogs.slice(0, 4).map((l: any) => (
                            <div key={l.id} className="text-sm font-mono bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-gray-300 truncate">
                                [{l.category}] {l.message}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

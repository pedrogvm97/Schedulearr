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
    Wand2,
    Calendar,
    FileText,
    Layers,
    ChevronDown,
    ChevronRight,
    Zap,
    Headphones
} from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';

export type TaskLibraryTab = 'audiobooks' | 'tv_movies' | 'music' | 'system';

export default function TasksPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [selectedBookToAdd, setSelectedBookToAdd] = useState<string>('');
    const [nowMs, setNowMs] = useState<number>(Date.now());
    const [activeLibraryTab, setActiveLibraryTab] = useState<TaskLibraryTab>('audiobooks');
    const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: React.ReactNode;
        confirmText?: string;
        cancelText?: string;
        variant?: 'danger' | 'warning' | 'primary';
        onConfirm: () => void | Promise<void>;
    } | null>(null);

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
    const queueBreakdown = {
        transcriptionQueue: Array.isArray(studio?.queueBreakdown?.transcriptionQueue) ? studio.queueBreakdown.transcriptionQueue : [],
        llmSceneQueue: Array.isArray(studio?.queueBreakdown?.llmSceneQueue) ? studio.queueBreakdown.llmSceneQueue : [],
        artQueue: Array.isArray(studio?.queueBreakdown?.artQueue) ? studio.queueBreakdown.artQueue : [],
        voiceQueue: Array.isArray(studio?.queueBreakdown?.voiceQueue) ? studio.queueBreakdown.voiceQueue : []
    };
    const queuedBooks: any[] = Array.isArray(studio?.queuedBooks) ? studio.queuedBooks : [];
    const availableBooks: any[] = Array.isArray(studio?.availableBooks) ? studio.availableBooks : [];
    const arrScheduler = data?.arrScheduler || {};
    const calendarSync = data?.calendarSync || { enabled: true, intervalMin: 15, cachedCount: 0, isRunning: false };
    const liveStreams: any[] = Array.isArray(data?.liveStreams) ? data.liveStreams : [];
    const epgSyncs: any[] = Array.isArray(data?.epgSyncs) ? data.epgSyncs : [];
    const epgSchedules: any[] = Array.isArray(data?.epgSchedules) ? data.epgSchedules : [];
    const dvrActive: any[] = Array.isArray(data?.dvr?.active) ? data.dvr.active : [];
    const dvrScheduled: any[] = Array.isArray(data?.dvr?.scheduled) ? data.dvr.scheduled : [];
    const transfersActive: any[] = Array.isArray(data?.transfers?.active) ? data.transfers.active : [];
    const recentLogs: any[] = Array.isArray(data?.recentSystemLogs) ? data.recentSystemLogs : [];

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
    const isLlmRunning = studioStatus.isRunning && (activeTaskText.includes('llm') || (activeTaskText.includes('scene') && !activeTaskText.includes('paint')));
    const isArtRunning = studioStatus.isRunning && (activeTaskText.includes('paint') || activeTaskText.includes('illustrat') || activeTaskText.includes('cover'));
    const isVoiceRunning = studioStatus.isRunning && (activeTaskText.includes('voice') || activeTaskText.includes('audio'));
    const sttUsesLocalCpu = !studioCfg.sttEngine || studioCfg.sttEngine === 'local_whisper' || (studioCfg.sttEngine === 'auto' && (studioCfg.apiKeysCount ?? 0) === 0);

    const isLocalTasksActive = isVoiceRunning || (isSttRunning && sttUsesLocalCpu);
    const isAiCloudTasksActive = isArtRunning || isLlmRunning || (isSttRunning && !sttUsesLocalCpu);

    return (
        <div className="min-h-screen bg-[#07090e] text-white px-4 py-5 md:px-8 max-w-[1750px] mx-auto space-y-6">
            {/* Top Header Bar */}
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

                <div className="flex flex-wrap items-center gap-3">
                    {toast && (
                        <div className="px-3.5 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-sm font-bold">
                            {toast}
                        </div>
                    )}
                    <button
                        onClick={() => runAction('toggle_ai_pause', { action: 'set_ai_paused', paused: !studioCfg.aiPaused })}
                        disabled={busyKey === 'toggle_ai_pause'}
                        title={
                            studioCfg.aiPaused
                                ? 'AI features are globally paused. Click to resume AI transcription, scening, and image generation.'
                                : 'Immediately halt all AI features (transcription, scening, image generation) to prevent API calls.'
                        }
                        className={`px-4 py-2.5 rounded-xl text-base font-black flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all disabled:opacity-50 ${
                            studioCfg.aiPaused
                                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg'
                                : 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200'
                        }`}
                    >
                        {studioCfg.aiPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5" />}
                        <span>{studioCfg.aiPaused ? 'Resume AI' : 'Pause AI'}</span>
                    </button>
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

            {/* ── Library Subtabs Navigation ── */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-white/10">
                <button
                    type="button"
                    onClick={() => setActiveLibraryTab('audiobooks')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        activeLibraryTab === 'audiobooks'
                            ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                            : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10'
                    }`}
                >
                    <BookOpen size={18} />
                    <span>Audiobooks</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveLibraryTab('tv_movies')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        activeLibraryTab === 'tv_movies'
                            ? 'bg-sky-500 text-black shadow-lg shadow-sky-500/20'
                            : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10'
                    }`}
                >
                    <Tv size={18} />
                    <span>TV & Movies</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveLibraryTab('music')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        activeLibraryTab === 'music'
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                            : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10'
                    }`}
                >
                    <Radio size={18} />
                    <span>Music</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveLibraryTab('system')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        activeLibraryTab === 'system'
                            ? 'bg-purple-500 text-black shadow-lg shadow-purple-500/20'
                            : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10'
                    }`}
                >
                    <Terminal size={18} />
                    <span>System & Logs</span>
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 1: AUDIOBOOKS (Local CPU vs AI Cloud Tasks + Collapsible Queue)
               ═══════════════════════════════════════════════════════════════════ */}
            {activeLibraryTab === 'audiobooks' && (
                <div className="space-y-6">
                    {/* Active Step Live Running Banner */}
                    <div className={`rounded-2xl p-5 border flex flex-wrap items-center justify-between gap-4 ${
                        studioStatus.isRunning
                            ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                            : quotaReached && totals.art.pendingChapters > 0
                            ? 'bg-rose-500/10 border-rose-500/30'
                            : 'bg-[#0d111a] border-white/10'
                    }`}>
                        <div className="space-y-1.5 min-w-[280px] flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Current Step:</span>
                                <span className="text-lg font-black text-white">
                                    {studioStatus.isRunning
                                        ? `[${studioStatus.activeTask || 'Working'}] ${studioStatus.activeBookTitle || 'Audiobook'} — ${studioStatus.activeChapterTitle || ''}`
                                        : (studioStatus.idleReason || studioStatus.lastLog || 'Pipeline Ready')}
                                </span>
                            </div>
                            {studioStatus.isRunning && studioStatus.lastLog && (
                                <p className="text-sm text-emerald-300 font-semibold">{studioStatus.lastLog}</p>
                            )}
                        </div>

                        {studioStatus.isRunning && (
                            <div className="w-full md:w-80 space-y-1.5">
                                <div className="flex justify-between text-xs font-black text-emerald-300">
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

                        <div className="flex items-center gap-2.5">
                            <button
                                onClick={() => runAction('run_worker', { action: 'trigger_audiobook_worker' })}
                                disabled={busyKey === 'run_worker'}
                                title="Run pipeline queue immediately"
                                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50 shadow-md"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                <span>Run</span>
                            </button>
                            <button
                                onClick={() => runAction('toggle_worker', { action: 'toggle_audiobook_worker', enabled: !studioCfg.enabled })}
                                disabled={busyKey === 'toggle_worker'}
                                title={studioCfg.enabled ? 'Pause background worker' : 'Resume background worker'}
                                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                                {studioCfg.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                <span>{studioCfg.enabled ? 'Pause' : 'Resume'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Clean Division: LOCAL TASKS (CPU) vs AI CLOUD TASKS (API & QUOTA) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ── 1. Local Tasks (Server / CPU) ── */}
                        <div className="rounded-3xl bg-[#0d111a] border border-emerald-500/30 p-6 space-y-5 shadow-xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                        <Cpu size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h3 className="text-xl font-black text-white">Local Tasks</h3>
                                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                Server CPU • 0 API Cost
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 font-semibold mt-0.5">Whisper STT audio transcription & narrator voice DSP</p>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                                    isLocalTasksActive
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                                        : 'bg-white/5 text-gray-400 border border-white/10'
                                }`}>
                                    {isLocalTasksActive ? 'Active' : 'Idle'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Stage 1: Transcription */}
                                <div className="rounded-2xl bg-black/40 border border-indigo-500/30 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-indigo-300 font-black text-sm">
                                            <Mic size={18} />
                                            <span>1. Audio → Text</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.transcriptions.done}/{totals.transcriptions.total} Ch
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-semibold">
                                        {totals.transcriptions.pending} queued • {totals.transcriptions.failed > 0 ? `${totals.transcriptions.failed} errors` : '0 errors'}
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-indigo-500 transition-all duration-300"
                                            style={{
                                                width: `${totals.transcriptions.total > 0 ? Math.min(100, Math.round((totals.transcriptions.done / totals.transcriptions.total) * 100)) : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Stage 1B: Voice DSP */}
                                <div className="rounded-2xl bg-black/40 border border-emerald-500/30 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-emerald-300 font-black text-sm">
                                            <Volume2 size={18} />
                                            <span>1B. Audio → Voice</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.voices.done}/{totals.voices.total} Ch
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-semibold">
                                        {totals.voices.pending} queued • {totals.voices.failed > 0 ? `${totals.voices.failed} errors` : '0 errors'}
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-emerald-500 transition-all duration-300"
                                            style={{
                                                width: `${totals.voices.total > 0 ? Math.min(100, Math.round((totals.voices.done / totals.voices.total) * 100)) : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── 2. AI Cloud Tasks (API & Quota-Gated) ── */}
                        <div className="rounded-3xl bg-[#0d111a] border border-purple-500/30 p-6 space-y-5 shadow-xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/40">
                                        <Brain size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h3 className="text-xl font-black text-white">AI Cloud Tasks</h3>
                                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                                API • Quota-Gated
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 font-semibold mt-0.5">LLM scene transition analysis & Flux artwork painting</p>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                                    isAiCloudTasksActive
                                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse'
                                        : 'bg-white/5 text-gray-400 border border-white/10'
                                }`}>
                                    {isAiCloudTasksActive ? 'Active' : 'Idle'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Stage 2: LLM Scene Detection */}
                                <div className="rounded-2xl bg-black/40 border border-cyan-500/30 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-cyan-300 font-black text-sm">
                                            <Wand2 size={18} />
                                            <span>2. Text → Scenes</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.llmScenes?.doneChapters ?? 0}/{totals.llmScenes?.totalChapters ?? 0} Ch
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-semibold">
                                        {totals.llmScenes?.detectedScenes ?? 0} scenes • {totals.llmScenes?.pendingChapters ?? 0} waiting
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-cyan-500 transition-all duration-300"
                                            style={{
                                                width: `${(totals.llmScenes?.totalChapters ?? 0) > 0 ? Math.min(100, Math.round(((totals.llmScenes?.doneChapters ?? 0) / totals.llmScenes.totalChapters) * 100)) : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Stage 3: Scene Art Painting & Daily Quota */}
                                <div className="rounded-2xl bg-black/40 border border-purple-500/30 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-300 font-black text-sm">
                                            <ImageIcon size={18} />
                                            <span>3. Scenes → Art</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.art.doneChapters}/{totals.art.totalChapters} Ch
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-400 font-semibold">
                                            Quota: <span className={quotaReached ? 'text-rose-400 font-black' : 'text-amber-300 font-black'}>
                                                {studioCfg.imagesGeneratedToday ?? 0}/{studioCfg.dailyImageQuota ?? 20}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => runAction('reset_quota_art', { action: 'update_studio_limits', resetDailyUsage: true })}
                                            className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer"
                                            title="Reset daily image count to 0"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-purple-500 transition-all duration-300"
                                            style={{
                                                width: `${totals.art.totalChapters > 0 ? Math.min(100, Math.round((totals.art.doneChapters / totals.art.totalChapters) * 100)) : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Collapsible Queued Books Drawer ── */}
                    <div className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 space-y-4 shadow-2xl">
                        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/10">
                            <button
                                type="button"
                                onClick={() => setIsQueueCollapsed(!isQueueCollapsed)}
                                className="flex items-center gap-3 text-left cursor-pointer group"
                            >
                                <div className="p-2 rounded-xl bg-white/5 group-hover:bg-white/10 text-gray-300 transition-colors">
                                    {isQueueCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                                </div>
                                <h3 className="text-xl font-black text-white">
                                    Queued Books ({queuedBooks.length})
                                </h3>
                            </button>

                            {availableBooks.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <select
                                        value={selectedBookToAdd}
                                        onChange={(e) => setSelectedBookToAdd(e.target.value)}
                                        className="bg-[#141a29] border border-white/15 rounded-xl px-3 py-2 text-sm font-bold text-white max-w-xs"
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
                                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Queue
                                    </button>
                                </div>
                            )}
                        </div>

                        {!isQueueCollapsed && (
                            <div className="space-y-3 pt-2">
                                {queuedBooks.length === 0 ? (
                                    <div className="rounded-2xl bg-black/30 border border-white/10 p-6 text-center text-sm font-semibold text-gray-400">
                                        No audiobooks queued. Select a book above or enable auto-clean/pipeline in settings.
                                    </div>
                                ) : (
                                    queuedBooks.map((book: any, idx: number) => {
                                        const isBookActive = studioStatus.isRunning && studioStatus.activeBookKey === book.book_key;
                                        const totalCh = Math.max(book.total_chapters || 0, book.synced_chapters_count || 0, 1);
                                        const isAutoOn = book.is_queued === 1 || Boolean(book.transcribe_enabled && book.illustrate_enabled);

                                        return (
                                            <div
                                                key={book.book_key}
                                                className={`rounded-2xl p-4 border flex items-center justify-between gap-4 flex-nowrap overflow-x-auto ${
                                                    isBookActive
                                                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg'
                                                        : 'bg-black/40 border-white/10 hover:border-white/20'
                                                }`}
                                            >
                                                {/* Book Title & Index */}
                                                <div className="flex items-center gap-3 shrink-0 min-w-[200px] max-w-[260px]">
                                                    <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-sm font-black text-gray-300 shrink-0">
                                                        #{idx + 1}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <h4 className="text-base font-black text-white truncate" title={book.title}>
                                                            {book.title}
                                                        </h4>
                                                        {book.author && (
                                                            <p className="text-xs text-gray-400 font-bold truncate">
                                                                {book.author}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Explicit Auto Toggle Pill */}
                                                <button
                                                    type="button"
                                                    onClick={() => runAction(`auto_toggle_${book.book_key}`, {
                                                        action: 'book_queue_action',
                                                        bookKey: book.book_key,
                                                        subAction: 'toggle_flag',
                                                        field: 'transcribe_enabled'
                                                    })}
                                                    title={isAutoOn ? "Auto-processing is active for this book" : "Auto-processing is paused"}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                                        isAutoOn
                                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                    }`}
                                                >
                                                    <Zap size={13} className={isAutoOn ? "fill-current" : ""} />
                                                    <span>{isAutoOn ? 'AUTO ON' : 'PAUSED'}</span>
                                                </button>

                                                {/* Stage Progress Meters (Single-line, pure symbols + counts with tooltips) */}
                                                <div className="flex items-center gap-2 shrink-0 flex-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => runAction(`flag_stt_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'toggle_flag',
                                                            field: 'transcribe_enabled'
                                                        })}
                                                        title={`Stage 1: Speech-to-Text Transcription (${book.transcribed_chapters || 0}/${totalCh} chapters)`}
                                                        className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-black border flex items-center gap-1.5 cursor-pointer shrink-0 ${
                                                            book.transcribe_enabled
                                                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                                                : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                        }`}
                                                    >
                                                        <FileText size={15} />
                                                        <span>{book.transcribed_chapters || 0}/{totalCh}</span>
                                                    </button>

                                                    <div
                                                        title={`Stage 2: LLM Scene Detection (${book.detected_scenes_count ?? book.total_scenes ?? 0} scenes detected across ${book.scened_chapters_count ?? book.scened_chapters ?? 0}/${totalCh} chapters)`}
                                                        className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-black border bg-cyan-500/15 text-cyan-300 border-cyan-500/35 flex items-center gap-1.5 shrink-0"
                                                    >
                                                        <Wand2 size={15} />
                                                        <span>{book.detected_scenes_count ?? book.total_scenes ?? 0} Sc</span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => runAction(`flag_art_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'toggle_flag',
                                                            field: 'illustrate_enabled'
                                                        })}
                                                        title={`Stage 3: Scene Artwork Painting (${book.painted_scenes_count ?? book.illustrated_scenes ?? 0}/${book.detected_scenes_count ?? book.total_scenes ?? 0} scenes painted)`}
                                                        className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-black border flex items-center gap-1.5 cursor-pointer shrink-0 ${
                                                            book.illustrate_enabled
                                                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                                                : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                        }`}
                                                    >
                                                        <ImageIcon size={15} />
                                                        <span>{book.painted_scenes_count ?? book.illustrated_scenes ?? 0}/{book.detected_scenes_count ?? book.total_scenes ?? 0}</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => runAction(`flag_voice_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'toggle_flag',
                                                            field: 'enhance_audio_enabled'
                                                        })}
                                                        title={`Stage 1B: Narrator Voice Processing (${book.enhanced_chapters || 0}/${totalCh} chapters)`}
                                                        className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-black border flex items-center gap-1.5 cursor-pointer shrink-0 ${
                                                            book.enhance_audio_enabled
                                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                                : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                        }`}
                                                    >
                                                        <Headphones size={15} />
                                                        <span>{book.enhanced_chapters || 0}/{totalCh}</span>
                                                    </button>
                                                </div>

                                                {/* Single-Row Action Controls (Pure symbols + tooltips) */}
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => runAction(`start_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'start_now'
                                                        })}
                                                        title="Start running pipeline for this book immediately"
                                                        className="p-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black transition-all cursor-pointer shadow"
                                                    >
                                                        <Play size={16} className="fill-current" />
                                                    </button>

                                                    {idx > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`top_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'prioritize_top'
                                                            })}
                                                            title="Move book to top of priority queue"
                                                            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                                                        >
                                                            <ArrowUp size={16} />
                                                        </button>
                                                    )}

                                                    {book.failed_chapters_count > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`retry_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'retry_failed'
                                                            })}
                                                            title="Retry failed chapters"
                                                            className="p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all cursor-pointer"
                                                        >
                                                            <RotateCcw size={16} />
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        disabled={(book.transcribed_chapters || 0) === 0}
                                                        onClick={() => runAction(`redo_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'redo_art'
                                                        })}
                                                        title={(book.transcribed_chapters || 0) === 0 ? 'Requires transcription first' : 'Redo scene detection & artwork'}
                                                        className="p-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-all cursor-pointer disabled:opacity-30"
                                                    >
                                                        <Sparkles size={16} />
                                                    </button>

                                                    <Link
                                                        href={`/discover?tab=audiobooks&bookKey=${encodeURIComponent(book.book_key)}`}
                                                        title="Open in Media Manager"
                                                        className="p-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 transition-all cursor-pointer"
                                                    >
                                                        <Sliders size={16} />
                                                    </Link>

                                                    <button
                                                        type="button"
                                                        onClick={() => runAction(`rm_${book.book_key}`, {
                                                            action: 'book_queue_action',
                                                            bookKey: book.book_key,
                                                            subAction: 'remove_queue'
                                                        })}
                                                        title="Remove from queue"
                                                        className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all cursor-pointer"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 2: TV & MOVIES (Arr Batch Search, Release Calendar & EPG/DVR)
               ═══════════════════════════════════════════════════════════════════ */}
            {activeLibraryTab === 'tv_movies' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Arr Batch Search Scheduler */}
                        <section className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 space-y-5 shadow-2xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
                                        <Search size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-white">Arr Batch Search</h3>
                                        <p className="text-xs text-gray-400 font-semibold mt-0.5">Automated missing episode & movie scans</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => runAction('arr_run', { action: 'update_arr_scheduler', runNow: true })}
                                        disabled={busyKey === 'arr_run'}
                                        title="Run missing search batch now"
                                        className="p-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white cursor-pointer shadow"
                                    >
                                        <Play size={18} className="fill-current" />
                                    </button>
                                    <button
                                        onClick={() => runAction('arr_toggle', { action: 'update_arr_scheduler', enabled: !arrScheduler.enabled })}
                                        disabled={busyKey === 'arr_toggle'}
                                        title={arrScheduler.enabled ? 'Pause Arr Scheduler' : 'Enable Arr Scheduler'}
                                        className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                                    >
                                        {arrScheduler.enabled ? <Pause size={18} /> : <Play size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                                    <span className="text-xs font-black uppercase text-gray-400">Interval</span>
                                    <select
                                        value={arrScheduler.interval || 30}
                                        onChange={(e) => runAction('arr_int', { action: 'update_arr_scheduler', interval: Number(e.target.value) })}
                                        className="w-full bg-[#141a29] border border-white/15 rounded-xl px-3 py-2 text-sm font-bold text-white cursor-pointer outline-none"
                                    >
                                        {[15, 30, 60, 120, 360, 720].map(m => (
                                            <option key={m} value={m}>Every {m}m</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                                    <span className="text-xs font-black uppercase text-gray-400">Batch Limit</span>
                                    <select
                                        value={arrScheduler.batchSize || 10}
                                        onChange={(e) => runAction('arr_batch', { action: 'update_arr_scheduler', batchSize: Number(e.target.value) })}
                                        className="w-full bg-[#141a29] border border-white/15 rounded-xl px-3 py-2 text-sm font-bold text-white cursor-pointer outline-none"
                                    >
                                        {[1, 5, 10, 20, 50].map(b => (
                                            <option key={b} value={b}>{b} items</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                                <span className="text-xs font-black uppercase text-gray-400">Next Scheduled Run</span>
                                <span className="font-mono text-base font-black text-indigo-300">
                                    {arrScheduler.enabled ? formatNextRun(arrScheduler.nextRunTimestamp) : 'Paused'}
                                </span>
                            </div>
                        </section>

                        {/* Release Calendar Cache Sync */}
                        <section className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 space-y-5 shadow-2xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/40">
                                        <Calendar size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-white">Release Calendar Cache</h3>
                                        <p className="text-xs text-gray-400 font-semibold mt-0.5">Pre-cached theater & release schedules</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => runAction('cal_run', { action: 'update_calendar_sync', runNow: true })}
                                        disabled={busyKey === 'cal_run' || calendarSync.isRunning}
                                        title="Sync calendar cache now"
                                        className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black cursor-pointer shadow"
                                    >
                                        <RefreshCw size={18} className={calendarSync.isRunning ? 'animate-spin' : ''} />
                                    </button>
                                    <button
                                        onClick={() => runAction('cal_toggle', { action: 'update_calendar_sync', enabled: !calendarSync.enabled })}
                                        disabled={busyKey === 'cal_toggle'}
                                        title={calendarSync.enabled ? 'Pause calendar sync' : 'Resume calendar sync'}
                                        className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                                    >
                                        {calendarSync.enabled ? <Pause size={18} /> : <Play size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                                    <span className="text-xs font-black uppercase text-gray-400">Cached Releases</span>
                                    <div className="text-lg font-black text-sky-300 font-mono">
                                        {calendarSync.cachedCount ?? 0}
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
                                    <span className="text-xs font-black uppercase text-gray-400">Last Sync</span>
                                    <div className="text-sm font-black text-white truncate">
                                        {calendarSync.lastSyncAt
                                            ? new Date(calendarSync.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : 'Pending'}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                                <span className="text-xs font-black uppercase text-gray-400">Sync Interval</span>
                                <select
                                    value={calendarSync.intervalMin || 15}
                                    onChange={(e) => runAction('cal_int', { action: 'update_calendar_sync', intervalMin: Number(e.target.value) })}
                                    className="w-full bg-[#141a29] border border-white/15 rounded-xl px-3 py-2 text-sm font-bold text-white cursor-pointer outline-none"
                                >
                                    {[5, 10, 15, 30, 60, 120].map(m => (
                                        <option key={m} value={m}>Every {m} minutes</option>
                                    ))}
                                </select>
                            </div>
                        </section>
                    </div>

                    {/* EPG Syncing Scheduler & DVR Recordings */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* EPG Scheduler */}
                        <section className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 space-y-4 shadow-2xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <Tv size={22} className="text-sky-400" />
                                    <h3 className="text-xl font-black text-white">EPG Guide Sync ({epgSchedules.length})</h3>
                                </div>
                                <button
                                    onClick={() => runAction('epg_sync_all', { action: 'trigger_epg_sync' })}
                                    disabled={busyKey === 'epg_sync_all'}
                                    title="Sync XMLTV EPG guide across all providers"
                                    className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase flex items-center gap-2 cursor-pointer shadow"
                                >
                                    <RefreshCw size={14} className={epgSyncs.length > 0 ? 'animate-spin' : ''} />
                                    Sync All
                                </button>
                            </div>

                            {epgSchedules.length === 0 ? (
                                <div className="p-6 rounded-2xl bg-black/30 border border-white/10 text-center text-sm font-semibold text-gray-400">
                                    No Live TV / IPTV providers configured yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {epgSchedules.map((epg: any) => (
                                        <div key={epg.libraryId} className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-3">
                                            <div>
                                                <h4 className="text-base font-black text-white">{epg.libraryName}</h4>
                                                <p className="text-xs text-gray-400 font-bold mt-0.5">
                                                    {(epg.programCount || 0).toLocaleString()} Progs • Frequency: Every {epg.intervalHours || 24}h
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => runAction(`epg_sync_${epg.libraryId}`, { action: 'trigger_epg_sync', libraryId: epg.libraryId })}
                                                disabled={busyKey === `epg_sync_${epg.libraryId}`}
                                                className="p-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 cursor-pointer"
                                                title={`Sync ${epg.libraryName}`}
                                            >
                                                <RefreshCw size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* DVR Active Recordings */}
                        <section className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 space-y-4 shadow-2xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <Radio size={22} className="text-rose-400" />
                                    <h3 className="text-xl font-black text-white">DVR Recordings</h3>
                                </div>
                                <span className="text-xs font-black text-gray-400 uppercase">
                                    {dvrActive.length} Active • {dvrScheduled.length} Scheduled
                                </span>
                            </div>

                            {dvrActive.length === 0 && dvrScheduled.length === 0 ? (
                                <div className="p-6 rounded-2xl bg-black/30 border border-white/10 text-center text-sm font-semibold text-gray-400">
                                    No active or scheduled DVR recordings.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {dvrActive.map((rec: any) => (
                                        <div key={rec.id} className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3">
                                            <div>
                                                <h4 className="text-base font-black text-white">{rec.title}</h4>
                                                <p className="text-xs text-rose-300 font-bold">{rec.channel_name} • Recording Now</p>
                                            </div>
                                            <button
                                                onClick={() => runAction(`stop_dvr_${rec.id}`, { action: 'stop_dvr_recording', recordingId: rec.id })}
                                                className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer shadow"
                                                title="Stop recording"
                                            >
                                                <Square size={13} className="fill-current" />
                                                Stop
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 3: MUSIC (Lidarr Album Scans & Audio Transcoding)
               ═══════════════════════════════════════════════════════════════════ */}
            {activeLibraryTab === 'music' && (
                <div className="space-y-6">
                    <section className="rounded-3xl bg-[#0d111a] border border-emerald-500/30 p-6 space-y-5 shadow-2xl">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                    <Radio size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">Music Library Schedulers</h3>
                                    <p className="text-xs text-gray-400 font-semibold mt-0.5">Lidarr artist catalog monitoring & album downloads</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Lidarr Monitored
                            </span>
                        </div>

                        <div className="p-6 rounded-2xl bg-black/40 border border-white/10 text-center space-y-2">
                            <p className="text-sm font-bold text-gray-300">
                                Music search batches run via unified Arr Scheduler.
                            </p>
                            <p className="text-xs text-gray-500 font-semibold">
                                Missing albums are scanned automatically according to your Arr Batch Search settings.
                            </p>
                        </div>
                    </section>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 4: SYSTEM & LOGS (Telemetry, Hardware Resources & History)
               ═══════════════════════════════════════════════════════════════════ */}
            {activeLibraryTab === 'system' && (
                <div className="space-y-6">
                    {/* Resource Matrix */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <div className="rounded-2xl bg-[#0d111a] border border-white/10 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-cyan-400 font-black text-sm">
                                <Brain size={18} />
                                <span>LLMs & Scening</span>
                            </div>
                            <div className="text-xl font-black font-mono text-white">
                                {totals.llmScenes?.doneChapters ?? 0} / {totals.llmScenes?.totalChapters ?? 0} Ch
                            </div>
                        </div>

                        <div className="rounded-2xl bg-[#0d111a] border border-white/10 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                                <Cpu size={18} />
                                <span>Local CPU Work</span>
                            </div>
                            <div className="text-xl font-black font-mono text-white">
                                {totals.voices.done} / {totals.voices.total} Ch
                            </div>
                        </div>

                        <div className="rounded-2xl bg-[#0d111a] border border-white/10 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-purple-400 font-black text-sm">
                                <Globe size={18} />
                                <span>Flux Scene Art</span>
                            </div>
                            <div className="text-xl font-black font-mono text-white">
                                {totals.art.doneChapters} / {totals.art.totalChapters} Ch
                            </div>
                        </div>

                        <div className="rounded-2xl bg-[#0d111a] border border-white/10 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                                <Gauge size={18} />
                                <span>Daily Quota</span>
                            </div>
                            <div className="text-xl font-black font-mono text-white">
                                {studioCfg.imagesGeneratedToday ?? 0} / {studioCfg.dailyImageQuota ?? 20}
                            </div>
                        </div>
                    </div>

                    {/* Server Logs */}
                    <section className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <Terminal size={22} className="text-emerald-400" />
                                <h3 className="text-xl font-black text-white">Live Server Log</h3>
                            </div>
                            <span className="text-xs font-mono font-bold text-gray-400">
                                {transfersActive.length} Active Transfers
                            </span>
                        </div>

                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {(Array.isArray(studio?.history) ? studio.history : []).slice(0, 10).map((h: any, i: number) => (
                                <div key={h.id || i} className="text-xs font-mono bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                                    <span className={h.status === 'failed' ? 'text-rose-300 truncate' : 'text-gray-200 truncate'}>
                                        [{(h.queueType || h.taskType || 'TASK').toUpperCase()}] {h.bookTitle}{h.chapterTitle ? ` — ${h.chapterTitle}` : ''}: {h.detail || h.details}
                                    </span>
                                    <span className="text-gray-500 shrink-0">
                                        {h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                            ))}
                            {recentLogs.slice(0, 6).map((l: any) => (
                                <div key={l.id} className="text-xs font-mono bg-black/40 border border-white/5 rounded-xl p-3 text-gray-300 truncate">
                                    [{l.category}] {l.message}
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {/* Custom Confirm Modal */}
            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    onClose={() => setConfirmModal(null)}
                    onConfirm={confirmModal.onConfirm}
                    title={confirmModal.title}
                    description={confirmModal.description}
                    confirmText={confirmModal.confirmText}
                    cancelText={confirmModal.cancelText}
                    variant={confirmModal.variant}
                />
            )}
        </div>
    );
}

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
    ChevronUp,
    Zap,
    Headphones,
    BarChart3,
    Timer,
    CheckCircle2,
    Shield,
    ShieldAlert,
    Smartphone,
    Film,
    Cloud,
    CloudUpload,
    CloudCheck,
    ArrowUpRight,
    Battery,
    BatteryCharging,
    AlertTriangle,
    Eye,
    Filter,
    Wrench,
    Check
} from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';

export type TaskLibraryTab = 'audiobooks' | 'tv_movies' | 'music' | 'photos' | 'system';

export default function TasksPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [selectedBookToAdd, setSelectedBookToAdd] = useState<string>('');
    const [nowMs, setNowMs] = useState<number>(Date.now());
    const [activeLibraryTab, setActiveLibraryTab] = useState<TaskLibraryTab>(() => {
        if (typeof window !== 'undefined') {
            const p = new URLSearchParams(window.location.search).get('tab');
            if (p === 'photos' || p === 'audiobooks' || p === 'tv_movies' || p === 'music' || p === 'system') {
                return p as TaskLibraryTab;
            }
        }
        return 'audiobooks';
    });
    const [phoneFilter, setPhoneFilter] = useState<'all' | 'queued' | 'transferred' | 'uploaded' | 'cleaned'>('all');
    const [phoneSearch, setPhoneSearch] = useState<string>('');
    const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
    const [chartMetricMode, setChartMetricMode] = useState<'duration' | 'units'>('duration');
    const [isSttBreakdownExpanded, setIsSttBreakdownExpanded] = useState<boolean>(true);
    const [isOverviewCollapsed, setIsOverviewCollapsed] = useState<boolean>(false);
    const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
    const [previewPhotoItem, setPreviewPhotoItem] = useState<any | null>(null);
    const [logCategoryFilter, setLogCategoryFilter] = useState<string>('all');
    const [logLevelFilter, setLogLevelFilter] = useState<string>('all');
    const [logSearchText, setLogSearchText] = useState<string>('');
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
    const failedItems: any[] = Array.isArray(data?.failedItems) ? data.failedItems : [];

    const phoneBackup = data?.phoneBackupSuite;
    const phoneCounts = phoneBackup?.counts || {
        queued: 0,
        staging: 0,
        transferred: 0,
        uploaded: 0,
        cleaned: 0,
        total: 0,
        totalBytesTransferred: 0,
        totalBytesCleaned: 0
    };
    const phoneNode = phoneBackup?.node;
    const phoneItems: any[] = Array.isArray(phoneBackup?.items) ? phoneBackup.items : [];

    const quotaReached = (studioCfg.imagesGeneratedToday ?? 0) >= (studioCfg.dailyImageQuota ?? 20);
    const totalFailedChapters =
        (totals.transcriptions?.failed || 0) +
        (totals.art?.failedChapters || 0) +
        (totals.voices?.failed || 0) +
        failedItems.length;

    const allSystemLogs = React.useMemo(() => {
        const normalized: Array<{
            id: string;
            timestamp: string | number;
            level: 'info' | 'warn' | 'error';
            category: string;
            message: string;
            details?: string;
        }> = [];

        for (const log of recentLogs) {
            normalized.push({
                id: String(log.id || `${log.timestamp}-${Math.random()}`),
                timestamp: log.timestamp || '',
                level: log.level === 'error' ? 'error' : log.level === 'warn' ? 'warn' : 'info',
                category: log.category || 'System',
                message: log.message || '',
                details: log.details || ''
            });
        }

        const history = Array.isArray(studio?.history) ? studio.history : [];
        for (const h of history) {
            const cat = h.queueType === 'transcription' ? 'STT' : h.queueType === 'voice' ? 'Voice' : h.queueType === 'art' ? 'Art' : 'Studio';
            const msg = `${h.bookTitle ? `${h.bookTitle}: ` : ''}${h.chapterTitle ? `${h.chapterTitle} ` : ''}${h.detail || h.details || h.status || ''}`;
            normalized.push({
                id: String(h.id || `${h.timestamp}-${Math.random()}`),
                timestamp: h.timestamp || '',
                level: h.status === 'failed' ? 'error' : 'info',
                category: cat,
                message: msg.trim()
            });
        }

        normalized.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime() || 0;
            const timeB = new Date(b.timestamp).getTime() || 0;
            return timeB - timeA;
        });

        return normalized;
    }, [recentLogs, studio?.history]);

    const groupedLogs = React.useMemo(() => {
        const filtered = allSystemLogs.filter(log => {
            if (logLevelFilter !== 'all' && log.level !== logLevelFilter) return false;
            if (logCategoryFilter !== 'all') {
                const cat = log.category.toLowerCase();
                const filter = logCategoryFilter.toLowerCase();
                if (filter === 'stt' && !cat.includes('stt') && !cat.includes('transcription')) return false;
                else if (filter === 'scheduler' && !cat.includes('sched')) return false;
                else if (filter === 'pixel' && !cat.includes('pixel') && !cat.includes('phone')) return false;
                else if (filter === 'streamguard' && !cat.includes('stream')) return false;
                else if (filter === 'dvr' && !cat.includes('dvr')) return false;
                else if (filter === 'media' && !cat.includes('media') && !cat.includes('art') && !cat.includes('voice')) return false;
                else if (filter === 'system' && !cat.includes('system')) return false;
                else if (!['stt', 'scheduler', 'pixel', 'streamguard', 'dvr', 'media', 'system'].includes(filter)) {
                    if (!cat.includes(filter)) return false;
                }
            }
            if (logSearchText.trim()) {
                const q = logSearchText.toLowerCase();
                const hit = (log.message || '').toLowerCase().includes(q) || (log.category || '').toLowerCase().includes(q);
                if (!hit) return false;
            }
            return true;
        });

        const grouped: Array<{
            id: string;
            timestamp: string | number;
            level: 'info' | 'warn' | 'error';
            category: string;
            message: string;
            details?: string;
            count: number;
        }> = [];

        for (const item of filtered) {
            const prev = grouped[grouped.length - 1];
            if (prev && prev.category === item.category && prev.level === item.level && prev.message === item.message) {
                prev.count += 1;
            } else {
                grouped.push({
                    ...item,
                    count: 1
                });
            }
        }

        return grouped;
    }, [allSystemLogs, logLevelFilter, logCategoryFilter, logSearchText]);

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

    const processingSummary = data?.libraryProcessingSummary || {
        totalUnits: (totals.transcriptions?.total || 0) + (totals.art?.totalChapters || 0) + (totals.llmScenes?.totalChapters || 0) + (totals.voices?.total || 0),
        totalDone: (totals.transcriptions?.done || 0) + (totals.art?.doneChapters || 0) + (totals.llmScenes?.doneChapters || 0) + (totals.voices?.done || 0),
        totalPending: (totals.transcriptions?.pending || 0) + (totals.art?.pendingChapters || 0) + (totals.llmScenes?.pendingChapters || 0) + (totals.voices?.pending || 0),
        totalFailed: totalFailedChapters,
        totalPercent: ((totals.transcriptions?.total || 0) + (totals.art?.totalChapters || 0) + (totals.llmScenes?.totalChapters || 0) + (totals.voices?.total || 0)) > 0
            ? Math.round((((totals.transcriptions?.done || 0) + (totals.art?.doneChapters || 0) + (totals.llmScenes?.doneChapters || 0) + (totals.voices?.done || 0)) / ((totals.transcriptions?.total || 0) + (totals.art?.totalChapters || 0) + (totals.llmScenes?.totalChapters || 0) + (totals.voices?.total || 0))) * 100)
            : 0,
        totalDurationMs: 0,
        totalDurationFormatted: '0m',
        longestTaskKey: 'stt',
        longestTaskLabel: 'Speech-to-Text',
        longestTaskDurationFormatted: '0m',
        tasks: []
    };

    const maxTaskDuration = Math.max(1, ...(processingSummary.tasks || []).map((t: any) => t.durationMs || 0));
    const totalProcessingPercent = Math.min(100, Math.max(0, processingSummary.totalPercent || 0));
    const ringRadius = 44;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringDashoffset = ringCircumference - (ringCircumference * totalProcessingPercent) / 100;

    return (
        <div className="min-h-screen bg-[#07090e] text-white px-4 py-5 md:px-8 max-w-[1920px] 2xl:max-w-[2160px] mx-auto space-y-6">
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
                        className={`p-3 rounded-xl text-base font-black flex items-center justify-center cursor-pointer transition-all disabled:opacity-50 ${
                            studioCfg.aiPaused
                                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg'
                                : 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200'
                        }`}
                    >
                        {studioCfg.aiPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={fetchTasks}
                        title="Refresh live status"
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 flex items-center justify-center cursor-pointer"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                UNIFIED LIBRARY PROCESSING % & ABSOLUTE WORKLOAD CHART
               ═══════════════════════════════════════════════════════════════════ */}
            <section className="rounded-2xl bg-[#0d111a] border border-white/10 p-5 md:p-6 shadow-2xl space-y-5">
                {/* Section Top Controls */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                            <BarChart3 size={24} />
                        </div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-xl md:text-2xl font-black text-white">Progress</h2>
                            <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                {totalProcessingPercent}%
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Toggle Mode: Absolute Duration vs Relative Completion Units */}
                        <div className="flex items-center p-1 rounded-xl bg-black/50 border border-white/10">
                            <button
                                type="button"
                                onClick={() => setChartMetricMode('duration')}
                                title="Absolute Duration Chart (identifies which task is taking longest)"
                                className={`p-2 rounded-lg transition-all cursor-pointer ${
                                    chartMetricMode === 'duration'
                                        ? 'bg-amber-500 text-black shadow-md font-black'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <Timer size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setChartMetricMode('units')}
                                title="Completion Progress Units Chart"
                                className={`p-2 rounded-lg transition-all cursor-pointer ${
                                    chartMetricMode === 'units'
                                        ? 'bg-indigo-500 text-white shadow-md font-black'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <Layers size={18} />
                            </button>
                        </div>

                        {/* Collapse/Expand Toggle (Pure Symbol) */}
                        <button
                            type="button"
                            onClick={() => setIsOverviewCollapsed(prev => !prev)}
                            title={isOverviewCollapsed ? 'Expand Overview' : 'Collapse Overview'}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
                        >
                            {isOverviewCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </button>
                    </div>
                </div>

                {!isOverviewCollapsed && (
                    <div className="space-y-5">
                        {/* ── Top Row: 4-Card Command Deck ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Card 1: Overall Progress */}
                            <div className="rounded-2xl bg-black/40 border border-white/10 p-5 space-y-3 shadow-md flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            <BarChart3 size={18} />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Total Progress</span>
                                    </div>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                                        studioStatus.isRunning
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                                            : 'bg-white/5 text-gray-400 border border-white/10'
                                    }`}>
                                        {studioStatus.isRunning ? 'Active' : 'Idle'}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-3xl font-black font-mono text-white tracking-tight">
                                        {totalProcessingPercent}%
                                    </div>
                                    <div className="text-xs text-gray-400 font-medium mt-1">
                                        {processingSummary.totalDone} of {processingSummary.totalUnits} units completed
                                    </div>
                                </div>
                                <div className="w-full h-2 rounded-md bg-zinc-900 border border-white/5 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-md transition-all duration-700"
                                        style={{ width: `${totalProcessingPercent}%` }}
                                    />
                                </div>
                            </div>

                            {/* Card 2: Units Breakdown */}
                            <div className="rounded-2xl bg-black/40 border border-white/10 p-5 space-y-3 shadow-md flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                            <Layers size={18} />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Queue Load</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-white/5 text-gray-400 border border-white/10">
                                        All Libraries
                                    </span>
                                </div>
                                <div>
                                    <div className="text-3xl font-black font-mono text-white tracking-tight">
                                        {processingSummary.totalPending} <span className="text-base text-gray-400 font-normal">Pending</span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-medium mt-1">
                                        {processingSummary.totalDone} completed out of {processingSummary.totalUnits} units
                                    </div>
                                </div>
                                <div className="text-xs text-indigo-300 font-mono font-semibold">
                                    STT • LLM Scenes • Art • Voice
                                </div>
                            </div>

                            {/* Card 3: Total Compute Time */}
                            <div className="rounded-2xl bg-black/40 border border-white/10 p-5 space-y-3 shadow-md flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                            <Clock size={18} />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Compute Time</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                        Wall-Clock
                                    </span>
                                </div>
                                <div>
                                    <div className="text-3xl font-black font-mono text-white tracking-tight">
                                        {processingSummary.totalDurationFormatted}
                                    </div>
                                    <div className="text-xs text-gray-400 font-medium mt-1 truncate" title={`Longest: ${processingSummary.longestTaskLabel} (${processingSummary.longestTaskDurationFormatted})`}>
                                        Longest: <span className="text-amber-300 font-bold">{processingSummary.longestTaskLabel}</span> ({processingSummary.longestTaskDurationFormatted})
                                    </div>
                                </div>
                                <div className="text-xs text-zinc-400 font-mono">
                                    Tracked cumulative task duration
                                </div>
                            </div>

                            {/* Card 4: Pipeline Health & Error Diagnostics */}
                            <div className={`rounded-2xl border p-5 space-y-3 shadow-md flex flex-col justify-between ${
                                totalFailedChapters > 0
                                    ? 'bg-rose-950/20 border-rose-500/40 shadow-rose-950/20'
                                    : 'bg-black/40 border-white/10'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 rounded-xl border ${
                                            totalFailedChapters > 0
                                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        }`}>
                                            {totalFailedChapters > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Pipeline Health</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                        totalFailedChapters > 0
                                            ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50'
                                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    }`}>
                                        {totalFailedChapters > 0 ? `${totalFailedChapters} Errors` : 'Optimal'}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-3xl font-black font-mono text-white tracking-tight">
                                        {totalFailedChapters > 0 ? (
                                            <span className="text-rose-400">{totalFailedChapters} Issues</span>
                                        ) : (
                                            <span className="text-emerald-400">100% Ok</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-400 font-medium mt-1">
                                        {totalFailedChapters > 0 ? 'Failures detected in processing queue' : 'All worker pipelines operating cleanly'}
                                    </div>
                                </div>
                                <div>
                                    {totalFailedChapters > 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => setShowErrorModal(true)}
                                            className="w-full py-1.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow"
                                        >
                                            <AlertTriangle size={14} className="text-rose-400" />
                                            <span>View & Fix Errors</span>
                                        </button>
                                    ) : (
                                        <div className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1">
                                            <Check size={14} />
                                            <span>No pipeline errors</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Bottom Workload & Duration Comparison Card (Full Width) ── */}
                        <div className="rounded-2xl bg-black/40 border border-white/10 p-5 space-y-4 shadow-xl">
                            {/* Chart Header Pill */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                                        {chartMetricMode === 'duration' ? 'Absolute Duration Comparison' : 'Task Completion Ratio'}
                                    </span>
                                </div>

                                <div
                                    className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                                    title="The task taking the longest cumulative compute/wall-clock time across your entire library"
                                >
                                    <Timer size={14} className="text-amber-400" />
                                    <span>Longest: {processingSummary.longestTaskLabel} ({processingSummary.longestTaskDurationFormatted})</span>
                                </div>
                            </div>

                            {/* Task Rows List */}
                            <div className="space-y-3.5">
                                {(processingSummary.tasks || []).map((task: any) => {
                                    const isStt = task.key === 'stt';
                                    const widthPct = chartMetricMode === 'duration'
                                        ? Math.max(5, Math.round(((task.durationMs || 0) / maxTaskDuration) * 100))
                                        : Math.max(5, Math.min(100, task.percent || 0));

                                    const taskColorMap: Record<string, { bar: string; icon: string; border: string }> = {
                                        stt: { bar: 'from-indigo-600 via-indigo-500 to-indigo-400', icon: 'text-indigo-400', border: 'border-indigo-500/30' },
                                        art: { bar: 'from-purple-600 via-purple-500 to-purple-400', icon: 'text-purple-400', border: 'border-purple-500/30' },
                                        scening: { bar: 'from-cyan-600 via-cyan-500 to-cyan-400', icon: 'text-cyan-400', border: 'border-cyan-500/30' },
                                        voice: { bar: 'from-emerald-600 via-emerald-500 to-emerald-400', icon: 'text-emerald-400', border: 'border-emerald-500/30' },
                                        translation: { bar: 'from-sky-600 via-sky-500 to-sky-400', icon: 'text-sky-400', border: 'border-sky-500/30' }
                                    };
                                    const colors = taskColorMap[task.key] || taskColorMap.stt;

                                    return (
                                        <div
                                            key={task.key}
                                            className={`p-3.5 rounded-xl border transition-all ${
                                                task.isLongest
                                                    ? 'bg-amber-500/5 border-amber-500/40 shadow-sm'
                                                    : 'bg-black/40 border-white/10 hover:border-white/20'
                                            }`}
                                        >
                                            {/* Row Top Header */}
                                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                                                <div className="flex items-center gap-2.5">
                                                    {task.key === 'stt' && <Mic size={20} className={colors.icon} />}
                                                    {task.key === 'art' && <ImageIcon size={20} className={colors.icon} />}
                                                    {task.key === 'scening' && <Wand2 size={20} className={colors.icon} />}
                                                    {task.key === 'voice' && <Headphones size={20} className={colors.icon} />}
                                                    {task.key === 'translation' && <Globe size={20} className={colors.icon} />}

                                                    <span className="text-base md:text-lg font-black text-white">
                                                        {task.label}
                                                    </span>

                                                    {task.isCrossLibrary && (
                                                        <span
                                                            className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                                                            title="Video & Audio to Text is common to almost all libraries: Audiobooks, Movies, TV, and Music"
                                                        >
                                                            Cross-Library
                                                        </span>
                                                    )}

                                                    {task.isLongest && (
                                                        <span
                                                            className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50 flex items-center gap-1 shadow-sm shadow-amber-500/20"
                                                            title="This task takes the longest cumulative compute and wall-clock processing time"
                                                        >
                                                            <Timer size={12} />
                                                            <span>Longest</span>
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <span
                                                        className="font-mono text-base md:text-lg font-black text-white"
                                                        title="Cumulative processing time"
                                                    >
                                                        {task.durationFormatted}
                                                    </span>
                                                    <span
                                                        className="font-mono text-xs md:text-sm font-bold text-gray-400"
                                                        title="Completed units / Total units"
                                                    >
                                                        {task.done} / {task.total} ({task.percent}%)
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Absolute Visual Bar */}
                                            <div className="w-full h-3.5 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden">
                                                <div
                                                    className={`h-full bg-gradient-to-r ${colors.bar} rounded-lg transition-all duration-500`}
                                                    style={{ width: `${widthPct}%` }}
                                                    title={`${task.label}: ${task.durationFormatted} • ${task.done}/${task.total} units (${task.percent}%)`}
                                                />
                                            </div>

                                            {/* Cross-Library Breakdown Pill Row for Speech-to-Text */}
                                            {isStt && Array.isArray(task.breakdown) && task.breakdown.length > 0 && (
                                                <div className="pt-2 mt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
                                                    {task.breakdown.map((b: any) => (
                                                        <div
                                                            key={b.id}
                                                            className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/10 flex items-center gap-2 text-xs font-bold text-gray-300"
                                                            title={`${b.label}: ${b.done}/${b.total} ${b.unit} processed to text`}
                                                        >
                                                            {b.id === 'audiobooks' && <BookOpen size={14} className="text-amber-400" />}
                                                            {b.id === 'movies_tv' && <Tv size={14} className="text-sky-400" />}
                                                            {b.id === 'music' && <Radio size={14} className="text-emerald-400" />}
                                                            <span>{b.label}</span>
                                                            <span className="font-mono font-black text-white">{b.done}/{b.total}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* ── Stream Guard Live Playback Throttling Banner ── */}
            {data?.streamGuard?.isThrottled && (
                <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-950/60 via-zinc-950/80 to-amber-950/60 border-2 border-amber-500/40 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 animate-pulse">
                            <ShieldAlert size={28} />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-white">Stream Guard Active</h3>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Plex Streaming
                                </span>
                            </div>
                            <div className="text-sm text-zinc-300 flex flex-wrap items-center gap-3 font-mono">
                                {data.streamGuard.activeStreams?.map((s: any) => (
                                    <span key={s.id} className="text-white font-bold">
                                        "{s.title}" • {s.user} ({s.device}) • {s.bandwidthMbps} Mbps
                                    </span>
                                ))}
                                {data.streamGuard.pausedTorrentHashes?.length > 0 && (
                                    <span className="text-amber-400">
                                        • {data.streamGuard.pausedTorrentHashes.length} torrent(s) paused
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => runAction('update_stream_guard', { settings: { enabled: false } })}
                            title="Temporarily Override & Resume All Background Tasks"
                            className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
                        >
                            <Play size={20} />
                        </button>
                    </div>
                </div>
            )}

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
                    {queuedBooks.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${activeLibraryTab === 'audiobooks' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                            {queuedBooks.length}
                        </span>
                    )}
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
                    {(dvrActive.length + dvrScheduled.length) > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${activeLibraryTab === 'tv_movies' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                            {dvrActive.length + dvrScheduled.length}
                        </span>
                    )}
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
                    onClick={() => setActiveLibraryTab('photos')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        activeLibraryTab === 'photos'
                            ? 'bg-indigo-500 text-black shadow-lg shadow-indigo-500/20'
                            : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10'
                    }`}
                >
                    <Smartphone size={18} />
                    <span>Photos</span>
                    {phoneItems.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${activeLibraryTab === 'photos' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                            {phoneItems.length}
                        </span>
                    )}
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
                    {allSystemLogs.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${activeLibraryTab === 'system' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                            {allSystemLogs.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 1: AUDIOBOOKS (Local CPU vs AI Cloud Tasks + Collapsible Queue)
               ═══════════════════════════════════════════════════════════════════ */}
            {activeLibraryTab === 'audiobooks' && (
                <div className="space-y-6">
                    {/* ── Dual Concurrent Pipelines: LOCAL (CPU) vs API (Cloud) ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ── 1. Local Pipeline (Server Hardware / Offline CPU) ── */}
                        <div className="rounded-2xl bg-[#0d111a] border border-emerald-500/30 p-6 space-y-5 shadow-2xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                        <Cpu size={24} />
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <h3 className="text-2xl font-black text-white">Local Pipeline</h3>
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                                            isLocalTasksActive
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                                                : 'bg-white/5 text-gray-400 border border-white/10'
                                        }`}>
                                            {isLocalTasksActive ? 'Running' : 'Idle'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => runAction('run_worker_local', { action: 'trigger_audiobook_worker', target: 'transcriptions' })}
                                        disabled={busyKey === 'run_worker_local'}
                                        title="Run local transcription immediately"
                                        className="p-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer shadow disabled:opacity-50"
                                    >
                                        <Play size={18} className="fill-current" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => runAction('toggle_local_worker', { action: 'toggle_audiobook_worker', enabled: !studioCfg.enabled })}
                                        disabled={busyKey === 'toggle_local_worker'}
                                        title={studioCfg.enabled ? 'Pause local worker' : 'Resume local worker'}
                                        className="p-2.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-white cursor-pointer disabled:opacity-50"
                                    >
                                        {studioCfg.enabled ? <Pause size={18} /> : <Play size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Local Live Lane */}
                            <div className="p-4 rounded-xl bg-black/60 border border-emerald-500/20 space-y-2.5">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="font-black text-emerald-400 uppercase tracking-wider">
                                        {isLocalTasksActive ? (studioStatus.activeTask || 'Local Processing') : 'Ready'}
                                    </span>
                                    {isLocalTasksActive && (
                                        <span className="font-mono font-bold text-emerald-300">
                                            {studioStatus.progress ?? 0}%
                                        </span>
                                    )}
                                </div>
                                <div className="text-base font-black text-white truncate">
                                    {isLocalTasksActive
                                        ? `${studioStatus.activeBookTitle || 'Audiobook'} — ${studioStatus.activeChapterTitle || ''}`
                                        : 'Server CPU Idle • Ready for transcription & DSP'}
                                </div>
                                {isLocalTasksActive && (
                                    <div className="w-full h-2.5 rounded-md bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-emerald-400 transition-all duration-300"
                                            style={{ width: `${Math.max(5, studioStatus.progress || 10)}%` }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Sub-stages */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Stage 1: Transcription */}
                                <div className="rounded-xl bg-black/40 border border-indigo-500/30 p-4 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-indigo-300 font-black text-sm">
                                            <Mic size={18} />
                                            <span>Audio → Text</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.transcriptions.done}/{totals.transcriptions.total} Ch
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-400 font-semibold">
                                        <span>{totals.transcriptions.pending} queued</span>
                                        {totals.transcriptions.failed > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowErrorModal(true)}
                                                className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-1 cursor-pointer transition-colors font-bold"
                                                title="View error diagnostics and retry failed transcriptions"
                                            >
                                                <AlertTriangle size={12} className="text-rose-400" />
                                                <span>{totals.transcriptions.failed} errors • View & Fix</span>
                                            </button>
                                        ) : (
                                            <span className="text-zinc-500">0 errors</span>
                                        )}
                                    </div>
                                    <div className="w-full h-2 rounded-md bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-indigo-500 transition-all duration-300"
                                            style={{
                                                width: `${totals.transcriptions.total > 0 ? Math.min(100, Math.round((totals.transcriptions.done / totals.transcriptions.total) * 100)) : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Stage 1B: Voice DSP */}
                                <div className="rounded-xl bg-black/40 border border-emerald-500/30 p-4 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-emerald-300 font-black text-sm">
                                            <Volume2 size={18} />
                                            <span>Audio → Voice</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.voices.done}/{totals.voices.total} Ch
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-400 font-semibold">
                                        <span>{totals.voices.pending} queued</span>
                                        {totals.voices.failed > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowErrorModal(true)}
                                                className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-1 cursor-pointer transition-colors font-bold"
                                                title="View error diagnostics and retry failed voice chapters"
                                            >
                                                <AlertTriangle size={12} className="text-rose-400" />
                                                <span>{totals.voices.failed} errors • View & Fix</span>
                                            </button>
                                        ) : (
                                            <span className="text-zinc-500">0 errors</span>
                                        )}
                                    </div>
                                    <div className="w-full h-2 rounded-md bg-zinc-900 overflow-hidden border border-white/5">
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

                        {/* ── 2. Cloud / API Pipeline (External Quotas & LLM/Flux) ── */}
                        <div className="rounded-2xl bg-[#0d111a] border border-purple-500/30 p-6 space-y-5 shadow-2xl">
                            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40">
                                        <Brain size={24} />
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <h3 className="text-2xl font-black text-white">API Pipeline</h3>
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                                            isAiCloudTasksActive
                                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse'
                                                : 'bg-white/5 text-gray-400 border border-white/10'
                                        }`}>
                                            {isAiCloudTasksActive ? 'Running' : 'Idle'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => runAction('reset_quota_api', { action: 'update_studio_limits', resetDailyUsage: true })}
                                        className="p-2.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer shadow"
                                        title="Reset daily API image quota counter"
                                    >
                                        <RotateCcw size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => runAction('run_worker_api', { action: 'trigger_audiobook_worker', target: 'all' })}
                                        disabled={busyKey === 'run_worker_api'}
                                        title="Run API cloud pipeline immediately"
                                        className="p-2.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow disabled:opacity-50"
                                    >
                                        <Play size={18} className="fill-current" />
                                    </button>
                                </div>
                            </div>

                            {/* Cloud Live Lane */}
                            <div className="p-4 rounded-xl bg-black/60 border border-purple-500/20 space-y-2.5">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="font-black text-purple-400 uppercase tracking-wider">
                                        {isAiCloudTasksActive ? (studioStatus.activeTask || 'Cloud Generating') : 'Ready'}
                                    </span>
                                    <span className="font-mono font-bold text-amber-300">
                                        Quota: {studioCfg.imagesGeneratedToday ?? 0} / {studioCfg.dailyImageQuota ?? 20}
                                    </span>
                                </div>
                                <div className="text-base font-black text-white truncate">
                                    {isAiCloudTasksActive
                                        ? `${studioStatus.activeBookTitle || 'Audiobook'} — ${studioStatus.activeChapterTitle || ''}`
                                        : quotaReached
                                        ? 'Daily API image quota limit reached'
                                        : 'API Quota Ready • Waiting for scening & art tasks'}
                                </div>
                                {isAiCloudTasksActive && (
                                    <div className="w-full h-2.5 rounded-md bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-purple-400 transition-all duration-300"
                                            style={{ width: `${Math.max(5, studioStatus.progress || 10)}%` }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Sub-stages */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Stage 2: LLM Scene Detection */}
                                <div className="rounded-xl bg-black/40 border border-cyan-500/30 p-4 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-cyan-300 font-black text-sm">
                                            <Wand2 size={18} />
                                            <span>Text → Scenes</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.llmScenes?.doneChapters ?? 0}/{totals.llmScenes?.totalChapters ?? 0} Ch
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-semibold">
                                        {totals.llmScenes?.detectedScenes ?? 0} scenes • {totals.llmScenes?.pendingChapters ?? 0} waiting
                                    </div>
                                    <div className="w-full h-2 rounded-md bg-zinc-900 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-cyan-500 transition-all duration-300"
                                            style={{
                                                width: `${(totals.llmScenes?.totalChapters ?? 0) > 0 ? Math.min(100, Math.round(((totals.llmScenes?.doneChapters ?? 0) / totals.llmScenes.totalChapters) * 100)) : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Stage 3: Scene Art Painting & Daily Quota */}
                                <div className="rounded-xl bg-black/40 border border-purple-500/30 p-4 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-300 font-black text-sm">
                                            <ImageIcon size={18} />
                                            <span>Scenes → Art</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-gray-400">
                                            {totals.art.doneChapters}/{totals.art.totalChapters} Ch
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-400 font-semibold">
                                        <span>{totals.art.keptScenes || 0} painted • {totals.art.pendingChapters} queued</span>
                                        {(totals.art.failedChapters || 0) > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowErrorModal(true)}
                                                className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-1 cursor-pointer transition-colors font-bold"
                                                title="View error diagnostics and retry failed art chapters"
                                            >
                                                <AlertTriangle size={12} className="text-rose-400" />
                                                <span>{totals.art.failedChapters} errors • View & Fix</span>
                                            </button>
                                        ) : null}
                                    </div>
                                    <div className="w-full h-2 rounded-md bg-zinc-900 overflow-hidden border border-white/5">
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
                            <div className="pt-2 overflow-x-auto no-scrollbar scrollbar-none">
                                {queuedBooks.length === 0 ? (
                                    <div className="rounded-2xl bg-black/30 border border-white/10 p-6 text-center text-sm font-semibold text-gray-400">
                                        No audiobooks queued. Select a book above or enable auto-clean/pipeline in settings.
                                    </div>
                                ) : (
                                    <div className="min-w-[960px] space-y-2">
                                        {/* ── Strict Column Headers ── */}
                                        <div className="grid grid-cols-[minmax(240px,1.5fr)_80px_96px_86px_104px_96px_210px] items-center gap-3 px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-500 border-b border-white/10">
                                            <div className="flex items-center gap-2">
                                                <span>#</span>
                                                <span>Book</span>
                                            </div>
                                            <div className="flex items-center justify-center gap-1 text-zinc-400" title="Automatic Pipeline: automatically runs queued books through all enabled stages">
                                                <Zap size={13} className="text-amber-400 fill-amber-400/20" />
                                                <span>Auto</span>
                                            </div>
                                            <div className="flex items-center justify-center gap-1" title="Stage 1: Speech-to-Text Transcription">
                                                <FileText size={14} className="text-indigo-400" />
                                                <span>Text</span>
                                            </div>
                                            <div className="flex items-center justify-center gap-1" title="Stage 2: LLM Scene Detection">
                                                <Wand2 size={14} className="text-cyan-400" />
                                                <span>Scenes</span>
                                            </div>
                                            <div className="flex items-center justify-center gap-1" title="Stage 3: Scene Artwork Painting">
                                                <ImageIcon size={14} className="text-purple-400" />
                                                <span>Art</span>
                                            </div>
                                            <div className="flex items-center justify-center gap-1" title="Stage 1B: Narrator Voice Enhancement">
                                                <Headphones size={14} className="text-emerald-400" />
                                                <span>Voice</span>
                                            </div>
                                            <div className="text-right">
                                                <span>Actions</span>
                                            </div>
                                        </div>

                                        {/* ── Queued Book Rows (Strict Grid Alignment) ── */}
                                        {queuedBooks.map((book: any, idx: number) => {
                                            const isBookActive = studioStatus.isRunning && studioStatus.activeBookKey === book.book_key;
                                            const totalCh = Math.max(book.total_chapters || 0, book.synced_chapters_count || 0, 1);
                                            const isAutoOn = book.queue_enabled ?? (book.is_queued === 1 || Boolean(book.transcribe_enabled && book.illustrate_enabled));

                                            return (
                                                <div
                                                    key={book.book_key}
                                                    className={`rounded-xl p-3 sm:px-4 sm:py-3 border grid grid-cols-[minmax(240px,1.5fr)_80px_96px_86px_104px_96px_210px] items-center gap-3 transition-colors ${
                                                        isBookActive
                                                            ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg'
                                                            : 'bg-black/40 border-white/10 hover:border-white/20'
                                                    }`}
                                                >
                                                    {/* Col 1: Index + Book Title & Author */}
                                                    <div className="flex items-center gap-3 min-w-0 pr-2">
                                                        <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-black text-gray-300 shrink-0 border border-white/10">
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

                                                    {/* Col 2: Pipeline State (Clear Auto / Off toggle) */}
                                                    <div className="flex justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`queue_toggle_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'toggle_flag',
                                                                field: 'queue_enabled'
                                                            })}
                                                            title={isAutoOn ? "Automatic processing: Active (Click to pause auto-pipeline)" : "Automatic processing: Paused (Click to resume auto-pipeline)"}
                                                            className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-center gap-1 cursor-pointer transition-all text-xs font-bold ${
                                                                isAutoOn
                                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-sm'
                                                                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200'
                                                            }`}
                                                        >
                                                            <Zap size={13} className={isAutoOn ? "fill-current text-emerald-400" : "text-zinc-500"} />
                                                            <span>{isAutoOn ? 'Auto' : 'Off'}</span>
                                                        </button>
                                                    </div>

                                                    {/* Col 3: Stage 1 Text / Transcribe */}
                                                    <div className="flex justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`flag_stt_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'toggle_flag',
                                                                field: 'transcribe_enabled'
                                                            })}
                                                            title={`Stage 1: Speech-to-Text Transcription (${book.transcribed_chapters || 0}/${totalCh} chapters)`}
                                                            className={`w-full py-1.5 rounded-lg text-xs font-mono font-black border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                                                                book.transcribe_enabled
                                                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30'
                                                                    : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                            }`}
                                                        >
                                                            <FileText size={15} />
                                                            <span>{book.transcribed_chapters || 0}/{totalCh}</span>
                                                        </button>
                                                    </div>

                                                    {/* Col 4: Stage 2 Scenes */}
                                                    <div className="flex justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`flag_scene_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'toggle_flag',
                                                                field: 'scening_enabled'
                                                            })}
                                                            title={`Stage 2: LLM Scene Detection (${book.detected_scenes_count ?? book.total_scenes ?? 0} scenes detected across ${book.scened_chapters_count ?? book.scened_chapters ?? 0}/${totalCh} chapters)`}
                                                            className={`w-full py-1.5 rounded-lg text-xs font-mono font-black border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                                                                book.scening_enabled !== false
                                                                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35 hover:bg-cyan-500/25'
                                                                    : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                            }`}
                                                        >
                                                            <Wand2 size={15} />
                                                            <span>{book.detected_scenes_count ?? book.total_scenes ?? 0} Sc</span>
                                                        </button>
                                                    </div>

                                                    {/* Col 5: Stage 3 Art */}
                                                    <div className="flex justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`flag_art_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'toggle_flag',
                                                                field: 'illustrate_enabled'
                                                            })}
                                                            title={`Stage 3: Scene Artwork Painting (${book.painted_scenes_count ?? book.illustrated_scenes ?? 0}/${book.detected_scenes_count ?? book.total_scenes ?? 0} scenes painted)`}
                                                            className={`w-full py-1.5 rounded-lg text-xs font-mono font-black border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                                                                book.illustrate_enabled
                                                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30'
                                                                    : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                            }`}
                                                        >
                                                            <ImageIcon size={15} />
                                                            <span>{book.painted_scenes_count ?? book.illustrated_scenes ?? 0}/{book.detected_scenes_count ?? book.total_scenes ?? 0}</span>
                                                        </button>
                                                    </div>

                                                    {/* Col 6: Stage 1B Voice */}
                                                    <div className="flex justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`flag_voice_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'toggle_flag',
                                                                field: 'enhance_audio_enabled'
                                                            })}
                                                            title={`Stage 1B: Narrator Voice Processing (${book.enhanced_chapters || 0}/${totalCh} chapters)`}
                                                            className={`w-full py-1.5 rounded-lg text-xs font-mono font-black border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                                                                book.enhance_audio_enabled
                                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                                                                    : 'bg-white/5 text-gray-500 border-white/10 line-through'
                                                            }`}
                                                        >
                                                            <Headphones size={15} />
                                                            <span>{book.enhanced_chapters || 0}/{totalCh}</span>
                                                        </button>
                                                    </div>

                                                    {/* Col 7: Actions (Flush Right, Fixed Slot Widths) */}
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`start_${book.book_key}`, {
                                                                action: 'book_queue_action',
                                                                bookKey: book.book_key,
                                                                subAction: 'start_now'
                                                            })}
                                                            title="Start running pipeline for this book immediately"
                                                            className="w-8 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center transition-all cursor-pointer shadow shrink-0"
                                                        >
                                                            <Play size={16} className="fill-current" />
                                                        </button>

                                                        {idx > 0 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => runAction(`top_${book.book_key}`, {
                                                                    action: 'book_queue_action',
                                                                    bookKey: book.book_key,
                                                                    subAction: 'prioritize_top'
                                                                })}
                                                                title="Move book to top of priority queue"
                                                                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                            >
                                                                <ArrowUp size={16} />
                                                            </button>
                                                        ) : (
                                                            <div className="w-8 h-8 shrink-0" />
                                                        )}

                                                        {book.failed_chapters_count > 0 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => runAction(`retry_${book.book_key}`, {
                                                                    action: 'book_queue_action',
                                                                    bookKey: book.book_key,
                                                                    subAction: 'retry_failed'
                                                                })}
                                                                title="Retry failed chapters"
                                                                className="w-8 h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                            >
                                                                <RotateCcw size={16} />
                                                            </button>
                                                        ) : (
                                                            <div className="w-8 h-8 shrink-0" />
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
                                                            className="w-8 h-8 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 shrink-0"
                                                        >
                                                            <Sparkles size={16} />
                                                        </button>

                                                        <Link
                                                            href={`/discover?tab=audiobooks&bookKey=${encodeURIComponent(book.book_key)}`}
                                                            title="Open in Media Manager"
                                                            className="w-8 h-8 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center transition-all cursor-pointer shrink-0"
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
                                                            className="w-8 h-8 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
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

                    {/* Server Logs with Android-Style Grouping & Full Filters */}
                    <section className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 space-y-5 shadow-2xl">
                        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <Terminal size={22} className="text-emerald-400" />
                                <div>
                                    <h3 className="text-xl font-black text-white">System Logs & Event Telemetry</h3>
                                    <p className="text-xs text-gray-400 font-mono">
                                        Showing {groupedLogs.length} grouped event entries ({allSystemLogs.length} total raw messages)
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 text-gray-300">
                                    {transfersActive.length} Active Transfers
                                </span>
                            </div>
                        </div>

                        {/* Controls & Filter Bar */}
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                {/* Search input */}
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={logSearchText}
                                        onChange={(e) => setLogSearchText(e.target.value)}
                                        placeholder="Filter log messages..."
                                        className="w-full pl-9 pr-8 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400 font-mono"
                                    />
                                    {logSearchText && (
                                        <button
                                            type="button"
                                            onClick={() => setLogSearchText('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                {/* Log Level Selector */}
                                <div className="flex items-center gap-1 p-1 bg-black/60 rounded-xl border border-white/10 text-xs font-bold uppercase shrink-0">
                                    {(['all', 'info', 'warn', 'error'] as const).map(lvl => (
                                        <button
                                            key={lvl}
                                            type="button"
                                            onClick={() => setLogLevelFilter(lvl)}
                                            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                                                logLevelFilter === lvl
                                                    ? lvl === 'error'
                                                        ? 'bg-rose-500 text-white font-black'
                                                        : lvl === 'warn'
                                                        ? 'bg-amber-500 text-black font-black'
                                                        : 'bg-indigo-500 text-black font-black'
                                                    : 'text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            {lvl === 'all' ? 'All' : lvl.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold uppercase">
                                <span className="text-gray-500 text-[11px] font-black mr-1 flex items-center gap-1">
                                    <Filter size={12} />
                                    <span>Scope:</span>
                                </span>
                                {([
                                    { key: 'all', label: 'All Services' },
                                    { key: 'stt', label: 'Speech-to-Text' },
                                    { key: 'scheduler', label: 'Scheduler' },
                                    { key: 'pixel', label: 'Pixel Bridge' },
                                    { key: 'streamguard', label: 'StreamGuard' },
                                    { key: 'dvr', label: 'Live TV & DVR' },
                                    { key: 'media', label: 'Media Studio' },
                                    { key: 'system', label: 'System' }
                                ]).map(cat => (
                                    <button
                                        key={cat.key}
                                        type="button"
                                        onClick={() => setLogCategoryFilter(cat.key)}
                                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap text-xs font-bold ${
                                            logCategoryFilter === cat.key
                                                ? 'bg-white/20 text-white border-white/30 shadow-sm'
                                                : 'bg-black/40 text-gray-400 hover:text-white border-white/5 hover:border-white/10'
                                        }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Log Stream Output (Android-Style Grouped) */}
                        <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-2 custom-scrollbar font-mono text-xs">
                            {groupedLogs.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 rounded-2xl bg-black/30 border border-white/5">
                                    No log entries match the current search or filters.
                                </div>
                            ) : (
                                groupedLogs.map((log) => {
                                    const timeStr = log.timestamp
                                        ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                        : '—';

                                    const isErr = log.level === 'error';
                                    const isWarn = log.level === 'warn';

                                    return (
                                        <div
                                            key={log.id}
                                            className={`p-2.5 sm:px-3 sm:py-2 rounded-xl border flex items-start sm:items-center justify-between gap-3 transition-colors ${
                                                isErr
                                                    ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                                                    : isWarn
                                                    ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                                                    : 'bg-black/40 border-white/5 text-gray-300 hover:border-white/10'
                                            }`}
                                        >
                                            <div className="flex flex-wrap sm:flex-nowrap items-baseline sm:items-center gap-2.5 min-w-0 flex-1">
                                                <span className="text-gray-500 shrink-0 select-none text-[11px]">
                                                    {timeStr}
                                                </span>

                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase shrink-0 border ${
                                                    isErr
                                                        ? 'bg-rose-500/30 text-rose-300 border-rose-500/50'
                                                        : isWarn
                                                        ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                                                        : 'bg-white/10 text-gray-300 border-white/10'
                                                }`}>
                                                    {log.level.toUpperCase()}
                                                </span>

                                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white/5 border border-white/10 text-indigo-300 shrink-0">
                                                    [{log.category.toUpperCase()}]
                                                </span>

                                                <span className="break-all sm:break-normal truncate-lines-2 sm:truncate font-normal text-xs">
                                                    {log.message}
                                                </span>
                                            </div>

                                            {/* Android-style repeat count badge */}
                                            {log.count > 1 && (
                                                <span
                                                    className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-bold shrink-0 shadow-sm"
                                                    title={`Repeated ${log.count} consecutive times`}
                                                >
                                                    ×{log.count}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 5: PHOTOS (Phone Backup Suite, Pixel Bridge, Google Photos)
               ═══════════════════════════════════════════════════════════════════ */}
            {activeLibraryTab === 'photos' && (() => {
                const formatTimeAgo = (ts?: string) => {
                    if (!ts) return '';
                    const diffMs = Date.now() - new Date(ts).getTime();
                    if (isNaN(diffMs)) return '';
                    const sec = Math.floor(diffMs / 1000);
                    if (sec < 60) return `${sec}s ago`;
                    const min = Math.floor(sec / 60);
                    if (min < 60) return `${min}m ago`;
                    const hrs = Math.floor(min / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    return `${Math.floor(hrs / 24)}d ago`;
                };

                const formatBytes = (bytes?: number) => {
                    if (!bytes || bytes <= 0) return '0 B';
                    const mb = bytes / (1024 * 1024);
                    if (mb < 1000) return `${mb.toFixed(1)} MB`;
                    return `${(mb / 1024).toFixed(2)} GB`;
                };

                const filteredPhoneItems = phoneItems.filter((item: any) => {
                    if (phoneFilter === 'queued' && item.status !== 'queued' && item.status !== 'staging') return false;
                    if (phoneFilter === 'transferred' && item.status !== 'transferred') return false;
                    if (phoneFilter === 'uploaded' && item.status !== 'uploaded') return false;
                    if (phoneFilter === 'cleaned' && item.status !== 'cleaned') return false;
                    if (phoneSearch && !item.filename.toLowerCase().includes(phoneSearch.toLowerCase())) return false;
                    return true;
                });

                const parseGb = (val: string | undefined): number => {
                    if (!val) return 0;
                    const match = String(val).match(/([0-9.]+)\s*([GMK]?)/i);
                    if (!match) return 0;
                    const num = parseFloat(match[1]);
                    const unit = (match[2] || 'G').toUpperCase();
                    if (unit === 'M') return num / 1024;
                    if (unit === 'K') return num / (1024 * 1024);
                    if (unit === 'T') return num * 1024;
                    return num;
                };

                const freeGb = parseGb(phoneNode?.freeStorage);
                const totalGb = parseGb(phoneNode?.totalStorage) || 32;
                const usedGb = Math.max(0, totalGb - freeGb);
                const usedPercent = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 45;

                return (
                    <div className="space-y-6 animate-in fade-in">
                        {/* ── 1. HARDWARE NODE & LIVE PIPELINE STATUS ── */}
                        <section className="rounded-3xl bg-[#0d111a] border border-indigo-500/30 p-6 sm:p-8 space-y-6 shadow-2xl">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 shadow-inner">
                                        <Smartphone size={32} />
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <h3 className="text-2xl font-black text-white tracking-tight truncate">
                                                {phoneNode?.cleanModel || phoneNode?.model || 'Pixel Bridge'}
                                            </h3>
                                            <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                                                {phoneNode?.unlimitedTier === 'original_quality' ? 'Unlimited Original' : 'Storage Saver'}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
                                            {phoneNode ? (
                                                <>
                                                    <span
                                                        className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300"
                                                        title={phoneNode.isOnline ? "Device Online via ADB" : "Device Offline / Standby"}
                                                    >
                                                        <span className={`w-2.5 h-2.5 rounded-full ${phoneNode.isOnline ? 'bg-emerald-400 ring-4 ring-emerald-500/20 animate-pulse' : 'bg-zinc-600'}`} />
                                                        <span>{phoneNode.ip}:{phoneNode.port || 5555}</span>
                                                    </span>

                                                    <span
                                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300"
                                                        title={phoneNode.isCharging ? "Charging" : "Battery"}
                                                    >
                                                        {phoneNode.isCharging ? (
                                                            <BatteryCharging size={16} className="text-amber-400 shrink-0" />
                                                        ) : (
                                                            <Battery size={16} className={phoneNode.batteryLevel && phoneNode.batteryLevel > 20 ? 'text-emerald-400 shrink-0' : 'text-rose-400 shrink-0'} />
                                                        )}
                                                        <span className="font-bold text-white">{phoneNode.batteryLevel ?? 85}%</span>
                                                    </span>

                                                    <span
                                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300"
                                                        title="Phone Free Storage Buffer"
                                                    >
                                                        <HardDrive size={16} className="text-indigo-400 shrink-0" />
                                                        <span className="font-bold text-white">{phoneNode.freeStorage || '18.4G'} Free</span>
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-amber-400 font-bold">No device paired yet</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => runAction('phone_batch', { action: 'trigger_phone_backup_batch' })}
                                        disabled={busyKey === 'phone_batch'}
                                        title="Push Next Batch to Pixel"
                                        className="p-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black shadow-lg shadow-emerald-500/20 transition-transform hover:scale-105 cursor-pointer"
                                    >
                                        <Play size={22} className={busyKey === 'phone_batch' ? 'animate-spin' : ''} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => runAction('phone_clean', { action: 'trigger_phone_backup_clean' })}
                                        disabled={busyKey === 'phone_clean'}
                                        title="Clean Space (Google Photos Free Up Space)"
                                        className="p-3.5 rounded-2xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white shadow-lg shadow-rose-500/20 transition-transform hover:scale-105 cursor-pointer"
                                    >
                                        <Trash2 size={22} className={busyKey === 'phone_clean' ? 'animate-pulse' : ''} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={fetchTasks}
                                        title="Refresh Telemetry"
                                        className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                                    >
                                        <RotateCcw size={22} />
                                    </button>

                                    <Link
                                        href="/settings?subtopic=instances"
                                        title="Configure Instances & Devices"
                                        className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                                    >
                                        <Sliders size={22} />
                                    </Link>
                                </div>
                            </div>

                            {/* Storage Headroom Bar */}
                            <div className="space-y-2 pt-3 border-t border-zinc-900">
                                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-zinc-400">
                                    <span>Storage Buffer</span>
                                    <span className="text-white font-mono">{phoneNode?.freeStorage || '18.4G'} Free / {phoneNode?.totalStorage || '32G'}</span>
                                </div>
                                <div className="w-full h-3 rounded-full bg-zinc-900 overflow-hidden p-0.5 border border-zinc-800">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            freeGb >= 4 ? 'bg-emerald-500' : freeGb >= 2 ? 'bg-amber-500' : 'bg-rose-500'
                                        }`}
                                        style={{ width: `${Math.min(100, Math.max(5, usedPercent))}%` }}
                                    />
                                </div>
                            </div>

                            {/* Active In-Flight Task / Stream Guard Banner */}
                            {phoneBackup?.activeTaskName === 'paused' ? (
                                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <ShieldAlert size={22} className="text-amber-400 shrink-0 animate-pulse" />
                                        <span className="text-sm font-bold text-amber-200">
                                            Stream Guard Active: Plex streaming detected. Transfers paused to preserve server bandwidth.
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => runAction('phone_batch', { action: 'trigger_phone_backup_batch' })}
                                        title="Resume Batch Now"
                                        className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black shadow-md cursor-pointer"
                                    >
                                        <Play size={18} />
                                    </button>
                                </div>
                            ) : phoneBackup?.activeTransfer ? (
                                <div className="p-5 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 space-y-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-zinc-900 border border-indigo-500/30 shrink-0 shadow">
                                                <img
                                                    src={phoneBackup.activeTransfer.thumbnailUrl || `/api/theater/photos/immich/asset?id=${phoneBackup.activeTransfer.assetId}&size=preview`}
                                                    alt={phoneBackup.activeTransfer.filename}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                                {phoneBackup.activeTransfer.mediaType === 'video' && (
                                                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-lg bg-black/80 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1">
                                                        <Film size={10} className="text-purple-400" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 space-y-1">
                                                <div className="text-base sm:text-lg font-black text-white truncate">
                                                    {phoneBackup.activeTransfer.filename}
                                                </div>
                                                <div className="text-xs sm:text-sm font-mono text-zinc-400">
                                                    {formatBytes(phoneBackup.activeTransfer.sizeBytes)} • {phoneBackup.activeTransfer.targetPath}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40 shrink-0 animate-pulse">
                                            Staging via ADB
                                        </span>
                                    </div>
                                    <div className="w-full h-2.5 rounded-full bg-zinc-900 overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '65%' }} />
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-400">
                                    <span className="text-zinc-300 font-bold">{phoneBackup?.statusMessage || 'Idle • Ready for next batch'}</span>
                                    <div className="flex items-center gap-4">
                                        {phoneBackup?.lastSyncTime && (
                                            <span>Last Sync: <strong className="text-white">{formatTimeAgo(phoneBackup.lastSyncTime)}</strong></span>
                                        )}
                                        {phoneBackup?.lastCleanTime && (
                                            <span>Last Clean: <strong className="text-white">{formatTimeAgo(phoneBackup.lastCleanTime)}</strong></span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* ── GOOGLE PHOTOS CLOUD UPLOAD INSPECTOR ── */}
                        <section className="p-6 sm:p-7 rounded-3xl bg-[#0d111a] border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-5 min-w-0">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                                    phoneCounts.transferred > 0
                                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                                        : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                                }`}>
                                    {phoneCounts.transferred > 0 ? (
                                        <CloudUpload size={32} className="animate-pulse" />
                                    ) : (
                                        <CloudCheck size={32} />
                                    )}
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-xl font-black text-white">Google Photos Cloud</h4>
                                        <span className={`px-3 py-1 rounded-xl text-xs font-mono font-black uppercase border whitespace-nowrap ${
                                            phoneCounts.transferred > 0
                                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        }`}>
                                            {phoneCounts.transferred > 0 ? 'Syncing to Cloud' : 'Cloud Synced'}
                                        </span>
                                    </div>
                                    <div className="text-sm font-semibold text-zinc-300">
                                        {phoneCounts.transferred > 0
                                            ? `${phoneCounts.transferred} photo(s) in Pixel buffer • Google Photos is syncing to Google Cloud in Lifetime Unlimited Original Quality`
                                            : `All staged media verified in Google Photos Cloud • 0 files pending on phone`}
                                    </div>
                                    <div className="text-xs font-mono text-zinc-500">
                                        Pixel 1 GPhotos tier: Unlimited Original • Auto-Reconciliation Active
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
                                <button
                                    type="button"
                                    onClick={() => runAction('phone_wake', { action: 'trigger_google_photos_wake' })}
                                    disabled={busyKey === 'phone_wake'}
                                    title="Awaken Google Photos app and broadcast MediaStore scan to jumpstart cloud upload"
                                    className="p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-amber-400 transition-all cursor-pointer shadow disabled:opacity-50"
                                >
                                    <Zap size={22} className={busyKey === 'phone_wake' ? 'animate-bounce' : ''} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => runAction('phone_clean', { action: 'trigger_phone_backup_clean' })}
                                    disabled={busyKey === 'phone_clean'}
                                    title="Reconcile with Google Photos: Run Free Up Space to verify cloud backup and purge local buffer"
                                    className="p-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black transition-all cursor-pointer shadow-lg disabled:opacity-50"
                                >
                                    <Sparkles size={22} className={busyKey === 'phone_clean' ? 'animate-spin' : ''} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => runAction('phone_batch', { action: 'trigger_phone_backup_batch' })}
                                    disabled={busyKey === 'phone_batch' || phoneCounts.queued === 0}
                                    title="Push next batch of queued photos from Immich to Pixel staging buffer"
                                    className="p-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white font-black transition-all cursor-pointer shadow-lg disabled:opacity-40"
                                >
                                    <ArrowUpRight size={22} className={busyKey === 'phone_batch' ? 'animate-pulse' : ''} />
                                </button>
                            </div>
                        </section>

                        {/* ── 2. PIPELINE BREAKDOWN COUNTERS ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-6 rounded-3xl bg-[#0d111a] border border-sky-500/30 space-y-2 shadow-xl" title="Photos and videos queued in server staging buffer waiting to be sent to Pixel">
                                <div className="flex items-center justify-between">
                                    <span className="text-base font-black uppercase tracking-wider text-sky-400">Staged</span>
                                    <ArrowUp size={24} className="text-sky-400" />
                                </div>
                                <div className="text-3xl font-black text-white font-mono">
                                    {phoneCounts.queued + phoneCounts.staging}
                                </div>
                                <div className="text-xs text-zinc-400 font-mono">Server queue buffer</div>
                            </div>

                            <div className="p-6 rounded-3xl bg-[#0d111a] border border-amber-500/30 space-y-2 shadow-xl" title="Media copied to Pixel /sdcard/DCIM/SchedulearrSync/ actively uploading to Google Photos">
                                <div className="flex items-center justify-between">
                                    <span className="text-base font-black uppercase tracking-wider text-amber-400">On Phone</span>
                                    <CloudUpload size={24} className="text-amber-400 animate-pulse" />
                                </div>
                                <div className="text-3xl font-black text-white font-mono">
                                    {phoneCounts.transferred}
                                </div>
                                <div className="text-xs text-zinc-400 font-mono">Pixel buffer • Cloud syncing</div>
                            </div>

                            <div className="p-6 rounded-3xl bg-[#0d111a] border border-emerald-500/30 space-y-2 shadow-xl" title="Confirmed safely uploaded to Google Photos Cloud in Lifetime Unlimited Original Quality">
                                <div className="flex items-center justify-between">
                                    <span className="text-base font-black uppercase tracking-wider text-emerald-400">Uploaded</span>
                                    <CheckCircle2 size={24} className="text-emerald-400" />
                                </div>
                                <div className="text-3xl font-black text-white font-mono">
                                    {phoneCounts.uploaded}
                                </div>
                                <div className="text-xs text-zinc-400 font-mono">Google Cloud verified</div>
                            </div>

                            <div className="p-6 rounded-3xl bg-[#0d111a] border border-purple-500/30 space-y-2 shadow-xl" title="Local phone storage reclaimed after Google Photos verified cloud backup">
                                <div className="flex items-center justify-between">
                                    <span className="text-base font-black uppercase tracking-wider text-purple-400">Cleaned</span>
                                    <Trash2 size={24} className="text-purple-400" />
                                </div>
                                <div className="text-3xl font-black text-white font-mono">
                                    {phoneCounts.cleaned}
                                </div>
                                <div className="text-xs text-zinc-400 font-mono">
                                    {formatBytes(phoneCounts.totalBytesCleaned)} reclaimed
                                </div>
                            </div>
                        </div>

                        {/* ── 2B. PHOTO LIFECYCLE PROGRESS PIPELINE ── */}
                        <div className="p-6 rounded-3xl bg-[#0d111a] border border-white/10 space-y-4 shadow-xl">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <Sparkles size={20} className="text-indigo-400" />
                                    <h4 className="text-lg font-black text-white">Full Lifecycle Progress (Staged → Cloud → Cleaned)</h4>
                                </div>
                                <span className="text-xl font-black font-mono text-indigo-300">
                                    {(phoneCounts.queued + phoneCounts.staging + phoneCounts.transferred + phoneCounts.uploaded + phoneCounts.cleaned) > 0
                                        ? Math.round((((phoneCounts.cleaned || 0) * 100 + (phoneCounts.uploaded || 0) * 75 + (phoneCounts.transferred || 0) * 50 + ((phoneCounts.queued || 0) + (phoneCounts.staging || 0)) * 25) / ((phoneCounts.queued + phoneCounts.staging + phoneCounts.transferred + phoneCounts.uploaded + phoneCounts.cleaned) * 100)) * 100)
                                        : 0}% Complete
                                </span>
                            </div>

                            {/* 4-Stage Connected Lifecycle Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono font-bold">
                                <div className="p-3 rounded-2xl bg-black/40 border border-sky-500/30 space-y-1.5">
                                    <div className="flex justify-between text-sky-400">
                                        <span>1. Staged</span>
                                        <span>{phoneCounts.queued + phoneCounts.staging}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                                        <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${(phoneCounts.queued + phoneCounts.staging) > 0 ? 100 : 0}%` }} />
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-black/40 border border-amber-500/30 space-y-1.5">
                                    <div className="flex justify-between text-amber-400">
                                        <span>2. On Phone</span>
                                        <span>{phoneCounts.transferred}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                                        <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${phoneCounts.transferred > 0 ? 100 : 0}%` }} />
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/30 space-y-1.5">
                                    <div className="flex justify-between text-emerald-400">
                                        <span>3. Cloud Synced</span>
                                        <span>{phoneCounts.uploaded}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${phoneCounts.uploaded > 0 ? 100 : 0}%` }} />
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-black/40 border border-purple-500/30 space-y-1.5">
                                    <div className="flex justify-between text-purple-400">
                                        <span>4. Cleaned</span>
                                        <span>{phoneCounts.cleaned}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                                        <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${phoneCounts.cleaned > 0 ? 100 : 0}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── 3. MEDIA LEDGER & PROCESSING DETAILS ── */}
                        <section className="rounded-3xl bg-[#0d111a] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-2xl font-black text-white">Media Ledger</h3>
                                    <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-white/10 text-white">
                                        {filteredPhoneItems.length}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Search Input */}
                                    <div className="relative">
                                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                        <input
                                            type="text"
                                            value={phoneSearch}
                                            onChange={e => setPhoneSearch(e.target.value)}
                                            placeholder="Search media..."
                                            className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>

                                    {/* Filter Tabs */}
                                    <div className="flex items-center gap-1.5 p-1 bg-zinc-900 rounded-xl border border-zinc-800 text-xs font-bold uppercase">
                                        {(['all', 'queued', 'transferred', 'uploaded', 'cleaned'] as const).map(tab => (
                                            <button
                                                key={tab}
                                                type="button"
                                                onClick={() => setPhoneFilter(tab)}
                                                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                                                    phoneFilter === tab
                                                        ? 'bg-indigo-500 text-black'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                {tab === 'all' ? 'All' : tab === 'queued' ? 'Staged' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Clear Cleaned Items History */}
                                    <button
                                        type="button"
                                        onClick={() => runAction('phone_clear_cleaned', { action: 'clear_cleaned_phone_backup' })}
                                        title="Purge Cleaned Items from History"
                                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-all cursor-pointer"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Media Items List (Finite Bounded Scroll Container) */}
                            <div className="max-h-[580px] overflow-y-auto pr-2 space-y-3 custom-scrollbar rounded-2xl bg-black/20 p-2 border border-white/5">
                                {filteredPhoneItems.length === 0 ? (
                                    <div className="p-8 text-center text-zinc-500 text-sm font-mono">
                                        No media items found matching current filter
                                    </div>
                                ) : (
                                    filteredPhoneItems.map((item: any) => {
                                        const isVideo = item.mediaType === 'video';
                                        const statusBadge =
                                            item.status === 'staging'
                                                ? { label: 'Staging', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40 animate-pulse' }
                                                : item.status === 'transferred'
                                                ? { label: 'On Phone (Syncing)', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
                                                : item.status === 'uploaded'
                                                ? { label: 'Uploaded (Cloud)', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
                                                : item.status === 'cleaned'
                                                ? { label: 'Cleaned', cls: 'bg-purple-500/20 text-purple-300 border-purple-500/40' }
                                                : { label: 'Queued', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' };

                                        const itemProgress =
                                            item.status === 'cleaned' ? 100 :
                                            item.status === 'uploaded' ? 75 :
                                            item.status === 'transferred' ? 50 :
                                            (item.status === 'staging' || item.status === 'queued') ? 25 : 0;

                                        const thumbSrc = item.thumbnailUrl || `/api/theater/photos/immich/asset?id=${item.assetId}&size=preview`;

                                        return (
                                            <div
                                                key={item.id}
                                                className="p-4 sm:p-5 rounded-3xl bg-zinc-950/70 border border-zinc-900 hover:border-zinc-800 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 shadow-lg"
                                            >
                                                <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                                                    {/* Authentic Raster Thumbnail (Clickable Lightbox Trigger) */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewPhotoItem(item)}
                                                        className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-indigo-500/50 shadow-lg shrink-0 group cursor-pointer focus:outline-none"
                                                        title="Click to preview full photo or video"
                                                    >
                                                        <img
                                                            src={thumbSrc}
                                                            alt={item.filename}
                                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                            loading="lazy"
                                                            onError={(e) => {
                                                                const target = e.currentTarget;
                                                                target.style.display = 'none';
                                                                const fallback = target.parentElement?.querySelector('.img-fallback') as HTMLElement;
                                                                if (fallback) fallback.style.display = 'flex';
                                                            }}
                                                        />
                                                        <div className="img-fallback hidden w-full h-full items-center justify-center bg-zinc-800 text-zinc-400">
                                                            {isVideo ? <Film size={28} /> : <ImageIcon size={28} />}
                                                        </div>
                                                        {isVideo && (
                                                            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-white flex items-center gap-1.5 text-xs font-black shadow">
                                                                <Film size={12} className="text-purple-400" />
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                            <Eye size={24} className="text-white drop-shadow" />
                                                        </div>
                                                    </button>

                                                    <div className="min-w-0 space-y-1.5 flex-1">
                                                        <div className="text-base sm:text-lg font-bold text-white truncate">
                                                            {item.filename}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-zinc-400 font-mono">
                                                            <span className="font-bold text-zinc-300">{isVideo ? 'VIDEO' : 'PHOTO'}</span>
                                                            <span>•</span>
                                                            <span>{formatBytes(item.sizeBytes)}</span>
                                                            <span>•</span>
                                                            <span className="truncate max-w-[280px] text-zinc-500">{item.targetPath}</span>
                                                        </div>

                                                        {/* Multi-stage lifecycle progress bar */}
                                                        <div className="w-full max-w-sm pt-2 space-y-1">
                                                            <div className="flex items-center justify-between text-[11px] font-mono">
                                                                <span className="text-zinc-400 font-bold">
                                                                    {item.status === 'cleaned' ? 'Cleaned & Archived' : item.status === 'uploaded' ? 'Verified in Cloud' : item.status === 'transferred' ? 'Syncing on Phone' : 'Staged for Transfer'}
                                                                </span>
                                                                <span className={`font-black ${itemProgress === 100 ? 'text-purple-400' : itemProgress >= 75 ? 'text-emerald-400' : itemProgress >= 50 ? 'text-amber-400' : 'text-sky-400'}`}>
                                                                    {itemProgress}%
                                                                </span>
                                                            </div>
                                                            <div className="w-full h-1.5 rounded-full bg-zinc-900 border border-white/5 overflow-hidden flex">
                                                                <div
                                                                    className={`h-full transition-all duration-500 ${
                                                                        itemProgress === 100
                                                                            ? 'bg-gradient-to-r from-sky-500 via-emerald-500 to-purple-500'
                                                                            : itemProgress >= 75
                                                                            ? 'bg-gradient-to-r from-sky-500 via-amber-500 to-emerald-500'
                                                                            : itemProgress >= 50
                                                                            ? 'bg-gradient-to-r from-sky-500 to-amber-500'
                                                                            : 'bg-sky-500'
                                                                    }`}
                                                                    style={{ width: `${itemProgress}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                                    <div className="text-right font-mono text-xs sm:text-sm text-zinc-400">
                                                        {item.uploadedAt ? (
                                                            <div className="text-emerald-400 font-bold">Uploaded {formatTimeAgo(item.uploadedAt)}</div>
                                                        ) : item.transferredAt ? (
                                                            <div className="text-amber-400 font-bold">Transferred {formatTimeAgo(item.transferredAt)}</div>
                                                        ) : (
                                                            <div>Staged {formatTimeAgo(item.stagedAt)}</div>
                                                        )}
                                                        {item.speedBps && item.speedBps > 0 && (
                                                            <div className="text-zinc-500">{Math.round(item.speedBps / 1024 / 1024)} MB/s</div>
                                                        )}
                                                    </div>

                                                    <span className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-mono font-bold uppercase border whitespace-nowrap ${statusBadge.cls}`}>
                                                        {statusBadge.label}
                                                    </span>

                                                    {(item.status === 'cleaned' || item.status === 'uploaded' || item.status === 'failed') && (
                                                        <button
                                                            type="button"
                                                            onClick={() => runAction(`phone_retry_${item.id}`, { action: 'retry_phone_backup_item', itemId: item.id })}
                                                            title="Re-queue Item for Staging"
                                                            className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer shadow"
                                                        >
                                                            <RotateCcw size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </section>
                    </div>
                );
            })()}

            {/* Error Diagnostics & Resolution Modal */}
            {showErrorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
                    <div className="w-full max-w-3xl rounded-3xl bg-zinc-950 border border-rose-500/40 shadow-2xl p-6 space-y-6 max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">Diagnostics & Error Recovery</h3>
                                    <p className="text-xs text-gray-400 font-mono">
                                        {failedItems.length > 0 ? `${failedItems.length} failed task item(s) logged` : `${totalFailedChapters} task error(s) detected`}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowErrorModal(false)}
                                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Quick Actions Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 shrink-0">
                            <div className="text-xs text-gray-300 font-medium">
                                Resolve failures by re-triggering pipelines or clearing stale chapter error markers.
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await runAction('retry_all_errors', { action: 'retry_all_failed_tasks' });
                                        setShowErrorModal(false);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg transition-all"
                                >
                                    <RotateCcw size={14} />
                                    <span>Retry All</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await runAction('clear_all_errors', { action: 'clear_failed_tasks' });
                                        setShowErrorModal(false);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all"
                                >
                                    <Trash2 size={14} />
                                    <span>Clear Errors</span>
                                </button>
                            </div>
                        </div>

                        {/* Error Items List */}
                        <div className="space-y-3 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                            {failedItems.length > 0 ? (
                                failedItems.map((item, idx) => (
                                    <div
                                        key={item.id || idx}
                                        className="p-4 rounded-2xl bg-black/40 border border-rose-500/20 hover:border-rose-500/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    >
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                                    {item.stage || 'Pipeline'}
                                                </span>
                                                <h4 className="text-sm font-black text-white truncate">
                                                    {item.title} {item.item ? `— ${item.item}` : ''}
                                                </h4>
                                            </div>
                                            <p className="text-xs font-mono text-rose-200/90 break-words">
                                                {item.error || 'Chapter transcription/processing encountered an error'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => runAction(`retry_item_${item.id}`, { action: 'retry_task_item', bookKey: item.bookKey, chapterKey: item.chapterKey })}
                                            className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-all self-end sm:self-center"
                                        >
                                            <RotateCcw size={13} />
                                            <span>Retry</span>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center rounded-2xl bg-black/20 border border-white/5 space-y-2">
                                    <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
                                    <p className="text-sm font-bold text-gray-300">No active chapter errors recorded</p>
                                    <p className="text-xs text-gray-500 font-mono">Any logged errors have been cleared or re-queued for processing.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Photo Preview Lightbox Modal */}
            {previewPhotoItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 animate-in fade-in">
                    <div className="w-full max-w-4xl rounded-3xl bg-zinc-950 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 px-6 border-b border-white/10 bg-black/40 shrink-0">
                            <div className="min-w-0 pr-4">
                                <h3 className="text-base font-black text-white truncate">{previewPhotoItem.filename}</h3>
                                <p className="text-xs text-gray-400 font-mono truncate">{previewPhotoItem.targetPath || 'Pixel Bridge Media'}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewPhotoItem(null)}
                                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer shrink-0"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Media View */}
                        <div className="relative flex-1 bg-black flex items-center justify-center p-4 overflow-hidden min-h-[300px] max-h-[60vh]">
                            {previewPhotoItem.mediaType === 'video' ? (
                                <video
                                    src={previewPhotoItem.thumbnailUrl || `/api/theater/photos/immich/asset?id=${previewPhotoItem.assetId}`}
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-[56vh] object-contain rounded-xl shadow-2xl"
                                />
                            ) : (
                                <img
                                    src={previewPhotoItem.thumbnailUrl || `/api/theater/photos/immich/asset?id=${previewPhotoItem.assetId}&size=preview`}
                                    alt={previewPhotoItem.filename}
                                    className="max-w-full max-h-[56vh] object-contain rounded-xl shadow-2xl"
                                />
                            )}
                        </div>

                        {/* Footer Details */}
                        <div className="p-4 px-6 bg-zinc-900/80 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 shrink-0">
                            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-300">
                                <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white font-bold uppercase">
                                    {previewPhotoItem.status}
                                </span>
                                <span>Size: {Math.round((previewPhotoItem.sizeBytes || 0) / 1024 / 1024 * 10) / 10} MB</span>
                                {previewPhotoItem.uploadedAt && <span>Uploaded: {new Date(previewPhotoItem.uploadedAt).toLocaleString()}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        runAction(`phone_retry_${previewPhotoItem.id}`, { action: 'retry_phone_backup_item', itemId: previewPhotoItem.id });
                                        setPreviewPhotoItem(null);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                                >
                                    <RotateCcw size={14} />
                                    <span>Re-queue</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewPhotoItem(null)}
                                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition-all"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
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

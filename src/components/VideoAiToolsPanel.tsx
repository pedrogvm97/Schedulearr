'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Cpu, Film, RefreshCw, Trash2, Play, Pause, Check, X,
    Sliders, Clock, ListFilter, ArrowUpDown, Shield, FileText,
    Download, Activity, AlertCircle, Sparkles, Layers
} from 'lucide-react';
import { toast } from 'sonner';

export const VideoAiToolsPanel: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [cpuData, setCpuData] = useState<any>(null);
    const [subtitles, setSubtitles] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [libraries, setLibraries] = useState<any[]>([]);
    const [priorityRule, setPriorityRule] = useState<string>('recently_added');
    const [cpuThreads, setCpuThreads] = useState<number>(2);
    const [queue, setQueue] = useState<any[]>([]);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'failed'>('all');
    const [processingItemPath, setProcessingItemPath] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/ai/video');
            const data = await res.json();
            if (data.ok) {
                setCpuData(data.cpu);
                setSubtitles(data.subtitles || []);
                setHistory(data.history || []);
                setLibraries(data.libraries || []);
                if (data.priorityRule) setPriorityRule(data.priorityRule);
                if (data.cpuThreads) setCpuThreads(data.cpuThreads);
                setQueue(data.queue || []);
            }
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleToggleLibrary = async (libraryId: string, currentVal: boolean) => {
        const nextVal = !currentVal;
        setLibraries(prev => prev.map(l => l.id === libraryId ? { ...l, autoProcess: nextVal } : l));
        try {
            const res = await fetch('/api/ai/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle_library', libraryId, enabled: nextVal })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(nextVal ? 'Auto-processing activated for library' : 'Auto-processing deactivated for library');
                fetchData();
            } else {
                toast.error(data.error || 'Failed to update library setting');
            }
        } catch {
            toast.error('Error updating library setting');
        }
    };

    const handleSetPriorityRule = async (rule: string) => {
        setPriorityRule(rule);
        try {
            const res = await fetch('/api/ai/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_priority_rule', rule })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(`Priority queue rule updated`);
                fetchData();
            }
        } catch {
            toast.error('Failed to update priority rule');
        }
    };

    const handleSetCpuThreads = async (threads: number) => {
        setCpuThreads(threads);
        try {
            const res = await fetch('/api/ai/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_cpu_threads', threads })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(`CPU threads set to ${threads}`);
                fetchData();
            }
        } catch {
            toast.error('Failed to set CPU threads');
        }
    };

    const handleTranscribeNow = async (item: any) => {
        setProcessingItemPath(item.videoPath);
        toast.info(`Starting local CPU transcription for "${item.mediaTitle}"...`);
        try {
            const res = await fetch('/api/ai/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'transcribe_now',
                    videoPath: item.videoPath,
                    mediaTitle: item.mediaTitle,
                    targetLang: 'en',
                    libraryId: item.libraryId,
                    libraryName: item.libraryName,
                    mediaType: item.mediaType
                })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(`Subtitle generated locally on CPU for "${item.mediaTitle}"`);
                fetchData();
            } else {
                toast.error(data.error || 'Transcription failed');
            }
        } catch {
            toast.error('Error running transcription');
        } finally {
            setProcessingItemPath(null);
        }
    };

    const handleDeleteSubtitle = async (sub: any) => {
        try {
            const res = await fetch('/api/ai/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_subtitle', id: sub.id, subPath: sub.sub_path })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(`Subtitle deleted`);
                setSubtitles(prev => prev.filter(s => s.id !== sub.id));
            } else {
                toast.error(data.error || 'Failed to delete');
            }
        } catch {
            toast.error('Error deleting subtitle');
        }
    };

    const handleClearHistory = async () => {
        try {
            const res = await fetch('/api/ai/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clear_history' })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(`Processing history cleared`);
                setHistory([]);
            }
        } catch {
            toast.error('Error clearing history');
        }
    };

    const filteredHistory = history.filter(h => {
        if (historyFilter === 'completed') return h.status === 'completed';
        if (historyFilter === 'failed') return h.status === 'failed';
        return true;
    });

    const isJobActive = Boolean(cpuData?.isProcessingActive);
    const cpuPct = cpuData?.systemCpuPercent || 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* ── 1. Real-Time CPU Power & Local Processor Telemetry ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-5 border-b border-zinc-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-md">
                            <Cpu size={28} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-2xl font-black text-white tracking-tight">CPU Power</h2>
                                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    Local CPU Whisper
                                </span>
                                {isJobActive && (
                                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                        Active Processing
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={fetchData}
                        className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer self-start sm:self-auto"
                        title="Refresh CPU power telemetry"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* CPU Power Meter Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Gauge Card */}
                    <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Current CPU Load</span>
                            <span className={`text-xl font-black ${cpuPct >= 80 ? 'text-rose-400' : cpuPct >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {cpuPct}%
                            </span>
                        </div>
                        <div className="relative h-4 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    cpuPct >= 80 ? 'bg-rose-500' : cpuPct >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.max(2, Math.min(100, cpuPct))}%` }}
                            />
                        </div>
                        <span className="text-xs font-bold text-zinc-400">
                            {cpuData?.model || 'Local Host CPU'} ({cpuData?.cores || 1} Cores)
                        </span>
                    </div>

                    {/* Thread Allocation Control */}
                    <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Local Thread Allocation</span>
                            <span className="text-xl font-black text-indigo-400">{cpuThreads} Cores</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 4, 8].map(th => (
                                <button
                                    key={th}
                                    type="button"
                                    onClick={() => handleSetCpuThreads(th)}
                                    className={`py-2 rounded-xl text-xs font-black uppercase transition-all border cursor-pointer ${
                                        cpuThreads === th
                                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                    }`}
                                    title={`Allocate ${th} CPU thread(s) for local offline transcription`}
                                >
                                    {th}T
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Active Job Card */}
                    <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Engine Status</span>
                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase ${
                                isJobActive ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}>
                                {isJobActive ? 'Running' : 'Idle'}
                            </span>
                        </div>
                        {isJobActive && cpuData?.currentJob ? (
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-white truncate block">{cpuData.currentJob.title}</span>
                                <span className="text-xs text-amber-400 font-bold">Elapsed: {cpuData.currentJob.elapsedSeconds}s</span>
                            </div>
                        ) : (
                            <span className="text-xs font-bold text-emerald-400">Ready</span>
                        )}
                        <span className="text-xs text-zinc-500 font-mono">Whisper.cpp (AVX2/NEON)</span>
                    </div>
                </div>
            </div>

            {/* ── 2. Per-Library Auto-Processing Toggles ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                    <h3 className="text-xl font-black text-white flex items-center gap-2.5">
                        <Layers size={22} className="text-indigo-400" />
                        Libraries Auto-Processing
                    </h3>
                </div>

                {libraries.length === 0 ? (
                    <div className="p-6 bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500 text-center">
                        No video instances
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {libraries.map(lib => (
                            <div
                                key={lib.id}
                                className={`p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                                    lib.autoProcess
                                        ? 'bg-zinc-950 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                                        : 'bg-zinc-950/40 border-zinc-900 opacity-65'
                                }`}
                            >
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${lib.autoProcess ? 'bg-emerald-400 shadow-sm' : 'bg-zinc-600'}`} />
                                        <h4 className="text-base font-black text-white truncate" title={lib.name}>{lib.name}</h4>
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                                        {lib.type === 'iptv_dvr' ? 'IPTV DVR' : lib.type}
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleToggleLibrary(lib.id, lib.autoProcess)}
                                    className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${
                                        lib.autoProcess ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-zinc-800'
                                    }`}
                                    title={lib.autoProcess ? `Deactivate auto-processing for ${lib.name}` : `Activate auto-processing for ${lib.name}`}
                                >
                                    <div className={`w-6 h-6 rounded-full bg-white transition-transform ${lib.autoProcess ? 'translate-x-7' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── 3. Priority Queue Rules & Pending Queue ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <ArrowUpDown size={22} className="text-indigo-400" />
                        <h3 className="text-xl font-black text-white">Queue &amp; Priority Rules</h3>
                    </div>

                    {/* Priority Rule Selector */}
                    <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 flex-wrap">
                        {[
                            { id: 'recently_added', label: 'Recently Added' },
                            { id: 'oldest_added', label: 'Oldest Added' },
                            { id: 'alphabetical', label: 'Alphabetical' },
                            { id: 'smallest_size', label: 'Smallest Size' }
                        ].map(rule => (
                            <button
                                key={rule.id}
                                type="button"
                                onClick={() => handleSetPriorityRule(rule.id)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    priorityRule === rule.id
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                                title={`Sort priority queue by ${rule.label}`}
                            >
                                {rule.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Queue List */}
                {queue.length === 0 ? (
                    <div className="p-8 text-center bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500">
                        Empty
                    </div>
                ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {queue.map(item => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950 border border-zinc-850 hover:border-zinc-700 transition-all"
                            >
                                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                    <span className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-black flex items-center justify-center flex-shrink-0">
                                        #{item.priorityRank}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-sm sm:text-base font-bold text-white truncate" title={item.mediaTitle}>
                                            {item.mediaTitle}
                                        </h4>
                                        <div className="flex items-center gap-2 text-xs text-zinc-400 font-semibold mt-1">
                                            <span>{item.libraryName}</span>
                                            <span>•</span>
                                            <span className="text-zinc-300 font-mono font-bold">{(item.sizeBytes / (1024 ** 2)).toFixed(1)} MB</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleTranscribeNow(item)}
                                    disabled={processingItemPath === item.videoPath}
                                    className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer disabled:opacity-50"
                                    title={`Transcribe "${item.mediaTitle}" locally on CPU now`}
                                >
                                    {processingItemPath === item.videoPath ? (
                                        <RefreshCw size={18} className="animate-spin" />
                                    ) : (
                                        <Play size={18} />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── 4. Subtitles Generated ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <FileText size={22} className="text-emerald-400" />
                        <h3 className="text-xl font-black text-white">Generated Subtitles ({subtitles.length})</h3>
                    </div>
                </div>

                {subtitles.length === 0 ? (
                    <div className="p-8 text-center bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500">
                        Empty
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {subtitles.map(sub => (
                            <div
                                key={sub.id}
                                className="p-5 rounded-2xl bg-zinc-950 border border-zinc-850 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <h4 className="text-base font-black text-white truncate" title={sub.media_title}>
                                            {sub.media_title}
                                        </h4>
                                        <div className="flex items-center gap-2 flex-wrap text-xs">
                                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                                                {sub.language_name || sub.language}
                                            </span>
                                            <span className="text-zinc-400 font-semibold">{sub.library_name || 'Local'}</span>
                                            {sub.sub_size_bytes > 0 && (
                                                <span className="text-zinc-500 font-mono font-bold">
                                                    {(sub.sub_size_bytes / 1024).toFixed(1)} KB
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action icons (Zero text!) */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <a
                                            href={`/api/theater/subtitles?fetchVttPath=${encodeURIComponent(sub.sub_path)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all inline-flex"
                                            title="Preview / Download WebVTT subtitle track"
                                        >
                                            <Download size={18} />
                                        </a>

                                        <button
                                            type="button"
                                            onClick={() => handleDeleteSubtitle(sub)}
                                            className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                                            title="Delete subtitle"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-500 font-medium">
                                    <span>{new Date(sub.updated_at || sub.created_at).toLocaleString()}</span>
                                    <span className="font-mono text-zinc-400">Local CPU ({sub.cpu_threads || 2}T)</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── 5. Processing History ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <Activity size={22} className="text-amber-400" />
                        <h3 className="text-xl font-black text-white">Processing History ({filteredHistory.length})</h3>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                            {(['all', 'completed', 'failed'] as const).map(tab => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setHistoryFilter(tab)}
                                    className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                                        historyFilter === tab
                                            ? 'bg-zinc-800 text-white'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                    title={`Filter history by ${tab}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Clear History Button (Pure symbol!) */}
                        {history.length > 0 && (
                            <button
                                type="button"
                                onClick={handleClearHistory}
                                className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-rose-400 transition-all cursor-pointer"
                                title="Clear processing history"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {filteredHistory.length === 0 ? (
                    <div className="p-8 text-center bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500">
                        Empty
                    </div>
                ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                        {filteredHistory.map(h => (
                            <div
                                key={h.id}
                                className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-950 border border-zinc-850 hover:border-zinc-700 transition-all"
                            >
                                <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`w-2.5 h-2.5 rounded-full ${h.status === 'completed' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                        <h4 className="text-sm sm:text-base font-bold text-white truncate" title={h.media_title}>
                                            {h.media_title}
                                        </h4>
                                        <span className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                                            h.status === 'completed'
                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                        }`}>
                                            {h.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 font-semibold">{h.details}</p>
                                </div>

                                <div className="text-right flex-shrink-0 ml-4 space-y-0.5">
                                    <span className="text-xs font-mono font-bold text-zinc-300 block">
                                        {h.duration_ms ? `${(h.duration_ms / 1000).toFixed(1)}s` : '–'}
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                        {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

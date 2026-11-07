'use client';

import React, { useState, useEffect } from 'react';
import {
    Activity, AlertTriangle, CheckCircle2, RotateCcw, Zap, RefreshCw,
    Sliders, Key, Layers, BookOpen, Sparkles, AlertCircle, ArrowUp
} from 'lucide-react';
import { toast } from 'sonner';
import { AiApiAnalyticsPanel } from '@/components/AiApiAnalyticsPanel';

export function AiDiagnosticsPanel() {
    const [studioData, setStudioData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchStudioStatus = async () => {
        try {
            const res = await fetch('/api/theater/audiobooks/studio');
            if (res.ok) {
                const data = await res.json();
                setStudioData(data);
            }
        } catch {} finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudioStatus();
        const interval = setInterval(fetchStudioStatus, 8000);
        return () => clearInterval(interval);
    }, []);

    const handleResetDailyQuota = async () => {
        setActionLoading('reset_quota');
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset_daily_quota' })
            });
            if (res.ok) {
                toast.success("Daily image quota reset to 0! Pipeline resumed.");
                await fetchStudioStatus();
            } else {
                toast.error("Failed to reset quota");
            }
        } catch {
            toast.error("Failed to reset quota");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRetryFailedChapters = async () => {
        setActionLoading('retry_failed');
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry_failed_chapters' })
            });
            if (res.ok) {
                toast.success("Cleared failed status on chapters! Retrying illustrations...");
                await fetchStudioStatus();
            } else {
                toast.error("Failed to retry chapters");
            }
        } catch {
            toast.error("Failed to retry chapters");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRunWorkerNow = async () => {
        setActionLoading('run_worker');
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'run_queue' })
            });
            if (res.ok) {
                toast.success("Pipeline triggered!");
                await fetchStudioStatus();
            }
        } catch {} finally {
            setActionLoading(null);
        }
    };

    const config = studioData?.config || {};
    const worker = studioData?.worker || studioData?.status || {};
    const books = Array.isArray(studioData?.books) ? studioData.books : [];

    const dailyLimit = config.dailyImageQuota || 30;
    const imagesToday = studioData?.imagesGeneratedToday || 0;
    const isQuotaExhausted = imagesToday >= dailyLimit;

    // Detect stuck books: 100% trans, 100% scened, 0% imaging
    const stuckBooks = books.filter((b: any) => {
        const transCh = b.transCh || 0;
        const totalCh = b.totalCh || 1;
        const scenedCh = b.scenedCh || 0;
        const illCh = b.illCh || 0;
        return transCh >= totalCh && scenedCh >= totalCh && illCh === 0;
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header */}
            <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Activity size={26} className="text-emerald-400" />
                        AI Telemetry &amp; Diagnostics
                    </h2>
                    <p className="text-sm text-zinc-400 font-medium mt-1">
                        Live quota health, stuck pipeline root cause resolver, and comprehensive resource telemetry
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchStudioStatus}
                        className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 cursor-pointer"
                        title="Refresh Telemetry"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ── ROOT CAUSE DIAGNOSTIC CARD: WHY ARE BOOKS STUCK? ── */}
            <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-[#1c120c] via-zinc-950 to-black border-2 border-amber-500/50 shadow-2xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3.5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${
                            isQuotaExhausted
                                ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        }`}>
                            {isQuotaExhausted ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white">Daily Image Quota Status</h3>
                            <p className="text-xs text-zinc-400 font-medium">
                                {isQuotaExhausted
                                    ? "Imaging is PAUSED: Today's limit reached. Reset quota below to resume immediately."
                                    : "Quota is HEALTHY: Background pipeline generates new artwork automatically."}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-mono font-black ${
                            isQuotaExhausted
                                ? 'bg-red-500 text-white'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}>
                            {imagesToday} / {dailyLimit} Images Today
                        </span>
                    </div>
                </div>

                {/* Stuck Books Warning Section */}
                {stuckBooks.length > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                        <div className="flex items-center gap-2 text-amber-300 text-sm font-black uppercase">
                            <AlertCircle size={18} />
                            <span>{stuckBooks.length} Audiobook(s) Waiting on Image Generation</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {stuckBooks.map((b: any) => (
                                <span key={b.bookKey || b.id} className="px-3 py-1 rounded-xl bg-zinc-950 border border-amber-500/40 text-amber-200 text-xs font-bold">
                                    {b.title} (100% Transcript • 100% Scened • 0% Illustrated)
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Immediate Resolution Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <button
                        onClick={handleResetDailyQuota}
                        disabled={actionLoading !== null}
                        className="py-4 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                    >
                        <RotateCcw size={18} className={actionLoading === 'reset_quota' ? 'animate-spin' : ''} />
                        <span>Reset Daily Quota &amp; Resume</span>
                    </button>

                    <button
                        onClick={handleRetryFailedChapters}
                        disabled={actionLoading !== null}
                        className="py-4 px-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-2 border-zinc-700 hover:border-amber-500 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 transition-all"
                    >
                        <RefreshCw size={18} className={actionLoading === 'retry_failed' ? 'animate-spin text-amber-400' : 'text-amber-400'} />
                        <span>Retry Failed Chapters</span>
                    </button>

                    <button
                        onClick={handleRunWorkerNow}
                        disabled={actionLoading !== null}
                        className="py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                        <Zap size={18} className={actionLoading === 'run_worker' ? 'animate-spin' : ''} />
                        <span>Run Queue Now</span>
                    </button>
                </div>
            </div>

            {/* ── RICH TELEMETRY GRAPHS & USAGE PANELS ── */}
            <AiApiAnalyticsPanel />
        </div>
    );
}

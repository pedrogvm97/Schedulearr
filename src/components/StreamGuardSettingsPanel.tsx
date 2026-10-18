'use client';

import React, { useState, useEffect } from 'react';
import {
    Shield,
    ShieldAlert,
    ShieldCheck,
    Check,
    RefreshCw,
    Download,
    Cpu,
    Smartphone,
    Search,
    Clock,
    Tv
} from 'lucide-react';
import { toast } from 'sonner';

interface StreamGuardSettings {
    enabled: boolean;
    pauseQbit: boolean;
    pauseCpuAi: boolean;
    pausePixel: boolean;
    pauseBatchSearch: boolean;
    gracePeriodSeconds: number;
}

interface StreamGuardStatus {
    enabled: boolean;
    isThrottled: boolean;
    activeSessionsCount: number;
    activeStreams: Array<{
        id: string;
        title: string;
        user: string;
        device: string;
        bandwidthMbps: string;
        isTranscoding: boolean;
        videoDecision: string;
    }>;
    throttledSince: string | null;
    pausedTorrentHashes: string[];
    settings: StreamGuardSettings;
    lastCheckAt: string;
}

export function StreamGuardSettingsPanel() {
    const [status, setStatus] = useState<StreamGuardStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/system/stream-guard');
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch {
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const timer = setInterval(fetchStatus, 4000);
        return () => clearInterval(timer);
    }, []);

    const handleToggle = async (key: keyof StreamGuardSettings, val: any) => {
        if (!status) return;
        const updated = {
            ...status.settings,
            [key]: val
        };
        setStatus(prev => prev ? { ...prev, settings: updated } : null);
        setSaving(true);
        try {
            const res = await fetch('/api/system/stream-guard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: updated })
            });
            if (res.ok) {
                toast.success('Updated');
                fetchStatus();
            } else {
                toast.error('Failed to update');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setSaving(false);
        }
    };

    const settings = status?.settings || {
        enabled: true,
        pauseQbit: true,
        pauseCpuAi: true,
        pausePixel: true,
        pauseBatchSearch: true,
        gracePeriodSeconds: 30
    };

    return (
        <div className="bg-zinc-950/80 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${
                        status?.isThrottled
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                            : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    }`}>
                        {status?.isThrottled ? <ShieldAlert size={28} /> : <ShieldCheck size={28} />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-2xl font-black text-white tracking-tight">Stream Guard</h2>
                            <span className={`px-2.5 py-0.5 rounded-xl text-xs font-mono font-black uppercase border ${
                                status?.isThrottled
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            }`}>
                                {status?.isThrottled ? 'Active Streaming' : 'Ready'}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                            {status?.isThrottled && status.activeStreams.length > 0
                                ? `Streaming "${status.activeStreams[0].title}" to ${status.activeStreams[0].user} • Background work held`
                                : 'Plex Playback Watchdog • Preserves bandwidth & CPU during streaming'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchStatus}
                        title="Refresh Status"
                        className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Live Active Stream Alert */}
            {status?.isThrottled && status.activeStreams.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-3">
                        <Tv size={20} className="text-amber-400 shrink-0" />
                        <span className="text-white font-bold font-mono">
                            {status.activeStreams.map(s => `${s.title} (${s.user} on ${s.device} • ${s.bandwidthMbps} Mbps)`).join(', ')}
                        </span>
                    </div>
                    {status.pausedTorrentHashes.length > 0 && (
                        <span className="text-xs font-mono text-amber-300 bg-black/40 px-3 py-1 rounded-lg border border-amber-500/30">
                            {status.pausedTorrentHashes.length} torrent(s) paused
                        </span>
                    )}
                </div>
            )}

            {/* Toggles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Master Toggle */}
                <div
                    onClick={() => handleToggle('enabled', !settings.enabled)}
                    title="Enable or disable automated Plex Stream Guard watchdog"
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        settings.enabled
                            ? 'bg-amber-600/10 border-amber-500/50 text-white'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                    }`}
                >
                    <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.enabled ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Shield size={22} />
                        </div>
                        <span className="text-base font-bold">Watchdog</span>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${settings.enabled ? 'bg-amber-500 text-black' : 'bg-zinc-800'}`}>
                        {settings.enabled && <Check size={16} />}
                    </div>
                </div>

                {/* 2. Pause qBittorrent */}
                <div
                    onClick={() => handleToggle('pauseQbit', !settings.pauseQbit)}
                    title="Pause active downloading torrents in qBittorrent while streaming"
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        settings.pauseQbit
                            ? 'bg-sky-600/10 border-sky-500/50 text-white'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                    }`}
                >
                    <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.pauseQbit ? 'bg-sky-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Download size={22} />
                        </div>
                        <span className="text-base font-bold">Pause Torrents</span>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${settings.pauseQbit ? 'bg-sky-500 text-black' : 'bg-zinc-800'}`}>
                        {settings.pauseQbit && <Check size={16} />}
                    </div>
                </div>

                {/* 3. Pause CPU AI (Whisper / Subtitles) */}
                <div
                    onClick={() => handleToggle('pauseCpuAi', !settings.pauseCpuAi)}
                    title="Pause Whisper speech-to-text, video subtitles, and AI artwork during streaming"
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        settings.pauseCpuAi
                            ? 'bg-emerald-600/10 border-emerald-500/50 text-white'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                    }`}
                >
                    <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.pauseCpuAi ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Cpu size={22} />
                        </div>
                        <span className="text-base font-bold">Pause CPU AI</span>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${settings.pauseCpuAi ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}>
                        {settings.pauseCpuAi && <Check size={16} />}
                    </div>
                </div>

                {/* 4. Pause Pixel Transfers */}
                <div
                    onClick={() => handleToggle('pausePixel', !settings.pausePixel)}
                    title="Pause LAN photo pushes to Pixel 1 bridge while streaming"
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        settings.pausePixel
                            ? 'bg-indigo-600/10 border-indigo-500/50 text-white'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                    }`}
                >
                    <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.pausePixel ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Smartphone size={22} />
                        </div>
                        <span className="text-base font-bold">Pause Pixel</span>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${settings.pausePixel ? 'bg-indigo-500 text-white' : 'bg-zinc-800'}`}>
                        {settings.pausePixel && <Check size={16} />}
                    </div>
                </div>

                {/* 5. Pause Arr Batch Search */}
                <div
                    onClick={() => handleToggle('pauseBatchSearch', !settings.pauseBatchSearch)}
                    title="Pause Radarr and Sonarr automated batch grabs while streaming"
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        settings.pauseBatchSearch
                            ? 'bg-purple-600/10 border-purple-500/50 text-white'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                    }`}
                >
                    <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.pauseBatchSearch ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Search size={22} />
                        </div>
                        <span className="text-base font-bold">Pause Arr</span>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${settings.pauseBatchSearch ? 'bg-purple-500 text-white' : 'bg-zinc-800'}`}>
                        {settings.pauseBatchSearch && <Check size={16} />}
                    </div>
                </div>

                {/* 6. Grace Period */}
                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-zinc-300 flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center">
                            <Clock size={22} />
                        </div>
                        <span className="text-base font-bold">Grace (s)</span>
                    </div>
                    <select
                        value={settings.gracePeriodSeconds}
                        onChange={e => handleToggle('gracePeriodSeconds', parseInt(e.target.value, 10))}
                        title="Cooldown period in seconds after playback stops before background tasks resume"
                        className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm outline-none cursor-pointer"
                    >
                        <option value={15}>15s</option>
                        <option value={30}>30s</option>
                        <option value={60}>60s</option>
                        <option value={120}>120s</option>
                    </select>
                </div>
            </div>
        </div>
    );
}

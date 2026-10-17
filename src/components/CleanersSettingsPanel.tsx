'use client';

import React, { useState, useEffect } from 'react';
import {
    Trash2, RefreshCw, Shield, AlertTriangle, Check, Layers,
    HardDrive, Database, Sliders, ChevronDown, Sparkles, BookOpen,
    FileText, Headphones, Image as ImageIcon, Volume2
} from 'lucide-react';
import { toast } from 'sonner';
import { twColorToHex } from '@/lib/instanceColor';

export type CleanerSubtab = 'torrents' | 'media' | 'audiobooks' | 'database';

export interface CleanersSettingsPanelProps {
    diskInfo: any;
    diskPauseThreshold: number;
    setDiskPauseThreshold: (val: number) => void;
    diskAutocleanEnabled: boolean;
    setDiskAutocleanEnabled: (val: boolean) => void;
    diskPauseEnabled: boolean;
    setDiskPauseEnabled: (val: boolean) => void;
    diskSmartCleanMode: string;
    setDiskSmartCleanMode: (val: string) => void;
    diskSmartCleanSeriesLevel: 'series' | 'season' | 'episode';
    setDiskSmartCleanSeriesLevel: (val: 'series' | 'season' | 'episode') => void;
    diskSmartCleanImmunityEnabled: boolean;
    setDiskSmartCleanImmunityEnabled: (val: boolean) => void;
    diskSmartCleanImmunityDays: number;
    setDiskSmartCleanImmunityDays: (val: number) => void;
    diskSmartCleanIgnoredInstances: string[];
    setDiskSmartCleanIgnoredInstances: (val: string[]) => void;
    instances: any[];
    libraryLimits: Array<{
        id: string;
        name: string;
        instanceId: string;
        type: 'radarr' | 'sonarr' | 'lidarr' | 'iptv_dvr';
        enabled: boolean;
        maxGb: number;
        cleanMode: 'largest' | 'oldest' | 'unplayed';
    }>;
    handleUpdateLibraryLimit: (id: string, updates: Partial<{ enabled: boolean; maxGb: number; cleanMode: 'largest' | 'oldest' | 'unplayed' }>) => void;
    handleRunLibraryClean: (lib: any) => Promise<void>;
    cleaningLibraryId: string | null;
    candidates: any[];
    loadingCandidates: boolean;
    fetchCandidates: () => Promise<void>;
    toggleIgnoreCandidate: (key: string) => Promise<void>;
    instanceSegments: any[];
    formatBytes: (bytes: number) => string;
    updateSetting: (key: string, val: any) => Promise<any>;
    refreshDiskInfo: () => void;
    dbStats: { totalSizeBytes: number; tableStats: any[] } | null;
    setDbStats: (stats: any) => void;
    onOpenUnifiedCleanerModal?: () => void;
}

export const CleanersSettingsPanel: React.FC<CleanersSettingsPanelProps> = ({
    diskInfo,
    diskPauseThreshold,
    setDiskPauseThreshold,
    diskAutocleanEnabled,
    setDiskAutocleanEnabled,
    diskPauseEnabled,
    setDiskPauseEnabled,
    diskSmartCleanMode,
    setDiskSmartCleanMode,
    diskSmartCleanSeriesLevel,
    setDiskSmartCleanSeriesLevel,
    diskSmartCleanImmunityEnabled,
    setDiskSmartCleanImmunityEnabled,
    diskSmartCleanImmunityDays,
    setDiskSmartCleanImmunityDays,
    diskSmartCleanIgnoredInstances,
    setDiskSmartCleanIgnoredInstances,
    instances,
    libraryLimits,
    handleUpdateLibraryLimit,
    handleRunLibraryClean,
    cleaningLibraryId,
    candidates,
    loadingCandidates,
    fetchCandidates,
    toggleIgnoreCandidate,
    instanceSegments,
    formatBytes,
    updateSetting,
    refreshDiskInfo,
    dbStats,
    setDbStats,
    onOpenUnifiedCleanerModal
}) => {
    const [cleanerSubtab, setCleanerSubtab] = useState<CleanerSubtab>('torrents');
    const [retentionDays, setRetentionDays] = useState(30);
    const [pruningDb, setPruningDb] = useState(false);

    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    const safeLibraryLimits = Array.isArray(libraryLimits) ? libraryLimits : [];
    const safeInstances = Array.isArray(instances) ? instances : [];
    const safeInstanceSegments = Array.isArray(instanceSegments) ? instanceSegments : [];

    // Audiobook Studio Cleaner State
    const [audiobookScope, setAudiobookScope] = useState<'all' | 'images' | 'scenes' | 'transcripts' | 'voices' | 'api_history'>('all');
    const [audiobookTargetMode, setAudiobookTargetMode] = useState<'all_books' | 'single_book'>('all_books');
    const [audiobookSelectedBookKey, setAudiobookSelectedBookKey] = useState<string>('');
    const [cleaningAudiobooks, setCleaningAudiobooks] = useState(false);
    const [audiobookConfirmed, setAudiobookConfirmed] = useState(false);
    const [audiobooksList, setAudiobooksList] = useState<Array<{ bookKey: string; title: string; author: string }>>([]);

    useEffect(() => {
        if (cleanerSubtab === 'audiobooks' && audiobooksList.length === 0) {
            fetch('/api/theater/audiobooks/studio')
                .then(r => r.json())
                .then(data => {
                    if (data.books && Array.isArray(data.books)) {
                        setAudiobooksList(data.books.map((b: any) => ({
                            bookKey: b.book_key,
                            title: b.title,
                            author: b.author
                        })));
                    }
                })
                .catch(() => {});
        }
    }, [cleanerSubtab, audiobooksList.length]);

    const handleCleanToThreshold = async () => {
        try {
            toast.info('Trimming disk usage to target threshold...');
            const res = await fetch('/api/media/smart-clean', { method: 'POST' });
            const json = await res.json();
            if (json.cleanedCount > 0) {
                toast.success(json.message || `Cleaned ${json.cleanedCount} items.`);
            } else {
                toast.info(json.message || 'Disk space is within target threshold.');
            }
            setTimeout(() => {
                fetchCandidates();
                refreshDiskInfo();
            }, 1200);
        } catch {
            toast.error('Clean to threshold failed');
        }
    };

    const handleSingleCandidateDelete = async (item: any) => {
        try {
            let res;
            if (item.type === 'movie') {
                res = await fetch(`/api/radarr/delete?instanceId=${item.instanceId}&movieId=${item.id}&deleteFiles=true`, { method: 'DELETE' });
            } else if (item.type === 'series') {
                res = await fetch(`/api/sonarr/delete?instanceId=${item.instanceId}&seriesId=${item.id}&deleteFiles=true`, { method: 'DELETE' });
            } else if (item.type === 'season') {
                res = await fetch(`/api/sonarr/delete?instanceId=${item.instanceId}&seriesId=${item.seriesId}&seasonNumber=${item.seasonNumber}&deleteFiles=true&deleteFilesOnly=true`, { method: 'DELETE' });
            } else if (item.type === 'episode') {
                res = await fetch(`/api/sonarr/delete?instanceId=${item.instanceId}&episodeFileId=${item.episodeFileId}&deleteFiles=true&deleteFilesOnly=true`, { method: 'DELETE' });
            }
            if (res?.ok) {
                toast.success(`Cleaned "${item.title}"`);
                fetchCandidates();
                refreshDiskInfo();
            } else {
                toast.error('Clean failed');
            }
        } catch {
            toast.error('Clean failed');
        }
    };

    const handleRunDbPrune = async () => {
        setPruningDb(true);
        try {
            const res = await fetch('/api/maintenance/prune-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daysToKeep: retentionDays })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(`Removed ${data.deletedRows || 0} rows. Vacuumed successfully.`);
                const statsRes = await fetch('/api/stats/db-info');
                if (statsRes.ok) setDbStats(await statsRes.json());
            } else {
                toast.error(data.error || 'Prune failed');
            }
        } catch {
            toast.error('Database maintenance failed');
        } finally {
            setPruningDb(false);
        }
    };

    const handleExecuteAudiobookClean = async () => {
        setCleaningAudiobooks(true);
        try {
            const payload: any = {
                action: 'clean_generated_data',
                target: audiobookScope
            };
            if (audiobookTargetMode === 'single_book' && audiobookSelectedBookKey) {
                payload.bookKey = audiobookSelectedBookKey;
            }
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`Cleaned: ${data.deletedFilesCount || 0} files deleted across ${data.booksAffected || 0} books.`);
                setAudiobookConfirmed(false);
            } else {
                toast.error(data.error || 'Failed to clean audiobook assets');
            }
        } catch {
            toast.error('Network error executing clean operation');
        } finally {
            setCleaningAudiobooks(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* ── Subtabs Navigation Bar ── */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-800">
                <button
                    type="button"
                    onClick={() => setCleanerSubtab('torrents')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        cleanerSubtab === 'torrents'
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Shield size={18} />
                    <span>Torrents & Storage Guard</span>
                </button>

                <button
                    type="button"
                    onClick={() => setCleanerSubtab('media')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        cleanerSubtab === 'media'
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Layers size={18} />
                    <span>Media Library Smart Clean</span>
                </button>

                <button
                    type="button"
                    onClick={() => setCleanerSubtab('audiobooks')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        cleanerSubtab === 'audiobooks'
                            ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Sparkles size={18} />
                    <span>Audiobook Studio Cache</span>
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setCleanerSubtab('database');
                        if (!dbStats) {
                            fetch('/api/stats/db-info').then(r => r.json()).then(setDbStats).catch(() => {});
                        }
                    }}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap ${
                        cleanerSubtab === 'database'
                            ? 'bg-purple-500 text-black shadow-lg shadow-purple-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Database size={18} />
                    <span>Database & Housekeeping</span>
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                SUBTAB 1: TORRENTS & STORAGE GUARD
               ═══════════════════════════════════════════════════════════════════ */}
            {cleanerSubtab === 'torrents' && (
                <div className="space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-7 shadow-2xl">
                        {/* Header Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-5 border-b border-zinc-800">
                            <div className="flex items-center gap-4">
                                <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-md">
                                    <Shield size={28} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-black text-white tracking-tight">Storage Guard & Torrents</h2>
                                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                            diskAutocleanEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                        }`}>
                                            {diskAutocleanEnabled ? 'Active' : 'Off'}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-zinc-400 mt-1">Automatic torrent trimming and disk space guardian</p>
                                </div>
                            </div>

                            {/* Master Switch & Trigger Percentage */}
                            <div className="flex items-center gap-4 bg-zinc-950 p-3 rounded-2xl border border-zinc-800 flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Threshold:</span>
                                    <input
                                        type="number"
                                        min="50"
                                        max="99"
                                        value={diskPauseThreshold}
                                        onChange={e => {
                                            const val = Math.min(99, Math.max(50, parseInt(e.target.value) || 90));
                                            setDiskPauseThreshold(val);
                                            updateSetting('storage_guard_threshold', String(val));
                                            updateSetting('disk_pause_threshold', String(val));
                                            updateSetting('disk_autoclean_threshold', String(val));
                                        }}
                                        className="w-16 bg-zinc-900 border border-zinc-700 rounded-xl text-center py-1 text-emerald-400 font-black text-base outline-none focus:border-emerald-500"
                                        title="Disk capacity threshold percentage to trigger auto-clean"
                                    />
                                    <span className="text-xs font-black text-emerald-400">%</span>
                                </div>

                                <div className="w-px h-6 bg-zinc-800" />

                                <button
                                    type="button"
                                    onClick={async () => {
                                        const next = !diskAutocleanEnabled;
                                        setDiskAutocleanEnabled(next);
                                        await updateSetting('storage_guard_enabled', String(next));
                                        await updateSetting('disk_autoclean_enabled', String(next));
                                        toast.success(next ? 'Storage Guard Activated' : 'Storage Guard Deactivated');
                                    }}
                                    className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${diskAutocleanEnabled ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}`}
                                    title={diskAutocleanEnabled ? 'Deactivate Storage Guard' : 'Activate Storage Guard'}
                                >
                                    <div className={`w-6 h-6 rounded-full bg-white transition-transform ${diskAutocleanEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Storage Capacity Bar */}
                        {diskInfo ? (
                            <div className="p-5 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-black text-white uppercase tracking-wider flex items-center gap-2">
                                        <HardDrive size={18} className="text-emerald-400" />
                                        Storage Capacity
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                                            diskInfo.usedPercent >= diskPauseThreshold
                                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                                : diskInfo.usedPercent >= 75
                                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                        }`}>
                                            {diskInfo.usedPercent}% Occupied
                                        </span>
                                        <button
                                            type="button"
                                            onClick={refreshDiskInfo}
                                            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                            title="Refresh live disk storage capacity"
                                        >
                                            <RefreshCw size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Segmented Progress Bar */}
                                <div className="relative h-5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 flex">
                                    {safeInstanceSegments.map((seg: any) => (
                                        <div
                                            key={seg.id}
                                            className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full hover:opacity-90 relative group"
                                            style={{
                                                width: `${seg.percent}%`,
                                                backgroundColor: seg.colorHex,
                                                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2)`
                                            }}
                                            title={`${seg.name}: ${seg.percent.toFixed(1)}% (${formatBytes(seg.bytes)})`}
                                        />
                                    ))}
                                    {/* Threshold Marker */}
                                    <div
                                        className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none"
                                        style={{ left: `${diskPauseThreshold}%` }}
                                        title={`Auto-Clean Trigger: ${diskPauseThreshold}%`}
                                    >
                                        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white rounded-full shadow-md" />
                                    </div>
                                </div>

                                <div className="flex justify-between text-xs sm:text-sm text-zinc-300 font-bold">
                                    <span>{formatBytes(diskInfo.usedBytes)} used of {formatBytes(diskInfo.totalBytes)}</span>
                                    <span className="text-emerald-400 font-black">{formatBytes(diskInfo.freeBytes)} free</span>
                                </div>

                                {/* Legend */}
                                {safeInstanceSegments.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 border-t border-zinc-900 text-xs">
                                        {safeInstanceSegments.map((seg: any) => (
                                            <div key={seg.id} className="flex items-center gap-2 text-zinc-300 font-bold">
                                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.colorHex }} />
                                                <span>{seg.name}:</span>
                                                <span className="text-white font-black">{formatBytes(seg.bytes || (diskInfo.totalBytes * seg.percent / 100))}</span>
                                                <span className="text-zinc-500 font-semibold">({seg.percent.toFixed(1)}%)</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-6 bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500 animate-pulse text-center">
                                Querying storage capacity...
                            </div>
                        )}

                        {/* qBittorrent & Pause Options */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-4">
                                <div>
                                    <span className="text-sm font-black text-white block">Pause Scheduler on Threshold</span>
                                    <span className="text-xs text-zinc-400">Halts search downloads when storage is above target</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const next = !diskPauseEnabled;
                                        setDiskPauseEnabled(next);
                                        await updateSetting('storage_guard_pause_scheduler', String(next));
                                        await updateSetting('disk_pause_enabled', String(next));
                                    }}
                                    className={`w-12 h-6.5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${diskPauseEnabled ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                    title={diskPauseEnabled ? 'Disable scheduler pause' : 'Enable scheduler pause on low disk space'}
                                >
                                    <div className={`w-5.5 h-5.5 rounded-full bg-white transition-transform ${diskPauseEnabled ? 'translate-x-5.5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-4">
                                <div>
                                    <span className="text-sm font-black text-white block">Immediate Storage Trim</span>
                                    <span className="text-xs text-zinc-400">Purges unseeded/cleaned torrents to restore free space</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCleanToThreshold}
                                    className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-2"
                                    title="Trim disk usage to target threshold"
                                >
                                    <Trash2 size={18} />
                                    <span className="text-xs font-black uppercase">Trim Now</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                SUBTAB 2: MEDIA LIBRARY SMART CLEAN
               ═══════════════════════════════════════════════════════════════════ */}
            {cleanerSubtab === 'media' && (
                <div className="space-y-6">
                    {/* Media Clean Rules */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                            <div className="flex items-center gap-3">
                                <Layers size={24} className="text-emerald-400" />
                                <h3 className="text-xl font-black text-white">Smart Clean Policy</h3>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Clean Selection Priority */}
                            <div className="space-y-3">
                                <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Global Priority Rule</span>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {[
                                        { id: 'largest', label: 'Largest Files' },
                                        { id: 'oldest', label: 'Oldest Added' },
                                        { id: 'unplayed', label: 'Unplayed in Plex' }
                                    ].map(mode => (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            onClick={async () => {
                                                setDiskSmartCleanMode(mode.id);
                                                await updateSetting('qbit_smart_clean_mode', mode.id);
                                                fetchCandidates();
                                            }}
                                            className={`py-3 px-4 text-xs font-black rounded-xl uppercase tracking-wider transition-all border cursor-pointer ${
                                                diskSmartCleanMode === mode.id
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                                            }`}
                                            title={`Set global cleaning priority to ${mode.label}`}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* TV Series Cleanup Level */}
                            <div className="space-y-3">
                                <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">TV Series Cleanup Scope</span>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {(['series', 'season', 'episode'] as const).map(level => (
                                        <button
                                            key={level}
                                            type="button"
                                            onClick={() => {
                                                setDiskSmartCleanSeriesLevel(level);
                                                updateSetting('media_smart_clean_series_level', level);
                                                setTimeout(fetchCandidates, 300);
                                            }}
                                            className={`py-3 px-4 text-xs font-black rounded-xl uppercase tracking-wider transition-all border cursor-pointer ${
                                                diskSmartCleanSeriesLevel === level
                                                    ? 'bg-violet-500/20 text-violet-400 border-violet-500/40 shadow-sm'
                                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                                            }`}
                                            title={`Clean TV shows by ${level}`}
                                        >
                                            {level === 'series' ? 'Entire Show' : level === 'season' ? 'By Season' : 'By Episode'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Immunity Window */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                                <div>
                                    <span className="text-sm font-black text-white block">Immunity Window</span>
                                    <span className="text-xs text-zinc-400">Protect recently added items from deletion</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="365"
                                        value={diskSmartCleanImmunityDays}
                                        onChange={async e => {
                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                            setDiskSmartCleanImmunityDays(val);
                                            await updateSetting('qbit_smart_clean_immunity_days', String(val));
                                            await updateSetting('qbit_smart_clean_immunity_enabled', 'true');
                                            fetchCandidates();
                                        }}
                                        className="w-18 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-sm font-black text-emerald-400 text-center outline-none"
                                        title="Days to protect recently added media from being cleaned"
                                    />
                                    <span className="text-xs font-bold text-zinc-400">Days</span>
                                </div>
                            </div>

                            {/* Excluded Libraries Selection */}
                            <div className="space-y-3 pt-2 border-t border-zinc-800">
                                <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Excluded Protected Libraries</span>
                                <div className="flex flex-wrap gap-2.5">
                                    {safeInstances.filter(i => i.type === 'radarr' || i.type === 'sonarr' || i.type === 'lidarr').map(inst => {
                                        const isIgnored = diskSmartCleanIgnoredInstances.includes(inst.id);
                                        return (
                                            <button
                                                key={inst.id}
                                                type="button"
                                                onClick={() => {
                                                    const next = isIgnored
                                                        ? diskSmartCleanIgnoredInstances.filter(id => id !== inst.id)
                                                        : [...diskSmartCleanIgnoredInstances, inst.id];
                                                    setDiskSmartCleanIgnoredInstances(next);
                                                    updateSetting('media_smart_clean_ignored_instances', JSON.stringify(next));
                                                    setTimeout(fetchCandidates, 300);
                                                }}
                                                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-2 cursor-pointer ${
                                                    isIgnored
                                                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                                                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                                                }`}
                                                title={isIgnored ? `Unprotect ${inst.name}` : `Protect ${inst.name} from auto-deletion`}
                                            >
                                                <span className={`w-2.5 h-2.5 rounded-full ${isIgnored ? 'bg-rose-400' : 'bg-zinc-600'}`} />
                                                {inst.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Library Storage Limits */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                            <h3 className="text-xl font-black text-white flex items-center gap-2.5">
                                <Layers size={22} className="text-emerald-400" />
                                Library Storage Limits
                            </h3>
                        </div>

                        {safeLibraryLimits.length === 0 ? (
                            <div className="p-6 bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500 text-center">
                                No instances configured.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {safeLibraryLimits.map(lib => {
                                    const instDisk = diskInfo?.byInstance?.find((i: any) => i.id === lib.instanceId || i.name === lib.name || (lib.type === 'iptv_dvr' && i.type === 'iptv_dvr'));
                                    const colorHex = instDisk?.colorHex || (lib.type === 'iptv_dvr' ? '#f43f5e' : (lib.type === 'lidarr' ? '#10b981' : twColorToHex(instDisk?.color)));
                                    const folders = Array.isArray(instDisk?.folders) ? instDisk.folders : [];
                                    const hostVolTotal = folders.reduce((s: number, f: any) => s + (f?.totalBytes || 0), 0);
                                    const hostVolFree = folders.reduce((s: number, f: any) => s + (f?.freeBytes || 0), 0);
                                    const hostVolUsed = hostVolTotal - hostVolFree;

                                    const mediaBytes = (instDisk?.mediaBytes && instDisk.mediaBytes > 0)
                                        ? instDisk.mediaBytes
                                        : (lib.type === 'iptv_dvr' ? 0 : hostVolUsed);
                                    const mediaGb = mediaBytes > 0 ? (mediaBytes / (1024 ** 3)) : 0;
                                    const percentOfLimit = lib.maxGb > 0 && mediaGb > 0 ? Math.min(100, Math.round((mediaGb / lib.maxGb) * 100)) : 0;
                                    const isOverLimit = lib.enabled && lib.maxGb > 0 && mediaGb > lib.maxGb;

                                    return (
                                        <div
                                            key={lib.id}
                                            className={`p-5 rounded-2xl border transition-all ${
                                                lib.enabled
                                                    ? isOverLimit
                                                        ? 'bg-rose-500/5 border-rose-500/40 shadow-lg'
                                                        : 'bg-zinc-950/80 border-zinc-800/90'
                                                    : 'bg-zinc-950/40 border-zinc-900 opacity-60'
                                            }`}
                                        >
                                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div
                                                        className="p-3 rounded-2xl border flex-shrink-0"
                                                        style={{ backgroundColor: `${colorHex}15`, borderColor: `${colorHex}35`, color: colorHex }}
                                                    >
                                                        <HardDrive size={22} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-3 flex-wrap">
                                                            <span className="text-lg font-black text-white">{lib.name}</span>
                                                            <span
                                                                className="px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider border"
                                                                style={{ backgroundColor: `${colorHex}15`, borderColor: `${colorHex}30`, color: colorHex }}
                                                            >
                                                                {lib.type === 'iptv_dvr' ? 'IPTV DVR' : lib.type}
                                                            </span>
                                                            {isOverLimit && (
                                                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
                                                                    Over Limit ({mediaGb.toFixed(0)} GB &gt; {lib.maxGb} GB)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs sm:text-sm text-zinc-300 font-bold mt-1">
                                                            Occupied: <span className="text-white font-black">{formatBytes(mediaBytes)}</span>
                                                            {lib.enabled && lib.maxGb > 0 && (
                                                                <span className="text-zinc-400 font-bold"> ({percentOfLimit}% of {lib.maxGb} GB limit)</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-3">
                                                    {lib.enabled && lib.type !== 'iptv_dvr' && (
                                                        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                                                            {(['largest', 'oldest', 'unplayed'] as const).map(m => (
                                                                <button
                                                                    key={m}
                                                                    type="button"
                                                                    onClick={() => handleUpdateLibraryLimit(lib.id, { cleanMode: m })}
                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                                                                        lib.cleanMode === m
                                                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                                            : 'text-zinc-400 hover:text-zinc-200'
                                                                    }`}
                                                                    title={`Set clean order to ${m}`}
                                                                >
                                                                    {m}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
                                                        <span className="text-xs font-black text-zinc-400 uppercase">Max:</span>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="100000"
                                                            value={lib.maxGb}
                                                            disabled={!lib.enabled}
                                                            onChange={e => handleUpdateLibraryLimit(lib.id, { maxGb: Math.max(1, parseInt(e.target.value) || 100) })}
                                                            className="w-20 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-center text-sm font-black text-emerald-400 outline-none disabled:opacity-40"
                                                            title="Maximum storage capacity in gigabytes"
                                                        />
                                                        <span className="text-xs font-bold text-zinc-400">GB</span>
                                                    </div>

                                                    {lib.enabled && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRunLibraryClean(lib)}
                                                            disabled={cleaningLibraryId === lib.id}
                                                            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                                                            title={`Run clean routine for ${lib.name}`}
                                                        >
                                                            {cleaningLibraryId === lib.id ? (
                                                                <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                                            ) : (
                                                                <Trash2 size={20} />
                                                            )}
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateLibraryLimit(lib.id, { enabled: !lib.enabled })}
                                                        className={`w-12 h-6.5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${
                                                            lib.enabled ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-zinc-800'
                                                        }`}
                                                        title={lib.enabled ? `Disable limit for ${lib.name}` : `Enable limit for ${lib.name}`}
                                                    >
                                                        <div className={`w-5.5 h-5.5 rounded-full bg-white transition-transform ${lib.enabled ? 'translate-x-5.5' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-3.5">
                                                <div className="relative h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/80">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${Math.min(100, percentOfLimit)}%`,
                                                            backgroundColor: isOverLimit ? '#f43f5e' : colorHex
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Candidate Queue */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                            <div className="flex items-center gap-3">
                                <Trash2 size={24} className="text-amber-400" />
                                <h3 className="text-xl font-black text-white">Cleanup Candidates ({safeCandidates.length})</h3>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleCleanToThreshold}
                                    className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all cursor-pointer"
                                    title="Trim items now until total disk usage falls below target threshold"
                                >
                                    <Trash2 size={20} />
                                </button>
                                <button
                                    type="button"
                                    onClick={fetchCandidates}
                                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                                    title="Refresh cleanup candidate queue"
                                >
                                    <RefreshCw size={20} className={loadingCandidates ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        {loadingCandidates ? (
                            <div className="p-8 text-center text-sm font-bold text-zinc-500 italic">Calculating cleanup candidates...</div>
                        ) : safeCandidates.length === 0 ? (
                            <div className="p-8 text-center bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500">
                                No items matching cleanup criteria. Storage is healthy.
                            </div>
                        ) : (
                            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {safeCandidates.slice(0, 30).map((c, idx) => (
                                    <div
                                        key={c.key || idx}
                                        className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                                            c.ignored
                                                ? 'bg-zinc-950/40 border-zinc-900 opacity-60'
                                                : 'bg-zinc-950 border-zinc-850 hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                            <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black flex items-center justify-center flex-shrink-0">
                                                #{idx + 1}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className={`text-sm font-bold truncate max-w-md ${c.ignored ? 'line-through text-zinc-500' : 'text-white'}`} title={c.title}>
                                                        {c.title}
                                                    </h4>
                                                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-bold uppercase">
                                                        {c.type}
                                                    </span>
                                                    {c.isWatched && (
                                                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                                                            Watched
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500 font-semibold mt-1">
                                                    <span>{c.instanceName}</span>
                                                    <span>•</span>
                                                    <span className="text-zinc-300 font-black">{((c.size || 0) / (1024 ** 3)).toFixed(2)} GB</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => toggleIgnoreCandidate(c.key)}
                                                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                                    c.ignored
                                                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                                }`}
                                                title={c.ignored ? 'Unignore candidate' : 'Ignore candidate (protect from cleaning)'}
                                            >
                                                <Shield size={16} />
                                            </button>
                                            {!c.ignored && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSingleCandidateDelete(c)}
                                                    className="p-2 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                                                    title={`Permanently delete ${c.title}`}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                SUBTAB 3: AUDIOBOOK STUDIO CACHE (EMBEDDED CLEANER)
               ═══════════════════════════════════════════════════════════════════ */}
            {cleanerSubtab === 'audiobooks' && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-7 shadow-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
                        <div className="flex items-center gap-3.5">
                            <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Sparkles size={26} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Audiobook Studio Asset Cache</h3>
                                <p className="text-sm text-zinc-400 font-semibold mt-0.5">Selectively clean generated transcripts, scenes, images, or voices</p>
                            </div>
                        </div>

                        {/* Scope Toggle: All Books vs Single Book */}
                        <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setAudiobookTargetMode('all_books')}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    audiobookTargetMode === 'all_books'
                                        ? 'bg-amber-500 text-black shadow'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                                All Audiobooks
                            </button>
                            <button
                                type="button"
                                onClick={() => setAudiobookTargetMode('single_book')}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    audiobookTargetMode === 'single_book'
                                        ? 'bg-amber-500 text-black shadow'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                                Single Book
                            </button>
                        </div>
                    </div>

                    {/* Single Book Selector */}
                    {audiobookTargetMode === 'single_book' && (
                        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-400 block">Select Audiobook</span>
                            <select
                                value={audiobookSelectedBookKey}
                                onChange={e => setAudiobookSelectedBookKey(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-base font-bold text-white cursor-pointer outline-none focus:border-amber-500"
                            >
                                <option value="">Choose an audiobook to clean...</option>
                                {audiobooksList.map(b => (
                                    <option key={b.bookKey} value={b.bookKey}>
                                        {b.title} {b.author ? `— ${b.author}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Target Assets Scope Grid */}
                    <div className="space-y-3">
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-400 block">Target Asset Type</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {[
                                {
                                    id: 'all' as const,
                                    title: 'All Generated Assets',
                                    desc: 'Purge artwork, scenes, transcripts, and voice exports completely',
                                    icon: <Trash2 size={22} className="text-red-400" />,
                                    border: 'border-red-500/40 hover:border-red-400 bg-red-950/20'
                                },
                                {
                                    id: 'images' as const,
                                    title: 'Artwork Only',
                                    desc: 'Delete generated scene artwork while keeping transcripts & timestamps',
                                    icon: <ImageIcon size={22} className="text-emerald-400" />,
                                    border: 'border-emerald-500/40 hover:border-emerald-400 bg-emerald-950/20'
                                },
                                {
                                    id: 'scenes' as const,
                                    title: 'Scenes & Artwork',
                                    desc: 'Delete LLM-detected scenes and artwork while keeping transcripts',
                                    icon: <Sparkles size={22} className="text-purple-400" />,
                                    border: 'border-purple-500/40 hover:border-purple-400 bg-purple-950/20'
                                },
                                {
                                    id: 'transcripts' as const,
                                    title: 'Transcripts Only',
                                    desc: 'Delete verbatim Speech-to-Text .lrc and .txt transcripts',
                                    icon: <FileText size={22} className="text-amber-400" />,
                                    border: 'border-amber-500/40 hover:border-amber-400 bg-amber-950/20'
                                },
                                {
                                    id: 'voices' as const,
                                    title: 'Voice Exports',
                                    desc: 'Delete generated .m4a audio tracks from persona enhancements',
                                    icon: <Headphones size={22} className="text-blue-400" />,
                                    border: 'border-blue-500/40 hover:border-blue-400 bg-blue-950/20'
                                },
                                {
                                    id: 'api_history' as const,
                                    title: 'API Usage Logs',
                                    desc: 'Clear recorded AI provider request history and telemetry',
                                    icon: <Database size={22} className="text-zinc-400" />,
                                    border: 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/40'
                                }
                            ].map(opt => {
                                const isSel = audiobookScope === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                            setAudiobookScope(opt.id);
                                            setAudiobookConfirmed(false);
                                        }}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${opt.border} ${
                                            isSel ? 'ring-2 ring-amber-400 shadow-xl' : 'opacity-70 hover:opacity-100'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <div className="flex items-center gap-2.5">
                                                {opt.icon}
                                                <h4 className="text-sm font-black text-white">{opt.title}</h4>
                                            </div>
                                            {isSel && (
                                                <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0">
                                                    <Check size={12} className="stroke-[3]" />
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-zinc-400">{opt.desc}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Action Bar with Confirmation */}
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <AlertTriangle size={20} className="text-amber-400 shrink-0" />
                            <p className="text-xs sm:text-sm text-zinc-300 font-bold">
                                Target: <span className="text-amber-300 font-black">
                                    {audiobookTargetMode === 'all_books' ? 'All Audiobooks in Library' : (audiobookSelectedBookKey || 'No book selected')}
                                </span>
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {!audiobookConfirmed ? (
                                <button
                                    type="button"
                                    disabled={audiobookTargetMode === 'single_book' && !audiobookSelectedBookKey}
                                    onClick={() => setAudiobookConfirmed(true)}
                                    className="px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-black border border-red-500/40 text-xs sm:text-sm font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 transition-all"
                                >
                                    Clean {audiobookScope.toUpperCase()}
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAudiobookConfirmed(false)}
                                        className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={cleaningAudiobooks}
                                        onClick={handleExecuteAudiobookClean}
                                        className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
                                    >
                                        {cleaningAudiobooks ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        Confirm Purge
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                SUBTAB 4: DATABASE & HOUSEKEEPING
               ═══════════════════════════════════════════════════════════════════ */}
            {cleanerSubtab === 'database' && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                        <div className="flex items-center gap-3.5">
                            <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <Database size={26} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Database Housekeeping</h3>
                                <p className="text-sm text-zinc-400 font-semibold mt-0.5">SQLite database vacuum, log retention, and table maintenance</p>
                            </div>
                        </div>

                        {dbStats && (
                            <span className="text-sm font-black text-purple-300 bg-purple-500/10 border border-purple-500/30 px-3.5 py-1.5 rounded-xl font-mono">
                                {Math.round(dbStats.totalSizeBytes / (1024 * 1024))} MB
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Retention & Prune */}
                        <div className="p-5 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-4">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Retention Policy</span>
                            <div className="flex gap-3 items-center">
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={retentionDays}
                                    onChange={e => setRetentionDays(parseInt(e.target.value) || 30)}
                                    className="w-24 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm font-black text-white text-center outline-none"
                                    title="Retention window in days for search history and logs"
                                />
                                <span className="text-xs font-bold text-zinc-400">Days</span>

                                <button
                                    type="button"
                                    onClick={handleRunDbPrune}
                                    disabled={pruningDb}
                                    className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer ml-auto disabled:opacity-50"
                                    title="Prune logs older than retention days and optimize SQLite database (VACUUM)"
                                >
                                    {pruningDb ? <RefreshCw size={20} className="animate-spin" /> : <Trash2 size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Table row breakdown */}
                        <div className="p-5 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-3">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Table Breakdown</span>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {Array.isArray(dbStats?.tableStats) && dbStats.tableStats.map((table: any) => (
                                    <div key={table.name} className="flex items-center justify-between p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800/80">
                                        <span className="text-xs font-bold text-zinc-300 capitalize">{table.name.replace(/_/g, ' ')}</span>
                                        <span className="text-xs font-black text-white font-mono">{table.count.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

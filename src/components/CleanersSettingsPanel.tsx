'use client';

import React, { useState } from 'react';
import {
    Trash2, RefreshCw, Shield, AlertTriangle, Check, Layers,
    HardDrive, Database, Sliders, ChevronDown, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { twColorToHex } from '@/lib/instanceColor';

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
    const [retentionDays, setRetentionDays] = useState(30);
    const [pruningDb, setPruningDb] = useState(false);
    const [isDbHousekeepingOpen, setIsDbHousekeepingOpen] = useState(false);

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

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* ── 1. Unified Storage Guard & Disk Fill Bar ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-7 shadow-2xl">
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-5 border-b border-zinc-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-md">
                            <Shield size={28} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-black text-white tracking-tight">Storage Guard</h2>
                                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                    diskAutocleanEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                }`}>
                                    {diskAutocleanEnabled ? 'Active' : 'Off'}
                                </span>
                            </div>
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
                            {instanceSegments.map((seg: any) => (
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
                        {instanceSegments.length > 0 && (
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 border-t border-zinc-900 text-xs">
                                {instanceSegments.map((seg: any) => (
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

                {/* Global Rules Section */}
                {diskAutocleanEnabled && (
                    <div className="space-y-6 p-6 bg-zinc-950/70 rounded-2xl border border-zinc-800">
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

                        {/* Immunity Window & Scheduler Pause */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-zinc-850">
                            {/* Immunity */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
                                <div>
                                    <span className="text-sm font-black text-white block">Immunity Window</span>
                                    <span className="text-xs text-zinc-400">Protect recently added items</span>
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
                                        className="w-18 bg-zinc-950 border border-zinc-700 rounded-xl px-2 py-1.5 text-sm font-black text-emerald-400 text-center outline-none"
                                        title="Days to protect recently added media from being cleaned"
                                    />
                                    <span className="text-xs font-bold text-zinc-400">Days</span>
                                </div>
                            </div>

                            {/* Pause Scheduler */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
                                <div>
                                    <span className="text-sm font-black text-white block">Pause Scheduler</span>
                                    <span className="text-xs text-zinc-400">Halt search downloads above threshold</span>
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
                        </div>

                        {/* Excluded Libraries Selection */}
                        <div className="space-y-3 pt-3 border-t border-zinc-850">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Excluded Protected Libraries</span>
                            <div className="flex flex-wrap gap-2.5">
                                {instances.filter(i => i.type === 'radarr' || i.type === 'sonarr' || i.type === 'lidarr').map(inst => {
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
                )}
            </div>

            {/* ── 2. Individual Library Limits & Dedicated Clean Routines ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                    <div>
                        <h3 className="text-xl font-black text-white flex items-center gap-2.5">
                            <Layers size={22} className="text-emerald-400" />
                            Library Storage Limits
                        </h3>
                    </div>
                </div>

                {libraryLimits.length === 0 ? (
                    <div className="p-6 bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500 text-center">
                        No instances configured. Add Radarr, Sonarr, or DVR instances to configure library limits.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {libraryLimits.map(lib => {
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

                                        {/* Controls */}
                                        <div className="flex flex-wrap items-center gap-3">
                                            {/* Clean Mode selector */}
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

                                            {/* Max Size */}
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

                                            {/* Clean Routine Icon Button */}
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

                                            {/* Toggle switch */}
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

                                    {/* Progress */}
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

            {/* ── 3. Unified Candidate Deletion Queue ── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <Trash2 size={24} className="text-amber-400" />
                        <h3 className="text-xl font-black text-white">Cleanup Candidates Queue ({candidates.length})</h3>
                    </div>

                    <div className="flex items-center gap-3">
                        {onOpenUnifiedCleanerModal && (
                            <button
                                type="button"
                                onClick={onOpenUnifiedCleanerModal}
                                className="p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-all cursor-pointer"
                                title="Open selective asset cleaner (images, scenes, transcripts, voice, api history)"
                            >
                                <Sparkles size={20} />
                            </button>
                        )}
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
                ) : candidates.length === 0 ? (
                    <div className="p-8 text-center bg-zinc-950 rounded-2xl border border-zinc-800 text-sm font-bold text-zinc-500">
                        No items matching cleanup criteria. Storage is healthy.
                    </div>
                ) : (
                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                        {candidates.slice(0, 30).map((c, idx) => (
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

            {/* ── 4. Database Housekeeping & Table Stats ── */}
            <div className={`bg-zinc-900 border ${isDbHousekeepingOpen ? 'border-amber-500/30' : 'border-zinc-800'} rounded-3xl transition-all overflow-hidden shadow-2xl`}>
                <button
                    type="button"
                    onClick={() => {
                        setIsDbHousekeepingOpen(!isDbHousekeepingOpen);
                        if (!isDbHousekeepingOpen) {
                            fetch('/api/stats/db-info').then(r => r.json()).then(setDbStats).catch(() => {});
                        }
                    }}
                    className="w-full flex items-center justify-between p-6 sm:p-7 hover:bg-zinc-850/50 transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Database size={24} />
                        </div>
                        <div className="text-left">
                            <h2 className="text-xl font-black text-white">Database Housekeeping</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {dbStats && (
                            <span className="text-xs font-black text-zinc-300 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
                                {Math.round(dbStats.totalSizeBytes / (1024 * 1024))} MB
                            </span>
                        )}
                        <ChevronDown size={20} className={`text-zinc-500 transition-transform duration-300 ${isDbHousekeepingOpen ? 'rotate-180' : ''}`} />
                    </div>
                </button>

                {isDbHousekeepingOpen && (
                    <div className="p-6 sm:p-8 pt-0 border-t border-zinc-800 animate-in fade-in duration-300 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
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
                                        className="p-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-all cursor-pointer ml-auto disabled:opacity-50"
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
                                    {dbStats?.tableStats.map((table: any) => (
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
        </div>
    );
};

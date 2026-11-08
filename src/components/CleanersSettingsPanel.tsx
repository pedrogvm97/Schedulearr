'use client';

import React, { useState, useEffect } from 'react';
import {
    Trash2, RefreshCw, Shield, AlertTriangle, Check, Layers,
    HardDrive, Database, Sparkles, FileText, Headphones, Image as ImageIcon,
    Sliders, Settings, Clock, CheckCircle2, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { twColorToHex } from '@/lib/instanceColor';
import { CustomSelect } from '@/components/CustomSelect';

export type CleanerSubtab = 'media' | 'torrents' | 'audiobooks' | 'database' | 'vdisk';

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
    // 1. Media is now the first default subtab
    const [cleanerSubtab, setCleanerSubtab] = useState<CleanerSubtab>('media');

    // Downloads (Torrents & Stagnation Watchdog) State
    const [qbitCleanupEnabled, setQbitCleanupEnabled] = useState(false);
    const [qbitDeleteFiles, setQbitDeleteFiles] = useState(true);
    const [qbitBlacklist, setQbitBlacklist] = useState(true);
    const [qbitCleanupIntervalMin, setQbitCleanupIntervalMin] = useState(15);
    const [qbitStagnationEnabled, setQbitStagnationEnabled] = useState(true);
    const [qbitStagnationMin, setQbitStagnationMin] = useState(60);
    const [qbitSizeCleanupEnabled, setQbitSizeCleanupEnabled] = useState(false);
    const [qbitMaxSizeGb, setQbitMaxSizeGb] = useState(15);
    const [qbitCleanupExclusions, setQbitCleanupExclusions] = useState('seeding, keep, manual');
    const [trimmingTorrents, setTrimmingTorrents] = useState(false);

    // Database Auto-Housekeeping State
    const [dbAutoCleanEnabled, setDbAutoCleanEnabled] = useState(true);
    const [retentionDays, setRetentionDays] = useState(30);
    const [dbSizeLimitMB, setDbSizeLimitMB] = useState(500);
    const [pruningDb, setPruningDb] = useState(false);
    const [confirmDeleteDb, setConfirmDeleteDb] = useState(false);

    // Audiobook Auto-Cache State
    const [audiobookAutoCleanEnabled, setAudiobookAutoCleanEnabled] = useState(false);
    const [audiobookRetentionDays, setAudiobookRetentionDays] = useState(30);
    const [audiobookScope, setAudiobookScope] = useState<'all' | 'images' | 'scenes' | 'transcripts' | 'voices' | 'api_history'>('all');
    const [audiobookTargetMode, setAudiobookTargetMode] = useState<'all_books' | 'single_book'>('all_books');
    const [audiobookSelectedBookKey, setAudiobookSelectedBookKey] = useState<string>('');
    const [cleaningAudiobooks, setCleaningAudiobooks] = useState(false);
    const [audiobookConfirmed, setAudiobookConfirmed] = useState(false);
    const [audiobooksList, setAudiobooksList] = useState<Array<{ bookKey: string; title: string; author: string }>>([]);
    const [audiobookStorageStats, setAudiobookStorageStats] = useState<{
        imagesBytes: number;
        imagesCount: number;
        transcriptsBytes: number;
        transcriptsCount: number;
        voicesBytes: number;
        voicesCount: number;
        totalBytes: number;
        totalFiles: number;
    } | null>(null);

    // Media Auto-Clean Master Toggle
    const [mediaAutoCleanEnabled, setMediaAutoCleanEnabled] = useState(true);

    // VDisk / Docker Storage Watchdog State
    const [vdiskStats, setVDiskStats] = useState<{
        totalBytes: number;
        usedBytes: number;
        freeBytes: number;
        usedPercent: number;
        imagesCount: number;
        imagesSizeBytes: number;
        imagesReclaimableBytes: number;
        containersCount: number;
        buildCacheSizeBytes: number;
        buildCacheReclaimableBytes: number;
        volumesSizeBytes: number;
        volumesReclaimableBytes: number;
        isVDisk: boolean;
        available: boolean;
        dockerSocketAvailable?: boolean;
        autoPruneEnabled: boolean;
        autoPruneThreshold: number;
    } | null>(null);
    const [loadingVDisk, setLoadingVDisk] = useState(false);
    const [cleaningVDisk, setCleaningVDisk] = useState<string | null>(null);
    const [vdiskAutoPruneEnabled, setVDiskAutoPruneEnabled] = useState(true);
    const [vdiskAutoPruneThreshold, setVDiskAutoPruneThreshold] = useState(85);

    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    const safeLibraryLimits = Array.isArray(libraryLimits) ? libraryLimits : [];
    const safeInstances = Array.isArray(instances) ? instances : [];
    const safeInstanceSegments = Array.isArray(instanceSegments) ? instanceSegments : [];

    const displayBytes = (bytes?: number) => {
        if (typeof bytes !== 'number' || isNaN(bytes)) return '0 B';
        if (typeof formatBytes === 'function') return formatBytes(bytes);
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = 1;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const fetchVDiskInfo = async (force: boolean = false) => {
        setLoadingVDisk(true);
        try {
            const res = await fetch(`/api/system/vdisk${force ? '?force=true' : ''}`);
            if (res.ok) {
                const data = await res.json();
                const unpackedStats = {
                    totalBytes: data.totalBytes ?? data.stats?.totalBytes ?? 0,
                    usedBytes: data.usedBytes ?? data.stats?.usedBytes ?? 0,
                    freeBytes: data.freeBytes ?? data.stats?.freeBytes ?? 0,
                    usedPercent: data.usedPercent ?? data.stats?.usedPercent ?? 0,
                    imagesCount: data.imagesCount ?? data.stats?.images?.totalCount ?? 0,
                    imagesSizeBytes: data.imagesSizeBytes ?? data.stats?.images?.totalBytes ?? 0,
                    imagesReclaimableBytes: data.imagesReclaimableBytes ?? data.stats?.images?.reclaimableBytes ?? 0,
                    containersCount: data.containersCount ?? data.stats?.containers?.totalCount ?? 0,
                    buildCacheSizeBytes: data.buildCacheSizeBytes ?? data.stats?.buildCache?.reclaimableBytes ?? 0,
                    buildCacheReclaimableBytes: data.buildCacheReclaimableBytes ?? data.stats?.buildCache?.reclaimableBytes ?? 0,
                    volumesSizeBytes: data.volumesSizeBytes ?? data.stats?.volumes?.totalBytes ?? 0,
                    volumesReclaimableBytes: data.volumesReclaimableBytes ?? data.stats?.layersSizeBytes ?? 0,
                    isVDisk: data.isVDisk ?? data.available ?? false,
                    available: data.available ?? false,
                    dockerSocketAvailable: data.dockerSocketAvailable ?? false,
                    autoPruneEnabled: data.autoPruneEnabled ?? true,
                    autoPruneThreshold: data.autoPruneThreshold ?? 85
                };
                setVDiskStats(unpackedStats);
                if (data.autoPruneEnabled !== undefined) setVDiskAutoPruneEnabled(data.autoPruneEnabled);
                if (data.autoPruneThreshold !== undefined) setVDiskAutoPruneThreshold(data.autoPruneThreshold);
            }
        } catch {
            toast.error('Failed to load VDisk information');
        } finally {
            setLoadingVDisk(false);
        }
    };

    const handleCleanVDisk = async (target: 'images' | 'build_cache' | 'dangling' | 'deep_clean') => {
        setCleaningVDisk(target);
        try {
            const res = await fetch('/api/system/vdisk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: target })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'VDisk cleanup completed');
                await fetchVDiskInfo(true);
                refreshDiskInfo();
            } else {
                toast.error(data.error || 'Failed to clean VDisk');
            }
        } catch {
            toast.error('Network error executing VDisk clean');
        } finally {
            setCleaningVDisk(null);
        }
    };

    const handleSaveVDiskSettings = async (enabled: boolean, threshold: number) => {
        setVDiskAutoPruneEnabled(enabled);
        setVDiskAutoPruneThreshold(threshold);
        try {
            await fetch('/api/system/vdisk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save_settings', autoPruneEnabled: enabled, autoPruneThreshold: threshold })
            });
            toast.success('VDisk auto-clean settings saved');
        } catch {
            toast.error('Failed to save settings');
        }
    };

    const fetchAudiobookStats = async (key?: string) => {
        try {
            const endpoint = key ? `/api/theater/audiobooks/studio?bookKey=${encodeURIComponent(key)}` : '/api/theater/audiobooks/studio';
            const res = await fetch(endpoint);
            if (res.ok) {
                const data = await res.json();
                if (data.storageBreakdown) {
                    setAudiobookStorageStats(data.storageBreakdown);
                }
            }
        } catch {}
    };

    // Parse URL subTab on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const sub = (params.get('subTab') || params.get('subtab') || '').toLowerCase();
            if (sub === 'media' || sub === 'libraries') {
                setCleanerSubtab('media');
            } else if (sub === 'torrents' || sub === 'downloads' || sub === 'transfers') {
                setCleanerSubtab('torrents');
            } else if (sub === 'audiobooks' || sub === 'audiobook') {
                setCleanerSubtab('audiobooks');
            } else if (sub === 'database' || sub === 'db') {
                setCleanerSubtab('database');
            } else if (sub === 'vdisk' || sub === 'docker' || sub === 'images') {
                setCleanerSubtab('vdisk');
                fetchVDiskInfo();
            }
        }
    }, []);

    useEffect(() => {
        if (cleanerSubtab === 'vdisk' && !vdiskStats) {
            fetchVDiskInfo();
        }
        if (cleanerSubtab === 'audiobooks') {
            fetchAudiobookStats(audiobookTargetMode === 'single_book' ? audiobookSelectedBookKey : undefined);
        }
    }, [cleanerSubtab]);

    useEffect(() => {
        if (cleanerSubtab === 'audiobooks') {
            fetchAudiobookStats(audiobookTargetMode === 'single_book' ? audiobookSelectedBookKey : undefined);
        }
    }, [audiobookTargetMode, audiobookSelectedBookKey]);

    useEffect(() => {
        fetch('/api/system/settings')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                if (data.db_autoclean_enabled !== undefined) setDbAutoCleanEnabled(data.db_autoclean_enabled === 'true');
                if (data.db_retention_days) setRetentionDays(parseInt(data.db_retention_days) || 30);
                if (data.db_size_limit_mb) setDbSizeLimitMB(parseInt(data.db_size_limit_mb) || 500);
                if (data.audiobook_cache_autoclean_enabled !== undefined) setAudiobookAutoCleanEnabled(data.audiobook_cache_autoclean_enabled === 'true');
                if (data.audiobook_cache_retention_days) setAudiobookRetentionDays(parseInt(data.audiobook_cache_retention_days) || 30);
                if (data.media_smart_clean_auto_enabled !== undefined) setMediaAutoCleanEnabled(data.media_smart_clean_auto_enabled === 'true');
            })
            .catch(() => {});

        fetch('/api/settings')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                if (data.qbit_cleanup_enabled !== undefined) setQbitCleanupEnabled(data.qbit_cleanup_enabled === 'true' || data.qbit_cleanup_enabled === true);
                if (data.qbit_cleanup_delete_files !== undefined) setQbitDeleteFiles(data.qbit_cleanup_delete_files === 'true' || data.qbit_cleanup_delete_files === true);
                if (data.qbit_cleanup_blacklist !== undefined) setQbitBlacklist(data.qbit_cleanup_blacklist === 'true' || data.qbit_cleanup_blacklist === true);
                if (data.qbit_cleanup_interval_min) setQbitCleanupIntervalMin(parseInt(data.qbit_cleanup_interval_min) || 15);
                if (data.qbit_cleanup_stagnation_enabled !== undefined) setQbitStagnationEnabled(data.qbit_cleanup_stagnation_enabled === 'true' || data.qbit_cleanup_stagnation_enabled === true);
                if (data.qbit_cleanup_stagnation_min) setQbitStagnationMin(parseInt(data.qbit_cleanup_stagnation_min) || 60);
                if (data.qbit_cleanup_max_size_enabled !== undefined) setQbitSizeCleanupEnabled(data.qbit_cleanup_max_size_enabled === 'true' || data.qbit_cleanup_max_size_enabled === true);
                if (data.qbit_cleanup_max_size_gb) setQbitMaxSizeGb(parseInt(data.qbit_cleanup_max_size_gb) || 15);
                if (data.qbit_cleanup_exclusions) setQbitCleanupExclusions(data.qbit_cleanup_exclusions);
            })
            .catch(() => {});
    }, []);

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
                    if (data.storageBreakdown) {
                        setAudiobookStorageStats(data.storageBreakdown);
                    }
                })
                .catch(() => {});
        }
    }, [cleanerSubtab, audiobooksList.length]);

    const handleCleanToThreshold = async () => {
        try {
            toast.info('Trimming unseeded torrents to target threshold...');
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

    const handleTrimStalledTorrents = async () => {
        setTrimmingTorrents(true);
        try {
            const res = await fetch('/api/qbittorrent/auto-cleanup', { method: 'POST' });
            const json = await res.json();
            if (json.cleanedCount > 0) {
                toast.success(json.message || `Purged ${json.cleanedCount} stagnant downloads.`);
            } else {
                toast.info(json.message || 'No stalled torrents met purge conditions.');
            }
        } catch {
            toast.error('Failed to trigger download cleanup');
        } finally {
            setTrimmingTorrents(false);
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
            const res = await fetch('/api/system/housekeeping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daysToKeep: retentionDays, sizeLimitMB: dbSizeLimitMB })
            });
            const data = await res.json();
            if (data.deletedRows !== undefined) {
                toast.success(`Pruned ${data.deletedRows || 0} rows. VACUUM complete.`);
                const statsRes = await fetch('/api/stats/db-info');
                if (statsRes.ok) setDbStats(await statsRes.json());
                setConfirmDeleteDb(false);
            } else {
                toast.error(data.error || 'Prune failed');
            }
        } catch {
            toast.error('Database maintenance failed');
        } finally {
            setPruningDb(false);
        }
    };

    const handleExportDatabase = () => {
        window.open('/api/system/database/export', '_blank');
        toast.success('Database export initiated');
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
                toast.success(`Deleted: ${data.deletedFiles || 0} files across ${data.booksUpdated || 0} books.`);
                setAudiobookConfirmed(false);
                fetchAudiobookStats(audiobookTargetMode === 'single_book' ? audiobookSelectedBookKey : undefined);
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
            {/* ── Subtabs Navigation Grid (Zero Scrollbars Ever, Squared) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pb-4 border-b border-zinc-800">
                <button
                    type="button"
                    onClick={() => setCleanerSubtab('media')}
                    title="Media: Storage metrics, library threshold, priority rules, capacity limits & candidates"
                    className={`p-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        cleanerSubtab === 'media'
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Layers size={20} className="shrink-0" />
                    <span className="truncate">Media</span>
                </button>

                <button
                    type="button"
                    onClick={() => setCleanerSubtab('torrents')}
                    title="Downloads: Stagnation watchdog, size limits, and stalled transfer cleanup"
                    className={`p-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        cleanerSubtab === 'torrents'
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Shield size={20} className="shrink-0" />
                    <span className="truncate">Downloads</span>
                </button>

                <button
                    type="button"
                    onClick={() => setCleanerSubtab('audiobooks')}
                    title="Audiobooks: Auto-prune audiobook cache, scenes, art, and voice models"
                    className={`p-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        cleanerSubtab === 'audiobooks'
                            ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Sparkles size={20} className="shrink-0" />
                    <span className="truncate">Audiobooks</span>
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setCleanerSubtab('database');
                        if (!dbStats) {
                            fetch('/api/stats/db-info').then(r => r.json()).then(setDbStats).catch(() => {});
                        }
                    }}
                    title="Database: Automated SQLite maintenance, log retention & table vacuuming"
                    className={`p-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        cleanerSubtab === 'database'
                            ? 'bg-purple-500 text-black shadow-lg shadow-purple-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <Database size={20} className="shrink-0" />
                    <span className="truncate">Database</span>
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setCleanerSubtab('vdisk');
                        fetchVDiskInfo();
                    }}
                    title="VDisk: Docker rootfs & container vdisk usage, dangling images, build cache, and deep image prune"
                    className={`p-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        cleanerSubtab === 'vdisk'
                            ? 'bg-sky-500 text-black shadow-lg shadow-sky-500/20'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                >
                    <HardDrive size={20} className="shrink-0" />
                    <span className="truncate">VDisk</span>
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                SUBTAB 1: MEDIA CLEANER (STORAGE METRICS, LIMITS & CANDIDATES)
               ═══════════════════════════════════════════════════════════════════ */}
            {cleanerSubtab === 'media' && (
                <div className="space-y-6">
                    {/* Storage Capacity Bar & Threshold Guard */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-5 border-b border-zinc-800">
                            <div className="flex items-center gap-4">
                                <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-md">
                                    <Layers size={28} />
                                </div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-black text-white tracking-tight">Media Cleaner</h2>
                                    <span className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                                        mediaAutoCleanEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                    }`}>
                                        {mediaAutoCleanEnabled ? 'Active' : 'Off'}
                                    </span>
                                </div>
                            </div>

                            {/* Capacity Trigger & Auto-Clean Master Switch */}
                            <div className="flex items-center gap-4 bg-zinc-950 p-3 rounded-2xl border border-zinc-800 flex-shrink-0">
                                <div className="flex items-center gap-2" title="Disk capacity percentage threshold that triggers automated cleaning">
                                    <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Trigger:</span>
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
                                        className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg text-center py-1 text-emerald-400 font-black text-base outline-none focus:border-emerald-500"
                                        title="Auto-clean capacity trigger percentage"
                                    />
                                    <span className="text-xs font-black text-emerald-400">%</span>
                                </div>

                                <div className="w-px h-6 bg-zinc-800" />

                                <button
                                    type="button"
                                    onClick={async () => {
                                        const next = !mediaAutoCleanEnabled;
                                        setMediaAutoCleanEnabled(next);
                                        await updateSetting('media_smart_clean_auto_enabled', String(next));
                                        toast.success(next ? 'Media Auto-Clean Activated' : 'Media Auto-Clean Deactivated');
                                    }}
                                    className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${mediaAutoCleanEnabled ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}`}
                                    title={mediaAutoCleanEnabled ? 'Deactivate Media Cleaner' : 'Activate Media Cleaner'}
                                >
                                    <div className={`w-6 h-6 rounded-full bg-white transition-transform ${mediaAutoCleanEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
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
                                        <span className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
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
                                            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                            title="Refresh disk storage capacity"
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
                                    <div
                                        className="absolute top-0 bottom-0 w-1 bg-white z-10 pointer-events-none shadow-[0_0_10px_white]"
                                        style={{ left: `${diskPauseThreshold}%` }}
                                        title={`Threshold: ${diskPauseThreshold}%`}
                                    />
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-400 gap-2">
                                    <span>{formatBytes(diskInfo.usedBytes)} used of {formatBytes(diskInfo.totalBytes)}</span>
                                    <span className="text-emerald-400 font-bold">{formatBytes(diskInfo.freeBytes)} free</span>
                                </div>

                                {/* Per-Instance Legend */}
                                {safeInstanceSegments.length > 0 && (
                                    <div className="flex flex-wrap gap-4 pt-2 border-t border-zinc-850 text-xs">
                                        {safeInstanceSegments.map((seg: any) => (
                                            <div key={seg.id} className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.colorHex }} />
                                                <span className="text-zinc-300 font-bold">{seg.name}:</span>
                                                <span className="text-white font-mono">{formatBytes(seg.bytes)}</span>
                                                <span className="text-zinc-500">({seg.percent.toFixed(1)}%)</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {/* Threshold Actions Bar */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 flex items-center justify-between">
                                <span className="text-sm font-bold text-white">Pause Downloader on Threshold</span>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const next = !diskPauseEnabled;
                                        setDiskPauseEnabled(next);
                                        await updateSetting('disk_pause_enabled', String(next));
                                    }}
                                    className={`w-12 h-6.5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${diskPauseEnabled ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                    title="Pause active torrents if disk reaches threshold"
                                >
                                    <div className={`w-5.5 h-5.5 rounded-full bg-white transition-transform ${diskPauseEnabled ? 'translate-x-5.5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-4">
                                <span className="text-sm font-bold text-white">Trim Unseeded Torrents</span>
                                <button
                                    type="button"
                                    onClick={handleCleanToThreshold}
                                    className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-2 text-xs font-black uppercase tracking-wider"
                                    title="Trim finished/unseeded torrents immediately to reach target threshold"
                                >
                                    <Trash2 size={16} />
                                    <span>Trim to Threshold</span>
                                </button>
                            </div>
                        </div>

                        {/* Media Clean Rules: Priority, Scope, Immunity (Sleek unified 3-column row, NO giant buttons) */}
                        <div className="space-y-4 pt-4 border-t border-zinc-800">
                            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400">
                                Selection & Retention Rules
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Priority Rule Dropdown */}
                                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-2.5">
                                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Priority Rule</span>
                                    <CustomSelect
                                        minimal
                                        options={[
                                            { id: 'largest', name: 'Largest Files' },
                                            { id: 'oldest', name: 'Oldest Added' },
                                            { id: 'unplayed', name: 'Unplayed in Plex' }
                                        ]}
                                        value={diskSmartCleanMode}
                                        onChange={async val => {
                                            setDiskSmartCleanMode(val);
                                            await updateSetting('qbit_smart_clean_mode', val);
                                            fetchCandidates();
                                        }}
                                    />
                                </div>

                                {/* TV Scope Dropdown */}
                                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-2.5">
                                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500">TV Scope</span>
                                    <CustomSelect
                                        minimal
                                        options={[
                                            { id: 'series', name: 'Entire Show' },
                                            { id: 'season', name: 'By Season' },
                                            { id: 'episode', name: 'By Episode' }
                                        ]}
                                        value={diskSmartCleanSeriesLevel}
                                        onChange={val => {
                                            setDiskSmartCleanSeriesLevel(val);
                                            updateSetting('media_smart_clean_series_level', val);
                                            setTimeout(fetchCandidates, 300);
                                        }}
                                    />
                                </div>

                                {/* Immunity Window Inline */}
                                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-2.5">
                                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Immunity Window</span>
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
                                            className="w-20 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1 text-sm font-black text-emerald-400 text-center outline-none focus:border-emerald-500"
                                            title="Days to protect recently added media from being cleaned"
                                        />
                                        <span className="text-xs font-bold text-zinc-400">Days</span>
                                    </div>
                                </div>
                            </div>

                            {/* Protected Libraries Selection */}
                            <div className="space-y-3 pt-2">
                                <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Protected Libraries</span>
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
                                Capacity Limits
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
                                                isOverLimit
                                                    ? 'bg-rose-950/20 border-rose-500/50 shadow-lg'
                                                    : lib.enabled
                                                    ? 'bg-zinc-950/90 border-zinc-800 hover:border-zinc-700'
                                                    : 'bg-zinc-950/40 border-zinc-900 opacity-60'
                                            }`}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: colorHex }} />
                                                    <div>
                                                        <h4 className="text-base font-black text-white flex items-center gap-2">
                                                            <span>{lib.name}</span>
                                                            <span className="text-xs px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 uppercase font-bold">
                                                                {lib.type}
                                                            </span>
                                                        </h4>
                                                        <span className="text-xs text-zinc-500 font-mono mt-0.5 block">
                                                            {mediaGb.toFixed(1)} GB used {lib.maxGb > 0 ? `of ${lib.maxGb} GB limit (${percentOfLimit}%)` : '(No Limit)'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                                                        <span className="text-xs font-bold text-zinc-400 uppercase">Limit:</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="50"
                                                            value={lib.maxGb || 0}
                                                            onChange={e => handleUpdateLibraryLimit(lib.id, { maxGb: Math.max(0, parseInt(e.target.value) || 0) })}
                                                            className="w-20 bg-transparent text-sm font-black text-white text-right outline-none font-mono"
                                                            title="Target storage limit in GB (0 = unlimited)"
                                                        />
                                                        <span className="text-xs font-bold text-zinc-400">GB</span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateLibraryLimit(lib.id, { enabled: !lib.enabled })}
                                                        className={`w-12 h-6.5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${lib.enabled ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                                        title={lib.enabled ? 'Disable limit enforcement' : 'Enable limit enforcement'}
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
                                <h3 className="text-xl font-black text-white">Candidates ({safeCandidates.length})</h3>
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
                SUBTAB 2: DOWNLOADS CLEANER (STRICTLY QBIT INSTANCES ONLY)
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
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-black text-white tracking-tight">Downloads Cleaner</h2>
                                    <span className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                                        qbitCleanupEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                    }`}>
                                        {qbitCleanupEnabled ? 'Active' : 'Off'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleTrimStalledTorrents}
                                    disabled={trimmingTorrents}
                                    className="px-5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-md disabled:opacity-50"
                                    title="Trim stagnant or failed downloads matching rules right now"
                                >
                                    {trimmingTorrents ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                    <span>Trim Stalled Torrents</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        const next = !qbitCleanupEnabled;
                                        setQbitCleanupEnabled(next);
                                        await updateSetting('qbit_cleanup_enabled', String(next));
                                        toast.success(next ? 'Downloads Watchdog Activated' : 'Downloads Watchdog Deactivated');
                                    }}
                                    className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${qbitCleanupEnabled ? 'bg-emerald-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-zinc-800'}`}
                                    title={qbitCleanupEnabled ? 'Deactivate Downloads Cleaner' : 'Activate Downloads Cleaner'}
                                >
                                    <div className={`w-6 h-6 rounded-full bg-white transition-transform ${qbitCleanupEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Stagnation Watchdog Rules */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400">
                                Stagnation Watchdog Rules
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 flex items-center justify-between">
                                    <span className="text-sm font-bold text-white">Auto Cleanup Watchdog</span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const next = !qbitCleanupEnabled;
                                            setQbitCleanupEnabled(next);
                                            await updateSetting('qbit_cleanup_enabled', String(next));
                                        }}
                                        className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${qbitCleanupEnabled ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                        title="Toggle periodic background watchdog"
                                    >
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${qbitCleanupEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 flex items-center justify-between">
                                    <span className="text-sm font-bold text-white">Delete Files From Disk</span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const next = !qbitDeleteFiles;
                                            setQbitDeleteFiles(next);
                                            await updateSetting('qbit_cleanup_delete_files', String(next));
                                        }}
                                        className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${qbitDeleteFiles ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                        title="Reclaim physical disk storage upon cleanup"
                                    >
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${qbitDeleteFiles ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 flex items-center justify-between">
                                    <span className="text-sm font-bold text-white">Blacklist Failed Release</span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const next = !qbitBlacklist;
                                            setQbitBlacklist(next);
                                            await updateSetting('qbit_cleanup_blacklist', String(next));
                                        }}
                                        className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${qbitBlacklist ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                        title="Instruct Sonarr/Radarr to search for alternatives"
                                    >
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${qbitBlacklist ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Timing, Stagnation & Size Inputs */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 space-y-2">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                                        Scan Interval
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            value={qbitCleanupIntervalMin}
                                            onChange={e => {
                                                const v = parseInt(e.target.value) || 15;
                                                setQbitCleanupIntervalMin(v);
                                                updateSetting('qbit_cleanup_interval_min', String(v));
                                            }}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500"
                                            title="Interval in minutes between watchdog scans"
                                        />
                                        <span className="text-xs font-bold text-zinc-400">min</span>
                                    </div>
                                </div>

                                <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                            Stagnation Timeout
                                        </label>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const next = !qbitStagnationEnabled;
                                                setQbitStagnationEnabled(next);
                                                await updateSetting('qbit_cleanup_stagnation_enabled', String(next));
                                            }}
                                            className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${qbitStagnationEnabled ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                            title="Toggle Stagnation Timeout"
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${qbitStagnationEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            disabled={!qbitStagnationEnabled}
                                            value={qbitStagnationMin}
                                            onChange={e => {
                                                const v = parseInt(e.target.value) || 60;
                                                setQbitStagnationMin(v);
                                                updateSetting('qbit_cleanup_stagnation_min', String(v));
                                            }}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500 disabled:opacity-30"
                                            title="Minutes stalled before removal"
                                        />
                                        <span className="text-xs font-bold text-zinc-400">min</span>
                                    </div>
                                </div>

                                <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                            Max Release Size
                                        </label>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const next = !qbitSizeCleanupEnabled;
                                                setQbitSizeCleanupEnabled(next);
                                                await updateSetting('qbit_cleanup_max_size_enabled', String(next));
                                            }}
                                            className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${qbitSizeCleanupEnabled ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                            title="Toggle Max Release Size limit"
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${qbitSizeCleanupEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            disabled={!qbitSizeCleanupEnabled}
                                            value={qbitMaxSizeGb}
                                            onChange={e => {
                                                const v = parseInt(e.target.value) || 15;
                                                setQbitMaxSizeGb(v);
                                                updateSetting('qbit_cleanup_max_size_gb', String(v));
                                            }}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500 disabled:opacity-30"
                                            title="Maximum gigabytes per release"
                                        />
                                        <span className="text-xs font-bold text-zinc-400">GB</span>
                                    </div>
                                </div>
                            </div>

                            {/* Exclusions / Whitelist */}
                            <div className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                                    Exclusions / Whitelist
                                </label>
                                <input
                                    type="text"
                                    placeholder="seeding, keep, manual, radarr-4k, specific-tag"
                                    value={qbitCleanupExclusions}
                                    onChange={e => {
                                        const v = e.target.value;
                                        setQbitCleanupExclusions(v);
                                        updateSetting('qbit_cleanup_exclusions', v);
                                    }}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500"
                                    title="Exempt categories or tags from automatic cleanup"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                SUBTAB 3: AUDIOBOOK CACHE & ASSETS CLEANER
               ═══════════════════════════════════════════════════════════════════ */}
            {cleanerSubtab === 'audiobooks' && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-7 shadow-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
                        <div className="flex items-center gap-3.5">
                            <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Sparkles size={26} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Audiobook Studio Assets</h3>
                                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                                    Total Generated: <strong className="text-amber-400">{displayBytes(audiobookStorageStats?.totalBytes)}</strong> in {audiobookStorageStats?.totalFiles ?? 0} files
                                </p>
                            </div>
                        </div>

                        {/* Master Auto-Clean Switch for Audiobook Cache */}
                        <div className="flex items-center gap-3 bg-zinc-950 p-2.5 rounded-2xl border border-zinc-800">
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Auto-Clean:</span>
                            <button
                                type="button"
                                onClick={async () => {
                                    const next = !audiobookAutoCleanEnabled;
                                    setAudiobookAutoCleanEnabled(next);
                                    await updateSetting('audiobook_cache_autoclean_enabled', String(next));
                                    toast.success(next ? 'Audiobook Auto-Cache Prune Enabled' : 'Audiobook Auto-Cache Prune Disabled');
                                }}
                                className={`w-12 h-6.5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${audiobookAutoCleanEnabled ? 'bg-amber-500' : 'bg-zinc-800'}`}
                                title={audiobookAutoCleanEnabled ? 'Disable automated cache pruning' : 'Enable automated cache pruning on schedule'}
                            >
                                <div className={`w-5.5 h-5.5 rounded-full bg-white transition-transform ${audiobookAutoCleanEnabled ? 'translate-x-5.5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Auto-Prune Conditions & Scope */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                            <span className="text-sm font-black text-white">Cache Retention</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={audiobookRetentionDays}
                                    onChange={async e => {
                                        const val = Math.max(1, parseInt(e.target.value) || 30);
                                        setAudiobookRetentionDays(val);
                                        await updateSetting('audiobook_cache_retention_days', String(val));
                                    }}
                                    className="w-18 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-sm font-black text-amber-400 text-center outline-none"
                                    title="Auto-prune temporary audio and cache files older than this many days"
                                />
                                <span className="text-xs font-bold text-zinc-400">Days</span>
                            </div>
                        </div>

                        {/* Scope Toggle: All Books vs Single Book */}
                        <div className="flex items-center justify-between p-2 rounded-2xl bg-zinc-950 border border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setAudiobookTargetMode('all_books')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    audiobookTargetMode === 'all_books'
                                        ? 'bg-amber-500 text-black shadow'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                                title="Target all audiobooks across the entire library"
                            >
                                All Audiobooks
                            </button>
                            <button
                                type="button"
                                onClick={() => setAudiobookTargetMode('single_book')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    audiobookTargetMode === 'single_book'
                                        ? 'bg-amber-500 text-black shadow'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                                title="Target a specific audiobook"
                            >
                                Single Book
                            </button>
                        </div>
                    </div>

                    {/* Single Book Selector */}
                    {audiobookTargetMode === 'single_book' && (
                        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                            <select
                                value={audiobookSelectedBookKey}
                                onChange={e => setAudiobookSelectedBookKey(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-base font-bold text-white cursor-pointer outline-none focus:border-amber-500"
                                title="Choose specific audiobook to clean"
                            >
                                <option value="">Choose an audiobook...</option>
                                {audiobooksList.map(b => (
                                    <option key={b.bookKey} value={b.bookKey}>
                                        {b.title} {b.author ? `— ${b.author}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Target Assets Scope Grid with Real Measurement Numbers */}
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                                {
                                    id: 'all' as const,
                                    title: 'All Assets',
                                    size: audiobookStorageStats?.totalBytes,
                                    count: audiobookStorageStats?.totalFiles,
                                    icon: <Trash2 size={24} className="text-red-400" />,
                                    border: 'border-red-500/40 hover:border-red-400 bg-red-950/20'
                                },
                                {
                                    id: 'images' as const,
                                    title: 'Artwork',
                                    size: audiobookStorageStats?.imagesBytes,
                                    count: audiobookStorageStats?.imagesCount,
                                    icon: <ImageIcon size={24} className="text-emerald-400" />,
                                    border: 'border-emerald-500/40 hover:border-emerald-400 bg-emerald-950/20'
                                },
                                {
                                    id: 'scenes' as const,
                                    title: 'Scenes',
                                    size: undefined,
                                    count: undefined,
                                    icon: <Sparkles size={24} className="text-purple-400" />,
                                    border: 'border-purple-500/40 hover:border-purple-400 bg-purple-950/20'
                                },
                                {
                                    id: 'transcripts' as const,
                                    title: 'Transcripts',
                                    size: audiobookStorageStats?.transcriptsBytes,
                                    count: audiobookStorageStats?.transcriptsCount,
                                    icon: <FileText size={24} className="text-amber-400" />,
                                    border: 'border-amber-500/40 hover:border-amber-400 bg-amber-950/20'
                                },
                                {
                                    id: 'voices' as const,
                                    title: 'Voices',
                                    size: audiobookStorageStats?.voicesBytes,
                                    count: audiobookStorageStats?.voicesCount,
                                    icon: <Headphones size={24} className="text-blue-400" />,
                                    border: 'border-blue-500/40 hover:border-blue-400 bg-blue-950/20'
                                },
                                {
                                    id: 'api_history' as const,
                                    title: 'API Logs',
                                    size: undefined,
                                    count: undefined,
                                    icon: <Database size={24} className="text-zinc-400" />,
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
                                        title={`Target asset scope: ${opt.title}`}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${opt.border} ${
                                            isSel ? 'ring-2 ring-amber-400 shadow-xl' : 'opacity-70 hover:opacity-100'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-3">
                                                {opt.icon}
                                                <div>
                                                    <h4 className="text-base font-black text-white">{opt.title}</h4>
                                                    {opt.size !== undefined && (
                                                        <span className="text-xs font-mono font-bold text-zinc-400 block">
                                                            {displayBytes(opt.size)} {opt.count !== undefined ? `(${opt.count} files)` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {isSel && (
                                                <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0">
                                                    <Check size={12} className="stroke-[3]" />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Action Bar with Confirmation */}
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <AlertTriangle size={20} className="text-amber-400 shrink-0" />
                            <span className="text-sm font-black text-white truncate max-w-sm">
                                {audiobookTargetMode === 'all_books' ? 'All Audiobooks' : (audiobookSelectedBookKey || 'Select an audiobook')}
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            {!audiobookConfirmed ? (
                                <button
                                    type="button"
                                    disabled={audiobookTargetMode === 'single_book' && !audiobookSelectedBookKey}
                                    onClick={() => setAudiobookConfirmed(true)}
                                    className="px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-black border border-red-500/40 text-sm font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 transition-all"
                                    title={`Delete selected ${audiobookScope} assets`}
                                >
                                    Delete {audiobookScope === 'all' ? 'All Assets' : audiobookScope.toUpperCase()}
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAudiobookConfirmed(false)}
                                        className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase cursor-pointer"
                                        title="Cancel operation"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={cleaningAudiobooks}
                                        onClick={handleExecuteAudiobookClean}
                                        className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
                                        title="Confirm permanent deletion"
                                    >
                                        {cleaningAudiobooks ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        Confirm Delete
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
                            <h3 className="text-xl font-black text-white">Database Housekeeping</h3>
                        </div>

                        {dbStats && (
                            <span className="text-base font-black text-purple-300 bg-purple-500/10 border border-purple-500/30 px-3.5 py-1.5 rounded-xl font-mono">
                                {Math.round(dbStats.totalSizeBytes / (1024 * 1024))} MB
                            </span>
                        )}
                    </div>

                    {/* Master Auto-Housekeeping Switch */}
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-4">
                        <span className="text-base font-black text-white">Automated Housekeeping</span>
                        <button
                            type="button"
                            onClick={async () => {
                                const next = !dbAutoCleanEnabled;
                                setDbAutoCleanEnabled(next);
                                await updateSetting('db_autoclean_enabled', String(next));
                                toast.success(next ? 'Auto-Housekeeping Enabled' : 'Auto-Housekeeping Disabled');
                            }}
                            className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${dbAutoCleanEnabled ? 'bg-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-zinc-800'}`}
                            title={dbAutoCleanEnabled ? 'Disable automated database housekeeping' : 'Enable automated database housekeeping on schedule'}
                        >
                            <div className={`w-6 h-6 rounded-full bg-white transition-transform ${dbAutoCleanEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Auto Conditions: Retention Days & Size Limit */}
                        <div className="p-5 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-black text-white">Retention Window</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={retentionDays}
                                        onChange={async e => {
                                            const val = Math.max(1, parseInt(e.target.value) || 30);
                                            setRetentionDays(val);
                                            await updateSetting('db_retention_days', String(val));
                                        }}
                                        className="w-20 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-base font-black text-purple-400 text-center outline-none"
                                        title="Days to retain network speed telemetry and search history"
                                    />
                                    <span className="text-xs font-bold text-zinc-400">Days</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm font-black text-white">Max Database Size</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="50"
                                        max="10000"
                                        value={dbSizeLimitMB}
                                        onChange={async e => {
                                            const val = Math.max(50, parseInt(e.target.value) || 500);
                                            setDbSizeLimitMB(val);
                                            await updateSetting('db_size_limit_mb', String(val));
                                        }}
                                        className="w-20 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-base font-black text-purple-400 text-center outline-none"
                                        title="Capacity threshold in MB before oldest records are pruned"
                                    />
                                    <span className="text-xs font-bold text-zinc-400">MB</span>
                                </div>
                            </div>

                            {/* Vertically Centered, Laterally Smaller Action Buttons */}
                            <div className="pt-4 border-t border-zinc-800 flex items-center justify-center gap-3">
                                {!confirmDeleteDb ? (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDeleteDb(true)}
                                        className="px-5 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-md"
                                        title="Prune all expired records and vacuum database"
                                    >
                                        <Trash2 size={16} />
                                        <span>Delete Database</span>
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDeleteDb(false)}
                                            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRunDbPrune}
                                            disabled={pruningDb}
                                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
                                        >
                                            {pruningDb ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            <span>Confirm Wipe</span>
                                        </button>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleExportDatabase}
                                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-md"
                                    title="Export and download SQLite database backup"
                                >
                                    <Download size={16} />
                                    <span>Export Database</span>
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

            {/* ═══════════════════════════════════════════════════════════════════
                SUBTAB 5: VDISK & DOCKER IMAGES CLEANER
               ═══════════════════════════════════════════════════════════════════ */}
            {cleanerSubtab === 'vdisk' && (
                <div className="space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-7 shadow-2xl">
                        {/* Header Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-5 border-b border-zinc-800">
                            <div className="flex items-center gap-4">
                                <div className="p-3.5 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-md">
                                    <HardDrive size={28} />
                                </div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-black text-white tracking-tight">VDisk Cleaner</h2>
                                    {vdiskStats && (
                                        <span className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                                            vdiskStats.usedPercent >= vdiskAutoPruneThreshold
                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                                : vdiskStats.usedPercent >= 75
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        }`}>
                                            {vdiskStats.usedPercent}% Used
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => fetchVDiskInfo(true)}
                                    disabled={loadingVDisk}
                                    title="Refresh VDisk and Docker Storage Usage"
                                    className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors cursor-pointer"
                                >
                                    <RefreshCw size={18} className={loadingVDisk ? 'animate-spin' : ''} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCleanVDisk('deep_clean')}
                                    disabled={!!cleaningVDisk}
                                    title="Deep Clean: Prune all obsolete Schedulearr versions, dangling image layers & build cache"
                                    className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
                                >
                                    {cleaningVDisk === 'deep_clean' ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                    <span>Deep Clean</span>
                                </button>
                            </div>
                        </div>

                        {/* Unraid Docker Socket Missing Alert if Applicable */}
                        {vdiskStats && vdiskStats.dockerSocketAvailable === false && (
                            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 flex items-start gap-3.5">
                                <AlertTriangle size={22} className="text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black text-amber-300">Docker Daemon Socket Access</h4>
                                    <p className="text-xs text-zinc-300 font-medium">
                                        For direct layer and cache pruning on Unraid, map the docker socket in your container template:
                                    </p>
                                    <code className="text-xs bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800 text-emerald-400 font-mono block mt-1 w-max">
                                        /var/run/docker.sock : /var/run/docker.sock
                                    </code>
                                </div>
                            </div>
                        )}

                        {/* VDisk Capacity Bar */}
                        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-5 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <HardDrive size={18} className="text-sky-400" />
                                    <span className="text-sm font-black text-white">Docker VDisk Storage</span>
                                </div>
                                {vdiskStats && (
                                    <div className="flex items-center gap-3 text-xs font-mono font-bold">
                                        <span className="text-zinc-400">Used: <strong className="text-white">{displayBytes(vdiskStats.usedBytes)}</strong></span>
                                        <span className="text-zinc-600">/</span>
                                        <span className="text-zinc-400">Total: <strong className="text-white">{displayBytes(vdiskStats.totalBytes)}</strong></span>
                                        <span className="text-zinc-600">/</span>
                                        <span className="text-emerald-400">Free: <strong>{displayBytes(vdiskStats.freeBytes)}</strong></span>
                                    </div>
                                )}
                            </div>

                            {/* Gauge bar with threshold marker */}
                            <div className="relative w-full h-4 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                <div
                                    className={`h-full transition-all duration-500 rounded-full ${
                                        (vdiskStats?.usedPercent || 0) >= vdiskAutoPruneThreshold
                                            ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                                            : (vdiskStats?.usedPercent || 0) >= 75
                                                ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                                                : 'bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.5)]'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, vdiskStats?.usedPercent || 0))}%` }}
                                />
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-10 pointer-events-none"
                                    style={{ left: `${vdiskAutoPruneThreshold}%` }}
                                    title={`Auto-Prune Threshold: ${vdiskAutoPruneThreshold}%`}
                                />
                            </div>

                            <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                                <span>0%</span>
                                <span className="text-rose-400 font-bold">Threshold: {vdiskAutoPruneThreshold}%</span>
                                <span>100%</span>
                            </div>
                        </div>

                        {/* Storage Breakdown Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Card 1: Images */}
                            <div className="p-5 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 flex flex-col justify-between gap-4">
                                <div>
                                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                                        <span className="text-sm font-black text-white flex items-center gap-2">
                                            <Layers size={18} className="text-sky-400" /> Images
                                        </span>
                                        <span className="text-xs font-mono font-bold text-zinc-400">
                                            {vdiskStats?.imagesCount ?? 0} total
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <div className="text-2xl font-black text-white font-mono">
                                            {displayBytes(vdiskStats?.imagesSizeBytes)}
                                        </div>
                                        <div className="text-xs font-bold text-rose-400">
                                            {displayBytes(vdiskStats?.imagesReclaimableBytes)} reclaimable
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleCleanVDisk('images')}
                                    disabled={!!cleaningVDisk}
                                    title="Prune older Schedulearr image tags and unreferenced layers"
                                    className="w-full py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                                >
                                    {cleaningVDisk === 'images' ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    <span>Prune Images</span>
                                </button>
                            </div>

                            {/* Card 2: Build Cache */}
                            <div className="p-5 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 flex flex-col justify-between gap-4">
                                <div>
                                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                                        <span className="text-sm font-black text-white flex items-center gap-2">
                                            <Sparkles size={18} className="text-amber-400" /> Build Cache
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <div className="text-2xl font-black text-white font-mono">
                                            {displayBytes(vdiskStats?.buildCacheSizeBytes)}
                                        </div>
                                        <div className="text-xs font-bold text-rose-400">
                                            {displayBytes(vdiskStats?.buildCacheReclaimableBytes)} reclaimable
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleCleanVDisk('build_cache')}
                                    disabled={!!cleaningVDisk}
                                    title="Clear Docker build cache"
                                    className="w-full py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                                >
                                    {cleaningVDisk === 'build_cache' ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    <span>Clear Cache</span>
                                </button>
                            </div>

                            {/* Card 3: Dangling Layers */}
                            <div className="p-5 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 flex flex-col justify-between gap-4">
                                <div>
                                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                                        <span className="text-sm font-black text-white flex items-center gap-2">
                                            <Layers size={18} className="text-purple-400" /> Dangling Layers
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <div className="text-2xl font-black text-white font-mono">
                                            {displayBytes(vdiskStats?.volumesReclaimableBytes)}
                                        </div>
                                        <div className="text-xs font-bold text-zinc-400">
                                            Untagged intermediates
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleCleanVDisk('dangling')}
                                    disabled={!!cleaningVDisk}
                                    title="Prune untagged dangling layers and orphan volumes"
                                    className="w-full py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                                >
                                    {cleaningVDisk === 'dangling' ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    <span>Prune Dangling</span>
                                </button>
                            </div>
                        </div>

                        {/* Automation & Safety Card */}
                        <div className="p-5 sm:p-6 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                                <div>
                                    <h4 className="text-base font-black text-white">Auto-Prune Watchdog</h4>
                                    <span className="text-xs text-zinc-400">
                                        Automatically prune unused layers when VDisk exceeds limit
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleSaveVDiskSettings(!vdiskAutoPruneEnabled, vdiskAutoPruneThreshold)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        vdiskAutoPruneEnabled
                                            ? 'bg-sky-500 text-black shadow-lg shadow-sky-500/20'
                                            : 'bg-zinc-800 text-zinc-400'
                                    }`}
                                    title={vdiskAutoPruneEnabled ? 'Disable auto-prune watchdog' : 'Enable auto-prune watchdog'}
                                >
                                    {vdiskAutoPruneEnabled ? 'Active' : 'Disabled'}
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-base font-black text-white">Auto-Prune Trigger Threshold</h4>
                                    <span className="text-xs text-zinc-400">
                                        Trigger automatic cleanup when VDisk usage exceeds percentage
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="50"
                                        max="95"
                                        value={vdiskAutoPruneThreshold}
                                        onChange={e => {
                                            const val = Math.min(95, Math.max(50, parseInt(e.target.value) || 85));
                                            handleSaveVDiskSettings(vdiskAutoPruneEnabled, val);
                                        }}
                                        className="w-20 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-base font-black text-sky-400 text-center outline-none"
                                        title="Threshold percentage for automatic layer pruning"
                                    />
                                    <span className="text-sm font-bold text-zinc-400">%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

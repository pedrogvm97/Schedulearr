"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Film, Pause, Play, Trash2, Info, ShieldCheck, Clock, HardDrive, Tv, Sliders, Radio, Users, Download as DownloadIcon, Music, Folder, Disc, RefreshCw, Smartphone, Send, BookOpen } from "lucide-react";
import { MediaDetailsPanel } from "@/components/MediaDetailsPanel";
import { ProfilesPanel } from "@/components/ProfilesPanel";
import { IndexersPanel } from "@/components/IndexersPanel";
import { PlexUserManagerPanel } from "@/components/PlexUserManagerPanel";
import { LocalDownloadsPanel } from "@/components/LocalDownloadsPanel";
import { ConnectedDevicesPanel, DeviceSyncItem } from "@/components/ConnectedDevicesPanel";
import { toast } from "sonner";

// --- Interfaces ---
interface Torrent {
    hash: string;
    name: string;
    size: number;
    progress: number;
    dlspeed: number;
    upspeed: number;
    state: string;
    instanceId: string;
    instanceName: string;
    instanceColor: string;
    added_on?: number; // epoch seconds
    indexer?: string;
    poster?: string;
    tmdbId?: number;
    tvdbId?: number;
    mediaType?: 'movie' | 'series';
    [key: string]: any;
}

interface MusicJob {
    id: string;
    title: string;
    artist: string;
    album: string;
    format: string;
    qualityLabel: string;
    targetFolder: string;
    outputPath: string;
    coverUrl?: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'canceled';
    progress: number;
    speedBps: number;
    sizeBytes: number;
    error?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
}

// ─── Shared formatting helpers ─────────────────────────────────────────────────
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bps: number): string {
    return formatBytes(bps) + '/s';
}

// ─── Unified Media Card Row ────────────────────────────────────────────────────
interface MediaCardRowProps {
    torrent: Torrent;
    onOpenMedia: (t: Torrent) => void;
    onPauseResume: (t: Torrent, action: 'pause' | 'resume') => void;
    onDeleteClick: (t: Torrent) => void;
}

function MediaCardRow({ torrent, onOpenMedia, onPauseResume, onDeleteClick }: MediaCardRowProps) {
    const isPaused = torrent.state.includes('paused');
    const isStalled = torrent.state.includes('stalled');
    const isTv = torrent.mediaType === 'series' || Boolean(torrent.tvdbId) || /s\d{1,2}e\d{1,2}|\bseason\s*\d+|\b\d{1,2}x\d{1,2}\b/i.test(torrent.name);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [torrent.poster]);

    return (
        <div
            className="p-3 md:px-4 md:py-3 hover:bg-zinc-800/40 transition-colors flex flex-col md:grid md:grid-cols-[auto_2fr_0.8fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 md:items-center relative group"
        >
            {/* Poster thumbnail */}
            <div
                onClick={() => onOpenMedia(torrent)}
                className="w-12 h-16 sm:w-14 sm:h-20 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0 group-hover:border-emerald-500/40 cursor-pointer shadow-md active:scale-95 transition-all relative flex items-center justify-center"
                title="View media details"
            >
                {torrent.poster && !imgError ? (
                    <img
                        src={torrent.poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(torrent.poster)}` : torrent.poster}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        alt=""
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900/60 text-zinc-600 group-hover:text-emerald-400 transition-colors">
                        {isTv ? <Tv size={20} /> : <Film size={20} />}
                    </div>
                )}
            </div>

            {/* Title + badges */}
            <div className="flex items-center gap-4 min-w-0 pr-2 md:pr-0">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs uppercase font-bold px-2 py-0.5 rounded bg-opacity-20 text-white truncate max-w-[140px] ${torrent.instanceColor}`}>
                            {torrent.instanceName || 'qBittorrent'}
                        </span>
                        {isStalled && (
                            <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                stalled
                            </span>
                        )}
                    </div>
                    <h3
                        className="text-base font-semibold text-white truncate group-hover:text-emerald-400 cursor-pointer"
                        title={torrent.name}
                        onClick={() => onOpenMedia(torrent)}
                    >
                        {torrent.canonicalTitle ? (
                            <>
                                <span>{torrent.canonicalTitle}</span>
                                {torrent.year && <span className="text-zinc-400 text-sm ml-1 font-normal">({torrent.year})</span>}
                            </>
                        ) : (
                            torrent.name
                        )}
                    </h3>
                    {torrent.canonicalTitle && (
                        <p className="text-xs text-zinc-500 font-mono truncate mt-0.5" title={torrent.name}>
                            {torrent.name}
                        </p>
                    )}
                </div>
            </div>

            {/* Size */}
            <div className="text-sm sm:text-base text-zinc-400 flex items-center md:items-start group-hover:text-zinc-300 transition-colors">
                <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold mr-2 w-16">Size:</span>
                {formatBytes(torrent.size)}
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
                <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold w-16">Progress:</span>
                <span className="text-sm text-zinc-300 w-12 text-right">{(torrent.progress * 100).toFixed(1)}%</span>
                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden lg:block border border-zinc-900 shadow-inner">
                    <div
                        className={`h-full ${torrent.instanceColor}`}
                        style={{ width: `${torrent.progress * 100}%` }}
                    />
                </div>
            </div>

            {/* Speed */}
            <div className="flex md:block items-center">
                <div className="md:hidden text-xs text-zinc-500 uppercase font-semibold mb-0 mr-2 w-16">Speed:</div>
                <div className="flex items-center gap-3 text-xs w-full">
                    <span className="text-emerald-400 font-mono w-1/2 md:w-auto" title="Download Speed">↓{formatSpeed(torrent.dlspeed)}</span>
                    <span className="text-sky-400 font-mono w-1/2 md:w-auto" title="Upload Speed">↑{formatSpeed(torrent.upspeed)}</span>
                </div>
            </div>

            {/* Indexer */}
            <div className="text-xs font-bold text-zinc-500 md:text-zinc-400 uppercase tracking-wide">
                <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold mr-2 w-16 inline-block">Indexer:</span>
                <span className={torrent.indexer && torrent.indexer !== 'Unknown' ? 'bg-zinc-800/80 px-2 py-1 rounded text-zinc-300 border border-zinc-700/50' : 'text-zinc-600'}>
                    {torrent.indexer || 'Unknown'}
                </span>
            </div>

            {/* Action buttons — prominent, high-contrast, squared */}
            <div className="absolute top-3 right-3 md:relative md:top-auto md:right-auto flex-shrink-0 flex items-center gap-1.5">
                {/* More Info */}
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenMedia(torrent); }}
                    className="p-2.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-all shadow-md cursor-pointer border border-zinc-700/60"
                    title="View Media Details"
                >
                    <Info size={18} />
                </button>

                {/* Pause / Resume */}
                {isPaused ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPauseResume(torrent, 'resume'); }}
                        className="p-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg transition-all shadow-md cursor-pointer"
                        title="Resume Download"
                    >
                        <Play size={18} fill="currentColor" />
                    </button>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPauseResume(torrent, 'pause'); }}
                        className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all shadow-md cursor-pointer border border-zinc-700/60"
                        title="Pause Download"
                    >
                        <Pause size={18} fill="currentColor" />
                    </button>
                )}

                {/* Delete */}
                <button
                    onClick={(e) => { e.stopPropagation(); onDeleteClick(torrent); }}
                    className="p-2.5 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg transition-all shadow-md cursor-pointer"
                    title="Delete Torrent"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
}

// ─── Unified Music Download Row ───────────────────────────────────────────────
interface MusicJobRowProps {
    job: MusicJob;
    onCancel: (id: string) => void;
    onOpenMedia?: (item: any) => void;
}

function MusicJobRow({ job, onCancel, onOpenMedia }: MusicJobRowProps) {
    const isCompleted = job.status === 'completed';
    const isFailed = job.status === 'failed';
    const isDownloading = job.status === 'downloading';
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [job.coverUrl, job.artist, job.album]);

    const coverSrc = job.coverUrl || `/api/theater/music/cover?artist=${encodeURIComponent(job.artist)}&album=${encodeURIComponent(job.album)}`;

    const handleOpen = () => {
        if (!onOpenMedia) return;
        onOpenMedia({
            title: job.album || job.title,
            cleanTitle: job.album || job.title,
            artist: job.artist,
            album: job.album,
            type: 'music',
            mediaType: 'music',
            remotePoster: coverSrc
        });
    };

    return (
        <div className="p-3 md:px-4 md:py-3 hover:bg-zinc-800/40 transition-colors flex flex-col md:grid md:grid-cols-[auto_2fr_0.8fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 md:items-center relative group">
            {/* Album Cover Thumbnail */}
            <div 
                onClick={handleOpen}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0 group-hover:border-amber-500/50 shadow-md relative flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                title="View music details"
            >
                {!imgError ? (
                    <img
                        src={coverSrc}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        alt=""
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900/60 text-zinc-600 group-hover:text-amber-400 transition-colors">
                        <Disc size={22} />
                    </div>
                )}
            </div>

            {/* Title + badges + destination folder */}
            <div className="min-w-0 pr-2 md:pr-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="text-xs uppercase font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Music • {job.qualityLabel || 'Audio'}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono truncate max-w-[280px]" title={job.outputPath || job.targetFolder}>
                        📁 {job.outputPath || job.targetFolder}
                    </span>
                </div>
                <h3 
                    onClick={handleOpen}
                    className="text-base font-semibold text-white truncate group-hover:text-amber-400 cursor-pointer"
                >
                    {job.title} <span className="text-zinc-500 font-normal text-sm">— {job.artist} ({job.album})</span>
                </h3>
            </div>

            {/* Size */}
            <div className="text-sm text-zinc-400 flex items-center md:items-start group-hover:text-zinc-300 transition-colors font-mono">
                <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold mr-2 w-16">Size:</span>
                {job.sizeBytes > 0 ? formatBytes(job.sizeBytes) : job.format === 'flac' ? '~35 MB' : '~10 MB'}
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
                <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold w-16">Progress:</span>
                <span className="text-sm text-zinc-300 w-12 text-right">{job.progress}%</span>
                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden lg:block border border-zinc-900 shadow-inner">
                    <div
                        className={`h-full ${isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-amber-500'}`}
                        style={{ width: `${job.progress}%` }}
                    />
                </div>
            </div>

            {/* Down Speed */}
            <div className="flex md:block items-center">
                <div className="md:hidden text-xs text-zinc-500 uppercase font-semibold mb-0 mr-2 w-16">Speed:</div>
                <div className="flex items-center gap-3 text-xs w-full">
                    <span className="text-amber-400 font-mono w-1/2 md:w-auto" title="Download Speed">
                        {isDownloading ? `↓${formatSpeed(job.speedBps || 450000)}` : '-'}
                    </span>
                </div>
            </div>

            {/* Status / State Badge */}
            <div className="text-xs font-bold uppercase tracking-wide">
                <span className={`px-2 py-0.5 rounded text-[11px] ${
                    isCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    isFailed ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}>
                    {job.status}
                </span>
            </div>

            {/* Actions */}
            <div className="absolute top-3 right-3 md:relative md:top-auto md:right-auto flex-shrink-0 flex items-center gap-1.5">
                <button
                    onClick={() => onCancel(job.id)}
                    className="p-2.5 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg transition-all shadow-md cursor-pointer"
                    title="Remove from Queue"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
}

// ─── Unified Device Sync Row ──────────────────────────────────────────────────
interface DeviceSyncRowProps {
    item: DeviceSyncItem;
    onCancel: (id: string) => void;
}

function DeviceSyncRow({ item, onCancel }: DeviceSyncRowProps) {
    const isCompleted = item.status === 'completed';
    const isFailed = item.status === 'failed';
    const isSyncing = item.status === 'syncing';

    return (
        <div className="p-3 md:px-4 md:py-3 hover:bg-zinc-800/40 transition-colors flex flex-col md:grid md:grid-cols-[auto_2fr_0.8fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 md:items-center relative group">
            {/* Device Icon Thumbnail */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0 group-hover:border-amber-500/50 shadow-md relative flex items-center justify-center">
                <Smartphone size={26} className={isSyncing ? "text-amber-400 animate-pulse" : isCompleted ? "text-emerald-400" : "text-zinc-500"} />
            </div>

            {/* Title + badges + destination */}
            <div className="min-w-0 pr-2 md:pr-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="text-xs uppercase font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Device Sync • {item.mediaType}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono truncate max-w-[280px]" title={item.targetPath || item.sourcePath}>
                        📱 {item.deviceName} ({item.targetPath || item.sourcePath})
                    </span>
                </div>
                <h3 className="text-base font-semibold text-white truncate">
                    {item.mediaTitle}
                </h3>
            </div>

            {/* Size */}
            <div className="text-sm text-zinc-400 flex items-center md:items-start font-mono">
                <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold mr-2 w-16">Size:</span>
                {item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : '—'}
            </div>

            {/* Progress Bar & percentage */}
            <div className="flex flex-col gap-1 w-full">
                <div className="flex justify-between text-xs text-zinc-400 font-mono">
                    <span className="font-bold text-zinc-200">
                        {isCompleted ? '100%' : isSyncing ? `${item.progress}%` : isFailed ? 'Failed' : 'Queued'}
                    </span>
                    <span>{item.speedBps > 0 ? formatSpeed(item.speedBps) : ''}</span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ${
                            isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-rose-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${item.progress || (isCompleted ? 100 : 8)}%` }}
                    />
                </div>
            </div>

            {/* Transfer Speed */}
            <div className="text-sm font-mono text-zinc-400">
                <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold mr-2 w-16">Speed:</span>
                {item.speedBps > 0 ? formatSpeed(item.speedBps) : isCompleted ? 'Synced' : '—'}
            </div>

            {/* Status / State Badge */}
            <div className="text-xs font-bold uppercase tracking-wide">
                <span className={`px-2 py-0.5 rounded text-[11px] ${
                    isCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    isSyncing ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse' :
                    isFailed ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    'bg-zinc-800 text-zinc-400'
                }`}>
                    {item.status}
                </span>
            </div>

            {/* Actions */}
            <div className="absolute top-3 right-3 md:relative md:top-auto md:right-auto flex-shrink-0 flex items-center gap-1.5">
                <button
                    onClick={() => onCancel(item.id)}
                    className="p-2.5 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg transition-all shadow-md cursor-pointer"
                    title="Cancel Device Sync"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
}

// ─── Main Content Component ───────────────────────────────────────────────────
function DownloadsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const initialTab = (['downloads', 'local', 'devices', 'profiles', 'indexers', 'users'].includes(searchParams.get('tab') || '')
        ? searchParams.get('tab')
        : 'downloads') as 'downloads' | 'local' | 'devices' | 'profiles' | 'indexers' | 'users';

    const [activeTab, setActiveTab] = useState<'downloads' | 'local' | 'devices' | 'profiles' | 'indexers' | 'users'>(initialTab);
    const [torrents, setTorrents] = useState<Torrent[]>([]);
    const [musicJobs, setMusicJobs] = useState<MusicJob[]>([]);
    const [deviceQueue, setDeviceQueue] = useState<DeviceSyncItem[]>([]);
    const [downloadMediaFilter, setDownloadMediaFilter] = useState<'all' | 'torrents' | 'music' | 'devices'>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchMusicQueue = async () => {
        try {
            const res = await fetch('/api/theater/music/queue');
            if (res.ok) {
                const data = await res.json();
                setMusicJobs(data.jobs || []);
            }
        } catch {}
    };

    const fetchDeviceQueue = async () => {
        try {
            const res = await fetch('/api/devices/sync');
            if (res.ok) {
                const data = await res.json();
                setDeviceQueue(data.items || []);
            }
        } catch {}
    };

    const handleCancelMusicJob = async (id: string) => {
        try {
            const res = await fetch(`/api/theater/music/queue?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Removed music download job');
                fetchMusicQueue();
            }
        } catch {
            toast.error('Failed to cancel job');
        }
    };

    const handleCancelDeviceSync = async (id: string) => {
        try {
            const res = await fetch(`/api/devices/sync?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Removed device sync job');
                fetchDeviceQueue();
            }
        } catch {
            toast.error('Failed to cancel device sync');
        }
    };

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'music') {
            setActiveTab('downloads');
            setDownloadMediaFilter('music');
        } else if (tab === 'device_sync') {
            setActiveTab('downloads');
            setDownloadMediaFilter('devices');
        } else if (tab && ['downloads', 'local', 'devices', 'profiles', 'indexers', 'users'].includes(tab)) {
            setActiveTab(tab as any);
        }
    }, [searchParams]);

    const handleTabChange = (tab: 'downloads' | 'local' | 'devices' | 'profiles' | 'indexers' | 'users') => {
        setActiveTab(tab);
        const url = tab === 'downloads' ? '/downloads' : `/downloads?tab=${tab}`;
        router.replace(url, { scroll: false });
    };

    // Delete modal
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedHash, setSelectedHash] = useState<{ hash: string; name: string; instanceId: string } | null>(null);
    const [deleteFiles, setDeleteFiles] = useState(true);
    const [blacklistRelease, setBlacklistRelease] = useState(true);

    // Sort
    const [sortField, setSortField] = useState<'name' | 'size' | 'progress' | 'dlspeed'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // ── Auto-Cleanup State ────────────────────────────────────────────────────
    const [isCleanupSettingsOpen, setIsCleanupSettingsOpen] = useState(false);

    // Basic cleanup
    const [qbitCleanupEnabled, setQbitCleanupEnabled] = useState(false);
    const [qbitCleanupIntervalMin, setQbitCleanupIntervalMin] = useState(15);
    const [qbitStagnationEnabled, setQbitStagnationEnabled] = useState(true);
    const [qbitStagnationMin, setQbitStagnationMin] = useState(60);
    const [qbitDeleteFiles, setQbitDeleteFiles] = useState(true);
    const [qbitBlacklist, setQbitBlacklist] = useState(true);
    const [qbitCleanupExclusions, setQbitCleanupExclusions] = useState('');

    // Size-based cleanup
    const [qbitSizeCleanupEnabled, setQbitSizeCleanupEnabled] = useState(false);
    const [qbitMaxSizeGb, setQbitMaxSizeGb] = useState(15);

    // Smart auto-clean
    const [smartCleanMode, setSmartCleanMode] = useState<'largest' | 'oldest' | 'unplayed'>('largest');
    const [smartCleanImmunityEnabled, setSmartCleanImmunityEnabled] = useState(true);
    const [smartCleanImmunityDays, setSmartCleanImmunityDays] = useState(7);
    const [isRunningSmartClean, setIsRunningSmartClean] = useState(false);

    // Media Panel State
    const [tmdbApiKey, setTmdbApiKey] = useState("");
    const [selectedMedia, setSelectedMedia] = useState<any>(null);
    const [libStatus, setLibStatus] = useState<any>(null);

    const fetchTorrents = async () => {
        try {
            const res = await fetch('/api/qbittorrent/torrents');
            if (!res.ok) throw new Error('Failed to fetch torrents. Are connections set up?');
            const data = await res.json();
            setTorrents(data.torrents || []);
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.qbit_cleanup_enabled === 'true') setQbitCleanupEnabled(true);
            if (data.qbit_cleanup_interval_min) setQbitCleanupIntervalMin(parseInt(data.qbit_cleanup_interval_min));
            if (data.qbit_cleanup_stagnation_enabled === 'false') setQbitStagnationEnabled(false);
            if (data.qbit_cleanup_stagnation_min) setQbitStagnationMin(parseInt(data.qbit_cleanup_stagnation_min));
            if (data.qbit_cleanup_delete_files === 'false') setQbitDeleteFiles(false);
            if (data.qbit_cleanup_blacklist === 'false') setQbitBlacklist(false);
            if (data.qbit_cleanup_max_size_enabled === 'true') setQbitSizeCleanupEnabled(true);
            if (data.qbit_cleanup_max_size_gb) setQbitMaxSizeGb(parseInt(data.qbit_cleanup_max_size_gb));
            if (data.qbit_cleanup_exclusions) setQbitCleanupExclusions(data.qbit_cleanup_exclusions);
            if (data.media_smart_clean_mode) setSmartCleanMode(data.media_smart_clean_mode as any);
            if (data.media_smart_clean_immunity_enabled !== undefined) setSmartCleanImmunityEnabled(data.media_smart_clean_immunity_enabled === 'true');
            if (data.media_smart_clean_immunity_days) setSmartCleanImmunityDays(parseInt(data.media_smart_clean_immunity_days));
            if (data.tmdb_api_key || data.tmdbApiKey) setTmdbApiKey(data.tmdb_api_key || data.tmdbApiKey);
        } catch (e) {
            console.error(e);
        }
    };

    const updateSetting = async (key: string, value: string | number | boolean) => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: String(value) })
            });
        } catch (e) {
            console.error('Failed to update setting', key, e);
        }
    };

    useEffect(() => {
        fetchTorrents();
        fetchMusicQueue();
        fetchDeviceQueue();
        fetchSettings();
        const interval = setInterval(() => {
            fetchTorrents();
            fetchMusicQueue();
            fetchDeviceQueue();
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const cleanReleaseName = (name: string) => {
        return name
            .replace(/s\d{1,2}e\d{1,2}.*$/i, '')
            .replace(/\bseason\s*\d+.*$/i, '')
            .replace(/\b\d{1,2}x\d{1,2}.*$/i, '')
            .replace(/\b(1080p|720p|2160p|4k|uhd|bluray|web-dl|webrip|h\.264|h\.265|x264|x265|hevc|ddp5\.1|dts|aac|atmos|truehd|ac3|repack|proper|remux|multi|vostfr|subfrench|dual|amzn|nf|dsnp|hmax|web|dvdrip)\b/gi, '')
            .replace(/\b(19\d{2}|20\d{2})\b/g, '')
            .replace(/-[a-zA-Z0-9_]+$/g, '')
            .replace(/[\[\(\]\)]/g, ' ')
            .replace(/[\.\\\-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const handleOpenMedia = (torrent: Torrent) => {
        const cleanedTitle = cleanReleaseName(torrent.name);
        const isTv = /s\d{1,2}e\d{1,2}|\bseason\s*\d+|\b\d{1,2}x\d{1,2}\b/i.test(torrent.name);
        const resolvedType: 'movie' | 'series' = torrent.mediaType || (torrent.tvdbId || isTv ? 'series' : 'movie');
        const displayTitle = torrent.canonicalTitle || cleanedTitle;

        let extractedYear = torrent.year;
        if (!extractedYear) {
            const yearMatch = torrent.name.match(/\b(19\d{2}|20\d{2})\b/);
            if (yearMatch) extractedYear = Number(yearMatch[1]);
        }

        const item = {
            id: torrent.tmdbId || torrent.tvdbId || torrent.hash,
            title: displayTitle,
            name: displayTitle,
            cleanTitle: cleanedTitle,
            canonicalTitle: torrent.canonicalTitle,
            year: extractedYear,
            tmdbId: torrent.tmdbId || null,
            tvdbId: torrent.tvdbId || null,
            type: resolvedType,
            mediaType: resolvedType,
            remotePoster: torrent.poster || null,
            poster: torrent.poster || null
        };
        setSelectedMedia(item);
        const queryParams = new URLSearchParams({
            title: displayTitle,
            type: resolvedType
        });
        if (torrent.tmdbId) queryParams.append('tmdbId', String(torrent.tmdbId));
        if (torrent.tvdbId) queryParams.append('tvdbId', String(torrent.tvdbId));
        fetch(`/api/media/status?${queryParams.toString()}`)
            .then(r => r.ok ? r.json() : null)
            .then(status => setLibStatus(status))
            .catch(() => setLibStatus(null));
    };

    const handleAction = async (torrent: Torrent, action: 'pause' | 'resume') => {
        try {
            const res = await fetch('/api/qbittorrent/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, hash: torrent.hash, instanceId: torrent.instanceId })
            });
            if (res.ok) fetchTorrents();
        } catch (e) {
            console.error('Error performing action', e);
        }
    };

    const handleDelete = async () => {
        if (!selectedHash) return;
        try {
            await fetch('/api/qbittorrent/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hashes: [selectedHash.hash],
                    deleteFiles,
                    blacklist: blacklistRelease,
                    instanceId: selectedHash.instanceId
                })
            });
            setDeleteModalOpen(false);
            setSuccessMessage(`Successfully removed: ${selectedHash.name}`);
            setTimeout(() => setSuccessMessage(null), 4000);
            fetchTorrents();
        } catch (e) {
            console.error('Error deleting torrent', e);
        }
    };

    // ── Smart Auto-Clean ─────────────────────────────────────────────────────
    const handleSmartClean = async () => {
        setIsRunningSmartClean(true);
        try {
            let candidates = [...torrents];

            // Apply immunity: skip torrents added within N days
            if (smartCleanImmunityEnabled) {
                const cutoff = Date.now() / 1000 - smartCleanImmunityDays * 86400;
                candidates = candidates.filter(t => !t.added_on || t.added_on < cutoff);
            }

            // Sort candidates
            if (smartCleanMode === 'largest') {
                candidates.sort((a, b) => b.size - a.size);
            } else if (smartCleanMode === 'oldest') {
                candidates.sort((a, b) => (a.added_on || 0) - (b.added_on || 0));
            } else if (smartCleanMode === 'unplayed') {
                // For "unplayed in Plex" — filter to only those not yet complete (progress < 1)
                // as a proxy for unplayed (real Plex check would require API call per item)
                candidates = candidates.filter(t => t.progress < 1);
                candidates.sort((a, b) => (a.added_on || 0) - (b.added_on || 0));
            }

            // Take top candidate
            const target = candidates[0];
            if (!target) {
                toast.info('No eligible torrents found for smart cleanup.');
                setIsRunningSmartClean(false);
                return;
            }

            await fetch('/api/qbittorrent/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hashes: [target.hash],
                    deleteFiles: qbitDeleteFiles,
                    blacklist: qbitBlacklist,
                    instanceId: target.instanceId
                })
            });

            toast.success(`Smart Cleanup: Removed "${target.name}" (${formatBytes(target.size)})`);
            fetchTorrents();
        } catch (e: any) {
            toast.error('Smart cleanup failed: ' + e.message);
        }
        setIsRunningSmartClean(false);
    };

    // ── Sort ─────────────────────────────────────────────────────────────────
    const toggleSort = (field: 'name' | 'size' | 'progress' | 'dlspeed') => {
        if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDirection('asc'); }
    };

    const sortedTorrents = useMemo(() => {
        return [...torrents].sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [torrents, sortField, sortDirection]);

    // ── Toggle helper ─────────────────────────────────────────────────────────
    const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
        <button
            onClick={() => onChange(!value)}
            className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 ${value ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
        >
            <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${value ? 'left-6' : 'left-1'}`} />
        </button>
    );

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="max-w-[1800px] mx-auto p-4 sm:p-8 space-y-6 pb-24">
            {/* Header & Sub-Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-2xl p-5 sm:p-6 rounded-[2.5rem] shadow-2xl">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        <DownloadIcon size={26} className="text-sky-400" /> Transfers
                    </h1>
                </div>

                {/* Segmented Switcher */}
                <div className="flex flex-wrap bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner self-start sm:self-auto gap-1">
                    <button
                        onClick={() => handleTabChange('downloads')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'downloads'
                                ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <DownloadIcon size={16} /> Transfers ({torrents.length + musicJobs.length + deviceQueue.length})
                    </button>
                    <button
                        onClick={() => handleTabChange('local')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'local'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <HardDrive size={16} /> Local Downloads
                    </button>
                    <button
                        onClick={() => handleTabChange('devices')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'devices'
                                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Smartphone size={16} /> Devices ({deviceQueue.length})
                    </button>
                    <button
                        onClick={() => handleTabChange('profiles')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'profiles'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <ShieldCheck size={16} /> Quality Profiles
                    </button>
                    <button
                        onClick={() => handleTabChange('indexers')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'indexers'
                                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Radio size={16} /> Indexers
                    </button>
                    <button
                        onClick={() => handleTabChange('users')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'users'
                                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Users size={16} /> Plex Users
                    </button>
                </div>
            </div>

            {/* Local Downloads Tab */}
            {activeTab === 'local' && (
                <LocalDownloadsPanel />
            )}

            {/* Devices Tab */}
            {activeTab === 'devices' && (
                <div className="animate-in fade-in duration-200">
                    <ConnectedDevicesPanel />
                </div>
            )}

            {/* Profiles Tab */}
            {activeTab === 'profiles' && (
                <div className="animate-in fade-in duration-200">
                    <ProfilesPanel />
                </div>
            )}

            {/* Indexers Tab */}
            {activeTab === 'indexers' && (
                <div className="animate-in fade-in duration-200">
                    <IndexersPanel />
                </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div className="animate-in fade-in duration-200">
                    <PlexUserManagerPanel />
                </div>
            )}

            {/* Downloads Tab */}
            {activeTab === 'downloads' && (
                <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
                    {/* ── Error / Success ─────────────────────────────────────────────── */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl">{error}</div>
                    )}
                    {successMessage && (
                        <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 p-4 rounded-xl flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            {successMessage}
                        </div>
                    )}

                    {/* ── Media Sub-Filters ────────────────────────────────────────────── */}
                    <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-zinc-800/80">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setDownloadMediaFilter('all')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    downloadMediaFilter === 'all'
                                        ? 'bg-zinc-800 text-white shadow-md'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                All Media ({torrents.length + musicJobs.length + deviceQueue.length})
                            </button>
                            <button
                                onClick={() => setDownloadMediaFilter('torrents')}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    downloadMediaFilter === 'torrents'
                                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-md'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <DownloadIcon size={14} /> Torrents ({torrents.length})
                            </button>
                            <button
                                onClick={() => setDownloadMediaFilter('music')}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    downloadMediaFilter === 'music'
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <Music size={14} /> Music &amp; Audio ({musicJobs.length})
                            </button>
                            <button
                                onClick={() => setDownloadMediaFilter('devices')}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    downloadMediaFilter === 'devices'
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <Smartphone size={14} /> Device Sync ({deviceQueue.length})
                            </button>
                        </div>
                    </div>

                    {/* ── Transfers List ─────────────────────────────────────────────────── */}
                    {loading && torrents.length === 0 && musicJobs.length === 0 && deviceQueue.length === 0 ? (
                        <div className="text-zinc-500 text-center py-10">Loading transfers...</div>
                    ) : (downloadMediaFilter === 'torrents' && torrents.length === 0) ||
                        (downloadMediaFilter === 'music' && musicJobs.length === 0) ||
                        (downloadMediaFilter === 'devices' && deviceQueue.length === 0) ||
                        (downloadMediaFilter === 'all' && torrents.length === 0 && musicJobs.length === 0 && deviceQueue.length === 0) ? (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                            No active downloads found.
                        </div>
                    ) : (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
                            {/* Table header */}
                            <div className="hidden md:grid grid-cols-[auto_2fr_0.8fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-zinc-950/40 text-xs font-semibold text-zinc-400">
                                <span className="w-10">Media</span>
                                <span className="cursor-pointer flex items-center gap-1 hover:text-white" onClick={() => toggleSort('name')}>
                                    Release / Title {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                </span>
                                <span className="cursor-pointer flex items-center gap-1 hover:text-white" onClick={() => toggleSort('size')}>
                                    Size {sortField === 'size' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                </span>
                                <span className="cursor-pointer flex items-center gap-1 hover:text-white" onClick={() => toggleSort('progress')}>
                                    Progress {sortField === 'progress' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                </span>
                                <span className="cursor-pointer flex items-center gap-1 hover:text-white" onClick={() => toggleSort('dlspeed')}>
                                    Down Speed {sortField === 'dlspeed' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                                </span>
                                <span>Status / Target</span>
                                <span className="text-right">Actions</span>
                            </div>

                            <div className="divide-y divide-zinc-800/60">
                                {/* Device Sync Transfers */}
                                {(downloadMediaFilter === 'all' || downloadMediaFilter === 'devices') &&
                                    deviceQueue.map((item) => (
                                        <DeviceSyncRow
                                            key={item.id}
                                            item={item}
                                            onCancel={handleCancelDeviceSync}
                                        />
                                    ))
                                }

                                {/* Music & Audio Downloads */}
                                {(downloadMediaFilter === 'all' || downloadMediaFilter === 'music') &&
                                    musicJobs.map((j) => (
                                        <MusicJobRow
                                            key={j.id}
                                            job={j}
                                            onCancel={handleCancelMusicJob}
                                            onOpenMedia={(item) => setSelectedMedia(item)}
                                        />
                                    ))
                                }

                                {/* Torrent Downloads */}
                                {(downloadMediaFilter === 'all' || downloadMediaFilter === 'torrents') &&
                                    sortedTorrents.map((t) => (
                                        <MediaCardRow
                                            key={`${t.instanceId}-${t.hash}`}
                                            torrent={t}
                                            onOpenMedia={handleOpenMedia}
                                            onPauseResume={handleAction}
                                            onDeleteClick={(torrent) => {
                                                setSelectedHash({ hash: torrent.hash, name: torrent.name, instanceId: torrent.instanceId });
                                                setDeleteModalOpen(true);
                                            }}
                                        />
                                    ))
                                }
                            </div>
                        </div>
                    )}

                    {/* ── Downloads Cleaner Compact Control Bar ──────────────────────── */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <HardDrive size={20} />
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="text-base font-black text-white">Downloads Cleaner</span>
                                <Toggle
                                    value={qbitCleanupEnabled}
                                    onChange={v => {
                                        setQbitCleanupEnabled(v);
                                        updateSetting('qbit_cleanup_enabled', v);
                                        toast.success(v ? 'Downloads Cleaner Enabled' : 'Downloads Cleaner Disabled');
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                            <button
                                onClick={handleSmartClean}
                                disabled={isRunningSmartClean}
                                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                title="Run Downloads Cleaner to trim unseeded and purge stalled torrents now"
                            >
                                <RefreshCw size={14} className={isRunningSmartClean ? 'animate-spin' : ''} />
                                <span>{isRunningSmartClean ? 'Cleaning...' : 'Clean Stalled Now'}</span>
                            </button>

                            <Link
                                href="/settings?tab=cleaners&subTab=torrents"
                                className="p-2.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl border border-zinc-700 transition-all cursor-pointer flex items-center justify-center shadow-md"
                                title="Open Downloads Cleaner & Stagnation Watchdog Rules in Settings"
                            >
                                <Sliders size={18} />
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
            {deleteModalOpen && selectedHash && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                        <h3 className="text-lg font-black text-white">Delete Download</h3>
                        <p className="text-xs text-zinc-400 font-medium">Are you sure you want to remove <span className="text-white font-bold">{selectedHash.name}</span>?</p>

                        <div className="space-y-4 mb-8">
                            {[
                                { checked: deleteFiles, onChange: setDeleteFiles, label: 'Delete Downloaded Data', hint: 'Also remove the files from disk.' },
                                { checked: blacklistRelease, onChange: setBlacklistRelease, label: 'Blacklist Release', hint: 'Remove from Radarr/Sonarr queue and mark as failed.' },
                            ].map(({ checked, onChange, label, hint }) => (
                                <label key={label} className="flex items-start gap-3 cursor-pointer group p-2 hover:bg-zinc-800/50 rounded-lg transition-colors -mx-2">
                                    <div className="relative flex items-center justify-center mt-0.5">
                                        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
                                        <div className="w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-950 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-zinc-200 font-semibold group-hover:text-white transition-colors">{label}</div>
                                        <div className="text-xs text-zinc-500 mt-0.5">{hint}</div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                            <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">Cancel</button>
                            <button onClick={handleDelete} className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 shadow-md shadow-red-500/20 text-white transition-colors flex items-center gap-2">
                                <Trash2 size={14} /> Delete Torrent
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Media Details Panel ───────────────────────────────────────────── */}
            {selectedMedia && (
                <MediaDetailsPanel
                    item={selectedMedia}
                    tmdbApiKey={tmdbApiKey}
                    libStatus={libStatus}
                    onClose={() => { setSelectedMedia(null); setLibStatus(null); }}
                />
            )}
        </div>
    );
}

export default function Downloads() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-40 gap-3 text-zinc-500 text-sm font-bold">
                <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                Loading Transfers...
            </div>
        }>
            <DownloadsContent />
        </Suspense>
    );
}

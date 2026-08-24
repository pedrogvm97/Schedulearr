"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Film, Pause, Play, Trash2, Info, ShieldCheck, Clock, HardDrive, Tv, Sliders, Radio, Users, Download as DownloadIcon } from "lucide-react";
import { MediaDetailsPanel } from "@/components/MediaDetailsPanel";
import { ProfilesPanel } from "@/components/ProfilesPanel";
import { IndexersPanel } from "@/components/IndexersPanel";
import { PlexUserManagerPanel } from "@/components/PlexUserManagerPanel";
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

    return (
        <div
            className="p-3 md:px-4 md:py-3 hover:bg-zinc-800/40 transition-colors flex flex-col md:grid md:grid-cols-[auto_2fr_0.8fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 md:items-center relative group"
        >
            {/* Poster thumbnail */}
            <div
                onClick={() => onOpenMedia(torrent)}
                className="w-10 h-14 rounded-md overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0 group-hover:border-emerald-500/30 cursor-pointer shadow-sm active:scale-95 transition-transform"
                title="View media details"
            >
                {torrent.poster ? (
                    <img
                        src={torrent.poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(torrent.poster)}` : torrent.poster}
                        className="w-full h-full object-cover"
                        alt=""
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = '';
                            (e.target as HTMLImageElement).className = 'hidden';
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700 group-hover:text-emerald-500/50">
                        <Film size={16} />
                    </div>
                )}
            </div>

            {/* Title + badges */}
            <div className="flex items-center gap-4 min-w-0 pr-2 md:pr-0">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm bg-opacity-20 text-white truncate max-w-[120px] ${torrent.instanceColor}`}>
                            {torrent.instanceName || 'qBittorrent'}
                        </span>
                        {isStalled && (
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm bg-orange-500/20 text-orange-500">
                                stalled
                            </span>
                        )}
                    </div>
                    <h3
                        className="text-sm font-medium text-white truncate group-hover:text-emerald-400 cursor-pointer"
                        title={torrent.name}
                        onClick={() => onOpenMedia(torrent)}
                    >
                        {torrent.name}
                    </h3>
                </div>
            </div>

            {/* Size */}
            <div className="text-sm text-zinc-400 flex items-center md:items-start group-hover:text-zinc-300 transition-colors">
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

            {/* Action buttons — always visible */}
            <div className="absolute top-3 right-3 md:relative md:top-auto md:right-auto flex-shrink-0 flex items-center gap-1.5">
                {/* More Info */}
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenMedia(torrent); }}
                    className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-md transition-all shadow-sm"
                    title="View Media Details"
                >
                    <Info size={15} />
                </button>

                {/* Pause / Resume */}
                {isPaused ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPauseResume(torrent, 'resume'); }}
                        className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/80 hover:text-white text-emerald-500 rounded-md transition-all shadow-sm"
                        title="Resume"
                    >
                        <Play size={15} fill="currentColor" />
                    </button>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPauseResume(torrent, 'pause'); }}
                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-md transition-all shadow-sm"
                        title="Pause"
                    >
                        <Pause size={15} fill="currentColor" />
                    </button>
                )}

                {/* Delete */}
                <button
                    onClick={(e) => { e.stopPropagation(); onDeleteClick(torrent); }}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/80 hover:text-white text-red-500 rounded-md transition-all shadow-sm"
                    title="Delete Torrent"
                >
                    <Trash2 size={15} />
                </button>
            </div>
        </div>
    );
}

// ─── Main Content Component ───────────────────────────────────────────────────
function DownloadsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const initialTab = (['downloads', 'profiles', 'indexers', 'users'].includes(searchParams.get('tab') || '')
        ? searchParams.get('tab')
        : 'downloads') as 'downloads' | 'profiles' | 'indexers' | 'users';

    const [activeTab, setActiveTab] = useState<'downloads' | 'profiles' | 'indexers' | 'users'>(initialTab);
    const [torrents, setTorrents] = useState<Torrent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['downloads', 'profiles', 'indexers', 'users'].includes(tab)) {
            setActiveTab(tab as any);
        }
    }, [searchParams]);

    const handleTabChange = (tab: 'downloads' | 'profiles' | 'indexers' | 'users') => {
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
            if (data.tmdbApiKey) setTmdbApiKey(data.tmdbApiKey);
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
        fetchSettings();
        const interval = setInterval(fetchTorrents, 5000);
        return () => clearInterval(interval);
    }, []);

    const cleanReleaseName = (name: string) => {
        return name.toLowerCase()
            .replace(/\b(1080p|720p|2160p|4k|uhd|bluray|web-dl|webrip|h\.264|h\.265|x264|x265|hevc|ddp5\.1|dts|aac|repack|proper|remux|multi|vostfr|subfrench|dual|amzn|nf|dsnp|hmax|web)\b/gi, '')
            .replace(/[\[\(\]\)]/g, ' ')
            .replace(/[\.\\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const handleOpenMedia = (torrent: Torrent) => {
        const cleanedTitle = cleanReleaseName(torrent.name);
        const resolvedType: 'movie' | 'series' = torrent.mediaType || (torrent.tvdbId ? 'series' : 'movie');
        const item = {
            title: torrent.name || cleanedTitle,
            cleanTitle: cleanedTitle,
            tmdbId: torrent.tmdbId || null,
            tvdbId: torrent.tvdbId || null,
            type: resolvedType,
            mediaType: resolvedType,
            remotePoster: torrent.poster || null
        };
        setSelectedMedia(item);
        const statusTitle = torrent.tmdbId || torrent.tvdbId ? torrent.name : cleanedTitle;
        fetch(`/api/media/status?title=${encodeURIComponent(statusTitle)}&type=${resolvedType}`)
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
                    <p className="text-sm text-zinc-500 mt-1 font-medium">
                        Manage active torrent downloads, configure quality profiles, sync indexers, and manage Plex user permissions.
                    </p>
                </div>

                {/* Segmented Switcher */}
                <div className="flex flex-wrap bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner self-start sm:self-auto gap-1">
                    <button
                        onClick={() => setActiveTab('downloads')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'downloads'
                                ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <DownloadIcon size={16} /> Downloads ({torrents.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('profiles')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'profiles'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <ShieldCheck size={16} /> Quality Profiles
                    </button>
                    <button
                        onClick={() => setActiveTab('indexers')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeTab === 'indexers'
                                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Radio size={16} /> Indexers
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
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

                    {/* ── Torrent List ─────────────────────────────────────────────────── */}
                    {loading && torrents.length === 0 ? (
                        <div className="text-zinc-500 text-center py-10">Loading torrents...</div>
                    ) : torrents.length === 0 ? (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                            No active downloads found.
                        </div>
                    ) : (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
                            {/* Table header */}
                            <div className="hidden md:grid grid-cols-[auto_2fr_0.8fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-zinc-950/40 text-xs font-semibold text-zinc-400">
                                <span className="w-10">Media</span>
                                <span className="cursor-pointer flex items-center gap-1 hover:text-white" onClick={() => toggleSort('name')}>
                                    Release {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
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
                                <span>Up Speed</span>
                                <span className="text-right">Actions</span>
                            </div>

                            <div className="divide-y divide-zinc-800/60">
                                {sortedTorrents.map((t) => (
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
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Auto-Cleanup & Smart Tools ───────────────────────────────────── */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
                            <div>
                                <h3 className="text-base font-black text-white flex items-center gap-2">
                                    <HardDrive size={18} className="text-emerald-400" /> Auto-Cleanup &amp; Stagnation Watchdog
                                </h3>
                                <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                                    Automatically delete stalled torrents, oversized files, and free disk space.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleSmartClean}
                                    disabled={isRunningSmartClean}
                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                >
                                    {isRunningSmartClean ? 'Cleaning...' : '⚡ Clean Stalled Now'}
                                </button>
                                <button
                                    onClick={() => setIsCleanupSettingsOpen(!isCleanupSettingsOpen)}
                                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl border border-zinc-700 transition-all cursor-pointer"
                                >
                                    {isCleanupSettingsOpen ? 'Hide Rules' : 'Configure Rules'}
                                </button>
                            </div>
                        </div>

                        {isCleanupSettingsOpen && (
                            <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-3 duration-200">
                                {/* Section 1: Core Automation Toggles */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="flex items-center justify-between p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                                        <div>
                                            <span className="text-sm font-bold text-white block">Auto Cleanup Engine</span>
                                            <span className="text-xs text-zinc-400">Run background watchdog periodically</span>
                                        </div>
                                        <Toggle
                                            value={qbitCleanupEnabled}
                                            onChange={v => { setQbitCleanupEnabled(v); updateSetting('qbit_cleanup_enabled', v); }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                                        <div>
                                            <span className="text-sm font-bold text-white block">Delete Files From Disk</span>
                                            <span className="text-xs text-zinc-400">Reclaim physical storage immediately</span>
                                        </div>
                                        <Toggle
                                            value={qbitDeleteFiles}
                                            onChange={v => { setQbitDeleteFiles(v); updateSetting('qbit_cleanup_delete_files', v); }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                                        <div>
                                            <span className="text-sm font-bold text-white block">Blacklist Failed Release</span>
                                            <span className="text-xs text-zinc-400">Instruct Sonarr/Radarr to find alternate</span>
                                        </div>
                                        <Toggle
                                            value={qbitBlacklist}
                                            onChange={v => { setQbitBlacklist(v); updateSetting('qbit_cleanup_blacklist', v); }}
                                        />
                                    </div>
                                </div>

                                {/* Section 2: Timing, Stagnation & Size Thresholds */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Scan Interval */}
                                    <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80 space-y-2.5">
                                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                                            Scan Interval (Minutes)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={qbitCleanupIntervalMin}
                                            onChange={e => {
                                                const v = parseInt(e.target.value) || 15;
                                                setQbitCleanupIntervalMin(v);
                                                updateSetting('qbit_cleanup_interval_min', v);
                                            }}
                                            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-sm font-semibold text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                        />
                                        <p className="text-xs text-zinc-400 leading-relaxed">
                                            How often the background process scans for stalled items.
                                        </p>
                                    </div>

                                    {/* Stagnation Limit */}
                                    <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                                                Stagnation Timeout
                                            </label>
                                            <Toggle
                                                value={qbitStagnationEnabled}
                                                onChange={v => { setQbitStagnationEnabled(v); updateSetting('qbit_cleanup_stagnation_enabled', v); }}
                                            />
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
                                                    updateSetting('qbit_cleanup_stagnation_min', v);
                                                }}
                                                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-sm font-semibold text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all disabled:opacity-30"
                                            />
                                            <span className="text-xs font-bold text-zinc-400">min</span>
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed">
                                            Purge downloads stalled at 0 B/s for longer than this.
                                        </p>
                                    </div>

                                    {/* Max Size */}
                                    <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                                                Max Release Size
                                            </label>
                                            <Toggle
                                                value={qbitSizeCleanupEnabled}
                                                onChange={v => { setQbitSizeCleanupEnabled(v); updateSetting('qbit_cleanup_max_size_enabled', v); }}
                                            />
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
                                                    updateSetting('qbit_cleanup_max_size_gb', v);
                                                }}
                                                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-sm font-semibold text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all disabled:opacity-30"
                                            />
                                            <span className="text-xs font-bold text-zinc-400">GB</span>
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed">
                                            Releases exceeding this size limit are rejected and purged.
                                        </p>
                                    </div>
                                </div>

                                {/* Section 3: Whitelist & Exclusions */}
                                <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80 space-y-2.5">
                                    <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
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
                                        className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                    />
                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                        Comma-separated categories, release names, or torrent hashes to exempt from automatic cleanup.
                                    </p>
                                </div>

                                {/* Section 4: Smart Storage Guard */}
                                <div className="p-5 bg-zinc-950/70 rounded-2xl border border-emerald-500/20 space-y-5">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                                            <HardDrive size={18} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Smart Auto-Clean &amp; Storage Guard</h4>
                                            <p className="text-xs text-zinc-400">Intelligently target which stalled or oversized files to clean first.</p>
                                        </div>
                                    </div>

                                    {/* Sort mode selector */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Priority Mode</label>
                                        <div className="flex flex-wrap gap-2.5">
                                            {([
                                                { id: 'largest', label: 'Largest Files', icon: <HardDrive size={14} /> },
                                                { id: 'oldest', label: 'Oldest Added', icon: <Clock size={14} /> },
                                                { id: 'unplayed', label: 'Unplayed / Incomplete', icon: <Tv size={14} /> },
                                            ] as const).map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => { setSmartCleanMode(opt.id); updateSetting('media_smart_clean_mode', opt.id); }}
                                                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${smartCleanMode === opt.id
                                                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-sm'
                                                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                                                        }`}
                                                >
                                                    {opt.icon}
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Immunity toggle */}
                                    <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800/60">
                                        <div className="flex items-center gap-2.5">
                                            <ShieldCheck size={16} className={smartCleanImmunityEnabled ? 'text-amber-400' : 'text-zinc-600'} />
                                            <div>
                                                <div className="text-sm font-bold text-zinc-200">Protect Recently Added Downloads</div>
                                                <p className="text-xs text-zinc-400 flex items-center flex-wrap gap-1 mt-0.5">
                                                    <span>Skip torrents added within the last</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="90"
                                                        disabled={!smartCleanImmunityEnabled}
                                                        value={smartCleanImmunityDays}
                                                        onChange={e => { const v = parseInt(e.target.value) || 7; setSmartCleanImmunityDays(v); updateSetting('media_smart_clean_immunity_days', v); }}
                                                        className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-white text-xs font-bold text-center outline-none focus:border-amber-500 disabled:opacity-30 transition-all"
                                                    />
                                                    <span>days.</span>
                                                </p>
                                            </div>
                                        </div>
                                        <Toggle
                                            value={smartCleanImmunityEnabled}
                                            onChange={v => { setSmartCleanImmunityEnabled(v); updateSetting('media_smart_clean_immunity_enabled', v); }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
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

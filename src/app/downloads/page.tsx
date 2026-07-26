"use client";

import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Film, Pause, Play, Trash2, Info, ShieldCheck, Clock, HardDrive, Tv } from "lucide-react";
import { MediaDetailsPanel } from "@/components/MediaDetailsPanel";
import { IndexersPanel } from "@/components/IndexersPanel";
import { ProfilesPanel } from "@/components/ProfilesPanel";
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

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Downloads() {
    const [activeTab, setActiveTab] = useState<'downloads' | 'indexers' | 'profiles'>('downloads');
    const [torrents, setTorrents] = useState<Torrent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
            if (data.qbit_smart_clean_mode) setSmartCleanMode(data.qbit_smart_clean_mode as any);
            if (data.qbit_smart_clean_immunity_enabled !== undefined) setSmartCleanImmunityEnabled(data.qbit_smart_clean_immunity_enabled === 'true');
            if (data.qbit_smart_clean_immunity_days) setSmartCleanImmunityDays(parseInt(data.qbit_smart_clean_immunity_days));
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
        <div className="max-w-6xl mx-auto p-6 space-y-8 pb-24">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">Downloads & Indexers</h1>
                </div>

                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 gap-1">
                    <button
                        onClick={() => setActiveTab('downloads')}
                        className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'downloads' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700/60' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        📥 Downloads
                    </button>
                    <button
                        onClick={() => setActiveTab('indexers')}
                        className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'indexers' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700/60' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        🔍 Indexers &amp; Rules
                    </button>
                    <button
                        onClick={() => setActiveTab('profiles')}
                        className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'profiles' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700/60' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        ⚙️ Quality Profiles
                    </button>
                </div>
            </div>

            {activeTab === 'indexers' ? (
                <IndexersPanel />
            ) : activeTab === 'profiles' ? (
                <ProfilesPanel />
            ) : (
                <>

            {/* ── Auto-Cleanup Panel ─────────────────────────────────────────── */}
            <div className={`bg-zinc-900 border ${isCleanupSettingsOpen ? 'border-emerald-500/30' : 'border-zinc-800'} rounded-2xl transition-all overflow-hidden`}>
                <button
                    onClick={() => setIsCleanupSettingsOpen(!isCleanupSettingsOpen)}
                    className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/50 transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${qbitCleanupEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path></svg>
                        </div>
                        <div className="text-left">
                            <h2 className="text-base font-bold text-white tracking-tight">Auto-Cleanup Settings</h2>
                            <p className="text-xs text-zinc-500 font-medium">Stagnation removal, size limits, and smart file selection.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${qbitCleanupEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            {qbitCleanupEnabled ? 'Active' : 'Disabled'}
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-zinc-500 transition-transform duration-300 ${isCleanupSettingsOpen ? 'rotate-180' : ''}`}>
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </div>
                </button>

                {isCleanupSettingsOpen && (
                    <div className="p-6 pt-4 border-t border-zinc-800/50 animate-in fade-in slide-in-from-top-4 duration-300 space-y-6">

                        {/* Row 1: Basic toggles */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Enable Cleaner */}
                            <div className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 h-20">
                                <div>
                                    <div className="text-sm font-bold text-zinc-200">Enable Cleaner</div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Run background health checks</p>
                                </div>
                                <Toggle value={qbitCleanupEnabled} onChange={v => { setQbitCleanupEnabled(v); updateSetting('qbit_cleanup_enabled', v); }} />
                            </div>

                            {/* Delete Files toggle */}
                            <div className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 h-20">
                                <div>
                                    <div className="text-sm font-bold text-zinc-200">Delete Files</div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Remove data from disk</p>
                                </div>
                                <Toggle value={qbitDeleteFiles} onChange={v => { setQbitDeleteFiles(v); updateSetting('qbit_cleanup_delete_files', v); }} />
                            </div>

                            {/* Blacklist toggle */}
                            <div className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 h-20">
                                <div>
                                    <div className="text-sm font-bold text-zinc-200">Blacklist Failed</div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Prevent re-grabbing same release</p>
                                </div>
                                <Toggle value={qbitBlacklist} onChange={v => { setQbitBlacklist(v); updateSetting('qbit_cleanup_blacklist', v); }} />
                            </div>
                        </div>

                        {/* Row 2: Numeric inputs */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Interval */}
                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-3">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Interval (Minutes)</label>
                                <input
                                    type="number" min="1" value={qbitCleanupIntervalMin}
                                    onChange={e => { const v = parseInt(e.target.value) || 15; setQbitCleanupIntervalMin(v); updateSetting('qbit_cleanup_interval_min', v); }}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all"
                                />
                                <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">How often the background process scans.</p>
                            </div>

                            {/* Stagnation */}
                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Stagnation (Min)</label>
                                    <Toggle value={qbitStagnationEnabled} onChange={v => { setQbitStagnationEnabled(v); updateSetting('qbit_cleanup_stagnation_enabled', v); }} />
                                </div>
                                <input
                                    type="number" min="1" disabled={!qbitStagnationEnabled} value={qbitStagnationMin}
                                    onChange={e => { const v = parseInt(e.target.value) || 60; setQbitStagnationMin(v); updateSetting('qbit_cleanup_stagnation_min', v); }}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all disabled:opacity-30"
                                />
                                <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">Purge items stuck for longer than this.</p>
                            </div>

                            {/* Max Size */}
                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Max Size (GB)</label>
                                    <Toggle value={qbitSizeCleanupEnabled} onChange={v => { setQbitSizeCleanupEnabled(v); updateSetting('qbit_cleanup_max_size_enabled', v); }} />
                                </div>
                                <input
                                    type="number" min="1" disabled={!qbitSizeCleanupEnabled} value={qbitMaxSizeGb}
                                    onChange={e => { const v = parseInt(e.target.value) || 15; setQbitMaxSizeGb(v); updateSetting('qbit_cleanup_max_size_gb', v); }}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all disabled:opacity-30"
                                />
                                <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">Releases larger than this will be rejected.</p>
                            </div>
                        </div>

                        {/* ── Smart Auto-Clean ─────────────────────────────────────────────── */}
                        <div className="p-5 bg-zinc-950/70 rounded-2xl border border-emerald-500/10 space-y-5">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                                    <HardDrive size={16} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Smart Auto-Clean</h3>
                                    <p className="text-[10px] text-zinc-500 font-medium">Intelligently select which files to remove when you need space.</p>
                                </div>
                            </div>

                            {/* Sort mode selector */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Delete by</label>
                                <div className="flex flex-wrap gap-2">
                                    {([
                                        { id: 'largest', label: 'Largest Files', icon: <HardDrive size={13} /> },
                                        { id: 'oldest', label: 'Oldest Added', icon: <Clock size={13} /> },
                                        { id: 'unplayed', label: 'Unplayed / Incomplete', icon: <Tv size={13} /> },
                                    ] as const).map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => { setSmartCleanMode(opt.id); updateSetting('qbit_smart_clean_mode', opt.id); }}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all ${smartCleanMode === opt.id
                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                                                }`}
                                        >
                                            {opt.icon}
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Immunity toggle */}
                            <div className="flex items-center justify-between p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/60">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={14} className={smartCleanImmunityEnabled ? 'text-amber-400' : 'text-zinc-600'} />
                                    <div>
                                        <div className="text-sm font-bold text-zinc-200">Protect Recently Added</div>
                                        <p className="text-[10px] text-zinc-500 font-medium">Skip files added within the last
                                            <input
                                                type="number"
                                                min="1"
                                                max="90"
                                                disabled={!smartCleanImmunityEnabled}
                                                value={smartCleanImmunityDays}
                                                onChange={e => { const v = parseInt(e.target.value) || 7; setSmartCleanImmunityDays(v); updateSetting('qbit_smart_clean_immunity_days', v); }}
                                                className="inline-block w-10 mx-1.5 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-white text-[10px] text-center outline-none focus:border-amber-500/50 disabled:opacity-40 transition-all"
                                            />
                                            days.
                                        </p>
                                    </div>
                                </div>
                                <Toggle
                                    value={smartCleanImmunityEnabled}
                                    onChange={v => { setSmartCleanImmunityEnabled(v); updateSetting('qbit_smart_clean_immunity_enabled', v); }}
                                />
                            </div>

                            {/* Run button */}
                            <div className="flex items-center justify-between pt-1">
                                <p className="text-[10px] text-zinc-600 italic">
                                    Targets the {smartCleanMode === 'largest' ? 'largest' : smartCleanMode === 'oldest' ? 'oldest' : 'unplayed/incomplete'} eligible torrent
                                    {smartCleanImmunityEnabled ? ` (ignoring files added in last ${smartCleanImmunityDays}d)` : ''}.
                                </p>
                                <button
                                    onClick={handleSmartClean}
                                    disabled={isRunningSmartClean || torrents.length === 0}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wide transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                                >
                                    {isRunningSmartClean ? (
                                        <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running...</>
                                    ) : (
                                        <><Trash2 size={13} /> Run Smart Clean</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

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
                    <div className="hidden md:grid grid-cols-[auto_2fr_0.8fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-zinc-950/50 text-xs font-semibold text-zinc-500 uppercase tracking-wider items-center select-none">
                        <div className="w-10">Art</div>
                        <button onClick={() => toggleSort('name')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <button onClick={() => toggleSort('size')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Size {sortField === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <button onClick={() => toggleSort('progress')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Completion {sortField === 'progress' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <button onClick={() => toggleSort('dlspeed')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Speed {sortField === 'dlspeed' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <div className="text-left">Indexer</div>
                        <div className="w-28 text-center">Actions</div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-zinc-800/50">
                        {sortedTorrents.map(torrent => (
                            <MediaCardRow
                                key={torrent.hash}
                                torrent={torrent}
                                onOpenMedia={handleOpenMedia}
                                onPauseResume={handleAction}
                                onDeleteClick={(t) => {
                                    setSelectedHash({ hash: t.hash, name: t.name, instanceId: t.instanceId });
                                    setDeleteModalOpen(true);
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
            {deleteModalOpen && selectedHash && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-4">Confirm Deletion</h2>
                        <p className="text-zinc-400 text-sm mb-6 pb-4 border-b border-zinc-800">
                            Are you sure you want to remove <span className="text-white font-medium break-all">{selectedHash.name}</span>?
                        </p>

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
            </>
            )}
        </div>
    );
}

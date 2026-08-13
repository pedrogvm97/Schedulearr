"use client";

import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Film, Pause, Play, Trash2, Info, ShieldCheck, Clock, HardDrive, Tv } from "lucide-react";
import { MediaDetailsPanel } from "@/components/MediaDetailsPanel";
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
        <div className="max-w-6xl mx-auto p-6 space-y-8 pb-24">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">Downloads</h1>
                </div>
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

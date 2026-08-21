'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, Plus, Film, Tv, CheckCircle,
    Filter, X, Star, Calendar,
    LayoutGrid, List as Rows, Sparkles, TrendingUp,
    ChevronDown, Tags, Monitor, ChevronRight,
    HardDrive, Percent, PlayCircle, ChevronUp,
    PlaySquare, Square, Trash2, MoveHorizontal, MoreVertical,
    CheckCircle2, Copy, ListOrdered, RefreshCw, Layers,
    Disc, Music
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';
import { twColorToHex } from '@/lib/instanceColor';
import { SchedulerQueuePanel } from '@/components/SchedulerQueuePanel';
import { MediaDetailsPanel } from '@/components/MediaDetailsPanel';
import { PersonDetailsPanel } from '@/components/PersonDetailsPanel';
import { InteractiveSearchModal } from '@/components/InteractiveSearchModal';
import { DeleteMediaModal } from '@/components/DeleteMediaModal';
import { MusicInspectorModal } from '@/components/MusicInspectorModal';

interface Instance {
    id: string;
    name: string;
    type: 'radarr' | 'sonarr' | 'lidarr';
    color?: string;
    colorHex?: string;
    internalId?: number;
}

interface QualityProfile { id: number; name: string; }
interface RootFolder { id: number; path: string; }

// ──────────────────────────────────────────────
// Genre list
// ──────────────────────────────────────────────
const ALL_GENRES = [
    'All', 'Action', 'Adventure', 'Animation', 'Anime', 'Comedy', 'Crime',
    'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
    'Music', 'Mystery', 'Reality', 'Romance', 'Sci-Fi',
    'Soap', 'Thriller', 'War', 'Western', 'Talk'
];

const QUICK_STUDIOS = [
    { name: 'Netflix', color: 'text-red-500' },
    { name: 'HBO', color: 'text-violet-500' },
    { name: 'Disney+', color: 'text-blue-500' },
    { name: 'Amazon', color: 'text-sky-500' },
    { name: 'Apple TV+', color: 'text-white' },
    { name: 'Hulu', color: 'text-emerald-500' },
    { name: 'Paramount+', color: 'text-blue-400' },
];

function getPlatformBadge(item: any) {
    const all: string[] = [
        ...(item.productionCompanies || []),
        item.studio, item.network
    ].filter(Boolean).map((s: string) => s.toLowerCase());

    if (all.some(c => c.includes('netflix'))) return { label: 'Netflix', color: 'bg-red-900/40 text-red-400 border-red-700/30' };
    if (all.some(c => c.includes('hbo') || c.includes('max'))) return { label: 'HBO Max', color: 'bg-violet-900/40 text-violet-400 border-violet-700/30' };
    if (all.some(c => c.includes('amazon') || c.includes('prime'))) return { label: 'Prime', color: 'bg-sky-900/40 text-sky-400 border-sky-700/30' };
    if (all.some(c => c.includes('disney'))) return { label: 'Disney+', color: 'bg-blue-900/40 text-blue-400 border-blue-700/30' };
    if (all.some(c => c.includes('apple'))) return { label: 'Apple TV+', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    if (all.some(c => c.includes('hulu'))) return { label: 'Hulu', color: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/30' };
    if (all.some(c => c.includes('paramount'))) return { label: 'Paramount+', color: 'bg-blue-900/40 text-blue-300 border-blue-700/30' };
    if (item.studio) return { label: item.studio, color: 'bg-zinc-900/40 text-zinc-400 border-zinc-700/30' };
    return null;
}

// ──────────────────────────────────────────────
// Episode List Component
// ──────────────────────────────────────────────
function EpisodeList({ 
    instanceId, 
    seriesId, 
    onInteractiveSearch, 
    onQuickSearch 
}: { 
    instanceId: string; 
    seriesId: number; 
    onInteractiveSearch?: (ep: any) => void;
    onQuickSearch?: (target: any) => void;
}) {
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    useEffect(() => {
        fetch(`/api/sonarr/episodes?instanceId=${instanceId}&seriesId=${seriesId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                setEpisodes(Array.isArray(data) ? data : []);
                const seasons = [...new Set((Array.isArray(data) ? data : []).map((e: any) => e.seasonNumber))].sort((a: any, b: any) => b - a);
                if (seasons.length > 0) setSelectedSeason(seasons[0]);
            })
            .catch(() => setEpisodes([]))
            .finally(() => setLoading(false));
    }, [instanceId, seriesId]);

    const handleDeleteEpisodeFile = async (episodeFileId: number, epId: number) => {
        setDeletingId(epId);
        try {
            const res = await fetch(`/api/sonarr/file?instanceId=${instanceId}&episodeFileId=${episodeFileId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Episode file deleted');
                setEpisodes(prev => prev.map(e => e.id === epId ? { ...e, hasFile: false, episodeFileId: undefined } : e));
            } else {
                toast.error('Failed to delete episode file');
            }
        } catch {
            toast.error('Error deleting file');
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-6 gap-2 text-zinc-600 text-xs font-bold">
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                Loading episodes...
            </div>
        );
    }

    const seasons = [...new Set(episodes.map(e => e.seasonNumber))].sort((a: any, b: any) => a - b);
    const displayedEpisodes = episodes.filter(e => e.seasonNumber === selectedSeason);

    return (
        <div className="space-y-4 pt-2">
            {/* Season Selector Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {seasons.map(s => {
                    const seasonEps = episodes.filter(e => e.seasonNumber === s);
                    const hasAll = seasonEps.every(e => e.hasFile);
                    const hasSome = seasonEps.some(e => e.hasFile);
                    const isSelected = selectedSeason === s;
                    return (
                        <button
                            key={s}
                            onClick={() => setSelectedSeason(s)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                isSelected
                                    ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                                    : 'bg-zinc-900/60 text-zinc-500 hover:text-zinc-300 border border-zinc-900'
                            }`}
                        >
                            <div className={`w-1.5 h-1.5 rounded-full ${hasAll ? 'bg-emerald-500' : hasSome ? 'bg-amber-500' : 'bg-zinc-700'}`} />
                            {s === 0 ? 'Specials' : `Season ${s}`}
                            <span className="text-[10px] text-zinc-600 font-semibold">({seasonEps.filter(e => e.hasFile).length}/{seasonEps.length})</span>
                        </button>
                    );
                })}
                {selectedSeason !== null && (
                    <button
                        onClick={() => onQuickSearch?.({ type: 'season', id: seriesId, instanceId, seasonNumber: selectedSeason })}
                        className="ml-auto px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-colors flex items-center gap-1.5"
                    >
                        <PlayCircle size={13} /> Auto Search Season
                    </button>
                )}
            </div>

            {/* Episode List Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {displayedEpisodes.map(ep => {
                    const isDeletingThis = deletingId === ep.id;
                    const isConfirmingThis = confirmDeleteId === ep.id;
                    return (
                        <div
                            key={ep.id}
                            className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                                ep.hasFile
                                    ? 'bg-zinc-900/40 border-zinc-800/80'
                                    : 'bg-zinc-950/40 border-zinc-900 opacity-60'
                            }`}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-zinc-500 shrink-0">E{ep.episodeNumber}</span>
                                    <span className="text-xs font-bold text-white truncate">{ep.title}</span>
                                </div>
                                <div className="text-[11px] text-zinc-500 font-medium mt-0.5 flex items-center gap-2">
                                    <span>{ep.airDate || 'TBA'}</span>
                                    {ep.hasFile && <span className="text-emerald-500 font-bold">• Downloaded</span>}
                                </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => onInteractiveSearch?.(ep)}
                                    title="Interactive Search"
                                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-colors"
                                >
                                    <Search size={13} />
                                </button>
                                <button
                                    onClick={() => onQuickSearch?.({ type: 'episode', id: ep.id, instanceId })}
                                    title="Auto Search Episode"
                                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border border-zinc-800/80 transition-colors"
                                >
                                    <PlayCircle size={13} />
                                </button>
                                {ep.hasFile && ep.episodeFileId && (
                                    isConfirmingThis ? (
                                        <button
                                            disabled={isDeletingThis}
                                            onClick={() => handleDeleteEpisodeFile(ep.episodeFileId, ep.id)}
                                            className="px-2 py-1 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition-colors"
                                        >
                                            {isDeletingThis ? '...' : 'Del'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmDeleteId(ep.id)}
                                            title="Delete Episode File"
                                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// Unified Media Card Component
// ──────────────────────────────────────────────
interface UnifiedMediaCardProps {
    item: any;
    viewMode: 'grid' | 'list';
    libStatus: {
        exists: boolean;
        hasFile: boolean;
        isDownloading: boolean;
        percentage: number;
        sizeOnDisk: number;
        qualityProfileId?: number;
        instances: { id: string; name: string; colorHex?: string; internalId?: number }[];
    };
    isAdding: boolean;
    onAdd: () => void;
    onDelete: (payload: any) => void;
    onTransfer: (payload: any) => void;
    onInteractiveSearch: (payload: any) => void;
    onQuickSearch: (payload: any) => void;
    onOpenDetails: () => void;
    expandAll: boolean;
    excludeUnmonitored: boolean;
}

function UnifiedMediaCard({
    item,
    viewMode,
    libStatus,
    isAdding,
    onAdd,
    onDelete,
    onTransfer,
    onInteractiveSearch,
    onQuickSearch,
    onOpenDetails,
    expandAll,
}: UnifiedMediaCardProps) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setExpanded(expandAll);
    }, [expandAll]);

    const isSeries = !!(item.tvdbId || item.seasons || item.type === 'series');
    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || item.remotePoster || (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '');
    const rating = item.ratings?.value || item.vote_average;
    const platform = getPlatformBadge(item);

    // Library bindings
    const libId = libStatus.exists ? (libStatus.instances?.[0]?.internalId || item.id) : item.id;
    const instanceId = libStatus.exists ? (libStatus.instances?.[0]?.id || item.instanceId) : item.instanceId;
    const instanceName = libStatus.exists ? (libStatus.instances?.[0]?.name || item.instanceName || 'Arr Instance') : (item.instanceName || 'Arr Instance');

    // Progress & Size math
    const sizeBytes = libStatus.exists ? libStatus.sizeOnDisk : (item.movieFile?.size || 0);
    const sizeStr = sizeBytes > 1e12 ? `${(sizeBytes / 1e12).toFixed(1)} TB` : sizeBytes > 1e9 ? `${(sizeBytes / 1e9).toFixed(1)} GB` : sizeBytes > 1e6 ? `${(sizeBytes / 1e6).toFixed(0)} MB` : null;
    const pct = libStatus.exists ? Math.round(libStatus.percentage || 0) : (isSeries ? 0 : (item.hasFile ? 100 : 0));
    const path = item.path || '';

    const transferPayload = {
        ...item,
        id: libId,
        instanceId,
        instanceName,
        qualityProfileId: libStatus.qualityProfileId || item.qualityProfileId
    };

    const deletePayload = {
        ...item,
        id: libId,
        instanceId,
        title: item.title
    };

    // ──────────────────────────────────────────────
    // LIST VIEW
    // ──────────────────────────────────────────────
    if (viewMode === 'list') {
        return (
            <div className="flex flex-col bg-zinc-950/60 border border-zinc-900 rounded-3xl overflow-hidden hover:border-zinc-800 transition-all shadow-xl">
                <div className="p-4 sm:p-5 flex items-center gap-5 sm:gap-6">
                    {/* Poster Thumbnail */}
                    <div
                        className="w-16 sm:w-20 aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 flex-shrink-0 shadow-lg border border-white/5 cursor-pointer hover:scale-105 transition-transform"
                        onClick={onOpenDetails}
                    >
                        {poster ? (
                            <img src={poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(poster)}` : poster} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-800">
                                {isSeries ? <Tv size={28} /> : <Film size={28} />}
                            </div>
                        )}
                    </div>

                    {/* Information Column */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                        {/* Top Line: Title & Badges */}
                        <div className="flex items-center gap-2.5 min-w-0">
                            <h3 className="font-bold text-white text-lg sm:text-xl truncate hover:text-emerald-400 cursor-pointer transition-colors" onClick={onOpenDetails}>
                                {item.title || item.name}
                            </h3>
                            {platform && (
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider shrink-0 ${platform.color}`}>
                                    {platform.label}
                                </span>
                            )}
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0">
                                {isSeries ? 'Series' : 'Movie'}
                            </span>
                        </div>

                        {/* Middle Line: Status, Instances & Progress */}
                        <div className="flex flex-wrap items-center gap-3">
                            {libStatus.exists ? (
                                <>
                                    {/* Color-coded Instance Badges */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {(libStatus.instances && libStatus.instances.length > 0 ? libStatus.instances : [{ id: instanceId, name: instanceName }]).map((inst: any) => {
                                            const hex = inst.colorHex || '#10b981';
                                            return (
                                                <div 
                                                    key={inst.id}
                                                    className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border shadow-sm"
                                                    style={{ backgroundColor: `${hex}18`, borderColor: `${hex}40`, color: hex }}
                                                >
                                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                                                    <span>{inst.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="w-24 sm:w-28 h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                            <div 
                                                className={`h-full transition-all duration-1000 ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                style={{ width: `${pct}%` }} 
                                            />
                                        </div>
                                        <span className={`text-xs font-black tracking-wider ${pct === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {Math.round(pct)}%
                                        </span>
                                    </div>

                                    {/* Availability Badge */}
                                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${
                                        libStatus.hasFile ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                        libStatus.isDownloading ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                                        'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                    }`}>
                                        {libStatus.hasFile ? 'Available' : libStatus.isDownloading ? 'Downloading' : 'In Library'}
                                    </span>
                                </>
                            ) : (
                                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-zinc-900 border border-zinc-800 text-zinc-500">
                                    Not in Library
                                </span>
                            )}
                        </div>

                        {/* Bottom Line: Metadata */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 font-semibold">
                            {(item.year || item.release_date || item.first_air_date) && (
                                <span className="flex items-center gap-1">
                                    <Calendar size={13} className="text-zinc-600" />
                                    {item.year || item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0]}
                                </span>
                            )}
                            {sizeStr && <span className="flex items-center gap-1"><HardDrive size={13} className="text-zinc-600" /> {sizeStr}</span>}
                            {rating != null && <span className="text-amber-400 font-bold flex items-center gap-1">★ {Number(rating).toFixed(1)}</span>}
                            {libStatus.exists && path && (
                                <span className="flex items-center gap-1 truncate text-zinc-500 max-w-sm lg:max-w-md">
                                    <Monitor size={13} className="text-zinc-700 shrink-0" />
                                    <span className="truncate">{path}</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions Column */}
                    <div className="flex items-center gap-2 shrink-0">
                        {libStatus.exists ? (
                            <>
                                <button
                                    onClick={() => onInteractiveSearch({ type: isSeries ? 'series' : 'movie', id: libId, instanceId, title: item.title, poster })}
                                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all active:scale-95"
                                    title="Interactive Search"
                                >
                                    <Search size={16} />
                                </button>
                                <button
                                    onClick={() => onQuickSearch({ type: isSeries ? 'series' : 'movie', id: libId, instanceId })}
                                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-zinc-700 transition-all active:scale-95"
                                    title="Automatic Quick Search"
                                >
                                    <PlayCircle size={16} />
                                </button>
                                {isSeries && (
                                    <button
                                        onClick={() => setExpanded(!expanded)}
                                        className={`p-3 rounded-2xl border transition-all active:scale-95 ${expanded ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}
                                        title="View Episodes"
                                    >
                                        <Rows size={16} />
                                    </button>
                                )}
                                <button
                                    onClick={() => onTransfer(transferPayload)}
                                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all active:scale-95"
                                    title="Transfer / Copy Instance"
                                >
                                    <MoveHorizontal size={16} />
                                </button>
                                <button
                                    onClick={() => onDelete(deletePayload)}
                                    className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all active:scale-95"
                                    title="Delete from Library"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={onAdd}
                                disabled={isAdding}
                                className="px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 bg-white text-black hover:bg-emerald-400 shadow-xl disabled:opacity-50 active:scale-95"
                            >
                                {isAdding ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Plus size={16} />}
                                Add to Library
                            </button>
                        )}
                    </div>
                </div>

                {isSeries && expanded && libStatus.exists && (
                    <div className="px-6 pb-6 pt-2 border-t border-zinc-900/50 bg-black/20 animate-in slide-in-from-top duration-300">
                        <EpisodeList instanceId={instanceId} seriesId={libId} onInteractiveSearch={(ep) => onInteractiveSearch({ type: 'episode', id: ep.id, instanceId, title: `${item.title} - S${ep.seasonNumber}E${ep.episodeNumber}`, poster })} onQuickSearch={onQuickSearch} />
                    </div>
                )}
            </div>
        );
    }

    // ──────────────────────────────────────────────
    // GRID VIEW
    // ──────────────────────────────────────────────
    return (
        <div className="group flex flex-col bg-[#09090b] border border-zinc-900 hover:border-zinc-800 rounded-[2.2rem] overflow-hidden transition-all duration-500 shadow-2xl hover:-translate-y-1">
            <div className="relative aspect-[2/3] overflow-hidden cursor-pointer" onClick={onOpenDetails}>
                {poster ? (
                    <img src={poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(poster)}` : poster} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">
                        {isSeries ? <Tv size={48} /> : <Film size={48} />}
                    </div>
                )}

                {/* Progress Bar (Grid bottom of image) */}
                {libStatus.exists && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-900/80 backdrop-blur-sm z-10">
                        <div className={`h-full transition-all duration-1000 ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent opacity-90" />

                {/* Top Badges */}
                <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-30 pointer-events-none">
                    <div className="flex flex-col gap-1.5">
                        {platform && <span className={`w-fit px-2.5 py-1 rounded-lg text-[10px] font-black border backdrop-blur-sm ${platform.color}`}>{platform.label}</span>}
                        {rating != null && <span className="w-fit flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[10px] font-black text-amber-400">★ {Number(rating).toFixed(1)}</span>}
                    </div>

                    {!libStatus.exists && (
                        <div className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest backdrop-blur-sm">
                            Catalog
                        </div>
                    )}
                </div>

                {/* Poster Bottom Info */}
                <div className="absolute bottom-3 left-4 right-4 z-20 pointer-events-none">
                    <h3 className="text-base font-black text-white leading-tight line-clamp-2 drop-shadow-md">{item.title || item.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
                        {(item.year || item.release_date || item.first_air_date) && (
                            <span>{item.year || item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0]}</span>
                        )}
                        {libStatus.exists && (
                            <>
                                <span className="opacity-40">•</span>
                                <span className={pct === 100 ? 'text-emerald-400' : 'text-amber-400'}>{Math.round(pct)}%</span>
                            </>
                        )}
                        {sizeStr && <><span className="opacity-40">•</span><span className="text-zinc-400">{sizeStr}</span></>}
                    </div>
                </div>
            </div>

            {/* Below Image Action / Instance Section */}
            <div className="p-4 pt-3 flex flex-col gap-2 bg-[#09090b]">
                {libStatus.exists ? (
                    <div className="space-y-2">
                        {/* Instance Badges */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(libStatus.instances && libStatus.instances.length > 0 ? libStatus.instances : [{ id: instanceId, name: instanceName }]).map((inst: any) => {
                                const hex = inst.colorHex || '#10b981';
                                return (
                                    <div 
                                        key={inst.id}
                                        className="flex-1 min-w-0 py-1.5 px-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border truncate"
                                        style={{ backgroundColor: `${hex}18`, borderColor: `${hex}40`, color: hex }}
                                        title={`Added to ${inst.name}`}
                                    >
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                                        <span className="truncate">{inst.name}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {isSeries && (
                            <>
                                <button
                                    onClick={() => setExpanded(!expanded)}
                                    className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${expanded ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                                >
                                    <span className="flex items-center gap-1.5">
                                        <ListOrdered size={13} className={expanded ? 'text-emerald-500' : ''} />
                                        Episodes
                                    </span>
                                    {expanded ? <ChevronUp size={13} className="text-emerald-500" /> : <ChevronDown size={13} />}
                                </button>
                                {expanded && (
                                    <EpisodeList instanceId={instanceId} seriesId={libId} onInteractiveSearch={(ep) => onInteractiveSearch({ type: 'episode', id: ep.id, instanceId, title: `${item.title} - S${ep.seasonNumber}E${ep.episodeNumber}`, poster })} onQuickSearch={onQuickSearch} />
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={onAdd}
                        disabled={isAdding}
                        className="w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-emerald-400 shadow-md disabled:opacity-50 active:scale-95"
                    >
                        {isAdding ? <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Plus size={14} />}
                        Add to Library
                    </button>
                )}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// Main Media Page Component
// ──────────────────────────────────────────────
export default function DiscoverPage() {
    const [mediaType, setMediaType] = useState<'movie' | 'series' | 'music'>('movie');
    const [statusFilter, setStatusFilter] = useState<'all' | 'in_library' | 'not_in_library'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [libraryItems, setLibraryItems] = useState<any[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryMap, setLibraryMap] = useState<Map<string, { hasFile: boolean; isDownloading: boolean; percentage: number; sizeOnDisk: number; qualityProfileId?: number; instances: { id: string; name: string; colorHex?: string; internalId?: number }[] }>>(new Map());

    // Music Specific States
    const [musicResults, setMusicResults] = useState<any[]>([]);
    const [musicLoading, setMusicLoading] = useState(false);
    const [showMusicInspectorFor, setShowMusicInspectorFor] = useState<any>(null);

    const [instances, setInstances] = useState<Instance[]>([]);
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
    const [profiles, setProfiles] = useState<QualityProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number>(0);
    const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
    const [tmdbApiKey, setTmdbApiKey] = useState<string>('');
    const [showDetailsFor, setShowDetailsFor] = useState<any>(null);
    const [showPersonDetailsFor, setShowPersonDetailsFor] = useState<number | null>(null);

    const [addingItemStr, setAddingItemStr] = useState<string>('');
    const [showFilters, setShowFilters] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setShowFilters(false);
        }
    }, []);

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [currentPage, setCurrentPage] = useState(0);

    const [selectedItemForAdd, setSelectedItemForAdd] = useState<any>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAddingInModal, setIsAddingInModal] = useState(false);

    const [filterGenre, setFilterGenre] = useState<string>('All');
    const [filterPlatform, setFilterPlatform] = useState<string>('All');
    const [filterYear, setFilterYear] = useState<string>('All');
    const [filterRating, setFilterRating] = useState<number>(0);
    const [filterPopularity, setFilterPopularity] = useState<number>(0);
    const [sortBy, setSortBy] = useState<'popularity' | 'year' | 'alphabetical' | 'added' | 'size'>('popularity');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const [isTransferring, setIsTransferring] = useState(false);
    const [transferTarget, setTransferTarget] = useState<any>(null);
    const [expandAll, setExpandAll] = useState(false);
    const [excludeUnmonitored, setExcludeUnmonitored] = useState(true);

    const [localRating, setLocalRating] = useState<number>(filterRating);
    const [localPopularity, setLocalPopularity] = useState<number>(0);
    const [filterSize, setFilterSize] = useState<number>(0);
    const [localSize, setLocalSize] = useState<number>(0);

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<any>(null);
    const [itemToDeleteType, setItemToDeleteType] = useState<'movie' | 'series'>('movie');
    const [isDeleting, setIsDeleting] = useState(false);

    // Interactive Search State
    const [interactiveSearchItem, setInteractiveSearchItem] = useState<any | null>(null);
    const [interactiveReleases, setInteractiveReleases] = useState<any[]>([]);
    const [loadingReleases, setLoadingReleases] = useState(false);
    const [triggeringReleaseGuid, setTriggeringReleaseGuid] = useState<string | null>(null);
    const lastFetchParams = useRef<string>("");

    // Debounce rating/popularity changes
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localRating !== filterRating || localPopularity !== filterPopularity || localSize !== filterSize) {
                setFilterRating(localRating);
                setFilterPopularity(localPopularity);
                setFilterSize(localSize);
                setCurrentPage(0);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [localRating, filterRating, localPopularity, filterPopularity, localSize, filterSize]);

    const availableInstances = useMemo(() =>
        instances.filter((inst: Instance) =>
            inst.type === (mediaType === 'movie' ? 'radarr' : mediaType === 'series' ? 'sonarr' : 'lidarr')
        ), [instances, mediaType]);

    const handleMusicSearch = useCallback(async (queryText: string) => {
        if (!queryText.trim()) return;
        setMusicLoading(true);
        try {
            const instId = selectedInstanceIds[0] || (availableInstances[0] ? availableInstances[0].id : '');
            const url = `/api/lidarr/lookup?term=${encodeURIComponent(queryText.trim())}${instId ? `&instanceId=${instId}` : ''}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setMusicResults(Array.isArray(data.results) ? data.results : []);
            } else {
                setMusicResults([]);
            }
        } catch {
            setMusicResults([]);
        } finally {
            setMusicLoading(false);
        }
    }, [selectedInstanceIds, availableInstances]);

    // 1. Load Library
    const loadLibrary = useCallback(async () => {
        if (mediaType === 'music') {
            setLibraryLoading(true);
            try {
                const res = await fetch('/api/lidarr/all');
                if (res.ok) {
                    const data = await res.json();
                    setLibraryItems(Array.isArray(data.artists) ? data.artists : []);
                }
            } catch {
                setLibraryItems([]);
            } finally {
                setLibraryLoading(false);
            }
            return;
        }

        setLibraryLoading(true);
        try {
            const endpoint = mediaType === 'movie' ? '/api/radarr/all' : '/api/sonarr/all';
            const data = await fetch(endpoint).then(r => r.ok ? r.json() : []).catch(() => []);
            const items = Array.isArray(data) ? data : [];
            setLibraryItems(items);

            const map = new Map<string, { hasFile: boolean; isDownloading: boolean; percentage: number; sizeOnDisk: number; qualityProfileId?: number; instances: { id: string; name: string; colorHex?: string; internalId?: number }[] }>();

            items.forEach((m: any) => {
                const isSeries = !!(m.tvdbId || m.seasons);
                const type = isSeries ? 'series' : 'movie';

                const keys = [];
                if (m.tmdbId) keys.push(`${type}-tmdb-${m.tmdbId}`);
                if (m.tvdbId) keys.push(`${type}-tvdb-${m.tvdbId}`);

                const plainId = m.tmdbId || m.tvdbId;
                if (plainId) {
                    const legacyType = m.tvdbId ? 'series' : 'movie';
                    keys.push(`${legacyType}-${plainId}`);
                }

                keys.forEach(key => {
                    const existing = map.get(key);
                    const itemInstances = existing ? [...existing.instances] : [];
                    const instColor = m.colorHex || twColorToHex(m.instanceColor) || '#10b981';

                    if (!itemInstances.some((i: any) => i.id === m.instanceId)) {
                        itemInstances.push({
                            id: m.instanceId,
                            name: m.instanceName || 'Unknown',
                            colorHex: instColor,
                            internalId: m.id
                        });
                    }

                    const pct = Math.round(m.statistics?.percentOfEpisodes ?? (m.hasFile ? 100 : 0));
                    const currentSize = m.statistics?.sizeOnDisk || m.sizeOnDisk || m.movieFile?.size || 0;

                    map.set(key, {
                        hasFile: (existing?.hasFile || m.hasFile || (m.statistics?.percentOfEpisodes === 100)) ?? false,
                        isDownloading: (existing?.isDownloading || m.isDownloading || (m.queuedEpisodeIds?.length > 0)) ?? false,
                        instances: itemInstances,
                        percentage: Math.round(pct),
                        sizeOnDisk: Math.max(existing?.sizeOnDisk || 0, currentSize),
                        qualityProfileId: m.qualityProfileId
                    });
                });
            });
            setLibraryMap(map);
        } catch (error) {
            console.error('Error loading library:', error);
        } finally {
            setLibraryLoading(false);
        }
    }, [mediaType]);

    // 2. Load Catalog / Discovery
    const handleDiscovery = useCallback(async (pageNum: number = currentPage) => {
        if (mediaType === 'music') {
            handleMusicSearch(searchQuery || 'Top Hits');
            return;
        }
        if (availableInstances.length === 0) return;
        setIsSearching(true);
        let fetchedData: any[] = [];
        try {
            const base = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';
            const searchParams = new URLSearchParams({
                instanceId: selectedInstanceIds[0] || availableInstances[0].id,
                page: (pageNum + 1).toString()
            });

            if (filterPlatform !== 'All') searchParams.append('platform', filterPlatform);
            if (filterGenre !== 'All') searchParams.append('genre', filterGenre);
            if (filterRating > 0) searchParams.append('minRating', filterRating.toString());
            if (filterPopularity > 0) searchParams.append('minPopularity', filterPopularity.toString());
            if (filterYear !== 'All') searchParams.append('year', filterYear);

            const res = await fetch(`${base}/lookup?${searchParams.toString()}`);
            if (res.ok) {
                const data = await res.json();
                fetchedData = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('Discovery error:', e);
        } finally {
            setResults(fetchedData);
            setIsSearching(false);
        }
    }, [mediaType, selectedInstanceIds, availableInstances, currentPage, filterPlatform, filterGenre, filterRating, filterPopularity, filterYear, handleMusicSearch, searchQuery]);

    // 3. Search Handler
    const handleSearch = useCallback(async (query: string = searchQuery) => {
        if (mediaType === 'music') {
            handleMusicSearch(query);
            return;
        }
        if (!query.trim() || availableInstances.length === 0) {
            handleDiscovery(0);
            return;
        }
        setIsSearching(true);
        try {
            const base = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';
            const instId = selectedInstanceIds[0] || availableInstances[0].id;
            const res = await fetch(`${base}/lookup?instanceId=${instId}&term=${encodeURIComponent(query.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setResults(Array.isArray(data) ? data : (data.results || []));
            }
        } catch (e) {
            toast.error('Search failed');
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, availableInstances, mediaType, selectedInstanceIds, handleDiscovery, handleMusicSearch]);

    // Check if item is in library
    const isInLibrary = useCallback((item: any) => {
        const isSeries = item.type === 'series' || !!item.tvdbId || !!item.seasons;
        const type = isSeries ? 'series' : 'movie';

        const checkKeys = [];
        if (item.tmdbId) checkKeys.push(`${type}-tmdb-${item.tmdbId}`);
        if (item.tvdbId) checkKeys.push(`${type}-tvdb-${item.tvdbId}`);

        if (item.id && typeof item.id === 'number' && item.id > 0) {
            checkKeys.push(`${type}-tmdb-${item.id}`);
            checkKeys.push(`${type}-${item.id}`);
        }

        for (const key of checkKeys) {
            const status = libraryMap.get(key);
            if (status) return { exists: true, ...status };
        }

        // If item itself has instanceId and valid internal ID
        if (item.instanceId && typeof item.id === 'number' && item.id > 0) {
            const inst = instances.find(i => i.id === item.instanceId);
            return {
                exists: true,
                hasFile: item.hasFile ?? true,
                isDownloading: item.isDownloading ?? false,
                instances: [{ id: item.instanceId, name: item.instanceName || inst?.name || 'Instance', colorHex: item.colorHex || inst?.colorHex || '#10b981', internalId: item.id }],
                percentage: Math.round(item.statistics?.percentOfEpisodes ?? (item.hasFile ? 100 : 0)),
                sizeOnDisk: item.sizeOnDisk || item.statistics?.sizeOnDisk || item.movieFile?.size || 0
            };
        }

        return { exists: false, hasFile: false, isDownloading: false, instances: [], percentage: 0, sizeOnDisk: 0 };
    }, [libraryMap, instances]);

    // 4. Combined Unified Media Pool
    const unifiedPool = useMemo(() => {
        if (statusFilter === 'in_library') {
            return libraryItems;
        }

        if (statusFilter === 'not_in_library') {
            return results.filter(item => !isInLibrary(item).exists);
        }

        // statusFilter === 'all': Merge library items with catalog results
        const seenKeys = new Set<string>();
        const combined: any[] = [];

        libraryItems.forEach(item => {
            const key = item.tmdbId ? `tmdb-${item.tmdbId}` : item.tvdbId ? `tvdb-${item.tvdbId}` : `id-${item.id}`;
            seenKeys.add(key);
            combined.push(item);
        });

        results.forEach(item => {
            const key = item.tmdbId ? `tmdb-${item.tmdbId}` : item.tvdbId ? `tvdb-${item.tvdbId}` : `id-${item.id}`;
            if (!seenKeys.has(key) && !isInLibrary(item).exists) {
                seenKeys.add(key);
                combined.push(item);
            }
        });

        return combined;
    }, [statusFilter, libraryItems, results, isInLibrary]);

    // 5. Filter & Sort Unified Items
    const filteredItems = useMemo(() => {
        let items = [...unifiedPool];

        // Instance Filter
        if (selectedInstanceIds.length > 0 && selectedInstanceIds.length < availableInstances.length) {
            items = items.filter(i => {
                const libStatus = isInLibrary(i);
                if (libStatus.exists) {
                    return libStatus.instances.some(inst => selectedInstanceIds.includes(inst.id)) || selectedInstanceIds.includes(i.instanceId);
                }
                return statusFilter !== 'in_library';
            });
        }

        // Text Search Filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            items = items.filter(i =>
                (i.title && i.title.toLowerCase().includes(q)) ||
                (i.name && i.name.toLowerCase().includes(q)) ||
                (i.overview && i.overview.toLowerCase().includes(q))
            );
        }

        // Genre Filter
        if (filterGenre !== 'All') {
            const target = filterGenre.toLowerCase();
            items = items.filter(i => {
                const genres: string[] = (i.genres || []).map((g: any) => (typeof g === 'string' ? g : g?.name || '')).filter(Boolean);
                if (target === 'anime' || target === 'animation') {
                    return genres.some(g => {
                        const lowG = g.toLowerCase();
                        return lowG.includes('animation') || lowG.includes('anime');
                    });
                }
                if (target === 'sci-fi') {
                    return genres.some(g => {
                        const lowG = g.toLowerCase();
                        return lowG.includes('science fiction') || lowG.includes('sci-fi') || lowG.includes('scifi');
                    });
                }
                return genres.some(g => {
                    const lowG = g.toLowerCase();
                    return lowG.includes(target) || target.includes(lowG);
                });
            });
        }

        // Platform / Studio Filter
        if (filterPlatform !== 'All') {
            const platformLower = filterPlatform.toLowerCase();
            items = items.filter(i => {
                const companies: string[] = [
                    ...(Array.isArray(i.productionCompanies) ? i.productionCompanies.map((c: any) => typeof c === 'string' ? c : c?.name || '') : []),
                    i.studio,
                    i.network,
                    ...(Array.isArray(i.networks) ? i.networks.map((n: any) => typeof n === 'string' ? n : n?.name || '') : [])
                ].filter(Boolean).map(s => String(s).toLowerCase());
                return companies.some(c => c.includes(platformLower) || platformLower.includes(c) || (platformLower.includes('apple') && c.includes('apple')));
            });
        }

        // Year Filter
        if (filterYear !== 'All') {
            items = items.filter(i => (i.year?.toString() === filterYear) || (i.release_date?.startsWith(filterYear)) || (i.first_air_date?.startsWith(filterYear)));
        }

        // Rating Filter
        if (filterRating > 0) {
            items = items.filter(i => {
                const r = i.ratings?.value ?? i.vote_average ?? 0;
                return r >= filterRating;
            });
        }

        // Popularity Filter
        if (filterPopularity > 0) {
            items = items.filter(i => {
                const pop = i.popularity || i.ratings?.votes || i.ratings?.value || 0;
                return pop >= filterPopularity;
            });
        }

        // Size Filter
        if (filterSize > 0) {
            items = items.filter(i => {
                const sizeBytes = i.sizeOnDisk || i.statistics?.sizeOnDisk || i.movieFile?.size || 0;
                const sizeGB = sizeBytes / (1024 * 1024 * 1024);
                return sizeGB >= filterSize;
            });
        }

        // Sorting
        items.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'popularity') {
                const popA = a.popularity || a.ratings?.votes || a.ratings?.value || 0;
                const popB = b.popularity || b.ratings?.votes || b.ratings?.value || 0;
                comparison = popA - popB;
            } else if (sortBy === 'year') {
                const yA = a.year || (a.release_date ? parseInt(a.release_date.split('-')[0]) : 0) || 0;
                const yB = b.year || (b.release_date ? parseInt(b.release_date.split('-')[0]) : 0) || 0;
                comparison = yA - yB;
            } else if (sortBy === 'alphabetical') {
                comparison = (a.title || a.name || '').localeCompare(b.title || b.name || '');
            } else if (sortBy === 'added') {
                const dateA = a.added ? new Date(a.added).getTime() : 0;
                const dateB = b.added ? new Date(b.added).getTime() : 0;
                comparison = dateA - dateB;
            } else if (sortBy === 'size') {
                const sizeA = a.sizeOnDisk || a.statistics?.sizeOnDisk || a.movieFile?.size || 0;
                const sizeB = b.sizeOnDisk || b.statistics?.sizeOnDisk || b.movieFile?.size || 0;
                comparison = sizeA - sizeB;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return items;
    }, [unifiedPool, selectedInstanceIds, availableInstances.length, statusFilter, searchQuery, filterGenre, filterPlatform, filterYear, filterRating, filterPopularity, filterSize, sortBy, sortOrder, isInLibrary]);

    // Pagination
    const pageSize = 30;
    const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
    const pageItems = useMemo(() => {
        return filteredItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    }, [filteredItems, currentPage, pageSize]);

    // ── Load instances and config ──
    useEffect(() => {
        fetch('/api/instances').then(r => r.ok ? r.json() : []).then(data => {
            if (Array.isArray(data)) setInstances(data);
        });
        fetch('/api/settings').then(r => r.ok ? r.json() : {}).then((data: any) => {
            if (data.tmdb_api_key) setTmdbApiKey(data.tmdb_api_key);
        });
    }, []);

    // Sanitize selectedInstanceIds on availableInstances change
    useEffect(() => {
        if (availableInstances.length > 0) {
            const valid = selectedInstanceIds.filter(id => availableInstances.some(inst => inst.id === id));
            if (valid.length === 0) {
                setSelectedInstanceIds(availableInstances.map(i => i.id));
            } else if (valid.length !== selectedInstanceIds.length) {
                setSelectedInstanceIds(valid);
            }
        } else if (selectedInstanceIds.length > 0) {
            setSelectedInstanceIds([]);
        }
    }, [availableInstances, selectedInstanceIds]);

    // Load library on mediaType change
    useEffect(() => {
        loadLibrary();
    }, [loadLibrary]);

    // Load catalog discovery when statusFilter is all or not_in_library
    useEffect(() => {
        if (statusFilter !== 'in_library') {
            const currentParams = JSON.stringify({
                mediaType, filterPlatform, filterGenre, filterYear, filterRating,
                instance: selectedInstanceIds[0] || (availableInstances[0] ? availableInstances[0].id : null)
            });

            if (currentParams === lastFetchParams.current) return;
            lastFetchParams.current = currentParams;
            handleDiscovery(0);
        }
    }, [statusFilter, mediaType, filterPlatform, filterGenre, filterYear, filterRating, selectedInstanceIds, availableInstances, handleDiscovery]);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(0);
    }, [filterGenre, filterPlatform, filterYear, mediaType, statusFilter, searchQuery]);

    // ── Add Item Handlers ──
    const handleAdd = (item: any) => {
        setSelectedItemForAdd(item);
        setIsAddModalOpen(true);
    };

    const handleFinalAdd = async (payload: { item: any; targetInstanceId: string; qualityProfileId: number; rootFolderPath: string; startSearch: boolean }) => {
        const { item, targetInstanceId, qualityProfileId, rootFolderPath, startSearch: shouldSearch } = payload;
        const addKey = item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`;
        setAddingItemStr(addKey);
        setIsAddingInModal(true);

        try {
            const endpoint = mediaType === 'movie' ? '/api/radarr/add' : '/api/sonarr/add';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: targetInstanceId,
                    qualityProfileId,
                    rootFolderPath,
                    startSearch: shouldSearch,
                    item
                })
            });

            if (res.ok) {
                toast.success(`"${item.title || item.name}" added to library!`);
                setIsAddModalOpen(false);
                setSelectedItemForAdd(null);

                // Instantly register in local library map so UI updates to Added immediately
                const isSeries = mediaType === 'series';
                const type = isSeries ? 'series' : 'movie';
                const inst = instances.find(i => i.id === targetInstanceId);
                const newStatus = {
                    exists: true,
                    hasFile: false,
                    isDownloading: shouldSearch,
                    instances: [{ id: targetInstanceId, name: inst?.name || 'Instance', colorHex: inst?.colorHex || '#10b981' }],
                    percentage: 0,
                    sizeOnDisk: 0,
                    qualityProfileId
                };

                const keys: string[] = [];
                if (item.tmdbId) keys.push(`${type}-tmdb-${item.tmdbId}`);
                if (item.tvdbId) keys.push(`${type}-tvdb-${item.tvdbId}`);
                if (item.id) {
                    keys.push(`${type}-tmdb-${item.id}`);
                    keys.push(`${type}-${item.id}`);
                }

                setLibraryMap(prev => {
                    const next = new Map(prev);
                    keys.forEach(k => next.set(k, newStatus));
                    return next;
                });

                setLibraryItems(prev => [{ ...item, instanceId: targetInstanceId, hasFile: false }, ...prev]);

                loadLibrary();
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'Failed to add item to library');
            }
        } catch {
            toast.error('Error adding item');
        } finally {
            setAddingItemStr('');
            setIsAddingInModal(false);
        }
    };

    // ── Search & Transfer & Delete Handlers ──
    const handleQuickSearch = async (payload: { type: 'movie' | 'series' | 'season' | 'episode'; id: number; instanceId?: string; seasonNumber?: number }) => {
        let { type, id, instanceId, seasonNumber } = payload;

        if (!instanceId) {
            const arrType = type === 'movie' ? 'radarr' : 'sonarr';
            const matched = instances.find(inst => inst.type === arrType && inst.enabled);
            if (matched) instanceId = matched.id;
        }

        if (!instanceId) {
            toast.error(`No active ${type === 'movie' ? 'Radarr' : 'Sonarr'} instance found to trigger search.`);
            return;
        }

        if (!id || isNaN(Number(id))) {
            toast.error('Invalid media ID. Cannot trigger search.');
            return;
        }

        const numericId = Number(id);
        toast.info(`Triggering automatic search...`);
        try {
            let res;
            if (type === 'movie') {
                res = await fetch('/api/radarr/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceId,
                        name: 'MoviesSearch',
                        movieIds: [numericId]
                    })
                });
            } else if (type === 'series') {
                res = await fetch('/api/sonarr/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceId,
                        name: 'SeriesSearch',
                        seriesId: numericId
                    })
                });
            } else if (type === 'season') {
                res = await fetch('/api/sonarr/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceId,
                        name: 'SeasonSearch',
                        seriesId: numericId,
                        seasonNumber: Number(seasonNumber)
                    })
                });
            } else if (type === 'episode') {
                res = await fetch('/api/sonarr/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceId,
                        name: 'EpisodeSearch',
                        episodeIds: [numericId]
                    })
                });
            }

            if (res && res.ok) {
                toast.success('Search command triggered successfully');
            } else {
                const errData = await res?.json().catch(() => ({}));
                toast.error(errData?.error || 'Failed to trigger search command');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error triggering search command');
        }
    };

    const handleOpenInteractiveSearch = async (media: any) => {
        setInteractiveSearchItem(media);
        setInteractiveReleases([]);
        setLoadingReleases(true);
        try {
            let endpoint = '';
            if (media.type === 'movie') {
                endpoint = `/api/radarr/releases?movieId=${media.id}&instanceId=${media.instanceId}`;
            } else if (media.type === 'series') {
                endpoint = `/api/sonarr/releases?seriesId=${media.id}&instanceId=${media.instanceId}`;
            } else {
                endpoint = `/api/sonarr/releases?episodeId=${media.id}&instanceId=${media.instanceId}`;
            }
            const res = await fetch(endpoint);
            const data = await res.json();
            setInteractiveReleases(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error('Failed to load releases');
        } finally {
            setLoadingReleases(false);
        }
    };

    const handleTriggerDownload = async (guid: string, indexerId: number) => {
        if (!interactiveSearchItem) return;
        setTriggeringReleaseGuid(guid);
        try {
            const endpoint = interactiveSearchItem.type === 'movie' ? '/api/radarr/releases' : '/api/sonarr/releases';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guid,
                    indexerId,
                    instanceId: interactiveSearchItem.instanceId
                })
            });

            if (res.ok) {
                toast.success('Grabbed release successfully!');
                setInteractiveSearchItem(null);
                loadLibrary();
            } else {
                toast.error('Failed to grab release');
            }
        } catch {
            toast.error('Error triggering download');
        } finally {
            setTriggeringReleaseGuid(null);
        }
    };

    const handleDelete = useCallback(async (item: any) => {
        const isSeries = !!(item.tvdbId || item.seasons || item.type === 'series');
        setItemToDelete(item);
        setItemToDeleteType(isSeries ? 'series' : 'movie');
        setDeleteModalOpen(true);
    }, []);

    const handleFinalDelete = async (options: { deleteFiles: boolean; removeFromApp: boolean; deleteFilesOnly?: boolean }) => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            const base = itemToDeleteType === 'movie' ? '/api/radarr' : '/api/sonarr';
            if (options.deleteFilesOnly) {
                const res = await fetch(`${base}/file?instanceId=${itemToDelete.instanceId}&${itemToDeleteType === 'movie' ? 'movieId' : 'seriesId'}=${itemToDelete.id}`, { method: 'DELETE' });
                if (res.ok) toast.success('Media file deleted from disk');
                else toast.error('Failed to delete file from disk');
            } else {
                const res = await fetch(`${base}/delete?instanceId=${itemToDelete.instanceId}&id=${itemToDelete.id}&deleteFiles=${options.deleteFiles}`, { method: 'DELETE' });
                if (res.ok) {
                    toast.success('Media removed from library');
                    loadLibrary();
                } else {
                    toast.error('Failed to remove media');
                }
            }
        } catch {
            toast.error('Error executing delete');
        } finally {
            setIsDeleting(false);
            setDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    const handleTransfer = async (item: any, targetInstanceId: string, profileId: number, rootFolder: string, action: 'transfer' | 'copy', copyFiles: boolean) => {
        setIsTransferring(true);
        try {
            const res = await fetch('/api/media/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: mediaType === 'movie' ? 'movie' : 'series',
                    sourceInstanceId: item.instanceId,
                    targetInstanceId,
                    mediaId: item.id,
                    targetProfileId: profileId,
                    targetRootFolder: rootFolder,
                    copyFiles,
                    deleteFromSource: action === 'transfer'
                })
            });

            if (res.ok) {
                toast.success(`Successfully ${action === 'transfer' ? 'transferred' : 'copied'} "${item.title}"!`);
                setTransferTarget(null);
                loadLibrary();
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'Transfer operation failed');
            }
        } catch {
            toast.error('Failed to perform transfer');
        } finally {
            setIsTransferring(false);
        }
    };

    // Genre extraction
    const allAvailableGenres = useMemo(() => {
        const gs = new Set<string>();
        unifiedPool.forEach(i => {
            (i.genres || []).forEach((g: any) => {
                const name = typeof g === 'string' ? g : g?.name;
                if (name) gs.add(name);
            });
        });
        return ['All', ...Array.from(gs).sort()];
    }, [unifiedPool]);

    return (
        <>
            <Toaster position="top-right" theme="dark" richColors />
            <div className="space-y-6 pb-20">
                {/* ── Main Top Bar ── */}
                <div className="bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-2xl p-4 sm:p-5 rounded-[2.5rem] shadow-2xl space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                            {/* Page Title */}
                            <div className="flex items-center justify-between">
                                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2 mr-1">
                                    Media
                                </h1>
                            </div>

                            {/* Horizontally Scrollable Pills on Mobile */}
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                                {/* Media Type Toggle: Movies | Series | Music */}
                                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner shrink-0">
                                    <button 
                                        onClick={() => setMediaType('movie')} 
                                        className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-black rounded-xl transition-all ${mediaType === 'movie' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        <Film size={15} /> Movies
                                    </button>
                                    <button 
                                        onClick={() => setMediaType('series')} 
                                        className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-black rounded-xl transition-all ${mediaType === 'series' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        <Tv size={15} /> Series
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setMediaType('music');
                                            if (musicResults.length === 0) handleMusicSearch('Top Hits');
                                        }} 
                                        className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-black rounded-xl transition-all ${mediaType === 'music' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        <Disc size={15} /> Music
                                    </button>
                                </div>

                                {/* Status Filter: All | In Library | Not in Library */}
                                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner shrink-0">
                                    <button 
                                        onClick={() => setStatusFilter('all')} 
                                        className={`px-3 py-2 text-xs font-black rounded-xl transition-all ${statusFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        All ({mediaType === 'music' ? musicResults.length : unifiedPool.length})
                                    </button>
                                    <button 
                                        onClick={() => setStatusFilter('in_library')} 
                                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-black rounded-xl transition-all ${statusFilter === 'in_library' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        <CheckCircle size={13} className="text-emerald-500" /> In Library
                                    </button>
                                    <button 
                                        onClick={() => setStatusFilter('not_in_library')} 
                                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-black rounded-xl transition-all ${statusFilter === 'not_in_library' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        <Sparkles size={13} className="text-amber-500" /> Not in Library
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Search + Action Buttons (Fixed Right Alignment) */}
                        <div className="flex items-center gap-3">
                            <div className="relative w-full sm:w-72 md:w-80">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                <input
                                    type="text"
                                    placeholder={mediaType === 'movie' ? 'Search movies...' : mediaType === 'series' ? 'Search series...' : 'Search artists, albums, songs, labels...'}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all placeholder-zinc-600 font-medium"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Filters Toggle Button */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black rounded-2xl border transition-all shrink-0 ${
                                    showFilters
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                                }`}
                            >
                                <Filter size={14} />
                                <span>Filters</span>
                            </button>

                            {/* Refresh Cache */}
                            <button
                                onClick={() => loadLibrary()}
                                title="Refresh Media Cache"
                                className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
                            >
                                <RefreshCw size={16} className={libraryLoading ? 'animate-spin text-emerald-500' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* Instance Filter Pills (Dedicated Row below, consistent across both tabs) */}
                    {availableInstances.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-900/60">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mr-1">Instances:</span>
                            {availableInstances.map(inst => {
                                const isSelected = selectedInstanceIds.includes(inst.id);
                                const hex = inst.colorHex || '#3b82f6';
                                return (
                                    <button
                                        key={inst.id}
                                        onClick={() => {
                                            setSelectedInstanceIds(prev =>
                                                prev.includes(inst.id)
                                                    ? (prev.length > 1 ? prev.filter(id => id !== inst.id) : prev)
                                                    : [...prev, inst.id]
                                            );
                                        }}
                                        className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all whitespace-nowrap"
                                        style={isSelected ? { backgroundColor: `${hex}20`, borderColor: `${hex}50`, color: hex } : { borderColor: 'transparent', color: '#71717a' }}
                                    >
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                                        <span>{inst.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Collapsible Filters Bar ── */}
                {showFilters && (
                    <div className="p-6 bg-zinc-950/60 border border-zinc-900 rounded-[2rem] space-y-5 animate-in fade-in duration-200">
                        {mediaType === 'music' ? (
                            <>
                                {/* Music Quick Genres */}
                                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-900 pb-4">
                                    <span className="text-xs font-black text-amber-500 uppercase tracking-widest mr-2">Music Genres:</span>
                                    {['Pop', 'Rock', 'Electronic', 'Hip-Hop', 'Soundtrack', 'Classical', 'Jazz', 'Metal', 'Indie', 'Country', 'R&B', 'Reggae'].map(g => (
                                        <button
                                            key={g}
                                            onClick={() => {
                                                setSearchQuery(g);
                                                handleMusicSearch(g);
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                                searchQuery.toLowerCase() === g.toLowerCase()
                                                    ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                                                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'
                                            }`}
                                        >
                                            {g}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <CustomSelect
                                        label="Release Year"
                                        value={filterYear}
                                        onChange={setFilterYear}
                                        options={['All', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2015', '2010', '2000', '1990', '1980', '1970'].map(y => ({ id: y, name: y }))}
                                    />
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                            Search by Artist, Album or Record Label
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                placeholder="Filter by artist, record label, or album..."
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleMusicSearch(searchQuery)}
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white outline-none focus:border-amber-500 font-medium"
                                            />
                                            <button
                                                onClick={() => handleMusicSearch(searchQuery)}
                                                className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider shrink-0 transition-all active:scale-95"
                                            >
                                                Search
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Quick Studios */}
                                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-900 pb-4">
                                    <span className="text-xs font-black text-zinc-500 uppercase tracking-widest mr-2">Networks:</span>
                                    {QUICK_STUDIOS.map(s => (
                                        <button
                                            key={s.name}
                                            onClick={() => setFilterPlatform(filterPlatform === s.name ? 'All' : s.name)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                                filterPlatform === s.name
                                                    ? 'bg-white text-black border-white shadow-md'
                                                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                                            }`}
                                        >
                                            {s.name}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                                    <CustomSelect
                                        label="Genre"
                                        value={filterGenre}
                                        onChange={setFilterGenre}
                                        options={allAvailableGenres.map(g => ({ id: g, name: g }))}
                                    />
                                    <CustomSelect
                                        label="Network / Studio"
                                        value={filterPlatform}
                                        onChange={setFilterPlatform}
                                        options={['All', ...QUICK_STUDIOS.map(s => s.name)].map(p => ({ id: p, name: p }))}
                                    />
                                    <CustomSelect
                                        label="Release Year"
                                        value={filterYear}
                                        onChange={setFilterYear}
                                        options={['All', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2015', '2010', '2000'].map(y => ({ id: y, name: y }))}
                                    />

                                    {/* Min Rating */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider flex justify-between">
                                            <span>Min Rating</span>
                                            <span className="text-amber-400 font-bold">{localRating === 0 ? 'Any' : `★ ${localRating}`}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="9"
                                            step="1"
                                            value={localRating}
                                            onChange={e => setLocalRating(Number(e.target.value))}
                                            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                    </div>

                                    {/* Min Popularity */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider flex justify-between">
                                            <span>Popularity</span>
                                            <span className="text-emerald-400 font-bold">{localPopularity === 0 ? 'Any' : `${localPopularity}+`}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="500"
                                            step="25"
                                            value={localPopularity}
                                            onChange={e => setLocalPopularity(Number(e.target.value))}
                                            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                        />
                                    </div>

                                    {/* Min Size */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider flex justify-between">
                                            <span>Min Size (GB)</span>
                                            <span className="text-sky-400 font-bold">{localSize === 0 ? 'Any' : `${localSize} GB+`}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="50"
                                            step="2"
                                            value={localSize}
                                            onChange={e => setLocalSize(Number(e.target.value))}
                                            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── Sub-bar: Sort & Views ── */}
                <div className="flex flex-wrap items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white">
                            Showing <span className={`${mediaType === 'music' ? 'text-amber-400' : 'text-emerald-400'} font-black`}>
                                {mediaType === 'music' ? (statusFilter === 'in_library' ? libraryItems.length : musicResults.length) : filteredItems.length}
                            </span> {mediaType === 'music' ? 'albums & releases' : mediaType === 'movie' ? 'movies' : 'series'}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Sort Options */}
                        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800/80">
                            {[
                                { id: 'popularity', label: 'Popularity', icon: <TrendingUp size={13} /> },
                                { id: 'year', label: 'Year', icon: <Calendar size={13} /> },
                                { id: 'alphabetical', label: 'A-Z', icon: <Rows size={13} /> },
                                { id: 'added', label: 'Date Added', icon: <Calendar size={13} /> },
                                { id: 'size', label: 'Size', icon: <HardDrive size={13} /> }
                            ].map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setSortBy(s.id as any)}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                        sortBy === s.id
                                            ? 'bg-zinc-800 text-white shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    {s.icon} {s.label}
                                </button>
                            ))}
                        </div>

                        {/* Sort Order */}
                        <button
                            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                            className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white transition-all"
                            title={sortOrder === 'desc' ? 'Descending' : 'Ascending'}
                        >
                            <div className={`transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}>
                                <ChevronDown size={16} />
                            </div>
                        </button>

                        {/* View Mode Toggle: Grid | List */}
                        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800/80">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                title="Grid View"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                title="List View"
                            >
                                <Rows size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Content Grid / List ── */}
                {mediaType === 'music' ? (
                    musicLoading || libraryLoading ? (
                        <div className="flex flex-col items-center justify-center py-40 gap-3">
                            <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Loading Music Releases...</p>
                        </div>
                    ) : (statusFilter === 'in_library' ? libraryItems : musicResults).length > 0 ? (
                        <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6' : 'space-y-4'}>
                            {(statusFilter === 'in_library' ? libraryItems : musicResults).map((album, idx) => {
                                const poster = album.posterUrl || album.remotePoster || album.images?.find((i: any) => i.coverType === 'cover')?.url || album.images?.[0]?.url;
                                const artist = album.artistName || album.artist?.artistName || album.title;
                                const albumName = album.albumTitle || album.title || album.artistName;
                                const year = album.year || (album.releaseDate ? new Date(album.releaseDate).getFullYear() : '');
                                const recordLabel = album.recordLabel || album.copyright || album.disambiguation || 'Independent';

                                if (viewMode === 'list') {
                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => setShowMusicInspectorFor(album)}
                                            className="flex items-center justify-between p-4 bg-zinc-950/70 border border-zinc-900 hover:border-amber-500/40 rounded-3xl hover:bg-zinc-900/50 transition-all cursor-pointer group shadow-xl gap-4"
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                {/* CD Art */}
                                                <div className="relative w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 shadow group-hover:scale-105 transition-transform">
                                                    {poster ? (
                                                        <img src={poster} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Disc size={28} />
                                                    )}
                                                </div>

                                                <div className="min-w-0 space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-white text-base sm:text-lg truncate group-hover:text-amber-400 transition-colors">
                                                            {albumName}
                                                        </h3>
                                                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase tracking-wider shrink-0">
                                                            {statusFilter === 'in_library' ? 'In Lidarr' : 'Release'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 font-medium">
                                                        <span className="text-amber-300 font-bold">{artist}</span>
                                                        {year && <span>• {year}</span>}
                                                        {album.trackCount && <span>• {album.trackCount} Tracks</span>}
                                                        <span className="text-zinc-600 truncate">• {recordLabel}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <button className="px-4 py-2 rounded-xl bg-amber-500/10 group-hover:bg-amber-500 text-amber-400 group-hover:text-black border border-amber-500/20 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0">
                                                <Disc size={14} /> Inspect CD
                                            </button>
                                        </div>
                                    );
                                }

                                // 3D Vinyl / CD Album Disc Card
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => setShowMusicInspectorFor(album)}
                                        className="group flex flex-col bg-[#09090b] border border-zinc-900 hover:border-amber-500/50 rounded-3xl overflow-hidden transition-all duration-300 shadow-xl cursor-pointer hover:-translate-y-1.5"
                                    >
                                        <div className="relative aspect-square bg-zinc-900 overflow-hidden flex items-center justify-center p-3">
                                            {/* Vinyl Disc Preview Coming Out on Hover */}
                                            <div className="absolute top-3 right-3 w-32 h-32 rounded-full bg-gradient-to-tr from-zinc-950 via-zinc-900 to-black border-2 border-zinc-800 shadow-xl flex items-center justify-center translate-x-4 opacity-70 group-hover:translate-x-8 group-hover:opacity-100 transition-all duration-500">
                                                <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                                                    <div className="w-3 h-3 rounded-full bg-zinc-950" />
                                                </div>
                                            </div>

                                            {/* Front Cover Artwork */}
                                            <div className="relative w-full h-full rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-2xl z-10 flex items-center justify-center">
                                                {poster ? (
                                                    <img src={poster} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                                ) : (
                                                    <Disc size={48} className="text-amber-400 group-hover:rotate-45 transition-transform duration-500" />
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                                    <span className="text-[10px] font-black uppercase text-amber-400 flex items-center gap-1">
                                                        <Sparkles size={11} /> Click to Inspect
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 space-y-1.5">
                                            <h3 className="font-bold text-white text-base leading-snug line-clamp-1 group-hover:text-amber-400 transition-colors">
                                                {albumName}
                                            </h3>
                                            <p className="text-xs font-bold text-amber-300 truncate">
                                                {artist}
                                            </p>
                                            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold pt-1 border-t border-zinc-900">
                                                <span>{year || 'Music'}</span>
                                                <span className="truncate max-w-[100px]">{recordLabel}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-40 bg-zinc-950/20 rounded-[3rem] border border-zinc-900/50 gap-4">
                            <div className="p-6 bg-zinc-900/50 rounded-full text-amber-400/40"><Disc size={48} /></div>
                            <p className="text-xl font-bold text-white">
                                {statusFilter === 'in_library' ? 'No Music In Lidarr Library Yet' : 'No music found'}
                            </p>
                            <p className="text-xs text-zinc-500 font-medium">
                                {statusFilter === 'in_library' 
                                    ? 'Switch to "All" or search an artist above to add albums to Lidarr.'
                                    : 'Search for an artist (e.g. Daft Punk, Queen, Hans Zimmer) or album above.'}
                            </p>
                        </div>
                    )
                ) : libraryLoading && libraryItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-3">
                        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Loading Library...</p>
                    </div>
                ) : pageItems.length > 0 ? (
                    <>
                        <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6' : 'space-y-4'}>
                            {pageItems.map((item, idx) => {
                                const libStatus = isInLibrary(item);
                                const key = item.tmdbId ? `tmdb-${item.tmdbId}-${idx}` : item.tvdbId ? `tvdb-${item.tvdbId}-${idx}` : `item-${item.id}-${idx}`;
                                return (
                                    <UnifiedMediaCard
                                        key={key}
                                        item={item}
                                        viewMode={viewMode}
                                        libStatus={libStatus}
                                        isAdding={addingItemStr === (item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`)}
                                        onAdd={() => handleAdd(item)}
                                        onDelete={handleDelete}
                                        onTransfer={setTransferTarget}
                                        onInteractiveSearch={handleOpenInteractiveSearch}
                                        onQuickSearch={handleQuickSearch}
                                        onOpenDetails={() => setShowDetailsFor(item)}
                                        expandAll={expandAll}
                                        excludeUnmonitored={excludeUnmonitored}
                                    />
                                );
                            })}
                        </div>

                        {/* Pagination Bar */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 pt-8">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))} 
                                    disabled={currentPage === 0} 
                                    className="px-6 py-3 rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-300 text-xs font-black uppercase tracking-widest hover:border-zinc-700 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                                >
                                    ← Prev
                                </button>
                                <span className="text-zinc-500 text-xs font-bold">Page {currentPage + 1} of {totalPages}</span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} 
                                    disabled={currentPage >= totalPages - 1} 
                                    className="px-6 py-3 rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-300 text-xs font-black uppercase tracking-widest hover:border-zinc-700 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-40 bg-zinc-950/20 rounded-[3rem] border border-zinc-900/50 gap-4">
                        <div className="p-6 bg-zinc-900/50 rounded-full text-zinc-700"><Search size={48} /></div>
                        <p className="text-xl font-bold text-white">No media found</p>
                        <p className="text-xs text-zinc-500 font-medium">Try adjusting your search query, status, or filters.</p>
                    </div>
                )}
            </div>

            {/* ── Modals & Overlays ── */}
            {isAddModalOpen && selectedItemForAdd && (
                <AddMediaModal
                    item={selectedItemForAdd}
                    mediaType={mediaType}
                    instances={instances}
                    onAdd={handleFinalAdd}
                    onClose={() => setIsAddModalOpen(false)}
                    loading={isAddingInModal}
                />
            )}

            {transferTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative">
                        <button onClick={() => setTransferTarget(null)} className="absolute top-6 right-6 p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"><X size={20} /></button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><MoveHorizontal size={24} /></div>
                            <div><h2 className="text-xl font-black text-white">Transfer Media</h2><p className="text-sm text-zinc-500 font-bold">{transferTarget.title}</p></div>
                        </div>
                        <TransferForm
                            item={transferTarget}
                            instances={instances}
                            targetType={mediaType === 'movie' ? 'radarr' : 'sonarr'}
                            onTransfer={handleTransfer}
                            onCancel={() => setTransferTarget(null)}
                            loading={isTransferring}
                        />
                    </div>
                </div>
            )}

            {showDetailsFor && (
                <MediaDetailsPanel
                    item={showDetailsFor}
                    tmdbApiKey={tmdbApiKey}
                    libStatus={isInLibrary(showDetailsFor)}
                    onClose={() => setShowDetailsFor(null)}
                    onAdd={() => handleAdd(showDetailsFor)}
                    onDelete={handleDelete}
                    onTransfer={setTransferTarget}
                    onInteractiveSearch={handleOpenInteractiveSearch}
                    onQuickSearch={handleQuickSearch}
                    onSelectPerson={(pid: number) => setShowPersonDetailsFor(pid)}
                    onSelectRecommended={(rec: any) => setShowDetailsFor(rec)}
                />
            )}

            {showPersonDetailsFor && tmdbApiKey && (
                <PersonDetailsPanel
                    personId={showPersonDetailsFor}
                    tmdbApiKey={tmdbApiKey}
                    onClose={() => setShowPersonDetailsFor(null)}
                    onSelectMedia={(media: any) => {
                        setShowDetailsFor(media);
                        setShowPersonDetailsFor(null);
                    }}
                />
            )}

            <InteractiveSearchModal
                isOpen={!!interactiveSearchItem}
                onClose={() => setInteractiveSearchItem(null)}
                item={interactiveSearchItem}
                releases={interactiveReleases}
                isLoading={loadingReleases}
                triggeringReleaseGuid={triggeringReleaseGuid}
                onTriggerDownload={handleTriggerDownload}
            />

            <DeleteMediaModal
                isOpen={deleteModalOpen}
                item={itemToDelete ? {
                    id: itemToDelete.id,
                    instanceId: itemToDelete.instanceId,
                    title: itemToDelete.title || 'Unknown',
                    type: itemToDeleteType,
                    path: itemToDelete.path,
                } : null}
                onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
                onConfirm={handleFinalDelete}
                loading={isDeleting}
            />

            {showMusicInspectorFor && (
                <MusicInspectorModal
                    album={showMusicInspectorFor}
                    onClose={() => setShowMusicInspectorFor(null)}
                    onSelectArtist={(artist) => {
                        setSearchQuery(artist);
                        handleMusicSearch(artist);
                    }}
                    onSelectLabel={(label) => {
                        setSearchQuery(label);
                        handleMusicSearch(label);
                    }}
                    onInteractiveSearch={handleOpenInteractiveSearch}
                />
            )}
        </>
    );
}

function TransferForm({ item, instances, targetType, onTransfer, onCancel, loading }: any) {
    const [targetInstanceId, setTargetInstanceId] = useState('');
    const [targetProfiles, setTargetProfiles] = useState<any[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
    const [rootFolders, setRootFolders] = useState<any[]>([]);
    const [targetRootFolder, setTargetRootFolder] = useState('');
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [action, setAction] = useState<'transfer' | 'copy'>('transfer');
    const [copyFiles, setCopyFiles] = useState(true);
    const [sourceProfiles, setSourceProfiles] = useState<any[]>([]);

    useEffect(() => {
        fetch(`/api/profiles?instanceId=${item.instanceId}`).then(r => r.json()).then(d => setSourceProfiles(Array.isArray(d) ? d : [])).catch(() => { });
    }, [item.instanceId]);

    useEffect(() => {
        if (targetInstanceId) {
            setLoadingConfig(true);
            const base = targetType === 'radarr' ? '/api/radarr' : '/api/sonarr';
            Promise.all([
                fetch(`/api/profiles?instanceId=${targetInstanceId}`).then(r => r.json()),
                fetch(`${base}/rootfolder?instanceId=${targetInstanceId}`).then(r => r.json())
            ]).then(([pData, rData]) => {
                const profiles = Array.isArray(pData) ? pData : [];
                const folders = Array.isArray(rData) ? rData : [];
                setTargetProfiles(profiles);
                setRootFolders(folders);

                const sourceProfile = sourceProfiles.find(p => p.id === item.qualityProfileId);
                const matchingTarget = sourceProfile ? profiles.find((p: any) => p.name === sourceProfile.name) : null;

                if (matchingTarget) setSelectedProfileId(matchingTarget.id);
                else if (profiles.length > 0) setSelectedProfileId(profiles[0].id);

                if (folders.length > 0) setTargetRootFolder(folders[0].path);
            }).catch(e => console.error('Failed to load target config', e)).finally(() => setLoadingConfig(false));
        }
    }, [targetInstanceId, targetType, sourceProfiles, item.qualityProfileId]);

    const canSubmit = targetInstanceId && selectedProfileId && targetRootFolder && !loading;

    return (
        <div className="space-y-6">
            <div className="space-y-5">
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Select Action</label>
                    <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
                        <button
                            onClick={() => setAction('transfer')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${action === 'transfer' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-400'}`}
                        >
                            <MoveHorizontal size={14} /> Transfer (Move)
                        </button>
                        <button
                            onClick={() => setAction('copy')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${action === 'copy' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-400'}`}
                        >
                            <Copy size={14} /> Copy (Keep Original)
                        </button>
                    </div>
                </div>

                <CustomSelect
                    label="Target Instance"
                    value={targetInstanceId}
                    onChange={setTargetInstanceId}
                    options={instances
                        .filter((i: any) => i.type === targetType && i.id !== item.instanceId)
                        .map((i: any) => ({ id: i.id, name: i.name }))
                    }
                />

                {targetInstanceId && (
                    <>
                        <div className="relative">
                            {loadingConfig && <div className="absolute right-3 top-3 z-10"><div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>}
                            <CustomSelect label="Quality Profile" value={selectedProfileId || ''} onChange={(v) => setSelectedProfileId(Number(v))} options={targetProfiles.map((p: any) => ({ id: p.id.toString(), name: p.name }))} />
                        </div>
                        <CustomSelect label="Root Folder" value={targetRootFolder} onChange={setTargetRootFolder} options={rootFolders.map(rf => ({ id: rf.path, name: rf.path }))} />
                    </>
                )}

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">File Management</label>
                    <button
                        onClick={() => setCopyFiles(!copyFiles)}
                        className={`h-12 px-5 rounded-2xl border flex items-center gap-3 transition-all text-xs font-black uppercase tracking-wider ${copyFiles ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${copyFiles ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-700'}`} />
                        {action === 'transfer' ? 'Move Physical Files' : 'Copy Physical Files'}
                    </button>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border text-xs font-bold leading-relaxed ${action === 'transfer' ? 'bg-amber-500/5 border-amber-500/10 text-amber-500/80' : 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400/80'}`}>
                {action === 'transfer'
                    ? "Note: Item will be ADDED to the target and REMOVED from the source (including files if selected)."
                    : "Note: Item will be CLONED to the target instance. Original will remain untouched."
                }
            </div>

            <div className="flex gap-3 pt-2">
                <button onClick={onCancel} className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all">Cancel</button>
                <button
                    disabled={!canSubmit}
                    onClick={() => onTransfer(item, targetInstanceId, selectedProfileId, targetRootFolder, action, copyFiles)}
                    className={`flex-[2] h-12 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest rounded-2xl transition-all ${canSubmit ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                >
                    {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : (action === 'transfer' ? <MoveHorizontal size={14} /> : <Copy size={14} />)}
                    {loading ? (action === 'transfer' ? 'Transferring...' : 'Copying...') : `Confirm ${action === 'transfer' ? 'Transfer' : 'Copy'}`}
                </button>
            </div>
        </div>
    );
}

function AddMediaModal({ item, mediaType, instances, onAdd, onClose, loading }: any) {
    const [targetInstanceId, setTargetInstanceId] = useState('');
    const [profiles, setProfiles] = useState<any[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
    const [rootFolders, setRootFolders] = useState<any[]>([]);
    const [selectedRootFolderPath, setSelectedRootFolderPath] = useState('');
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [startSearch, setStartSearch] = useState(true);

    const availableInstances = instances.filter((i: any) => i.type === (mediaType === 'movie' ? 'radarr' : 'sonarr'));

    useEffect(() => {
        if (availableInstances.length > 0) {
            setTargetInstanceId(availableInstances[0].id);
        }
    }, [availableInstances]);

    useEffect(() => {
        if (targetInstanceId) {
            setLoadingConfig(true);
            const base = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';
            Promise.all([
                fetch(`/api/instances/profiles?instanceId=${targetInstanceId}`).then(r => r.json()),
                fetch(`${base}/rootfolder?instanceId=${targetInstanceId}`).then(r => r.json())
            ]).then(([pData, rData]) => {
                const profiles = Array.isArray(pData) ? pData : [];
                const folders = Array.isArray(rData) ? rData : [];
                setProfiles(profiles);
                setRootFolders(folders);
                if (profiles.length > 0) setSelectedProfileId(profiles[0].id);
                if (folders.length > 0) setSelectedRootFolderPath(folders[0].path);
            }).catch(e => console.error('Failed to load instance config', e)).finally(() => setLoadingConfig(false));
        }
    }, [targetInstanceId, mediaType]);

    const canSubmit = targetInstanceId && selectedProfileId && selectedRootFolderPath && !loading;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">
                    <X size={20} />
                </button>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        {mediaType === 'movie' ? <Film size={24} /> : <Tv size={24} />}
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white">Add to Library</h2>
                        <p className="text-sm text-zinc-500 font-bold">{item.title || item.name}</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <CustomSelect
                        label="Destination Instance"
                        value={targetInstanceId}
                        onChange={setTargetInstanceId}
                        options={availableInstances.map((i: any) => ({ id: i.id, name: i.name }))}
                    />

                    {targetInstanceId && (
                        <>
                            <div className="relative">
                                {loadingConfig && <div className="absolute right-3 top-3 z-10"><div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /></div>}
                                <CustomSelect label="Quality Profile" value={selectedProfileId || ''} onChange={(v) => setSelectedProfileId(Number(v))} options={profiles.map((p: any) => ({ id: p.id.toString(), name: p.name }))} />
                            </div>
                            <CustomSelect label="Root Folder" value={selectedRootFolderPath} onChange={setSelectedRootFolderPath} options={rootFolders.map(rf => ({ id: rf.path, name: rf.path }))} />
                        </>
                    )}

                    <button
                        onClick={() => setStartSearch(!startSearch)}
                        className={`w-full h-12 px-5 rounded-2xl border flex items-center gap-3 transition-all text-xs font-black uppercase tracking-wider ${startSearch ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${startSearch ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
                        Start Search Immediately
                    </button>
                </div>

                <div className="flex gap-3 pt-6">
                    <button onClick={onClose} className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all">Cancel</button>
                    <button
                        disabled={!canSubmit}
                        onClick={() => onAdd({
                            item,
                            targetInstanceId,
                            qualityProfileId: selectedProfileId!,
                            rootFolderPath: selectedRootFolderPath,
                            startSearch
                        })}
                        className={`flex-[2] h-12 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest rounded-2xl transition-all ${canSubmit ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                    >
                        {loading ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Plus size={16} />}
                        {loading ? 'Adding...' : 'Confirm & Add'}
                    </button>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, Plus, Film, Tv, CheckCircle,
    Filter, X, Star, Calendar,
    LayoutGrid, List as Rows, Sparkles, TrendingUp,
    ChevronDown, Tags, Monitor, ChevronRight,
    HardDrive, Percent, PlayCircle, ChevronUp,
    PlaySquare, Square, Trash2, MoveHorizontal, MoreVertical,
    CheckCircle2, Copy, ListOrdered
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';
import { twColorToHex } from '@/lib/instanceColor';
import { SchedulerQueuePanel } from '@/components/SchedulerQueuePanel';
import { MediaDetailsPanel } from '@/components/MediaDetailsPanel';
import { PersonDetailsPanel } from '@/components/PersonDetailsPanel';
import { InteractiveSearchModal } from '@/components/InteractiveSearchModal';

interface Instance {
    id: string;
    name: string;
    type: 'radarr' | 'sonarr';
    color?: string;
    colorHex?: string;
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
    if (item.studio) return { label: item.studio, color: 'bg-zinc-900 text-zinc-500 border-zinc-800' };
    if (item.network) return { label: item.network, color: 'bg-zinc-900 text-zinc-500 border-zinc-800' };
    return null;
}

// ──────────────────────────────────────────────
// My Media Episode Row
// ──────────────────────────────────────────────
function EpisodeList({ instanceId, seriesId, onInteractiveSearch }: { instanceId: string; seriesId: number; onInteractiveSearch?: (ep: any) => void }) {
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
    const [searchingEpId, setSearchingEpId] = useState<number | null>(null);

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

    const handleAutoSearch = async (ep: any) => {
        setSearchingEpId(ep.id);
        try {
            const res = await fetch('/api/sonarr/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId,
                    name: 'EpisodeSearch',
                    episodeIds: [ep.id]
                })
            });
            if (res.ok) {
                toast.success(`Search triggered for S${ep.seasonNumber}E${ep.episodeNumber}`);
            } else {
                toast.error('Failed to trigger search');
            }
        } catch (e) {
            toast.error('Error triggering search');
        } finally {
            setSearchingEpId(null);
        }
    };

    if (loading) return <div className="flex items-center gap-2 py-4 text-zinc-600 text-xs"><div className="w-3 h-3 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" /> Loading episodes...</div>;

    const seasons = [...new Set(episodes.map(e => e.seasonNumber))].sort((a, b) => b - a);
    const seasonEps = episodes.filter(e => e.seasonNumber === selectedSeason);
    const haveCount = seasonEps.filter(e => e.hasFile).length;

    return (
        <div className="mt-3 space-y-4">
            {/* Season Tabs */}
            <div className="flex flex-wrap gap-1.5">
                {seasons.map(s => (
                    <button
                        key={s}
                        onClick={() => setSelectedSeason(s)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${selectedSeason === s ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-zinc-800 text-zinc-600 hover:text-zinc-400'}`}
                    >
                        {s === 0 ? 'Specials' : `S${s}`}
                    </button>
                ))}
            </div>

            {/* Season Summary */}
            <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-medium px-1">
                <span className="text-emerald-500 font-bold">{haveCount}/{seasonEps.length}</span> episodes available
            </div>

            {/* Episode List */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                {seasonEps.map(ep => (
                    <div key={ep.id} className={`group/ep flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${ep.hasFile ? 'border-zinc-800 bg-zinc-950/30' : 'border-zinc-900/50 hover:bg-zinc-900/20'}`}>
                        <span className={`text-[10px] font-black w-8 flex-shrink-0 ${ep.hasFile ? 'text-emerald-500' : 'text-zinc-700'}`}>
                            E{String(ep.episodeNumber).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0 flex flex-col">
                            <span className={`text-xs truncate ${ep.hasFile ? 'text-zinc-300 font-medium' : 'text-zinc-600'}`}>{ep.title}</span>
                            {ep.hasFile && ep.episodeFile?.quality?.quality?.name && (
                                <span className="text-[9px] font-bold text-zinc-600 mt-0.5 uppercase tracking-tighter">
                                    {ep.episodeFile.quality.quality.name}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 opacity-0 group-hover/ep:opacity-100 transition-opacity">
                            <button
                                onClick={() => onInteractiveSearch?.(ep)}
                                title="Interactive Search"
                                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                            >
                                <Search size={12} />
                            </button>
                            <button
                                onClick={() => handleAutoSearch(ep)}
                                disabled={searchingEpId === ep.id}
                                title="Automatic Search"
                                className={`p-1.5 rounded-lg border transition-all ${searchingEpId === ep.id ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-emerald-400'}`}
                            >
                                {searchingEpId === ep.id ? <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" /> : <PlayCircle size={12} />}
                            </button>
                        </div>

                        {!ep.hasFile && <span className="text-[9px] text-zinc-700 font-black tracking-widest uppercase flex-shrink-0">Missing</span>}
                        {ep.hasFile && <CheckCircle size={10} className="text-emerald-500/50 flex-shrink-0" />}
                    </div>
                ))}
            </div>
        </div>
    );
}


// ──────────────────────────────────────────────
// My Media Card Components
// ──────────────────────────────────────────────
function MyMediaGridCard({ item, isSeries, expandAll, excludeUnmonitored, onDelete, onTransfer, onInteractiveSearch }: {
    item: any; isSeries: boolean; expandAll: boolean; excludeUnmonitored: boolean; onDelete: () => void; onTransfer: () => void; onInteractiveSearch?: (payload: any) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setExpanded(expandAll);
    }, [expandAll]);

    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || item.remotePoster;
    const totalEps = item.statistics?.totalEpisodeCount || 0;
    const haveEps = item.statistics?.episodeFileCount || 0;
    const denominator = excludeUnmonitored ? (item.statistics?.episodeCount || totalEps) : totalEps;
    const pct = isSeries ? (denominator > 0 ? Math.min(100, Math.round((haveEps / denominator) * 100)) : 0) : (item.hasFile ? 100 : 0);

    return (
        <div className="group flex flex-col bg-[#090909] border border-zinc-900 hover:border-zinc-800 rounded-[2.5rem] overflow-hidden transition-all duration-300 shadow-xl hover:-translate-y-1">
            <div className="relative aspect-[2/3] overflow-hidden">
                {poster
                    ? <img src={poster} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    : <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">{isSeries ? <Tv size={48} /> : <Film size={48} />}</div>}

                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-900/80 backdrop-blur-sm z-10">
                    <div className={`h-full transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.3)] ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent opacity-90" />
                <div className="absolute top-4 left-4 right-4 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-10px] group-hover:translate-y-0 z-20">
                    <div className="flex gap-1.5 ml-auto">
                        {!isSeries && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onInteractiveSearch?.({ type: 'movie', id: item.id, instanceId: item.instanceId, title: item.title, poster }); }}
                                className="p-2.5 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                            >
                                <Search size={14} />
                            </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onTransfer(); }} className="p-2.5 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all">
                            <MoveHorizontal size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2.5 rounded-xl bg-red-500/10 backdrop-blur-xl border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                <div className="absolute bottom-4 left-5 right-5 z-20">
                    <h3 className="text-base font-black text-white leading-tight line-clamp-2 drop-shadow-lg">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-400 font-bold uppercase tracking-widest opacity-80">
                        {item.year && <span>{item.year}</span>}
                        <span className="opacity-40">•</span>
                        <span className={pct === 100 ? 'text-emerald-400' : 'text-amber-400'}>{pct}%</span>
                        <span className="opacity-30">•</span>
                        <span className="truncate text-zinc-500">{item.instanceName}</span>
                    </div>
                </div>
            </div>

            {isSeries && (
                <div className="px-4 pb-4">
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className={`w-full flex items-center justify-between py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${expanded ? 'bg-zinc-900 text-zinc-300' : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/30'}`}
                    >
                        <span className="flex items-center gap-2">
                            <ListOrdered size={12} className={expanded ? 'text-emerald-500' : ''} />
                            {item.statistics?.episodeCount || 0} Episodes
                        </span>
                        {expanded ? <ChevronUp size={12} className="text-emerald-500" /> : <ChevronDown size={12} />}
                    </button>
                    {expanded && <EpisodeList instanceId={item.instanceId} seriesId={item.id} onInteractiveSearch={(ep) => onInteractiveSearch?.({ type: 'episode', id: ep.id, instanceId: item.instanceId, title: `${item.title} - S${ep.seasonNumber}E${ep.episodeNumber}`, poster })} />}
                </div>
            )}
        </div>
    );
}

function MyMediaListCard({ item, isSeries, expandAll, excludeUnmonitored, onDelete, onTransfer, onInteractiveSearch }: {
    item: any; isSeries: boolean; expandAll: boolean; excludeUnmonitored: boolean; onDelete: () => void; onTransfer: () => void; onInteractiveSearch?: (payload: any) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setExpanded(expandAll);
    }, [expandAll]);

    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || item.remotePoster;
    const sizeMb = item.statistics?.sizeOnDisk || (item.movieFile?.size || 0);
    const sizeStr = sizeMb > 1e12 ? `${(sizeMb / 1e12).toFixed(1)} TB` : sizeMb > 1e9 ? `${(sizeMb / 1e9).toFixed(1)} GB` : sizeMb > 1e6 ? `${(sizeMb / 1e6).toFixed(0)} MB` : '0 MB';
    const path = item.path || 'Unknown Path';
    const totalEps = item.statistics?.totalEpisodeCount || 0;
    const haveEps = item.statistics?.episodeFileCount || 0;
    const denominator = isSeries ? (excludeUnmonitored ? (item.statistics?.episodeCount || totalEps) : totalEps) : 1;
    const pct = isSeries ? Math.min(100, Math.round((haveEps / (denominator || 1)) * 100)) : (item.hasFile ? 100 : 0);

    return (
        <div className="flex flex-col bg-zinc-950/40 border border-zinc-900 rounded-2xl overflow-hidden transition-all hover:border-zinc-800 shadow-lg">
            <div className="p-4 flex gap-6 items-center">
                <div className="w-16 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 shadow-lg border border-white/5">
                    {poster ? <img src={poster} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-800">{isSeries ? <Tv size={24} /> : <Film size={24} />}</div>}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-bold text-white text-lg truncate">{item.title}</h3>
                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black border border-zinc-800 text-zinc-500 uppercase tracking-widest bg-zinc-900/50">{item.instanceName}</span>
                        <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                <div className={`h-full transition-all duration-1000 ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${pct === 100 ? 'text-emerald-500' : 'text-amber-400'}`}>{pct}%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-5 text-[11px] text-zinc-500 font-semibold tracking-tight">
                        <span className="flex items-center gap-1.5"><Calendar size={12} className="text-zinc-700" /> {item.year}</span>
                        <span className="flex items-center gap-1.5"><HardDrive size={12} className="text-zinc-700" /> {sizeStr}</span>
                        <span className="flex items-center gap-1.5 truncate max-w-md"><Monitor size={12} className="text-zinc-800" /> <span className="text-zinc-600 truncate">{path}</span></span>
                    </div>
                </div>
                <div className="flex items-center gap-2 pr-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onInteractiveSearch?.({ type: isSeries ? 'series' : 'movie', id: item.id, instanceId: item.instanceId, title: item.title, poster }); }}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all"
                        title="Interactive Search"
                    >
                        <Search size={14} />
                    </button>
                    {isSeries && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className={`p-2.5 rounded-xl border transition-all ${expanded ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white'}`}
                        >
                            <Rows size={14} />
                        </button>
                    )}
                    <button onClick={onTransfer} className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all">
                        <MoveHorizontal size={14} />
                    </button>
                    <button onClick={onDelete} className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            {isSeries && expanded && (
                <div className="px-6 pb-6 pt-2 border-t border-zinc-900/50 bg-black/20">
                    <EpisodeList instanceId={item.instanceId} seriesId={item.id} onInteractiveSearch={(ep) => onInteractiveSearch?.({ type: 'episode', id: ep.id, instanceId: item.instanceId, title: `${item.title} - S${ep.seasonNumber}E${ep.episodeNumber}`, poster })} />
                </div>
            )}
        </div>
    );
}

function MyMediaCard({ item, viewMode, onRefresh, expandAll, excludeUnmonitored, onDelete, onTransfer, onInteractiveSearch }: {
    item: any; viewMode: 'grid' | 'list'; onRefresh: () => void; expandAll: boolean; excludeUnmonitored: boolean; onDelete: () => void; onTransfer: () => void; onInteractiveSearch?: (payload: any) => void;
}) {
    const isSeries = !!item.seasons || !!item.statistics;
    if (viewMode === 'list') return <MyMediaListCard item={item} isSeries={isSeries} expandAll={expandAll} excludeUnmonitored={excludeUnmonitored} onDelete={onDelete} onTransfer={onTransfer} onInteractiveSearch={onInteractiveSearch} />;
    return <MyMediaGridCard item={item} isSeries={isSeries} expandAll={expandAll} excludeUnmonitored={excludeUnmonitored} onDelete={onDelete} onTransfer={onTransfer} onInteractiveSearch={onInteractiveSearch} />;
}


// ──────────────────────────────────────────────
// Discovery Card
// ──────────────────────────────────────────────
function DiscoveryCard({ item, isAdding, libStatus, onAdd, viewMode, onShowDetails, onInteractiveSearch }: {
    item: any; isAdding: boolean; libStatus: { exists: boolean; hasFile: boolean; isDownloading: boolean; instances: { id: string; name: string }[] }; onAdd: () => void; viewMode: 'grid' | 'list'; onShowDetails?: () => void; onInteractiveSearch?: (media: any) => void;
}) {
    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || item.remotePoster;
    const rating = item.ratings?.value;
    const platform = getPlatformBadge(item);

    // Use libStatus from props

    if (viewMode === 'list') {
        return (
            <div className="group bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 flex gap-5 hover:border-zinc-800 transition-all items-center">
                <div
                    className="w-16 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 cursor-pointer"
                    onClick={onShowDetails}
                >
                    {poster ? <img src={poster} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-800"><Film size={20} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-white truncate cursor-pointer hover:text-emerald-400" onClick={onShowDetails}>{item.title}</h3>
                        {platform && <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${platform.color}`}>{platform.label}</span>}
                        {libStatus.exists && (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${libStatus.hasFile ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                libStatus.isDownloading ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                                    'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                }`}>
                                {libStatus.hasFile ? 'AVAILABLE' : libStatus.isDownloading ? 'DOWNLOADING' : 'IN LIBRARY'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                        {item.year && <span>{item.year}</span>}
                        {rating != null && <span className="text-amber-500 font-bold">★ {rating.toFixed(1)}</span>}
                        {item.genres?.length > 0 && <span className="truncate">{item.genres.slice(0, 2).join(', ')}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {libStatus.exists && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const instId = libStatus.instances?.[0]?.id;
                                if (instId) onInteractiveSearch?.({ ...item, id: item.tmdbId || item.tvdbId, instanceId: instId, type: (item.tvdbId || item.seasons) ? 'series' : 'movie' });
                            }}
                            className="p-2.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all"
                            title="Interactive Search"
                        >
                            <Search size={14} />
                        </button>
                    )}
                    <button
                        onClick={onAdd}
                        disabled={isAdding || libStatus.exists}
                        className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 ${libStatus.exists ? 'text-emerald-500/50 bg-zinc-900 cursor-not-allowed' : 'bg-white text-black hover:bg-emerald-400 shadow-lg'}`}
                    >
                        {isAdding ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : libStatus.exists ? <CheckCircle size={14} /> : <Plus size={14} />}
                        {isAdding ? 'Adding' : libStatus.exists ? (libStatus.hasFile ? 'Available' : 'In Library') : 'Add'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="group flex flex-col bg-[#090909] border border-zinc-900 hover:border-zinc-800 rounded-[2rem] overflow-hidden transition-all duration-500 shadow-2xl hover:-translate-y-1">
            <div className="relative aspect-[2/3] overflow-hidden cursor-pointer" onClick={onShowDetails}>
                {poster
                    ? <img src={poster} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    : <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800"><Film size={48} /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent opacity-90" />
                <div className="absolute top-3 left-3 right-3 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-all duration-300 z-30">
                    <div className="flex flex-col gap-1.5">
                        {platform && <span className={`w-fit px-2.5 py-1 rounded-lg text-[9px] font-black border backdrop-blur-sm ${platform.color}`}>{platform.label}</span>}
                        {rating != null && <span className="w-fit flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-black text-amber-400">★ {rating.toFixed(1)}</span>}
                    </div>
                    <div className="flex gap-2">
                        {libStatus.exists && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const instId = libStatus.instances?.[0]?.id;
                                    if (instId) onInteractiveSearch?.({ ...item, id: item.tmdbId || item.tvdbId, instanceId: instId, type: (item.tvdbId || item.seasons) ? 'series' : 'movie' });
                                }}
                                className="p-2.5 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 text-indigo-400 hover:text-white hover:bg-indigo-600 transition-all shadow-xl"
                                title="Interactive Search"
                            >
                                <Search size={14} />
                            </button>
                        )}
                        {libStatus.exists && (
                            <div className={`p-2.5 rounded-xl shadow-lg backdrop-blur-xl border border-white/10 ${libStatus.hasFile ? 'bg-emerald-500/20 text-emerald-400' :
                                libStatus.isDownloading ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-blue-500/20 text-blue-400'
                                }`}>
                                <CheckCircle size={14} />
                            </div>
                        )}
                    </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4 z-20">
                    <h3 className="text-base font-black text-white leading-tight line-clamp-2 drop-shadow-lg">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 font-bold">
                        {item.year && <span>{item.year}</span>}
                        {item.genres?.length > 0 && <><span className="opacity-40">•</span><span className="truncate">{item.genres.slice(0, 2).join(' / ')}</span></>}
                    </div>
                </div>
            </div>
            <div className="p-5 pt-2">
                <p className="text-xs text-zinc-600 line-clamp-2 mb-4 h-8">{item.overview || ''}</p>
                <div className="flex gap-2">
                    <button
                        onClick={onAdd}
                        disabled={isAdding || libStatus.exists}
                        className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${libStatus.exists ? 'bg-zinc-900/50 text-emerald-500/40 cursor-not-allowed' : 'bg-white text-black hover:bg-emerald-400 shadow-lg'}`}
                    >
                        {isAdding ? <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" /> : libStatus.exists ? <CheckCircle size={14} /> : <Plus size={14} />}
                        {isAdding ? 'Adding...' : libStatus.exists ? (libStatus.hasFile ? 'Available' : 'In Library') : 'Add to Library'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function DiscoverPage() {
    const [pageMode, setPageMode] = useState<'discover' | 'mylibrary' | 'queue'>('discover');
    const [mediaType, setMediaType] = useState<'movie' | 'series'>('series');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [libraryItems, setLibraryItems] = useState<any[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryMap, setLibraryMap] = useState<Map<string, { hasFile: boolean; isDownloading: boolean; instances: { id: string; name: string }[] }>>(new Map());

    const [instances, setInstances] = useState<Instance[]>([]);
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
    const [profiles, setProfiles] = useState<QualityProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number>(0);
    const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
    const [tmdbApiKey, setTmdbApiKey] = useState<string>('');
    const [showDetailsFor, setShowDetailsFor] = useState<any>(null);
    const [showPersonDetailsFor, setShowPersonDetailsFor] = useState<number | null>(null);
    const [selectedRootFolderId, setSelectedRootFolderId] = useState<number>(0);

    const [addingItemStr, setAddingItemStr] = useState<string>('');
    const [showFilters, setShowFilters] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(pageMode === 'mylibrary' ? 'list' : 'grid');
    const [startSearch, setStartSearch] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);

    const [selectedItemForAdd, setSelectedItemForAdd] = useState<any>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAddingInModal, setIsAddingInModal] = useState(false);

    const [filterGenre, setFilterGenre] = useState<string>('All');
    const [filterPlatform, setFilterPlatform] = useState<string>('All');
    const [filterYear, setFilterYear] = useState<string>('All');
    const [filterRating, setFilterRating] = useState<number>(0);
    const [sortBy, setSortBy] = useState<'popularity' | 'year' | 'alphabetical' | 'size'>('popularity');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const [isTransferring, setIsTransferring] = useState(false);
    const [transferTarget, setTransferTarget] = useState<any>(null);
    const [expandAll, setExpandAll] = useState(false);
    const [excludeUnmonitored, setExcludeUnmonitored] = useState(true);

    const [serverTotalPages, setServerTotalPages] = useState(1);
    const [localRating, setLocalRating] = useState<number>(filterRating);

    // Interactive Search State
    const [interactiveSearchItem, setInteractiveSearchItem] = useState<any | null>(null);
    const [interactiveReleases, setInteractiveReleases] = useState<any[]>([]);
    const [loadingReleases, setLoadingReleases] = useState(false);
    const [triggeringReleaseGuid, setTriggeringReleaseGuid] = useState<string | null>(null);

    // Debounce rating changes to avoid flickering and excessive API calls
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localRating !== filterRating) {
                setFilterRating(localRating);
                setCurrentPage(0);
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [localRating, filterRating]);

    const availableInstances = useMemo(() =>
        instances.filter((inst: Instance) =>
            inst.type === (mediaType === 'movie' ? 'radarr' : 'sonarr')
        ), [instances, mediaType]);

    const loadLibrary = useCallback(async () => {
        setLibraryLoading(true);
        try {
            const endpoint = mediaType === 'movie' ? '/api/radarr/all' : '/api/sonarr/all';
            const data = await fetch(endpoint).then(r => r.ok ? r.json() : []).catch(() => []);
            const items = Array.isArray(data) ? data : [];
            setLibraryItems(items);

            const map = new Map<string, { hasFile: boolean; isDownloading: boolean; instances: { id: string; name: string }[] }>();

            items.forEach((m: any) => {
                const isSeries = !!(m.tvdbId || m.seasons);
                const type = isSeries ? 'series' : 'movie';

                // Collect all possible keys for this item to ensure matching regardless of ID source
                const keys = [];
                if (m.tmdbId) keys.push(`${type}-tmdb-${m.tmdbId}`);
                if (m.tvdbId) keys.push(`${type}-tvdb-${m.tvdbId}`);

                // Backward compatibility with legacy plain ID keys
                const plainId = m.tmdbId || m.tvdbId;
                if (plainId) {
                    const legacyType = m.tvdbId ? 'series' : 'movie';
                    keys.push(`${legacyType}-${plainId}`);
                }

                keys.forEach(key => {
                    const existing = map.get(key);
                    const itemInstances = existing ? [...existing.instances] : [];

                    if (!itemInstances.some((i: any) => i.id === m.instanceId)) {
                        itemInstances.push({ id: m.instanceId, name: m.instanceName || 'Unknown' });
                    }

                    map.set(key, {
                        hasFile: (existing?.hasFile || m.hasFile || (m.statistics?.percentOfEpisodes === 100)) ?? false,
                        isDownloading: (existing?.isDownloading || m.isDownloading || (m.queuedEpisodeIds?.length > 0)) ?? false,
                        instances: itemInstances
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

    const handleDiscovery = useCallback(async (pageNum: number = currentPage) => {
        if (availableInstances.length === 0) return;
        setIsSearching(true);
        let fetchedData: any[] = [];
        let totalP = 1;
        try {
            const base = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';
            // Stable params construction
            const searchParams = new URLSearchParams({
                instanceId: selectedInstanceIds[0] || availableInstances[0].id,
                page: (pageNum + 1).toString()
            });

            if (filterPlatform !== 'All') searchParams.append('platform', filterPlatform);
            if (filterGenre !== 'All') searchParams.append('genre', filterGenre);
            if (filterRating > 0) searchParams.append('minRating', filterRating.toString());
            if (filterYear !== 'All') searchParams.append('year', filterYear);

            const res = await fetch(`${base}/lookup?${searchParams.toString()}`);
            if (res.ok) {
                const data = await res.json();
                fetchedData = Array.isArray(data.results) ? data.results : [];
                totalP = data.total_pages || 1;
            }
        } catch (e) {
            console.error('Discovery error:', e);
            toast.error('Failed to load discovery content');
        } finally {
            setResults(fetchedData);
            setServerTotalPages(totalP);
            if (pageNum !== currentPage) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            setIsSearching(false);
        }
    }, [mediaType, selectedInstanceIds.join(','), availableInstances.map(i => i.id).join(','), filterPlatform, filterGenre, filterRating, filterYear]);

    // Interactive Search Handlers
    const handleOpenInteractiveSearch = async (media: any) => {
        setInteractiveSearchItem(media);
        setLoadingReleases(true);
        setInteractiveReleases([]);
        try {
            const endpoint = media.type === 'movie'
                ? `/api/radarr/releases?movieId=${media.id}&instanceId=${media.instanceId}`
                : `/api/sonarr/releases?episodeId=${media.id}&instanceId=${media.instanceId}`;
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
        } catch (e) {
            toast.error('Error triggering download');
        } finally {
            setTriggeringReleaseGuid(null);
        }
    };

    const handleDelete = useCallback(async (item: any) => {
        if (!confirm(`Are you sure you want to delete "${item.title}"? This cannot be undone.`)) return;
        const deleteFiles = confirm(`Do you also want to delete the files from disk?`);

        try {
            const endpoint = mediaType === 'movie' ? '/api/radarr/delete' : '/api/sonarr/delete';
            const params = new URLSearchParams({
                instanceId: item.instanceId,
                deleteFiles: deleteFiles.toString()
            });
            if (mediaType === 'movie') params.append('movieId', item.id);
            else params.append('seriesId', item.id);

            const res = await fetch(`${endpoint}?${params.toString()}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success(`Deleted ${item.title}`);
                loadLibrary();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Failed to delete item');
            }
        } catch (e) {
            toast.error('An error occurred while deleting');
        }
    }, [mediaType, loadLibrary]);

    const handleTransfer = useCallback(async (item: any, targetInstanceId: string, targetProfileId: number, targetRootFolder: string, action: 'transfer' | 'copy', moveFiles: boolean) => {
        setIsTransferring(true);
        try {
            const res = await fetch('/api/media/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item,
                    sourceInstanceId: item.instanceId,
                    targetInstanceId,
                    targetProfileId,
                    targetRootFolder,
                    action,
                    moveFiles,
                    mediaType
                })
            });

            const data = await res.json();

            if (res.status === 409) {
                toast.info(data.error || `${item.title} already exists on the target instance.`);
                setTransferTarget(null);
                return;
            }

            if (!res.ok) {
                throw new Error(data.error || `Failed to ${action}`);
            }

            toast.success(`${action === 'transfer' ? 'Transferred' : 'Copied'} ${item.title} successfully`);
            setTransferTarget(null);
            loadLibrary();
        } catch (e: any) {
            toast.error(e.message || `An error occurred while ${action === 'transfer' ? 'transferring' : 'copying'}`);
        } finally {
            setIsTransferring(false);
        }
    }, [mediaType, loadLibrary]);

    const handleSearch = useCallback(async (e?: React.FormEvent | null) => {
        if (e) e.preventDefault();
        const targetId = selectedInstanceIds[0] || (availableInstances.length > 0 ? availableInstances[0].id : '');
        if (!searchQuery.trim() || !targetId) return;
        setIsSearching(true);
        setResults([]);
        const endpoint = mediaType === 'movie' ? '/api/radarr/lookup' : '/api/sonarr/lookup';
        const res = await fetch(`${endpoint}?instanceId=${targetId}&term=${encodeURIComponent(searchQuery)}&page=${currentPage + 1}`).catch(() => null);
        if (res?.ok) {
            const data = await res.json();
            setResults(Array.isArray(data.results) ? data.results : []);
            setServerTotalPages(data.total_pages || 1);
        } else {
            toast.error('Search failed');
        }
        setIsSearching(false);
    }, [searchQuery, selectedInstanceIds, availableInstances, mediaType, currentPage]);

    const handleFinalAdd = useCallback(async (item: any, targetInstanceId: string, profileId: number, rootFolderPath: string, startSearch: boolean) => {
        setIsAddingInModal(true);
        const idStr = item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`;
        const endpoint = mediaType === 'movie' ? '/api/radarr/add' : '/api/sonarr/add';
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: targetInstanceId,
                    item,
                    qualityProfileId: profileId,
                    rootFolderPath: rootFolderPath,
                    startSearch,
                }),
            });
            if (res.ok) {
                const added = await res.json();
                toast.success(`Added ${item.title}!`);
                setIsAddModalOpen(false);
                setSelectedItemForAdd(null);
                loadLibrary();

                if (added?.id) {
                    setResults(prev => prev.map(r => {
                        const rId = r.tmdbId ? `tmdb-${r.tmdbId}` : `tvdb-${r.tvdbId}`;
                        return rId === idStr ? { ...r, id: added.id } : r;
                    }));
                }
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Failed to add');
            }
        } catch {
            toast.error('Error adding item');
        } finally {
            setIsAddingInModal(false);
        }
    }, [mediaType, loadLibrary]);

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

        return { exists: (typeof item.id === 'number' && item.id > 0 && pageMode === 'mylibrary'), hasFile: false, isDownloading: false, instances: [] };
    }, [libraryMap, pageMode]);

    const filteredDiscovery = useMemo(() => {
        let items = [...results];
        if (searchQuery && !isSearching) {
            const q = searchQuery.toLowerCase();
            items = items.filter(i => i.title?.toLowerCase().includes(q) || i.overview?.toLowerCase().includes(q));
        }
        if (pageMode === 'mylibrary') {
            if (filterGenre !== 'All') items = items.filter(i => i.genres?.includes(filterGenre));
            if (filterPlatform !== 'All') {
                const platformLower = filterPlatform.toLowerCase();
                items = items.filter(i => {
                    const all: string[] = [
                        ...(i.productionCompanies || []),
                        i.studio,
                        i.network
                    ].filter(Boolean).map((s: string) => s.toLowerCase());
                    return all.some(c => c.includes(platformLower));
                });
            }
            if (filterYear !== 'All') items = items.filter(i => i.year?.toString() === filterYear);
            if (filterRating > 0) {
                items = items.filter(i => {
                    const r = i.ratings?.value ?? i.vote_average ?? 0;
                    return r >= filterRating;
                });
            }
        }

        items.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'popularity') {
                // Higher popularity or vote count first
                const popA = a.popularity || a.ratings?.votes || 0;
                const popB = b.popularity || b.ratings?.votes || 0;
                comparison = popA - popB;
            } else if (sortBy === 'year') {
                comparison = (a.year || 0) - (b.year || 0);
            } else if (sortBy === 'alphabetical') {
                comparison = (a.title || '').localeCompare(b.title || '');
            } else if (sortBy === 'size') {
                const sizeA = a.sizeOnDisk || a.statistics?.sizeOnDisk || 0;
                const sizeB = b.sizeOnDisk || b.statistics?.sizeOnDisk || 0;
                comparison = sizeA - sizeB;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });
        return items;
    }, [results, searchQuery, isSearching, filterGenre, filterPlatform, filterYear, filterRating, sortBy, sortOrder]);

    const filteredLibrary = useMemo(() => {
        let items = [...libraryItems];
        if (selectedInstanceIds.length > 0) {
            items = items.filter(i => selectedInstanceIds.includes(i.instanceId));
        } else {
            items = items.filter(i =>
                i.instanceId && instances.some(inst => inst.type === (mediaType === 'movie' ? 'radarr' : 'sonarr') && inst.id === i.instanceId)
            );
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(i => i.title?.toLowerCase().includes(q));
        }
        if (filterGenre !== 'All') items = items.filter(i => i.genres?.includes(filterGenre));
        if (filterYear !== 'All') items = items.filter(i => i.year?.toString() === filterYear);
        if (filterRating > 0) items = items.filter(i => (i.ratings?.value || i.ratings?.votes || i.vote_average || 0) >= filterRating);

        items.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'popularity') {
                const popA = a.popularity || a.ratings?.value || a.ratings?.votes || 0;
                const popB = b.popularity || b.ratings?.value || b.ratings?.votes || 0;
                comparison = popA - popB;
            } else if (sortBy === 'year') {
                comparison = (a.year || 0) - (b.year || 0);
            } else if (sortBy === 'alphabetical') {
                comparison = (a.title || '').localeCompare(b.title || '');
            } else if (sortBy === 'size') {
                const sizeA = a.sizeOnDisk || a.statistics?.sizeOnDisk || 0;
                const sizeB = b.sizeOnDisk || b.statistics?.sizeOnDisk || 0;
                comparison = sizeA - sizeB;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });
        return items;
    }, [libraryItems, instances, mediaType, searchQuery, filterGenre, filterYear, filterRating, sortBy, sortOrder, selectedInstanceIds]);

    const allPlatforms = useMemo(() => {
        const ps = new Set<string>();
        results.forEach(i => {
            [...(i.productionCompanies || []), i.studio, i.network].filter(Boolean).forEach((s: string) => ps.add(s));
        });
        return ['All', ...Array.from(ps).sort()];
    }, [results]);

    const allYears = useMemo(() => {
        const items = pageMode === 'discover' ? results : libraryItems;
        const ys = new Set<string>();
        items.forEach(i => { if (i.year) ys.add(i.year.toString()); });
        return ['All', ...Array.from(ys).sort((a, b) => Number(b) - Number(a))];
    }, [results, libraryItems, pageMode]);

    // ── Load config ──
    useEffect(() => {
        fetch('/api/instances').then(r => r.ok ? r.json() : []).then(data => {
            if (Array.isArray(data)) setInstances(data);
        });
        fetch('/api/settings').then(r => r.ok ? r.json() : {}).then((data: any) => {
            if (data.tmdb_api_key) setTmdbApiKey(data.tmdb_api_key);
        });
    }, []);

    // Auto-select first instance for browsing ONLY if none selected
    useEffect(() => {
        if (availableInstances.length > 0 && selectedInstanceIds.length === 0) {
            setSelectedInstanceIds([availableInstances[0].id]);
        }
    }, [availableInstances, selectedInstanceIds]);

    // ── Load library (for cross-referencing) ──
    useEffect(() => {
        loadLibrary();
    }, [loadLibrary]);

    // Reset page on filter/mode/type change
    useEffect(() => { setCurrentPage(0); }, [filterGenre, filterPlatform, filterYear, mediaType, pageMode, searchQuery]);

    useEffect(() => {
        if (pageMode === 'mylibrary') setViewMode('list');
    }, [pageMode]);

    useEffect(() => {
        if (pageMode === 'discover') {
            if (searchQuery) {
                handleSearch();
            } else {
                handleDiscovery(currentPage);
            }
        }
    }, [mediaType, pageMode, searchQuery, filterPlatform, filterGenre, filterYear, filterRating, currentPage, handleDiscovery, handleSearch]);

    // ── Add to library via Modal ──
    const handleAdd = (item: any) => {
        setSelectedItemForAdd(item);
        setIsAddModalOpen(true);
    };

    const displayItems = pageMode === 'discover' ? filteredDiscovery : filteredLibrary;
    const PAGE_SIZE = 24;
    const totalPages = pageMode === 'discover' ? serverTotalPages : Math.ceil(displayItems.length / PAGE_SIZE);
    const pageItems = pageMode === 'discover' ? displayItems : displayItems.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    return (
        <div className="p-6 lg:p-10 space-y-8 max-w-[1800px] mx-auto">
            <Toaster position="bottom-right" theme="dark" richColors />

            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 w-fit">
                    <Sparkles size={12} className="text-emerald-500" />
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Media</span>
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">Media Browser</h1>
            </div>

            {/* Top Control Bar */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50">
                    <button onClick={() => setPageMode('discover')} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${pageMode === 'discover' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><Sparkles size={14} /> Discover</button>
                    <button onClick={() => setPageMode('mylibrary')} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${pageMode === 'mylibrary' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><HardDrive size={14} /> My Library</button>
                    <button onClick={() => setPageMode('queue')} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${pageMode === 'queue' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><ListOrdered size={14} /> Search Queue</button>
                </div>

                {pageMode !== 'queue' && (
                    <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50">
                        <button onClick={() => setMediaType('movie')} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${mediaType === 'movie' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-400'}`}><Film size={14} /> Movies</button>
                        <button onClick={() => setMediaType('series')} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${mediaType === 'series' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-400'}`}><Tv size={14} /> Series</button>
                    </div>
                )}

                {pageMode === 'mylibrary' && (
                    <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50 overflow-x-auto gap-1 max-w-full">
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
                                    className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl border transition-all whitespace-nowrap"
                                    style={isSelected ? { backgroundColor: `${hex}22`, borderColor: `${hex}66`, color: hex } : { borderColor: 'transparent', color: '#52525b' }}
                                >
                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} /> {inst.name}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50 ml-auto gap-2">
                    {pageMode === 'mylibrary' && mediaType === 'series' && (
                        <>
                            <button
                                onClick={() => setExpandAll(!expandAll)}
                                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${expandAll ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'}`}
                            >
                                {expandAll ? 'Hide Episodes' : 'Expand All'}
                            </button>
                            <button
                                onClick={() => setExcludeUnmonitored(!excludeUnmonitored)}
                                title={excludeUnmonitored ? 'Currently excluding unmonitored/specials from % calculation' : 'Currently including all episodes in % calculation'}
                                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${excludeUnmonitored ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
                                    }`}
                            >
                                {excludeUnmonitored ? 'Excl. Unmonitored' : 'Incl. All Eps'}
                            </button>
                        </>
                    )}
                    <div className="flex bg-zinc-900/50 rounded-xl p-0.5">
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-600'}`}><LayoutGrid size={15} /></button>
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-600'}`}><Rows size={15} /></button>
                    </div>
                </div>
            </div>

            {pageMode === 'discover' && showFilters && (
                <div className="flex flex-wrap items-center gap-6 p-5 bg-zinc-950/40 border border-zinc-900/50 rounded-3xl backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
                            <TrendingUp size={12} className="text-emerald-500" />
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Auto-Discovery Active</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Browsing via your {mediaType} instance</p>
                    </div>
                </div>
            )}

            {pageMode === 'queue' ? (
                <SchedulerQueuePanel />
            ) : (
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {showFilters && (
                        <div className="w-full lg:w-72 space-y-7 bg-zinc-950/20 p-6 rounded-3xl border border-zinc-900/50 flex-shrink-0">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Search</label>
                                <form onSubmit={handleSearch} className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" size={16} />
                                    <input type="text" placeholder="Title, keyword..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') { setSearchQuery(''); handleDiscovery(); } }} className="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all placeholder-zinc-700" />
                                    {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />}
                                </form>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-1.5"><Tags size={11} /> Genre</label>
                                <div className="flex flex-wrap gap-1.5">{ALL_GENRES.map(genre => <button key={genre} onClick={() => setFilterGenre(genre)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${filterGenre === genre ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-transparent text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700'}`}>{genre}</button>)}</div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-1.5"><Monitor size={11} /> Studio / Network</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {QUICK_STUDIOS.map(s => (
                                        <button
                                            key={s.name}
                                            onClick={() => setFilterPlatform(filterPlatform === s.name ? 'All' : s.name)}
                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${filterPlatform === s.name ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-transparent text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700'}`}
                                        >
                                            <span className={s.color}>{s.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {pageMode === 'discover' && allPlatforms.length > QUICK_STUDIOS.length && (
                                <CustomSelect label="All Platforms" icon={<Monitor size={11} />} options={allPlatforms.map(p => ({ id: p, name: p }))} value={filterPlatform} onChange={val => setFilterPlatform(val)} />
                            )}
                            <CustomSelect label="Year" icon={<Calendar size={11} />} options={allYears.map(y => ({ id: y, name: y }))} value={filterYear} onChange={val => setFilterYear(val)} />

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center justify-between">
                                    <span className="flex items-center gap-1.5"><Star size={11} /> Minimum Rating</span>
                                    <span className="text-emerald-500 font-black">{localRating}</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    step="0.5"
                                    value={localRating}
                                    onChange={e => setLocalRating(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
                                />
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between text-[8px] font-black text-zinc-700 uppercase tracking-tighter">
                                        <span>Any</span>
                                        <span>5+</span>
                                        <span>8+</span>
                                        <span>10</span>
                                    </div>
                                    <div className="px-1 py-4 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                        <div className="w-full aspect-square max-w-[240px] relative">
                                            <img
                                                src={
                                                    localRating >= 9 ? '/ratings/awesometacular.png' :
                                                        localRating >= 7.5 ? '/ratings/bluray.png' :
                                                            localRating >= 6 ? '/ratings/goodtime.png' :
                                                                localRating >= 4 ? '/ratings/drunk.png' :
                                                                    localRating >= 2 ? '/ratings/forgettable.png' : '/ratings/dogshit.png'
                                                }
                                                className="w-full h-full object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                                alt="Rating Icon"
                                                key={localRating >= 9 ? 'a' : localRating >= 7.5 ? 'b' : localRating >= 6 ? 'g' : localRating >= 4 ? 'd' : localRating >= 2 ? 'f' : 'ds'}
                                            />
                                        </div>
                                        <p className="text-sm font-black uppercase tracking-[0.2em] text-center" style={{
                                            color: localRating >= 9 ? '#10b981' :
                                                localRating >= 7.5 ? '#22c55e' :
                                                    localRating >= 6 ? '#3b82f6' :
                                                        localRating >= 4 ? '#eab308' :
                                                            localRating >= 2 ? '#f97316' : '#ef4444'
                                        }}>
                                            {localRating >= 9 ? 'AWESOMETACULAR!' :
                                                localRating >= 7.5 ? 'Buying it on Blu-ray' :
                                                    localRating >= 6 ? 'A good time no alcohol required' :
                                                        localRating >= 4 ? "A good time if you're drunk" :
                                                            localRating >= 2 ? 'Not going to remember it tomorrow' : 'DOGSHIT!'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                {pageMode === 'discover' ? (searchQuery ? `Results for "${searchQuery}"` : 'Trending Now') : 'My Library'}
                                <span className="bg-zinc-900 text-zinc-500 text-[10px] font-black px-2 py-0.5 rounded-full border border-zinc-800">{displayItems.length}</span>
                            </h2>

                            <div className="flex items-center gap-3">
                                <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-900">
                                    {[
                                        { id: 'popularity', label: 'Popularity', icon: <TrendingUp size={12} /> },
                                        { id: 'year', label: 'Year', icon: <Calendar size={12} /> },
                                        { id: 'alphabetical', label: 'A-Z', icon: <Rows size={12} /> },
                                        { id: 'size', label: 'Size', icon: <HardDrive size={12} /> }
                                    ].filter(s => s.id !== 'size' || pageMode === 'mylibrary').map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setSortBy(s.id as any)}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${sortBy === s.id ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            {s.icon} {s.label}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all"
                                    title={sortOrder === 'desc' ? 'Descending' : 'Ascending'}
                                >
                                    <div className={`transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}>
                                        <ChevronDown size={14} />
                                    </div>
                                </button>

                                {pageMode === 'discover' && !showFilters && (
                                    <button onClick={() => setShowFilters(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-900 text-[10px] font-black text-zinc-500 hover:text-zinc-300 uppercase tracking-widest transition-all">
                                        <Filter size={12} /> Filters
                                    </button>
                                )}
                            </div>
                        </div>

                        {availableInstances.length === 0 && pageMode === 'discover' ? (
                            <div className="flex flex-col items-center justify-center py-40 bg-zinc-950/20 rounded-[3rem] border border-zinc-900/50 gap-6">
                                <div className="p-8 bg-zinc-900/50 rounded-full text-zinc-700 opacity-50"><Monitor size={64} /></div>
                                <div className="text-center">
                                    <p className="text-xl font-bold text-white mb-2">No {mediaType} instances found</p>
                                    <p className="text-zinc-500 font-medium max-w-xs mx-auto text-sm">You need to configure at least one {mediaType} instance in settings to browse and add content.</p>
                                </div>
                            </div>
                        ) : isSearching || (pageMode === 'mylibrary' && libraryLoading) ? (
                            <div className="flex flex-col items-center justify-center py-40 gap-4">
                                <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /><p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">{pageMode === 'discover' ? 'Searching...' : 'Loading library...'}</p>
                            </div>
                        ) : pageItems.length > 0 ? (
                            <>
                                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5' : 'space-y-3'}>
                                    {pageItems.map((item, idx) => {
                                        if (pageMode === 'mylibrary') return <MyMediaCard key={`${item.instanceId}-${item.id}-${idx}`} item={item} viewMode={viewMode} onRefresh={loadLibrary} expandAll={expandAll} excludeUnmonitored={excludeUnmonitored} onDelete={() => handleDelete(item)} onTransfer={() => setTransferTarget(item)} onInteractiveSearch={handleOpenInteractiveSearch} />;
                                        return <DiscoveryCard key={item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`} item={item} isAdding={addingItemStr === (item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`)} libStatus={isInLibrary(item)} onAdd={() => handleAdd(item)} viewMode={viewMode} onShowDetails={() => setShowDetailsFor(item)} onInteractiveSearch={handleOpenInteractiveSearch} />;
                                    })}
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-center gap-4 pt-4">
                                        <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 text-xs font-black uppercase tracking-widest hover:border-zinc-700 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed">← Prev</button>
                                        <span className="text-zinc-600 text-xs font-bold">Page {currentPage + 1} of {totalPages}</span>
                                        <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 text-xs font-black uppercase tracking-widest hover:border-zinc-700 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed">Next →</button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-40 bg-zinc-950/20 rounded-[3rem] border border-zinc-900/50 gap-6">
                                <div className="p-8 bg-zinc-900/50 rounded-full opacity-20"><Search size={64} /></div>
                                <div className="text-center">
                                    <p className="text-xl font-bold text-white mb-2">{pageMode === 'mylibrary' ? 'Library is empty' : 'No results found'}</p>
                                    <p className="text-zinc-500 font-medium">{pageMode === 'mylibrary' ? 'Add media in Discover mode.' : 'Try adjusting your filters.'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Media Modal */}
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

            {/* Transfer Modal */}
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

            {/* Media Details Panel */}
            {showDetailsFor && (
                <MediaDetailsPanel
                    item={showDetailsFor}
                    tmdbApiKey={tmdbApiKey}
                    libStatus={isInLibrary(showDetailsFor)}
                    onClose={() => setShowDetailsFor(null)}
                    onAdd={() => {
                        handleAdd(showDetailsFor);
                    }}
                    onSelectPerson={(pid: number) => {
                        setShowPersonDetailsFor(pid);
                    }}
                    onSelectRecommended={(rec: any) => {
                        setShowDetailsFor(rec);
                    }}
                />
            )}

            {/* Person Details Panel */}
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

            {/* Interactive Search Modal */}
            <InteractiveSearchModal
                isOpen={!!interactiveSearchItem}
                onClose={() => setInteractiveSearchItem(null)}
                item={interactiveSearchItem}
                releases={interactiveReleases}
                isLoading={loadingReleases}
                triggeringReleaseGuid={triggeringReleaseGuid}
                onTriggerDownload={handleTriggerDownload}
            />
        </div>
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
        // Fetch source profiles to know current profile name
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

                // Logic: Match source profile name in target if possible
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
                {/* Action Toggle */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Select Action</label>
                    <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
                        <button
                            onClick={() => setAction('transfer')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${action === 'transfer' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-400'}`}
                        >
                            <MoveHorizontal size={12} /> Transfer (Move)
                        </button>
                        <button
                            onClick={() => setAction('copy')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${action === 'copy' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-400'}`}
                        >
                            <Copy size={12} /> Copy (Keep Original)
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
                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">File Management</label>
                    <button
                        onClick={() => setCopyFiles(!copyFiles)}
                        className={`h-11 px-5 rounded-2xl border flex items-center gap-3 transition-all text-[10px] font-black uppercase tracking-wider ${copyFiles ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${copyFiles ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-700'}`} />
                        {action === 'transfer' ? 'Move Physical Files' : 'Copy Physical Files'}
                    </button>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border text-[10px] font-bold leading-relaxed ${action === 'transfer' ? 'bg-amber-500/5 border-amber-500/10 text-amber-500/80' : 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400/80'}`}>
                {action === 'transfer'
                    ? "Note: Item will be ADDED to the target and REMOVED from the source (including files if selected)."
                    : "Note: Item will be CLONED to the target instance. Original will remain untouched."
                }
            </div>

            <div className="flex gap-3 pt-2">
                <button onClick={onCancel} className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-[10px] tracking-widest rounded-2xl hover:text-white transition-all">Cancel</button>
                <button
                    disabled={!canSubmit}
                    onClick={() => onTransfer(item, targetInstanceId, selectedProfileId, targetRootFolder, action, copyFiles)}
                    className={`flex-[2] h-12 flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all ${canSubmit ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
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
    }, []);

    useEffect(() => {
        if (targetInstanceId) {
            setLoadingConfig(true);
            const base = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';
            Promise.all([
                fetch(`/api/profiles?instanceId=${targetInstanceId}`).then(r => r.json()),
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">
                    <X size={20} />
                </button>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <Plus size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white">Add to Library</h2>
                        <p className="text-sm text-zinc-500 font-bold">{item.title}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="space-y-4">
                        <CustomSelect
                            label="Target Instance"
                            value={targetInstanceId}
                            onChange={setTargetInstanceId}
                            options={availableInstances.map((i: any) => ({ id: i.id, name: i.name }))}
                        />

                        <div className="relative">
                            {loadingConfig && <div className="absolute right-3 top-3 z-10"><div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /></div>}
                            <CustomSelect
                                label="Quality Profile"
                                value={selectedProfileId || ''}
                                onChange={(v) => setSelectedProfileId(Number(v))}
                                options={profiles.map(p => ({ id: p.id.toString(), name: p.name }))}
                            />
                        </div>

                        <CustomSelect
                            label="Root Folder"
                            value={selectedRootFolderPath}
                            onChange={setSelectedRootFolderPath}
                            options={rootFolders.map(rf => ({ id: rf.path, name: rf.path }))}
                        />

                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Start Search Automatically</label>
                            <button
                                onClick={() => setStartSearch(!startSearch)}
                                className={`h-11 px-5 rounded-2xl border flex items-center gap-3 transition-all text-xs font-black uppercase tracking-wider ${startSearch ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${startSearch ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
                                {startSearch ? 'Yes, search now' : 'No, just add'}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button onClick={onClose} className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-[10px] tracking-widest rounded-2xl hover:text-white transition-all">
                            Cancel
                        </button>
                        <button
                            disabled={!canSubmit}
                            onClick={() => onAdd(item, targetInstanceId, selectedProfileId, selectedRootFolderPath, startSearch)}
                            className={`flex-[2] h-12 flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all ${canSubmit ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                        >
                            {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={14} />}
                            {loading ? 'Adding...' : 'Add to Library'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

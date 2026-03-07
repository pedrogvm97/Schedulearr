'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, Plus, Film, Tv, CheckCircle,
    Filter, X, Star, Calendar,
    LayoutGrid, List, Sparkles, TrendingUp,
    ChevronDown, Tags, Monitor, ChevronRight,
    HardDrive, Percent, PlayCircle, ChevronUp
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';
import { twColorToHex } from '@/lib/instanceColor';

interface Instance {
    id: string;
    name: string;
    type: 'radarr' | 'sonarr';
    color?: string;
}

interface QualityProfile { id: number; name: string; }
interface RootFolder { id: number; path: string; }

// ──────────────────────────────────────────────
// Genre list
// ──────────────────────────────────────────────
const ALL_GENRES = [
    'All', 'Action', 'Adventure', 'Animation', 'Anime', 'Comedy', 'Crime',
    'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
    'Music', 'Mystery', 'Reality', 'Romance', 'Sci-Fi & Fantasy',
    'Science Fiction', 'Soap', 'Thriller', 'War', 'War & Politics',
    'Western', 'Talk'
];

// ──────────────────────────────────────────────
// Helper: platform badge
// ──────────────────────────────────────────────
function getPlatformBadge(item: any) {
    const all: string[] = [
        ...(item.productionCompanies || []),
        item.studio, item.network
    ].filter(Boolean).map((s: string) => s.toLowerCase());
    if (all.some(c => c.includes('netflix'))) return { label: 'Netflix', color: 'bg-red-900/60 text-red-400 border-red-700/40' };
    if (all.some(c => c.includes('hbo') || c.includes('max'))) return { label: 'HBO Max', color: 'bg-violet-900/60 text-violet-400 border-violet-700/40' };
    if (all.some(c => c.includes('amazon') || c.includes('prime'))) return { label: 'Prime', color: 'bg-sky-900/60 text-sky-400 border-sky-700/40' };
    if (all.some(c => c.includes('disney'))) return { label: 'Disney+', color: 'bg-blue-900/60 text-blue-400 border-blue-700/40' };
    if (all.some(c => c.includes('apple'))) return { label: 'Apple TV+', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    if (all.some(c => c.includes('hulu'))) return { label: 'Hulu', color: 'bg-emerald-900/60 text-emerald-400 border-emerald-700/40' };
    if (all.some(c => c.includes('paramount'))) return { label: 'Paramount+', color: 'bg-blue-900/60 text-blue-300 border-blue-700/40' };
    if (all.some(c => c.includes('peacock'))) return { label: 'Peacock', color: 'bg-yellow-900/60 text-yellow-400 border-yellow-700/40' };
    if (all.some(c => c.includes('crunchyroll'))) return { label: 'Crunchyroll', color: 'bg-orange-900/60 text-orange-400 border-orange-700/40' };
    if (item.studio) return { label: item.studio, color: 'bg-zinc-900 text-zinc-400 border-zinc-700' };
    return null;
}

// ──────────────────────────────────────────────
// My Media Episode Row
// ──────────────────────────────────────────────
function EpisodeList({ instanceId, seriesId }: { instanceId: string; seriesId: number }) {
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

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

    if (loading) return <div className="flex items-center gap-2 py-4 text-zinc-600 text-xs"><div className="w-3 h-3 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" /> Loading episodes...</div>;

    const seasons = [...new Set(episodes.map(e => e.seasonNumber))].sort((a, b) => b - a);
    const seasonEps = episodes.filter(e => e.seasonNumber === selectedSeason);
    const haveCount = seasonEps.filter(e => e.hasFile).length;

    return (
        <div className="mt-3 space-y-3">
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
            <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-medium">
                <span className="text-emerald-500 font-bold">{haveCount}/{seasonEps.length}</span> episodes available
            </div>

            {/* Episode List */}
            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {seasonEps.map(ep => (
                    <div key={ep.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${ep.hasFile ? 'border-zinc-800 bg-zinc-950/30' : 'border-zinc-900/50 opacity-50'}`}>
                        <span className={`text-[10px] font-black w-8 ${ep.hasFile ? 'text-emerald-500' : 'text-zinc-700'}`}>
                            E{String(ep.episodeNumber).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-xs text-zinc-400 truncate">{ep.title}</span>
                        {ep.hasFile && ep.episodeFile?.quality?.quality?.name && (
                            <span className="text-[9px] font-bold text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
                                {ep.episodeFile.quality.quality.name}
                            </span>
                        )}
                        {!ep.hasFile && <span className="text-[9px] text-zinc-700 font-bold">MISSING</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// My Media Card
// ──────────────────────────────────────────────
function MyMediaCard({ item, viewMode }: { item: any; viewMode: 'grid' | 'list' }) {
    const [expanded, setExpanded] = useState(false);
    const isSeries = !!item.seasons;
    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || item.remotePoster;
    const totalEps = item.statistics?.totalEpisodeCount || 0;
    const haveEps = item.statistics?.episodeFileCount || 0;
    const pct = totalEps > 0 ? Math.round((haveEps / totalEps) * 100) : (item.hasFile ? 100 : 0);
    const sizeMb = item.statistics?.sizeOnDisk || item.movieFile?.size || 0;
    const sizeStr = sizeMb > 1e9 ? `${(sizeMb / 1e9).toFixed(1)} GB` : sizeMb > 1e6 ? `${(sizeMb / 1e6).toFixed(0)} MB` : '';
    const qualityName = item.movieFile?.quality?.quality?.name || item.statistics?.qualityName || '';

    if (viewMode === 'list') {
        return (
            <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 flex gap-4 hover:border-zinc-800 transition-all">
                <div className="w-14 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                    {poster ? <img src={poster} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-800">{isSeries ? <Tv size={16} /> : <Film size={16} />}</div>}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{item.title}</span>
                        <span className="text-[9px] font-black text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">{item.instanceName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 flex-wrap">
                        {item.year && <span className="flex items-center gap-1"><Calendar size={10} />{item.year}</span>}
                        {qualityName && <span className="flex items-center gap-1 text-indigo-400"><Star size={10} />{qualityName}</span>}
                        {sizeStr && <span className="flex items-center gap-1"><HardDrive size={10} />{sizeStr}</span>}
                        {isSeries && <span className="flex items-center gap-1"><Percent size={10} />{pct}%</span>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="group flex flex-col bg-[#090909] border border-zinc-900 hover:border-zinc-800 rounded-[2rem] overflow-hidden transition-all duration-300 shadow-xl hover:-translate-y-0.5">
            {/* Poster */}
            <div className="relative aspect-[2/3] overflow-hidden">
                {poster
                    ? <img src={poster} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    : <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">{isSeries ? <Tv size={48} /> : <Film size={48} />}</div>}

                {/* Availability bar for series */}
                {isSeries && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-900">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                )}

                {/* Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent opacity-90" />
                <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                    {qualityName && (
                        <span className="px-2 py-1 rounded-lg text-[9px] font-black bg-black/60 backdrop-blur-sm border border-white/10 text-indigo-300">
                            {qualityName}
                        </span>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                        {sizeStr && <span className="px-2 py-1 rounded-lg text-[9px] font-black bg-black/60 backdrop-blur-sm border border-white/10 text-zinc-400">{sizeStr}</span>}
                    </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-base font-black text-white leading-tight line-clamp-2 drop-shadow-lg">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400 font-bold">
                        {item.year && <span>{item.year}</span>}
                        {isSeries && <><span className="opacity-40">•</span><span className="text-emerald-400">{pct}% complete</span></>}
                        <span className="opacity-30">•</span>
                        <span className="truncate text-zinc-500">{item.instanceName}</span>
                    </div>
                </div>
            </div>

            {/* Episode Expand (series only) */}
            {isSeries && (
                <div className="px-4 pb-4">
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="w-full flex items-center justify-between py-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-600 hover:text-zinc-300 transition-colors"
                    >
                        <span className="flex items-center gap-1.5"><PlayCircle size={12} /> {item.statistics?.episodeCount || 0} Episodes</span>
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {expanded && <EpisodeList instanceId={item.instanceId} seriesId={item.id} />}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────
// Discovery Card
// ──────────────────────────────────────────────
function DiscoveryCard({ item, isAdding, hasBeenAdded, onAdd, viewMode }: {
    item: any; isAdding: boolean; hasBeenAdded: boolean; onAdd: () => void; viewMode: 'grid' | 'list';
}) {
    const poster = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || item.remotePoster;
    const rating = item.ratings?.value;
    const platform = getPlatformBadge(item);

    if (viewMode === 'list') {
        return (
            <div className="group bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 flex gap-5 hover:border-zinc-800 transition-all items-center">
                <div className="w-16 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0">
                    {poster ? <img src={poster} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-800"><Film size={20} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-white truncate">{item.title}</h3>
                        {platform && <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${platform.color}`}>{platform.label}</span>}
                        {hasBeenAdded && <span className="px-2 py-0.5 rounded text-[9px] font-black border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">IN LIBRARY</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                        {item.year && <span>{item.year}</span>}
                        {rating != null && <span className="text-amber-500 font-bold">★ {rating.toFixed(1)}</span>}
                        {item.genres?.length > 0 && <span className="truncate">{item.genres.slice(0, 2).join(', ')}</span>}
                    </div>
                </div>
                <button
                    onClick={onAdd}
                    disabled={isAdding || hasBeenAdded}
                    className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 ${hasBeenAdded ? 'text-emerald-500/50 bg-zinc-900' : 'bg-white text-black hover:bg-emerald-400'}`}
                >
                    {isAdding ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : hasBeenAdded ? <CheckCircle size={14} /> : <Plus size={14} />}
                    {isAdding ? 'Adding' : hasBeenAdded ? 'Added' : 'Add'}
                </button>
            </div>
        );
    }

    return (
        <div className="group flex flex-col bg-[#090909] border border-zinc-900 hover:border-zinc-800 rounded-[2rem] overflow-hidden transition-all duration-500 shadow-2xl hover:-translate-y-1">
            <div className="relative aspect-[2/3] overflow-hidden">
                {poster
                    ? <img src={poster} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    : <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800"><Film size={48} /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent opacity-90" />
                <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                    <div className="flex flex-col gap-1.5">
                        {platform && <span className={`w-fit px-2.5 py-1 rounded-lg text-[9px] font-black border backdrop-blur-sm ${platform.color}`}>{platform.label}</span>}
                        {rating != null && <span className="w-fit flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-black text-amber-400">★ {rating.toFixed(1)}</span>}
                    </div>
                    {hasBeenAdded && <div className="p-1.5 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.6)]"><CheckCircle size={14} className="text-black" /></div>}
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-base font-black text-white leading-tight line-clamp-2 drop-shadow-lg">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 font-bold">
                        {item.year && <span>{item.year}</span>}
                        {item.genres?.length > 0 && <><span className="opacity-40">•</span><span className="truncate">{item.genres.slice(0, 2).join(' / ')}</span></>}
                    </div>
                </div>
            </div>
            <div className="p-5 pt-2">
                <p className="text-xs text-zinc-600 line-clamp-2 mb-4 h-8">{item.overview || ''}</p>
                <button
                    onClick={onAdd}
                    disabled={isAdding || hasBeenAdded}
                    className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${hasBeenAdded ? 'bg-zinc-900/50 text-emerald-500/40 cursor-not-allowed' : 'bg-white text-black hover:bg-emerald-400 shadow-lg'}`}
                >
                    {isAdding ? <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" /> : hasBeenAdded ? <CheckCircle size={14} /> : <Plus size={14} />}
                    {isAdding ? 'Adding...' : hasBeenAdded ? 'In Library' : 'Add to Library'}
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function DiscoverPage() {
    const [pageMode, setPageMode] = useState<'discover' | 'mylibrary'>('discover');
    const [mediaType, setMediaType] = useState<'movie' | 'series'>('series');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [libraryItems, setLibraryItems] = useState<any[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);

    // Library cross-reference set (tmdbIds + tvdbIds that are in library)
    const [librarySet, setLibrarySet] = useState<Set<number>>(new Set());

    // Instances & config
    const [instances, setInstances] = useState<Instance[]>([]);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
    const [profiles, setProfiles] = useState<QualityProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number>(0);
    const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
    const [selectedRootFolderId, setSelectedRootFolderId] = useState<number>(0);

    // UI
    const [addingItemStr, setAddingItemStr] = useState<string>('');
    const [showFilters, setShowFilters] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [startSearch, setStartSearch] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);

    // Filters
    const [filterGenre, setFilterGenre] = useState<string>('All');
    const [filterPlatform, setFilterPlatform] = useState<string>('All');
    const [filterYear, setFilterYear] = useState<string>('All');
    const [sortBy, setSortBy] = useState<'popularity' | 'year' | 'alphabetical'>('popularity');

    // Reset page on filter/mode/type change
    useEffect(() => { setCurrentPage(0); }, [filterGenre, filterPlatform, filterYear, mediaType, pageMode, searchQuery]);

    // ── Load instances ──
    useEffect(() => {
        fetch('/api/instances').then(r => r.ok ? r.json() : []).then(data => {
            if (Array.isArray(data)) setInstances(data);
        });
    }, []);

    const availableInstances = instances.filter((inst: Instance) =>
        inst.type === (mediaType === 'movie' ? 'radarr' : 'sonarr')
    );

    // Auto-select first instance
    useEffect(() => {
        if (availableInstances.length > 0 && (!selectedInstanceId || !availableInstances.find(i => i.id === selectedInstanceId))) {
            setSelectedInstanceId(availableInstances[0].id);
        }
    }, [availableInstances]);

    // ── Load profiles + root folders ──
    useEffect(() => {
        if (!selectedInstanceId) return;
        const base = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';
        Promise.all([
            fetch(`${base}/profiles?instanceId=${selectedInstanceId}`).then(r => r.ok ? r.json() : []),
            fetch(`${base}/rootfolder?instanceId=${selectedInstanceId}`).then(r => r.ok ? r.json() : []),
        ]).then(([profs, folders]) => {
            const p = Array.isArray(profs) ? profs : [];
            const f = Array.isArray(folders) ? folders : [];
            setProfiles(p);
            setRootFolders(f);
            if (p.length > 0 && !selectedProfileId) setSelectedProfileId(p[0].id);
            if (f.length > 0 && !selectedRootFolderId) setSelectedRootFolderId(f[0].id);
        });
    }, [selectedInstanceId, mediaType]);

    // ── Load library (for cross-referencing) ──
    const loadLibrary = useCallback(async () => {
        const endpoint = mediaType === 'movie' ? '/api/radarr/all' : '/api/sonarr/all';
        const data = await fetch(endpoint).then(r => r.ok ? r.json() : []).catch(() => []);
        const items = Array.isArray(data) ? data : [];
        setLibraryItems(items);
        const ids = new Set<number>(items.flatMap((m: any) => [m.tmdbId, m.tvdbId].filter(Boolean)));
        setLibrarySet(ids);
    }, [mediaType]);

    useEffect(() => { loadLibrary(); }, [loadLibrary]);

    // ── Discovery: load TMDB trending ──
    const handleDiscovery = useCallback(async () => {
        setIsSearching(true);
        setResults([]);
        try {
            const type = mediaType === 'movie' ? 'movie' : 'tv';
            const res = await fetch(`/api/tmdb/trending?type=${type}`);
            if (res.ok) {
                const data = await res.json();
                setResults(Array.isArray(data) ? data : []);
                return;
            }
        } catch { /* fall through */ }

        // Fallback: Sonarr/Radarr empty-term lookup
        if (!selectedInstanceId) { setIsSearching(false); return; }
        const endpoint = mediaType === 'movie' ? '/api/radarr/lookup' : '/api/sonarr/lookup';
        const res = await fetch(`${endpoint}?instanceId=${selectedInstanceId}&term=`).catch(() => null);
        if (res?.ok) {
            const data = await res.json();
            setResults(Array.isArray(data) ? data : []);
        }
        setIsSearching(false);
    }, [mediaType, selectedInstanceId]);

    // ── Trigger discovery on load / type change ──
    useEffect(() => {
        if (pageMode === 'discover' && !searchQuery) {
            handleDiscovery();
        }
    }, [mediaType, pageMode]);

    // ── Search ──
    const handleSearch = async (e?: React.FormEvent | null) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim() || !selectedInstanceId) return;
        setIsSearching(true);
        setResults([]);
        const endpoint = mediaType === 'movie' ? '/api/radarr/lookup' : '/api/sonarr/lookup';
        const res = await fetch(`${endpoint}?instanceId=${selectedInstanceId}&term=${encodeURIComponent(searchQuery)}`).catch(() => null);
        if (res?.ok) {
            const data = await res.json();
            setResults(Array.isArray(data) ? data : []);
        } else {
            toast.error('Search failed');
        }
        setIsSearching(false);
    };

    // ── Add to library ──
    const handleAdd = async (item: any) => {
        if (!selectedInstanceId) return toast.error('Select an instance first');
        if (!selectedProfileId) return toast.error('No quality profile loaded');
        if (!selectedRootFolderId) return toast.error('No root folder loaded');

        const idStr = item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`;
        setAddingItemStr(idStr);
        const endpoint = mediaType === 'movie' ? '/api/radarr/add' : '/api/sonarr/add';
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: selectedInstanceId,
                    item,
                    qualityProfileId: selectedProfileId,
                    rootFolderPath: rootFolders.find(rf => rf.id === selectedRootFolderId)?.path || '',
                    startSearch,
                }),
            });
            if (res.ok) {
                const added = await res.json();
                toast.success(`Added ${item.title}!`);
                // Mark in library
                if (added?.id) {
                    const newId = item.tmdbId || item.tvdbId;
                    if (newId) setLibrarySet(prev => new Set([...prev, newId]));
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
            setAddingItemStr('');
        }
    };

    // ── Filtering ──
    const isInLibrary = (item: any): boolean => {
        return (typeof item.id === 'number' && item.id > 0) ||
            (item.tmdbId && librarySet.has(item.tmdbId)) ||
            (item.tvdbId && librarySet.has(item.tvdbId));
    };

    const filteredDiscovery = useMemo(() => {
        let items = [...results];
        if (searchQuery && !isSearching) {
            const q = searchQuery.toLowerCase();
            items = items.filter(i => i.title?.toLowerCase().includes(q) || i.overview?.toLowerCase().includes(q));
        }
        if (!searchQuery) items = items.filter(i => (i.ratings?.value || 0) >= 6);
        if (filterGenre !== 'All') items = items.filter(i => i.genres?.includes(filterGenre));
        if (filterPlatform !== 'All') {
            items = items.filter(i => {
                const all: string[] = [...(i.productionCompanies || []), i.studio, i.network].filter(Boolean);
                return all.includes(filterPlatform);
            });
        }
        if (filterYear !== 'All') items = items.filter(i => i.year?.toString() === filterYear);
        items.sort((a, b) => {
            if (sortBy === 'popularity') return (b.popularity || b.ratings?.votes || 0) - (a.popularity || a.ratings?.votes || 0);
            if (sortBy === 'year') return (b.year || 0) - (a.year || 0);
            return a.title?.localeCompare(b.title || '') || 0;
        });
        return items;
    }, [results, searchQuery, isSearching, filterGenre, filterPlatform, filterYear, sortBy]);

    const filteredLibrary = useMemo(() => {
        let items = [...libraryItems].filter(i =>
            i.instanceId && instances.some(inst => inst.type === (mediaType === 'movie' ? 'radarr' : 'sonarr') && inst.id === i.instanceId)
        );
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(i => i.title?.toLowerCase().includes(q));
        }
        if (filterGenre !== 'All') items = items.filter(i => i.genres?.includes(filterGenre));
        if (filterYear !== 'All') items = items.filter(i => i.year?.toString() === filterYear);
        if (sortBy === 'year') items.sort((a, b) => (b.year || 0) - (a.year || 0));
        else if (sortBy === 'alphabetical') items.sort((a, b) => a.title?.localeCompare(b.title || '') || 0);
        return items;
    }, [libraryItems, instances, mediaType, searchQuery, filterGenre, filterYear, sortBy]);

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

    const displayItems = pageMode === 'discover' ? filteredDiscovery : filteredLibrary;
    const PAGE_SIZE = 20;
    const totalPages = Math.ceil(displayItems.length / PAGE_SIZE);
    const pageItems = displayItems.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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
                {/* Discovery / My Library Toggle */}
                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50">
                    <button
                        onClick={() => setPageMode('discover')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${pageMode === 'discover' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Sparkles size={14} /> Discover
                    </button>
                    <button
                        onClick={() => setPageMode('mylibrary')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${pageMode === 'mylibrary' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <HardDrive size={14} /> My Library
                    </button>
                </div>

                {/* Movies / Series Toggle */}
                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50">
                    <button
                        onClick={() => setMediaType('movie')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${mediaType === 'movie' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-400'}`}
                    >
                        <Film size={14} /> Movies
                    </button>
                    <button
                        onClick={() => setMediaType('series')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${mediaType === 'series' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-400'}`}
                    >
                        <Tv size={14} /> Series
                    </button>
                </div>

                {/* Instance Toggles */}
                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50 overflow-x-auto gap-1 max-w-full">
                    {availableInstances.map(inst => {
                        const isSelected = selectedInstanceId === inst.id;
                        const hex = twColorToHex(inst.color);
                        return (
                            <button
                                key={inst.id}
                                onClick={() => setSelectedInstanceId(inst.id)}
                                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl border transition-all whitespace-nowrap"
                                style={isSelected ? {
                                    backgroundColor: `${hex}22`,
                                    borderColor: `${hex}66`,
                                    color: hex,
                                } : {
                                    borderColor: 'transparent',
                                    color: '#52525b',
                                }}
                            >
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                                {inst.name}
                            </button>
                        );
                    })}
                </div>

                {/* View toggle */}
                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50 ml-auto">
                    <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-600'}`}><LayoutGrid size={16} /></button>
                    <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-600'}`}><List size={16} /></button>
                </div>
            </div>

            {/* Profile selector (Discover only) */}
            {pageMode === 'discover' && (
                <div className="flex flex-wrap items-end gap-4 p-5 bg-zinc-950/40 border border-zinc-900/50 rounded-3xl backdrop-blur-md">
                    <div className="min-w-[220px] max-w-[300px]">
                        <CustomSelect
                            label="Quality Profile"
                            options={profiles}
                            value={selectedProfileId}
                            onChange={(val) => setSelectedProfileId(Number(val))}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Auto-Search</label>
                        <button
                            onClick={() => setStartSearch(!startSearch)}
                            className={`h-11 px-5 rounded-2xl border flex items-center gap-3 transition-all text-xs font-black uppercase tracking-wider ${startSearch ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                        >
                            <div className={`w-2 h-2 rounded-full ${startSearch ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
                            {startSearch ? 'Yes' : 'No'}
                        </button>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Filters</label>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`h-11 px-5 rounded-2xl border flex items-center gap-2 text-xs font-black uppercase tracking-wider transition-all ${showFilters ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                        >
                            <Filter size={14} /> {showFilters ? 'Hide' : 'Show'}
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Sidebar */}
                {showFilters && (
                    <div className="w-full lg:w-72 space-y-7 bg-zinc-950/20 p-6 rounded-3xl border border-zinc-900/50 flex-shrink-0">
                        {/* Search */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Search</label>
                            <form onSubmit={handleSearch} className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" size={16} />
                                <input
                                    type="text"
                                    placeholder="Title, keyword..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') { setSearchQuery(''); handleDiscovery(); } }}
                                    className="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all placeholder-zinc-700"
                                />
                                {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />}
                            </form>
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); handleDiscovery(); }} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 font-bold">
                                    <X size={10} /> Clear — back to trending
                                </button>
                            )}
                        </div>

                        {/* Genre Filter */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-1.5"><Tags size={11} /> Genre</label>
                            <div className="flex flex-wrap gap-1.5">
                                {ALL_GENRES.map(genre => (
                                    <button
                                        key={genre}
                                        onClick={() => setFilterGenre(genre)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${filterGenre === genre ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-transparent text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700'}`}
                                    >
                                        {genre}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Platform filter (discover only) */}
                        {pageMode === 'discover' && allPlatforms.length > 1 && (
                            <CustomSelect
                                label="Platform / Studio"
                                icon={<Monitor size={11} />}
                                options={allPlatforms.map(p => ({ id: p, name: p }))}
                                value={filterPlatform}
                                onChange={val => setFilterPlatform(val)}
                            />
                        )}

                        <CustomSelect
                            label="Year"
                            icon={<Calendar size={11} />}
                            options={allYears.map(y => ({ id: y, name: y }))}
                            value={filterYear}
                            onChange={val => setFilterYear(val)}
                        />

                        {/* Sort */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-1.5"><TrendingUp size={11} /> Sort</label>
                            <div className="space-y-1">
                                {[
                                    { id: 'popularity', label: 'Trending First' },
                                    { id: 'year', label: 'Newest First' },
                                    { id: 'alphabetical', label: 'Alphabetical' },
                                ].map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSortBy(s.id as any)}
                                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${sortBy === s.id ? 'bg-zinc-800 text-white border-zinc-700' : 'text-zinc-600 border-transparent hover:text-zinc-400'}`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Clear filters */}
                        {(filterGenre !== 'All' || filterPlatform !== 'All' || filterYear !== 'All') && (
                            <button onClick={() => { setFilterGenre('All'); setFilterPlatform('All'); setFilterYear('All'); }} className="w-full text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400 flex items-center justify-center gap-1">
                                <X size={10} /> Clear Filters
                            </button>
                        )}
                    </div>
                )}

                {/* Results */}
                <div className="flex-1 min-w-0 space-y-5">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            {pageMode === 'discover' ? (searchQuery ? `Results for "${searchQuery}"` : 'Trending Now') : 'My Library'}
                            <span className="bg-zinc-900 text-zinc-500 text-[10px] font-black px-2 py-0.5 rounded-full border border-zinc-800">
                                {displayItems.length}
                            </span>
                        </h2>
                        {pageMode === 'discover' && !showFilters && (
                            <button onClick={() => setShowFilters(true)} className="flex items-center gap-1.5 text-[10px] font-black text-zinc-500 hover:text-zinc-300 uppercase tracking-widest">
                                <Filter size={12} /> Filters
                            </button>
                        )}
                    </div>

                    {/* Grid / List */}
                    {isSearching || (pageMode === 'mylibrary' && libraryLoading) ? (
                        <div className="flex flex-col items-center justify-center py-40 gap-4">
                            <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                            <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">
                                {pageMode === 'discover' ? 'Searching...' : 'Loading library...'}
                            </p>
                        </div>
                    ) : pageItems.length > 0 ? (
                        <>
                            <div className={viewMode === 'grid'
                                ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5'
                                : 'space-y-3'
                            }>
                                {pageItems.map((item, idx) => {
                                    if (pageMode === 'mylibrary') {
                                        return <MyMediaCard key={`${item.instanceId}-${item.id}-${idx}`} item={item} viewMode={viewMode} />;
                                    }
                                    const idStr = item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`;
                                    return (
                                        <DiscoveryCard
                                            key={idStr}
                                            item={item}
                                            isAdding={addingItemStr === idStr}
                                            hasBeenAdded={isInLibrary(item)}
                                            onAdd={() => handleAdd(item)}
                                            viewMode={viewMode}
                                        />
                                    );
                                })}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-4 pt-4">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                                        disabled={currentPage === 0}
                                        className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 text-xs font-black uppercase tracking-widest hover:border-zinc-700 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                    >← Prev</button>
                                    <span className="text-zinc-600 text-xs font-bold">Page {currentPage + 1} of {totalPages}</span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={currentPage >= totalPages - 1}
                                        className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 text-xs font-black uppercase tracking-widest hover:border-zinc-700 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                    >Next →</button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-40 bg-zinc-950/20 rounded-[3rem] border border-zinc-900/50 gap-6">
                            <div className="p-8 bg-zinc-900/50 rounded-full opacity-20">
                                <Search size={64} />
                            </div>
                            <div className="text-center">
                                <p className="text-xl font-bold text-white mb-2">
                                    {pageMode === 'mylibrary' ? 'Library is empty' : 'No results found'}
                                </p>
                                <p className="text-zinc-500 font-medium">
                                    {pageMode === 'mylibrary' ? 'Add media in Discover mode.' : 'Try adjusting your filters.'}
                                </p>
                            </div>
                            {(filterGenre !== 'All' || filterPlatform !== 'All' || filterYear !== 'All' || searchQuery) && (
                                <button
                                    onClick={() => { setFilterGenre('All'); setFilterPlatform('All'); setFilterYear('All'); setSearchQuery(''); handleDiscovery(); }}
                                    className="px-6 py-3 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all border border-zinc-800"
                                >
                                    Reset All Filters
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

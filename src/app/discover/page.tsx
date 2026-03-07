'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, Film, Tv, CheckCircle,
    Filter, X, Star, Calendar, Globe,
    LayoutGrid, List, Sparkles, TrendingUp,
    ChevronDown, ChevronRight, Tags, Monitor
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

interface Instance {
    id: string;
    name: string;
    type: 'radarr' | 'sonarr';
    color: string;
}

interface QualityProfile {
    id: number;
    name: string;
}

interface RootFolder {
    id: number;
    path: string;
    freeSpace: number;
}

export default function DiscoverPage() {
    const [mediaType, setMediaType] = useState<'movie' | 'series'>('series');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<any[]>([]);

    // Configuration Data
    const [instances, setInstances] = useState<Instance[]>([]);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
    const [profiles, setProfiles] = useState<QualityProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number>(0);
    const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
    const [selectedRootFolderId, setSelectedRootFolderId] = useState<number>(0);

    // UI state
    const [addingItemStr, setAddingItemStr] = useState<string>('');
    const [showFilters, setShowFilters] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Filtering State
    const [filterGenre, setFilterGenre] = useState<string>('All');
    const [filterPlatform, setFilterPlatform] = useState<string>('All');
    const [filterYear, setFilterYear] = useState<string>('All');
    const [sortBy, setSortBy] = useState<'popularity' | 'year' | 'alphabetical'>('popularity');

    // Load instances on mount
    useEffect(() => {
        const fetchInstances = async () => {
            try {
                const res = await fetch('/api/instances');
                const data = await res.json();
                if (data) {
                    setInstances(data);
                }
            } catch (error) {
                console.error("Failed to fetch instances", error);
            }
        };
        fetchInstances();
    }, []);

    // Filter instances based on selected media type
    const availableInstances = instances.filter(inst => inst.type === (mediaType === 'movie' ? 'radarr' : 'sonarr'));

    // Select the first valid instance automatically when mediaType changes
    useEffect(() => {
        if (availableInstances.length > 0 && (!selectedInstanceId || !availableInstances.find(i => i.id === selectedInstanceId))) {
            setSelectedInstanceId(availableInstances[0].id);
        }
    }, [mediaType, availableInstances, selectedInstanceId]);

    // Load configs (Profiles, RootFolders) when instance changes
    useEffect(() => {
        if (!selectedInstanceId) {
            setProfiles([]);
            setRootFolders([]);
            return;
        }

        const fetchConfigs = async () => {
            try {
                const basePath = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';

                const rootRes = await fetch(`${basePath}/rootfolder?instanceId=${selectedInstanceId}`);
                if (rootRes.ok) {
                    const data = await rootRes.json();
                    setRootFolders(data);
                    if (data.length > 0) setSelectedRootFolderId(data[0].id);
                }

                const profileRes = await fetch(`/api/profiles?instanceId=${selectedInstanceId}`);
                if (profileRes.ok) {
                    const pData = await profileRes.json();
                    setProfiles(pData);
                    if (pData.length > 0) setSelectedProfileId(pData[0].id);
                }
            } catch (error) {
                console.error("Error fetching configs for instance", error);
            }
        };

        fetchConfigs();
    }, [selectedInstanceId, mediaType, instances]);

    // Initial load: Fetch trending
    useEffect(() => {
        if (selectedInstanceId) {
            handleSearch(null, true);
        }
    }, [selectedInstanceId, mediaType]);

    const handleSearch = async (e?: React.FormEvent | null, isDiscovery = false) => {
        if (e) e.preventDefault();
        if (!selectedInstanceId) return;

        setIsSearching(true);
        // If it's a new search, clear results to show loading
        if (!isDiscovery || results.length === 0) setResults([]);

        try {
            const endpoint = mediaType === 'movie' ? `/api/radarr/lookup` : `/api/sonarr/lookup`;
            const term = isDiscovery ? '' : searchQuery;
            const res = await fetch(`${endpoint}?instanceId=${selectedInstanceId}&term=${encodeURIComponent(term)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(Array.isArray(data) ? data : []);
            } else {
                toast.error("Failed to fetch results");
            }
        } catch (error) {
            console.error("Search error:", error);
            toast.error("An error occurred during search");
        } finally {
            setIsSearching(false);
        }
    };

    const handleAdd = async (item: any) => {
        if (!selectedInstanceId) return toast.error("Please select an instance");
        if (!selectedProfileId) return toast.error("Please select a quality profile");
        if (!selectedRootFolderId) return toast.error("Please select a root folder");

        const idStr = item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`;
        setAddingItemStr(idStr);

        try {
            const endpoint = mediaType === 'movie' ? `/api/radarr/add` : `/api/sonarr/add`;
            const payload = mediaType === 'movie' ? {
                title: item.title,
                qualityProfileId: selectedProfileId,
                tmdbId: item.tmdbId,
                year: item.year,
                monitored: true,
                rootFolderPath: rootFolders.find(rf => rf.id === selectedRootFolderId)?.path,
                addOptions: { searchForMovie: true }
            } : {
                title: item.title,
                qualityProfileId: selectedProfileId,
                tvdbId: item.tvdbId,
                monitored: true,
                rootFolderPath: rootFolders.find(rf => rf.id === selectedRootFolderId)?.path,
                seasonFolder: true,
                addOptions: { searchForMissingEpisodes: true }
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: selectedInstanceId,
                    [mediaType === 'movie' ? 'movieData' : 'seriesData']: payload
                })
            });

            if (res.ok) {
                toast.success(`Successfully added ${item.title}!`);
                setResults(prev => prev.map(r => r === item ? { ...r, added: true } : r));
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to add media");
            }
        } catch (error) {
            console.error("Add error:", error);
            toast.error("An error occurred while adding");
        } finally {
            setAddingItemStr('');
        }
    };

    // --- Dynamic Filters Logic ---
    const allGenres = useMemo(() => {
        const genres = new Set<string>();
        results.forEach(item => item.genres?.forEach((g: string) => genres.add(g)));
        return ['All', ...Array.from(genres).sort()];
    }, [results]);

    const allPlatforms = useMemo(() => {
        const platforms = new Set<string>();
        results.forEach(item => {
            const p = item.studio || item.network;
            if (p) platforms.add(p);
        });
        return ['All', ...Array.from(platforms).sort()];
    }, [results]);

    const allYears = useMemo(() => {
        const years = new Set<string>();
        results.forEach(item => { if (item.year) years.add(item.year.toString()); });
        return ['All', ...Array.from(years).sort((a, b) => Number(b) - Number(a))];
    }, [results]);

    const filteredResults = useMemo(() => {
        let items = [...results];

        // 1. Text Search (if searching locally within trending or results)
        if (searchQuery && !isSearching) {
            const q = searchQuery.toLowerCase();
            items = items.filter(item =>
                item.title.toLowerCase().includes(q) ||
                item.overview?.toLowerCase().includes(q)
            );
        }

        // 2. Genre Filter
        if (filterGenre !== 'All') {
            items = items.filter(item => item.genres?.includes(filterGenre));
        }

        // 3. Platform Filter
        if (filterPlatform !== 'All') {
            items = items.filter(item => (item.studio || item.network) === filterPlatform);
        }

        // 4. Year Filter
        if (filterYear !== 'All') {
            items = items.filter(item => item.year?.toString() === filterYear);
        }

        // 5. Sorting
        items.sort((a, b) => {
            if (sortBy === 'year') return (b.year || 0) - (a.year || 0);
            if (sortBy === 'alphabetical') return a.title.localeCompare(b.title);
            // Default to natural API order (usually popularity)
            return 0;
        });

        return items;
    }, [results, searchQuery, filterGenre, filterPlatform, filterYear, sortBy, isSearching]);

    // Platform Badge Logic
    const getPlatformBadge = (item: any) => {
        const platform = (item.studio || item.network || '').toLowerCase();
        if (platform.includes('netflix')) return { label: 'Netflix', color: 'bg-red-600/20 text-red-400 border-red-500/30' };
        if (platform.includes('disney')) return { label: 'Disney+', color: 'bg-blue-600/20 text-blue-400 border-blue-500/30' };
        if (platform.includes('hbo') || platform.includes('max')) return { label: 'HBO Max', color: 'bg-purple-600/20 text-purple-400 border-purple-500/30' };
        if (platform.includes('amazon') || platform.includes('prime')) return { label: 'Prime Video', color: 'bg-sky-600/20 text-sky-400 border-sky-500/30' };
        if (platform.includes('apple')) return { label: 'Apple TV+', color: 'bg-zinc-600/20 text-zinc-400 border-zinc-500/30' };
        if (platform.includes('hulu')) return { label: 'Hulu', color: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' };
        if (platform.includes('paramount')) return { label: 'Paramount+', color: 'bg-blue-600/20 text-blue-400 border-blue-500/30' };
        return platform ? { label: item.studio || item.network, color: 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30' } : null;
    };

    const isDiscoveryMode = useMemo(() => results.length > 0 && !isSearching && !searchQuery, [results.length, isSearching, searchQuery]);

    return (
        <div className="max-w-[1600px] mx-auto px-4 py-8 animate-in fade-in duration-700">
            <Toaster position="top-right" toastOptions={{ style: { background: '#111111', color: '#fff', border: '1px solid #222' } }} />

            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 border-b border-zinc-900 pb-10">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                            <Sparkles className="text-emerald-500" size={32} />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
                                Discover Media
                            </h1>
                            <p className="text-zinc-500 font-medium">Explore trending content and expand your library instantly.</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch gap-4">
                    {/* Media Type Switcher */}
                    <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50 shadow-2xl">
                        <button
                            onClick={() => setMediaType('movie')}
                            className={`flex items-center gap-2.5 px-6 py-3 text-sm font-bold rounded-xl transition-all ${mediaType === 'movie' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_20px_rgba(79,70,229,0.15)]' : 'text-zinc-500 hover:text-zinc-400'}`}
                        >
                            <Film size={18} /> Movies
                        </button>
                        <button
                            onClick={() => setMediaType('series')}
                            className={`flex items-center gap-2.5 px-6 py-3 text-sm font-bold rounded-xl transition-all ${mediaType === 'series' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'text-zinc-500 hover:text-zinc-400'}`}
                        >
                            <Tv size={18} /> Series
                        </button>
                    </div>

                    {/* View Controls */}
                    <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/50">
                        <button onClick={() => setViewMode('grid')} className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-600'}`} title="Grid View">
                            <LayoutGrid size={20} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-3 rounded-xl transition-all ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-600'}`} title="List View">
                            <List size={20} />
                        </button>
                        <div className="w-[1px] bg-zinc-800 mx-2 my-2" />
                        <button onClick={() => setShowFilters(!showFilters)} className={`p-3 rounded-xl transition-all ${showFilters ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-600'}`} title="Toggle Filters">
                            <Filter size={20} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Sidebar Filters */}
                {showFilters && (
                    <div className="w-full lg:w-80 space-y-8 bg-zinc-950/20 p-6 rounded-3xl border border-zinc-900/50 animate-in slide-in-from-left-4 duration-500">
                        {/* Search Bar */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Search</label>
                            <form onSubmit={(e) => handleSearch(e)} className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-emerald-500 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Title, actor, keyword..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all placeholder-zinc-700"
                                />
                                {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />}
                            </form>
                        </div>

                        {/* Destination Instance */}
                        <div className="space-y-4 pt-4 border-t border-zinc-900/50">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Globe size={12} /> Target Library
                            </label>
                            <div className="grid grid-cols-1 gap-3">
                                <select
                                    className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                    value={selectedInstanceId}
                                    onChange={(e) => setSelectedInstanceId(e.target.value)}
                                >
                                    {availableInstances.map(inst => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
                                </select>
                                <select
                                    className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                    value={selectedProfileId}
                                    onChange={(e) => setSelectedProfileId(Number(e.target.value))}
                                >
                                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="space-y-6 pt-4 border-t border-zinc-900/50">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Tags size={12} /> Genre
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {allGenres.slice(0, 12).map(genre => (
                                        <button
                                            key={genre}
                                            onClick={() => setFilterGenre(genre)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterGenre === genre ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-transparent text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700'}`}
                                        >
                                            {genre}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Monitor size={12} /> Platform
                                </label>
                                <select
                                    className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-xs font-bold text-zinc-400 focus:ring-2 focus:ring-emerald-500/20 outline-none cursor-pointer"
                                    value={filterPlatform}
                                    onChange={(e) => setFilterPlatform(e.target.value)}
                                >
                                    {allPlatforms.slice(0, 20).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Calendar size={12} /> Year
                                </label>
                                <select
                                    className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-xs font-bold text-zinc-400 focus:ring-2 focus:ring-emerald-500/20 outline-none cursor-pointer"
                                    value={filterYear}
                                    onChange={(e) => setFilterYear(e.target.value)}
                                >
                                    {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <TrendingUp size={12} /> Sort By
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { id: 'popularity', label: 'Trending First', icon: Sparkles },
                                        { id: 'year', label: 'Newest First', icon: Calendar },
                                        { id: 'alphabetical', label: 'Alphabetical', icon: List }
                                    ].map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setSortBy(item.id as any)}
                                            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all border ${sortBy === item.id ? 'bg-zinc-800 text-white border-zinc-700 shadow-xl' : 'text-zinc-600 border-transparent hover:text-zinc-400'}`}
                                        >
                                            <item.icon size={14} /> {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Results Area */}
                <div className="flex-1 space-y-6">
                    {/* Active Filters Display */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-white">
                                {isDiscoveryMode ? 'Trending Now' : `Results for "${searchQuery}"`}
                            </h2>
                            <span className="bg-zinc-900 text-zinc-500 text-[10px] font-black px-2 py-0.5 rounded-full border border-zinc-800">
                                {filteredResults.length} ITEMS
                            </span>
                        </div>

                        {(filterGenre !== 'All' || filterPlatform !== 'All' || filterYear !== 'All') && (
                            <button
                                onClick={() => { setFilterGenre('All'); setFilterPlatform('All'); setFilterYear('All'); }}
                                className="text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400 flex items-center gap-1"
                            >
                                <X size={12} /> Clear Filters
                            </button>
                        )}
                    </div>

                    {filteredResults.length > 0 ? (
                        <div className={viewMode === 'grid'
                            ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6"
                            : "space-y-4"
                        }>
                            {filteredResults.map((item, idx) => {
                                const idStr = item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`;
                                const posterUrl = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl;
                                const isAdding = addingItemStr === idStr;
                                const hasBeenAdded = item.added;
                                const platform = getPlatformBadge(item);
                                const rating = item.ratings?.value;

                                if (viewMode === 'list') {
                                    return (
                                        <div key={idStr} className="group bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 flex gap-6 hover:border-zinc-800 transition-all items-center">
                                            <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                                                {posterUrl ? <img src={posterUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-800"><Film size={24} /></div>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <h3 className="font-bold text-white truncate text-lg">{item.title}</h3>
                                                    {platform && (
                                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${platform.color}`}>{platform.label}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-zinc-500 font-medium">
                                                    <span className="flex items-center gap-1"><Calendar size={12} /> {item.year}</span>
                                                    {rating && <span className="flex items-center gap-1 text-amber-500/80"><Star size={12} fill="currentColor" /> {rating.toFixed(1)}</span>}
                                                    <span className="truncate max-w-[200px]">{item.genres?.slice(0, 2).join(', ')}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleAdd(item)}
                                                disabled={isAdding || hasBeenAdded}
                                                className={`px-6 py-3 rounded-xl font-black text-xs transition-all flex items-center gap-2 ${hasBeenAdded ? 'bg-zinc-900 text-emerald-500/50' : 'bg-white text-black hover:bg-emerald-400 hover:text-black shadow-lg shadow-white/5'}`}
                                            >
                                                {isAdding ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : hasBeenAdded ? <CheckCircle size={14} /> : <Plus size={14} />}
                                                {isAdding ? 'ADDING' : hasBeenAdded ? 'ADDED' : 'ADD'}
                                            </button>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={idStr}
                                        className="group flex flex-col bg-[#090909] border border-zinc-900 hover:border-zinc-800 rounded-[2rem] overflow-hidden transition-all duration-500 shadow-2xl hover:translate-y-[-4px]"
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                    >
                                        {/* Poster Section */}
                                        <div className="relative aspect-[2/3] overflow-hidden group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] transition-all duration-500">
                                            {posterUrl ? (
                                                <img src={posterUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out" />
                                            ) : (
                                                <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center text-zinc-800">
                                                    <Film size={48} />
                                                </div>
                                            )}

                                            {/* Top Overlays */}
                                            <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
                                                <div className="flex flex-col gap-2">
                                                    {platform && (
                                                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider backdrop-blur-md border shadow-2xl ${platform.color}`}>
                                                            {platform.label}
                                                        </span>
                                                    )}
                                                    {rating && (
                                                        <span className="w-fit flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-black text-amber-400 shadow-2xl">
                                                            <Star size={12} fill="currentColor" /> {rating.toFixed(1)}
                                                        </span>
                                                    )}
                                                </div>

                                                {hasBeenAdded && (
                                                    <div className="p-2 bg-emerald-500 rounded-full text-white shadow-[0_0_20px_rgba(16,185,129,0.5)] border border-emerald-400/30">
                                                        <CheckCircle size={16} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Gradient Bottom */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent opacity-90 transition-opacity group-hover:opacity-70 duration-500" />

                                            {/* Title & Metadata (Inside Poster) */}
                                            <div className="absolute bottom-6 left-6 right-6 z-20">
                                                <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                                                    <h3 className="text-xl font-black text-white leading-tight mb-2 line-clamp-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                                                        {item.title}
                                                    </h3>
                                                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                                        <span>{item.year || 'TBA'}</span>
                                                        <span className="w-1 h-1 bg-zinc-800 rounded-full" />
                                                        <span className="truncate">{item.genres?.slice(0, 2).join(' / ')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions Section */}
                                        <div className="p-6 pt-2 bg-[#090909]">
                                            <p className="text-sm text-zinc-500 font-medium line-clamp-2 mb-6 h-10 overflow-hidden leading-relaxed">
                                                {item.overview || 'The journey of this masterpiece awaits discovery.'}
                                            </p>

                                            <button
                                                onClick={() => handleAdd(item)}
                                                disabled={isAdding || hasBeenAdded}
                                                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.1em] transition-all duration-300 flex items-center justify-center gap-3 active:scale-95 ${hasBeenAdded
                                                    ? 'bg-zinc-900/50 text-emerald-500/40 border border-zinc-800/30 cursor-not-allowed'
                                                    : 'bg-white text-black hover:bg-emerald-400 shadow-[0_10px_20px_rgba(255,255,255,0.05)] hover:shadow-[0_10px_20px_rgba(16,185,129,0.2)]'
                                                    }`}
                                            >
                                                {isAdding ? (
                                                    <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                                                ) : hasBeenAdded ? (
                                                    <CheckCircle size={16} />
                                                ) : (
                                                    <Plus size={16} />
                                                )}
                                                {isAdding ? 'PROCESSING' : hasBeenAdded ? 'IN LIBRARY' : 'ADD TO LIBRARY'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-40 bg-zinc-950/20 rounded-[3rem] border border-zinc-900/50">
                            {isSearching ? (
                                <div className="space-y-6">
                                    <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto shadow-[0_0_30px_rgba(16,185,129,0.1)]" />
                                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Curating your recommendations...</p>
                                </div>
                            ) : (
                                <div className="space-y-6 flex flex-col items-center">
                                    <div className="p-8 bg-zinc-900/50 rounded-full grayscale opacity-20">
                                        <Search size={64} />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-white mb-2">No matching media found</p>
                                        <p className="text-zinc-500 font-medium">Try adjusting your filters or search for something else.</p>
                                    </div>
                                    <button
                                        onClick={() => { setFilterGenre('All'); setFilterPlatform('All'); setFilterYear('All'); setSearchQuery(''); }}
                                        className="mt-4 px-8 py-3 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all border border-zinc-800"
                                    >
                                        Reset Discovery
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}



'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, Film, Tv, CheckCircle, ExternalLink, HardDrive } from 'lucide-react';
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

    // Load instances on mount
    useEffect(() => {
        const fetchInstances = async () => {
            try {
                const res = await fetch('/api/instances');
                const data = await res.json();
                if (data.success) {
                    setInstances(data.data);
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
                // Fetch profiles via our unified profiles route (we'll build this route later, or use existing)
                // For now, let's build dedicated proxy endpoints or build a unified /api/profiles
                const instance = instances.find(i => i.id === selectedInstanceId);
                if (!instance) return;

                // Let's rely on standard routes
                const basePath = mediaType === 'movie' ? '/api/radarr' : '/api/sonarr';

                // We actually don't have a specific `get profiles` dedicated route yet for Discover alone,
                // But we CAN build one globally if it doesn't exist.
                // Wait, we need to add `profiles` and `rootfolder` fetching endpoints if missing.
                // I've already made `rootfolder` endpoints! 
                const rootRes = await fetch(`${basePath}/rootfolder?instanceId=${selectedInstanceId}`);
                if (rootRes.ok) {
                    const data = await rootRes.json();
                    setRootFolders(data);
                    if (data.length > 0) setSelectedRootFolderId(data[0].id);
                }

                // Temporary inline fetch proxy for profiles until we build the full global profiles hub
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

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || !selectedInstanceId) return;

        setIsSearching(true);
        setResults([]);

        try {
            const endpoint = mediaType === 'movie' ? `/api/radarr/lookup` : `/api/sonarr/lookup`;
            const res = await fetch(`${endpoint}?instanceId=${selectedInstanceId}&term=${encodeURIComponent(searchQuery)}`);
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
                // Optimistically mark as added in the UI
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

    return (
        <div className="max-w-6xl mx-auto px-6 animate-in fade-in duration-500">
            <Toaster position="top-right" toastOptions={{ style: { background: '#18181b', color: '#fff', border: '1px solid #27272a' } }} />

            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-900 pb-6 mb-8 gap-4">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
                        <Search className="text-emerald-500" size={32} />
                        Discover Media
                    </h1>
                    <p className="text-zinc-400 mt-2 text-lg">Search TMDB/TVDB and add media directly to your instances.</p>
                </div>
            </div>

            {/* Discovery Configuration Panel */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 mb-8 shadow-lg">
                <form onSubmit={handleSearch} className="flex flex-col gap-6">
                    {/* Top Row: Media Type & Search */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex bg-zinc-950/80 rounded-lg p-1 border border-zinc-800/80 shadow-inner w-full md:w-fit">
                            <button
                                type="button"
                                onClick={() => setMediaType('movie')}
                                className={`flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-md transition-all flex-1 md:flex-none ${mediaType === 'movie' ? 'bg-indigo-600/20 text-indigo-400 shadow-sm border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <Film size={16} /> Movies
                            </button>
                            <button
                                type="button"
                                onClick={() => setMediaType('series')}
                                className={`flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-md transition-all flex-1 md:flex-none ${mediaType === 'series' ? 'bg-emerald-600/20 text-emerald-400 shadow-sm border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <Tv size={16} /> Series
                            </button>
                        </div>

                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder={`Search for a ${mediaType === 'movie' ? 'Movie' : 'TV Show'}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950/80 border border-zinc-700/50 text-white text-base rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-3 outline-none placeholder-zinc-500 shadow-inner"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isSearching || !searchQuery.trim()}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSearching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Search"}
                        </button>
                    </div>

                    {/* Bottom Row: Destination Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-800/60">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Destination Instance</label>
                            <select
                                value={selectedInstanceId}
                                onChange={(e) => setSelectedInstanceId(e.target.value)}
                                className="bg-zinc-950/50 border border-zinc-700/50 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none cursor-pointer"
                            >
                                {availableInstances.length === 0 && <option value="" disabled>No {mediaType === 'movie' ? 'Radarr' : 'Sonarr'} instances configured</option>}
                                {availableInstances.map(inst => (
                                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Quality Profile</label>
                            <select
                                value={selectedProfileId}
                                onChange={(e) => setSelectedProfileId(Number(e.target.value))}
                                disabled={profiles.length === 0}
                                className="bg-zinc-950/50 border border-zinc-700/50 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none cursor-pointer disabled:opacity-50"
                            >
                                {profiles.length === 0 && <option value={0} disabled>Loading profiles...</option>}
                                {profiles.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1"><HardDrive size={12} /> Root Folder</label>
                            <select
                                value={selectedRootFolderId}
                                onChange={(e) => setSelectedRootFolderId(Number(e.target.value))}
                                disabled={rootFolders.length === 0}
                                className="bg-zinc-950/50 border border-zinc-700/50 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none cursor-pointer disabled:opacity-50"
                            >
                                {rootFolders.length === 0 && <option value={0} disabled>Loading folders...</option>}
                                {rootFolders.map(rf => (
                                    <option key={rf.id} value={rf.id}>{rf.path} ({(rf.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free)</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </form>
            </div>

            {/* Results Grid */}
            {results.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {results.map((item: any) => {
                        const idStr = item.tmdbId ? `tmdb-${item.tmdbId}` : `tvdb-${item.tvdbId}`;
                        const posterUrl = item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl;
                        const isAdding = addingItemStr === idStr;
                        const hasBeenAdded = item.added; // we pessimistically injected this on success

                        return (
                            <div key={idStr} className="group flex flex-col bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden transition-all shadow-lg hover:shadow-xl hover:shadow-emerald-900/10 h-full relative">
                                <div className="absolute top-2 right-2 z-10">
                                    {hasBeenAdded && (
                                        <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md flex items-center gap-1">
                                            <CheckCircle size={12} /> Added
                                        </span>
                                    )}
                                </div>

                                <div className="w-full aspect-[2/3] bg-zinc-800 relative overflow-hidden flex flex-col items-center justify-center">
                                    {posterUrl ? (
                                        <img src={posterUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 absolute inset-0 z-0" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-2 absolute inset-0 z-0 bg-zinc-800">
                                            {mediaType === 'movie' ? <Film size={32} /> : <Tv size={32} />}
                                            <span className="text-xs font-semibold">No Poster</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent opacity-90 z-10" />

                                    <div className="absolute bottom-0 left-0 w-full p-4 z-20">
                                        <h3 className="text-lg font-bold text-white leading-tight mb-1 drop-shadow-md">{item.title}</h3>
                                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300 drop-shadow-md">
                                            <span>{item.year || 'Unknown Year'}</span>
                                            {item.network && <span>• {item.network}</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col flex-1 p-4 bg-zinc-950/50">
                                    <p className="text-sm text-zinc-400 line-clamp-3 mb-4 flex-1">
                                        {item.overview || 'No overview available.'}
                                    </p>

                                    <button
                                        onClick={() => handleAdd(item)}
                                        disabled={isAdding || hasBeenAdded}
                                        className={`w-full py-2.5 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 ${hasBeenAdded
                                            ? 'bg-zinc-800 text-emerald-500 border border-zinc-700 cursor-not-allowed'
                                            : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 hover:text-emerald-300'
                                            }`}
                                    >
                                        {isAdding ? (
                                            <><div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" /> Adding...</>
                                        ) : hasBeenAdded ? (
                                            <><CheckCircle size={16} /> Already Added</>
                                        ) : (
                                            <><Plus size={16} /> Add to Library</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!isSearching && searchQuery && results.length === 0 && (
                <div className="text-center py-20 text-zinc-500">
                    <Search size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-lg">No results found for "{searchQuery}"</p>
                </div>
            )}
        </div>
    );
}


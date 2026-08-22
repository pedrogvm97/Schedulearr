'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Search, Film, Tv, Plus, CheckCircle, Loader2, HardDrive, RefreshCw, Layers, Sparkles, AlertCircle, PlayCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MediaDetailsPanel } from './MediaDetailsPanel';

interface LibraryExplorerPanelProps {
    library: { 
        id: string; 
        title: string; 
        type: string; 
        instanceName: string; 
        instanceId?: string;
        locations?: string[]; 
    };
    onClose: () => void;
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
    constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 bg-red-900/40 border border-red-500 rounded-2xl text-white font-mono text-sm overflow-auto max-w-2xl mx-auto my-12">
                    <h1 className="text-red-400 font-bold mb-3 flex items-center gap-2">
                        <AlertCircle size={20} /> Library Explorer Error
                    </h1>
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap">{this.state.error?.stack || this.state.error?.message}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

function LibraryExplorerPanelInner({ library, onClose }: LibraryExplorerPanelProps) {
    const isMovie = library.type === 'movie';
    const arrType = isMovie ? 'radarr' : 'sonarr';

    const [instances, setInstances] = useState<any[]>([]);
    const [selectedInstance, setSelectedInstance] = useState<any | null>(null);
    const [instanceFolders, setInstanceFolders] = useState<Record<string, string[]>>({});
    
    const [plexItems, setPlexItems] = useState<any[]>([]);
    const [arrItems, setArrItems] = useState<any[]>([]);
    const [loadingPlex, setLoadingPlex] = useState(true);
    const [loadingArr, setLoadingArr] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
    const [filterTab, setFilterTab] = useState<'all' | 'linked' | 'plex_only'>('all');

    // 1. Fetch available Arr instances and detect storage matching
    useEffect(() => {
        fetch('/api/instances')
            .then(res => res.ok ? res.json() : [])
            .then(async (data: any[]) => {
                const matching = (Array.isArray(data) ? data : []).filter((i: any) => i.type === arrType && i.enabled);
                setInstances(matching);

                if (matching.length === 0) {
                    setLoadingArr(false);
                    return;
                }

                // Fetch root folders for each instance to auto-detect matching path
                const folderMap: Record<string, string[]> = {};
                let bestMatch = matching[0];

                await Promise.all(matching.map(async (inst) => {
                    try {
                        const rfRes = await fetch(`/api/${inst.type}/rootfolder?instanceId=${inst.id}`);
                        if (rfRes.ok) {
                            const folders = await rfRes.json();
                            folderMap[inst.id] = (Array.isArray(folders) ? folders : []).map((f: any) => f.path);
                            
                            // Check if any Plex library location shares path with this instance root folder
                            if (library.locations && library.locations.length > 0) {
                                for (const plexLoc of library.locations) {
                                    if (folderMap[inst.id].some(fPath => plexLoc.toLowerCase().includes(fPath.toLowerCase()) || fPath.toLowerCase().includes(plexLoc.toLowerCase()))) {
                                        bestMatch = inst;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // ignore folder check failure
                    }
                }));

                setInstanceFolders(folderMap);
                setSelectedInstance(bestMatch);
            })
            .catch(() => {
                setLoadingArr(false);
            });
    }, [arrType, library.locations]);

    // 2. Fetch Plex section media items
    const fetchPlexSection = useCallback(() => {
        setLoadingPlex(true);
        const params = new URLSearchParams({
            sectionId: library.id,
            instanceName: library.instanceName || ''
        });
        if (library.instanceId) params.append('instanceId', library.instanceId);

        fetch(`/api/plex/section?${params.toString()}`)
            .then(res => res.ok ? res.json() : { items: [] })
            .then(data => {
                setPlexItems(Array.isArray(data.items) ? data.items : []);
            })
            .catch(() => setPlexItems([]))
            .finally(() => setLoadingPlex(false));
    }, [library]);

    useEffect(() => {
        fetchPlexSection();
    }, [fetchPlexSection]);

    // 3. Fetch Arr instance media items
    const fetchArrMedia = useCallback(() => {
        if (!selectedInstance) return;
        setLoadingArr(true);
        const endpoint = selectedInstance.type === 'radarr' ? '/api/radarr/all' : '/api/sonarr/all';

        fetch(endpoint)
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                // Filter to the selected instance if multiple exist
                setArrItems(list.filter((m: any) => m.instanceId === selectedInstance.id));
            })
            .catch(() => setArrItems([]))
            .finally(() => setLoadingArr(false));
    }, [selectedInstance]);

    useEffect(() => {
        fetchArrMedia();
    }, [fetchArrMedia]);

    // 4. Handle Arr / TMDB Lookup Search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        if (!selectedInstance) return;

        const delayTimer = setTimeout(() => {
            setIsSearching(true);
            const lookupEndpoint = `/api/${selectedInstance.type}/lookup?instanceId=${selectedInstance.id}&term=${encodeURIComponent(searchQuery)}`;
            
            fetch(lookupEndpoint)
                .then(res => res.ok ? res.json() : [])
                .then(data => setSearchResults(Array.isArray(data) ? data : (data.results || [])))
                .catch(() => setSearchResults([]))
                .finally(() => setIsSearching(false));
        }, 500);

        return () => clearTimeout(delayTimer);
    }, [searchQuery, selectedInstance]);

    // 5. Cross-reference Plex items with Arr items
    const combinedMedia = useMemo(() => {
        const arrMapByTmdb = new Map<number, any>();
        const arrMapByTvdb = new Map<number, any>();
        const arrMapByTitle = new Map<string, any>();

        arrItems.forEach(item => {
            if (item.tmdbId) arrMapByTmdb.set(Number(item.tmdbId), item);
            if (item.tvdbId) arrMapByTvdb.set(Number(item.tvdbId), item);
            if (item.title) {
                const norm = `${item.title.toLowerCase().trim()}_${item.year || 0}`;
                arrMapByTitle.set(norm, item);
            }
        });

        return plexItems.map(pItem => {
            let matchedArr: any = null;
            if (pItem.tmdbId && arrMapByTmdb.has(Number(pItem.tmdbId))) {
                matchedArr = arrMapByTmdb.get(Number(pItem.tmdbId));
            } else if (pItem.tvdbId && arrMapByTvdb.has(Number(pItem.tvdbId))) {
                matchedArr = arrMapByTvdb.get(Number(pItem.tvdbId));
            } else if (pItem.title) {
                const norm = `${pItem.title.toLowerCase().trim()}_${pItem.year || 0}`;
                matchedArr = arrMapByTitle.get(norm) || arrMapByTitle.get(`${pItem.title.toLowerCase().trim()}_0`);
            }

            return {
                ...pItem,
                arrMedia: matchedArr,
                isLinked: !!matchedArr
            };
        });
    }, [plexItems, arrItems]);

    // Filter media based on active tab
    const displayedMedia = useMemo(() => {
        if (filterTab === 'linked') return combinedMedia.filter(m => m.isLinked);
        if (filterTab === 'plex_only') return combinedMedia.filter(m => !m.isLinked);
        return combinedMedia;
    }, [combinedMedia, filterTab]);

    // 6. Handle Add to Arr
    const handleAdd = async (item: any) => {
        if (!selectedInstance) {
            toast.error('No Arr instance selected to add media.');
            return;
        }

        toast.info(`Adding "${item.title || item.name}" to ${selectedInstance.name}...`);
        try {
            const [profilesRes, foldersRes] = await Promise.all([
                fetch(`/api/instances/profiles?instanceId=${selectedInstance.id}`),
                fetch(`/api/${selectedInstance.type}/rootfolder?instanceId=${selectedInstance.id}`)
            ]);

            const profiles = profilesRes.ok ? await profilesRes.json() : [];
            const folders = foldersRes.ok ? await foldersRes.json() : [];

            const qualityProfileId = profiles.length > 0 ? profiles[0].id : 1;
            
            // Choose root folder: check if Plex library location matches any folder
            let rootFolderPath = folders.length > 0 ? folders[0].path : '';
            if (library.locations && library.locations.length > 0 && folders.length > 0) {
                for (const plexLoc of library.locations) {
                    const matched = folders.find((f: any) => f.path && (plexLoc.includes(f.path) || f.path.includes(plexLoc)));
                    if (matched) {
                        rootFolderPath = matched.path;
                        break;
                    }
                }
            }

            if (!rootFolderPath) {
                toast.error(`Could not find a valid root folder for ${selectedInstance.name}.`);
                return;
            }

            const res = await fetch(`/api/${selectedInstance.type}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: selectedInstance.id,
                    qualityProfileId,
                    rootFolderPath,
                    startSearch: true,
                    item: {
                        id: item.id || 0,
                        tmdbId: item.tmdbId || item.id,
                        tvdbId: item.tvdbId,
                        title: item.title || item.name,
                        year: item.year || parseInt(item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0]) || 0,
                        overview: item.overview || item.summary
                    }
                })
            });

            if (res.ok) {
                toast.success(`"${item.title || item.name}" added to ${selectedInstance.name}!`);
                fetchArrMedia();
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'Failed to add media');
            }
        } catch (e: any) {
            toast.error(e?.message || 'Error adding media');
        }
    };

    // 7. Quick Search
    const handleQuickSearch = async (payload: any) => {
        if (!selectedInstance) return;
        toast.info(`Triggering automatic search...`);
        try {
            const endpoint = selectedInstance.type === 'movie' ? '/api/radarr/command' : '/api/sonarr/command';
            const bodyPayload = selectedInstance.type === 'movie'
                ? { instanceId: selectedInstance.id, name: 'MoviesSearch', movieIds: [Number(payload.id)] }
                : { instanceId: selectedInstance.id, name: 'SeriesSearch', seriesId: Number(payload.id) };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            if (res.ok) {
                toast.success('Search command triggered successfully');
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'Failed to trigger search command');
            }
        } catch (e: any) {
            toast.error(e?.message || 'Error triggering search command');
        }
    };

    const linkedCount = combinedMedia.filter(m => m.isLinked).length;
    const plexOnlyCount = combinedMedia.length - linkedCount;

    return (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 lg:p-8 animate-in fade-in duration-300">
            <div className="bg-[#09090b] w-full max-w-7xl h-full max-h-[92vh] rounded-[2.5rem] border border-zinc-800/80 shadow-2xl flex flex-col overflow-hidden relative">
                
                {/* Header */}
                <header className="px-6 py-5 sm:px-8 sm:py-6 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 shrink-0 bg-zinc-950/60">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${isMovie ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'}`}>
                            {isMovie ? <Film size={28} /> : <Tv size={28} />}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">{library.title}</h2>
                                <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
                                    Plex {library.type}
                                </span>
                            </div>
                            
                            <div className="text-sm font-bold text-zinc-400 flex flex-wrap items-center gap-3 mt-1.5">
                                <span className="flex items-center gap-1.5 text-zinc-500">
                                    <HardDrive size={15} />
                                    {library.locations && library.locations.length > 0 ? library.locations[0] : library.instanceName}
                                </span>
                                
                                {instances.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-zinc-600">•</span>
                                        <span className="text-zinc-500 text-xs font-semibold">Linked Arr:</span>
                                        <select 
                                            className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1 text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                                            value={selectedInstance?.id || ''}
                                            onChange={(e) => setSelectedInstance(instances.find(i => i.id === e.target.value))}
                                        >
                                            {instances.map(i => (
                                                <option key={i.id} value={i.id}>
                                                    {i.name} ({i.type.toUpperCase()})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => { fetchPlexSection(); fetchArrMedia(); }}
                            title="Refresh Media"
                            className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        >
                            <RefreshCw size={18} className={loadingPlex || loadingArr ? 'animate-spin text-emerald-500' : ''} />
                        </button>
                        <button 
                            onClick={onClose} 
                            className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </header>

                {/* Sub-bar: Search & Tabs */}
                <div className="px-6 py-4 sm:px-8 border-b border-zinc-800/60 bg-zinc-950/30 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
                    {/* Search Input */}
                    <div className="relative w-full md:max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                        <input 
                            type="text"
                            placeholder={`Search to add new ${isMovie ? 'movies' : 'shows'} to ${selectedInstance?.name || 'library'}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-900/90 border border-zinc-800 rounded-2xl py-3 pl-11 pr-10 text-white text-sm font-medium focus:outline-none focus:border-emerald-500/50 transition-colors shadow-inner"
                        />
                        {isSearching ? (
                            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-500" size={16} />
                        ) : searchQuery ? (
                            <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                                <X size={16} />
                            </button>
                        ) : null}
                    </div>

                    {/* Filter Tabs */}
                    {!searchQuery && (
                        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 shrink-0">
                            <button 
                                onClick={() => setFilterTab('all')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterTab === 'all' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'}`}
                            >
                                All ({combinedMedia.length})
                            </button>
                            <button 
                                onClick={() => setFilterTab('linked')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${filterTab === 'linked' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-400 hover:text-zinc-200'}`}
                            >
                                <CheckCircle size={13} className="text-emerald-500" /> Linked ({linkedCount})
                            </button>
                            <button 
                                onClick={() => setFilterTab('plex_only')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${filterTab === 'plex_only' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-200'}`}
                            >
                                <Sparkles size={13} className="text-amber-500" /> Plex Only ({plexOnlyCount})
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Body */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                    {searchQuery ? (
                        /* Search Results */
                        <div className="space-y-6">
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                    <Search size={14} className="text-emerald-500" />
                                    Search Results for "{searchQuery}"
                                </h3>
                                <span className="text-xs text-zinc-500 font-semibold">{searchResults.length} results</span>
                            </div>

                            {searchResults.length === 0 && !isSearching ? (
                                <div className="text-center py-20 text-zinc-500">
                                    <Film size={40} className="mx-auto mb-3 text-zinc-700" />
                                    <p className="font-bold text-base text-zinc-400">No matching titles found</p>
                                    <p className="text-xs text-zinc-600 mt-1">Try another search term or check spelling.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                    {searchResults.map(item => {
                                        const isAlreadyInArr = arrItems.some(m => (item.tmdbId && m.tmdbId === item.tmdbId) || (item.tvdbId && m.tvdbId === item.tvdbId) || (item.id && m.tmdbId === item.id));
                                        const posterUrl = item.remotePoster || item.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl || (item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null);
                                        const poster = posterUrl ? (posterUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(posterUrl)}` : posterUrl) : null;

                                        return (
                                            <div key={item.id || item.tmdbId || Math.random()} className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-lg flex flex-col justify-end">
                                                {poster ? (
                                                    <img src={poster} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                                                        {isMovie ? <Film size={32} /> : <Tv size={32} />}
                                                    </div>
                                                )}
                                                <div className="relative z-10 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3.5 pt-8 flex flex-col">
                                                    <span className="text-xs font-bold text-white line-clamp-2 leading-tight">{item.title || item.name}</span>
                                                    <span className="text-[11px] text-zinc-400 font-semibold mt-1 mb-2.5">
                                                        {item.year || item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0] || 'Unknown'}
                                                    </span>

                                                    {isAlreadyInArr ? (
                                                        <div className="w-full py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-emerald-500/30">
                                                            <CheckCircle size={13} /> Monitored
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                                                            className="w-full py-2 rounded-xl bg-white hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                                                        >
                                                            <Plus size={14} /> Add to Arr
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Plex Library Grid */
                        <div className="space-y-6">
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                    <Layers size={14} className="text-amber-500" />
                                    Plex Library Items ({displayedMedia.length})
                                </h3>
                                {selectedInstance && (
                                    <span className="text-xs text-zinc-500 font-semibold">
                                        Cross-referenced with <span className="text-emerald-400 font-bold">{selectedInstance.name}</span>
                                    </span>
                                )}
                            </div>

                            {loadingPlex ? (
                                <div className="flex flex-col items-center justify-center py-24 gap-3">
                                    <Loader2 className="animate-spin text-amber-500" size={32} />
                                    <p className="text-sm font-bold text-zinc-500">Loading library contents from Plex...</p>
                                </div>
                            ) : displayedMedia.length === 0 ? (
                                <div className="text-center py-24 text-zinc-500">
                                    <Layers size={44} className="mx-auto mb-3 text-zinc-700" />
                                    <p className="font-bold text-lg text-zinc-300">No media found in this section</p>
                                    <p className="text-xs text-zinc-500 mt-1">Search above to add new titles directly into this library.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                    {displayedMedia.map(item => (
                                        <div 
                                            key={item.id} 
                                            onClick={() => setSelectedMedia(item)}
                                            className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-lg cursor-pointer hover:border-zinc-700 transition-all flex flex-col justify-end"
                                        >
                                            {item.poster ? (
                                                <img src={item.poster} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                                                    {isMovie ? <Film size={32} /> : <Tv size={32} />}
                                                </div>
                                            )}

                                            {/* Status Badge in Top-Right */}
                                            <div className="absolute top-2.5 right-2.5 z-10">
                                                {item.isLinked ? (
                                                    <div className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md">
                                                        <CheckCircle size={10} /> Arr
                                                    </div>
                                                ) : (
                                                    <div className="px-2 py-0.5 rounded-md bg-zinc-900/80 border border-zinc-700/60 text-zinc-400 text-[10px] font-black uppercase tracking-wider shadow-md">
                                                        Plex Only
                                                    </div>
                                                )}
                                            </div>

                                            {/* Overlay Info */}
                                            <div className="relative z-10 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3.5 pt-8 flex flex-col">
                                                <span className="text-xs font-bold text-white line-clamp-2 leading-tight group-hover:text-amber-400 transition-colors">
                                                    {item.title}
                                                </span>
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-[11px] text-zinc-400 font-semibold">{item.year || 'Unknown'}</span>
                                                    {item.isLinked ? (
                                                        <span className="text-[10px] text-emerald-400 font-bold">Monitored</span>
                                                    ) : (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                                                            className="text-[10px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-wider flex items-center gap-1"
                                                        >
                                                            <Plus size={11} /> Link
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Media Details Overlay */}
            {selectedMedia && (
                <MediaDetailsPanel
                    item={{
                        ...selectedMedia,
                        id: selectedMedia.arrMedia?.id || selectedMedia.id,
                        instanceId: selectedMedia.arrMedia?.instanceId || selectedInstance?.id,
                        tmdbId: selectedMedia.arrMedia?.tmdbId || selectedMedia.tmdbId,
                        tvdbId: selectedMedia.arrMedia?.tvdbId || selectedMedia.tvdbId,
                        title: selectedMedia.title,
                        overview: selectedMedia.summary || selectedMedia.overview,
                        posterPath: selectedMedia.poster
                    }}
                    libStatus={{
                        exists: selectedMedia.isLinked,
                        hasFile: selectedMedia.arrMedia?.hasFile ?? true,
                        isDownloading: selectedMedia.arrMedia?.isDownloading ?? false,
                        sizeOnDisk: selectedMedia.arrMedia?.statistics?.sizeOnDisk || selectedMedia.sizeOnDisk || 0,
                        percentage: selectedMedia.arrMedia?.statistics?.percentOfEpisodes || 100,
                        qualityProfileId: selectedMedia.arrMedia?.qualityProfileId,
                        instances: selectedMedia.isLinked && selectedInstance ? [{ 
                            id: selectedInstance.id, 
                            name: selectedInstance.name, 
                            internalId: selectedMedia.arrMedia?.id 
                        }] : []
                    }}
                    onQuickSearch={handleQuickSearch}
                    onAdd={() => handleAdd(selectedMedia)}
                    onClose={() => setSelectedMedia(null)}
                />
            )}
        </div>
    );
}

export function LibraryExplorerPanel(props: LibraryExplorerPanelProps) {
    return (
        <ErrorBoundary>
            <LibraryExplorerPanelInner {...props} />
        </ErrorBoundary>
    );
}

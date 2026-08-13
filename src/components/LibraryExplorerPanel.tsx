'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, Film, Tv, Plus, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MediaDetailsPanel } from './MediaDetailsPanel';

interface LibraryExplorerPanelProps {
    library: { id: string; title: string; type: string; instanceName: string; };
    onClose: () => void;
}

export function LibraryExplorerPanel({ library, onClose }: LibraryExplorerPanelProps) {
    const [instances, setInstances] = useState<any[]>([]);
    const [selectedInstance, setSelectedInstance] = useState<any | null>(null);
    const [media, setMedia] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedMedia, setSelectedMedia] = useState<any | null>(null);

    // Fetch instances and pick best match
    useEffect(() => {
        fetch('/api/system/instances')
            .then(res => res.json())
            .then(data => {
                const arrType = library.type === 'movie' ? 'radarr' : 'sonarr';
                const matching = data.filter((i: any) => i.type === arrType && i.enabled);
                setInstances(matching);
                if (matching.length > 0) setSelectedInstance(matching[0]);
                else setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [library]);

    // Fetch existing media from the selected instance
    useEffect(() => {
        if (!selectedInstance) return;
        setLoading(true);
        fetch(`/api/${selectedInstance.type}/library?instanceId=${selectedInstance.id}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setMedia(data.sort((a, b) => (b.year || 0) - (a.year || 0)));
                else setMedia([]);
            })
            .catch(() => setMedia([]))
            .finally(() => setLoading(false));
    }, [selectedInstance]);

    // Handle TMDB Search
    useEffect(() => {
        if (!searchQuery) {
            setSearchResults([]);
            return;
        }
        const delayTimer = setTimeout(() => {
            setIsSearching(true);
            const tmdbType = library.type === 'movie' ? 'movie' : 'tv';
            fetch(`/api/tmdb/search?query=${encodeURIComponent(searchQuery)}&type=${tmdbType}`)
                .then(res => res.json())
                .then(data => setSearchResults(data.results || []))
                .finally(() => setIsSearching(false));
        }, 500);
        return () => clearTimeout(delayTimer);
    }, [searchQuery, library.type]);

    const handleAdd = async (item: any) => {
        if (!selectedInstance) return;
        toast.info(`Adding ${item.title || item.name}...`);
        try {
            const res = await fetch(`/api/${selectedInstance.type}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tmdbId: item.id,
                    title: item.title || item.name,
                    year: parseInt(item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0]) || 0,
                    qualityProfileId: 1, // Fallback, normally needs selection but we simplify here
                    rootFolderPath: '', // API will fetch default
                    monitored: true,
                    instanceId: selectedInstance.id
                })
            });
            if (res.ok) {
                toast.success('Added successfully!');
                setSearchQuery('');
                // Refresh library
                fetch(`/api/${selectedInstance.type}/library?instanceId=${selectedInstance.id}`)
                    .then(r => r.json())
                    .then(d => { if (Array.isArray(d)) setMedia(d.sort((a: b) => (b.year || 0) - (a.year || 0))); });
            } else {
                toast.error('Failed to add media');
            }
        } catch (e) {
            toast.error('Error adding media');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
            <div className="bg-[#09090b] w-full max-w-7xl h-full max-h-[90vh] rounded-[2rem] border border-zinc-800/80 shadow-2xl flex flex-col overflow-hidden relative">
                
                {/* Header */}
                <header className="px-8 py-6 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-zinc-950/50">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${library.type === 'movie' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'}`}>
                            {library.type === 'movie' ? <Film size={24} /> : <Tv size={24} />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">{library.title}</h2>
                            <p className="text-sm font-bold text-zinc-500 flex items-center gap-2">
                                Plex Library Explorer
                                {instances.length > 1 && (
                                    <select 
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-white"
                                        value={selectedInstance?.id || ''}
                                        onChange={(e) => setSelectedInstance(instances.find(i => i.id === e.target.value))}
                                    >
                                        {instances.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                    </select>
                                )}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </header>

                <div className="flex-1 overflow-hidden flex flex-col relative">
                    {/* Search Bar */}
                    <div className="p-6 shrink-0 border-b border-zinc-800/50">
                        <div className="relative max-w-2xl mx-auto">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                            <input 
                                type="text"
                                placeholder={`Search to add new ${library.type === 'movie' ? 'movies' : 'shows'} to this library...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white font-medium focus:outline-none focus:border-emerald-500/50 transition-colors"
                            />
                            {isSearching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-500" size={18} />}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                        {searchQuery ? (
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-2">Search Results from TMDB</h3>
                                {searchResults.length === 0 && !isSearching ? (
                                    <div className="text-center text-zinc-500 py-10">No results found for "{searchQuery}"</div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                        {searchResults.map(item => {
                                            const isAdded = media.some(m => m.tmdbId === item.id);
                                            return (
                                                <div key={item.id} className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                                                    {item.poster_path ? (
                                                        <img src={`/api/proxy?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w342${item.poster_path}`)}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                            {library.type === 'movie' ? <Film size={32} /> : <Tv size={32} />}
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                                        <span className="text-xs font-bold text-white line-clamp-2">{item.title || item.name}</span>
                                                        <span className="text-[10px] text-zinc-400 font-medium mb-3">{item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0]}</span>
                                                        {isAdded ? (
                                                            <div className="w-full py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 border border-emerald-500/30">
                                                                <CheckCircle size={14} /> In Library
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                                                                className="w-full py-2 rounded-lg bg-white text-black text-xs font-bold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                                                            >
                                                                <Plus size={14} /> Add
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
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-2">Existing Media ({media.length})</h3>
                                {loading ? (
                                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div>
                                ) : instances.length === 0 ? (
                                    <div className="text-center text-zinc-500 py-20">
                                        No {library.type === 'movie' ? 'Radarr' : 'Sonarr'} instance found to link to this library.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                        {media.map(item => (
                                            <div 
                                                key={item.id} 
                                                className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 cursor-pointer"
                                                onClick={() => setSelectedMedia(item)}
                                            >
                                                {item.images?.[0]?.url ? (
                                                    <img src={`/api/proxy?url=${encodeURIComponent(item.images[0].url)}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                        {library.type === 'movie' ? <Film size={32} /> : <Tv size={32} />}
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                                                    <span className="text-xs font-bold text-white line-clamp-2">{item.title}</span>
                                                    <div className="flex items-center justify-between mt-1">
                                                        <span className="text-[10px] text-zinc-400 font-medium">{item.year}</span>
                                                        {item.hasFile && <CheckCircle size={12} className="text-emerald-500" />}
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
            </div>

            {selectedMedia && (
                <MediaDetailsPanel
                    item={selectedMedia}
                    libStatus={{
                        exists: true,
                        hasFile: selectedMedia.hasFile,
                        isDownloading: false,
                        sizeOnDisk: selectedMedia.statistics?.sizeOnDisk || selectedMedia.movieFile?.size || 0,
                        percentage: selectedMedia.statistics?.percentOfEpisodes || 100,
                        instances: [{ id: selectedInstance.id, name: selectedInstance.name, internalId: selectedMedia.id }]
                    }}
                    onClose={() => setSelectedMedia(null)}
                />
            )}
        </div>
    );
}

'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Film, Tv, Music, Image as ImageIcon, Folder, Plus,
    Play, Pause, Volume2, VolumeX, Maximize, X,
    Search, Trash2, ArrowRight, ChevronRight, ChevronLeft,
    HardDrive, RefreshCw, LayoutGrid, List as Rows,
    FileVideo, FileAudio, FileImage, Sparkles, FolderPlus,
    Calendar, Check, Settings2, FolderTree, ArrowUp,
    DownloadCloud, Layers, Database, ShieldCheck, CheckCircle2
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface TheaterLibrary {
    id: string;
    name: string;
    type: 'movie' | 'show' | 'music' | 'photo' | 'other';
    folders: string[];
    created_at: string;
}

interface MediaItem {
    id: string;
    name: string;
    title: string;
    path: string;
    folder: string;
    category: 'video' | 'audio' | 'photo';
    extension: string;
    sizeBytes: number;
    modifiedAt: string;
    streamUrl: string;
}

interface PlexSourceLibrary {
    instanceId: string;
    instanceName: string;
    sectionKey: string;
    title: string;
    plexType: string;
    mediaType: 'movie' | 'show' | 'music' | 'photo' | 'other';
    locations: string[];
    count: number;
    exists: boolean;
}

interface ArrSourceFolder {
    instanceId: string;
    instanceName: string;
    title: string;
    mediaType: 'movie' | 'show';
    path: string;
    freeSpace: number;
    exists: boolean;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function TheaterPage() {
    const [libraries, setLibraries] = useState<TheaterLibrary[]>([]);
    const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
    const [items, setItems] = useState<MediaItem[]>([]);
    const [loadingLibraries, setLoadingLibraries] = useState(true);
    const [loadingItems, setLoadingItems] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortBy, setSortBy] = useState<'title' | 'date' | 'size'>('title');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Add Library Modal States
    const [isAddLibModalOpen, setIsAddLibModalOpen] = useState(false);
    const [modalTab, setModalTab] = useState<'import' | 'custom'>('import');
    const [plexSources, setPlexSources] = useState<PlexSourceLibrary[]>([]);
    const [radarrSources, setRadarrSources] = useState<ArrSourceFolder[]>([]);
    const [sonarrSources, setSonarrSources] = useState<ArrSourceFolder[]>([]);
    const [commonMounts, setCommonMounts] = useState<string[]>([]);
    const [loadingSources, setLoadingSources] = useState(false);

    // Custom Form State
    const [newLibName, setNewLibName] = useState('');
    const [newLibType, setNewLibType] = useState<'movie' | 'show' | 'music' | 'photo' | 'other'>('movie');
    const [newLibFolders, setNewLibFolders] = useState<string[]>([]);
    const [folderInput, setFolderInput] = useState('');
    const [browserCurrentPath, setBrowserCurrentPath] = useState('');
    const [browserParentPath, setBrowserParentPath] = useState<string | null>(null);
    const [browserFolders, setBrowserFolders] = useState<any[]>([]);
    const [isCreatingLib, setIsCreatingLib] = useState(false);

    // Active Media Players
    const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null);
    const [playingAudio, setPlayingAudio] = useState<MediaItem | null>(null);
    const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    // 1. Fetch Theater Libraries
    const fetchLibraries = async () => {
        setLoadingLibraries(true);
        try {
            const res = await fetch('/api/theater/libraries');
            if (res.ok) {
                const data = await res.json();
                const libs: TheaterLibrary[] = Array.isArray(data.libraries) ? data.libraries : [];
                setLibraries(libs);
                if (libs.length > 0 && (!activeLibraryId || !libs.some(l => l.id === activeLibraryId))) {
                    setActiveLibraryId(libs[0].id);
                }
            }
        } catch {
            toast.error('Failed to load Theater libraries');
        } finally {
            setLoadingLibraries(false);
        }
    };

    useEffect(() => {
        fetchLibraries();
    }, []);

    // 2. Fetch Items for Selected Library
    const fetchLibraryItems = async (libId: string) => {
        setLoadingItems(true);
        try {
            const res = await fetch(`/api/theater/items?libraryId=${libId}`);
            if (res.ok) {
                const data = await res.json();
                setItems(Array.isArray(data.items) ? data.items : []);
            } else {
                toast.error('Failed to scan library items');
                setItems([]);
            }
        } catch {
            toast.error('Error fetching library media');
            setItems([]);
        } finally {
            setLoadingItems(false);
        }
    };

    useEffect(() => {
        if (activeLibraryId) {
            fetchLibraryItems(activeLibraryId);
        } else {
            setItems([]);
        }
    }, [activeLibraryId]);

    // 3. Fetch External Sources (Plex Libraries, Sonarr/Radarr Folders)
    const fetchSources = async () => {
        setLoadingSources(true);
        try {
            const res = await fetch('/api/theater/sources');
            if (res.ok) {
                const data = await res.json();
                setPlexSources(Array.isArray(data.plex) ? data.plex : []);
                setRadarrSources(Array.isArray(data.radarr) ? data.radarr : []);
                setSonarrSources(Array.isArray(data.sonarr) ? data.sonarr : []);
                setCommonMounts(Array.isArray(data.commonMounts) ? data.commonMounts : []);
                if ((!data.plex || data.plex.length === 0) && (!data.radarr || data.radarr.length === 0) && (!data.sonarr || data.sonarr.length === 0)) {
                    setModalTab('custom');
                }
            }
        } catch (e) {
            console.error('Failed to fetch sources:', e);
        } finally {
            setLoadingSources(false);
        }
    };

    // 4. Directory Browser Navigation
    const loadBrowserPath = async (targetPath = '') => {
        try {
            const res = await fetch(`/api/theater/items?browsePath=${encodeURIComponent(targetPath)}`);
            if (res.ok) {
                const data = await res.json();
                setBrowserFolders(Array.isArray(data.folders) ? data.folders : []);
                setBrowserCurrentPath(data.currentPath || targetPath);
                setBrowserParentPath(data.parentPath || null);
            }
        } catch (e) {
            console.error('Folder browser error:', e);
        }
    };

    useEffect(() => {
        if (isAddLibModalOpen) {
            fetchSources();
            loadBrowserPath();
        }
    }, [isAddLibModalOpen]);

    // 5. 1-Click Import from Plex or Arr
    const handleImportPlexLibrary = async (plexLib: PlexSourceLibrary) => {
        setIsCreatingLib(true);
        try {
            const res = await fetch('/api/theater/libraries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: plexLib.title,
                    type: plexLib.mediaType,
                    folders: plexLib.locations,
                    plexSectionId: plexLib.sectionKey,
                    instanceId: plexLib.instanceId
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Imported "${plexLib.title}" from ${plexLib.instanceName}!`);
                setIsAddLibModalOpen(false);
                await fetchLibraries();
                if (data.id) setActiveLibraryId(data.id);
            } else {
                toast.error('Failed to import library');
            }
        } catch {
            toast.error('Error importing library');
        } finally {
            setIsCreatingLib(false);
        }
    };

    const handleImportArrFolder = async (arrFolder: ArrSourceFolder) => {
        setIsCreatingLib(true);
        try {
            const res = await fetch('/api/theater/libraries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: arrFolder.instanceName,
                    type: arrFolder.mediaType,
                    folders: [arrFolder.path]
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Imported "${arrFolder.instanceName}"!`);
                setIsAddLibModalOpen(false);
                await fetchLibraries();
                if (data.id) setActiveLibraryId(data.id);
            } else {
                toast.error('Failed to create library');
            }
        } catch {
            toast.error('Error creating library');
        } finally {
            setIsCreatingLib(false);
        }
    };

    // 6. Create Custom Library
    const handleCreateCustomLibrary = async () => {
        if (!newLibName.trim()) {
            toast.error('Please enter a library name');
            return;
        }
        const allFolders = [...newLibFolders];
        if (folderInput.trim() && !allFolders.includes(folderInput.trim())) {
            allFolders.push(folderInput.trim());
        }

        if (allFolders.length === 0) {
            toast.error('Please specify at least one folder path');
            return;
        }

        setIsCreatingLib(true);
        try {
            const res = await fetch('/api/theater/libraries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newLibName.trim(),
                    type: newLibType,
                    folders: allFolders
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Library "${newLibName}" created!`);
                setIsAddLibModalOpen(false);
                setNewLibName('');
                setNewLibFolders([]);
                setFolderInput('');
                await fetchLibraries();
                if (data.id) setActiveLibraryId(data.id);
            } else {
                toast.error('Failed to create library');
            }
        } catch {
            toast.error('Error creating library');
        } finally {
            setIsCreatingLib(false);
        }
    };

    const handleDeleteLibrary = async (libId: string, libName: string) => {
        if (!confirm(`Are you sure you want to delete the library "${libName}"?`)) return;
        try {
            const res = await fetch(`/api/theater/libraries?id=${libId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success(`Library "${libName}" deleted`);
                const remaining = libraries.filter(l => l.id !== libId);
                setLibraries(remaining);
                if (remaining.length > 0) setActiveLibraryId(remaining[0].id);
                else setActiveLibraryId(null);
            } else {
                toast.error('Failed to delete library');
            }
        } catch {
            toast.error('Error deleting library');
        }
    };

    const activeLibrary = useMemo(() => {
        return libraries.find(l => l.id === activeLibraryId);
    }, [libraries, activeLibraryId]);

    // Filter & Sort Items
    const filteredItems = useMemo(() => {
        let list = [...items];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(i => i.title.toLowerCase().includes(q) || i.folder.toLowerCase().includes(q));
        }

        list.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'title') {
                comparison = a.title.localeCompare(b.title);
            } else if (sortBy === 'date') {
                comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
            } else if (sortBy === 'size') {
                comparison = a.sizeBytes - b.sizeBytes;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return list;
    }, [items, searchQuery, sortBy, sortOrder]);

    const photoItems = useMemo(() => {
        return filteredItems.filter(i => i.category === 'photo');
    }, [filteredItems]);

    const handlePlayItem = (item: MediaItem) => {
        if (item.category === 'video') {
            setPlayingVideo(item);
        } else if (item.category === 'audio') {
            setPlayingAudio(item);
        } else if (item.category === 'photo') {
            const idx = photoItems.findIndex(p => p.id === item.id);
            setViewingPhotoIndex(idx >= 0 ? idx : 0);
        }
    };

    const getLibIcon = (type: string, size = 18) => {
        if (type === 'movie') return <Film size={size} className="text-indigo-400" />;
        if (type === 'show') return <Tv size={size} className="text-emerald-400" />;
        if (type === 'music') return <Music size={size} className="text-amber-400" />;
        if (type === 'photo') return <ImageIcon size={size} className="text-pink-400" />;
        return <Folder size={size} className="text-zinc-400" />;
    };

    return (
        <>
            <Toaster position="top-right" theme="dark" richColors />
            <div className="space-y-6 pb-28">
                {/* ── Top Header & Library Switcher ── */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-2xl p-5 sm:p-6 rounded-[2.5rem] shadow-2xl">
                    <div className="flex flex-wrap items-center gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                                <Film size={26} className="text-emerald-400" /> Theater
                            </h1>
                            <p className="text-sm text-zinc-500 mt-0.5 font-medium">
                                Homemade media streaming, local libraries, and built-in players.
                            </p>
                        </div>

                        {/* Libraries Selector Pills */}
                        <div className="flex flex-wrap items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner">
                            {libraries.map(lib => {
                                const isActive = lib.id === activeLibraryId;
                                return (
                                    <button
                                        key={lib.id}
                                        onClick={() => setActiveLibraryId(lib.id)}
                                        className={`flex items-center gap-2 px-4 py-2 text-xs font-black rounded-xl transition-all ${
                                            isActive
                                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        {getLibIcon(lib.type, 14)}
                                        <span>{lib.name}</span>
                                    </button>
                                );
                            })}

                            <button
                                onClick={() => setIsAddLibModalOpen(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30 transition-all shadow-sm"
                            >
                                <Plus size={14} /> Add Library
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        {/* Search Input */}
                        <div className="relative flex-1 lg:w-64">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
                            <input
                                type="text"
                                placeholder="Search library..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-8 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {activeLibrary && (
                            <button
                                onClick={() => fetchLibraryItems(activeLibrary.id)}
                                title="Rescan Library"
                                className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            >
                                <RefreshCw size={16} className={loadingItems ? 'animate-spin text-emerald-400' : ''} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Sub-bar: Active Library Info, Sorting & View Mode ── */}
                {activeLibrary && (
                    <div className="flex flex-wrap items-center justify-between gap-4 px-2">
                        <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-white">
                                {activeLibrary.name}
                            </span>
                            <span className="text-zinc-500 text-xs font-semibold">
                                ({filteredItems.length} items)
                            </span>
                            {activeLibrary.folders.map((f, i) => (
                                <span key={i} className="hidden md:inline-block px-2.5 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-500 font-mono truncate max-w-xs">
                                    {f}
                                </span>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Sort Bar */}
                            <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800/80">
                                {[
                                    { id: 'title', label: 'Name' },
                                    { id: 'date', label: 'Date' },
                                    { id: 'size', label: 'Size' }
                                ].map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSortBy(s.id as any)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                            sortBy === s.id
                                                ? 'bg-zinc-800 text-white shadow-sm'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            {/* View Mode Toggle */}
                            <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800/80">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <LayoutGrid size={15} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <Rows size={15} />
                                </button>
                            </div>

                            <button
                                onClick={() => handleDeleteLibrary(activeLibrary.id, activeLibrary.name)}
                                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-xs font-bold"
                                title="Delete Library"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Content Grid / List ── */}
                {loadingLibraries ? (
                    <div className="flex flex-col items-center justify-center py-36 gap-3">
                        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                        <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Loading Theater...</span>
                    </div>
                ) : libraries.length === 0 ? (
                    <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-4 max-w-xl mx-auto my-12 shadow-2xl">
                        <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto">
                            <FolderPlus size={32} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">No Theater Libraries Configured</h2>
                            <p className="text-xs text-zinc-500 mt-1">
                                Import your existing Plex libraries or create custom libraries for your media folders.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsAddLibModalOpen(true)}
                            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 mx-auto"
                        >
                            <Plus size={16} /> Add / Import Library
                        </button>
                    </div>
                ) : loadingItems ? (
                    <div className="flex flex-col items-center justify-center py-36 gap-3">
                        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                        <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Scanning media files...</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-2">
                        <Folder size={40} className="mx-auto text-zinc-700" />
                        <p className="text-lg font-bold text-white">No media items found in this library</p>
                        <p className="text-xs text-zinc-500">Ensure the configured storage paths contain supported video, audio, or photo files.</p>
                    </div>
                ) : (
                    <div className={
                        viewMode === 'grid'
                            ? activeLibrary?.type === 'photo'
                                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                                : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5'
                            : 'space-y-3'
                    }>
                        {filteredItems.map((item, idx) => {
                            if (viewMode === 'list') {
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handlePlayItem(item)}
                                        className="flex items-center justify-between p-4 bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-2xl hover:bg-zinc-900/50 transition-all cursor-pointer group shadow-lg"
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors shrink-0">
                                                {item.category === 'video' ? <FileVideo size={22} /> : item.category === 'audio' ? <FileAudio size={22} /> : <FileImage size={22} />}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-white text-base truncate group-hover:text-emerald-400 transition-colors">
                                                    {item.title}
                                                </h3>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium mt-0.5">
                                                    <span>{item.folder}</span>
                                                    <span>•</span>
                                                    <span className="font-mono uppercase">{item.extension}</span>
                                                    <span>•</span>
                                                    <span>{formatBytes(item.sizeBytes)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <button className="w-10 h-10 rounded-xl bg-zinc-900 group-hover:bg-emerald-500 text-zinc-400 group-hover:text-black flex items-center justify-center transition-all shrink-0">
                                            <Play size={16} />
                                        </button>
                                    </div>
                                );
                            }

                            // Grid View
                            if (item.category === 'photo') {
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handlePlayItem(item)}
                                        className="group relative aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 hover:border-pink-500/50 transition-all cursor-pointer shadow-lg hover:-translate-y-1"
                                    >
                                        <img
                                            src={item.streamUrl}
                                            alt={item.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                            <p className="text-xs font-bold text-white truncate">{item.title}</p>
                                        </div>
                                    </div>
                                );
                            }

                            // Video / Audio Grid Card
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => handlePlayItem(item)}
                                    className="group flex flex-col bg-[#09090b] border border-zinc-900 hover:border-zinc-800 rounded-3xl overflow-hidden transition-all duration-300 shadow-xl cursor-pointer hover:-translate-y-1"
                                >
                                    <div className="relative aspect-video bg-zinc-900 overflow-hidden flex items-center justify-center border-b border-zinc-900">
                                        {item.posterUrl ? (
                                            <img
                                                src={item.posterUrl}
                                                alt={item.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="text-zinc-700 group-hover:scale-110 transition-transform duration-500">
                                                {item.category === 'video' ? <FileVideo size={48} /> : <FileAudio size={48} />}
                                            </div>
                                        )}

                                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                                            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md group-hover:bg-emerald-500 text-white group-hover:text-black flex items-center justify-center transition-all shadow-xl group-hover:scale-110">
                                                <Play size={20} className="ml-0.5" />
                                            </div>
                                        </div>

                                        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-black uppercase text-zinc-300">
                                            {item.extension}
                                        </div>
                                    </div>

                                    <div className="p-4 space-y-1">
                                        <h3 className="font-bold text-white text-base leading-snug line-clamp-2 group-hover:text-emerald-400 transition-colors">
                                            {item.title}
                                        </h3>
                                        <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold pt-1">
                                            <span className="truncate max-w-[120px]">{item.folder}</span>
                                            <span>{formatBytes(item.sizeBytes)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Built-in Video Player Modal ── */}
            {playingVideo && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-5xl overflow-hidden shadow-2xl relative flex flex-col">
                        <div className="p-5 px-6 border-b border-zinc-900 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-white truncate max-w-xl">{playingVideo.title}</h2>
                                <p className="text-xs text-zinc-500 font-medium">{playingVideo.path}</p>
                            </div>
                            <button
                                onClick={() => setPlayingVideo(null)}
                                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="relative aspect-video bg-black flex items-center justify-center">
                            <video
                                ref={videoRef}
                                src={playingVideo.streamUrl}
                                controls
                                autoPlay
                                className="w-full h-full object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Built-in Audio Player Sticky Bar ── */}
            {playingAudio && (
                <div className="fixed bottom-4 left-4 right-4 max-w-3xl mx-auto z-[150] bg-zinc-950/95 border border-zinc-800 backdrop-blur-2xl p-4 px-6 rounded-3xl shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <Music size={22} />
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-bold text-white text-sm truncate">{playingAudio.title}</h4>
                            <p className="text-xs text-zinc-500 font-medium truncate">{playingAudio.folder}</p>
                        </div>
                    </div>

                    <div className="flex-1 max-w-md">
                        <audio
                            ref={audioRef}
                            src={playingAudio.streamUrl}
                            controls
                            autoPlay
                            className="w-full h-10"
                        />
                    </div>

                    <button
                        onClick={() => setPlayingAudio(null)}
                        className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* ── Built-in Photo Lightbox ── */}
            {viewingPhotoIndex !== null && photoItems[viewingPhotoIndex] && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
                    <button
                        onClick={() => setViewingPhotoIndex(null)}
                        className="absolute top-6 right-6 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-white hover:bg-zinc-800 transition-all z-50"
                    >
                        <X size={20} />
                    </button>

                    {viewingPhotoIndex > 0 && (
                        <button
                            onClick={() => setViewingPhotoIndex(viewingPhotoIndex - 1)}
                            className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-white hover:bg-zinc-800 transition-all z-50"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    )}

                    {viewingPhotoIndex < photoItems.length - 1 && (
                        <button
                            onClick={() => setViewingPhotoIndex(viewingPhotoIndex + 1)}
                            className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-white hover:bg-zinc-800 transition-all z-50"
                        >
                            <ChevronRight size={24} />
                        </button>
                    )}

                    <div className="max-w-6xl max-h-[85vh] p-4 flex flex-col items-center justify-center">
                        <img
                            src={photoItems[viewingPhotoIndex].streamUrl}
                            alt=""
                            className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
                        />
                        <p className="text-sm font-bold text-white mt-3">{photoItems[viewingPhotoIndex].title}</p>
                    </div>
                </div>
            )}

            {/* ── Add / Import Library Big Spacious Modal ── */}
            {isAddLibModalOpen && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-5xl p-6 sm:p-10 shadow-2xl relative space-y-6 max-h-[92vh] overflow-y-auto custom-scrollbar flex flex-col">
                        <button
                            onClick={() => setIsAddLibModalOpen(false)}
                            className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <X size={22} />
                        </button>

                        {/* Top Modal Header & Tabs */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-900">
                            <div>
                                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                    <FolderPlus size={28} className="text-emerald-400" /> Add Theater Library
                                </h2>
                                <p className="text-xs text-zinc-500 font-medium mt-1">
                                    Import directly from your existing Plex/Arr libraries or configure a custom storage path.
                                </p>
                            </div>

                            <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 self-start sm:self-auto gap-1">
                                <button
                                    onClick={() => setModalTab('import')}
                                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${
                                        modalTab === 'import'
                                            ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    <DownloadCloud size={16} /> 1-Click Import
                                </button>
                                <button
                                    onClick={() => setModalTab('custom')}
                                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${
                                        modalTab === 'custom'
                                            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-md'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    <Folder size={16} /> Custom Folder
                                </button>
                            </div>
                        </div>

                        {/* ── Mode 1: 1-Click Import from Plex & Arr ── */}
                        {modalTab === 'import' && (
                            <div className="space-y-6">
                                {loadingSources ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                                        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                                        <span className="text-zinc-400 text-xs font-bold">Querying Plex, Radarr, and Sonarr libraries...</span>
                                    </div>
                                ) : (
                                    <>
                                        {/* Plex Libraries Section */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                                    <Layers size={16} /> Plex Server Libraries ({plexSources.length})
                                                </h3>
                                                <span className="text-[11px] text-zinc-500 font-semibold">Click to import library instantly</span>
                                            </div>

                                            {plexSources.length === 0 ? (
                                                <div className="p-6 rounded-2xl bg-zinc-950/60 border border-zinc-900 text-center text-xs text-zinc-500">
                                                    No Plex libraries detected. Ensure Plex is connected in Settings.
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    {plexSources.map((plexLib, i) => (
                                                        <div
                                                            key={i}
                                                            className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800/80 hover:border-amber-500/50 transition-all flex flex-col justify-between space-y-4 group shadow-xl"
                                                        >
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        {getLibIcon(plexLib.mediaType, 18)}
                                                                        <span className="text-base font-black text-white">{plexLib.title}</span>
                                                                    </div>
                                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                                                        Plex {plexLib.plexType}
                                                                    </span>
                                                                </div>

                                                                <p className="text-xs text-zinc-500 font-mono truncate">
                                                                    {plexLib.locations.join(', ')}
                                                                </p>
                                                            </div>

                                                            <button
                                                                disabled={isCreatingLib}
                                                                onClick={() => handleImportPlexLibrary(plexLib)}
                                                                className="w-full py-3 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/30 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg"
                                                            >
                                                                <Plus size={15} /> Import Library
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Radarr & Sonarr Root Folders Section */}
                                        {(radarrSources.length > 0 || sonarrSources.length > 0) && (
                                            <div className="space-y-3 pt-2">
                                                <h3 className="text-sm font-black text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                                                    <Database size={16} /> Arr Root Folders ({radarrSources.length + sonarrSources.length})
                                                </h3>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    {radarrSources.map((rf, i) => (
                                                        <div
                                                            key={`radarr-${i}`}
                                                            className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800/80 hover:border-indigo-500/50 transition-all flex flex-col justify-between space-y-4 shadow-xl"
                                                        >
                                                            <div className="space-y-1.5">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-base font-black text-white flex items-center gap-2">
                                                                        <Film size={16} className="text-indigo-400" /> {rf.instanceName}
                                                                    </span>
                                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                                                                        Radarr
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-zinc-500 font-mono truncate">{rf.path}</p>
                                                            </div>

                                                            <button
                                                                disabled={isCreatingLib}
                                                                onClick={() => handleImportArrFolder(rf)}
                                                                className="w-full py-3 bg-indigo-500/15 hover:bg-indigo-500 text-indigo-300 hover:text-white border border-indigo-500/30 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2"
                                                            >
                                                                <Plus size={15} /> Import Folder
                                                            </button>
                                                        </div>
                                                    ))}

                                                    {sonarrSources.map((sf, i) => (
                                                        <div
                                                            key={`sonarr-${i}`}
                                                            className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800/80 hover:border-emerald-500/50 transition-all flex flex-col justify-between space-y-4 shadow-xl"
                                                        >
                                                            <div className="space-y-1.5">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-base font-black text-white flex items-center gap-2">
                                                                        <Tv size={16} className="text-emerald-400" /> {sf.instanceName}
                                                                    </span>
                                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                                        Sonarr
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-zinc-500 font-mono truncate">{sf.path}</p>
                                                            </div>

                                                            <button
                                                                disabled={isCreatingLib}
                                                                onClick={() => handleImportArrFolder(sf)}
                                                                className="w-full py-3 bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-black border border-emerald-500/30 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2"
                                                            >
                                                                <Plus size={15} /> Import Folder
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Mode 2: Custom Library & Path Configuration ── */}
                        {modalTab === 'custom' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                            Library Name
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 4K Movies, Anime, FLAC Music, Family Photos"
                                            value={newLibName}
                                            onChange={e => setNewLibName(e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                                        />
                                    </div>

                                    {/* Media Type Selection */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                            Media Type
                                        </label>
                                        <div className="grid grid-cols-5 gap-2">
                                            {[
                                                { id: 'movie', label: 'Movies', icon: <Film size={15} /> },
                                                { id: 'show', label: 'Series', icon: <Tv size={15} /> },
                                                { id: 'music', label: 'Music', icon: <Music size={15} /> },
                                                { id: 'photo', label: 'Photos', icon: <ImageIcon size={15} /> },
                                                { id: 'other', label: 'Other', icon: <Folder size={15} /> }
                                            ].map(t => (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => setNewLibType(t.id as any)}
                                                    className={`py-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                                                        newLibType === t.id
                                                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-md'
                                                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                                    }`}
                                                >
                                                    {t.icon}
                                                    <span>{t.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Common Mount Point Shortcuts */}
                                {commonMounts.length > 0 && (
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider block">
                                            Mounted Storage Shortcuts:
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {commonMounts.map((cp, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => {
                                                        setFolderInput(cp);
                                                        loadBrowserPath(cp);
                                                    }}
                                                    className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-zinc-300 border border-zinc-800 hover:border-emerald-500/50 transition-all flex items-center gap-1.5"
                                                >
                                                    <HardDrive size={13} className="text-emerald-400" />
                                                    <span>{cp}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Folder Path Input */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                        Folder Path (Enter any local or NAS path)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. /mnt/user/data/media/movies or /media/tv"
                                            value={folderInput}
                                            onChange={e => {
                                                setFolderInput(e.target.value);
                                                loadBrowserPath(e.target.value);
                                            }}
                                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500 font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (folderInput.trim() && !newLibFolders.includes(folderInput.trim())) {
                                                    setNewLibFolders(prev => [...prev, folderInput.trim()]);
                                                    setFolderInput('');
                                                }
                                            }}
                                            className="px-6 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-colors shrink-0"
                                        >
                                            Add Path
                                        </button>
                                    </div>

                                    {/* Active Selected Folders */}
                                    {newLibFolders.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            {newLibFolders.map((f, i) => (
                                                <span key={i} className="px-4 py-2 bg-zinc-900 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs font-mono flex items-center gap-2 shadow-sm">
                                                    {f}
                                                    <button
                                                        onClick={() => setNewLibFolders(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="text-zinc-500 hover:text-red-400 p-0.5"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Interactive Directory Browser */}
                                <div className="space-y-2 p-5 bg-zinc-950 rounded-3xl border border-zinc-900">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                            <FolderTree size={15} /> Directory Browser: <span className="font-mono text-zinc-300">{browserCurrentPath || '/'}</span>
                                        </span>
                                        {browserParentPath && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFolderInput(browserParentPath);
                                                    loadBrowserPath(browserParentPath);
                                                }}
                                                className="text-xs text-zinc-400 hover:text-emerald-400 flex items-center gap-1 font-bold transition-colors"
                                            >
                                                <ArrowUp size={14} /> Up One Level
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2 max-h-48 overflow-y-auto custom-scrollbar">
                                        {browserFolders.map((bf, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => {
                                                    setFolderInput(bf.path);
                                                    loadBrowserPath(bf.path);
                                                }}
                                                className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900 text-left text-xs text-zinc-300 hover:text-emerald-400 transition-all flex items-center gap-2 truncate"
                                            >
                                                <Folder size={14} className="shrink-0 text-zinc-500" />
                                                <span className="truncate font-medium">{bf.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => setIsAddLibModalOpen(false)}
                                        className="flex-1 h-14 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={isCreatingLib}
                                        onClick={handleCreateCustomLibrary}
                                        className="flex-[2] h-14 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                    >
                                        {isCreatingLib ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Plus size={18} />}
                                        {isCreatingLib ? 'Creating...' : 'Create Custom Library'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

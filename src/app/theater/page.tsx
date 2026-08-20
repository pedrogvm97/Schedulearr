'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Film, Tv, Music, Image as ImageIcon, Folder, Plus,
    Play, Pause, Volume2, VolumeX, Maximize, X,
    Search, Trash2, ArrowRight, ChevronRight, ChevronLeft,
    HardDrive, RefreshCw, LayoutGrid, List as Rows,
    FileVideo, FileAudio, FileImage, Sparkles, FolderPlus,
    Calendar, Check, Settings2
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

    // Modals
    const [isAddLibModalOpen, setIsAddLibModalOpen] = useState(false);
    const [newLibName, setNewLibName] = useState('');
    const [newLibType, setNewLibType] = useState<'movie' | 'show' | 'music' | 'photo' | 'other'>('movie');
    const [newLibFolders, setNewLibFolders] = useState<string[]>([]);
    const [folderInput, setFolderInput] = useState('');
    const [browserCurrentPath, setBrowserCurrentPath] = useState('');
    const [browserFolders, setBrowserFolders] = useState<any[]>([]);
    const [isCreatingLib, setIsCreatingLib] = useState(false);

    // Active Players
    const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null);
    const [playingAudio, setPlayingAudio] = useState<MediaItem | null>(null);
    const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    // 1. Fetch Libraries
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

    // 2. Fetch Items for Active Library
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

    // 3. Folder Browser for Add Library Modal
    const loadBrowserPath = async (targetPath = '') => {
        try {
            const res = await fetch(`/api/theater/items?browsePath=${encodeURIComponent(targetPath)}`);
            if (res.ok) {
                const data = await res.json();
                setBrowserFolders(Array.isArray(data.folders) ? data.folders : []);
                setBrowserCurrentPath(data.currentPath || '');
            }
        } catch (e) {
            console.error('Folder browser error:', e);
        }
    };

    useEffect(() => {
        if (isAddLibModalOpen) {
            loadBrowserPath();
        }
    }, [isAddLibModalOpen]);

    const handleCreateLibrary = async () => {
        if (!newLibName.trim()) {
            toast.error('Please enter a library name');
            return;
        }
        const allFolders = [...newLibFolders];
        if (folderInput.trim() && !allFolders.includes(folderInput.trim())) {
            allFolders.push(folderInput.trim());
        }

        if (allFolders.length === 0) {
            toast.error('Please select or specify at least one folder path');
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
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-black rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 border border-dashed border-zinc-800 transition-all"
                            >
                                <Plus size={14} /> New Library
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
                    <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-4 max-w-xl mx-auto my-12">
                        <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto">
                            <FolderPlus size={32} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">No Theater Libraries Configured</h2>
                            <p className="text-xs text-zinc-500 mt-1">
                                Create your first library pointing to your movies, series, music, or photo folders.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsAddLibModalOpen(true)}
                            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
                        >
                            + Create Library
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
                                    {/* Preview Banner */}
                                    <div className="relative aspect-video bg-zinc-900 overflow-hidden flex items-center justify-center border-b border-zinc-900">
                                        <div className="text-zinc-700 group-hover:scale-110 transition-transform duration-500">
                                            {item.category === 'video' ? <FileVideo size={48} /> : <FileAudio size={48} />}
                                        </div>

                                        {/* Play Overlay Button */}
                                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                                            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md group-hover:bg-emerald-500 text-white group-hover:text-black flex items-center justify-center transition-all shadow-xl group-hover:scale-110">
                                                <Play size={20} className="ml-0.5" />
                                            </div>
                                        </div>

                                        {/* Top Format Badge */}
                                        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-black uppercase text-zinc-300">
                                            {item.extension}
                                        </div>
                                    </div>

                                    {/* Card Info */}
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
                        {/* Header */}
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

                        {/* Player */}
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

                    {/* Nav Prev */}
                    {viewingPhotoIndex > 0 && (
                        <button
                            onClick={() => setViewingPhotoIndex(viewingPhotoIndex - 1)}
                            className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-white hover:bg-zinc-800 transition-all z-50"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    )}

                    {/* Nav Next */}
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

            {/* ── Add Library Modal ── */}
            {isAddLibModalOpen && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-xl p-8 shadow-2xl relative space-y-6">
                        <button
                            onClick={() => setIsAddLibModalOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                <FolderPlus size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white">Create Theater Library</h2>
                                <p className="text-xs text-zinc-500 font-medium">Add a custom library for your movies, series, music, or photos.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block mb-1.5">Library Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 4K Movies, Anime, FLAC Music, Family Photos"
                                    value={newLibName}
                                    onChange={e => setNewLibName(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* Media Type Selection */}
                            <div>
                                <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block mb-1.5">Media Type</label>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                    {[
                                        { id: 'movie', label: 'Movies', icon: <Film size={14} /> },
                                        { id: 'show', label: 'TV Shows', icon: <Tv size={14} /> },
                                        { id: 'music', label: 'Music', icon: <Music size={14} /> },
                                        { id: 'photo', label: 'Photos', icon: <ImageIcon size={14} /> },
                                        { id: 'other', label: 'Other', icon: <Folder size={14} /> }
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setNewLibType(t.id as any)}
                                            className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                                                newLibType === t.id
                                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                                                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            {t.icon}
                                            <span>{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Folder Path Input & Browser */}
                            <div>
                                <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block mb-1.5">Folder Storage Path</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g. /media/movies or C:\Media\Movies"
                                        value={folderInput}
                                        onChange={e => setFolderInput(e.target.value)}
                                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-600 outline-none focus:border-emerald-500 font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (folderInput.trim() && !newLibFolders.includes(folderInput.trim())) {
                                                setNewLibFolders(prev => [...prev, folderInput.trim()]);
                                                setFolderInput('');
                                            }
                                        }}
                                        className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-2xl transition-colors"
                                    >
                                        Add Path
                                    </button>
                                </div>

                                {/* Active Selected Folders */}
                                {newLibFolders.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-2">
                                        {newLibFolders.map((f, i) => (
                                            <span key={i} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-mono flex items-center gap-2">
                                                {f}
                                                <button
                                                    onClick={() => setNewLibFolders(prev => prev.filter((_, idx) => idx !== i))}
                                                    className="text-zinc-500 hover:text-red-400"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Folder Explorer Quick Selector */}
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Quick Directory Browser:</span>
                                <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                                    <p className="text-[10px] font-mono text-zinc-500 truncate">{browserCurrentPath}</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {browserFolders.slice(0, 12).map((bf, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => {
                                                    setFolderInput(bf.path);
                                                    loadBrowserPath(bf.path);
                                                }}
                                                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800/60 text-left text-xs text-zinc-300 hover:text-emerald-400 hover:border-zinc-700 transition-colors flex items-center gap-1.5 truncate"
                                            >
                                                <Folder size={12} className="shrink-0 text-zinc-500" />
                                                <span className="truncate">{bf.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setIsAddLibModalOpen(false)}
                                className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={isCreatingLib}
                                onClick={handleCreateLibrary}
                                className="flex-[2] h-12 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                            >
                                {isCreatingLib ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Plus size={16} />}
                                {isCreatingLib ? 'Creating...' : 'Create Library'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

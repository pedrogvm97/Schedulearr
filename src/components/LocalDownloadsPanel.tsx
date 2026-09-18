"use client";

import { useState, useEffect, useMemo } from "react";
import { 
    Film, Play, Music, Tv, HardDrive, FolderOpen, ExternalLink, 
    Download, Search, RefreshCw, X, Copy, Check, Disc, Clock,
    MonitorPlay
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useMusicPlayer } from "@/context/MusicPlayerContext";

export interface LocalMediaItem {
    id: string;
    name: string;
    title: string;
    artist?: string;
    album?: string;
    category: 'music' | 'movie' | 'show';
    path: string;
    sizeBytes: number;
    modifiedAt: string;
    extension: string;
    posterUrl?: string;
    streamUrl: string;
    source: string;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function LocalDownloadsPanel() {
    const { playTrack } = useMusicPlayer();

    const [items, setItems] = useState<LocalMediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'music' | 'movie' | 'show'>('all');
    const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
    const [previewVideo, setPreviewVideo] = useState<LocalMediaItem | null>(null);

    const fetchLocalItems = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await fetch('/api/downloads/local');
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
                if (isManual) {
                    toast.success(`Found ${data.items?.length || 0} local media files`);
                }
            } else {
                if (isManual) toast.error('Failed to scan local media files');
            }
        } catch (err: any) {
            if (isManual) toast.error('Failed to load local media: ' + err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchLocalItems();
    }, []);

    const handleSystemOpen = async (item: LocalMediaItem, action: 'vlc' | 'default' | 'reveal') => {
        const actionKey = `${item.id}-${action}`;
        setActionLoadingId(actionKey);
        try {
            const res = await fetch('/api/system/open-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: item.path, action })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(data.message || 'Launched successfully');
            } else {
                toast.error(data.error || 'Failed to open file');
            }
        } catch (err: any) {
            toast.error('System call failed: ' + err.message);
        } finally {
            setActionLoadingId(null);
        }
    };

    const copyPathToClipboard = (item: LocalMediaItem) => {
        navigator.clipboard.writeText(item.path);
        setCopiedPathId(item.id);
        toast.info('File path copied to clipboard');
        setTimeout(() => setCopiedPathId(null), 2000);
    };

    // Filter & Sort
    const counts = useMemo(() => {
        const c = { all: items.length, music: 0, movie: 0, show: 0 };
        items.forEach(it => {
            if (it.category === 'music') c.music++;
            else if (it.category === 'movie') c.movie++;
            else if (it.category === 'show') c.show++;
        });
        return c;
    }, [items]);

    const filteredItems = useMemo(() => {
        let result = items.filter(it => {
            if (categoryFilter !== 'all' && it.category !== categoryFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = it.title.toLowerCase().includes(q);
                const matchName = it.name.toLowerCase().includes(q);
                const matchArtist = it.artist?.toLowerCase().includes(q);
                const matchAlbum = it.album?.toLowerCase().includes(q);
                const matchPath = it.path.toLowerCase().includes(q);
                return matchTitle || matchName || matchArtist || matchAlbum || matchPath;
            }
            return true;
        });

        result.sort((a, b) => {
            if (sortBy === 'recent') {
                const diff = new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
                return sortOrder === 'asc' ? -diff : diff;
            } else if (sortBy === 'name') {
                const diff = a.title.localeCompare(b.title);
                return sortOrder === 'asc' ? diff : -diff;
            } else if (sortBy === 'size') {
                const diff = b.sizeBytes - a.sizeBytes;
                return sortOrder === 'asc' ? -diff : diff;
            }
            return 0;
        });

        return result;
    }, [items, categoryFilter, searchQuery, sortBy, sortOrder]);

    const handlePlayInApp = (item: LocalMediaItem) => {
        if (item.category === 'music') {
            const musicQueue = filteredItems
                .filter(i => i.category === 'music')
                .map(i => ({
                    id: i.id,
                    title: i.title || i.name,
                    type: 'music' as const,
                    artist: i.artist,
                    album: i.album,
                    posterUrl: i.posterUrl,
                    streamUrl: i.streamUrl,
                    isLocal: true
                }));
            const curIdx = musicQueue.findIndex(m => m.id === item.id);
            const track = {
                id: item.id,
                title: item.title || item.name,
                type: 'music' as const,
                artist: item.artist,
                album: item.album,
                posterUrl: item.posterUrl,
                streamUrl: item.streamUrl,
                isLocal: true
            };
            playTrack(track, musicQueue.length > 0 ? musicQueue : undefined, curIdx >= 0 ? curIdx : 0);
            toast.success(`Playing "${item.title}"`);
        } else {
            setPreviewVideo(item);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
            {/* Header & Controls bar */}
            <div className="bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-xl p-5 sm:p-6 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <HardDrive size={20} />
                        </span>
                        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                            Local Media &amp; Ready-to-Play Downloads
                        </h2>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                        Files downloaded via the app, saved into Plex music libraries, or completed via torrents. Open directly in VLC, your default system player, or play in the app.
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                    <button
                        onClick={() => fetchLocalItems(true)}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        title="Rescan directories for new downloads"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin text-emerald-400' : ''} />
                        {refreshing ? 'Scanning...' : 'Rescan Storage'}
                    </button>
                </div>
            </div>

            {/* Filter Pills & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
                    <button
                        onClick={() => setCategoryFilter('all')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                            categoryFilter === 'all'
                                ? 'bg-zinc-800 text-white shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300 bg-zinc-950/60 border border-zinc-800/60'
                        }`}
                    >
                        All Media ({counts.all})
                    </button>
                    <button
                        onClick={() => setCategoryFilter('music')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                            categoryFilter === 'music'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300 bg-zinc-950/60 border border-zinc-800/60'
                        }`}
                    >
                        <Music size={13} /> Music ({counts.music})
                    </button>
                    <button
                        onClick={() => setCategoryFilter('movie')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                            categoryFilter === 'movie'
                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300 bg-zinc-950/60 border border-zinc-800/60'
                        }`}
                    >
                        <Film size={13} /> Movies ({counts.movie})
                    </button>
                    <button
                        onClick={() => setCategoryFilter('show')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                            categoryFilter === 'show'
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300 bg-zinc-950/60 border border-zinc-800/60'
                        }`}
                    >
                        <Tv size={13} /> Shows ({counts.show})
                    </button>
                </div>

                {/* Search and Sort controls */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-64">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search title, artist, file..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 bg-zinc-950 border border-zinc-800/80 focus:border-emerald-500/60 rounded-xl text-xs text-white placeholder-zinc-500 outline-none transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-zinc-950 border border-zinc-800/80 rounded-xl px-2.5 py-2 text-xs font-bold text-zinc-300 outline-none focus:border-emerald-500/60 cursor-pointer"
                    >
                        <option value="recent">Recently Added</option>
                        <option value="name">Title (A-Z)</option>
                        <option value="size">File Size</option>
                    </select>

                    <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80 text-zinc-400 hover:text-white text-xs font-bold"
                        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                </div>
            </div>

            {/* Content List */}
            {loading ? (
                <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-wider">Scanning local downloads &amp; libraries...</span>
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-12 text-center text-zinc-500 space-y-2">
                    <HardDrive size={32} className="mx-auto text-zinc-600 opacity-60 mb-2" />
                    <h3 className="text-base font-bold text-zinc-300">No local media found</h3>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                        {searchQuery 
                            ? `No files match "${searchQuery}". Try adjusting your search query.`
                            : "Files downloaded from Theater or completed torrents will automatically show up here ready to play."}
                    </p>
                </div>
            ) : (
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl divide-y divide-zinc-800/60">
                    {filteredItems.map((item) => {
                        const isMusic = item.category === 'music';
                        const isMovie = item.category === 'movie';
                        const isShow = item.category === 'show';

                        return (
                            <div
                                key={item.id}
                                className="p-3.5 sm:p-4 hover:bg-zinc-800/30 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 group"
                            >
                                {/* Media Poster / Info */}
                                <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                                    {/* Thumbnail */}
                                    <div 
                                        onClick={() => handlePlayInApp(item)}
                                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800/80 flex-shrink-0 relative group/thumb cursor-pointer shadow-md flex items-center justify-center"
                                        title="Play in App"
                                    >
                                        {item.posterUrl ? (
                                            <img
                                                src={item.posterUrl}
                                                alt=""
                                                className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '';
                                                    (e.target as HTMLImageElement).className = 'hidden';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-600 group-hover/thumb:text-emerald-400 transition-colors">
                                                {isMusic ? <Disc size={22} /> : isShow ? <Tv size={22} /> : <Film size={22} />}
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="w-7 h-7 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-lg transform group-hover/thumb:scale-110 transition-transform">
                                                <Play size={13} className="ml-0.5 fill-black" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Title & Metadata */}
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {/* Category Badge */}
                                            <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded ${
                                                isMusic ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                                                isShow ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30' :
                                                'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                            }`}>
                                                {isMusic ? 'Music' : isShow ? 'Episode' : 'Movie'}
                                            </span>

                                            {/* Extension badge */}
                                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/50 uppercase">
                                                {item.extension}
                                            </span>

                                            {/* Source badge */}
                                            <span className="text-[9px] font-medium text-zinc-500 truncate max-w-[180px]">
                                                • {item.source}
                                            </span>
                                        </div>

                                        <h3
                                            onClick={() => handlePlayInApp(item)}
                                            className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors truncate cursor-pointer"
                                            title={item.title}
                                        >
                                            {item.title}
                                            {item.artist && (
                                                <span className="text-zinc-400 font-medium text-xs ml-1.5">
                                                    — {item.artist} {item.album ? `(${item.album})` : ''}
                                                </span>
                                            )}
                                        </h3>

                                        {/* Path info with copy button */}
                                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                                            <span className="truncate max-w-[320px] sm:max-w-md" title={item.path}>
                                                📁 {item.path}
                                            </span>
                                            <button
                                                onClick={() => copyPathToClipboard(item)}
                                                className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                                                title="Copy full path"
                                            >
                                                {copiedPathId === item.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Size & Date Info */}
                                <div className="flex items-center gap-4 text-xs text-zinc-400 shrink-0 self-start lg:self-auto pl-15 lg:pl-0">
                                    <div className="font-mono font-bold text-zinc-300 text-xs">
                                        {formatBytes(item.sizeBytes)}
                                    </div>
                                    <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                                        <Clock size={11} />
                                        {formatDistanceToNow(new Date(item.modifiedAt), { addSuffix: true })}
                                    </div>
                                </div>

                                {/* Action Buttons Group */}
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap self-end lg:self-auto pt-2 lg:pt-0 border-t border-zinc-800/40 lg:border-t-0 w-full lg:w-auto justify-end">
                                    {/* Play In App */}
                                    <button
                                        onClick={() => handlePlayInApp(item)}
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black font-bold text-xs transition-all flex items-center gap-1 border border-emerald-500/30 active:scale-95 cursor-pointer shadow-sm"
                                        title={isMusic ? "Play with in-app audio player" : "Preview in app"}
                                    >
                                        <Play size={12} className="fill-current" />
                                        <span className="hidden sm:inline">Play in App</span>
                                    </button>

                                    {/* Open in VLC */}
                                    <button
                                        onClick={() => handleSystemOpen(item, 'vlc')}
                                        disabled={actionLoadingId === `${item.id}-vlc`}
                                        className="px-2.5 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-black font-bold text-xs transition-all flex items-center gap-1 border border-orange-500/30 active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                                        title="Open in local VLC Media Player"
                                    >
                                        <MonitorPlay size={12} />
                                        <span>VLC</span>
                                    </button>

                                    {/* Open in Default System Player */}
                                    <button
                                        onClick={() => handleSystemOpen(item, 'default')}
                                        disabled={actionLoadingId === `${item.id}-default`}
                                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs transition-all flex items-center gap-1 border border-zinc-700/60 active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                                        title="Open in default system media player"
                                    >
                                        <ExternalLink size={12} />
                                        <span className="hidden sm:inline">System Player</span>
                                    </button>

                                    {/* Reveal in Explorer / Folder */}
                                    <button
                                        onClick={() => handleSystemOpen(item, 'reveal')}
                                        disabled={actionLoadingId === `${item.id}-reveal`}
                                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all border border-zinc-700/60 active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                                        title="Show in Folder (Explorer)"
                                    >
                                        <FolderOpen size={14} />
                                    </button>

                                    {/* Download File Directly */}
                                    <a
                                        href={item.streamUrl}
                                        download={item.name}
                                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all border border-zinc-700/60 active:scale-95 cursor-pointer shadow-sm"
                                        title="Download file to browser"
                                    >
                                        <Download size={14} />
                                    </a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* In-App Video Preview Modal */}
            {previewVideo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
                    <div className="bg-[#0c0c0e] border border-zinc-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl space-y-0">
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
                            <div className="min-w-0 pr-4">
                                <h3 className="text-base font-bold text-white truncate">{previewVideo.title}</h3>
                                <p className="text-xs text-zinc-400 truncate">{previewVideo.name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleSystemOpen(previewVideo, 'vlc')}
                                    className="px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500 text-orange-400 hover:text-black font-bold text-xs transition-all flex items-center gap-1.5 border border-orange-500/30"
                                >
                                    <MonitorPlay size={13} /> Open in VLC
                                </button>
                                <button
                                    onClick={() => setPreviewVideo(null)}
                                    className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="aspect-video bg-black flex items-center justify-center relative">
                            <video
                                src={previewVideo.streamUrl}
                                controls
                                autoPlay
                                className="w-full h-full object-contain"
                            >
                                Your browser does not support HTML5 video streaming for this format. You can play it using VLC or your system player.
                            </video>
                        </div>

                        <div className="p-4 bg-zinc-950/90 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                            <span className="truncate max-w-md">📁 {previewVideo.path}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleSystemOpen(previewVideo, 'reveal')}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium flex items-center gap-1 text-xs"
                                >
                                    <FolderOpen size={12} /> Show in Folder
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

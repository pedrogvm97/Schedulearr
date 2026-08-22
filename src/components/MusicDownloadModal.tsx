'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Download, Disc, Music, HardDrive, Check,
    AlertCircle, Sparkles, Folder, CheckCircle2, RefreshCw,
    User, ArrowDownToLine, Monitor, Laptop, Radio
} from 'lucide-react';
import { toast } from 'sonner';

interface MusicDownloadModalProps {
    track?: any;
    albumTracks?: any[];
    albumName?: string;
    artistName?: string;
    onClose: () => void;
}

interface DestinationOption {
    id: string;
    name: string;
    path: string;
    type: 'theater' | 'lidarr' | 'custom' | 'device';
    badge: string;
}

export function MusicDownloadModal({
    track,
    albumTracks,
    albumName,
    artistName,
    onClose
}: MusicDownloadModalProps) {
    const defaultIsAlbum = !!albumTracks && albumTracks.length > 0;
    const initialTitle = defaultIsAlbum ? (albumName || 'Album') : (track?.title || track?.name || 'Track');
    const initialArtist = artistName || track?.artist || 'Unknown Artist';
    const initialPosterUrl = defaultIsAlbum ? (albumTracks?.[0]?.posterUrl || '') : (track?.posterUrl || '');

    const [downloadScope, setDownloadScope] = useState<'track' | 'album' | 'artist'>(defaultIsAlbum ? 'album' : 'track');
    const [destinations, setDestinations] = useState<DestinationOption[]>([]);
    const [selectedDestId, setSelectedDestId] = useState<string>('device');
    const [customFolder, setCustomFolder] = useState<string>('');
    const [audioFormat, setAudioFormat] = useState<'flac' | 'mp3' | 'aac' | 'opus'>('mp3');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    const activeTitle = downloadScope === 'artist' ? `${initialArtist} (All Releases)` : downloadScope === 'album' ? (albumName || track?.album || 'Album') : initialTitle;
    const activeArtist = initialArtist;

    // Fetch existing music libraries & instances to populate destination choices
    useEffect(() => {
        const fetchDestinations = async () => {
            const list: DestinationOption[] = [];

            // 1. Option for Direct Device Download
            list.push({
                id: 'device',
                name: 'Local Device (This Browser / PC)',
                path: 'Direct File Download',
                type: 'device',
                badge: 'Local Device'
            });

            // 2. Fetch Theater Music Libraries
            try {
                const res = await fetch('/api/theater/libraries');
                if (res.ok) {
                    const data = await res.json();
                    const allLibs = Array.isArray(data) ? data : (data.libraries || []);
                    const musicLibs = allLibs.filter((l: any) => l.type === 'music' || l.type === 'audio');
                    for (const lib of musicLibs) {
                        let folders: string[] = [];
                        try {
                            folders = typeof lib.folders === 'string' ? JSON.parse(lib.folders) : (lib.folders || []);
                        } catch {}
                        folders.forEach((f, fi) => {
                            list.push({
                                id: `theater-${lib.id}-${fi}`,
                                name: `${lib.name || 'Theater Music Library'}`,
                                path: f,
                                type: 'theater',
                                badge: 'Theater Library'
                            });
                        });
                    }
                }
            } catch {}

            // 3. Fetch Lidarr Instances
            try {
                const instRes = await fetch('/api/instances');
                if (instRes.ok) {
                    const instData = await instRes.json();
                    const instances = Array.isArray(instData) ? instData : (instData.instances || []);
                    const lidarrs = instances.filter((i: any) => i.type === 'lidarr' && i.enabled);
                    for (const l of lidarrs) {
                        try {
                            const rfRes = await fetch(`/api/lidarr/rootfolder?instanceId=${l.id}`);
                            if (rfRes.ok) {
                                const rfData = await rfRes.json();
                                const rfs = Array.isArray(rfData) ? rfData : (rfData.rootFolders || []);
                                rfs.forEach((rf: any, rfi: number) => {
                                    list.push({
                                        id: `lidarr-${l.id}-${rfi}`,
                                        name: `Lidarr: ${l.name}`,
                                        path: rf.path || '/music',
                                        type: 'lidarr',
                                        badge: 'Lidarr Instance'
                                    });
                                });
                            }
                        } catch {}
                    }
                }
            } catch {}

            // 4. Custom Folder Option
            list.push({
                id: 'custom',
                name: 'Custom Server Folder',
                path: './data/music',
                type: 'custom',
                badge: 'Custom Path'
            });

            setDestinations(list);
            // Default to first server library if available, otherwise device
            const firstServer = list.find(d => d.type === 'theater' || d.type === 'lidarr');
            if (firstServer) {
                setSelectedDestId(firstServer.id);
            }
        };

        fetchDestinations();
    }, []);

    const selectedDest = destinations.find(d => d.id === selectedDestId) || destinations[0];

    // 1. Save directly into server library folder
    const handleSaveToServerLibrary = async () => {
        const targetDirectory = selectedDestId === 'custom' ? (customFolder.trim() || './data/music') : selectedDest?.path;

        setIsDownloading(true);
        setDownloadProgress(20);

        try {
            if (downloadScope === 'album' && albumTracks && albumTracks.length > 0) {
                let downloadedCount = 0;
                for (let i = 0; i < albumTracks.length; i++) {
                    const t = albumTracks[i];
                    await fetch('/api/theater/music/grab', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            youtubeId: t.youtubeId || (t.id?.startsWith('yt-') ? t.id.replace('yt-', '') : undefined),
                            streamUrl: t.streamUrl,
                            title: t.title || t.name,
                            artist: t.artist || activeArtist,
                            album: albumName || t.album || 'Album',
                            targetFolder: targetDirectory || undefined,
                            audioFormat,
                            coverUrl: t.posterUrl || initialPosterUrl
                        })
                    });
                    downloadedCount++;
                    setDownloadProgress(Math.round((downloadedCount / albumTracks.length) * 100));
                }
                setDownloadSuccess(true);
                toast.success(`Saved ${downloadedCount} tracks of "${activeTitle}" into ${targetDirectory}!`);
            } else {
                setDownloadProgress(50);
                const ytId = track?.youtubeId || (track?.id?.startsWith('yt-') ? track.id.replace('yt-', '') : undefined);
                const res = await fetch('/api/theater/music/grab', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        youtubeId: ytId,
                        streamUrl: track?.streamUrl,
                        title: track?.title || track?.name || initialTitle,
                        artist: track?.artist || activeArtist,
                        album: track?.album || (downloadScope === 'album' ? albumName : 'Singles'),
                        targetFolder: targetDirectory || undefined,
                        audioFormat,
                        coverUrl: track?.posterUrl || initialPosterUrl
                    })
                });

                if (res.ok) {
                    setDownloadProgress(100);
                    setDownloadSuccess(true);
                    toast.success(`Successfully saved "${initialTitle}" into ${targetDirectory}!`);
                } else {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.error || 'Failed to download track');
                }
            }
        } catch (e: any) {
            toast.error(e.message || 'Error occurred while downloading');
        } finally {
            setIsDownloading(false);
        }
    };

    // 2. Direct Browser / Device Download
    const handleDownloadToDevice = () => {
        const ytId = track?.youtubeId || (track?.id?.startsWith('yt-') ? track.id.replace('yt-', '') : undefined);
        const filename = `${activeArtist} - ${initialTitle}.${audioFormat}`;
        
        if (ytId) {
            const url = `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&download=true&filename=${encodeURIComponent(filename)}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(`Started browser download for "${filename}"`);
            onClose();
        } else if (track?.streamUrl) {
            const link = document.createElement('a');
            link.href = track.streamUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(`Started browser download for "${filename}"`);
            onClose();
        } else {
            // Search & stream fallback
            const searchUrl = `/api/theater/music/stream?q=${encodeURIComponent(`${activeArtist} ${initialTitle}`)}&download=true&filename=${encodeURIComponent(filename)}`;
            const link = document.createElement('a');
            link.href = searchUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(`Started browser download for "${filename}"`);
            onClose();
        }
    };

    const handleExecuteAction = () => {
        if (selectedDestId === 'device') {
            handleDownloadToDevice();
        } else {
            handleSaveToServerLibrary();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20 shrink-0">
                            <Download size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">
                                Music Download &amp; Organization
                            </h2>
                            <p className="text-xs text-zinc-400 font-medium">
                                Pick destination library, audio format, and download scope
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 transition-colors shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Scope Selector */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Disc size={13} className="text-amber-400" /> Download What?
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => setDownloadScope('track')}
                            className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all ${
                                downloadScope === 'track'
                                    ? 'bg-amber-500/20 border-amber-500/60 text-white shadow-md'
                                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                            }`}
                        >
                            <Music size={16} className={downloadScope === 'track' ? 'text-amber-400' : 'text-zinc-500'} />
                            <span className="text-xs font-black uppercase">Single Song</span>
                            <span className="text-[9px] text-zinc-500 truncate max-w-[100px]">{initialTitle}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setDownloadScope('album')}
                            className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all ${
                                downloadScope === 'album'
                                    ? 'bg-amber-500/20 border-amber-500/60 text-white shadow-md'
                                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                            }`}
                        >
                            <Disc size={16} className={downloadScope === 'album' ? 'text-amber-400' : 'text-zinc-500'} />
                            <span className="text-xs font-black uppercase">Full Album</span>
                            <span className="text-[9px] text-zinc-500 truncate max-w-[100px]">{albumName || track?.album || 'Album'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setDownloadScope('artist')}
                            className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all ${
                                downloadScope === 'artist'
                                    ? 'bg-amber-500/20 border-amber-500/60 text-white shadow-md'
                                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                            }`}
                        >
                            <User size={16} className={downloadScope === 'artist' ? 'text-amber-400' : 'text-zinc-500'} />
                            <span className="text-xs font-black uppercase">Artist All</span>
                            <span className="text-[9px] text-zinc-500 truncate max-w-[100px]">{activeArtist}</span>
                        </button>
                    </div>
                </div>

                {/* Where to Save / Download Target (Explicit Destination List) */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Folder size={13} className="text-amber-400" /> Save Where? (Select Library or Device)
                        </span>
                        <span className="text-[10px] text-zinc-500">{destinations.length} Targets</span>
                    </label>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {destinations.map((dest) => {
                            const isSelected = selectedDestId === dest.id;
                            return (
                                <div
                                    key={dest.id}
                                    onClick={() => setSelectedDestId(dest.id)}
                                    className={`p-2.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-2.5 ${
                                        isSelected
                                            ? 'bg-amber-500/15 border-amber-500/60 shadow-lg text-white'
                                            : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`p-2 rounded-xl shrink-0 ${
                                            isSelected ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {dest.type === 'device' ? (
                                                <Laptop size={15} />
                                            ) : dest.type === 'lidarr' ? (
                                                <Radio size={15} />
                                            ) : (
                                                <Folder size={15} />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-xs font-bold truncate text-white">
                                                {dest.name}
                                            </h4>
                                            <p className="text-[10px] font-mono text-zinc-400 truncate">
                                                {dest.path}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase shrink-0 ${
                                        dest.type === 'device'
                                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                            : dest.type === 'lidarr'
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    }`}>
                                        {dest.badge}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {selectedDestId === 'custom' && (
                        <div className="pt-1.5">
                            <input
                                type="text"
                                placeholder="Enter custom path (e.g. /media/music or C:\Music)"
                                value={customFolder}
                                onChange={(e) => setCustomFolder(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-mono"
                            />
                        </div>
                    )}
                </div>

                {/* Audio Format Selection */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Sparkles size={13} className="text-amber-400" /> Audio Encoding &amp; Quality
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'mp3', label: 'MP3', desc: '320 kbps' },
                            { id: 'flac', label: 'FLAC', desc: 'Lossless' },
                            { id: 'aac', label: 'AAC', desc: '256 kbps' },
                            { id: 'opus', label: 'Opus', desc: 'High-Res' }
                        ].map((fmt) => (
                            <button
                                key={fmt.id}
                                type="button"
                                onClick={() => setAudioFormat(fmt.id as any)}
                                className={`p-2 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                                    audioFormat === fmt.id
                                        ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-lg ring-1 ring-amber-400/40'
                                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                                }`}
                            >
                                <span className="text-xs font-black uppercase">{fmt.label}</span>
                                <span className="text-[9px] text-zinc-500">{fmt.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Storage Path Structure Preview */}
                <div className="p-2.5 bg-zinc-900/50 rounded-xl border border-zinc-800/60 text-[10px] text-zinc-400 space-y-1 font-mono">
                    <div className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold">Auto-Organized Structure:</div>
                    <div className="truncate text-amber-300">
                        {selectedDestId === 'device' ? (
                            <span>Direct Download: <strong className="text-white">{activeArtist} - {initialTitle}.{audioFormat}</strong></span>
                        ) : (
                            <span>{selectedDestId === 'custom' ? (customFolder || './data/music') : selectedDest?.path}/{activeArtist}/{downloadScope === 'album' ? (albumName || 'Album') : (track?.album || 'Singles')}/{initialTitle}.{audioFormat}</span>
                        )}
                    </div>
                </div>

                {/* Master Action Button */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-900">
                    <button
                        onClick={onClose}
                        disabled={isDownloading}
                        className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold text-xs border border-zinc-800 transition-all disabled:opacity-50"
                    >
                        {downloadSuccess ? 'Close' : 'Cancel'}
                    </button>

                    <button
                        onClick={handleExecuteAction}
                        disabled={isDownloading || downloadSuccess}
                        className={`flex-1 px-5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-xl ${
                            selectedDestId === 'device'
                                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/50'
                                : downloadSuccess
                                ? 'bg-emerald-500 text-black shadow-emerald-950/40'
                                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950/50'
                        } disabled:opacity-75`}
                    >
                        {isDownloading ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" /> Downloading ({downloadProgress}%)
                            </>
                        ) : downloadSuccess ? (
                            <>
                                <CheckCircle2 size={14} /> Saved Successfully!
                            </>
                        ) : selectedDestId === 'device' ? (
                            <>
                                <Laptop size={14} /> Download to This Device ({audioFormat.toUpperCase()})
                            </>
                        ) : (
                            <>
                                <HardDrive size={14} /> Save to {selectedDest?.name || 'Library'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

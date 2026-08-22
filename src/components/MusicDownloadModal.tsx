'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Download, Disc, Music, HardDrive,
    Sparkles, Folder, CheckCircle2, RefreshCw,
    Laptop, Radio, ChevronDown
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
    type: 'theater' | 'lidarr' | 'device';
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

    const [downloadScope, setDownloadScope] = useState<'track' | 'album'>(defaultIsAlbum ? 'album' : 'track');
    const [destinations, setDestinations] = useState<DestinationOption[]>([]);
    const [selectedDestId, setSelectedDestId] = useState<string>('device');
    const [audioFormat, setAudioFormat] = useState<'mp3' | 'aac' | 'opus'>('mp3');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    const activeTitle = downloadScope === 'album' ? (albumName || track?.album || 'Album') : initialTitle;
    const activeArtist = initialArtist;

    // Fetch existing music libraries & instances to populate destination choices
    useEffect(() => {
        const fetchDestinations = async () => {
            const list: DestinationOption[] = [];

            // 1. Direct Local Device Download (Browser download)
            list.push({
                id: 'device',
                name: 'Local Device (Direct Download to this Computer)',
                path: 'Browser Direct File Download',
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
                                name: `Theater Library: ${lib.name}`,
                                path: f,
                                type: 'theater',
                                badge: 'Server Library'
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
                                        name: `Lidarr Instance: ${l.name}`,
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

            // If no server libraries exist at all, add default server music folder option
            const serverLibs = list.filter(d => d.type !== 'device');
            if (serverLibs.length === 0) {
                list.push({
                    id: 'theater-default',
                    name: 'Server Music Storage',
                    path: './data/music',
                    type: 'theater',
                    badge: 'Server Library'
                });
            }

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

    // 1. Save directly into selected server library folder
    const handleSaveToServerLibrary = async () => {
        const targetDirectory = selectedDest?.path || './data/music';

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
                            targetFolder: targetDirectory,
                            audioFormat,
                            coverUrl: t.posterUrl || initialPosterUrl
                        })
                    });
                    downloadedCount++;
                    setDownloadProgress(Math.round((downloadedCount / albumTracks.length) * 100));
                }
                setDownloadSuccess(true);
                toast.success(`Saved ${downloadedCount} tracks into ${selectedDest.name}!`);
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
                        targetFolder: targetDirectory,
                        audioFormat,
                        coverUrl: track?.posterUrl || initialPosterUrl
                    })
                });

                if (res.ok) {
                    setDownloadProgress(100);
                    setDownloadSuccess(true);
                    toast.success(`Successfully saved "${initialTitle}" into ${selectedDest.name}!`);
                } else {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.error || 'Failed to download track');
                }
            }
        } catch (e: any) {
            toast.error(e.message || 'Error occurred while saving to library');
        } finally {
            setIsDownloading(false);
        }
    };

    // 2. Direct Browser / Device Download
    const handleDownloadToDevice = () => {
        const ytId = track?.youtubeId || (track?.id?.startsWith('yt-') ? track.id.replace('yt-', '') : undefined);
        const safeArtist = activeArtist.replace(/[/\\?%*:|"<>]/g, '').trim();
        const safeTitle = initialTitle.replace(/[/\\?%*:|"<>]/g, '').trim();
        const ext = audioFormat === 'aac' ? 'm4a' : audioFormat;
        const filename = `${safeArtist} - ${safeTitle}.${ext}`;

        let downloadUrl = '';
        if (ytId) {
            downloadUrl = `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&download=true&filename=${encodeURIComponent(filename)}`;
        } else if (track?.streamUrl && track.streamUrl.includes('ytId=')) {
            downloadUrl = `${track.streamUrl}&download=true&filename=${encodeURIComponent(filename)}`;
        } else if (track?.streamUrl) {
            downloadUrl = track.streamUrl;
        } else {
            downloadUrl = `/api/theater/music/stream?q=${encodeURIComponent(`${safeArtist} ${safeTitle}`)}&download=true&filename=${encodeURIComponent(filename)}`;
        }

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', filename);
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Downloading "${filename}" to your device`);
        onClose();
    };

    const handleExecuteAction = () => {
        if (selectedDestId === 'device') {
            handleDownloadToDevice();
        } else {
            handleSaveToServerLibrary();
        }
    };

    return (
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/15 text-amber-400 rounded-2xl border border-amber-500/30 shrink-0">
                            <Download size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white">
                                Music Download &amp; Organization
                            </h2>
                            <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                                Choose destination library and audio quality
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 transition-colors shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scope Selector */}
                <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Disc size={14} className="text-amber-400" /> Download What?
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            onClick={() => setDownloadScope('track')}
                            className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all ${
                                downloadScope === 'track'
                                    ? 'bg-amber-500/20 border-amber-500/60 text-white shadow-md'
                                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                            }`}
                        >
                            <Music size={18} className={downloadScope === 'track' ? 'text-amber-400' : 'text-zinc-500'} />
                            <span className="text-sm font-black uppercase">Single Song</span>
                            <span className="text-xs text-zinc-500 truncate max-w-[150px]">{initialTitle}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setDownloadScope('album')}
                            className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all ${
                                downloadScope === 'album'
                                    ? 'bg-amber-500/20 border-amber-500/60 text-white shadow-md'
                                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                            }`}
                        >
                            <Disc size={18} className={downloadScope === 'album' ? 'text-amber-400' : 'text-zinc-500'} />
                            <span className="text-sm font-black uppercase">Full Album</span>
                            <span className="text-xs text-zinc-500 truncate max-w-[150px]">{albumName || track?.album || 'Album'}</span>
                        </button>
                    </div>
                </div>

                {/* Where to Save (Pure Dropdown & Selector - No path typing) */}
                <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Folder size={14} className="text-amber-400" /> Destination (Audio Library or Local Device)
                        </span>
                        <span className="text-xs font-mono text-zinc-500 font-bold">{destinations.length} Options</span>
                    </label>

                    <div className="space-y-2">
                        {destinations.map((dest) => {
                            const isSelected = selectedDestId === dest.id;
                            return (
                                <div
                                    key={dest.id}
                                    onClick={() => setSelectedDestId(dest.id)}
                                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                        isSelected
                                            ? 'bg-amber-500/15 border-amber-500/60 shadow-lg text-white ring-1 ring-amber-400/40'
                                            : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`p-2.5 rounded-xl shrink-0 ${
                                            isSelected ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {dest.type === 'device' ? (
                                                <Laptop size={18} />
                                            ) : dest.type === 'lidarr' ? (
                                                <Radio size={18} />
                                            ) : (
                                                <Folder size={18} />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold truncate text-white">
                                                {dest.name}
                                            </h4>
                                            <p className="text-xs font-mono text-zinc-400 truncate">
                                                {dest.path}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${
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
                </div>

                {/* Audio Format / Quality Selection (Realistic YouTube Profiles) */}
                <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-400" /> Audio Quality Profile
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'mp3', label: 'MP3 320k', desc: 'High Quality MP3' },
                            { id: 'aac', label: 'AAC 256k', desc: 'Standard M4A' },
                            { id: 'opus', label: 'Opus 160k', desc: 'Native Stream' }
                        ].map((fmt) => (
                            <button
                                key={fmt.id}
                                type="button"
                                onClick={() => setAudioFormat(fmt.id as any)}
                                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                                    audioFormat === fmt.id
                                        ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-lg ring-1 ring-amber-400/40'
                                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                                }`}
                            >
                                <span className="text-sm font-black uppercase">{fmt.label}</span>
                                <span className="text-[10px] text-zinc-500">{fmt.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Master Action Button */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-900">
                    <button
                        onClick={onClose}
                        disabled={isDownloading}
                        className="px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold text-xs sm:text-sm border border-zinc-800 transition-all disabled:opacity-50"
                    >
                        {downloadSuccess ? 'Close' : 'Cancel'}
                    </button>

                    <button
                        onClick={handleExecuteAction}
                        disabled={isDownloading || downloadSuccess}
                        className={`flex-1 px-5 py-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xl ${
                            selectedDestId === 'device'
                                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/50'
                                : downloadSuccess
                                ? 'bg-emerald-500 text-black shadow-emerald-950/40'
                                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950/50'
                        } disabled:opacity-75`}
                    >
                        {isDownloading ? (
                            <>
                                <RefreshCw size={16} className="animate-spin" /> Saving ({downloadProgress}%)
                            </>
                        ) : downloadSuccess ? (
                            <>
                                <CheckCircle2 size={16} /> Saved Successfully!
                            </>
                        ) : selectedDestId === 'device' ? (
                            <>
                                <Laptop size={16} /> Download to This Device ({audioFormat.toUpperCase()})
                            </>
                        ) : (
                            <>
                                <HardDrive size={16} /> Save to {selectedDest?.name || 'Library'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

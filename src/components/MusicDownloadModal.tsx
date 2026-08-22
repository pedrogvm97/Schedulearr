'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Download, Disc, Music, HardDrive,
    Sparkles, Folder, CheckCircle2, RefreshCw,
    Laptop
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
    type: 'theater' | 'device';
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
    const [audioFormat, setAudioFormat] = useState<'mp3' | 'm4a' | 'opus' | 'flac'>('mp3');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    const activeTitle = downloadScope === 'album' ? (albumName || track?.album || 'Album') : initialTitle;
    const activeArtist = initialArtist;

    // Fetch existing real Theater music libraries to populate destination choices
    useEffect(() => {
        const fetchDestinations = async () => {
            const list: DestinationOption[] = [];

            // 1. Direct Local Device Download (Browser download to user's phone / PC)
            list.push({
                id: 'device',
                name: 'Local Device (Direct Download to this device)',
                path: 'Browser Direct Audio File Download',
                type: 'device',
                badge: 'Local Device'
            });

            // 2. Fetch Existing Server Audio Libraries
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
                        if (folders.length > 0) {
                            folders.forEach((f, fi) => {
                                list.push({
                                    id: `theater-${lib.id}-${fi}`,
                                    name: `${lib.name} Library`,
                                    path: f,
                                    type: 'theater',
                                    badge: 'Server Library'
                                });
                            });
                        } else {
                            list.push({
                                id: `theater-${lib.id}-0`,
                                name: `${lib.name} Library`,
                                path: './data/music',
                                type: 'theater',
                                badge: 'Server Library'
                            });
                        }
                    }
                }
            } catch {}

            // If no server libraries exist at all, add default server music folder option
            const serverLibs = list.filter(d => d.type !== 'device');
            if (serverLibs.length === 0) {
                list.push({
                    id: 'theater-default',
                    name: 'Server Music Folder',
                    path: './data/music',
                    type: 'theater',
                    badge: 'Server Library'
                });
            }

            setDestinations(list);
            // Default to device for instant single-click downloads
            setSelectedDestId('device');
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
            const saveSingleTrack = async (targetTrack: any) => {
                const ytId = targetTrack?.youtubeId || (targetTrack?.id?.startsWith('yt-') ? targetTrack.id.replace('yt-', '') : undefined);
                const title = targetTrack?.title || targetTrack?.name || initialTitle;
                const artist = targetTrack?.artist || activeArtist;
                const album = targetTrack?.album || (downloadScope === 'album' ? albumName : 'Singles');
                const coverUrl = targetTrack?.posterUrl || initialPosterUrl;

                // Attempt 1: Direct Server Grab
                try {
                    const res = await fetch('/api/theater/music/grab', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            youtubeId: ytId,
                            streamUrl: targetTrack?.streamUrl,
                            title,
                            artist,
                            album,
                            targetFolder: targetDirectory,
                            audioFormat,
                            coverUrl
                        })
                    });

                    if (res.ok) {
                        return true;
                    }
                } catch {}

                // Attempt 2: Client-Assisted Stream Proxy Upload
                // If server IP was blocked by YouTube, browser fetches audio and uploads directly to server
                try {
                    const streamEndpoint = ytId
                        ? `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&format=${audioFormat}`
                        : (targetTrack?.streamUrl || `/api/theater/music/stream?q=${encodeURIComponent(`${artist} ${title}`)}&format=${audioFormat}`);

                    const audioRes = await fetch(streamEndpoint);
                    if (audioRes.ok) {
                        const blob = await audioRes.blob();
                        const formData = new FormData();
                        formData.append('file', blob, `${title}.${audioFormat}`);
                        formData.append('title', title);
                        formData.append('artist', artist);
                        formData.append('album', album);
                        if (targetDirectory) formData.append('targetFolder', targetDirectory);
                        formData.append('audioFormat', audioFormat);
                        if (coverUrl) formData.append('coverUrl', coverUrl);

                        const uploadRes = await fetch('/api/theater/music/grab', {
                            method: 'POST',
                            body: formData
                        });
                        return uploadRes.ok;
                    }
                } catch {}

                return false;
            };

            if (downloadScope === 'album' && albumTracks && albumTracks.length > 0) {
                let downloadedCount = 0;
                for (let i = 0; i < albumTracks.length; i++) {
                    const t = albumTracks[i];
                    const ok = await saveSingleTrack(t);
                    if (ok) downloadedCount++;
                    setDownloadProgress(Math.round(((i + 1) / albumTracks.length) * 100));
                }
                setDownloadSuccess(true);
                toast.success(`Saved ${downloadedCount} tracks into ${selectedDest.name}!`);
            } else {
                setDownloadProgress(50);
                const ok = await saveSingleTrack(track);
                if (ok) {
                    setDownloadProgress(100);
                    setDownloadSuccess(true);
                    toast.success(`Successfully saved "${initialTitle}" into ${selectedDest.name}!`);
                } else {
                    toast.error('Failed to extract audio stream for this track. Please check network connection.');
                }
            }
        } catch (e: any) {
            toast.error(e.message || 'Error occurred while saving to library');
        } finally {
            setIsDownloading(false);
        }
    };

    // 2. Direct Browser / Device Download (Blob Object URL - Zero 403 Redirects)
    const handleDownloadToDevice = async () => {
        const ytId = track?.youtubeId || (track?.id?.startsWith('yt-') ? track.id.replace('yt-', '') : undefined);
        const safeArtist = activeArtist.replace(/[/\\?%*:|"<>]/g, '').trim();
        const safeTitle = initialTitle.replace(/[/\\?%*:|"<>]/g, '').trim();
        const ext = audioFormat;
        const filename = `${safeArtist} - ${safeTitle}.${ext}`;

        let downloadUrl = '';
        if (ytId) {
            downloadUrl = `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&format=${audioFormat}&download=true&filename=${encodeURIComponent(filename)}`;
        } else if (track?.streamUrl && track.streamUrl.includes('ytId=')) {
            downloadUrl = `${track.streamUrl}&format=${audioFormat}&download=true&filename=${encodeURIComponent(filename)}`;
        } else if (track?.streamUrl) {
            downloadUrl = track.streamUrl;
        } else {
            downloadUrl = `/api/theater/music/stream?q=${encodeURIComponent(`${safeArtist} ${safeTitle}`)}&format=${audioFormat}&download=true&filename=${encodeURIComponent(filename)}`;
        }

        setIsDownloading(true);
        setDownloadProgress(20);
        toast.loading(`Preparing ${filename}...`, { id: 'device-dl' });

        try {
            const res = await fetch(downloadUrl);
            if (!res.ok) {
                throw new Error('Server could not prepare audio stream');
            }
            setDownloadProgress(75);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15000);

            setDownloadProgress(100);
            setDownloadSuccess(true);
            toast.success(`Downloaded "${filename}"!`, { id: 'device-dl' });
            setTimeout(() => onClose(), 800);
        } catch (err: any) {
            toast.error(err.message || 'Failed to download to device', { id: 'device-dl' });
        } finally {
            setIsDownloading(false);
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
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 sm:space-y-5 max-h-[92vh] overflow-y-auto custom-scrollbar">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/15 text-amber-400 rounded-2xl border border-amber-500/30 shrink-0">
                            <Download size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-black text-white">
                                Save / Download Music
                            </h2>
                            <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                                Choose destination &amp; format
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

                {/* Scope Selector: Single Song vs Full Album */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Disc size={14} className="text-amber-400" /> Save What?
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

                {/* Where to Save (Strictly Real Server Libraries or Local Device) */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Folder size={14} className="text-amber-400" /> Destination
                        </span>
                        <span className="text-xs font-mono text-zinc-500 font-bold">{destinations.length} Options</span>
                    </label>

                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
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
                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    }`}>
                                        {dest.badge}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Audio Format Selection */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-400" /> Save / Download Format
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { id: 'mp3', label: 'MP3 (320k)', desc: 'Universal compatible MP3 (~320kbps)' },
                            { id: 'm4a', label: 'AAC / M4A', desc: 'Native YouTube AAC stream (~128k-256k)' },
                            { id: 'opus', label: 'Opus / WebM', desc: 'Native YouTube Opus stream (~160k)' },
                            { id: 'flac', label: 'FLAC', desc: 'Lossless audio format' }
                        ].map((fmt) => (
                            <button
                                key={fmt.id}
                                type="button"
                                onClick={() => setAudioFormat(fmt.id as any)}
                                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                                    audioFormat === fmt.id
                                        ? 'bg-amber-500/20 border-amber-500/70 text-white shadow-lg ring-1 ring-amber-400/40'
                                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                                }`}
                            >
                                <span className="text-xs sm:text-sm font-black uppercase">{fmt.label}</span>
                                <span className="text-[10px] sm:text-[11px] text-zinc-400 text-center mt-0.5">{fmt.desc}</span>
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

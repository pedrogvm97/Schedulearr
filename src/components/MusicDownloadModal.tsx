'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Download, Disc, Music, HardDrive, Check,
    AlertCircle, Sparkles, Folder, CheckCircle2, RefreshCw,
    User, ArrowDownToLine, Monitor
} from 'lucide-react';
import { toast } from 'sonner';

interface MusicDownloadModalProps {
    track?: any;
    albumTracks?: any[];
    albumName?: string;
    artistName?: string;
    onClose: () => void;
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
    const [libraries, setLibraries] = useState<any[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [customFolder, setCustomFolder] = useState<string>('');
    const [audioFormat, setAudioFormat] = useState<'flac' | 'mp3' | 'aac' | 'opus'>('mp3');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    const activeTitle = downloadScope === 'artist' ? `${initialArtist} (All Releases)` : downloadScope === 'album' ? (albumName || track?.album || 'Album') : initialTitle;
    const activeArtist = initialArtist;

    // Fetch existing music libraries to populate folder choices
    useEffect(() => {
        const fetchLibraries = async () => {
            try {
                const res = await fetch('/api/theater/libraries');
                if (res.ok) {
                    const data = await res.json();
                    const musicLibs = (Array.isArray(data) ? data : []).filter((l: any) => l.type === 'music' || l.type === 'audio');
                    setLibraries(musicLibs);
                    if (musicLibs.length > 0 && musicLibs[0].folders) {
                        try {
                            const parsedFolders = typeof musicLibs[0].folders === 'string' ? JSON.parse(musicLibs[0].folders) : musicLibs[0].folders;
                            if (Array.isArray(parsedFolders) && parsedFolders.length > 0) {
                                setSelectedFolder(parsedFolders[0]);
                            }
                        } catch {}
                    }
                }
            } catch {}
        };
        fetchLibraries();
    }, []);

    // 1. Save directly into server library folder
    const handleSaveToServerLibrary = async () => {
        const targetDirectory = customFolder.trim() || selectedFolder;

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
                toast.success(`Saved ${downloadedCount} tracks of "${activeTitle}" into Music Library!`);
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
                    toast.success(`Successfully saved "${initialTitle}" into Music Library!`);
                } else {
                    const err = await res.json();
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
            toast.error('No stream URL available to download directly');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                            <Download size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">
                                Music Download &amp; Organization
                            </h2>
                            <p className="text-xs text-zinc-400 font-medium">
                                Choose download scope, quality format, and target folder
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Scope Selector: Single Song vs Full Album vs Artist */}
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

                {/* Target Music Library Folder Selection */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Folder size={13} className="text-amber-400" /> Target Music Library Folder
                    </label>
                    {libraries.length > 0 ? (
                        <select
                            value={selectedFolder}
                            onChange={(e) => {
                                setSelectedFolder(e.target.value);
                                setCustomFolder('');
                            }}
                            className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                        >
                            {libraries.map((lib) => {
                                let folders: string[] = [];
                                try {
                                    folders = typeof lib.folders === 'string' ? JSON.parse(lib.folders) : (lib.folders || []);
                                } catch {}
                                return folders.map((f, idx) => (
                                    <option key={`${lib.id}-${idx}`} value={f}>
                                        {lib.name} ({f})
                                    </option>
                                ));
                            })}
                        </select>
                    ) : (
                        <input
                            type="text"
                            placeholder="e.g. /media/music, ./data/music or C:\Music"
                            value={customFolder}
                            onChange={(e) => setCustomFolder(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                        />
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
                                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all ${
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
                    <div className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold">Auto-Organized File Structure:</div>
                    <div className="truncate text-amber-300">
                        {customFolder.trim() || selectedFolder || './data/music'}/{activeArtist}/{downloadScope === 'album' ? (albumName || 'Album') : (track?.album || 'Singles')}/{initialTitle}.{audioFormat}
                    </div>
                </div>

                {/* Actions: Save to Server Library & Download to Device */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-900">
                    <button
                        onClick={handleDownloadToDevice}
                        type="button"
                        className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold text-xs border border-zinc-800 transition-all flex items-center gap-1.5"
                        title="Download audio directly to this browser / computer"
                    >
                        <Monitor size={14} className="text-purple-400" />
                        <span className="hidden sm:inline">Download to</span> Device
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={isDownloading}
                            className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold text-xs border border-zinc-800 transition-all disabled:opacity-50"
                        >
                            {downloadSuccess ? 'Close' : 'Cancel'}
                        </button>

                        <button
                            onClick={handleSaveToServerLibrary}
                            disabled={isDownloading || downloadSuccess}
                            className={`px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-xl ${
                                downloadSuccess
                                    ? 'bg-emerald-500 text-black shadow-emerald-950/40'
                                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950/50'
                            } disabled:opacity-75`}
                        >
                            {isDownloading ? (
                                <>
                                    <RefreshCw size={13} className="animate-spin" /> Saving ({downloadProgress}%)
                                </>
                            ) : downloadSuccess ? (
                                <>
                                    <CheckCircle2 size={13} /> Saved to Library!
                                </>
                            ) : (
                                <>
                                    <HardDrive size={13} /> Save to Library
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

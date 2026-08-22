'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Download, Disc, Music, HardDrive, Check,
    AlertCircle, Sparkles, Folder, CheckCircle2, RefreshCw
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
    const isAlbum = !!albumTracks && albumTracks.length > 0;
    const title = isAlbum ? (albumName || 'Album') : (track?.title || track?.name || 'Track');
    const artist = artistName || track?.artist || 'Unknown Artist';
    const posterUrl = isAlbum ? (albumTracks?.[0]?.posterUrl || '') : (track?.posterUrl || '');

    const [libraries, setLibraries] = useState<any[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [customFolder, setCustomFolder] = useState<string>('');
    const [audioFormat, setAudioFormat] = useState<'flac' | 'mp3' | 'aac' | 'opus'>('mp3');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    // Fetch existing libraries to populate destination choices
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

    const handleStartDownload = async () => {
        const targetDirectory = customFolder.trim() || selectedFolder;
        if (!targetDirectory) {
            toast.error('Please select or specify a target music folder');
            return;
        }

        setIsDownloading(true);
        setDownloadProgress(20);

        try {
            if (isAlbum) {
                let downloadedCount = 0;
                for (let i = 0; i < (albumTracks || []).length; i++) {
                    const t = albumTracks![i];
                    await fetch('/api/theater/music/grab', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            youtubeId: t.youtubeId || (t.id?.startsWith('yt-') ? t.id.replace('yt-', '') : undefined),
                            streamUrl: t.streamUrl,
                            title: t.title || t.name,
                            artist: t.artist || artist,
                            album: albumName || t.album || 'Album',
                            targetFolder: targetDirectory,
                            audioFormat,
                            coverUrl: t.posterUrl || posterUrl
                        })
                    });
                    downloadedCount++;
                    setDownloadProgress(Math.round((downloadedCount / albumTracks!.length) * 100));
                }
                setDownloadSuccess(true);
                toast.success(`Successfully saved ${downloadedCount} tracks to ${artist} / ${albumName || 'Album'}`);
            } else {
                setDownloadProgress(50);
                const res = await fetch('/api/theater/music/grab', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        youtubeId: track?.youtubeId || (track?.id?.startsWith('yt-') ? track.id.replace('yt-', '') : undefined),
                        streamUrl: track?.streamUrl,
                        title: track?.title || track?.name,
                        artist: track?.artist || artist,
                        album: track?.album || 'Singles',
                        targetFolder: targetDirectory,
                        audioFormat,
                        coverUrl: track?.posterUrl
                    })
                });

                if (res.ok) {
                    setDownloadProgress(100);
                    setDownloadSuccess(true);
                    toast.success(`Track downloaded & organized in library!`);
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                            <Download size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">
                                {isAlbum ? 'Download & Organize Album' : 'Download Audio Track'}
                            </h2>
                            <p className="text-xs text-zinc-400 font-medium">
                                Configure audio quality and destination library folder
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

                {/* Track / Album Preview Card */}
                <div className="flex items-center gap-4 p-3.5 bg-zinc-900/80 rounded-2xl border border-zinc-800/80">
                    <div className="w-16 h-16 rounded-xl bg-zinc-800 border border-zinc-700/60 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {posterUrl ? (
                            <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <Disc size={28} className="text-zinc-500" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white truncate">{title}</p>
                        <p className="text-xs font-semibold text-zinc-400 truncate">{artist}</p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                {isAlbum ? `${albumTracks?.length || 0} Tracks` : 'Single Track'}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                                Provider: YouTube / Direct Stream
                            </span>
                        </div>
                    </div>
                </div>

                {/* Destination Music Library Selection */}
                <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Folder size={14} className="text-amber-400" /> Destination Library Folder
                    </label>
                    {libraries.length > 0 ? (
                        <select
                            value={selectedFolder}
                            onChange={(e) => {
                                setSelectedFolder(e.target.value);
                                setCustomFolder('');
                            }}
                            className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
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
                            placeholder="e.g. /media/music or C:\Music"
                            value={customFolder}
                            onChange={(e) => setCustomFolder(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                        />
                    )}
                </div>

                {/* Audio Format Selection */}
                <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-400" /> Audio Encoding & Format
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'mp3', label: 'MP3', desc: '320 kbps' },
                            { id: 'flac', label: 'FLAC', desc: 'Lossless' },
                            { id: 'aac', label: 'AAC', desc: '256 kbps' },
                            { id: 'opus', label: 'Opus', desc: 'High Qual' }
                        ].map((fmt) => (
                            <button
                                key={fmt.id}
                                type="button"
                                onClick={() => setAudioFormat(fmt.id as any)}
                                className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                                    audioFormat === fmt.id
                                        ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-lg shadow-amber-950/40 ring-1 ring-amber-400/40'
                                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                                }`}
                            >
                                <span className="text-xs font-black uppercase">{fmt.label}</span>
                                <span className="text-[10px] text-zinc-500">{fmt.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Storage Path Structure Preview */}
                <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/60 text-[11px] text-zinc-400 space-y-1 font-mono">
                    <div className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold">Auto-Organized Structure:</div>
                    <div className="truncate text-amber-300">
                        {customFolder.trim() || selectedFolder || '/media/music'}/{artist}/{isAlbum ? (albumName || 'Album') : (track?.album || 'Singles')}/{title}.{audioFormat}
                    </div>
                </div>

                {/* Actions & Progress */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        disabled={isDownloading}
                        className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs border border-zinc-800 transition-all disabled:opacity-50"
                    >
                        {downloadSuccess ? 'Close' : 'Cancel'}
                    </button>
                    <button
                        onClick={handleStartDownload}
                        disabled={isDownloading || downloadSuccess}
                        className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all shadow-xl ${
                            downloadSuccess
                                ? 'bg-emerald-500 text-black shadow-emerald-950/40'
                                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-amber-950/50'
                        } disabled:opacity-75`}
                    >
                        {isDownloading ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" /> Downloading ({downloadProgress}%)
                            </>
                        ) : downloadSuccess ? (
                            <>
                                <CheckCircle2 size={14} /> Downloaded & Tagged!
                            </>
                        ) : (
                            <>
                                <Download size={14} /> Start Download
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

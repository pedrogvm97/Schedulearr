'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Download, Disc, Music, HardDrive,
    Folder, RefreshCw,
    Laptop, CheckCircle2
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
    const isAlbumAvailable = !!albumTracks && albumTracks.length > 0;
    const initialTitle = albumName || track?.album || track?.title || track?.name || 'Track';
    const initialArtist = artistName || track?.artist || 'Unknown Artist';
    const initialPosterUrl = albumTracks?.[0]?.posterUrl || track?.posterUrl || '';

    const isLocalFile = Boolean(track?.path || (albumTracks?.[0]?.path));
    const [downloadScope, setDownloadScope] = useState<'track' | 'album'>(isAlbumAvailable ? 'album' : 'track');
    const [saveFormat, setSaveFormat] = useState<'original' | 'mp3' | 'flac' | 'wav' | 'm4a' | 'opus'>('mp3');
    const [destinations, setDestinations] = useState<DestinationOption[]>([]);
    const [selectedDestId, setSelectedDestId] = useState<string>('device');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [currentDownloadStatus, setCurrentDownloadStatus] = useState<string>('');
    const [readyFile, setReadyFile] = useState<{ url: string; filename: string; size?: number } | null>(null);

    // Fetch existing server music libraries to populate server save options
    useEffect(() => {
        const fetchDestinations = async () => {
            const list: DestinationOption[] = [
                {
                    id: 'device',
                    name: 'Download to this Device',
                    path: 'Direct Browser Download to your Phone or PC',
                    type: 'device',
                    badge: 'Local Device'
                }
            ];

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
                        }
                    }
                }
            } catch {}

            setDestinations(list);
            setSelectedDestId('device');
        };

        fetchDestinations();
    }, []);

    const selectedDest = destinations.find(d => d.id === selectedDestId) || destinations[0];
    const tracksToProcess = downloadScope === 'album' && isAlbumAvailable ? albumTracks : (track ? [track] : []);

    const getDownloadUrlForTrack = (t: any): { url: string; filename: string } => {
        const tArtist = (t.artist || initialArtist || 'Artist').replace(/[/\\?%*:|"<>]/g, '').trim();
        const tTitle = (t.title || t.name || 'Track').replace(/[/\\?%*:|"<>]/g, '').trim();
        const ext = saveFormat === 'original' ? (t.extension || 'mp3').toLowerCase().replace(/^\./, '') : saveFormat;
        const filename = `${tArtist} - ${tTitle}.${ext}`;

        // 1. If it's a local file on server disk and user chose original format:
        if (t.path && saveFormat === 'original') {
            return {
                url: `/api/theater/music/download?path=${encodeURIComponent(t.path)}&title=${encodeURIComponent(tTitle)}&artist=${encodeURIComponent(tArtist)}`,
                filename
            };
        }

        // 2. If it's a local file but user requested conversion (e.g. FLAC -> MP3):
        if (t.path && saveFormat !== 'original') {
            return {
                url: `/api/theater/transcode?path=${encodeURIComponent(t.path)}&format=${saveFormat}&download=true&filename=${encodeURIComponent(filename)}`,
                filename
            };
        }

        // 3. If it's a YouTube track / Online stream:
        const ytId = t.youtubeId || (t.id?.startsWith('yt-') ? t.id.replace('yt-', '') : undefined);
        if (ytId) {
            return {
                url: `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&saveFormat=${saveFormat}&download=true&filename=${encodeURIComponent(filename)}`,
                filename
            };
        }

        // 4. Generic stream fallback:
        if (t.streamUrl) {
            return {
                url: `${t.streamUrl}${t.streamUrl.includes('?') ? '&' : '?'}saveFormat=${saveFormat}&download=true&filename=${encodeURIComponent(filename)}`,
                filename
            };
        }

        return {
            url: `/api/theater/music/stream?q=${encodeURIComponent(`${tArtist} ${tTitle}`)}&saveFormat=${saveFormat}&download=true&filename=${encodeURIComponent(filename)}`,
            filename
        };
    };

    // Download to user's device (Download to Server Disk -> Send File to Device)
    const handleDownloadToDevice = async () => {
        if (!tracksToProcess || tracksToProcess.length === 0) {
            toast.error('No tracks selected to download');
            return;
        }

        setIsDownloading(true);
        setDownloadProgress(10);
        let successCount = 0;

        for (let i = 0; i < tracksToProcess.length; i++) {
            const currentTrack = tracksToProcess[i];
            const tArtist = (currentTrack.artist || initialArtist || 'Artist').replace(/[/\\?%*:|"<>]/g, '').trim();
            const tTitle = (currentTrack.title || currentTrack.name || 'Track').replace(/[/\\?%*:|"<>]/g, '').trim();
            setCurrentDownloadStatus(`1/3: Contacting streaming engine for "${tArtist} - ${tTitle}"...`);

            // Smooth progress increment ticker while waiting for server processing
            let curPct = 15;
            setDownloadProgress(curPct);
            const progressTimer = setInterval(() => {
                curPct = Math.min(curPct + 4, 95);
                setDownloadProgress(curPct);
                if (curPct > 35 && curPct < 65) {
                    setCurrentDownloadStatus(`2/3: Extracting audio stream & encoding ${saveFormat.toUpperCase()}...`);
                } else if (curPct >= 65) {
                    setCurrentDownloadStatus(`3/3: Finalizing tags and album artwork...`);
                }
            }, 500);

            try {
                // Step 1: Tell server to download and convert to server disk
                const prepRes = await fetch('/api/theater/music/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        track: currentTrack,
                        youtubeId: currentTrack.youtubeId || (currentTrack.id?.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : undefined),
                        title: tTitle,
                        artist: tArtist,
                        album: currentTrack.album || albumName,
                        saveFormat,
                        path: currentTrack.path,
                        streamUrl: currentTrack.streamUrl || currentTrack.previewUrl,
                        plexPart: currentTrack.plexPart || currentTrack.key,
                        instanceId: currentTrack.instanceId
                    })
                });

                clearInterval(progressTimer);

                if (prepRes.ok) {
                    const prepData = await prepRes.json();
                    if (prepData.downloadUrl) {
                        const finalName = prepData.filename || `${tArtist} - ${tTitle}.${saveFormat === 'original' ? 'mp3' : saveFormat}`;
                        setReadyFile({
                            url: prepData.downloadUrl,
                            filename: finalName,
                            size: prepData.size
                        });
                        setCurrentDownloadStatus(`Ready: ${finalName}`);
                        setDownloadProgress(100);

                        // 1. Direct browser attachment navigation (Guarantees native download prompt on iOS, Android, and Desktop)
                        try {
                            window.location.assign(prepData.downloadUrl);
                        } catch {
                            // Fallback to anchor click if navigation is blocked
                            try {
                                const a = document.createElement('a');
                                a.href = prepData.downloadUrl;
                                a.download = finalName;
                                a.target = '_self';
                                document.body.appendChild(a);
                                a.click();
                                setTimeout(() => {
                                    try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
                                }, 3000);
                            } catch {}
                        }

                        successCount++;
                        continue;
                    }
                } else {
                    const errData = await prepRes.json().catch(() => ({}));
                    console.warn(`Server prep failed for ${tTitle}:`, errData.error);
                }

                // Fallback: Direct stream / local file endpoint
                const { url: directUrl, filename: directFilename } = getDownloadUrlForTrack(currentTrack);
                setReadyFile({
                    url: directUrl,
                    filename: directFilename
                });
                setCurrentDownloadStatus(`Delivering file: ${directFilename}`);
                setDownloadProgress(100);

                const a = document.createElement('a');
                a.href = directUrl;
                a.download = directFilename;
                a.target = '_self';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
                }, 3000);

                successCount++;
            } catch (err: any) {
                clearInterval(progressTimer);
                console.error(`Failed to download ${tTitle}:`, err);
                toast.error(`Failed to download "${tTitle}": ${err.message}`);
            }

            setDownloadProgress(Math.round(((i + 1) / tracksToProcess.length) * 100));
            if (tracksToProcess.length > 1) {
                await new Promise(r => setTimeout(r, 600));
            }
        }

        setIsDownloading(false);
        if (successCount > 0) {
            toast.success(`Download ready! Click "Save to Device" below if not prompted.`);
        } else {
            toast.error('Download failed. Please check server logs.');
        }
    };

    // Save to Server Library Folder
    const handleSaveToServerLibrary = async () => {
        const targetDirectory = selectedDest?.path || './data/music';
        setIsDownloading(true);
        setDownloadProgress(10);
        let savedCount = 0;

        for (let i = 0; i < tracksToProcess.length; i++) {
            const currentTrack = tracksToProcess[i];
            const tArtist = currentTrack.artist || initialArtist;
            const tTitle = currentTrack.title || currentTrack.name || initialTitle;
            const tAlbum = currentTrack.album || albumName || 'Singles';
            const ytId = currentTrack.youtubeId || (currentTrack.id?.startsWith('yt-') ? currentTrack.id.replace('yt-', '') : undefined);

            setCurrentDownloadStatus(`Saving to server (${i + 1}/${tracksToProcess.length}): ${tTitle}`);

            let curPct = 15;
            setDownloadProgress(curPct);
            const progressTimer = setInterval(() => {
                curPct = Math.min(curPct + 4, 95);
                setDownloadProgress(curPct);
            }, 500);

            try {
                const res = await fetch('/api/theater/music/grab', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        youtubeId: ytId,
                        streamUrl: currentTrack.streamUrl || currentTrack.previewUrl,
                        title: tTitle,
                        artist: tArtist,
                        album: tAlbum,
                        targetFolder: targetDirectory,
                        saveFormat,
                        coverUrl: currentTrack.posterUrl || initialPosterUrl
                    })
                });
                clearInterval(progressTimer);
                if (res.ok) {
                    savedCount++;
                    setDownloadProgress(100);
                }
            } catch {
                clearInterval(progressTimer);
            }

            setDownloadProgress(Math.round(((i + 1) / tracksToProcess.length) * 100));
        }

        setIsDownloading(false);
        if (savedCount > 0) {
            toast.success(`Saved ${savedCount} track${savedCount > 1 ? 's' : ''} to ${selectedDest.name}!`);
            setTimeout(() => onClose(), 1000);
        } else {
            toast.error('Could not save tracks to server library.');
        }
    };

    const handleExecute = () => {
        if (selectedDestId === 'device') {
            handleDownloadToDevice();
        } else {
            handleSaveToServerLibrary();
        }
    };

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            className="fixed inset-0 z-[350] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
            <div className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-5 max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-900 shrink-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                        {initialPosterUrl ? (
                            <img
                                src={initialPosterUrl}
                                alt=""
                                className="w-14 h-14 rounded-2xl object-cover border border-zinc-800 shrink-0 shadow-md"
                            />
                        ) : (
                            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                {isAlbumAvailable ? <Disc size={26} /> : <Music size={26} />}
                            </div>
                        )}
                        <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                                {isLocalFile ? 'Library Audio Download' : 'Audio Stream Downloader'}
                            </span>
                            <h2 className="text-base sm:text-lg font-black text-white truncate">
                                {downloadScope === 'album' && isAlbumAvailable ? (albumName || 'Album') : (track?.title || track?.name || 'Song')}
                            </h2>
                            <p className="text-xs text-zinc-400 font-medium truncate">
                                {initialArtist} {isAlbumAvailable && `• ${albumTracks?.length} Songs`}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all shrink-0 cursor-pointer"
                        title={isDownloading ? 'Minimize / Run in background' : 'Close'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                    {/* 1. Scope Selection (Only shown when album tracks are present) */}
                    {isAlbumAvailable && (
                        <div className="space-y-2">
                            <label className="text-xs font-black text-zinc-400 uppercase tracking-wider">
                                1. Download Scope
                            </label>
                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setDownloadScope('track')}
                                    className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                                        downloadScope === 'track'
                                            ? 'bg-amber-500/15 border-amber-500/50 text-white'
                                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <Music size={18} className={downloadScope === 'track' ? 'text-amber-400' : 'text-zinc-500'} />
                                    <div className="min-w-0">
                                        <div className="text-xs font-black uppercase">Current Song Only</div>
                                        <div className="text-[11px] text-zinc-500 truncate">{track?.title || track?.name || 'Single'}</div>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDownloadScope('album')}
                                    className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                                        downloadScope === 'album'
                                            ? 'bg-amber-500/15 border-amber-500/50 text-white'
                                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <Disc size={18} className={downloadScope === 'album' ? 'text-amber-400' : 'text-zinc-500'} />
                                    <div className="min-w-0">
                                        <div className="text-xs font-black uppercase">Full Album ({albumTracks?.length} Songs)</div>
                                        <div className="text-[11px] text-zinc-500 truncate">{albumName || 'Album'}</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tracklist Preview for Album */}
                    {downloadScope === 'album' && isAlbumAvailable && (
                        <div className="space-y-2">
                            <label className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                                <span>Included Songs ({albumTracks?.length})</span>
                                <span className="text-[10px] text-emerald-400 font-mono">All tracks ready</span>
                            </label>
                            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-2.5 max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                                {albumTracks?.map((t, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-zinc-800/50 text-zinc-300"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[10px] font-mono text-zinc-500 w-4 text-right">{idx + 1}.</span>
                                            <span className="truncate font-medium">{t.title || t.name}</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
                                            {t.duration || t.extension?.toUpperCase() || ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 2. Format Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider">
                            2. Output Format
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'original', label: 'Original Format', sub: isLocalFile ? 'Lossless Source' : 'Native Stream' },
                                { id: 'mp3', label: 'MP3 (320 kbps)', sub: 'Universal Audio' },
                                { id: 'flac', label: 'FLAC', sub: 'Lossless Audio' },
                                { id: 'wav', label: 'WAV', sub: 'Uncompressed PCM' },
                                { id: 'm4a', label: 'M4A / AAC', sub: 'Apple Audio' },
                                { id: 'opus', label: 'Opus', sub: 'High Efficiency' }
                            ].map(fmt => (
                                <button
                                    key={fmt.id}
                                    type="button"
                                    onClick={() => setSaveFormat(fmt.id as any)}
                                    className={`p-2.5 rounded-2xl border text-left transition-all ${
                                        saveFormat === fmt.id
                                            ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold'
                                            : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <div className="text-xs font-black">{fmt.label}</div>
                                    <div className="text-[10px] text-zinc-500 truncate">{fmt.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 3. Destination Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider">
                            3. Save Destination
                        </label>
                        <div className="space-y-2">
                            {destinations.map(d => (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => setSelectedDestId(d.id)}
                                    className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center justify-between ${
                                        selectedDestId === d.id
                                            ? 'bg-amber-500/15 border-amber-500/60 text-white font-bold'
                                            : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {d.type === 'device' ? <Laptop size={18} className="text-amber-400 shrink-0" /> : <Folder size={18} className="text-emerald-400 shrink-0" />}
                                        <div className="min-w-0">
                                            <div className="text-xs font-black truncate">{d.name}</div>
                                            <div className="text-[11px] text-zinc-500 truncate">{d.path}</div>
                                        </div>
                                    </div>
                                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-bold uppercase tracking-wider shrink-0 ml-2">
                                        {d.badge}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Progress & Actions Footer */}
                <div className="pt-3 border-t border-zinc-900 space-y-3 shrink-0">
                    {/* Ready File Download Card */}
                    {readyFile && !isDownloading && (
                        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-3 animate-in fade-in">
                            <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                                    <CheckCircle2 size={13} /> Ready on Server
                                </span>
                                <span className="text-xs font-bold text-white truncate block">{readyFile.filename}</span>
                                {readyFile.size && <span className="text-[10px] text-zinc-400 font-mono">{(readyFile.size / (1024 * 1024)).toFixed(2)} MB</span>}
                            </div>
                            <a
                                href={readyFile.url}
                                download={readyFile.filename}
                                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-md cursor-pointer"
                            >
                                <Download size={14} />
                                <span>Save File</span>
                            </a>
                        </div>
                    )}

                    {isDownloading && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                                <span className="truncate mr-2">{currentDownloadStatus || 'Downloading audio...'}</span>
                                <span className="font-mono text-amber-400">{downloadProgress}%</span>
                            </div>
                            <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                                    style={{ width: `${downloadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                if (isDownloading) {
                                    toast.info('Downloads continuing in the background...');
                                }
                                onClose();
                            }}
                            className="flex-1 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs uppercase tracking-wider transition-all border border-zinc-800 cursor-pointer"
                        >
                            {isDownloading ? 'Run in Background' : readyFile ? 'Close' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleExecute}
                            disabled={isDownloading}
                            className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-75 cursor-pointer"
                        >
                            {isDownloading ? (
                                <>
                                    <RefreshCw size={15} className="animate-spin" />
                                    <span>Processing ({downloadProgress}%)</span>
                                </>
                            ) : readyFile ? (
                                <>
                                    <RefreshCw size={15} />
                                    <span>Download Again</span>
                                </>
                            ) : (
                                <>
                                    <Download size={15} />
                                    <span>Download Now</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

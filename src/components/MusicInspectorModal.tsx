'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    X, Disc, Music, Play, Pause, Plus, Check, RefreshCw,
    ExternalLink, Calendar, HardDrive, User, Tag,
    Building2, Layers, CheckCircle2, ArrowDownToLine, Sparkles,
    Search, PlayCircle, Radio, Volume2
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface MusicInspectorModalProps {
    album: any;
    onClose: () => void;
    onSelectArtist?: (artistName: string) => void;
    onSelectLabel?: (labelName: string) => void;
    onPlayTrack?: (track: any) => void;
    onInteractiveSearch?: (target: any) => void;
}

export function MusicInspectorModal({
    album,
    onClose,
    onSelectArtist,
    onSelectLabel,
    onPlayTrack,
    onInteractiveSearch
}: MusicInspectorModalProps) {
    const router = useRouter();
    const [lidarrInstances, setLidarrInstances] = useState<any[]>([]);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
    const [qualityProfiles, setQualityProfiles] = useState<any[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<number>(1);
    const [rootFolders, setRootFolders] = useState<any[]>([]);
    const [selectedRootFolder, setSelectedRootFolder] = useState<string>('');
    const [searchMissing, setSearchMissing] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [isAdded, setIsAdded] = useState(false);

    // Tracklist and extended details
    const [tracks, setTracks] = useState<any[]>([]);
    const [loadingTracks, setLoadingTracks] = useState(false);

    // In-Modal Audio Preview
    const [playingPreviewUrl, setPlayingPreviewUrl] = useState<string | null>(null);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 1. Fetch Lidarr Instances & Profiles
    useEffect(() => {
        const fetchLidarrSetup = async () => {
            try {
                const res = await fetch('/api/instances');
                if (res.ok) {
                    const data = await res.json();
                    const list = (Array.isArray(data) ? data : []).filter((i: any) => i.type === 'lidarr' && i.enabled);
                    setLidarrInstances(list);
                    if (list.length > 0) {
                        setSelectedInstanceId(list[0].id);
                        // Fetch Profiles and Root Folders
                        const [pRes, rfRes] = await Promise.all([
                            fetch(`/api/lidarr/profiles?instanceId=${list[0].id}`).then(r => r.ok ? r.json() : null),
                            fetch(`/api/lidarr/rootfolder?instanceId=${list[0].id}`).then(r => r.ok ? r.json() : null)
                        ]);
                        if (pRes?.qualityProfiles) setQualityProfiles(pRes.qualityProfiles);
                        if (Array.isArray(rfRes) && rfRes.length > 0) {
                            setRootFolders(rfRes);
                            setSelectedRootFolder(rfRes[0].path);
                        }
                    }
                }
            } catch (e) {
                console.error('Error fetching Lidarr setup:', e);
            }
        };
        fetchLidarrSetup();
    }, []);

    // 2. Fetch Tracklist for Album if collectionId or foreignArtistId available
    useEffect(() => {
        const fetchTracks = async () => {
            if (!album) return;
            setLoadingTracks(true);
            try {
                if (album.raw?.collectionId) {
                    const res = await fetch(`https://itunes.apple.com/lookup?id=${album.raw.collectionId}&entity=song`);
                    if (res.ok) {
                        const data = await res.json();
                        const songResults = (data.results || []).filter((r: any) => r.wrapperType === 'track');
                        setTracks(songResults);
                    }
                } else if (album.albums || album.raw?.albums) {
                    // Artist object from Lidarr
                    const artistAlbums = album.albums || album.raw?.albums || [];
                    const allTracks: any[] = [];
                    artistAlbums.forEach((alb: any) => {
                        (alb.tracks || []).forEach((t: any) => {
                            allTracks.push({
                                trackName: t.title,
                                trackNumber: t.trackNumber,
                                trackTimeMillis: t.durationMs,
                                albumTitle: alb.title,
                                id: t.id
                            });
                        });
                    });
                    setTracks(allTracks);
                }
            } catch {
                setTracks([]);
            } finally {
                setLoadingTracks(false);
            }
        };
        fetchTracks();
    }, [album]);

    // Handle in-modal track audio preview
    const handleTogglePreview = (previewUrl: string) => {
        if (!previewUrl) return;
        if (playingPreviewUrl === previewUrl && isPreviewPlaying) {
            if (audioRef.current) audioRef.current.pause();
            setIsPreviewPlaying(false);
        } else {
            setPlayingPreviewUrl(previewUrl);
            setIsPreviewPlaying(true);
            if (audioRef.current) {
                audioRef.current.src = previewUrl;
                audioRef.current.play().catch(() => setIsPreviewPlaying(false));
            }
        }
    };

    const handleAddToLidarr = async () => {
        if (lidarrInstances.length === 0) {
            toast.error('No enabled Lidarr instances configured. Add one in Settings first!');
            return;
        }

        setIsAdding(true);
        try {
            const res = await fetch('/api/lidarr/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: selectedInstanceId,
                    artist: album.raw?.artistName ? album.raw : undefined,
                    artistName: album.artistName || album.title,
                    foreignArtistId: album.foreignArtistId || album.id,
                    qualityProfileId: selectedProfileId,
                    rootFolderPath: selectedRootFolder,
                    searchForMissingAlbums: searchMissing,
                    monitored: true
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || `Added "${album.artistName || album.title}" to Lidarr!`);
                setIsAdded(true);
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Failed to add artist to Lidarr');
            }
        } catch (e: any) {
            toast.error(`Error adding to Lidarr: ${e.message}`);
        } finally {
            setIsAdding(false);
        }
    };

    const handleTriggerLidarrSearch = async () => {
        if (lidarrInstances.length === 0) {
            toast.error('No enabled Lidarr instance found.');
            return;
        }
        const instId = selectedInstanceId || lidarrInstances[0]?.id;
        toast.info('Triggering automatic Lidarr search...');
        try {
            const res = await fetch('/api/lidarr/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: instId,
                    name: 'AlbumSearch',
                    albumIds: album.id ? [Number(album.id)] : []
                })
            });
            if (res.ok) {
                toast.success('Lidarr search started in background!');
            } else {
                toast.error('Failed to trigger Lidarr search command.');
            }
        } catch {
            toast.error('Error contacting Lidarr API');
        }
    };

    if (!album) return null;

    const artistName = album.artistName || album.title || 'Unknown Artist';
    const albumName = album.albumTitle || album.title || 'Album';
    const poster = album.posterUrl || album.remotePoster;
    const year = album.year || (album.releaseDate ? new Date(album.releaseDate).getFullYear() : 'Unknown Year');
    const recordLabel = album.recordLabel || album.copyright || album.disambiguation || 'Independent';
    const genres = album.genres || [];

    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(artistName + ' ' + albumName)}`;
    const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(artistName + ' ' + albumName)}`;

    return (
        <div className="fixed inset-0 z-[280] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
            {/* Hidden audio tag for instant 30-second previews */}
            <audio
                ref={audioRef}
                onEnded={() => setIsPreviewPlaying(false)}
                onPause={() => setIsPreviewPlaying(false)}
                onPlay={() => setIsPreviewPlaying(true)}
            />

            <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col space-y-6">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all z-20"
                >
                    <X size={22} />
                </button>

                {/* ── Top Section: Spinning CD / Vinyl Showcase & Metadata ── */}
                <div className="flex flex-col md:flex-row items-center md:items-start gap-8 pb-6 border-b border-zinc-900">
                    {/* 3D Vinyl / CD Disc Art Frame */}
                    <div className="relative w-44 h-44 sm:w-52 sm:h-52 shrink-0 group">
                        {/* Vinyl Disc Sticking Out */}
                        <div className="absolute top-0 right-0 w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-gradient-to-tr from-zinc-950 via-zinc-900 to-black border-4 border-zinc-800 shadow-2xl flex items-center justify-center translate-x-6 sm:translate-x-8 group-hover:translate-x-12 transition-transform duration-500 animate-spin-slow">
                            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center shadow-inner">
                                <div className="w-4 h-4 rounded-full bg-zinc-950 border border-zinc-800" />
                            </div>
                        </div>

                        {/* Front Album Jacket Cover */}
                        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-3xl bg-zinc-900 border-2 border-zinc-800/80 overflow-hidden shadow-2xl flex items-center justify-center z-10">
                            {poster ? (
                                <img src={poster} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <Disc size={64} className="text-amber-400" />
                            )}
                        </div>
                    </div>

                    {/* Metadata & Quick Links */}
                    <div className="space-y-3 text-center md:text-left flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase tracking-wider">
                                Music Album / Release
                            </span>
                            {year && (
                                <span className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-black uppercase">
                                    {year}
                                </span>
                            )}
                            {album.trackCount && (
                                <span className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-black uppercase">
                                    {album.trackCount} Tracks
                                </span>
                            )}
                        </div>

                        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                            {albumName}
                        </h2>

                        {/* Clickable Interconnected Artist */}
                        <div className="flex items-center justify-center md:justify-start gap-2">
                            <User size={16} className="text-amber-400 shrink-0" />
                            <button
                                onClick={() => {
                                    if (onSelectArtist) onSelectArtist(artistName);
                                    onClose();
                                }}
                                className="text-base font-bold text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 truncate hover:decoration-amber-400 transition-all text-left"
                                title="Explore full artist discography"
                            >
                                {artistName}
                            </button>
                        </div>

                        {/* Clickable Record Label / Company */}
                        <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-zinc-400">
                            <Building2 size={15} className="text-zinc-500 shrink-0" />
                            <span className="text-zinc-500 font-semibold">Label:</span>
                            <button
                                onClick={() => {
                                    if (onSelectLabel) onSelectLabel(recordLabel);
                                    onClose();
                                }}
                                className="text-zinc-300 hover:text-white font-bold underline decoration-zinc-700 hover:decoration-white transition-all truncate"
                                title="Filter releases by this record label"
                            >
                                {recordLabel}
                            </button>
                        </div>

                        {/* Multi-Provider Streaming & Search Action Buttons */}
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-2">
                            <button
                                onClick={() => {
                                    router.push(`/theater?play=${encodeURIComponent(albumName)}&artist=${encodeURIComponent(artistName)}`);
                                    onClose();
                                }}
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                            >
                                <Play size={13} className="fill-current" /> Play in Theater
                            </button>

                            <a
                                href={youtubeSearchUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3.5 py-2 rounded-xl bg-red-600/15 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                            >
                                <PlayCircle size={14} /> YouTube
                            </a>

                            <a
                                href={spotifySearchUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3.5 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                            >
                                <Radio size={14} /> Spotify
                            </a>

                            <button
                                onClick={handleTriggerLidarrSearch}
                                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                                title="Trigger automated search in Lidarr"
                            >
                                <RefreshCw size={13} /> Auto Search
                            </button>

                            {onInteractiveSearch && (
                                <button
                                    onClick={() => {
                                        onInteractiveSearch({
                                            type: 'album',
                                            id: album.id,
                                            title: `${artistName} - ${albumName}`,
                                            poster
                                        });
                                        onClose();
                                    }}
                                    className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                                    title="Interactive Manual Release Search"
                                >
                                    <Search size={13} /> Manual Releases
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Mid Section: 1-Click "Add to Lidarr" Settings Box ── */}
                <div className="p-5 sm:p-6 rounded-3xl bg-zinc-950 border border-zinc-800/90 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Disc size={20} className="text-amber-400" />
                            <h3 className="text-sm font-black uppercase tracking-wider text-white">Add Artist &amp; Album to Lidarr</h3>
                        </div>
                        {lidarrInstances.length > 0 && (
                            <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                                <CheckCircle2 size={13} /> {lidarrInstances.length} Lidarr Instance{lidarrInstances.length > 1 ? 's' : ''} Ready
                            </span>
                        )}
                    </div>

                    {lidarrInstances.length === 0 ? (
                        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
                            <p className="text-xs text-zinc-400">No Lidarr instances configured yet.</p>
                            <p className="text-[11px] text-zinc-500">Go to Settings &gt; Instances and add your Lidarr URL (e.g. http://192.168.1.x:8686) and API Key.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider block">Lidarr Instance</label>
                                <select
                                    value={selectedInstanceId}
                                    onChange={e => setSelectedInstanceId(e.target.value)}
                                    className="w-full bg-[#0c0c0c] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500 font-bold"
                                >
                                    {lidarrInstances.map(inst => (
                                        <option key={inst.id} value={inst.id}>{inst.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider block">Quality Profile</label>
                                <select
                                    value={selectedProfileId}
                                    onChange={e => setSelectedProfileId(Number(e.target.value))}
                                    className="w-full bg-[#0c0c0c] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500 font-bold"
                                >
                                    {qualityProfiles.length > 0 ? (
                                        qualityProfiles.map(qp => (
                                            <option key={qp.id} value={qp.id}>{qp.name}</option>
                                        ))
                                    ) : (
                                        <option value={1}>Standard / FLAC</option>
                                    )}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider block">Root Storage Folder</label>
                                <select
                                    value={selectedRootFolder}
                                    onChange={e => setSelectedRootFolder(e.target.value)}
                                    className="w-full bg-[#0c0c0c] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500 font-mono text-[11px]"
                                >
                                    {rootFolders.length > 0 ? (
                                        rootFolders.map(rf => (
                                            <option key={rf.id} value={rf.path}>{rf.path}</option>
                                        ))
                                    ) : (
                                        <option value="">Default Lidarr Music Folder</option>
                                    )}
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-zinc-900">
                        <label className="flex items-center gap-2 text-xs text-zinc-400 font-semibold cursor-pointer">
                            <input
                                type="checkbox"
                                checked={searchMissing}
                                onChange={e => setSearchMissing(e.target.checked)}
                                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 accent-amber-500"
                            />
                            <span>Start search for missing albums immediately</span>
                        </label>

                        <button
                            disabled={isAdding || isAdded}
                            onClick={handleAddToLidarr}
                            className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg ${
                                isAdded
                                    ? 'bg-emerald-500 text-black shadow-emerald-500/20'
                                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20 active:scale-95'
                            } disabled:opacity-60`}
                        >
                            {isAdding ? (
                                <RefreshCw size={15} className="animate-spin" />
                            ) : isAdded ? (
                                <Check size={15} />
                            ) : (
                                <Plus size={15} />
                            )}
                            {isAdded ? 'Added to Lidarr!' : isAdding ? 'Adding Artist...' : 'Add to Lidarr'}
                        </button>
                    </div>
                </div>

                {/* ── Bottom Section: Complete Tracklist with In-App Preview & Provider Links ── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                            <Music size={15} className="text-amber-400" /> Album Tracklist ({tracks.length})
                        </h4>
                        {tracks.length > 0 && (
                            <span className="text-[11px] text-zinc-500 font-semibold">
                                Click ▶ for direct 30s audio preview
                            </span>
                        )}
                    </div>

                    {loadingTracks ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-xs text-zinc-500 font-bold">
                            <RefreshCw size={16} className="animate-spin text-amber-400" />
                            <span>Loading tracklist...</span>
                        </div>
                    ) : tracks.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-900 text-center text-xs text-zinc-500">
                            Tracklist details not provided for this release.
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar p-1">
                            {tracks.map((track, idx) => {
                                const durationMs = track.trackTimeMillis || track.durationMs;
                                const sec = durationMs ? Math.round(durationMs / 1000) : 0;
                                const timeStr = sec > 0 ? `${Math.floor(sec / 60)}:${sec % 60 < 10 ? '0' : ''}${sec % 60}` : '--:--';
                                const trackTitle = track.trackName || track.title || 'Track';
                                const previewUrl = track.previewUrl;
                                const isCurrentPreview = playingPreviewUrl === previewUrl && isPreviewPlaying;

                                const songYtUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(artistName + ' ' + trackTitle)}`;
                                const songSpotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(artistName + ' ' + trackTitle)}`;

                                return (
                                    <div
                                        key={idx}
                                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-xs font-bold group ${
                                            isCurrentPreview 
                                                ? 'bg-amber-500/10 border-amber-500/40 shadow-md' 
                                                : 'bg-zinc-950/70 border-zinc-900/80 hover:border-amber-500/40 hover:bg-zinc-900/60'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            {/* Preview Button */}
                                            {previewUrl ? (
                                                <button
                                                    onClick={() => handleTogglePreview(previewUrl)}
                                                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow ${
                                                        isCurrentPreview 
                                                            ? 'bg-amber-500 text-black scale-105' 
                                                            : 'bg-zinc-900 group-hover:bg-amber-500/20 text-zinc-400 group-hover:text-amber-400'
                                                    }`}
                                                    title={isCurrentPreview ? 'Pause Audio Preview' : 'Play 30s Audio Preview'}
                                                >
                                                    {isCurrentPreview ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                                                </button>
                                            ) : (
                                                <span className="w-6 text-center text-zinc-600 font-mono group-hover:text-amber-400">
                                                    {track.trackNumber || idx + 1}
                                                </span>
                                            )}

                                            <div className="min-w-0">
                                                <span className="text-white group-hover:text-amber-400 transition-colors truncate block">
                                                    {trackTitle}
                                                </span>
                                                {isCurrentPreview && (
                                                    <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                                                        <Volume2 size={10} className="animate-pulse" /> Playing Preview
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[11px] font-mono text-zinc-500 mr-1">{timeStr}</span>

                                            {/* Play in Theater */}
                                            <button
                                                onClick={() => {
                                                    router.push(`/theater?play=${encodeURIComponent(trackTitle)}&artist=${encodeURIComponent(artistName)}`);
                                                    onClose();
                                                }}
                                                className="p-2 rounded-xl bg-zinc-900 hover:bg-amber-500 text-zinc-400 hover:text-black transition-all"
                                                title="Play Track in Theater Studio"
                                            >
                                                <Play size={13} className="ml-0.5" />
                                            </button>

                                            {/* YouTube Link */}
                                            <a
                                                href={songYtUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-2 rounded-xl bg-zinc-900 hover:bg-red-600 text-zinc-400 hover:text-white transition-all"
                                                title="Play / Search on YouTube"
                                            >
                                                <PlayCircle size={13} />
                                            </a>

                                            {/* Spotify Link */}
                                            <a
                                                href={songSpotifyUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-2 rounded-xl bg-zinc-900 hover:bg-emerald-600 text-zinc-400 hover:text-white transition-all"
                                                title="Play / Search on Spotify"
                                            >
                                                <Radio size={13} />
                                            </a>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

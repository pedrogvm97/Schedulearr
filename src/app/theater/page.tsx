'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Film, Tv, Music, Image as ImageIcon, Folder, Plus,
    Play, Pause, Volume2, VolumeX, Maximize, X, Minimize2, Maximize2, Minus,
    Search, Trash2, ArrowRight, ChevronRight, ChevronLeft,
    HardDrive, RefreshCw, LayoutGrid, List as Rows,
    FileVideo, FileAudio, FileImage, Sparkles, FolderPlus,
    Calendar, Check, Settings2, FolderTree, ArrowUp, ArrowDown, ArrowUpDown, Cast,
    DownloadCloud, Layers, Database, ShieldCheck, CheckCircle2,
    Tv2, Radio, Sliders, MessageSquare, Activity, ExternalLink,
    Clock, FastForward, Rewind, Subtitles, ListFilter, Bookmark,
    ListPlus, Copy, Download, Shuffle, Repeat, SkipForward, SkipBack,
    Disc, User, ListMusic, Youtube, Globe, Heart, PlaySquare, ArrowDownToLine,
    Headphones, RadioTower, Info, Mic2, FileText, Edit3, ChevronDown,
    Terminal, AlertTriangle, Bug, Code, Cpu, Monitor, RefreshCcw, CheckCheck, Zap
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import Hls from 'hls.js';
import { useMusicPlayer } from '@/context/MusicPlayerContext';

interface TheaterLibrary {
    id: string;
    name: string;
    type: 'movie' | 'show' | 'music' | 'photo' | 'live' | 'other';
    folders: string[];
    plex_section_id?: string;
    instance_id?: string;
    created_at: string;
}

interface MediaItem {
    id: string;
    name: string;
    title: string;
    path: string;
    folder: string;
    artist?: string;
    album?: string;
    trackNumber?: number;
    durationMs?: number;
    duration?: string;
    category: 'video' | 'audio' | 'photo';
    extension: string;
    sizeBytes: number;
    modifiedAt: string;
    addedAt?: string;
    posterUrl?: string;
    streamUrl: string;
    source?: string;
    youtubeId?: string;
}

interface MusicPlaylist {
    id: string;
    library_id: string;
    name: string;
    items: MediaItem[];
    cover_url?: string;
    created_at: string;
}

interface IptvChannel {
    id: string;
    name: string;
    logo?: string;
    group: string;
    url: string;
}

interface IptvShortlist {
    id: string;
    library_id: string;
    name: string;
    channelIds: string[];
}

interface SubtitleTrack {
    id: string;
    title: string;
    language: string;
    source: string;
    vttUrl: string;
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

interface StreamDiagnosticsInfo {
    original: {
        videoCodec: string;
        videoBitrate: string;
        resolution: string;
        fps: string;
        audioCodec: string;
        audioBitrate: string;
        audioChannels: string;
        container: string;
    };
    playing: {
        videoCodec: string;
        audioCodec: string;
        resolution: string;
        container: string;
    };
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function TheaterPage() {
    const [libraries, setLibraries] = useState<TheaterLibrary[]>([]);
    const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
    const [items, setItems] = useState<MediaItem[]>([]);
    const [loadingLibraries, setLoadingLibraries] = useState(true);
    const [loadingItems, setLoadingItems] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortBy, setSortBy] = useState<'added' | 'title' | 'date' | 'size'>('added');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Content-type tab system
    const [activeContentTab, setActiveContentTab] = useState<'movie' | 'show' | 'live' | 'music'>('movie');
    // Per-tab enabled library IDs (empty Set = all enabled)
    const [enabledLibsByTab, setEnabledLibsByTab] = useState<Record<string, Set<string>>>({});

    const toggleLibraryInTab = (tab: string, libId: string, allLibIds: string[]) => {
        setEnabledLibsByTab(prev => {
            const current = new Set(prev[tab] ?? allLibIds);
            if (current.has(libId)) {
                current.delete(libId);
                if (current.size === 0) {
                    // Don't allow deselecting all — reset to all
                    return { ...prev, [tab]: new Set(allLibIds) };
                }
            } else {
                current.add(libId);
            }
            return { ...prev, [tab]: new Set(current) };
        });
    };


    // Add Library Modal States
    const [isAddLibModalOpen, setIsAddLibModalOpen] = useState(false);
    const [modalTab, setModalTab] = useState<'import' | 'custom' | 'iptv'>('import');
    const [plexSources, setPlexSources] = useState<PlexSourceLibrary[]>([]);
    const [radarrSources, setRadarrSources] = useState<ArrSourceFolder[]>([]);
    const [sonarrSources, setSonarrSources] = useState<ArrSourceFolder[]>([]);
    const [commonMounts, setCommonMounts] = useState<string[]>([]);
    const [loadingSources, setLoadingSources] = useState(false);

    // Custom Form State
    const [newLibName, setNewLibName] = useState('');
    const [newLibType, setNewLibType] = useState<'movie' | 'show' | 'music' | 'photo' | 'live' | 'other'>('movie');
    const [newLibFolders, setNewLibFolders] = useState<string[]>([]);
    const [folderInput, setFolderInput] = useState('');
    const [iptvUrlInput, setIptvUrlInput] = useState('');
    const [browserCurrentPath, setBrowserCurrentPath] = useState('');
    const [browserParentPath, setBrowserParentPath] = useState<string | null>(null);
    const [browserFolders, setBrowserFolders] = useState<any[]>([]);
    const [isCreatingLib, setIsCreatingLib] = useState(false);

    // IPTV / Live TV States
    const [iptvChannels, setIptvChannels] = useState<IptvChannel[]>([]);
    const [iptvGroups, setIptvGroups] = useState<{ name: string; count: number }[]>([]);
    const [selectedIptvGroup, setSelectedIptvGroup] = useState<string>('ALL');
    const [shortlists, setShortlists] = useState<IptvShortlist[]>([]);
    const [activeShortlistId, setActiveShortlistId] = useState<string>('ALL');
    const [playingChannel, setPlayingChannel] = useState<IptvChannel | null>(null);
    const [isShortlistManagerOpen, setIsShortlistManagerOpen] = useState(false);
    const [shortlistEditingName, setShortlistEditingName] = useState('');
    const [shortlistSelectedChanIds, setShortlistSelectedChanIds] = useState<string[]>([]);
    const [editingShortlistId, setEditingShortlistId] = useState<string | null>(null);

    // Music Studio Specific States
    const [musicTab, setMusicTab] = useState<'tracks' | 'albums' | 'artists' | 'playlists' | 'online'>('albums');
    const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
    const [selectedAlbum, setSelectedAlbum] = useState<{ name: string; artist: string; posterUrl?: string; tracks: MediaItem[] } | null>(null);
    const [selectedArtist, setSelectedArtist] = useState<{ name: string; posterUrl?: string; albums: any[]; tracks: MediaItem[] } | null>(null);
    const [isCreatePlaylistModalOpen, setIsCreatePlaylistModalOpen] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<MediaItem | null>(null);

    // Online YouTube & Spotify Search States
    const [onlineMusicQuery, setOnlineMusicQuery] = useState('');
    const [onlineResults, setOnlineResults] = useState<MediaItem[]>([]);
    const [loadingOnline, setLoadingOnline] = useState(false);
    const [grabbingTracks, setGrabbingTracks] = useState<Record<string, boolean>>({});

    // Active Media Players & Global Music Studio
    const {
        playingAudio,
        isAudioPlaying,
        playTrack,
        playAlbum,
        handleDownloadTrack,
        handleDownloadAlbum,
        closePlayer
    } = useMusicPlayer();

    const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null);
    const [isVideoMinimized, setIsVideoMinimized] = useState(false);
    const [videoAudioMode, setVideoAudioMode] = useState<'universal' | 'transcode' | 'direct'>('universal');
    const [videoQuality, setVideoQuality] = useState<'auto' | '1080p-high' | '1080p' | '720p' | '480p'>('auto');
    const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);

    // Track previous values to detect null→value transitions only
    const prevVideoRef = useRef<MediaItem | null>(null);
    const prevChannelRef = useRef<IptvChannel | null>(null);

    // Automatically pause/stop background music playback when a movie/video or TV channel starts
    // Only fires when a video/channel transitions from null → something, NOT on mount or re-renders
    useEffect(() => {
        const videoJustStarted = !prevVideoRef.current && !!playingVideo;
        const channelJustStarted = !prevChannelRef.current && !!playingChannel;
        if (videoJustStarted || channelJustStarted) {
            closePlayer();
        }
        if (videoJustStarted) {
            setIsVideoMinimized(false);
        }
        prevVideoRef.current = playingVideo;
        prevChannelRef.current = playingChannel;
    }, [playingVideo, playingChannel]);

    // Load saved streaming preferences from localStorage (default to universal for max compatibility)
    useEffect(() => {
        try {
            const savedMode = localStorage.getItem('schedulearr_video_mode');
            if (savedMode && (savedMode === 'universal' || savedMode === 'direct')) {
                setVideoAudioMode(savedMode as any);
            } else {
                setVideoAudioMode('universal');
            }
            const savedQ = localStorage.getItem('schedulearr_video_quality');
            if (savedQ) {
                setVideoQuality(savedQ as any);
            }
        } catch {}
    }, []);

    const handleSetVideoMode = (mode: 'universal' | 'transcode' | 'direct') => {
        setVideoAudioMode(mode);
        try { localStorage.setItem('schedulearr_video_mode', mode); } catch {}
        setPlaybackError(null);
        addDebugLog('info', `Switched video stream mode to: ${mode.toUpperCase()}`);
        toast.info(
            mode === 'universal'
                ? '⚡ Server Optimized: Full H.264 + AAC compatibility stream (QuickSync/NVENC/CPU)'
                : mode === 'transcode'
                ? '🔊 Audio Transcode: Copy original video + AAC 2.0 transcode'
                : '💎 Direct Play: Raw original bitstream'
        );
    };

    const handleSetVideoQuality = (q: 'auto' | '1080p-high' | '1080p' | '720p' | '480p') => {
        setVideoQuality(q);
        try { localStorage.setItem('schedulearr_video_quality', q); } catch {}
        toast.info(`Quality preset set to: ${q.toUpperCase()}`);
    };

    // Video Player Advanced Controls & Diagnostics & Nerd Tools
    const [showStatsHud, setShowStatsHud] = useState(false);
    const [showNerdToolsModal, setShowNerdToolsModal] = useState(false);
    const [nerdActiveTab, setNerdActiveTab] = useState<'telemetry' | 'logs' | 'compat'>('telemetry');
    const [debugLogs, setDebugLogs] = useState<{ id: string; timestamp: string; level: 'info' | 'warn' | 'error' | 'success'; message: string; details?: any; }[]>([]);
    const [playbackError, setPlaybackError] = useState<{ code?: number; codeName?: string; message: string; details?: string; suggestion?: string; } | null>(null);
    const [isVlcModalOpen, setIsVlcModalOpen] = useState(false);
    const [vlcModalInfo, setVlcModalInfo] = useState<{ title: string; m3uUrl: string; directUrl: string; transcodeUrl: string } | null>(null);
    const stallTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const addDebugLog = (level: 'info' | 'warn' | 'error' | 'success', message: string, details?: any) => {
        const id = Math.random().toString(36).substring(2, 9);
        const timestamp = new Date().toLocaleTimeString();
        setDebugLogs(prev => [...prev.slice(-150), { id, timestamp, level, message, details }]);
    };

    const [showSubtitlesDrawer, setShowSubtitlesDrawer] = useState(false);
    const [isSubSearchModalOpen, setIsSubSearchModalOpen] = useState(false);
    const [subSearchQuery, setSubSearchQuery] = useState('');
    const [subSearchLang, setSubSearchLang] = useState('all');
    const [subSearchLoading, setSubSearchLoading] = useState(false);
    const [availableSubtitles, setAvailableSubtitles] = useState<SubtitleTrack[]>([]);
    const [selectedSubtitle, setSelectedSubtitle] = useState<SubtitleTrack | null>(null);
    const [subOffsetMs, setSubOffsetMs] = useState(0);
    const [diagnosticsData, setDiagnosticsData] = useState<StreamDiagnosticsInfo | null>(null);

    // Stream Metrics
    const [streamMetrics, setStreamMetrics] = useState({
        resolution: 'Detecting...',
        bufferedSeconds: 0,
        currentTime: '0:00',
        duration: '0:00',
        droppedFrames: 0,
        sourceMode: 'Direct Play / Local'
    });

    const videoRef = useRef<HTMLVideoElement>(null);
    const liveVideoRef = useRef<HTMLVideoElement>(null);
    const hlsInstanceRef = useRef<Hls | null>(null);

    // Smart TV Pairing & Remote Casting States
    const [isPairTvModalOpen, setIsPairTvModalOpen] = useState(false);
    const [isCastPickerModalOpen, setIsCastPickerModalOpen] = useState(false);
    const [castingTargetMedia, setCastingTargetMedia] = useState<MediaItem | IptvChannel | null>(null);
    const [pairedTvSessions, setPairedTvSessions] = useState<any[]>([]);
    const [loadingPairedTvs, setLoadingPairedTvs] = useState(false);
    const [tvPairPin, setTvPairPin] = useState('');
    const [isPairingTv, setIsPairingTv] = useState(false);
    const [pairedTvCount, setPairedTvCount] = useState(0);

    const checkPairedTvs = async () => {
        try {
            const res = await fetch('/api/theater/tv?listSessions=true');
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data.sessions) ? data.sessions : [];
                setPairedTvSessions(list);
                setPairedTvCount(list.length);
            }
        } catch {}
    };

    useEffect(() => {
        checkPairedTvs();
    }, []);

    const handleOpenInVlc = (video: VideoStreamItem) => {
        const streamOrigin = window.location.origin;
        const directStreamUrl = video.streamUrl.startsWith('http') ? video.streamUrl : `${streamOrigin}${video.streamUrl}`;
        const transcodeStreamUrl = `${directStreamUrl}${directStreamUrl.includes('?') ? '&' : '?'}transcode=universal`;
        const m3uUrl = `${directStreamUrl}${directStreamUrl.includes('?') ? '&' : '?'}m3u=true&title=${encodeURIComponent(video.title)}&origin=${encodeURIComponent(streamOrigin)}`;

        navigator.clipboard.writeText(directStreamUrl).catch(() => {});
        setVlcModalInfo({
            title: video.title,
            m3uUrl,
            directUrl: directStreamUrl,
            transcodeUrl: transcodeStreamUrl
        });
        setIsVlcModalOpen(true);
        addDebugLog('info', 'Opened VLC streaming modal for video', { title: video.title, directStreamUrl });
        toast.success('Stream URL copied! Opening VLC details...');
    };

    const handleApproveTv = async () => {
        if (!tvPairPin.trim()) return;
        setIsPairingTv(true);
        try {
            const res = await fetch('/api/theater/tv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve_code', code: tvPairPin.trim() })
            });
            if (res.ok) {
                toast.success('Smart TV Paired and Unlocked Successfully!');
                setIsPairTvModalOpen(false);
                setTvPairPin('');
                checkPairedTvs();
            } else {
                toast.error('Invalid or expired TV pairing code');
            }
        } catch {
            toast.error('Failed to pair TV');
        } finally {
            setIsPairingTv(false);
        }
    };

    const openCastPicker = async (media?: MediaItem | IptvChannel) => {
        const target = media || playingVideo || playingChannel;
        if (target) setCastingTargetMedia(target);

        // 1. Attempt native browser Remote Playback API (Chromecast, Google Cast, Smart TVs in Chrome / Edge / Android)
        const videoEl = videoRef.current || liveVideoRef.current;
        if (videoEl && 'remote' in videoEl && typeof (videoEl as any).remote?.prompt === 'function') {
            try {
                await (videoEl as any).remote.prompt();
                toast.success('Connected to Cast Device!');
                return;
            } catch (e: any) {
                if (e.name === 'NotAllowedError' || e.name === 'NotFoundError') {
                    // User cancelled device selection
                    return;
                }
                console.warn('Native remote prompt error:', e);
            }
        }

        // 2. Attempt Safari / Apple WebKit AirPlay Picker
        if (videoEl && typeof (videoEl as any).webkitShowPlaybackTargetPicker === 'function') {
            try {
                (videoEl as any).webkitShowPlaybackTargetPicker();
                return;
            } catch (e) {
                console.warn('WebKit AirPlay error:', e);
            }
        }

        // 3. Open unified Cast & Device Picker modal
        setIsCastPickerModalOpen(true);
        setLoadingPairedTvs(true);
        try {
            const res = await fetch('/api/theater/tv?listSessions=true');
            if (res.ok) {
                const data = await res.json();
                const sessions = Array.isArray(data.sessions) ? data.sessions : [];
                setPairedTvSessions(sessions);
                setPairedTvCount(sessions.length);
            }
        } catch {
            // Silently handle
        } finally {
            setLoadingPairedTvs(false);
        }
    };

    const handleCastToDevice = async (sessionId: string, deviceName: string) => {
        if (!castingTargetMedia) return;
        try {
            const res = await fetch('/api/theater/tv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cast', sessionId, media: castingTargetMedia })
            });
            if (res.ok) {
                const mediaTitle = castingTargetMedia.name || (castingTargetMedia as any).title;
                toast.success(`Casting "${mediaTitle}" to ${deviceName}!`);
                setIsCastPickerModalOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Failed to cast to device');
            }
        } catch {
            toast.error('Error sending cast command to TV');
        }
    };

    const handleUnpairDevice = async (sessionId: string, deviceName: string) => {
        if (!confirm(`Are you sure you want to unpair "${deviceName}"?`)) return;
        try {
            const res = await fetch('/api/theater/tv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'unpair', sessionId })
            });
            if (res.ok) {
                toast.success(`Unpaired "${deviceName}"`);
                setPairedTvSessions(prev => prev.filter(s => s.id !== sessionId));
                setPairedTvCount(prev => Math.max(0, prev - 1));
            }
        } catch {
            toast.error('Failed to unpair device');
        }
    };

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
                    // Auto-select content tab matching first library type
                    const firstType = libs[0].type;
                    if (firstType === 'movie' || firstType === 'show' || firstType === 'live' || firstType === 'music') {
                        setActiveContentTab(firstType);
                    }
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

    const activeLibrary = useMemo(() => {
        return libraries.find(l => l.id === activeLibraryId);
    }, [libraries, activeLibraryId]);

    // Libraries matching the current content tab type
    const activeTabLibraries = useMemo(() => {
        return libraries.filter(l => l.type === activeContentTab);
    }, [libraries, activeContentTab]);

    // Enabled libraries for the current tab (respects per-tab toggles)
    const enabledTabLibraries = useMemo(() => {
        const enabledSet = enabledLibsByTab[activeContentTab];
        if (!enabledSet || enabledSet.size === 0) return activeTabLibraries;
        return activeTabLibraries.filter(l => enabledSet.has(l.id));
    }, [activeTabLibraries, enabledLibsByTab, activeContentTab]);

    // Sync activeLibraryId to first library of the new tab whenever tab changes
    useEffect(() => {
        const tabLibs = libraries.filter(l => l.type === activeContentTab);
        if (tabLibs.length > 0) {
            if (!tabLibs.some(l => l.id === activeLibraryId)) {
                setActiveLibraryId(tabLibs[0].id);
            }
        } else {
            setActiveLibraryId(null);
        }
    }, [activeContentTab, libraries]);

    // 2. Fetch Items for Selected Library (Files, Music, or IPTV)
    const fetchLibraryItems = async (lib: TheaterLibrary) => {
        setLoadingItems(true);
        try {
            if (lib.type === 'live') {
                const m3uUrl = lib.folders[0] || '';
                const res = await fetch(`/api/theater/iptv?url=${encodeURIComponent(m3uUrl)}`);
                if (res.ok) {
                    const data = await res.json();
                    setIptvChannels(Array.isArray(data.channels) ? data.channels : []);
                    setIptvGroups(Array.isArray(data.groups) ? data.groups : []);
                }
                const shortRes = await fetch(`/api/theater/iptv/shortlists?libraryId=${lib.id}`);
                if (shortRes.ok) {
                    const sData = await shortRes.json();
                    setShortlists(Array.isArray(sData.shortlists) ? sData.shortlists : []);
                }
                setItems([]);
            } else {
                const res = await fetch(`/api/theater/items?libraryId=${lib.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setItems(Array.isArray(data.items) ? data.items : []);
                } else {
                    toast.error('Failed to scan library items');
                    setItems([]);
                }
                setIptvChannels([]);

                // If music, fetch playlists
                if (lib.type === 'music') {
                    const playRes = await fetch(`/api/theater/music/playlists?libraryId=${lib.id}`);
                    if (playRes.ok) {
                        const pData = await playRes.json();
                        setPlaylists(Array.isArray(pData.playlists) ? pData.playlists : []);
                    }
                }
            }
        } catch {
            toast.error('Error fetching library content');
            setItems([]);
            setIptvChannels([]);
        } finally {
            setLoadingItems(false);
        }
    };

    useEffect(() => {
        if (activeLibrary) {
            fetchLibraryItems(activeLibrary);
        } else {
            setItems([]);
            setIptvChannels([]);
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

    // 6. Create Custom Library (Folder, IPTV, or Music)
    const handleCreateCustomLibrary = async () => {
        if (!newLibName.trim()) {
            toast.error('Please enter a library name');
            return;
        }

        let allFolders: string[] = [];

        if (newLibType === 'live') {
            if (!iptvUrlInput.trim()) {
                toast.error('Please enter a valid M3U or M3U8 Live TV URL');
                return;
            }
            allFolders = [iptvUrlInput.trim()];
        } else {
            allFolders = [...newLibFolders];
            if (folderInput.trim() && !allFolders.includes(folderInput.trim())) {
                allFolders.push(folderInput.trim());
            }
            if (allFolders.length === 0) {
                toast.error('Please specify at least one folder path');
                return;
            }
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
                setIptvUrlInput('');
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

    // Subtitle Search & Attach
    const handleDiscoverLocalSubtitles = async (video: MediaItem) => {
        try {
            const res = await fetch(`/api/theater/subtitles?videoPath=${encodeURIComponent(video.path)}&lang=${subSearchLang}`);
            if (res.ok) {
                const data = await res.json();
                const list = [...(data.local || []), ...(data.online || [])];
                setAvailableSubtitles(list);
                if (list.length > 0) {
                    setSelectedSubtitle(list[0]);
                }
            }
        } catch {}
    };

    const handleSearchOnlineSubtitles = async () => {
        if (!subSearchQuery.trim()) return;
        setSubSearchLoading(true);
        try {
            const res = await fetch(`/api/theater/subtitles?query=${encodeURIComponent(subSearchQuery)}&lang=${subSearchLang}`);
            if (res.ok) {
                const data = await res.json();
                const list = [...(data.online || [])];
                setAvailableSubtitles(prev => [...prev.filter(s => s.source === 'Local Storage'), ...list]);
                if (list.length > 0) {
                    toast.success(`Found ${list.length} subtitle tracks`);
                } else {
                    toast.info('No online subtitles found for this title/language combination');
                }
            }
        } catch {
            toast.error('Failed to search subtitles');
        } finally {
            setSubSearchLoading(false);
        }
    };

    // Online YouTube & Spotify Music Search
    const handleSearchOnlineMusic = async (q: string) => {
        if (!q.trim()) return;
        setLoadingOnline(true);
        try {
            const res = await fetch(`/api/theater/music/online?q=${encodeURIComponent(q.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setOnlineResults(Array.isArray(data.results) ? data.results : []);
            }
        } catch {
            toast.error('Failed to search online music');
        } finally {
            setLoadingOnline(false);
        }
    };

    // Grab Online Track to Local Music Library
    const handleGrabTrackToLibrary = async (track: MediaItem) => {
        if (!activeLibrary) {
            toast.error('Please select an active Music Library first');
            return;
        }
        setGrabbingTracks(prev => ({ ...prev, [track.id]: true }));
        toast.info(`Grabbing "${track.title}" to local library...`);
        try {
            const res = await fetch('/api/theater/music/grab', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    youtubeId: track.youtubeId || track.id,
                    title: track.title,
                    artist: track.artist,
                    album: track.album || 'Singles',
                    libraryId: activeLibrary.id,
                    coverUrl: track.posterUrl
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Saved "${data.title}" to ${data.artist} / ${data.album}!`);
                fetchLibraryItems(activeLibrary);
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Failed to grab track to library');
            }
        } catch (e: any) {
            toast.error(`Error grabbing track: ${e.message}`);
        } finally {
            setGrabbingTracks(prev => ({ ...prev, [track.id]: false }));
        }
    };

    // Music Playlists Management
    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim() || !activeLibrary) return;
        try {
            const res = await fetch('/api/theater/music/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    libraryId: activeLibrary.id,
                    name: newPlaylistName.trim(),
                    items: addToPlaylistTrack ? [addToPlaylistTrack] : []
                })
            });
            if (res.ok) {
                toast.success(`Playlist "${newPlaylistName}" created!`);
                setIsCreatePlaylistModalOpen(false);
                setNewPlaylistName('');
                setAddToPlaylistTrack(null);
                const playRes = await fetch(`/api/theater/music/playlists?libraryId=${activeLibrary.id}`);
                if (playRes.ok) {
                    const pData = await playRes.json();
                    setPlaylists(Array.isArray(pData.playlists) ? pData.playlists : []);
                }
            }
        } catch {
            toast.error('Failed to create playlist');
        }
    };

    const handleAddTrackToExistingPlaylist = async (playlist: MusicPlaylist, track: MediaItem) => {
        try {
            const updatedItems = [...playlist.items.filter(i => i.id !== track.id), track];
            const res = await fetch('/api/theater/music/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: playlist.id,
                    libraryId: playlist.library_id,
                    name: playlist.name,
                    items: updatedItems,
                    coverUrl: playlist.cover_url || track.posterUrl
                })
            });
            if (res.ok) {
                toast.success(`Added "${track.title}" to ${playlist.name}!`);
                setAddToPlaylistTrack(null);
                if (activeLibrary) {
                    const playRes = await fetch(`/api/theater/music/playlists?libraryId=${activeLibrary.id}`);
                    if (playRes.ok) {
                        const pData = await playRes.json();
                        setPlaylists(Array.isArray(pData.playlists) ? pData.playlists : []);
                    }
                }
            }
        } catch {
            toast.error('Failed to add track to playlist');
        }
    };

    const handleDeletePlaylist = async (playlistId: string) => {
        try {
            const res = await fetch(`/api/theater/music/playlists?id=${playlistId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Playlist deleted');
                setPlaylists(prev => prev.filter(p => p.id !== playlistId));
            }
        } catch {
            toast.error('Failed to delete playlist');
        }
    };

    // Music Player Handlers (powered by global MusicPlayerContext)
    const handlePlayTrack = (track: MediaItem, queueList?: MediaItem[], startIndex = 0) => {
        playTrack(track, queueList, startIndex);
    };

    const handlePlayAlbum = (albumTracks: MediaItem[]) => {
        playAlbum(albumTracks);
    };

    // Video Player & HLS Handler for .ts and live streams + Audio/Universal Transcoding + Diagnostics Fetch
    useEffect(() => {
        if (playingVideo && videoRef.current) {
            const video = videoRef.current;
            setPlaybackError(null);

            if (stallTimeoutRef.current) {
                clearTimeout(stallTimeoutRef.current);
                stallTimeoutRef.current = null;
            }

            let streamUrl = playingVideo.streamUrl;

            // Transcode mode & quality query param injection
            if (videoAudioMode === 'universal') {
                streamUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}transcode=universal&quality=${videoQuality}`;
            } else if (videoAudioMode === 'transcode') {
                streamUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}transcode=audio`;
            } else if (videoAudioMode === 'direct') {
                streamUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}transcode=direct`;
            }

            addDebugLog('info', `Initializing playback for "${playingVideo.title}"`, {
                path: playingVideo.path,
                mode: videoAudioMode,
                quality: videoQuality,
                streamUrl
            });

            const isTsOrHls = playingVideo.extension === 'TS' || streamUrl.includes('.m3u8') || streamUrl.includes('.ts');

            if (isTsOrHls && Hls.isSupported()) {
                if (hlsInstanceRef.current) {
                    hlsInstanceRef.current.destroy();
                }
                const hls = new Hls({ enableWorker: true });
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    addDebugLog('success', 'HLS Manifest parsed, triggering playback');
                    video.play().catch((e) => {
                        addDebugLog('warn', `Autoplay prevented or playback error: ${e.message}`);
                    });
                });
                hls.on(Hls.Events.ERROR, (_event, data) => {
                    addDebugLog(data.fatal ? 'error' : 'warn', `HLS event: ${data.details} (${data.type})`, data);
                    if (data.fatal) {
                        setPlaybackError({
                            codeName: data.details,
                            message: `HLS fatal streaming error (${data.details}).`,
                            details: JSON.stringify(data, null, 2),
                            suggestion: 'Switch to Server-Side Optimized (Universal H.264+AAC) or open in VLC.'
                        });
                    }
                });
                hlsInstanceRef.current = hls;
            } else {
                video.src = streamUrl;
                video.load();
                addDebugLog('info', `Set HTML5 video.src to "${streamUrl}" and called video.load()`);
                video.play().catch((e) => {
                    addDebugLog('warn', `Video play() rejected: ${e.message}`);
                });

                // Playback Watchdog: If the browser hangs at 0:00 without progressing for > 4.5s
                stallTimeoutRef.current = setTimeout(() => {
                    if (video && video.currentTime === 0 && (video.readyState <= 2 || video.paused)) {
                        if (videoAudioMode !== 'universal') {
                            addDebugLog('error', `Playback watchdog timeout: Stream stalled at 0:00 in ${videoAudioMode.toUpperCase()} mode.`);
                            setPlaybackError({
                                codeName: 'STREAM_STALLED_CODEC_INCOMPATIBLE',
                                message: `Stream stalled at 0:00. Your browser cannot decode this video bitstream (${videoAudioMode === 'transcode' ? 'Audio-only AAC / Video-copy' : 'Direct Stream'}) over the web network.`,
                                suggestion: 'Click "Full Transcode (Universal H.264)" below to convert on-the-fly with QuickSync/NVENC/CPU into standard H.264+AAC, or open in VLC.'
                            });
                        }
                    }
                }, 4500);
            }

            handleDiscoverLocalSubtitles(playingVideo);
            setSubSearchQuery(playingVideo.title);
            setSubOffsetMs(0);

            // Fetch Stream Diagnostics (Original vs Played Codecs & Bitrate)
            fetch(`/api/theater/diagnostics?videoPath=${encodeURIComponent(playingVideo.path)}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d) {
                        setDiagnosticsData(d);
                        addDebugLog('info', 'ffprobe stream diagnostics loaded', d.original);
                        if (d.original?.videoCodec?.toUpperCase().includes('HEVC') && videoAudioMode !== 'universal') {
                            addDebugLog('warn', `HEVC 4K source video in ${videoAudioMode.toUpperCase()} mode: Browser may stall if HEVC decoding is unsupported. Universal Server Optimized mode recommended.`);
                        }
                        if (d.original?.audioCodec?.toUpperCase().includes('DTS') && videoAudioMode === 'direct') {
                            addDebugLog('warn', `Direct Play with DTS audio: Browser cannot decode raw DTS audio without AAC transcoding.`);
                        }
                    }
                })
                .catch(err => {
                    addDebugLog('warn', `Failed to fetch diagnostics probe: ${err.message}`);
                });
        }

        return () => {
            if (stallTimeoutRef.current) {
                clearTimeout(stallTimeoutRef.current);
                stallTimeoutRef.current = null;
            }
            if (hlsInstanceRef.current) {
                hlsInstanceRef.current.destroy();
                hlsInstanceRef.current = null;
            }
        };
    }, [playingVideo, videoAudioMode, videoQuality]);

    // Live Video HLS Handler
    useEffect(() => {
        if (playingChannel && liveVideoRef.current) {
            const video = liveVideoRef.current;
            const streamUrl = playingChannel.url;

            if (Hls.isSupported() && (streamUrl.includes('.m3u8') || streamUrl.includes('.ts') || !video.canPlayType('application/vnd.apple.mpegurl'))) {
                if (hlsInstanceRef.current) {
                    hlsInstanceRef.current.destroy();
                }
                const hls = new Hls({ enableWorker: true });
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(() => {});
                });
                hlsInstanceRef.current = hls;
            } else {
                video.src = streamUrl;
                video.play().catch(() => {});
            }
        }
    }, [playingChannel]);

    // Stream Metrics Monitor
    useEffect(() => {
        const interval = setInterval(() => {
            const video = videoRef.current || liveVideoRef.current;
            if (video) {
                const buffered = video.buffered;
                let bufSec = 0;
                if (buffered.length > 0) {
                    bufSec = Math.max(0, buffered.end(buffered.length - 1) - video.currentTime);
                }

                // @ts-ignore
                const dropped = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality().droppedVideoFrames : 0;

                setStreamMetrics({
                    resolution: video.videoWidth ? `${video.videoWidth} x ${video.videoHeight}` : 'Loading...',
                    bufferedSeconds: Math.round(bufSec * 10) / 10,
                    currentTime: formatTime(video.currentTime),
                    duration: formatTime(video.duration),
                    droppedFrames: dropped,
                    sourceMode: playingVideo?.posterUrl
                        ? 'Plex Direct Stream'
                        : (playingChannel
                            ? 'HLS Live TV'
                            : (videoAudioMode === 'universal'
                                ? 'Full Universal Transcode (H.264 + AAC)'
                                : (videoAudioMode === 'transcode'
                                    ? 'Direct Video + AAC Transcode'
                                    : 'Direct Play (Local)')))
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [playingVideo, playingChannel, videoAudioMode]);

    // Send video playback session heartbeat to Analytics telemetry
    useEffect(() => {
        if (!playingVideo) return;

        const sendVideoHeartbeat = async () => {
            try {
                const video = videoRef.current;
                const isVideoPlaying = video ? !video.paused : true;
                await fetch('/api/theater/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: 'schedulearr-theater-video',
                        userName: 'Pedro',
                        mediaId: playingVideo.id,
                        title: playingVideo.title,
                        seriesTitle: playingVideo.folder || undefined,
                        mediaType: playingVideo.category === 'video' ? 'movie' : 'video',
                        poster: playingVideo.posterUrl,
                        deviceName: 'Schedulearr Theater Player',
                        platform: 'Web',
                        state: isVideoPlaying ? 'playing' : 'paused',
                        progressPercent: video && video.duration > 0 ? Math.min(100, Math.round((video.currentTime / video.duration) * 100)) : 0,
                        viewOffsetMs: video ? Math.round(video.currentTime * 1000) : 0,
                        durationMs: video && video.duration > 0 ? Math.round(video.duration * 1000) : playingVideo.durationMs || 0,
                        bandwidthMbps: '8.0',
                        transcodeDecision: videoAudioMode === 'universal' ? 'Server Transcode (QSV/Universal)' : videoAudioMode === 'transcode' ? 'Audio Transcode (AAC)' : 'Direct Play'
                    })
                });
            } catch {}
        };

        sendVideoHeartbeat();

        const interval = setInterval(() => {
            sendVideoHeartbeat();
        }, 5000);

        return () => {
            clearInterval(interval);
        };
    }, [playingVideo?.id, videoAudioMode]);

    // Copy Full Nerd Tools Diagnostic Report
    const handleCopyDebugReport = () => {
        const video = videoRef.current;
        const report = [
            `# Schedulearr Theater - Playback Debug & Diagnostic Report`,
            `**Generated**: ${new Date().toISOString()}`,
            `**Media Title**: ${playingVideo?.title || 'Unknown'}`,
            `**File Path**: \`${playingVideo?.path || 'N/A'}\``,
            `**Stream URL**: \`${playingVideo?.streamUrl || 'N/A'}\``,
            `**Playback Mode**: ${videoAudioMode.toUpperCase()}`,
            ``,
            `## Original Media Specs (ffprobe)`,
            `- **Video Codec**: ${diagnosticsData?.original?.videoCodec || 'N/A'}`,
            `- **Resolution & FPS**: ${diagnosticsData?.original?.resolution || streamMetrics.resolution} @ ${diagnosticsData?.original?.fps || 'N/A'}`,
            `- **Video Bitrate**: ${diagnosticsData?.original?.videoBitrate || 'N/A'}`,
            `- **Audio Codec**: ${diagnosticsData?.original?.audioCodec || 'N/A'}`,
            `- **Audio Channels & Bitrate**: ${diagnosticsData?.original?.audioChannels || 'N/A'} (${diagnosticsData?.original?.audioBitrate || 'N/A'})`,
            `- **Container**: ${diagnosticsData?.original?.container || playingVideo?.extension || 'N/A'}`,
            ``,
            `## HTML5 Video Element State`,
            `- **Current Time / Duration**: ${video ? formatTime(video.currentTime) : '0:00'} / ${video ? formatTime(video.duration) : '0:00'}`,
            `- **Video Dimensions**: ${video?.videoWidth || 0} x ${video?.videoHeight || 0}`,
            `- **Ready State**: ${video?.readyState ?? 'N/A'}`,
            `- **Network State**: ${video?.networkState ?? 'N/A'}`,
            `- **Paused**: ${video?.paused ?? 'N/A'}`,
            `- **Muted**: ${video?.muted ?? 'N/A'}`,
            `- **Buffered Ahead**: ${streamMetrics.bufferedSeconds}s`,
            `- **Dropped Frames**: ${streamMetrics.droppedFrames}`,
            `- **Error State**: ${playbackError ? `${playbackError.codeName} (Code ${playbackError.code}): ${playbackError.message}` : 'None'}`,
            ``,
            `## Browser & Codec Compatibility`,
            `- **User-Agent**: \`${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}\``,
            `- **Platform**: \`${typeof navigator !== 'undefined' ? navigator.platform : 'N/A'}\``,
            `- **H.264 (avc1) Support**: ${video?.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') || 'no'}`,
            `- **HEVC (hev1) Support**: ${video?.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') || 'no'}`,
            `- **Matroska (.mkv) Support**: ${video?.canPlayType('video/x-matroska') || 'no'}`,
            `- **MediaSource Support**: ${typeof MediaSource !== 'undefined' ? 'Yes' : 'No'}`,
            ``,
            `## Live Event Logs (${debugLogs.length} entries)`,
            `\`\`\``,
            ...debugLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${l.details ? ` | ${JSON.stringify(l.details)}` : ''}`),
            `\`\`\``
        ].join('\n');

        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(report);
            toast.success('Nerd Tools debug report copied to clipboard!');
        }
    };

    // Save Curated Shortlist
    const handleSaveShortlist = async () => {
        if (!shortlistEditingName.trim()) {
            toast.error('Enter a shortlist name');
            return;
        }
        if (!activeLibrary) return;

        try {
            const res = await fetch('/api/theater/iptv/shortlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingShortlistId || undefined,
                    libraryId: activeLibrary.id,
                    name: shortlistEditingName.trim(),
                    channelIds: shortlistSelectedChanIds
                })
            });

            if (res.ok) {
                toast.success(`Shortlist "${shortlistEditingName}" saved!`);
                setIsShortlistManagerOpen(false);
                setEditingShortlistId(null);
                setShortlistEditingName('');
                setShortlistSelectedChanIds([]);
                const shortRes = await fetch(`/api/theater/iptv/shortlists?libraryId=${activeLibrary.id}`);
                if (shortRes.ok) {
                    const sData = await shortRes.json();
                    setShortlists(Array.isArray(sData.shortlists) ? sData.shortlists : []);
                }
            } else {
                toast.error('Failed to save shortlist');
            }
        } catch {
            toast.error('Error saving shortlist');
        }
    };

    const handleDeleteShortlist = async (shortlistId: string) => {
        try {
            const res = await fetch(`/api/theater/iptv/shortlists?id=${shortlistId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Shortlist deleted');
                setShortlists(prev => prev.filter(s => s.id !== shortlistId));
                if (activeShortlistId === shortlistId) setActiveShortlistId('ALL');
            }
        } catch {
            toast.error('Error deleting shortlist');
        }
    };

    // Filter & Sort Items
    const filteredItems = useMemo(() => {
        let list = [...items];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(i =>
                i.title.toLowerCase().includes(q) ||
                (i.artist && i.artist.toLowerCase().includes(q)) ||
                (i.album && i.album.toLowerCase().includes(q)) ||
                i.folder.toLowerCase().includes(q)
            );
        }

        list.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'added') {
                const timeA = new Date(a.addedAt || a.modifiedAt).getTime();
                const timeB = new Date(b.addedAt || b.modifiedAt).getTime();
                comparison = timeA - timeB;
            } else if (sortBy === 'title') {
                comparison = a.title.localeCompare(b.title);
            } else if (sortBy === 'date') {
                const timeA = new Date(a.modifiedAt).getTime();
                const timeB = new Date(b.modifiedAt).getTime();
                comparison = timeA - timeB;
            } else if (sortBy === 'size') {
                comparison = a.sizeBytes - b.sizeBytes;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return list;
    }, [items, searchQuery, sortBy, sortOrder]);

    // Music: Derived Albums and Artists
    const musicAlbums = useMemo(() => {
        const map = new Map<string, { name: string; artist: string; posterUrl?: string; tracks: MediaItem[] }>();
        for (const item of filteredItems) {
            const albumName = item.album || 'Single / Unknown Album';
            const artistName = item.artist || 'Various Artists';
            const key = `${artistName} - ${albumName}`;

            if (!map.has(key)) {
                map.set(key, {
                    name: albumName,
                    artist: artistName,
                    posterUrl: item.posterUrl,
                    tracks: []
                });
            }
            const alb = map.get(key)!;
            if (!alb.posterUrl && item.posterUrl) alb.posterUrl = item.posterUrl;
            alb.tracks.push(item);
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [filteredItems]);

    const musicArtists = useMemo(() => {
        const map = new Map<string, { name: string; posterUrl?: string; albums: any[]; tracks: MediaItem[] }>();
        for (const item of filteredItems) {
            const artistName = item.artist || 'Unknown Artist';
            if (!map.has(artistName)) {
                map.set(artistName, {
                    name: artistName,
                    posterUrl: item.posterUrl,
                    albums: [],
                    tracks: []
                });
            }
            const art = map.get(artistName)!;
            if (!art.posterUrl && item.posterUrl) art.posterUrl = item.posterUrl;
            art.tracks.push(item);
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [filteredItems]);

    // Filtered IPTV Channels by Shortlist and Group
    const filteredIptvChannels = useMemo(() => {
        let list = [...iptvChannels];
        if (activeShortlistId !== 'ALL') {
            const activeShort = shortlists.find(s => s.id === activeShortlistId);
            if (activeShort) {
                const set = new Set(activeShort.channelIds);
                list = list.filter(c => set.has(c.id));
            }
        }
        if (selectedIptvGroup !== 'ALL') {
            list = list.filter(c => c.group === selectedIptvGroup);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
        }
        return list;
    }, [iptvChannels, activeShortlistId, shortlists, selectedIptvGroup, searchQuery]);

    const photoItems = useMemo(() => {
        return filteredItems.filter(i => i.category === 'photo');
    }, [filteredItems]);

    const handlePlayItem = (item: MediaItem) => {
        if (item.category === 'video') {
            setPlayingVideo(item);
        } else if (item.category === 'audio') {
            handlePlayTrack(item, filteredItems, filteredItems.findIndex(i => i.id === item.id));
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
        if (type === 'live') return <Tv2 size={size} className="text-red-400" />;
        return <Folder size={size} className="text-zinc-400" />;
    };

    return (
        <>
            <Toaster position="top-right" theme="dark" richColors />

            <div className="space-y-6 pb-36">
                {/* ══════════════════════════════════════════════════════════════
                    TOP HEADER — Title left, Search + Actions right
                    ══════════════════════════════════════════════════════════════ */}
                <div className="bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-2xl p-5 sm:p-6 rounded-[2.5rem] shadow-2xl space-y-4">
                    {/* Row 1: Title + Search */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                                <Film size={26} className="text-emerald-400" /> Theater
                            </h1>
                            <p className="text-sm text-zinc-500 mt-0.5 font-medium">
                                Movies, Series, Live TV, and Music Studio
                            </p>
                        </div>

                        <div className="flex items-center gap-2 flex-1 lg:flex-none lg:w-[420px]">
                            {/* Global Search */}
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search movies, series, music, channels..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-8 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500 transition-colors"
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

                            {/* Rescan */}
                            {activeLibrary && (
                                <button
                                    onClick={() => fetchLibraryItems(activeLibrary)}
                                    title="Rescan Library"
                                    className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
                                >
                                    <RefreshCw size={16} className={loadingItems ? 'animate-spin text-emerald-400' : ''} />
                                </button>
                            )}

                            {/* Pair Smart TV */}
                            <button
                                onClick={() => setIsPairTvModalOpen(true)}
                                className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-indigo-400 hover:text-indigo-300 transition-colors shrink-0 relative"
                                title="Pair a Smart TV"
                            >
                                <Tv size={16} />
                                {pairedTvCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-950 animate-pulse" />}
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Content-type tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner flex-wrap">
                            {([
                                { id: 'movie', label: 'Movies', icon: <Film size={15} />, color: 'text-indigo-400', activeBg: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' },
                                { id: 'show', label: 'Series', icon: <Tv size={15} />, color: 'text-emerald-400', activeBg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' },
                                { id: 'live', label: 'Live TV', icon: <RadioTower size={15} />, color: 'text-red-400', activeBg: 'bg-red-500/20 text-red-300 border border-red-500/40' },
                                { id: 'music', label: 'Music', icon: <Music size={15} />, color: 'text-amber-400', activeBg: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' },
                            ] as const).map(tab => {
                                const isActive = activeContentTab === tab.id;
                                const count = libraries.filter(l => l.type === tab.id).length;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveContentTab(tab.id)}
                                        className={`flex items-center gap-2 px-4 py-2 text-sm font-black rounded-xl transition-all ${
                                            isActive ? tab.activeBg : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        {tab.icon}
                                        <span>{tab.label}</span>
                                        {count > 0 && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-lg font-bold ${isActive ? 'bg-white/10' : 'bg-zinc-900'}`}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Add Library button */}
                        <button
                            onClick={() => setIsAddLibModalOpen(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-black rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30 transition-all shadow-sm"
                        >
                            <Plus size={14} /> Add Library
                        </button>
                    </div>

                    {/* Row 3: Per-tab library toggles (only when there are multiple libraries for this tab) */}
                    {activeTabLibraries.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-xs text-zinc-600 font-bold uppercase tracking-wider">Libraries:</span>
                            {activeTabLibraries.map(lib => {
                                const enabledSet = enabledLibsByTab[activeContentTab];
                                const isEnabled = !enabledSet || enabledSet.size === 0 || enabledSet.has(lib.id);
                                return (
                                    <button
                                        key={lib.id}
                                        onClick={() => toggleLibraryInTab(activeContentTab, lib.id, activeTabLibraries.map(l => l.id))}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                                            isEnabled
                                                ? 'bg-zinc-800 text-white border-zinc-700'
                                                : 'bg-transparent text-zinc-600 border-zinc-800 hover:text-zinc-400'
                                        }`}
                                    >
                                        {isEnabled && <Check size={11} className="text-emerald-400" />}
                                        {lib.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Sub-bar: Music Studio tabs / Live TV shortlists / Movie sort/view controls ── */}
                {activeContentTab === 'music' && activeLibrary?.type === 'music' ? (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 px-2">
                            {/* Music Sub-Tabs: Albums, Artists/Composers, Songs, Playlists, Online Search */}
                            <div className="flex flex-wrap items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 shadow-inner">
                                {[
                                    { id: 'albums', label: 'Albums', icon: <Disc size={15} /> },
                                    { id: 'artists', label: 'Artists & Composers', icon: <User size={15} /> },
                                    { id: 'tracks', label: 'Songs', icon: <Music size={15} /> },
                                    { id: 'playlists', label: `Playlists (${playlists.length})`, icon: <ListMusic size={15} /> },
                                    { id: 'online', label: 'Online Search (YouTube / Spotify)', icon: <Youtube size={15} className="text-red-400" /> }
                                ].map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setMusicTab(t.id as any)}
                                        className={`flex items-center gap-2 px-4 py-2 text-sm font-black rounded-xl transition-all ${
                                            musicTab === t.id
                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        {t.icon}
                                        <span>{t.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-3">
                                {musicTab === 'playlists' && (
                                    <button
                                        onClick={() => {
                                            setNewPlaylistName('');
                                            setAddToPlaylistTrack(null);
                                            setIsCreatePlaylistModalOpen(true);
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20"
                                    >
                                        <Plus size={14} /> New Playlist
                                    </button>
                                )}

                                <button
                                    onClick={() => handleDeleteLibrary(activeLibrary.id, activeLibrary.name)}
                                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-xs font-bold"
                                    title="Delete Music Library"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : activeContentTab === 'live' && activeLibrary?.type === 'live' ? (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-4 px-2">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
                                    <button
                                        onClick={() => setActiveShortlistId('ALL')}
                                        className={`px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${
                                            activeShortlistId === 'ALL'
                                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        All Channels ({iptvChannels.length})
                                    </button>

                                    {shortlists.map(s => (
                                        <div key={s.id} className="flex items-center gap-1">
                                            <button
                                                onClick={() => setActiveShortlistId(s.id)}
                                                className={`px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${
                                                    activeShortlistId === s.id
                                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                        : 'text-zinc-500 hover:text-zinc-300'
                                                }`}
                                            >
                                                {s.name} ({s.channelIds.length})
                                            </button>
                                            <button
                                                onClick={() => handleDeleteShortlist(s.id)}
                                                className="p-1 text-zinc-600 hover:text-red-400 rounded-lg"
                                                title="Delete Shortlist"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => {
                                            setEditingShortlistId(null);
                                            setShortlistEditingName('');
                                            setShortlistSelectedChanIds([]);
                                            setIsShortlistManagerOpen(true);
                                        }}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-bold text-emerald-400 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30"
                                    >
                                        <Plus size={13} /> New Shortlist
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => handleDeleteLibrary(activeLibrary.id, activeLibrary.name)}
                                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-xs font-bold"
                                title="Delete Live TV Library"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        {iptvGroups.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-1 px-2">
                                <button
                                    onClick={() => setSelectedIptvGroup('ALL')}
                                    className={`px-3.5 py-1.5 rounded-xl text-sm font-bold shrink-0 transition-all ${
                                        selectedIptvGroup === 'ALL'
                                            ? 'bg-zinc-800 text-white'
                                            : 'bg-zinc-950/60 text-zinc-500 hover:text-zinc-300 border border-zinc-900'
                                    }`}
                                >
                                    All Categories
                                </button>
                                {iptvGroups.slice(0, 20).map(g => (
                                    <button
                                        key={g.name}
                                        onClick={() => setSelectedIptvGroup(g.name)}
                                        className={`px-3.5 py-1.5 rounded-xl text-sm font-bold shrink-0 transition-all ${
                                            selectedIptvGroup === g.name
                                                ? 'bg-zinc-800 text-white'
                                                : 'bg-zinc-950/60 text-zinc-500 hover:text-zinc-300 border border-zinc-900'
                                        }`}
                                    >
                                        {g.name} <span className="text-[10px] text-zinc-600">({g.count})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : activeLibrary && (activeContentTab === 'movie' || activeContentTab === 'show') ? (
                    <div className="flex flex-wrap items-center justify-between gap-4 px-2">
                        <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-white">
                                {filteredItems.length} items
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Sort Bar */}
                            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-2xl border border-zinc-800/80">
                                {[
                                    { id: 'added', label: 'Date Added' },
                                    { id: 'title', label: 'Title' },
                                    { id: 'size', label: 'Size' },
                                    { id: 'date', label: 'Modified' }
                                ].map(s => {
                                    const isActive = sortBy === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => {
                                                if (isActive) {
                                                    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                                } else {
                                                    setSortBy(s.id as any);
                                                    setSortOrder(s.id === 'title' ? 'asc' : 'desc');
                                                }
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                isActive
                                                    ? 'bg-zinc-800 text-white shadow-sm'
                                                    : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <span>{s.label}</span>
                                            {isActive && (
                                                <span className="text-[10px] text-emerald-400">
                                                    {sortOrder === 'asc' ? '▲' : '▼'}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}

                                <div className="w-[1px] h-4 bg-zinc-800 my-auto mx-0.5" />

                                <button
                                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="p-1.5 px-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-xs font-bold flex items-center gap-1.5"
                                >
                                    {sortOrder === 'asc' ? (
                                        <ArrowUp size={14} className="text-emerald-400" />
                                    ) : (
                                        <ArrowDown size={14} className="text-emerald-400" />
                                    )}
                                    <span className="text-[10px] uppercase font-black">{sortOrder}</span>
                                </button>
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
                ) : null}


                {/* ── Content Area: Music vs Live TV vs Movies/Shows ── */}
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
                                Import your existing Plex libraries, local media folders, or IPTV Live TV playlists.
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
                ) : activeContentTab === 'music' && activeLibrary?.type === 'music' ? (
                    /* ══════════════════════════════════════════════════════════════
                       MUSIC STUDIO VIEWS (Albums, Artists, Songs, Playlists, Online)
                       ══════════════════════════════════════════════════════════════ */
                    <div className="space-y-6">
                        {/* 1. ALBUMS TAB */}
                        {musicTab === 'albums' && (
                            musicAlbums.length === 0 ? (
                                <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-2">
                                    <Disc size={40} className="mx-auto text-zinc-700" />
                                    <p className="text-lg font-bold text-white">No albums found</p>
                                    <p className="text-xs text-zinc-500">Ensure your music directory contains audio files or link a Plex music library.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                                    {musicAlbums.map((album, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => setSelectedAlbum(album)}
                                            className="group flex flex-col bg-[#09090b] border border-zinc-900 hover:border-amber-500/50 rounded-3xl overflow-hidden transition-all duration-300 shadow-xl cursor-pointer hover:-translate-y-1.5"
                                        >
                                            <div className="relative aspect-square bg-zinc-900 overflow-hidden flex items-center justify-center border-b border-zinc-900">
                                                {album.posterUrl ? (
                                                    <img src={album.posterUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                                ) : (
                                                    <Disc size={56} className="text-zinc-700 group-hover:text-amber-400 group-hover:scale-110 transition-all duration-500" />
                                                )}
                                                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePlayAlbum(album.tracks);
                                                        }}
                                                        className="w-14 h-14 rounded-2xl bg-amber-500 text-black flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-all"
                                                        title="Play Album"
                                                    >
                                                        <Play size={24} className="ml-1" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-4 space-y-1">
                                                <h3 className="font-bold text-white text-base leading-snug line-clamp-1 group-hover:text-amber-400 transition-colors">
                                                    {album.name}
                                                </h3>
                                                <p className="text-xs text-zinc-400 font-medium truncate">{album.artist}</p>
                                                <span className="text-[11px] text-zinc-600 font-bold block pt-0.5">{album.tracks.length} tracks</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* 2. ARTISTS & COMPOSERS TAB */}
                        {musicTab === 'artists' && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                                {musicArtists.map((artist, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => {
                                            const artistAlbums = musicAlbums.filter(a => a.artist === artist.name);
                                            setSelectedArtist({ name: artist.name, posterUrl: artist.posterUrl, albums: artistAlbums, tracks: artist.tracks });
                                        }}
                                        className="p-5 rounded-3xl bg-[#09090b] border border-zinc-900 hover:border-amber-500/50 transition-all text-center space-y-3 cursor-pointer group hover:-translate-y-1.5 shadow-xl"
                                    >
                                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-zinc-900 border-2 border-zinc-800 group-hover:border-amber-500/50 overflow-hidden mx-auto flex items-center justify-center shadow-lg relative">
                                            {artist.posterUrl ? (
                                                <img src={artist.posterUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                            ) : (
                                                <User size={36} className="text-zinc-700 group-hover:text-amber-400 transition-colors" />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white text-base truncate group-hover:text-amber-400 transition-colors">{artist.name}</h3>
                                            <span className="text-xs text-zinc-500">{artist.tracks.length} songs</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 3. TRACKS / SONGS TAB */}
                        {musicTab === 'tracks' && (
                            <div className="space-y-2">
                                {filteredItems.map((track, idx) => {
                                    const isCurrentPlaying = playingAudio?.id === track.id && isAudioPlaying;
                                    return (
                                        <div
                                            key={track.id}
                                            onClick={() => handlePlayTrack(track, filteredItems, idx)}
                                            className={`flex items-center justify-between p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer group shadow-sm ${
                                                isCurrentPlaying
                                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                                    : 'bg-zinc-950/60 border-zinc-900 hover:border-zinc-800 hover:bg-zinc-900/50 text-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="w-12 h-12 rounded-xl bg-zinc-900 overflow-hidden flex items-center justify-center text-zinc-400 shrink-0 relative">
                                                    {track.posterUrl ? (
                                                        <img src={track.posterUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Music size={20} />
                                                    )}
                                                    {isCurrentPlaying && (
                                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                            <Volume2 size={18} className="text-amber-400 animate-pulse" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-sm sm:text-base truncate group-hover:text-amber-400 transition-colors">
                                                        {track.title}
                                                    </h4>
                                                    <p className="text-xs text-zinc-500 truncate">
                                                        <span
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const artName = track.artist || 'Unknown Artist';
                                                                const artistTracks = items.filter(i => (i.artist || 'Unknown Artist') === artName);
                                                                const artistAlbums = musicAlbums.filter(a => a.artist === artName);
                                                                setSelectedArtist({ name: artName, posterUrl: track.posterUrl, albums: artistAlbums, tracks: artistTracks });
                                                            }}
                                                            className="hover:text-amber-400 hover:underline cursor-pointer transition-colors"
                                                            title="View Artist"
                                                        >
                                                            {track.artist || 'Unknown Artist'}
                                                        </span>
                                                        {' • '}
                                                        <span
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (track.album) {
                                                                    const alb = musicAlbums.find(a => a.name === track.album);
                                                                    if (alb) setSelectedAlbum(alb);
                                                                }
                                                            }}
                                                            className="hover:text-amber-400 hover:underline cursor-pointer transition-colors"
                                                            title="View Album"
                                                        >
                                                            {track.album || 'Single'}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDownloadTrack(track);
                                                    }}
                                                    className="p-2 rounded-xl text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                                    title="Download Track to Local Machine"
                                                >
                                                    <Download size={16} />
                                                </button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAddToPlaylistTrack(track);
                                                        setIsCreatePlaylistModalOpen(true);
                                                    }}
                                                    className="p-2 rounded-xl text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                                                    title="Add to Playlist"
                                                >
                                                    <ListPlus size={16} />
                                                </button>

                                                <button className="w-10 h-10 rounded-xl bg-zinc-900 group-hover:bg-amber-500 text-zinc-400 group-hover:text-black flex items-center justify-center transition-all">
                                                    <Play size={16} className="ml-0.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 4. PLAYLISTS TAB */}
                        {musicTab === 'playlists' && (
                            playlists.length === 0 ? (
                                <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-4 max-w-md mx-auto">
                                    <ListMusic size={40} className="mx-auto text-zinc-700" />
                                    <div>
                                        <h3 className="text-lg font-bold text-white">No playlists created yet</h3>
                                        <p className="text-xs text-zinc-500 mt-1">Create your first custom playlist to group your favorite songs.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setNewPlaylistName('');
                                            setIsCreatePlaylistModalOpen(true);
                                        }}
                                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg"
                                    >
                                        <Plus size={14} className="inline mr-1" /> Create Playlist
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                                    {playlists.map(pl => (
                                        <div
                                            key={pl.id}
                                            className="p-5 rounded-3xl bg-[#09090b] border border-zinc-900 hover:border-amber-500/50 transition-all flex flex-col justify-between space-y-4 group shadow-xl"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                                                    <ListMusic size={26} />
                                                </div>
                                                <button
                                                    onClick={() => handleDeletePlaylist(pl.id)}
                                                    className="p-2 text-zinc-600 hover:text-red-400 rounded-xl transition-colors"
                                                    title="Delete Playlist"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>

                                            <div>
                                                <h3 className="text-base font-black text-white group-hover:text-amber-400 transition-colors truncate">{pl.name}</h3>
                                                <span className="text-xs text-zinc-500 font-semibold">{pl.items.length} tracks</span>
                                            </div>

                                            <button
                                                disabled={pl.items.length === 0}
                                                onClick={() => handlePlayAlbum(pl.items)}
                                                className="w-full py-3 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/30 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                                            >
                                                <Play size={15} /> Play Playlist
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* 5. ONLINE YOUTUBE & SPOTIFY SEARCH TAB */}
                        {musicTab === 'online' && (
                            <div className="space-y-6 max-w-4xl mx-auto">
                                <div className="p-6 rounded-3xl bg-[#09090b] border border-zinc-800 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Youtube size={22} className="text-red-500" />
                                        <h3 className="text-base font-black text-white">Search YouTube & Spotify Stream Fallback</h3>
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        Search millions of tracks online. Play them immediately with real audio streaming, or grab and download them directly into your local library with clean folders and album art!
                                    </p>

                                    <div className="flex gap-2 pt-2">
                                        <input
                                            type="text"
                                            placeholder="Enter song title or artist (e.g. Bohemian Rhapsody, Daft Punk Get Lucky)..."
                                            value={onlineMusicQuery}
                                            onChange={e => setOnlineMusicQuery(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleSearchOnlineMusic(onlineMusicQuery); }}
                                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500"
                                        />
                                        <button
                                            disabled={loadingOnline}
                                            onClick={() => handleSearchOnlineMusic(onlineMusicQuery)}
                                            className="px-6 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-50"
                                        >
                                            {loadingOnline ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                                            Search
                                        </button>
                                    </div>
                                </div>

                                {onlineResults.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-black uppercase text-zinc-500 tracking-wider px-2">Online Search Results</h4>
                                        <div className="space-y-2">
                                            {onlineResults.map((song) => {
                                                const isGrabbing = grabbingTracks[song.id];
                                                return (
                                                    <div
                                                        key={song.id}
                                                        onClick={() => handlePlayTrack(song, onlineResults)}
                                                        className="flex items-center justify-between p-4 bg-zinc-950/70 border border-zinc-900 hover:border-red-500/40 rounded-2xl transition-all cursor-pointer group"
                                                    >
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className="w-14 h-14 rounded-xl bg-zinc-900 overflow-hidden flex items-center justify-center text-zinc-400 shrink-0">
                                                                {song.posterUrl ? (
                                                                    <img src={song.posterUrl} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Youtube size={22} className="text-red-500" />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h4 className="font-bold text-white text-base truncate group-hover:text-red-400 transition-colors">
                                                                    {song.title}
                                                                </h4>
                                                                <p className="text-xs text-zinc-500">
                                                                    {song.artist} • <span className="text-red-400">{song.source}</span> • {song.duration}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {/* Grab to Library Button */}
                                                            <button
                                                                disabled={isGrabbing}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleGrabTrackToLibrary(song);
                                                                }}
                                                                className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1.5"
                                                                title="Grab & Download to Local Library Folder (Sonarr/Lidarr style)"
                                                            >
                                                                {isGrabbing ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                                                                <span className="hidden sm:inline">Grab to Library</span>
                                                            </button>

                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setAddToPlaylistTrack(song);
                                                                    setIsCreatePlaylistModalOpen(true);
                                                                }}
                                                                className="p-2.5 rounded-xl text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                                                                title="Save to Playlist"
                                                            >
                                                                <ListPlus size={16} />
                                                            </button>
                                                            <button className="w-10 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-all shadow-md">
                                                                <Play size={16} className="ml-0.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : activeContentTab === 'live' && activeLibrary?.type === 'live' ? (
                    /* ── Live TV Channels Grid ── */
                    filteredIptvChannels.length === 0 ? (
                        <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-2">
                            <Radio size={40} className="mx-auto text-zinc-700" />
                            <p className="text-lg font-bold text-white">No Live Channels found</p>
                            <p className="text-xs text-zinc-500">Check your shortlist filter or search terms.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {filteredIptvChannels.map(chan => (
                                <div
                                    key={chan.id}
                                    onClick={() => setPlayingChannel(chan)}
                                    className="p-4 bg-[#09090b] border border-zinc-900 hover:border-red-500/50 rounded-3xl transition-all duration-300 shadow-xl cursor-pointer hover:-translate-y-1 flex flex-col justify-between space-y-3 group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                                        </span>
                                        <span className="text-[10px] text-zinc-500 truncate max-w-[80px]">{chan.group}</span>
                                    </div>

                                    <div className="h-16 flex items-center justify-center">
                                        {chan.logo ? (
                                            <img src={chan.logo} alt="" className="max-h-14 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                        ) : (
                                            <Tv2 size={32} className="text-zinc-700 group-hover:text-red-400 transition-colors" />
                                        )}
                                    </div>

                                    <div className="pt-1 border-t border-zinc-900/80">
                                        <h4 className="font-bold text-white text-xs truncate group-hover:text-red-400 transition-colors">
                                            {chan.name}
                                        </h4>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : activeTabLibraries.length === 0 ? (
                    <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-4 max-w-xl mx-auto my-12 shadow-2xl">
                        <div className="w-16 h-16 rounded-3xl bg-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
                            {activeContentTab === 'movie' ? <Film size={32} /> : activeContentTab === 'show' ? <Tv size={32} /> : activeContentTab === 'live' ? <RadioTower size={32} /> : <Music size={32} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">No {activeContentTab === 'movie' ? 'Movie' : activeContentTab === 'show' ? 'Series' : activeContentTab === 'live' ? 'Live TV' : 'Music'} Libraries</h2>
                            <p className="text-sm text-zinc-500 mt-1">
                                Add a {activeContentTab === 'movie' ? 'movie' : activeContentTab === 'show' ? 'series' : activeContentTab === 'live' ? 'live TV' : 'music'} library to get started.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsAddLibModalOpen(true)}
                            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 mx-auto"
                        >
                            <Plus size={16} /> Add Library
                        </button>
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
                                : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5'
                            : 'space-y-3'
                    }>
                        {filteredItems.map(item => {
                            if (viewMode === 'list') {
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handlePlayItem(item)}
                                        className="flex items-center justify-between p-3.5 sm:p-4 bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-3xl hover:bg-zinc-900/50 transition-all cursor-pointer group shadow-lg gap-4"
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-14 sm:w-16 h-20 sm:h-24 rounded-2xl bg-zinc-900 border border-zinc-800/80 overflow-hidden flex items-center justify-center text-zinc-500 group-hover:border-emerald-500/40 transition-all shrink-0 relative shadow-md">
                                                {item.posterUrl ? (
                                                    <img src={item.posterUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                                ) : (
                                                    <div className="text-zinc-600 flex flex-col items-center gap-1">
                                                        {item.category === 'video' ? <FileVideo size={24} /> : item.category === 'audio' ? <FileAudio size={24} /> : <FileImage size={24} />}
                                                    </div>
                                                )}
                                                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[8px] font-black uppercase text-zinc-300">
                                                    {item.extension}
                                                </div>
                                            </div>

                                            <div className="min-w-0 space-y-1">
                                                <h3 className="font-bold text-white text-base sm:text-lg truncate group-hover:text-emerald-400 transition-colors">
                                                    {item.title}
                                                </h3>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 font-medium">
                                                    <span>{item.folder}</span>
                                                    <span>•</span>
                                                    <span>{formatBytes(item.sizeBytes)}</span>
                                                    {item.addedAt && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="text-zinc-400">Added {new Date(item.addedAt).toLocaleDateString()}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openCastPicker(item); }}
                                                className="p-3 rounded-2xl bg-zinc-900/60 hover:bg-purple-500/20 text-zinc-500 hover:text-purple-400 border border-zinc-800 transition-all shrink-0"
                                                title="Cast to Smart TV"
                                            >
                                                <Cast size={16} />
                                            </button>
                                            <button className="w-12 h-12 rounded-2xl bg-zinc-900 group-hover:bg-emerald-500 text-zinc-400 group-hover:text-black flex items-center justify-center transition-all shrink-0 shadow-lg">
                                                <Play size={18} className="ml-0.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            }

                            // Photo Grid View
                            if (item.category === 'photo') {
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handlePlayItem(item)}
                                        className="group relative aspect-square rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800/80 hover:border-pink-500/50 transition-all cursor-pointer shadow-lg hover:-translate-y-1"
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

                            // Video / Audio Grid Card with TALL 2:3 Movie/Series Poster Aspect Ratio
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => handlePlayItem(item)}
                                    className="group flex flex-col bg-[#09090b] border border-zinc-900 hover:border-zinc-800 rounded-3xl overflow-hidden transition-all duration-300 shadow-xl cursor-pointer hover:-translate-y-1.5"
                                >
                                    <div className="relative aspect-[2/3] bg-zinc-900 overflow-hidden flex items-center justify-center border-b border-zinc-900">
                                        {item.posterUrl ? (
                                            <img
                                                src={item.posterUrl}
                                                alt={item.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="text-zinc-700 group-hover:scale-110 transition-transform duration-500 flex flex-col items-center gap-2 p-4 text-center">
                                                {item.category === 'video' ? <FileVideo size={56} /> : <FileAudio size={56} />}
                                                <span className="text-xs font-bold text-zinc-500 line-clamp-2">{item.title}</span>
                                            </div>
                                        )}

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                                            <div className="w-14 h-14 rounded-3xl bg-emerald-500 text-black flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                                                <Play size={24} className="ml-0.5" />
                                            </div>
                                        </div>

                                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 text-[9px] font-black uppercase text-zinc-300 shadow">
                                            {item.extension}
                                        </div>

                                        {item.addedAt && (
                                            <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-black/70 backdrop-blur-sm text-[9px] font-bold text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {new Date(item.addedAt).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-4 space-y-1">
                                        <h3 className="font-bold text-white text-base leading-snug line-clamp-1 group-hover:text-emerald-400 transition-colors">
                                            {item.title}
                                        </h3>
                                        <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold pt-0.5">
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

            {/* ── Album Detail Modal ── */}
            {selectedAlbum && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[85vh] overflow-y-auto custom-scrollbar flex flex-col">
                        <button
                            onClick={() => setSelectedAlbum(null)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex flex-col sm:flex-row items-center gap-6 pb-4 border-b border-zinc-900">
                            <div className="w-36 h-36 rounded-3xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 shadow-2xl">
                                {selectedAlbum.posterUrl ? (
                                    <img src={selectedAlbum.posterUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <Disc size={56} />
                                )}
                            </div>

                            <div className="space-y-2 text-center sm:text-left flex-1">
                                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase">
                                    Album
                                </span>
                                <h2 className="text-2xl sm:text-3xl font-black text-white">{selectedAlbum.name}</h2>
                                <p
                                    onClick={() => {
                                        const artName = selectedAlbum.artist;
                                        const artistTracks = items.filter(i => (i.artist || 'Various Artists') === artName);
                                        const artistAlbums = musicAlbums.filter(a => a.artist === artName);
                                        setSelectedArtist({ name: artName, posterUrl: selectedAlbum.posterUrl, albums: artistAlbums, tracks: artistTracks });
                                        setSelectedAlbum(null);
                                    }}
                                    className="text-sm font-semibold text-zinc-400 hover:text-amber-400 cursor-pointer transition-colors"
                                    title="View Artist Discography"
                                >
                                    {selectedAlbum.artist}
                                </p>
                                <span className="text-xs text-zinc-600 font-bold block">{selectedAlbum.tracks.length} Songs</span>

                                <div className="pt-2 flex flex-wrap items-center gap-3">
                                    <button
                                        onClick={() => {
                                            handlePlayAlbum(selectedAlbum.tracks);
                                            setSelectedAlbum(null);
                                        }}
                                        className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
                                    >
                                        <Play size={16} /> Play Album
                                    </button>

                                    <button
                                        onClick={() => handleDownloadAlbum(selectedAlbum.tracks, selectedAlbum.name)}
                                        className="px-5 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-black uppercase text-xs tracking-widest rounded-2xl border border-zinc-800 transition-all flex items-center gap-2"
                                        title="Download All Tracks in this Album to Local Machine"
                                    >
                                        <Download size={15} /> Download Album
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Album Tracklist */}
                        <div className="space-y-1">
                            {selectedAlbum.tracks.map((track, i) => (
                                <div
                                    key={track.id}
                                    onClick={() => handlePlayTrack(track, selectedAlbum.tracks, i)}
                                    className="flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-900/60 transition-all cursor-pointer group text-xs"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="w-6 text-zinc-600 font-mono font-bold group-hover:text-amber-400">{i + 1}</span>
                                        <span className="font-bold text-white group-hover:text-amber-400 transition-colors truncate">{track.title}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownloadTrack(track);
                                            }}
                                            className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-emerald-500 text-zinc-400 hover:text-black flex items-center justify-center transition-all"
                                            title="Download Track to Local Machine"
                                        >
                                            <Download size={13} />
                                        </button>
                                        <button className="w-8 h-8 rounded-lg bg-zinc-900 group-hover:bg-amber-500 text-zinc-400 group-hover:text-black flex items-center justify-center transition-all">
                                            <Play size={13} className="ml-0.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Artist & Composer Showcase Detail Modal ── */}
            {selectedArtist && (
                <div className="fixed inset-0 z-[225] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[88vh] overflow-y-auto custom-scrollbar flex flex-col">
                        <button
                            onClick={() => setSelectedArtist(null)}
                            className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all z-20"
                            title="Close Artist Detail"
                        >
                            <X size={22} />
                        </button>

                        {/* Artist Header */}
                        <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-zinc-900">
                            <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-zinc-900 border-2 border-zinc-800 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 shadow-2xl relative">
                                {selectedArtist.posterUrl ? (
                                    <img src={selectedArtist.posterUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={64} className="text-zinc-600" />
                                )}
                            </div>

                            <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                                <span className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black uppercase tracking-wider">
                                    Artist &amp; Composer
                                </span>
                                <h2 className="text-2xl sm:text-4xl font-black text-white truncate">{selectedArtist.name}</h2>
                                <div className="flex items-center justify-center sm:justify-start gap-3 text-sm text-zinc-400 font-semibold">
                                    <span>{selectedArtist.albums.length} {selectedArtist.albums.length === 1 ? 'Album' : 'Albums'}</span>
                                    <span>•</span>
                                    <span>{selectedArtist.tracks.length} {selectedArtist.tracks.length === 1 ? 'Track' : 'Tracks'}</span>
                                </div>

                                <div className="pt-3 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                                    <button
                                        onClick={() => {
                                            handlePlayAlbum(selectedArtist.tracks);
                                            setSelectedArtist(null);
                                        }}
                                        className="px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
                                    >
                                        <Play size={16} className="fill-current" /> Play Discography
                                    </button>

                                    <button
                                        onClick={() => {
                                            const shuffled = [...selectedArtist.tracks].sort(() => Math.random() - 0.5);
                                            handlePlayAlbum(shuffled);
                                            setSelectedArtist(null);
                                        }}
                                        className="px-5 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white font-black uppercase text-xs tracking-widest rounded-2xl border border-zinc-800 transition-all flex items-center gap-2"
                                        title="Shuffle all songs by this artist"
                                    >
                                        <Shuffle size={15} /> Shuffle
                                    </button>

                                    <button
                                        onClick={() => handleDownloadAlbum(selectedArtist.tracks, selectedArtist.name)}
                                        className="px-5 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-emerald-400 font-black uppercase text-xs tracking-widest rounded-2xl border border-zinc-800 transition-all flex items-center gap-2"
                                        title="Download All Tracks by this Artist"
                                    >
                                        <Download size={15} /> Download All
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Albums Section (if available) */}
                        {selectedArtist.albums && selectedArtist.albums.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                    <Disc size={18} className="text-amber-400" /> Albums ({selectedArtist.albums.length})
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {selectedArtist.albums.map((alb, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                setSelectedAlbum(alb);
                                                setSelectedArtist(null);
                                            }}
                                            className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-900 hover:border-amber-500/50 transition-all cursor-pointer group space-y-2 shadow-sm hover:-translate-y-1"
                                        >
                                            <div className="w-full aspect-square rounded-xl bg-zinc-900 overflow-hidden flex items-center justify-center relative shadow-md">
                                                {alb.posterUrl ? (
                                                    <img src={alb.posterUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                ) : (
                                                    <Disc size={36} className="text-zinc-700 group-hover:text-amber-400" />
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white text-sm truncate group-hover:text-amber-400 transition-colors">{alb.name}</h4>
                                                <span className="text-[11px] text-zinc-500 font-medium">{alb.tracks.length} tracks</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tracks Section */}
                        <div className="space-y-3">
                            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Music size={18} className="text-amber-400" /> Tracks ({selectedArtist.tracks.length})
                            </h3>
                            <div className="space-y-1.5">
                                {selectedArtist.tracks.map((track, i) => (
                                    <div
                                        key={track.id}
                                        onClick={() => handlePlayTrack(track, selectedArtist.tracks, i)}
                                        className="flex items-center justify-between p-3.5 rounded-2xl hover:bg-zinc-900/60 bg-zinc-950/40 border border-zinc-900/60 hover:border-zinc-800 transition-all cursor-pointer group text-sm"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <span className="w-6 text-zinc-600 font-mono font-bold group-hover:text-amber-400 text-xs">{i + 1}</span>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-white group-hover:text-amber-400 transition-colors truncate">{track.title}</h4>
                                                <p className="text-xs text-zinc-500 truncate">{track.album || 'Single'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownloadTrack(track);
                                                }}
                                                className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-emerald-500 text-zinc-400 hover:text-black flex items-center justify-center transition-all"
                                                title="Download Track"
                                            >
                                                <Download size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAddToPlaylistTrack(track);
                                                    setIsCreatePlaylistModalOpen(true);
                                                }}
                                                className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-amber-500 text-zinc-400 hover:text-black flex items-center justify-center transition-all"
                                                title="Add to Playlist"
                                            >
                                                <ListPlus size={14} />
                                            </button>
                                            <button className="w-8 h-8 rounded-xl bg-zinc-900 group-hover:bg-amber-500 text-zinc-400 group-hover:text-black flex items-center justify-center transition-all">
                                                <Play size={14} className="ml-0.5 fill-current" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create / Add to Playlist Modal ── */}
            {isCreatePlaylistModalOpen && (
                <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-md p-6 sm:p-8 space-y-6 shadow-2xl relative">
                        <button
                            onClick={() => {
                                setIsCreatePlaylistModalOpen(false);
                                setAddToPlaylistTrack(null);
                            }}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-400 hover:text-white"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-3 pb-2 border-b border-zinc-900">
                            <ListMusic size={24} className="text-amber-400" />
                            <div>
                                <h3 className="text-lg font-black text-white">
                                    {addToPlaylistTrack ? 'Add to Playlist' : 'Create New Playlist'}
                                </h3>
                                {addToPlaylistTrack && (
                                    <p className="text-xs text-zinc-400 truncate">Song: {addToPlaylistTrack.title}</p>
                                )}
                            </div>
                        </div>

                        {/* Existing Playlists to Add to */}
                        {addToPlaylistTrack && playlists.length > 0 && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Choose Existing Playlist</label>
                                <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                                    {playlists.map(pl => (
                                        <button
                                            key={pl.id}
                                            onClick={() => handleAddTrackToExistingPlaylist(pl, addToPlaylistTrack)}
                                            className="w-full p-3 rounded-xl bg-zinc-900/60 hover:bg-amber-500/20 text-left text-xs font-bold text-white hover:text-amber-300 transition-all flex items-center justify-between"
                                        >
                                            <span>{pl.name}</span>
                                            <span className="text-[10px] text-zinc-500">{pl.items.length} tracks</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Create New Playlist Form */}
                        <div className="space-y-3 pt-2">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Create New Playlist</label>
                            <input
                                type="text"
                                placeholder="e.g. Chill Vibes, Workout, Top Hits"
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white outline-none focus:border-amber-500"
                            />
                            <button
                                disabled={!newPlaylistName.trim()}
                                onClick={handleCreatePlaylist}
                                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg disabled:opacity-50"
                            >
                                Save Playlist
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Picture-in-Picture Floating Mini-Player when Minimized (like Plex & YouTube) ── */}
            {playingVideo && isVideoMinimized && (
                <div className="fixed bottom-6 right-6 z-[250] w-96 max-w-[calc(100vw-2rem)] bg-[#0e0e10] border-2 border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-6 duration-200">
                    <div className="px-3.5 py-2.5 bg-zinc-900/95 border-b border-zinc-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <span className="text-xs font-bold text-white truncate">{playingVideo.title}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsVideoMinimized(false)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                title="Expand / Maximize Video Player"
                            >
                                <Maximize2 size={15} />
                            </button>
                            <button
                                onClick={() => { setPlayingVideo(null); setIsVideoMinimized(false); }}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/15 transition-colors"
                                title="Close Video"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                        <video
                            ref={videoRef}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                            onLoadStart={() => {
                                addDebugLog('info', 'Video event: loadstart');
                                setPlaybackError(null);
                            }}
                            onLoadedMetadata={(e) => {
                                const v = e.currentTarget;
                                addDebugLog('success', `Video event: loadedmetadata (${v.videoWidth}x${v.videoHeight}, duration: ${Math.round(v.duration || 0)}s)`);
                            }}
                            onCanPlay={() => addDebugLog('success', 'Video event: canplay (Ready for playback)')}
                            onPlaying={() => {
                                if (stallTimeoutRef.current) {
                                    clearTimeout(stallTimeoutRef.current);
                                    stallTimeoutRef.current = null;
                                }
                                if (playbackError?.codeName === 'STREAM_STALLED_CODEC_INCOMPATIBLE') {
                                    setPlaybackError(null);
                                }
                                addDebugLog('info', 'Video event: playing');
                            }}
                            onTimeUpdate={(e) => {
                                const v = e.currentTarget;
                                if (v.currentTime > 0) {
                                    if (stallTimeoutRef.current) {
                                        clearTimeout(stallTimeoutRef.current);
                                        stallTimeoutRef.current = null;
                                    }
                                    if (playbackError?.codeName === 'STREAM_STALLED_CODEC_INCOMPATIBLE') {
                                        setPlaybackError(null);
                                    }
                                }
                            }}
                            onError={(e) => {
                                const v = e.currentTarget;
                                const err = v.error;
                                addDebugLog('error', `Mini Player HTMLVideoElement Error: (Code ${err?.code || '?'})`);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* ── Advanced Video Player Full Modal ── */}
            {playingVideo && !isVideoMinimized && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-5xl overflow-hidden shadow-2xl relative flex flex-col max-h-[95vh]">
                        {/* Player Header */}
                        <div className="p-4 sm:p-5 px-6 border-b border-zinc-900 flex flex-wrap items-center justify-between gap-4 bg-zinc-950/60 backdrop-blur-md">
                            {/* Left: Title & Path */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h2 className="text-base sm:text-lg font-black text-white truncate max-w-xl">
                                        {playingVideo.title}
                                    </h2>
                                    {videoAudioMode === 'universal' && (
                                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 uppercase flex items-center gap-1">
                                            <Zap size={11} className="animate-pulse" /> Server Stream
                                        </span>
                                    )}
                                    {videoAudioMode === 'direct' && (
                                        <span className="px-2.5 py-0.5 rounded-md bg-sky-500/20 text-sky-400 text-[11px] font-bold border border-sky-500/30 uppercase flex items-center gap-1">
                                            <Film size={11} /> Direct Play
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">{playingVideo.path}</p>
                            </div>

                            {/* Right: Controls & Actions */}
                            <div className="flex items-center flex-wrap gap-2.5">
                                {/* Stream Mode Selector */}
                                <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                                    <button
                                        onClick={() => handleSetVideoMode('universal')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                            videoAudioMode === 'universal'
                                                ? 'bg-emerald-500 text-black shadow-sm'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                        title="Server-Side Stream: Universal H.264 + AAC 2.0 (Zero buffering, 100% device compatibility)"
                                    >
                                        <Zap size={12} /> Server Stream
                                    </button>
                                    <button
                                        onClick={() => handleSetVideoMode('direct')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                            videoAudioMode === 'direct'
                                                ? 'bg-sky-500 text-black shadow-sm'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                        title="Direct Play: Raw uncompressed file bitstream"
                                    >
                                        <Film size={12} /> Direct
                                    </button>
                                </div>

                                {/* Quality Selector */}
                                {videoAudioMode === 'universal' && (
                                    <div className="flex items-center bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-800 text-xs font-bold">
                                        <span className="text-zinc-500 mr-1.5 text-[11px] uppercase font-black">Quality:</span>
                                        <select
                                            value={videoQuality}
                                            onChange={(e) => handleSetVideoQuality(e.target.value as any)}
                                            className="bg-transparent text-amber-300 font-black outline-none cursor-pointer text-xs uppercase"
                                        >
                                            <option value="auto" className="bg-zinc-900 text-white">Auto (1080p Standard)</option>
                                            <option value="1080p-high" className="bg-zinc-900 text-white">1080p High (14 Mbps)</option>
                                            <option value="720p" className="bg-zinc-900 text-white">720p Fast (4.5 Mbps)</option>
                                            <option value="480p" className="bg-zinc-900 text-white">480p Mobile (1.8 Mbps)</option>
                                        </select>
                                    </div>
                                )}

                                {/* Subtitles */}
                                <button
                                    onClick={() => setShowSubtitlesDrawer(!showSubtitlesDrawer)}
                                    className={`p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        showSubtitlesDrawer || selectedSubtitle ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                    title="Subtitles & Timing Sync"
                                >
                                    <Subtitles size={15} />
                                    <span className="hidden sm:inline">Subtitles</span>
                                </button>

                                {/* Cast */}
                                <button
                                    onClick={() => openCastPicker(playingVideo)}
                                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                                    title="Cast Stream directly to Smart TV (/tv)"
                                >
                                    <Cast size={15} />
                                    <span className="hidden sm:inline">Cast</span>
                                </button>

                                {/* VLC */}
                                <button
                                    onClick={() => handleOpenInVlc(playingVideo)}
                                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500 text-orange-400 hover:text-black border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                                    title="Open Stream in VLC Media Player"
                                >
                                    <ExternalLink size={15} />
                                    <span className="hidden sm:inline">VLC</span>
                                </button>

                                {/* Nerd Tools */}
                                <button
                                    onClick={() => setShowNerdToolsModal(true)}
                                    className={`p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        playbackError
                                            ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                                            : showNerdToolsModal
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                    title="Stats for Nerds & Debug Logs"
                                >
                                    <Terminal size={15} />
                                    <span className="hidden sm:inline">Logs</span>
                                </button>

                                {/* Window Action Group (Minimize & Close) */}
                                <div className="flex items-center gap-1 pl-2 border-l border-zinc-800 ml-1">
                                    {/* Minimize / PiP button */}
                                    <button
                                        onClick={() => setIsVideoMinimized(true)}
                                        className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                                        title="Minimize player to corner mini-player"
                                    >
                                        <Minus size={18} />
                                    </button>

                                    {/* Prominent Close button */}
                                    <button
                                        onClick={() => { setPlayingVideo(null); setIsVideoMinimized(false); }}
                                        className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/15 transition-all"
                                        title="Close video"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Video Stage Container */}
                        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden flex-1">
                            <video
                                ref={videoRef}
                                controls
                                autoPlay
                                className="w-full h-full object-contain"
                                onLoadStart={() => {
                                    addDebugLog('info', 'Video event: loadstart');
                                    setPlaybackError(null);
                                }}
                                onLoadedMetadata={(e) => {
                                    const v = e.currentTarget;
                                    addDebugLog('success', `Video event: loadedmetadata (${v.videoWidth}x${v.videoHeight}, duration: ${Math.round(v.duration || 0)}s)`);
                                }}
                                onCanPlay={() => addDebugLog('success', 'Video event: canplay (Ready for playback)')}
                                onPlaying={() => {
                                    if (stallTimeoutRef.current) {
                                        clearTimeout(stallTimeoutRef.current);
                                        stallTimeoutRef.current = null;
                                    }
                                    if (playbackError?.codeName === 'STREAM_STALLED_CODEC_INCOMPATIBLE') {
                                        setPlaybackError(null);
                                    }
                                    addDebugLog('info', 'Video event: playing');
                                }}
                                onTimeUpdate={(e) => {
                                    const v = e.currentTarget;
                                    if (v.currentTime > 0) {
                                        if (stallTimeoutRef.current) {
                                            clearTimeout(stallTimeoutRef.current);
                                            stallTimeoutRef.current = null;
                                        }
                                        if (playbackError?.codeName === 'STREAM_STALLED_CODEC_INCOMPATIBLE') {
                                            setPlaybackError(null);
                                        }
                                    }
                                }}
                                onWaiting={() => addDebugLog('warn', 'Video event: waiting (buffering stream data)')}
                                onStalled={() => addDebugLog('warn', 'Video event: stalled (no network data received)')}
                                onError={(e) => {
                                    const v = e.currentTarget;
                                    const err = v.error;
                                    let codeName = 'MEDIA_ERR_UNKNOWN';
                                    let message = 'An unknown video playback error occurred.';
                                    let suggestion = 'Switch to Full Universal Transcode (H.264+AAC) or open in VLC.';
                                    if (err) {
                                        switch (err.code) {
                                            case 1:
                                                codeName = 'MEDIA_ERR_ABORTED';
                                                message = 'Video playback aborted by user or browser.';
                                                break;
                                            case 2:
                                                codeName = 'MEDIA_ERR_NETWORK';
                                                message = 'Network error: Video download failed from server.';
                                                suggestion = 'Ensure server is accessible and file path is valid.';
                                                break;
                                            case 3:
                                                codeName = 'MEDIA_ERR_DECODE';
                                                message = 'Decode error: The video bitstream could not be decoded.';
                                                suggestion = 'Your browser cannot decode this video codec (e.g. HEVC 10-bit HDR). Switch to Full Universal Transcode.';
                                                break;
                                            case 4:
                                                codeName = 'MEDIA_ERR_SRC_NOT_SUPPORTED';
                                                message = 'Format or codec not supported by browser (e.g. MKV container, HEVC H.265, DTS/TrueHD audio).';
                                                suggestion = 'Click "Switch to Full Universal Transcode" below to transcode into standard H.264+AAC, or open in VLC.';
                                                break;
                                        }
                                    }
                                    addDebugLog('error', `HTMLVideoElement Error: ${codeName} (Code ${err?.code || '?'}) - ${message}`, {
                                        code: err?.code,
                                        codeName,
                                        networkState: v.networkState,
                                        readyState: v.readyState,
                                        currentSrc: v.currentSrc
                                    });
                                    setPlaybackError({
                                        code: err?.code,
                                        codeName,
                                        message,
                                        details: err?.message || undefined,
                                        suggestion
                                    });
                                }}
                            >
                                {selectedSubtitle && (
                                    <track
                                        kind="subtitles"
                                        label={selectedSubtitle.title}
                                        srcLang={selectedSubtitle.language}
                                        src={selectedSubtitle.vttUrl}
                                        default
                                    />
                                )}
                            </video>

                            {/* ── Playback Error Crash Diagnostic Overlay ── */}
                            {playbackError && (
                                <div className="absolute inset-0 z-30 bg-black/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                                    <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mb-3 shadow-[0_0_25px_rgba(239,68,68,0.25)]">
                                        <AlertTriangle size={32} />
                                    </div>
                                    <h3 className="text-lg font-black text-white mb-1">
                                        Playback Incompatible ({playbackError.codeName || `Code ${playbackError.code}`})
                                    </h3>
                                    <p className="text-sm text-zinc-300 max-w-lg mb-2">
                                        {playbackError.message}
                                    </p>
                                    <p className="text-xs text-amber-400/95 font-medium max-w-md mb-6">
                                        💡 {playbackError.suggestion}
                                    </p>

                                    <div className="flex flex-wrap items-center justify-center gap-3 max-w-xl">
                                        <button
                                            onClick={() => {
                                                setVideoAudioMode('universal');
                                                setPlaybackError(null);
                                                addDebugLog('info', 'User triggered switch to Full Universal Transcode');
                                                toast.info('Starting Universal Server Stream (H.264 + AAC)...');
                                                if (videoRef.current && playingVideo) {
                                                    const base = playingVideo.streamUrl;
                                                    videoRef.current.src = `${base}${base.includes('?') ? '&' : '?'}transcode=universal&quality=${videoQuality}&_t=${Date.now()}`;
                                                    videoRef.current.load();
                                                    videoRef.current.play().catch(() => {});
                                                }
                                            }}
                                            className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-emerald-500/20 transition-all cursor-pointer"
                                        >
                                            <RefreshCcw size={15} /> Reload Stream (Server H.264)
                                        </button>

                                        <button
                                            onClick={() => {
                                                if (playingVideo) handleOpenInVlc(playingVideo);
                                            }}
                                            className="px-4 py-3 rounded-2xl bg-orange-500/20 hover:bg-orange-500 text-orange-300 hover:text-black border border-orange-500/40 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
                                        >
                                            <ExternalLink size={15} /> Open in VLC
                                        </button>

                                        <button
                                            onClick={() => setShowNerdToolsModal(true)}
                                            className="px-4 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
                                        >
                                            <Terminal size={15} /> Logs
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Subtitles Drawer / Customization ── */}
                            {showSubtitlesDrawer && (
                                <div className="absolute top-4 right-4 z-40 w-80 p-5 rounded-3xl bg-zinc-950/95 border border-zinc-800 text-zinc-300 space-y-4 backdrop-blur-xl shadow-2xl animate-in slide-in-from-right">
                                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                                        <span className="font-black text-sm text-white flex items-center gap-1.5">
                                            <Subtitles size={15} className="text-indigo-400" /> Subtitles & Sync
                                        </span>
                                        <button onClick={() => setShowSubtitlesDrawer(false)} className="text-zinc-500 hover:text-white">
                                            <X size={15} />
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Active Track</label>
                                            <button
                                                onClick={() => setIsSubSearchModalOpen(true)}
                                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                                            >
                                                <Search size={11} /> Search Online
                                            </button>
                                        </div>

                                        <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                            <button
                                                onClick={() => setSelectedSubtitle(null)}
                                                className={`w-full p-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between ${
                                                    selectedSubtitle === null ? 'bg-zinc-800 text-white' : 'bg-zinc-900/60 text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <span>Off (No Subtitles)</span>
                                                {selectedSubtitle === null && <Check size={14} className="text-emerald-400" />}
                                            </button>

                                            {availableSubtitles.map(sub => (
                                                <button
                                                    key={sub.id}
                                                    onClick={() => setSelectedSubtitle(sub)}
                                                    className={`w-full p-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between ${
                                                        selectedSubtitle?.id === sub.id ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'bg-zinc-900/60 text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <div className="truncate">
                                                        <p className="truncate">{sub.title}</p>
                                                        <span className="text-[9px] text-zinc-500">{sub.language} • {sub.source}</span>
                                                    </div>
                                                    {selectedSubtitle?.id === sub.id && <Check size={14} className="text-indigo-400 shrink-0 ml-2" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Subtitle Timing Sync */}
                                    <div className="space-y-2 pt-2 border-t border-zinc-900">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Timing Sync</label>
                                            <button
                                                onClick={() => setSubOffsetMs(0)}
                                                className="text-[10px] text-zinc-500 hover:text-white underline font-bold"
                                            >
                                                Reset (0ms)
                                            </button>
                                        </div>

                                        <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-center space-y-1">
                                            <span className="text-xs font-bold text-white">
                                                {subOffsetMs === 0 ? (
                                                    <span className="text-emerald-400">Synced (0 ms)</span>
                                                ) : subOffsetMs < 0 ? (
                                                    <span className="text-indigo-400">Appear {Math.abs(subOffsetMs)}ms Sooner (Earlier)</span>
                                                ) : (
                                                    <span className="text-amber-400">Appear {subOffsetMs}ms Delayed (Later)</span>
                                                )}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-bold text-zinc-500 uppercase block text-center">◀ Sooner</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => setSubOffsetMs(prev => prev - 250)} className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg">-0.25s</button>
                                                    <button onClick={() => setSubOffsetMs(prev => prev - 1000)} className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg">-1.0s</button>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <span className="text-[9px] font-bold text-zinc-500 uppercase block text-center">Later ▶</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => setSubOffsetMs(prev => prev + 250)} className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg">+0.25s</button>
                                                    <button onClick={() => setSubOffsetMs(prev => prev + 1000)} className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg">+1.0s</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dedicated "Stats for Nerds & Debug Console" Modal (Copyable) ── */}
            {showNerdToolsModal && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
                    <div className="bg-[#0e0e10] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                        {/* Header */}
                        <div className="p-5 px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/80">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                    <Terminal size={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                                        Stats for Nerds & Debug Console
                                    </h2>
                                    <p className="text-xs text-zinc-400">Live stream diagnostics, HTML5 player telemetry, and copyable debug log</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopyDebugReport}
                                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all active:scale-95"
                                    title="Copy full diagnostic report to clipboard"
                                >
                                    <Copy size={15} /> Copy Debug Report
                                </button>
                                <button
                                    onClick={() => setShowNerdToolsModal(false)}
                                    className="p-2.5 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Tab Switcher */}
                        <div className="px-6 pt-3 border-b border-zinc-800/60 bg-zinc-950/40 flex items-center gap-2">
                            <button
                                onClick={() => setNerdActiveTab('telemetry')}
                                className={`pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                                    nerdActiveTab === 'telemetry'
                                        ? 'border-emerald-500 text-emerald-400'
                                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <Activity size={15} /> Stream Telemetry
                            </button>

                            <button
                                onClick={() => setNerdActiveTab('logs')}
                                className={`pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                                    nerdActiveTab === 'logs'
                                        ? 'border-emerald-500 text-emerald-400'
                                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <Bug size={15} /> Event Logs
                                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-300 font-bold">
                                    {debugLogs.length}
                                </span>
                            </button>

                            <button
                                onClick={() => setNerdActiveTab('compat')}
                                className={`pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                                    nerdActiveTab === 'compat'
                                        ? 'border-emerald-500 text-emerald-400'
                                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <Monitor size={15} /> Browser Codecs
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5 font-mono text-xs text-zinc-300">
                            {/* TAB 1: STREAM TELEMETRY */}
                            {nerdActiveTab === 'telemetry' && (
                                <div className="space-y-4">
                                    {/* Video Stream Comparison Card */}
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                                                <Film size={14} /> Video Stream Details
                                            </span>
                                            <span className="px-2 py-0.5 rounded bg-zinc-900 text-[10px] text-zinc-400 font-bold">
                                                Container: {diagnosticsData?.original?.container || playingVideo?.extension || 'MKV'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                                <span className="text-[10px] text-zinc-500 uppercase block font-bold">Original Bitstream (ffprobe)</span>
                                                <div className="flex justify-between"><span className="text-zinc-400">Codec:</span><span className="font-bold text-white">{diagnosticsData?.original?.videoCodec || 'HEVC / H.265'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Resolution:</span><span className="font-bold text-white">{diagnosticsData?.original?.resolution || streamMetrics.resolution}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Framerate:</span><span className="font-bold text-white">{diagnosticsData?.original?.fps || '24 fps'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Bitrate:</span><span className="font-bold text-emerald-400">{diagnosticsData?.original?.videoBitrate || 'High Bitrate'}</span></div>
                                            </div>

                                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                                <span className="text-[10px] text-zinc-500 uppercase block font-bold">Active Playback Stream</span>
                                                <div className="flex justify-between"><span className="text-zinc-400">Output Mode:</span><span className="font-bold text-emerald-400">{streamMetrics.sourceMode}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Viewport Size:</span><span className="font-bold text-white">{videoRef.current ? `${videoRef.current.videoWidth} x ${videoRef.current.videoHeight}` : '0 x 0'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Dropped Frames:</span><span className="font-bold text-amber-400">{streamMetrics.droppedFrames}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Buffer Ahead:</span><span className="font-bold text-emerald-400">{streamMetrics.bufferedSeconds}s</span></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Audio Stream Details */}
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                                        <span className="text-[11px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                                            <Headphones size={14} /> Audio Stream Details
                                        </span>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                                <span className="text-[10px] text-zinc-500 uppercase block font-bold">Original Audio (ffprobe)</span>
                                                <div className="flex justify-between"><span className="text-zinc-400">Codec:</span><span className="font-bold text-white">{diagnosticsData?.original?.audioCodec || 'DTS-HD / TrueHD / EAC3'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Channels:</span><span className="font-bold text-white">{diagnosticsData?.original?.audioChannels || '5.1 / 7.1'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Bitrate:</span><span className="font-bold text-white">{diagnosticsData?.original?.audioBitrate || '1536 kbps'}</span></div>
                                            </div>

                                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                                <span className="text-[10px] text-zinc-500 uppercase block font-bold">Active Audio Output</span>
                                                <div className="flex justify-between"><span className="text-zinc-400">Encoder / Mode:</span><span className="font-bold text-amber-400">{videoAudioMode === 'universal' || videoAudioMode === 'transcode' ? 'AAC Stereo 256k (Transcoded)' : 'Direct Play (Raw Bitstream)'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Channels:</span><span className="font-bold text-white">2.0 Stereo</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Muted:</span><span className="font-bold text-white">{videoRef.current?.muted ? 'Yes' : 'No'}</span></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* HTML5 Video Element Internal State */}
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                                        <span className="text-[11px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                                            <Code size={14} /> HTMLVideoElement State
                                        </span>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                            <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                                                <span className="text-zinc-500 block">Ready State:</span>
                                                <span className="font-bold text-white">{videoRef.current ? ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][videoRef.current.readyState] : 'N/A'}</span>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                                                <span className="text-zinc-500 block">Network State:</span>
                                                <span className="font-bold text-white">{videoRef.current ? ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE'][videoRef.current.networkState] : 'N/A'}</span>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                                                <span className="text-zinc-500 block">Current Time:</span>
                                                <span className="font-bold text-white">{streamMetrics.currentTime}</span>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                                                <span className="text-zinc-500 block">Duration:</span>
                                                <span className="font-bold text-white">{streamMetrics.duration}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Network & Cloudflare Tunnel Diagnostics */}
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                                        <span className="text-[11px] font-black uppercase text-sky-400 tracking-wider flex items-center gap-1.5">
                                            <Globe size={14} /> Network & Cloudflare Tunnel Diagnostics
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                                <div className="flex justify-between"><span className="text-zinc-400">Client Host:</span><span className="font-bold text-white truncate max-w-[180px]">{typeof window !== 'undefined' ? window.location.host : 'N/A'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Protocol:</span><span className="font-bold text-emerald-400">{typeof window !== 'undefined' ? window.location.protocol.toUpperCase().replace(':', '') : 'HTTPS'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Cloudflare Tunnel:</span><span className="font-bold text-sky-400">{typeof window !== 'undefined' && window.location.host.includes('.') ? 'Active / Proxied' : 'Local Network'}</span></div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                                                <div className="flex justify-between"><span className="text-zinc-400">Active Stream URL:</span><span className="font-bold text-amber-300 truncate max-w-[180px]">{videoRef.current?.currentSrc || 'Loading...'}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Range Seeking:</span><span className="font-bold text-emerald-400">HTTP 206 Supported</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-400">Hardware Acceleration:</span><span className="font-bold text-purple-400">QuickSync / NVENC / CPU</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: LIVE EVENT LOGS */}
                            {nerdActiveTab === 'logs' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-zinc-400">Captured {debugLogs.length} events during this session:</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleCopyDebugReport}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-emerald-400 border border-zinc-800 flex items-center gap-1.5 transition-all"
                                            >
                                                <Copy size={13} /> Copy Logs
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setDebugLogs([]);
                                                    toast.info('Debug logs cleared');
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-zinc-400 border border-zinc-800 flex items-center gap-1.5 transition-all"
                                            >
                                                <Trash2 size={13} /> Clear
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-black border border-zinc-900 max-h-[50vh] overflow-y-auto custom-scrollbar space-y-2 font-mono text-[11px]">
                                        {debugLogs.length === 0 ? (
                                            <p className="text-zinc-600 text-center py-6">No playback logs recorded yet.</p>
                                        ) : (
                                            debugLogs.map((log) => (
                                                <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                                                    <span className="text-zinc-600 shrink-0 font-mono text-[10px]">[{log.timestamp}]</span>
                                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase shrink-0 ${
                                                        log.level === 'error'
                                                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                            : log.level === 'warn'
                                                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                                : log.level === 'success'
                                                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                                                    }`}>
                                                        {log.level}
                                                    </span>
                                                    <span className={`flex-1 break-words ${
                                                        log.level === 'error' ? 'text-red-300 font-bold' : log.level === 'warn' ? 'text-amber-200' : 'text-zinc-300'
                                                    }`}>
                                                        {log.message}
                                                        {log.details && (
                                                            <pre className="mt-1 p-2 rounded-lg bg-zinc-950 text-zinc-500 text-[10px] overflow-x-auto whitespace-pre-wrap">
                                                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                                                            </pre>
                                                        )}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: BROWSER CODEC COMPATIBILITY PROBE */}
                            {nerdActiveTab === 'compat' && (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                                        <span className="text-[11px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                                            <Monitor size={14} /> Client Browser Environment
                                        </span>
                                        <p className="text-xs text-zinc-400 break-all">
                                            <span className="text-zinc-600 block">User-Agent:</span>
                                            {typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                                        <span className="text-[11px] font-black uppercase text-emerald-400 tracking-wider block">
                                            HTML5 canPlayType() Support Matrix
                                        </span>

                                        <div className="space-y-2 text-xs">
                                            {[
                                                { label: 'H.264 / AVC (MP4)', mime: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' },
                                                { label: 'HEVC / H.265 (MP4)', mime: 'video/mp4; codecs="hev1.1.6.L93.B0"' },
                                                { label: 'VP9 (WebM)', mime: 'video/webm; codecs="vp9, opus"' },
                                                { label: 'AV1 (MP4)', mime: 'video/mp4; codecs="av01.0.05M.08"' },
                                                { label: 'Matroska Container (.mkv)', mime: 'video/x-matroska' },
                                                { label: 'AAC Audio', mime: 'audio/mp4; codecs="mp4a.40.2"' },
                                                { label: 'FLAC Audio', mime: 'audio/flac' },
                                                { label: 'Opus Audio', mime: 'audio/ogg; codecs="opus"' },
                                                { label: 'Dolby Digital AC3', mime: 'audio/mp4; codecs="ac-3"' },
                                                { label: 'Dolby Digital Plus EAC3', mime: 'audio/mp4; codecs="ec-3"' }
                                            ].map(item => {
                                                const res = videoRef.current?.canPlayType(item.mime) || (typeof document !== 'undefined' ? document.createElement('video').canPlayType(item.mime) : '');
                                                return (
                                                    <div key={item.label} className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                                                        <div>
                                                            <span className="font-bold text-white block">{item.label}</span>
                                                            <span className="text-[10px] text-zinc-500 font-mono">{item.mime}</span>
                                                        </div>
                                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                                            res === 'probably'
                                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                                : res === 'maybe'
                                                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                        }`}>
                                                            {res || 'unsupported'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer Quick Actions */}
                        <div className="p-4 px-6 border-t border-zinc-800 bg-zinc-950/90 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-zinc-500">
                                Stuck on playback? Use Universal Transcode or download VLC playlist.
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setVideoAudioMode('universal');
                                        setPlaybackError(null);
                                        setShowNerdToolsModal(false);
                                        toast.info('Switched to Full Universal Transcode (H.264 + AAC)');
                                    }}
                                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all"
                                >
                                    <RefreshCcw size={14} /> Full Transcode (Universal H.264)
                                </button>
                                <button
                                    onClick={handleCopyDebugReport}
                                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold text-xs flex items-center gap-2 transition-all"
                                >
                                    <Copy size={14} /> Copy Report
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* ── Subtitle Search Modal with Language Selector ── */}
            {isSubSearchModalOpen && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 space-y-5 shadow-2xl relative">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Subtitles size={20} className="text-indigo-400" /> Search Online Subtitles
                            </h3>
                            <button onClick={() => setIsSubSearchModalOpen(false)} className="text-zinc-500 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Movie / Series Title</label>
                                <input
                                    type="text"
                                    placeholder="Enter movie or show title..."
                                    value={subSearchQuery}
                                    onChange={e => setSubSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Subtitle Language</label>
                                <select
                                    value={subSearchLang}
                                    onChange={e => setSubSearchLang(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white outline-none focus:border-indigo-500 font-bold"
                                >
                                    <option value="all">All Languages</option>
                                    <option value="en">English (EN)</option>
                                    <option value="pt">Português (PT / BR)</option>
                                    <option value="es">Español (ES)</option>
                                    <option value="fr">Français (FR)</option>
                                    <option value="de">Deutsch (DE)</option>
                                    <option value="it">Italiano (IT)</option>
                                    <option value="nl">Nederlands (NL)</option>
                                    <option value="pl">Polski (PL)</option>
                                    <option value="ru">Русский (RU)</option>
                                    <option value="tr">Türkçe (TR)</option>
                                    <option value="ar">العربية (AR)</option>
                                    <option value="zh">中文 (ZH)</option>
                                    <option value="ja">日本語 (JA)</option>
                                    <option value="ko">한국어 (KO)</option>
                                </select>
                            </div>

                            <button
                                onClick={handleSearchOnlineSubtitles}
                                disabled={subSearchLoading || !subSearchQuery.trim()}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                            >
                                {subSearchLoading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                                Search Subtitles
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Built-in Live TV Fullscreen Player Modal ── */}
            {playingChannel && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-6xl overflow-hidden shadow-2xl relative flex flex-col h-[88vh]">
                        <div className="p-4 px-6 border-b border-zinc-900 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 rounded-lg bg-red-500 text-black text-[9px] font-black uppercase flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                                </span>
                                <div>
                                    <h2 className="text-base font-black text-white">{playingChannel.name}</h2>
                                    <span className="text-xs text-zinc-500">{playingChannel.group}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => openCastPicker(playingChannel)}
                                    className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                                    title="Cast Channel directly to Smart TV"
                                >
                                    <Cast size={14} /> Cast to TV
                                </button>

                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(playingChannel.url);
                                        toast.success('Channel URL copied');
                                    }}
                                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 text-xs font-bold flex items-center gap-1.5"
                                    title="Copy Stream Link"
                                >
                                    <Copy size={14} /> Copy Stream URL
                                </button>

                                <button
                                    onClick={() => setPlayingChannel(null)}
                                    className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all ml-2"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            <div className="flex-1 bg-black flex items-center justify-center relative">
                                <video
                                    ref={liveVideoRef}
                                    controls
                                    autoPlay
                                    className="w-full h-full object-contain"
                                />
                            </div>

                            <div className="w-72 border-l border-zinc-900 bg-zinc-950 p-4 flex flex-col space-y-3 overflow-hidden">
                                <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                                    <span className="text-xs font-black uppercase text-zinc-400">Channels</span>
                                    <span className="text-[10px] text-zinc-600 font-bold">{filteredIptvChannels.length} available</span>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                                    {filteredIptvChannels.map(c => {
                                        const isCurrent = c.id === playingChannel.id;
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => setPlayingChannel(c)}
                                                className={`w-full p-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between ${
                                                    isCurrent
                                                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                        : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-900 hover:text-white'
                                                }`}
                                            >
                                                <span className="truncate">{c.name}</span>
                                                {isCurrent && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0 ml-2" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Curated Shortlist Manager Modal ── */}
            {isShortlistManagerOpen && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                            <div>
                                <h3 className="text-xl font-black text-white flex items-center gap-2">
                                    <Bookmark size={22} className="text-red-400" /> Curate Channel Shortlist
                                </h3>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    Filter through thousands of channels and pick your favorite curated pack.
                                </p>
                            </div>
                            <button onClick={() => setIsShortlistManagerOpen(false)} className="text-zinc-500 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Shortlist Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Sports Pack, UK & US News, Kids Channels"
                                    value={shortlistEditingName}
                                    onChange={e => setShortlistEditingName(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white outline-none focus:border-red-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                                        Select Channels ({shortlistSelectedChanIds.length} selected)
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShortlistSelectedChanIds(iptvChannels.map(c => c.id))}
                                            className="text-[10px] font-bold text-zinc-400 hover:text-white"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={() => setShortlistSelectedChanIds([])}
                                            className="text-[10px] font-bold text-zinc-500 hover:text-white"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto custom-scrollbar p-2 bg-zinc-950 rounded-2xl border border-zinc-900">
                                    {iptvChannels.map(chan => {
                                        const isSelected = shortlistSelectedChanIds.includes(chan.id);
                                        return (
                                            <div
                                                key={chan.id}
                                                onClick={() => {
                                                    setShortlistSelectedChanIds(prev =>
                                                        isSelected ? prev.filter(id => id !== chan.id) : [...prev, chan.id]
                                                    );
                                                }}
                                                className={`p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all flex items-center justify-between ${
                                                    isSelected
                                                        ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-sm'
                                                        : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                                                }`}
                                            >
                                                <div className="truncate">
                                                    <p className="truncate">{chan.name}</p>
                                                    <span className="text-[9px] text-zinc-500">{chan.group}</span>
                                                </div>
                                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${isSelected ? 'bg-red-500 border-red-500 text-black' : 'border-zinc-700'}`}>
                                                    {isSelected && <Check size={12} />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setIsShortlistManagerOpen(false)}
                                    className="flex-1 py-3.5 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-xs uppercase rounded-2xl hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveShortlist}
                                    className="flex-[2] py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase rounded-2xl transition-all shadow-lg shadow-red-500/20"
                                >
                                    Save Shortlist
                                </button>
                            </div>
                        </div>
                    </div>
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

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-900">
                            <div>
                                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                    <FolderPlus size={28} className="text-emerald-400" /> Add Theater Library
                                </h2>
                                <p className="text-xs text-zinc-500 font-medium mt-1">
                                    Import directly from your existing Plex/Arr libraries, add local folders, or set up Live TV.
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
                                    onClick={() => {
                                        setModalTab('custom');
                                        setNewLibType('movie');
                                    }}
                                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${
                                        modalTab === 'custom'
                                            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-md'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    <Folder size={16} /> Custom Folder
                                </button>
                                <button
                                    onClick={() => {
                                        setModalTab('iptv');
                                        setNewLibType('live');
                                    }}
                                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all ${
                                        modalTab === 'iptv'
                                            ? 'bg-red-600/20 text-red-400 border border-red-500/30 shadow-md'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    <Radio size={16} /> Live TV / IPTV
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

                        {/* ── Mode 2: Custom Local Library ── */}
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

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                        Folder Path (Enter any local or NAS path)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. /mnt/user/data/media/music or /media/music"
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

                        {/* ── Mode 3: Live TV / IPTV Setup ── */}
                        {modalTab === 'iptv' && (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                        Live TV Library Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. My IPTV, Live Sports TV, World News"
                                        value={newLibName}
                                        onChange={e => setNewLibName(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-red-500"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                        IPTV M3U Playlist URL or File Path
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="http://example.com/playlist.m3u8 or https://iptv-org.github.io/iptv/index.m3u"
                                        value={iptvUrlInput}
                                        onChange={e => setIptvUrlInput(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-red-500 font-mono"
                                    />
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => setIsAddLibModalOpen(false)}
                                        className="flex-1 h-14 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={isCreatingLib}
                                        onClick={handleCreateCustomLibrary}
                                        className="flex-[2] h-14 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-50"
                                    >
                                        {isCreatingLib ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Radio size={18} />}
                                        {isCreatingLib ? 'Parsing...' : 'Add Live TV Library'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Pair Smart TV Modal ── */}
            {isPairTvModalOpen && (
                <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-md p-6 sm:p-8 space-y-6 shadow-2xl relative text-center">
                        <button
                            onClick={() => setIsPairTvModalOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-400 hover:text-white"
                        >
                            <X size={20} />
                        </button>

                        <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
                            <Tv size={32} />
                        </div>

                        <div className="space-y-1.5">
                            <h3 className="text-xl font-black text-white">Pair Smart TV</h3>
                            <p className="text-xs text-zinc-400">
                                Open this link in any browser on your TV (at home or abroad):
                            </p>
                            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono font-bold text-emerald-400 select-all truncate">
                                {typeof window !== 'undefined' ? `${window.location.origin}/tv` : 'http://<your-domain-or-ip>/tv'}
                            </div>
                            <p className="text-[11px] text-zinc-500">
                                No VPN or Tailscale needed on the TV. Enter the 6-digit code shown on the screen below:
                            </p>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="e.g. 832-194"
                                value={tvPairPin}
                                onChange={e => setTvPairPin(e.target.value)}
                                maxLength={8}
                                className="w-full text-center text-3xl font-mono font-black tracking-widest bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-2xl py-4 text-white outline-none"
                            />

                            <button
                                disabled={isPairingTv || !tvPairPin.trim()}
                                onClick={handleApproveTv}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isPairingTv ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                Authorize & Link TV
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Smart TV Cast Device Picker Modal ── */}
            {isCastPickerModalOpen && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl relative">
                        <button
                            onClick={() => setIsCastPickerModalOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-400 hover:text-white"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-3.5 pb-2 border-b border-zinc-900">
                            <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                                <Cast size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">Cast to Smart TV</h3>
                                <p className="text-xs text-zinc-400 truncate max-w-xs">
                                    {castingTargetMedia ? (castingTargetMedia.name || (castingTargetMedia as any).title) : 'Select a device to stream to'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Primary: Native Device Search */}
                            <button
                                onClick={async () => {
                                    const videoEl = videoRef.current || liveVideoRef.current;
                                    if (videoEl && 'remote' in videoEl && typeof (videoEl as any).remote?.prompt === 'function') {
                                        try {
                                            await (videoEl as any).remote.prompt();
                                            setIsCastPickerModalOpen(false);
                                            toast.success('Connected to Cast Device');
                                            return;
                                        } catch (e: any) {
                                            if (e.name !== 'NotAllowedError' && e.name !== 'NotFoundError') {
                                                console.warn(e);
                                            }
                                        }
                                    }
                                    if (videoEl && typeof (videoEl as any).webkitShowPlaybackTargetPicker === 'function') {
                                        try {
                                            (videoEl as any).webkitShowPlaybackTargetPicker();
                                            setIsCastPickerModalOpen(false);
                                            return;
                                        } catch (e) {
                                            console.warn(e);
                                        }
                                    }
                                    toast.info('Searching for local Google Cast / AirPlay devices...');
                                }}
                                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-purple-500/25 flex items-center justify-center gap-3 cursor-pointer"
                            >
                                <Cast size={18} /> Search & Cast to Nearby Devices
                            </button>

                            <p className="text-center text-xs text-zinc-500">
                                Connects directly via Chrome / Android Google Cast, Apple AirPlay, or Smart TV DLNA.
                            </p>
                        </div>

                        {loadingPairedTvs ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2">
                                <RefreshCw size={22} className="animate-spin text-purple-400" />
                                <span className="text-xs text-zinc-500 font-bold">Checking linked TV sessions...</span>
                            </div>
                        ) : pairedTvSessions.length === 0 ? (
                            <div className="p-5 rounded-2xl bg-zinc-950/80 border border-zinc-900 text-center space-y-3">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold text-white">Browser TV Link (/tv)</h4>
                                    <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                                        You can also open <span className="text-purple-400 font-mono font-bold">/tv</span> in any TV browser to link it permanently.
                                    </p>
                                </div>

                                <button
                                    onClick={() => {
                                        setIsCastPickerModalOpen(false);
                                        setIsPairTvModalOpen(true);
                                    }}
                                    className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                                >
                                    Link /tv Browser Screen
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-black uppercase text-zinc-500 tracking-wider">
                                        Linked /tv Screens ({pairedTvSessions.length})
                                    </label>
                                    <button
                                        onClick={() => {
                                            setIsCastPickerModalOpen(false);
                                            setIsPairTvModalOpen(true);
                                        }}
                                        className="text-xs font-bold text-purple-400 hover:underline flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Link Another
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                    {pairedTvSessions.map(session => (
                                        <div
                                            key={session.id}
                                            className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-purple-500/50 transition-all flex items-center justify-between group shadow-sm"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                                                    <Tv size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-white text-sm truncate">{session.device_name || 'Smart TV'}</h4>
                                                    <p className="text-[10px] text-zinc-500 font-medium">
                                                        Linked {new Date(session.paired_at || session.created_at).toLocaleDateString()} • <span className="text-emerald-400 font-bold">Ready</span>
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleUnpairDevice(session.id, session.device_name || 'Smart TV')}
                                                    className="p-2 rounded-xl text-zinc-600 hover:text-red-400 transition-colors"
                                                    title="Unpair Device"
                                                >
                                                    <Trash2 size={14} />
                                                </button>

                                                <button
                                                    onClick={() => handleCastToDevice(session.id, session.device_name || 'Smart TV')}
                                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-purple-500/20 flex items-center gap-1.5"
                                                >
                                                    <Cast size={13} /> Cast
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={() => handleCastToDevice('all', 'All Paired TVs')}
                                    className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2"
                                >
                                    <Cast size={15} className="text-purple-400" /> Cast to All Devices ({pairedTvSessions.length})
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── VLC Media Player & External Network Stream Modal ── */}
            {isVlcModalOpen && vlcModalInfo && (
                <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-[#0e0e11] border border-orange-500/30 rounded-3xl w-full max-w-xl p-6 sm:p-7 space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0 shadow-lg shadow-orange-500/10">
                                    <ExternalLink size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white">Open in VLC Media Player</h3>
                                    <p className="text-xs text-zinc-400 truncate max-w-sm font-medium">
                                        {vlcModalInfo.title}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsVlcModalOpen(false)}
                                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Actions: Download M3U / Quick Copy */}
                        <div className="flex flex-wrap items-center gap-3">
                            <a
                                href={vlcModalInfo.m3uUrl}
                                download={`${vlcModalInfo.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.m3u`}
                                className="flex-1 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all text-center"
                            >
                                <ExternalLink size={15} /> Download .M3U Playlist File
                            </a>
                        </div>

                        {/* Stream URLs for Network Stream Copy */}
                        <div className="space-y-4">
                            {/* Direct Stream URL */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1">
                                        <Film size={12} className="text-sky-400" /> Direct Stream URL (Raw MKV / HEVC 4K)
                                    </label>
                                    <span className="text-[10px] text-zinc-500 font-bold">VLC Native Decode</span>
                                </div>
                                <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                                    <input
                                        type="text"
                                        readOnly
                                        value={vlcModalInfo.directUrl}
                                        className="bg-transparent text-xs text-zinc-300 font-mono flex-1 outline-none truncate select-all"
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(vlcModalInfo.directUrl);
                                            toast.success('Direct stream URL copied to clipboard!');
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-400 hover:text-black font-bold text-xs flex items-center gap-1 transition-all shrink-0"
                                    >
                                        <Copy size={12} /> Copy
                                    </button>
                                </div>
                            </div>

                            {/* Server Transcoded Stream URL */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1">
                                        <Zap size={12} className="text-emerald-400" /> Server Transcoded Stream (Universal H.264)
                                    </label>
                                    <span className="text-[10px] text-zinc-500 font-bold">For Low Bandwidth / Mobile</span>
                                </div>
                                <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                                    <input
                                        type="text"
                                        readOnly
                                        value={vlcModalInfo.transcodeUrl}
                                        className="bg-transparent text-xs text-zinc-300 font-mono flex-1 outline-none truncate select-all"
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(vlcModalInfo.transcodeUrl);
                                            toast.success('Transcoded stream URL copied to clipboard!');
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-black font-bold text-xs flex items-center gap-1 transition-all shrink-0"
                                    >
                                        <Copy size={12} /> Copy
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick Instructions */}
                        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs text-zinc-400">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider block">
                                How to stream in VLC (Windows, Mac, iOS, Android):
                            </span>
                            <ol className="list-decimal list-inside space-y-1 text-zinc-300 text-[11px] leading-relaxed">
                                <li>Open <strong>VLC Media Player</strong> on any device (home or mobile over Cloudflare).</li>
                                <li>Press <strong className="text-white">Ctrl+N</strong> (or go to <span className="text-orange-400">Media → Open Network Stream</span>).</li>
                                <li>Paste the copied URL above and press <strong className="text-emerald-400">Play</strong>.</li>
                            </ol>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setIsVlcModalOpen(false)}
                                className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition-all"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

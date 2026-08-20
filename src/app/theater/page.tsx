'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Film, Tv, Music, Image as ImageIcon, Folder, Plus,
    Play, Pause, Volume2, VolumeX, Maximize, X,
    Search, Trash2, ArrowRight, ChevronRight, ChevronLeft,
    HardDrive, RefreshCw, LayoutGrid, List as Rows,
    FileVideo, FileAudio, FileImage, Sparkles, FolderPlus,
    Calendar, Check, Settings2, FolderTree, ArrowUp, ArrowDown, ArrowUpDown, Cast,
    DownloadCloud, Layers, Database, ShieldCheck, CheckCircle2,
    Tv2, Radio, Sliders, MessageSquare, Activity, ExternalLink,
    Clock, FastForward, Rewind, Subtitles, ListFilter, Bookmark,
    ListPlus, Copy, Download
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import Hls from 'hls.js';

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
    category: 'video' | 'audio' | 'photo';
    extension: string;
    sizeBytes: number;
    modifiedAt: string;
    addedAt?: string;
    posterUrl?: string;
    streamUrl: string;
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
    const [sortBy, setSortBy] = useState<'added' | 'title' | 'date' | 'size'>('added');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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

    // Active Media Players
    const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null);
    const [playingAudio, setPlayingAudio] = useState<MediaItem | null>(null);
    const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);

    // Video Player Advanced Controls
    const [showStatsHud, setShowStatsHud] = useState(false);
    const [showSubtitlesDrawer, setShowSubtitlesDrawer] = useState(false);
    const [isSubSearchModalOpen, setIsSubSearchModalOpen] = useState(false);
    const [subSearchQuery, setSubSearchQuery] = useState('');
    const [subSearchLang, setSubSearchLang] = useState('en');
    const [subSearchLoading, setSubSearchLoading] = useState(false);
    const [availableSubtitles, setAvailableSubtitles] = useState<SubtitleTrack[]>([]);
    const [selectedSubtitle, setSelectedSubtitle] = useState<SubtitleTrack | null>(null);
    const [subOffsetMs, setSubOffsetMs] = useState(0); // in milliseconds (+ = later, - = earlier)
    const [subSize, setSubSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
    const [subColor, setSubColor] = useState<'white' | 'yellow' | 'cyan'>('white');

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
    const audioRef = useRef<HTMLAudioElement>(null);
    const hlsInstanceRef = useRef<Hls | null>(null);

    // Smart TV Pairing & Remote Casting States
    const [isPairTvModalOpen, setIsPairTvModalOpen] = useState(false);
    const [tvPairPin, setTvPairPin] = useState('');
    const [isPairingTv, setIsPairingTv] = useState(false);
    const [pairedTvCount, setPairedTvCount] = useState(0);

    const checkPairedTvs = async () => {
        try {
            const res = await fetch('/api/theater/tv?listSessions=true');
            if (res.ok) {
                const data = await res.json();
                setPairedTvCount(Array.isArray(data.sessions) ? data.sessions.length : 0);
            }
        } catch {}
    };

    useEffect(() => {
        checkPairedTvs();
    }, []);

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

    const handleCastToTv = async (media: MediaItem | IptvChannel) => {
        try {
            const res = await fetch('/api/theater/tv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cast', media })
            });
            if (res.ok) {
                toast.success(`Casting to Smart TV!`);
            } else {
                toast.error('Failed to cast. Open /tv on your Smart TV first.');
            }
        } catch {
            toast.error('Error sending cast command to TV');
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

    // 2. Fetch Items for Selected Library (Files or IPTV)
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
                // Fetch shortlists for this live TV library
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

    // 6. Create Custom Library (Folder or IPTV)
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
            const res = await fetch(`/api/theater/subtitles?videoPath=${encodeURIComponent(video.path)}`);
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
                toast.success(`Found ${list.length} subtitle tracks`);
            }
        } catch {
            toast.error('Failed to search subtitles');
        } finally {
            setSubSearchLoading(false);
        }
    };

    // Video Player & HLS Handler for .ts and live streams
    useEffect(() => {
        if (playingVideo && videoRef.current) {
            const video = videoRef.current;
            const streamUrl = playingVideo.streamUrl;
            const isTsOrHls = playingVideo.extension === 'TS' || streamUrl.includes('.m3u8') || streamUrl.includes('.ts');

            if (isTsOrHls && Hls.isSupported()) {
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

            // Fetch companion subtitles
            handleDiscoverLocalSubtitles(playingVideo);
            setSubSearchQuery(playingVideo.title);
            setSubOffsetMs(0);
        }

        return () => {
            if (hlsInstanceRef.current) {
                hlsInstanceRef.current.destroy();
                hlsInstanceRef.current = null;
            }
        };
    }, [playingVideo]);

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

                const formatTime = (secs: number) => {
                    if (isNaN(secs) || secs === Infinity) return 'LIVE';
                    const m = Math.floor(secs / 60);
                    const s = Math.floor(secs % 60);
                    return `${m}:${s < 10 ? '0' : ''}${s}`;
                };

                // @ts-ignore
                const dropped = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality().droppedVideoFrames : 0;

                setStreamMetrics({
                    resolution: video.videoWidth ? `${video.videoWidth} x ${video.videoHeight}` : 'Loading...',
                    bufferedSeconds: Math.round(bufSec * 10) / 10,
                    currentTime: formatTime(video.currentTime),
                    duration: formatTime(video.duration),
                    droppedFrames: dropped,
                    sourceMode: playingVideo?.posterUrl ? 'Plex Direct Stream' : (playingChannel ? 'HLS Live TV' : 'Direct Play (Local)')
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [playingVideo, playingChannel]);

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
                // Reload shortlists
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
            list = list.filter(i => i.title.toLowerCase().includes(q) || i.folder.toLowerCase().includes(q));
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

    // Filtered IPTV Channels by Shortlist and Group
    const filteredIptvChannels = useMemo(() => {
        let list = [...iptvChannels];

        // 1. Shortlist filter
        if (activeShortlistId !== 'ALL') {
            const activeShort = shortlists.find(s => s.id === activeShortlistId);
            if (activeShort) {
                const set = new Set(activeShort.channelIds);
                list = list.filter(c => set.has(c.id));
            }
        }

        // 2. Group filter
        if (selectedIptvGroup !== 'ALL') {
            list = list.filter(c => c.group === selectedIptvGroup);
        }

        // 3. Search query
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
        if (type === 'live') return <Tv2 size={size} className="text-red-400" />;
        return <Folder size={size} className="text-zinc-400" />;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Stream URL copied to clipboard!');
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
                                Homemade media streaming, live TV playlists, and universal players.
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
                                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30 transition-all shadow-sm"
                            >
                                <Plus size={14} /> Add Library
                            </button>

                            <button
                                onClick={() => setIsPairTvModalOpen(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-xl text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 border border-dashed border-indigo-500/30 transition-all shadow-sm"
                                title="Pair a Smart TV via /tv"
                            >
                                <Tv size={14} /> Pair Smart TV {pairedTvCount > 0 && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        {/* Search Input */}
                        <div className="relative flex-1 lg:w-64">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
                            <input
                                type="text"
                                placeholder={activeLibrary?.type === 'live' ? "Search channels..." : "Search library..."}
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
                                onClick={() => fetchLibraryItems(activeLibrary)}
                                title="Rescan Library"
                                className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            >
                                <RefreshCw size={16} className={loadingItems ? 'animate-spin text-emerald-400' : ''} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Sub-bar for Live TV vs Regular Media ── */}
                {activeLibrary?.type === 'live' ? (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-4 px-2">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Shortlist selector */}
                                <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
                                    <button
                                        onClick={() => setActiveShortlistId('ALL')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30"
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

                        {/* Category / Group selector */}
                        {iptvGroups.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-1 px-2">
                                <button
                                    onClick={() => setSelectedIptvGroup('ALL')}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
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
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
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
                ) : activeLibrary && (
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

                                {/* Dedicated Sort Up/Down Toggle Button */}
                                <button
                                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="p-1.5 px-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-xs font-bold flex items-center gap-1.5"
                                    title={sortOrder === 'asc' ? 'Sorting Ascending (Click to sort Descending)' : 'Sorting Descending (Click to sort Ascending)'}
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
                )}

                {/* ── Content Grid / List ── */}
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
                ) : activeLibrary?.type === 'live' ? (
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
                                            {/* Tall Poster Art in List View */}
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
                                                onClick={(e) => { e.stopPropagation(); handleCastToTv(item); }}
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

            {/* ── Advanced Video Player Modal ── */}
            {playingVideo && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-5xl overflow-hidden shadow-2xl relative flex flex-col">
                        <div className="p-5 px-6 border-b border-zinc-900 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-white truncate max-w-xl">{playingVideo.title}</h2>
                                <p className="text-xs text-zinc-500 font-medium">{playingVideo.path}</p>
                            </div>

                            {/* Top Quick Actions: Subtitles, Stats HUD, VLC Launcher */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowStatsHud(!showStatsHud)}
                                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        showStatsHud ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                    title="Toggle Stream Metrics (Stats for Nerds)"
                                >
                                    <Activity size={16} /> Metrics
                                </button>

                                <button
                                    onClick={() => setShowSubtitlesDrawer(!showSubtitlesDrawer)}
                                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        showSubtitlesDrawer || selectedSubtitle ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                    title="Subtitles & Timing Sync"
                                >
                                    <Subtitles size={16} /> Subtitles
                                </button>

                                {/* Cast to Smart TV */}
                                <button
                                    onClick={() => handleCastToTv(playingVideo)}
                                    className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                                    title="Cast Stream directly to Smart TV (/tv)"
                                >
                                    <Cast size={15} /> Cast to TV
                                </button>

                                {/* Open in VLC / External Player */}
                                <a
                                    href={`vlc://${window.location.origin}${playingVideo.streamUrl}`}
                                    className="p-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500 text-orange-400 hover:text-black border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                                    title="Open Stream directly in VLC"
                                >
                                    <ExternalLink size={15} /> VLC
                                </a>

                                <a
                                    href={`${playingVideo.streamUrl}&m3u=true&title=${encodeURIComponent(playingVideo.title)}`}
                                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 text-xs font-bold"
                                    title="Download .M3U Playlist for VLC / Infuse / PotPlayer"
                                >
                                    <Download size={15} />
                                </a>

                                <button
                                    onClick={() => setPlayingVideo(null)}
                                    className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all ml-2"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                            <video
                                ref={videoRef}
                                controls
                                autoPlay
                                className="w-full h-full object-contain"
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

                            {/* ── Stats for Nerds (Stream Metrics HUD) ── */}
                            {showStatsHud && (
                                <div className="absolute top-4 left-4 z-40 p-4 rounded-2xl bg-black/85 border border-zinc-800 text-zinc-300 font-mono text-xs space-y-2 backdrop-blur-md shadow-2xl animate-in fade-in">
                                    <div className="flex items-center justify-between gap-6 border-b border-zinc-800 pb-1.5">
                                        <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                                            <Activity size={13} /> Stream Diagnostics
                                        </span>
                                        <button onClick={() => setShowStatsHud(false)} className="text-zinc-500 hover:text-white">
                                            <X size={13} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                        <span className="text-zinc-500">Resolution:</span>
                                        <span className="font-bold text-white text-right">{streamMetrics.resolution}</span>

                                        <span className="text-zinc-500">Source Mode:</span>
                                        <span className="font-bold text-white text-right">{streamMetrics.sourceMode}</span>

                                        <span className="text-zinc-500">Buffer Health:</span>
                                        <span className="font-bold text-emerald-400 text-right">{streamMetrics.bufferedSeconds}s ahead</span>

                                        <span className="text-zinc-500">Time / Length:</span>
                                        <span className="text-white text-right">{streamMetrics.currentTime} / {streamMetrics.duration}</span>

                                        <span className="text-zinc-500">Dropped Frames:</span>
                                        <span className="text-amber-400 text-right">{streamMetrics.droppedFrames}</span>

                                        <span className="text-zinc-500">Sub Sync:</span>
                                        <span className="text-white text-right font-bold">
                                            {subOffsetMs === 0 ? 'Synced (0ms)' : subOffsetMs < 0 ? `${Math.abs(subOffsetMs)}ms Sooner` : `${subOffsetMs}ms Delayed`}
                                        </span>
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

                                    {/* Active Subtitle Track */}
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

                                    {/* Subtitle Size Selector */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Font Size</label>
                                        <div className="grid grid-cols-4 gap-1 bg-zinc-900 p-1 rounded-xl">
                                            {(['sm', 'md', 'lg', 'xl'] as const).map(sz => (
                                                <button
                                                    key={sz}
                                                    onClick={() => setSubSize(sz)}
                                                    className={`py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                                                        subSize === sz ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                                                    }`}
                                                >
                                                    {sz}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── Subtitle Timing Offset (Unambiguous Earlier vs Later) ── */}
                                    <div className="space-y-2 pt-2 border-t border-zinc-900">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Subtitle Timing Sync</label>
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
                                            <p className="text-[9px] text-zinc-500">
                                                {subOffsetMs < 0 ? 'Subtitles will show BEFORE audio' : subOffsetMs > 0 ? 'Subtitles will show AFTER audio' : 'Subtitles play at default timeline'}
                                            </p>
                                        </div>

                                        {/* Adjustment Buttons */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-bold text-zinc-500 uppercase block text-center">◀ Sooner / Earlier</span>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => setSubOffsetMs(prev => prev - 250)}
                                                        className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg"
                                                    >
                                                        -0.25s
                                                    </button>
                                                    <button
                                                        onClick={() => setSubOffsetMs(prev => prev - 1000)}
                                                        className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg"
                                                    >
                                                        -1.0s
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <span className="text-[9px] font-bold text-zinc-500 uppercase block text-center">Delayed / Later ▶</span>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => setSubOffsetMs(prev => prev + 250)}
                                                        className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg"
                                                    >
                                                        +0.25s
                                                    </button>
                                                    <button
                                                        onClick={() => setSubOffsetMs(prev => prev + 1000)}
                                                        className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold rounded-lg"
                                                    >
                                                        +1.0s
                                                    </button>
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
                                <a
                                    href={`vlc://${playingChannel.url}`}
                                    className="p-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500 text-orange-400 hover:text-black border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                                    title="Open in VLC"
                                >
                                    <ExternalLink size={14} /> Open in VLC
                                </a>

                                <button
                                    onClick={() => copyToClipboard(playingChannel.url)}
                                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 text-xs font-bold"
                                    title="Copy Stream Link"
                                >
                                    <Copy size={14} />
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
                            {/* Live Video Canvas */}
                            <div className="flex-1 bg-black flex items-center justify-center relative">
                                <video
                                    ref={liveVideoRef}
                                    controls
                                    autoPlay
                                    className="w-full h-full object-contain"
                                />
                            </div>

                            {/* Side Channel Drawer for Instant Switching */}
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

            {/* ── Subtitle Search Modal ── */}
            {isSubSearchModalOpen && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-lg p-6 space-y-4 shadow-2xl relative">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Subtitles size={18} className="text-indigo-400" /> Search Online Subtitles
                            </h3>
                            <button onClick={() => setIsSubSearchModalOpen(false)} className="text-zinc-500 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter movie / show title"
                                    value={subSearchQuery}
                                    onChange={e => setSubSearchQuery(e.target.value)}
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white outline-none focus:border-indigo-500"
                                />
                                <button
                                    onClick={handleSearchOnlineSubtitles}
                                    disabled={subSearchLoading}
                                    className="px-5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl transition-all flex items-center gap-1.5"
                                >
                                    {subSearchLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Search
                                </button>
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

                        {/* Top Modal Header & Tabs */}
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
                                        {/* Plex Libraries Section */}
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

                                        {/* Radarr & Sonarr Root Folders Section */}
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

                                    {/* Media Type Selection */}
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

                                {/* Common Mount Point Shortcuts */}
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

                                {/* Folder Path Input */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                        Folder Path (Enter any local or NAS path)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. /mnt/user/data/media/movies or /media/tv"
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

                                    {/* Active Selected Folders */}
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

                                {/* Interactive Directory Browser */}
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
                                    <p className="text-[11px] text-zinc-500">
                                        Supports M3U and M3U8 playlists with thousands of live channels, automatic group categorizing, and custom shortlist curation.
                                    </p>
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
        </>
    );
}

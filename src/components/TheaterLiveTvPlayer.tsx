'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
    Tv, Play, Cast, Volume2, VolumeX, Maximize,
    Search, Plus, Calendar, Clock, Sparkles,
    Radio, Settings, Check, ChevronDown, ChevronRight,
    Circle, Layers, MoreVertical, X, AlertCircle,
    HardDrive, Folder, Laptop, CheckSquare, Square
} from 'lucide-react';
import Hls from 'hls.js';
import { toast } from 'sonner';

export interface IptvChannel {
    id: string;
    name: string;
    cleanName?: string;
    logo?: string;
    group: string;
    tvgId?: string;
    url: string;
    libraryId?: string;
    libraryName?: string;
    streams?: Array<{ url: string; quality: string; label: string }>;
}

export interface IptvShortlist {
    id: string;
    name: string;
    channelIds: string[];
}

interface EpgProgram {
    id: string;
    channel_tvg_id: string;
    title: string;
    description?: string;
    start_time: string;
    end_time: string;
}

interface DvrStorageFolder {
    id: string;
    path: string;
    name: string;
    is_default: boolean;
}

interface DestinationOption {
    id: string;
    name: string;
    path: string;
    type: 'device' | 'dvr' | 'library';
    badge: string;
}

interface TheaterLiveTvPlayerProps {
    libraryId: string;
    channels: IptvChannel[];
    shortlists: IptvShortlist[];
    activeShortlistId: string | null;
    onSelectShortlist: (id: string | null) => void;
    onOpenShortlistManager: () => void;
}

export default function TheaterLiveTvPlayer({
    libraryId,
    channels,
    shortlists,
    activeShortlistId,
    onSelectShortlist,
    onOpenShortlistManager
}: TheaterLiveTvPlayerProps) {
    // Active Playing Channel & Stream Index
    const [currentChannel, setCurrentChannel] = useState<IptvChannel | null>(null);
    const [activeStreamIdx, setActiveStreamIdx] = useState(0);

    // Provider / Library Filter
    const [selectedProviderId, setSelectedProviderId] = useState<string>('ALL');

    // Zapper search & category
    const [zapperSearch, setZapperSearch] = useState('');
    const [zapperGroup, setZapperGroup] = useState('ALL');

    // EPG Guide Map: tvgId -> Program[]
    const [epgMap, setEpgMap] = useState<Record<string, EpgProgram[]>>({});
    const [expandedEpgChannelId, setExpandedEpgChannelId] = useState<string | null>(null);

    // DVR Storage & Multi-Destination Selection
    const [dvrFolders, setDvrFolders] = useState<DvrStorageFolder[]>([]);
    const [destinations, setDestinations] = useState<DestinationOption[]>([]);
    const [selectedDestIds, setSelectedDestIds] = useState<string[]>([]);
    const [recordingModalData, setRecordingModalData] = useState<{
        channel: IptvChannel;
        program: EpgProgram;
        isLive: boolean;
    } | null>(null);
    const [recordingPadding, setRecordingPadding] = useState(15);
    const [isScheduling, setIsScheduling] = useState(false);

    // Player state
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [streamQuality, setStreamQuality] = useState('');
    const playerContainerRef = useRef<HTMLDivElement>(null);

    // Right-click context menu
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        channel: IptvChannel;
        program?: EpgProgram;
    } | null>(null);

    // Available Providers / Libraries
    const availableProviders = useMemo(() => {
        const map = new Map<string, { id: string; name: string; count: number }>();
        for (const c of channels) {
            if (c.libraryId && c.libraryName) {
                if (!map.has(c.libraryId)) {
                    map.set(c.libraryId, { id: c.libraryId, name: c.libraryName, count: 0 });
                }
                map.get(c.libraryId)!.count++;
            }
        }
        return Array.from(map.values());
    }, [channels]);

    // Filter channels by provider, shortlist, category, and search
    const visibleChannels = useMemo(() => {
        let list = channels;

        // 0. Provider library filter
        if (selectedProviderId !== 'ALL') {
            list = list.filter(c => c.libraryId === selectedProviderId);
        }

        // 1. Shortlist filter
        if (activeShortlistId) {
            const sl = shortlists.find(s => s.id === activeShortlistId);
            if (sl && sl.channelIds.length > 0) {
                const set = new Set(sl.channelIds);
                list = list.filter(c => set.has(c.id));
            }
        }

        // 2. Category filter
        if (zapperGroup !== 'ALL') {
            list = list.filter(c => c.group === zapperGroup);
        }

        // 3. Search query
        if (zapperSearch.trim()) {
            const q = zapperSearch.toLowerCase().trim();
            list = list.filter(c =>
                c.name.toLowerCase().includes(q) ||
                (c.cleanName && c.cleanName.toLowerCase().includes(q)) ||
                c.group.toLowerCase().includes(q)
            );
        }

        return list;
    }, [channels, selectedProviderId, activeShortlistId, shortlists, zapperGroup, zapperSearch]);

    // Unique groups for filter pills
    const channelGroups = useMemo(() => {
        const set = new Set<string>();
        const sourceList = selectedProviderId !== 'ALL' ? channels.filter(c => c.libraryId === selectedProviderId) : channels;
        for (const c of sourceList) if (c.group) set.add(c.group);
        return Array.from(set).slice(0, 15);
    }, [channels, selectedProviderId]);

    // Auto-select first channel on load if none playing
    useEffect(() => {
        if (!currentChannel && visibleChannels.length > 0) {
            setCurrentChannel(visibleChannels[0]);
            setActiveStreamIdx(0);
        }
    }, [visibleChannels, currentChannel]);

    // Fetch batch EPG for visible channels (first 50)
    useEffect(() => {
        if (!libraryId || visibleChannels.length === 0) return;
        const tvgIds = visibleChannels
            .slice(0, 60)
            .map(c => c.tvgId)
            .filter(Boolean) as string[];

        if (tvgIds.length === 0) return;

        fetch(`/api/theater/iptv/epg?libraryId=${libraryId}&tvgIds=${encodeURIComponent(tvgIds.join(','))}`)
            .then(r => r.ok ? r.json() : { epg: {} })
            .then(data => {
                if (data.epg) {
                    setEpgMap(prev => ({ ...prev, ...data.epg }));
                }
            })
            .catch(() => {});
    }, [libraryId, visibleChannels]);

    // Guide and OSD Overlay States
    const [isFullGuideOpen, setIsFullGuideOpen] = useState(false);
    const [osdGuideOpen, setOsdGuideOpen] = useState(false);
    const [guideTimeOffsetHours, setGuideTimeOffsetHours] = useState(0);
    const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handlePlayerMouseMove = () => {
        setOsdGuideOpen(true);
        if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
        osdTimerRef.current = setTimeout(() => {
            setOsdGuideOpen(false);
        }, 4500);
    };

    // Fetch DVR & Server Library Destinations on mount
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
                const [dvrRes, libRes] = await Promise.all([
                    fetch('/api/theater/iptv/dvr').then(r => r.ok ? r.json() : { folders: [] }),
                    fetch('/api/theater/libraries').then(r => r.ok ? r.json() : [])
                ]);

                const flds = dvrRes.folders || [];
                setDvrFolders(flds);

                for (const f of flds) {
                    list.push({
                        id: `dvr-${f.id}`,
                        name: f.name || 'DVR Storage',
                        path: f.path,
                        type: 'dvr',
                        badge: f.is_default ? '★ Default NAS DVR' : 'NAS Storage'
                    });
                }

                const allLibs = Array.isArray(libRes) ? libRes : (libRes.libraries || []);
                for (const lib of allLibs) {
                    let folders: string[] = [];
                    try {
                        folders = typeof lib.folders === 'string' ? JSON.parse(lib.folders) : (lib.folders || []);
                    } catch {}
                    folders.forEach((f, fi) => {
                        if (!list.some(d => d.path === f)) {
                            list.push({
                                id: `lib-${lib.id}-${fi}`,
                                name: `${lib.name} Library`,
                                path: f,
                                type: 'library',
                                badge: 'Server Library'
                            });
                        }
                    });
                }
            } catch {}

            setDestinations(list);
            const def = list.find(d => d.badge.includes('Default')) || list.find(d => d.type === 'dvr') || list[0];
            if (def) {
                setSelectedDestIds([def.id]);
            }
        };

        fetchDestinations();
    }, []);

    const toggleDestination = (id: string) => {
        setSelectedDestIds(prev =>
            prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]
        );
    };

    // Video Player Stream Handler (Transmuxer + Fallback)
    useEffect(() => {
        if (!currentChannel || !videoRef.current) return;
        const video = videoRef.current;
        const streams = (currentChannel.streams && currentChannel.streams.length > 0)
            ? currentChannel.streams
            : [{ url: currentChannel.url, quality: 'SD', label: 'Default' }];

        const activeStream = streams[activeStreamIdx] || streams[0];
        const rawUrl = activeStream?.url || '';
        if (!rawUrl) return;

        setStreamQuality(activeStream.quality || 'LIVE');

        const proxiedUrl = `/api/theater/iptv/stream?url=${encodeURIComponent(rawUrl)}`;

        const handleFallback = () => {
            if (streams.length > activeStreamIdx + 1) {
                const nextIdx = activeStreamIdx + 1;
                toast.error(`Stream issue. Switching to backup: ${streams[nextIdx].quality || 'Backup'}...`);
                setActiveStreamIdx(nextIdx);
            }
        };

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        if (rawUrl.toLowerCase().includes('.m3u8') && Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hls.loadSource(proxiedUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) handleFallback();
            });
            hlsRef.current = hls;
        } else {
            video.src = proxiedUrl;
            video.onerror = () => handleFallback();
            video.play().catch(() => {});
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            video.pause();
            video.removeAttribute('src');
            video.load();
        };
    }, [currentChannel, activeStreamIdx]);

    // Current Airing Program & Upcoming for Playing Channel
    const currentChannelPrograms = useMemo(() => {
        if (!currentChannel) return [];
        const tvgId = currentChannel.tvgId || '';
        return epgMap[tvgId] || epgMap[tvgId.toLowerCase()] || epgMap[currentChannel.name] || epgMap[currentChannel.cleanName || ''] || [];
    }, [currentChannel, epgMap]);

    const { currentProgram, upcomingProgram, progressPercent } = useMemo(() => {
        const now = new Date();
        const cur = currentChannelPrograms.find(p =>
            new Date(p.start_time) <= now && new Date(p.end_time) >= now
        );
        const up = currentChannelPrograms.find(p => new Date(p.start_time) > now);

        let pct = 0;
        if (cur) {
            const st = new Date(cur.start_time).getTime();
            const et = new Date(cur.end_time).getTime();
            pct = Math.min(100, Math.max(0, Math.round(((now.getTime() - st) / (et - st)) * 100)));
        }

        return { currentProgram: cur, upcomingProgram: up, progressPercent: pct };
    }, [currentChannelPrograms]);

    // Fullscreen toggle
    const toggleFullscreen = () => {
        if (!playerContainerRef.current) return;
        if (!document.fullscreenElement) {
            playerContainerRef.current.requestFullscreen().catch(() => {});
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
        }
    };

    // Right-click handler
    const handleContextMenu = (e: React.MouseEvent, channel: IptvChannel, program?: EpgProgram) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            channel,
            program
        });
    };

    // Close context menu on global click
    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    // Open DVR recording modal
    const openRecordModal = (channel: IptvChannel, program?: EpgProgram) => {
        const prog = program || currentProgram || {
            id: 'live_broadcast',
            channel_tvg_id: channel.tvgId || '',
            title: `${channel.name} Broadcast`,
            description: `Live recording from ${channel.name}`,
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        };

        const isLive = new Date(prog.start_time) <= new Date();

        if (selectedDestIds.length === 0 && destinations.length > 0) {
            setSelectedDestIds([destinations[0].id]);
        }

        setRecordingModalData({
            channel,
            program: prog,
            isLive
        });
    };

    // Confirm & submit DVR recording
    const handleConfirmRecording = async () => {
        if (!recordingModalData || selectedDestIds.length === 0) {
            toast.error('Please select at least one storage destination');
            return;
        }
        setIsScheduling(true);
        try {
            const action = recordingModalData.isLive ? 'record_now' : 'schedule_recording';
            const streams = recordingModalData.channel.streams;
            const streamUrl = streams?.[0]?.url || recordingModalData.channel.url;

            const chosenDestinations = destinations.filter(d => selectedDestIds.includes(d.id));

            // 1. Check if "device" (Direct Local Download) is selected
            const isDeviceSelected = chosenDestinations.some(d => d.type === 'device');
            if (isDeviceSelected) {
                const cleanTitle = (recordingModalData.program.title || recordingModalData.channel.name).replace(/[/\\?%*:|"<>]/g, '').trim();
                const downloadUrl = `/api/theater/iptv/stream?url=${encodeURIComponent(streamUrl)}&download=true&filename=${encodeURIComponent(`${cleanTitle}.ts`)}`;
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `${cleanTitle}.ts`;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success(`Download started for "${cleanTitle}" to this device`);
            }

            // 2. For each NAS / Server storage destination, schedule recording
            const serverDestinations = chosenDestinations.filter(d => d.type !== 'device');
            for (const dest of serverDestinations) {
                const res = await fetch('/api/theater/iptv/dvr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action,
                        channelId: recordingModalData.channel.id,
                        channelName: recordingModalData.channel.name,
                        channelLogo: recordingModalData.channel.logo,
                        streamUrl,
                        programTitle: recordingModalData.program.title,
                        programDescription: recordingModalData.program.description,
                        startTime: recordingModalData.program.start_time,
                        endTime: recordingModalData.program.end_time,
                        destinationFolder: dest.path,
                        paddingMinutes: recordingPadding
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to schedule');
            }

            if (serverDestinations.length > 0) {
                if (recordingModalData.isLive) {
                    toast.success(`Recording live broadcast to ${serverDestinations.length} destination(s)`);
                } else {
                    toast.success(`Scheduled recording to ${serverDestinations.length} destination(s)`);
                }
            }
            setRecordingModalData(null);
        } catch (err: any) {
            toast.error(err.message || 'Failed to start recording');
        } finally {
            setIsScheduling(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* ── Top Bar: Shortlist Picker + Full Guide Button + Setup Link ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 p-3 rounded-2xl border border-zinc-900">
                {/* Shortlist selector pills */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
                    <button
                        onClick={() => onSelectShortlist(null)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all ${
                            !activeShortlistId
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                        }`}
                    >
                        All Channels ({channels.length})
                    </button>

                    {shortlists.map(sl => (
                        <button
                            key={sl.id}
                            onClick={() => onSelectShortlist(sl.id)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 ${
                                activeShortlistId === sl.id
                                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                            }`}
                        >
                            <span>⭐</span> {sl.name} ({sl.channelIds.length})
                        </button>
                    ))}

                    <Link
                        href="/discover?tab=iptv"
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-400 hover:bg-amber-500/10 border border-dashed border-amber-500/30 flex items-center gap-1 shrink-0 cursor-pointer"
                        title="Manage Shortlists in Media Hub"
                    >
                        <Plus size={12} /> Shortlists
                    </Link>
                </div>

                {/* Right Top Actions: Full TV Guide Button & Setup */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => setIsFullGuideOpen(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-wider flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
                        title="Open Full Program Schedule Guide"
                    >
                        <Calendar size={14} />
                        <span>TV Guide</span>
                    </button>

                    <Link
                        href="/discover?tab=iptv"
                        className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 border border-zinc-800 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                        title="Setup Providers, Shortlists & DVR in Media Tab"
                    >
                        <Settings size={13} />
                        <span>Setup</span>
                    </Link>
                </div>
            </div>

            {/* ── Main Stage Split Screen: Player (Left) + Zapping Menu (Right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-230px)] min-h-[580px]">
                {/* ── LEFT: TV Screen Playing (8 Cols) ── */}
                <div
                    ref={playerContainerRef}
                    onMouseMove={handlePlayerMouseMove}
                    className="lg:col-span-8 bg-black rounded-3xl border border-zinc-800/90 overflow-hidden flex flex-col shadow-2xl relative group"
                >
                    {/* Video Screen Container */}
                    <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted={isMuted}
                            className="w-full h-full object-contain"
                        />

                        {/* Top OSD Bar: Quality, Multi-Stream Switcher, Guide Toggle, Fullscreen */}
                        <div className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-200 pointer-events-auto ${osdGuideOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-lg bg-red-500 text-black text-[10px] font-black uppercase flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" /> LIVE
                                </span>
                                {streamQuality && (
                                    <span className="px-2 py-0.5 rounded-lg bg-zinc-900/90 border border-zinc-700 text-amber-300 text-[10px] font-mono font-black uppercase">
                                        {streamQuality}
                                    </span>
                                )}
                            </div>

                            {/* Stream Quality Fallback Switcher (if channel has multiple sources) */}
                            {currentChannel?.streams && currentChannel.streams.length > 1 && (
                                <div className="flex items-center gap-1 bg-black/70 p-1 rounded-xl border border-zinc-800 backdrop-blur-md">
                                    {currentChannel.streams.map((st, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setActiveStreamIdx(idx)}
                                            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black transition-all ${
                                                activeStreamIdx === idx
                                                    ? 'bg-amber-500 text-black shadow'
                                                    : 'text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            {st.quality || `Src ${idx + 1}`}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setOsdGuideOpen(!osdGuideOpen)}
                                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                                        osdGuideOpen
                                            ? 'bg-amber-500 text-black shadow'
                                            : 'bg-black/60 text-zinc-300 hover:text-white hover:bg-zinc-800'
                                    }`}
                                    title="Toggle Channel Program Schedule Overlay"
                                >
                                    <Calendar size={14} />
                                    <span className="hidden sm:inline">Guide</span>
                                </button>
                                <button
                                    onClick={() => setIsMuted(!isMuted)}
                                    className="p-2 rounded-xl bg-black/60 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                                >
                                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                                <button
                                    onClick={toggleFullscreen}
                                    className="p-2 rounded-xl bg-black/60 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                                >
                                    <Maximize size={16} />
                                </button>
                            </div>
                        </div>

                        {/* On-Screen Channel Schedule Overlay (OSD) */}
                        {osdGuideOpen && currentChannelPrograms.length > 0 && (
                            <div className="absolute right-4 top-16 bottom-4 w-72 bg-black/85 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-4 flex flex-col space-y-3 z-30 animate-in fade-in slide-in-from-right duration-200 pointer-events-auto overflow-hidden">
                                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-black text-white truncate">{currentChannel?.name}</h4>
                                        <p className="text-[10px] text-amber-400 font-bold uppercase">Program Schedule</p>
                                    </div>
                                    <button onClick={() => setOsdGuideOpen(false)} className="text-zinc-500 hover:text-white">
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                    {currentChannelPrograms.slice(0, 10).map((prog, idx) => {
                                        const now = new Date();
                                        const isLive = new Date(prog.start_time) <= now && new Date(prog.end_time) >= now;
                                        return (
                                            <div
                                                key={prog.id || idx}
                                                className={`p-2.5 rounded-xl border text-xs transition-all ${
                                                    isLive
                                                        ? 'bg-amber-500/15 border-amber-500/40 text-white'
                                                        : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                                                    <span>{new Date(prog.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(prog.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    {isLive && <span className="text-red-400 font-bold uppercase text-[9px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> LIVE</span>}
                                                </div>
                                                <p className="font-bold truncate">{prog.title}</p>
                                                {prog.description && <p className="text-[10px] text-zinc-500 line-clamp-2 mt-0.5">{prog.description}</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom OSD Bar: Channel Info & Currently Airing Program Timeline */}
                    <div className="p-4 sm:p-5 bg-gradient-to-t from-zinc-950 via-[#0c0c0e] to-[#0c0c0e]/95 border-t border-zinc-800/80 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-lg">
                                    {currentChannel?.logo ? (
                                        <img
                                            src={currentChannel.logo}
                                            alt=""
                                            className="max-h-full max-w-full object-contain"
                                            onError={e => (e.currentTarget.style.display = 'none')}
                                        />
                                    ) : (
                                        <Tv size={22} className="text-zinc-600" />
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-black text-white truncate">
                                            {currentChannel?.name || 'Select a Channel'}
                                        </h3>
                                        <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 text-[10px] font-bold uppercase shrink-0">
                                            {currentChannel?.group || 'General'}
                                        </span>
                                    </div>

                                    {/* Airing Program */}
                                    <p className="text-xs text-amber-300 font-bold truncate mt-0.5 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                                        {currentProgram ? currentProgram.title : 'Live Broadcasting'}
                                        {currentProgram && (
                                            <span className="text-[10px] text-zinc-500 font-normal">
                                                ({new Date(currentProgram.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(currentProgram.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>

                            {/* DVR Record Button */}
                            {currentChannel && (
                                <button
                                    onClick={() => openRecordModal(currentChannel, currentProgram)}
                                    className="px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-black transition-all shadow-lg shadow-red-500/10 flex items-center gap-1.5 shrink-0 cursor-pointer"
                                    title="Record currently playing broadcast to configured storage folder"
                                >
                                    <Circle size={10} className="fill-current animate-pulse" />
                                    <span>Record</span>
                                </button>
                            )}
                        </div>

                        {/* Live EPG Progress Bar */}
                        {currentProgram && (
                            <div className="space-y-1 pt-1">
                                <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-amber-400 h-full rounded-full transition-all duration-1000"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                                {upcomingProgram && (
                                    <p className="text-[11px] text-zinc-500 truncate">
                                        <span className="text-zinc-400 font-bold">Up Next:</span> {upcomingProgram.title} ({new Date(upcomingProgram.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Zapping Menu & Live EPG Guide (4 Cols) ── */}
                <div className="lg:col-span-4 bg-[#0a0a0c] rounded-3xl border border-zinc-800 flex flex-col overflow-hidden shadow-2xl">
                    {/* Zapper Header: Search + Category Filter */}
                    <div className="p-4 border-b border-zinc-900 space-y-3 bg-zinc-950/80">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                                Zapping Guide
                            </span>
                            <span className="text-[10px] font-bold text-zinc-600">
                                {visibleChannels.length} Channels
                            </span>
                        </div>

                        <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Search channel or show..."
                                value={zapperSearch}
                                onChange={e => setZapperSearch(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500 transition-colors"
                            />
                            {zapperSearch && (
                                <button
                                    onClick={() => setZapperSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Provider / Library Filter Pills */}
                        {availableProviders.length > 1 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider shrink-0 mr-0.5">Provider:</span>
                                <button
                                    onClick={() => setSelectedProviderId('ALL')}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all cursor-pointer ${
                                        selectedProviderId === 'ALL'
                                            ? 'bg-amber-500 text-black shadow-sm'
                                            : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    All ({channels.length})
                                </button>
                                {availableProviders.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setSelectedProviderId(p.id)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all cursor-pointer ${
                                            selectedProviderId === p.id
                                                ? 'bg-amber-500 text-black shadow-sm'
                                                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        {p.name} ({p.count})
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Category Filter Pills */}
                        {channelGroups.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                <button
                                    onClick={() => setZapperGroup('ALL')}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-colors ${
                                        zapperGroup === 'ALL'
                                            ? 'bg-zinc-800 text-white'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    All
                                </button>
                                {channelGroups.map(g => (
                                    <button
                                        key={g}
                                        onClick={() => setZapperGroup(g)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-colors ${
                                            zapperGroup === g
                                                ? 'bg-zinc-800 text-white'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Channels Scrolling List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-zinc-900/60">
                        {visibleChannels.length === 0 ? (
                            <div className="p-10 text-center text-zinc-600 text-xs">
                                No channels found matching filters.
                            </div>
                        ) : (
                            visibleChannels.map(chan => {
                                const isCurrent = currentChannel?.id === chan.id;
                                const tvgKey = chan.tvgId || '';
                                const chanEpg = (tvgKey && (epgMap[tvgKey] || epgMap[tvgKey.toLowerCase()])) || epgMap[chan.name] || epgMap[chan.cleanName || ''] || [];
                                const now = new Date();
                                const prog = chanEpg.find(p => new Date(p.start_time) <= now && new Date(p.end_time) >= now);
                                const isExpanded = expandedEpgChannelId === chan.id;

                                return (
                                    <div
                                        key={chan.id}
                                        onContextMenu={(e) => handleContextMenu(e, chan, prog)}
                                        className={`transition-all ${
                                            isCurrent
                                                ? 'bg-amber-500/10 border-l-4 border-amber-500'
                                                : 'hover:bg-zinc-900/40'
                                        }`}
                                    >
                                        <div
                                            onClick={() => {
                                                setCurrentChannel(chan);
                                                setActiveStreamIdx(0);
                                            }}
                                            className="p-3 flex items-center justify-between gap-3 cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                {/* Logo */}
                                                <div className="w-10 h-10 rounded-xl bg-zinc-900/90 border border-zinc-800/80 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                                                    {chan.logo ? (
                                                        <img
                                                            src={chan.logo}
                                                            alt=""
                                                            className="max-h-full max-w-full object-contain"
                                                            onError={e => (e.currentTarget.style.display = 'none')}
                                                        />
                                                    ) : (
                                                        <Tv size={18} className="text-zinc-600 group-hover:text-amber-400" />
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-black truncate ${
                                                            isCurrent ? 'text-amber-300' : 'text-zinc-200 group-hover:text-white'
                                                        }`}>
                                                            {chan.cleanName || chan.name}
                                                        </span>
                                                        {chan.streams?.[0]?.quality && (
                                                            <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-zinc-900 text-zinc-400">
                                                                {chan.streams[0].quality}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Airing show */}
                                                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                                        {prog ? (
                                                            <span className="text-amber-400/90 font-medium">● {prog.title}</span>
                                                        ) : (
                                                            <span className="text-zinc-600">{chan.group}</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Action icons */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openRecordModal(chan, prog);
                                                    }}
                                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                    title="Record this channel"
                                                >
                                                    <Circle size={13} className="hover:fill-current" />
                                                </button>

                                                {chanEpg.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedEpgChannelId(isExpanded ? null : chan.id);
                                                        }}
                                                        className={`p-1.5 rounded-lg transition-colors ${
                                                            isExpanded ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-500 hover:text-white'
                                                        }`}
                                                        title="Toggle upcoming guide schedule"
                                                    >
                                                        <Calendar size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded EPG Schedule Timeline */}
                                        {isExpanded && chanEpg.length > 0 && (
                                            <div className="px-4 pb-3 pt-1 bg-black/40 border-t border-zinc-900 space-y-1.5 animate-in fade-in">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block mb-1">
                                                    Upcoming Schedule
                                                </span>
                                                {chanEpg.slice(0, 5).map(ep => (
                                                    <div key={ep.id} className="flex items-center justify-between text-[11px] py-1 border-b border-zinc-900/40">
                                                        <div className="truncate flex-1 mr-2">
                                                            <span className="text-zinc-500 font-mono text-[10px] mr-1.5">
                                                                {new Date(ep.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <span className="text-zinc-300 font-bold">{ep.title}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => openRecordModal(chan, ep)}
                                                            className="text-[10px] font-black text-red-400 hover:text-white px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500 transition-colors shrink-0"
                                                        >
                                                            Record
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ── Context Menu (Right Click on Channel) ── */}
            {contextMenu && (
                <div
                    style={{ top: contextMenu.y, left: Math.min(contextMenu.x, window.innerWidth - 220) }}
                    className="fixed z-[9999] bg-[#0e0e12] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 w-52 text-xs font-bold text-zinc-200 animate-in fade-in duration-100"
                >
                    <div className="px-3 py-1.5 border-b border-zinc-800 text-[10px] text-zinc-500 uppercase font-black truncate">
                        {contextMenu.channel.name}
                    </div>
                    <button
                        onClick={() => {
                            setCurrentChannel(contextMenu.channel);
                            setActiveStreamIdx(0);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                    >
                        <Play size={13} className="text-amber-400" /> Zap to Channel
                    </button>
                    <button
                        onClick={() => {
                            openRecordModal(contextMenu.channel, contextMenu.program);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-500/20 hover:text-red-300 text-red-400 flex items-center gap-2"
                    >
                        <Circle size={12} className="fill-current" /> Record Program
                    </button>
                    <button
                        onClick={() => {
                            setExpandedEpgChannelId(contextMenu.channel.id);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                    >
                        <Calendar size={13} className="text-sky-400" /> View EPG Guide
                    </button>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(contextMenu.channel.url);
                            toast.success('Stream link copied');
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                    >
                        <Radio size={13} className="text-zinc-500" /> Copy Stream URL
                    </button>
                </div>
            )}

            {/* ── Schedule DVR Recording Modal ── */}
            {recordingModalData && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-[#0e0e12] border border-red-500/30 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl relative text-zinc-100">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                                    <Circle size={20} className="fill-current animate-pulse" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white">
                                        {recordingModalData.isLive ? 'Record Live Broadcast' : 'Schedule DVR Recording'}
                                    </h3>
                                    <p className="text-xs text-zinc-400 truncate max-w-[240px]">
                                        {recordingModalData.channel.name}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setRecordingModalData(null)} className="text-zinc-500 hover:text-white p-1">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Program Card */}
                        <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-1">
                            <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Program</span>
                            <h4 className="text-sm font-black text-white">{recordingModalData.program.title}</h4>
                            <p className="text-[11px] text-zinc-500">
                                {new Date(recordingModalData.program.start_time).toLocaleString()} &rarr; {new Date(recordingModalData.program.end_time).toLocaleTimeString()}
                            </p>
                        </div>

                        {/* Storage Destinations Multi-Selection List */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-zinc-300 block">
                                    Storage Destination(s):
                                </label>
                                <span className="text-[11px] text-zinc-500">
                                    {selectedDestIds.length} selected
                                </span>
                            </div>

                            <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                {destinations.map(d => {
                                    const isSelected = selectedDestIds.includes(d.id);
                                    return (
                                        <div
                                            key={d.id}
                                            onClick={() => toggleDestination(d.id)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected
                                                    ? 'bg-red-500/15 border-red-500/50 text-white shadow-sm'
                                                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                                    isSelected ? 'bg-red-500 text-white' : 'bg-zinc-900 text-zinc-500'
                                                }`}>
                                                    {d.type === 'device' ? <Laptop size={15} /> : d.type === 'dvr' ? <HardDrive size={15} /> : <Folder size={15} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black truncate">{d.name}</span>
                                                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                                                            d.type === 'device' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-zinc-900 text-zinc-400'
                                                        }`}>
                                                            {d.badge}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-zinc-500 truncate font-mono mt-0.5">{d.path}</p>
                                                </div>
                                            </div>

                                            <div className="shrink-0">
                                                {isSelected ? (
                                                    <CheckSquare size={18} className="text-red-400" />
                                                ) : (
                                                    <Square size={18} className="text-zinc-600" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Overtime Padding */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-400 block">
                                Post-Broadcast Overtime Padding:
                            </label>
                            <select
                                value={recordingPadding}
                                onChange={e => setRecordingPadding(parseInt(e.target.value))}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold outline-none focus:border-red-500"
                            >
                                <option value={0}>0 min (Exact End Time)</option>
                                <option value={15}>+15 min (Standard)</option>
                                <option value={30}>+30 min (Sports Overtime)</option>
                                <option value={60}>+60 min (Extended Overtime)</option>
                            </select>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setRecordingModalData(null)}
                                className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmRecording}
                                disabled={isScheduling}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-red-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                <Circle size={12} className="fill-current" />
                                {isScheduling ? 'Saving...' : recordingModalData.isLive ? 'Start Recording Now' : 'Schedule Recording'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Full Interactive TV Guide Schedule Modal ── */}
            {isFullGuideOpen && (
                <div className="fixed inset-0 z-[9999] flex flex-col p-3 sm:p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0e] border border-zinc-800 rounded-3xl w-full h-full flex flex-col overflow-hidden shadow-2xl">
                        {/* Guide Header */}
                        <div className="p-4 sm:p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-950/80">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-white">Full TV Schedule Guide</h3>
                                    <p className="text-xs text-zinc-400">Browse schedules forwards and backwards in time</p>
                                </div>
                            </div>

                            {/* Timeline Controls */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setGuideTimeOffsetHours(prev => prev - 2)}
                                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition-all"
                                >
                                    ◀ -2 Hours
                                </button>
                                <button
                                    onClick={() => setGuideTimeOffsetHours(0)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                        guideTimeOffsetHours === 0
                                            ? 'bg-amber-500 text-black shadow'
                                            : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Now
                                </button>
                                <button
                                    onClick={() => setGuideTimeOffsetHours(prev => prev + 2)}
                                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition-all"
                                >
                                    +2 Hours ▶
                                </button>

                                <button
                                    onClick={() => setIsFullGuideOpen(false)}
                                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 ml-2"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Guide Content Grid */}
                        <div className="flex-1 overflow-auto custom-scrollbar divide-y divide-zinc-900">
                            {visibleChannels.map(chan => {
                                const isCurrent = currentChannel?.id === chan.id;
                                const tvgKey = chan.tvgId || '';
                                const chanEpg = (tvgKey && (epgMap[tvgKey] || epgMap[tvgKey.toLowerCase()])) || epgMap[chan.name] || epgMap[chan.cleanName || ''] || [];

                                const baseDate = new Date(Date.now() + guideTimeOffsetHours * 60 * 60 * 1000);
                                const windowStart = new Date(baseDate.getTime() - 1 * 60 * 60 * 1000);
                                const windowEnd = new Date(baseDate.getTime() + 6 * 60 * 60 * 1000);

                                const windowPrograms = chanEpg.filter(p =>
                                    new Date(p.end_time) >= windowStart && new Date(p.start_time) <= windowEnd
                                );

                                return (
                                    <div key={chan.id} className="flex items-stretch hover:bg-zinc-900/30 transition-colors group">
                                        {/* Channel Info Left Column */}
                                        <div
                                            onClick={() => {
                                                setCurrentChannel(chan);
                                                setActiveStreamIdx(0);
                                                setIsFullGuideOpen(false);
                                            }}
                                            className="w-56 sm:w-64 p-3 border-r border-zinc-900 flex items-center gap-3 shrink-0 bg-zinc-950/60 cursor-pointer group-hover:bg-zinc-900/60 transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                                                {chan.logo ? (
                                                    <img src={chan.logo} alt="" className="max-h-full max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                                ) : (
                                                    <Tv size={18} className="text-zinc-600" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-white truncate group-hover:text-amber-400 transition-colors">
                                                    {chan.cleanName || chan.name}
                                                </p>
                                                <span className="text-[10px] text-zinc-500 font-bold uppercase">{chan.group}</span>
                                            </div>
                                        </div>

                                        {/* Programs Timeline for this Channel */}
                                        <div className="flex-1 flex items-center gap-2 p-2 overflow-x-auto custom-scrollbar">
                                            {windowPrograms.length === 0 ? (
                                                <div className="p-3 text-xs text-zinc-600 italic">
                                                    No schedule data available for this time window.
                                                </div>
                                            ) : (
                                                windowPrograms.map((prog, idx) => {
                                                    const now = new Date();
                                                    const isLive = new Date(prog.start_time) <= now && new Date(prog.end_time) >= now;
                                                    return (
                                                        <div
                                                            key={prog.id || idx}
                                                            onClick={() => {
                                                                if (isLive) {
                                                                    setCurrentChannel(chan);
                                                                    setActiveStreamIdx(0);
                                                                    setIsFullGuideOpen(false);
                                                                } else {
                                                                    openRecordModal(chan, prog);
                                                                }
                                                            }}
                                                            className={`min-w-[200px] max-w-[280px] p-3 rounded-2xl border text-xs flex flex-col justify-between transition-all cursor-pointer ${
                                                                isLive
                                                                    ? 'bg-amber-500/20 border-amber-500/50 text-white shadow-lg'
                                                                    : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800'
                                                            }`}
                                                        >
                                                            <div className="space-y-1">
                                                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                                                    <span>{new Date(prog.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(prog.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    {isLive && <span className="text-red-400 font-bold uppercase text-[9px]">LIVE NOW</span>}
                                                                </div>
                                                                <h5 className="font-black text-white line-clamp-1">{prog.title}</h5>
                                                                {prog.description && <p className="text-[10px] text-zinc-500 line-clamp-2">{prog.description}</p>}
                                                            </div>
                                                            <div className="pt-2 mt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-400">
                                                                <span>{isLive ? '▶ Click to Watch' : '⏺ Click to Record'}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

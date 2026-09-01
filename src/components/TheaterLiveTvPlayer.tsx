'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
    Tv, Play, Cast, Volume2, VolumeX, Maximize,
    Search, Plus, Calendar, Clock, Sparkles,
    Radio, Settings, Check, ChevronDown, ChevronRight,
    Circle, Layers, MoreVertical, X, AlertCircle
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

    // Zapper search & category
    const [zapperSearch, setZapperSearch] = useState('');
    const [zapperGroup, setZapperGroup] = useState('ALL');

    // EPG Guide Map: tvgId -> Program[]
    const [epgMap, setEpgMap] = useState<Record<string, EpgProgram[]>>({});
    const [expandedEpgChannelId, setExpandedEpgChannelId] = useState<string | null>(null);

    // DVR Recording Modal
    const [dvrFolders, setDvrFolders] = useState<DvrStorageFolder[]>([]);
    const [recordingModalData, setRecordingModalData] = useState<{
        channel: IptvChannel;
        program: EpgProgram;
        isLive: boolean;
    } | null>(null);
    const [selectedFolder, setSelectedFolder] = useState('');
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

    // Filter channels by shortlist, category, and search
    const visibleChannels = useMemo(() => {
        let list = channels;

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
    }, [channels, activeShortlistId, shortlists, zapperGroup, zapperSearch]);

    // Unique groups for filter pills
    const channelGroups = useMemo(() => {
        const set = new Set<string>();
        for (const c of channels) if (c.group) set.add(c.group);
        return Array.from(set).slice(0, 15);
    }, [channels]);

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

    // Fetch DVR storage folders on mount
    useEffect(() => {
        fetch('/api/theater/iptv/dvr')
            .then(r => r.ok ? r.json() : { folders: [] })
            .then(data => {
                const flds = data.folders || [];
                setDvrFolders(flds);
                const def = flds.find((f: any) => f.is_default) || flds[0];
                if (def) setSelectedFolder(def.path);
            })
            .catch(() => {});
    }, []);

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
        if (!currentChannel?.tvgId) return [];
        return epgMap[currentChannel.tvgId] || [];
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
        if (dvrFolders.length === 0) {
            toast.error('No DVR folders configured! Go to Media > Live TV & DVR to add a destination folder.');
            return;
        }

        const prog = program || currentProgram || {
            id: 'live_broadcast',
            channel_tvg_id: channel.tvgId || '',
            title: `${channel.name} Broadcast`,
            description: `Live recording from ${channel.name}`,
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        };

        const isLive = new Date(prog.start_time) <= new Date();

        setRecordingModalData({
            channel,
            program: prog,
            isLive
        });
    };

    // Confirm & submit DVR recording
    const handleConfirmRecording = async () => {
        if (!recordingModalData || !selectedFolder) return;
        setIsScheduling(true);
        try {
            const action = recordingModalData.isLive ? 'record_now' : 'schedule_recording';
            const streams = recordingModalData.channel.streams;
            const streamUrl = streams?.[0]?.url || recordingModalData.channel.url;

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
                    destinationFolder: selectedFolder,
                    paddingMinutes: recordingPadding
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            if (recordingModalData.isLive) {
                toast.success(`Recording started: "${recordingModalData.program.title}"`);
            } else {
                toast.success(`Scheduled recording for: "${recordingModalData.program.title}"`);
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
            {/* ── Top Bar: Shortlist Picker + Quick Search + Setup Link ── */}
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

                    <button
                        onClick={onOpenShortlistManager}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-400 hover:bg-amber-500/10 border border-dashed border-amber-500/30 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                        <Plus size={12} /> Curate Shortlist
                    </button>
                </div>

                {/* Configuration Hub Link */}
                <Link
                    href="/discover?tab=iptv"
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 border border-zinc-800 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                    title="Open IPTV & DVR Manager in Media Tab"
                >
                    <Settings size={13} />
                    <span>IPTV &amp; DVR Setup</span>
                </Link>
            </div>

            {/* ── Main Stage Split Screen: Player (Left) + Zapping Menu (Right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-230px)] min-h-[580px]">
                {/* ── LEFT: TV Screen Playing (8 Cols) ── */}
                <div
                    ref={playerContainerRef}
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

                        {/* Top OSD Bar: Quality, Multi-Stream Switcher, Fullscreen */}
                        <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-auto">
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
                    </div>

                    {/* Bottom OSD Bar: Channel Info & Currently Airing Program Timeline */}
                    <div className="p-4 sm:p-5 bg-gradient-to-t from-zinc-950 via-[#0c0c0e] to-[#0c0c0e]/95 border-t border-zinc-800/80 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-lg">
                                    {currentChannel?.logo ? (
                                        <img
                                            src={`/api/theater/iptv/logo?url=${encodeURIComponent(currentChannel.logo)}`}
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
                                const chanEpg = epgMap[chan.tvgId || ''] || [];
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
                                                            src={`/api/theater/iptv/logo?url=${encodeURIComponent(chan.logo)}`}
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
                                                            <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-zinc-900 text-zinc-400">
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

                        {/* Destination Storage Folder Picker */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-400 block">
                                Destination Recording Folder:
                            </label>
                            <select
                                value={selectedFolder}
                                onChange={e => setSelectedFolder(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold outline-none focus:border-red-500"
                            >
                                {dvrFolders.map(f => (
                                    <option key={f.id} value={f.path}>
                                        {f.name} ({f.path}) {f.is_default ? '★ Default' : ''}
                                    </option>
                                ))}
                            </select>
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
        </div>
    );
}

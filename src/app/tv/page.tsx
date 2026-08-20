'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Tv, Film, Music, Radio, Image as ImageIcon, Play,
    Pause, Volume2, ArrowLeft, RefreshCw, CheckCircle2,
    Cast, ShieldCheck, Sparkles, X, ChevronRight, ChevronLeft
} from 'lucide-react';
import Hls from 'hls.js';

interface TheaterLibrary {
    id: string;
    name: string;
    type: 'movie' | 'show' | 'music' | 'photo' | 'live' | 'other';
    folders: string[];
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
    posterUrl?: string;
    streamUrl: string;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function TvLeanbackPage() {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pinCode, setPinCode] = useState<string>('--- ---');
    const [isPaired, setIsPaired] = useState<boolean>(false);
    const [libraries, setLibraries] = useState<TheaterLibrary[]>([]);
    const [activeLibIndex, setActiveLibIndex] = useState<number>(0);
    const [items, setItems] = useState<MediaItem[]>([]);
    const [focusedItemIndex, setFocusedItemIndex] = useState<number>(0);
    const [focusedSection, setFocusedSection] = useState<'nav' | 'grid'>('grid');
    const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    // 1. Session Setup & PIN Generation for Smart TV
    useEffect(() => {
        const savedSessionId = localStorage.getItem('schedulearr_tv_session');

        const initTvSession = async () => {
            if (savedSessionId) {
                try {
                    const res = await fetch(`/api/theater/tv?sessionId=${savedSessionId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.session && data.session.is_paired) {
                            setSessionId(savedSessionId);
                            setIsPaired(true);
                            return;
                        }
                    }
                } catch {}
            }

            // Generate new pairing code
            try {
                const res = await fetch('/api/theater/tv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create_code', deviceName: 'Living Room TV' })
                });
                if (res.ok) {
                    const data = await res.json();
                    setSessionId(data.sessionId);
                    setPinCode(data.code);
                    localStorage.setItem('schedulearr_tv_session', data.sessionId);
                }
            } catch (e) {
                console.error('Failed to create TV pairing session:', e);
            }
        };

        initTvSession();
    }, []);

    // 2. Poll for Pairing Approval & Cast Commands
    useEffect(() => {
        if (!sessionId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/theater/tv?sessionId=${sessionId}`);
                if (res.ok) {
                    const data = await res.json();
                    const session = data.session;
                    if (session) {
                        if (!isPaired && session.is_paired) {
                            setIsPaired(true);
                        }

                        // Check for remote Cast command from phone/PC
                        if (session.current_media && (!playingItem || playingItem.id !== session.current_media.id)) {
                            setPlayingItem(session.current_media);
                        }
                    }
                }
            } catch {}
        }, 2500);

        return () => clearInterval(interval);
    }, [sessionId, isPaired, playingItem]);

    // 3. Load Libraries & Media once Paired
    useEffect(() => {
        if (!isPaired) return;

        const fetchLibs = async () => {
            try {
                const res = await fetch('/api/theater/libraries');
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data.libraries) ? data.libraries : [];
                    setLibraries(list);
                    if (list.length > 0) {
                        fetchItemsForLib(list[0].id);
                    }
                }
            } catch {}
        };

        fetchLibs();
    }, [isPaired]);

    const fetchItemsForLib = async (libId: string) => {
        try {
            const res = await fetch(`/api/theater/items?libraryId=${libId}`);
            if (res.ok) {
                const data = await res.json();
                setItems(Array.isArray(data.items) ? data.items : []);
                setFocusedItemIndex(0);
            }
        } catch {}
    };

    // 4. Remote Control / D-Pad Key Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (playingItem) {
                if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') {
                    setPlayingItem(null);
                } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'MediaPlayPause') {
                    if (videoRef.current) {
                        if (videoRef.current.paused) videoRef.current.play();
                        else videoRef.current.pause();
                    }
                } else if (e.key === 'ArrowRight') {
                    if (videoRef.current) videoRef.current.currentTime += 10;
                } else if (e.key === 'ArrowLeft') {
                    if (videoRef.current) videoRef.current.currentTime -= 10;
                }
                return;
            }

            if (!isPaired || libraries.length === 0) return;

            if (e.key === 'ArrowUp') {
                if (focusedSection === 'grid') {
                    if (focusedItemIndex < 4) {
                        setFocusedSection('nav');
                    } else {
                        setFocusedItemIndex(prev => Math.max(0, prev - 4));
                    }
                }
            } else if (e.key === 'ArrowDown') {
                if (focusedSection === 'nav') {
                    setFocusedSection('grid');
                } else {
                    setFocusedItemIndex(prev => Math.min(items.length - 1, prev + 4));
                }
            } else if (e.key === 'ArrowLeft') {
                if (focusedSection === 'nav') {
                    const nextIdx = Math.max(0, activeLibIndex - 1);
                    setActiveLibIndex(nextIdx);
                    fetchItemsForLib(libraries[nextIdx].id);
                } else {
                    setFocusedItemIndex(prev => Math.max(0, prev - 1));
                }
            } else if (e.key === 'ArrowRight') {
                if (focusedSection === 'nav') {
                    const nextIdx = Math.min(libraries.length - 1, activeLibIndex + 1);
                    setActiveLibIndex(nextIdx);
                    fetchItemsForLib(libraries[nextIdx].id);
                } else {
                    setFocusedItemIndex(prev => Math.min(items.length - 1, prev + 1));
                }
            } else if (e.key === 'Enter') {
                if (focusedSection === 'grid' && items[focusedItemIndex]) {
                    setPlayingItem(items[focusedItemIndex]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playingItem, isPaired, focusedSection, focusedItemIndex, activeLibIndex, libraries, items]);

    // 5. Video Playback & HLS Loader for TV
    useEffect(() => {
        if (playingItem && videoRef.current) {
            const video = videoRef.current;
            const streamUrl = playingItem.streamUrl;
            const isHls = playingItem.extension === 'TS' || streamUrl.includes('.m3u8') || streamUrl.includes('.ts');

            if (isHls && Hls.isSupported()) {
                if (hlsRef.current) hlsRef.current.destroy();
                const hls = new Hls({ enableWorker: true });
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(() => {});
                });
                hlsRef.current = hls;
            } else {
                video.src = streamUrl;
                video.play().catch(() => {});
            }
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [playingItem]);

    // Unpair session
    const handleUnpair = () => {
        localStorage.removeItem('schedulearr_tv_session');
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-[#050507] text-white select-none font-sans overflow-hidden flex flex-col justify-between">
            {/* ── Unpaired Screen: 6-Digit PIN Display ── */}
            {!isPaired ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-10 animate-in fade-in duration-500">
                    <div className="flex items-center gap-4 text-emerald-400">
                        <Tv size={56} />
                        <span className="text-4xl font-black tracking-wider uppercase">Schedulearr TV</span>
                    </div>

                    <div className="space-y-4 max-w-xl">
                        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                            Pair this Smart TV
                        </h1>
                        <p className="text-xl text-zinc-400 font-medium">
                            Open Schedulearr on your phone or laptop and enter the code below to link your TV.
                        </p>
                    </div>

                    {/* Glowing PIN Code Box */}
                    <div className="p-8 px-16 rounded-[3rem] bg-zinc-950 border-2 border-emerald-500/50 shadow-[0_0_80px_rgba(16,185,129,0.2)] flex flex-col items-center space-y-4 animate-pulse">
                        <span className="text-sm font-black uppercase text-emerald-400 tracking-widest">
                            Pairing Code
                        </span>
                        <div className="text-6xl sm:text-7xl font-mono font-black text-white tracking-widest">
                            {pinCode}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-zinc-500 font-bold bg-zinc-900/60 p-4 px-8 rounded-full border border-zinc-800">
                        <RefreshCw size={16} className="animate-spin text-emerald-400" />
                        <span>Waiting for approval from your phone or PC...</span>
                    </div>
                </div>
            ) : playingItem ? (
                /* ── TV Fullscreen Video Player ── */
                <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
                    <video
                        ref={videoRef}
                        controls
                        autoPlay
                        className="w-full h-full object-contain"
                    />
                    <div className="absolute top-6 left-6 z-50 bg-black/70 backdrop-blur-md p-4 px-6 rounded-2xl border border-white/10 flex items-center gap-4">
                        <button
                            onClick={() => setPlayingItem(null)}
                            className="text-white hover:text-emerald-400 font-bold flex items-center gap-2 text-sm"
                        >
                            <ArrowLeft size={18} /> Back to Browse
                        </button>
                        <span className="text-zinc-600">|</span>
                        <span className="font-bold text-white text-base">{playingItem.title}</span>
                    </div>
                </div>
            ) : (
                /* ── 10-Foot Leanback Remote Navigation Interface ── */
                <div className="flex-1 p-8 sm:p-12 space-y-8 flex flex-col">
                    {/* Top TV Bar & Library Selector */}
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3 text-emerald-400">
                                <Tv size={36} />
                                <span className="text-2xl font-black uppercase tracking-wider">Theater</span>
                            </div>

                            {/* Library Pills (Nav Section) */}
                            <div className="flex items-center gap-3 bg-zinc-950 p-2 rounded-3xl border border-zinc-800">
                                {libraries.map((lib, idx) => {
                                    const isSelected = idx === activeLibIndex;
                                    const isFocused = focusedSection === 'nav' && isSelected;
                                    return (
                                        <button
                                            key={lib.id}
                                            onClick={() => {
                                                setActiveLibIndex(idx);
                                                fetchItemsForLib(lib.id);
                                            }}
                                            className={`px-6 py-3 rounded-2xl text-base font-black transition-all flex items-center gap-2.5 ${
                                                isFocused
                                                    ? 'bg-emerald-500 text-black ring-4 ring-emerald-400 scale-105 shadow-xl'
                                                    : isSelected
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                        : 'text-zinc-500 hover:text-white'
                                            }`}
                                        >
                                            {lib.type === 'movie' ? <Film size={18} /> : lib.type === 'show' ? <Tv size={18} /> : lib.type === 'live' ? <Radio size={18} /> : <Music size={18} />}
                                            <span>{lib.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider bg-zinc-900 p-2.5 px-4 rounded-xl border border-zinc-800">
                                Use TV Remote Arrow Keys & Enter
                            </span>
                            <button
                                onClick={handleUnpair}
                                className="text-xs text-zinc-600 hover:text-red-400 font-bold"
                            >
                                Unpair TV
                            </button>
                        </div>
                    </div>

                    {/* Media Grid */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-36 text-center space-y-3">
                                <Film size={56} className="text-zinc-700" />
                                <h3 className="text-2xl font-bold text-zinc-400">No media items in this library</h3>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 p-2">
                                {items.map((item, idx) => {
                                    const isFocused = focusedSection === 'grid' && idx === focusedItemIndex;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setPlayingItem(item)}
                                            className={`group relative rounded-3xl overflow-hidden bg-zinc-950 border-2 transition-all duration-200 cursor-pointer flex flex-col ${
                                                isFocused
                                                    ? 'border-emerald-400 ring-4 ring-emerald-500/80 scale-105 shadow-[0_0_50px_rgba(16,185,129,0.3)] z-20'
                                                    : 'border-zinc-900 hover:border-zinc-700'
                                            }`}
                                        >
                                            <div className="relative aspect-video bg-zinc-900 overflow-hidden flex items-center justify-center">
                                                {item.posterUrl ? (
                                                    <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <Film size={48} className="text-zinc-700" />
                                                )}

                                                <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${isFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                    <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-2xl">
                                                        <Play size={28} className="ml-1" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-5 space-y-1">
                                                <h3 className="text-lg font-bold text-white truncate leading-snug">
                                                    {item.title}
                                                </h3>
                                                <p className="text-xs text-zinc-500 font-semibold truncate">
                                                    {item.folder} • {formatBytes(item.sizeBytes)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

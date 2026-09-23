'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Play, Pause, Volume2, VolumeX, Maximize, Maximize2, Minimize2, X,
    Shuffle, Repeat, SkipForward, SkipBack,
    Disc, Music, ListMusic, Download, ArrowDownToLine,
    Info, Mic2, Edit3, Search, Sparkles, Check,
    RefreshCw, ChevronDown, ChevronUp, ArrowLeft, Sliders, Cast, Tv, Trash2, Plus,
    Image as ImageIcon, Guitar, Activity, Zap, Layers, Music2,
    Terminal, AlertTriangle, RotateCcw, Copy, User, ExternalLink, Calendar, Radio,
    Star, ListPlus, Heart, Youtube, Wrench, Settings,
    Globe, HardDrive, Server, CheckCircle2, AlertCircle, Folder, FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeSongMetadata } from '@/lib/songSanitizer';
import {
    DifficultyLevel,
    InstrumentType,
    ChordEvent,
    transposeChord,
    simplifyChordForDifficulty,
    getChordDiagram,
    computeChromagramFromFrequencies,
    matchChordFromChromagram,
    detectPitchFromAudioBuffer
} from '@/lib/chordAnalyzer';
import { MusicDownloadModal } from '@/components/MusicDownloadModal';

export interface MediaItem {
    id: string;
    name: string;
    title: string;
    path: string;
    folder: string;
    artist?: string;
    album?: string;
    albumId?: string | number;
    releaseYear?: string;
    genre?: string;
    uploader?: string;
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
    isLocal?: boolean;
    instanceId?: string;
    instanceName?: string;
    libraryId?: string;
    libraryName?: string;
}

interface LyricsData {
    trackKey?: string;
    artist?: string;
    title?: string;
    syncedLyrics: string | null;
    plainLyrics: string | null;
    lines: Array<{ time: number; text: string }>;
    isSynced: boolean;
    source?: string;
}

interface ChordsData {
    found: boolean;
    artist?: string;
    title?: string;
    key?: string;
    tempo?: number;
    source?: string;
    cifraText?: string;
    chords: ChordEvent[];
}

interface MusicPlayerContextType {
    playingAudio: MediaItem | null;
    isAudioPlaying: boolean;
    audioCurrentTime: number;
    audioDuration: number;
    audioQueue: MediaItem[];
    queueIndex: number;
    isShuffle: boolean;
    isRepeat: boolean;
    audioVolume: number;
    isAudioMuted: boolean;
    isExpandedPlayerOpen: boolean;
    playTrack: (track: MediaItem, queue?: MediaItem[], index?: number) => void;
    playAlbum: (tracks: MediaItem[], startIndex?: number) => void;
    togglePlayPause: () => void;
    nextTrack: () => void;
    prevTrack: () => void;
    seekTo: (time: number) => void;
    setVolume: (vol: number) => void;
    toggleMute: () => void;
    toggleShuffle: () => void;
    toggleRepeat: () => void;
    closePlayer: () => void;
    openExpandedPlayer: () => void;
    closeExpandedPlayer: () => void;
    openArtistDetails: (artistName?: string) => void;
    openAlbumDetails: (albumName?: string, artistName?: string, albumId?: string | number) => void;
    openDiagnostics: () => void;
    handleDownloadTrack: (track: MediaItem | null) => void;
    handleDownloadAlbum: (tracks: MediaItem[], albumName?: string) => void;
    addToQueue: (track: MediaItem) => void;
    playerAnimationMode: 'art' | 'turntable' | 'disc';
    changePlayerAnimationMode: (mode: 'art' | 'turntable' | 'disc') => void;
    playbackSpeed: number;
    handlePlaybackSpeedChange: (speed: number) => void;
    cyclePlaybackSpeed: () => void;
    skipSeconds: (seconds: number) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null);

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || isNaN(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ── Interactive Fretboard Diagram for Guitar & Bass ──
function FretboardDiagram({ chordName, instrument = 'guitar' }: { chordName: string; instrument?: InstrumentType }) {
    const diagram = getChordDiagram(chordName, instrument);
    const isBass = instrument === 'bass';
    const numStrings = isBass ? 4 : 6;
    const stringLabels = diagram.stringLabels || (isBass ? ['E', 'A', 'D', 'G'] : ['E', 'A', 'D', 'G', 'B', 'e']);

    return (
        <div className="flex flex-col items-center justify-center bg-zinc-900/90 border border-zinc-800 p-3 rounded-2xl shadow-xl space-y-1 select-none">
            <div className="flex items-center justify-between w-full px-2">
                <span className="text-[11px] font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1">
                    {isBass ? '🎸 Bass (4-String)' : '🎸 Guitar (6-String)'}
                </span>
                {isBass && diagram.rootNote && (
                    <span className="text-[9px] font-bold bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                        Root: {diagram.rootNote}
                    </span>
                )}
                {diagram.baseFret && diagram.baseFret > 1 && (
                    <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                        Fret {diagram.baseFret}
                    </span>
                )}
            </div>
            <svg viewBox="0 0 160 140" className="w-36 h-28">
                {/* Nut */}
                <rect x="20" y="20" width="120" height="4" fill="#f59e0b" rx="2" />
                {/* Frets */}
                {[0, 1, 2, 3, 4].map(fret => (
                    <line key={fret} x1="20" y1={24 + fret * 24} x2="140" y2={24 + fret * 24} stroke="#3f3f46" strokeWidth="2" />
                ))}
                {/* Strings */}
                {Array.from({ length: numStrings }).map((_, s) => {
                    const x = 25 + s * (110 / (numStrings - 1));
                    return (
                        <line key={s} x1={x} y1="24" x2={x} y2="120" stroke="#71717a" strokeWidth={isBass ? (3.5 - s * 0.6) : (s < 3 ? 2.5 : 1.5)} />
                    );
                })}
                {/* String open/mute markers & finger dots */}
                {diagram.frets.map((fret, s) => {
                    const x = 25 + s * (110 / (numStrings - 1));
                    if (fret === 'x' || fret === -1) {
                        return (
                            <text key={s} x={x} y="15" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold">✕</text>
                        );
                    }
                    if (fret === 0) {
                        return (
                            <circle key={s} cx={x} cy="13" r="3.5" fill="none" stroke="#10b981" strokeWidth="2" />
                        );
                    }
                    if (typeof fret === 'number' && fret > 0) {
                        const y = 24 + (fret - 0.5) * 24;
                        return (
                            <g key={s}>
                                <circle cx={x} cy={y} r="6.5" fill={isBass ? "#a855f7" : "#f59e0b"} className="drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                                {diagram.fingers && diagram.fingers[s] ? (
                                    <text x={x} y={y + 3} textAnchor="middle" fill="#000" fontSize="8" fontWeight="black">{diagram.fingers[s]}</text>
                                ) : null}
                            </g>
                        );
                    }
                    return null;
                })}
            </svg>
            <div className="flex justify-between w-32 px-1 text-[9px] font-mono font-bold text-zinc-500">
                {stringLabels.map((note, i) => (
                    <span key={i}>{note}</span>
                ))}
            </div>
        </div>
    );
}

// ── Sing Mode: Vocal Pitch Highway & Real-Time Mic Pitch Tracker ──
function SingPitchHero({
    lyricsData,
    currentTime,
    duration,
    onSeek
}: {
    lyricsData: LyricsData | null;
    currentTime: number;
    duration: number;
    onSeek: (t: number) => void;
}) {
    const [isMicActive, setIsMicActive] = useState(false);
    const [livePitch, setLivePitch] = useState<{ pitchHz: number; noteName: string; midiNote: number; clarity: number } | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const micAudioCtxRef = useRef<AudioContext | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const micAnimRef = useRef<number | null>(null);

    const toggleMic = async () => {
        if (isMicActive) {
            if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
            if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
            if (micAudioCtxRef.current) micAudioCtxRef.current.close().catch(() => {});
            setIsMicActive(false);
            setLivePitch(null);
            toast.info('Microphone deactivated');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);

            micStreamRef.current = stream;
            micAudioCtxRef.current = ctx;
            micAnalyserRef.current = analyser;
            setIsMicActive(true);
            toast.success('Live Microphone Pitch Tracking Active!');

            const buffer = new Float32Array(analyser.fftSize);
            const checkPitch = () => {
                if (!analyser) return;
                analyser.getFloatTimeDomainData(buffer);
                const detected = detectPitchFromAudioBuffer(buffer, ctx.sampleRate);
                if (detected && detected.clarity > 0.4) {
                    setLivePitch(detected);
                } else {
                    setLivePitch(null);
                }
                micAnimRef.current = requestAnimationFrame(checkPitch);
            };
            micAnimRef.current = requestAnimationFrame(checkPitch);
        } catch (e: any) {
            toast.error('Microphone access denied: ' + e.message);
        }
    };

    useEffect(() => {
        return () => {
            if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
            if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
            if (micAudioCtxRef.current) micAudioCtxRef.current.close().catch(() => {});
        };
    }, []);

    const vocalNotes = useMemo(() => {
        if (!lyricsData || !lyricsData.lines || lyricsData.lines.length === 0) return [];
        return lyricsData.lines.map((line, i) => {
            const nextTime = lyricsData.lines[i + 1]?.time || (line.time + 4.0);
            const lineDur = Math.max(1.5, Math.min(6.0, nextTime - line.time));
            const baseMidi = 60 + ((line.text.length * 7 + i * 5) % 16);
            return {
                index: i,
                time: line.time,
                duration: lineDur,
                text: line.text,
                midiNote: baseMidi,
                noteName: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'][baseMidi % 10] || 'C4'
            };
        });
    }, [lyricsData]);

    const activeVocalNote = vocalNotes.find(n => currentTime >= n.time && currentTime < n.time + n.duration);
    const windowStart = Math.max(0, currentTime - 2);
    const windowEnd = windowStart + 10;

    return (
        <div className="flex-1 flex flex-col space-y-3 min-h-0 select-none">
            <div className="p-2.5 bg-zinc-900/70 border border-zinc-800 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
                        <Sparkles size={14} />
                    </span>
                    <div>
                        <div className="text-xs font-black uppercase tracking-wider text-white">Sing Vocal Hero</div>
                        <div className="text-[10px] text-zinc-400 font-medium">Match vocal melody bars & test pitch with your mic</div>
                    </div>
                </div>

                <button
                    onClick={toggleMic}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-lg ${
                        isMicActive
                            ? 'bg-pink-500 hover:bg-pink-400 text-black shadow-pink-950/40 ring-2 ring-pink-400/50'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700'
                    }`}
                >
                    <Mic2 size={13} className={isMicActive ? 'animate-bounce' : ''} />
                    {isMicActive ? 'Mic Live (Active)' : 'Enable Live Mic'}
                </button>
            </div>

            <div className="relative flex-1 min-h-[190px] sm:min-h-[230px] bg-zinc-950 border-2 border-zinc-800/80 rounded-2xl overflow-hidden p-2 flex flex-col justify-between shadow-inner">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 p-2">
                    {['High (C5)', 'Mid-High (G4)', 'Mid (E4)', 'Mid-Low (C4)', 'Low (A3)'].map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between border-b border-pink-500/30 text-[8px] font-mono font-bold text-pink-300">
                            <span>{p}</span>
                            <span className="w-full mx-2 border-b border-dashed border-zinc-700" />
                        </div>
                    ))}
                </div>

                <div className="absolute top-0 bottom-0 left-[25%] w-0.5 bg-amber-400 shadow-[0_0_12px_#f59e0b] z-20 pointer-events-none">
                    <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full bg-amber-400 ring-2 ring-amber-300/50 shadow-md" />
                </div>

                <div className="relative w-full h-full">
                    {vocalNotes
                        .filter(n => n.time + n.duration >= windowStart && n.time <= windowEnd)
                        .map(n => {
                            const leftPct = ((n.time - windowStart) / (windowEnd - windowStart)) * 100;
                            const widthPct = Math.max(5, (n.duration / (windowEnd - windowStart)) * 100);
                            const topPct = 80 - ((n.midiNote - 55) / 25) * 70;
                            const isCurrent = currentTime >= n.time && currentTime <= n.time + n.duration;

                            return (
                                <div
                                    key={n.index}
                                    onClick={() => onSeek(n.time)}
                                    className={`absolute rounded-xl px-2.5 py-1 text-xs font-black cursor-pointer transition-transform duration-75 flex items-center justify-center shadow-lg truncate border ${
                                        isCurrent
                                            ? 'bg-gradient-to-r from-pink-500 to-amber-400 text-black border-white ring-2 ring-pink-400/60 shadow-[0_0_20px_rgba(236,72,153,0.8)] scale-105 z-10'
                                            : 'bg-zinc-800/90 text-zinc-300 border-zinc-700 hover:border-pink-400/50 z-0'
                                    }`}
                                    style={{
                                        left: `${leftPct}%`,
                                        width: `${widthPct}%`,
                                        top: `${Math.max(8, Math.min(75, topPct))}%`
                                    }}
                                >
                                    <span className="truncate">{n.text}</span>
                                </div>
                            );
                        })}

                    {isMicActive && livePitch && (
                        <div
                            className="absolute left-[25%] z-30 transition-all duration-75 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                            style={{
                                top: `${Math.max(8, Math.min(85, 80 - ((livePitch.midiNote - 55) / 25) * 70))}%`
                            }}
                        >
                            <div className="w-5 h-5 rounded-full bg-cyan-400 shadow-[0_0_16px_#22d3ee] border-2 border-white ring-4 ring-cyan-400/40 animate-pulse flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-black" />
                            </div>
                            <span className="absolute left-6 -top-1 px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold whitespace-nowrap shadow-md">
                                🎤 {livePitch.noteName} ({Math.round(livePitch.pitchHz)}Hz)
                            </span>
                        </div>
                    )}
                </div>

                <div className="p-3 bg-zinc-900/90 border border-zinc-800/90 rounded-xl flex items-center justify-between z-20">
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Active Singing Line</div>
                        <div className="text-base sm:text-lg font-black text-amber-300 truncate">
                            {activeVocalNote ? activeVocalNote.text : '...'}
                        </div>
                    </div>

                    {isMicActive && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-ping" />
                            <span className="text-xs font-mono font-bold text-cyan-300">
                                {livePitch ? `Pitch: ${livePitch.noteName}` : 'Listening for Voice...'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── 12-Bin Harmonic Chromagram Visualizer ──
function ChromagramVisualizer({ chroma }: { chroma: number[] }) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return (
        <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl space-y-1.5 select-none">
            <div className="flex items-center justify-between text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                <span className="flex items-center gap-1 text-amber-400">
                    <Sparkles size={12} /> 12-Bin Harmonic Chromagram
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                    DSP Live
                </span>
            </div>
            <div className="grid grid-cols-12 gap-1 h-10 items-end pt-1">
                {noteNames.map((name, i) => {
                    const energy = chroma && chroma[i] ? Math.min(Math.max(chroma[i], 0.05), 1) : 0.05;
                    const isSharp = name.includes('#');
                    return (
                        <div key={name} className="flex flex-col items-center gap-0.5 h-full justify-end">
                            <div
                                className={`w-full rounded-t transition-all duration-100 ${
                                    energy > 0.35
                                        ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                                        : isSharp
                                        ? 'bg-zinc-700'
                                        : 'bg-zinc-800'
                                }`}
                                style={{ height: `${energy * 100}%` }}
                            />
                            <span className={`text-[8px] font-mono font-bold ${energy > 0.35 ? 'text-amber-300' : 'text-zinc-500'}`}>
                                {name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Duration String Parser (Handles "3:45", "1:12:05", milliseconds, and seconds) ──
function parseDurationString(dur: any): number {
    if (!dur) return 0;
    if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) return dur;
    if (typeof dur === 'string') {
        const parts = dur.trim().split(':').map((p: string) => parseInt(p, 10));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        const num = parseFloat(dur);
        if (!isNaN(num) && num > 0) return num;
    }
    return 0;
}

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Core Playback States
    const [playingAudio, setPlayingAudio] = useState<MediaItem | null>(null);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [audioQueue, setAudioQueue] = useState<MediaItem[]>([]);
    const [queueIndex, setQueueIndex] = useState(0);
    const [isShuffle, setIsShuffle] = useState(false);
    const [isRepeat, setIsRepeat] = useState(false);
    const [audioVolume, setAudioVolume] = useState(1);
    const [isAudioMuted, setIsAudioMuted] = useState(false);

    // UI Drawer & Modal States
    const [showQueueDrawer, setShowQueueDrawer] = useState(false);
    const [isExpandedPlayerOpen, setIsExpandedPlayerOpen] = useState(false);
    const [expandedSidePanel, setExpandedSidePanel] = useState<'karaoke' | 'guitar' | 'bass' | 'sing' | 'artist' | 'album' | 'queue' | 'playlists' | 'specs' | 'search' | 'info'>('karaoke');
    const [infoSubTab, setInfoSubTab] = useState<'song' | 'album' | 'artist'>('song');
    const [queueSubTab, setQueueSubTab] = useState<'queue' | 'playlists'>('queue');
    const [showExpandedSidePanel, setShowExpandedSidePanel] = useState(true);
    const [isVinylView, setIsVinylView] = useState(true);

    // 3-Way Player Animation Mode: 'turntable' (Vinyl with Plinth) | 'disc' (Pure Spinning Disk) | 'art' (Simple Album Art)
    const [playerAnimationMode, setPlayerAnimationMode] = useState<'art' | 'turntable' | 'disc'>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('schedulearr_player_animation_mode');
                if (saved === 'art' || saved === 'turntable' || saved === 'disc') {
                    return saved;
                }
            } catch {}
        }
        return 'turntable';
    });

    const changePlayerAnimationMode = (mode: 'art' | 'turntable' | 'disc') => {
        setPlayerAnimationMode(mode);
        setIsVinylView(mode !== 'art');
        try {
            localStorage.setItem('schedulearr_player_animation_mode', mode);
        } catch {}
    };

    // Audiobook & Spoken Word Speed Control & Jump Handlers
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            try {
                const s = localStorage.getItem('schedulearr_audio_playback_speed');
                if (s) return parseFloat(s);
            } catch {}
        }
        return 1.0;
    });

    const handlePlaybackSpeedChange = (speed: number) => {
        setPlaybackSpeed(speed);
        if (audioRef.current) {
            audioRef.current.playbackRate = speed;
        }
        try {
            localStorage.setItem('schedulearr_audio_playback_speed', String(speed));
        } catch {}
        toast.info(`Speed: ${speed}x`);
    };

    const cyclePlaybackSpeed = () => {
        const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 0.75];
        const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        handlePlaybackSpeedChange(speeds[nextIdx]);
    };

    const skipSeconds = (seconds: number) => {
        if (audioRef.current) {
            const nextTime = Math.max(0, Math.min(audioRef.current.duration || 999999, audioRef.current.currentTime + seconds));
            audioRef.current.currentTime = nextTime;
            setAudioCurrentTime(nextTime);
            toast.info(`${seconds > 0 ? `+${seconds}` : seconds}s`);
        }
    };

    // In-Player Playlist States & Handlers
    const [inPlayerPlaylists, setInPlayerPlaylists] = useState<any[]>([]);
    const [inPlayerNewPlaylistName, setInPlayerNewPlaylistName] = useState('');
    const [showInPlayerCreatePlaylist, setShowInPlayerCreatePlaylist] = useState(false);
    const [selectedInPlayerPlaylist, setSelectedInPlayerPlaylist] = useState<any | null>(null);
    const [inPlayerPlaylistSearchQuery, setInPlayerPlaylistSearchQuery] = useState('');

    const fetchInPlayerPlaylists = async () => {
        try {
            const res = await fetch('/api/theater/music/playlists');
            if (res.ok) {
                const data = await res.json();
                const plList = Array.isArray(data.playlists) ? data.playlists : [];
                setInPlayerPlaylists(plList);
                setSelectedInPlayerPlaylist((prev: any) => {
                    if (!prev) return null;
                    return plList.find((p: any) => p.id === prev.id) || null;
                });
            }
        } catch {}
    };

    useEffect(() => {
        fetchInPlayerPlaylists();
        const handlePlaylistsUpdated = () => {
            fetchInPlayerPlaylists();
        };
        window.addEventListener('schedulearr:playlists-updated', handlePlaylistsUpdated);
        return () => {
            window.removeEventListener('schedulearr:playlists-updated', handlePlaylistsUpdated);
        };
    }, []);

    const handleCreateInPlayerPlaylist = async () => {
        if (!inPlayerNewPlaylistName.trim()) return;
        try {
            const initialItems = playingAudio ? [playingAudio] : [];
            const res = await fetch('/api/theater/music/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: inPlayerNewPlaylistName.trim(),
                    items: initialItems,
                    coverUrl: playingAudio?.posterUrl
                })
            });
            if (res.ok) {
                toast.success(`Created playlist "${inPlayerNewPlaylistName.trim()}"!`);
                setInPlayerNewPlaylistName('');
                setShowInPlayerCreatePlaylist(false);
                fetchInPlayerPlaylists();
                window.dispatchEvent(new CustomEvent('schedulearr:playlists-updated'));
            } else {
                toast.error('Failed to create playlist');
            }
        } catch {
            toast.error('Failed to create playlist');
        }
    };

    const handleAddCurrentSongToPlaylist = async (playlist: any) => {
        if (!playingAudio) return;
        try {
            const existingItems = Array.isArray(playlist.items) ? playlist.items : [];
            const updatedItems = [...existingItems.filter((i: any) => i.id !== playingAudio.id), playingAudio];
            const res = await fetch('/api/theater/music/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: playlist.id,
                    name: playlist.name,
                    items: updatedItems,
                    coverUrl: playlist.cover_url || playingAudio.posterUrl
                })
            });
            if (res.ok) {
                toast.success(`Added "${playingAudio.title}" to ${playlist.name}!`);
                fetchInPlayerPlaylists();
                window.dispatchEvent(new CustomEvent('schedulearr:playlists-updated'));
            } else {
                toast.error('Failed to add track to playlist');
            }
        } catch {
            toast.error('Failed to add track to playlist');
        }
    };

    const handleMoveInPlayerPlaylistTrack = async (playlistId: string, fromIndex: number, toIndex: number) => {
        const targetPl = inPlayerPlaylists.find((p: any) => p.id === playlistId) || selectedInPlayerPlaylist;
        if (!targetPl) return;
        const currentItems = Array.isArray(targetPl.items) ? [...targetPl.items] : [];
        if (toIndex < 0 || toIndex >= currentItems.length) return;

        const [movedTrack] = currentItems.splice(fromIndex, 1);
        currentItems.splice(toIndex, 0, movedTrack);

        const updatedPlaylist = { ...targetPl, items: currentItems };
        setSelectedInPlayerPlaylist(updatedPlaylist);
        setInPlayerPlaylists(prev => prev.map(p => p.id === playlistId ? updatedPlaylist : p));

        try {
            const res = await fetch('/api/theater/music/playlists', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: playlistId,
                    items: currentItems
                })
            });
            if (res.ok) {
                window.dispatchEvent(new CustomEvent('schedulearr:playlists-updated'));
            } else {
                toast.error('Failed to save track order');
                fetchInPlayerPlaylists();
            }
        } catch {
            toast.error('Failed to save track order');
            fetchInPlayerPlaylists();
        }
    };

    const handleRemoveInPlayerPlaylistTrack = async (playlistId: string, trackIndex: number) => {
        const targetPl = inPlayerPlaylists.find((p: any) => p.id === playlistId) || selectedInPlayerPlaylist;
        if (!targetPl) return;
        const currentItems = Array.isArray(targetPl.items) ? [...targetPl.items] : [];
        if (trackIndex < 0 || trackIndex >= currentItems.length) return;

        const removedTitle = currentItems[trackIndex]?.title || 'Track';
        currentItems.splice(trackIndex, 1);

        const updatedPlaylist = { ...targetPl, items: currentItems };
        setSelectedInPlayerPlaylist(updatedPlaylist);
        setInPlayerPlaylists(prev => prev.map(p => p.id === playlistId ? updatedPlaylist : p));

        try {
            const res = await fetch('/api/theater/music/playlists', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: playlistId,
                    items: currentItems
                })
            });
            if (res.ok) {
                toast.success(`Removed "${removedTitle}"`);
                window.dispatchEvent(new CustomEvent('schedulearr:playlists-updated'));
            } else {
                toast.error('Failed to remove track');
                fetchInPlayerPlaylists();
            }
        } catch {
            toast.error('Failed to remove track');
            fetchInPlayerPlaylists();
        }
    };

    const handlePlayWholePlaylist = (playlist: any) => {
        const items = Array.isArray(playlist.items) ? playlist.items : [];
        if (items.length === 0) {
            toast.error('This playlist is empty');
            return;
        }
        playTrack(items[0], items);
        toast.success(`Playing playlist "${playlist.name}" (${items.length} tracks)`);
    };

    const handleDeleteInPlayerPlaylist = async (playlistId: string, name: string) => {
        try {
            const res = await fetch(`/api/theater/music/playlists?id=${playlistId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success(`Deleted playlist "${name}"`);
                if (selectedInPlayerPlaylist?.id === playlistId) {
                    setSelectedInPlayerPlaylist(null);
                }
                fetchInPlayerPlaylists();
                window.dispatchEvent(new CustomEvent('schedulearr:playlists-updated'));
            }
        } catch {}
    };

    const filteredInPlayerPlaylistTracks = useMemo(() => {
        if (!selectedInPlayerPlaylist || !Array.isArray(selectedInPlayerPlaylist.items)) return [];
        if (!inPlayerPlaylistSearchQuery.trim()) {
            return selectedInPlayerPlaylist.items.map((track: any, index: number) => ({ track, originalIndex: index }));
        }
        const q = inPlayerPlaylistSearchQuery.toLowerCase().trim();
        return selectedInPlayerPlaylist.items
            .map((track: any, index: number) => ({ track, originalIndex: index }))
            .filter(({ track }: any) => {
                const title = (track.title || track.name || '').toLowerCase();
                const artist = (track.artist || track.uploader || '').toLowerCase();
                const album = (track.album || '').toLowerCase();
                return title.includes(q) || artist.includes(q) || album.includes(q);
            });
    }, [selectedInPlayerPlaylist, inPlayerPlaylistSearchQuery]);

    // In-Player Live Search States (Search YouTube & Library without exiting player)
    const [inPlayerSearchQuery, setInPlayerSearchQuery] = useState('');
    const [inPlayerFilter, setInPlayerFilter] = useState<'all' | 'library' | 'youtube'>('all');
    const [inPlayerSearchResultsLocal, setInPlayerSearchResultsLocal] = useState<MediaItem[]>([]);
    const [inPlayerSearchResultsOnline, setInPlayerSearchResultsOnline] = useState<MediaItem[]>([]);
    const [inPlayerSearchLoading, setInPlayerSearchLoading] = useState(false);
    const inPlayerSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // Download Modal States
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [downloadTargetTrack, setDownloadTargetTrack] = useState<MediaItem | null>(null);
    const [downloadTargetAlbumTracks, setDownloadTargetAlbumTracks] = useState<MediaItem[] | null>(null);
    const [downloadTargetAlbumName, setDownloadTargetAlbumName] = useState<string | undefined>(undefined);

    // Artist Biography & Discography States
    const [showArtistModal, setShowArtistModal] = useState(false);
    const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
    const [artistData, setArtistData] = useState<any | null>(null);
    const [artistLoading, setArtistLoading] = useState(false);
    const [artistViewMode, setArtistViewMode] = useState<'albums' | 'songs'>('albums');
    const [artistAlbumFilter, setArtistAlbumFilter] = useState<'all' | 'full_albums'>('all');
    const [artistAlbumSort, setArtistAlbumSort] = useState<'popularity' | 'newest' | 'oldest' | 'alphabetical'>('popularity');
    const [artistSongSort, setArtistSongSort] = useState<'popularity' | 'newest' | 'oldest' | 'alphabetical'>('popularity');
    const [artistSongFilter, setArtistSongFilter] = useState<'all' | 'local_only'>('all');
    const [artistSearchQuery, setArtistSearchQuery] = useState('');
    const [downloadingAlbumKey, setDownloadingAlbumKey] = useState<string | null>(null);

    // Album Page & Tracklist States
    const [showAlbumModal, setShowAlbumModal] = useState(false);
    const [selectedAlbumTitle, setSelectedAlbumTitle] = useState<string | null>(null);
    const [albumData, setAlbumData] = useState<any | null>(null);
    const [albumTracks, setAlbumTracks] = useState<any[]>([]);
    const [albumLoading, setAlbumLoading] = useState(false);

    // Vinyl Interactive DJ Scratch & Tonearm Controls (Gimmick)
    const [tonearmCustomAngle, setTonearmCustomAngle] = useState<number | null>(null);
    const [isScratchingDisc, setIsScratchingDisc] = useState(false);
    const [discScratchAngle, setDiscScratchAngle] = useState(0);
    const [scratchFeedback, setScratchFeedback] = useState<string | null>(null);

    const isDraggingTonearmRef = useRef(false);
    const isDraggingDiscRef = useRef(false);
    const lastPointerAngleRef = useRef(0);
    const wasPlayingBeforeDragRef = useRef(false);
    const discPlatterRef = useRef<HTMLDivElement>(null);
    const tonearmGimbalRef = useRef<HTMLDivElement>(null);

    // Audio Playback Lifecycle, Error Handling & Nerd Tools States
    const [audioPlaybackStatus, setAudioPlaybackStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error'>('idle');
    const [audioPlaybackError, setAudioPlaybackError] = useState<{ code?: number; name?: string; message: string; details?: string; suggestion?: string; } | null>(null);
    const [audioNerdLogs, setAudioNerdLogs] = useState<{ id: string; timestamp: string; level: 'info' | 'warn' | 'error' | 'success'; message: string; details?: any }[]>([]);
    const [showAudioNerdModal, setShowAudioNerdModal] = useState(false);
    const [bottomCoverError, setBottomCoverError] = useState(false);
    const [vinylCoverError, setVinylCoverError] = useState(false);
    const [normalCoverError, setNormalCoverError] = useState(false);

    const getCoverFallbackUrl = (artist?: string, album?: string, title?: string) => {
        const params = new URLSearchParams();
        if (artist) params.set('artist', artist);
        if (album) params.set('album', album);
        if (title) params.set('title', title);
        return `/api/theater/music/cover?${params.toString()}`;
    };

    const copyReportToClipboard = async (reportText: string) => {
        let copied = false;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(reportText);
                copied = true;
            }
        } catch {}

        if (!copied && typeof document !== 'undefined') {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = reportText;
                textarea.style.position = 'fixed';
                textarea.style.top = '0';
                textarea.style.left = '0';
                textarea.style.width = '2em';
                textarea.style.height = '2em';
                textarea.style.padding = '0';
                textarea.style.border = 'none';
                textarea.style.outline = 'none';
                textarea.style.boxShadow = 'none';
                textarea.style.background = 'transparent';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                textarea.setSelectionRange(0, reportText.length);
                copied = document.execCommand('copy');
                document.body.removeChild(textarea);
            } catch (err) {
                console.error('Fallback copy failed:', err);
            }
        }

        if (copied) {
            toast.success('Nerd Diagnostics Report copied to clipboard!');
        } else if (typeof window !== 'undefined') {
            window.prompt('Copy diagnostics report manually (Ctrl+C / Cmd+C):', reportText);
        }
    };

    const getAudioSourceInfo = (item: MediaItem | null, currentStreamUrl?: string) => {
        if (!item) return { label: 'Audio', shortLabel: 'Audio', sublabel: 'Idle', type: 'unknown', isLocal: false, isPlex: false, isYt: false, isOnline: false, colorClass: 'bg-zinc-800 text-zinc-300 border-zinc-700' };

        const stream = currentStreamUrl || item.streamUrl || '';
        const isPlex = stream.includes('plexPart=') || stream.includes('/api/plex') || item.id?.startsWith('plex-') || Boolean((item as any).plexPart) || Boolean(item.instanceId && !item.id?.startsWith('yt-'));
        const isYt = Boolean(
            item.youtubeId || 
            item.id?.startsWith('yt-') || 
            item.source?.toLowerCase().includes('youtube') ||
            item.folder === 'YouTube' ||
            item.artist === 'YouTube' ||
            item.album === 'YouTube Music' ||
            stream.includes('youtube.com') ||
            stream.includes('youtu.be') ||
            stream.includes('googlevideo.com') ||
            stream.includes('ytId=')
        );

        // 1. Plex Server Stream (Instance & Library)
        if (isPlex) {
            const inst = item.instanceName || 'Server';
            const lib = item.libraryName ? `${item.libraryName}` : 'Music';
            const ext = (item.extension || 'MP3').toUpperCase();
            return {
                label: `Plex: ${inst}`,
                shortLabel: `Plex (${inst})`,
                sublabel: `${lib} • ${ext}`,
                type: 'plex',
                isLocal: false,
                isPlex: true,
                isYt: false,
                isOnline: false,
                colorClass: 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
            };
        }

        // 2. Local Disk File / Server Library
        const hasLocalPath = Boolean(item.path && (item.path.startsWith('/') || item.path.includes('\\') || item.path.includes(':')));
        const isLocalFlag = Boolean(item.isLocal || (item as any).isDownloaded || (item as any).downloaded);
        const isLocalStream = stream.includes('/api/theater/stream?path=') || stream.includes('/api/theater/music/download?path=');

        if (hasLocalPath || isLocalFlag || isLocalStream) {
            const lib = item.libraryName || 'Server Library';
            const ext = (item.extension || (item.path ? item.path.split('.').pop() : '') || 'MP3').toUpperCase();
            const folder = item.path ? item.path.split(/[/\\]/).slice(-2, -1)[0] : '';
            return {
                label: `Server: ${lib}`,
                shortLabel: `Server (${lib})`,
                sublabel: folder ? `${folder} • ${ext}` : (item.path || 'Server Storage'),
                type: 'local',
                isLocal: true,
                isPlex: false,
                isYt: false,
                isOnline: false,
                colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
            };
        }

        // 3. YouTube Music Stream
        if (isYt) {
            const cleanYt = item.youtubeId || (item.id?.startsWith('yt-') ? item.id.replace('yt-', '') : '');
            return {
                label: 'Streaming: YouTube',
                shortLabel: 'YouTube',
                sublabel: cleanYt ? `ID: ${cleanYt}` : 'Audio Stream',
                type: 'youtube',
                isLocal: false,
                isPlex: false,
                isYt: true,
                isOnline: true,
                colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
            };
        }

        // 4. Online Music Search (Deezer / iTunes / Spotify)
        const isOnlineSearch = stream.includes('/api/theater/music/stream') || item.id?.startsWith('online-') || item.id?.startsWith('deezer-') || item.id?.startsWith('itunes-') || item.id?.startsWith('spotify-');
        let providerName = item.source || (item.id?.startsWith('deezer-') ? 'Deezer' : item.id?.startsWith('itunes-') ? 'Apple Music' : item.id?.startsWith('spotify-') ? 'Spotify' : 'Online');
        if (providerName.toLowerCase().includes('deezer')) providerName = 'Deezer';
        else if (providerName.toLowerCase().includes('spotify')) providerName = 'Spotify';
        else if (providerName.toLowerCase().includes('apple') || providerName.toLowerCase().includes('itunes')) providerName = 'Apple Music';
        else if (providerName.toLowerCase().includes('youtube')) providerName = 'YouTube';

        if (isOnlineSearch) {
            return {
                label: `Streaming: ${providerName}`,
                shortLabel: providerName,
                sublabel: 'Online Provider',
                type: 'online',
                isLocal: false,
                isPlex: false,
                isYt: false,
                isOnline: true,
                colorClass: 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
            };
        }

        return {
            label: 'Streaming: Web',
            shortLabel: 'Web Stream',
            sublabel: stream ? 'Network Stream' : 'Audio Stream',
            type: 'stream',
            isLocal: false,
            isPlex: false,
            isYt: false,
            isOnline: true,
            colorClass: 'bg-zinc-800 text-zinc-300 border-zinc-700'
        };
    };

    const handleSourceBadgeClick = async (item: MediaItem | null) => {
        if (!item) return;
        const srcInfo = getAudioSourceInfo(item, audioRef.current?.src);

        if (srcInfo.isLocal || (item.path && !srcInfo.isPlex && !srcInfo.isOnline)) {
            try {
                const res = await fetch('/api/system/open-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: item.path, action: 'reveal' })
                });
                const data = await res.json();
                if (res.ok) {
                    toast.success(data.message || `Opened folder in file explorer`);
                } else {
                    navigator.clipboard?.writeText(item.path);
                    toast.info(`Server path copied: ${item.path}`);
                }
            } catch {
                navigator.clipboard?.writeText(item.path);
                toast.info(`Server path copied: ${item.path}`);
            }
        } else if (srcInfo.isPlex) {
            if (item.path) {
                try {
                    const res = await fetch('/api/system/open-file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: item.path, action: 'reveal' })
                    });
                    if (res.ok) {
                        toast.success(`Opened Plex library folder in file explorer`);
                        return;
                    }
                } catch {}
            }
            toast.info(`Plex Instance: ${item.instanceName || 'Server'}`);
        } else if (srcInfo.isYt) {
            const cleanYt = item.youtubeId || (item.id?.startsWith('yt-') ? item.id.replace('yt-', '') : '');
            const url = cleanYt ? `https://www.youtube.com/watch?v=${cleanYt}` : `https://www.youtube.com/results?search_query=${encodeURIComponent((item.title || '') + ' ' + (item.artist || ''))}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } else if (srcInfo.isOnline) {
            const prov = (item.source || '').toLowerCase();
            let url = `https://www.google.com/search?q=${encodeURIComponent((item.title || '') + ' ' + (item.artist || ''))}`;
            if (prov.includes('deezer') || item.id?.startsWith('deezer-')) {
                url = `https://www.deezer.com/search/${encodeURIComponent((item.title || '') + ' ' + (item.artist || ''))}`;
            } else if (prov.includes('spotify') || item.id?.startsWith('spotify-')) {
                url = `https://open.spotify.com/search/${encodeURIComponent((item.title || '') + ' ' + (item.artist || ''))}`;
            } else if (prov.includes('apple') || prov.includes('itunes') || item.id?.startsWith('itunes-')) {
                url = `https://music.apple.com/us/search?term=${encodeURIComponent((item.title || '') + ' ' + (item.artist || ''))}`;
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };
    const [audioLogFilter, setAudioLogFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'success'>('all');
    const [audioLogSearch, setAudioLogSearch] = useState('');
    const [audioLogOrder, setAudioLogOrder] = useState<'newest' | 'oldest'>('newest');

    const addAudioNerdLog = (level: 'info' | 'warn' | 'error' | 'success', message: string, details?: any) => {
        const id = Math.random().toString(36).substring(2, 9);
        const timestamp = new Date().toLocaleTimeString();
        setAudioNerdLogs(prev => [...prev.slice(-150), { id, timestamp, level, message, details }]);
    };

    // Star Rating States (1-5 Stars per Track)
    const [trackRatings, setTrackRatings] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined') {
            try {
                return JSON.parse(localStorage.getItem('schedulearr_track_ratings') || '{}');
            } catch { return {}; }
        }
        return {};
    });

    const setTrackRating = (trackId: string, rating: number) => {
        setTrackRatings(prev => {
            const current = prev[trackId] || 0;
            const nextRating = current === rating ? 0 : rating;
            const updated = { ...prev, [trackId]: nextRating };
            try { localStorage.setItem('schedulearr_track_ratings', JSON.stringify(updated)); } catch {}
            if (nextRating > 0) {
                toast.success(`Rated ${nextRating} / 5 ⭐`);
            } else {
                toast.info('Rating cleared');
            }
            return updated;
        });
    };

    // Chords & Tab States
    const [chordsData, setChordsData] = useState<ChordsData | null>(null);
    const [chordsLoading, setChordsLoading] = useState(false);
    const [jamDifficulty, setJamDifficulty] = useState<DifficultyLevel>('beginner');
    const [jamInstrument, setJamInstrument] = useState<InstrumentType>('guitar');
    const [jamTranspose, setJamTranspose] = useState(0);
    const [showChordsOverlay, setShowChordsOverlay] = useState(true);
    const [liveChromaEnergy, setLiveChromaEnergy] = useState<number[]>(new Array(12).fill(0));
    const [liveDetectedChord, setLiveDetectedChord] = useState<{ chord: string; confidence: number } | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);

    // Lyrics & Karaoke States
    const [showLyricsModal, setShowLyricsModal] = useState(false);
    const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
    const [lyricsLoading, setLyricsLoading] = useState(false);
    const [lyricsViewMode, setLyricsViewMode] = useState<'karaoke' | 'full'>('karaoke');
    const [isLyricsEditorOpen, setIsLyricsEditorOpen] = useState(false);
    const [lyricsSearchQuery, setLyricsSearchQuery] = useState('');
    const [lyricsSearchResults, setLyricsSearchResults] = useState<any[]>([]);
    const [lyricsSearchLoading, setLyricsSearchLoading] = useState(false);
    const [customLrcText, setCustomLrcText] = useState('');
    const [editorTab, setEditorTab] = useState<'search' | 'custom'>('search');
    const [isSavingLyrics, setIsSavingLyrics] = useState(false);
    const activeLyricRef = useRef<HTMLDivElement>(null);
    const expandedActiveLyricRef = useRef<HTMLDivElement>(null);
    const expandedLyricsContainerRef = useRef<HTMLDivElement>(null);
    const standaloneLyricsContainerRef = useRef<HTMLDivElement>(null);

    // Studio Subtab & Minimalist Display Modes
    const [karaokeSubTab, setKaraokeSubTab] = useState<'lyrics' | 'guitar' | 'bass' | 'sing'>('lyrics');
    const [isMinimalistVinylMode, setIsMinimalistVinylMode] = useState(false);

    // Fix Match & Verified Metadata States
    const [isFixMatchOpen, setIsFixMatchOpen] = useState(false);
    const [fixMatchQuery, setFixMatchQuery] = useState('');
    const [fixMatchResults, setFixMatchResults] = useState<any[]>([]);
    const [fixMatchLoading, setFixMatchLoading] = useState(false);
    const [customMatchArtist, setCustomMatchArtist] = useState('');
    const [customMatchTitle, setCustomMatchTitle] = useState('');
    const [customMatchAlbum, setCustomMatchAlbum] = useState('');
    const loadedTrackIdRef = useRef<string | null>(null);

    // Specs & Diagnostics Modal States
    const [isAudioSpecsOpen, setIsAudioSpecsOpen] = useState(false);
    const [audioSpecsItem, setAudioSpecsItem] = useState<MediaItem | null>(null);
    const [audioSpecsData, setAudioSpecsData] = useState<any>(null);
    const [audioSpecsLoading, setAudioSpecsLoading] = useState(false);

    // Native Casting & Audio Output States
    const [isCastPickerModalOpen, setIsCastPickerModalOpen] = useState(false);
    const [availableAudioOutputs, setAvailableAudioOutputs] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioOutputId, setSelectedAudioOutputId] = useState<string>('default');
    const [isCastingToGoogle, setIsCastingToGoogle] = useState(false);
    const [activeCastDeviceName, setActiveCastDeviceName] = useState<string | null>(null);
    const [isGrabbingTrack, setIsGrabbingTrack] = useState(false);

    // Synchronize Audio Current Line
    const currentLyricIndex = useMemo(() => {
        if (!lyricsData || !lyricsData.lines || lyricsData.lines.length === 0) return -1;
        for (let i = lyricsData.lines.length - 1; i >= 0; i--) {
            if (audioCurrentTime >= lyricsData.lines[i].time) {
                return i;
            }
        }
        return -1;
    }, [lyricsData, audioCurrentTime]);

    // Isolated Smooth Scrolling for Lyrics without affecting parent page/modal geometry
    useEffect(() => {
        if (showLyricsModal && activeLyricRef.current && standaloneLyricsContainerRef.current) {
            const container = standaloneLyricsContainerRef.current;
            const el = activeLyricRef.current;
            const targetTop = el.offsetTop - container.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
            container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        }
    }, [currentLyricIndex, showLyricsModal]);

    useEffect(() => {
        if (isExpandedPlayerOpen && (expandedSidePanel === 'karaoke' || expandedSidePanel === 'guitar' || expandedSidePanel === 'bass') && expandedActiveLyricRef.current && expandedLyricsContainerRef.current) {
            const container = expandedLyricsContainerRef.current;
            const el = expandedActiveLyricRef.current;
            const targetTop = el.offsetTop - container.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
            container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        }
    }, [currentLyricIndex, isExpandedPlayerOpen, expandedSidePanel]);

    // Send live playback session heartbeat to Analytics telemetry
    useEffect(() => {
        if (!playingAudio) return;

        const sendHeartbeat = async (stateOverride?: 'playing' | 'paused') => {
            try {
                const currentState = stateOverride || (isAudioPlaying ? 'playing' : 'paused');
                const isTranscoding = audioRef.current?.src.includes('transcode=audio') || audioRef.current?.src.includes('transcode=mp3');
                await fetch('/api/theater/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: 'schedulearr-music-player',
                        userName: 'Pedro',
                        mediaId: playingAudio.id,
                        title: playingAudio.title,
                        artist: playingAudio.artist || playingAudio.folder || 'Unknown Artist',
                        album: playingAudio.album || 'Single',
                        mediaType: 'music',
                        poster: playingAudio.posterUrl,
                        deviceName: 'Web Music Player',
                        platform: 'Web',
                        state: currentState,
                        progressPercent: audioDuration > 0 ? Math.min(100, Math.round((audioCurrentTime / audioDuration) * 100)) : 0,
                        viewOffsetMs: Math.round(audioCurrentTime * 1000),
                        durationMs: Math.round(audioDuration * 1000) || playingAudio.durationMs || 0,
                        bandwidthMbps: isTranscoding ? '0.3' : '1.4',
                        transcodeDecision: isTranscoding ? 'Transcode (MP3 320k)' : 'Direct Play'
                    })
                });
            } catch {
                // Ignore background telemetry errors
            }
        };

        sendHeartbeat();

        const interval = setInterval(() => {
            if (isAudioPlaying) {
                sendHeartbeat('playing');
            }
        }, 4000);

        return () => {
            clearInterval(interval);
        };
    }, [playingAudio?.id, isAudioPlaying]);

    // Handle Fetching Lyrics
    const fetchLyrics = async (item: MediaItem) => {
        setLyricsLoading(true);
        try {
            const params = new URLSearchParams({
                path: item.path || '',
                artist: item.artist || '',
                title: item.title || item.name || '',
                album: item.album || '',
                duration: item.durationMs ? String(Math.round(item.durationMs / 1000)) : ''
            });
            const res = await fetch(`/api/theater/music/lyrics?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setLyricsData(data);
            } else {
                setLyricsData(null);
            }
        } catch {
            setLyricsData(null);
        } finally {
            setLyricsLoading(false);
        }
    };

    // Handle Fetching Chords
    const fetchChords = async (item: MediaItem) => {
        setChordsLoading(true);
        try {
            const params = new URLSearchParams({
                artist: item.artist || '',
                title: item.title || item.name || '',
                album: item.album || '',
                duration: item.durationMs ? String(Math.round(item.durationMs / 1000)) : ''
            });
            const res = await fetch(`/api/theater/music/chords?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setChordsData(data);
            } else {
                setChordsData(null);
            }
        } catch {
            setChordsData(null);
        } finally {
            setChordsLoading(false);
        }
    };

    // Active & Next Chord Event with Transposition & Difficulty Simplification
    const activeChordEvent = useMemo(() => {
        if (!chordsData || !chordsData.chords || chordsData.chords.length === 0) {
            if (liveDetectedChord && liveDetectedChord.confidence > 0.35) {
                const transposed = transposeChord(liveDetectedChord.chord, jamTranspose);
                const simplified = simplifyChordForDifficulty(transposed, jamDifficulty);
                return {
                    rawChord: liveDetectedChord.chord,
                    displayChord: simplified,
                    nextChord: null,
                    nextInSeconds: 0,
                    index: -1,
                    isLiveDsp: true
                };
            }
            return null;
        }

        for (let i = chordsData.chords.length - 1; i >= 0; i--) {
            if (audioCurrentTime >= chordsData.chords[i].time) {
                const current = chordsData.chords[i];
                const next = i + 1 < chordsData.chords.length ? chordsData.chords[i + 1] : null;
                const rawChord = current.chord;
                const transposed = transposeChord(rawChord, jamTranspose);
                const simplified = simplifyChordForDifficulty(transposed, jamDifficulty);

                let nextSimplified = null;
                let nextInSeconds = 0;
                if (next) {
                    const nextTransposed = transposeChord(next.chord, jamTranspose);
                    nextSimplified = simplifyChordForDifficulty(nextTransposed, jamDifficulty);
                    nextInSeconds = Math.max(0, Math.round((next.time - audioCurrentTime) * 10) / 10);
                }

                return {
                    rawChord,
                    displayChord: simplified,
                    nextChord: nextSimplified,
                    nextInSeconds,
                    index: i,
                    isLiveDsp: false
                };
            }
        }

        const first = chordsData.chords[0];
        const transposed = transposeChord(first.chord, jamTranspose);
        const simplified = simplifyChordForDifficulty(transposed, jamDifficulty);
        return {
            rawChord: first.chord,
            displayChord: simplified,
            nextChord: null,
            nextInSeconds: Math.max(0, Math.round((first.time - audioCurrentTime) * 10) / 10),
            index: 0,
            isLiveDsp: false
        };
    }, [chordsData, audioCurrentTime, jamTranspose, jamDifficulty, liveDetectedChord]);

    const getChordsForLyricLine = (lineTime: number, nextLineTime?: number) => {
        if (!chordsData || !chordsData.chords || chordsData.chords.length === 0) {
            if (liveDetectedChord && liveDetectedChord.confidence > 0.4) {
                const transposed = transposeChord(liveDetectedChord.chord, jamTranspose);
                return [simplifyChordForDifficulty(transposed, jamDifficulty)];
            }
            return [];
        }
        const endTime = nextLineTime !== undefined ? nextLineTime : lineTime + 5;
        const matched = chordsData.chords
            .filter(c => c.time >= lineTime - 0.5 && c.time < endTime)
            .map(c => {
                const transposed = transposeChord(c.chord, jamTranspose);
                return simplifyChordForDifficulty(transposed, jamDifficulty);
            });
        return matched.length > 0 ? matched : [simplifyChordForDifficulty(transposeChord(chordsData.chords[0].chord, jamTranspose), jamDifficulty)];
    };

    // Web Audio Real-Time Frequency & Chromagram Deconvolution Analyzer Loop
    const initWebAudio = () => {
        if (!audioRef.current || audioContextRef.current) return;
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.85;

            const source = ctx.createMediaElementSource(audioRef.current);
            source.connect(analyser);
            analyser.connect(ctx.destination);

            audioContextRef.current = ctx;
            analyserRef.current = analyser;
        } catch (e: any) {
            console.log('Web Audio init note:', e.message);
        }
    };

    useEffect(() => {
        if (!isAudioPlaying) return;
        initWebAudio();

        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
        }

        const runDspAnalysis = () => {
            if (analyserRef.current && isAudioPlaying) {
                const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(buffer);

                const sampleRate = audioContextRef.current?.sampleRate || 44100;
                const chroma = computeChromagramFromFrequencies(buffer, sampleRate, 2048);
                setLiveChromaEnergy(chroma);

                const matched = matchChordFromChromagram(chroma);
                if (matched.confidence > 0.35) {
                    setLiveDetectedChord(matched);
                }
            }
            animFrameRef.current = requestAnimationFrame(runDspAnalysis);
        };

        animFrameRef.current = requestAnimationFrame(runDspAnalysis);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isAudioPlaying]);

    const handleSearchLyrics = async (query: string) => {
        if (!query.trim()) return;
        setLyricsSearchLoading(true);
        try {
            const res = await fetch(`/api/theater/music/lyrics?q=${encodeURIComponent(query.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setLyricsSearchResults(data.results || []);
            }
        } catch {
            toast.error('Failed to search lyrics provider');
        } finally {
            setLyricsSearchLoading(false);
        }
    };

    const handleApplyLyricsMatch = async (candidate: any) => {
        if (!playingAudio) return;
        try {
            const res = await fetch('/api/theater/music/lyrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: playingAudio.path || '',
                    artist: playingAudio.artist || candidate.artistName,
                    title: playingAudio.title || candidate.trackName,
                    syncedLyrics: candidate.syncedLyrics || null,
                    plainLyrics: candidate.plainLyrics || null,
                    source: `lrclib_match_${candidate.id}`
                })
            });
            if (res.ok) {
                const updated = await res.json();
                setLyricsData(updated.lyrics);
                setIsLyricsEditorOpen(false);
                toast.success('Lyrics match updated and saved!');
            }
        } catch {
            toast.error('Failed to apply lyrics match');
        }
    };

    const handleSaveCustomLyrics = async () => {
        if (!playingAudio || !customLrcText.trim()) return;
        setIsSavingLyrics(true);
        try {
            const isSynced = /\[\d{2}:\d{2}/.test(customLrcText);
            const res = await fetch('/api/theater/music/lyrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: playingAudio.path || '',
                    artist: playingAudio.artist || 'Unknown',
                    title: playingAudio.title || 'Track',
                    syncedLyrics: isSynced ? customLrcText : null,
                    plainLyrics: !isSynced ? customLrcText : null,
                    source: 'custom_user_input'
                })
            });
            if (res.ok) {
                const updated = await res.json();
                setLyricsData(updated.lyrics);
                setIsLyricsEditorOpen(false);
                toast.success('Custom lyrics saved successfully!');
            }
        } catch {
            toast.error('Failed to save custom lyrics');
        } finally {
            setIsSavingLyrics(false);
        }
    };

    // Download Helpers
    // Download Helpers (Opens interactive MusicDownloadModal for quality & directory selection)
    const handleDownloadTrack = (track: MediaItem | null) => {
        const t = track || playingAudio;
        if (!t) return;
        setDownloadTargetTrack(t);
        setDownloadTargetAlbumTracks(null);
        setDownloadTargetAlbumName(undefined);
        setShowDownloadModal(true);
    };

    const handleDownloadAlbum = (tracks: MediaItem[], albumName?: string) => {
        if (!tracks.length) return;
        setDownloadTargetTrack(null);
        setDownloadTargetAlbumTracks(tracks);
        setDownloadTargetAlbumName(albumName || tracks[0]?.album || 'Album');
        setShowDownloadModal(true);
    };

    const addToQueue = (track: MediaItem) => {
        setAudioQueue(prev => [...prev, track]);
        toast.success(`Added "${track.title}" to Playback Queue!`);
    };

    const handleInPlayerSearch = (query: string, immediate: boolean = false) => {
        if (inPlayerSearchDebounceRef.current) {
            clearTimeout(inPlayerSearchDebounceRef.current);
        }

        const q = query.trim();
        if (!q) {
            setInPlayerSearchResultsLocal([]);
            setInPlayerSearchResultsOnline([]);
            setInPlayerSearchLoading(false);
            return;
        }

        const executeSearch = async () => {
            setInPlayerSearchLoading(true);
            try {
                const onlinePromise = fetch(`/api/theater/music/online?q=${encodeURIComponent(q)}`)
                    .then(r => r.ok ? r.json() : { results: [] })
                    .catch(() => ({ results: [] }));

                const localPromise = fetch(`/api/search/global?q=${encodeURIComponent(q)}`)
                    .then(r => r.ok ? r.json() : { results: [] })
                    .catch(() => ({ results: [] }));

                const [onlineData, localData] = await Promise.all([onlinePromise, localPromise]);

                const onlineTracks: MediaItem[] = (onlineData.results || []).map((t: any) => ({
                    id: t.id || `yt-${t.youtubeId || Math.random()}`,
                    name: t.title,
                    title: t.title,
                    path: '',
                    folder: t.channel || t.artist || 'YouTube',
                    artist: t.artist || t.channel || 'YouTube Artist',
                    album: t.album || 'YouTube Music',
                    category: 'audio' as const,
                    extension: 'mp3',
                    sizeBytes: 0,
                    modifiedAt: new Date().toISOString(),
                    duration: t.duration,
                    posterUrl: t.posterUrl,
                    streamUrl: t.streamUrl || `/api/theater/music/stream?ytId=${t.youtubeId || t.id}`,
                    youtubeId: t.youtubeId || t.id,
                    source: 'YouTube'
                }));

                const localTracks: MediaItem[] = (localData.results || [])
                    .filter((item: any) => item.type === 'music' || item.streamUrl?.includes('music') || item.artist || item.track)
                    .map((item: any) => ({
                        id: item.id || `local-${Math.random()}`,
                        name: item.title || item.name,
                        title: item.title || item.name,
                        path: item.path || '',
                        folder: item.folder || 'Music Library',
                        artist: item.artist || item.folder || 'Library Artist',
                        album: item.album || 'Music Library',
                        category: 'audio' as const,
                        extension: item.extension || 'mp3',
                        sizeBytes: item.sizeBytes || 0,
                        modifiedAt: item.modifiedAt || new Date().toISOString(),
                        duration: item.duration,
                        posterUrl: item.posterUrl,
                        streamUrl: item.streamUrl || `/api/theater/stream?id=${item.id}&type=music`,
                        source: 'Library'
                    }));

                setInPlayerSearchResultsLocal(localTracks);
                setInPlayerSearchResultsOnline(onlineTracks);
            } catch (e) {
                console.error('In-player search error:', e);
            } finally {
                setInPlayerSearchLoading(false);
            }
        };

        if (immediate) {
            executeSearch();
        } else {
            inPlayerSearchDebounceRef.current = setTimeout(executeSearch, 300);
        }
    };

    // Grab Online Track to Local Music Library
    const handleGrabTrackToLibrary = async (item: MediaItem) => {
        if (!item.youtubeId) return;
        setIsGrabbingTrack(true);
        toast.info(`Starting download for "${item.title}" into Music Library...`);
        try {
            const res = await fetch('/api/theater/music/grab', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    youtubeId: item.youtubeId,
                    title: item.title,
                    artist: item.artist,
                    album: item.album
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`Saved "${item.title}" into your Music folder!`);
            } else {
                toast.error(data.error || 'Failed to grab audio to library');
            }
        } catch (err: any) {
            toast.error(err.message || 'Network error grabbing track');
        } finally {
            setIsGrabbingTrack(false);
        }
    };

    // Diagnostics / Audiophile Specs
    const fetchAudioSpecs = async (item: MediaItem) => {
        setAudioSpecsItem(item);
        setIsAudioSpecsOpen(true);
        setAudioSpecsLoading(true);
        try {
            const res = await fetch(`/api/theater/diagnostics?path=${encodeURIComponent(item.path)}`);
            if (res.ok) {
                const data = await res.json();
                setAudioSpecsData(data);
            } else {
                setAudioSpecsData(null);
            }
        } catch {
            setAudioSpecsData(null);
        } finally {
            setAudioSpecsLoading(false);
        }
    };

    const refreshAudioOutputs = async () => {
        try {
            if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter(d => d.kind === 'audiooutput');
                setAvailableAudioOutputs(outputs);
            }
        } catch (e) {
            console.warn('Could not enumerate audio outputs:', e);
        }
    };

    const openCastPicker = async (target?: MediaItem) => {
        await refreshAudioOutputs();
        setIsCastPickerModalOpen(true);
    };

    const triggerGoogleCast = async (target?: MediaItem) => {
        const itemToCast = target || playingAudio;
        if (!itemToCast) return;

        // 1. Google Cast Web Framework
        try {
            if (typeof window !== 'undefined' && (window as any).cast?.framework) {
                const castContext = (window as any).cast.framework.CastContext.getInstance();
                try {
                    castContext.setOptions({
                        receiverApplicationId: (window as any).chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845',
                        autoJoinPolicy: (window as any).chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED
                    });
                } catch {}
                await castContext.requestSession();
                const session = castContext.getCurrentSession();
                if (session) {
                    const rawStream = itemToCast.streamUrl || `/api/theater/music/stream?ytId=${itemToCast.youtubeId || itemToCast.id}`;
                    // Absolute URL required for Google Cast receiver on Smart TV
                    const fullStream = rawStream.startsWith('http') ? rawStream : `${window.location.origin}${rawStream}`;
                    const mediaInfo = new (window as any).chrome.cast.media.MediaInfo(fullStream, 'audio/mpeg');
                    mediaInfo.metadata = new (window as any).chrome.cast.media.MusicTrackMediaMetadata();
                    mediaInfo.metadata.title = itemToCast.title;
                    mediaInfo.metadata.artist = itemToCast.artist;
                    if (itemToCast.album) mediaInfo.metadata.albumName = itemToCast.album;
                    if (itemToCast.posterUrl) {
                        const poster = itemToCast.posterUrl.startsWith('http') ? itemToCast.posterUrl : `${window.location.origin}${itemToCast.posterUrl}`;
                        mediaInfo.metadata.images = [{ url: poster }];
                    }
                    const request = new (window as any).chrome.cast.media.LoadRequest(mediaInfo);
                    await session.loadMedia(request);

                    // Crucial: Pause local audio on laptop so only TV plays!
                    if (audioRef.current) {
                        audioRef.current.pause();
                    }
                    setIsAudioPlaying(false);
                    setAudioPlaybackStatus('paused');
                    setIsCastingToGoogle(true);
                    const devName = session.getCastDevice()?.friendlyName || 'Smart TV';
                    setActiveCastDeviceName(devName);
                    toast.success(`Casting "${itemToCast.title}" to ${devName}!`);
                    setIsCastPickerModalOpen(false);
                    return;
                }
            }
        } catch (err: any) {
            console.warn('Google Cast framework error:', err);
        }

        // 2. Native Remote Playback API (Edge / Chrome / Android)
        if (audioRef.current && 'remote' in audioRef.current && typeof (audioRef.current as any).remote?.prompt === 'function') {
            try {
                await (audioRef.current as any).remote.prompt();
                toast.success('Connected to Cast device!');
                setIsCastPickerModalOpen(false);
                return;
            } catch (e: any) {
                if (e.name !== 'NotAllowedError' && e.name !== 'NotFoundError') {
                    toast.error(`Remote playback error: ${e.message}`);
                }
            }
        }

        // 3. Apple WebKit AirPlay Picker
        if (audioRef.current && typeof (audioRef.current as any).webkitShowPlaybackTargetPicker === 'function') {
            try {
                (audioRef.current as any).webkitShowPlaybackTargetPicker();
                setIsCastPickerModalOpen(false);
                return;
            } catch {}
        }

        toast.error('Could not initiate Google Cast session. Please verify your TV is powered on and on the same network.');
    };

    const stopGoogleCast = () => {
        try {
            if (typeof window !== 'undefined' && (window as any).cast?.framework) {
                const castContext = (window as any).cast.framework.CastContext.getInstance();
                castContext.endCurrentSession(true);
            }
        } catch {}
        setIsCastingToGoogle(false);
        setActiveCastDeviceName(null);
        toast.success('Cast disconnected. Playback resumed locally.');
        if (audioRef.current) {
            audioRef.current.play().catch(() => {});
            setIsAudioPlaying(true);
        }
    };

    const selectAudioOutputDevice = async (deviceId: string, deviceLabel?: string) => {
        try {
            if (audioRef.current && typeof (audioRef.current as any).setSinkId === 'function') {
                await (audioRef.current as any).setSinkId(deviceId);
                setSelectedAudioOutputId(deviceId);
                toast.success(`Audio output switched to: ${deviceLabel || 'Selected Device'}`);
                setIsCastPickerModalOpen(false);
            } else {
                toast.info('Browser audio output switching is not supported by your browser. Please select this device in your OS Sound Settings.');
            }
        } catch (err: any) {
            console.error('Failed to set audio sink:', err);
            toast.error(`Audio device error: ${err.message}`);
        }
    };

    const getYtId = (track: MediaItem | null): string | null => {
        if (!track) return null;
        if (track.youtubeId) return track.youtubeId.replace(/^yt-/, '').trim();
        if (track.id && track.id.startsWith('yt-')) return track.id.replace(/^yt-/, '').trim();
        if (track.streamUrl) {
            try {
                const url = new URL(track.streamUrl, 'http://localhost');
                const ytParam = url.searchParams.get('ytId');
                if (ytParam) return ytParam.replace(/^yt-/, '').trim();
                const vParam = url.searchParams.get('v');
                if (vParam) return vParam.trim();
            } catch {}
            const match = track.streamUrl.match(/(?:v=|\/embed\/|\/watch\?v=|\.be\/)([a-zA-Z0-9_-]{11})/);
            if (match && match[1]) return match[1];
        }
        return null;
    };

    // Track Selection & Audio Playback Handlers
    const playTrack = (track: MediaItem, queue?: MediaItem[], index?: number) => {
        if (!track) return;
        const rawTitle = track.title || track.name || 'Track';
        const rawArtist = track.artist || '';
        const { cleanArtist, cleanTitle } = sanitizeSongMetadata(rawTitle, rawArtist);
        const fallbackCover = getCoverFallbackUrl(cleanArtist || rawArtist, track.album, cleanTitle || rawTitle);
        const effectiveCover = (track.posterUrl && !track.posterUrl.includes('default')) ? track.posterUrl : fallbackCover;
        const ytId = getYtId(track);
        let effectiveStream = track.streamUrl || '';
        if (ytId && (!effectiveStream || effectiveStream.includes('youtube.com') || effectiveStream.includes('youtu.be'))) {
            effectiveStream = `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&format=mp3`;
        } else if (track.path && (!effectiveStream || effectiveStream.startsWith('/api/theater/stream?path='))) {
            effectiveStream = `/api/theater/stream?path=${encodeURIComponent(track.path)}`;
        } else if (!effectiveStream) {
            const q = `${cleanArtist || rawArtist} ${cleanTitle || rawTitle}`.trim();
            if (q) effectiveStream = `/api/theater/music/stream?q=${encodeURIComponent(q)}&format=mp3`;
        }
        const cleanTrack: MediaItem = {
            ...track,
            title: cleanTitle || rawTitle || 'Track',
            artist: cleanArtist || rawArtist || 'Artist',
            posterUrl: effectiveCover,
            streamUrl: effectiveStream,
            uploader: track.artist !== cleanArtist ? track.artist : (track as any).uploader
        };

        setBottomCoverError(false);
        setVinylCoverError(false);
        setNormalCoverError(false);

        // Pre-initialize track duration from metadata so player doesn't display 0:00 while loading
        let initDur = 0;
        if (cleanTrack.durationMs && cleanTrack.durationMs > 0) {
            initDur = cleanTrack.durationMs / 1000;
        } else if (cleanTrack.duration) {
            initDur = parseDurationString(cleanTrack.duration);
            if (initDur > 0 && !cleanTrack.durationMs) {
                cleanTrack.durationMs = initDur * 1000;
            }
        }
        setAudioDuration(initDur);
        setAudioCurrentTime(0);

        setPlayingAudio(cleanTrack);
        setIsAudioPlaying(true);
        if (queue && queue.length > 0) {
            setAudioQueue(queue);
            setQueueIndex(index !== undefined ? index : 0);
        } else {
            setAudioQueue([cleanTrack]);
            setQueueIndex(0);
        }

        // Automatic background album & metadata enrichment for YouTube and online tracks
        const isYtOrOnline = Boolean(
            !cleanTrack.album ||
            cleanTrack.album === 'YouTube Music' ||
            cleanTrack.album === 'Singles' ||
            cleanTrack.album === 'Single' ||
            cleanTrack.album === 'Track' ||
            cleanTrack.youtubeId ||
            cleanTrack.id?.startsWith('yt-') ||
            cleanTrack.source?.includes('YouTube')
        );

        if (isYtOrOnline && cleanTrack.artist && cleanTrack.title) {
            fetch(`/api/theater/music/match?artist=${encodeURIComponent(cleanTrack.artist)}&title=${encodeURIComponent(cleanTrack.title)}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data && Array.isArray(data.results) && data.results.length > 0) {
                        const match = data.results[0];
                        if (match && match.album) {
                            setPlayingAudio(prev => {
                                if (!prev || prev.id !== cleanTrack.id) return prev;
                                return {
                                    ...prev,
                                    album: match.album,
                                    albumId: match.collectionId || prev.albumId,
                                    releaseYear: match.releaseYear || prev.releaseYear,
                                    genre: match.genre || prev.genre,
                                    posterUrl: (prev.posterUrl && !prev.posterUrl.includes('ytimg') && !prev.posterUrl.includes('default')) 
                                        ? prev.posterUrl 
                                        : (match.coverUrl || prev.posterUrl)
                                };
                            });
                        }
                    }
                })
                .catch(() => {});
        }
    };

    // ── Fix Match & Metadata Override Handlers ──
    const openFixMatchModal = (track?: MediaItem) => {
        const target = track || playingAudio;
        if (!target) return;
        const initialQ = `${target.artist || ''} ${target.title || ''}`.trim();
        setFixMatchQuery(initialQ);
        setCustomMatchArtist(target.artist || '');
        setCustomMatchTitle(target.title || '');
        setCustomMatchAlbum(target.album || '');
        setIsFixMatchOpen(true);
        handleSearchFixMatch(initialQ);
    };

    const handleSearchFixMatch = async (queryStr: string) => {
        if (!queryStr.trim()) return;
        setFixMatchLoading(true);
        try {
            const res = await fetch(`/api/theater/music/match?q=${encodeURIComponent(queryStr.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setFixMatchResults(data.results || []);
            } else {
                setFixMatchResults([]);
            }
        } catch {
            setFixMatchResults([]);
        } finally {
            setFixMatchLoading(false);
        }
    };

    const applyFixMatch = async (matched: { artist: string; title: string; album?: string; coverUrl?: string }) => {
        if (!playingAudio) return;
        const updated: MediaItem = {
            ...playingAudio,
            artist: matched.artist,
            title: matched.title,
            album: matched.album || playingAudio.album,
            posterUrl: matched.coverUrl || playingAudio.posterUrl
        };

        setPlayingAudio(updated);
        setIsFixMatchOpen(false);
        toast.success(`Metadata matched to "${matched.title}" by ${matched.artist}!`);

        // Re-fetch lyrics & chords & artist info for the new verified metadata
        fetchLyrics(updated);
        fetchChords(updated);
        if (expandedSidePanel === 'artist') {
            fetchArtistInfo(matched.artist);
        }
    };

    const playAlbum = (tracks: MediaItem[], startIndex: number = 0) => {
        if (!tracks || !tracks.length) return;
        const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
        playTrack(tracks[idx], tracks, idx);
    };

    const handlePlayAlbumCard = async (album: any) => {
        const artist = artistData?.artistName || album.artistName || playingAudio?.artist || '';
        const title = album.title || album.name || 'Album';
        const query = `${artist} ${title}`.trim();
        toast.info(`Finding tracks for "${title}"...`);
        try {
            const res = await fetch(`/api/theater/music/online?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    playAlbum(data.results);
                    toast.success(`Playing album "${title}" (${data.results.length} songs)!`);
                    return;
                }
            }
        } catch {}
        playTrack({
            id: `album-${album.id || Date.now()}`,
            title,
            artist,
            album: title,
            posterUrl: album.coverUrl || album.posterUrl || album.remoteCover || album.coverArt,
            streamUrl: `/api/theater/music/stream?ytId=${album.id || ''}`
        } as any);
    };

    const togglePlayPause = () => {
        if (!playingAudio) return;
        const nextPlaying = !isAudioPlaying;
        setIsAudioPlaying(nextPlaying);

        if (audioRef.current) {
            try {
                if (nextPlaying) {
                    audioRef.current.play().catch(() => {});
                } else {
                    audioRef.current.pause();
                }
            } catch {}
        }
    };

    const nextTrack = () => {
        if (audioQueue.length === 0) return;
        let nextIdx = queueIndex + 1;
        if (isShuffle) {
            nextIdx = Math.floor(Math.random() * audioQueue.length);
        } else if (nextIdx >= audioQueue.length) {
            if (isRepeat) {
                nextIdx = 0;
            } else {
                return;
            }
        }
        setQueueIndex(nextIdx);
        setPlayingAudio(audioQueue[nextIdx]);
        setIsAudioPlaying(true);
    };

    const prevTrack = () => {
        if (audioQueue.length === 0) return;
        let prevIdx = queueIndex - 1;
        if (prevIdx < 0) {
            prevIdx = audioQueue.length - 1;
        }
        setQueueIndex(prevIdx);
        setPlayingAudio(audioQueue[prevIdx]);
        setIsAudioPlaying(true);
    };

    const seekTo = (time: number) => {
        setAudioCurrentTime(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    // ── Safe Effective Duration Fallback (Handles chunked stream Infinity/NaN) ──
    const effectiveDuration = Number.isFinite(audioDuration) && audioDuration > 0
        ? audioDuration
        : (playingAudio?.durationMs ? playingAudio.durationMs / 1000 : parseDurationString(playingAudio?.duration));

    const isActivelyPlaying = isAudioPlaying && audioPlaybackStatus === 'playing';

    // ── Vinyl DJ Scratch & Tonearm Interaction Handlers (Fixed & Solid) ──
    const effectiveTonearmAngle = tonearmCustomAngle !== null
        ? tonearmCustomAngle
        : isActivelyPlaying
            ? 18 + (effectiveDuration > 0 ? Math.min(16, (audioCurrentTime / effectiveDuration) * 16) : 6)
            : 0;

    const tonearmPointerStartRef = useRef<{ x: number; y: number } | null>(null);
    const discPointerStartRef = useRef<{ x: number; y: number } | null>(null);
    const hasDraggedTonearmRef = useRef(false);
    const hasDraggedDiscRef = useRef(false);

    const handleTonearmPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        tonearmPointerStartRef.current = { x: e.clientX, y: e.clientY };
        hasDraggedTonearmRef.current = false;
        isDraggingTonearmRef.current = true;
        wasPlayingBeforeDragRef.current = isAudioPlaying;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    const handleTonearmPointerMove = (e: React.PointerEvent) => {
        if (!isDraggingTonearmRef.current || !tonearmGimbalRef.current) return;
        if (tonearmPointerStartRef.current) {
            const dist = Math.hypot(e.clientX - tonearmPointerStartRef.current.x, e.clientY - tonearmPointerStartRef.current.y);
            if (dist > 6) {
                hasDraggedTonearmRef.current = true;
            }
        }
        if (!hasDraggedTonearmRef.current) return;

        const rect = tonearmGimbalRef.current.getBoundingClientRect();
        const pivotX = rect.left + rect.width / 2;
        const pivotY = rect.top + rect.height / 2;
        const dx = e.clientX - pivotX;
        const dy = e.clientY - pivotY;
        const angleRad = Math.atan2(-dx, dy);
        let mappedDeg = angleRad * (180 / Math.PI);
        mappedDeg = Math.max(0, Math.min(38, mappedDeg));
        setTonearmCustomAngle(mappedDeg);

        if (mappedDeg >= 14 && audioDuration > 0) {
            const cueRatio = Math.max(0, Math.min(1, (mappedDeg - 18) / 16));
            const cueTime = cueRatio * audioDuration;
            setScratchFeedback(`🎵 Cue: ${formatTime(cueTime)}`);
            seekTo(cueTime);
        } else {
            setScratchFeedback('⏹️ Resting Needle (Parked Off)');
        }
    };

    const handleTonearmPointerUp = (e: React.PointerEvent) => {
        if (!isDraggingTonearmRef.current) return;
        isDraggingTonearmRef.current = false;
        const wasDrag = hasDraggedTonearmRef.current;
        hasDraggedTonearmRef.current = false;
        tonearmPointerStartRef.current = null;

        if (!wasDrag) {
            // Pure click/tap on tonearm: cleanly toggle play/pause
            togglePlayPause();
            setTonearmCustomAngle(null);
            setScratchFeedback(null);
            return;
        }

        // Handle end of drag
        const finalAngle = tonearmCustomAngle ?? 0;
        setTonearmCustomAngle(null);

        if (finalAngle < 14) {
            // Needle parked off platter
            setIsAudioPlaying(false);
            if (audioRef.current) {
                audioRef.current.pause();
            }
            setScratchFeedback('⏹️ Needle Parked (Paused)');
            setTimeout(() => setScratchFeedback(null), 1200);
        } else {
            // Needle dropped on platter
            if (audioDuration > 0) {
                const cueRatio = Math.max(0, Math.min(1, (finalAngle - 18) / 16));
                const cueTime = cueRatio * audioDuration;
                seekTo(cueTime);
            }
            setIsAudioPlaying(true);
            if (audioRef.current) {
                audioRef.current.play().catch(() => {});
            }
            setTimeout(() => setScratchFeedback(null), 1200);
        }
    };

    const handleDiscPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!discPlatterRef.current) return;
        const rect = discPlatterRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        discPointerStartRef.current = { x: e.clientX, y: e.clientY };
        hasDraggedDiscRef.current = false;
        isDraggingDiscRef.current = true;
        wasPlayingBeforeDragRef.current = isAudioPlaying;
        lastPointerAngleRef.current = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    const handleDiscPointerMove = (e: React.PointerEvent) => {
        if (!isDraggingDiscRef.current || !discPlatterRef.current) return;
        if (discPointerStartRef.current) {
            const dist = Math.hypot(e.clientX - discPointerStartRef.current.x, e.clientY - discPointerStartRef.current.y);
            if (dist > 6) {
                hasDraggedDiscRef.current = true;
                setIsScratchingDisc(true);
                if (isAudioPlaying && audioRef.current) {
                    audioRef.current.pause();
                }
            }
        }
        if (!hasDraggedDiscRef.current) return;

        const rect = discPlatterRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        let delta = currentAngle - lastPointerAngleRef.current;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        lastPointerAngleRef.current = currentAngle;
        setDiscScratchAngle(prev => prev + delta);

        const timeDelta = (delta / 360) * 4.0;
        const newTime = Math.max(0, Math.min(audioDuration || 300, audioCurrentTime + timeDelta));
        seekTo(newTime);
        setScratchFeedback(`🎛️ ${delta >= 0 ? '⏩ Forward' : '⏪ Rewind'} ${formatTime(newTime)}`);
    };

    const handleDiscPointerUp = (e: React.PointerEvent) => {
        if (!isDraggingDiscRef.current) return;
        isDraggingDiscRef.current = false;
        setIsScratchingDisc(false);
        const wasDrag = hasDraggedDiscRef.current;
        hasDraggedDiscRef.current = false;
        discPointerStartRef.current = null;

        if (!wasDrag) {
            // Pure click/tap on vinyl platter: toggle play/pause
            togglePlayPause();
            setScratchFeedback(null);
            return;
        }

        // Resume playback after scratching only if was playing before
        if (wasPlayingBeforeDragRef.current) {
            setIsAudioPlaying(true);
            if (audioRef.current) {
                audioRef.current.play().catch(() => {});
            }
        }
        setTimeout(() => setScratchFeedback(null), 1000);
    };

    const handleVolumeChange = (v: number) => {
        setAudioVolume(v);
        setIsAudioMuted(v === 0);
        if (audioRef.current) {
            audioRef.current.volume = v;
            audioRef.current.muted = v === 0;
        }
    };

    const toggleMute = () => {
        const nextMuted = !isAudioMuted;
        setIsAudioMuted(nextMuted);
        if (audioRef.current) {
            audioRef.current.muted = nextMuted;
            if (!nextMuted && audioVolume === 0) {
                audioRef.current.volume = 0.8;
                setAudioVolume(0.8);
            }
        }
    };

    const closePlayer = () => {
        if (audioRef.current) audioRef.current.pause();
        try {
            fetch('/api/theater/session?sessionId=schedulearr-music-player', { method: 'DELETE' }).catch(() => {});
        } catch {}
        setPlayingAudio(null);
        setIsAudioPlaying(false);
        setIsExpandedPlayerOpen(false);
        setShowLyricsModal(false);
        setShowQueueDrawer(false);
    };

    const handleForceAudioTranscode = () => {
        if (!playingAudio || !audioRef.current) return;
        const separator = playingAudio.streamUrl.includes('?') ? '&' : '?';
        const transcodeUrl = `${playingAudio.streamUrl}${separator}transcode=audio&t=${Date.now()}`;
        setAudioPlaybackStatus('loading');
        setAudioPlaybackError(null);
        addAudioNerdLog('info', `Forcing Server-Side Audio Transcode: ${transcodeUrl}`);
        audioRef.current.src = transcodeUrl;
        audioRef.current.play().catch(e => {
            addAudioNerdLog('error', `Force transcode play() error: ${e.message}`);
        });
        toast.info('Switched to Server-Side MP3/AAC Transcode');
    };

    // Track if transcode retry was already attempted for current track to avoid infinite error loops
    const hasRetriedTranscodeRef = useRef(false);
    const hasAttemptedFallbackRef = useRef(false);

    // Stall watchdog for tracks that never start playing (server fetch timeout or dead stream)
    const audioStallWatchdogRef = useRef<NodeJS.Timeout | null>(null);

    const triggerAudioFallback = useCallback(async (track: MediaItem) => {
        if (!track) return;
        if (hasAttemptedFallbackRef.current) {
            addAudioNerdLog('warn', `Fallback stream already attempted for "${track.title}". Halting fallback loop.`);
            setIsAudioPlaying(false);
            setAudioPlaybackStatus('error');
            setAudioPlaybackError({
                name: 'STREAM_FAILED',
                message: `Could not stream "${track.title}".`,
                details: 'Direct stream and fallback both failed to play.',
                suggestion: 'Check server audio service or internet connection.'
            });
            return;
        }
        hasAttemptedFallbackRef.current = true;

        if (audioStallWatchdogRef.current) {
            clearTimeout(audioStallWatchdogRef.current);
            audioStallWatchdogRef.current = null;
        }

        toast.info(`Local file unavailable, auto-playing online stream for "${track.title}"...`, {
            id: `audio-fallback-${track.id || track.title}`
        });

        const q = `${track.artist || ''} ${track.title || track.name || ''}`.trim();
        if (!q) {
            setIsAudioPlaying(false);
            setAudioPlaybackStatus('error');
            return;
        }

        addAudioNerdLog('warn', `Server stream unreachable for "${track.title}". Auto-switching to online stream.`);
        setAudioPlaybackStatus('loading');

        try {
            const searchRes = await fetch(`/api/theater/music/online?q=${encodeURIComponent(q)}&limit=2`);
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (Array.isArray(searchData.results) && searchData.results.length > 0) {
                    const onlineItem = searchData.results[0];
                    const ytId = onlineItem.youtubeId || (onlineItem.id?.startsWith('yt-') ? onlineItem.id.replace('yt-', '') : '');
                    if (ytId) {
                        addAudioNerdLog('success', `Resolved online stream (${ytId}) for "${track.title}"`);
                        setPlayingAudio(prev => {
                            if (!prev || prev.id !== track.id) return prev;
                            return {
                                ...prev,
                                youtubeId: ytId,
                                streamUrl: `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&format=mp3`,
                                posterUrl: prev.posterUrl || onlineItem.posterUrl
                            };
                        });
                        return;
                    }
                }
            }
        } catch {}

        try {
            const serverFallbackUrl = `/api/theater/music/stream?q=${encodeURIComponent(q)}&format=mp3&transcode=audio`;
            addAudioNerdLog('info', `Attempting server-side search stream for "${q}"`);
            if (audioRef.current) {
                audioRef.current.src = serverFallbackUrl;
                audioRef.current.play().then(() => {
                    setIsAudioPlaying(true);
                    setAudioPlaybackStatus('playing');
                }).catch(() => {
                    setIsAudioPlaying(false);
                    setAudioPlaybackStatus('error');
                    setAudioPlaybackError({
                        name: 'STREAM_FAILED',
                        message: `Could not stream "${track.title}".`,
                        details: 'Server stream and online audio fallback both failed to respond.',
                        suggestion: 'Check your internet connection or server audio service.'
                    });
                });
            }
        } catch {
            setIsAudioPlaying(false);
            setAudioPlaybackStatus('error');
        }
    }, []);

    // When playingAudio changes, load source, fetch lyrics and fetch chords
    useEffect(() => {
        if (!playingAudio) {
            loadedTrackIdRef.current = null;
            return;
        }
        const trackKey = `${playingAudio.id}___${playingAudio.streamUrl}`;
        const isNewTrack = loadedTrackIdRef.current !== trackKey;
        loadedTrackIdRef.current = trackKey;

        if (!isNewTrack) {
            // Same track instance; do not reload audio elements or restart stream
            return;
        }

        const ytId = getYtId(playingAudio);
        if (audioStallWatchdogRef.current) clearTimeout(audioStallWatchdogRef.current);
        hasRetriedTranscodeRef.current = false;
        hasAttemptedFallbackRef.current = false;
        setAudioPlaybackStatus('loading');
        setAudioPlaybackError(null);
        fetchLyrics(playingAudio);
        fetchChords(playingAudio);

        if (audioRef.current) {
            let effectiveStreamUrl = playingAudio.streamUrl || '';
            if (ytId && (!effectiveStreamUrl || effectiveStreamUrl.includes('youtube.com') || effectiveStreamUrl.includes('youtu.be'))) {
                effectiveStreamUrl = `/api/theater/music/stream?ytId=${encodeURIComponent(ytId)}&format=mp3`;
            } else if (playingAudio.path && (!effectiveStreamUrl || effectiveStreamUrl.startsWith('/api/theater/stream?path='))) {
                effectiveStreamUrl = `/api/theater/stream?path=${encodeURIComponent(playingAudio.path)}`;
            } else if (!effectiveStreamUrl) {
                const q = `${playingAudio.artist || ''} ${playingAudio.title || playingAudio.name || ''}`.trim();
                effectiveStreamUrl = `/api/theater/music/stream?q=${encodeURIComponent(q)}&format=mp3`;
            }

            if (!effectiveStreamUrl) {
                addAudioNerdLog('warn', `No streamUrl or path for "${playingAudio.title}", auto-falling back to online stream`);
                triggerAudioFallback(playingAudio);
                return;
            }

            addAudioNerdLog('info', `Loading stream for "${playingAudio.title}"`, {
                url: effectiveStreamUrl,
                path: playingAudio.path
            });

            audioRef.current.src = effectiveStreamUrl;

            // Auto-detect playback stall: if within 8 seconds audio hasn't started playing, try transcode or fallback!
            if (audioStallWatchdogRef.current) clearTimeout(audioStallWatchdogRef.current);
            audioStallWatchdogRef.current = setTimeout(() => {
                if (audioRef.current && (audioRef.current.currentTime === 0 || audioRef.current.paused)) {
                    addAudioNerdLog('warn', `Watchdog detected audio not playing for "${playingAudio.title}".`);
                    if (playingAudio.path || playingAudio.isLocal) {
                        if (!hasRetriedTranscodeRef.current && !audioRef.current.src.includes('transcode=')) {
                            hasRetriedTranscodeRef.current = true;
                            const separator = effectiveStreamUrl.includes('?') ? '&' : '?';
                            const transcodeUrl = `${effectiveStreamUrl}${separator}transcode=audio&t=${Date.now()}`;
                            addAudioNerdLog('info', `Watchdog attempting server transcode: ${transcodeUrl}`);
                            audioRef.current.src = transcodeUrl;
                            audioRef.current.play().catch(() => {});
                        }
                    } else {
                        triggerAudioFallback(playingAudio);
                    }
                }
            }, 8000);

            audioRef.current.play().catch((e) => {
                addAudioNerdLog('warn', `Direct play() error: ${e.message}`);
                if (e.name === 'NotAllowedError') {
                    setIsAudioPlaying(false);
                    setAudioPlaybackStatus('paused');
                } else {
                    if (audioStallWatchdogRef.current) {
                        clearTimeout(audioStallWatchdogRef.current);
                        audioStallWatchdogRef.current = null;
                    }
                    triggerAudioFallback(playingAudio);
                }
            });
        }
    }, [playingAudio?.id, playingAudio?.streamUrl]);

    const fetchArtistInfo = async (artistName?: string) => {
        const target = (artistName || playingAudio?.artist || '').trim();
        if (!target) return;
        setArtistLoading(true);
        setSelectedArtistName(target);
        try {
            const res = await fetch(`/api/lidarr/lookup?term=${encodeURIComponent(target)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    const validResults = (data.results as any[]).filter((r: any) => {
                        const name = (r.artistName || '').toLowerCase();
                        if (target.toLowerCase() !== 'various artists' && (name === 'various artists' || name.includes('various artists'))) {
                            return false;
                        }
                        return true;
                    });
                    const candidatePool = validResults.length > 0 ? validResults : data.results;
                    const match = candidatePool.find((r: any) => r.artistName?.toLowerCase() === target.toLowerCase())
                        || candidatePool.find((r: any) => r.artistName?.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(r.artistName?.toLowerCase()))
                        || candidatePool[0];
                    if (match && target.toLowerCase() !== 'various artists' && match.artistName?.toLowerCase() === 'various artists') {
                        match.artistName = target;
                    }
                    setArtistData(match);
                    addAudioNerdLog('info', `Fetched artist info for "${target}"`, { source: data.source });
                } else {
                    setArtistData({ artistName: target, overview: `No biography found for "${target}".`, albums: [] });
                }
            } else {
                setArtistData({ artistName: target, overview: `Could not retrieve details for "${target}".`, albums: [] });
            }
        } catch (e: any) {
            addAudioNerdLog('warn', `Failed to fetch artist details: ${e.message}`);
            setArtistData({ artistName: target, overview: `Failed to connect to artist database.`, albums: [] });
        } finally {
            setArtistLoading(false);
        }
    };

    const openArtistDetails = (artistName?: string) => {
        const target = (artistName || playingAudio?.artist || '').trim();
        if (!target) return;
        setSelectedArtistName(target);
        setArtistSearchQuery('');
        setArtistViewMode('albums');
        fetchArtistInfo(target);
        if (isExpandedPlayerOpen) {
            setShowExpandedSidePanel(true);
            setExpandedSidePanel('info' as any);
            setInfoSubTab('artist');
        } else {
            setShowArtistModal(true);
        }
    };

    const handleDownloadFullAlbum = async (album: any) => {
        if (!album) return;
        const albumTitle = album.title || album.name;
        const artName = artistData?.artistName || album.artistName || selectedArtistName || '';
        const albKey = String(album.id || album.lidarrId || albumTitle);

        setDownloadingAlbumKey(albKey);
        try {
            const params = new URLSearchParams();
            if (album.id) params.set('id', String(album.id));
            if (artName) params.set('artist', artName);
            if (albumTitle) params.set('album', albumTitle);

            const res = await fetch(`/api/theater/music/album?${params.toString()}`);
            let tracks: MediaItem[] = [];
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.tracks) && data.tracks.length > 0) {
                    tracks = data.tracks;
                }
            }

            if (tracks.length === 0) {
                tracks = [{
                    id: `album-${album.id || Date.now()}`,
                    title: albumTitle,
                    name: albumTitle,
                    artist: artName,
                    album: albumTitle,
                    posterUrl: album.coverUrl || album.posterUrl,
                    streamUrl: `/api/theater/music/stream?q=${encodeURIComponent(artName + ' ' + albumTitle)}`,
                    category: 'audio',
                    extension: 'mp3',
                    sizeBytes: 0,
                    modifiedAt: new Date().toISOString()
                } as MediaItem];
            }

            handleDownloadAlbum(tracks, albumTitle);
        } catch (err: any) {
            console.error('Error fetching album tracks for download:', err);
            toast.error(`Could not load tracks for "${albumTitle}"`);
        } finally {
            setDownloadingAlbumKey(null);
        }
    };

    const processedArtistAlbums = useMemo(() => {
        if (!artistData?.albums || !Array.isArray(artistData.albums)) return [];
        let list = [...artistData.albums];

        if (artistAlbumFilter === 'full_albums') {
            list = list.filter((a: any) => a.isFullAlbum);
        }

        if (artistSearchQuery.trim()) {
            const q = artistSearchQuery.toLowerCase().trim();
            list = list.filter((a: any) => (a.title || a.name || '').toLowerCase().includes(q));
        }

        list.sort((a: any, b: any) => {
            if (artistAlbumSort === 'popularity') {
                return (a.popularityRank || 999) - (b.popularityRank || 999);
            }
            if (artistAlbumSort === 'newest') {
                return (b.year || 0) - (a.year || 0);
            }
            if (artistAlbumSort === 'oldest') {
                return (a.year || 0) - (b.year || 0);
            }
            if (artistAlbumSort === 'alphabetical') {
                return (a.title || '').localeCompare(b.title || '');
            }
            return 0;
        });

        return list;
    }, [artistData?.albums, artistAlbumFilter, artistAlbumSort, artistSearchQuery]);

    const processedArtistSongs = useMemo(() => {
        if (!artistData?.topSongs || !Array.isArray(artistData.topSongs)) return [];
        let list = [...artistData.topSongs];

        if (artistSongFilter === 'local_only') {
            list = list.filter((s: any) => s.isLocal || s.downloadStatus === 'downloaded');
        }

        if (artistSearchQuery.trim()) {
            const q = artistSearchQuery.toLowerCase().trim();
            list = list.filter((s: any) => (s.title || s.name || '').toLowerCase().includes(q) || (s.album || '').toLowerCase().includes(q));
        }

        list.sort((a: any, b: any) => {
            if (artistSongSort === 'popularity') {
                return (a.popularityRank || 999) - (b.popularityRank || 999);
            }
            if (artistSongSort === 'newest') {
                return (b.year || 0) - (a.year || 0);
            }
            if (artistSongSort === 'oldest') {
                return (a.year || 0) - (b.year || 0);
            }
            if (artistSongSort === 'alphabetical') {
                return (a.title || '').localeCompare(b.title || '');
            }
            return 0;
        });

        return list;
    }, [artistData?.topSongs, artistSongFilter, artistSongSort, artistSearchQuery]);

    const fetchAlbumInfo = async (albumName?: string, artistName?: string, albumId?: string | number) => {
        const aName = (albumName || playingAudio?.album || '').trim();
        const artName = (artistName || playingAudio?.artist || '').trim();
        const id = albumId || (playingAudio as any)?.albumId;

        if (!aName && !id && !artName) return;

        setAlbumLoading(true);
        setSelectedAlbumTitle(aName || 'Album');
        try {
            const params = new URLSearchParams();
            if (id) params.set('id', String(id));
            if (artName) params.set('artist', artName);
            if (aName) params.set('album', aName);

            const res = await fetch(`/api/theater/music/album?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                if (data.album) {
                    const clean = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
                    const base = (s: string) => clean((s || '').split(/[:\-\—\(\[]/)[0]);
                    const isMatch = !aName || clean(data.album.title) === clean(aName) || base(data.album.title) === base(aName) || clean(data.album.title).includes(base(aName)) || clean(aName).includes(base(data.album.title));

                    if (isMatch) {
                        setAlbumData(data.album);
                        setAlbumTracks(Array.isArray(data.tracks) ? data.tracks : []);
                        addAudioNerdLog('info', `Fetched album details for "${data.album.title}" by ${data.album.artist}`, { tracksCount: data.tracks?.length });
                    } else {
                        setAlbumData({ title: aName || 'Album', artist: artName || 'Artist', tracks: [] });
                        setAlbumTracks([]);
                    }
                } else {
                    setAlbumData({ title: aName || 'Album', artist: artName || 'Artist', tracks: [] });
                    setAlbumTracks([]);
                }
            } else {
                setAlbumData({ title: aName || 'Album', artist: artName || 'Artist', tracks: [] });
                setAlbumTracks([]);
            }
        } catch (e: any) {
            console.error('Failed to fetch album info:', e);
            setAlbumData({ title: aName || 'Album', artist: artName || 'Artist', tracks: [] });
            setAlbumTracks([]);
        } finally {
            setAlbumLoading(false);
        }
    };

    const openAlbumDetails = (albumName?: string, artistName?: string, albumId?: string | number) => {
        const aName = (albumName || playingAudio?.album || '').trim();
        const artName = (artistName || playingAudio?.artist || '').trim();
        const id = albumId || (playingAudio as any)?.albumId;

        fetchAlbumInfo(aName, artName, id);
        if (isExpandedPlayerOpen) {
            setShowExpandedSidePanel(true);
            setExpandedSidePanel('info' as any);
            setInfoSubTab('album');
        } else {
            setShowAlbumModal(true);
        }
    };

    return (
        <MusicPlayerContext.Provider
            value={{
                playingAudio,
                isAudioPlaying,
                audioCurrentTime,
                audioDuration,
                audioQueue,
                queueIndex,
                isShuffle,
                isRepeat,
                audioVolume,
                isAudioMuted,
                isExpandedPlayerOpen,
                playTrack,
                playAlbum,
                togglePlayPause,
                nextTrack,
                prevTrack,
                seekTo,
                setVolume: handleVolumeChange,
                toggleMute,
                toggleShuffle: () => setIsShuffle(!isShuffle),
                toggleRepeat: () => setIsRepeat(!isRepeat),
                closePlayer,
                openExpandedPlayer: () => setIsExpandedPlayerOpen(true),
                closeExpandedPlayer: () => setIsExpandedPlayerOpen(false),
                openArtistDetails,
                openAlbumDetails,
                openDiagnostics: () => setShowAudioNerdModal(true),
                handleDownloadTrack,
                handleDownloadAlbum,
                addToQueue,
                playerAnimationMode,
                changePlayerAnimationMode,
                playbackSpeed,
                handlePlaybackSpeedChange,
                cyclePlaybackSpeed,
                skipSeconds
            }}
        >
            {/* Global Persistent Audio Element for all Audio Playback (Local, Plex, YouTube, Online) */}
            <audio
                ref={audioRef}
                preload="auto"
                onLoadStart={() => {
                    setAudioPlaybackStatus('loading');
                    setAudioPlaybackError(null);
                    addAudioNerdLog('info', 'Audio loadstart event');
                }}
                onWaiting={() => {
                    setAudioPlaybackStatus('buffering');
                    addAudioNerdLog('warn', 'Audio stream buffering/waiting for data');
                }}
                onCanPlay={() => {
                    addAudioNerdLog('success', 'Audio stream ready (canplay)');
                    if (audioPlaybackStatus === 'loading' || audioPlaybackStatus === 'buffering') {
                        setAudioPlaybackStatus(isAudioPlaying ? 'playing' : 'paused');
                    }
                    if (isAudioPlaying && audioRef.current?.paused) {
                        audioRef.current.play().catch(e => {
                            addAudioNerdLog('warn', `Autoplay prevented or paused: ${e.message}`);
                            setIsAudioPlaying(false);
                            setAudioPlaybackStatus('paused');
                        });
                    }
                }}
                onPlaying={() => {
                    if (audioStallWatchdogRef.current) {
                        clearTimeout(audioStallWatchdogRef.current);
                        audioStallWatchdogRef.current = null;
                    }
                    setAudioPlaybackStatus('playing');
                    setIsAudioPlaying(true);
                    setAudioPlaybackError(null);
                    addAudioNerdLog('success', 'Audio stream playing');
                }}
                onPause={() => {
                    setAudioPlaybackStatus('paused');
                    setIsAudioPlaying(false);
                    addAudioNerdLog('info', 'Audio paused');
                }}
                onStalled={() => {
                    addAudioNerdLog('warn', 'Audio network stream stalled');
                }}
                onTimeUpdate={() => {
                    if (audioRef.current) {
                        const cur = audioRef.current.currentTime;
                        setAudioCurrentTime(cur);
                        // Bookmark position for long-form / audiobook tracks every 4 seconds
                        if (playingAudio && cur > 5 && Math.floor(cur) % 4 === 0) {
                            try {
                                const bookmarkKey = `schedulearr_pos_${playingAudio.id || playingAudio.path || playingAudio.title}`;
                                localStorage.setItem(bookmarkKey, String(Math.floor(cur)));
                            } catch {}
                        }
                    }
                }}
                onLoadedMetadata={() => {
                    if (audioRef.current) {
                        const raw = audioRef.current.duration;
                        const fallbackDur = playingAudio?.durationMs ? playingAudio.durationMs / 1000 : parseDurationString(playingAudio?.duration);
                        const finalDur = Number.isFinite(raw) && raw > 0 ? raw : fallbackDur;
                        setAudioDuration(finalDur);
                        if (playbackSpeed !== 1.0) {
                            audioRef.current.playbackRate = playbackSpeed;
                        }
                        if (playingAudio) {
                            try {
                                const bookmarkKey = `schedulearr_pos_${playingAudio.id || playingAudio.path || playingAudio.title}`;
                                const savedPos = localStorage.getItem(bookmarkKey);
                                if (savedPos) {
                                    const posNum = parseFloat(savedPos);
                                    if (posNum > 10 && posNum < (finalDur - 15)) {
                                        audioRef.current.currentTime = posNum;
                                        setAudioCurrentTime(posNum);
                                        toast.info(`Resumed from ${Math.floor(posNum / 60)}:${String(Math.floor(posNum % 60)).padStart(2, '0')}`);
                                    }
                                }
                            } catch {}
                        }
                        addAudioNerdLog('info', `Loaded audio metadata: duration ${finalDur > 0 ? finalDur.toFixed(1) + 's' : 'live'}`);
                    }
                }}
                onEnded={() => {
                    nextTrack();
                }}
                onError={() => {
                    if (!playingAudio || !audioRef.current?.src || audioRef.current?.src === '' || (typeof window !== 'undefined' && audioRef.current?.src === window.location.href)) {
                        return;
                    }
                    if (audioStallWatchdogRef.current) {
                        clearTimeout(audioStallWatchdogRef.current);
                        audioStallWatchdogRef.current = null;
                    }
                    const err = audioRef.current?.error;
                    const codeMap: Record<number, string> = {
                        1: 'MEDIA_ERR_ABORTED (User aborted fetching)',
                        2: 'MEDIA_ERR_NETWORK (Network connection error)',
                        3: 'MEDIA_ERR_DECODE (Decoder error / Unsupported format)',
                        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED (Format / Codec unsupported by browser)'
                    };
                    const codeName = err?.code ? codeMap[err.code] || `Code ${err.code}` : 'Media Playback Error';
                    addAudioNerdLog('error', `Playback error: ${codeName}`, {
                        src: audioRef.current?.currentSrc,
                        networkState: audioRef.current?.networkState,
                        readyState: audioRef.current?.readyState
                    });

                    if (audioStallWatchdogRef.current) {
                        clearTimeout(audioStallWatchdogRef.current);
                        audioStallWatchdogRef.current = null;
                    }

                    const isLocalStream = Boolean(playingAudio.path || (audioRef.current?.src && audioRef.current.src.includes('/api/theater/stream?path=')));

                    if (isLocalStream) {
                        // Instant fallback for local files not on server (0.05s)
                        triggerAudioFallback(playingAudio);
                        return;
                    }

                    // Automatic fallback to Server-Side Audio Transcode for other sources (attempted ONCE only)
                    if (playingAudio.streamUrl && !hasRetriedTranscodeRef.current && !audioRef.current?.src.includes('transcode=')) {
                        hasRetriedTranscodeRef.current = true;
                        const separator = playingAudio.streamUrl.includes('?') ? '&' : '?';
                        const transcodeUrl = `${playingAudio.streamUrl}${separator}transcode=audio&t=${Date.now()}`;
                        addAudioNerdLog('info', `Auto-retrying with Server-Side Audio Transcode: ${transcodeUrl}`);
                        setAudioPlaybackStatus('loading');
                        if (audioRef.current) {
                            audioRef.current.src = transcodeUrl;
                            audioRef.current.play().catch(() => {
                                triggerAudioFallback(playingAudio);
                            });
                        }
                    } else {
                        triggerAudioFallback(playingAudio);
                    }
                }}
            />

            {children}

            {/* ══════════════════════════════════════════════════════════════
               GLOBAL PERSISTENT MUSIC STUDIO BOTTOM BAR (ACROSS ALL PAGES)
               ══════════════════════════════════════════════════════════════ */}
            {playingAudio && (
                <div className="fixed bottom-[5.5rem] sm:bottom-4 left-3 right-3 sm:left-6 sm:right-6 max-w-6xl mx-auto z-[180] bg-zinc-950/95 border border-zinc-800/90 backdrop-blur-2xl p-2.5 sm:p-4 px-3.5 sm:px-6 rounded-[1.75rem] sm:rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 select-none overflow-hidden">
                    {/* Mini Top Edge Progress Bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800/60">
                        <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-150"
                            style={{ width: `${effectiveDuration > 0 ? Math.min(100, Math.max(0, (audioCurrentTime / effectiveDuration) * 100)) : 0}%` }}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2.5 sm:gap-6">
                        {/* Track Artwork & Info (Click to Expand Studio Screen) */}
                        <div
                            onClick={() => setIsExpandedPlayerOpen(true)}
                            className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 max-w-[150px] sm:max-w-[280px] cursor-pointer group/art shrink"
                            title="Click to open Expanded Player with Big Art & Synced Lyrics"
                        >
                            {playerAnimationMode === 'art' ? (
                                /* Simple Art: Standard square album cover art */
                                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 relative shadow-md group-hover/art:scale-105 group-hover/art:border-amber-500/50 transition-all">
                                    {playingAudio.posterUrl && !bottomCoverError ? (
                                        <img
                                            src={playingAudio.posterUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            onError={() => {
                                                const fallback = getCoverFallbackUrl(playingAudio.artist, playingAudio.album, playingAudio.title);
                                                if (playingAudio.posterUrl !== fallback) {
                                                    setPlayingAudio(prev => prev ? { ...prev, posterUrl: fallback } : prev);
                                                } else {
                                                    setBottomCoverError(true);
                                                }
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-tr from-amber-600/20 to-zinc-900 flex items-center justify-center text-amber-400">
                                            <Music size={20} />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/art:opacity-100 flex items-center justify-center transition-opacity">
                                        <Maximize size={14} className="text-white" />
                                    </div>
                                </div>
                            ) : (
                                /* Vinyl Record or Spinning Disk: Mini rotating vinyl disc */
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        togglePlayPause();
                                    }}
                                    className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-600 p-0.5 shadow-md flex items-center justify-center border border-zinc-600/50 shrink-0 relative group-hover/art:scale-105 group-hover/art:border-amber-500/50 transition-all cursor-pointer"
                                    title={isAudioPlaying ? "Click Mini Vinyl to Pause" : "Click Mini Vinyl to Play"}
                                >
                                    <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center shadow-inner overflow-hidden">
                                        <div
                                            className="relative w-[96%] h-[96%] rounded-full bg-black flex items-center justify-center overflow-hidden"
                                            style={{
                                                animation: 'vinyl-spin 8s linear infinite',
                                                animationPlayState: isActivelyPlaying ? 'running' : 'paused'
                                            }}
                                        >
                                            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#000000_30%,_#18181b_31%,_#09090b_45%,_#1f1f23_46%,_#000000_65%,_#18181b_66%,_#000000_100%)] opacity-90 pointer-events-none" />
                                            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.12)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.12)_225deg,transparent_270deg)] pointer-events-none" />

                                            {/* Center Label (Artwork) */}
                                            <div className="relative w-[75%] h-[75%] rounded-full overflow-hidden border border-amber-500/60 shadow flex items-center justify-center z-10 pointer-events-none">
                                                {playingAudio.posterUrl && !bottomCoverError ? (
                                                    <img
                                                        src={playingAudio.posterUrl}
                                                        alt=""
                                                        className="w-full h-full object-cover pointer-events-none"
                                                        onError={() => {
                                                            const fallback = getCoverFallbackUrl(playingAudio.artist, playingAudio.album, playingAudio.title);
                                                            if (playingAudio.posterUrl !== fallback) {
                                                                setPlayingAudio(prev => prev ? { ...prev, posterUrl: fallback } : prev);
                                                            } else {
                                                                setBottomCoverError(true);
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-[8px] font-black text-black">
                                                        ♫
                                                    </div>
                                                )}
                                                <div className="absolute w-2 h-2 rounded-full bg-zinc-950 border border-zinc-400 flex items-center justify-center z-20">
                                                    <div className="w-0.5 h-0.5 rounded-full bg-amber-400" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover/art:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                        {isAudioPlaying ? <Pause size={12} className="text-white" /> : <Play size={12} className="text-white ml-0.5" />}
                                    </div>
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    <h4 className="font-bold text-white text-xs sm:text-base truncate leading-snug group-hover/art:text-amber-400 transition-colors">{playingAudio.title}</h4>
                                    {audioPlaybackStatus === 'loading' || audioPlaybackStatus === 'buffering' ? (
                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 animate-pulse border border-amber-500/30">
                                            Load
                                        </span>
                                    ) : (() => {
                                        const srcInfo = getAudioSourceInfo(playingAudio, audioRef.current?.src);
                                        return (
                                            <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 shadow-sm ${srcInfo.colorClass}`} title={`${srcInfo.label} — ${srcInfo.sublabel}`}>
                                                {srcInfo.isLocal ? <HardDrive size={9} className="shrink-0" /> : srcInfo.isPlex ? <Server size={9} className="shrink-0" /> : srcInfo.isYt ? <Youtube size={9} className="shrink-0" /> : <Globe size={9} className="shrink-0" />}
                                                <span>{srcInfo.shortLabel || srcInfo.label}</span>
                                            </span>
                                        );
                                    })()}
                                </div>
                                <div className="flex items-center gap-1.5 truncate">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openArtistDetails(playingAudio.artist);
                                        }}
                                        className="text-[11px] sm:text-xs text-zinc-400 hover:text-amber-300 hover:underline truncate text-left transition-colors"
                                        title={`View artist biography & albums for ${playingAudio.artist || 'Artist'}`}
                                    >
                                        {playingAudio.artist || playingAudio.folder || 'Artist'}
                                    </button>
                                    {playingAudio.album && (
                                        <>
                                            <span className="text-[10px] text-zinc-600">•</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openAlbumDetails(playingAudio.album, playingAudio.artist, (playingAudio as any).albumId);
                                                }}
                                                className="text-[11px] sm:text-xs text-zinc-400 hover:text-amber-300 hover:underline truncate text-left transition-colors inline-flex items-center gap-1"
                                                title={`View album "${playingAudio.album}"`}
                                            >
                                                <Disc size={11} className="text-amber-400/80 shrink-0" />
                                                <span className="truncate">{playingAudio.album}</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                                {playingAudio.path && (
                                    <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400/90 truncate select-all" title={`Server file: ${playingAudio.path}`}>
                                        <Folder size={10} className="shrink-0 text-emerald-500" />
                                        <span className="truncate">{playingAudio.path}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Center Playback Controls & Seekbar */}
                        <div className="flex-1 flex flex-col items-center space-y-1 max-w-xs sm:max-w-md px-1 sm:px-2 shrink-0">
                            <div className="flex items-center gap-2 sm:gap-4">
                                <button
                                    onClick={() => setIsShuffle(!isShuffle)}
                                    className={`p-1.5 sm:p-2 rounded-xl transition-colors hidden sm:flex ${isShuffle ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Shuffle Queue"
                                >
                                    <Shuffle size={15} />
                                </button>

                                <button
                                    onClick={prevTrack}
                                    className="p-1 sm:p-2 text-zinc-400 hover:text-white transition-colors"
                                    title="Previous Track"
                                >
                                    <SkipBack size={16} />
                                </button>

                                <button
                                    onClick={togglePlayPause}
                                    disabled={audioPlaybackStatus === 'loading'}
                                    className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/20 transition-all scale-100 active:scale-95 disabled:opacity-75 shrink-0"
                                    title={audioPlaybackStatus === 'loading' ? 'Loading Audio...' : isAudioPlaying ? 'Pause' : 'Play'}
                                >
                                    {audioPlaybackStatus === 'loading' || audioPlaybackStatus === 'buffering' ? (
                                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    ) : isAudioPlaying ? (
                                        <Pause size={17} />
                                    ) : (
                                        <Play size={17} className="ml-0.5" />
                                    )}
                                </button>

                                <button
                                    onClick={nextTrack}
                                    className="p-1 sm:p-2 text-zinc-400 hover:text-white transition-colors"
                                    title="Next Track"
                                >
                                    <SkipForward size={16} />
                                </button>

                                <button
                                    onClick={() => setIsRepeat(!isRepeat)}
                                    className={`p-1.5 sm:p-2 rounded-xl transition-colors flex cursor-pointer ${isRepeat ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title={isRepeat ? "Repeat: Active" : "Repeat: Off"}
                                >
                                    <Repeat size={15} />
                                </button>
                            </div>

                            {/* Desktop Seekbar */}
                            <div className="w-full hidden sm:flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                                <span className="w-8 text-right shrink-0">{formatTime(audioCurrentTime)}</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={effectiveDuration || 100}
                                    value={audioCurrentTime}
                                    onChange={e => seekTo(Number(e.target.value))}
                                    className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 min-w-0"
                                />
                                <span className="w-8 shrink-0">{formatTime(effectiveDuration)}</span>
                            </div>
                        </div>

                        {/* Right Quick Controls */}
                        <div className="flex items-center gap-1.5 sm:gap-2 justify-end shrink-0">
                            {/* Minimized Volume Control Slider */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 shrink-0">
                                <button
                                    onClick={toggleMute}
                                    className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                    title={isAudioMuted ? "Unmute" : "Mute"}
                                >
                                    {isAudioMuted || audioVolume === 0 ? (
                                        <VolumeX size={15} className="text-rose-400" />
                                    ) : (
                                        <Volume2 size={15} className="text-amber-400" />
                                    )}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={isAudioMuted ? 0 : audioVolume}
                                    onChange={e => handleVolumeChange(Number(e.target.value))}
                                    className="w-16 sm:w-20 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    title={`Volume: ${Math.round(audioVolume * 100)}%`}
                                />
                            </div>

                            {/* Cast Quick Button */}
                            <button
                                onClick={() => openCastPicker(playingAudio)}
                                className={`p-2 sm:px-2.5 sm:py-2 rounded-xl border text-xs font-bold flex items-center transition-all cursor-pointer ${
                                    isCastingToGoogle ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                                title="Cast to Smart TV / Audio Output Device"
                            >
                                <Cast size={15} />
                            </button>



                            {/* Playback Queue */}
                            <button
                                onClick={() => setShowQueueDrawer(!showQueueDrawer)}
                                className={`p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                                    showQueueDrawer ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                                title="Toggle Playback Queue"
                            >
                                <ListMusic size={15} />
                                <span className="hidden sm:inline text-xs font-mono">{audioQueue.length}</span>
                            </button>

                            {/* Full Studio Expand */}
                            <button
                                onClick={() => setIsExpandedPlayerOpen(true)}
                                className="p-2 sm:p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-black border border-amber-500/30 text-xs font-bold transition-all"
                                title="Open Full Turntable Studio"
                            >
                                <Maximize size={15} />
                            </button>

                            {/* Dismiss Player */}
                            <button
                                onClick={closePlayer}
                                className="p-1.5 sm:p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all ml-0.5"
                                title="Dismiss Player"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               AUDIO PLAYBACK QUEUE DRAWER
               ══════════════════════════════════════════════════════════════ */}
            {showQueueDrawer && playingAudio && (
                <div className="fixed bottom-36 sm:bottom-24 right-3 sm:right-6 w-full max-w-sm z-[185] bg-zinc-950/95 border border-zinc-800 rounded-3xl p-4 shadow-2xl space-y-3 animate-in slide-in-from-bottom-5 duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                        <span className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                            <ListMusic size={14} /> Queue ({audioQueue.length})
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setAudioQueue([playingAudio])}
                                className="text-[10px] text-zinc-500 hover:text-red-400 font-bold px-2 py-1"
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => setShowQueueDrawer(false)}
                                className="p-1 text-zinc-500 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                        {audioQueue.map((track, i) => {
                            const isCurrent = i === queueIndex;
                            return (
                                <div
                                    key={`${track.id}-${i}`}
                                    onClick={() => {
                                        setQueueIndex(i);
                                        setPlayingAudio(track);
                                        setIsAudioPlaying(true);
                                    }}
                                    className={`p-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                        isCurrent ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-900/50 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <div className="truncate mr-2">
                                        <p className="truncate">{track.title}</p>
                                        <span className="text-[9px] text-zinc-500">{track.artist || 'Artist'}</span>
                                    </div>
                                    {isCurrent && <Volume2 size={14} className="text-amber-400 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               EXPANDED NOW PLAYING SCREEN WITH BIG ARTWORK & RIGHT PANEL
               ══════════════════════════════════════════════════════════════ */}
            {isExpandedPlayerOpen && playingAudio && (
                <div className="fixed inset-0 z-[275] bg-black/95 backdrop-blur-3xl flex flex-col p-3 sm:p-5 lg:p-6 max-h-screen overflow-hidden select-none">
                    {/* Ambient Blurred Background Art */}
                    {playingAudio.posterUrl && (
                        <div
                            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-15 pointer-events-none scale-125"
                            style={{ backgroundImage: `url(${playingAudio.posterUrl})` }}
                        />
                    )}

                    {/* Top-Right Window Controls: Small Player (Minimalist), Minimize Player (Collapse), and Close Player */}
                    <div className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 z-50 flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 backdrop-blur-xl shadow-2xl">
                        {/* 1. Small Player (Minimalist Platter View) */}
                        <button
                            onClick={() => setIsMinimalistVinylMode(prev => !prev)}
                            className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer shadow-md ${
                                isMinimalistVinylMode
                                    ? 'bg-amber-500 text-black border-amber-400 ring-2 ring-amber-400/40'
                                    : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800'
                            }`}
                            title={isMinimalistVinylMode ? "Restore Full Studio Dashboard" : "Small Player (Minimalist Platter View)"}
                        >
                            {isMinimalistVinylMode ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                        </button>

                        {/* 2. Minimize to Bottom Bar */}
                        <button
                            onClick={() => setIsExpandedPlayerOpen(false)}
                            className="p-2 sm:p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer shadow-md"
                            title="Minimize Player (Collapse to Bottom Bar)"
                        >
                            <ChevronDown size={16} />
                        </button>

                        {/* 3. Close Player */}
                        <button
                            onClick={() => {
                                setIsExpandedPlayerOpen(false);
                                setIsMinimalistVinylMode(false);
                            }}
                            className="p-2 sm:p-2.5 rounded-xl bg-zinc-900/90 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-500/40 transition-all cursor-pointer shadow-md"
                            title="Close Player"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Mobile Segmented Deck vs Studio Switch (< lg only) */}
                    <div className="lg:hidden flex items-center gap-2 pt-2 px-1 shrink-0">
                        <div className="flex-1 bg-zinc-950 p-1 rounded-2xl border border-zinc-800 flex items-center gap-1">
                            <button
                                onClick={() => setShowExpandedSidePanel(false)}
                                className={`flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                                    !showExpandedSidePanel
                                        ? 'bg-amber-500 text-black shadow-md'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                                <Disc size={13} /> Turntable Deck
                            </button>
                            <button
                                onClick={() => setShowExpandedSidePanel(true)}
                                className={`flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                                    showExpandedSidePanel
                                        ? 'bg-amber-500 text-black shadow-md'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                                <Mic2 size={13} /> Lyrics &amp; Studio
                            </button>
                        </div>
                    </div>

                    {/* Main Stage: Minimalist Vinyl Platter Mode vs Full Dashboard Grid */}
                    {isMinimalistVinylMode ? (
                        <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-between max-w-lg mx-auto w-full py-2 sm:py-4 select-none">
                            {/* Minimalist Top Bar: Title + Return to Regular Player Button */}
                            <div className="w-full flex items-center justify-between px-3 py-1.5 bg-zinc-950/80 backdrop-blur-md rounded-2xl border border-zinc-800/80 shadow-inner shrink-0 mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                                    <span className="text-xs sm:text-sm font-black uppercase text-amber-400 tracking-wider">Minimalist Vinyl Player</span>
                                </div>
                                <button
                                    onClick={() => setIsMinimalistVinylMode(false)}
                                    className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer hover:scale-105 active:scale-95"
                                    title="Return to Regular Player"
                                >
                                    <Maximize2 size={15} />
                                    <span>Return to Regular Player</span>
                                </button>
                            </div>

                            {/* Minimalist Rotating Vinyl Disc */}
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    togglePlayPause();
                                }}
                                className="relative w-60 h-60 sm:w-80 sm:h-80 my-auto flex items-center justify-center cursor-pointer select-none group/disc"
                                title={isAudioPlaying ? "Click Vinyl Record to Pause" : "Click Vinyl Record to Play"}
                            >
                                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-600 p-1.5 shadow-2xl flex items-center justify-center border border-zinc-600/50 pointer-events-none group-hover/disc:border-amber-500/50 transition-colors">
                                    <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center shadow-inner">
                                        <div
                                            className="relative w-[96%] h-[96%] rounded-full bg-black shadow-2xl flex items-center justify-center overflow-hidden"
                                            style={{
                                                animation: 'vinyl-spin 8s linear infinite',
                                                animationPlayState: isActivelyPlaying ? 'running' : 'paused'
                                            }}
                                        >
                                            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#000000_30%,_#18181b_31%,_#09090b_45%,_#1f1f23_46%,_#000000_65%,_#18181b_66%,_#000000_100%)] opacity-90 pointer-events-none" />
                                            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.08)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.08)_225deg,transparent_270deg)] pointer-events-none" />

                                            {/* Center Label (Enlarged Artwork - 78% of Disc) */}
                                            <div className="relative w-[78%] h-[78%] rounded-full overflow-hidden border-2 border-amber-500/60 shadow-2xl flex items-center justify-center z-10 pointer-events-none">
                                                {playingAudio.posterUrl ? (
                                                    <img
                                                        src={playingAudio.posterUrl}
                                                        alt=""
                                                        className="w-full h-full object-cover pointer-events-none"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-black font-black text-xs text-center p-1 pointer-events-none">
                                                        {playingAudio.title}
                                                    </div>
                                                )}
                                                <div className="absolute w-5 h-5 rounded-full bg-zinc-950 border border-zinc-400 flex items-center justify-center shadow-inner z-20">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 shadow-md" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Track Details & Minimal Controls */}
                            <div className="w-full space-y-3 sm:space-y-4 text-center shrink-0">
                                <div className="space-y-1">
                                    <h2 className="text-xl sm:text-2xl font-black text-white truncate px-2">{playingAudio.title}</h2>
                                    <p className="text-sm sm:text-base font-bold text-amber-400 truncate">{playingAudio.artist || 'Artist'}</p>
                                </div>

                                <div className="w-full space-y-1 px-2">
                                    <input
                                        type="range"
                                        min={0}
                                        max={effectiveDuration || 100}
                                        value={audioCurrentTime}
                                        onChange={e => seekTo(Number(e.target.value))}
                                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    />
                                    <div className="flex justify-between text-xs font-mono text-zinc-500 font-bold">
                                        <span>{formatTime(audioCurrentTime)}</span>
                                        <span>{formatTime(effectiveDuration)}</span>
                                    </div>
                                </div>

                                {/* Main Controls Row */}
                                <div className="flex items-center justify-center gap-2 sm:gap-3.5 flex-wrap">
                                    <button
                                        onClick={() => setIsShuffle(!isShuffle)}
                                        className={`p-2 rounded-xl transition-colors cursor-pointer ${isShuffle ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                        title="Shuffle Queue"
                                    >
                                        <Shuffle size={18} />
                                    </button>
                                    <button
                                        onClick={() => skipSeconds(-15)}
                                        className="p-2 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 transition-all font-mono text-xs font-black cursor-pointer flex items-center gap-0.5"
                                        title="Skip 15 seconds backward"
                                    >
                                        <RotateCcw size={15} />
                                        <span>15s</span>
                                    </button>
                                    <button onClick={prevTrack} className="p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer" title="Previous Track">
                                        <SkipBack size={22} />
                                    </button>
                                    <button
                                        onClick={togglePlayPause}
                                        disabled={audioPlaybackStatus === 'loading'}
                                        className="w-14 h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/30 transition-all scale-100 active:scale-95 disabled:opacity-75 cursor-pointer shrink-0"
                                        title={isAudioPlaying ? 'Pause' : 'Play'}
                                    >
                                        {audioPlaybackStatus === 'loading' || audioPlaybackStatus === 'buffering' ? (
                                            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        ) : isAudioPlaying ? (
                                            <Pause size={24} />
                                        ) : (
                                            <Play size={24} className="ml-0.5" />
                                        )}
                                    </button>
                                    <button onClick={nextTrack} className="p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer" title="Next Track">
                                        <SkipForward size={22} />
                                    </button>
                                    <button
                                        onClick={() => skipSeconds(30)}
                                        className="p-2 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 transition-all font-mono text-xs font-black cursor-pointer flex items-center gap-0.5"
                                        title="Skip 30 seconds forward"
                                    >
                                        <RotateCcw size={15} className="scale-x-[-1]" />
                                        <span>30s</span>
                                    </button>
                                    <button
                                        onClick={() => setIsRepeat(!isRepeat)}
                                        className={`p-2 rounded-xl transition-colors cursor-pointer ${isRepeat ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                        title={isRepeat ? "Repeat: Active" : "Repeat: Off"}
                                    >
                                        <Repeat size={18} />
                                    </button>
                                    <button
                                        onClick={cyclePlaybackSpeed}
                                        className={`px-2 py-1 rounded-lg text-xs font-mono font-black border transition-all cursor-pointer ${
                                            playbackSpeed !== 1.0
                                                ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                                                : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800'
                                        }`}
                                        title="Cycle Playback Speed (1x, 1.25x, 1.5x, 1.75x, 2x, 0.75x)"
                                    >
                                        {playbackSpeed}x
                                    </button>
                                    <button
                                        onClick={() => openCastPicker(playingAudio)}
                                        className={`p-2 rounded-xl transition-colors cursor-pointer ${isCastingToGoogle ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-400 hover:text-white'}`}
                                        title="Cast to Smart TV / Audio Output Device"
                                    >
                                        <Cast size={18} />
                                    </button>
                                </div>

                                {/* Secondary Controls Row: Volume & Return to Regular Player */}
                                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                                    {/* Volume Control */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                                        <button
                                            onClick={toggleMute}
                                            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                            title={isAudioMuted ? "Unmute" : "Mute"}
                                        >
                                            {isAudioMuted || audioVolume === 0 ? (
                                                <VolumeX size={17} className="text-rose-400" />
                                            ) : (
                                                <Volume2 size={17} className="text-amber-400" />
                                            )}
                                        </button>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={isAudioMuted ? 0 : audioVolume}
                                            onChange={e => handleVolumeChange(Number(e.target.value))}
                                            className="w-24 sm:w-32 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                            title={`Volume: ${Math.round(audioVolume * 100)}%`}
                                        />
                                        <span className="text-[11px] font-mono text-zinc-400 w-8 text-right">
                                            {Math.round((isAudioMuted ? 0 : audioVolume) * 100)}%
                                        </span>
                                    </div>

                                    {/* Return to Regular Player Button */}
                                    <button
                                        onClick={() => setIsMinimalistVinylMode(false)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs sm:text-sm font-bold transition-all cursor-pointer"
                                        title="Return to Regular Player"
                                    >
                                        <Maximize2 size={14} className="text-amber-400" />
                                        <span>Regular Player</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                    <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch pt-2 sm:pt-3 overflow-hidden">
                        {/* Left / Center: Artwork & Full Controls - Scaled to fit viewport without parent scroll */}
                        <div className={`${showExpandedSidePanel ? 'hidden lg:flex lg:col-span-5 xl:col-span-5' : 'flex col-span-1 lg:col-span-8 lg:col-start-3'} flex-col justify-between items-center h-full max-h-full mx-auto w-full max-w-md overflow-hidden py-1`}>
                            {/* View Mode Toggle: Vinyl Turntable vs Spinning Disk vs Normal Cover Art */}
                            <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800/80 shadow-inner backdrop-blur-md shrink-0">
                                <button
                                    onClick={() => changePlayerAnimationMode('turntable')}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        playerAnimationMode === 'turntable'
                                            ? 'bg-amber-500 text-black shadow-md'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                    }`}
                                    title="Switch to Vinyl Turntable Deck Mode"
                                >
                                    <Disc size={13} /> Turntable
                                </button>
                                <button
                                    onClick={() => changePlayerAnimationMode('disc')}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        playerAnimationMode === 'disc'
                                            ? 'bg-amber-500 text-black shadow-md'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                    }`}
                                    title="Switch to Spinning Vinyl Platter Mode"
                                >
                                    <Disc size={13} className="animate-spin" style={{ animationDuration: '6s' }} /> Spinning Disk
                                </button>
                                <button
                                    onClick={() => changePlayerAnimationMode('art')}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        playerAnimationMode === 'art'
                                            ? 'bg-zinc-800 text-white border border-zinc-700 shadow-md'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                    }`}
                                    title="Switch to Standard Cover Artwork View"
                                >
                                    <ImageIcon size={13} /> Simple Art
                                </button>
                            </div>

                            {/* Main Artwork Stage: Vinyl Turntable vs Spinning Disk vs Normal Cover Art */}
                            <div className="flex-1 min-h-0 flex items-center justify-center w-full my-2">
                                {playerAnimationMode === 'turntable' ? (
                                    /* ── 1. Vinyl Turntable Player Representation ── */
                                    <div className="relative w-full max-w-[320px] sm:max-w-[360px] md:max-w-[390px] aspect-[1.12/1] rounded-[2rem] bg-gradient-to-b from-zinc-800 via-zinc-900 to-[#09090b] border-2 border-zinc-700/80 p-3 shadow-2xl flex items-center justify-center select-none overflow-hidden group">
                                        {/* Turntable Plinth Inset */}
                                        <div className="absolute inset-2 rounded-[1.5rem] bg-gradient-to-b from-[#18181b] to-[#0c0c0e] border border-white/5 pointer-events-none shadow-inner" />

                                        {/* Top-Left: Vintage Green Jewel Pilot Lamp */}
                                        <div className="absolute top-3.5 left-4 z-20 flex items-center pointer-events-none" title={isActivelyPlaying ? "Amplifier & Drive Active" : "Standby"}>
                                            <div className={`relative w-4 h-4 rounded-full border border-zinc-700 bg-zinc-950 flex items-center justify-center p-0.5 shadow-inner transition-all duration-700 ${
                                                isActivelyPlaying
                                                    ? 'border-emerald-500/50 shadow-[0_0_12px_rgba(52,211,153,0.8)] ring-1 ring-emerald-500/30'
                                                    : 'border-zinc-800 opacity-50'
                                            }`}>
                                                {/* Brass / Chrome Outer Bezel */}
                                                <div className="absolute inset-0 rounded-full border border-amber-500/20 pointer-events-none" />
                                                
                                                {/* Faceted Jewel Glass Lens */}
                                                <div className={`w-full h-full rounded-full transition-all duration-500 relative overflow-hidden flex items-center justify-center ${
                                                    isActivelyPlaying
                                                        ? 'bg-gradient-to-tr from-emerald-600 via-emerald-400 to-green-300 shadow-[inset_0_0_4px_rgba(255,255,255,0.7),0_0_10px_#34d399] animate-pulse'
                                                        : 'bg-emerald-950/60 border border-emerald-900/30'
                                                }`}>
                                                    {/* Glass Facet Specular Highlight */}
                                                    <div className="absolute top-0.5 left-0.5 w-1 h-0.5 rounded-full bg-white/70 pointer-events-none" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Rotating Turntable Platter & Vinyl Disc */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePlayPause();
                                            }}
                                            className="relative w-52 h-52 sm:w-60 sm:h-60 -translate-x-2 flex items-center justify-center cursor-pointer select-none group/disc"
                                            title={isActivelyPlaying ? "Click Vinyl Record to Pause" : "Click Vinyl Record to Play"}
                                        >
                                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-600 p-1 shadow-2xl flex items-center justify-center border border-zinc-600/50 pointer-events-none group-hover/disc:border-amber-500/40 transition-colors">
                                                <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center shadow-inner">
                                                    <div
                                                        className="relative w-[96%] h-[96%] rounded-full bg-black shadow-2xl flex items-center justify-center overflow-hidden"
                                                        style={{
                                                            animation: 'vinyl-spin 8s linear infinite',
                                                            animationPlayState: isActivelyPlaying ? 'running' : 'paused'
                                                        }}
                                                    >
                                                        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#000000_30%,_#18181b_31%,_#09090b_45%,_#1f1f23_46%,_#000000_65%,_#18181b_66%,_#000000_100%)] opacity-90 pointer-events-none" />
                                                        <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.08)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.08)_225deg,transparent_270deg)] pointer-events-none" />

                                                        {/* Center Label (Enlarged Artwork - 78% of Vinyl Record) */}
                                                        <div className="relative w-[78%] h-[78%] rounded-full overflow-hidden border-2 border-amber-500/60 shadow-2xl flex items-center justify-center z-10 pointer-events-none">
                                                            {playingAudio.posterUrl && !vinylCoverError ? (
                                                                <img
                                                                    src={playingAudio.posterUrl}
                                                                    alt=""
                                                                    className="w-full h-full object-cover pointer-events-none"
                                                                    onError={() => {
                                                                        const fallback = getCoverFallbackUrl(playingAudio.artist, playingAudio.album, playingAudio.title);
                                                                        if (playingAudio.posterUrl !== fallback) {
                                                                            setPlayingAudio(prev => prev ? { ...prev, posterUrl: fallback } : prev);
                                                                        } else {
                                                                            setVinylCoverError(true);
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-black font-black text-[10px] text-center p-1 pointer-events-none">
                                                                    {playingAudio.title}
                                                                </div>
                                                            )}
                                                            <div className="absolute w-5 h-5 rounded-full bg-zinc-950 border border-zinc-400 flex items-center justify-center shadow-inner z-20">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 shadow-md" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tonearm Assembly - Fully Interactive Touch & Click Needle */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePlayPause();
                                            }}
                                            className="absolute top-1 right-2 w-28 h-48 z-30 select-none cursor-pointer group/tonearm"
                                            title={isActivelyPlaying ? "Click Needle to Lift & Pause" : "Click Needle to Drop on Record & Play"}
                                        >
                                            {/* Pivot Gimbal Base */}
                                            <div className="absolute top-2 right-2 w-11 h-11 rounded-full bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-950 border-2 border-zinc-500 shadow-2xl flex items-center justify-center group-hover/tonearm:border-amber-400 transition-colors">
                                                <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-zinc-300 via-white to-zinc-400 border border-zinc-400 shadow-md flex items-center justify-center">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                                                </div>
                                                {/* Needle Arm & Cartridge */}
                                                <div
                                                    className="absolute top-4 left-4 w-6 origin-top transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                                                    style={{
                                                        transform: `rotate(${isActivelyPlaying ? 24 : 0}deg)`
                                                    }}
                                                >
                                                    <div className="w-1.5 h-30 sm:h-34 bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500 rounded-full shadow-lg relative">
                                                        {/* Cartridge & Stylus Light */}
                                                        <div className="absolute -bottom-1 -left-1.5 w-4 h-6 bg-gradient-to-b from-amber-400 to-amber-600 rounded-sm shadow-md flex items-center justify-center border border-amber-300">
                                                            <div className={`w-1.5 h-2.5 rounded-full shadow-sm ${isActivelyPlaying ? 'bg-amber-300 animate-pulse' : 'bg-zinc-500'}`} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : playerAnimationMode === 'disc' ? (
                                    /* ── 2. Pure Spinning Disk Platter (No Plinth / Needle) ── */
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            togglePlayPause();
                                        }}
                                        className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 flex items-center justify-center cursor-pointer select-none group/disc transition-transform hover:scale-105 active:scale-95"
                                        title={isActivelyPlaying ? "Click Spinning Disk to Pause" : "Click Spinning Disk to Play"}
                                    >
                                        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-600 p-2 shadow-2xl flex items-center justify-center border-2 border-zinc-600/50 pointer-events-none group-hover/disc:border-amber-500/50 transition-colors">
                                            <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center shadow-inner">
                                                <div
                                                    className="relative w-[96%] h-[96%] rounded-full bg-black shadow-2xl flex items-center justify-center overflow-hidden"
                                                    style={{
                                                        animation: 'vinyl-spin 8s linear infinite',
                                                        animationPlayState: isActivelyPlaying ? 'running' : 'paused'
                                                    }}
                                                >
                                                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#000000_30%,_#18181b_31%,_#09090b_45%,_#1f1f23_46%,_#000000_65%,_#18181b_66%,_#000000_100%)] opacity-90 pointer-events-none" />
                                                    <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.08)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.08)_225deg,transparent_270deg)] pointer-events-none" />

                                                    {/* Center Label (Enlarged Artwork - 78% of Disc) */}
                                                    <div className="relative w-[78%] h-[78%] rounded-full overflow-hidden border-2 border-amber-500/60 shadow-2xl flex items-center justify-center z-10 pointer-events-none">
                                                        {playingAudio.posterUrl && !vinylCoverError ? (
                                                            <img
                                                                src={playingAudio.posterUrl}
                                                                alt=""
                                                                className="w-full h-full object-cover pointer-events-none"
                                                                onError={() => {
                                                                    const fallback = getCoverFallbackUrl(playingAudio.artist, playingAudio.album, playingAudio.title);
                                                                    if (playingAudio.posterUrl !== fallback) {
                                                                        setPlayingAudio(prev => prev ? { ...prev, posterUrl: fallback } : prev);
                                                                    } else {
                                                                        setVinylCoverError(true);
                                                                    }
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-black font-black text-xs text-center p-1 pointer-events-none">
                                                                {playingAudio.title}
                                                            </div>
                                                        )}
                                                        <div className="absolute w-5 h-5 rounded-full bg-zinc-950 border border-zinc-400 flex items-center justify-center shadow-inner z-20">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 shadow-md" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* ── 3. Normal High-Res Cover Artwork View ── */
                                    <div className="relative max-h-[30vh] sm:max-h-[34vh] md:max-h-[38vh] aspect-square w-auto h-full rounded-[2rem] bg-zinc-900 border-2 border-zinc-800/80 overflow-hidden shadow-2xl flex items-center justify-center">
                                        {playingAudio.posterUrl && !normalCoverError ? (
                                            <img
                                                src={playingAudio.posterUrl}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                onError={() => {
                                                    const fallback = getCoverFallbackUrl(playingAudio.artist, playingAudio.album, playingAudio.title);
                                                    if (playingAudio.posterUrl !== fallback) {
                                                        setPlayingAudio(prev => prev ? { ...prev, posterUrl: fallback } : prev);
                                                    } else {
                                                        setNormalCoverError(true);
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <Disc size={72} className="text-amber-400" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Track Info & Clickable Artist */}
                            <div className="text-center space-y-1.5 w-full px-2 shrink-0">
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    {/* Playback Source Indicator Badge (Clickable) */}
                                    {(() => {
                                        const srcInfo = getAudioSourceInfo(playingAudio, audioRef.current?.src);
                                        return (
                                            <button
                                                onClick={() => handleSourceBadgeClick(playingAudio)}
                                                className={`px-3 py-1 rounded-lg border text-xs font-black tracking-wider flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer ${srcInfo.colorClass}`}
                                                title={srcInfo.isLocal ? `Click to reveal in folder: ${playingAudio.path}` : `Click to open streaming source`}
                                            >
                                                {srcInfo.isLocal ? <HardDrive size={12} className="text-emerald-400 shrink-0" /> : srcInfo.isPlex ? <Server size={12} className="text-purple-400 shrink-0" /> : srcInfo.isYt ? <Youtube size={12} className="text-rose-400 shrink-0" /> : <Globe size={12} className="text-sky-400 shrink-0" />}
                                                <span>{srcInfo.label}</span>
                                                <ExternalLink size={10} className="opacity-70 shrink-0" />
                                            </button>
                                        );
                                    })()}

                                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black uppercase tracking-wider">
                                        {playingAudio.extension?.toUpperCase() === 'FLAC' ? 'FLAC Lossless' : `${playingAudio.extension?.toUpperCase() || 'MP3'}`}
                                    </span>
                                </div>

                                {/* Song Title (Clean, bold, prominent) */}
                                <div className="flex items-center justify-center gap-2 max-w-full">
                                    <h2 className="text-xl sm:text-2xl font-black text-white leading-tight truncate">
                                        {playingAudio.title}
                                    </h2>
                                </div>
                                
                                {/* Artist Name & Album Name in smaller lettering below Song Title */}
                                <div className="flex items-center justify-center gap-2 flex-wrap text-xs sm:text-sm font-medium">
                                    <button
                                        onClick={() => openArtistDetails(playingAudio.artist)}
                                        className="font-bold text-amber-300 hover:text-amber-200 hover:underline transition-colors truncate inline-flex items-center gap-1 cursor-pointer"
                                        title={`View artist biography & albums for ${playingAudio.artist || 'Artist'}`}
                                    >
                                        <User size={13} className="text-amber-400 shrink-0" />
                                        <span>{playingAudio.artist || playingAudio.folder || 'Artist'}</span>
                                    </button>

                                    {playingAudio.album && (
                                        <>
                                            <span className="text-zinc-600 font-bold">•</span>
                                            <button
                                                onClick={() => openAlbumDetails(playingAudio.album, playingAudio.artist, (playingAudio as any).albumId)}
                                                className="text-zinc-400 hover:text-amber-300 hover:underline transition-colors truncate inline-flex items-center gap-1 cursor-pointer max-w-[220px]"
                                                title={`View album tracklist for "${playingAudio.album}"`}
                                            >
                                                <Disc size={13} className="text-amber-400 shrink-0" />
                                                <span className="truncate">{playingAudio.album}</span>
                                            </button>
                                        </>
                                    )}

                                    {((playingAudio as any).uploader && (playingAudio as any).uploader !== playingAudio.artist) && (
                                        <span className="text-[11px] text-zinc-500 font-medium truncate">
                                            (via {(playingAudio as any).uploader})
                                        </span>
                                    )}
                                </div>
                                {playingAudio.path && (
                                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-emerald-400/90 truncate max-w-lg mx-auto pt-0.5 select-all" title={`Server file: ${playingAudio.path}`}>
                                        <Folder size={12} className="shrink-0 text-emerald-400" />
                                        <span className="truncate">{playingAudio.path}</span>
                                    </div>
                                )}

                                {/* 5-Star Rating & Playlist Action */}
                                <div className="flex items-center justify-center gap-3 pt-1">
                                    <div className="flex items-center gap-1 bg-zinc-900/80 px-2.5 py-1 rounded-xl border border-zinc-800/80">
                                        {[1, 2, 3, 4, 5].map((star) => {
                                            const activeRating = (trackRatings?.[playingAudio?.id || playingAudio?.title || ''] || 0);
                                            return (
                                                <button
                                                    key={star}
                                                    type="button"
                                                    onClick={() => playingAudio && setTrackRating(playingAudio.id || playingAudio.title, star)}
                                                    className="p-0.5 hover:scale-125 transition-transform"
                                                    title={`Rate ${star} Star${star > 1 ? 's' : ''}`}
                                                >
                                                    <Star
                                                        size={14}
                                                        className={
                                                            star <= activeRating
                                                                ? 'text-amber-400 fill-amber-400'
                                                                : 'text-zinc-600 hover:text-amber-300'
                                                        }
                                                    />
                                                </button>
                                            );
                                        })}
                                        {((trackRatings?.[playingAudio?.id || playingAudio?.title || ''] || 0) > 0) && (
                                            <span className="text-[10px] font-mono font-bold text-amber-300 ml-1">
                                                {trackRatings[playingAudio.id || playingAudio.title]}/5
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Seekbar with Live Timestamps */}
                            <div className="w-full space-y-1 px-1 shrink-0 pt-2">
                                <input
                                    type="range"
                                    min={0}
                                    max={effectiveDuration || 100}
                                    value={audioCurrentTime}
                                    onChange={e => seekTo(Number(e.target.value))}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                                <div className="flex justify-between text-[11px] font-mono text-zinc-500 font-bold">
                                    <span>{formatTime(audioCurrentTime)}</span>
                                    <span>{formatTime(effectiveDuration)}</span>
                                </div>
                            </div>

                            {/* Master Playback Controls */}
                            <div className="flex items-center justify-center gap-2 sm:gap-3.5 md:gap-5 w-full shrink-0 py-1">
                                <button
                                    onClick={() => setIsShuffle(!isShuffle)}
                                    className={`p-1.5 sm:p-2 rounded-xl transition-all ${isShuffle ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Shuffle"
                                >
                                    <Shuffle size={16} />
                                </button>

                                {/* 15s Skip Backward */}
                                <button
                                    onClick={() => skipSeconds(-15)}
                                    className="p-1.5 sm:p-2 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 transition-all font-mono text-[11px] font-black cursor-pointer flex items-center gap-0.5"
                                    title="Skip 15 seconds backward"
                                >
                                    <RotateCcw size={14} />
                                    <span>15s</span>
                                </button>

                                <button
                                    onClick={prevTrack}
                                    className="p-1.5 sm:p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
                                    title="Previous Track"
                                >
                                    <SkipBack size={20} />
                                </button>

                                <button
                                    onClick={togglePlayPause}
                                    disabled={audioPlaybackStatus === 'loading'}
                                    className="w-13 h-13 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/30 transition-all scale-100 active:scale-95 disabled:opacity-75 cursor-pointer"
                                    title={audioPlaybackStatus === 'loading' ? 'Loading Track...' : isAudioPlaying ? 'Pause' : 'Play'}
                                >
                                    {audioPlaybackStatus === 'loading' || audioPlaybackStatus === 'buffering' ? (
                                        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    ) : isAudioPlaying ? (
                                        <Pause size={22} />
                                    ) : (
                                        <Play size={22} className="ml-0.5" />
                                    )}
                                </button>

                                <button
                                    onClick={nextTrack}
                                    className="p-1.5 sm:p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
                                    title="Next Track"
                                >
                                    <SkipForward size={20} />
                                </button>

                                {/* 30s Skip Forward */}
                                <button
                                    onClick={() => skipSeconds(30)}
                                    className="p-1.5 sm:p-2 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 transition-all font-mono text-[11px] font-black cursor-pointer flex items-center gap-0.5"
                                    title="Skip 30 seconds forward"
                                >
                                    <RotateCcw size={14} className="scale-x-[-1]" />
                                    <span>30s</span>
                                </button>

                                <button
                                    onClick={() => setIsRepeat(!isRepeat)}
                                    className={`p-1.5 sm:p-2 rounded-xl transition-all ${isRepeat ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Repeat"
                                >
                                    <Repeat size={16} />
                                </button>

                                {/* Audiobook / Spoken Word Speed Cycle */}
                                <button
                                    onClick={cyclePlaybackSpeed}
                                    className={`px-2 py-1 rounded-lg text-xs font-mono font-black border transition-all cursor-pointer ${
                                        playbackSpeed !== 1.0
                                            ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                                            : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800'
                                    }`}
                                    title="Cycle Playback Speed (1x, 1.25x, 1.5x, 1.75x, 2x, 0.75x)"
                                >
                                    {playbackSpeed}x
                                </button>
                            </div>

                            {/* Bottom Controls Row: Volume on left, Action Icons on right */}
                            <div className="flex items-center justify-between gap-2 w-full pt-2 border-t border-zinc-900/90 px-1 shrink-0">
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        onClick={toggleMute}
                                        className="text-zinc-500 hover:text-white transition-colors p-1 cursor-pointer"
                                        title={isAudioMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {isAudioMuted || audioVolume === 0 ? <VolumeX size={16} className="text-red-400" /> : <Volume2 size={16} />}
                                    </button>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={isAudioMuted ? 0 : audioVolume}
                                        onChange={e => handleVolumeChange(Number(e.target.value))}
                                        className="w-16 sm:w-20 md:w-24 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        title={`Volume: ${Math.round((isAudioMuted ? 0 : audioVolume) * 100)}%`}
                                    />
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    {/* 1. Download icon button */}
                                    <button
                                        onClick={() => handleDownloadTrack(playingAudio)}
                                        className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-all cursor-pointer shadow-sm"
                                        title="Download Track / Add to Library"
                                    >
                                        <Download size={15} />
                                    </button>

                                    {/* 2. Info / Nerd Logs icon button */}
                                    <button
                                        onClick={() => setShowAudioNerdModal(true)}
                                        className={`p-2 rounded-xl border transition-all cursor-pointer shadow-sm ${
                                            showAudioNerdModal || audioPlaybackError
                                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 border border-zinc-800'
                                        }`}
                                        title="Nerd Logs: Diagnostics & Audio Telemetry"
                                    >
                                        <Info size={15} />
                                    </button>

                                    {/* 3. Cast icon button */}
                                    <button
                                        onClick={() => openCastPicker(playingAudio)}
                                        className="p-2 rounded-xl bg-purple-500/15 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 transition-all cursor-pointer shadow-sm"
                                        title="Cast to Smart TV / Audio Output Device"
                                    >
                                        <Cast size={15} />
                                    </button>

                                    {/* 4. Settings / Fix Match icon button */}
                                    <button
                                        onClick={() => openFixMatchModal()}
                                        className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 border border-zinc-800 transition-all cursor-pointer shadow-sm"
                                        title="Fix Match & Edit Song Metadata"
                                    >
                                        <Settings size={15} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Toggleable Panel (Karaoke / Artist / Queue / Playlists / Search / Specs) */}
                        {showExpandedSidePanel && (
                            <div className="col-span-1 lg:col-span-7 xl:col-span-7 h-full max-h-full flex flex-col bg-zinc-950/80 border border-zinc-900 rounded-[2rem] p-3 sm:p-5 shadow-2xl space-y-3 min-h-0 overflow-hidden">
                                {/* Panel Tab Selectors - Clean top bar */}
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-900 shrink-0">
                                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-1 px-1 bg-zinc-900/90 rounded-2xl border border-zinc-800 shrink-0 max-w-full">
                                        {/* 1. Search */}
                                        <button
                                            onClick={() => setExpandedSidePanel('search')}
                                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                                                expandedSidePanel === 'search' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Search size={14} /> Search
                                        </button>

                                        {/* 2. Nerd Logs (Replaced incomplete Information tab) */}
                                        <button
                                            onClick={() => setShowAudioNerdModal(true)}
                                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                                                showAudioNerdModal
                                                    ? 'bg-amber-500 text-black shadow-sm'
                                                    : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                            title="Open Nerd Logs, Diagnostics & Live Audio Telemetry"
                                        >
                                            <Info size={14} /> Nerd Logs
                                        </button>

                                        {/* 3. Queue (Subtabs: Queue, Playlists) */}
                                        <button
                                            onClick={() => setExpandedSidePanel('queue')}
                                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                                                expandedSidePanel === 'queue' || expandedSidePanel === 'playlists'
                                                    ? 'bg-amber-500 text-black shadow-sm'
                                                    : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <ListMusic size={14} /> Queue ({audioQueue.length})
                                        </button>

                                        {/* 4. Karaoke */}
                                        <button
                                            onClick={() => setExpandedSidePanel('karaoke')}
                                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                                                expandedSidePanel === 'karaoke' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Mic2 size={14} /> Karaoke
                                        </button>
                                    </div>
                                </div>

                                {/* 1. Karaoke Tab with Subtabs (Landing page is Karaoke Lyrics) */}
                                {expandedSidePanel === 'karaoke' && (
                                    <div className="flex-1 min-h-0 flex flex-col space-y-2.5">
                                        {/* Sub-tabs Header inside Karaoke */}
                                        <div className="flex items-center justify-between gap-2 p-1 bg-zinc-900/90 rounded-2xl border border-zinc-800 shrink-0">
                                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scrollbar-none">
                                                <button
                                                    onClick={() => setKaraokeSubTab('lyrics')}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                                        karaokeSubTab === 'lyrics' ? 'bg-amber-500 text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Mic2 size={12} /> Karaoke Lyrics
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setJamInstrument('guitar');
                                                        setKaraokeSubTab('guitar');
                                                    }}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                                        karaokeSubTab === 'guitar' ? 'bg-amber-500 text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Guitar size={12} /> Guitar
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setJamInstrument('bass');
                                                        setKaraokeSubTab('bass');
                                                    }}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                                        karaokeSubTab === 'bass' ? 'bg-purple-500 text-white font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Activity size={12} /> Bass
                                                </button>
                                                <button
                                                    onClick={() => setKaraokeSubTab('sing')}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                                        karaokeSubTab === 'sing' ? 'bg-pink-500 text-black font-black shadow-sm' : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Sparkles size={12} /> Sing Hero
                                                </button>
                                            </div>

                                            {karaokeSubTab === 'lyrics' && (
                                                <div className="flex items-center gap-1.5 shrink-0 pr-1">
                                                    {lyricsData?.isSynced && (
                                                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase flex items-center gap-1">
                                                            <Sparkles size={10} /> Synced
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setLyricsSearchQuery(`${playingAudio.artist || ''} ${playingAudio.title || ''}`.trim());
                                                            setCustomLrcText(lyricsData?.syncedLyrics || lyricsData?.plainLyrics || '');
                                                            setIsLyricsEditorOpen(true);
                                                        }}
                                                        className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-bold flex items-center gap-1 transition-all"
                                                        title="Edit lyrics match"
                                                    >
                                                        <Edit3 size={11} /> Edit
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Subtab 1: Karaoke Synced Lyrics View (Landing Page) */}
                                        {karaokeSubTab === 'lyrics' && (
                                            <div
                                                ref={expandedLyricsContainerRef}
                                                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col"
                                            >
                                                {lyricsLoading ? (
                                                    <div className="flex flex-col items-center justify-center py-20 gap-3 m-auto">
                                                        <div className="w-9 h-9 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Fetching Lyrics...</p>
                                                    </div>
                                                ) : !lyricsData || (!lyricsData.lines?.length && !lyricsData.plainLyrics) ? (
                                                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 m-auto">
                                                        <div className="p-4 bg-zinc-900/60 rounded-full text-zinc-600"><Mic2 size={32} /></div>
                                                        <div>
                                                            <p className="text-sm font-bold text-white">No lyrics available for this song</p>
                                                            <p className="text-xs text-zinc-500 mt-1">Search LRCLib or paste custom LRC timestamps.</p>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setLyricsSearchQuery(`${playingAudio.artist || ''} ${playingAudio.title || ''}`.trim());
                                                                setIsLyricsEditorOpen(true);
                                                            }}
                                                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                                                        >
                                                            <Search size={13} /> Search / Add Lyrics
                                                        </button>
                                                    </div>
                                                ) : lyricsData.isSynced ? (
                                                    <div className="space-y-4 py-8 text-center my-auto">
                                                        {lyricsData.lines.map((line, idx) => {
                                                            const isActive = idx === currentLyricIndex;
                                                            return (
                                                                <p
                                                                    key={idx}
                                                                    ref={isActive ? expandedActiveLyricRef : null}
                                                                    onClick={() => seekTo(line.time)}
                                                                    className={`cursor-pointer transition-all duration-300 select-none py-1.5 px-3 rounded-2xl ${
                                                                        isActive
                                                                            ? 'text-xl sm:text-2xl lg:text-3xl font-black text-amber-300 scale-105 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)] bg-amber-500/15 border border-amber-500/30'
                                                                            : 'text-sm sm:text-base font-bold text-zinc-500 hover:text-zinc-300'
                                                                    }`}
                                                                >
                                                                    {line.text}
                                                                </p>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="p-4 text-center whitespace-pre-line text-sm sm:text-base font-semibold text-zinc-300 leading-relaxed max-w-lg mx-auto">
                                                        {lyricsData.plainLyrics || lyricsData.lines.map(l => l.text).join('\n')}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Subtab 2: Guitar Chords View */}
                                        {karaokeSubTab === 'guitar' && (
                                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 space-y-3 flex flex-col">
                                                <div className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                                                    <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                                                        <Guitar size={14} /> 6-String Guitar Chords
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-black uppercase">
                                                            <button
                                                                onClick={() => setJamDifficulty('beginner')}
                                                                className={`px-1.5 py-0.5 rounded transition-all ${
                                                                    jamDifficulty === 'beginner' ? 'bg-emerald-500 text-black font-black' : 'text-zinc-500 hover:text-zinc-300'
                                                                }`}
                                                            >
                                                                Beg
                                                            </button>
                                                            <button
                                                                onClick={() => setJamDifficulty('intermediate')}
                                                                className={`px-1.5 py-0.5 rounded transition-all ${
                                                                    jamDifficulty === 'intermediate' ? 'bg-amber-500 text-black font-black' : 'text-zinc-500 hover:text-zinc-300'
                                                                }`}
                                                            >
                                                                Med
                                                            </button>
                                                            <button
                                                                onClick={() => setJamDifficulty('advanced')}
                                                                className={`px-1.5 py-0.5 rounded transition-all ${
                                                                    jamDifficulty === 'advanced' ? 'bg-purple-500 text-white font-black' : 'text-zinc-500 hover:text-zinc-300'
                                                                }`}
                                                            >
                                                                Pro
                                                            </button>
                                                        </div>

                                                        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                                                            <button
                                                                onClick={() => setJamTranspose(prev => prev - 1)}
                                                                className="w-4 h-4 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs flex items-center justify-center"
                                                            >
                                                                -
                                                            </button>
                                                            <span className="text-[10px] font-mono font-bold text-amber-300 px-1">
                                                                {jamTranspose > 0 ? `+${jamTranspose}` : jamTranspose}st
                                                            </span>
                                                            <button
                                                                onClick={() => setJamTranspose(prev => prev + 1)}
                                                                className="w-4 h-4 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs flex items-center justify-center"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch shrink-0">
                                                    <div className="p-3.5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl flex flex-col justify-between space-y-2 relative overflow-hidden shadow-xl">
                                                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider flex items-center gap-1">
                                                            <Activity size={12} className="text-amber-400 animate-pulse" /> Active Chord
                                                        </span>

                                                        <div className="text-center py-1">
                                                            <h2 className="text-4xl sm:text-5xl font-black text-amber-300 tracking-tight drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]">
                                                                {activeChordEvent?.displayChord || 'C'}
                                                            </h2>
                                                        </div>

                                                        <div className="p-1.5 bg-zinc-950/80 rounded-xl border border-zinc-800/80 flex items-center justify-between text-xs">
                                                            <span className="text-zinc-500 font-bold text-[10px]">Next:</span>
                                                            {activeChordEvent?.nextChord ? (
                                                                <div className="flex items-center gap-1.5 font-mono">
                                                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black text-[11px]">
                                                                        {activeChordEvent.nextChord}
                                                                    </span>
                                                                    <span className="text-zinc-400 text-[10px]">in {activeChordEvent.nextInSeconds}s</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-zinc-600 text-[10px]">Holding chord</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <FretboardDiagram
                                                        chordName={activeChordEvent?.displayChord || 'C'}
                                                        instrument="guitar"
                                                    />
                                                </div>

                                                <div className="flex-1 min-h-[140px] bg-zinc-900/40 border border-zinc-800/70 rounded-2xl p-3 flex flex-col">
                                                    <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
                                                        <Mic2 size={11} className="text-amber-400" /> Synced Lyrics (Sing along while playing)
                                                    </div>
                                                    <div ref={expandedLyricsContainerRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-2 py-2 text-center">
                                                        {lyricsData?.lines && lyricsData.lines.length > 0 ? (
                                                            lyricsData.lines.map((line, idx) => {
                                                                const isActive = idx === currentLyricIndex;
                                                                return (
                                                                    <p
                                                                        key={idx}
                                                                        ref={isActive ? expandedActiveLyricRef : null}
                                                                        onClick={() => seekTo(line.time)}
                                                                        className={`cursor-pointer transition-colors duration-150 rounded-lg py-1 px-2 text-xs sm:text-sm ${
                                                                            isActive
                                                                                ? 'font-black text-amber-300 bg-amber-500/10 border border-amber-500/30'
                                                                                : 'font-semibold text-zinc-400 hover:text-zinc-200'
                                                                        }`}
                                                                    >
                                                                        {line.text}
                                                                    </p>
                                                                );
                                                            })
                                                        ) : (
                                                            <p className="text-xs text-zinc-500 py-4 font-medium">{lyricsData?.plainLyrics || 'No lyrics available'}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Subtab 3: Bass Tabs View */}
                                        {karaokeSubTab === 'bass' && (
                                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 space-y-3 flex flex-col">
                                                <div className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                                                    <div className="flex items-center gap-1.5 text-xs font-black text-purple-400">
                                                        <Activity size={14} /> 4-String Bass Root Notes
                                                    </div>
                                                    <span className="text-[10px] font-mono text-zinc-400 font-bold">Tuning: E A D G</span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch shrink-0">
                                                    <div className="p-3.5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl flex flex-col justify-between space-y-2 relative overflow-hidden shadow-xl">
                                                        <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider flex items-center gap-1">
                                                            <Activity size={12} className="text-purple-400 animate-pulse" /> Bass Root Note
                                                        </span>

                                                        <div className="text-center py-1">
                                                            <h2 className="text-4xl sm:text-5xl font-black text-purple-300 tracking-tight drop-shadow-[0_0_20px_rgba(168,85,247,0.6)]">
                                                                {(activeChordEvent?.displayChord || 'C').replace(/m|maj|7|sus4|dim|aug/gi, '') || 'C'}
                                                            </h2>
                                                        </div>

                                                        <div className="p-1.5 bg-zinc-950/80 rounded-xl border border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                                                            <span className="text-zinc-500 font-bold text-[10px]">Harmonic Context:</span>
                                                            <span className="text-purple-300 font-bold text-[11px]">{activeChordEvent?.displayChord || 'C'}</span>
                                                        </div>
                                                    </div>

                                                    <FretboardDiagram
                                                        chordName={(activeChordEvent?.displayChord || 'C').replace(/m|maj|7|sus4|dim|aug/gi, '') || 'C'}
                                                        instrument="bass"
                                                    />
                                                </div>

                                                <div className="flex-1 min-h-[140px] bg-zinc-900/40 border border-zinc-800/70 rounded-2xl p-3 flex flex-col">
                                                    <div className="text-[10px] font-black uppercase tracking-wider text-purple-400 mb-1.5 flex items-center gap-1">
                                                        <Mic2 size={11} className="text-purple-400" /> Synced Lyrics (Bass Grooves)
                                                    </div>
                                                    <div ref={expandedLyricsContainerRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-2 py-2 text-center">
                                                        {lyricsData?.lines && lyricsData.lines.length > 0 ? (
                                                            lyricsData.lines.map((line, idx) => {
                                                                const isActive = idx === currentLyricIndex;
                                                                return (
                                                                    <p
                                                                        key={idx}
                                                                        ref={isActive ? expandedActiveLyricRef : null}
                                                                        onClick={() => seekTo(line.time)}
                                                                        className={`cursor-pointer transition-colors duration-150 rounded-lg py-1 px-2 text-xs sm:text-sm ${
                                                                            isActive
                                                                                ? 'font-black text-purple-300 bg-purple-500/10 border border-purple-500/30'
                                                                                : 'font-semibold text-zinc-400 hover:text-zinc-200'
                                                                        }`}
                                                                    >
                                                                        {line.text}
                                                                    </p>
                                                                );
                                                            })
                                                        ) : (
                                                            <p className="text-xs text-zinc-500 py-4 font-medium">{lyricsData?.plainLyrics || 'No lyrics available'}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Subtab 4: Sing Hero Game */}
                                        {karaokeSubTab === 'sing' && (
                                            <SingPitchHero
                                                lyricsData={lyricsData}
                                                currentTime={audioCurrentTime}
                                                duration={audioDuration}
                                                onSeek={seekTo}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* 2. Information Tab with Subtabs (Song, Album, Artist) */}
                                {((expandedSidePanel as any) === 'info' || expandedSidePanel === 'album' || expandedSidePanel === 'artist') && (
                                    <div className="flex-1 min-h-0 flex flex-col space-y-2.5">
                                        {/* Sub-tabs Header inside Information */}
                                        <div className="flex items-center justify-between gap-2 p-1 bg-zinc-900/90 rounded-2xl border border-zinc-800 shrink-0">
                                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scrollbar-none">
                                                <button
                                                    onClick={() => {
                                                        setInfoSubTab('song');
                                                        setExpandedSidePanel('info' as any);
                                                    }}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
                                                        (expandedSidePanel === 'album' || expandedSidePanel === 'artist' ? false : infoSubTab === 'song')
                                                            ? 'bg-amber-500 text-black font-black shadow-sm'
                                                            : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Music size={13} /> Song
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setInfoSubTab('album');
                                                        setExpandedSidePanel('info' as any);
                                                        if (playingAudio.album && (!albumData || albumData.title !== playingAudio.album)) {
                                                            fetchAlbumInfo(playingAudio.album, playingAudio.artist, (playingAudio as any).albumId);
                                                        }
                                                    }}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
                                                        expandedSidePanel === 'album' || (expandedSidePanel !== 'artist' && infoSubTab === 'album')
                                                            ? 'bg-amber-500 text-black font-black shadow-sm'
                                                            : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Disc size={13} /> Album
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setInfoSubTab('artist');
                                                        setExpandedSidePanel('info' as any);
                                                        if (playingAudio.artist && (!artistData || artistData.artistName !== playingAudio.artist)) {
                                                            fetchArtistInfo(playingAudio.artist);
                                                        }
                                                    }}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
                                                        expandedSidePanel === 'artist' || (expandedSidePanel !== 'album' && infoSubTab === 'artist')
                                                            ? 'bg-amber-500 text-black font-black shadow-sm'
                                                            : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <User size={13} /> Artist
                                                </button>
                                            </div>
                                        </div>

                                        {/* Subtab 1: Song Information View */}
                                        {(expandedSidePanel === 'album' || expandedSidePanel === 'artist' ? false : infoSubTab === 'song') && (
                                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 space-y-3.5 pr-1">
                                                {/* Now Playing Song Header Card */}
                                                <div className="p-4 sm:p-5 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row items-center sm:items-start gap-4">
                                                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-700 shadow-xl shrink-0 flex items-center justify-center relative">
                                                        {playingAudio.posterUrl && !vinylCoverError ? (
                                                            <img
                                                                src={playingAudio.posterUrl}
                                                                alt={playingAudio.title}
                                                                className="w-full h-full object-cover"
                                                                onError={() => setVinylCoverError(true)}
                                                            />
                                                        ) : (
                                                            <Disc size={36} className="text-zinc-700" />
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1 text-center sm:text-left space-y-2">
                                                        <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-wider">
                                                                Current Track
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider">
                                                                {playingAudio.extension?.toUpperCase() || (playingAudio.youtubeId ? 'OPUS' : 'MP3')}
                                                            </span>
                                                        </div>

                                                        <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                                                            {playingAudio.title}
                                                        </h2>

                                                        <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap text-xs sm:text-sm font-medium">
                                                            <button
                                                                onClick={() => {
                                                                    setInfoSubTab('artist');
                                                                    setExpandedSidePanel('info' as any);
                                                                    if (playingAudio.artist) fetchArtistInfo(playingAudio.artist);
                                                                }}
                                                                className="font-bold text-amber-300 hover:text-amber-200 hover:underline transition-colors inline-flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <User size={13} className="text-amber-400 shrink-0" />
                                                                <span>{playingAudio.artist || 'Unknown Artist'}</span>
                                                            </button>
                                                            {playingAudio.album && (
                                                                <>
                                                                    <span className="text-zinc-600">•</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            setInfoSubTab('album');
                                                                            setExpandedSidePanel('info' as any);
                                                                            fetchAlbumInfo(playingAudio.album, playingAudio.artist, (playingAudio as any).albumId);
                                                                        }}
                                                                        className="text-zinc-400 hover:text-white hover:underline transition-colors inline-flex items-center gap-1 cursor-pointer"
                                                                    >
                                                                        <Disc size={13} className="text-zinc-500 shrink-0" />
                                                                        <span>{playingAudio.album}</span>
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Quick Action Buttons */}
                                                        <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                                                            <button
                                                                onClick={() => handleDownloadTrack(playingAudio)}
                                                                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
                                                            >
                                                                <Download size={12} /> Save to Library
                                                            </button>
                                                            <button
                                                                onClick={() => setIsFixMatchOpen(true)}
                                                                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
                                                            >
                                                                <Settings size={12} /> Fix Match
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setExpandedSidePanel('karaoke');
                                                                    setKaraokeSubTab('lyrics');
                                                                }}
                                                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                                                            >
                                                                <Mic2 size={12} /> Karaoke
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Source & Storage Specs Card */}
                                                <div className="space-y-2">
                                                    <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                                        <Info size={13} /> Source &amp; Storage Details
                                                    </span>

                                                    {(() => {
                                                        const srcInfo = getAudioSourceInfo(playingAudio, audioRef.current?.src);
                                                        return (
                                                            <div className="p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/80 space-y-3">
                                                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                                                    <button
                                                                        onClick={() => handleSourceBadgeClick(playingAudio)}
                                                                        className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 transition-all cursor-pointer hover:brightness-110 ${srcInfo.colorClass}`}
                                                                        title={srcInfo.isLocal || srcInfo.isPlex ? 'Click to open in file explorer' : 'Click to open provider website'}
                                                                    >
                                                                        {srcInfo.isLocal ? <HardDrive size={16} /> : srcInfo.isPlex ? <Server size={16} /> : srcInfo.isYt ? <Youtube size={16} /> : <Globe size={16} />}
                                                                        <span className="font-black text-xs sm:text-sm uppercase tracking-wider">{srcInfo.label}</span>
                                                                        <ExternalLink size={12} className="opacity-70" />
                                                                    </button>
                                                                    <span className="text-xs font-mono text-zinc-400">
                                                                        Duration: <b className="text-white">{formatTime(audioCurrentTime)}</b> / <b className="text-amber-400">{formatTime(effectiveDuration)}</b>
                                                                    </span>
                                                                </div>

                                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                                                                    <div className="p-2.5 bg-zinc-950/70 rounded-xl border border-zinc-800/80">
                                                                        <span className="text-[10px] text-zinc-500 uppercase font-black block">Format</span>
                                                                        <span className="font-bold text-white font-mono">{playingAudio.extension?.toUpperCase() || (playingAudio.youtubeId ? 'OPUS / AAC' : 'MP3')}</span>
                                                                    </div>
                                                                    <div className="p-2.5 bg-zinc-950/70 rounded-xl border border-zinc-800/80">
                                                                        <span className="text-[10px] text-zinc-500 uppercase font-black block">Channels</span>
                                                                        <span className="font-bold text-white font-mono">Stereo (2.0 L/R)</span>
                                                                    </div>
                                                                    <div className="p-2.5 bg-zinc-950/70 rounded-xl border border-zinc-800/80">
                                                                        <span className="text-[10px] text-zinc-500 uppercase font-black block">Decoder Status</span>
                                                                        <span className="font-bold text-emerald-400 font-mono capitalize">{audioPlaybackStatus}</span>
                                                                    </div>
                                                                </div>

                                                                {playingAudio.path && (
                                                                    <div className="p-2.5 bg-zinc-950/80 rounded-xl border border-zinc-800 flex items-center justify-between gap-2">
                                                                        <div className="min-w-0 flex-1">
                                                                            <span className="text-[10px] text-zinc-500 uppercase font-black block">Disk Location</span>
                                                                            <p className="text-xs font-mono text-zinc-300 truncate" title={playingAudio.path}>
                                                                                {playingAudio.path}
                                                                            </p>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleSourceBadgeClick(playingAudio)}
                                                                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                                                                            title="Open folder in system file browser"
                                                                        >
                                                                            <FolderOpen size={12} /> Open Folder
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Lyrics Snippet */}
                                                {lyricsData && (lyricsData.lines?.length || lyricsData.plainLyrics) && (
                                                    <div className="p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/80 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                                                <Mic2 size={13} /> Lyrics Snippet
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    setExpandedSidePanel('karaoke');
                                                                    setKaraokeSubTab('lyrics');
                                                                }}
                                                                className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                                                            >
                                                                Full Karaoke View →
                                                            </button>
                                                        </div>
                                                        <p className="text-xs sm:text-sm text-zinc-400 italic line-clamp-3 leading-relaxed">
                                                            {lyricsData.lines?.length
                                                                ? lyricsData.lines.slice(0, 4).map(l => l.text).join(' • ')
                                                                : lyricsData.plainLyrics?.split('\n').slice(0, 4).join(' • ')}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Subtab 2: Album View */}
                                        {(expandedSidePanel === 'album' || (expandedSidePanel !== 'artist' && infoSubTab === 'album')) && (
                                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-4">
                                                {albumLoading ? (
                                                    <div className="flex flex-col items-center justify-center py-20 gap-3 m-auto">
                                                        <div className="w-9 h-9 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Loading Album Details &amp; Tracklist...</p>
                                                    </div>
                                                ) : albumData ? (
                                                    <div className="space-y-4">
                                                        {/* Album Header Card */}
                                                        <div className="p-4 sm:p-5 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row items-center sm:items-start gap-4">
                                                            {albumData.coverUrl ? (
                                                                <img
                                                                    src={albumData.coverUrl}
                                                                    alt=""
                                                                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border border-zinc-700 shadow-xl shrink-0"
                                                                />
                                                            ) : (
                                                                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-zinc-800 flex items-center justify-center text-amber-400 shrink-0 border border-zinc-700">
                                                                    <Disc size={36} />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0 flex-1 text-center sm:text-left space-y-1.5">
                                                                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-wider">
                                                                    Album
                                                                </span>
                                                                <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">{albumData.title}</h2>
                                                                <button
                                                                    onClick={() => {
                                                                        setInfoSubTab('artist');
                                                                        setExpandedSidePanel('info' as any);
                                                                        fetchArtistInfo(albumData.artist);
                                                                    }}
                                                                    className="text-sm sm:text-base font-bold text-amber-300 hover:text-amber-200 hover:underline transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                                                >
                                                                    <User size={13} className="text-amber-400 shrink-0" />
                                                                    <span>{albumData.artist}</span>
                                                                </button>
                                                                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap text-xs text-zinc-400 font-medium pt-1">
                                                                    {albumData.releaseYear && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Calendar size={12} className="text-zinc-500" /> {albumData.releaseYear}
                                                                        </span>
                                                                    )}
                                                                    {albumData.genre && (
                                                                        <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px] font-bold">
                                                                            {albumData.genre}
                                                                        </span>
                                                                    )}
                                                                    <span>•</span>
                                                                    <span>{albumTracks.length > 0 ? `${albumTracks.length} Songs` : (albumData.trackCount ? `${albumData.trackCount} Tracks` : '')}</span>
                                                                </div>
                                                                {/* Action Buttons */}
                                                                <div className="flex items-center justify-center sm:justify-start gap-2 pt-2 flex-wrap">
                                                                    <button
                                                                        onClick={() => {
                                                                            if (albumTracks.length > 0) {
                                                                                playAlbum(albumTracks);
                                                                                toast.success(`Playing album "${albumData.title}"!`);
                                                                            } else {
                                                                                handlePlayAlbumCard(albumData);
                                                                            }
                                                                        }}
                                                                        className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                                                                    >
                                                                        <Play size={13} className="fill-black" /> Play Album
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            if (albumTracks.length > 0) {
                                                                                handleDownloadAlbum(albumTracks, albumData.title);
                                                                            } else {
                                                                                handleDownloadTrack({
                                                                                    id: albumData.id,
                                                                                    title: albumData.title,
                                                                                    artist: albumData.artist,
                                                                                    album: albumData.title,
                                                                                    posterUrl: albumData.coverUrl
                                                                                } as any);
                                                                            }
                                                                        }}
                                                                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 border border-zinc-700 transition-all cursor-pointer"
                                                                    >
                                                                        <Download size={12} /> Download
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Album Tracklist */}
                                                        <div className="space-y-2">
                                                            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                                                                <ListMusic size={14} className="text-amber-400" /> Tracklist ({albumTracks.length})
                                                            </h3>

                                                            {albumTracks.length > 0 ? (
                                                                <div className="divide-y divide-zinc-800/60 bg-zinc-900/40 rounded-xl border border-zinc-800/80 overflow-hidden">
                                                                    {albumTracks.map((t: any, ti: number) => {
                                                                        const isCurrentPlaying = playingAudio?.title?.toLowerCase() === t.title?.toLowerCase() || playingAudio?.id === t.id;
                                                                        return (
                                                                            <div
                                                                                key={t.id || ti}
                                                                                onClick={() => playTrack(t, albumTracks, ti)}
                                                                                className={`p-3 flex items-center justify-between gap-3 hover:bg-zinc-800/50 transition-colors cursor-pointer group ${
                                                                                    isCurrentPlaying ? 'bg-amber-500/10' : ''
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                                    <span className="w-5 text-center text-xs font-mono font-bold text-zinc-500 group-hover:hidden">
                                                                                        {isCurrentPlaying ? (
                                                                                            <Activity size={13} className="text-amber-400 animate-pulse mx-auto" />
                                                                                        ) : (
                                                                                            t.trackNumber || ti + 1
                                                                                        )}
                                                                                    </span>
                                                                                    <Play size={13} className="w-5 text-amber-400 hidden group-hover:block shrink-0 fill-amber-400" />
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                                                            <p className={`text-xs font-bold truncate leading-snug ${isCurrentPlaying ? 'text-amber-400 font-black' : 'text-white group-hover:text-amber-300'}`}>
                                                                                                {t.title}
                                                                                            </p>
                                                                                            {t.isLocal && (
                                                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                                                                                                    {t.extension ? t.extension.toUpperCase() : 'LOCAL'}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <p className="text-[11px] text-zinc-400 truncate">
                                                                                            {t.artist}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-2.5 shrink-0">
                                                                                    <span className="text-[11px] font-mono text-zinc-500 font-semibold">
                                                                                        {t.duration || '3:30'}
                                                                                    </span>
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleDownloadTrack(t);
                                                                                        }}
                                                                                        className="p-1 rounded-lg text-zinc-500 hover:text-amber-300 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                                                                                        title="Download Track"
                                                                                    >
                                                                                        <Download size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="p-6 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-xs text-zinc-500">
                                                                    No track listing found for this album.
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="p-8 text-center text-xs text-zinc-500">
                                                        No album selected. Click an album badge or search an album.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Subtab 3: Artist View */}
                                        {(expandedSidePanel === 'artist' || (expandedSidePanel !== 'album' && infoSubTab === 'artist')) && (
                                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-4">
                                                {artistLoading ? (
                                                    <div className="flex flex-col items-center justify-center py-20 gap-3 m-auto">
                                                        <div className="w-9 h-9 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Loading Artist Profile &amp; Discography...</p>
                                                    </div>
                                                ) : artistData ? (
                                                    <div className="space-y-4">
                                                        {/* Artist Header Card */}
                                                        <div className="p-4 sm:p-5 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row items-center sm:items-start gap-4">
                                                            {artistData.posterUrl ? (
                                                                <img
                                                                    src={artistData.posterUrl}
                                                                    alt=""
                                                                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border border-zinc-700 shadow-xl shrink-0"
                                                                />
                                                            ) : (
                                                                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-zinc-800 flex items-center justify-center text-amber-400 shrink-0 border border-zinc-700">
                                                                    <User size={36} />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0 flex-1 text-center sm:text-left space-y-1.5">
                                                                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                                                    <h2 className="text-xl sm:text-2xl font-black text-white">{artistData.artistName}</h2>
                                                                    {artistData.status && (
                                                                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase">
                                                                            {artistData.status}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {artistData.genres && artistData.genres.length > 0 && (
                                                                    <div className="flex items-center justify-center sm:justify-start gap-1 flex-wrap">
                                                                        {artistData.genres.slice(0, 4).map((g: string, gi: number) => (
                                                                            <span key={gi} className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px] font-bold">
                                                                                {g}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {artistData.recordLabel && (
                                                                    <p className="text-xs text-zinc-500 font-medium">{artistData.recordLabel}</p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Biography Text */}
                                                        {artistData.overview && (
                                                            <div className="p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/80 space-y-2">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                                                                    Biography &amp; Overview
                                                                </span>
                                                                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line max-h-44 overflow-y-auto custom-scrollbar pr-1">
                                                                    {artistData.overview}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Discography & Albums Grid */}
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                                                                    <Disc size={14} className="text-amber-400" /> Discography &amp; Albums ({artistData.albums?.length || 0})
                                                                </span>
                                                            </div>

                                                            {processedArtistAlbums && processedArtistAlbums.length > 0 ? (
                                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                                    {processedArtistAlbums.map((album: any, ai: number) => {
                                                                        const coverImg = album.coverUrl || album.posterUrl || album.coverArt || album.remoteCover || album.remotePoster || album.images?.find((img: any) => img.coverType === 'cover' || img.coverType === 'poster')?.remoteUrl;
                                                                        const albKey = String(album.id || album.lidarrId || album.title);
                                                                        const isDownloadingThis = downloadingAlbumKey === albKey;

                                                                        return (
                                                                            <div
                                                                                key={ai}
                                                                                onClick={() => openAlbumDetails(album.title, artistData.artistName, album.id)}
                                                                                className="p-2.5 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/60 rounded-2xl transition-all space-y-2 group flex flex-col justify-between cursor-pointer hover:scale-[1.02] shadow-lg"
                                                                                title={`Click to view album "${album.title}" tracklist & details`}
                                                                            >
                                                                                <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 flex items-center justify-center relative shadow-md">
                                                                                    {/* Status pill on cover */}
                                                                                    <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                                                                                        {album.downloadStatus === 'downloaded' ? (
                                                                                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 text-emerald-300 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                                                                                                <CheckCircle2 size={9} /> On Disk
                                                                                            </span>
                                                                                        ) : album.downloadStatus === 'downloading' ? (
                                                                                            <span className="px-1.5 py-0.5 rounded-md bg-blue-950/90 backdrop-blur-md border border-blue-500/50 text-blue-300 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 animate-pulse shadow-lg">
                                                                                                <ArrowDownToLine size={9} className="animate-bounce" /> Downloading
                                                                                            </span>
                                                                                        ) : album.downloadStatus === 'missing' ? (
                                                                                            <span className="px-1.5 py-0.5 rounded-md bg-amber-950/90 backdrop-blur-md border border-amber-500/50 text-amber-300 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                                                                                                <AlertCircle size={9} /> Missing
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950/90 backdrop-blur-md border border-zinc-700/50 text-zinc-400 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                                                                                                <Disc size={9} /> Catalog
                                                                                            </span>
                                                                                        )}
                                                                                    </div>

                                                                                    {coverImg ? (
                                                                                        <img src={coverImg} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                                    ) : (
                                                                                        <Disc size={28} className="text-zinc-700" />
                                                                                    )}
                                                                                    {/* Play Overlay */}
                                                                                    <div 
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handlePlayAlbumCard(album);
                                                                                        }}
                                                                                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                                                                        title="Play Album"
                                                                                    >
                                                                                        <div className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                                                                                            <Play size={18} className="ml-0.5 fill-black" />
                                                                                        </div>
                                                                                    </div>
                                                                                    {album.releaseDate && (
                                                                                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[9px] font-mono font-bold text-amber-300">
                                                                                            {String(album.releaseDate).slice(0, 4)}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="space-y-1">
                                                                                    <h4 className="font-bold text-white text-xs truncate group-hover:text-amber-400 transition-colors" title={album.title}>
                                                                                        {album.title}
                                                                                    </h4>
                                                                                    <div className="flex items-center gap-1 flex-wrap">
                                                                                        {album.downloadStatus === 'downloaded' ? (
                                                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[8px] font-black uppercase tracking-wider">
                                                                                                <CheckCircle2 size={8} /> Downloaded
                                                                                            </span>
                                                                                        ) : album.downloadStatus === 'downloading' ? (
                                                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[8px] font-black uppercase tracking-wider animate-pulse">
                                                                                                <ArrowDownToLine size={8} /> In Queue{album.downloadPercent ? ` (${album.downloadPercent}%)` : ''}
                                                                                            </span>
                                                                                        ) : album.downloadStatus === 'missing' ? (
                                                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[8px] font-black uppercase tracking-wider">
                                                                                                <AlertCircle size={8} /> Added • Missing
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[8px] font-black uppercase tracking-wider">
                                                                                                <Disc size={8} /> Catalog
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex items-center justify-between pt-1">
                                                                                        <span className="text-[10px] text-zinc-500 font-medium">
                                                                                            {album.trackCount ? `${album.trackCount} Tracks` : 'Album'}
                                                                                        </span>
                                                                                        {album.downloadStatus === 'downloaded' ? (
                                                                                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold uppercase flex items-center gap-0.5">
                                                                                                <CheckCircle2 size={9} /> Saved
                                                                                            </span>
                                                                                        ) : album.downloadStatus === 'downloading' ? (
                                                                                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-bold uppercase flex items-center gap-0.5 animate-pulse">
                                                                                                <ArrowDownToLine size={9} /> Queue
                                                                                            </span>
                                                                                        ) : (
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    handleDownloadFullAlbum(album);
                                                                                                }}
                                                                                                disabled={isDownloadingThis}
                                                                                                className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-amber-500 text-zinc-400 hover:text-black text-[9px] font-bold uppercase transition-all flex items-center gap-1 disabled:opacity-50"
                                                                                                title="Download Full Album"
                                                                                            >
                                                                                                <Download size={10} /> {isDownloadingThis ? '...' : 'Download'}
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="p-6 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-xs text-zinc-500">
                                                                    No albums found.
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="p-8 text-center text-xs text-zinc-500">
                                                        No artist information available.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 3. Queue & Playlists Tab with Subtabs */}
                                {(expandedSidePanel === 'queue' || expandedSidePanel === 'playlists') && (
                                    <div className="flex-1 min-h-0 flex flex-col space-y-2.5">
                                        {/* Sub-tabs Header inside Queue */}
                                        <div className="flex items-center justify-between gap-2 p-1 bg-zinc-900/90 rounded-2xl border border-zinc-800 shrink-0">
                                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scrollbar-none">
                                                <button
                                                    onClick={() => {
                                                        setQueueSubTab('queue');
                                                        setExpandedSidePanel('queue');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
                                                        (expandedSidePanel === 'playlists' ? false : queueSubTab === 'queue')
                                                            ? 'bg-amber-500 text-black font-black shadow-sm'
                                                            : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <ListMusic size={13} /> Queue ({audioQueue.length})
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setQueueSubTab('playlists');
                                                        setExpandedSidePanel('queue');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
                                                        (expandedSidePanel === 'playlists' || queueSubTab === 'playlists')
                                                            ? 'bg-amber-500 text-black font-black shadow-sm'
                                                            : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <ListPlus size={13} /> Playlists ({inPlayerPlaylists.length})
                                                </button>
                                            </div>
                                            {(expandedSidePanel === 'playlists' ? false : queueSubTab === 'queue') && audioQueue.length > 1 && (
                                                <button
                                                    onClick={() => {
                                                        if (playingAudio) {
                                                            setAudioQueue([playingAudio]);
                                                            setQueueIndex(0);
                                                            toast.success('Queue cleared (now-playing preserved)');
                                                        }
                                                    }}
                                                    className="text-[11px] font-bold text-zinc-400 hover:text-red-400 px-2.5 py-1 rounded-lg hover:bg-zinc-800 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                                                    title="Clear upcoming queue"
                                                >
                                                    <Trash2 size={11} /> Clear
                                                </button>
                                            )}
                                        </div>

                                        {/* Subtab 1: Playback Queue View */}
                                        {(expandedSidePanel === 'playlists' ? false : queueSubTab === 'queue') && (
                                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                                {audioQueue.map((track, i) => {
                                                    const isCurrent = i === queueIndex;
                                                    return (
                                                        <div
                                                            key={`${track.id}-${i}`}
                                                            onClick={() => {
                                                                setQueueIndex(i);
                                                                setPlayingAudio(track);
                                                                setIsAudioPlaying(true);
                                                            }}
                                                            className={`p-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-between cursor-pointer border ${
                                                                isCurrent
                                                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm'
                                                                    : 'bg-zinc-900/40 border-zinc-900 text-zinc-300 hover:bg-zinc-900/80 hover:text-white'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <span className="w-5 text-zinc-600 font-mono font-bold">{i + 1}</span>
                                                                <div className="truncate">
                                                                    <p className="truncate font-bold text-white text-xs sm:text-sm">{track.title}</p>
                                                                    <span className="text-[11px] text-zinc-500">{track.artist || 'Artist'}</span>
                                                                </div>
                                                            </div>
                                                            {isCurrent && <Volume2 size={16} className="text-amber-400 shrink-0 animate-pulse" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Subtab 2: Playlists View */}
                                        {(expandedSidePanel === 'playlists' || queueSubTab === 'playlists') && (
                                            selectedInPlayerPlaylist ? (
                                                <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden p-1">
                                                    {/* Navigation & Actions Top Bar */}
                                                    <div className="flex items-center justify-between gap-2 shrink-0">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedInPlayerPlaylist(null);
                                                                setInPlayerPlaylistSearchQuery('');
                                                            }}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold transition-all border border-zinc-700/60 cursor-pointer"
                                                        >
                                                            <ArrowLeft size={14} /> Back
                                                        </button>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handlePlayWholePlaylist(selectedInPlayerPlaylist)}
                                                                disabled={!selectedInPlayerPlaylist.items || selectedInPlayerPlaylist.items.length === 0}
                                                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer shadow-md"
                                                            >
                                                                <Play size={13} className="fill-black" /> Play All
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const items = Array.isArray(selectedInPlayerPlaylist.items) ? [...selectedInPlayerPlaylist.items] : [];
                                                                    if (items.length === 0) return;
                                                                    const shuffled = [...items].sort(() => Math.random() - 0.5);
                                                                    playTrack(shuffled[0], shuffled);
                                                                    toast.success(`Shuffling "${selectedInPlayerPlaylist.name}"`);
                                                                }}
                                                                disabled={!selectedInPlayerPlaylist.items || selectedInPlayerPlaylist.items.length === 0}
                                                                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all disabled:opacity-40 cursor-pointer border border-zinc-700/60"
                                                                title="Shuffle Playlist"
                                                            >
                                                                <Shuffle size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteInPlayerPlaylist(selectedInPlayerPlaylist.id, selectedInPlayerPlaylist.name)}
                                                                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-all cursor-pointer border border-zinc-700/60"
                                                                title="Delete Playlist"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Playlist Banner */}
                                                    <div className="flex items-center gap-3 bg-zinc-900/70 p-3 rounded-2xl border border-zinc-800/80 shrink-0">
                                                        <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                                                            {selectedInPlayerPlaylist.cover_url ? (
                                                                <img src={selectedInPlayerPlaylist.cover_url} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Disc size={22} className="text-amber-500" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="font-bold text-white text-sm sm:text-base truncate">{selectedInPlayerPlaylist.name}</h4>
                                                            <p className="text-xs text-zinc-400 mt-0.5">
                                                                {(selectedInPlayerPlaylist.items || []).length} track{(selectedInPlayerPlaylist.items || []).length !== 1 ? 's' : ''}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* In-Playlist Search Bar */}
                                                    <div className="relative shrink-0">
                                                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                                        <input
                                                            type="text"
                                                            value={inPlayerPlaylistSearchQuery}
                                                            onChange={e => setInPlayerPlaylistSearchQuery(e.target.value)}
                                                            placeholder="Search songs inside playlist..."
                                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                                                        />
                                                        {inPlayerPlaylistSearchQuery && (
                                                            <button
                                                                onClick={() => setInPlayerPlaylistSearchQuery('')}
                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Tracks List */}
                                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                                        {filteredInPlayerPlaylistTracks.length === 0 ? (
                                                            <div className="py-14 text-center text-zinc-500 text-xs sm:text-sm space-y-1">
                                                                <p className="font-semibold text-zinc-400">
                                                                    {inPlayerPlaylistSearchQuery ? 'No matching songs found' : 'Playlist is empty'}
                                                                </p>
                                                                <p className="text-zinc-600 text-xs">
                                                                    {inPlayerPlaylistSearchQuery ? 'Try another keyword' : 'Add songs while listening or from theater'}
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            filteredInPlayerPlaylistTracks.map(({ track, originalIndex }: any) => {
                                                                const isCurrent = playingAudio?.id === track.id;
                                                                const totalItems = (selectedInPlayerPlaylist.items || []).length;
                                                                const isSearching = !!inPlayerPlaylistSearchQuery.trim();

                                                                return (
                                                                    <div
                                                                        key={`${track.id || track.streamUrl}-${originalIndex}`}
                                                                        className={`group p-2.5 rounded-xl flex items-center justify-between gap-2.5 transition-all border ${
                                                                            isCurrent
                                                                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                                                                : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800/60 text-zinc-300'
                                                                        }`}
                                                                    >
                                                                        <div
                                                                            onClick={() => playTrack(track, selectedInPlayerPlaylist.items)}
                                                                            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                                                                        >
                                                                            <div className="w-9 h-9 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                                                                                {track.posterUrl ? (
                                                                                    <img src={track.posterUrl} alt="" className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <Music size={15} className={isCurrent ? "text-amber-400" : "text-zinc-600"} />
                                                                                )}
                                                                                {isCurrent && (
                                                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                                                        <Volume2 size={13} className="text-amber-400 animate-pulse" />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className={`text-xs sm:text-sm font-bold truncate ${isCurrent ? 'text-amber-400' : 'text-white'}`}>
                                                                                    {track.title || track.name}
                                                                                </p>
                                                                                <p className="text-xs text-zinc-500 truncate">
                                                                                    {track.artist || 'Unknown Artist'}
                                                                                </p>
                                                                            </div>
                                                                        </div>

                                                                        {/* Track Controls: Reorder Up/Down, Play, Remove */}
                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            {!isSearching && (
                                                                                <div className="flex items-center">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleMoveInPlayerPlaylistTrack(selectedInPlayerPlaylist.id, originalIndex, originalIndex - 1);
                                                                                        }}
                                                                                        disabled={originalIndex === 0}
                                                                                        className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed rounded-lg hover:bg-zinc-800 transition-colors"
                                                                                        title="Move Up"
                                                                                    >
                                                                                        <ChevronUp size={15} />
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleMoveInPlayerPlaylistTrack(selectedInPlayerPlaylist.id, originalIndex, originalIndex + 1);
                                                                                        }}
                                                                                        disabled={originalIndex === totalItems - 1}
                                                                                        className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed rounded-lg hover:bg-zinc-800 transition-colors"
                                                                                        title="Move Down"
                                                                                    >
                                                                                        <ChevronDown size={15} />
                                                                                    </button>
                                                                                </div>
                                                                            )}

                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    playTrack(track, selectedInPlayerPlaylist.items);
                                                                                }}
                                                                                className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                                                                title="Play Track"
                                                                            >
                                                                                <Play size={14} className="fill-current" />
                                                                            </button>

                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleRemoveInPlayerPlaylistTrack(selectedInPlayerPlaylist.id, originalIndex);
                                                                                }}
                                                                                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                                                title="Remove from Playlist"
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden p-1">
                                                    {/* Playlists Header & Quick Create */}
                                                    <div className="flex items-center justify-between gap-2 shrink-0">
                                                        <div>
                                                            <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                                                                <ListPlus size={16} className="text-amber-400" /> Saved Playlists ({inPlayerPlaylists.length})
                                                            </h3>
                                                            <p className="text-xs text-zinc-500">Tap to open playlist, play, or add current song</p>
                                                        </div>
                                                        <button
                                                            onClick={() => setShowInPlayerCreatePlaylist(!showInPlayerCreatePlaylist)}
                                                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all shadow-md shrink-0 cursor-pointer"
                                                        >
                                                            <Plus size={14} /> New
                                                        </button>
                                                    </div>

                                                    {/* Create Playlist Input */}
                                                    {showInPlayerCreatePlaylist && (
                                                        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-2 shrink-0 animate-in fade-in duration-150">
                                                            <input
                                                                type="text"
                                                                value={inPlayerNewPlaylistName}
                                                                onChange={e => setInPlayerNewPlaylistName(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && handleCreateInPlayerPlaylist()}
                                                                placeholder="Enter playlist name..."
                                                                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                                                                autoFocus
                                                            />
                                                            <button
                                                                onClick={handleCreateInPlayerPlaylist}
                                                                disabled={!inPlayerNewPlaylistName.trim()}
                                                                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase disabled:opacity-50 transition-all cursor-pointer"
                                                            >
                                                                Create
                                                            </button>
                                                            <button
                                                                onClick={() => setShowInPlayerCreatePlaylist(false)}
                                                                className="p-2 text-zinc-500 hover:text-white rounded-xl cursor-pointer"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Playlists List */}
                                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                                        {inPlayerPlaylists.length === 0 ? (
                                                            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 m-auto">
                                                                <div className="p-4 bg-zinc-900/60 rounded-full text-zinc-600">
                                                                    <ListMusic size={32} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm sm:text-base font-bold text-white">No Playlists Created Yet</p>
                                                                    <p className="text-xs text-zinc-500 mt-1">Create your first playlist or save your favorite tracks!</p>
                                                                </div>
                                                                <button
                                                                    onClick={() => setShowInPlayerCreatePlaylist(true)}
                                                                    className="px-4 py-2 rounded-xl bg-amber-500 text-black font-black text-xs uppercase cursor-pointer"
                                                                >
                                                                    + Create First Playlist
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            inPlayerPlaylists.map((pl: any) => {
                                                                const items = Array.isArray(pl.items) ? pl.items : [];
                                                                const isSongInPlaylist = items.some((i: any) => i.id === playingAudio?.id);
                                                                return (
                                                                    <div
                                                                        key={pl.id}
                                                                        onClick={() => setSelectedInPlayerPlaylist(pl)}
                                                                        className="p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700/90 rounded-2xl transition-all flex items-center justify-between gap-3 group cursor-pointer"
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                            <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                                                                                {pl.cover_url ? (
                                                                                    <img src={pl.cover_url} alt="" className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <Disc size={20} className="text-amber-500" />
                                                                                )}
                                                                            </div>
                                                                            <div className="min-w-0 flex-1">
                                                                                <h4 className="font-bold text-white text-xs sm:text-sm truncate group-hover:text-amber-400 transition-colors">
                                                                                    {pl.name}
                                                                                </h4>
                                                                                <p className="text-xs text-zinc-500">
                                                                                    {items.length} track{items.length !== 1 ? 's' : ''} • Click to open
                                                                                </p>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                                                            <button
                                                                                onClick={() => handleAddCurrentSongToPlaylist(pl)}
                                                                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                                                                                    isSongInPlaylist
                                                                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                                                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                                                                                }`}
                                                                                title={isSongInPlaylist ? 'Already in playlist' : 'Add currently playing song to playlist'}
                                                                            >
                                                                                {isSongInPlaylist ? (
                                                                                    <>
                                                                                        <Check size={12} /> In List
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Plus size={12} /> Add Song
                                                                                    </>
                                                                                )}
                                                                            </button>

                                                                            <button
                                                                                onClick={() => handlePlayWholePlaylist(pl)}
                                                                                disabled={items.length === 0}
                                                                                className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition-all disabled:opacity-40 cursor-pointer"
                                                                                title="Play Playlist"
                                                                            >
                                                                                <Play size={14} className="ml-0.5 fill-black" />
                                                                            </button>

                                                                            <button
                                                                                onClick={() => handleDeleteInPlayerPlaylist(pl.id, pl.name)}
                                                                                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                                                                                title="Delete Playlist"
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}

                                {/* 6. Search & Discover Tab Content */}
                                {expandedSidePanel === 'search' && (
                                    <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
                                        {/* Search Input Bar & Filters */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="relative flex-1">
                                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                                <input
                                                    type="text"
                                                    value={inPlayerSearchQuery}
                                                    onChange={e => {
                                                        setInPlayerSearchQuery(e.target.value);
                                                        handleInPlayerSearch(e.target.value);
                                                    }}
                                                    onKeyDown={e => e.key === 'Enter' && handleInPlayerSearch(inPlayerSearchQuery)}
                                                    placeholder="Search songs, artists, albums in Library & YouTube..."
                                                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-medium transition-colors"
                                                />
                                                {inPlayerSearchQuery && (
                                                    <button
                                                        onClick={() => {
                                                            setInPlayerSearchQuery('');
                                                            setInPlayerSearchResultsLocal([]);
                                                            setInPlayerSearchResultsOnline([]);
                                                        }}
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Source Filter Toggle */}
                                            <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 shrink-0 text-[11px] font-bold">
                                                {(['all', 'library', 'youtube'] as const).map(f => (
                                                    <button
                                                        key={f}
                                                        onClick={() => setInPlayerFilter(f)}
                                                        className={`px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all ${
                                                            inPlayerFilter === f
                                                                ? 'bg-amber-500 text-black shadow-sm'
                                                                : 'text-zinc-400 hover:text-white'
                                                        }`}
                                                    >
                                                        {f === 'all' ? 'All' : f === 'library' ? 'Library' : 'YouTube'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Results or Suggestions */}
                                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                                            {inPlayerSearchLoading && (
                                                <div className="flex items-center justify-center gap-2 py-8 text-zinc-500 text-xs">
                                                    <RefreshCw size={15} className="animate-spin text-amber-400" />
                                                    <span>Searching Library & YouTube...</span>
                                                </div>
                                            )}

                                            {!inPlayerSearchQuery && !inPlayerSearchLoading && (
                                                <div className="space-y-3 py-2">
                                                    <p className="text-xs font-bold text-zinc-400">Quick Artist & Genre Suggestions:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            playingAudio.artist,
                                                            'OneRepublic',
                                                            'Imagine Dragons',
                                                            'Coldplay',
                                                            'Acoustic',
                                                            'Lo-Fi Beats',
                                                            'Rock Classics',
                                                            'Pop Hits',
                                                            'Chill Vibes'
                                                        ].filter(Boolean).map((tag, idx) => (
                                                            <button
                                                                key={`${tag}-${idx}`}
                                                                onClick={() => {
                                                                    setInPlayerSearchQuery(tag!);
                                                                    handleInPlayerSearch(tag!);
                                                                }}
                                                                className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 border border-zinc-800 text-xs font-bold transition-all"
                                                            >
                                                                🔍 {tag}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Local Library Matches */}
                                            {(inPlayerFilter === 'all' || inPlayerFilter === 'library') && inPlayerSearchResultsLocal.length > 0 && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                                            <Music size={13} /> In Your Library ({inPlayerSearchResultsLocal.length})
                                                        </span>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        {inPlayerSearchResultsLocal.map((track) => (
                                                            <div
                                                                key={track.id}
                                                                className="p-2.5 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl transition-all flex items-center justify-between gap-3 group"
                                                            >
                                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                    <div className="w-10 h-10 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-500 shrink-0">
                                                                        {track.posterUrl ? (
                                                                            <img src={track.posterUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <Music size={16} />
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <h4 className="font-bold text-xs sm:text-sm text-white truncate group-hover:text-amber-300 transition-colors">
                                                                            {track.title}
                                                                        </h4>
                                                                        <p className="text-[11px] text-zinc-500 truncate">
                                                                            {track.artist} • <span className="text-emerald-400">Library</span>
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <button
                                                                        onClick={() => addToQueue(track)}
                                                                        className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-bold"
                                                                        title="Add to Playback Queue"
                                                                    >
                                                                        <ListPlus size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => playTrack(track)}
                                                                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black transition-all text-xs font-black flex items-center gap-1 shadow-sm"
                                                                        title="Play Track on Record Player"
                                                                    >
                                                                        <Play size={12} className="fill-black" /> Play
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* YouTube & Online Stream Matches */}
                                            {(inPlayerFilter === 'all' || inPlayerFilter === 'youtube') && inPlayerSearchResultsOnline.length > 0 && (
                                                <div className="space-y-2 pt-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                                                            <Youtube size={14} /> YouTube &amp; Online Music ({inPlayerSearchResultsOnline.length})
                                                        </span>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        {inPlayerSearchResultsOnline.map((track) => (
                                                            <div
                                                                key={track.id}
                                                                className="p-2.5 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl transition-all flex items-center justify-between gap-3 group"
                                                            >
                                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                    <div className="w-10 h-10 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-500 shrink-0">
                                                                        {track.posterUrl ? (
                                                                            <img src={track.posterUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <Youtube size={16} className="text-red-500" />
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <h4 className="font-bold text-xs sm:text-sm text-white truncate group-hover:text-amber-300 transition-colors">
                                                                            {track.title}
                                                                        </h4>
                                                                        <p className="text-[11px] text-zinc-500 truncate">
                                                                            {track.artist} • <span className="text-red-400">YouTube</span> • {track.duration}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <button
                                                                        onClick={() => handleDownloadTrack(track)}
                                                                        className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 transition-all"
                                                                        title="Download Track / Add to Library"
                                                                    >
                                                                        <Download size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => addToQueue(track)}
                                                                        className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all"
                                                                        title="Add to Playback Queue"
                                                                    >
                                                                        <ListPlus size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => playTrack(track)}
                                                                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black transition-all text-xs font-black flex items-center gap-1 shadow-sm"
                                                                        title="Stream & Play on Record Player"
                                                                    >
                                                                        <Play size={12} className="fill-black" /> Play
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {inPlayerSearchQuery && !inPlayerSearchLoading && inPlayerSearchResultsLocal.length === 0 && inPlayerSearchResultsOnline.length === 0 && (
                                                <div className="text-center py-8 text-zinc-500 text-xs italic">
                                                    No tracks or artists found for "{inPlayerSearchQuery}". Try a different keyword.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               FIX MATCH & VERIFIED METADATA MODAL
               ══════════════════════════════════════════════════════════════ */}
            {isFixMatchOpen && (
                <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-2xl p-6 sm:p-8 shadow-2xl relative max-h-[90vh] flex flex-col space-y-5 overflow-hidden">
                        <button
                            onClick={() => setIsFixMatchOpen(false)}
                            className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all z-20"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-2 pb-2 border-b border-zinc-900">
                            <span className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                                <Wrench size={14} /> Fix Match &amp; Song Metadata
                            </span>
                        </div>

                        {/* Search Input for Verified Match */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                Search Verified Metadata (Apple Music, Deezer, LRCLib)
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                    <input
                                        type="text"
                                        value={fixMatchQuery}
                                        onChange={(e) => setFixMatchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearchFixMatch(fixMatchQuery)}
                                        placeholder="Search Artist and Song title..."
                                        className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-medium"
                                    />
                                </div>
                                <button
                                    onClick={() => handleSearchFixMatch(fixMatchQuery)}
                                    disabled={fixMatchLoading || !fixMatchQuery.trim()}
                                    className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 shrink-0"
                                >
                                    {fixMatchLoading ? 'Searching...' : 'Search'}
                                </button>
                            </div>
                        </div>

                        {/* Search Results List */}
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2.5 pr-1">
                            {fixMatchLoading ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-2">
                                    <div className="w-8 h-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Searching Music Databases...</p>
                                </div>
                            ) : fixMatchResults.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                                        Verified Matches Found ({fixMatchResults.length}):
                                    </p>
                                    {fixMatchResults.map((result) => (
                                        <div
                                            key={result.id}
                                            className="p-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-amber-500/30 transition-all flex items-center justify-between gap-3 group"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                {result.coverUrl ? (
                                                    <img
                                                        src={result.coverUrl}
                                                        alt=""
                                                        className="w-12 h-12 rounded-xl object-cover border border-zinc-700 shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                                                        <Music size={20} />
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-bold text-sm text-white truncate group-hover:text-amber-300 transition-colors">
                                                        {result.title}
                                                    </h4>
                                                    <p className="text-xs text-amber-400 font-medium truncate">
                                                        {result.artist}
                                                    </p>
                                                    <p className="text-[11px] text-zinc-500 truncate">
                                                        {result.album} {result.releaseYear ? `(${result.releaseYear})` : ''} • <span className="text-emerald-400">{result.source}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => applyFixMatch(result)}
                                                className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black font-black text-xs uppercase tracking-wider border border-amber-500/30 hover:border-amber-400 transition-all shrink-0 flex items-center gap-1.5"
                                            >
                                                <Check size={14} /> Match This
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : fixMatchQuery ? (
                                <p className="text-xs text-zinc-500 text-center py-6">No matching song found in catalog. You can manually enter the accurate tags below.</p>
                            ) : null}

                            {/* Manual Metadata Entry Option */}
                            <div className="pt-3 border-t border-zinc-900 space-y-3">
                                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                                    Or Manually Set Custom Tags:
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 uppercase font-black">Artist Name</label>
                                        <input
                                            type="text"
                                            value={customMatchArtist}
                                            onChange={(e) => setCustomMatchArtist(e.target.value)}
                                            placeholder="e.g. Queen"
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 uppercase font-black">Song Title</label>
                                        <input
                                            type="text"
                                            value={customMatchTitle}
                                            onChange={(e) => setCustomMatchTitle(e.target.value)}
                                            placeholder="e.g. Bohemian Rhapsody"
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="text-[10px] text-zinc-500 uppercase font-black">Album (Optional)</label>
                                        <input
                                            type="text"
                                            value={customMatchAlbum}
                                            onChange={(e) => setCustomMatchAlbum(e.target.value)}
                                            placeholder="e.g. A Night at the Opera"
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        if (!customMatchArtist.trim() || !customMatchTitle.trim()) {
                                            toast.error('Artist and Song Title are required');
                                            return;
                                        }
                                        applyFixMatch({
                                            artist: customMatchArtist.trim(),
                                            title: customMatchTitle.trim(),
                                            album: customMatchAlbum.trim() || undefined
                                        });
                                    }}
                                    className="w-full py-2.5 rounded-2xl bg-zinc-800 hover:bg-amber-500 text-zinc-200 hover:text-black font-black text-xs uppercase tracking-wider transition-all border border-zinc-700 hover:border-amber-400"
                                >
                                    Apply Custom Metadata Override
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               STANDALONE ARTIST BIOGRAPHY & DISCOGRAPHY MODAL
               ══════════════════════════════════════════════════════════════ */}
            {showArtistModal && selectedArtistName && (
                <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 shadow-2xl relative max-h-[88vh] flex flex-col space-y-5 overflow-hidden">
                        <button
                            onClick={() => setShowArtistModal(false)}
                            className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all z-20"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-2 pb-2 border-b border-zinc-900">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase flex items-center gap-1">
                                <User size={12} /> Artist Profile &amp; Discography
                            </span>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-5 pr-1">
                            {artistLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <div className="w-10 h-10 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Loading Artist Profile...</p>
                                </div>
                            ) : artistData ? (
                                <div className="space-y-5">
                                    {/* Artist Header */}
                                    <div className="p-5 bg-zinc-900/60 rounded-3xl border border-zinc-800 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                                        {artistData.posterUrl ? (
                                            <img
                                                src={artistData.posterUrl}
                                                alt=""
                                                className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover border border-zinc-700 shadow-2xl shrink-0"
                                            />
                                        ) : (
                                            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-zinc-800 flex items-center justify-center text-amber-400 shrink-0 border border-zinc-700">
                                                <User size={48} />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1 text-center sm:text-left space-y-2">
                                            <div className="flex items-center justify-center sm:justify-start gap-2.5 flex-wrap">
                                                <h1 className="text-2xl sm:text-3xl font-black text-white">{artistData.artistName}</h1>
                                                {artistData.status && (
                                                    <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase">
                                                        {artistData.status}
                                                    </span>
                                                )}
                                            </div>
                                            {artistData.genres && artistData.genres.length > 0 && (
                                                <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
                                                    {artistData.genres.map((g: string, gi: number) => (
                                                        <span key={gi} className="px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold">
                                                            {g}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {artistData.recordLabel && (
                                                <p className="text-xs text-zinc-400 font-medium">{artistData.recordLabel}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Biography Overview */}
                                    {artistData.overview && (
                                        <div className="p-5 bg-zinc-900/40 rounded-3xl border border-zinc-800/80 space-y-2">
                                            <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 block">
                                                Artist Biography
                                            </span>
                                            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                                                {artistData.overview}
                                            </p>
                                        </div>
                                    )}

                                    {/* ── View Mode Switcher: Discography Albums vs Top Songs ── */}
                                    <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-zinc-900">
                                        <div className="flex items-center gap-1.5 p-1 bg-zinc-900/80 rounded-2xl border border-zinc-800">
                                            <button
                                                onClick={() => setArtistViewMode('albums')}
                                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                                                    artistViewMode === 'albums'
                                                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <Disc size={15} /> Albums ({artistData.albums?.length || 0})
                                            </button>
                                            <button
                                                onClick={() => setArtistViewMode('songs')}
                                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                                                    artistViewMode === 'songs'
                                                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                <Music size={15} /> Top Songs ({artistData.topSongs?.length || 0})
                                            </button>
                                        </div>

                                        {/* Search Filter input */}
                                        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                                            <input
                                                type="text"
                                                value={artistSearchQuery}
                                                onChange={(e) => setArtistSearchQuery(e.target.value)}
                                                placeholder={artistViewMode === 'albums' ? 'Search discography...' : 'Search top songs...'}
                                                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
                                            />
                                            {artistSearchQuery && (
                                                <button
                                                    onClick={() => setArtistSearchQuery('')}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Mode 1: Discography Albums Grid ── */}
                                    {artistViewMode === 'albums' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                                                {/* Full Albums vs All Releases Toggle */}
                                                <div className="flex items-center gap-1 bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/80">
                                                    <button
                                                        onClick={() => setArtistAlbumFilter('all')}
                                                        className={`px-3 py-1 rounded-lg font-bold transition-all ${
                                                            artistAlbumFilter === 'all'
                                                                ? 'bg-zinc-800 text-amber-400 border border-amber-500/30'
                                                                : 'text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                    >
                                                        All Releases ({artistData.albums?.length || 0})
                                                    </button>
                                                    <button
                                                        onClick={() => setArtistAlbumFilter('full_albums')}
                                                        className={`px-3 py-1 rounded-lg font-bold transition-all ${
                                                            artistAlbumFilter === 'full_albums'
                                                                ? 'bg-zinc-800 text-amber-400 border border-amber-500/30'
                                                                : 'text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                    >
                                                        Full Albums Only ({artistData.albums?.filter((a: any) => a.isFullAlbum).length || 0})
                                                    </button>
                                                </div>

                                                {/* Sort selector for Albums */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-zinc-500 font-bold text-[11px] uppercase tracking-wider">Sort:</span>
                                                    <select
                                                        value={artistAlbumSort}
                                                        onChange={(e) => setArtistAlbumSort(e.target.value as any)}
                                                        className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-amber-500/60"
                                                    >
                                                        <option value="popularity">Most Popular</option>
                                                        <option value="newest">Newest First</option>
                                                        <option value="oldest">Oldest First</option>
                                                        <option value="alphabetical">Alphabetical (A-Z)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {processedArtistAlbums.length > 0 ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                                    {processedArtistAlbums.map((album: any, ai: number) => {
                                                        const coverImg = album.coverUrl || album.posterUrl || album.coverArt || album.remoteCover || album.remotePoster || album.images?.find((img: any) => img.coverType === 'cover' || img.coverType === 'poster')?.remoteUrl;
                                                        const albKey = String(album.id || album.lidarrId || album.title);
                                                        const isDownloadingThis = downloadingAlbumKey === albKey;

                                                        return (
                                                            <div
                                                                key={ai}
                                                                onClick={() => openAlbumDetails(album.title, artistData.artistName, album.id)}
                                                                className="p-3 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/60 rounded-2xl transition-all space-y-2 group flex flex-col justify-between cursor-pointer hover:scale-[1.02] shadow-xl"
                                                                title={`Click to view album "${album.title}" tracklist & details`}
                                                            >
                                                                <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 flex items-center justify-center relative shadow-md">
                                                                    {/* Status pill on cover */}
                                                                    <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                                                                        {album.downloadStatus === 'downloaded' ? (
                                                                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 text-emerald-300 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                                                                                <CheckCircle2 size={9} /> On Disk
                                                                            </span>
                                                                        ) : album.downloadStatus === 'downloading' ? (
                                                                            <span className="px-1.5 py-0.5 rounded-md bg-blue-950/90 backdrop-blur-md border border-blue-500/50 text-blue-300 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 animate-pulse shadow-lg">
                                                                                <ArrowDownToLine size={9} className="animate-bounce" /> Downloading
                                                                            </span>
                                                                        ) : album.downloadStatus === 'missing' ? (
                                                                            <span className="px-1.5 py-0.5 rounded-md bg-amber-950/90 backdrop-blur-md border border-amber-500/50 text-amber-300 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                                                                                <AlertCircle size={9} /> Missing
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950/90 backdrop-blur-md border border-zinc-700/50 text-zinc-400 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                                                                                <Disc size={9} /> Catalog
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* Full Album vs Single Pill */}
                                                                    {album.isFullAlbum ? (
                                                                        <span className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px] font-black uppercase">
                                                                            Album
                                                                        </span>
                                                                    ) : (
                                                                        <span className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-zinc-900/90 text-zinc-400 border border-zinc-800 text-[8px] font-bold uppercase">
                                                                            Single/EP
                                                                        </span>
                                                                    )}

                                                                    {coverImg ? (
                                                                        <img src={coverImg} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                    ) : (
                                                                        <Disc size={32} className="text-zinc-700" />
                                                                    )}
                                                                    {/* Play Overlay */}
                                                                    <div 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handlePlayAlbumCard(album);
                                                                        }}
                                                                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                                                        title="Play Album"
                                                                    >
                                                                        <div className="w-11 h-11 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                                                                            <Play size={20} className="ml-0.5 fill-black" />
                                                                        </div>
                                                                    </div>
                                                                    {album.releaseDate && (
                                                                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono font-bold text-amber-300">
                                                                            {String(album.releaseDate).slice(0, 4)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <h4 className="font-bold text-white text-xs truncate group-hover:text-amber-400 transition-colors" title={album.title}>
                                                                        {album.title}
                                                                    </h4>
                                                                    <div className="flex items-center justify-between pt-1">
                                                                        <span className="text-[10px] text-zinc-500 font-medium">
                                                                            {album.trackCount ? `${album.trackCount} Tracks` : 'Album'}
                                                                        </span>
                                                                        {album.downloadStatus === 'downloaded' ? (
                                                                            <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase flex items-center gap-1">
                                                                                <CheckCircle2 size={10} /> Saved
                                                                            </span>
                                                                        ) : album.downloadStatus === 'downloading' ? (
                                                                            <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase flex items-center gap-1 animate-pulse">
                                                                                <ArrowDownToLine size={10} /> Queue
                                                                            </span>
                                                                        ) : (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDownloadFullAlbum(album);
                                                                                }}
                                                                                disabled={isDownloadingThis}
                                                                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-amber-500 text-zinc-400 hover:text-black text-[10px] font-bold uppercase transition-all flex items-center gap-1 disabled:opacity-50"
                                                                                title="Download Full Album"
                                                                            >
                                                                                {isDownloadingThis ? (
                                                                                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                                ) : (
                                                                                    <Download size={11} />
                                                                                )}
                                                                                {isDownloadingThis ? 'Loading...' : 'Download'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="p-8 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-xs text-zinc-500">
                                                    No albums match the current filter.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Mode 2: Iconic & Most Listened Top Songs ── */}
                                    {artistViewMode === 'songs' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-1 bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/80">
                                                        <button
                                                            onClick={() => setArtistSongFilter('all')}
                                                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                                                                artistSongFilter === 'all'
                                                                    ? 'bg-zinc-800 text-amber-400 border border-amber-500/30'
                                                                    : 'text-zinc-500 hover:text-zinc-300'
                                                            }`}
                                                        >
                                                            All Top Songs ({artistData.topSongs?.length || 0})
                                                        </button>
                                                        <button
                                                            onClick={() => setArtistSongFilter('local_only')}
                                                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                                                                artistSongFilter === 'local_only'
                                                                    ? 'bg-zinc-800 text-amber-400 border border-amber-500/30'
                                                                    : 'text-zinc-500 hover:text-zinc-300'
                                                            }`}
                                                        >
                                                            On Disk Only ({artistData.topSongs?.filter((s: any) => s.isLocal || s.downloadStatus === 'downloaded').length || 0})
                                                        </button>
                                                    </div>

                                                    {processedArtistSongs.length > 0 && (
                                                        <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800">
                                                            <button
                                                                onClick={() => playAlbum(processedArtistSongs, 0)}
                                                                className="px-3 py-1 rounded-lg bg-amber-500 text-black text-xs font-black uppercase flex items-center gap-1.5 shadow-sm hover:bg-amber-400 transition-all"
                                                            >
                                                                <Play size={11} className="fill-black" /> Play All
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const shuffled = [...processedArtistSongs].sort(() => Math.random() - 0.5);
                                                                    playAlbum(shuffled, 0);
                                                                }}
                                                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all"
                                                                title="Shuffle All Top Songs"
                                                            >
                                                                <Shuffle size={13} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Sort selector for Songs */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-zinc-500 font-bold text-[11px] uppercase tracking-wider">Sort:</span>
                                                    <select
                                                        value={artistSongSort}
                                                        onChange={(e) => setArtistSongSort(e.target.value as any)}
                                                        className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-amber-500/60"
                                                    >
                                                        <option value="popularity">Most Popular / Iconic</option>
                                                        <option value="newest">Newest First</option>
                                                        <option value="oldest">Oldest First</option>
                                                        <option value="alphabetical">Alphabetical (A-Z)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {processedArtistSongs.length > 0 ? (
                                                <div className="space-y-1.5 bg-zinc-900/30 p-2 sm:p-3 rounded-3xl border border-zinc-800/60">
                                                    {processedArtistSongs.map((song: any, sIdx: number) => {
                                                        const isCurrent = playingAudio?.id === song.id || (playingAudio?.title === song.title && playingAudio?.artist === song.artist);
                                                        return (
                                                            <div
                                                                key={song.id || sIdx}
                                                                onClick={() => playAlbum(processedArtistSongs, sIdx)}
                                                                className={`p-2.5 rounded-2xl flex items-center justify-between gap-3 group cursor-pointer transition-all ${
                                                                    isCurrent
                                                                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                                                                        : 'hover:bg-zinc-800/60 text-zinc-300'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                    <span className="w-6 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-amber-400">
                                                                        {isCurrent ? '▶' : `#${song.popularityRank || sIdx + 1}`}
                                                                    </span>

                                                                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800 relative">
                                                                        {song.posterUrl || song.coverUrl ? (
                                                                            <img src={song.posterUrl || song.coverUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                                                <Music size={16} />
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="min-w-0 flex-1">
                                                                        <h4 className={`text-xs sm:text-sm font-bold truncate ${isCurrent ? 'text-amber-400' : 'text-white group-hover:text-amber-400'}`}>
                                                                            {song.title}
                                                                        </h4>
                                                                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 truncate">
                                                                            <span
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (song.album) openAlbumDetails(song.album, song.artist, song.albumId);
                                                                                }}
                                                                                className="hover:underline hover:text-zinc-200 cursor-pointer truncate"
                                                                            >
                                                                                {song.album || 'Single'}
                                                                            </span>
                                                                            {song.year && <span>• {song.year}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2.5 shrink-0">
                                                                    {song.isLocal || song.downloadStatus === 'downloaded' ? (
                                                                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase flex items-center gap-1">
                                                                            <CheckCircle2 size={10} /> On Disk
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 text-[9px] font-black uppercase">
                                                                            Online
                                                                        </span>
                                                                    )}

                                                                    {song.duration && (
                                                                        <span className="text-xs font-mono text-zinc-500">
                                                                            {song.duration}
                                                                        </span>
                                                                    )}

                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            addToQueue(song);
                                                                        }}
                                                                        className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
                                                                        title="Add to Playback Queue"
                                                                    >
                                                                        <ListPlus size={14} />
                                                                    </button>

                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDownloadTrack(song);
                                                                        }}
                                                                        className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-amber-500 text-zinc-400 hover:text-black transition-all"
                                                                        title="Download Song"
                                                                    >
                                                                        <Download size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="p-8 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-xs text-zinc-500">
                                                    No top songs found for this artist.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-12 text-center text-zinc-500 text-xs">
                                    Could not find details for &quot;{selectedArtistName}&quot;.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               STANDALONE ALBUM DETAILS & TRACKLIST MODAL
               ══════════════════════════════════════════════════════════════ */}
            {showAlbumModal && (
                <div className="fixed inset-0 z-[315] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 shadow-2xl relative max-h-[88vh] flex flex-col space-y-5 overflow-hidden">
                        <button
                            onClick={() => setShowAlbumModal(false)}
                            className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all z-20"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-2 pb-2 border-b border-zinc-900">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase flex items-center gap-1">
                                <Disc size={12} /> Album Details &amp; Tracklist
                            </span>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-5 pr-1">
                            {albumLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <div className="w-10 h-10 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Loading Album Details &amp; Tracklist...</p>
                                </div>
                            ) : albumData ? (
                                <div className="space-y-5">
                                    {/* Album Header */}
                                    <div className="p-5 bg-zinc-900/60 rounded-3xl border border-zinc-800 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                                        {albumData.coverUrl ? (
                                            <img
                                                src={albumData.coverUrl}
                                                alt=""
                                                className="w-32 h-32 sm:w-44 sm:h-44 rounded-2xl object-cover border border-zinc-700 shadow-2xl shrink-0"
                                            />
                                        ) : (
                                            <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-2xl bg-zinc-800 flex items-center justify-center text-amber-400 shrink-0 border border-zinc-700">
                                                <Disc size={56} />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1 text-center sm:text-left space-y-3">
                                            <div className="space-y-1">
                                                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-wider">
                                                    Album
                                                </span>
                                                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{albumData.title}</h1>
                                                <button
                                                    onClick={() => {
                                                        setShowAlbumModal(false);
                                                        openArtistDetails(albumData.artist);
                                                    }}
                                                    className="text-base sm:text-lg font-bold text-amber-300 hover:text-amber-200 hover:underline transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <User size={15} className="text-amber-400 shrink-0" />
                                                    <span>{albumData.artist}</span>
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap text-xs text-zinc-400 font-medium">
                                                {albumData.releaseYear && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar size={13} className="text-zinc-500" /> {albumData.releaseYear}
                                                    </span>
                                                )}
                                                {albumData.genre && (
                                                    <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold">
                                                        {albumData.genre}
                                                    </span>
                                                )}
                                                <span>•</span>
                                                <span>{albumTracks.length > 0 ? `${albumTracks.length} Songs` : (albumData.trackCount ? `${albumData.trackCount} Tracks` : '')}</span>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center justify-center sm:justify-start gap-3 pt-2 flex-wrap">
                                                <button
                                                    onClick={() => {
                                                        if (albumTracks.length > 0) {
                                                            playAlbum(albumTracks);
                                                            toast.success(`Playing album "${albumData.title}"!`);
                                                        } else {
                                                            handlePlayAlbumCard(albumData);
                                                        }
                                                    }}
                                                    className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                                                >
                                                    <Play size={15} className="fill-black" /> Play Album
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (albumTracks.length > 0) {
                                                            handleDownloadAlbum(albumTracks, albumData.title);
                                                        } else {
                                                            handleDownloadTrack({
                                                                id: albumData.id,
                                                                title: albumData.title,
                                                                artist: albumData.artist,
                                                                album: albumData.title,
                                                                posterUrl: albumData.coverUrl
                                                            } as any);
                                                        }
                                                    }}
                                                    className="px-4 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 border border-zinc-700 transition-all cursor-pointer"
                                                >
                                                    <Download size={14} /> Download Album
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tracklist */}
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                                            <ListMusic size={16} className="text-amber-400" /> Tracklist ({albumTracks.length})
                                        </h3>

                                        {albumTracks.length > 0 ? (
                                            <div className="divide-y divide-zinc-800/60 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 overflow-hidden">
                                                {albumTracks.map((t: any, ti: number) => {
                                                    const isCurrentPlaying = playingAudio?.title?.toLowerCase() === t.title?.toLowerCase() || playingAudio?.id === t.id;
                                                    return (
                                                        <div
                                                            key={t.id || ti}
                                                            onClick={() => playTrack(t, albumTracks, ti)}
                                                            className={`p-3.5 flex items-center justify-between gap-3 hover:bg-zinc-800/50 transition-colors cursor-pointer group ${
                                                                isCurrentPlaying ? 'bg-amber-500/10' : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                <span className="w-6 text-center text-xs font-mono font-bold text-zinc-500 group-hover:hidden">
                                                                    {isCurrentPlaying ? (
                                                                        <Activity size={14} className="text-amber-400 animate-pulse mx-auto" />
                                                                    ) : (
                                                                        t.trackNumber || ti + 1
                                                                    )}
                                                                </span>
                                                                <Play size={14} className="w-6 text-amber-400 hidden group-hover:block shrink-0 fill-amber-400" />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className={`text-sm font-bold truncate leading-snug ${isCurrentPlaying ? 'text-amber-400 font-black' : 'text-white group-hover:text-amber-300'}`}>
                                                                        {t.title}
                                                                    </p>
                                                                    <p className="text-xs text-zinc-400 truncate">
                                                                        {t.artist}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3 shrink-0">
                                                                <span className="text-xs font-mono text-zinc-500 font-semibold">
                                                                    {t.duration || '3:30'}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDownloadTrack(t);
                                                                    }}
                                                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-300 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                                                                    title="Download Track"
                                                                >
                                                                    <Download size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-xs text-zinc-500">
                                                No individual track listing found for this album.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-12 text-center text-zinc-500 text-xs">
                                    No album selected.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               KARAOKE LIVE LYRICS & STUDIO MODAL (STANDALONE)
               ══════════════════════════════════════════════════════════════ */}
            {showLyricsModal && playingAudio && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-10 shadow-2xl relative max-h-[90vh] flex flex-col space-y-6 overflow-hidden">
                        <button
                            onClick={() => setShowLyricsModal(false)}
                            className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all z-20"
                        >
                            <X size={22} />
                        </button>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-zinc-900">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 shadow-lg">
                                    {playingAudio.posterUrl ? (
                                        <img src={playingAudio.posterUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Disc size={32} />
                                    )}
                                </div>
                                <div className="min-w-0 text-center sm:text-left">
                                    <div className="flex items-center justify-center sm:justify-start gap-2">
                                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase flex items-center gap-1">
                                            <Mic2 size={11} /> Karaoke Studio
                                        </span>
                                        {lyricsData?.isSynced && (
                                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase flex items-center gap-1">
                                                <Sparkles size={11} /> Time-Synced
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-xl sm:text-2xl font-black text-white truncate mt-1">{playingAudio.title}</h2>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <button
                                            onClick={() => openArtistDetails(playingAudio.artist)}
                                            className="text-xs text-zinc-400 font-semibold truncate hover:text-amber-300 hover:underline transition-colors cursor-pointer"
                                            title={`View artist biography & albums for ${playingAudio.artist || 'Artist'}`}
                                        >
                                            {playingAudio.artist || 'Unknown Artist'}
                                        </button>
                                        <span className="text-zinc-600 text-xs">•</span>
                                        <span className="text-xs text-zinc-400 truncate">{playingAudio.album || 'Single'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-center sm:justify-end">
                                <button
                                    onClick={() => setShowChordsOverlay(!showChordsOverlay)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                                        showChordsOverlay
                                            ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                                    }`}
                                    title="Toggle Guitar / Ukulele Chords above lyrics"
                                >
                                    <Guitar size={13} /> Chords {showChordsOverlay && '✓'}
                                </button>

                                <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                                    <button
                                        onClick={() => setLyricsViewMode('karaoke')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                            lyricsViewMode === 'karaoke' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        Karaoke
                                    </button>
                                    <button
                                        onClick={() => setLyricsViewMode('full')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                            lyricsViewMode === 'full' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        Full Text
                                    </button>
                                </div>

                                <button
                                    onClick={() => {
                                        setLyricsSearchQuery(`${playingAudio.artist || ''} ${playingAudio.title || ''}`.trim());
                                        setCustomLrcText(lyricsData?.syncedLyrics || lyricsData?.plainLyrics || '');
                                        setIsLyricsEditorOpen(true);
                                    }}
                                    className="px-3.5 py-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95"
                                    title="Edit lyrics match or search alternative versions"
                                >
                                    <Edit3 size={13} /> Edit Match
                                </button>
                            </div>
                        </div>

                        <div
                            ref={standaloneLyricsContainerRef}
                            className="flex-1 min-h-[350px] max-h-[55vh] overflow-y-auto custom-scrollbar p-2 relative flex flex-col"
                        >
                            {lyricsLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3 m-auto">
                                    <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Fetching Lyrics &amp; Chords...</p>
                                </div>
                            ) : !lyricsData || (!lyricsData.lines?.length && !lyricsData.plainLyrics) ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 m-auto">
                                    <div className="p-5 bg-zinc-900/60 rounded-full text-zinc-600"><Mic2 size={36} /></div>
                                    <div>
                                        <p className="text-base font-bold text-white">No lyrics found for this song</p>
                                        <p className="text-xs text-zinc-500 mt-1">You can search LRCLib or paste lyrics manually.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setLyricsSearchQuery(`${playingAudio.artist || ''} ${playingAudio.title || ''}`.trim());
                                            setIsLyricsEditorOpen(true);
                                        }}
                                        className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
                                    >
                                        <Search size={14} /> Search / Add Lyrics
                                    </button>
                                </div>
                            ) : lyricsViewMode === 'karaoke' && lyricsData.isSynced ? (
                                <div className="space-y-6 py-24 text-center">
                                    {lyricsData.lines.map((line, idx) => {
                                        const isActive = idx === currentLyricIndex;
                                        const isPast = currentLyricIndex !== -1 && idx < currentLyricIndex;
                                        const lineChords = showChordsOverlay ? getChordsForLyricLine(line.time, lyricsData.lines[idx + 1]?.time) : [];

                                        return (
                                            <div
                                                key={idx}
                                                ref={isActive ? activeLyricRef : null}
                                                onClick={() => seekTo(line.time)}
                                                className={`cursor-pointer transition-all duration-300 py-1.5 px-4 rounded-2xl inline-block max-w-2xl ${
                                                    isActive
                                                        ? 'scale-105'
                                                        : ''
                                                }`}
                                            >
                                                {/* Chords row if enabled */}
                                                {showChordsOverlay && lineChords.length > 0 && (
                                                    <div className="flex items-center justify-center gap-2 mb-1.5 flex-wrap">
                                                        {lineChords.map((ch, ci) => (
                                                            <span
                                                                key={ci}
                                                                className={`px-3 py-0.5 rounded-lg text-xs font-black font-mono tracking-wider shadow-md ${
                                                                    isActive
                                                                        ? 'bg-amber-400 text-black drop-shadow-[0_0_10px_rgba(251,191,36,0.9)] scale-110'
                                                                        : 'bg-zinc-800/90 text-amber-300 border border-zinc-700'
                                                                }`}
                                                            >
                                                                {ch}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                <p className={`font-black transition-all ${
                                                    isActive
                                                        ? 'text-2xl sm:text-3xl md:text-4xl text-amber-300 drop-shadow-[0_0_35px_rgba(251,191,36,0.6)]'
                                                        : isPast
                                                        ? 'text-base sm:text-lg font-bold text-zinc-600 hover:text-zinc-400'
                                                        : 'text-base sm:text-lg font-bold text-zinc-400 hover:text-zinc-200'
                                                }`}>
                                                    {line.text}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="p-4 sm:p-6 text-center whitespace-pre-line text-base sm:text-lg font-semibold text-zinc-300 leading-relaxed max-w-xl mx-auto">
                                    {lyricsData.plainLyrics || lyricsData.lines.map(l => l.text).join('\n')}
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-zinc-900 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={togglePlayPause}
                                            className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-all"
                                        >
                                            {isAudioPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                                        </button>
                                        <div className="text-xs font-mono text-zinc-400">
                                            <span>{formatTime(audioCurrentTime)}</span> / <span>{formatTime(effectiveDuration)}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleDownloadTrack(playingAudio)}
                                            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 border border-zinc-800 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
                                        >
                                            <Download size={14} /> Download Audio
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

            {/* ══════════════════════════════════════════════════════════════
               LYRICS MATCH EDITOR & SEARCH MODAL
               ══════════════════════════════════════════════════════════════ */}
            {isLyricsEditorOpen && (
                <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[85vh] flex flex-col overflow-hidden">
                        <button
                            onClick={() => setIsLyricsEditorOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="space-y-1">
                            <h3 className="text-xl font-black text-white">Edit Lyrics Match &amp; Source</h3>
                            <p className="text-xs text-zinc-500 font-medium">Search LRCLib for matching synced lyrics or paste custom LRC timestamps.</p>
                        </div>

                        {/* Search & Custom Tabs */}
                        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                            <button
                                onClick={() => setEditorTab('search')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    editorTab === 'search' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Search LRCLib Database
                            </button>
                            <button
                                onClick={() => setEditorTab('custom')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    editorTab === 'custom' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Custom LRC Text
                            </button>
                        </div>

                        {editorTab === 'search' ? (
                            <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={lyricsSearchQuery}
                                        onChange={e => setLyricsSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchLyrics(lyricsSearchQuery)}
                                        placeholder="Artist and title..."
                                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                                    />
                                    <button
                                        onClick={() => handleSearchLyrics(lyricsSearchQuery)}
                                        disabled={lyricsSearchLoading}
                                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                    >
                                        <Search size={14} />
                                        {lyricsSearchLoading ? 'Searching...' : 'Search'}
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar min-h-0">
                                    {lyricsSearchResults.length === 0 ? (
                                        <div className="text-center py-10 text-zinc-600 text-sm">
                                            Search for lyrics matches above
                                        </div>
                                    ) : (
                                        lyricsSearchResults.map((res: any) => (
                                            <div
                                                key={res.id}
                                                className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/80 hover:border-amber-500/50 transition-all flex items-center justify-between group"
                                            >
                                                <div className="min-w-0 pr-3">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-bold text-white text-sm truncate">{res.trackName}</h4>
                                                        {res.syncedLyrics && (
                                                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase">
                                                                Synced
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-zinc-400 truncate">{res.artistName} • {res.albumName || 'Unknown Album'}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleApplyLyricsMatch(res)}
                                                    disabled={isSavingLyrics}
                                                    className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black font-black text-xs uppercase tracking-wider border border-amber-500/30 transition-all shrink-0"
                                                >
                                                    Apply
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                <textarea
                                    value={customLrcText}
                                    onChange={e => setCustomLrcText(e.target.value)}
                                    placeholder="[00:12.34] Paste your LRC timestamped lyrics here..."
                                    className="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none min-h-[220px]"
                                />
                                <button
                                    onClick={handleSaveCustomLyrics}
                                    disabled={isSavingLyrics || !customLrcText.trim()}
                                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <Check size={16} /> Save &amp; Apply Custom Lyrics
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               AUDIO SPECS & DIAGNOSTICS MODAL (STATS FOR AUDIOPHILES)
               ══════════════════════════════════════════════════════════════ */}
            {isAudioSpecsOpen && audioSpecsItem && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl relative">
                        <button
                            onClick={() => setIsAudioSpecsOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                                <Info size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">Audio Specs &amp; Metadata</h3>
                                <p className="text-xs text-zinc-500 truncate max-w-xs">{audioSpecsItem.title || audioSpecsItem.name}</p>
                            </div>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80">
                                    <span className="text-[10px] text-zinc-500 uppercase font-black block">Format / Codec</span>
                                    <span className="text-white font-bold">{audioSpecsItem.extension.toUpperCase()}</span>
                                </div>
                                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80">
                                    <span className="text-[10px] text-zinc-500 uppercase font-black block">File Size</span>
                                    <span className="text-white font-bold">{formatBytes(audioSpecsItem.sizeBytes)}</span>
                                </div>
                            </div>

                            <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-1">
                                <span className="text-[10px] text-zinc-500 uppercase font-black block">Path / Source</span>
                                <span className="text-zinc-400 font-mono text-[11px] break-all block">{audioSpecsItem.path || audioSpecsItem.streamUrl}</span>
                            </div>

                            {audioSpecsLoading ? (
                                <div className="flex items-center justify-center py-6 gap-2 text-zinc-500 font-bold">
                                    <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                    Analyzing Audio Stream...
                                </div>
                            ) : audioSpecsData?.streams && (
                                <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-2">
                                    <span className="text-[10px] text-zinc-500 uppercase font-black block">Stream Telemetry</span>
                                    <div className="grid grid-cols-2 gap-2 text-zinc-300 font-mono text-[11px]">
                                        <div>Codec: <span className="text-amber-400 font-bold">{audioSpecsData.streams[0]?.codec_name?.toUpperCase()}</span></div>
                                        <div>Sample Rate: <span className="text-white font-bold">{audioSpecsData.streams[0]?.sample_rate || '44100'} Hz</span></div>
                                        <div>Channels: <span className="text-white font-bold">{audioSpecsData.streams[0]?.channels || 2} ({audioSpecsData.streams[0]?.channel_layout || 'stereo'})</span></div>
                                        <div>Bit Depth: <span className="text-emerald-400 font-bold">{audioSpecsData.streams[0]?.bits_per_sample ? `${audioSpecsData.streams[0]?.bits_per_sample}-bit` : '16/24-bit'}</span></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}



            {/* ══════════════════════════════════════════════════════════════
               AUDIO STATS FOR NERDS & PLAYBACK TELEMETRY MODAL
               ══════════════════════════════════════════════════════════════ */}
            {showAudioNerdModal && (
                <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-2xl max-h-[88vh] rounded-3xl p-6 shadow-2xl flex flex-col overflow-hidden">
                        {/* Modal Header (Pinned) */}
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-3 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    <Terminal size={18} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                                        Nerd Logs
                                    </h3>
                                    <p className="text-xs text-zinc-400">
                                        Real-time audio decoder states, playback telemetry &amp; event trace
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAudioNerdModal(false)}
                                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Scrollable Body Container */}
                        <div className="flex-1 min-h-0 overflow-y-auto py-3 space-y-4 custom-scrollbar pr-1">
                            {/* Playback Source & Origin Banner */}
                        {playingAudio && (() => {
                            const srcInfo = getAudioSourceInfo(playingAudio, audioRef.current?.src);
                            return (
                                <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${srcInfo.colorClass}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 shrink-0">
                                            {srcInfo.isLocal ? <HardDrive size={20} className="text-emerald-400" /> : srcInfo.isPlex ? <Server size={20} className="text-purple-400" /> : srcInfo.isYt ? <Youtube size={20} className="text-rose-400" /> : <Globe size={20} className="text-sky-400" />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs sm:text-sm font-black uppercase tracking-wider">{srcInfo.label}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-black/50 border border-white/10 font-mono font-bold uppercase">
                                                    {srcInfo.type === 'local' ? 'Disk File' : srcInfo.type === 'plex' ? 'Plex Server' : srcInfo.type === 'youtube' ? 'YouTube Stream' : 'Online Stream'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] opacity-85 font-mono break-all mt-0.5">{srcInfo.sublabel}</p>
                                        </div>
                                    </div>
                                    {playingAudio.path && (
                                        <span className="hidden md:inline-flex text-[10px] font-mono px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 max-w-[260px] truncate shrink-0" title={playingAudio.path}>
                                            📁 {playingAudio.path.split(/[/\\]/).pop()}
                                        </span>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Telemetry & Specs Overview Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-0.5">
                                <span className="text-[9px] uppercase font-black text-zinc-500 tracking-wider block">Status</span>
                                <div className="flex items-center gap-1.5 font-mono text-xs font-black">
                                    <span className={`w-2 h-2 rounded-full ${
                                        audioPlaybackStatus === 'playing' ? 'bg-emerald-400 animate-pulse' :
                                        audioPlaybackStatus === 'loading' || audioPlaybackStatus === 'buffering' ? 'bg-amber-400 animate-spin' :
                                        audioPlaybackStatus === 'error' ? 'bg-red-400' : 'bg-zinc-500'
                                    }`} />
                                    <span className={audioPlaybackStatus === 'error' ? 'text-red-400' : 'text-white'}>
                                        {audioPlaybackStatus.toUpperCase()}
                                    </span>
                                </div>
                            </div>

                            <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-0.5">
                                <span className="text-[9px] uppercase font-black text-zinc-500 tracking-wider block">Decoder State</span>
                                <p className="font-mono text-xs font-bold text-amber-300 truncate">
                                    {audioRef.current ? (
                                        ['HAVE_NOTHING (0)', 'HAVE_METADATA (1)', 'HAVE_CURRENT (2)', 'HAVE_FUTURE (3)', 'HAVE_ENOUGH (4)'][audioRef.current.readyState] || `Ready ${audioRef.current.readyState}`
                                    ) : 'Web Audio API'}
                                </p>
                            </div>

                            <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-0.5">
                                <span className="text-[9px] uppercase font-black text-zinc-500 tracking-wider block">Codec / Format</span>
                                <p className="font-mono text-xs font-bold text-cyan-300 truncate">
                                    {playingAudio ? (playingAudio.extension?.toUpperCase() || (playingAudio.youtubeId ? 'OPUS/AAC' : 'AUDIO')) : 'None'}
                                </p>
                            </div>

                            <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-0.5">
                                <span className="text-[9px] uppercase font-black text-zinc-500 tracking-wider block">Time / Duration</span>
                                <p className="font-mono text-xs font-bold text-zinc-200">
                                    {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                                </p>
                            </div>
                        </div>

                        {/* Audiophile Specs & Stream Diagnostics */}
                        {playingAudio && (
                            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-2">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-zinc-300 font-mono text-[11px]">
                                    <div><span className="text-zinc-500 font-sans">Engine:</span> <b className="text-amber-400">{playingAudio.youtubeId ? 'YouTube Stream' : (audioRef.current?.src?.includes('transcode=') ? 'Server Transcoder' : 'Native Decoder')}</b></div>
                                    <div><span className="text-zinc-500 font-sans">Quality:</span> <b className="text-emerald-400">{playingAudio.extension?.toLowerCase() === 'flac' ? 'FLAC Lossless' : (playingAudio.extension?.toLowerCase() === 'wav' ? 'WAV Lossless' : ((playingAudio.isLocal || playingAudio.path) ? `${playingAudio.extension?.toUpperCase() || 'Audio'} Local` : 'Web Stream (~160–256 kbps)'))}</b></div>
                                    <div><span className="text-zinc-500 font-sans">Size:</span> <b className="text-white">{playingAudio.sizeBytes ? formatBytes(playingAudio.sizeBytes) : 'Bitstream'}</b></div>
                                    <div><span className="text-zinc-500 font-sans">Volume:</span> <b className="text-white">{Math.round(audioVolume * 100)}%</b></div>
                                </div>
                                <div className="pt-1.5 border-t border-zinc-800 text-[11px] font-mono space-y-0.5 text-zinc-400">
                                    <div className="truncate"><span className="text-zinc-500">Track:</span> <b className="text-white font-sans">{playingAudio.title}</b> — {playingAudio.artist} {playingAudio.album ? `(${playingAudio.album})` : ''}</div>
                                    <div className="break-all"><span className="text-zinc-500">Stream URI:</span> <span className="text-amber-400/90">{audioRef.current?.currentSrc || playingAudio.streamUrl}</span></div>
                                    {playingAudio.path && (
                                        <div className="break-all"><span className="text-zinc-500">Disk Path:</span> {playingAudio.path}</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Error Callout if Active */}
                        {audioPlaybackError && (
                            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs space-y-1">
                                <div className="font-bold text-red-400 flex items-center gap-1.5">
                                    <AlertTriangle size={14} /> {audioPlaybackError.name || 'Playback Failure'}
                                </div>
                                <p className="text-zinc-300">{audioPlaybackError.message}</p>
                                {audioPlaybackError.details && (
                                    <p className="text-[11px] font-mono text-red-300/80 break-all">{audioPlaybackError.details}</p>
                                )}
                            </div>
                        )}

                        {/* Real-time Live Event Telemetry Trace & Logging Console */}
                        <div className="flex-1 flex flex-col space-y-2 min-h-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                                    Event Telemetry Trace ({audioNerdLogs.length} events)
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {/* Sort Order Toggle */}
                                    <button
                                        onClick={() => setAudioLogOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                                        className={`px-2 py-0.5 rounded uppercase tracking-wider text-[10px] font-bold border transition-all cursor-pointer ${
                                            audioLogOrder === 'newest'
                                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                                                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                        }`}
                                        title="Toggle log ordering: Newest First or Oldest First"
                                    >
                                        {audioLogOrder === 'newest' ? '↓ Newest First' : '↑ Oldest First'}
                                    </button>
                                    <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-bold">
                                        {(['all', 'info', 'warn', 'error', 'success'] as const).map(lvl => (
                                            <button
                                                key={lvl}
                                                onClick={() => setAudioLogFilter(lvl)}
                                                className={`px-2 py-0.5 rounded uppercase tracking-wider transition-all cursor-pointer ${
                                                    audioLogFilter === lvl
                                                        ? 'bg-amber-500 text-black shadow-sm'
                                                        : 'text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                {lvl}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setAudioNerdLogs([]);
                                            toast.success('Logs cleared');
                                        }}
                                        className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-900 transition-colors cursor-pointer"
                                        title="Clear Event Logs"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>

                            {/* Log Search Filter */}
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    value={audioLogSearch}
                                    onChange={e => setAudioLogSearch(e.target.value)}
                                    placeholder="Filter logs by message..."
                                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl pl-8 pr-7 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                                />
                                {audioLogSearch && (
                                    <button onClick={() => setAudioLogSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            {/* Scrollable Log Stream */}
                            <div className="flex-1 min-h-[150px] max-h-[220px] overflow-y-auto bg-black/80 border border-zinc-900 rounded-2xl p-3 font-mono text-xs space-y-1.5 custom-scrollbar shadow-inner">
                                {(() => {
                                    const filtered = audioNerdLogs.filter(log => {
                                        const matchLevel = audioLogFilter === 'all' || log.level === audioLogFilter;
                                        const matchSearch = !audioLogSearch || log.message.toLowerCase().includes(audioLogSearch.toLowerCase()) || log.timestamp.includes(audioLogSearch);
                                        return matchLevel && matchSearch;
                                    });

                                    if (filtered.length === 0) {
                                        return (
                                            <p className="text-zinc-600 text-[11px] py-4 text-center">
                                                {audioNerdLogs.length === 0 ? 'No events recorded yet. Play a track to capture live telemetry.' : 'No logs match the current filter.'}
                                            </p>
                                        );
                                    }

                                    const ordered = audioLogOrder === 'newest' ? [...filtered].reverse() : filtered;

                                    return ordered.map((log, idx) => (
                                        <div key={log.id} className="flex items-start gap-2 text-[11px] leading-tight hover:bg-zinc-900/40 p-0.5 rounded">
                                            <span className="text-zinc-600 shrink-0 select-none">{log.timestamp}</span>
                                            {audioLogOrder === 'newest' && idx === 0 && (
                                                <span className="shrink-0 text-[8px] font-black uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                    LATEST
                                                </span>
                                            )}
                                            <span className={`shrink-0 uppercase font-black text-[9px] px-1 rounded ${
                                                log.level === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                log.level === 'warn' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                                log.level === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                                'bg-zinc-800 text-zinc-400'
                                            }`}>
                                                {log.level}
                                            </span>
                                            <span className={`break-all ${
                                                log.level === 'error' ? 'text-red-300' :
                                                log.level === 'warn' ? 'text-amber-200' :
                                                log.level === 'success' ? 'text-emerald-300' :
                                                'text-zinc-300'
                                            }`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        </div>

                        {/* Modal Footer Controls (Pinned) */}
                        <div className="shrink-0 pt-3 border-t border-zinc-900 flex items-center justify-between gap-3 bg-zinc-950">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleForceAudioTranscode}
                                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                                >
                                    <Zap size={14} /> Force Server Transcode
                                </button>
                                <button
                                    onClick={() => {
                                        if (audioRef.current && playingAudio) {
                                            setAudioPlaybackStatus('loading');
                                            setAudioPlaybackError(null);
                                            audioRef.current.src = `${playingAudio.streamUrl}${playingAudio.streamUrl.includes('?') ? '&' : '?'}retry=${Date.now()}`;
                                            audioRef.current.play().catch(() => {});
                                        }
                                    }}
                                    className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-800 flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <RotateCcw size={14} /> Retry
                                </button>
                            </div>

                            <button
                                onClick={() => {
                                    const srcInfo = getAudioSourceInfo(playingAudio, audioRef.current?.currentSrc);
                                    const report = [
                                        `# Schedulearr Audio Diagnostics Report`,
                                        `Time: ${new Date().toISOString()}`,
                                        `Track: ${playingAudio?.title || 'None'}`,
                                        `Artist: ${playingAudio?.artist || 'Unknown'}`,
                                        `Album: ${playingAudio?.album || 'Unknown'}`,
                                        `Format: ${playingAudio?.extension || 'Unknown'}`,
                                        `Instance: ${playingAudio?.instanceName || 'Server'}`,
                                        `Library: ${playingAudio?.libraryName || 'None'}`,
                                        `Source: ${srcInfo.label}`,
                                        `Detail: ${srcInfo.sublabel}`,
                                        `Disk Path: ${playingAudio?.path || 'None (Remote / Stream)'}`,
                                        `Stream URL: ${audioRef.current?.currentSrc || playingAudio?.streamUrl || 'None'}`,
                                        `Status: ${audioPlaybackStatus}`,
                                        `Ready State: ${audioRef.current?.readyState}`,
                                        `Network State: ${audioRef.current?.networkState}`,
                                        `Duration: ${formatTime(audioCurrentTime)} / ${formatTime(effectiveDuration)}`,
                                        `Active Error: ${JSON.stringify(audioPlaybackError)}`,
                                        `\n## Event Logs (${audioLogOrder === 'newest' ? 'Newest First' : 'Oldest First'}):\n` + 
                                        (audioLogOrder === 'newest' ? [...audioNerdLogs].reverse() : audioNerdLogs)
                                            .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n')
                                    ].join('\n');
                                    copyReportToClipboard(report);
                                }}
                                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs border border-zinc-800 flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                                <Copy size={14} /> Copy Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               CAST & AUDIO OUTPUT DEVICE PICKER MODAL (TV & SOUNDBAR)
               ══════════════════════════════════════════════════════════════ */}
            {isCastPickerModalOpen && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setIsCastPickerModalOpen(false); }}
                    className="fixed inset-0 z-[320] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200 select-none"
                >
                    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-xl max-h-[90vh] rounded-3xl p-6 shadow-2xl flex flex-col space-y-5 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-3.5 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    <Cast size={22} />
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                                        Cast & Audio Output
                                    </h3>
                                    <p className="text-xs text-zinc-400">
                                        Stream to Smart TVs, Chromecasts, and Sony soundbars (HT-8000)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCastPickerModalOpen(false)}
                                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 custom-scrollbar pr-1">
                            {/* Section 1: Google Cast / Smart TV */}
                            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                            <Tv size={18} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Google Cast / Smart TV</h4>
                                            <p className="text-[11px] text-zinc-400">Chromecast, Google TV, Android TV & Smart Displays</p>
                                        </div>
                                    </div>
                                    {isCastingToGoogle && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                                            Connected
                                        </span>
                                    )}
                                </div>

                                {isCastingToGoogle ? (
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                                        <span className="text-xs text-zinc-300 font-mono">
                                            Casting to: <b className="text-amber-400 font-bold">{activeCastDeviceName || 'Smart TV'}</b>
                                        </span>
                                        <button
                                            onClick={stopGoogleCast}
                                            className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold transition-all cursor-pointer"
                                        >
                                            Disconnect Cast
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => triggerGoogleCast(playingAudio || undefined)}
                                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                                    >
                                        <Cast size={15} /> Cast to Smart TV
                                    </button>
                                )}
                            </div>

                            {/* Section 2: Audio Output Devices (Sony Soundbar / Bluetooth / HDMI) */}
                            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                            <Radio size={18} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Audio Outputs & Soundbars</h4>
                                            <p className="text-[11px] text-zinc-400">Sony HT-8000, Bluetooth Speakers & HDMI</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={refreshAudioOutputs}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-xs flex items-center gap-1 cursor-pointer"
                                        title="Scan for connected audio devices"
                                    >
                                        <RotateCcw size={13} />
                                        <span className="text-[11px]">Refresh</span>
                                    </button>
                                </div>

                                {availableAudioOutputs.length > 0 ? (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                        {availableAudioOutputs.map(dev => {
                                            const isSelected = selectedAudioOutputId === dev.deviceId;
                                            const label = dev.label || `Audio Output (${dev.deviceId.slice(0, 8)})`;
                                            const isSony = label.toLowerCase().includes('sony') || label.toLowerCase().includes('ht-');
                                            return (
                                                <div
                                                    key={dev.deviceId}
                                                    onClick={() => selectAudioOutputDevice(dev.deviceId, dev.label)}
                                                    className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-amber-500/15 border-amber-500 text-white font-bold'
                                                            : 'bg-zinc-950/80 border-zinc-800/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="text-amber-400 text-xs">🔊</span>
                                                        <div className="min-w-0">
                                                            <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                                                <span>{label}</span>
                                                                {isSony && (
                                                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase font-mono">
                                                                        Soundbar
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {isSelected ? (
                                                        <span className="text-[10px] font-black uppercase text-amber-400 flex items-center gap-1">
                                                            <Check size={13} /> Active
                                                        </span>
                                                    ) : (
                                                        <button
                                                            className="px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] font-bold"
                                                        >
                                                            Select
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-center space-y-1">
                                        <p className="text-xs text-zinc-400">
                                            No additional audio outputs reported by browser.
                                        </p>
                                    </div>
                                )}

                                {/* Sony HT-8000 Soundbar Workaround Card */}
                                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-400">
                                        <AlertCircle size={14} className="shrink-0" />
                                        <span>Sony HT-8000 Soundbar Guide</span>
                                    </div>
                                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                                        Sony HT series soundbars (HT-8000 / HT-A8000) connect via <b>Spotify Connect, Bluetooth, or HDMI eARC</b> rather than native Google Cast.
                                    </p>
                                    <ol className="text-[11px] text-zinc-400 list-decimal list-inside space-y-0.5 leading-normal">
                                        <li>Pair the Sony Soundbar to this device via <b>Bluetooth</b> (or connect via HDMI eARC).</li>
                                        <li>Select it above from the detected Audio Outputs list (or set it in your system sound settings).</li>
                                        <li>Music from Schedulearr will stream directly to your Sony Soundbar with lossless quality and zero lag.</li>
                                    </ol>
                                </div>
                            </div>
                        </div>

                        {/* Pinned Footer */}
                        <div className="pt-2 border-t border-zinc-900 flex items-center justify-end shrink-0">
                            <button
                                onClick={() => setIsCastPickerModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-800 transition-all cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Interactive Music Download & Library Organization Modal */}
            {showDownloadModal && (
                <MusicDownloadModal
                    track={downloadTargetTrack}
                    albumTracks={downloadTargetAlbumTracks || undefined}
                    albumName={downloadTargetAlbumName}
                    artistName={downloadTargetTrack?.artist || playingAudio?.artist}
                    onClose={() => {
                        setShowDownloadModal(false);
                        setDownloadTargetTrack(null);
                        setDownloadTargetAlbumTracks(null);
                    }}
                />
            )}
        </MusicPlayerContext.Provider>
    );
}

export function useMusicPlayer() {
    const context = useContext(MusicPlayerContext);
    if (!context) {
        throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
    }
    return context;
}

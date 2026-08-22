'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
    Play, Pause, Volume2, VolumeX, Maximize, X,
    Shuffle, Repeat, SkipForward, SkipBack,
    Disc, Music, ListMusic, Download, ArrowDownToLine,
    Info, Mic2, Edit3, Search, Sparkles, Check,
    RefreshCw, ChevronDown, Sliders, Cast, Tv, Trash2, Plus,
    Image as ImageIcon, Guitar, Activity, Zap, Layers, Music2,
    Terminal, AlertTriangle, RotateCcw, Copy, User, ExternalLink, Calendar, Radio,
    Star, ListPlus, Heart, Youtube
} from 'lucide-react';
import { toast } from 'sonner';
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
    playAlbum: (tracks: MediaItem[]) => void;
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
    handleDownloadTrack: (track: MediaItem | null) => void;
    handleDownloadAlbum: (tracks: MediaItem[], albumName?: string) => void;
    addToQueue: (track: MediaItem) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null);

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
    const [expandedSidePanel, setExpandedSidePanel] = useState<'karaoke' | 'guitar' | 'bass' | 'sing' | 'artist' | 'queue' | 'playlists' | 'specs' | 'search'>('karaoke');
    const [showExpandedSidePanel, setShowExpandedSidePanel] = useState(true);
    const [isVinylView, setIsVinylView] = useState(true);

    // In-Player Playlist States & Handlers
    const [inPlayerPlaylists, setInPlayerPlaylists] = useState<any[]>([]);
    const [inPlayerNewPlaylistName, setInPlayerNewPlaylistName] = useState('');
    const [showInPlayerCreatePlaylist, setShowInPlayerCreatePlaylist] = useState(false);

    const fetchInPlayerPlaylists = async () => {
        try {
            const res = await fetch('/api/theater/music/playlists');
            if (res.ok) {
                const data = await res.json();
                setInPlayerPlaylists(Array.isArray(data.playlists) ? data.playlists : []);
            }
        } catch {}
    };

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
            } else {
                toast.error('Failed to add track to playlist');
            }
        } catch {
            toast.error('Failed to add track to playlist');
        }
    };

    const handlePlayWholePlaylist = (playlist: any) => {
        const items = Array.isArray(playlist.items) ? playlist.items : [];
        if (items.length === 0) {
            toast.error('This playlist is empty');
            return;
        }
        playAudioTrack(items[0], items);
        toast.success(`Playing playlist "${playlist.name}" (${items.length} tracks)`);
    };

    const handleDeleteInPlayerPlaylist = async (playlistId: string, name: string) => {
        try {
            const res = await fetch(`/api/theater/music/playlists?id=${playlistId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success(`Deleted playlist "${name}"`);
                fetchInPlayerPlaylists();
            }
        } catch {}
    };

    // In-Player Live Search States (Search YouTube & Library without exiting player)
    const [inPlayerSearchQuery, setInPlayerSearchQuery] = useState('');
    const [inPlayerFilter, setInPlayerFilter] = useState<'all' | 'library' | 'youtube'>('all');
    const [inPlayerSearchResultsLocal, setInPlayerSearchResultsLocal] = useState<MediaItem[]>([]);
    const [inPlayerSearchResultsOnline, setInPlayerSearchResultsOnline] = useState<MediaItem[]>([]);
    const [inPlayerSearchLoading, setInPlayerSearchLoading] = useState(false);

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

    // Specs & Diagnostics Modal States
    const [isAudioSpecsOpen, setIsAudioSpecsOpen] = useState(false);
    const [audioSpecsItem, setAudioSpecsItem] = useState<MediaItem | null>(null);
    const [audioSpecsData, setAudioSpecsData] = useState<any>(null);
    const [audioSpecsLoading, setAudioSpecsLoading] = useState(false);

    // Smart TV Pairing & Casting States
    const [isCastPickerModalOpen, setIsCastPickerModalOpen] = useState(false);
    const [pairedTvSessions, setPairedTvSessions] = useState<any[]>([]);
    const [loadingPairedTvs, setLoadingPairedTvs] = useState(false);
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

    const handleInPlayerSearch = async (query: string) => {
        const q = query.trim();
        if (!q) {
            setInPlayerSearchResultsLocal([]);
            setInPlayerSearchResultsOnline([]);
            return;
        }
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

    // Cast to Smart TV
    const fetchPairedTvSessions = async () => {
        setLoadingPairedTvs(true);
        try {
            const res = await fetch('/api/theater/tv');
            if (res.ok) {
                const data = await res.json();
                setPairedTvSessions(data.sessions || []);
            }
        } catch {
            // ignore
        } finally {
            setLoadingPairedTvs(false);
        }
    };

    const openCastPicker = async (target?: MediaItem) => {
        const itemToCast = target || playingAudio;

        // 1. Google Cast Web Framework (Standard Cast device picker for Smart TVs / Chromecasts)
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
                if (session && itemToCast) {
                    const stream = itemToCast.streamUrl || `${window.location.origin}/api/theater/music/stream?ytId=${itemToCast.youtubeId || itemToCast.id}`;
                    const mediaInfo = new (window as any).chrome.cast.media.MediaInfo(stream, 'audio/mp4');
                    mediaInfo.metadata = new (window as any).chrome.cast.media.MusicTrackMediaMetadata();
                    mediaInfo.metadata.title = itemToCast.title;
                    mediaInfo.metadata.artist = itemToCast.artist;
                    if (itemToCast.posterUrl) {
                        mediaInfo.metadata.images = [{ url: itemToCast.posterUrl }];
                    }
                    const request = new (window as any).chrome.cast.media.LoadRequest(mediaInfo);
                    session.loadMedia(request);
                    toast.success(`Casting "${itemToCast.title}"!`);
                    return;
                }
            }
        } catch (err: any) {
            console.log('Google Cast request:', err);
        }

        // 2. Native HTMLMediaElement Remote Playback API (Chrome, Edge, Android Cast prompt)
        if (audioRef.current && 'remote' in audioRef.current && typeof (audioRef.current as any).remote?.prompt === 'function') {
            try {
                await (audioRef.current as any).remote.prompt();
                toast.success('Connected to Cast device!');
                return;
            } catch (e: any) {
                if (e.name === 'NotAllowedError' || e.name === 'NotFoundError') {
                    return;
                }
            }
        }

        // 3. Apple WebKit AirPlay Picker (iOS Safari, macOS Safari)
        if (audioRef.current && typeof (audioRef.current as any).webkitShowPlaybackTargetPicker === 'function') {
            try {
                (audioRef.current as any).webkitShowPlaybackTargetPicker();
                return;
            } catch {}
        }

        // 4. W3C Presentation API (Wireless display / Cast Receiver)
        if (typeof window !== 'undefined' && 'PresentationRequest' in window) {
            try {
                const request = new (window as any).PresentationRequest([window.location.origin + '/tv']);
                request.start().then(() => {
                    toast.success('Connected to Display / Cast!');
                }).catch(() => {});
                return;
            } catch {}
        }

        toast.info('Searching for Chromecast and Cast devices on your network...');
    };

    // YouTube IFrame Player refs and state
    const ytPlayerRef = useRef<any>(null);
    const ytPlayerReadyRef = useRef(false);

    const getYtId = (track: MediaItem | null): string | null => {
        if (!track) return null;
        if (track.youtubeId) return track.youtubeId.replace(/^yt-/, '');
        if (track.id && track.id.startsWith('yt-')) return track.id.replace(/^yt-/, '');
        if (track.streamUrl) {
            try {
                const url = new URL(track.streamUrl, 'http://localhost');
                const ytParam = url.searchParams.get('ytId');
                if (ytParam) return ytParam.replace(/^yt-/, '');
            } catch {}
        }
        return null;
    };

    // Load YouTube IFrame API script once
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!(window as any).YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
        }
    }, []);

    // Sync YouTube playback time and duration
    useEffect(() => {
        const timer = setInterval(() => {
            const ytId = getYtId(playingAudio);
            if (ytId && ytPlayerRef.current && ytPlayerReadyRef.current) {
                try {
                    const ct = ytPlayerRef.current.getCurrentTime?.();
                    const dur = ytPlayerRef.current.getDuration?.();
                    if (typeof ct === 'number' && !isNaN(ct)) setAudioCurrentTime(ct);
                    if (typeof dur === 'number' && !isNaN(dur) && dur > 0) setAudioDuration(dur);
                } catch {}
            }
        }, 300);
        return () => clearInterval(timer);
    }, [playingAudio]);

    // Track Selection & Audio Playback Handlers
    const playTrack = (track: MediaItem, queue?: MediaItem[], index?: number) => {
        setPlayingAudio(track);
        setIsAudioPlaying(true);
        if (queue && queue.length > 0) {
            setAudioQueue(queue);
            setQueueIndex(index !== undefined ? index : 0);
        } else {
            setAudioQueue([track]);
            setQueueIndex(0);
        }
    };

    const playAlbum = (tracks: MediaItem[]) => {
        if (!tracks.length) return;
        setAudioQueue(tracks);
        setQueueIndex(0);
        setPlayingAudio(tracks[0]);
        setIsAudioPlaying(true);
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

        const ytId = getYtId(playingAudio);
        if (ytId && ytPlayerRef.current && ytPlayerReadyRef.current) {
            try {
                if (nextPlaying) {
                    ytPlayerRef.current.playVideo();
                } else {
                    ytPlayerRef.current.pauseVideo();
                }
            } catch {}
        }

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
        const ytId = getYtId(playingAudio);
        if (ytId && ytPlayerRef.current && ytPlayerReadyRef.current) {
            try { ytPlayerRef.current.seekTo(time, true); } catch {}
            return;
        }
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    // ── Vinyl DJ Scratch & Tonearm Interaction Handlers (Fixed & Solid) ──
    const effectiveTonearmAngle = tonearmCustomAngle !== null
        ? tonearmCustomAngle
        : isAudioPlaying
            ? 18 + (audioDuration > 0 ? Math.min(16, (audioCurrentTime / audioDuration) * 16) : 6)
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

        const ytId = getYtId(playingAudio);
        if (finalAngle < 14) {
            // Needle parked off platter
            setIsAudioPlaying(false);
            if (ytId && ytPlayerRef.current && ytPlayerReadyRef.current) {
                try { ytPlayerRef.current.pauseVideo(); } catch {}
            } else if (audioRef.current) {
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
            if (ytId && ytPlayerRef.current && ytPlayerReadyRef.current) {
                try { ytPlayerRef.current.playVideo(); } catch {}
            } else if (audioRef.current) {
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
                const ytId = getYtId(playingAudio);
                if (ytId && ytPlayerRef.current && ytPlayerReadyRef.current) {
                    try { ytPlayerRef.current.pauseVideo(); } catch {}
                } else if (isAudioPlaying && audioRef.current) {
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
            const ytId = getYtId(playingAudio);
            if (ytId && ytPlayerRef.current && ytPlayerReadyRef.current) {
                try { ytPlayerRef.current.playVideo(); } catch {}
            } else if (audioRef.current) {
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
        if (ytPlayerRef.current && ytPlayerReadyRef.current) {
            try {
                ytPlayerRef.current.setVolume(v * 100);
                if (v === 0) ytPlayerRef.current.mute(); else ytPlayerRef.current.unMute();
            } catch {}
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
        if (ytPlayerRef.current && ytPlayerReadyRef.current) {
            try {
                if (nextMuted) ytPlayerRef.current.mute();
                else ytPlayerRef.current.unMute();
            } catch {}
        }
    };

    const closePlayer = () => {
        if (audioRef.current) audioRef.current.pause();
        if (ytPlayerRef.current && ytPlayerReadyRef.current) {
            try { ytPlayerRef.current.stopVideo(); } catch {}
        }
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

    // Stall watchdog for YouTube/online tracks that never start playing (server fetch timeout)
    const audioStallWatchdogRef = useRef<NodeJS.Timeout | null>(null);

    // When playingAudio changes, load source, fetch lyrics and fetch chords
    useEffect(() => {
        if (!playingAudio) return;
        const ytId = getYtId(playingAudio);
        if (audioStallWatchdogRef.current) clearTimeout(audioStallWatchdogRef.current);
        hasRetriedTranscodeRef.current = false;
        setAudioPlaybackStatus('loading');
        setAudioPlaybackError(null);
        fetchLyrics(playingAudio);
        fetchChords(playingAudio);

        if (ytId) {
            // YouTube Track Direct Playback via embedded IFrame Player
            addAudioNerdLog('info', `Loading YouTube track "${playingAudio.title}" (${ytId})`);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.removeAttribute('src');
            }

            const initOrLoadYt = () => {
                if (ytPlayerRef.current && ytPlayerReadyRef.current) {
                    try {
                        ytPlayerRef.current.loadVideoById(ytId);
                        ytPlayerRef.current.playVideo();
                    } catch (e: any) {
                        addAudioNerdLog('warn', `YT loadVideoById error: ${e.message}`);
                    }
                } else if (typeof window !== 'undefined' && (window as any).YT && (window as any).YT.Player) {
                    try {
                        ytPlayerRef.current = new (window as any).YT.Player('schedulearr-yt-iframe-player', {
                            height: '1',
                            width: '1',
                            videoId: ytId,
                            playerVars: {
                                autoplay: 1,
                                controls: 0,
                                disablekb: 1,
                                fs: 0,
                                playsinline: 1,
                                origin: typeof window !== 'undefined' ? window.location.origin : undefined
                            },
                            events: {
                                onReady: (event: any) => {
                                    ytPlayerReadyRef.current = true;
                                    try {
                                        event.target.setVolume(audioVolume * 100);
                                        if (isAudioMuted) event.target.mute();
                                        event.target.playVideo();
                                    } catch {}
                                },
                                onStateChange: (event: any) => {
                                    const state = event.data;
                                    // YT.PlayerState: PLAYING (1), PAUSED (2), BUFFERING (3), ENDED (0)
                                    if (state === 1) {
                                        setIsAudioPlaying(true);
                                        setAudioPlaybackStatus('playing');
                                        setAudioPlaybackError(null);
                                        addAudioNerdLog('success', 'YouTube audio stream playing');
                                    } else if (state === 2) {
                                        setIsAudioPlaying(false);
                                        setAudioPlaybackStatus('paused');
                                    } else if (state === 3) {
                                        setAudioPlaybackStatus('buffering');
                                    } else if (state === 0) {
                                        nextTrack();
                                    }
                                },
                                onError: (event: any) => {
                                    addAudioNerdLog('error', `YouTube Player Error Code: ${event.data}`);
                                    setAudioPlaybackStatus('error');
                                    setAudioPlaybackError({
                                        name: 'YOUTUBE_PLAYBACK_ERROR',
                                        message: `Could not play YouTube track "${playingAudio.title}".`,
                                        details: `YouTube error code: ${event.data}`,
                                        suggestion: 'Try another search result or grab to local library.'
                                    });
                                }
                            }
                        });
                    } catch (e: any) {
                        addAudioNerdLog('error', `YT Player Init Exception: ${e.message}`);
                    }
                }
            };

            if (typeof window !== 'undefined' && (window as any).YT && (window as any).YT.Player) {
                initOrLoadYt();
            } else {
                const checkInterval = setInterval(() => {
                    if (typeof window !== 'undefined' && (window as any).YT && (window as any).YT.Player) {
                        clearInterval(checkInterval);
                        initOrLoadYt();
                    }
                }, 200);
                setTimeout(() => clearInterval(checkInterval), 6000);
            }
        } else if (audioRef.current) {
            // Local file / Plex audio stream
            if (ytPlayerRef.current && ytPlayerReadyRef.current) {
                try { ytPlayerRef.current.stopVideo(); } catch {}
            }
            addAudioNerdLog('info', `Loading local track "${playingAudio.title}"`, {
                url: playingAudio.streamUrl,
                path: playingAudio.path
            });
            audioRef.current.src = playingAudio.streamUrl;
            audioRef.current.play().catch((e) => {
                addAudioNerdLog('warn', `Direct play() error: ${e.message}`);
            });
        }
    }, [playingAudio]);

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
                    const match = data.results.find((r: any) => r.artistName?.toLowerCase() === target.toLowerCase()) || data.results[0];
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
        fetchArtistInfo(target);
        if (isExpandedPlayerOpen) {
            setShowExpandedSidePanel(true);
            setExpandedSidePanel('artist');
        } else {
            setShowArtistModal(true);
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
                handleDownloadTrack,
                handleDownloadAlbum,
                addToQueue
            }}
        >
            {/* Embedded YouTube Player Container for direct lossless web audio */}
            <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', pointerEvents: 'none', opacity: 0 }}>
                <div id="schedulearr-yt-iframe-player" />
            </div>

            {/* Global Persistent Audio Element for Local Files & Plex */}
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
                    if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                    if (audioRef.current) {
                        setAudioDuration(audioRef.current.duration);
                        addAudioNerdLog('info', `Loaded audio metadata: duration ${audioRef.current.duration?.toFixed(1)}s`);
                    }
                }}
                onEnded={nextTrack}
                onError={() => {
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

                    // Automatic fallback to Server-Side Audio Transcode (attempted ONCE only)
                    if (playingAudio && !hasRetriedTranscodeRef.current && !audioRef.current?.src.includes('transcode=')) {
                        hasRetriedTranscodeRef.current = true;
                        const separator = playingAudio.streamUrl.includes('?') ? '&' : '?';
                        const transcodeUrl = `${playingAudio.streamUrl}${separator}transcode=audio&t=${Date.now()}`;
                        addAudioNerdLog('info', `Auto-retrying with Server-Side Audio Transcode: ${transcodeUrl}`);
                        setAudioPlaybackStatus('loading');
                        if (audioRef.current) {
                            audioRef.current.src = transcodeUrl;
                            audioRef.current.play().catch(e => {
                                setIsAudioPlaying(false);
                                setAudioPlaybackStatus('error');
                                setAudioPlaybackError({
                                    code: err?.code,
                                    name: codeName,
                                    message: `Direct stream failed for "${playingAudio.title}".`,
                                    details: `Browser could not decode format. Server transcode attempt failed: ${e.message}`,
                                    suggestion: 'Click "Force Transcode" or view Nerd Logs for detailed diagnostics.'
                                });
                            });
                        }
                    } else {
                        setIsAudioPlaying(false);
                        setAudioPlaybackStatus('error');
                        setAudioPlaybackError({
                            code: err?.code,
                            name: codeName,
                            message: `Unable to stream "${playingAudio?.title || 'Track'}".`,
                            details: `Stream source unreachable or codec unsupported: ${audioRef.current?.currentSrc || playingAudio?.streamUrl}`,
                            suggestion: 'Click "Force Transcode" or check Nerd Logs.'
                        });
                        toast.error(`Playback Incompatible: ${codeName}`);
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
                            style={{ width: `${audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0}%` }}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2.5 sm:gap-6">
                        {/* Track Artwork & Info (Click to Expand Studio Screen) */}
                        <div
                            onClick={() => setIsExpandedPlayerOpen(true)}
                            className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 max-w-[150px] sm:max-w-[280px] cursor-pointer group/art shrink"
                            title="Click to open Expanded Player with Big Art & Synced Lyrics"
                        >
                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 relative shadow-md group-hover/art:scale-105 group-hover/art:border-amber-500/50 transition-all">
                                {playingAudio.posterUrl ? (
                                    <img src={playingAudio.posterUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <Music size={20} />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/art:opacity-100 flex items-center justify-center transition-opacity">
                                    <Maximize size={14} className="text-white" />
                                </div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 min-w-0">
                                    <h4 className="font-bold text-white text-xs sm:text-base truncate leading-snug group-hover/art:text-amber-400 transition-colors">{playingAudio.title}</h4>
                                    {audioPlaybackStatus === 'loading' && (
                                        <span className="shrink-0 px-1 py-0.2 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 animate-pulse border border-amber-500/30">
                                            Load
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openArtistDetails(playingAudio.artist);
                                    }}
                                    className="text-[11px] sm:text-xs text-zinc-400 hover:text-amber-300 hover:underline truncate text-left transition-colors block"
                                    title={`View artist biography & albums for ${playingAudio.artist || 'Artist'}`}
                                >
                                    {playingAudio.artist || playingAudio.folder || 'Artist'}
                                </button>
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
                                    className={`p-1.5 sm:p-2 rounded-xl transition-colors hidden sm:flex ${isRepeat ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Repeat Queue"
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
                                    max={audioDuration || 100}
                                    value={audioCurrentTime}
                                    onChange={e => seekTo(Number(e.target.value))}
                                    className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 min-w-0"
                                />
                                <span className="w-8 shrink-0">{formatTime(audioDuration)}</span>
                            </div>
                        </div>

                        {/* Right Quick Actions */}
                        <div className="flex items-center gap-1 sm:gap-1.5 justify-end shrink-0">
                            {playingAudio.youtubeId && (
                                <button
                                    onClick={() => handleGrabTrackToLibrary(playingAudio)}
                                    disabled={isGrabbingTrack}
                                    className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 text-xs font-bold transition-all hidden md:flex"
                                    title="Grab Track to Local Music Library Folder"
                                >
                                    <ArrowDownToLine size={15} />
                                </button>
                            )}

                            {/* Chords & Musical Jam Stage */}
                            <button
                                onClick={() => {
                                    setIsExpandedPlayerOpen(true);
                                    setShowExpandedSidePanel(true);
                                    setExpandedSidePanel('guitar');
                                }}
                                className="p-2 sm:p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-black border border-amber-500/30 text-xs font-bold transition-all hidden lg:flex"
                                title="Open Guitar & Ukulele Chords Jam Stage"
                            >
                                <Guitar size={15} />
                            </button>

                            {/* Karaoke / Live Lyrics */}
                            <button
                                onClick={() => setShowLyricsModal(true)}
                                className={`p-2 sm:p-2.5 rounded-xl border text-xs font-bold transition-all hidden md:flex ${
                                    showLyricsModal ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40'
                                }`}
                                title="Karaoke Live Lyrics & Match Editor"
                            >
                                <Mic2 size={15} />
                            </button>

                            {/* Download Track */}
                            <button
                                onClick={() => handleDownloadTrack(playingAudio)}
                                className="p-2 sm:p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 text-xs font-bold transition-all hidden md:flex"
                                title="Download Audio File to Local Machine"
                            >
                                <Download size={15} />
                            </button>

                            <button
                                onClick={() => setShowAudioNerdModal(true)}
                                className={`p-2 sm:p-2.5 rounded-xl border text-xs font-bold transition-all hidden lg:flex ${
                                    showAudioNerdModal || audioPlaybackError
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                                title="Audio Diagnostics & Stats for Nerds"
                            >
                                <Terminal size={15} />
                            </button>

                            <button
                                onClick={() => fetchAudioSpecs(playingAudio)}
                                className="p-2 sm:p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 text-xs font-bold transition-all hidden lg:flex"
                                title="Audio Specs & Metadata (Stats for Audiophiles)"
                            >
                                <Info size={15} />
                            </button>

                            <button
                                onClick={() => setShowQueueDrawer(!showQueueDrawer)}
                                className={`p-2 sm:p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all hidden sm:flex ${
                                    showQueueDrawer ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                                title="Toggle Playback Queue"
                            >
                                <ListMusic size={15} />
                                <span className="hidden xl:inline text-xs">({audioQueue.length})</span>
                            </button>

                            {/* Mobile Expand Studio Button */}
                            <button
                                onClick={() => setIsExpandedPlayerOpen(true)}
                                className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all sm:hidden"
                                title="Open Full Studio"
                            >
                                <Maximize size={15} />
                            </button>

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

                    {/* Top Bar: Minimize, Title, Header Actions */}
                    <div className="relative z-10 flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-900/80 shrink-0 h-12">
                        <button
                            onClick={() => setIsExpandedPlayerOpen(false)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-black uppercase tracking-wider transition-all shrink-0"
                        >
                            <ChevronDown size={16} /> <span className="hidden sm:inline">Minimize</span>
                        </button>

                        <div className="text-center truncate px-2 min-w-0 flex-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                                Schedulearr Vinyl Studio
                            </span>
                            <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                                {playingAudio.title} — {playingAudio.artist || 'Artist'}
                            </h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                            {/* In-Player Search Quick Button */}
                            <button
                                onClick={() => {
                                    setShowExpandedSidePanel(true);
                                    setExpandedSidePanel('search');
                                }}
                                className={`p-2 sm:px-2.5 sm:py-1.5 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                                    showExpandedSidePanel && expandedSidePanel === 'search'
                                        ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                                }`}
                                title="Search Libraries & YouTube"
                            >
                                <Search size={14} className={showExpandedSidePanel && expandedSidePanel === 'search' ? 'text-black' : 'text-amber-400'} />
                                <span className="hidden md:inline">Search</span>
                            </button>

                            {/* Nerd Tools Button */}
                            <button
                                onClick={() => setShowAudioNerdModal(true)}
                                className={`p-2 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                                    showAudioNerdModal || audioPlaybackError
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                                }`}
                                title="Audio Diagnostics & Stats for Nerds"
                            >
                                <Terminal size={14} />
                            </button>

                            <button
                                onClick={() => setIsExpandedPlayerOpen(false)}
                                className="p-1.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors shrink-0"
                            >
                                <X size={18} />
                            </button>
                        </div>
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

                    {/* Main Stage: Fixed viewport grid on desktop, single view on mobile */}
                    <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch pt-2 sm:pt-3 overflow-hidden">
                        {/* Left / Center: Artwork & Full Controls - Scaled to fit viewport without parent scroll */}
                        <div className={`${showExpandedSidePanel ? 'hidden lg:flex lg:col-span-5 xl:col-span-5' : 'flex col-span-1 lg:col-span-8 lg:col-start-3'} flex-col justify-between items-center h-full max-h-full mx-auto w-full max-w-md overflow-hidden py-1`}>
                            {/* View Mode Toggle: Vinyl Turntable vs Normal Cover Art */}
                            <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800/80 shadow-inner backdrop-blur-md shrink-0">
                                <button
                                    onClick={() => setIsVinylView(true)}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                        isVinylView
                                            ? 'bg-amber-500 text-black shadow-md'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                    }`}
                                    title="Switch to Vinyl Turntable Player Mode"
                                >
                                    <Disc size={13} /> Vinyl
                                </button>
                                <button
                                    onClick={() => setIsVinylView(false)}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                        !isVinylView
                                            ? 'bg-zinc-800 text-white border border-zinc-700 shadow-md'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                    }`}
                                    title="Switch to Standard Cover Artwork View"
                                >
                                    <ImageIcon size={13} /> Normal Art
                                </button>
                            </div>

                            {/* Main Artwork Stage: Vinyl Player vs Normal Cover Art */}
                            <div className="flex-1 min-h-0 flex items-center justify-center w-full my-2">
                                {isVinylView ? (
                                    /* ── Vinyl Turntable Player Representation ── */
                                    <div className="relative w-full max-w-[280px] sm:max-w-[320px] aspect-[1.12/1] rounded-[2rem] bg-gradient-to-b from-zinc-800 via-zinc-900 to-[#09090b] border-2 border-zinc-700/80 p-3 shadow-2xl flex items-center justify-center select-none overflow-hidden group">
                                        {/* Turntable Plinth Inset */}
                                        <div className="absolute inset-2 rounded-[1.5rem] bg-gradient-to-b from-[#18181b] to-[#0c0c0e] border border-white/5 pointer-events-none shadow-inner" />

                                        {/* Top-Left: Direct Drive Specs & Power LED */}
                                        <div className="absolute top-3 left-4 z-20 flex items-center gap-1.5 pointer-events-none">
                                            <span className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                                isAudioPlaying
                                                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] ring-2 ring-emerald-500/30'
                                                    : 'bg-zinc-600'
                                            }`} />
                                            <div className="text-[8px] font-black uppercase tracking-widest text-zinc-400">
                                                <span className="text-amber-400">33⅓ RPM</span>
                                            </div>
                                        </div>

                                        {/* Rotating Turntable Platter & Vinyl Disc */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePlayPause();
                                            }}
                                            className="relative w-44 h-44 sm:w-52 sm:h-52 -translate-x-2.5 flex items-center justify-center cursor-pointer select-none group/disc"
                                            title={isAudioPlaying ? "Click Vinyl Record to Pause" : "Click Vinyl Record to Play"}
                                        >
                                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-600 p-1 shadow-2xl flex items-center justify-center border border-zinc-600/50 pointer-events-none group-hover/disc:border-amber-500/40 transition-colors">
                                                <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center shadow-inner">
                                                    <div
                                                        className="relative w-[96%] h-[96%] rounded-full bg-black shadow-2xl flex items-center justify-center overflow-hidden"
                                                        style={{
                                                            animation: 'vinyl-spin 8s linear infinite',
                                                            animationPlayState: isAudioPlaying ? 'running' : 'paused'
                                                        }}
                                                    >
                                                        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#000000_30%,_#18181b_31%,_#09090b_45%,_#1f1f23_46%,_#000000_65%,_#18181b_66%,_#000000_100%)] opacity-90 pointer-events-none" />
                                                        <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.08)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.08)_225deg,transparent_270deg)] pointer-events-none" />

                                                        {/* Center Label */}
                                                        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-amber-500/60 shadow-2xl flex items-center justify-center z-10 pointer-events-none">
                                                            {playingAudio.posterUrl ? (
                                                                <img
                                                                    src={playingAudio.posterUrl}
                                                                    alt=""
                                                                    className="w-full h-full object-cover pointer-events-none"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-black font-black text-[10px] text-center p-1 pointer-events-none">
                                                                    {playingAudio.title}
                                                                </div>
                                                            )}
                                                            <div className="absolute w-6 h-6 rounded-full bg-zinc-950 border-2 border-zinc-400 flex items-center justify-center shadow-inner z-20">
                                                                <div className="w-2 h-2 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 shadow-md" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tonearm Needle */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePlayPause();
                                            }}
                                            className="absolute top-2 right-3 z-30 select-none cursor-pointer group/arm-wrapper p-2"
                                            title={isAudioPlaying ? "Click Needle to Lift & Pause" : "Click Needle to Drop & Play"}
                                        >
                                            <div
                                                className="relative w-10 h-10 rounded-full bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-950 border-2 border-zinc-500 shadow-2xl flex items-center justify-center group-hover/arm-wrapper:border-amber-400 transition-colors"
                                            >
                                                <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-zinc-300 via-white to-zinc-400 border border-zinc-400 shadow-md flex items-center justify-center pointer-events-none">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                                                </div>
                                                <div
                                                    className="absolute top-4 left-4 w-6 origin-top pointer-events-none"
                                                    style={{
                                                        transform: `rotate(${isAudioPlaying ? 24 : 0}deg)`,
                                                        transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)'
                                                    }}
                                                >
                                                    <div className="w-1.5 h-30 sm:h-34 bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500 rounded-full shadow-lg relative pointer-events-none">
                                                        <div className="absolute -bottom-1 -left-1.5 w-4 h-6 bg-gradient-to-b from-amber-400 to-amber-600 rounded-sm shadow-md flex items-center justify-center border border-amber-300 pointer-events-none">
                                                            <div className={`w-1.5 h-2.5 rounded-full shadow-sm ${isAudioPlaying ? 'bg-amber-300 animate-pulse' : 'bg-zinc-500'}`} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* ── Normal High-Res Cover Artwork View ── */
                                    <div className="relative max-h-[30vh] sm:max-h-[34vh] md:max-h-[38vh] aspect-square w-auto h-full rounded-[2rem] bg-zinc-900 border-2 border-zinc-800/80 overflow-hidden shadow-2xl flex items-center justify-center">
                                        {playingAudio.posterUrl ? (
                                            <img src={playingAudio.posterUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <Disc size={72} className="text-amber-400" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Track Info & Clickable Artist */}
                            <div className="text-center space-y-1 w-full px-2 shrink-0">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase tracking-wider">
                                        {playingAudio.extension?.toUpperCase() === 'FLAC' ? 'FLAC 24-bit' : `${playingAudio.extension?.toUpperCase() || 'Audio'}`}
                                    </span>
                                    {playingAudio.album && (
                                        <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800 text-[9px] font-black uppercase truncate max-w-[180px]">
                                            {playingAudio.album}
                                        </span>
                                    )}
                                </div>

                                <h2 className="text-lg sm:text-2xl font-black text-white leading-tight truncate">
                                    {playingAudio.title}
                                </h2>
                                
                                {/* Clickable Artist Name to view Bio & Discography */}
                                <div>
                                    <button
                                        onClick={() => openArtistDetails(playingAudio.artist)}
                                        className="text-sm sm:text-base font-bold text-amber-300 hover:text-amber-200 hover:underline transition-colors max-w-full truncate inline-flex items-center gap-1 cursor-pointer"
                                        title={`View artist biography & albums for ${playingAudio.artist || 'Artist'}`}
                                    >
                                        <User size={13} className="text-amber-400 shrink-0" />
                                        <span>{playingAudio.artist || playingAudio.folder || 'Artist'}</span>
                                    </button>
                                </div>

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
                                    max={audioDuration || 100}
                                    value={audioCurrentTime}
                                    onChange={e => seekTo(Number(e.target.value))}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                                <div className="flex justify-between text-[11px] font-mono text-zinc-500 font-bold">
                                    <span>{formatTime(audioCurrentTime)}</span>
                                    <span>{formatTime(audioDuration)}</span>
                                </div>
                            </div>

                            {/* Master Playback Controls */}
                            <div className="flex items-center justify-center gap-4 sm:gap-6 w-full shrink-0 py-1">
                                <button
                                    onClick={() => setIsShuffle(!isShuffle)}
                                    className={`p-2 rounded-xl transition-all ${isShuffle ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Shuffle"
                                >
                                    <Shuffle size={16} />
                                </button>

                                <button
                                    onClick={prevTrack}
                                    className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-900 transition-all"
                                    title="Previous Track"
                                >
                                    <SkipBack size={20} />
                                </button>

                                <button
                                    onClick={togglePlayPause}
                                    disabled={audioPlaybackStatus === 'loading'}
                                    className="w-13 h-13 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/30 transition-all scale-100 active:scale-95 disabled:opacity-75"
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
                                    className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-900 transition-all"
                                    title="Next Track"
                                >
                                    <SkipForward size={20} />
                                </button>

                                <button
                                    onClick={() => setIsRepeat(!isRepeat)}
                                    className={`p-2 rounded-xl transition-all ${isRepeat ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Repeat"
                                >
                                    <Repeat size={16} />
                                </button>
                            </div>

                            {/* Bottom Controls Row: Volume (Desktop), Download, Specs, Cast */}
                            <div className="flex items-center justify-between gap-3 w-full pt-1.5 border-t border-zinc-900/90 px-1 shrink-0">
                                <div className="hidden sm:flex items-center gap-1.5">
                                    <button
                                        onClick={toggleMute}
                                        className="text-zinc-500 hover:text-white transition-colors"
                                        title={isAudioMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {isAudioMuted || audioVolume === 0 ? <VolumeX size={15} className="text-red-400" /> : <Volume2 size={15} />}
                                    </button>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={isAudioMuted ? 0 : audioVolume}
                                        onChange={e => handleVolumeChange(Number(e.target.value))}
                                        className="w-20 sm:w-24 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    />
                                </div>

                                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
                                    <button
                                        onClick={() => handleDownloadTrack(playingAudio)}
                                        className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 border border-zinc-800 text-xs font-bold transition-all flex items-center gap-1.5"
                                        title="Download Track / Add to Library"
                                    >
                                        <Download size={13} /> Download
                                    </button>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => fetchAudioSpecs(playingAudio)}
                                            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 border border-zinc-800 transition-all"
                                            title="Stats for Audiophiles"
                                        >
                                            <Info size={15} />
                                        </button>
                                        <button
                                            onClick={() => openCastPicker(playingAudio)}
                                            className="p-2 rounded-xl bg-purple-500/15 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 transition-all"
                                            title="Cast to Smart TV"
                                        >
                                            <Cast size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Toggleable Panel (Karaoke / Guitar / Bass / Sing / Artist / Queue / Specs) */}
                        {showExpandedSidePanel && (
                            <div className="col-span-1 lg:col-span-7 xl:col-span-7 h-full max-h-full flex flex-col bg-zinc-950/80 border border-zinc-900 rounded-[2rem] p-3 sm:p-5 shadow-2xl space-y-3 min-h-0 overflow-hidden">
                                {/* Panel Tab Selectors - Smooth horizontal scrollable chips */}
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-900 shrink-0">
                                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scrollbar-none py-1 px-1 bg-zinc-900/90 rounded-2xl border border-zinc-800 shrink-0 max-w-full">
                                        <button
                                            onClick={() => setExpandedSidePanel('karaoke')}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'karaoke' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Mic2 size={13} /> Karaoke
                                        </button>
                                        <button
                                            onClick={() => {
                                                setJamInstrument('guitar');
                                                setExpandedSidePanel('guitar');
                                            }}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'guitar' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Guitar size={13} /> Guitar
                                        </button>
                                        <button
                                            onClick={() => {
                                                setJamInstrument('bass');
                                                setExpandedSidePanel('bass');
                                            }}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'bass' ? 'bg-purple-500 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Activity size={13} /> Bass
                                        </button>
                                        <button
                                            onClick={() => setExpandedSidePanel('sing')}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'sing' ? 'bg-pink-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Sparkles size={13} /> Sing Hero
                                        </button>
                                        <button
                                            onClick={() => {
                                                setExpandedSidePanel('artist');
                                                fetchArtistInfo(playingAudio.artist);
                                            }}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'artist' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <User size={13} /> Artist Bio
                                        </button>
                                        <button
                                            onClick={() => setExpandedSidePanel('queue')}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'queue' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <ListMusic size={13} /> Queue ({audioQueue.length})
                                        </button>
                                        <button
                                            onClick={() => {
                                                setExpandedSidePanel('playlists');
                                                fetchInPlayerPlaylists();
                                            }}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'playlists' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <ListPlus size={13} /> Playlists ({inPlayerPlaylists.length})
                                        </button>
                                        <button
                                            onClick={() => setExpandedSidePanel('search')}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'search' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Search size={13} /> Search
                                        </button>
                                        <button
                                            onClick={() => setExpandedSidePanel('specs')}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                                                expandedSidePanel === 'specs' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            <Info size={13} /> Specs
                                        </button>
                                    </div>

                                    {expandedSidePanel === 'karaoke' && (
                                        <div className="flex items-center gap-1.5">
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
                                                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] font-bold flex items-center gap-1 transition-all"
                                                title="Edit lyrics match"
                                            >
                                                <Edit3 size={11} /> Edit
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* 1. Karaoke Tab Content - Isolated Smooth Scroll */}
                                {expandedSidePanel === 'karaoke' && (
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
                                            <div className="space-y-4 py-16 text-center">
                                                {lyricsData.lines.map((line, idx) => {
                                                    const isActive = idx === currentLyricIndex;
                                                    const isPast = currentLyricIndex !== -1 && idx < currentLyricIndex;
                                                    return (
                                                        <div
                                                            key={idx}
                                                            ref={isActive ? expandedActiveLyricRef : null}
                                                            onClick={() => seekTo(line.time)}
                                                            className={`cursor-pointer transition-colors duration-200 py-1.5 px-3 rounded-xl inline-block max-w-xl ${
                                                                isActive
                                                                    ? 'text-xl sm:text-2xl font-black text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]'
                                                                    : isPast
                                                                    ? 'text-sm sm:text-base font-bold text-zinc-600 hover:text-zinc-400'
                                                                    : 'text-sm sm:text-base font-bold text-zinc-400 hover:text-zinc-200'
                                                            }`}
                                                        >
                                                            {line.text}
                                                        </div>
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

                                {/* 2. Guitar Mode (Chords + Retained Lyrics View) */}
                                {expandedSidePanel === 'guitar' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 space-y-3 flex flex-col">
                                        {/* Musician Controls Bar */}
                                        <div className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                                            <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                                                <Guitar size={14} /> 6-String Guitar Chords
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Difficulty Selector */}
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

                                                {/* Transpose Controls */}
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

                                        {/* Center Stage: Active Chord + Guitar Fretboard */}
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

                                        {/* Synchronized Lyrics Retained Section for Guitarists */}
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

                                {/* 3. Bass Mode (4-String Fretboard + Retained Lyrics View) */}
                                {expandedSidePanel === 'bass' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 space-y-3 flex flex-col">
                                        {/* Musician Controls Bar */}
                                        <div className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                                            <div className="flex items-center gap-1.5 text-xs font-black text-purple-400">
                                                <Activity size={14} /> 4-String Bass Fretboard
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Transpose Controls */}
                                                <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                                                    <button
                                                        onClick={() => setJamTranspose(prev => prev - 1)}
                                                        className="w-4 h-4 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs flex items-center justify-center"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="text-[10px] font-mono font-bold text-purple-300 px-1">
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

                                        {/* Center Stage: Active Bass Root + 4-String Fretboard */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch shrink-0">
                                            <div className="p-3.5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl flex flex-col justify-between space-y-2 relative overflow-hidden shadow-xl">
                                                <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider flex items-center gap-1">
                                                    <Activity size={12} className="animate-pulse" /> Active Bass Root
                                                </span>

                                                <div className="text-center py-1">
                                                    <h2 className="text-4xl sm:text-5xl font-black text-purple-300 tracking-tight drop-shadow-[0_0_20px_rgba(168,85,247,0.6)]">
                                                        {activeChordEvent?.displayChord || 'C'}
                                                    </h2>
                                                </div>

                                                <div className="p-1.5 bg-zinc-950/80 rounded-xl border border-zinc-800/80 flex items-center justify-between text-xs">
                                                    <span className="text-zinc-500 font-bold text-[10px]">Next:</span>
                                                    {activeChordEvent?.nextChord ? (
                                                        <div className="flex items-center gap-1.5 font-mono">
                                                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-black text-[11px]">
                                                                {activeChordEvent.nextChord}
                                                            </span>
                                                            <span className="text-zinc-400 text-[10px]">in {activeChordEvent.nextInSeconds}s</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-zinc-600 text-[10px]">Holding root</span>
                                                    )}
                                                </div>
                                            </div>

                                            <FretboardDiagram
                                                chordName={activeChordEvent?.displayChord || 'C'}
                                                instrument="bass"
                                            />
                                        </div>

                                        {/* Synchronized Lyrics Retained Section for Bassists */}
                                        <div className="flex-1 min-h-[140px] bg-zinc-900/40 border border-zinc-800/70 rounded-2xl p-3 flex flex-col">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
                                                <Mic2 size={11} className="text-purple-400" /> Synced Lyrics (Sing along while playing bass)
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

                                {/* 4. Sing Mode (Guitar Hero Vocal Pitch Lane & Live Mic Detection) */}
                                {expandedSidePanel === 'sing' && (
                                    <SingPitchHero
                                        lyricsData={lyricsData}
                                        currentTime={audioCurrentTime}
                                        duration={audioDuration}
                                        onSeek={seekTo}
                                    />
                                )}

                                {/* 5. Artist Bio & Discography Tab Content */}
                                {expandedSidePanel === 'artist' && (
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

                                                    {artistData.albums && artistData.albums.length > 0 ? (
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                            {artistData.albums.map((album: any, ai: number) => {
                                                                const coverImg = album.coverUrl || album.posterUrl || album.coverArt || album.remoteCover || album.remotePoster || album.images?.find((img: any) => img.coverType === 'cover' || img.coverType === 'poster')?.remoteUrl;
                                                                return (
                                                                    <div
                                                                        key={ai}
                                                                        onClick={() => handlePlayAlbumCard(album)}
                                                                        className="p-2.5 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/60 rounded-2xl transition-all space-y-2 group flex flex-col justify-between cursor-pointer hover:scale-[1.02] shadow-lg"
                                                                        title={`Click to play album "${album.title}"`}
                                                                    >
                                                                        <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 flex items-center justify-center relative shadow-md">
                                                                            {coverImg ? (
                                                                                <img src={coverImg} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                            ) : (
                                                                                <Disc size={28} className="text-zinc-700" />
                                                                            )}
                                                                            {/* Play Overlay */}
                                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                                <div className="w-9 h-9 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                                                                                    <Play size={16} className="ml-0.5 fill-black" />
                                                                                </div>
                                                                            </div>
                                                                            {album.releaseDate && (
                                                                                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[9px] font-mono font-bold text-amber-300">
                                                                                    {String(album.releaseDate).slice(0, 4)}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div>
                                                                            <h4 className="font-bold text-white text-xs truncate group-hover:text-amber-400 transition-colors" title={album.title}>
                                                                                {album.title}
                                                                            </h4>
                                                                            <div className="flex items-center justify-between pt-1">
                                                                                <span className="text-[10px] text-zinc-500 font-medium">
                                                                                    {album.trackCount ? `${album.trackCount} Tracks` : 'Album'}
                                                                                </span>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleDownloadTrack({
                                                                                            id: `album-${album.id || ai}`,
                                                                                            title: album.title,
                                                                                            artist: artistData.artistName,
                                                                                            album: album.title,
                                                                                            posterUrl: coverImg
                                                                                        } as any);
                                                                                    }}
                                                                                    className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-amber-500 text-zinc-400 hover:text-black text-[9px] font-bold uppercase transition-all flex items-center gap-1"
                                                                                    title="Download Album"
                                                                                >
                                                                                    <Download size={10} /> Download
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="p-6 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-xs text-zinc-500">
                                                            No albums listed for this artist.
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

                                {/* 4. Queue Tab Content */}
                                {expandedSidePanel === 'queue' && (
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
                                                    className={`p-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border ${
                                                        isCurrent
                                                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm'
                                                            : 'bg-zinc-900/40 border-zinc-900 text-zinc-300 hover:bg-zinc-900/80 hover:text-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="w-5 text-zinc-600 font-mono font-bold">{i + 1}</span>
                                                        <div className="truncate">
                                                            <p className="truncate font-bold text-white">{track.title}</p>
                                                            <span className="text-[10px] text-zinc-500">{track.artist || 'Artist'}</span>
                                                        </div>
                                                    </div>
                                                    {isCurrent && <Volume2 size={15} className="text-amber-400 shrink-0 animate-pulse" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* 5. Specs Tab Content */}
                                {expandedSidePanel === 'specs' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-2.5">
                                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                                            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-0.5">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">Codec &amp; Format</span>
                                                <span className="font-bold text-white">{playingAudio.extension?.toUpperCase() || 'Audio'}</span>
                                            </div>
                                            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-0.5">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">Quality Type</span>
                                                <span className="font-bold text-amber-400">{playingAudio.extension?.toLowerCase() === 'flac' ? '24-bit Lossless' : 'High-Res Audio'}</span>
                                            </div>
                                            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-0.5">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">File Size</span>
                                                <span className="font-bold text-white">{formatBytes(playingAudio.sizeBytes)}</span>
                                            </div>
                                            <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-0.5">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">Channels</span>
                                                <span className="font-bold text-white">Stereo (2.0)</span>
                                            </div>
                                        </div>

                                        <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800 text-xs space-y-0.5">
                                            <span className="text-[10px] font-black uppercase text-zinc-500 block">Path / Source</span>
                                            <p className="font-mono text-[11px] text-zinc-400 break-all">{playingAudio.path || playingAudio.streamUrl}</p>
                                        </div>
                                    </div>
                                )}

                                {/* 5.5 Playlists Tab Content */}
                                {expandedSidePanel === 'playlists' && (
                                    <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden p-1">
                                        {/* Playlists Header & Quick Create */}
                                        <div className="flex items-center justify-between gap-2 shrink-0">
                                            <div>
                                                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                                                    <ListPlus size={15} className="text-amber-400" /> Saved Playlists ({inPlayerPlaylists.length})
                                                </h3>
                                                <p className="text-xs text-zinc-500">Tap to play, add current song, or create new playlist</p>
                                            </div>
                                            <button
                                                onClick={() => setShowInPlayerCreatePlaylist(!showInPlayerCreatePlaylist)}
                                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all shadow-md shrink-0"
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
                                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={handleCreateInPlayerPlaylist}
                                                    disabled={!inPlayerNewPlaylistName.trim()}
                                                    className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase disabled:opacity-50 transition-all"
                                                >
                                                    Create
                                                </button>
                                                <button
                                                    onClick={() => setShowInPlayerCreatePlaylist(false)}
                                                    className="p-2 text-zinc-500 hover:text-white rounded-xl"
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
                                                        <p className="text-sm font-bold text-white">No Playlists Created Yet</p>
                                                        <p className="text-xs text-zinc-500 mt-1">Create your first playlist or save your favorite tracks!</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowInPlayerCreatePlaylist(true)}
                                                        className="px-4 py-2 rounded-xl bg-amber-500 text-black font-black text-xs uppercase"
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
                                                            className="p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 rounded-2xl transition-all flex items-center justify-between gap-3 group"
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
                                                                    <h4 className="font-bold text-white text-xs sm:text-sm truncate">
                                                                        {pl.name}
                                                                    </h4>
                                                                    <p className="text-xs text-zinc-500">
                                                                        {items.length} track{items.length !== 1 ? 's' : ''}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <button
                                                                    onClick={() => handleAddCurrentSongToPlaylist(pl)}
                                                                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
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
                                                                    className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition-all disabled:opacity-40"
                                                                    title="Play Playlist"
                                                                >
                                                                    <Play size={14} className="ml-0.5 fill-black" />
                                                                </button>

                                                                <button
                                                                    onClick={() => handleDeleteInPlayerPlaylist(pl.id, pl.name)}
                                                                    className="p-2 rounded-xl bg-zinc-800/80 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
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

                                    {/* Discography / Albums Grid */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                                                <Disc size={16} className="text-amber-400" /> Albums &amp; Discography ({artistData.albums?.length || 0})
                                            </span>
                                        </div>

                                        {artistData.albums && artistData.albums.length > 0 ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                                {artistData.albums.map((album: any, ai: number) => {
                                                    const coverImg = album.coverUrl || album.posterUrl || album.coverArt || album.remoteCover || album.remotePoster || album.images?.find((img: any) => img.coverType === 'cover' || img.coverType === 'poster')?.remoteUrl;
                                                    return (
                                                        <div
                                                            key={ai}
                                                            onClick={() => handlePlayAlbumCard(album)}
                                                            className="p-3 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/60 rounded-2xl transition-all space-y-2 group flex flex-col justify-between cursor-pointer hover:scale-[1.02] shadow-xl"
                                                            title={`Click to play album "${album.title}"`}
                                                        >
                                                            <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 flex items-center justify-center relative shadow-md">
                                                                {coverImg ? (
                                                                    <img src={coverImg} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                ) : (
                                                                    <Disc size={32} className="text-zinc-700" />
                                                                )}
                                                                {/* Play Overlay */}
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
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
                                                            <div>
                                                                <h4 className="font-bold text-white text-xs truncate group-hover:text-amber-400 transition-colors" title={album.title}>
                                                                    {album.title}
                                                                </h4>
                                                                <div className="flex items-center justify-between pt-1">
                                                                    <span className="text-[10px] text-zinc-500 font-medium">
                                                                        {album.trackCount ? `${album.trackCount} Tracks` : 'Album'}
                                                                    </span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDownloadTrack({
                                                                                id: `album-${album.id || ai}`,
                                                                                title: album.title,
                                                                                artist: artistData.artistName,
                                                                                album: album.title,
                                                                                posterUrl: coverImg
                                                                            } as any);
                                                                        }}
                                                                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-amber-500 text-zinc-400 hover:text-black text-[10px] font-bold uppercase transition-all flex items-center gap-1"
                                                                        title="Download Album"
                                                                    >
                                                                        <Download size={11} /> Download
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-xs text-zinc-500">
                                                No albums found for this artist.
                                            </div>
                                        )}
                                    </div>
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
                                            <span>{formatTime(audioCurrentTime)}</span> / <span>{formatTime(audioDuration)}</span>
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
                    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-2xl max-h-[85vh] rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    <Terminal size={18} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white flex items-center gap-2">
                                        Audio Diagnostics & Nerd Telemetry
                                    </h3>
                                    <p className="text-xs text-zinc-400">
                                        Real-time HTML5 audio decoder states, stream health & log trace
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAudioNerdModal(false)}
                                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Telemetry Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Status</span>
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

                            <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Decoder State</span>
                                <p className="font-mono text-xs font-bold text-amber-300 truncate">
                                    {audioRef.current ? (
                                        ['HAVE_NOTHING (0)', 'HAVE_METADATA (1)', 'HAVE_CURRENT_DATA (2)', 'HAVE_FUTURE_DATA (3)', 'HAVE_ENOUGH_DATA (4)'][audioRef.current.readyState] || `Ready ${audioRef.current.readyState}`
                                    ) : 'No Element'}
                                </p>
                            </div>

                            <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Network State</span>
                                <p className="font-mono text-xs font-bold text-cyan-300 truncate">
                                    {audioRef.current ? (
                                        ['NETWORK_EMPTY (0)', 'NETWORK_IDLE (1)', 'NETWORK_LOADING (2)', 'NETWORK_NO_SOURCE (3)'][audioRef.current.networkState] || `State ${audioRef.current.networkState}`
                                    ) : 'No Element'}
                                </p>
                            </div>

                            <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Time / Duration</span>
                                <p className="font-mono text-xs font-bold text-zinc-200">
                                    {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                                </p>
                            </div>
                        </div>

                        {/* Stream Source & Target Info */}
                        {playingAudio && (
                            <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs font-mono space-y-1.5">
                                <div className="flex items-center justify-between text-zinc-400">
                                    <span>Track: <b className="text-white font-sans">{playingAudio.title}</b> ({playingAudio.extension?.toUpperCase() || 'AUDIO'})</span>
                                    <span className="text-[10px] text-zinc-500">Source: {playingAudio.source || 'Local Disk'}</span>
                                </div>
                                <div className="text-zinc-500 break-all text-[11px]">
                                    Active Stream URI: <span className="text-amber-400/90">{audioRef.current?.currentSrc || playingAudio.streamUrl}</span>
                                </div>
                            </div>
                        )}

                        {/* Error Callout if Active */}
                        {audioPlaybackError && (
                            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs space-y-1">
                                <div className="font-bold text-red-400 flex items-center gap-1.5">
                                    <AlertTriangle size={14} /> {audioPlaybackError.name || 'Playback Failure'}
                                </div>
                                <p className="text-zinc-300">{audioPlaybackError.message}</p>
                                {audioPlaybackError.details && (
                                    <p className="text-[11px] font-mono text-red-300/80">{audioPlaybackError.details}</p>
                                )}
                            </div>
                        )}

                        {/* Live Event Stream Console */}
                        <div className="flex-1 min-h-[160px] max-h-[220px] overflow-y-auto bg-black/60 border border-zinc-900 rounded-2xl p-3 font-mono text-xs space-y-1.5 custom-scrollbar">
                            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider sticky top-0 bg-black/90 py-0.5">
                                Event Telemetry Trace ({audioNerdLogs.length} events)
                            </div>
                            {audioNerdLogs.length === 0 ? (
                                <p className="text-zinc-600 text-[11px]">No events recorded yet. Play a track to capture live logs.</p>
                            ) : (
                                audioNerdLogs.map((log) => (
                                    <div key={log.id} className="flex items-start gap-2 text-[11px] leading-tight">
                                        <span className="text-zinc-600 shrink-0">{log.timestamp}</span>
                                        <span className={`shrink-0 uppercase font-black text-[9px] px-1 rounded ${
                                            log.level === 'error' ? 'bg-red-500/20 text-red-400' :
                                            log.level === 'warn' ? 'bg-amber-500/20 text-amber-400' :
                                            log.level === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                                            'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {log.level}
                                        </span>
                                        <span className={
                                            log.level === 'error' ? 'text-red-300' :
                                            log.level === 'warn' ? 'text-amber-200' :
                                            log.level === 'success' ? 'text-emerald-300' :
                                            'text-zinc-300'
                                        }>
                                            {log.message}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Modal Footer Controls */}
                        <div className="pt-2 border-t border-zinc-900 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleForceAudioTranscode}
                                    className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
                                >
                                    <Zap size={13} /> Force Server Transcode
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
                                    className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-800 flex items-center gap-1.5 transition-all"
                                >
                                    <RotateCcw size={13} /> Retry
                                </button>
                            </div>

                            <button
                                onClick={() => {
                                    const report = [
                                        `# Schedulearr Audio Diagnostics Report`,
                                        `Time: ${new Date().toISOString()}`,
                                        `Track: ${playingAudio?.title || 'None'}`,
                                        `Artist: ${playingAudio?.artist || 'Unknown'}`,
                                        `Format: ${playingAudio?.extension || 'Unknown'}`,
                                        `Stream URL: ${audioRef.current?.currentSrc || playingAudio?.streamUrl || 'None'}`,
                                        `Status: ${audioPlaybackStatus}`,
                                        `Ready State: ${audioRef.current?.readyState}`,
                                        `Network State: ${audioRef.current?.networkState}`,
                                        `Duration: ${audioDuration}s, Current: ${audioCurrentTime}s`,
                                        `Active Error: ${JSON.stringify(audioPlaybackError)}`,
                                        `\n## Event Logs:\n` + audioNerdLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n')
                                    ].join('\n');
                                    navigator.clipboard.writeText(report);
                                    toast.success('Nerd Diagnostics Report copied to clipboard!');
                                }}
                                className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs border border-zinc-800 flex items-center gap-1.5 transition-all"
                            >
                                <Copy size={13} /> Copy Report
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

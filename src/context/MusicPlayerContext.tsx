'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
    Play, Pause, Volume2, VolumeX, Maximize, X,
    Shuffle, Repeat, SkipForward, SkipBack,
    Disc, Music, ListMusic, Download, ArrowDownToLine,
    Info, Mic2, Edit3, Search, Sparkles, Check,
    RefreshCw, ChevronDown, Sliders, Cast, Tv, Trash2, Plus,
    Image as ImageIcon, Guitar, Activity, Zap, Layers, Music2
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
    matchChordFromChromagram
} from '@/lib/chordAnalyzer';

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
    handleDownloadTrack: (track: MediaItem | null) => void;
    handleDownloadAlbum: (tracks: MediaItem[], albumName?: string) => void;
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

// ── Interactive Fretboard Diagram for Guitar & Ukulele ──
function FretboardDiagram({ chordName, instrument = 'guitar' }: { chordName: string; instrument?: InstrumentType }) {
    const diagram = getChordDiagram(chordName, instrument);
    const isUkulele = instrument === 'ukulele';
    const numStrings = isUkulele ? 4 : 6;
    const stringLabels = isUkulele ? ['G', 'C', 'E', 'A'] : ['E', 'A', 'D', 'G', 'B', 'e'];

    return (
        <div className="flex flex-col items-center justify-center bg-zinc-900/90 border border-zinc-800 p-3 rounded-2xl shadow-xl space-y-1 select-none">
            <div className="flex items-center justify-between w-full px-2">
                <span className="text-[11px] font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1">
                    {isUkulele ? '🪕 Ukulele' : '🎸 Guitar'}
                </span>
                {diagram.baseFret && diagram.baseFret > 1 && (
                    <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                        Fret {diagram.baseFret}
                    </span>
                )}
            </div>
            <svg viewBox="0 0 160 140" className="w-32 h-28">
                {/* Nut */}
                <rect x="25" y="20" width="110" height="4" fill="#f59e0b" rx="2" />
                {/* Frets */}
                {[0, 1, 2, 3, 4].map(fret => (
                    <line key={fret} x1="25" y1={24 + fret * 24} x2="135" y2={24 + fret * 24} stroke="#3f3f46" strokeWidth="2" />
                ))}
                {/* Strings */}
                {Array.from({ length: numStrings }).map((_, s) => {
                    const x = 30 + s * (100 / (numStrings - 1));
                    return (
                        <line key={s} x1={x} y1="24" x2={x} y2="120" stroke="#71717a" strokeWidth={isUkulele ? 2 : (s < 3 ? 2.5 : 1.5)} />
                    );
                })}
                {/* String open/mute markers & finger dots */}
                {diagram.frets.map((fret, s) => {
                    const x = 30 + s * (100 / (numStrings - 1));
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
                                <circle cx={x} cy={y} r="6.5" fill="#f59e0b" className="drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                                {diagram.fingers && diagram.fingers[s] ? (
                                    <text x={x} y={y + 3} textAnchor="middle" fill="#000" fontSize="8" fontWeight="black">{diagram.fingers[s]}</text>
                                ) : null}
                            </g>
                        );
                    }
                    return null;
                })}
            </svg>
            <div className="flex justify-between w-28 px-1 text-[9px] font-mono font-bold text-zinc-500">
                {stringLabels.map((note, i) => (
                    <span key={i}>{note}</span>
                ))}
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
    const [expandedSidePanel, setExpandedSidePanel] = useState<'lyrics' | 'chords' | 'queue' | 'specs'>('lyrics');
    const [showExpandedSidePanel, setShowExpandedSidePanel] = useState(true);
    const [isVinylView, setIsVinylView] = useState(true);

    // Musical Jam & Chords States
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

    useEffect(() => {
        if (showLyricsModal && activeLyricRef.current) {
            activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentLyricIndex, showLyricsModal]);

    useEffect(() => {
        if (isExpandedPlayerOpen && expandedActiveLyricRef.current) {
            expandedActiveLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentLyricIndex, isExpandedPlayerOpen, expandedSidePanel]);

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
    const handleDownloadTrack = async (track: MediaItem | null) => {
        const t = track || playingAudio;
        if (!t) return;
        toast.info(`Preparing download for "${t.title}"...`);

        try {
            const downloadUrl = `/api/theater/music/download?path=${encodeURIComponent(t.path || '')}&title=${encodeURIComponent(t.title || t.name)}&artist=${encodeURIComponent(t.artist || '')}&streamUrl=${encodeURIComponent(t.streamUrl || '')}&ext=${encodeURIComponent(t.extension || '')}&youtubeId=${encodeURIComponent(t.youtubeId || '')}`;
            
            const res = await fetch(downloadUrl);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || `Download failed (HTTP ${res.status})`);
                return;
            }

            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            const ext = (t.extension && t.extension !== 'STREAM' && t.extension !== 'AUDIO') ? t.extension.toLowerCase().replace('.', '') : 'mp3';
            a.download = `${t.artist ? `${t.artist} - ` : ''}${t.title || t.name}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
            toast.success(`Downloaded "${t.title}"!`);
        } catch (err: any) {
            toast.error(`Download failed: ${err.message}`);
        }
    };

    const handleDownloadAlbum = (tracks: MediaItem[], albumName?: string) => {
        if (!tracks.length) return;
        toast.success(`Starting download of ${tracks.length} tracks for album "${albumName || 'Album'}"...`);
        tracks.forEach((track, i) => {
            setTimeout(() => {
                handleDownloadTrack(track);
            }, i * 600);
        });
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

    const openCastPicker = (target: MediaItem) => {
        fetchPairedTvSessions();
        setIsCastPickerModalOpen(true);
    };

    const handleCastToDevice = async (sessionId: string, deviceName: string) => {
        if (!playingAudio) return;
        try {
            const res = await fetch('/api/theater/tv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    action: 'cast_media',
                    media: {
                        id: playingAudio.id,
                        title: playingAudio.title,
                        posterUrl: playingAudio.posterUrl,
                        streamUrl: playingAudio.streamUrl,
                        category: 'audio',
                        artist: playingAudio.artist,
                        album: playingAudio.album
                    }
                })
            });
            if (res.ok) {
                toast.success(`Casting "${playingAudio.title}" to ${deviceName}!`);
                setIsCastPickerModalOpen(false);
            } else {
                toast.error('Failed to cast to TV');
            }
        } catch {
            toast.error('Error connecting to Smart TV');
        }
    };

    const handleUnpairDevice = async (id: string, name: string) => {
        try {
            const res = await fetch(`/api/theater/tv?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok) {
                setPairedTvSessions(prev => prev.filter(s => s.id !== id));
                toast.success(`Unpaired ${name}`);
            }
        } catch {
            toast.error('Failed to unpair device');
        }
    };

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

    const togglePlayPause = () => {
        if (!audioRef.current) return;
        if (isAudioPlaying) {
            audioRef.current.pause();
            setIsAudioPlaying(false);
        } else {
            audioRef.current.play();
            setIsAudioPlaying(true);
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

    const handleVolumeChange = (v: number) => {
        setAudioVolume(v);
        setIsAudioMuted(v === 0);
        if (audioRef.current) {
            audioRef.current.volume = v;
            audioRef.current.muted = v === 0;
        }
    };

    const toggleMute = () => {
        if (!audioRef.current) return;
        if (isAudioMuted) {
            const nextVol = audioVolume > 0 ? audioVolume : 0.8;
            audioRef.current.muted = false;
            audioRef.current.volume = nextVol;
            setIsAudioMuted(false);
            setAudioVolume(nextVol);
        } else {
            audioRef.current.muted = true;
            setIsAudioMuted(true);
        }
    };

    const closePlayer = () => {
        if (audioRef.current) audioRef.current.pause();
        setPlayingAudio(null);
        setIsAudioPlaying(false);
        setIsExpandedPlayerOpen(false);
        setShowLyricsModal(false);
        setShowQueueDrawer(false);
    };

    // When playingAudio changes, load source, fetch lyrics and fetch chords
    useEffect(() => {
        if (playingAudio && audioRef.current) {
            audioRef.current.src = playingAudio.streamUrl;
            audioRef.current.play().catch(() => {});
            fetchLyrics(playingAudio);
            fetchChords(playingAudio);
        }
    }, [playingAudio]);

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
                handleDownloadTrack,
                handleDownloadAlbum
            }}
        >
            {/* Global Persistent Audio Element */}
            <audio
                ref={audioRef}
                preload="auto"
                onTimeUpdate={() => {
                    if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                    if (audioRef.current) setAudioDuration(audioRef.current.duration);
                }}
                onCanPlay={() => {
                    if (isAudioPlaying && audioRef.current?.paused) {
                        audioRef.current.play().catch(() => {});
                    }
                }}
                onEnded={nextTrack}
                onPlay={() => setIsAudioPlaying(true)}
                onPause={() => setIsAudioPlaying(false)}
                onError={() => {
                    const err = audioRef.current?.error;
                    console.error('Audio playback error:', err);
                    if (playingAudio && !playingAudio.streamUrl.includes('transcode=')) {
                        const separator = playingAudio.streamUrl.includes('?') ? '&' : '?';
                        const transcodeUrl = `${playingAudio.streamUrl}${separator}transcode=audio`;
                        if (audioRef.current) {
                            audioRef.current.src = transcodeUrl;
                            audioRef.current.play().catch(() => {
                                setIsAudioPlaying(false);
                            });
                        }
                    } else {
                        setIsAudioPlaying(false);
                        toast.error(`Unable to stream "${playingAudio?.title || 'Track'}"`);
                    }
                }}
            />

            {children}

            {/* ══════════════════════════════════════════════════════════════
               GLOBAL PERSISTENT MUSIC STUDIO BOTTOM BAR (ACROSS ALL PAGES)
               ══════════════════════════════════════════════════════════════ */}
            {playingAudio && (
                <div className="fixed bottom-20 sm:bottom-4 left-3 right-3 sm:left-4 sm:right-4 max-w-4xl mx-auto z-[180] bg-zinc-950/95 border border-zinc-800/90 backdrop-blur-2xl p-3 sm:p-4 px-4 sm:px-6 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl space-y-2 animate-in slide-in-from-bottom duration-300 select-none">
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                        {/* Track Artwork & Info (Click to Expand Studio Screen) */}
                        <div
                            onClick={() => setIsExpandedPlayerOpen(true)}
                            className="flex items-center gap-3 min-w-0 flex-1 sm:flex-initial sm:w-64 cursor-pointer group/art"
                            title="Click to open Expanded Player with Big Art & Synced Lyrics"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 relative shadow-md group-hover/art:scale-105 group-hover/art:border-amber-500/50 transition-all">
                                {playingAudio.posterUrl ? (
                                    <img src={playingAudio.posterUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <Music size={24} />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/art:opacity-100 flex items-center justify-center transition-opacity">
                                    <Maximize size={16} className="text-white" />
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-bold text-white text-sm sm:text-base truncate leading-snug group-hover/art:text-amber-400 transition-colors">{playingAudio.title}</h4>
                                <p className="text-xs text-zinc-400 truncate">{playingAudio.artist || playingAudio.folder || 'Artist'}</p>
                            </div>
                        </div>

                        {/* Center Playback Controls & Seekbar */}
                        <div className="flex-1 flex flex-col items-center space-y-1 max-w-lg">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setIsShuffle(!isShuffle)}
                                    className={`p-2 rounded-xl transition-colors ${isShuffle ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Shuffle Queue"
                                >
                                    <Shuffle size={16} />
                                </button>

                                <button
                                    onClick={prevTrack}
                                    className="p-2 text-zinc-400 hover:text-white transition-colors"
                                    title="Previous Track"
                                >
                                    <SkipBack size={18} />
                                </button>

                                <button
                                    onClick={togglePlayPause}
                                    className="w-11 h-11 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/20 transition-all scale-100 active:scale-95"
                                >
                                    {isAudioPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                                </button>

                                <button
                                    onClick={nextTrack}
                                    className="p-2 text-zinc-400 hover:text-white transition-colors"
                                    title="Next Track"
                                >
                                    <SkipForward size={18} />
                                </button>

                                <button
                                    onClick={() => setIsRepeat(!isRepeat)}
                                    className={`p-2 rounded-xl transition-colors ${isRepeat ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Repeat Queue"
                                >
                                    <Repeat size={16} />
                                </button>
                            </div>

                            {/* Seekbar */}
                            <div className="w-full flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                                <span>{formatTime(audioCurrentTime)}</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={audioDuration || 100}
                                    value={audioCurrentTime}
                                    onChange={e => seekTo(Number(e.target.value))}
                                    className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                                <span>{formatTime(audioDuration)}</span>
                            </div>
                        </div>

                        {/* Right Quick Actions: Grab, Lyrics, Download, Specs, Queue, Cast, Close */}
                        <div className="flex items-center gap-1 sm:gap-2 w-auto sm:w-72 justify-end shrink-0">
                            {playingAudio.youtubeId && (
                                <button
                                    onClick={() => handleGrabTrackToLibrary(playingAudio)}
                                    disabled={isGrabbingTrack}
                                    className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 text-xs font-bold transition-all"
                                    title="Grab Track to Local Music Library Folder"
                                >
                                    <ArrowDownToLine size={15} />
                                </button>
                            )}

                            {/* Karaoke / Live Lyrics */}
                            <button
                                onClick={() => setShowLyricsModal(true)}
                                className={`p-2 sm:p-2.5 rounded-xl border text-xs font-bold transition-all ${
                                    showLyricsModal ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40'
                                }`}
                                title="Karaoke Live Lyrics & Match Editor"
                            >
                                <Mic2 size={16} />
                            </button>

                            {/* Download Track to Local Machine */}
                            <button
                                onClick={() => handleDownloadTrack(playingAudio)}
                                className="p-2 sm:p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 text-xs font-bold transition-all"
                                title="Download Audio File to Local Machine"
                            >
                                <Download size={16} />
                            </button>

                            <button
                                onClick={() => fetchAudioSpecs(playingAudio)}
                                className="p-2 sm:p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 text-xs font-bold transition-all"
                                title="Audio Specs & Metadata (Stats for Audiophiles)"
                            >
                                <Info size={16} />
                            </button>

                            <button
                                onClick={() => setShowQueueDrawer(!showQueueDrawer)}
                                className={`p-2 sm:p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                                    showQueueDrawer ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                                title="Toggle Playback Queue"
                            >
                                <ListMusic size={16} />
                                <span className="hidden md:inline">Queue ({audioQueue.length})</span>
                            </button>

                            <button
                                onClick={() => openCastPicker(playingAudio)}
                                className="p-2 sm:p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 text-xs font-bold"
                                title="Cast Audio to Smart TV"
                            >
                                <Cast size={15} />
                            </button>

                            <button
                                onClick={closePlayer}
                                className="p-1.5 sm:p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                                title="Dismiss Player"
                            >
                                <X size={18} />
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
                <div className="fixed inset-0 z-[275] bg-black/95 backdrop-blur-3xl flex flex-col p-4 sm:p-8 animate-in fade-in duration-200 overflow-hidden select-none">
                    {/* Ambient Blurred Background Art */}
                    {playingAudio.posterUrl && (
                        <div
                            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-15 pointer-events-none scale-125"
                            style={{ backgroundImage: `url(${playingAudio.posterUrl})` }}
                        />
                    )}

                    {/* Top Bar: Minimize, Title, Header Actions */}
                    <div className="relative z-10 flex items-center justify-between gap-4 pb-4 border-b border-zinc-900/80 shrink-0">
                        <button
                            onClick={() => setIsExpandedPlayerOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-black uppercase tracking-wider transition-all"
                        >
                            <ChevronDown size={18} /> Minimize
                        </button>

                        <div className="text-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                                Now Playing Studio
                            </span>
                            <h3 className="text-sm font-bold text-white max-w-xs sm:max-w-md truncate">
                                {playingAudio.album || playingAudio.folder || 'Theater Audio'}
                            </h3>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Toggle Right Side Panel Button */}
                            <button
                                onClick={() => setShowExpandedSidePanel(!showExpandedSidePanel)}
                                className={`px-3.5 py-2 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                                    showExpandedSidePanel
                                        ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                                }`}
                                title={showExpandedSidePanel ? 'Hide side panel to focus on artwork' : 'Show lyrics, queue & specs side panel'}
                            >
                                <Sliders size={14} />
                                <span className="hidden sm:inline">{showExpandedSidePanel ? 'Hide Panel' : 'Show Panel'}</span>
                            </button>

                            <button
                                onClick={() => setIsExpandedPlayerOpen(false)}
                                className="p-2 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Main Stage */}
                    <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-0 py-4 overflow-y-auto custom-scrollbar">
                        {/* Left / Center: Big Artwork & Full Controls */}
                        <div className={`${showExpandedSidePanel ? 'lg:col-span-6 xl:col-span-5' : 'lg:col-span-8 lg:col-start-3'} flex flex-col items-center justify-center space-y-5 mx-auto w-full max-w-lg transition-all`}>
                            {/* View Mode Toggle: Vinyl Turntable vs Normal Cover Art */}
                            <div className="flex items-center gap-1.5 bg-zinc-950/80 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner backdrop-blur-md">
                                <button
                                    onClick={() => setIsVinylView(true)}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                        isVinylView
                                            ? 'bg-amber-500 text-black shadow-md'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                    }`}
                                    title="Switch to Vinyl Turntable Player Mode"
                                >
                                    <Disc size={15} /> Vinyl Player
                                </button>
                                <button
                                    onClick={() => setIsVinylView(false)}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                        !isVinylView
                                            ? 'bg-zinc-800 text-white border border-zinc-700 shadow-md'
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                    }`}
                                    title="Switch to Standard Cover Artwork View"
                                >
                                    <ImageIcon size={15} /> Normal Art
                                </button>
                            </div>

                            {/* Main Artwork Stage: Vinyl Player vs Normal Cover Art */}
                            {isVinylView ? (
                                /* ── Vinyl Turntable Player Representation ── */
                                <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[420px] aspect-[1.12/1] rounded-[2.5rem] bg-gradient-to-b from-zinc-800 via-zinc-900 to-[#09090b] border-2 border-zinc-700/80 p-4 sm:p-5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_2px_rgba(255,255,255,0.15)] flex items-center justify-center select-none overflow-hidden group">
                                    {/* Turntable Plinth Metallic Inset */}
                                    <div className="absolute inset-2 sm:inset-3 rounded-[2rem] bg-gradient-to-b from-[#18181b] to-[#0c0c0e] border border-white/5 pointer-events-none shadow-inner" />

                                    {/* Top-Left: Direct Drive Specs & Power / Strobe LED */}
                                    <div className="absolute top-4 left-5 sm:top-5 sm:left-6 z-20 flex items-center gap-2 pointer-events-none">
                                        <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                                            isAudioPlaying
                                                ? 'bg-emerald-400 shadow-[0_0_10px_#34d399] ring-2 ring-emerald-500/30'
                                                : 'bg-zinc-600'
                                        }`} />
                                        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                                            <span className="text-amber-400">33⅓ RPM</span> • DIRECT DRIVE
                                        </div>
                                    </div>

                                    {/* Bottom-Right: Hi-Fi Badge */}
                                    <div className="absolute bottom-4 right-5 sm:bottom-5 sm:right-6 z-20 pointer-events-none">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-950/80 px-2 py-0.5 rounded-md border border-zinc-800">
                                            HI-FI AUDIO
                                        </span>
                                    </div>

                                    {/* Rotating Turntable Platter & Vinyl Disc */}
                                    <div className="relative w-52 h-52 sm:w-64 sm:h-64 md:w-72 md:h-72 -translate-x-3 sm:-translate-x-4 flex items-center justify-center">
                                        {/* Turntable Platter (Brushed rim) */}
                                        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-600 p-1.5 shadow-2xl flex items-center justify-center border border-zinc-600/50">
                                            {/* Rubber Slipmat */}
                                            <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center shadow-inner">
                                                {/* ── Rotating Vinyl Disc with Cropped Artwork ── */}
                                                <div
                                                    className="relative w-[96%] h-[96%] rounded-full bg-black shadow-2xl flex items-center justify-center overflow-hidden"
                                                    style={{
                                                        animation: 'vinyl-spin 8s linear infinite',
                                                        animationPlayState: isAudioPlaying ? 'running' : 'paused'
                                                    }}
                                                >
                                                    {/* Vinyl Outer Grooves / Concentric Rings */}
                                                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#000000_30%,_#18181b_31%,_#09090b_45%,_#1f1f23_46%,_#000000_65%,_#18181b_66%,_#000000_100%)] opacity-90 pointer-events-none" />
                                                    
                                                    {/* Subtle Vinyl Grooves lines */}
                                                    <div className="absolute inset-2 rounded-full border border-white/5 pointer-events-none" />
                                                    <div className="absolute inset-5 rounded-full border border-white/5 pointer-events-none" />
                                                    <div className="absolute inset-8 rounded-full border border-white/5 pointer-events-none" />
                                                    <div className="absolute inset-12 rounded-full border border-white/5 pointer-events-none" />
                                                    
                                                    {/* Conic Sheen Reflection */}
                                                    <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.08)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.08)_225deg,transparent_270deg)] pointer-events-none" />

                                                    {/* Center Vinyl Label with Cropped Album Art */}
                                                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-amber-500/60 shadow-2xl flex items-center justify-center z-10">
                                                        {playingAudio.posterUrl ? (
                                                            <img
                                                                src={playingAudio.posterUrl}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-black font-black text-xs text-center p-2">
                                                                {playingAudio.title}
                                                            </div>
                                                        )}
                                                        {/* Center Ring & Spindle Hole */}
                                                        <div className="absolute w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-950 border-2 border-zinc-400 flex items-center justify-center shadow-inner z-20">
                                                            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 shadow-md" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Mechanical Tonearm Assembly (Pivots smoothly on play/pause) ── */}
                                    <div className="absolute top-4 right-5 sm:top-5 sm:right-6 md:top-6 md:right-7 z-30 pointer-events-none">
                                        {/* Tonearm Gimbal / Base */}
                                        <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-950 border-2 border-zinc-500 shadow-2xl flex items-center justify-center">
                                            {/* Chrome Pivot Cap */}
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-zinc-300 via-white to-zinc-400 border border-zinc-400 shadow-md flex items-center justify-center">
                                                <div className="w-2 h-2 rounded-full bg-zinc-900" />
                                            </div>

                                            {/* Tonearm Wand (Arm & Headshell) */}
                                            <div
                                                className="absolute top-5 left-5 w-1.5 origin-top transition-transform duration-700 ease-in-out"
                                                style={{
                                                    transform: isAudioPlaying ? 'rotate(27deg)' : 'rotate(0deg)'
                                                }}
                                            >
                                                {/* Metallic Chrome Arm */}
                                                <div className="w-1.5 h-36 sm:h-44 md:h-48 bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-500 rounded-full shadow-lg relative">
                                                    {/* Headshell / Stylus Cartridge */}
                                                    <div className="absolute -bottom-2 -left-2 w-5 h-8 bg-gradient-to-b from-amber-400 to-amber-600 rounded-sm shadow-md flex items-center justify-center border border-amber-300">
                                                        {/* Stylus Needle Indicator */}
                                                        <div className="w-1 h-2 bg-white rounded-full shadow-sm" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tonearm Rest / Cradle */}
                                        <div className="absolute top-28 sm:top-36 right-4 w-3 h-4 bg-zinc-700 border border-zinc-600 rounded-sm shadow-inner" />
                                    </div>
                                </div>
                            ) : (
                                /* ── Normal High-Res Cover Artwork View (With No Other Effect) ── */
                                <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-[2.5rem] bg-zinc-900 border-2 border-zinc-800/80 overflow-hidden shadow-2xl flex items-center justify-center">
                                    {playingAudio.posterUrl ? (
                                        <img src={playingAudio.posterUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Disc size={96} className="text-amber-400" />
                                    )}
                                </div>
                            )}

                            {/* Track Info & Audiophile Badges */}
                            <div className="text-center space-y-2 w-full px-4">
                                <div className="flex items-center justify-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase tracking-wider">
                                        {playingAudio.extension?.toUpperCase() === 'FLAC' ? 'FLAC 24-bit Lossless' : `${playingAudio.extension?.toUpperCase() || 'Audio'} • High-Res`}
                                    </span>
                                    {playingAudio.album && (
                                        <span className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-black uppercase">
                                            {playingAudio.album}
                                        </span>
                                    )}
                                </div>

                                <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight truncate">
                                    {playingAudio.title}
                                </h2>
                                <p className="text-base font-bold text-amber-300 truncate">
                                    {playingAudio.artist || playingAudio.folder || 'Artist'}
                                </p>
                            </div>

                            {/* Seekbar with Live Timestamps */}
                            <div className="w-full space-y-2 px-2">
                                <input
                                    type="range"
                                    min={0}
                                    max={audioDuration || 100}
                                    value={audioCurrentTime}
                                    onChange={e => seekTo(Number(e.target.value))}
                                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                                <div className="flex justify-between text-xs font-mono text-zinc-500 font-bold">
                                    <span>{formatTime(audioCurrentTime)}</span>
                                    <span>{formatTime(audioDuration)}</span>
                                </div>
                            </div>

                            {/* Master Playback Controls */}
                            <div className="flex items-center justify-center gap-5 sm:gap-7 w-full">
                                <button
                                    onClick={() => setIsShuffle(!isShuffle)}
                                    className={`p-3 rounded-2xl transition-all ${isShuffle ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Shuffle"
                                >
                                    <Shuffle size={20} />
                                </button>

                                <button
                                    onClick={prevTrack}
                                    className="p-3 rounded-2xl text-zinc-300 hover:text-white hover:bg-zinc-900 transition-all"
                                    title="Previous Track"
                                >
                                    <SkipBack size={24} />
                                </button>

                                <button
                                    onClick={togglePlayPause}
                                    className="w-16 h-16 rounded-3xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-xl shadow-amber-500/30 transition-all scale-100 active:scale-95"
                                >
                                    {isAudioPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
                                </button>

                                <button
                                    onClick={nextTrack}
                                    className="p-3 rounded-2xl text-zinc-300 hover:text-white hover:bg-zinc-900 transition-all"
                                    title="Next Track"
                                >
                                    <SkipForward size={24} />
                                </button>

                                <button
                                    onClick={() => setIsRepeat(!isRepeat)}
                                    className={`p-3 rounded-2xl transition-all ${isRepeat ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-500 hover:text-white'}`}
                                    title="Repeat"
                                >
                                    <Repeat size={20} />
                                </button>
                            </div>

                            {/* Volume Slider & Quick Bottom Action Buttons */}
                            <div className="flex flex-wrap items-center justify-between gap-4 w-full pt-2 border-t border-zinc-900/90 px-2">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={toggleMute}
                                        className="text-zinc-500 hover:text-white transition-colors"
                                        title={isAudioMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {isAudioMuted || audioVolume === 0 ? <VolumeX size={18} className="text-red-400" /> : <Volume2 size={18} />}
                                    </button>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={isAudioMuted ? 0 : audioVolume}
                                        onChange={e => handleVolumeChange(Number(e.target.value))}
                                        className="w-24 sm:w-28 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDownloadTrack(playingAudio)}
                                        className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 border border-zinc-800 text-xs font-bold transition-all flex items-center gap-1.5"
                                        title="Download Track to Local Machine"
                                    >
                                        <Download size={14} /> Download
                                    </button>
                                    <button
                                        onClick={() => fetchAudioSpecs(playingAudio)}
                                        className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 border border-zinc-800 text-xs font-bold transition-all"
                                        title="Stats for Audiophiles"
                                    >
                                        <Info size={16} />
                                    </button>
                                    <button
                                        onClick={() => openCastPicker(playingAudio)}
                                        className="p-2 rounded-xl bg-purple-500/15 hover:bg-purple-500 text-purple-400 hover:text-white border border-purple-500/30 text-xs font-bold transition-all"
                                        title="Cast to Smart TV"
                                    >
                                        <Cast size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Toggleable Panel (Lyrics / Queue / Specs) */}
                        {showExpandedSidePanel && (
                            <div className="lg:col-span-6 xl:col-span-7 h-full flex flex-col bg-zinc-950/80 border border-zinc-900 rounded-[2.5rem] p-6 shadow-2xl space-y-4 min-h-[420px] max-h-[75vh] overflow-hidden">
                                {/* Panel Tab Selectors: Lyrics | Jam Stage | Queue | Specs */}
                                <div className="flex items-center justify-between pb-3 border-b border-zinc-900 shrink-0">
                                    <div className="flex bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800 flex-wrap gap-1">
                                        <button
                                            onClick={() => setExpandedSidePanel('lyrics')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                expandedSidePanel === 'lyrics' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <Mic2 size={13} /> Lyrics
                                        </button>
                                        <button
                                            onClick={() => setExpandedSidePanel('chords')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                expandedSidePanel === 'chords' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <Guitar size={13} /> Jam Stage <span className="text-[9px] px-1 py-0.2 rounded bg-black/30 font-mono">🧪</span>
                                        </button>
                                        <button
                                            onClick={() => setExpandedSidePanel('queue')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                expandedSidePanel === 'queue' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <ListMusic size={13} /> Queue ({audioQueue.length})
                                        </button>
                                        <button
                                            onClick={() => setExpandedSidePanel('specs')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                expandedSidePanel === 'specs' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <Info size={13} /> Specs
                                        </button>
                                    </div>

                                    {expandedSidePanel === 'lyrics' && (
                                        <div className="flex items-center gap-2">
                                            {lyricsData?.isSynced && (
                                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase flex items-center gap-1">
                                                    <Sparkles size={10} /> Synced
                                                </span>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setLyricsSearchQuery(`${playingAudio.artist || ''} ${playingAudio.title || ''}`.trim());
                                                    setCustomLrcText(lyricsData?.syncedLyrics || lyricsData?.plainLyrics || '');
                                                    setIsLyricsEditorOpen(true);
                                                }}
                                                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] font-bold flex items-center gap-1 transition-all"
                                                title="Edit lyrics match"
                                            >
                                                <Edit3 size={11} /> Edit Match
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* 1. Lyrics Tab Content */}
                                {expandedSidePanel === 'lyrics' && (
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col">
                                        {lyricsLoading ? (
                                            <div className="flex flex-col items-center justify-center py-20 gap-3 m-auto">
                                                <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
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
                                                    className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
                                                >
                                                    <Search size={14} /> Search / Add Lyrics
                                                </button>
                                            </div>
                                        ) : lyricsData.isSynced ? (
                                            <div className="space-y-6 py-20 text-center">
                                                {lyricsData.lines.map((line, idx) => {
                                                    const isActive = idx === currentLyricIndex;
                                                    const isPast = currentLyricIndex !== -1 && idx < currentLyricIndex;
                                                    return (
                                                        <div
                                                            key={idx}
                                                            ref={isActive ? expandedActiveLyricRef : null}
                                                            onClick={() => seekTo(line.time)}
                                                            className={`cursor-pointer transition-all duration-300 py-1 px-4 rounded-2xl inline-block max-w-xl ${
                                                                isActive
                                                                    ? 'text-2xl sm:text-3xl font-black text-amber-300 drop-shadow-[0_0_30px_rgba(251,191,36,0.6)] scale-105'
                                                                    : isPast
                                                                    ? 'text-base font-bold text-zinc-600 hover:text-zinc-400'
                                                                    : 'text-base font-bold text-zinc-400 hover:text-zinc-200'
                                                            }`}
                                                        >
                                                            {line.text}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center whitespace-pre-line text-base font-semibold text-zinc-300 leading-relaxed max-w-lg mx-auto">
                                                {lyricsData.plainLyrics || lyricsData.lines.map(l => l.text).join('\n')}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 2. Musical Jam Stage Tab Content */}
                                {expandedSidePanel === 'chords' && (
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-4 flex flex-col">
                                        {/* Top Musician Controls Bar */}
                                        <div className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                                            {/* Instrument Switcher */}
                                            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                                                <button
                                                    onClick={() => setJamInstrument('guitar')}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1 ${
                                                        jamInstrument === 'guitar' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Guitar size={12} /> Guitar
                                                </button>
                                                <button
                                                    onClick={() => setJamInstrument('ukulele')}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1 ${
                                                        jamInstrument === 'ukulele' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                                                    }`}
                                                >
                                                    <Music2 size={12} /> Ukulele
                                                </button>
                                            </div>

                                            {/* Difficulty Selector */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-black uppercase text-zinc-500">Mode:</span>
                                                <div className="flex bg-zinc-950 p-0.5 rounded-xl border border-zinc-800 text-[10px] font-black uppercase">
                                                    <button
                                                        onClick={() => setJamDifficulty('beginner')}
                                                        className={`px-2 py-1 rounded-lg transition-all ${
                                                            jamDifficulty === 'beginner' ? 'bg-emerald-500 text-black font-black' : 'text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                        title="Simple open chords (triads)"
                                                    >
                                                        Beginner
                                                    </button>
                                                    <button
                                                        onClick={() => setJamDifficulty('intermediate')}
                                                        className={`px-2 py-1 rounded-lg transition-all ${
                                                            jamDifficulty === 'intermediate' ? 'bg-amber-500 text-black font-black' : 'text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                        title="7ths & suspended chords"
                                                    >
                                                        Medium
                                                    </button>
                                                    <button
                                                        onClick={() => setJamDifficulty('advanced')}
                                                        className={`px-2 py-1 rounded-lg transition-all ${
                                                            jamDifficulty === 'advanced' ? 'bg-purple-500 text-white font-black' : 'text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                        title="Full jazz voicings & alterations"
                                                    >
                                                        Pro
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Transpose Controls */}
                                            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                                                <button
                                                    onClick={() => setJamTranspose(prev => prev - 1)}
                                                    className="w-5 h-5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs flex items-center justify-center transition-all"
                                                    title="Transpose Down (-1 semitone)"
                                                >
                                                    -
                                                </button>
                                                <span className="text-[11px] font-mono font-bold text-amber-300 px-1">
                                                    {jamTranspose > 0 ? `+${jamTranspose}` : jamTranspose}st
                                                </span>
                                                <button
                                                    onClick={() => setJamTranspose(prev => prev + 1)}
                                                    className="w-5 h-5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs flex items-center justify-center transition-all"
                                                    title="Transpose Up (+1 semitone)"
                                                >
                                                    +
                                                </button>
                                                {jamTranspose !== 0 && (
                                                    <button
                                                        onClick={() => setJamTranspose(0)}
                                                        className="text-[9px] text-zinc-500 hover:text-amber-400 font-bold px-1"
                                                        title="Reset Transpose"
                                                    >
                                                        0
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Center Stage Hero: Big Active Chord + Fretboard */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                                            {/* Active Chord Big Card */}
                                            <div className="p-4 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-3xl flex flex-col justify-between space-y-3 relative overflow-hidden shadow-xl">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-black uppercase text-zinc-500 tracking-wider flex items-center gap-1">
                                                        <Activity size={13} className="text-amber-400 animate-pulse" /> Active Chord
                                                    </span>
                                                    {activeChordEvent?.isLiveDsp ? (
                                                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold uppercase">
                                                            🧪 DSP AI Live
                                                        </span>
                                                    ) : chordsData?.source ? (
                                                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                                                            {chordsData.source}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="text-center py-2">
                                                    <h2 className="text-5xl sm:text-6xl font-black text-amber-300 tracking-tight drop-shadow-[0_0_25px_rgba(251,191,36,0.6)]">
                                                        {activeChordEvent?.displayChord || 'C'}
                                                    </h2>
                                                    {activeChordEvent?.rawChord && activeChordEvent.rawChord !== activeChordEvent.displayChord && (
                                                        <span className="text-[10px] text-zinc-500 font-mono block mt-1">
                                                            Original: {activeChordEvent.rawChord} (Simplified)
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Next Chord Countdown */}
                                                <div className="p-2 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 flex items-center justify-between text-xs">
                                                    <span className="text-zinc-500 font-bold text-[11px]">Next:</span>
                                                    {activeChordEvent?.nextChord ? (
                                                        <div className="flex items-center gap-2 font-mono">
                                                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-black text-xs border border-amber-500/30">
                                                                {activeChordEvent.nextChord}
                                                            </span>
                                                            <span className="text-zinc-400 font-bold text-[11px]">in {activeChordEvent.nextInSeconds}s</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-zinc-600 font-medium text-[11px]">Holding chord</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Interactive Fretboard Visualizer */}
                                            <FretboardDiagram
                                                chordName={activeChordEvent?.displayChord || 'C'}
                                                instrument={jamInstrument}
                                            />
                                        </div>

                                        {/* Real-time 12-Bin Chromagram Harmonic Deconvolution Visualizer */}
                                        <ChromagramVisualizer chroma={liveChromaEnergy} />

                                        {/* Synced Lyrics with Chords Row */}
                                        <div className="space-y-2 pt-1 flex-1 flex flex-col min-h-0">
                                            <div className="flex items-center justify-between px-1 shrink-0">
                                                <span className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                                                    <Mic2 size={13} className="text-amber-400" /> Sing-Along Sheet
                                                </span>
                                                <span className="text-[10px] text-zinc-500 font-bold">Click any line to seek</span>
                                            </div>

                                            <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                                                {lyricsData?.lines && lyricsData.lines.length > 0 ? (
                                                    lyricsData.lines.map((line, idx) => {
                                                        const isActive = idx === currentLyricIndex;
                                                        const lineChords = getChordsForLyricLine(line.time, lyricsData.lines[idx + 1]?.time);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                onClick={() => seekTo(line.time)}
                                                                className={`p-2.5 rounded-2xl transition-all cursor-pointer border ${
                                                                    isActive
                                                                        ? 'bg-amber-500/15 border-amber-500/40 shadow-lg scale-[1.01]'
                                                                        : 'bg-zinc-900/40 border-zinc-900 hover:bg-zinc-900/80'
                                                                }`}
                                                            >
                                                                {/* Chords row above text */}
                                                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                                                    {lineChords.map((ch, ci) => (
                                                                        <span
                                                                            key={ci}
                                                                            className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono tracking-wider shadow-sm ${
                                                                                isActive
                                                                                    ? 'bg-amber-400 text-black drop-shadow-[0_0_8px_rgba(251,191,36,0.8)] scale-105'
                                                                                    : 'bg-zinc-800 text-amber-300 border border-zinc-700'
                                                                            }`}
                                                                        >
                                                                            {ch}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                {/* Lyric text */}
                                                                <p className={`font-bold transition-colors ${
                                                                    isActive ? 'text-white text-base' : 'text-zinc-400 text-xs'
                                                                }`}>
                                                                    {line.text}
                                                                </p>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="p-4 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800/60 space-y-1">
                                                        <p className="text-xs text-zinc-400 font-bold">No synced lyrics available for sing-along overlay.</p>
                                                        <p className="text-[10px] text-zinc-600">The chords above are analyzed live in real-time.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 3. Queue Tab Content */}
                                {expandedSidePanel === 'queue' && (
                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
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
                                                    className={`p-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border ${
                                                        isCurrent
                                                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm'
                                                            : 'bg-zinc-900/40 border-zinc-900 text-zinc-300 hover:bg-zinc-900/80 hover:text-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span className="w-6 text-zinc-600 font-mono font-bold">{i + 1}</span>
                                                        <div className="truncate">
                                                            <p className="truncate font-bold text-white">{track.title}</p>
                                                            <span className="text-[11px] text-zinc-500">{track.artist || 'Artist'}</span>
                                                        </div>
                                                    </div>
                                                    {isCurrent && <Volume2 size={16} className="text-amber-400 shrink-0 animate-pulse" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* 3. Specs Tab Content */}
                                {expandedSidePanel === 'specs' && (
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-1">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">Codec &amp; Format</span>
                                                <span className="font-bold text-white">{playingAudio.extension?.toUpperCase() || 'Audio'}</span>
                                            </div>
                                            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-1">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">Quality Type</span>
                                                <span className="font-bold text-amber-400">{playingAudio.extension?.toLowerCase() === 'flac' ? '24-bit Lossless' : 'High-Res Audio'}</span>
                                            </div>
                                            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-1">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">File Size</span>
                                                <span className="font-bold text-white">{formatBytes(playingAudio.sizeBytes)}</span>
                                            </div>
                                            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-1">
                                                <span className="text-[10px] font-black uppercase text-zinc-500 block">Channels</span>
                                                <span className="font-bold text-white">Stereo (2.0)</span>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800 text-xs space-y-1">
                                            <span className="text-[10px] font-black uppercase text-zinc-500 block">Path / Source</span>
                                            <p className="font-mono text-[11px] text-zinc-400 break-all">{playingAudio.path || playingAudio.streamUrl}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               KARAOKE LIVE LYRICS & STUDIO MODAL (STANDALONE)
               ══════════════════════════════════════════════════════════════ */}
            {showLyricsModal && playingAudio && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
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
                                    <p className="text-xs text-zinc-400 font-semibold truncate">{playingAudio.artist || 'Unknown Artist'} • {playingAudio.album || 'Single'}</p>
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

                        <div className="flex-1 min-h-[350px] max-h-[55vh] overflow-y-auto custom-scrollbar p-2 relative flex flex-col">
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
                <div className="fixed inset-0 z-[280] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
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

                        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                            <button
                                onClick={() => setEditorTab('search')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    editorTab === 'search' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Search LRCLib
                            </button>
                            <button
                                onClick={() => setEditorTab('custom')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    editorTab === 'custom' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Paste Custom LRC / Text
                            </button>
                        </div>

                        {editorTab === 'search' ? (
                            <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g. Queen Bohemian Rhapsody"
                                        value={lyricsSearchQuery}
                                        onChange={e => setLyricsSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchLyrics(lyricsSearchQuery)}
                                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white outline-none focus:border-amber-500 font-medium"
                                    />
                                    <button
                                        onClick={() => handleSearchLyrics(lyricsSearchQuery)}
                                        disabled={lyricsSearchLoading}
                                        className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider shrink-0 transition-all flex items-center gap-1.5 disabled:opacity-60"
                                    >
                                        {lyricsSearchLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                                        Search
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[220px] max-h-[300px]">
                                    {lyricsSearchLoading ? (
                                        <div className="flex items-center justify-center py-12 gap-2 text-xs text-zinc-500 font-bold">
                                            <RefreshCw size={16} className="animate-spin text-amber-400" /> Searching LRCLib...
                                        </div>
                                    ) : lyricsSearchResults.length === 0 ? (
                                        <div className="text-center py-12 text-xs text-zinc-600">
                                            Enter artist and title above to search for lyrics matches.
                                        </div>
                                    ) : (
                                        lyricsSearchResults.map((cand) => (
                                            <div
                                                key={cand.id}
                                                className="p-3.5 bg-zinc-950 border border-zinc-900 hover:border-amber-500/40 rounded-2xl transition-all flex items-center justify-between gap-3 text-xs"
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white truncate">{cand.trackName}</span>
                                                        {cand.hasSyncedLyrics && (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-black uppercase">Synced</span>
                                                        )}
                                                    </div>
                                                    <p className="text-zinc-500 text-[11px] truncate">{cand.artistName} • {cand.albumName || 'Album'}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleApplyLyricsMatch(cand)}
                                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider shrink-0 transition-all flex items-center gap-1"
                                                >
                                                    <Check size={13} /> Apply Match
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
                                    placeholder="Paste [00:12.34] Synced LRC timestamps or plain text lyrics here..."
                                    rows={10}
                                    className="w-full flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-xs font-mono text-zinc-200 outline-none focus:border-amber-500 resize-none custom-scrollbar"
                                />
                                <button
                                    onClick={handleSaveCustomLyrics}
                                    disabled={isSavingLyrics || !customLrcText.trim()}
                                    className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSavingLyrics ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                                    Save &amp; Apply Lyrics
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
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
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
               CAST PICKER MODAL (SMART TVS)
               ══════════════════════════════════════════════════════════════ */}
            {isCastPickerModalOpen && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl relative">
                        <button
                            onClick={() => setIsCastPickerModalOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="p-3.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-2xl">
                                <Cast size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Cast to Smart TV</h3>
                                <p className="text-xs text-zinc-500 font-medium">Select a paired screen to play audio</p>
                            </div>
                        </div>

                        {loadingPairedTvs ? (
                            <div className="flex items-center justify-center py-12 gap-2 text-xs text-zinc-500 font-bold">
                                <RefreshCw size={16} className="animate-spin text-purple-400" /> Scanning for TVs...
                            </div>
                        ) : pairedTvSessions.length === 0 ? (
                            <div className="text-center py-8 space-y-4">
                                <Tv size={36} className="mx-auto text-zinc-700" />
                                <div>
                                    <p className="text-sm font-bold text-white">No paired Smart TVs found</p>
                                    <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                                        Open Schedulearr TV App on your Smart TV or browser and enter pairing code.
                                    </p>
                                </div>
                            </div>
                        ) : (
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
                        )}
                    </div>
                </div>
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

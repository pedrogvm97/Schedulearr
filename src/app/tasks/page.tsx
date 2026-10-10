'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    Activity, Play, Pause, RefreshCw, Tv, BookOpen, Download,
    ShieldCheck, Sparkles, Clock, CheckCircle2, AlertCircle,
    Radio, Trash2, ExternalLink, Cpu, Layers, Mic2, Image as ImageIcon,
    FileText, Square
} from 'lucide-react';
import { toast } from 'sonner';
import { useMusicPlayer } from '@/context/MusicPlayerContext';

export default function TasksPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);

    const { playingAudio, isAudioPlaying, openExpandedPlayer, togglePlayPause } = useMusicPlayer();

    const fetchTasks = useCallback(async (silent = false) => {
        if (!silent) setRefreshing(true);
        try {
            const res = await fetch('/api/tasks', { cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (err) {
            console.error('Failed to load tasks:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(() => fetchTasks(true), 3500);
        return () => clearInterval(interval);
    }, [fetchTasks]);

    const runAction = async (action: string, extra: Record<string, any> = {}) => {
        setBusyAction(action);
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...extra })
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json.error || 'Action failed');
            }
            toast.success(json.message || 'Task updated');
            await fetchTasks(true);
        } catch (err: any) {
            toast.error(err.message || 'Action failed');
        } finally {
            setBusyAction(null);
        }
    };

    const studioStatus = data?.audiobookStudio?.status;
    const studioConfig = data?.audiobookStudio?.config;
    const queueBreakdown = data?.audiobookStudio?.queueBreakdown;
    const queuedBooks = data?.audiobookStudio?.queuedBooks || [];
    const studioHistory = data?.audiobookStudio?.history || [];
    const liveStreams = data?.liveStreams || [];
    const epgSyncs = data?.epgSyncs || [];
    const dvrActive = data?.dvr?.active || [];
    const dvrScheduled = data?.dvr?.scheduled || [];
    const dvrRecent = data?.dvr?.recent || [];
    const activeTransfers = data?.transfers?.active || [];
    const upcomingPipelines = data?.upcomingPipelines || [];

    const totalActiveCount = (data?.activeCount || 0) + (playingAudio ? 1 : 0);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 pb-28">
            {/* ── Top Header & Server Daemon Persistence Guarantee Banner ── */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/10">
                            <Activity size={32} className={totalActiveCount > 0 ? 'animate-pulse' : ''} />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                                    Server Tasks &amp; Pipelines
                                </h1>
                                <span className={`px-3.5 py-1 rounded-xl text-sm font-black uppercase tracking-wider border ${
                                    totalActiveCount > 0
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}>
                                    {totalActiveCount} Active Now
                                </span>
                                {(data?.queuedCount || 0) > 0 && (
                                    <span className="px-3.5 py-1 rounded-xl text-sm font-black uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                        {data.queuedCount} Queued
                                    </span>
                                )}
                            </div>
                            <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                Live command center for Now Playing streams, Live TV DVR recordings, Audiobook Studio AI queues (transcriptions, story illustrations, narrator voices), and upcoming background pipelines.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 flex-wrap">
                        <button
                            onClick={() => fetchTasks(false)}
                            disabled={refreshing}
                            title="Refresh all active server tasks and queue telemetry"
                            className="px-5 py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 font-black text-base flex items-center gap-2.5 transition-all cursor-pointer active:scale-95"
                        >
                            <RefreshCw size={20} className={refreshing ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>

                {/* Persistent Server Daemon Guarantee Box */}
                <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <ShieldCheck size={28} className="text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <h2 className="text-lg font-black text-emerald-200">
                                100% Background Server Daemon — Safe to Close Any Menu or Tab
                            </h2>
                            <p className="text-base text-emerald-100/80 leading-relaxed">
                                Closing the Audiobook Studio window, leaving the Live TV player, switching pages, or closing your browser tab completely <strong>never stops or cancels</strong> background tasks. All transcriptions, story illustrations, narrator voice files, EPG syncs, and DVR recordings run inside the persistent server process.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 1. NOW PLAYING & ACTIVE LIVE STREAMS ── */}
            <section className="bg-zinc-950/90 border border-zinc-800/90 rounded-3xl p-6 sm:p-7 space-y-5 shadow-xl">
                <div className="flex items-center justify-between gap-4 flex-wrap border-b border-zinc-800/80 pb-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                            <Play size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-white">
                                Now Playing &amp; Live Stream Hubs
                            </h2>
                            <p className="text-sm sm:text-base text-zinc-400">
                                Active browser audio/book playback and shared single-connection IPTV stream hubs
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/theater"
                        title="Open Theater Mode to watch Live TV or listen to Audiobooks"
                        className="px-5 py-3 rounded-2xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 font-black text-base flex items-center gap-2.5 transition-all"
                    >
                        <Tv size={20} />
                        <span>Theater</span>
                    </Link>
                </div>

                {!playingAudio && liveStreams.length === 0 && epgSyncs.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/70 text-center space-y-2">
                        <p className="text-lg font-bold text-zinc-300">No active media streams or EPG syncs running right now</p>
                        <p className="text-base text-zinc-500">Start an Audiobook, Music track, or Live TV channel in Theater to see live stream telemetry here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {playingAudio && (
                            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black text-xs font-black uppercase">
                                            {playingAudio.isAudiobook ? 'Reading Audiobook' : 'Playing Audio'}
                                        </span>
                                        <span className="text-sm font-bold text-amber-300">
                                            {isAudioPlaying ? 'Playing' : 'Paused'}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-black text-white line-clamp-2">{playingAudio.title}</h3>
                                    {playingAudio.artist && (
                                        <p className="text-base text-zinc-300">{playingAudio.artist}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                    <button
                                        onClick={() => togglePlayPause()}
                                        title={isAudioPlaying ? 'Pause current audio playback' : 'Resume current audio playback'}
                                        className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-base flex items-center gap-2 cursor-pointer"
                                    >
                                        {isAudioPlaying ? <Pause size={20} /> : <Play size={20} />}
                                        <span>{isAudioPlaying ? 'Pause' : 'Play'}</span>
                                    </button>
                                    <button
                                        onClick={() => openExpandedPlayer()}
                                        title="Open full expanded Audiobook / Music Player drawer"
                                        className="px-4 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 font-black text-base flex items-center gap-2 cursor-pointer"
                                    >
                                        <ExternalLink size={20} />
                                        <span>Player</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {liveStreams.map((hub: any, idx: number) => (
                            <div key={idx} className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                                        <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                                            Shared Live TV Upstream Hub
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-black text-white line-clamp-2">{hub.channelName}</h3>
                                    <p className="text-base text-zinc-300">
                                        {hub.subscribersCount} active consumer(s) sharing 1 IPTV connection • Last packet {hub.lastPacketSecondsAgo}s ago
                                    </p>
                                </div>
                            </div>
                        ))}

                        {epgSyncs.map((sync: any) => (
                            <div key={sync.libraryId} className="p-5 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-black uppercase text-sky-300 flex items-center gap-2">
                                        <Radio size={18} className="animate-spin" />
                                        EPG Guide Sync: {sync.libraryName || 'Live TV'}
                                    </span>
                                    <span className="text-base font-mono font-black text-white">{sync.progressPercent}%</span>
                                </div>
                                <p className="text-base text-zinc-200">{sync.message}</p>
                                <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-400 rounded-full transition-all duration-300" style={{ width: `${sync.progressPercent}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── 2. AUDIOBOOK STUDIO AI WORKER (TRANSCRIPTION, STORY ART & VOICES) ── */}
            <section className="bg-zinc-950/90 border border-zinc-800/90 rounded-3xl p-6 sm:p-7 space-y-6 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <BookOpen size={28} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl sm:text-2xl font-black text-white">
                                    Audiobook Studio AI Queue
                                </h2>
                                <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase ${
                                    studioStatus?.isRunning
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                                        : studioConfig?.enabled
                                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                }`}>
                                    {studioStatus?.isRunning ? `Running: ${studioStatus.activeTask || 'Working'}` : studioConfig?.enabled ? 'Idle / Ready' : 'Paused'}
                                </span>
                            </div>
                            <p className="text-sm sm:text-base text-zinc-400 mt-1">
                                Whisper speech-to-text transcription, story-specific raster scene illustrations, and FFmpeg narrator voice packs
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={() => runAction('trigger_audiobook_worker')}
                            disabled={busyAction !== null}
                            title="Immediately trigger the Audiobook Studio background worker on the server"
                            className="px-5 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-base flex items-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
                        >
                            <Play size={20} className="fill-black" />
                            <span>Run</span>
                        </button>

                        <button
                            onClick={() => runAction('toggle_audiobook_worker', { enabled: !studioConfig?.enabled })}
                            disabled={busyAction !== null}
                            title={studioConfig?.enabled ? 'Pause automatic Audiobook Studio background queue processing' : 'Resume automatic Audiobook Studio background queue processing'}
                            className="px-5 py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 font-black text-base flex items-center gap-2.5 transition-all cursor-pointer"
                        >
                            {studioConfig?.enabled ? <Pause size={20} className="text-amber-400" /> : <Play size={20} className="text-emerald-400" />}
                            <span>{studioConfig?.enabled ? 'Pause' : 'Resume'}</span>
                        </button>

                        <button
                            onClick={() => runAction('purge_fake_svg')}
                            disabled={busyAction !== null}
                            title="Delete any legacy fake SVG placeholder files from disk and database so only genuine story raster paintings remain"
                            className="px-5 py-3.5 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 font-black text-base flex items-center gap-2.5 transition-all cursor-pointer"
                        >
                            <Trash2 size={20} />
                            <span>Purge</span>
                        </button>

                        <Link
                            href="/discover?tab=audiobooks"
                            title="Open Full Audiobook Studio Settings & Book Queue in Media tab"
                            className="px-5 py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-black text-base flex items-center gap-2.5 transition-all"
                        >
                            <Sparkles size={20} className="text-amber-400" />
                            <span>Studio</span>
                        </Link>
                    </div>
                </div>

                {/* Live Active Task Banner inside Audiobook Studio */}
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                            <Cpu size={22} className={studioStatus?.isRunning ? 'text-emerald-400 animate-spin' : 'text-zinc-500'} />
                            <span className="text-lg font-black text-white">
                                {studioStatus?.isRunning
                                    ? `${studioStatus.activeBookTitle || 'Audiobook'} — ${studioStatus.activeChapterTitle || 'Processing'}`
                                    : 'Worker Status'}
                            </span>
                        </div>
                        <span className="text-sm font-mono font-bold text-amber-300">
                            Daily Art Quota: {studioConfig?.imagesGeneratedToday || 0} / {studioConfig?.dailyImageQuota || 30} images
                        </span>
                    </div>
                    <p className="text-base text-zinc-300 font-medium">
                        {studioStatus?.lastLog || 'Idle — Ready to process queued audiobooks'}
                    </p>
                    {studioStatus?.isRunning && (
                        <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                            <div
                                className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(8, studioStatus.progress || 25)}%` }}
                            />
                        </div>
                    )}
                </div>

                {/* 3-Column Queue Breakdown (Transcriptions, Scene Illustrations, Narrator Voices) */}
                {queueBreakdown && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/90 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base font-black text-sky-300 flex items-center gap-2">
                                    <FileText size={20} /> Transcriptions
                                </span>
                                <span className="text-lg font-mono font-black text-white">
                                    {queueBreakdown.transcription?.completedChapters || 0} / {queueBreakdown.transcription?.totalChapters || 0}
                                </span>
                            </div>
                            <p className="text-sm text-zinc-400">
                                Pending chapters in queue: <strong className="text-white">{queueBreakdown.transcription?.pendingChapters || 0}</strong>
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/90 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base font-black text-amber-300 flex items-center gap-2">
                                    <ImageIcon size={20} /> Story Scene Art
                                </span>
                                <span className="text-lg font-mono font-black text-white">
                                    {queueBreakdown.illustrations?.completedChapters || 0} / {queueBreakdown.illustrations?.totalChapters || 0}
                                </span>
                            </div>
                            <p className="text-sm text-zinc-400">
                                Pending chapters: <strong className="text-white">{queueBreakdown.illustrations?.pendingChapters || 0}</strong> • Covers: <strong className="text-white">{queueBreakdown.illustrations?.completedCovers || 0}</strong>
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/90 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base font-black text-purple-300 flex items-center gap-2">
                                    <Mic2 size={20} /> Narrator Voices
                                </span>
                                <span className="text-lg font-mono font-black text-white">
                                    {queueBreakdown.voices?.completedChapters || 0} / {queueBreakdown.voices?.totalChapters || 0}
                                </span>
                            </div>
                            <p className="text-sm text-zinc-400">
                                Pending voice mastering chapters: <strong className="text-white">{queueBreakdown.voices?.pendingChapters || 0}</strong>
                            </p>
                        </div>
                    </div>
                )}

                {/* Queued Books List */}
                {queuedBooks.length > 0 && (
                    <div className="space-y-3">
                        <h3 className="text-lg font-black text-white">
                            Queued Books ({queuedBooks.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {queuedBooks.map((b: any) => {
                                const cleanTitle = (b.title || '').replace(/^\s*(?:19|20)\d{2}\s*[-–—:]\s*/i, '').trim() || b.title;
                                return (
                                    <div key={b.book_key} className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-4">
                                        <div className="min-w-0 space-y-1">
                                            <h4 className="text-base sm:text-lg font-black text-white line-clamp-2">{cleanTitle}</h4>
                                            <p className="text-sm text-zinc-400">
                                                {b.author || 'Unknown Author'} • {b.transcribed_chapters || 0}/{b.total_chapters || 1} Transcribed • {b.illustrated_scenes || 0} Scenes Painted
                                            </p>
                                        </div>
                                        <span className="px-3 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-black uppercase shrink-0">
                                            {b.status || 'Queued'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Recent Studio Activity Log */}
                {studioHistory.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <h3 className="text-lg font-black text-white">
                            Recent Audiobook Studio Completions &amp; Events
                        </h3>
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                            {studioHistory.slice(0, 10).map((entry: any) => (
                                <div key={entry.id} className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase ${
                                                entry.status === 'completed'
                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                            }`}>
                                                {entry.queueType}
                                            </span>
                                            <span className="text-base font-black text-white">
                                                {(entry.bookTitle || '').replace(/^\s*(?:19|20)\d{2}\s*[-–—:]\s*/i, '').trim()}
                                            </span>
                                            {entry.chapterTitle && (
                                                <span className="text-sm font-bold text-zinc-400">• {entry.chapterTitle}</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-zinc-300">{entry.detail}</p>
                                    </div>
                                    <span className="text-xs font-mono text-zinc-400 shrink-0">
                                        {entry.providerUsed}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            {/* ── 3. LIVE TV DVR RECORDINGS (ACTIVE, SCHEDULED & COMPLETED) ── */}
            <section className="bg-zinc-950/90 border border-zinc-800/90 rounded-3xl p-6 sm:p-7 space-y-5 shadow-xl">
                <div className="flex items-center justify-between gap-4 flex-wrap border-b border-zinc-800/80 pb-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                            <Clock size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-white">
                                Live TV DVR Recordings ({dvrActive.length} Active, {dvrScheduled.length} Scheduled)
                            </h2>
                            <p className="text-sm sm:text-base text-zinc-400">
                                Resilient server-side MP4/MKV/MP3 captures powered by the shared IPTV stream hub
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/discover?tab=livetv"
                        title="Open Live TV & DVR Manager in Media tab"
                        className="px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 font-black text-base flex items-center gap-2.5 transition-all"
                    >
                        <Tv size={20} className="text-amber-400" />
                        <span>DVR</span>
                    </Link>
                </div>

                {dvrActive.length === 0 && dvrScheduled.length === 0 && dvrRecent.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/70 text-center space-y-2">
                        <p className="text-lg font-bold text-zinc-300">No DVR recordings active or scheduled</p>
                        <p className="text-base text-zinc-500">Click Record in Theater Live TV or schedule programs from the EPG Guide.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {[...dvrActive, ...dvrScheduled, ...dvrRecent.slice(0, 6)].map((rec: any) => {
                            const isRec = rec.status === 'recording';
                            const isSched = rec.status === 'scheduled';
                            const isDone = rec.status === 'completed';
                            return (
                                <div key={rec.id} className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className={`px-3 py-0.5 rounded-lg text-xs font-black uppercase ${
                                                isRec
                                                    ? 'bg-red-500 text-white animate-pulse'
                                                    : isSched
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                    : isDone
                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                    : 'bg-zinc-800 text-zinc-400'
                                            }`}>
                                                {rec.status}
                                            </span>
                                            <h3 className="text-lg font-black text-white">{rec.program_title}</h3>
                                            <span className="text-base font-bold text-zinc-400">({rec.channel_name})</span>
                                        </div>
                                        <p className="text-sm text-zinc-400 font-mono">
                                            {rec.file_path || rec.destination_path}
                                            {rec.file_size ? ` • ${(rec.file_size / (1024 * 1024)).toFixed(1)} MB` : ''}
                                        </p>
                                    </div>

                                    {isRec && (
                                        <button
                                            onClick={() => runAction('stop_dvr_recording', { recordingId: rec.id })}
                                            title="Stop and finalize this active Live TV DVR recording cleanly"
                                            className="px-5 py-3 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-black text-base flex items-center gap-2 cursor-pointer shrink-0"
                                        >
                                            <Square size={18} className="fill-white" />
                                            <span>Stop</span>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ── 4. TRANSFERS & UPCOMING AI PIPELINES (PHOTOS FACE RECOGNITION, ETC.) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Music / Audio Transfers */}
                <section className="bg-zinc-950/90 border border-zinc-800/90 rounded-3xl p-6 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                                <Download size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white">Transfers &amp; Downloads</h2>
                                <p className="text-sm text-zinc-400">Active music and media acquisition jobs</p>
                            </div>
                        </div>
                        <Link
                            href="/downloads"
                            title="Open Transfers & Torrent Queue page"
                            className="px-4 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 font-black text-sm flex items-center gap-2"
                        >
                            <Download size={18} className="text-sky-400" />
                            <span>Transfers</span>
                        </Link>
                    </div>

                    {activeTransfers.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/70 text-center">
                            <p className="text-base font-bold text-zinc-300">No active audio downloads in queue</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeTransfers.map((tr: any) => (
                                <div key={tr.id} className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-base font-black text-white">{tr.title}</span>
                                        <span className="text-sm font-mono font-bold text-sky-400">{tr.progress || 0}%</span>
                                    </div>
                                    <p className="text-sm text-zinc-400">{tr.artist}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Upcoming & Scheduled Pipelines */}
                <section className="bg-zinc-950/90 border border-zinc-800/90 rounded-3xl p-6 space-y-4 shadow-xl">
                    <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                            <Layers size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white">Upcoming &amp; Standing Pipelines</h2>
                            <p className="text-sm text-zinc-400">Planned AI indexers &amp; automated background jobs</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {upcomingPipelines.map((pipe: any) => (
                            <div key={pipe.id} className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-base font-black text-white">{pipe.name}</h3>
                                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase ${
                                        pipe.status === 'ready'
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : pipe.status === 'scheduled'
                                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    }`}>
                                        {pipe.status}
                                    </span>
                                </div>
                                <p className="text-sm text-zinc-300 leading-relaxed">{pipe.description}</p>
                                <p className="text-xs font-bold text-emerald-400">{pipe.persistenceNote}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

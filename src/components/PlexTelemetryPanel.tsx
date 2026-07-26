"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Monitor, Tv, Smartphone, Cpu, ShieldCheck, UserCheck, Activity, RefreshCw, Film, AlertCircle } from "lucide-react";

export interface PlexSession {
    id: string;
    instanceName: string;
    title: string;
    seriesTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    year?: number;
    mediaType: 'movie' | 'series';
    poster?: string;
    user: {
        name: string;
        thumb?: string;
    };
    player: {
        title: string;
        platform: string;
        state: 'playing' | 'paused' | string;
        address?: string;
    };
    playback: {
        progressPercent: number;
        viewOffsetMs: number;
        durationMs: number;
        bandwidthMbps: string;
    };
    transcode: {
        streamType: string;
        videoDecision: string;
        audioDecision: string;
        videoCodec: string;
        resolution: string;
        transcodeSpeed?: number;
    };
}

export function PlexTelemetryPanel() {
    const [data, setData] = useState<{
        hasPlex: boolean;
        activeStreamsCount: number;
        totalBandwidthMbps: string;
        sessions: PlexSession[];
        topUsers: { name: string; avatar?: string; activeStreams: number }[];
    } | null>(null);

    const [loading, setLoading] = useState(true);

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/plex/sessions');
            if (res.ok) {
                const result = await res.json();
                setData(result);
            }
        } catch (e) {
            console.error('Failed to fetch Plex sessions', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 5000); // 5s live polling
        return () => clearInterval(interval);
    }, []);

    const formatDuration = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    const getPlatformIcon = (platform: string) => {
        const p = platform.toLowerCase();
        if (p.includes('apple') || p.includes('tvos') || p.includes('ios')) return <Tv size={14} className="text-zinc-300" />;
        if (p.includes('android') || p.includes('phone') || p.includes('mobile')) return <Smartphone size={14} className="text-emerald-400" />;
        if (p.includes('chrome') || p.includes('web') || p.includes('firefox') || p.includes('edge')) return <Monitor size={14} className="text-sky-400" />;
        return <Cpu size={14} className="text-purple-400" />;
    };

    const getStreamBadge = (transcode: PlexSession['transcode']) => {
        if (transcode.streamType === 'Direct Play') {
            return (
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Direct Play ({transcode.resolution})
                </span>
            );
        }
        if (transcode.streamType === 'Direct Stream') {
            return (
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
                    Direct Stream
                </span>
            );
        }
        return (
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Transcode ({transcode.videoCodec} → {transcode.resolution})
            </span>
        );
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Connecting to Plex Telemetry Engine...</p>
            </div>
        );
    }

    if (!data?.hasPlex) {
        return (
            <div className="p-8 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 text-center space-y-4 max-w-2xl mx-auto my-8">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                    <AlertCircle size={24} />
                </div>
                <h3 className="text-lg font-black text-white">No Plex Instances Connected</h3>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-lg mx-auto">
                    Connect your Plex Media Server in <strong className="text-white">Settings → System Settings</strong> to unlock Tautulli-style active streaming telemetry, live user tracking, and watch history analytics.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top Telemetry Header Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Active Streams Card */}
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Active Streams</span>
                        <span className="text-3xl font-black text-white">{data.activeStreamsCount}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Activity size={20} className={data.activeStreamsCount > 0 ? 'animate-pulse' : ''} />
                    </div>
                </div>

                {/* Total Bandwidth Card */}
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Streaming Bandwidth</span>
                        <span className="text-3xl font-black text-emerald-400">{data.totalBandwidthMbps} <span className="text-sm font-bold text-zinc-500">Mbps</span></span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                        <RefreshCw size={20} />
                    </div>
                </div>

                {/* Active Viewers Count */}
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Active Viewers</span>
                        <span className="text-3xl font-black text-purple-400">{data.topUsers.length}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                        <UserCheck size={20} />
                    </div>
                </div>
            </div>

            {/* Live Active Streams Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            🍿 Active Live Streams
                            {data.activeStreamsCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    LIVE
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-zinc-500 font-medium">Real-time Tautulli streaming telemetry per user &amp; device.</p>
                    </div>
                </div>

                {data.sessions.length === 0 ? (
                    <div className="p-12 text-center bg-zinc-950/40 rounded-2xl border border-zinc-800/80 border-dashed space-y-2">
                        <Film className="mx-auto text-zinc-700" size={32} />
                        <p className="text-zinc-400 font-bold text-sm">No Active Streams Currently</p>
                        <p className="text-xs text-zinc-600">Plex streaming sessions will automatically appear here live as users press play.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {data.sessions.map(s => (
                            <div
                                key={s.id}
                                className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 hover:border-zinc-700 transition-all shadow-xl space-y-4 relative overflow-hidden"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Poster */}
                                    <div className="w-16 h-24 rounded-xl bg-zinc-900 border border-zinc-800 flex-shrink-0 overflow-hidden relative">
                                        {s.poster ? (
                                            <img src={s.poster} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                <Film size={20} />
                                            </div>
                                        )}
                                        <div className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[8px] font-black text-white uppercase border border-white/10">
                                            {s.playback.bandwidthMbps} MB/S
                                        </div>
                                    </div>

                                    {/* Main Info */}
                                    <div className="space-y-1.5 min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {getStreamBadge(s.transcode)}
                                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-zinc-900 text-zinc-400 border border-zinc-800">
                                                {s.instanceName}
                                            </span>
                                        </div>

                                        <h3 className="font-bold text-white text-base truncate" title={s.title}>
                                            {s.seriesTitle ? `${s.seriesTitle} - S${s.seasonNumber}E${s.episodeNumber}` : s.title}
                                        </h3>
                                        {s.seriesTitle && <p className="text-xs text-zinc-400 truncate">{s.title}</p>}

                                        {/* User & Player Info */}
                                        <div className="flex items-center gap-3 text-xs text-zinc-400 pt-1 flex-wrap">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-black flex items-center justify-center border border-emerald-500/30 uppercase">
                                                    {s.user.name[0]}
                                                </div>
                                                <span className="font-bold text-zinc-200">{s.user.name}</span>
                                            </div>

                                            <span className="text-zinc-600">•</span>

                                            <div className="flex items-center gap-1 text-zinc-400 font-medium">
                                                {getPlatformIcon(s.player.platform)}
                                                <span>{s.player.title}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Live Playback Progress Bar */}
                                <div className="space-y-1 pt-1">
                                    <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                        <span className="flex items-center gap-1">
                                            {s.player.state === 'paused' ? <Pause size={10} className="text-amber-400" /> : <Play size={10} className="text-emerald-400 fill-emerald-400" />}
                                            {formatDuration(s.playback.viewOffsetMs)} / {formatDuration(s.playback.durationMs)}
                                        </span>
                                        <span>{s.playback.progressPercent}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                s.player.state === 'paused' ? 'bg-amber-400' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                            }`}
                                            style={{ width: `${s.playback.progressPercent}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Active Users Leaderboard */}
            {data.topUsers.length > 0 && (
                <div className="p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 space-y-4 shadow-xl">
                    <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest">Active Viewers</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {data.topUsers.map(user => (
                            <div key={user.name} className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-black text-xs uppercase">
                                        {user.name[0]}
                                    </div>
                                    <span className="text-xs font-bold text-white truncate max-w-[120px]">{user.name}</span>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    {user.activeStreams} Stream{user.activeStreams > 1 ? 's' : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

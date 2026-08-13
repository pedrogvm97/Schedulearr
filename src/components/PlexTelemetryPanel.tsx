"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Monitor, Tv, Smartphone, Cpu, Activity, RefreshCw, Film, AlertCircle, Clock, History, BarChart2, CheckCircle2, User as UserIcon } from "lucide-react";

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
    };
}

export interface PlexHistory {
    id: string;
    instanceName: string;
    title: string;
    seriesTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    mediaType: 'movie' | 'series';
    poster?: string;
    viewedAt: number;
    user: { name: string; thumb?: string };
    player: { title: string; platform: string };
}

export function PlexTelemetryPanel() {
    const [data, setData] = useState<{
        hasPlex: boolean;
        activeStreamsCount: number;
        totalBandwidthMbps: string;
        sessions: PlexSession[];
        topUsers: { name: string; avatar?: string; activeStreams: number }[];
    } | null>(null);

    const [history, setHistory] = useState<PlexHistory[]>([]);
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTelemetry = async () => {
        try {
            const [sessionsRes, historyRes, statsRes] = await Promise.all([
                fetch('/api/plex/sessions'),
                fetch('/api/plex/history'),
                fetch('/api/plex/stats')
            ]);
            
            if (sessionsRes.ok) setData(await sessionsRes.json());
            if (historyRes.ok) setHistory((await historyRes.json()).history || []);
            if (statsRes.ok) setStats((await statsRes.json()).stats || []);
            
        } catch (e) {
            console.error('Failed to fetch Plex telemetry', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTelemetry();
        const interval = setInterval(fetchTelemetry, 10000); // 10s polling
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
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Direct Play ({transcode.resolution})
                </span>
            );
        }
        if (transcode.streamType === 'Direct Stream') {
            return (
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-sky-500/15 text-sky-400 border border-sky-500/30">
                    Direct Stream
                </span>
            );
        }
        return (
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Transcode ({transcode.videoCodec})
            </span>
        );
    };

    if (loading && !data) {
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

    // Compute top users based on history
    const userHistoryCounts = history.reduce((acc, curr) => {
        const name = curr.user.name;
        if (!acc[name]) acc[name] = { name, count: 0, thumb: curr.user.thumb };
        acc[name].count++;
        return acc;
    }, {} as Record<string, { name: string, count: number, thumb?: string }>);
    const topHistoricalUsers = Object.values(userHistoryCounts).sort((a, b) => b.count - a.count).slice(0, 5);

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top Telemetry Header Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Active Streams</span>
                        <span className="text-3xl font-black text-white">{data.activeStreamsCount}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Activity size={20} className={data.activeStreamsCount > 0 ? 'animate-pulse' : ''} />
                    </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Total Bandwidth</span>
                        <span className="text-3xl font-black text-sky-400">{data.totalBandwidthMbps} <span className="text-sm font-bold text-zinc-500">Mbps</span></span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                        <RefreshCw size={20} />
                    </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">History Records</span>
                        <span className="text-3xl font-black text-purple-400">{history.length}+</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                        <History size={20} />
                    </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Libraries</span>
                        <span className="text-3xl font-black text-amber-400">{stats.length}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                        <BarChart2 size={20} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Live Streams & History */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Live Streams */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <Activity className="text-emerald-500" size={20} /> Live Streams
                            {data.activeStreamsCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    LIVE
                                </span>
                            )}
                        </h2>
                        
                        {data.sessions.length === 0 ? (
                            <div className="p-12 text-center bg-zinc-950/40 rounded-2xl border border-zinc-800/80 border-dashed">
                                <Film className="mx-auto text-zinc-700 mb-3" size={32} />
                                <p className="text-zinc-400 font-bold text-sm">No Active Streams</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {data.sessions.map(s => (
                                    <div key={s.id} className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 shadow-xl flex gap-4">
                                        {s.poster ? (
                                            <img src={s.poster} alt={s.title} className="w-16 h-24 object-cover rounded-xl shadow-lg border border-white/10" />
                                        ) : (
                                            <div className="w-16 h-24 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center">
                                                <Film className="text-zinc-700" size={24} />
                                            </div>
                                        )}
                                        
                                        <div className="flex-1 min-w-0 space-y-2">
                                            <div className="flex justify-between items-start gap-4">
                                                <div>
                                                    <h4 className="text-sm font-bold text-white truncate">
                                                        {s.mediaType === 'series' && s.seriesTitle ? `${s.seriesTitle} - ` : ''}
                                                        {s.title}
                                                    </h4>
                                                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                                                        {s.mediaType === 'series' && s.seasonNumber !== undefined && (
                                                            <span className="font-medium text-emerald-500">S{String(s.seasonNumber).padStart(2, '0')}E{String(s.episodeNumber).padStart(2, '0')}</span>
                                                        )}
                                                        {s.year && <span>{s.year}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                    {getStreamBadge(s.transcode)}
                                                    <span className="text-[10px] font-black text-sky-400">{s.playback.bandwidthMbps} Mbps</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-4 mt-2">
                                                <div className="flex items-center gap-2">
                                                    {s.user.thumb ? (
                                                        <img src={s.user.thumb} alt={s.user.name} className="w-6 h-6 rounded-full border border-zinc-700" />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                                            {s.user.name.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="text-xs font-bold text-zinc-300">{s.user.name}</span>
                                                </div>

                                                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                                    {getPlatformIcon(s.player.platform)}
                                                    <span className="truncate max-w-[100px]">{s.player.title}</span>
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="space-y-1.5 mt-2">
                                                <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                                                    <span>{formatDuration(s.playback.viewOffsetMs)}</span>
                                                    <span>{formatDuration(s.playback.durationMs)}</span>
                                                </div>
                                                <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden relative border border-zinc-800">
                                                    <div 
                                                        className="absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                        style={{ width: `${s.playback.progressPercent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recently Watched History */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <History className="text-sky-500" size={20} /> Watch History
                        </h2>
                        
                        <div className="bg-zinc-950/40 rounded-2xl border border-zinc-800/80 overflow-hidden">
                            {history.length === 0 ? (
                                <div className="p-8 text-center text-zinc-500 text-sm">No watch history found.</div>
                            ) : (
                                <div className="divide-y divide-zinc-800/50">
                                    {history.map(item => (
                                        <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-zinc-900/30 transition-colors">
                                            {item.poster ? (
                                                <img src={item.poster} className="w-10 h-14 object-cover rounded-lg border border-white/5 shadow-sm" alt="" />
                                            ) : (
                                                <div className="w-10 h-14 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center">
                                                    <Film className="text-zinc-700" size={16} />
                                                </div>
                                            )}
                                            
                                            <div className="flex-1 min-w-0 flex flex-col">
                                                <div className="flex items-start justify-between">
                                                    <span className="text-sm font-bold text-zinc-200 truncate pr-4">
                                                        {item.mediaType === 'series' && item.seriesTitle ? `${item.seriesTitle} - ` : ''}
                                                        {item.title}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-zinc-500 whitespace-nowrap pt-0.5 flex items-center gap-1.5">
                                                        <Clock size={10} />
                                                        {new Date(item.viewedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between mt-1 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        {item.user.thumb ? (
                                                            <img src={item.user.thumb} className="w-4 h-4 rounded-full opacity-80" alt="" />
                                                        ) : (
                                                            <UserIcon size={12} className="text-zinc-500" />
                                                        )}
                                                        <span className="font-medium text-zinc-400">{item.user.name}</span>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-zinc-600 flex items-center gap-1">
                                                        {item.player.platform}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Top Users & Library Stats */}
                <div className="space-y-8">
                    {/* Top Users */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <UserIcon className="text-purple-500" size={20} /> Top Users
                        </h2>
                        
                        <div className="bg-zinc-950/40 rounded-2xl border border-zinc-800/80 overflow-hidden divide-y divide-zinc-800/50">
                            {topHistoricalUsers.length === 0 ? (
                                <div className="p-6 text-center text-zinc-500 text-sm">No user data.</div>
                            ) : (
                                topHistoricalUsers.map((u, i) => (
                                    <div key={u.name} className="p-4 flex items-center justify-between hover:bg-zinc-900/30">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-black text-zinc-600 w-4">{i + 1}.</span>
                                            {u.thumb ? (
                                                <img src={u.thumb} className="w-8 h-8 rounded-full border border-zinc-700 shadow-sm" alt="" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                                                    {u.name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-sm font-bold text-zinc-300">{u.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
                                            <span className="text-purple-400">{u.count}</span> plays
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Library Stats */}
                    {stats.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <BarChart2 className="text-amber-500" size={20} /> Library Sections
                            </h2>
                            <div className="grid grid-cols-1 gap-3">
                                {stats.map(lib => (
                                    <div key={lib.id} className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-500">
                                                {lib.type === 'movie' ? <Film size={16} /> : <Tv size={16} />}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-zinc-300">{lib.title}</div>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-0.5">{lib.type}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

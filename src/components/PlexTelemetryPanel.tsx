"use client";

import { useEffect, useState, useMemo } from "react";
import { Play, Pause, Monitor, Tv, Smartphone, Cpu, Activity, RefreshCw, Film, AlertCircle, Clock, History, BarChart2, CheckCircle2, User as UserIcon, Calendar as CalendarIcon, ChevronDown, Palette } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MediaDetailsPanel } from "./MediaDetailsPanel";
import { LibraryExplorerPanel } from "./LibraryExplorerPanel";
import { UserActivityPanel } from "./UserActivityPanel";

export interface PlexSession {
    id: string;
    instanceName: string;
    title: string;
    seriesTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    year?: number;
    mediaType: 'movie' | 'series' | 'livetv';
    poster?: string;
    user: { name: string; thumb?: string; };
    player: { title: string; platform: string; state: string; };
    playback: { progressPercent: number; viewOffsetMs: number; durationMs: number; bandwidthMbps: string; };
    transcode: { streamType: string; videoDecision: string; audioDecision: string; videoCodec: string; resolution: string; };
}

export interface PlexHistory {
    id: string;
    instanceName: string;
    title: string;
    seriesTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    mediaType: 'movie' | 'series' | 'livetv';
    poster?: string;
    viewedAt: number;
    durationMs?: number;
    viewOffsetMs?: number;
    user: { name: string; thumb?: string };
    player: { title: string; platform: string };
}

const DEFAULT_COLORS = [
    '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#f43f5e'
];

export function PlexTelemetryPanel() {
    const [data, setData] = useState<{
        hasPlex: boolean;
        activeStreamsCount: number;
        totalBandwidthMbps: string;
        sessions: PlexSession[];
    } | null>(null);

    const [history, setHistory] = useState<PlexHistory[]>([]);
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<number>(7); // Days
    
    const [userColors, setUserColors] = useState<Record<string, string>>({});
    
    // For clickable media details
    const [selectedHistoryMedia, setSelectedHistoryMedia] = useState<PlexHistory | null>(null);
    const [selectedLibraryExplorer, setSelectedLibraryExplorer] = useState<any | null>(null);
    const [selectedUser, setSelectedUser] = useState<{name: string, thumb?: string} | null>(null);

    useEffect(() => {
        // Load user colors from local storage
        const saved = localStorage.getItem('plexUserColors');
        if (saved) {
            try { setUserColors(JSON.parse(saved)); } catch (e) {}
        }
    }, []);

    const fetchTelemetry = async () => {
        try {
            const limit = timeRange === 7 ? 500 : timeRange === 30 ? 2000 : 5000;
            const [sessionsRes, historyRes, statsRes] = await Promise.all([
                fetch('/api/plex/sessions'),
                fetch(`/api/plex/history?limit=${limit}`),
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
        setLoading(true);
        fetchTelemetry();
    }, [timeRange]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetch('/api/plex/sessions').then(res => res.json()).then(setData).catch(() => {});
        }, 10000); // 10s polling for live streams only to save history bandwidth
        return () => clearInterval(interval);
    }, []);

    const handleColorChange = (userName: string, color: string) => {
        const newColors = { ...userColors, [userName]: color };
        setUserColors(newColors);
        localStorage.setItem('plexUserColors', JSON.stringify(newColors));
    };

    const getUserColor = (userName: string, index: number) => {
        if (userColors[userName]) return userColors[userName];
        return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    };

    const formatDuration = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };
    
    const formatHours = (ms: number) => {
        const hours = ms / (1000 * 60 * 60);
        return hours.toFixed(1) + 'h';
    };

    const getPlatformIcon = (platform: string) => {
        const p = platform.toLowerCase();
        if (p.includes('apple') || p.includes('tvos') || p.includes('ios')) return <Tv size={14} className="text-zinc-300" />;
        if (p.includes('android') || p.includes('phone') || p.includes('mobile')) return <Smartphone size={14} className="text-emerald-400" />;
        if (p.includes('chrome') || p.includes('web') || p.includes('firefox') || p.includes('edge')) return <Monitor size={14} className="text-sky-400" />;
        return <Cpu size={14} className="text-purple-400" />;
    };

    // Filter history by time range
    const filteredHistory = useMemo(() => {
        const cutoff = Date.now() - (timeRange * 24 * 60 * 60 * 1000);
        return history.filter(h => h.viewedAt >= cutoff);
    }, [history, timeRange]);

    // Compute top users based on filtered history
    const userHistoryCounts = useMemo(() => {
        return filteredHistory.reduce((acc, curr) => {
            const name = curr.user.name;
            if (!acc[name]) acc[name] = { name, count: 0, duration: 0, thumb: curr.user.thumb };
            acc[name].count++;
            acc[name].duration += (curr.viewOffsetMs || curr.durationMs || 0);
            return acc;
        }, {} as Record<string, { name: string, count: number, duration: number, thumb?: string }>);
    }, [filteredHistory]);

    const topHistoricalUsers = Object.values(userHistoryCounts).sort((a, b) => b.duration - a.duration).slice(0, 8);

    // Compute chart data (Watch time per user per day)
    const chartData = useMemo(() => {
        const daysMap: Record<string, any> = {};
        
        // Initialize days map for the time range
        for (let i = timeRange - 1; i >= 0; i--) {
            const d = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
            const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            daysMap[dateStr] = { date: dateStr };
        }

        filteredHistory.forEach(h => {
            const d = new Date(h.viewedAt);
            const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (daysMap[dateStr]) {
                const userName = h.user.name;
                const hours = (h.viewOffsetMs || h.durationMs || 0) / (1000 * 60 * 60);
                daysMap[dateStr][userName] = (daysMap[dateStr][userName] || 0) + hours;
            }
        });

        return Object.values(daysMap);
    }, [filteredHistory, timeRange]);

    // Compute most watched media
    const mostWatchedMedia = useMemo(() => {
        const mediaMap: Record<string, { title: string, poster?: string, type: string, count: number, duration: number }> = {};
        filteredHistory.forEach(h => {
            const key = h.mediaType === 'series' && h.seriesTitle ? h.seriesTitle : h.title;
            if (!mediaMap[key]) {
                mediaMap[key] = { title: key, poster: h.poster, type: h.mediaType, count: 0, duration: 0 };
            }
            mediaMap[key].count++;
            mediaMap[key].duration += (h.viewOffsetMs || h.durationMs || 0);
        });
        return Object.values(mediaMap).sort((a, b) => b.duration - a.duration).slice(0, 4);
    }, [filteredHistory]);


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
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">History Records (Selected Range)</span>
                        <span className="text-3xl font-black text-purple-400">{filteredHistory.length}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                        <History size={20} />
                    </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between shadow-xl relative group">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block flex items-center gap-1 cursor-help" title="Plex natively does not store watch durations in its history log. This is an estimate based on average media lengths (Movies = 2h, Shows = 45m). For exact to-the-second tracking, a dedicated tracker like Tautulli is required.">
                            Estimated Watch Time
                        </span>
                        <span className="text-3xl font-black text-amber-400">
                            {formatHours(filteredHistory.reduce((acc, h) => acc + (h.viewOffsetMs || h.durationMs || 0), 0))}
                        </span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                        <Clock size={20} />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                
                {/* Left Column: Live Streams, Chart, History */}
                <div className="xl:col-span-2 space-y-8">
                    
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
                                                    {s.transcode.streamType === 'Direct Play' ? (
                                                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                            Direct Play ({s.transcode.resolution})
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                                            Transcode ({s.transcode.videoCodec})
                                                        </span>
                                                    )}
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

                    {/* Chart Area */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <BarChart2 className="text-indigo-500" size={20} /> Watch Activity
                            </h2>
                            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-1 rounded-xl">
                                {[7, 30, 90, 365].map(days => (
                                    <button
                                        key={days}
                                        onClick={() => setTimeRange(days)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${timeRange === days ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        {days === 365 ? '1 Year' : `${days} Days`}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <div className="bg-zinc-950/40 rounded-2xl border border-zinc-800/80 p-4 h-[300px]">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                        <XAxis dataKey="date" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}h`} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }}
                                            itemStyle={{ fontWeight: 'bold' }}
                                            formatter={(value: number) => [`${value.toFixed(1)} hours`, undefined]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                        {topHistoricalUsers.map((u, idx) => (
                                            <Bar key={u.name} dataKey={u.name} stackId="a" fill={getUserColor(u.name, idx)} radius={[2, 2, 0, 0]} />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">No data available for this range.</div>
                            )}
                        </div>
                    </div>

                    {/* Recently Watched History Feed */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <History className="text-sky-500" size={20} /> Watch History Feed
                        </h2>
                        
                        <div className="bg-zinc-950/40 rounded-2xl border border-zinc-800/80 overflow-hidden">
                            {filteredHistory.length === 0 ? (
                                <div className="p-8 text-center text-zinc-500 text-sm">No watch history found.</div>
                            ) : (
                                <div className="divide-y divide-zinc-800/50">
                                    {filteredHistory.slice(0, 50).map(item => (
                                        <div 
                                            key={item.id} 
                                            onClick={() => setSelectedHistoryMedia(item)}
                                            className="flex items-center gap-4 p-4 hover:bg-zinc-900/50 cursor-pointer transition-colors group"
                                        >
                                            {item.poster ? (
                                                <img src={item.poster} className="w-10 h-14 object-cover rounded-lg border border-white/5 shadow-sm group-hover:border-white/20 transition-colors" alt="" />
                                            ) : (
                                                <div className="w-10 h-14 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center">
                                                    <Film className="text-zinc-700" size={16} />
                                                </div>
                                            )}
                                            
                                            <div className="flex-1 min-w-0 flex flex-col">
                                                <div className="flex items-start justify-between">
                                                    <span className="text-sm font-bold text-zinc-200 group-hover:text-sky-400 truncate pr-4 transition-colors">
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
                                                        <span className="font-medium text-zinc-400" style={{ color: getUserColor(item.user.name, Object.keys(userHistoryCounts).indexOf(item.user.name)) }}>{item.user.name}</span>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-zinc-600 flex items-center gap-1">
                                                        {item.player.platform} 
                                                        {item.mediaType === 'livetv' && <span className="ml-2 text-rose-500 uppercase tracking-widest px-1.5 py-0.5 bg-rose-500/10 rounded">Live TV</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredHistory.length > 50 && (
                                        <div className="p-4 text-center text-xs font-bold text-zinc-500 bg-zinc-900/20">
                                            Showing last 50 of {filteredHistory.length} items. Use the chart to see all activity.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Top Users, Most Watched, Library Stats */}
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
                                    <div key={u.name} className="p-4 flex items-center justify-between hover:bg-zinc-900/30 group relative">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-black text-zinc-600 w-4">{i + 1}.</span>
                                            <div className="relative cursor-pointer" title="Click to change color">
                                                {u.thumb ? (
                                                    <img src={u.thumb} className="w-8 h-8 rounded-full border shadow-sm relative z-10" style={{ borderColor: getUserColor(u.name, i) }} alt="" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white relative z-10" style={{ backgroundColor: getUserColor(u.name, i) }}>
                                                        {u.name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                {/* Hidden Color Picker */}
                                                <input 
                                                    type="color" 
                                                    value={getUserColor(u.name, i)}
                                                    onChange={(e) => handleColorChange(u.name, e.target.value)}
                                                    className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer z-20"
                                                />
                                            </div>
                                            <div 
                                                className="flex flex-col cursor-pointer group/user"
                                                onClick={() => setSelectedUser({ name: u.name, thumb: u.thumb })}
                                            >
                                                <span className="text-sm font-bold text-zinc-300 group-hover/user:underline" style={{ color: getUserColor(u.name, i) }}>{u.name}</span>
                                                <span className="text-[10px] text-zinc-500 font-medium">Click name for activity</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="text-sm font-black text-purple-400">{formatHours(u.duration)}</span>
                                            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{u.count} plays</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Most Watched Media */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <Film className="text-rose-500" size={20} /> Most Watched
                        </h2>
                        
                        <div className="grid grid-cols-2 gap-3">
                            {mostWatchedMedia.map((m, i) => (
                                <div key={i} className="relative aspect-[2/3] rounded-xl overflow-hidden group border border-white/10">
                                    {m.poster ? (
                                        <img src={m.poster} className="w-full h-full object-cover opacity-80 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500" alt="" />
                                    ) : (
                                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center"><Film className="text-zinc-700" /></div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-3 flex flex-col justify-end">
                                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-0.5">{m.type}</span>
                                        <span className="text-xs font-bold text-white line-clamp-2 leading-tight">{m.title}</span>
                                        <span className="text-[10px] text-zinc-400 font-medium mt-1">{formatHours(m.duration)}</span>
                                    </div>
                                </div>
                            ))}
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
                                    <div 
                                        key={lib.id} 
                                        onClick={() => setSelectedLibraryExplorer(lib)}
                                        className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 flex items-center justify-between cursor-pointer hover:bg-zinc-900/60 hover:border-amber-500/30 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-900 group-hover:bg-amber-500/10 group-hover:text-amber-500 flex items-center justify-center text-zinc-500 transition-colors">
                                                {lib.type === 'movie' ? <Film size={16} /> : <Tv size={16} />}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-zinc-300 group-hover:text-white transition-colors">{lib.title}</div>
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

            {/* Media Details Overlay */}
            {selectedHistoryMedia && (
                <MediaDetailsPanel
                    item={{ 
                        title: selectedHistoryMedia.title, 
                        posterPath: selectedHistoryMedia.poster, 
                        mediaType: selectedHistoryMedia.mediaType === 'series' ? 'tv' : selectedHistoryMedia.mediaType,
                        // Provide basic info so it renders nicely even without full DB details
                        overview: `Viewed on ${new Date(selectedHistoryMedia.viewedAt).toLocaleDateString()} by ${selectedHistoryMedia.user.name}.`,
                    }}
                    watchHistory={history.filter(h => 
                        (h.mediaType === 'series' && h.seriesTitle === selectedHistoryMedia.seriesTitle) || 
                        (h.title === selectedHistoryMedia.title)
                    )}
                    onClose={() => setSelectedHistoryMedia(null)}
                />
            )}

            {/* Library Explorer Overlay */}
            {selectedLibraryExplorer && (
                <LibraryExplorerPanel 
                    library={selectedLibraryExplorer}
                    onClose={() => setSelectedLibraryExplorer(null)}
                />
            )}

            {/* User Activity Modal */}
            {selectedUser && (
                <UserActivityPanel
                    userName={selectedUser.name}
                    userThumb={selectedUser.thumb}
                    userColor={getUserColor(selectedUser.name, Object.keys(userHistoryCounts).indexOf(selectedUser.name))}
                    history={history} // pass unfiltered history so we can calculate their overall
                    formatHours={formatHours}
                    onClose={() => setSelectedUser(null)}
                />
            )}
        </div>
    );
}

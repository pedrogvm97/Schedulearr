'use client';

import React, { useMemo } from 'react';
import { X, Clock, Film, Tv, PlayCircle, Calendar } from 'lucide-react';
import { PlexHistory } from './PlexTelemetryPanel';

interface UserActivityPanelProps {
    userName: string;
    userThumb?: string;
    userColor: string;
    history: PlexHistory[]; // The full history dataset
    onClose: () => void;
    formatHours: (ms: number) => string;
}

export function UserActivityPanel({ userName, userThumb, userColor, history, onClose, formatHours }: UserActivityPanelProps) {
    
    // Filter history for just this user
    const userHistory = useMemo(() => {
        return history.filter(h => h.user.name === userName).sort((a, b) => b.viewedAt - a.viewedAt);
    }, [history, userName]);

    // Calculate overall stats
    const stats = useMemo(() => {
        let totalDuration = 0;
        let movieCount = 0;
        let seriesCount = 0;
        
        userHistory.forEach(h => {
            totalDuration += (h.viewOffsetMs || h.durationMs || 0);
            if (h.mediaType === 'movie') movieCount++;
            else if (h.mediaType === 'series') seriesCount++;
        });

        return { totalDuration, movieCount, seriesCount, totalPlays: userHistory.length };
    }, [userHistory]);

    // Calculate most watched media for this user
    const mostWatched = useMemo(() => {
        const mediaMap: Record<string, { title: string, poster?: string, type: string, count: number, duration: number }> = {};
        userHistory.forEach(h => {
            const key = h.mediaType === 'series' && h.seriesTitle ? h.seriesTitle : h.title;
            if (!mediaMap[key]) {
                mediaMap[key] = { title: key, poster: h.poster, type: h.mediaType, count: 0, duration: 0 };
            }
            mediaMap[key].count++;
            mediaMap[key].duration += (h.viewOffsetMs || h.durationMs || 0);
        });
        return Object.values(mediaMap).sort((a, b) => b.duration - a.duration).slice(0, 8);
    }, [userHistory]);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-10 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-300">
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${userColor}20 0%, transparent 70%)` }} />
            
            <div className="relative w-full max-w-5xl h-full max-h-[85vh] bg-zinc-950/80 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 sm:p-8 border-b border-white/5 bg-black/40">
                    <div className="flex items-center gap-4">
                        {userThumb ? (
                            <img src={userThumb} className="w-16 h-16 rounded-full border-2 shadow-lg" style={{ borderColor: userColor }} alt="" />
                        ) : (
                            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black text-white shadow-lg" style={{ backgroundColor: userColor }}>
                                {userName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <h2 className="text-2xl font-black text-white" style={{ color: userColor }}>{userName}'s Activity</h2>
                            <div className="text-sm font-medium text-zinc-400 mt-1 flex items-center gap-3">
                                <span><strong className="text-white">{stats.totalPlays}</strong> Total Plays</span>
                                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                <span className="flex items-center gap-1"><Clock size={14} className="text-amber-500" /> {formatHours(stats.totalDuration)} Watch Time</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors relative z-10">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 flex flex-col lg:flex-row gap-8">
                    
                    {/* Left Col: Stats & Most Watched */}
                    <div className="flex-1 space-y-8">
                        
                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5"><Film size={12} className="text-sky-500" /> Movies</span>
                                <div className="text-3xl font-black text-white mt-1">{stats.movieCount}</div>
                            </div>
                            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5"><Tv size={12} className="text-emerald-500" /> Episodes</span>
                                <div className="text-3xl font-black text-white mt-1">{stats.seriesCount}</div>
                            </div>
                        </div>

                        {/* User's Most Watched */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <PlayCircle className="text-rose-500" size={16} /> Most Watched by {userName}
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {mostWatched.length === 0 && <div className="col-span-4 text-center text-zinc-600 text-sm py-4">No data</div>}
                                {mostWatched.map((m, i) => (
                                    <div key={i} className="relative aspect-[2/3] rounded-xl overflow-hidden group border border-white/5">
                                        {m.poster ? (
                                            <img src={m.poster} className="w-full h-full object-cover opacity-80 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500" alt="" />
                                        ) : (
                                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center"><Film className="text-zinc-700" /></div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-0.5">{m.type}</span>
                                            <span className="text-xs font-bold text-white line-clamp-2 leading-tight">{m.title}</span>
                                            <div className="flex justify-between items-center mt-2">
                                                <span className="text-[10px] text-zinc-400 font-medium">{formatHours(m.duration)}</span>
                                                <span className="text-[10px] text-zinc-500 font-bold">{m.count} plays</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Right Col: Timeline */}
                    <div className="w-full lg:w-96 space-y-4">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Calendar className="text-purple-500" size={16} /> Recent Timeline
                        </h3>
                        <div className="bg-zinc-900/30 rounded-2xl border border-zinc-800/80 p-1 h-[400px] lg:h-full flex flex-col">
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {userHistory.length === 0 && <div className="text-center text-zinc-600 text-sm py-8">No history found</div>}
                                {userHistory.slice(0, 100).map((item) => (
                                    <div key={item.id} className="flex gap-3 p-2 rounded-xl hover:bg-zinc-800/50 transition-colors group">
                                        {item.poster ? (
                                            <img src={item.poster} className="w-10 h-14 object-cover rounded-lg shadow-sm border border-white/5" alt="" />
                                        ) : (
                                            <div className="w-10 h-14 rounded-lg bg-zinc-800 border border-white/5 flex items-center justify-center">
                                                <Film size={14} className="text-zinc-600" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
                                            <div className="text-xs font-bold text-zinc-300 group-hover:text-white truncate">
                                                {item.mediaType === 'series' && item.seriesTitle ? `${item.seriesTitle} - ` : ''}
                                                {item.title}
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] font-medium text-zinc-500">
                                                    {new Date(item.viewedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest bg-zinc-800/80 px-1.5 py-0.5 rounded">
                                                    {item.player.platform}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    );
}

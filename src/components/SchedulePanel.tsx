'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, Filter, PlayCircle, Loader2, Film, Tv, Clock, CheckCircle2, Search } from 'lucide-react';
import { MediaDetailsPanel } from '@/components/MediaDetailsPanel';

interface CalendarEvent {
    id: string;
    instanceId: string;
    instanceName: string;
    instanceColor: string;
    type: 'radarr' | 'sonarr';
    mediaType: 'movie' | 'series';
    title: string;
    fullTitle?: string;
    seriesTitle?: string;
    episodeTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    releaseDate: string;
    releaseType: 'digital' | 'physical' | 'cinemas' | 'tv';
    monitored: boolean;
    hasFile: boolean;
    overview: string;
    posterUrl?: string;
    year?: number;
    rating?: number;
    genres?: string[];
    mediaItem: any;
}

function getCountdownLabel(dateStr: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { label: 'Today', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
    if (diffDays === 1) return { label: 'Tomorrow', color: 'bg-sky-500/20 text-sky-400 border-sky-500/40' };
    if (diffDays > 1 && diffDays <= 7) return { label: `In ${diffDays} days`, color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' };
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d ago`, color: 'bg-zinc-800 text-zinc-500 border-zinc-700' };
    return { label: `In ${diffDays}d`, color: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
}

export function SchedulePanel() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set());
    const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);
            try {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 3); // 3 days past for recently released
                const start = startDate.toISOString().split('T')[0];
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + 45); // 45 days into the future
                const end = endDate.toISOString().split('T')[0];

                const res = await fetch(`/api/calendar?start=${start}&end=${end}`);
                if (res.ok) {
                    const data = await res.json();
                    setEvents(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.error('Failed to fetch calendar events', e);
            } finally {
                setLoading(false);
            }
        };
        fetchEvents();
    }, []);

    // Extract unique instances from events
    const availableInstances = useMemo(() => {
        const map = new Map<string, { id: string, name: string, color: string, type: 'radarr' | 'sonarr' }>();
        events.forEach(e => {
            if (!map.has(e.instanceId)) {
                map.set(e.instanceId, { id: e.instanceId, name: e.instanceName, color: e.instanceColor, type: e.type });
            }
        });
        return Array.from(map.values());
    }, [events]);

    const toggleInstance = (id: string) => {
        setSelectedInstanceIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Filter events
    const filteredEvents = useMemo(() => {
        return events.filter(e => {
            if (selectedInstanceIds.size > 0 && !selectedInstanceIds.has(e.instanceId)) return false;
            if (typeFilter !== 'all' && e.mediaType !== typeFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                return e.title.toLowerCase().includes(q) || (e.overview && e.overview.toLowerCase().includes(q));
            }
            return true;
        });
    }, [events, selectedInstanceIds, typeFilter, searchQuery]);

    // Group by Date
    const groupedEvents = useMemo(() => {
        const groups: Record<string, CalendarEvent[]> = {};
        filteredEvents.forEach(e => {
            const dateStr = new Date(e.releaseDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(e);
        });
        return groups;
    }, [filteredEvents]);

    return (
        <div className="space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-2xl p-5 sm:p-6 rounded-[2.5rem] shadow-2xl">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        <CalendarIcon size={26} className="text-emerald-500" /> Release Schedule
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1 font-medium">
                        Upcoming movie releases, TV airings, and digital downloads across your libraries.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {/* Media Type Toggle */}
                    <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner">
                        <button
                            onClick={() => setTypeFilter('all')}
                            className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${
                                typeFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            All ({events.length})
                        </button>
                        <button
                            onClick={() => setTypeFilter('movie')}
                            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl transition-all ${
                                typeFilter === 'movie' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <Film size={14} /> Movies
                        </button>
                        <button
                            onClick={() => setTypeFilter('series')}
                            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl transition-all ${
                                typeFilter === 'series' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <Tv size={14} /> Series
                        </button>
                    </div>

                    {/* Instance Pills */}
                    {availableInstances.length > 1 && (
                        <div className="flex flex-wrap bg-zinc-950 p-1 rounded-2xl border border-zinc-800/80 gap-1">
                            {availableInstances.map(inst => {
                                const isSelected = selectedInstanceIds.size === 0 || selectedInstanceIds.has(inst.id);
                                return (
                                    <button
                                        key={inst.id}
                                        onClick={() => toggleInstance(inst.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                            isSelected
                                                ? 'bg-zinc-800 text-white border-zinc-700 shadow-sm'
                                                : 'bg-transparent text-zinc-600 border-transparent hover:text-zinc-400'
                                        }`}
                                    >
                                        {inst.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Calendar Timeline */}
            <div className="space-y-10">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-3 text-zinc-500 font-bold">
                        <Loader2 size={32} className="animate-spin text-emerald-500" />
                        <span>Loading release schedule...</span>
                    </div>
                ) : Object.keys(groupedEvents).length === 0 ? (
                    <div className="p-16 bg-zinc-950/40 rounded-[2.5rem] border border-zinc-900 text-center space-y-2">
                        <CalendarIcon size={40} className="mx-auto text-zinc-700" />
                        <p className="text-lg font-bold text-white">No releases found</p>
                        <p className="text-xs text-zinc-500 font-medium">No upcoming releases match your active filters.</p>
                    </div>
                ) : (
                    Object.entries(groupedEvents).map(([date, dayEvents]) => (
                        <div key={date} className="relative pl-6 sm:pl-10">
                            {/* Glowing Timeline Marker */}
                            <div className="absolute left-0 top-2 w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
                            <div className="absolute left-[5px] top-5 bottom-[-2.5rem] w-0.5 bg-zinc-800/80" />

                            <div className="flex items-center gap-3 mb-5">
                                <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">{date}</h2>
                                <span className="bg-zinc-900 border border-zinc-800 text-zinc-500 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                                    {dayEvents.length} {dayEvents.length === 1 ? 'release' : 'releases'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {dayEvents.map(ev => {
                                    const countdown = getCountdownLabel(ev.releaseDate);
                                    const poster = ev.posterUrl;

                                    return (
                                        <div
                                            key={ev.id}
                                            onClick={() => setSelectedEvent(ev)}
                                            className="group relative flex bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 rounded-3xl p-4 gap-4 transition-all duration-300 hover:bg-zinc-900/50 shadow-xl cursor-pointer hover:-translate-y-0.5"
                                        >
                                            {/* Poster Thumbnail */}
                                            <div className="w-16 sm:w-20 aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 shrink-0 border border-white/5 shadow-md group-hover:scale-105 transition-transform">
                                                {poster ? (
                                                    <img
                                                        src={poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(poster)}` : poster}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-800">
                                                        {ev.mediaType === 'series' ? <Tv size={24} /> : <Film size={24} />}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Media Info */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${countdown.color}`}>
                                                            {countdown.label}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${
                                                            ev.releaseType === 'cinemas' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                                                            ev.releaseType === 'physical' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                                                            ev.releaseType === 'digital' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                                            'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                        }`}>
                                                            {ev.releaseType === 'cinemas' ? 'In Cinemas' : ev.releaseType === 'physical' ? 'Physical' : ev.releaseType === 'digital' ? 'Digital' : 'TV Broadcast'}
                                                        </span>
                                                    </div>

                                                    <h3 className="font-bold text-white text-base leading-snug line-clamp-2 group-hover:text-emerald-400 transition-colors">
                                                        {ev.title}
                                                    </h3>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold pt-2 border-t border-zinc-900/60 mt-2">
                                                    <span className="truncate max-w-[120px]">{ev.instanceName}</span>
                                                    {ev.hasFile ? (
                                                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                                                            <CheckCircle2 size={12} /> Available
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-600 font-medium">Scheduled</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {selectedEvent && (
                <MediaDetailsPanel
                    item={selectedEvent.mediaItem}
                    tmdbApiKey={''}
                    libStatus={{
                        exists: true,
                        hasFile: selectedEvent.hasFile,
                        isDownloading: false,
                        sizeOnDisk: 0,
                        percentage: selectedEvent.hasFile ? 100 : 0,
                        instances: [{ id: selectedEvent.instanceId, name: selectedEvent.instanceName }]
                    }}
                    onClose={() => setSelectedEvent(null)}
                    onAdd={() => {}}
                    onDelete={() => {}}
                    onTransfer={() => {}}
                />
            )}
        </div>
    );
}

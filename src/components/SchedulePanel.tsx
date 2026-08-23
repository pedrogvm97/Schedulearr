'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Calendar as CalendarIcon, Filter, PlayCircle, Loader2, Film, Tv, Clock, CheckCircle2,
    Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown,
    Sparkles, TrendingUp, BarChart3, Disc, LayoutGrid, List, Layers, Eye, RefreshCw,
    AlertCircle, Check, X, Flame, Download, CheckCircle, Radio
} from 'lucide-react';
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

    if (diffDays === 0) return { label: 'Today', isToday: true, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-black' };
    if (diffDays === 1) return { label: 'Tomorrow', isToday: false, color: 'bg-sky-500/20 text-sky-400 border-sky-500/40 font-bold' };
    if (diffDays > 1 && diffDays <= 7) return { label: `In ${diffDays} days`, isToday: false, color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40 font-bold' };
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d ago`, isToday: false, color: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
    return { label: `In ${diffDays}d`, isToday: false, color: 'bg-zinc-800/80 text-zinc-400 border-zinc-700' };
}

function formatDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
}

export function SchedulePanel() {
    // Active Date Range state (defaults: 14 days ago to 45 days in future)
    const [startDate, setStartDate] = useState<Date>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        d.setHours(0, 0, 0, 0);
        return d;
    });
    const [endDate, setEndDate] = useState<Date>(() => {
        const d = new Date();
        d.setDate(d.getDate() + 45);
        d.setHours(23, 59, 59, 999);
        return d;
    });

    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingEarlier, setLoadingEarlier] = useState(false);
    const [loadingFuture, setLoadingFuture] = useState(false);

    // Filters and Display Modes
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set());
    const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'hasFile' | 'missing'>('all');
    const [releaseTypeFilter, setReleaseTypeFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'timeline' | 'grid' | 'compact'>('timeline');
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [activePreset, setActivePreset] = useState<string>('default');

    // Mini calendar month cursor for right panel
    const [miniCalMonth, setMiniCalMonth] = useState<Date>(new Date());

    const todayRef = useRef<HTMLDivElement>(null);

    // Fetch Calendar Events for active date range
    const fetchCalendarRange = useCallback(async (start: Date, end: Date, isEarlier = false, isFuture = false) => {
        if (isEarlier) setLoadingEarlier(true);
        else if (isFuture) setLoadingFuture(true);
        else setLoading(true);

        try {
            const startStr = formatDateKey(start);
            const endStr = formatDateKey(end);

            const res = await fetch(`/api/calendar?start=${startStr}&end=${endStr}`);
            if (res.ok) {
                const data: CalendarEvent[] = await res.json();
                if (Array.isArray(data)) {
                    setEvents(prev => {
                        // Deduplicate events by id
                        const map = new Map<string, CalendarEvent>();
                        if (isEarlier || isFuture) {
                            prev.forEach(e => map.set(e.id, e));
                        }
                        data.forEach(e => map.set(e.id, e));
                        return Array.from(map.values()).sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch calendar events', e);
        } finally {
            setLoading(false);
            setLoadingEarlier(false);
            setLoadingFuture(false);
        }
    }, []);

    // Initial load and range change
    useEffect(() => {
        fetchCalendarRange(startDate, endDate);
    }, [startDate, endDate, fetchCalendarRange]);

    // Time Navigation Actions
    const handleShiftTime = (days: number) => {
        setActivePreset('custom');
        setStartDate(prev => {
            const next = new Date(prev);
            next.setDate(next.getDate() + days);
            return next;
        });
        setEndDate(prev => {
            const next = new Date(prev);
            next.setDate(next.getDate() + days);
            return next;
        });
    };

    const handleLoadEarlier = () => {
        const newStart = new Date(startDate);
        newStart.setDate(newStart.getDate() - 30);
        setStartDate(newStart);
        fetchCalendarRange(newStart, startDate, true, false);
    };

    const handleLoadMoreFuture = () => {
        const newEnd = new Date(endDate);
        newEnd.setDate(newEnd.getDate() + 30);
        setEndDate(newEnd);
        fetchCalendarRange(endDate, newEnd, false, true);
    };

    const handleJumpToToday = () => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 14);
        const end = new Date(now);
        end.setDate(now.getDate() + 45);
        setActivePreset('default');
        setStartDate(start);
        setEndDate(end);
        setMiniCalMonth(new Date());

        setTimeout(() => {
            if (todayRef.current) {
                todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    const handleApplyPreset = (preset: string) => {
        setActivePreset(preset);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (preset === 'past30') {
            const start = new Date(now);
            start.setDate(start.getDate() - 30);
            setStartDate(start);
            setEndDate(now);
        } else if (preset === 'past90') {
            const start = new Date(now);
            start.setDate(start.getDate() - 90);
            setStartDate(start);
            setEndDate(now);
        } else if (preset === 'thisMonth') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            setStartDate(start);
            setEndDate(end);
            setMiniCalMonth(start);
        } else if (preset === 'next30') {
            const end = new Date(now);
            end.setDate(end.getDate() + 30);
            setStartDate(now);
            setEndDate(end);
        } else if (preset === 'next90') {
            const end = new Date(now);
            end.setDate(end.getDate() + 90);
            setStartDate(now);
            setEndDate(end);
        } else if (preset === 'default') {
            const start = new Date(now);
            start.setDate(start.getDate() - 14);
            const end = new Date(now);
            end.setDate(end.getDate() + 45);
            setStartDate(start);
            setEndDate(end);
        }
    };

    // Extract unique instances from events
    const availableInstances = useMemo(() => {
        const map = new Map<string, { id: string, name: string, color: string, type: 'radarr' | 'sonarr', count: number }>();
        events.forEach(e => {
            if (!map.has(e.instanceId)) {
                map.set(e.instanceId, { id: e.instanceId, name: e.instanceName, color: e.instanceColor, type: e.type, count: 0 });
            }
            map.get(e.instanceId)!.count += 1;
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
            if (statusFilter === 'hasFile' && !e.hasFile) return false;
            if (statusFilter === 'missing' && e.hasFile) return false;
            if (releaseTypeFilter !== 'all' && e.releaseType !== releaseTypeFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                return (
                    e.title.toLowerCase().includes(q) ||
                    (e.seriesTitle && e.seriesTitle.toLowerCase().includes(q)) ||
                    (e.episodeTitle && e.episodeTitle.toLowerCase().includes(q)) ||
                    (e.overview && e.overview.toLowerCase().includes(q)) ||
                    (e.genres && e.genres.some(g => g.toLowerCase().includes(q)))
                );
            }
            return true;
        });
    }, [events, selectedInstanceIds, typeFilter, statusFilter, releaseTypeFilter, searchQuery]);

    // Group by Date for Timeline View with multi-episode consolidation
    const groupedEvents = useMemo(() => {
        const groups: Record<string, {
            date: Date;
            dateStr: string;
            isToday: boolean;
            isPast: boolean;
            events: CalendarEvent[];
            consolidated: {
                id: string;
                isMultiEpisode: boolean;
                mediaType: 'movie' | 'series';
                seriesTitle?: string;
                title: string;
                releaseDate: string;
                releaseType: 'digital' | 'physical' | 'cinemas' | 'tv';
                monitored: boolean;
                hasFile: boolean;
                overview: string;
                posterUrl?: string;
                instanceName: string;
                episodes: CalendarEvent[];
                primaryEvent: CalendarEvent;
            }[];
        }> = {};
        const todayStr = formatDateKey(new Date());

        filteredEvents.forEach(e => {
            const eventDate = new Date(e.releaseDate);
            const dateKey = formatDateKey(eventDate);
            const dateLabel = eventDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

            if (!groups[dateKey]) {
                groups[dateKey] = {
                    date: eventDate,
                    dateStr: dateLabel,
                    isToday: dateKey === todayStr,
                    isPast: eventDate.getTime() < new Date().setHours(0, 0, 0, 0),
                    events: [],
                    consolidated: []
                };
            }
            groups[dateKey].events.push(e);
        });

        // Consolidate multiple episodes of the same show on each day
        Object.values(groups).forEach(group => {
            const showMap = new Map<string, typeof group.consolidated[0]>();
            const items: typeof group.consolidated = [];

            group.events.forEach(e => {
                if (e.mediaType === 'series') {
                    const cleanShowName = (e.seriesTitle || e.title.split(/[-–—]|s\d+e\d+/i)[0] || e.title).trim();
                    const showKey = cleanShowName.toLowerCase();

                    if (!showMap.has(showKey)) {
                        const entry: typeof group.consolidated[0] = {
                            id: e.id,
                            isMultiEpisode: false,
                            mediaType: 'series',
                            seriesTitle: cleanShowName,
                            title: cleanShowName,
                            releaseDate: e.releaseDate,
                            releaseType: e.releaseType,
                            monitored: e.monitored,
                            hasFile: e.hasFile,
                            overview: e.overview,
                            posterUrl: e.posterUrl,
                            instanceName: e.instanceName,
                            episodes: [e],
                            primaryEvent: e
                        };
                        showMap.set(showKey, entry);
                        items.push(entry);
                    } else {
                        const existing = showMap.get(showKey)!;
                        existing.isMultiEpisode = true;
                        existing.episodes.push(e);
                        if (e.hasFile) existing.hasFile = true;
                    }
                } else {
                    items.push({
                        id: e.id,
                        isMultiEpisode: false,
                        mediaType: 'movie',
                        title: e.title,
                        releaseDate: e.releaseDate,
                        releaseType: e.releaseType,
                        monitored: e.monitored,
                        hasFile: e.hasFile,
                        overview: e.overview,
                        posterUrl: e.posterUrl,
                        instanceName: e.instanceName,
                        episodes: [e],
                        primaryEvent: e
                    });
                }
            });

            // Sort episodes in multi-episode shows
            items.forEach(it => {
                if (it.episodes.length > 1) {
                    it.episodes.sort((a, b) => ((a.seasonNumber || 1) * 1000 + (a.episodeNumber || 1)) - ((b.seasonNumber || 1) * 1000 + (b.episodeNumber || 1)));
                }
            });

            group.consolidated = items;
        });

        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [filteredEvents]);

    // Analytics / Stats Calculations
    const stats = useMemo(() => {
        const total = filteredEvents.length;
        const movies = filteredEvents.filter(e => e.mediaType === 'movie').length;
        const series = filteredEvents.filter(e => e.mediaType === 'series').length;
        const available = filteredEvents.filter(e => e.hasFile).length;
        const missing = total - available;
        const percentage = total > 0 ? Math.round((available / total) * 100) : 0;

        const cinemas = filteredEvents.filter(e => e.releaseType === 'cinemas').length;
        const digital = filteredEvents.filter(e => e.releaseType === 'digital').length;
        const physical = filteredEvents.filter(e => e.releaseType === 'physical').length;
        const tv = filteredEvents.filter(e => e.releaseType === 'tv').length;

        return { total, movies, series, available, missing, percentage, cinemas, digital, physical, tv };
    }, [filteredEvents]);

    // Upcoming Releases Highlight (Next 6 within the next 14 days)
    const upcomingHighlights = useMemo(() => {
        const now = new Date().setHours(0, 0, 0, 0);
        return filteredEvents
            .filter(e => new Date(e.releaseDate).getTime() >= now)
            .slice(0, 6);
    }, [filteredEvents]);

    // Recently Available / Ready to Watch (hasFile: true)
    const recentlyAvailable = useMemo(() => {
        return filteredEvents
            .filter(e => e.hasFile)
            .slice(-6)
            .reverse();
    }, [filteredEvents]);

    // Mini Calendar Days Matrix
    const miniCalendarDays = useMemo(() => {
        const year = miniCalMonth.getFullYear();
        const month = miniCalMonth.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        // Map releases count per day
        const releaseMap = new Map<string, number>();
        events.forEach(e => {
            const key = formatDateKey(new Date(e.releaseDate));
            releaseMap.set(key, (releaseMap.get(key) || 0) + 1);
        });

        const days: { date: Date; dateKey: string; isCurrentMonth: boolean; count: number; isToday: boolean }[] = [];
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday

        // Previous month padding
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const d = new Date(year, month, -i);
            const key = formatDateKey(d);
            days.push({
                date: d,
                dateKey: key,
                isCurrentMonth: false,
                count: releaseMap.get(key) || 0,
                isToday: key === formatDateKey(new Date())
            });
        }

        // Current month days
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const d = new Date(year, month, i);
            const key = formatDateKey(d);
            days.push({
                date: d,
                dateKey: key,
                isCurrentMonth: true,
                count: releaseMap.get(key) || 0,
                isToday: key === formatDateKey(new Date())
            });
        }

        // Next month padding to fill grid
        const remaining = 35 - days.length > 0 ? 35 - days.length : (42 - days.length > 0 ? 42 - days.length : 0);
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            const key = formatDateKey(d);
            days.push({
                date: d,
                dateKey: key,
                isCurrentMonth: false,
                count: releaseMap.get(key) || 0,
                isToday: key === formatDateKey(new Date())
            });
        }

        return days;
    }, [miniCalMonth, events]);

    const handleScrollToDate = (dateKey: string) => {
        const el = document.getElementById(`timeline-date-${dateKey}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <div className="space-y-6">
            {/* ── Main Top Command & Time Navigation Bar ── */}
            <div className="bg-[#09090b]/90 border border-zinc-800/80 backdrop-blur-2xl p-5 sm:p-7 rounded-[2.5rem] shadow-2xl space-y-5">
                {/* Title & Time Navigator Header */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                <CalendarIcon size={28} />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                                    Release Schedule
                                </h1>
                                <p className="text-sm sm:text-base text-zinc-400 mt-0.5 font-medium">
                                    Browse upcoming movie releases, TV broadcasts, and digital downloads across time.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner">
                        {[
                            { id: 'past90', label: 'Past 90d' },
                            { id: 'past30', label: 'Past 30d' },
                            { id: 'thisMonth', label: 'This Month' },
                            { id: 'default', label: 'Recent & Upcoming' },
                            { id: 'next30', label: 'Next 30d' },
                            { id: 'next90', label: 'Next 90d' }
                        ].map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleApplyPreset(p.id)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    activePreset === p.id
                                        ? 'bg-emerald-500 text-black font-black shadow-md'
                                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Interactive Time Machine Navigator Bar */}
                <div className="p-3 sm:p-4 rounded-3xl bg-zinc-950 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-inner">
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => handleShiftTime(-30)}
                            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold flex items-center gap-1 transition-all"
                            title="Shift backwards by 30 days"
                        >
                            <ChevronsLeft size={16} /> -30d
                        </button>
                        <button
                            onClick={() => handleShiftTime(-7)}
                            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold flex items-center gap-1 transition-all"
                            title="Shift backwards by 1 week"
                        >
                            <ChevronLeft size={16} /> -7d
                        </button>

                        <button
                            onClick={handleJumpToToday}
                            className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm"
                            title="Jump to Today's releases"
                        >
                            <Flame size={15} /> Jump to Today
                        </button>

                        <button
                            onClick={() => handleShiftTime(7)}
                            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold flex items-center gap-1 transition-all"
                            title="Shift forward by 1 week"
                        >
                            +7d <ChevronRight size={16} />
                        </button>
                        <button
                            onClick={() => handleShiftTime(30)}
                            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold flex items-center gap-1 transition-all"
                            title="Shift forward by 30 days"
                        >
                            +30d <ChevronsRight size={16} />
                        </button>
                    </div>

                    {/* Active Range Indicator */}
                    <div className="flex items-center gap-2 text-sm font-bold text-white bg-zinc-900/80 px-4 py-2 rounded-2xl border border-zinc-800">
                        <Clock size={16} className="text-emerald-400 shrink-0" />
                        <span className="truncate">
                            {startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            {'  ➔  '}
                            {endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="ml-2 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-black border border-emerald-500/25">
                            {filteredEvents.length} {filteredEvents.length === 1 ? 'item' : 'items'}
                        </span>
                    </div>

                    {/* View Switcher */}
                    <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                viewMode === 'timeline' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                            title="Timeline View"
                        >
                            <Layers size={15} /> Timeline
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                viewMode === 'grid' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                            title="Calendar Grid View"
                        >
                            <LayoutGrid size={15} /> Grid
                        </button>
                        <button
                            onClick={() => setViewMode('compact')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                viewMode === 'compact' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                            title="Compact List View"
                        >
                            <List size={15} /> Compact
                        </button>
                    </div>
                </div>

                {/* Filter and Search Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[240px] max-w-md">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Filter by title, series, episode, or genre..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-500 transition-colors"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Media Type Filter */}
                        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                    typeFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setTypeFilter('movie')}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                    typeFilter === 'movie' ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <Film size={13} /> Movies ({stats.movies})
                            </button>
                            <button
                                onClick={() => setTypeFilter('series')}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                    typeFilter === 'series' ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <Tv size={13} /> Series ({stats.series})
                            </button>
                        </div>

                        {/* Status Filter */}
                        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                            <button
                                onClick={() => setStatusFilter('all')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                    statusFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                All Status
                            </button>
                            <button
                                onClick={() => setStatusFilter('hasFile')}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                    statusFilter === 'hasFile' ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <CheckCircle2 size={13} /> Available ({stats.available})
                            </button>
                            <button
                                onClick={() => setStatusFilter('missing')}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                    statusFilter === 'missing' ? 'bg-amber-600/30 text-amber-400 border border-amber-500/40 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <Clock size={13} /> Scheduled ({stats.missing})
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Multi-Dimensional 2-Column Grid Layout (8 cols left, 4 cols right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start">
                {/* ── Left Column: Timeline / Grid Main Stream (8 Cols) ── */}
                <div className="lg:col-span-8 xl:col-span-8 2xl:col-span-8 space-y-6">
                    {/* Top Infinite Load Earlier Releases Button */}
                    <div className="text-center">
                        <button
                            onClick={handleLoadEarlier}
                            disabled={loadingEarlier}
                            className="w-full py-3.5 px-6 rounded-2xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
                        >
                            {loadingEarlier ? (
                                <Loader2 size={16} className="animate-spin text-emerald-400" />
                            ) : (
                                <ArrowUp size={16} className="text-emerald-400" />
                            )}
                            <span>{loadingEarlier ? 'Loading past releases...' : '⬆ Load Earlier Releases (Past 30 Days)'}</span>
                        </button>
                    </div>

                    {/* Main Content Area */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-40 gap-4 bg-zinc-950/40 border border-zinc-900 rounded-[2.5rem] text-zinc-400 font-bold">
                            <Loader2 size={36} className="animate-spin text-emerald-500" />
                            <span className="text-base">Fetching releases across instances...</span>
                        </div>
                    ) : groupedEvents.length === 0 ? (
                        <div className="p-16 bg-zinc-950/50 rounded-[2.5rem] border border-zinc-900 text-center space-y-3 shadow-xl">
                            <CalendarIcon size={44} className="mx-auto text-zinc-700" />
                            <p className="text-xl font-bold text-white">No releases found</p>
                            <p className="text-sm text-zinc-400 max-w-md mx-auto font-medium">
                                No movies or episodes match your active date window and filters. Use the controls above to load earlier or later dates.
                            </p>
                            <button
                                onClick={handleJumpToToday}
                                className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-black text-xs uppercase tracking-wider"
                            >
                                Reset to Today
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* TIMELINE VIEW */}
                            {viewMode === 'timeline' && (
                                groupedEvents.map(([dateKey, group]) => {
                                    const hasManyReleases = group.consolidated.length > 3;

                                    return (
                                        <div
                                            key={dateKey}
                                            id={`timeline-date-${dateKey}`}
                                            ref={group.isToday ? todayRef : null}
                                            className={`relative pl-6 sm:pl-10 transition-all ${
                                                group.isToday ? 'p-4 sm:p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/30' : ''
                                            }`}
                                        >
                                            {/* Glowing Timeline Node */}
                                            <div className={`absolute left-0 top-3 w-3.5 h-3.5 rounded-full ${
                                                group.isToday
                                                    ? 'bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.9)] animate-pulse ring-4 ring-emerald-500/20'
                                                    : group.isPast
                                                        ? 'bg-zinc-700'
                                                        : 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]'
                                            }`} />
                                            <div className="absolute left-[6px] top-6 bottom-[-2rem] w-0.5 bg-zinc-800/80" />

                                            {/* Date Group Header */}
                                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                                <div className="flex items-center gap-3">
                                                    <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                                                        {group.dateStr}
                                                        {group.isToday && (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest shadow-md">
                                                                TODAY
                                                            </span>
                                                        )}
                                                    </h2>
                                                </div>

                                                <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full">
                                                    {group.events.length} {group.events.length === 1 ? 'release' : 'releases'}
                                                    {hasManyReleases && ' • Swipe ↔'}
                                                </span>
                                            </div>

                                            {/* Release Cards: Laterally scrollable if >3 releases, otherwise responsive grid */}
                                            <div className={
                                                hasManyReleases
                                                    ? 'flex items-stretch gap-4 overflow-x-auto pb-4 pt-1 custom-scrollbar snap-x'
                                                    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
                                            }>
                                                {group.consolidated.map(item => {
                                                    const countdown = getCountdownLabel(item.releaseDate);
                                                    const poster = item.posterUrl;

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => setSelectedEvent(item.primaryEvent)}
                                                            className={`group relative flex bg-zinc-950/70 border border-zinc-900 hover:border-zinc-700 rounded-3xl p-4 gap-4 transition-all duration-300 hover:bg-zinc-900/60 shadow-xl cursor-pointer hover:-translate-y-1 ${
                                                                hasManyReleases ? 'min-w-[300px] sm:min-w-[330px] max-w-[350px] shrink-0 snap-start' : ''
                                                            }`}
                                                        >
                                                            {/* Poster Thumbnail */}
                                                            <div className="w-20 sm:w-24 aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 shrink-0 border border-white/5 shadow-lg group-hover:scale-105 transition-transform relative">
                                                                {poster ? (
                                                                    <img
                                                                        src={poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(poster)}` : poster}
                                                                        alt=""
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                                        {item.mediaType === 'series' ? <Tv size={28} /> : <Film size={28} />}
                                                                    </div>
                                                                )}
                                                                {item.hasFile && (
                                                                    <div className="absolute top-1.5 right-1.5 p-1 rounded-full bg-emerald-500 text-black shadow-md">
                                                                        <Check size={11} className="stroke-[3]" />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Media Info */}
                                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] border uppercase tracking-wider ${countdown.color}`}>
                                                                            {countdown.label}
                                                                        </span>
                                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${
                                                                            item.releaseType === 'cinemas' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' :
                                                                            item.releaseType === 'physical' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                                                                            item.releaseType === 'digital' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                                                                            'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                                                        }`}>
                                                                            {item.releaseType === 'cinemas' ? 'In Cinemas' : item.releaseType === 'physical' ? 'Physical' : item.releaseType === 'digital' ? 'Digital VOD' : 'TV Airing'}
                                                                        </span>
                                                                        {item.isMultiEpisode && (
                                                                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black">
                                                                                {item.episodes.length} Episodes
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <h3 className="font-black text-white text-base leading-snug line-clamp-2 group-hover:text-emerald-400 transition-colors">
                                                                        {item.title}
                                                                    </h3>

                                                                    {item.isMultiEpisode ? (
                                                                        <div className="space-y-1 pt-1">
                                                                            {item.episodes.slice(0, 3).map(ep => (
                                                                                <div key={ep.id} className="text-[11px] text-zinc-400 font-semibold truncate flex items-center gap-1.5">
                                                                                    <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                                                                                        S{ep.seasonNumber}E{ep.episodeNumber}
                                                                                    </span>
                                                                                    <span className="truncate">{ep.episodeTitle || ep.title}</span>
                                                                                </div>
                                                                            ))}
                                                                            {item.episodes.length > 3 && (
                                                                                <div className="text-[10px] text-zinc-500 font-bold">
                                                                                    +{item.episodes.length - 3} more episodes
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : item.overview ? (
                                                                        <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed font-medium">
                                                                            {item.overview}
                                                                        </p>
                                                                    ) : null}
                                                                </div>

                                                                <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold pt-2 border-t border-zinc-900/80 mt-3">
                                                                    <span className="truncate max-w-[120px]">{item.instanceName}</span>
                                                                    {item.hasFile ? (
                                                                        <span className="text-emerald-400 font-black flex items-center gap-1">
                                                                            <CheckCircle2 size={13} /> On Disk
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-zinc-500 font-medium flex items-center gap-1">
                                                                            <Clock size={12} /> Scheduled
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            )}

                            {/* GRID VIEW (Compact Poster Grid) */}
                            {viewMode === 'grid' && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {filteredEvents.map(ev => {
                                        const countdown = getCountdownLabel(ev.releaseDate);
                                        const poster = ev.posterUrl;

                                        return (
                                            <div
                                                key={ev.id}
                                                onClick={() => setSelectedEvent(ev)}
                                                className="group relative bg-zinc-950 border border-zinc-900 hover:border-zinc-700 rounded-3xl overflow-hidden flex flex-col shadow-xl cursor-pointer hover:-translate-y-1 transition-all"
                                            >
                                                <div className="aspect-[2/3] bg-zinc-900 overflow-hidden relative">
                                                    {poster ? (
                                                        <img
                                                            src={poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(poster)}` : poster}
                                                            alt=""
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                            {ev.mediaType === 'series' ? <Tv size={36} /> : <Film size={36} />}
                                                        </div>
                                                    )}
                                                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border uppercase tracking-wider backdrop-blur-md ${countdown.color}`}>
                                                            {countdown.label}
                                                        </span>
                                                    </div>
                                                    {ev.hasFile && (
                                                        <div className="absolute top-2 right-2 p-1 rounded-full bg-emerald-500 text-black shadow-md">
                                                            <Check size={12} className="stroke-[3]" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                                                    <h3 className="font-bold text-white text-sm line-clamp-1 group-hover:text-emerald-400 transition-colors">
                                                        {ev.title}
                                                    </h3>
                                                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold pt-1 border-t border-zinc-900">
                                                        <span className="truncate">{new Date(ev.releaseDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                                        <span className={ev.hasFile ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                                                            {ev.hasFile ? 'Available' : 'Pending'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* COMPACT LIST VIEW */}
                            {viewMode === 'compact' && (
                                <div className="p-2 rounded-3xl bg-zinc-950 border border-zinc-900 divide-y divide-zinc-900 overflow-hidden shadow-xl">
                                    {filteredEvents.map(ev => {
                                        const countdown = getCountdownLabel(ev.releaseDate);
                                        return (
                                            <div
                                                key={ev.id}
                                                onClick={() => setSelectedEvent(ev)}
                                                className="p-3.5 sm:p-4 hover:bg-zinc-900/60 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                                            >
                                                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                    <div className="w-10 h-14 rounded-xl bg-zinc-900 overflow-hidden shrink-0 border border-white/5">
                                                        {ev.posterUrl ? (
                                                            <img
                                                                src={ev.posterUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(ev.posterUrl)}` : ev.posterUrl}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                                {ev.mediaType === 'series' ? <Tv size={16} /> : <Film size={16} />}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-black text-white truncate hover:text-emerald-400 transition-colors">
                                                            {ev.title}
                                                        </h3>
                                                        <p className="text-xs text-zinc-500 flex items-center gap-2">
                                                            <span>{new Date(ev.releaseDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                            <span>•</span>
                                                            <span>{ev.instanceName}</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2.5 shrink-0">
                                                    <span className={`px-2.5 py-1 rounded-xl text-xs border uppercase tracking-wider ${countdown.color}`}>
                                                        {countdown.label}
                                                    </span>
                                                    {ev.hasFile ? (
                                                        <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-black border border-emerald-500/30 flex items-center gap-1">
                                                            <CheckCircle2 size={13} /> On Disk
                                                        </span>
                                                    ) : (
                                                        <span className="px-3 py-1 rounded-xl bg-zinc-900 text-zinc-500 text-xs font-bold border border-zinc-800">
                                                            Scheduled
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom Infinite Load More Future Releases Button */}
                    <div className="text-center pt-2">
                        <button
                            onClick={handleLoadMoreFuture}
                            disabled={loadingFuture}
                            className="w-full py-3.5 px-6 rounded-2xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
                        >
                            {loadingFuture ? (
                                <Loader2 size={16} className="animate-spin text-emerald-400" />
                            ) : (
                                <ArrowDown size={16} className="text-emerald-400" />
                            )}
                            <span>{loadingFuture ? 'Loading future releases...' : '⬇ Load More Upcoming Releases (Next 30 Days)'}</span>
                        </button>
                    </div>
                </div>

                {/* ── Right Column: Sidebar Dashboard & Widgets (4 Cols) ── */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-4 space-y-6 sticky top-6">
                    {/* Widget 1: Schedule Analytics & Progress Gauge */}
                    <div className="p-6 rounded-[2.5rem] bg-[#0c0c0e] border border-zinc-800 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                            <span className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-2">
                                <BarChart3 size={16} /> Schedule Statistics
                            </span>
                            <span className="text-xs text-zinc-500 font-bold">Active Window</span>
                        </div>

                        {/* Progress Bar for Available on disk */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-zinc-400">Library Availability:</span>
                                <span className="text-emerald-400 font-black">{stats.percentage}% ({stats.available} / {stats.total})</span>
                            </div>
                            <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                                    style={{ width: `${stats.percentage}%` }}
                                />
                            </div>
                        </div>

                        {/* Distribution Matrix */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-900 space-y-0.5">
                                <span className="text-zinc-500 font-bold block">Movies</span>
                                <span className="text-lg font-black text-white">{stats.movies}</span>
                            </div>
                            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-900 space-y-0.5">
                                <span className="text-zinc-500 font-bold block">Series Episodes</span>
                                <span className="text-lg font-black text-white">{stats.series}</span>
                            </div>
                            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-900 space-y-0.5">
                                <span className="text-zinc-500 font-bold block">Digital VOD</span>
                                <span className="text-lg font-black text-blue-400">{stats.digital}</span>
                            </div>
                            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-900 space-y-0.5">
                                <span className="text-zinc-500 font-bold block">In Cinemas</span>
                                <span className="text-lg font-black text-purple-400">{stats.cinemas}</span>
                            </div>
                        </div>
                    </div>

                    {/* Widget 2: Interactive Mini-Calendar Heatmap */}
                    <div className="p-6 rounded-[2.5rem] bg-[#0c0c0e] border border-zinc-800 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                            <span className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                                <CalendarIcon size={16} /> Calendar
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        const d = new Date(miniCalMonth);
                                        d.setMonth(d.getMonth() - 1);
                                        setMiniCalMonth(d);
                                    }}
                                    className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="text-xs font-bold text-white px-2">
                                    {miniCalMonth.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                </span>
                                <button
                                    onClick={() => {
                                        const d = new Date(miniCalMonth);
                                        d.setMonth(d.getMonth() + 1);
                                        setMiniCalMonth(d);
                                    }}
                                    className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Mini Calendar Grid */}
                        <div className="space-y-1 text-center text-xs">
                            <div className="grid grid-cols-7 gap-1 font-bold text-zinc-600 text-[11px] pb-1">
                                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {miniCalendarDays.map((day, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleScrollToDate(day.dateKey)}
                                        className={`p-2 rounded-xl text-xs font-bold relative flex flex-col items-center justify-center transition-all ${
                                            day.isToday
                                                ? 'bg-emerald-500 text-black font-black shadow-md'
                                                : day.count > 0
                                                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white font-bold'
                                                    : day.isCurrentMonth
                                                        ? 'text-zinc-500 hover:text-zinc-300'
                                                        : 'text-zinc-800'
                                        }`}
                                    >
                                        <span>{day.date.getDate()}</span>
                                        {day.count > 0 && !day.isToday && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-0.5 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Widget 3: Releasing Soon (Countdown Highlights) */}
                    {upcomingHighlights.length > 0 && (
                        <div className="p-6 rounded-[2.5rem] bg-[#0c0c0e] border border-zinc-800 shadow-2xl space-y-4">
                            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                                <span className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
                                    <Flame size={16} /> Releasing Soon
                                </span>
                                <span className="text-xs text-zinc-500 font-bold">Imminent</span>
                            </div>

                            <div className="space-y-3">
                                {upcomingHighlights.map(item => {
                                    const countdown = getCountdownLabel(item.releaseDate);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedEvent(item)}
                                            className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 transition-all flex items-center gap-3 cursor-pointer group shadow-sm"
                                        >
                                            <div className="w-10 h-14 rounded-xl bg-zinc-900 overflow-hidden shrink-0 border border-white/5">
                                                {item.posterUrl ? (
                                                    <img
                                                        src={item.posterUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(item.posterUrl)}` : item.posterUrl}
                                                        alt=""
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                        {item.mediaType === 'series' ? <Tv size={16} /> : <Film size={16} />}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-xs font-black text-white truncate group-hover:text-amber-400 transition-colors">
                                                    {item.title}
                                                </h4>
                                                <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                                                    {new Date(item.releaseDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg text-[9px] border uppercase tracking-wider shrink-0 ${countdown.color}`}>
                                                {countdown.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Widget 4: Ready to Watch / Recently Available */}
                    {recentlyAvailable.length > 0 && (
                        <div className="p-6 rounded-[2.5rem] bg-[#0c0c0e] border border-zinc-800 shadow-2xl space-y-4">
                            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                                <span className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-2">
                                    <CheckCircle2 size={16} /> Ready to Watch
                                </span>
                                <span className="text-xs text-zinc-500 font-bold">On Disk</span>
                            </div>

                            <div className="space-y-3">
                                {recentlyAvailable.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedEvent(item)}
                                        className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 transition-all flex items-center gap-3 cursor-pointer group shadow-sm"
                                    >
                                        <div className="w-10 h-14 rounded-xl bg-zinc-900 overflow-hidden shrink-0 border border-white/5">
                                            {item.posterUrl ? (
                                                <img
                                                    src={item.posterUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(item.posterUrl)}` : item.posterUrl}
                                                    alt=""
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                    {item.mediaType === 'series' ? <Tv size={16} /> : <Film size={16} />}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-xs font-black text-white truncate group-hover:text-emerald-400 transition-colors">
                                                {item.title}
                                            </h4>
                                            <p className="text-[11px] text-zinc-500 truncate mt-0.5">{item.instanceName}</p>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1">
                                            <PlayCircle size={11} /> Play
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Widget 5: Instance Selector Pills */}
                    {availableInstances.length > 1 && (
                        <div className="p-6 rounded-[2.5rem] bg-[#0c0c0e] border border-zinc-800 shadow-2xl space-y-4">
                            <span className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                                <Radio size={16} /> Instances
                            </span>
                            <div className="space-y-2">
                                {availableInstances.map(inst => {
                                    const isSelected = selectedInstanceIds.size === 0 || selectedInstanceIds.has(inst.id);
                                    return (
                                        <button
                                            key={inst.id}
                                            onClick={() => toggleInstance(inst.id)}
                                            className={`w-full p-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between border ${
                                                isSelected
                                                    ? 'bg-zinc-900 text-white border-zinc-700 shadow-sm'
                                                    : 'bg-zinc-950/60 text-zinc-500 border-zinc-900 hover:text-zinc-300'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: inst.color || '#10b981' }} />
                                                {inst.name}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-400 font-bold">
                                                {inst.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Media Details Dialog Modal */}
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


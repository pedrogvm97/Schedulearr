'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, Filter, PlayCircle, Loader2 } from 'lucide-react';
import { MediaDetailsPanel } from '@/components/MediaDetailsPanel';

interface CalendarEvent {
    id: string;
    instanceId: string;
    instanceName: string;
    type: 'radarr' | 'sonarr';
    title: string;
    releaseDate: string;
    releaseType: 'digital' | 'physical' | 'cinemas' | 'tv';
    monitored: boolean;
    hasFile: boolean;
    overview: string;
    mediaItem: any;
}

export function SchedulePanel() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set());
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);
            try {
                const now = new Date();
                const start = now.toISOString().split('T')[0];
                const endDate = new Date();
                endDate.setDate(now.getDate() + 30);
                const end = endDate.toISOString().split('T')[0];

                const res = await fetch(`/api/calendar?start=${start}&end=${end}`);
                if (res.ok) {
                    const data = await res.json();
                    setEvents(data);
                }
            } catch (e) {
                console.error('Failed to fetch calendar events', e);
            } finally {
                setLoading(false);
            }
        };
        fetchEvents();
    }, []);

    // Extract unique instances from events for the filter toggles
    const availableInstances = useMemo(() => {
        const map = new Map<string, { id: string, name: string, type: 'radarr' | 'sonarr' }>();
        events.forEach(e => {
            if (!map.has(e.instanceId)) {
                map.set(e.instanceId, { id: e.instanceId, name: e.instanceName, type: e.type });
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

    // Filter events by selected instances (if none selected, show all)
    const filteredEvents = useMemo(() => {
        if (selectedInstanceIds.size === 0) return events;
        return events.filter(e => selectedInstanceIds.has(e.instanceId));
    }, [events, selectedInstanceIds]);

    // Group by Date string
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                        <CalendarIcon className="text-emerald-500" /> Upcoming Releases
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">Schedules for the next 30 days across your libraries.</p>
                </div>
            </div>

            {/* Filter Toggles */}
            {availableInstances.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                    <Filter size={14} className="text-zinc-500 mr-2" />
                    {availableInstances.map(inst => {
                        const active = selectedInstanceIds.size === 0 || selectedInstanceIds.has(inst.id);
                        return (
                            <button
                                key={inst.id}
                                onClick={() => toggleInstance(inst.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                                    active
                                        ? inst.type === 'radarr' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                        : 'bg-zinc-950 border-zinc-800/80 text-zinc-600 hover:text-zinc-400'
                                }`}
                            >
                                {inst.name}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Calendar Timeline */}
            <div className="space-y-8">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-zinc-500 gap-3">
                        <Loader2 className="animate-spin" /> Loading schedule...
                    </div>
                ) : Object.keys(groupedEvents).length === 0 ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
                        No upcoming releases found in the next 30 days.
                    </div>
                ) : (
                    Object.entries(groupedEvents).map(([date, dayEvents]) => (
                        <div key={date} className="relative pl-4 sm:pl-8">
                            <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <div className="absolute left-[3px] top-4 bottom-[-2rem] w-px bg-zinc-800/80"></div>
                            
                            <h2 className="text-sm font-black text-white uppercase tracking-wider mb-4">{date}</h2>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {dayEvents.map(ev => (
                                    <button
                                        key={ev.id}
                                        onClick={() => setSelectedEvent(ev)}
                                        className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-all hover:bg-zinc-800/50 flex flex-col gap-2 group"
                                    >
                                        <div className="flex items-start justify-between gap-2 w-full">
                                            <span className="font-bold text-zinc-200 line-clamp-2 text-sm leading-tight">{ev.title}</span>
                                            {ev.hasFile && (
                                                <span className="shrink-0 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase px-1.5 py-0.5 rounded">
                                                    Downloaded
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-2">
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{ev.instanceName}</span>
                                            <span className="text-zinc-700">•</span>
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                                ev.releaseType === 'cinemas' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                                : ev.releaseType === 'physical' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                                : ev.releaseType === 'digital' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            }`}>
                                                {ev.releaseType === 'cinemas' ? 'In Cinemas' : ev.releaseType === 'physical' ? 'Physical' : ev.releaseType === 'digital' ? 'Digital' : 'TV Airing'}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {selectedEvent && (
                <MediaDetailsPanel
                    item={selectedEvent.mediaItem}
                    tmdbApiKey={''}
                    libStatus="Available"
                    onClose={() => setSelectedEvent(null)}
                    onAdd={() => {}}
                    onDelete={() => {}}
                    onTransfer={() => {}}
                />
            )}
        </div>
    );
}

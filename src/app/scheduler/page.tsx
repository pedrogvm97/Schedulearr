'use client';

import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableItem } from '@/components/SortableItem';

const CountdownTimer = ({ nextRun, enabled }: { nextRun: number | null, enabled: boolean }) => {
    const [countdown, setCountdown] = useState<string>('');

    useEffect(() => {
        if (!nextRun || !enabled) {
            setCountdown('');
            return;
        }
        const tick = () => {
            const diff = nextRun - Date.now();
            if (diff <= 0) {
                setCountdown('Search imminent...');
            } else {
                const m = Math.floor(diff / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setCountdown(`${m}m ${s.toString().padStart(2, '0')}s`);
            }
        };
        tick();
        const timerId = setInterval(tick, 1000);
        return () => clearInterval(timerId);
    }, [nextRun, enabled]);

    return (
        <span className={`text-sm font-bold tracking-wider ${enabled && nextRun ? 'text-amber-500' : 'text-zinc-600'}`}>
            {enabled ? (countdown || 'Calculating...') : 'Paused'}
        </span>
    );
};

export default function SchedulerQueue() {
    const [movies, setMovies] = useState<any[]>([]);
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Record<number, string>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [schedulerConfig, setSchedulerConfig] = useState<{ enabled: boolean, interval: number, batchSize: number }>({ enabled: true, interval: 5, batchSize: 10 });
    const [nextRun, setNextRun] = useState<number | null>(null);
    const [searchHistory, setSearchHistory] = useState<any[]>([]);
    const [searchToggles, setSearchToggles] = useState<Record<string, boolean>>({});
    const [selectedGenres, setSelectedGenres] = useState<string[]>(['All']);
    const [instanceFilters, setInstanceFilters] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [qualityFilter, setQualityFilter] = useState('missing'); // 'all', 'missing', 'upgradeable'
    const [profile, setProfile] = useState('recently_added');
    const [orderedIds, setOrderedIds] = useState<string[]>([]);
    const [showActiveOnly, setShowActiveOnly] = useState(false);
    const [showNextBatchOnly, setShowNextBatchOnly] = useState(false);
    const [searchingItems, setSearchingItems] = useState<Record<string, { status: string, isPolling: boolean }>>({});

    // New Feature States
    const [genreLogic, setGenreLogic] = useState<'OR' | 'AND' | 'EXCLUDE'>('OR');
    const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
    const [seriesEpisodes, setSeriesEpisodes] = useState<Record<string, any[]>>({});
    const [loadingEpisodes, setLoadingEpisodes] = useState<Record<string, boolean>>({});

    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isRunningBatch, setIsRunningBatch] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleGenreToggle = (g: string) => {
        if (g === 'All') {
            setSelectedGenres(['All']);
            return;
        }
        setSelectedGenres(prev => {
            const isSelected = prev.includes(g);
            const next = isSelected ? prev.filter(x => x !== g && x !== 'All') : [...prev.filter(x => x !== 'All'), g];
            return next.length === 0 ? ['All'] : next;
        });
    };

    // Fetch data function
    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [movieRes, epRes, profileRes, configRes, historyRes, settingsRes] = await Promise.all([
                fetch('/api/radarr/all'),
                fetch('/api/sonarr/all'),
                fetch('/api/quality'),
                fetch('/api/scheduler/status'),
                fetch('/api/search/history'),
                fetch('/api/settings')
            ]);
            if (movieRes.ok) setMovies(await movieRes.json());
            if (epRes.ok) setEpisodes(await epRes.json());
            if (profileRes.ok) {
                const profileData = await profileRes.json();
                setProfiles(profileData.profiles);
            }
            if (configRes.ok) {
                const data = await configRes.json();
                setSchedulerConfig({ enabled: data.enabled, interval: data.interval, batchSize: data.batchSize });
                if (data.nextRun) setNextRun(data.nextRun);
            }
            if (historyRes.ok) setSearchHistory(await historyRes.json());
            if (settingsRes.ok) {
                const settingsData = await settingsRes.json();
                if (settingsData.priority_profile) setProfile(settingsData.priority_profile);
                if (settingsData.ui_search_toggles) {
                    try {
                        setSearchToggles(JSON.parse(settingsData.ui_search_toggles));
                    } catch (e) { }
                }
                if (settingsData.ui_instance_filters) {
                    try {
                        setInstanceFilters(JSON.parse(settingsData.ui_instance_filters));
                    } catch (e) { }
                }
                if (settingsData.ui_selected_genres) {
                    try {
                        setSelectedGenres(JSON.parse(settingsData.ui_selected_genres));
                    } catch (e) { }
                }
                if (settingsData.ui_genre_logic) setGenreLogic(settingsData.ui_genre_logic);
                if (settingsData.ui_active_only !== undefined) setShowActiveOnly(settingsData.ui_active_only === 'true');
            }
        } catch (e) {
            console.error("Failed to load data", e);
            setError(e instanceof Error ? e.message : String(e));
        }
        setLoading(false);
        setHasUnsavedChanges(false);
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5 * 60 * 1000); // refresh every 5 minutes
        return () => clearInterval(interval);
    }, []);

    // Countdown is handled by CountdownTimer component

    // Auto-refresh the main data shortly after a background search cycle is predicted to finish
    useEffect(() => {
        if (!nextRun || !schedulerConfig.enabled) return;
        const timeToWait = nextRun - Date.now();
        // If the next run is in the future but less than 1 day away, schedule a refresh 5 seconds after it hits
        if (timeToWait > 0 && timeToWait < 86400000) {
            const timeoutId = setTimeout(() => {
                fetchData();
            }, timeToWait + 5000);
            return () => clearTimeout(timeoutId);
        }
    }, [nextRun, schedulerConfig.enabled]);

    // Load persisted UI state on mount
    useEffect(() => {
        const savedState = localStorage.getItem('schedulerUIState');
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                if (parsed.selectedGenres) setSelectedGenres(parsed.selectedGenres);
                if (parsed.instanceFilters) setInstanceFilters(parsed.instanceFilters);
                if (parsed.qualityFilter) setQualityFilter(parsed.qualityFilter);
                if (parsed.showActiveOnly !== undefined) setShowActiveOnly(parsed.showActiveOnly);
                if (parsed.showNextBatchOnly !== undefined) setShowNextBatchOnly(parsed.showNextBatchOnly);
                if (parsed.genreLogic) setGenreLogic(parsed.genreLogic);
            } catch (e) {
                console.error("Failed to parse saved UI state", e);
            }
        }
    }, []);

    // Save UI state locally when it changes for instant UI persisting
    useEffect(() => {
        const stateToSave = {
            selectedGenres,
            instanceFilters,
            qualityFilter,
            showActiveOnly,
            showNextBatchOnly,
            genreLogic
        };
        localStorage.setItem('schedulerUIState', JSON.stringify(stateToSave));
        if (!loading && movies.length > 0) {
            setHasUnsavedChanges(true);
        }
    }, [selectedGenres, instanceFilters, qualityFilter, showActiveOnly, showNextBatchOnly, genreLogic, searchToggles]);

    const handleSaveConfiguration = async () => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            await Promise.all([
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_selected_genres', value: JSON.stringify(selectedGenres) }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_genre_logic', value: genreLogic }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_instance_filters', value: JSON.stringify(instanceFilters) }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_active_only', value: showActiveOnly ? 'true' : 'false' }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_search_toggles', value: JSON.stringify(searchToggles) }) })
            ]);
            setSaveSuccess(true);
            setHasUnsavedChanges(false);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (e) {
            console.error("Failed to sync UI state to database", e);
        }
        setIsSaving(false);
    };

    const handleSelectAll = (filteredItems: any[]) => {
        const updates: Record<string, boolean> = {};
        filteredItems.forEach(item => { updates[item.idStr] = true; });
        setSearchToggles(prev => ({ ...prev, ...updates }));
    };

    const handleDeselectAll = (filteredItems: any[]) => {
        const updates: Record<string, boolean> = {};
        filteredItems.forEach(item => { updates[item.idStr] = false; });
        setSearchToggles(prev => ({ ...prev, ...updates }));
    };

    const fetchSeriesEpisodes = async (instanceId: string, seriesId: number) => {
        const cacheKey = `${instanceId}-${seriesId}`;
        if (seriesEpisodes[cacheKey]) return; // already loaded

        setLoadingEpisodes(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const res = await fetch(`/api/sonarr/episodes?instanceId=${instanceId}&seriesId=${seriesId}`);
            if (res.ok) {
                const data = await res.json();
                setSeriesEpisodes(prev => ({ ...prev, [cacheKey]: data }));
            }
        } catch (e) {
            console.error('Failed to load episodes', e);
        }
        setLoadingEpisodes(prev => ({ ...prev, [cacheKey]: false }));
    };

    const toggleExpandSeries = (item: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (item.type !== 'series') return;

        const cacheKey = `${item.instanceId}-${item.id}`;
        if (expandedSeriesId === cacheKey) {
            setExpandedSeriesId(null);
        } else {
            setExpandedSeriesId(cacheKey);
            fetchSeriesEpisodes(item.instanceId, item.id);
        }
    };

    const toggleSearch = (id: string) => {
        setSearchToggles(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleForceSearch = async (item: any) => {
        setSearchingItems(prev => ({ ...prev, [item.idStr]: { status: 'Triggering...', isPolling: true } }));

        try {
            const res = await fetch('/api/search/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instanceId: item.instanceId, type: item.type, mediaId: item.id })
            });

            if (!res.ok) throw new Error('Trigger failed');

            setSearchingItems(prev => ({ ...prev, [item.idStr]: { status: 'Searching indexers...', isPolling: true } }));

            let tries = 0;
            const maxTries = 10;

            const pollInterval = setInterval(async () => {
                tries++;
                try {
                    const statusRes = await fetch(`/api/search/status?instanceId=${item.instanceId}&type=${item.type}&mediaId=${item.id}`);
                    if (statusRes.ok) {
                        const data = await statusRes.json();
                        if (data.status !== 'Not in queue') {
                            setSearchingItems(prev => ({ ...prev, [item.idStr]: { status: `Grabbed (${data.status})`, isPolling: false } }));

                            // Optimistically update the main data array so it re-filters instantly
                            if (item.type === 'movie') {
                                setMovies(prev => prev.map(m => m.id === item.id && m.instanceId === item.instanceId ? { ...m, isDownloading: true } : m));
                            } else {
                                setEpisodes(prev => prev.map(e => e.id === item.id && e.instanceId === item.instanceId ? { ...e, queuedEpisodeIds: [...(e.queuedEpisodeIds || []), ...e.episodes?.map((ep: any) => ep.id) || []] } : e));
                            }

                            clearInterval(pollInterval);
                            return;
                        }
                    }
                } catch (e) {
                    console.error('Polling error', e);
                }

                if (tries >= maxTries) {
                    setSearchingItems(prev => ({ ...prev, [item.idStr]: { status: 'Finished (Not found)', isPolling: false } }));
                    clearInterval(pollInterval);
                }
            }, 3000);

        } catch (err) {
            console.error(err);
            setSearchingItems(prev => ({ ...prev, [item.idStr]: { status: 'Error', isPolling: false } }));
        }
    };

    const toggleInstance = async (name: string, id: string) => {
        const isCurrentlyEnabled = instanceFilters[id] !== false;

        // Optimistic UI update only. Save settings persists this.
        setInstanceFilters(prev => ({
            ...prev,
            [id]: !isCurrentlyEnabled
        }));
    };

    const handleSaveProfile = async (newProfile: string) => {
        setProfile(newProfile);
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'priority_profile', value: newProfile })
            });
        } catch (e) {
            console.error('Failed to save profile', e);
        }
    };

    // Combine and structure all media
    let combined = [
        ...(Array.isArray(movies) ? movies : []).map(m => ({
            ...m,
            type: 'movie',
            sortDate: new Date(m.added).getTime(),
            idStr: `movie-${m.instanceId}-${m.id}`,
            isDownloaded: m.hasFile,
            targetQualityProfile: profiles?.[m.instanceUrl]?.[m.qualityProfileId] || 'Unknown',
            currentQualityScale: m.movieFile?.quality?.quality?.resolution || 0,
            instanceId: m.instanceId,
            instanceColor: m.instanceColor,
            isDownloading: m.isDownloading || false
        })),
        ...(Array.isArray(episodes) ? episodes : []).map(e => ({
            ...e,
            type: 'series',
            sortDate: new Date(e.added).getTime(),
            idStr: `series-${e.instanceId}-${e.id}`,
            isDownloaded: e.statistics?.percentOfEpisodes === 100,
            stats: e.statistics,
            targetQualityProfile: profiles?.[e.instanceUrl]?.[e.qualityProfileId] || 'Unknown',
            instanceId: e.instanceId,
            instanceColor: e.instanceColor,
            isDownloading: e.queuedEpisodeIds && e.queuedEpisodeIds.length > 0
        }))
    ].sort((a, b) => b.sortDate - a.sortDate);

    // Extract ALL unique genres and instances BEFORE applying active filters so they never disappear
    const allGenres = new Set<string>();
    const allInstances = new Map<string, { id: string, name: string, type: string, color?: string }>();
    combined.forEach(item => {
        if (item.genres && Array.isArray(item.genres)) {
            item.genres.forEach((g: string) => allGenres.add(g));
        }
        if (item.instanceName && item.instanceId) {
            allInstances.set(item.instanceId, { id: item.instanceId, name: item.instanceName, type: item.type, color: item.instanceColor });
        }
    });
    const uniqueGenres = ['All', ...Array.from(allGenres).sort()];
    const uniqueInstances = Array.from(allInstances.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Filter by Quality Status
    if (qualityFilter === 'missing') {
        combined = combined.filter(c => !c.isDownloaded && !c.isDownloading);
    } else if (qualityFilter === 'upgradeable') {
        // Simple heuristic: if it has a file but the resolution is low compared to the profile name expectations (could be improved with explicit score mapping)
        // For MVP, "Upgradeable" just means it is downloaded but still Monitored by the Arr app
        combined = combined.filter(c => c.isDownloaded && c.monitored);
    } else if (qualityFilter === 'downloading') {
        combined = combined.filter(c => c.isDownloading);
    } else if (qualityFilter === 'all') {
        // No filter needed
    }

    // Filter by Search Query
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        combined = combined.filter(c => c.title.toLowerCase().includes(query));
    }

    // Filter by selected genres
    if (!selectedGenres.includes('All')) {
        combined = combined.filter(item => {
            const itemGenres = item.genres || [];
            if (!Array.isArray(itemGenres)) return false;

            if (genreLogic === 'OR') {
                return itemGenres.some((g: string) => selectedGenres.includes(g));
            } else if (genreLogic === 'AND') {
                return selectedGenres.every((g: string) => itemGenres.includes(g));
            } else if (genreLogic === 'EXCLUDE') {
                return !itemGenres.some((g: string) => selectedGenres.includes(g));
            }
            return true;
        });
    }

    // Filter by selected instances (using ID instead of name to prevent collisions)
    combined = combined.filter(item => instanceFilters[item.instanceId] !== false);

    // Extract items before we calculate if they should be hidden from UI for visual only active rules
    const targetItemsForBulkActions = [...combined];

    // Filter by active status for displaying purposes only
    let displayItems = combined;
    if (showActiveOnly) {
        displayItems = displayItems.filter(item => searchToggles[item.idStr] !== false);
    }

    // Apply Profile Sorting System so UI matches backend expectations
    if (profile === 'custom') {
        displayItems.sort((a, b) => {
            const indexA = orderedIds.indexOf(a.idStr);
            const indexB = orderedIds.indexOf(b.idStr);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0; // fallback to sortDate if unset
        });
    } else if (profile === 'recently_released') {
        displayItems.sort((a, b) => {
            const dateA = a.type === 'movie' ? (a.physicalRelease || a.digitalRelease || a.inCinemas || "1970-01-01") : (a.airDateUtc || "1970-01-01");
            const dateB = b.type === 'movie' ? (b.physicalRelease || b.digitalRelease || b.inCinemas || "1970-01-01") : (b.airDateUtc || "1970-01-01");
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    } else if (profile === 'nearly_complete') {
        displayItems.sort((a, b) => {
            const pctA = a.type === 'series' ? (a.stats?.percentOfEpisodes || 0) : 0;
            const pctB = b.type === 'series' ? (b.stats?.percentOfEpisodes || 0) : 0;
            // Rank series higher if they have high completion, tie-break by sortDate. Movies go to bottom, sorted by date.
            if (pctA !== pctB) return pctB - pctA;
            return b.sortDate - a.sortDate;
        });
    } else if (profile === 'random') {
        // Pseudo-stable random sort per load
        displayItems.sort(() => Math.random() - 0.5);
    }
    // 'recently_added' defaults to the initial map sort by sortDate, so no extra block needed.

    // Always bubble exact or strong search matches to the top, overriding generic sort profiles
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        displayItems.sort((a, b) => {
            const aTitle = a.title.toLowerCase();
            const bTitle = b.title.toLowerCase();
            const aExact = aTitle === query;
            const bExact = bTitle === query;
            const aStarts = aTitle.startsWith(query);
            const bStarts = bTitle.startsWith(query);
            const aIncludes = aTitle.includes(query);
            const bIncludes = bTitle.includes(query);

            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            if (aIncludes && !bIncludes) return -1;
            if (!aIncludes && bIncludes) return 1;
            return 0; // maintain previous sort relative to each other
        });
    }

    // Calculate total viewable items before batching
    const totalItems = displayItems.length;

    // Apply Next Batch limit slicing
    if (showNextBatchOnly) {
        const allowedBatchSize = schedulerConfig.batchSize || 10;
        // Ignore items that are manually toggled off so they don't eat up preview slots
        const activeItemsForBatch = displayItems.filter(c => searchToggles[c.idStr] !== false);
        const moviesInList = activeItemsForBatch.filter(c => c.type === 'movie');
        const seriesInList = activeItemsForBatch.filter(c => c.type === 'series');

        // Scheduler uses dynamic shifting to fill the batch if one type is exhausted
        let maxMovies = Math.floor(allowedBatchSize / 2);
        let maxSeries = Math.ceil(allowedBatchSize / 2);

        let moviesAvailable = moviesInList.length;
        let seriesAvailable = seriesInList.length;

        let moviesNeeded = Math.min(moviesAvailable, maxMovies);
        let seriesNeeded = Math.min(seriesAvailable, maxSeries);

        let movieShortfall = maxMovies - moviesNeeded;
        let seriesShortfall = maxSeries - seriesNeeded;

        const batchedMovies = moviesInList.slice(0, moviesNeeded + seriesShortfall);
        const batchedSeries = seriesInList.slice(0, seriesNeeded + movieShortfall);

        // Keep them in the relative order they were produced by the sorting block above
        const validIds = new Set([...batchedMovies, ...batchedSeries].map(x => x.idStr));
        displayItems = displayItems.filter(c => validIds.has(c.idStr));
    }

    // Keep orderedIds in sync visually if it's empty (initial load)
    useEffect(() => {
        if (displayItems.length > 0 && orderedIds.length === 0) {
            setOrderedIds(displayItems.map(c => c.idStr));
        }
    }, [displayItems, orderedIds.length]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setOrderedIds((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });

            // NOTE: In a full implementation, we'd also sync this new array to the backend DB 
            // `custom_priority` table to persist it across reloads.
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="bg-rose-900 border border-rose-700 text-white p-4 rounded mb-4">
                <p className="font-medium">Error loading data: {error}</p>
                <button onClick={fetchData} className="mt-2 px-3 py-1 text-sm bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 rounded">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-6 space-y-8 pb-12">
            <div className="flex flex-col">
                <div>
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Scheduler Queue</h1>
                            <p className="text-zinc-400 mb-1">Manage your active search tracking list and prioritize genres.</p>
                            {!loading && totalItems > 0 && (
                                <div className="flex items-center mt-2">
                                    <p className="text-sm font-medium text-emerald-500/80">
                                        Showing {displayItems.length} of {totalItems} items
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Scheduler Controls - Moved Up */}
                        <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 shadow-sm flex-wrap">
                            <span className="text-sm font-semibold text-zinc-300 mr-2">Scheduler:</span>
                            <button
                                onClick={() => {
                                    const newConfig = { ...schedulerConfig, enabled: !schedulerConfig.enabled };
                                    setSchedulerConfig(newConfig);
                                    fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                                }}
                                className={`px-4 py-2 text-sm font-bold rounded-lg border transition-all ${schedulerConfig.enabled ? 'bg-green-600 border-green-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'}`}
                            >
                                {schedulerConfig.enabled ? 'ON' : 'OFF'}
                            </button>
                            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                                <label className="text-sm font-medium text-zinc-400">Interval (m):</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={10080}
                                    value={schedulerConfig.interval}
                                    onChange={e => {
                                        const val = Math.max(1, Math.min(10080, Number(e.target.value)));
                                        const newConfig = { ...schedulerConfig, interval: val };
                                        setSchedulerConfig(newConfig);
                                        fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                                    }}
                                    className="w-14 bg-transparent text-white text-sm font-bold outline-none text-center"
                                />
                            </div>
                            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                                <label className="text-sm font-medium text-zinc-400">Batch Size:</label>
                                <select
                                    value={schedulerConfig.batchSize}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        const newConfig = { ...schedulerConfig, batchSize: val };
                                        setSchedulerConfig(newConfig);
                                        fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                                    }}
                                    className="bg-transparent text-white text-sm font-bold outline-none cursor-pointer"
                                >
                                    {[...Array(50)].map((_, i) => (
                                        <option key={i + 1} value={i + 1} className="bg-zinc-900">{i + 1}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center justify-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 md:ml-auto w-full md:w-auto mt-2 md:mt-0">
                                <div className="flex items-center gap-2 px-2 border-r border-zinc-800">
                                    <span className="text-sm font-medium text-zinc-400">Next Search:</span>
                                    <CountdownTimer nextRun={nextRun} enabled={schedulerConfig.enabled} />
                                </div>
                                <button
                                    onClick={async () => {
                                        setIsRunningBatch(true);
                                        try {
                                            await fetch('/api/scheduler/run', { method: 'POST' });
                                            // Optional: Fetch data or logs again to refresh page state after a run
                                            await fetchData();
                                        } catch (e) {
                                            console.error("Failed to run manual batch", e);
                                        } finally {
                                            setIsRunningBatch(false);
                                        }
                                    }}
                                    disabled={isRunningBatch || !schedulerConfig.enabled}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${isRunningBatch
                                        ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30 cursor-wait'
                                        : !schedulerConfig.enabled
                                            ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
                                            : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 hover:text-emerald-300'
                                        }`}
                                    title="Force the background scheduler to immediately execute the next configured batch"
                                >
                                    {isRunningBatch ? (
                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></div>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    )}
                                    {isRunningBatch ? 'Running...' : 'Run Batch Now'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter & Controls Box - New Layout */}
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 mb-6 shadow-sm w-full mt-4">
                    {/* Row 1: Search & Core Filters */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5 pb-5 border-b border-zinc-800/60">
                        <div className="flex-1 w-full relative">
                            <input
                                type="text"
                                placeholder="Search active media..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950/50 border border-zinc-700/50 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none placeholder-zinc-500"
                            />
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-zinc-400">Sort Profile:</span>
                                <select
                                    value={profile}
                                    onChange={(e) => handleSaveProfile(e.target.value)}
                                    className="bg-zinc-950/50 border border-zinc-700/50 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 outline-none cursor-pointer"
                                >
                                    <option value="recently_added">Added Date (Default)</option>
                                    <option value="recently_released">Release Date</option>
                                    <option value="nearly_complete">Completion %</option>
                                    <option value="random">Randomized</option>
                                    <option value="custom">Custom Drag & Drop</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-zinc-400">Quality:</span>
                                <select
                                    value={qualityFilter}
                                    onChange={(e) => setQualityFilter(e.target.value)}
                                    className="bg-zinc-950/50 border border-zinc-700/50 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 outline-none cursor-pointer"
                                >
                                    <option value="missing">Missing Only</option>
                                    <option value="upgradeable">Upgradeable Only</option>
                                    <option value="downloading">Downloading Active</option>
                                    <option value="all">Everything</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSaveConfiguration}
                                    disabled={isSaving}
                                    className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm border transition-all ${saveSuccess ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40' : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border-indigo-500/30'}`}
                                >
                                    {isSaving ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Configuration'}
                                </button>
                                {hasUnsavedChanges && !saveSuccess && (
                                    <span className="text-[10px] text-amber-500 font-medium animate-pulse ml-1">Unsaved changes</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Genres (Full Width) */}
                    <div className="w-full">
                        <div className="flex flex-col mb-4 gap-2">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Filter by Genre</span>

                            {/* Enlarged Logic Buttons matching user request */}
                            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 w-fit shadow-inner mb-2">
                                <button
                                    onClick={() => setGenreLogic('OR')}
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${genreLogic === 'OR' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    title="Match ANY selected genre"
                                >OR</button>
                                <button
                                    onClick={() => setGenreLogic('AND')}
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${genreLogic === 'AND' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    title="Match ALL selected genres"
                                >AND</button>
                                <button
                                    onClick={() => setGenreLogic('EXCLUDE')}
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${genreLogic === 'EXCLUDE' ? 'bg-rose-900/40 text-rose-400 shadow-sm border border-rose-800/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    title="Match NO selected genres"
                                >EXCLUDE</button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 w-full">
                            {uniqueGenres.map(g => {
                                const isSelected = selectedGenres.includes(g);
                                return (
                                    <button
                                        key={g}
                                        onClick={() => handleGenreToggle(g)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${isSelected
                                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 hover:bg-purple-500/30 shadow-sm'
                                            : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                                            }`}
                                    >
                                        {g}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Media Table Area */}
            <div>
                <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-4 mb-4 gap-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-bold text-white tracking-tight">Media</h2>
                            {!loading && totalItems > 0 && (
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleSelectAll(targetItemsForBulkActions)} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700 transition-colors shadow-sm">Select All</button>
                                    <button onClick={() => handleDeselectAll(targetItemsForBulkActions)} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700 transition-colors shadow-sm">Deselect All</button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center mt-1">
                            {/* Active Instances Section moved here */}
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mr-3">Instances:</span>
                            <div className="flex flex-wrap gap-2">
                                {uniqueInstances.map(inst => {
                                    const isSelected = instanceFilters[inst.id] !== false;

                                    // Make sure inst.color is supported by Tailwind or inject via style if it's a hex
                                    const isHexColor = inst.color?.startsWith('#');
                                    const dotStyle = isHexColor ? { backgroundColor: inst.color } : {};
                                    const dotClass = !isHexColor && inst.color ? inst.color : 'bg-blue-500';

                                    // Selected states coloring
                                    const highlightStyle = isSelected && isHexColor ? { borderColor: inst.color, color: inst.color } : {};
                                    const bgStyle = isSelected && isHexColor ? { backgroundColor: `${inst.color}33` } : {}; // 33 is ~20% opacity matching original bg-blue-500/20

                                    // Define dynamic classes exclusively for tailwind base colors safely
                                    const TW_COLORS: Record<string, string> = {
                                        "bg-red-500": isSelected ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-orange-500": isSelected ? "bg-orange-500/20 text-orange-400 border-orange-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-amber-500": isSelected ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-yellow-500": isSelected ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-lime-500": isSelected ? "bg-lime-500/20 text-lime-400 border-lime-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-green-500": isSelected ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-emerald-500": isSelected ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-teal-500": isSelected ? "bg-teal-500/20 text-teal-400 border-teal-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-cyan-500": isSelected ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-sky-500": isSelected ? "bg-sky-500/20 text-sky-400 border-sky-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-blue-500": isSelected ? "bg-blue-500/20 text-blue-400 border-blue-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-indigo-500": isSelected ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-violet-500": isSelected ? "bg-violet-500/20 text-violet-400 border-violet-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-purple-500": isSelected ? "bg-purple-500/20 text-purple-400 border-purple-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-fuchsia-500": isSelected ? "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-pink-500": isSelected ? "bg-pink-500/20 text-pink-400 border-pink-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                        "bg-rose-500": isSelected ? "bg-rose-500/20 text-rose-400 border-rose-500/50" : "bg-zinc-950/50 text-zinc-500 border-zinc-800",
                                    };

                                    const standardTailwindClass = TW_COLORS[inst.color || "bg-blue-500"] || TW_COLORS["bg-blue-500"];

                                    return (
                                        <button
                                            key={inst.id}
                                            onClick={() => toggleInstance(inst.name, inst.id)}
                                            style={isHexColor && isSelected ? { ...highlightStyle, ...bgStyle } : (isHexColor ? highlightStyle : {})}
                                            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${!isHexColor ? standardTailwindClass : 'hover:opacity-80'}`}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-2 h-2 rounded-full ${!isHexColor ? dotClass : ''}`} style={dotStyle} title="Instance Color"></div>
                                                {inst.name}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 flex-wrap bg-zinc-900/40 p-2 rounded-xl border border-zinc-800/80">
                        <label className="flex items-center cursor-pointer group">
                            <div className="relative">
                                <input type="checkbox" className="sr-only" checked={showActiveOnly} onChange={() => setShowActiveOnly(!showActiveOnly)} />
                                <div className={`block w-10 h-6 rounded-full transition-colors ${showActiveOnly ? 'bg-purple-500' : 'bg-zinc-700 group-hover:bg-zinc-600'}`}></div>
                                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showActiveOnly ? 'translate-x-4' : ''}`}></div>
                            </div>
                            <span className="text-sm font-medium text-zinc-300 ml-3">Show Active Media Only</span>
                        </label>
                        <div className="w-px h-6 bg-zinc-700 hidden md:block"></div>
                        <label className="flex items-center cursor-pointer group">
                            <div className="relative">
                                <input type="checkbox" className="sr-only" checked={showNextBatchOnly} onChange={() => setShowNextBatchOnly(!showNextBatchOnly)} />
                                <div className={`block w-12 h-6 rounded-full transition-colors ${showNextBatchOnly ? 'bg-amber-500' : 'bg-zinc-700 group-hover:bg-zinc-600'}`}></div>
                                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showNextBatchOnly ? 'translate-x-6' : ''}`}></div>
                            </div>
                            <div className="ml-3 flex flex-col">
                                <span className="text-sm font-bold text-amber-500">Preview Upcoming Batch</span>
                                <span className="text-[10px] text-zinc-400 leading-tight">Shows exactly what will be searched next cycle</span>
                            </div>
                        </label>
                    </div>
                </div>

                {displayItems.length === 0 ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center flex flex-col items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 mb-4 opacity-50"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <h3 className="text-xl font-semibold text-white">All caught up!</h3>
                        <p className="text-zinc-500 mt-2">No missing media matching this filter.</p>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={displayItems.map(c => c.idStr)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="grid grid-cols-1 gap-3">
                                {displayItems.map((item) => {
                                    const isToggled = searchToggles[item.idStr] !== false; // Default true
                                    return (
                                        <SortableItem key={item.idStr} id={item.idStr} isDraggable={profile === 'custom'}>
                                            <div
                                                onClick={(e) => item.type === 'series' && toggleExpandSeries(item, e)}
                                                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isToggled ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-900 opacity-60'
                                                    } ${item.type === 'series' ? 'cursor-pointer hover:bg-zinc-800' : ''}`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-2 h-12 rounded-full ${item.instanceColor || (item.type === 'movie' ? 'bg-yellow-500' : 'bg-cyan-500')}`} />
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${item.type === 'movie' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-cyan-500/20 text-cyan-500'
                                                                }`}>
                                                                {item.type}
                                                            </span>
                                                            <span
                                                                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-zinc-700/50 opacity-80"
                                                                style={{
                                                                    backgroundColor: item.instanceColor?.startsWith('#') ? `${item.instanceColor}1a` : undefined, // 1a is ~10%
                                                                    color: item.instanceColor?.startsWith('#') ? item.instanceColor : undefined,
                                                                    borderColor: item.instanceColor?.startsWith('#') ? `${item.instanceColor}33` : undefined // 33 is ~20%
                                                                }}
                                                            >
                                                                {item.instanceName}
                                                            </span>
                                                            {/* Show first two genres as tags if available */}
                                                            {item.genres && item.genres.slice(0, 2).map((g: string) => (
                                                                <span key={g} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-purple-500/20 text-purple-400">
                                                                    {g}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <h3 className="text-lg font-medium text-white flex items-center gap-2">
                                                            {item.title}
                                                            {item.type === 'series' && (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-zinc-500 transition-transform ${expandedSeriesId === `${item.instanceId}-${item.id}` ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
                                                            )}
                                                        </h3>
                                                        <div className="text-sm text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                            {item.type === 'movie'
                                                                ? (item.isDownloaded ? 'Downloaded' : 'Missing from Library')
                                                                : (item.stats ? `${item.stats.episodeFileCount} / ${item.stats.episodeCount} Episodes (${Math.round(item.stats.percentOfEpisodes)}%)` : 'Unknown')}
                                                            <span className="text-zinc-600">•</span>
                                                            <span>Added {formatDistanceToNow(item.sortDate, { addSuffix: true })}</span>

                                                            <div className="flex items-center gap-2 w-full mt-1">
                                                                <div className="flex bg-zinc-900 border border-zinc-700/50 rounded-md overflow-hidden text-xs font-medium">
                                                                    <div className="bg-zinc-800 px-2 py-0.5 text-zinc-400 border-r border-zinc-700/50">Target</div>
                                                                    <div className="px-2 py-0.5 text-indigo-400 bg-indigo-500/10">
                                                                        {item.targetQualityProfile}
                                                                    </div>
                                                                </div>

                                                                {item.type === 'movie' && item.isDownloaded && (
                                                                    <div className="flex bg-zinc-900 border border-zinc-700/50 rounded-md overflow-hidden text-xs font-medium">
                                                                        <div className="bg-zinc-800 px-2 py-0.5 text-zinc-400 border-r border-zinc-700/50">Current</div>
                                                                        <div className={`px-2 py-0.5 ${item.currentQualityScale >= 2160 ? 'text-emerald-400 bg-emerald-500/10' :
                                                                            item.currentQualityScale >= 1080 ? 'text-blue-400 bg-blue-500/10' :
                                                                                'text-yellow-400 bg-yellow-500/10'
                                                                            }`}>
                                                                            {item.currentQualityScale ? `${item.currentQualityScale}p` : 'Unknown'}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    {searchingItems[item.idStr] ? (
                                                        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-zinc-800/80 text-zinc-300 border-zinc-700 mr-2 flex items-center gap-2">
                                                            {searchingItems[item.idStr].isPolling && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                                                            {searchingItems[item.idStr].status}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 font-medium px-3 py-1.5 rounded-lg border border-emerald-500/30 transition-colors mr-2 relative z-20 cursor-pointer"
                                                            onPointerDown={(e) => e.stopPropagation()}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleForceSearch(item);
                                                            }}
                                                        >
                                                            Force Search {item.type === 'series' && '(All)'}
                                                        </button>
                                                    )}
                                                    <span className="text-xs text-zinc-500 font-medium mr-2">Status: {isToggled ? 'Active' : 'Paused'}</span>
                                                    <button
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleSearch(item.idStr);
                                                        }}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950 cursor-pointer z-50 ${isToggled ? 'bg-emerald-500' : 'bg-zinc-700'
                                                            }`}
                                                    >
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isToggled ? 'translate-x-6' : 'translate-x-1'
                                                            }`} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded Series Episodes Panel */}
                                            {item.type === 'series' && expandedSeriesId === `${item.instanceId}-${item.id}` && (
                                                <div className="ml-8 mt-1 mb-4 border-l-2 border-zinc-800 pl-4 py-2 space-y-2">
                                                    {loadingEpisodes[`${item.instanceId}-${item.id}`] ? (
                                                        <div className="text-sm text-zinc-500 flex items-center gap-2">
                                                            <div className="w-4 h-4 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin"></div>
                                                            Loading episodes...
                                                        </div>
                                                    ) : seriesEpisodes[`${item.instanceId}-${item.id}`] ? (
                                                        <div className="grid gap-2">
                                                            {seriesEpisodes[`${item.instanceId}-${item.id}`].map((ep: any) => (
                                                                <div key={ep.id} className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}</span>
                                                                            <h4 className="text-sm font-medium text-zinc-200">{ep.title}</h4>
                                                                            {ep.hasFile ? (
                                                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Downloaded</span>
                                                                            ) : ep.monitored ? (
                                                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Missing</span>
                                                                            ) : (
                                                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">Unmonitored</span>
                                                                            )}
                                                                        </div>
                                                                        {ep.hasFile && ep.episodeFile && (
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{ep.episodeFile.quality?.quality?.name || 'Unknown Quality'}</span>
                                                                                {ep.episodeFile.mediaInfo?.subtitles && ep.episodeFile.mediaInfo.subtitles.length > 0 && (
                                                                                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                                                                        Subtitles
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        {!ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc).getTime() > Date.now() && (
                                                                            <p className="text-[10px] text-zinc-500 mt-1">Airs: {new Date(ep.airDateUtc).toLocaleDateString()}</p>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        {!ep.hasFile && ep.monitored && new Date(ep.airDateUtc).getTime() < Date.now() && (
                                                                            <button
                                                                                id={`search-ep-${item.instanceId}-${ep.id}`}
                                                                                onClick={() => {
                                                                                    // Trigger manual search for single episode
                                                                                    fetch('/api/search/trigger', {
                                                                                        method: 'POST',
                                                                                        headers: { 'Content-Type': 'application/json' },
                                                                                        body: JSON.stringify({ type: 'episode', mediaId: ep.id, instanceId: item.instanceId })
                                                                                    });

                                                                                    // Optimistic UX feedback override
                                                                                    const btn = document.getElementById(`search-ep-${item.instanceId}-${ep.id}`);
                                                                                    if (btn) {
                                                                                        btn.innerText = 'Searching...';
                                                                                        btn.classList.replace('text-emerald-400', 'text-amber-400');
                                                                                        btn.classList.replace('bg-emerald-600/20', 'bg-amber-600/20');
                                                                                    }

                                                                                    // Inject into episode state so the logic knows
                                                                                    setEpisodes(prev => prev.map(e => e.id === item.id && e.instanceId === item.instanceId ? { ...e, queuedEpisodeIds: [...(e.queuedEpisodeIds || []), ep.id] } : e));
                                                                                }}
                                                                                className="px-2 py-1 text-[10px] font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded border border-emerald-500/20 hover:border-emerald-500/40 transition-colors"
                                                                            >
                                                                                Search Episode
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-zinc-500">No episodes found.</div>
                                                    )}
                                                </div>
                                            )}
                                        </SortableItem>
                                    );
                                })}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </div >
    );
}

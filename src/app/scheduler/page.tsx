'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';

import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';
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
    Search,
    Trash2,
    Play,
    Pause,
    RefreshCw,
    Info,
    ChevronDown,
    ChevronUp,
    X,
    Database
} from 'lucide-react';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableItem } from '@/components/SortableItem';

// --- Interfaces ---

interface SchedulerConfig {
    enabled: boolean;
    interval: number;
    batchSize: number;
    batchBehavior: 'repeat' | 'rotate' | string;
    maxAttempts: number;
}

interface Movie {
    id: number;
    idStr?: string;
    type: 'movie';
    title: string;
    year: number;
    instanceId: string;
    instanceName?: string;
    instanceColor?: string;
    instanceUrl?: string;
    qualityProfileId: number;
    sizeOnDisk: number;
    hasFile: boolean;
    added: string;
    isDownloading?: boolean;
    genres?: string[];
    monitored: boolean;
    status: string;
    isPinned?: boolean;
    physicalRelease?: string;
    digitalRelease?: string;
    inCinemas?: string;
    airDateUtc?: string;
    movieFile?: {
        id: number;
        quality?: {
            quality?: {
                resolution: number;
                name: string;
            };
        };
        size?: number;
    };
    isDownloaded?: boolean;
    targetQualityProfile?: string;
    currentQualityScale?: number;
    sortDate?: number;
}

interface Episode {
    id: number;
    idStr?: string;
    type: 'episode';
    title: string;
    instanceId: string;
    seriesId: number;
    seasonNumber: number;
    episodeNumber: number;
    hasFile: boolean;
    monitored: boolean;
    episodeFileId?: number;
    episodeFile?: {
        quality?: {
            quality?: {
                name: string;
            };
        };
        size?: number;
    };
}

interface SeriesItem {
    id: number;
    idStr: string;
    type: 'series' | 'episode';
    title: string;
    instanceId: string;
    instanceName?: string;
    instanceColor?: string;
    instanceUrl?: string;
    qualityProfileId: number;
    added: string;
    episodes?: Episode[];
    queuedEpisodeIds?: number[];
    isPinned?: boolean;
    genres?: string[];
    monitored: boolean;
    status: string;
    statistics?: {
        percentOfEpisodes: number;
        episodeCount: number;
        episodeFileCount: number;
    };
    physicalRelease?: string;
    digitalRelease?: string;
    inCinemas?: string;
    airDateUtc?: string;
    isDownloaded?: boolean;
    targetQualityProfile?: string;
    currentQualityScale?: number;
    sortDate?: number;
    isDownloading?: boolean;
    stats?: {
        percentOfEpisodes: number;
        episodeCount: number;
        episodeFileCount: number;
    };
}

interface SearchHistory {
    id: string;
    title: string;
    status: 'Grabbed' | 'Finalized' | 'Failed' | 'Downloading';
    timestamp: string;
    message?: string;
    trigger?: string;
}

interface Release {
    guid: string;
    title: string;
    size: number;
    indexerId: number;
    indexer: string;
    seeders: number;
    leechers: number;
    downloadUrl: string;
    infoUrl?: string;
    rejections?: string[];
    customFormatScore?: number;
    quality?: {
        quality?: {
            name: string;
        };
    };
    rejected?: boolean;
    protocol?: string;
}

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
    const [movies, setMovies] = useState<Movie[]>([]);
    const [episodes, setEpisodes] = useState<SeriesItem[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Record<number, string>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({
        enabled: true,
        interval: 30,
        batchSize: 10,
        batchBehavior: 'repeat',
        maxAttempts: 3
    });

    const updateSchedulerConfig = async (updates: Partial<SchedulerConfig>) => {
        const newConfig = { ...schedulerConfig, ...updates };
        setSchedulerConfig(newConfig);
        try {
            await axios.post('/api/scheduler/config', newConfig);
        } catch (err) {
            console.error('Failed to update scheduler config:', err);
        }
    };

    const [nextRun, setNextRun] = useState<number | null>(null);
    const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
    const [searchToggles, setSearchToggles] = useState<Record<string, boolean>>({});
    const [selectedGenres, setSelectedGenres] = useState<string[]>(['All']);
    const [instanceFilters, setInstanceFilters] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [qualityFilter, setQualityFilter] = useState('missing'); // 'all', 'missing', 'upgradeable'
    const [profile, setProfile] = useState('recently_added');
    const [orderedIds, setOrderedIds] = useState<string[]>([]);
    const [showActiveOnly, setShowActiveOnly] = useState(false);
    const [hideUnmonitored, setHideUnmonitored] = useState(false);
    const [showDownloading, setShowDownloading] = useState(true);
    const [showNextBatchOnly, setShowNextBatchOnly] = useState(false);

    const [searchingItems, setSearchingItems] = useState<Record<string, { status: string, isPolling: boolean }>>({});

    // New Feature States
    const [genreLogic, setGenreLogic] = useState<'OR' | 'AND' | 'EXCLUDE'>('OR');
    const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
    const [seriesEpisodes, setSeriesEpisodes] = useState<Record<string, Episode[]>>({});
    const [loadingEpisodes, setLoadingEpisodes] = useState<Record<string, boolean>>({});

    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isRunningBatch, setIsRunningBatch] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const [interactiveSearchItem, setInteractiveSearchItem] = useState<{ type: 'movie' | 'series' | 'episode', id: number, instanceId: string, title: string } | null>(null);
    const [interactiveReleases, setInteractiveReleases] = useState<Release[]>([]);
    const [loadingReleases, setLoadingReleases] = useState(false);
    const [triggeringReleaseGuid, setTriggeringReleaseGuid] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const formatSize = (bytes: number) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleDeleteFile = async (type: 'movie' | 'episode', id: number, instanceId: string, fileId: number) => {
        if (!confirm(`Are you sure you want to delete this ${type} file from disk? This cannot be undone.`)) return;

        try {
            const endpoint = type === 'movie'
                ? `/api/radarr/file?movieFileId=${fileId}&instanceId=${instanceId}`
                : `/api/sonarr/file?episodeFileId=${fileId}&instanceId=${instanceId}`;

            const res = await fetch(endpoint, { method: 'DELETE' });
            const data = await res.json();

            if (data.success) {
                toast.success(`${type === 'movie' ? 'Movie' : 'Episode'} file deleted successfully`);
                fetchData(); // Refresh to update seen status and sizes
            } else {
                toast.error(`Failed to delete file: ${data.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            toast.error('Error deleting file');
        }
    };

    const handleGenreToggle = (g: string) => {
        if (g === 'All') {
            setSelectedGenres(['All']);
            return;
        }
        setSelectedGenres((prev: string[]) => {
            const isSelected = prev.includes(g);
            const next = isSelected ? prev.filter((x: string) => x !== g && x !== 'All') : [...prev.filter((x: string) => x !== 'All'), g];
            return next.length === 0 ? ['All'] : next;
        });
    };

    // --- Interactive Search Feature Handlers ---
    const handleInteractiveSearch = async (type: 'movie' | 'series' | 'episode', id: number, instanceId: string, title: string) => {
        setInteractiveSearchItem({ type, id, instanceId, title });
        setLoadingReleases(true);
        setInteractiveReleases([]);
        try {
            const endpoint = type === 'movie'
                ? `/api/radarr/releases?movieId=${id}&instanceId=${instanceId}`
                : `/api/sonarr/releases?episodeId=${id}&instanceId=${instanceId}`;
            const res = await fetch(endpoint);
            const data = await res.json();
            if (Array.isArray(data)) {
                setInteractiveReleases(data);
            } else {
                console.error("Failed to load releases", data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingReleases(false);
        }
    };

    const triggerInteractiveDownload = async (guid: string, indexerId: number) => {
        if (!interactiveSearchItem) return;
        setTriggeringReleaseGuid(guid);
        try {
            const endpoint = interactiveSearchItem.type === 'movie' ? '/api/radarr/releases' : '/api/sonarr/releases';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guid,
                    indexerId,
                    instanceId: interactiveSearchItem.instanceId
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to trigger download');
            }

            toast.success('Successfully sent release to download client!');

            if (interactiveSearchItem.type === 'movie') {
                setMovies((prev: Movie[]) => prev.map((m: Movie) => m.id === interactiveSearchItem.id && m.instanceId === interactiveSearchItem.instanceId ? { ...m, isDownloading: true } : m));
            } else if (interactiveSearchItem.type === 'episode') {
                setEpisodes((prev: SeriesItem[]) => prev.map((e: SeriesItem) => {
                    if (e.instanceId === interactiveSearchItem.instanceId && e.episodes?.some((ep: Episode) => ep.id === interactiveSearchItem.id)) {
                        return { ...e, queuedEpisodeIds: [...(e.queuedEpisodeIds || []), interactiveSearchItem.id] };
                    }
                    return e;
                }));
            } else {
                setEpisodes((prev: SeriesItem[]) => prev.map((e: SeriesItem) => e.id === interactiveSearchItem.id && e.instanceId === interactiveSearchItem.instanceId ? { ...e, queuedEpisodeIds: [...(e.queuedEpisodeIds || []), ...e.episodes?.map((ep: Episode) => ep.id) || []] } : e));
            }

            // Auto close modal on success
            setInteractiveSearchItem(null);

            // Re-fetch to eventually sync with reality
            fetchData();
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to send release to download client.');

            // Revert optimistic updates on failure
            if (interactiveSearchItem.type === 'movie') {
                setMovies((prev: Movie[]) => prev.map((m: Movie) => m.id === interactiveSearchItem.id && m.instanceId === interactiveSearchItem.instanceId ? { ...m, isDownloading: false } : m));
            } else if (interactiveSearchItem.type === 'episode') {
                setEpisodes((prev: SeriesItem[]) => prev.map((e: SeriesItem) => {
                    if (e.instanceId === interactiveSearchItem.instanceId && e.episodes?.some((ep: Episode) => ep.id === interactiveSearchItem.id)) {
                        return { ...e, queuedEpisodeIds: (e.queuedEpisodeIds || []).filter((id: number) => id !== interactiveSearchItem.id) };
                    }
                    return e;
                }));
            } else {
                setEpisodes((prev: SeriesItem[]) => prev.map((e: SeriesItem) => {
                    if (e.id === interactiveSearchItem.id && e.instanceId === interactiveSearchItem.instanceId) {
                        const epIdsToRemove = new Set(e.episodes?.map((ep: Episode) => ep.id) || []);
                        return { ...e, queuedEpisodeIds: (e.queuedEpisodeIds || []).filter((id: number) => !epIdsToRemove.has(id)) };
                    }
                    return e;
                }));
            }
        } finally {
            setTriggeringReleaseGuid(null);
        }
    };
    // ----------------------------------------

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
                setSchedulerConfig({
                    enabled: data.enabled,
                    interval: data.interval,
                    batchSize: data.batchSize,
                    batchBehavior: data.batchBehavior || 'repeat',
                    maxAttempts: data.maxAttempts || 3
                });
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
                if (settingsData.ui_hide_unmonitored !== undefined) setHideUnmonitored(settingsData.ui_hide_unmonitored === 'true');
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
                if (parsed.hideUnmonitored !== undefined) setHideUnmonitored(parsed.hideUnmonitored);
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
            hideUnmonitored,
            showNextBatchOnly,
            genreLogic
        };
        localStorage.setItem('schedulerUIState', JSON.stringify(stateToSave));
        if (!loading && movies.length > 0) {
            setHasUnsavedChanges(true);
        }
    }, [selectedGenres, instanceFilters, qualityFilter, showActiveOnly, hideUnmonitored, showNextBatchOnly, genreLogic, searchToggles]);

    const handleSaveConfiguration = async () => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            await Promise.all([
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_selected_genres', value: JSON.stringify(selectedGenres) }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_genre_logic', value: genreLogic }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_instance_filters', value: JSON.stringify(instanceFilters) }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_active_only', value: showActiveOnly ? 'true' : 'false' }) }),
                fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ui_hide_unmonitored', value: hideUnmonitored ? 'true' : 'false' }) }),
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

    const handleSelectAll = (filteredItems: (Movie | SeriesItem)[]) => {
        const updates: Record<string, boolean> = {};
        filteredItems.forEach(item => { updates[item.idStr || `${item.instanceId}-${item.id}`] = true; });
        setSearchToggles((prev: Record<string, boolean>) => ({ ...prev, ...updates }));
    };

    const handleDeselectAll = (filteredItems: (Movie | SeriesItem)[]) => {
        const updates: Record<string, boolean> = {};
        filteredItems.forEach(item => { updates[item.idStr || `${item.instanceId}-${item.id}`] = false; });
        setSearchToggles((prev: Record<string, boolean>) => ({ ...prev, ...updates }));
    };

    const fetchSeriesEpisodes = async (instanceId: string, seriesId: number) => {
        const cacheKey = `${instanceId}-${seriesId}`;
        if (seriesEpisodes[cacheKey]) return; // already loaded

        setLoadingEpisodes((prev: Record<string, boolean>) => ({ ...prev, [cacheKey]: true }));
        try {
            const res = await fetch(`/api/sonarr/episodes?instanceId=${instanceId}&seriesId=${seriesId}`);
            if (res.ok) {
                const data = await res.json();
                setSeriesEpisodes((prev: Record<string, Episode[]>) => ({ ...prev, [cacheKey]: data }));
            }
        } catch (e) {
            console.error('Failed to load episodes', e);
        }
        setLoadingEpisodes((prev: Record<string, boolean>) => ({ ...prev, [cacheKey]: false }));
    };

    const toggleExpandSeries = async (item: SeriesItem, e: React.MouseEvent) => {
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
        setSearchToggles((prev: Record<string, boolean>) => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleForceSearch = async (item: Movie | SeriesItem | Episode) => {
        const idStr = item.idStr || `${item.instanceId}-${item.id}`;
        setSearchingItems((prev: Record<string, any>) => ({ ...prev, [idStr]: { status: 'Triggering...', isPolling: true } }));

        try {
            const res = await fetch('/api/search/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instanceId: item.instanceId, type: item.type, mediaId: item.id })
            });

            if (!res.ok) throw new Error('Trigger failed');

            setSearchingItems((prev: Record<string, any>) => ({ ...prev, [idStr]: { status: 'Searching indexers...', isPolling: true } }));

            let tries = 0;
            const maxTries = 10;

            const pollInterval = setInterval(async () => {
                tries++;
                try {
                    const statusRes = await fetch(`/api/search/status?instanceId=${item.instanceId}&type=${item.type}&mediaId=${item.id}`);
                    if (statusRes.ok) {
                        const data = await statusRes.json();
                        if (data.status !== 'Not in queue') {
                            setSearchingItems((prev: Record<string, any>) => ({ ...prev, [idStr]: { status: `Grabbed (${data.status})`, isPolling: false } }));

                            // Optimistically update the main data array so it re-filters instantly
                            if (item.type === 'movie') {
                                setMovies((prev: Movie[]) => prev.map(m => m.id === item.id && m.instanceId === item.instanceId ? { ...m, isDownloading: true } : m));
                            } else if (item.type === 'episode') {
                                setEpisodes((prev: SeriesItem[]) => prev.map(e => {
                                    if (e.instanceId === item.instanceId && e.episodes?.some((ep: Episode) => ep.id === item.id)) {
                                        return { ...e, queuedEpisodeIds: [...(e.queuedEpisodeIds || []), item.id] };
                                    }
                                    return e;
                                }));
                            } else {
                                setEpisodes((prev: SeriesItem[]) => prev.map(e => e.id === item.id && e.instanceId === item.instanceId ? { ...e, queuedEpisodeIds: [...(e.queuedEpisodeIds || []), ...e.episodes?.map((ep: Episode) => ep.id) || []] } : e));
                            }

                            clearInterval(pollInterval);
                            return;
                        }
                    }
                } catch (e) {
                    console.error('Polling error', e);
                }

                if (tries >= maxTries) {
                    setSearchingItems((prev: Record<string, any>) => ({ ...prev, [idStr]: { status: 'Finished (Not found)', isPolling: false } }));
                    clearInterval(pollInterval);
                }
            }, 3000);

        } catch (err) {
            console.error(err);
            setSearchingItems((prev: Record<string, any>) => ({ ...prev, [idStr]: { status: 'Error', isPolling: false } }));
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
    let combined = ([
        ...(Array.isArray(movies) ? movies : []).map(m => ({
            ...m,
            type: 'movie',
            sortDate: new Date(m.added).getTime(),
            idStr: `movie-${m.instanceId}-${m.id}`,
            isDownloaded: m.hasFile,
            targetQualityProfile: (m.instanceUrl && m.qualityProfileId && profiles?.[m.instanceUrl.replace(/\/$/, '')]) ? profiles[m.instanceUrl.replace(/\/$/, '')][m.qualityProfileId] : 'Unknown',
            currentQualityScale: m.movieFile?.quality?.quality?.resolution || 0,
            instanceId: m.instanceId,
            instanceColor: m.instanceColor,
            isDownloading: m.isDownloading || false
        } as Movie)),
        ...(Array.isArray(episodes) ? episodes : []).map(e => ({
            ...e,
            type: 'series' as const,
            sortDate: new Date(e.added).getTime(),
            idStr: `series-${e.instanceId}-${e.id}`,
            isDownloaded: e.statistics?.percentOfEpisodes === 100,
            stats: e.statistics,
            targetQualityProfile: (e.instanceUrl && e.qualityProfileId && profiles?.[e.instanceUrl.replace(/\/$/, '')]) ? profiles[e.instanceUrl.replace(/\/$/, '')][e.qualityProfileId] : 'Unknown',
            instanceId: e.instanceId,
            instanceColor: e.instanceColor,
            isDownloading: e.queuedEpisodeIds && e.queuedEpisodeIds.length > 0
        } as SeriesItem))
    ] as (Movie | SeriesItem)[]).sort((a, b) => {
        // Group by Instance Name first
        const instA = a.instanceName || '';
        const instB = b.instanceName || '';
        if (instA !== instB) return instA.localeCompare(instB);

        // Then by Pin status
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        // Then by date (newest first)
        return (b.sortDate || 0) - (a.sortDate || 0);
    });


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
        combined = combined.filter(c => !c.isDownloaded);
    } else if (qualityFilter === 'upgradeable') {
        combined = combined.filter(c => c.isDownloaded && c.monitored);
    } else if (qualityFilter === 'all') {
        // No filter needed
    }

    // Secondary Toggle for Downloading items
    if (!showDownloading) {
        combined = combined.filter(c => !c.isDownloading);
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
        displayItems = displayItems.filter(item => item.idStr && searchToggles[item.idStr] !== false);
    }
    if (hideUnmonitored) {
        displayItems = displayItems.filter(item => {
            // For seasons/shows with 0 monitored episodes, the item.monitored flag handles it on the core object,
            // but Radarr/Sonarr `monitored` flag true/false is exactly what we need.
            return item.monitored === true;
        });
    }

    // Apply Profile Sorting System so UI matches backend expectations
    if (profile === 'custom') {
        displayItems.sort((a, b) => {
            const indexA = a.idStr ? orderedIds.indexOf(a.idStr) : -1;
            const indexB = b.idStr ? orderedIds.indexOf(b.idStr) : -1;
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
    } else if (profile === 'alphabetical') {
        displayItems.sort((a, b) => a.title.localeCompare(b.title));
    } else if (profile === 'nearly_complete') {

        displayItems.sort((a, b) => {
            const pctA = a.type === 'series' ? (a.stats?.percentOfEpisodes || 0) : 0;
            const pctB = b.type === 'series' ? (b.stats?.percentOfEpisodes || 0) : 0;
            // Rank series higher if they have high completion, tie-break by sortDate. Movies go to bottom, sorted by date.
            if (pctA !== pctB) return pctB - pctA;
            return (b.sortDate ?? 0) - (a.sortDate ?? 0);
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
        const activeItemsForBatch = displayItems.filter(c => c.idStr && searchToggles[c.idStr] !== false);
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
            setOrderedIds(displayItems.map(c => c.idStr).filter((id): id is string => id !== undefined));
        }
    }, [displayItems, orderedIds.length]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setOrderedIds((items: string[]) => {
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
                <div className="mb-6">
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

                {/* Scheduler Controls - Moved Below Header and Styled */}
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 mb-6 shadow-sm w-full overflow-x-auto">
                    <div className="flex flex-nowrap items-center gap-4 min-w-max">
                        <div className="flex items-center gap-3 mr-4">
                            <span className="text-sm font-semibold text-zinc-300 flex-shrink-0">Scheduler:</span>
                            <button
                                onClick={() => {
                                    const newConfig = { ...schedulerConfig, enabled: !schedulerConfig.enabled };
                                    setSchedulerConfig(newConfig);
                                    fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                                }}
                                className={`flex-shrink-0 px-4 py-2 text-sm font-bold rounded-lg border transition-all ${schedulerConfig.enabled ? 'bg-green-600 border-green-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'}`}
                            >
                                {schedulerConfig.enabled ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        <div className="flex flex-nowrap items-center gap-2">
                            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 flex-shrink-0">
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
                            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 flex-shrink-0">
                                <label className="text-sm font-medium text-zinc-400">Batch Size:</label>
                                <CustomSelect
                                    minimal
                                    options={[...Array(50)].map((_, i) => ({ id: i + 1, name: (i + 1).toString() }))}
                                    value={schedulerConfig.batchSize}
                                    onChange={val => {
                                        const numMatch = val.toString().match(/\d+/);
                                        const num = numMatch ? Number(numMatch[0]) : 10;
                                        const newConfig = { ...schedulerConfig, batchSize: num };
                                        setSchedulerConfig(newConfig);
                                        fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                                    }}
                                />
                            </div>
                            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 flex-shrink-0">
                                <label className="text-sm font-medium text-zinc-400">Behavior:</label>
                                <CustomSelect
                                    minimal
                                    options={[
                                        { id: 'repeat', name: 'Repeat' },
                                        { id: 'rotate', name: 'Rotate' }
                                    ]}
                                    value={schedulerConfig.batchBehavior}
                                    onChange={val => {
                                        const newConfig = { ...schedulerConfig, batchBehavior: val };
                                        setSchedulerConfig(newConfig);
                                        fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                                    }}
                                />
                            </div>
                            {schedulerConfig.batchBehavior === 'rotate' && (
                                <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 flex-shrink-0">
                                    <label className="text-sm font-medium text-zinc-400">Attempts:</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={schedulerConfig.maxAttempts}
                                        onChange={e => {
                                            const val = Math.max(1, Number(e.target.value));
                                            const newConfig = { ...schedulerConfig, maxAttempts: val };
                                            setSchedulerConfig(newConfig);
                                            fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                                        }}
                                        className="w-10 bg-transparent text-white text-sm font-bold outline-none text-center"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 md:ml-auto flex-shrink-0">
                            <div className="flex items-center gap-2 px-2 border-r border-zinc-800">
                                <span className="text-sm font-medium text-zinc-400">Next Search:</span>
                                <CountdownTimer nextRun={nextRun} enabled={schedulerConfig.enabled} />
                            </div>
                            <button
                                onClick={async () => {
                                    setIsRunningBatch(true);
                                    try {
                                        await fetch('/api/scheduler/run', { method: 'POST' });
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

                {/* Filter & Controls Box - New Layout */}
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 mb-6 shadow-sm w-full mt-4">
                    {/* Row 1: Search & Core Filters */}
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-5 pb-5 border-b border-zinc-800/60">
                        <div className="w-full lg:flex-1 relative">
                            <input
                                type="text"
                                placeholder="Search active media..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950/50 border border-zinc-700/50 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none placeholder-zinc-500"
                            />
                            <div className="flex w-full lg:w-auto items-center gap-3 flex-wrap justify-start lg:justify-end">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-zinc-400 whitespace-nowrap">Sort By:</span>
                                    <CustomSelect
                                        minimal
                                        options={[
                                            { id: 'recently_added', name: 'Added Date' },
                                            { id: 'recently_released', name: 'Release Date' },
                                            { id: 'alphabetical', name: 'Alphabetical' },
                                            { id: 'nearly_complete', name: 'Completion %' },
                                            { id: 'random', name: 'Randomized' },
                                            { id: 'custom', name: 'Custom' }
                                        ]}
                                        value={profile}
                                        onChange={(val) => handleSaveProfile(val)}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-zinc-400 whitespace-nowrap">Library Filter:</span>
                                    <CustomSelect
                                        value={qualityFilter}
                                        onChange={(val) => setQualityFilter(val)}
                                        options={[
                                            { id: 'all', name: 'All Statuses' },
                                            { id: 'missing', name: 'Missing' },
                                            { id: 'upgradeable', name: 'Upgradeable' }
                                        ]}
                                        small
                                    />
                                </div>

                                <div className="flex items-center gap-2 w-full sm:w-auto mt-1 sm:mt-0">
                                    <button
                                        onClick={handleSaveConfiguration}
                                        disabled={isSaving}
                                        className={`px-4 py-2 w-full sm:w-auto text-xs font-semibold rounded-lg shadow-sm border transition-all whitespace-nowrap ${saveSuccess ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40' : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border-indigo-500/30'}`}
                                    >
                                        {isSaving ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Configuration'}
                                    </button>
                                    {hasUnsavedChanges && !saveSuccess && (
                                        <span className="text-[10px] text-amber-500 font-medium animate-pulse ml-1 whitespace-nowrap">Unsaved changes</span>
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
                    <div className="flex flex-col border-b border-zinc-800 pb-4 mb-4 gap-4">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                                <h2 className="text-2xl font-bold text-white tracking-tight">Media</h2>
                                {!loading && combined.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-y-3 gap-x-4 bg-zinc-900/40 border border-zinc-800/60 px-4 py-2.5 rounded-xl">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleSelectAll(targetItemsForBulkActions)} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700 transition-colors shadow-sm whitespace-nowrap">Activate all</button>
                                            <button onClick={() => handleDeselectAll(targetItemsForBulkActions)} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700 transition-colors shadow-sm whitespace-nowrap">Deactivate all</button>
                                        </div>
                                        <div className="w-px h-6 bg-zinc-700 hidden lg:block"></div>
                                        <label className="flex items-center cursor-pointer group" title="When items are clicked to download, they remain on this list if this is ON">
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only" checked={showDownloading} onChange={() => setShowDownloading(!showDownloading)} />
                                                <div className={`block w-9 h-5 rounded-full transition-colors ${showDownloading ? 'bg-blue-500' : 'bg-zinc-700 group-hover:bg-zinc-600'}`}></div>
                                                <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${showDownloading ? 'translate-x-4' : ''}`}></div>
                                            </div>
                                            <span className="text-sm font-medium text-zinc-300 ml-2 whitespace-nowrap">Show Downloading</span>
                                        </label>
                                        <div className="w-px h-6 bg-zinc-700 hidden lg:block"></div>
                                        <label className="flex items-center cursor-pointer group">
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only" checked={showActiveOnly} onChange={() => setShowActiveOnly(!showActiveOnly)} />
                                                <div className={`block w-9 h-5 rounded-full transition-colors ${showActiveOnly ? 'bg-purple-500' : 'bg-zinc-700 group-hover:bg-zinc-600'}`}></div>
                                                <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${showActiveOnly ? 'translate-x-4' : ''}`}></div>
                                            </div>
                                            <span className="text-sm font-medium text-zinc-300 ml-2 whitespace-nowrap">Show active only</span>
                                        </label>

                                        <div className="w-px h-6 bg-zinc-700 hidden lg:block"></div>
                                        <label className="flex items-center cursor-pointer group">
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only" checked={hideUnmonitored} onChange={() => setHideUnmonitored(!hideUnmonitored)} />
                                                <div className={`block w-9 h-5 rounded-full transition-colors ${hideUnmonitored ? 'bg-emerald-500' : 'bg-zinc-700 group-hover:bg-zinc-600'}`}></div>
                                                <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${hideUnmonitored ? 'translate-x-4' : ''}`}></div>
                                            </div>
                                            <span className="text-sm font-medium text-zinc-300 ml-2 whitespace-nowrap">Hide Unmonitored</span>
                                        </label>
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

                        <label className="flex items-center cursor-pointer group shrink-0">
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
                                items={displayItems.map(c => c.idStr).filter((id): id is string => id !== undefined)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="grid grid-cols-1 gap-3">
                                    {displayItems.map((item) => {
                                        const itemKey = item.idStr ?? String(item.id);
                                        const isToggled = searchToggles[itemKey] !== false;
                                        const isExpanded = item.type === 'series' && expandedSeriesId === `${item.instanceId}-${item.id}`;

                                        return (
                                            <SortableItem key={item.idStr ?? item.id} id={item.idStr ?? String(item.id)} isDraggable={profile === 'custom'}>
                                                <div className="flex-1 flex flex-col gap-1 w-full">
                                                    {/* Main Card */}
                                                    <div
                                                        onClick={(e) => item.type === 'series' && toggleExpandSeries(item, e)}
                                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isToggled ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-900 opacity-60'
                                                            } ${item.type === 'series' ? 'cursor-pointer hover:bg-zinc-800' : ''}`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-2 h-12 rounded-full ${item.instanceColor || (item.type === 'movie' ? 'bg-yellow-500' : 'bg-cyan-500')}`} />
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${item.type === 'movie' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-cyan-500/20 text-cyan-500'}`}>
                                                                        {item.type}
                                                                    </span>
                                                                    {item.isDownloading && (
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                                            Downloading
                                                                        </span>
                                                                    )}
                                                                    <span
                                                                        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-zinc-700/50 opacity-80"
                                                                        style={{
                                                                            backgroundColor: item.instanceColor?.startsWith('#') ? `${item.instanceColor}1a` : undefined,
                                                                            color: item.instanceColor?.startsWith('#') ? item.instanceColor : undefined,
                                                                            borderColor: item.instanceColor?.startsWith('#') ? `${item.instanceColor}33` : undefined
                                                                        }}
                                                                    >
                                                                        {item.instanceName}
                                                                    </span>
                                                                </div>
                                                                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                                                                    {item.title}
                                                                    {item.type === 'series' && (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
                                                                    )}
                                                                </h3>
                                                                <div className="text-sm text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                    {item.type === 'movie'
                                                                        ? (item.isDownloaded ? 'Downloaded' : 'Missing from Library')
                                                                        : (item.stats ? `${item.stats.episodeFileCount} / ${item.stats.episodeCount} Episodes (${Math.round(item.stats.percentOfEpisodes)}%)` : 'Unknown')}
                                                                    <span className="text-zinc-600">•</span>
                                                                    <span>Added {formatDistanceToNow(item.sortDate ?? 0, { addSuffix: true })}</span>

                                                                    <div className="flex items-center gap-2 w-full mt-1">
                                                                        <div className="flex bg-zinc-900 border border-zinc-700/50 rounded-md overflow-hidden text-xs font-medium">
                                                                            <div className="bg-zinc-800 px-2 py-0.5 text-zinc-400 border-r border-zinc-700/50">Target</div>
                                                                            <div className="px-2 py-0.5 text-indigo-400 bg-indigo-500/10">{item.targetQualityProfile}</div>
                                                                        </div>

                                                                        {item.type === 'movie' && item.isDownloaded && (
                                                                            <>
                                                                                <div className="flex bg-zinc-900 border border-zinc-700/50 rounded-md overflow-hidden text-xs font-medium">
                                                                                    <div className="bg-zinc-800 px-2 py-0.5 text-zinc-400 border-r border-zinc-700/50">Current</div>
                                                                                    <div className={`px-2 py-0.5 ${(item.currentQualityScale ?? 0) >= 2160 ? 'text-emerald-400 bg-emerald-500/10' :
                                                                                        (item.currentQualityScale ?? 0) >= 1080 ? 'text-blue-400 bg-blue-500/10' : 'text-yellow-400 bg-yellow-500/10'}`}>
                                                                                        {item.currentQualityScale ? `${item.currentQualityScale}p` : 'Unknown'}
                                                                                    </div>
                                                                                </div>
                                                                                {item.movieFile && (
                                                                                    <div className="flex bg-zinc-900 border border-zinc-700/50 rounded-md overflow-hidden text-xs font-medium">
                                                                                        <div className="bg-zinc-800 px-2 py-0.5 text-zinc-400 border-r border-zinc-700/50">Size</div>
                                                                                        <div className="px-2 py-0.5 text-zinc-300 bg-zinc-800/10">{item.movieFile?.size != null ? formatSize(item.movieFile.size) : 'N/A'}</div>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                        {item.type === 'series' && item.stats && (item.stats as any).sizeOnDisk > 0 && (
                                                                            <div className="flex bg-zinc-900 border border-zinc-700/50 rounded-md overflow-hidden text-xs font-medium">
                                                                                <div className="bg-zinc-800 px-2 py-0.5 text-zinc-400 border-r border-zinc-700/50">Total Size</div>
                                                                                <div className="px-2 py-0.5 text-zinc-300 bg-zinc-800/10">{formatSize((item.stats as any).sizeOnDisk)}</div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {(item.type === 'movie' || item.type === 'series') && (
                                                                <button
                                                                    className="text-xs bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 font-medium px-3 py-1.5 rounded-lg border border-indigo-500/30 transition-colors relative z-20 cursor-pointer flex items-center gap-1.5"
                                                                    onPointerDown={(e) => e.stopPropagation()}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleInteractiveSearch(item.type === 'series' ? 'series' : 'movie', item.id, item.instanceId, item.title);
                                                                    }}
                                                                    title="Search specifically for this item across all indexers"
                                                                >
                                                                    <Search size={14} />
                                                                    Interactive Search
                                                                </button>
                                                            )}

                                                            {item.type === 'movie' && item.hasFile && item.movieFile && (
                                                                <button
                                                                    className="text-xs bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 font-medium px-2 py-1.5 rounded-lg border border-rose-500/30 transition-colors relative z-20 cursor-pointer"
                                                                    onPointerDown={(e) => e.stopPropagation()}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (item.type === 'movie' && item.movieFile) {
                                                                            handleDeleteFile('movie', item.id, item.instanceId, item.movieFile.id);
                                                                        }
                                                                    }}
                                                                    title="Delete movie file from disk"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}

                                                            {searchingItems[itemKey] ? (
                                                                <span className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-zinc-800/80 text-zinc-300 border-zinc-700 flex items-center gap-2">
                                                                    {searchingItems[itemKey].isPolling && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                                                                    {searchingItems[itemKey].status}
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 font-medium px-3 py-1.5 rounded-lg border border-emerald-500/30 transition-colors relative z-20 cursor-pointer flex items-center gap-1.5"
                                                                    onPointerDown={(e) => e.stopPropagation()}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleForceSearch(item);
                                                                    }}
                                                                    title="Trigger automatic search"
                                                                >
                                                                    <RefreshCw size={14} />
                                                                    Force Search {item.type === 'series' && '(All)'}
                                                                </button>
                                                            )}
                                                            <span className="text-xs text-zinc-500 font-medium mr-2">Status: {isToggled ? 'Active' : 'Paused'}</span>
                                                            <button
                                                                onPointerDown={(e) => e.stopPropagation()}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleSearch(itemKey);
                                                                }}
                                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950 cursor-pointer z-50 ${isToggled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                                            >
                                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isToggled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Episodes */}
                                                    {isExpanded && (
                                                        <div className="ml-8 mt-1 mb-4 border-l-2 border-zinc-800 pl-4 py-2 space-y-2">
                                                            {loadingEpisodes[`${item.instanceId}-${item.id}`] ? (
                                                                <div className="text-sm text-zinc-500 flex items-center gap-2 p-2">
                                                                    <div className="w-4 h-4 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin"></div>
                                                                    Loading episodes...
                                                                </div>
                                                            ) : seriesEpisodes[`${item.instanceId}-${item.id}`] ? (
                                                                <div className="grid gap-2">
                                                                    {seriesEpisodes[`${item.instanceId}-${item.id}`]
                                                                        .filter((ep: any) => !hideUnmonitored || ep.monitored)
                                                                        .map((ep: any) => (
                                                                            <div key={ep.id} className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                                                                                <div>
                                                                                    <div className="flex items-center gap-2 mb-1">
                                                                                        <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}</span>
                                                                                        <h4 className="text-sm font-medium text-zinc-200">{ep.title}</h4>
                                                                                        {ep.hasFile ? (
                                                                                            <div className="flex items-center gap-2">
                                                                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Downloaded</span>
                                                                                                <button
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        handleDeleteFile('episode', ep.id, item.instanceId, ep.episodeFileId);
                                                                                                    }}
                                                                                                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors"
                                                                                                    title="Delete episode file"
                                                                                                >
                                                                                                    <Trash2 size={12} />
                                                                                                </button>
                                                                                            </div>
                                                                                        ) : item.queuedEpisodeIds?.includes(ep.id) ? (
                                                                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                                                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                                                                Downloading
                                                                                            </span>
                                                                                        ) : ep.monitored ? (
                                                                                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Missing</span>
                                                                                        ) : (
                                                                                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">Unmonitored</span>
                                                                                        )}
                                                                                    </div>
                                                                                    {ep.hasFile && ep.episodeFile && (
                                                                                        <div className="flex items-center gap-2 mt-1">
                                                                                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{ep.episodeFile.quality?.quality?.name || 'Unknown Quality'}</span>
                                                                                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{formatSize(ep.episodeFile.size || 0)}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                                                                    {!ep.hasFile && ep.monitored && new Date(ep.airDateUtc).getTime() < Date.now() && (
                                                                                        <>
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    handleInteractiveSearch('episode', ep.id, item.instanceId, `${item.title} - S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`);
                                                                                                }}
                                                                                                className="px-2 py-1 text-[10px] font-semibold bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded border border-indigo-500/20 hover:border-indigo-500/40 transition-colors"
                                                                                            >
                                                                                                Interactive Search
                                                                                            </button>

                                                                                            {searchingItems[`episode-${item.instanceId}-${ep.id}`] ? (
                                                                                                <span className="text-[10px] font-semibold px-2 py-1 rounded border bg-zinc-800/80 text-zinc-300 border-zinc-700 flex items-center gap-1.5">
                                                                                                    {searchingItems[`episode-${item.instanceId}-${ep.id}`].isPolling && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                                                                                                    {searchingItems[`episode-${item.instanceId}-${ep.id}`].status}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <button
                                                                                                    className="px-2 py-1 text-[10px] font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded border border-emerald-500/20 hover:border-emerald-500/40 transition-colors cursor-pointer flex items-center gap-1"
                                                                                                    onPointerDown={(e) => e.stopPropagation()}
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        const epItem = {
                                                                                                            idStr: `episode-${item.instanceId}-${ep.id}`,
                                                                                                            instanceId: item.instanceId,
                                                                                                            type: 'episode',
                                                                                                            id: ep.id
                                                                                                        };
                                                                                                        handleForceSearch(epItem as any);
                                                                                                    }}
                                                                                                    title="Trigger automatic search for this specific episode"
                                                                                                >
                                                                                                    <RefreshCw size={12} />
                                                                                                    Force Search
                                                                                                </button>
                                                                                            )}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            ) : (
                                                                <div className="text-sm text-zinc-500 p-2">No episodes found.</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </SortableItem>
                                        );
                                    })}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )
                    }
                </div >

                {/* Interactive Search Modal Overlay */}
                {
                    interactiveSearchItem && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                                <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/50 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-xl font-bold text-white mb-1">Interactive Release Search</h2>
                                        <p className="text-sm text-zinc-400 font-medium">Top 10 highest scored releases for: <span className="text-indigo-400 font-bold">{interactiveSearchItem?.title}</span></p>

                                    </div>
                                    <button
                                        onClick={() => setInteractiveSearchItem(null)}
                                        className="text-zinc-500 hover:text-white p-2 bg-zinc-900 rounded-full hover:bg-zinc-800 border border-zinc-800 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5">
                                    <div className="flex flex-col items-end">
                                        <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1.5 opacity-40 group-hover:opacity-100 transition-opacity">Storage</div>
                                        <div className="text-sm font-black text-white bg-zinc-900 border border-zinc-800/50 px-3 py-1.5 rounded-xl shadow-inner group-hover:border-zinc-700/50 transition-all">
                                            {(interactiveSearchItem as any)?.type === 'movie' ? formatSize((interactiveSearchItem as any)?.sizeOnDisk || 0) : formatSize((interactiveSearchItem as any)?.statistics?.sizeOnDisk || 0)}
                                        </div>
                                    </div>
                                    {loadingReleases ? (
                                        <div className="flex flex-col items-center justify-center py-20">
                                            <div className="w-10 h-10 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mb-4"></div>
                                            <p className="text-zinc-400 font-medium animate-pulse">Querying indexers for live releases...</p>
                                        </div>
                                    ) : interactiveReleases.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 mb-4"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                            <h3 className="text-lg font-bold text-zinc-300">No Releases Found</h3>
                                            <p className="text-sm text-zinc-500 mt-1 max-w-sm text-center">Your indexers could not find any active releases for this item matching its quality profile.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {interactiveReleases.map((release, idx) => (
                                                <div key={release.guid} className="bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 transition-colors p-4 rounded-xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between group">
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                            <span className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 text-zinc-400 text-xs font-bold ring-1 ring-zinc-700">#{idx + 1}</span>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${(release.customFormatScore ?? 0) > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>Score: {release.customFormatScore ?? 0}</span>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-400">{typeof release.quality === 'string' ? release.quality : (release.quality as any)?.quality?.name || 'Unknown'}</span>
                                                            {release.rejected && (
                                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400">Rejected</span>
                                                            )}
                                                        </div>
                                                        <h4 className="text-sm font-medium text-zinc-200 break-words leading-snug group-hover:text-white transition-colors">
                                                            {release.title}
                                                        </h4>
                                                        <div className="flex items-center gap-3 mt-2 text-xs font-medium text-zinc-500">
                                                            <span className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> {(release.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                                            <span className="text-zinc-700">•</span>
                                                            <span>{release.indexer}</span>
                                                            <span className="text-zinc-700">•</span>
                                                            <span className="uppercase text-[10px] tracking-wider">{release.protocol}</span>
                                                        </div>
                                                        {release.rejected && release.rejections && release.rejections.length > 0 && (
                                                            <div className="mt-2 text-xs text-rose-400/80 bg-rose-500/5 p-2 rounded border border-rose-500/10 hidden group-hover:block transition-all">
                                                                Warning: {release.rejections.join(', ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-shrink-0 mt-3 md:mt-0 w-full md:w-auto">
                                                        <button
                                                            onClick={() => triggerInteractiveDownload(release.guid, release.indexerId)}
                                                            disabled={triggeringReleaseGuid !== null}
                                                            className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg border transition-all ${triggeringReleaseGuid === release.guid
                                                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 cursor-wait'
                                                                : triggeringReleaseGuid
                                                                    ? 'bg-zinc-800 text-zinc-600 border-zinc-700 cursor-not-allowed'
                                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]'
                                                                }`}
                                                        >
                                                            {triggeringReleaseGuid === release.guid ? (
                                                                <><div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></div> Grabbing...</>
                                                            ) : (
                                                                <><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download</>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
}

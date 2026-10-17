'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';
import {
    Search, Trash2, RefreshCw, Film, Tv, Sliders, Play, Pause,
    Check, X, HardDrive, Filter, Disc, ChevronDown, ChevronUp,
    Shield, Sparkles, Layers, ListFilter, ArrowUpDown, Clock
} from 'lucide-react';
import { InteractiveSearchModal } from '@/components/InteractiveSearchModal';
import { DeleteMediaModal } from '@/components/DeleteMediaModal';
import { MediaDetailsPanel } from '@/components/MediaDetailsPanel';

interface SchedulerConfig {
    enabled: boolean;
    interval: number;
    batchSize: number;
    batchBehavior: string;
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
    colorHex?: string;
    instanceUrl?: string;
    qualityProfileId: number;
    sizeOnDisk: number;
    hasFile: boolean;
    added: string;
    isDownloading?: boolean;
    genres?: string[];
    monitored: boolean;
    status: string;
    physicalRelease?: string;
    digitalRelease?: string;
    inCinemas?: string;
    airDateUtc?: string;
    movieFile?: { id: number; quality?: { quality?: { resolution: number; name: string } }; size?: number };
    isDownloaded?: boolean;
    targetQualityProfile?: string;
    currentQualityScale?: number;
    sortDate?: number;
    images?: Array<{ coverType: string; remoteUrl?: string; url?: string }>;
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
    airDateUtc?: string;
    episodeFile?: { quality?: { quality?: { name: string } }; size?: number };
}

interface SeriesItem {
    id: number;
    idStr?: string;
    type: 'series';
    title: string;
    year?: number;
    instanceId: string;
    instanceName?: string;
    instanceColor?: string;
    colorHex?: string;
    instanceUrl?: string;
    qualityProfileId: number;
    added: string;
    episodes?: Episode[];
    queuedEpisodeIds?: number[];
    genres?: string[];
    monitored: boolean;
    status: string;
    statistics?: { percentOfEpisodes: number; episodeCount: number; episodeFileCount: number; sizeOnDisk?: number };
    physicalRelease?: string;
    digitalRelease?: string;
    airDateUtc?: string;
    isDownloaded?: boolean;
    targetQualityProfile?: string;
    currentQualityScale?: number;
    sortDate?: number;
    isDownloading?: boolean;
    images?: Array<{ coverType: string; remoteUrl?: string; url?: string }>;
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
    rejections?: string[];
    customFormatScore?: number;
    quality?: { quality?: { name: string } };
    rejected?: boolean;
    protocol?: string;
}

const CountdownTimer = ({ nextRun, enabled }: { nextRun: number | null; enabled: boolean }) => {
    const [countdown, setCountdown] = useState('');

    useEffect(() => {
        if (!nextRun || !enabled) {
            setCountdown('');
            return;
        }
        const tick = () => {
            const diff = nextRun - Date.now();
            if (diff <= 0) {
                setCountdown('Search imminent...');
                return;
            }
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdown(`${m}m ${s.toString().padStart(2, '0')}s`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [nextRun, enabled]);

    return (
        <span className={`text-base font-black tracking-wider ${enabled && nextRun ? 'text-amber-400' : 'text-zinc-600'}`}>
            {enabled ? (countdown || 'Calculating...') : 'Paused'}
        </span>
    );
};

export function SchedulerQueuePanel() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [episodes, setEpisodes] = useState<SeriesItem[]>([]);
    const [instances, setInstances] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Record<number, string>>>({});
    const [loading, setLoading] = useState(true);
    const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({
        enabled: true,
        interval: 30,
        batchSize: 10,
        batchBehavior: 'repeat',
        maxAttempts: 3
    });
    const [nextRun, setNextRun] = useState<number | null>(null);
    const [isRunningBatch, setIsRunningBatch] = useState(false);
    const [triggeringInstanceId, setTriggeringInstanceId] = useState<string | null>(null);

    // Instance Tab & Search Mode Settings
    const [selectedInstanceTab, setSelectedInstanceTab] = useState<string>('all');
    const [sonarrSearchModes, setSonarrSearchModes] = useState<Record<string, 'missing' | 'general'>>({});
    const [selectedMediaItem, setSelectedMediaItem] = useState<any | null>(null);

    // Queue Filters & State
    const [searchQuery, setSearchQuery] = useState('');
    const [qualityFilter, setQualityFilter] = useState('missing'); // all | missing | upgradeable
    const [sortProfile, setSortProfile] = useState('recently_added'); // recently_added | recently_released | alphabetical | nearly_complete
    const [selectedGenres, setSelectedGenres] = useState<string[]>(['All']);
    const [genreLogic, setGenreLogic] = useState<'OR' | 'AND' | 'EXCLUDE'>('OR');
    const [instanceFilters, setInstanceFilters] = useState<Record<string, boolean>>({});
    const [searchToggles, setSearchToggles] = useState<Record<string, boolean>>({});
    const [showActiveOnly, setShowActiveOnly] = useState(false);
    const [hideUnmonitored, setHideUnmonitored] = useState(false);

    // Dynamic expanded series
    const [expandedSeriesKey, setExpandedSeriesKey] = useState<string | null>(null);
    const [seriesEpisodesCache, setSeriesEpisodesCache] = useState<Record<string, Episode[]>>({});
    const [loadingEpisodes, setLoadingEpisodes] = useState<Record<string, boolean>>({});

    // Live search status feedback per item
    const [searchingItems, setSearchingItems] = useState<Record<string, { status: string; isPolling: boolean }>>({});

    // Interactive Search Modal State
    const [interactiveSearchItem, setInteractiveSearchItem] = useState<{
        type: 'movie' | 'series' | 'episode';
        id: number;
        instanceId: string;
        title: string;
        episodeId?: number;
    } | null>(null);
    const [interactiveReleases, setInteractiveReleases] = useState<Release[]>([]);
    const [loadingReleases, setLoadingReleases] = useState(false);
    const [triggeringReleaseGuid, setTriggeringReleaseGuid] = useState<string | null>(null);

    // Delete Confirmation State
    const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{
        type: 'movie' | 'series';
        id: number;
        instanceId: string;
        fileId?: number;
        title: string;
    } | null>(null);
    const [isDeletingFile, setIsDeletingFile] = useState(false);

    const [isSavingConfig, setIsSavingConfig] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [movieRes, epRes, profileRes, configRes, settingsRes, instRes] = await Promise.all([
                fetch('/api/radarr/all').catch(() => null),
                fetch('/api/sonarr/all').catch(() => null),
                fetch('/api/quality').catch(() => null),
                fetch('/api/scheduler/status').catch(() => null),
                fetch('/api/settings').catch(() => null),
                fetch('/api/instances').catch(() => null)
            ]);

            if (movieRes && movieRes.ok) {
                const data = await movieRes.json();
                setMovies(Array.isArray(data) ? data : []);
            }
            if (epRes && epRes.ok) {
                const data = await epRes.json();
                setEpisodes(Array.isArray(data) ? data : []);
            }
            if (profileRes && profileRes.ok) {
                const data = await profileRes.json();
                if (data?.profiles) setProfiles(data.profiles);
            }
            if (instRes && instRes.ok) {
                const data = await instRes.json();
                setInstances(Array.isArray(data) ? data : []);
            }
            if (configRes && configRes.ok) {
                const d = await configRes.json();
                setSchedulerConfig({
                    enabled: d.enabled !== false,
                    interval: d.interval || 30,
                    batchSize: d.batchSize || 10,
                    batchBehavior: d.batchBehavior || 'repeat',
                    maxAttempts: d.maxAttempts || 3
                });
                if (d.nextRun) setNextRun(d.nextRun);
            }
            if (settingsRes && settingsRes.ok) {
                const s = await settingsRes.json();
                if (s.priority_profile) setSortProfile(s.priority_profile);
                if (s.ui_search_toggles) {
                    try { setSearchToggles(JSON.parse(s.ui_search_toggles)); } catch { }
                }
                if (s.ui_instance_filters) {
                    try { setInstanceFilters(JSON.parse(s.ui_instance_filters)); } catch { }
                }
                if (s.ui_selected_genres) {
                    try { setSelectedGenres(JSON.parse(s.ui_selected_genres)); } catch { }
                }
                if (s.ui_genre_logic) setGenreLogic(s.ui_genre_logic);
                if (s.ui_active_only !== undefined) setShowActiveOnly(s.ui_active_only === 'true');
                if (s.ui_hide_unmonitored !== undefined) setHideUnmonitored(s.ui_hide_unmonitored === 'true');
                if (s.sonarr_search_modes) {
                    try { setSonarrSearchModes(JSON.parse(s.sonarr_search_modes)); } catch { }
                }
            }
        } catch { }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
        const id = setInterval(fetchData, 60000);
        return () => clearInterval(id);
    }, [fetchData]);

    const handleSetSonarrSearchMode = async (instanceId: string, mode: 'missing' | 'general') => {
        const updated = { ...sonarrSearchModes, [instanceId]: mode };
        setSonarrSearchModes(updated);
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'sonarr_search_modes', value: JSON.stringify(updated) })
            });
            toast.success(mode === 'general' ? 'General Series search mode saved' : 'Missing Episodes search mode saved');
        } catch {
            toast.error('Failed to save search mode preference');
        }
    };

    const updateConfig = async (updates: Partial<SchedulerConfig>) => {
        const nc = { ...schedulerConfig, ...updates };
        setSchedulerConfig(nc);
        try {
            await fetch('/api/scheduler/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nc)
            });
        } catch { }
    };

    const handleRunBatchNow = async () => {
        setIsRunningBatch(true);
        try {
            const res = await fetch('/api/scheduler/run', { method: 'POST' });
            if (res.ok) {
                toast.success('Batch search triggered!');
                fetchData();
            } else {
                toast.error('Failed to trigger batch run');
            }
        } catch {
            toast.error('Network error triggering batch search');
        } finally {
            setIsRunningBatch(false);
        }
    };

    const handleTriggerInstanceSearch = async (inst: any) => {
        setTriggeringInstanceId(inst.id);
        try {
            let res;
            if (inst.type === 'radarr') {
                res = await fetch('/api/radarr/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId: inst.id, name: 'MoviesSearch' })
                });
            } else if (inst.type === 'sonarr') {
                const searchMode = sonarrSearchModes[inst.id] || 'missing';
                const commandName = searchMode === 'general' ? 'SeriesSearch' : 'MissingEpisodeSearch';
                res = await fetch('/api/sonarr/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId: inst.id, name: commandName })
                });
            } else if (inst.type === 'lidarr') {
                res = await fetch('/api/lidarr/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId: inst.id, name: 'MissingAlbumSearch' })
                });
            }
            if (res && res.ok) {
                toast.success(`Search triggered on ${inst.name}`);
            } else {
                const err = await res?.json().catch(() => ({}));
                toast.error(err?.error || `Failed to trigger search on ${inst.name}`);
            }
        } catch {
            toast.error(`Error triggering search on ${inst.name}`);
        } finally {
            setTriggeringInstanceId(null);
        }
    };

    const handleForceSearchItem = async (item: { instanceId: string; type: string; id: number; idStr: string }) => {
        const idStr = item.idStr;
        setSearchingItems(p => ({ ...p, [idStr]: { status: 'Triggering...', isPolling: true } }));
        try {
            const r = await fetch('/api/search/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instanceId: item.instanceId, type: item.type, mediaId: item.id })
            });
            if (!r.ok) throw new Error('Trigger failed');
            setSearchingItems(p => ({ ...p, [idStr]: { status: 'Searching...', isPolling: true } }));

            let tries = 0;
            const poll = setInterval(async () => {
                tries++;
                try {
                    const s = await fetch(`/api/search/status?instanceId=${item.instanceId}&type=${item.type}&mediaId=${item.id}`);
                    if (s.ok) {
                        const d = await s.json();
                        if (d.status && d.status !== 'Not in queue') {
                            setSearchingItems(p => ({ ...p, [idStr]: { status: `Grabbed (${d.status})`, isPolling: false } }));
                            clearInterval(poll);
                            return;
                        }
                    }
                } catch { }
                if (tries >= 10) {
                    setSearchingItems(p => ({ ...p, [idStr]: { status: 'Finished', isPolling: false } }));
                    clearInterval(poll);
                }
            }, 3000);
        } catch {
            setSearchingItems(p => ({ ...p, [idStr]: { status: 'Error', isPolling: false } }));
        }
    };

    const handleOpenInteractiveSearch = async (item: { type: 'movie' | 'series' | 'episode'; id: number; instanceId: string; title: string; episodeId?: number }) => {
        setInteractiveSearchItem(item);
        setLoadingReleases(true);
        setInteractiveReleases([]);
        try {
            const endpoint = item.type === 'movie'
                ? `/api/radarr/releases?instanceId=${item.instanceId}&movieId=${item.id}`
                : `/api/sonarr/releases?instanceId=${item.instanceId}&seriesId=${item.id}${item.episodeId ? `&episodeId=${item.episodeId}` : ''}`;
            const res = await fetch(endpoint);
            if (res.ok) {
                const data = await res.json();
                setInteractiveReleases(Array.isArray(data) ? data : []);
            } else {
                toast.error('No releases returned from indexers');
            }
        } catch {
            toast.error('Failed to query indexers');
        } finally {
            setLoadingReleases(false);
        }
    };

    const handleTriggerInteractiveDownload = async (guid: string, indexerId: number) => {
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
            if (res.ok) {
                toast.success('Release sent to download client!');
                setInteractiveSearchItem(null);
                fetchData();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Failed to grab release');
            }
        } catch {
            toast.error('Error grabbing release');
        } finally {
            setTriggeringReleaseGuid(null);
        }
    };

    const handleDeleteTarget = (target: { type: 'movie' | 'series'; id: number; instanceId: string; fileId?: number; title: string }) => {
        setConfirmDeleteTarget(target);
    };

    const executeDelete = async (options: { deleteFiles: boolean; removeFromApp: boolean; deleteFilesOnly?: boolean }) => {
        if (!confirmDeleteTarget) return;
        setIsDeletingFile(true);
        try {
            const { type, id, instanceId, fileId } = confirmDeleteTarget;
            let res;
            if (options.deleteFilesOnly && fileId) {
                const url = type === 'movie'
                    ? `/api/radarr/file?instanceId=${instanceId}&fileId=${fileId}`
                    : `/api/sonarr/file?instanceId=${instanceId}&fileId=${fileId}`;
                res = await fetch(url, { method: 'DELETE' });
            } else {
                const url = type === 'movie'
                    ? `/api/radarr/delete?instanceId=${instanceId}&id=${id}&deleteFiles=${options.deleteFiles}`
                    : `/api/sonarr/delete?instanceId=${instanceId}&id=${id}&deleteFiles=${options.deleteFiles}`;
                res = await fetch(url, { method: 'DELETE' });
            }
            if (res.ok) {
                toast.success('Media removed');
                setConfirmDeleteTarget(null);
                fetchData();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Failed to delete');
            }
        } catch {
            toast.error('Network error during deletion');
        } finally {
            setIsDeletingFile(false);
        }
    };

    const fetchSeriesEpisodes = async (instanceId: string, seriesId: number) => {
        const key = `${instanceId}-${seriesId}`;
        if (seriesEpisodesCache[key]) return;
        setLoadingEpisodes(p => ({ ...p, [key]: true }));
        try {
            const r = await fetch(`/api/sonarr/episodes?instanceId=${instanceId}&seriesId=${seriesId}`);
            if (r.ok) {
                const data = await r.json();
                setSeriesEpisodesCache(p => ({ ...p, [key]: Array.isArray(data) ? data : [] }));
            }
        } catch { }
        setLoadingEpisodes(p => ({ ...p, [key]: false }));
    };

    const handleSaveConfig = async () => {
        setIsSavingConfig(true);
        try {
            const pairs = [
                ['ui_selected_genres', JSON.stringify(selectedGenres)],
                ['ui_genre_logic', genreLogic],
                ['ui_instance_filters', JSON.stringify(instanceFilters)],
                ['ui_active_only', showActiveOnly ? 'true' : 'false'],
                ['ui_hide_unmonitored', hideUnmonitored ? 'true' : 'false'],
                ['ui_search_toggles', JSON.stringify(searchToggles)],
                ['priority_profile', sortProfile]
            ];
            await Promise.all(
                pairs.map(([key, value]) =>
                    fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key, value })
                    })
                )
            );
            toast.success('Scheduler filters saved');
        } catch {
            toast.error('Failed to save configuration');
        } finally {
            setIsSavingConfig(false);
        }
    };

    // ── Build combined and filtered list ────────────────────────
    const combinedList = useMemo(() => {
        const safeMovies = Array.isArray(movies) ? movies : [];
        const safeEpisodes = Array.isArray(episodes) ? episodes : [];

        let items: Array<any> = [
            ...safeMovies.map(m => {
                const url = (m.instanceUrl || '').replace(/\/$/, '');
                return {
                    ...m,
                    type: 'movie' as const,
                    idStr: `movie-${m.instanceId}-${m.id}`,
                    isDownloaded: m.hasFile,
                    targetQualityProfile: (url && m.qualityProfileId && profiles?.[url]?.[m.qualityProfileId]) || 'Default',
                    currentQualityScale: m.movieFile?.quality?.quality?.resolution || 0,
                    sortDate: new Date(m.added).getTime(),
                    poster: m.images?.find(i => i.coverType === 'poster')?.remoteUrl || m.images?.find(i => i.coverType === 'poster')?.url || ''
                };
            }),
            ...safeEpisodes.map(s => {
                const url = (s.instanceUrl || '').replace(/\/$/, '');
                return {
                    ...s,
                    type: 'series' as const,
                    idStr: `series-${s.instanceId}-${s.id}`,
                    isDownloaded: s.statistics?.percentOfEpisodes === 100,
                    targetQualityProfile: (url && s.qualityProfileId && profiles?.[url]?.[s.qualityProfileId]) || 'Default',
                    sortDate: new Date(s.added).getTime(),
                    poster: s.images?.find(i => i.coverType === 'poster')?.remoteUrl || s.images?.find(i => i.coverType === 'poster')?.url || ''
                };
            })
        ];

        // Library Filter
        if (qualityFilter === 'missing') {
            items = items.filter(i => !i.isDownloaded);
        } else if (qualityFilter === 'upgradeable') {
            items = items.filter(i => i.isDownloaded && i.monitored);
        }

        // Active instances filter
        items = items.filter(i => instanceFilters[i.instanceId] !== false);

        // Search Query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            items = items.filter(i => (i.title || '').toLowerCase().includes(q));
        }

        // Genre Filter
        if (!selectedGenres.includes('All')) {
            items = items.filter(item => {
                const g = item.genres || [];
                if (genreLogic === 'OR') return g.some((x: string) => selectedGenres.includes(x));
                if (genreLogic === 'AND') return selectedGenres.every((x: string) => g.includes(x));
                if (genreLogic === 'EXCLUDE') return !g.some((x: string) => selectedGenres.includes(x));
                return true;
            });
        }

        // Active Only toggle
        if (showActiveOnly) {
            items = items.filter(i => searchToggles[i.idStr] !== false);
        }

        // Hide Unmonitored
        if (hideUnmonitored) {
            items = items.filter(i => i.monitored === true);
        }

        // Sorting
        if (sortProfile === 'recently_released') {
            items.sort((a, b) => {
                const da = a.physicalRelease || a.digitalRelease || a.airDateUtc || '1970';
                const db = b.physicalRelease || b.digitalRelease || b.airDateUtc || '1970';
                return new Date(db).getTime() - new Date(da).getTime();
            });
        } else if (sortProfile === 'alphabetical') {
            items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        } else if (sortProfile === 'nearly_complete') {
            items.sort((a, b) => {
                const pa = a.statistics?.percentOfEpisodes || 0;
                const pb = b.statistics?.percentOfEpisodes || 0;
                return pb !== pa ? pb - pa : (b.sortDate || 0) - (a.sortDate || 0);
            });
        } else if (sortProfile === 'random') {
            // stable random using id
            items.sort((a, b) => (a.id % 13) - (b.id % 13));
        } else {
            // recently_added
            items.sort((a, b) => (b.sortDate || 0) - (a.sortDate || 0));
        }

        // Filter by selected instance tab if not 'all'
        if (selectedInstanceTab !== 'all') {
            items = items.filter(i => i.instanceId === selectedInstanceTab);
        }

        return items;
    }, [movies, episodes, profiles, qualityFilter, instanceFilters, searchQuery, selectedGenres, genreLogic, showActiveOnly, hideUnmonitored, sortProfile, searchToggles, selectedInstanceTab]);

    // Unique genres
    const uniqueGenres = useMemo(() => {
        const set = new Set<string>();
        [...(movies || []), ...(episodes || [])].forEach(item => {
            (item.genres || []).forEach((g: string) => set.add(g));
        });
        return ['All', ...Array.from(set).sort()];
    }, [movies, episodes]);

    const activeInstancesList = useMemo(() => {
        return (Array.isArray(instances) ? instances : []).filter(i => i.type === 'radarr' || i.type === 'sonarr' || i.type === 'lidarr');
    }, [instances]);

    const handleSelectAll = () => {
        const next: Record<string, boolean> = { ...searchToggles };
        combinedList.forEach(item => {
            next[item.idStr] = true;
        });
        setSearchToggles(next);
    };

    const handleDeselectAll = () => {
        const next: Record<string, boolean> = { ...searchToggles };
        combinedList.forEach(item => {
            next[item.idStr] = false;
        });
        setSearchToggles(next);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* ══════════════════════════════════════════════════════════
                INSTANCE NAVIGATION TABS MENU
               ══════════════════════════════════════════════════════════ */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 flex-wrap">
                <button
                    type="button"
                    onClick={() => setSelectedInstanceTab('all')}
                    className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap border ${
                        selectedInstanceTab === 'all'
                            ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg shadow-emerald-500/20'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800'
                    }`}
                    title="Master Scheduler Engine & All Instance Queues"
                >
                    <Layers size={20} />
                    <span>All</span>
                </button>

                {activeInstancesList.map(inst => {
                    const isSelected = selectedInstanceTab === inst.id;
                    const Icon = inst.type === 'radarr' ? Film : inst.type === 'sonarr' ? Tv : Disc;
                    return (
                        <button
                            key={inst.id}
                            type="button"
                            onClick={() => setSelectedInstanceTab(inst.id)}
                            className={`px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap border ${
                                isSelected
                                    ? 'bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-600/30'
                                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800'
                            }`}
                            title={`Automation & Search Settings for ${inst.name} (${inst.type})`}
                        >
                            <Icon size={20} />
                            <span className={`w-2.5 h-2.5 rounded-full ${inst.color || 'bg-emerald-400'}`} />
                            <span>{inst.name}</span>
                        </button>
                    );
                })}
            </div>

            {/* ══════════════════════════════════════════════════════════
                VIEW A: PER-INSTANCE SETTINGS MENU (When Instance Selected)
               ══════════════════════════════════════════════════════════ */}
            {selectedInstanceTab !== 'all' && (() => {
                const activeInstance = activeInstancesList.find(i => i.id === selectedInstanceTab);
                if (!activeInstance) return null;
                const Icon = activeInstance.type === 'radarr' ? Film : activeInstance.type === 'sonarr' ? Tv : Disc;
                const currentSonarrMode = sonarrSearchModes[activeInstance.id] || 'missing';

                return (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                    <Icon size={26} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                                        <span>{activeInstance.name}</span>
                                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase text-black bg-violet-400">
                                            {activeInstance.type}
                                        </span>
                                    </h2>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    disabled={triggeringInstanceId === activeInstance.id}
                                    onClick={() => handleTriggerInstanceSearch(activeInstance)}
                                    className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2.5 cursor-pointer shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
                                    title={`Trigger ${activeInstance.type === 'sonarr' && currentSonarrMode === 'general' ? 'General Series' : 'Missing'} Search on ${activeInstance.name}`}
                                >
                                    {triggeringInstanceId === activeInstance.id ? (
                                        <RefreshCw size={18} className="animate-spin text-white" />
                                    ) : (
                                        <Play size={18} className="fill-current" />
                                    )}
                                    <span>
                                        {activeInstance.type === 'sonarr'
                                            ? (currentSonarrMode === 'general' ? 'Search Series' : 'Search Missing')
                                            : activeInstance.type === 'radarr'
                                                ? 'Search Movies'
                                                : 'Search Music'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Sonarr Series Search Mode Switcher (Missing vs General) */}
                        {activeInstance.type === 'sonarr' && (
                            <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <span className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                                        <Search size={16} className="text-violet-400" />
                                        Search Mode
                                    </span>
                                    <span className="text-xs font-bold text-zinc-400">
                                        {currentSonarrMode === 'general' ? 'General Series Search' : 'Missing Episodes Only'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => handleSetSonarrSearchMode(activeInstance.id, 'missing')}
                                        className={`p-4 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                                            currentSonarrMode === 'missing'
                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-lg'
                                                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'
                                        }`}
                                        title="Search only missing monitored episodes across series on this instance"
                                    >
                                        <ListFilter size={22} className="shrink-0" />
                                        <div className="text-left min-w-0">
                                            <span className="text-sm font-black uppercase tracking-wider block">Missing</span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleSetSonarrSearchMode(activeInstance.id, 'general')}
                                        className={`p-4 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                                            currentSonarrMode === 'general'
                                                ? 'bg-violet-600/25 text-violet-300 border-violet-500/60 shadow-lg'
                                                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'
                                        }`}
                                        title="Search generally for all monitored series and quality upgrades on this instance"
                                    >
                                        <Sparkles size={22} className="shrink-0" />
                                        <div className="text-left min-w-0">
                                            <span className="text-sm font-black uppercase tracking-wider block">General</span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ══════════════════════════════════════════════════════════
                VIEW B: MASTER SCHEDULER ENGINE (When "All" Selected)
               ══════════════════════════════════════════════════════════ */}
            {selectedInstanceTab === 'all' && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Sliders size={26} />
                            </div>
                            <h2 className="text-2xl font-black text-white tracking-tight">
                                Scheduler Engine
                            </h2>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Countdown to Next Run */}
                            <div className="px-4 py-2 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center gap-2.5">
                                <Clock size={18} className="text-amber-400 shrink-0" />
                                <CountdownTimer nextRun={nextRun} enabled={schedulerConfig.enabled} />
                            </div>

                            {/* Master State Switch */}
                            <button
                                type="button"
                                onClick={() => updateConfig({ enabled: !schedulerConfig.enabled })}
                                className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-2xl transition-all border cursor-pointer ${
                                    schedulerConfig.enabled
                                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-400 shadow-lg shadow-emerald-500/30'
                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                                }`}
                                title={schedulerConfig.enabled ? 'Click to Pause Scheduler' : 'Click to Enable Scheduler'}
                            >
                                {schedulerConfig.enabled ? 'Active' : 'Paused'}
                            </button>
                        </div>
                    </div>

                    {/* Configuration Inputs Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="flex flex-col gap-1.5 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3.5">
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Interval (Min)</span>
                            <input
                                type="number"
                                min={1}
                                max={10080}
                                value={schedulerConfig.interval}
                                onChange={e => updateConfig({ interval: Math.max(1, Math.min(10080, parseInt(e.target.value) || 30)) })}
                                className="bg-transparent text-white text-base font-black outline-none w-full"
                                title="Minutes between automated search batches"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3.5">
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Batch Size</span>
                            <CustomSelect
                                minimal
                                options={[...Array(50)].map((_, i) => ({ id: i + 1, name: `${i + 1} items` }))}
                                value={schedulerConfig.batchSize}
                                onChange={val => updateConfig({ batchSize: Number(String(val).match(/\d+/)?.[0] || 10) })}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3.5">
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Rotation Mode</span>
                            <CustomSelect
                                minimal
                                options={[{ id: 'repeat', name: 'Repeat' }, { id: 'rotate', name: 'Rotate' }]}
                                value={schedulerConfig.batchBehavior}
                                onChange={val => updateConfig({ batchBehavior: String(val) })}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3.5 justify-center">
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Max Attempts</span>
                            <input
                                type="number"
                                min={1}
                                max={20}
                                value={schedulerConfig.maxAttempts}
                                onChange={e => updateConfig({ maxAttempts: Math.max(1, parseInt(e.target.value) || 3) })}
                                className="bg-transparent text-white text-base font-black outline-none w-full"
                                title="Maximum search attempts per cycle"
                            />
                        </div>
                    </div>

                    {/* Instant Master Trigger & Per-Instance Quick Triggers */}
                    <div className="pt-2 space-y-4">
                        <button
                            type="button"
                            onClick={handleRunBatchNow}
                            disabled={isRunningBatch || !schedulerConfig.enabled}
                            className={`w-full py-4 text-sm font-black uppercase tracking-wider rounded-2xl transition-all border cursor-pointer flex items-center justify-center gap-3 ${
                                isRunningBatch
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    : !schedulerConfig.enabled
                                        ? 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-xl shadow-indigo-600/20'
                            }`}
                            title="Trigger Immediate Batch Search across all active instances"
                        >
                            {isRunningBatch ? (
                                <RefreshCw size={20} className="animate-spin" />
                            ) : (
                                <Play size={20} className="fill-current" />
                            )}
                            <span>Run Batch Search Now</span>
                        </button>

                        {/* Per-Instance Trigger Buttons */}
                        {activeInstancesList.length > 0 && (
                            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                                <span className="text-xs font-black uppercase tracking-wider text-zinc-500 block">
                                    Quick Instance Search Triggers
                                </span>
                                <div className="flex flex-wrap gap-2.5">
                                    {activeInstancesList.map(inst => (
                                        <button
                                            key={inst.id}
                                            type="button"
                                            disabled={triggeringInstanceId === inst.id}
                                            onClick={() => handleTriggerInstanceSearch(inst)}
                                            className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 text-white border border-zinc-800 flex items-center gap-2.5 text-xs font-black uppercase tracking-wider cursor-pointer transition-all hover:scale-102 active:scale-98 shadow-md"
                                            title={`Trigger Search for ${inst.name} (${inst.type})`}
                                        >
                                            <span className={`w-2.5 h-2.5 rounded-full ${inst.color || 'bg-emerald-400'}`} />
                                            <span>{inst.name}</span>
                                            {triggeringInstanceId === inst.id ? (
                                                <RefreshCw size={14} className="animate-spin text-amber-400" />
                                            ) : (
                                                <RefreshCw size={14} className="text-zinc-500 hover:text-white" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                CARD 2: FILTER CONTROLS & GENRE LOGIC
               ══════════════════════════════════════════════════════════ */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
                {/* Search Bar + Sort + Library Filter + Save Button */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="Filter queue by title..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm rounded-2xl p-4 outline-none placeholder-zinc-600 pr-12 focus:border-zinc-700"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                            <Search size={20} />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 bg-zinc-950 p-2 rounded-2xl border border-zinc-800 shrink-0">
                        {/* Sort selector */}
                        <div className="flex items-center gap-2 px-2 border-r border-zinc-800">
                            <span className="text-xs font-black text-zinc-500 uppercase">Sort:</span>
                            <CustomSelect
                                minimal
                                options={[
                                    { id: 'recently_added', name: 'Added' },
                                    { id: 'recently_released', name: 'Released' },
                                    { id: 'alphabetical', name: 'A-Z' },
                                    { id: 'nearly_complete', name: 'Completion' },
                                    { id: 'random', name: 'Random' }
                                ]}
                                value={sortProfile}
                                onChange={val => setSortProfile(String(val))}
                            />
                        </div>

                        {/* Library status filter */}
                        <div className="flex items-center gap-2 px-2 border-r border-zinc-800">
                            <span className="text-xs font-black text-zinc-500 uppercase">Status:</span>
                            <CustomSelect
                                minimal
                                options={[
                                    { id: 'all', name: 'All' },
                                    { id: 'missing', name: 'Missing' },
                                    { id: 'upgradeable', name: 'Upgradeable' }
                                ]}
                                value={qualityFilter}
                                onChange={val => setQualityFilter(String(val))}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleSaveConfig}
                            disabled={isSavingConfig}
                            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 cursor-pointer transition-all"
                            title="Save current filters as default scheduler config"
                        >
                            {isSavingConfig ? 'Saving...' : 'Save Filters'}
                        </button>
                    </div>
                </div>

                {/* Instance Filter Buttons */}
                {activeInstancesList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/80">
                        <span className="text-xs font-black text-zinc-500 uppercase tracking-wider mr-2">
                            Instances:
                        </span>
                        {activeInstancesList.map(inst => {
                            const isIncluded = instanceFilters[inst.id] !== false;
                            return (
                                <button
                                    key={inst.id}
                                    type="button"
                                    onClick={() => setInstanceFilters(p => ({ ...p, [inst.id]: !isIncluded }))}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${
                                        isIncluded
                                            ? 'bg-zinc-800 text-white border-zinc-600 shadow-md'
                                            : 'bg-zinc-950 text-zinc-600 border-zinc-850 opacity-50'
                                    }`}
                                    title={`Toggle ${inst.name} in queue`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${inst.color || 'bg-emerald-400'}`} />
                                    <span>{inst.name}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Genre Logic & Filter Pills */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 pt-3 border-t border-zinc-800/80">
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1 shrink-0">
                        {(['OR', 'AND', 'EXCLUDE'] as const).map(l => (
                            <button
                                key={l}
                                type="button"
                                onClick={() => setGenreLogic(l)}
                                className={`px-3 py-1.5 text-xs font-black rounded-lg cursor-pointer transition-all ${
                                    genreLogic === l
                                        ? l === 'EXCLUDE'
                                            ? 'bg-rose-500 text-black'
                                            : 'bg-indigo-600 text-white'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                                title={`Filter logic: ${l}`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                        {uniqueGenres.slice(0, 30).map(g => {
                            const isSelected = selectedGenres.includes(g);
                            return (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => {
                                        if (g === 'All') {
                                            setSelectedGenres(['All']);
                                        } else {
                                            const next = selectedGenres.includes(g)
                                                ? selectedGenres.filter(x => x !== g && x !== 'All')
                                                : [...selectedGenres.filter(x => x !== 'All'), g];
                                            setSelectedGenres(next.length === 0 ? ['All'] : next);
                                        }
                                    }}
                                    className={`px-3 py-1 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                                        isSelected
                                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-md'
                                            : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'
                                    }`}
                                    title={`Toggle genre ${g}`}
                                >
                                    {g}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Bulk Selection and Total Counter */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80 text-xs text-zinc-400">
                    <div className="flex items-center gap-3">
                        <span className="font-black text-white text-sm">
                            {combinedList.length} Items in Queue
                        </span>
                        <span className="text-zinc-600">•</span>
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="font-bold text-indigo-400 hover:underline cursor-pointer"
                            title="Enable search for all displayed items"
                        >
                            Select All
                        </button>
                        <span className="text-zinc-600">•</span>
                        <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="font-bold text-zinc-400 hover:underline cursor-pointer"
                            title="Disable search for all displayed items"
                        >
                            Deselect All
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer" title="Hide unmonitored media items">
                            <input
                                type="checkbox"
                                checked={hideUnmonitored}
                                onChange={e => setHideUnmonitored(e.target.checked)}
                                className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                            />
                            <span className="font-bold text-zinc-400 text-xs">Monitored Only</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                CARD 3: QUEUE MEDIA LIST
               ══════════════════════════════════════════════════════════ */}
            <div className="space-y-3">
                {loading ? (
                    <div className="p-16 text-center bg-zinc-900/40 rounded-3xl border border-zinc-800 flex flex-col items-center justify-center gap-3">
                        <RefreshCw size={28} className="animate-spin text-emerald-400" />
                        <span className="text-sm font-black text-zinc-400 uppercase tracking-wider">
                            Loading Queue...
                        </span>
                    </div>
                ) : combinedList.length === 0 ? (
                    <div className="p-16 text-center bg-zinc-900/40 rounded-3xl border border-zinc-800 text-zinc-500 font-bold text-sm">
                        No items matching queue filters.
                    </div>
                ) : (
                    combinedList.map(item => {
                        const isSearchActive = searchToggles[item.idStr] !== false;
                        const liveStatus = searchingItems[item.idStr];
                        const isExpanded = expandedSeriesKey === item.idStr;
                        const cachedEps = seriesEpisodesCache[`${item.instanceId}-${item.id}`] || [];
                        const isEpsLoading = loadingEpisodes[`${item.instanceId}-${item.id}`] || false;

                        return (
                            <div
                                key={item.idStr}
                                className={`p-4 sm:p-5 rounded-3xl border-2 transition-all space-y-4 ${
                                    isSearchActive
                                        ? 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 shadow-xl'
                                        : 'bg-zinc-950/60 border-zinc-900 opacity-60'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-4">
                                    {/* Media Thumbnail & Meta */}
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        <div
                                            onClick={() => setSelectedMediaItem(item)}
                                            className="w-14 h-20 sm:w-16 sm:h-24 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center shadow-md cursor-pointer hover:border-violet-500/50 hover:scale-105 transition-all group"
                                            title="Open Media Details"
                                        >
                                            {item.poster ? (
                                                <img
                                                    src={item.poster}
                                                    alt=""
                                                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                                                />
                                            ) : item.type === 'movie' ? (
                                                <Film size={24} className="text-zinc-600" />
                                            ) : (
                                                <Tv size={24} className="text-zinc-600" />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <h3
                                                    onClick={() => setSelectedMediaItem(item)}
                                                    className="text-base sm:text-lg font-black text-white truncate cursor-pointer hover:text-violet-400 transition-colors"
                                                    title="Open Media Details"
                                                >
                                                    {item.title}
                                                </h3>
                                                {item.year && (
                                                    <span className="text-xs font-bold text-zinc-500">
                                                        ({item.year})
                                                    </span>
                                                )}
                                                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase text-black ${item.instanceColor || 'bg-emerald-400'}`}>
                                                    {item.instanceName || item.instanceId}
                                                </span>
                                                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase border ${
                                                    item.isDownloaded
                                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                }`}>
                                                    {item.isDownloaded ? 'Downloaded' : 'Missing'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                                                <span className="font-bold text-zinc-300">
                                                    Target: {item.targetQualityProfile}
                                                </span>
                                                {item.type === 'movie' && item.movieFile?.quality?.quality?.name && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-zinc-400">
                                                            {item.movieFile.quality.quality.name}
                                                        </span>
                                                    </>
                                                )}
                                                {item.type === 'series' && item.statistics && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-emerald-400 font-bold">
                                                            {item.statistics.episodeFileCount} / {item.statistics.episodeCount} eps ({Math.round(Number(item.statistics.percentOfEpisodes) || 0)}%)
                                                        </span>
                                                    </>
                                                )}
                                            </div>

                                            {liveStatus && (
                                                <div className="flex items-center gap-2 pt-1">
                                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                    <span className="text-xs font-mono font-bold text-amber-300">
                                                        {liveStatus.status}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons (Strict Pure Symbols Over Text) */}
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        {/* Series Expand Toggle */}
                                        {item.type === 'series' && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isExpanded) {
                                                        setExpandedSeriesKey(null);
                                                    } else {
                                                        setExpandedSeriesKey(item.idStr);
                                                        fetchSeriesEpisodes(item.instanceId, item.id);
                                                    }
                                                }}
                                                className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 cursor-pointer transition-all shadow-md"
                                                title="Expand Season & Episode Breakdown"
                                            >
                                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </button>
                                        )}

                                        {/* Force Search Button */}
                                        <button
                                            type="button"
                                            disabled={liveStatus?.isPolling}
                                            onClick={() => handleForceSearchItem(item)}
                                            className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 border border-zinc-800 cursor-pointer transition-all shadow-md disabled:opacity-50"
                                            title="Force Automatic Indexer Search"
                                        >
                                            <RefreshCw size={20} className={liveStatus?.isPolling ? 'animate-spin' : ''} />
                                        </button>

                                        {/* Interactive Search Modal Button */}
                                        <button
                                            type="button"
                                            onClick={() => handleOpenInteractiveSearch({
                                                type: item.type,
                                                id: item.id,
                                                instanceId: item.instanceId,
                                                title: item.title
                                            })}
                                            className="p-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 border border-zinc-800 cursor-pointer transition-all shadow-md"
                                            title="Interactive Release Search & 1-Click Grab"
                                        >
                                            <Search size={20} />
                                        </button>

                                        {/* Delete Button */}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTarget({
                                                type: item.type,
                                                id: item.id,
                                                instanceId: item.instanceId,
                                                title: item.title,
                                                fileId: item.movieFile?.id
                                            })}
                                            className="p-3 rounded-2xl bg-zinc-950 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-900 cursor-pointer transition-all shadow-md"
                                            title="Delete Media File"
                                        >
                                            <Trash2 size={20} />
                                        </button>

                                        {/* Search Inclusion Checkbox */}
                                        <button
                                            type="button"
                                            onClick={() => setSearchToggles(p => ({ ...p, [item.idStr]: !isSearchActive }))}
                                            className={`w-9 h-9 rounded-2xl border-2 flex items-center justify-center cursor-pointer transition-all ${
                                                isSearchActive
                                                    ? 'bg-emerald-500 border-emerald-500 text-black shadow-md'
                                                    : 'border-zinc-700 bg-zinc-950 text-zinc-600'
                                            }`}
                                            title={isSearchActive ? 'Search Active in Batches' : 'Search Excluded'}
                                        >
                                            {isSearchActive && <Check size={18} className="stroke-[3]" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Episode Breakdown for TV Series */}
                                {isExpanded && (
                                    <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                                        <span className="text-xs font-black uppercase tracking-wider text-zinc-500 block">
                                            Episodes Breakdown
                                        </span>
                                        {isEpsLoading ? (
                                            <div className="py-6 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                                                <RefreshCw size={14} className="animate-spin text-amber-400" />
                                                Loading episodes...
                                            </div>
                                        ) : cachedEps.length === 0 ? (
                                            <div className="py-4 text-center text-xs text-zinc-600">
                                                No episodes found.
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 no-scrollbar">
                                                {cachedEps.map(ep => {
                                                    const epIdStr = `episode-${item.instanceId}-${ep.id}`;
                                                    const epStatus = searchingItems[epIdStr];
                                                    return (
                                                        <div
                                                            key={ep.id}
                                                            className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-850 flex items-center justify-between gap-3"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <span className="text-xs font-mono font-bold text-zinc-400 shrink-0">
                                                                    S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                                                                </span>
                                                                <span className="text-xs font-bold text-zinc-200 truncate">
                                                                    {ep.title}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                                    ep.hasFile
                                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                                        : 'bg-amber-500/10 text-amber-400'
                                                                }`}>
                                                                    {ep.hasFile ? 'Has File' : 'Missing'}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {epStatus && (
                                                                    <span className="text-xs font-mono text-amber-400">
                                                                        {epStatus.status}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleForceSearchItem({
                                                                        instanceId: item.instanceId,
                                                                        type: 'episode',
                                                                        id: ep.id,
                                                                        idStr: epIdStr
                                                                    })}
                                                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-zinc-800 cursor-pointer"
                                                                    title="Force Search Episode"
                                                                >
                                                                    <RefreshCw size={14} className={epStatus?.isPolling ? 'animate-spin' : ''} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenInteractiveSearch({
                                                                        type: 'episode',
                                                                        id: item.id,
                                                                        instanceId: item.instanceId,
                                                                        title: `${item.title} S${ep.seasonNumber}E${ep.episodeNumber}`,
                                                                        episodeId: ep.id
                                                                    })}
                                                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-indigo-400 border border-zinc-800 cursor-pointer"
                                                                    title="Interactive Search Episode"
                                                                >
                                                                    <Search size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════
                INTERACTIVE SEARCH MODAL
               ══════════════════════════════════════════════════════════ */}
            {interactiveSearchItem && (
                <InteractiveSearchModal
                    isOpen={!!interactiveSearchItem}
                    onClose={() => setInteractiveSearchItem(null)}
                    item={interactiveSearchItem}
                    releases={interactiveReleases}
                    isLoading={loadingReleases}
                    triggeringReleaseGuid={triggeringReleaseGuid}
                    onTriggerDownload={handleTriggerInteractiveDownload}
                />
            )}

            {/* ══════════════════════════════════════════════════════════
                DELETE MEDIA CONFIRMATION MODAL
               ══════════════════════════════════════════════════════════ */}
            <DeleteMediaModal
                isOpen={!!confirmDeleteTarget}
                item={confirmDeleteTarget}
                onClose={() => setConfirmDeleteTarget(null)}
                onConfirm={executeDelete}
                loading={isDeletingFile}
            />

            {/* ══════════════════════════════════════════════════════════
                MEDIA DETAILS PANEL (Matches Media / Theater)
               ══════════════════════════════════════════════════════════ */}
            {selectedMediaItem && (
                <MediaDetailsPanel
                    item={{
                        ...selectedMediaItem,
                        mediaType: selectedMediaItem.type === 'movie' ? 'movie' : 'tv',
                        posterPath: selectedMediaItem.images?.find((img: any) => img.coverType === 'poster')?.url || selectedMediaItem.poster,
                        poster_path: selectedMediaItem.images?.find((img: any) => img.coverType === 'poster')?.url || selectedMediaItem.poster,
                        backdropPath: selectedMediaItem.images?.find((img: any) => img.coverType === 'fanart')?.url,
                        backdrop_path: selectedMediaItem.images?.find((img: any) => img.coverType === 'fanart')?.url
                    }}
                    libStatus={{
                        exists: true,
                        hasFile: Boolean(selectedMediaItem.hasFile || selectedMediaItem.isDownloaded),
                        isDownloading: Boolean(selectedMediaItem.isDownloading),
                        sizeOnDisk: selectedMediaItem.sizeOnDisk || (selectedMediaItem.movieFile?.size) || (selectedMediaItem.statistics?.sizeOnDisk) || 0,
                        percentage: selectedMediaItem.isDownloaded ? 100 : (selectedMediaItem.statistics?.percentOfEpisodes ? Math.round(Number(selectedMediaItem.statistics.percentOfEpisodes)) : 0),
                        qualityProfileId: selectedMediaItem.qualityProfileId,
                        instances: [{
                            id: selectedMediaItem.instanceId,
                            name: selectedMediaItem.instanceName || selectedMediaItem.instanceId,
                            internalId: selectedMediaItem.id,
                            colorHex: selectedMediaItem.colorHex || selectedMediaItem.instanceColor
                        }]
                    }}
                    onClose={() => setSelectedMediaItem(null)}
                    onInteractiveSearch={(ep) => {
                        setSelectedMediaItem(null);
                        handleOpenInteractiveSearch({
                            type: selectedMediaItem.type,
                            id: selectedMediaItem.id,
                            instanceId: selectedMediaItem.instanceId,
                            title: selectedMediaItem.title,
                            episodeId: ep?.id
                        });
                    }}
                    onQuickSearch={() => {
                        handleForceSearchItem(selectedMediaItem);
                    }}
                    onDelete={() => {
                        setSelectedMediaItem(null);
                        setConfirmDeleteTarget({
                            type: selectedMediaItem.type,
                            id: selectedMediaItem.id,
                            instanceId: selectedMediaItem.instanceId,
                            title: selectedMediaItem.title,
                            fileId: selectedMediaItem.movieFile?.id
                        });
                    }}
                />
            )}
        </div>
    );
}

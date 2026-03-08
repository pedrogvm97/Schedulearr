'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor,
    useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove, SortableContext, sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableItem } from '@/components/SortableItem';
import { Search, Trash2, RefreshCw } from 'lucide-react';

// ── Types ─────────────────────────────────────────────
interface SchedulerConfig {
    enabled: boolean; interval: number; batchSize: number;
    batchBehavior: string; maxAttempts: number;
}
interface Movie {
    id: number; idStr?: string; type: 'movie'; title: string; year: number;
    instanceId: string; instanceName?: string; instanceColor?: string; colorHex?: string;
    instanceUrl?: string; qualityProfileId: number; sizeOnDisk: number; hasFile: boolean;
    added: string; isDownloading?: boolean; genres?: string[]; monitored: boolean;
    status: string; isPinned?: boolean; physicalRelease?: string; digitalRelease?: string;
    inCinemas?: string; airDateUtc?: string;
    movieFile?: { id: number; quality?: { quality?: { resolution: number; name: string } }; size?: number };
    isDownloaded?: boolean; targetQualityProfile?: string;
    currentQualityScale?: number; sortDate?: number;
}
interface Episode {
    id: number; idStr?: string; type: 'episode'; title: string; instanceId: string;
    seriesId: number; seasonNumber: number; episodeNumber: number; hasFile: boolean;
    monitored: boolean; episodeFileId?: number; airDateUtc?: string;
    episodeFile?: { quality?: { quality?: { name: string } }; size?: number };
}
interface SeriesItem {
    id: number; idStr: string; type: 'series' | 'episode'; title: string;
    instanceId: string; instanceName?: string; instanceColor?: string; colorHex?: string;
    instanceUrl?: string; qualityProfileId: number; added: string; episodes?: Episode[];
    queuedEpisodeIds?: number[]; isPinned?: boolean; genres?: string[]; monitored: boolean;
    status: string; statistics?: { percentOfEpisodes: number; episodeCount: number; episodeFileCount: number };
    physicalRelease?: string; digitalRelease?: string; inCinemas?: string; airDateUtc?: string;
    isDownloaded?: boolean; targetQualityProfile?: string; currentQualityScale?: number;
    sortDate?: number; isDownloading?: boolean;
    stats?: { percentOfEpisodes: number; episodeCount: number; episodeFileCount: number; sizeOnDisk?: number };
}
interface Release {
    guid: string; title: string; size: number; indexerId: number; indexer: string;
    seeders: number; leechers: number; downloadUrl: string; rejections?: string[];
    customFormatScore?: number; quality?: { quality?: { name: string } };
    rejected?: boolean; protocol?: string;
}

// ── Countdown ─────────────────────────────────────────
const CountdownTimer = ({ nextRun, enabled }: { nextRun: number | null; enabled: boolean }) => {
    const [countdown, setCountdown] = useState('');
    useEffect(() => {
        if (!nextRun || !enabled) { setCountdown(''); return; }
        const tick = () => {
            const diff = nextRun - Date.now();
            if (diff <= 0) { setCountdown('Search imminent...'); return; }
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setCountdown(`${m}m ${s.toString().padStart(2, '0')}s`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [nextRun, enabled]);
    return <span className={`text-sm font-bold tracking-wider ${enabled && nextRun ? 'text-amber-500' : 'text-zinc-600'}`}>{enabled ? (countdown || 'Calculating...') : 'Paused'}</span>;
};

const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// ── Main Panel ────────────────────────────────────────
export function SchedulerQueuePanel() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [episodes, setEpisodes] = useState<SeriesItem[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Record<number, string>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({ enabled: true, interval: 30, batchSize: 10, batchBehavior: 'repeat', maxAttempts: 3 });
    const [nextRun, setNextRun] = useState<number | null>(null);
    const [searchToggles, setSearchToggles] = useState<Record<string, boolean>>({});
    const [selectedGenres, setSelectedGenres] = useState<string[]>(['All']);
    const [instanceFilters, setInstanceFilters] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [qualityFilter, setQualityFilter] = useState('missing');
    const [profile, setProfile] = useState('recently_added');
    const [orderedIds, setOrderedIds] = useState<string[]>([]);
    const [showActiveOnly, setShowActiveOnly] = useState(false);
    const [hideUnmonitored, setHideUnmonitored] = useState(false);
    const [showDownloading, setShowDownloading] = useState(true);
    const [showNextBatchOnly, setShowNextBatchOnly] = useState(false);
    const [searchingItems, setSearchingItems] = useState<Record<string, { status: string; isPolling: boolean }>>({});
    const [genreLogic, setGenreLogic] = useState<'OR' | 'AND' | 'EXCLUDE'>('OR');
    const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
    const [seriesEpisodes, setSeriesEpisodes] = useState<Record<string, Episode[]>>({});
    const [loadingEpisodes, setLoadingEpisodes] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isRunningBatch, setIsRunningBatch] = useState(false);
    const [interactiveSearchItem, setInteractiveSearchItem] = useState<{ type: string; id: number; instanceId: string; title: string } | null>(null);
    const [interactiveReleases, setInteractiveReleases] = useState<Release[]>([]);
    const [loadingReleases, setLoadingReleases] = useState(false);
    const [triggeringReleaseGuid, setTriggeringReleaseGuid] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const updateSchedulerConfig = async (updates: Partial<SchedulerConfig>) => {
        const newConfig = { ...schedulerConfig, ...updates };
        setSchedulerConfig(newConfig);
        try { await axios.post('/api/scheduler/config', newConfig); } catch { }
    };

    const fetchData = async () => {
        setLoading(true); setError(null);
        try {
            const [movieRes, epRes, profileRes, configRes, settingsRes] = await Promise.all([
                fetch('/api/radarr/all'), fetch('/api/sonarr/all'), fetch('/api/quality'),
                fetch('/api/scheduler/status'), fetch('/api/settings')
            ]);
            if (movieRes.ok) setMovies(await movieRes.json());
            if (epRes.ok) setEpisodes(await epRes.json());
            if (profileRes.ok) { const d = await profileRes.json(); setProfiles(d.profiles); }
            if (configRes.ok) {
                const d = await configRes.json();
                setSchedulerConfig({ enabled: d.enabled, interval: d.interval, batchSize: d.batchSize, batchBehavior: d.batchBehavior || 'repeat', maxAttempts: d.maxAttempts || 3 });
                if (d.nextRun) setNextRun(d.nextRun);
            }
            if (settingsRes.ok) {
                const s = await settingsRes.json();
                if (s.priority_profile) setProfile(s.priority_profile);
                if (s.ui_search_toggles) { try { setSearchToggles(JSON.parse(s.ui_search_toggles)); } catch { } }
                if (s.ui_instance_filters) { try { setInstanceFilters(JSON.parse(s.ui_instance_filters)); } catch { } }
                if (s.ui_selected_genres) { try { setSelectedGenres(JSON.parse(s.ui_selected_genres)); } catch { } }
                if (s.ui_genre_logic) setGenreLogic(s.ui_genre_logic);
                if (s.ui_active_only !== undefined) setShowActiveOnly(s.ui_active_only === 'true');
                if (s.ui_hide_unmonitored !== undefined) setHideUnmonitored(s.ui_hide_unmonitored === 'true');
            }
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        setLoading(false);
    };

    useEffect(() => { fetchData(); const id = setInterval(fetchData, 5 * 60 * 1000); return () => clearInterval(id); }, []);

    useEffect(() => {
        if (!nextRun || !schedulerConfig.enabled) return;
        const t = nextRun - Date.now();
        if (t > 0 && t < 86400000) { const id = setTimeout(fetchData, t + 5000); return () => clearTimeout(id); }
    }, [nextRun, schedulerConfig.enabled]);

    useEffect(() => {
        const saved = localStorage.getItem('schedulerUIState');
        if (saved) {
            try {
                const p = JSON.parse(saved);
                if (p.selectedGenres) setSelectedGenres(p.selectedGenres);
                if (p.instanceFilters) setInstanceFilters(p.instanceFilters);
                if (p.qualityFilter) setQualityFilter(p.qualityFilter);
                if (p.showActiveOnly !== undefined) setShowActiveOnly(p.showActiveOnly);
                if (p.hideUnmonitored !== undefined) setHideUnmonitored(p.hideUnmonitored);
                if (p.showNextBatchOnly !== undefined) setShowNextBatchOnly(p.showNextBatchOnly);
                if (p.genreLogic) setGenreLogic(p.genreLogic);
            } catch { }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('schedulerUIState', JSON.stringify({ selectedGenres, instanceFilters, qualityFilter, showActiveOnly, hideUnmonitored, showNextBatchOnly, genreLogic }));
    }, [selectedGenres, instanceFilters, qualityFilter, showActiveOnly, hideUnmonitored, showNextBatchOnly, genreLogic]);

    const handleSaveConfiguration = async () => {
        setIsSaving(true);
        try {
            const pairs = [
                ['ui_selected_genres', JSON.stringify(selectedGenres)], ['ui_genre_logic', genreLogic],
                ['ui_instance_filters', JSON.stringify(instanceFilters)],
                ['ui_active_only', showActiveOnly ? 'true' : 'false'],
                ['ui_hide_unmonitored', hideUnmonitored ? 'true' : 'false'],
                ['ui_search_toggles', JSON.stringify(searchToggles)]
            ];
            await Promise.all(pairs.map(([key, value]) => fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })));
            setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
        } catch { }
        setIsSaving(false);
    };

    const handleGenreToggle = (g: string) => {
        if (g === 'All') { setSelectedGenres(['All']); return; }
        setSelectedGenres(prev => { const next = prev.includes(g) ? prev.filter(x => x !== g && x !== 'All') : [...prev.filter(x => x !== 'All'), g]; return next.length === 0 ? ['All'] : next; });
    };

    const handleSelectAll = (items: any[]) => { const u: Record<string, boolean> = {}; items.forEach(i => { u[i.idStr || `${i.instanceId}-${i.id}`] = true; }); setSearchToggles(p => ({ ...p, ...u })); };
    const handleDeselectAll = (items: any[]) => { const u: Record<string, boolean> = {}; items.forEach(i => { u[i.idStr || `${i.instanceId}-${i.id}`] = false; }); setSearchToggles(p => ({ ...p, ...u })); };

    const fetchSeriesEpisodes = async (instanceId: string, seriesId: number) => {
        const key = `${instanceId}-${seriesId}`;
        if (seriesEpisodes[key]) return;
        setLoadingEpisodes(p => ({ ...p, [key]: true }));
        try {
            const r = await fetch(`/api/sonarr/episodes?instanceId=${instanceId}&seriesId=${seriesId}`);
            if (r.ok) {
                const data = await r.json();
                setSeriesEpisodes(p => ({ ...p, [key]: data }));
            }
        } catch { }
        setLoadingEpisodes(p => ({ ...p, [key]: false }));
    };

    const toggleExpandSeries = async (item: SeriesItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const key = `${item.instanceId}-${item.id}`;
        if (expandedSeriesId === key) { setExpandedSeriesId(null); } else { setExpandedSeriesId(key); fetchSeriesEpisodes(item.instanceId, item.id); }
    };

    const toggleSearch = (id: string) => setSearchToggles(p => ({ ...p, [id]: !p[id] }));
    const toggleInstance = (id: string) => setInstanceFilters(p => ({ ...p, [id]: p[id] === false ? true : false }));

    const handleSaveProfile = async (val: string) => {
        setProfile(val);
        try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'priority_profile', value: val }) }); } catch { }
    };

    const handleDeleteFile = async (type: 'movie' | 'episode', id: number, instanceId: string, fileId: number) => {
        if (!confirm(`Delete this ${type} file from disk?`)) return;
        const endpoint = type === 'movie' ? `/api/radarr/file?movieFileId=${fileId}&instanceId=${instanceId}` : `/api/sonarr/file?episodeFileId=${fileId}&instanceId=${instanceId}`;
        try {
            const r = await fetch(endpoint, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) { toast.success('File deleted'); fetchData(); } else toast.error(d.error || 'Failed to delete');
        } catch { toast.error('Error deleting file'); }
    };

    const handleInteractiveSearch = async (type: string, id: number, instanceId: string, title: string) => {
        setInteractiveSearchItem({ type, id, instanceId, title }); setLoadingReleases(true); setInteractiveReleases([]);
        try {
            const endpoint = type === 'movie' ? `/api/radarr/releases?movieId=${id}&instanceId=${instanceId}` : `/api/sonarr/releases?episodeId=${id}&instanceId=${instanceId}`;
            const r = await fetch(endpoint);
            const d = await r.json();
            if (Array.isArray(d)) setInteractiveReleases(d);
        } catch { }
        setLoadingReleases(false);
    };

    const triggerInteractiveDownload = async (guid: string, indexerId: number) => {
        if (!interactiveSearchItem) return;
        setTriggeringReleaseGuid(guid);
        try {
            const endpoint = interactiveSearchItem.type === 'movie' ? '/api/radarr/releases' : '/api/sonarr/releases';
            const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guid, indexerId, instanceId: interactiveSearchItem.instanceId }) });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Failed'); }
            toast.success('Release sent to download client!');
            setInteractiveSearchItem(null); fetchData();
        } catch (e: any) { toast.error(e.message || 'Failed to grab release'); }
        setTriggeringReleaseGuid(null);
    };

    const handleForceSearch = async (item: any) => {
        const idStr = item.idStr || `${item.instanceId}-${item.id}`;
        setSearchingItems(p => ({ ...p, [idStr]: { status: 'Triggering...', isPolling: true } }));
        try {
            const r = await fetch('/api/search/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceId: item.instanceId, type: item.type, mediaId: item.id }) });
            if (!r.ok) throw new Error('Trigger failed');
            setSearchingItems(p => ({ ...p, [idStr]: { status: 'Searching indexers...', isPolling: true } }));
            let tries = 0;
            const poll = setInterval(async () => {
                tries++;
                try {
                    const s = await fetch(`/api/search/status?instanceId=${item.instanceId}&type=${item.type}&mediaId=${item.id}`);
                    if (s.ok) { const d = await s.json(); if (d.status !== 'Not in queue') { setSearchingItems(p => ({ ...p, [idStr]: { status: `Grabbed (${d.status})`, isPolling: false } })); clearInterval(poll); return; } }
                } catch { }
                if (tries >= 10) { setSearchingItems(p => ({ ...p, [idStr]: { status: 'Finished (Not found)', isPolling: false } })); clearInterval(poll); }
            }, 3000);
        } catch { setSearchingItems(p => ({ ...p, [idStr]: { status: 'Error', isPolling: false } })); }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setOrderedIds(items => { const oi = items.indexOf(active.id as string), ni = items.indexOf(over.id as string); return arrayMove(items, oi, ni); });
        }
    };

    // ── Build combined list ────────────────────────────
    let combined = ([
        ...(Array.isArray(movies) ? movies : []).map(m => ({
            ...m, type: 'movie' as const,
            sortDate: new Date(m.added).getTime(),
            idStr: `movie-${m.instanceId}-${m.id}`,
            isDownloaded: m.hasFile,
            targetQualityProfile: (m.instanceUrl && m.qualityProfileId && profiles?.[m.instanceUrl.replace(/\/$/, '')]) ? profiles[m.instanceUrl.replace(/\/$/, '')][m.qualityProfileId] : 'Unknown',
            currentQualityScale: m.movieFile?.quality?.quality?.resolution || 0,
            isDownloading: m.isDownloading || false
        })),
        ...(Array.isArray(episodes) ? episodes : []).map(e => ({
            ...e, type: 'series' as const,
            sortDate: new Date(e.added).getTime(),
            idStr: `series-${e.instanceId}-${e.id}`,
            isDownloaded: e.statistics?.percentOfEpisodes === 100,
            stats: e.statistics,
            targetQualityProfile: (e.instanceUrl && e.qualityProfileId && profiles?.[e.instanceUrl.replace(/\/$/, '')]) ? profiles[e.instanceUrl.replace(/\/$/, '')][e.qualityProfileId] : 'Unknown',
            isDownloading: (e.queuedEpisodeIds?.length || 0) > 0
        }))
    ] as any[]).sort((a, b) => { const na = a.instanceName || '', nb = b.instanceName || ''; if (na !== nb) return na.localeCompare(nb); if (a.isPinned && !b.isPinned) return -1; if (!a.isPinned && b.isPinned) return 1; return (b.sortDate || 0) - (a.sortDate || 0); });

    const allGenres = new Set<string>();
    const allInstances = new Map<string, any>();
    combined.forEach(item => {
        (item.genres || []).forEach((g: string) => allGenres.add(g));
        if (item.instanceName && item.instanceId) allInstances.set(item.instanceId, { id: item.instanceId, name: item.instanceName, colorHex: item.colorHex });
    });
    const uniqueGenres = ['All', ...Array.from(allGenres).sort()];
    const uniqueInstances = Array.from(allInstances.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (qualityFilter === 'missing') combined = combined.filter(c => !c.isDownloaded);
    else if (qualityFilter === 'upgradeable') combined = combined.filter(c => c.isDownloaded && c.monitored);
    if (!showDownloading) combined = combined.filter(c => !c.isDownloading);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); combined = combined.filter(c => c.title.toLowerCase().includes(q)); }
    if (!selectedGenres.includes('All')) {
        combined = combined.filter(item => {
            const g = item.genres || [];
            if (genreLogic === 'OR') return g.some((x: string) => selectedGenres.includes(x));
            if (genreLogic === 'AND') return selectedGenres.every((x: string) => g.includes(x));
            if (genreLogic === 'EXCLUDE') return !g.some((x: string) => selectedGenres.includes(x));
            return true;
        });
    }
    combined = combined.filter(item => instanceFilters[item.instanceId] !== false);

    const targetItemsForBulkActions = [...combined];
    let displayItems = combined;
    if (showActiveOnly) displayItems = displayItems.filter(item => item.idStr && searchToggles[item.idStr] !== false);
    if (hideUnmonitored) displayItems = displayItems.filter(item => item.monitored === true);

    if (profile === 'custom') {
        displayItems.sort((a, b) => { const ia = orderedIds.indexOf(a.idStr), ib = orderedIds.indexOf(b.idStr); if (ia !== -1 && ib !== -1) return ia - ib; if (ia !== -1) return -1; if (ib !== -1) return 1; return 0; });
    } else if (profile === 'recently_released') {
        displayItems.sort((a, b) => { const da = a.type === 'movie' ? (a.physicalRelease || a.digitalRelease || '1970') : (a.airDateUtc || '1970'); const db = b.type === 'movie' ? (b.physicalRelease || b.digitalRelease || '1970') : (b.airDateUtc || '1970'); return new Date(db).getTime() - new Date(da).getTime(); });
    } else if (profile === 'alphabetical') {
        displayItems.sort((a, b) => a.title.localeCompare(b.title));
    } else if (profile === 'nearly_complete') {
        displayItems.sort((a, b) => { const pa = a.type === 'series' ? (a.stats?.percentOfEpisodes || 0) : 0; const pb = b.type === 'series' ? (b.stats?.percentOfEpisodes || 0) : 0; return pa !== pb ? pb - pa : (b.sortDate ?? 0) - (a.sortDate ?? 0); });
    } else if (profile === 'random') { displayItems.sort(() => Math.random() - 0.5); }

    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        displayItems.sort((a, b) => {
            const at = a.title.toLowerCase(), bt = b.title.toLowerCase();
            if (at === q && bt !== q) return -1; if (bt === q && at !== q) return 1;
            if (at.startsWith(q) && !bt.startsWith(q)) return -1; if (bt.startsWith(q) && !at.startsWith(q)) return 1;
            return 0;
        });
    }

    const totalItems = displayItems.length;

    if (showNextBatchOnly) {
        const bs = schedulerConfig.batchSize || 10;
        const active = displayItems.filter(c => c.idStr && searchToggles[c.idStr] !== false);
        const mv = active.filter(c => c.type === 'movie'), sr = active.filter(c => c.type === 'series');
        const mm = Math.floor(bs / 2), ms = Math.ceil(bs / 2);
        const mn = Math.min(mv.length, mm), sn = Math.min(sr.length, ms);
        const validIds = new Set([...mv.slice(0, mn + (ms - sn)), ...sr.slice(0, sn + (mm - mn))].map(x => x.idStr));
        displayItems = displayItems.filter(c => validIds.has(c.idStr));
    }

    useEffect(() => {
        if (displayItems.length > 0 && orderedIds.length === 0) setOrderedIds(displayItems.map(c => c.idStr).filter(Boolean));
    }, [displayItems.length, orderedIds.length]);

    // ── Render ─────────────────────────────────────────
    if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" /></div>;
    if (error) return <div className="bg-rose-900 border border-rose-700 text-white p-4 rounded mb-4"><p>Error: {error}</p><button onClick={fetchData} className="mt-2 px-3 py-1 text-sm bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded">Retry</button></div>;

    return (
        <div className="space-y-6">
            {/* Scheduler Config Bar */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                    <span className="text-sm font-semibold text-zinc-300">Scheduler:</span>
                    <button
                        onClick={() => { const nc = { ...schedulerConfig, enabled: !schedulerConfig.enabled }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }}
                        className={`px-4 py-2 text-sm font-bold rounded-lg border transition-all ${schedulerConfig.enabled ? 'bg-green-600 border-green-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                    >{schedulerConfig.enabled ? 'ON' : 'OFF'}</button>

                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                        <label className="text-sm text-zinc-400">Interval (m):</label>
                        <input type="number" min={1} max={10080} value={schedulerConfig.interval}
                            onChange={e => { const v = Math.max(1, Math.min(10080, Number(e.target.value))); const nc = { ...schedulerConfig, interval: v }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }}
                            className="w-14 bg-transparent text-white text-sm font-bold outline-none text-center" />
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1">
                        <label className="text-sm text-zinc-400">Batch:</label>
                        <CustomSelect minimal options={[...Array(50)].map((_, i) => ({ id: i + 1, name: (i + 1).toString() }))} value={schedulerConfig.batchSize}
                            onChange={val => { const n = Number(String(val).match(/\d+/)?.[0] || 10); const nc = { ...schedulerConfig, batchSize: n }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }} />
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1">
                        <label className="text-sm text-zinc-400">Behavior:</label>
                        <CustomSelect minimal options={[{ id: 'repeat', name: 'Repeat' }, { id: 'rotate', name: 'Rotate' }]} value={schedulerConfig.batchBehavior}
                            onChange={val => { const nc = { ...schedulerConfig, batchBehavior: val }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }} />
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 ml-auto">
                        <span className="text-sm text-zinc-400">Next:</span>
                        <CountdownTimer nextRun={nextRun} enabled={schedulerConfig.enabled} />
                        <button onClick={async () => { setIsRunningBatch(true); try { await fetch('/api/scheduler/run', { method: 'POST' }); await fetchData(); } catch { } setIsRunningBatch(false); }}
                            disabled={isRunningBatch || !schedulerConfig.enabled}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md ml-2 transition-all ${isRunningBatch ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : !schedulerConfig.enabled ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed' : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30'}`}>
                            {isRunningBatch ? <div className="w-3 h-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>}
                            {isRunningBatch ? 'Running...' : 'Run Now'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Filter Controls */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                        <div className="w-full lg:flex-1 relative">
                            <input type="text" placeholder="Search media..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950/50 border border-zinc-800 text-white text-sm rounded-xl p-3 outline-none placeholder-zinc-600 pr-10" />
                            <div className="absolute right-3 top-3 text-zinc-600"><Search size={18} /></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 bg-zinc-950/50 border border-zinc-800 p-1.5 rounded-xl">
                            <div className="flex items-center gap-2 px-2 border-r border-zinc-800/50">
                                <span className="text-xs font-bold text-zinc-500 uppercase">Sort:</span>
                                <CustomSelect minimal options={[{ id: 'recently_added', name: 'Added' }, { id: 'recently_released', name: 'Released' }, { id: 'alphabetical', name: 'A-Z' }, { id: 'nearly_complete', name: 'Completion' }, { id: 'random', name: 'Random' }, { id: 'custom', name: 'Custom' }]} value={profile} onChange={handleSaveProfile} />
                            </div>
                            <div className="flex items-center gap-2 px-2 border-r border-zinc-800/50">
                                <span className="text-xs font-bold text-zinc-500 uppercase">Library:</span>
                                <CustomSelect minimal options={[{ id: 'all', name: 'All' }, { id: 'missing', name: 'Missing' }, { id: 'upgradeable', name: 'Upgradeable' }]} value={qualityFilter} onChange={setQualityFilter} />
                            </div>
                            <button onClick={handleSaveConfiguration} disabled={isSaving}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${saveSuccess ? 'bg-emerald-600/20 text-emerald-400' : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30'}`}>
                                {isSaving ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Config'}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-start gap-4 pt-4 border-t border-zinc-800/60">
                        <div className="flex flex-col gap-2 shrink-0">
                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Logic</span>
                            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1">
                                {(['OR', 'AND', 'EXCLUDE'] as const).map(l => (
                                    <button key={l} onClick={() => setGenreLogic(l)} className={`px-3 py-1 text-[10px] font-bold rounded ${genreLogic === l ? (l === 'EXCLUDE' ? 'bg-zinc-800 text-rose-400' : 'bg-zinc-800 text-white') : 'text-zinc-600 hover:text-zinc-400'}`}>{l === 'EXCLUDE' ? 'X' : l}</button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 flex flex-wrap gap-2 items-center">
                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mr-2">Genres:</span>
                            {uniqueGenres.map(g => (
                                <button key={g} onClick={() => handleGenreToggle(g)}
                                    className={`px-3 py-1 text-[10px] font-bold rounded-full border transition-all ${selectedGenres.includes(g) ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-zinc-950/30 text-zinc-500 border-zinc-900 hover:border-zinc-700'}`}>
                                    {g}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Media Header */}
            <div className="flex flex-col border-b border-zinc-800 pb-4 gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-white">Queue</h2>
                    {totalItems > 0 && <div className="flex items-center bg-zinc-900/40 border border-zinc-800/60 px-3 py-1 rounded-lg"><span className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest">{displayItems.length} Shown</span></div>}
                    <div className="flex items-center gap-2 ml-2">
                        {uniqueInstances.map(inst => {
                            const active = instanceFilters[inst.id] !== false;
                            return (
                                <button key={inst.id} onClick={() => toggleInstance(inst.id)}
                                    style={{ borderColor: active ? inst.colorHex : 'transparent', color: active ? inst.colorHex : '#71717a', backgroundColor: active ? `${inst.colorHex}15` : 'transparent' }}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all flex items-center gap-1.5 ${!active ? 'bg-zinc-900/50 border-zinc-800' : ''}`}>
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: inst.colorHex }} />{inst.name}
                                </button>
                            );
                        })}
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-4 bg-zinc-900/40 border border-zinc-800/60 px-4 py-2.5 rounded-xl">
                        <label className="flex items-center cursor-pointer gap-2">
                            <div className="relative"><input type="checkbox" className="sr-only" checked={showNextBatchOnly} onChange={() => setShowNextBatchOnly(v => !v)} /><div className={`block w-10 h-5 rounded-full transition-colors ${showNextBatchOnly ? 'bg-amber-500' : 'bg-zinc-700'}`} /><div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${showNextBatchOnly ? 'translate-x-5' : ''}`} /></div>
                            <span className="text-xs font-bold text-amber-500">Preview Batch</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleSelectAll(targetItemsForBulkActions)} className="px-3 py-1 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700">Activate all</button>
                            <button onClick={() => handleDeselectAll(targetItemsForBulkActions)} className="px-3 py-1 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700">Deactivate all</button>
                        </div>
                        {[['showDownloading', showDownloading, () => setShowDownloading(v => !v), 'blue', 'Downloading'], ['showActiveOnly', showActiveOnly, () => setShowActiveOnly(v => !v), 'purple', 'Active Only'], ['hideUnmonitored', hideUnmonitored, () => setHideUnmonitored(v => !v), 'emerald', 'Monitored']].map(([key, val, fn, color, label]: any) => (
                            <label key={key} className="flex items-center cursor-pointer gap-2">
                                <div className="relative"><input type="checkbox" className="sr-only" checked={val} onChange={fn} /><div className={`block w-8 h-4 rounded-full transition-colors ${val ? `bg-${color}-500` : 'bg-zinc-700'}`} /><div className={`absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${val ? 'translate-x-4' : ''}`} /></div>
                                <span className="text-xs text-zinc-400">{label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Item List */}
            {displayItems.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                    <h3 className="text-xl font-semibold text-white">All caught up!</h3>
                    <p className="text-zinc-500 mt-2">No media matching this filter.</p>
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={displayItems.map(c => c.idStr).filter(Boolean)} strategy={verticalListSortingStrategy}>
                        <div className="grid grid-cols-1 gap-3">
                            {displayItems.map(item => {
                                const itemKey = item.idStr ?? String(item.id);
                                const isToggled = searchToggles[itemKey] !== false;
                                const isExpanded = item.type === 'series' && expandedSeriesId === `${item.instanceId}-${item.id}`;
                                return (
                                    <SortableItem key={item.idStr ?? item.id} id={item.idStr ?? String(item.id)} isDraggable={profile === 'custom'}>
                                        <div className="flex-1 flex flex-col gap-1 w-full">
                                            <div onClick={e => item.type === 'series' && toggleExpandSeries(item as SeriesItem, e as any)}
                                                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isToggled ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-900 opacity-60'} ${item.type === 'series' ? 'cursor-pointer hover:bg-zinc-800' : ''}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-2 h-12 rounded-full ${item.instanceColor || (item.type === 'movie' ? 'bg-yellow-500' : 'bg-cyan-500')}`} />
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${item.type === 'movie' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-cyan-500/20 text-cyan-500'}`}>{item.type}</span>
                                                            {item.isDownloading && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">Downloading</span>}
                                                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm border" style={{ backgroundColor: `${item.colorHex}1a`, color: item.colorHex, borderColor: `${item.colorHex}33` }}>{item.instanceName}</span>
                                                        </div>
                                                        <h3 className="text-lg font-medium text-white flex items-center gap-2">{item.title}
                                                            {item.type === 'series' && <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>}
                                                        </h3>
                                                        <div className="text-sm text-zinc-400">
                                                            {item.type === 'movie' ? (item.isDownloaded ? 'Downloaded' : 'Missing') : (item.stats ? `${item.stats.episodeFileCount}/${item.stats.episodeCount} eps (${Math.round(item.stats.percentOfEpisodes)}%)` : 'Unknown')}
                                                            <span className="mx-2 text-zinc-600">•</span>
                                                            Added {formatDistanceToNow(item.sortDate ?? 0, { addSuffix: true })}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                                    <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); handleInteractiveSearch(item.type === 'series' ? 'series' : 'movie', item.id, item.instanceId, item.title); }}
                                                        className="text-xs bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 px-3 py-1.5 rounded-lg border border-indigo-500/30 flex items-center gap-1.5">
                                                        <Search size={12} /> Interactive
                                                    </button>
                                                    {item.type === 'movie' && item.hasFile && item.movieFile && (
                                                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); handleDeleteFile('movie', item.id, item.instanceId, item.movieFile.id); }}
                                                            className="text-xs bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 px-2 py-1.5 rounded-lg border border-rose-500/30"><Trash2 size={12} /></button>
                                                    )}
                                                    {searchingItems[itemKey] ? (
                                                        <span className="text-xs px-3 py-1.5 rounded-lg border bg-zinc-800/80 text-zinc-300 border-zinc-700 flex items-center gap-2">
                                                            {searchingItems[itemKey].isPolling && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                                                            {searchingItems[itemKey].status}
                                                        </span>
                                                    ) : (
                                                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); handleForceSearch(item); }}
                                                            className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 px-3 py-1.5 rounded-lg border border-emerald-500/30 flex items-center gap-1.5">
                                                            <RefreshCw size={12} /> Force Search
                                                        </button>
                                                    )}
                                                    <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); toggleSearch(itemKey); }}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${isToggled ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isToggled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="ml-8 border-l-2 border-zinc-800 pl-4 py-2 space-y-2">
                                                    {loadingEpisodes[`${item.instanceId}-${item.id}`] ? (
                                                        <div className="text-sm text-zinc-500 flex items-center gap-2 p-2"><div className="w-4 h-4 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin" /> Loading...</div>
                                                    ) : (seriesEpisodes[`${item.instanceId}-${item.id}`] || []).filter(ep => !hideUnmonitored || ep.monitored).map(ep => (
                                                        <div key={ep.id} className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}</span>
                                                                    <span className="text-sm font-medium text-zinc-200">{ep.title}</span>
                                                                    {ep.hasFile ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Downloaded</span>
                                                                        : ep.monitored ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Missing</span>
                                                                            : <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">Unmonitored</span>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {ep.hasFile && ep.episodeFileId && (
                                                                    <button onClick={e => { e.stopPropagation(); handleDeleteFile('episode', ep.id, item.instanceId, ep.episodeFileId!); }} className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"><Trash2 size={12} /></button>
                                                                )}
                                                                {!ep.hasFile && ep.monitored && new Date(ep.airDateUtc || '').getTime() < Date.now() && (
                                                                    <>
                                                                        <button onClick={e => { e.stopPropagation(); handleInteractiveSearch('episode', ep.id, item.instanceId, `${item.title} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`); }}
                                                                            className="px-2 py-1 text-[10px] font-semibold bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded border border-indigo-500/20">Interactive</button>
                                                                        <button onClick={e => { e.stopPropagation(); handleForceSearch({ idStr: `episode-${item.instanceId}-${ep.id}`, instanceId: item.instanceId, type: 'episode', id: ep.id }); }}
                                                                            className="px-2 py-1 text-[10px] font-semibold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded border border-emerald-500/20 flex items-center gap-1"><RefreshCw size={10} /> Force</button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </SortableItem>
                                );
                            })}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {/* Interactive Search Modal */}
            {interactiveSearchItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-white">Interactive Release Search</h2>
                                <p className="text-sm text-zinc-400">Results for: <span className="text-indigo-400 font-bold">{interactiveSearchItem.title}</span></p>
                            </div>
                            <button onClick={() => setInteractiveSearchItem(null)} className="text-zinc-500 hover:text-white p-2 bg-zinc-900 rounded-full hover:bg-zinc-800 border border-zinc-800">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5">
                            {loadingReleases ? (
                                <div className="flex flex-col items-center justify-center py-20"><div className="w-10 h-10 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mb-4" /><p className="text-zinc-400 animate-pulse">Querying indexers...</p></div>
                            ) : interactiveReleases.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
                                    <h3 className="text-lg font-bold text-zinc-300">No Releases Found</h3>
                                    <p className="text-sm text-zinc-500 mt-1">No releases matched for this item.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {interactiveReleases.map((release, idx) => (
                                        <div key={release.guid} className="bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 p-4 rounded-xl flex gap-4 items-center justify-between group">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">#{idx + 1}</span>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${(release.customFormatScore ?? 0) > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>Score: {release.customFormatScore ?? 0}</span>
                                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-400">{(release.quality as any)?.quality?.name || 'Unknown'}</span>
                                                    {release.rejected && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400">Rejected</span>}
                                                </div>
                                                <p className="text-sm text-zinc-200 break-words">{release.title}</p>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                                                    <span>{(release.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                                    <span>•</span><span>{release.indexer}</span>
                                                    <span>•</span><span className="uppercase text-[10px]">{release.protocol}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => triggerInteractiveDownload(release.guid, release.indexerId)} disabled={triggeringReleaseGuid !== null}
                                                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg border transition-all ${triggeringReleaseGuid === release.guid ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : triggeringReleaseGuid ? 'bg-zinc-800 text-zinc-600 border-zinc-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'}`}>
                                                {triggeringReleaseGuid === release.guid ? <><div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" /> Grabbing...</> : 'Download'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

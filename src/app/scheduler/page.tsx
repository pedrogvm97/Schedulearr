'use client';

import { useState, useEffect } from 'react';
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

export default function SchedulerQueue() {
    const [movies, setMovies] = useState<any[]>([]);
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Record<number, string>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [schedulerConfig, setSchedulerConfig] = useState<{ enabled: boolean, interval: number, batchSize: number }>({ enabled: true, interval: 5, batchSize: 10 });
    const [searchHistory, setSearchHistory] = useState<any[]>([]);
    const [searchToggles, setSearchToggles] = useState<Record<string, boolean>>({});
    const [selectedGenre, setSelectedGenre] = useState<string>('All');
    const [instanceFilters, setInstanceFilters] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [qualityFilter, setQualityFilter] = useState('missing'); // 'all', 'missing', 'upgradeable'
    const [profile, setProfile] = useState('recently_added');
    const [orderedIds, setOrderedIds] = useState<string[]>([]);
    const [showActiveOnly, setShowActiveOnly] = useState(false);
    const [searchingItems, setSearchingItems] = useState<Record<string, { status: string, isPolling: boolean }>>({});

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Fetch data function
    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [movieRes, epRes, profileRes, configRes, historyRes, settingsRes] = await Promise.all([
                fetch('/api/radarr/all'),
                fetch('/api/sonarr/all'),
                fetch('/api/quality'),
                fetch('/api/scheduler/config'),
                fetch('/api/search/history'),
                fetch('/api/settings')
            ]);
            if (movieRes.ok) setMovies(await movieRes.json());
            if (epRes.ok) setEpisodes(await epRes.json());
            if (profileRes.ok) {
                const profileData = await profileRes.json();
                setProfiles(profileData.profiles);
            }
            if (configRes.ok) setSchedulerConfig(await configRes.json());
            if (historyRes.ok) setSearchHistory(await historyRes.json());
            if (settingsRes.ok) {
                const settingsData = await settingsRes.json();
                if (settingsData.priority_profile) setProfile(settingsData.priority_profile);
            }
        } catch (e) {
            console.error("Failed to load data", e);
            setError(e instanceof Error ? e.message : String(e));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5 * 60 * 1000); // refresh every 5 minutes
        return () => clearInterval(interval);
    }, []);

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
        const isCurrentlyEnabled = instanceFilters[name] !== false;

        // Optimistic UI update
        setInstanceFilters(prev => ({
            ...prev,
            [name]: !isCurrentlyEnabled
        }));

        try {
            await fetch('/api/instances', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, enabled: !isCurrentlyEnabled })
            });
        } catch (e) {
            console.error('Failed to update instance toggle override in DB', e);
            // Revert on error
            setInstanceFilters(prev => ({
                ...prev,
                [name]: isCurrentlyEnabled
            }));
        }
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
        ...movies.map(m => ({
            ...m,
            type: 'movie',
            sortDate: new Date(m.added).getTime(),
            idStr: `movie-${m.id}`,
            isDownloaded: m.hasFile,
            targetQualityProfile: profiles[m.instanceUrl]?.[m.qualityProfileId] || 'Unknown',
            currentQualityScale: m.movieFile?.quality?.quality?.resolution || 0,
            instanceId: m.instanceId
        })),
        ...episodes.map(e => ({
            ...e,
            type: 'series',
            sortDate: new Date(e.added).getTime(),
            idStr: `series-${e.id}`,
            isDownloaded: e.statistics?.percentOfEpisodes === 100,
            stats: e.statistics,
            targetQualityProfile: profiles[e.instanceUrl]?.[e.qualityProfileId] || 'Unknown',
            instanceId: e.instanceId
        }))
    ].sort((a, b) => b.sortDate - a.sortDate);

    // Filter by Quality Status
    if (qualityFilter === 'missing') {
        combined = combined.filter(c => !c.isDownloaded);
    } else if (qualityFilter === 'upgradeable') {
        // Simple heuristic: if it has a file but the resolution is low compared to the profile name expectations (could be improved with explicit score mapping)
        // For MVP, "Upgradeable" just means it is downloaded but still Monitored by the Arr app
        combined = combined.filter(c => c.isDownloaded && c.monitored);
    } else if (qualityFilter === 'all') {
        // No filter needed
    }

    // Filter by Search Query
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        combined = combined.filter(c => c.title.toLowerCase().includes(query));
    }

    // Extract all unique genres
    const allGenres = new Set<string>();
    combined.forEach(item => {
        if (item.genres && Array.isArray(item.genres)) {
            item.genres.forEach((g: string) => allGenres.add(g));
        }
    });
    const uniqueGenres = ['All', ...Array.from(allGenres).sort()];

    // Filter by selected genre
    if (selectedGenre !== 'All') {
        combined = combined.filter(item =>
            item.genres && Array.isArray(item.genres) && item.genres.includes(selectedGenre)
        );
    }

    // Extract unique instances and apply instance filters
    const allInstances = new Map<string, string>(); // name -> id
    combined.forEach(item => {
        if (item.instanceName && item.instanceId) {
            allInstances.set(item.instanceName, item.instanceId);
        }
    });
    const uniqueInstances = Array.from(allInstances.entries()).map(([name, id]) => ({ name, id })).sort((a, b) => a.name.localeCompare(b.name));

    // Filter by selected instances
    combined = combined.filter(item => instanceFilters[item.instanceName] !== false);

    const totalItems = combined.length;

    // Filter by active status
    if (showActiveOnly) {
        combined = combined.filter(item => searchToggles[item.idStr] !== false);
    }

    // If Custom Priority is enabled, sort the combined array by the orderedIds state.
    if (profile === 'custom') {
        combined.sort((a, b) => {
            const indexA = orderedIds.indexOf(a.idStr);
            const indexB = orderedIds.indexOf(b.idStr);

            // If both are in the manual order, sort by that order
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            // If A is in order but B isn't, A comes first
            if (indexA !== -1) return -1;
            // If B is in order but A isn't, B comes first
            if (indexB !== -1) return 1;
            // If neither is in custom order yet, fallback to original auto-sort (date based)
            return 0;
        });
    }

    // Keep orderedIds in sync visually if it's empty (initial load)
    useEffect(() => {
        if (combined.length > 0 && orderedIds.length === 0) {
            setOrderedIds(combined.map(c => c.idStr));
        }
    }, [combined, orderedIds.length]);

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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Scheduler Queue</h1>
                    <p className="text-zinc-400 mb-1">Manage your active search tracking list and prioritize genres.</p>
                    {!loading && totalItems > 0 && (
                        <p className="text-sm font-medium text-emerald-500/80">
                            Showing {combined.length} of {totalItems} items
                        </p>
                    )}
                </div>

                {/* Filters */}
                <div className="flex flex-col items-end gap-3 flex-wrap max-w-[60%] w-full">
                    {/* First Row: Search & Dropdowns */}
                    <div className="flex items-center gap-3 w-full justify-end">
                        {/* Priority Profile Dropdown */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-400">Sort Profile:</span>
                            <select
                                value={profile}
                                onChange={(e) => handleSaveProfile(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                            >
                                <option value="recently_added">Added Date (Default)</option>
                                <option value="recently_released">Release Date</option>
                                <option value="nearly_complete">Series Completion %</option>
                                <option value="random">Randomized</option>
                                <option value="custom">Custom Drag & Drop</option>
                            </select>
                        </div>
                        {/* Search Bar */}
                        <div className="flex-1 max-w-sm">
                            <input
                                type="text"
                                placeholder="Search by exact title..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none placeholder-zinc-600"
                            />
                        </div>

                        {/* Quality Filter */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-400">Quality:</span>
                            <select
                                value={qualityFilter}
                                onChange={(e) => setQualityFilter(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                            >
                                <option value="missing">Missing Only</option>
                                <option value="upgradeable">Upgradeable Only</option>
                                <option value="all">Everything</option>
                            </select>

                            {/* Active Only Filter */}
                            <label className="flex items-center cursor-pointer ml-2">
                                <span className="text-sm font-medium text-slate-400 mr-2">Active Only:</span>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={showActiveOnly} onChange={() => setShowActiveOnly(!showActiveOnly)} />
                                    <div className={`block w-10 h-6 rounded-full transition-colors ${showActiveOnly ? 'bg-purple-500' : 'bg-zinc-700'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showActiveOnly ? 'transform translate-x-4' : ''}`}></div>
                                </div>
                            </label>
                        </div>

                        {/* Genre Quick Filters */}
                        <div className="flex items-center gap-2 flex-wrap w-full justify-end mt-2">
                            <span className="text-sm font-medium text-slate-400 mr-1">Genres:</span>
                            {/* We'll show top common genres plus 'All' as quick buttons, and keep the dropdown if there are too many */}
                            <button
                                onClick={() => setSelectedGenre('All')}
                                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${selectedGenre === 'All'
                                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 hover:bg-purple-500/30'
                                    : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700'
                                    }`}
                            >
                                All
                            </button>
                            {/* Map through a few popular ones, or just map all unique genres if it's not too crazy */}
                            {uniqueGenres.filter(g => g !== 'All').slice(0, 8).map(g => (
                                <button
                                    key={g}
                                    onClick={() => setSelectedGenre(g)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${selectedGenre === g
                                        ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 hover:bg-purple-500/30'
                                        : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700'
                                        }`}
                                >
                                    {g}
                                </button>
                            ))}

                            {/* If there are lots of genres, keep the dropdown as a fallback for the rest */}
                            {uniqueGenres.length > 9 && (
                                <select
                                    value={selectedGenre}
                                    onChange={(e) => setSelectedGenre(e.target.value)}
                                    className="bg-zinc-900 border border-zinc-800 text-white text-xs rounded-full focus:ring-purple-500 focus:border-purple-500 block px-3 py-1 sm outline-none h-6"
                                >
                                    <option value="" disabled>More...</option>
                                    {uniqueGenres.filter(g => g !== 'All').slice(8).map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Instance Filters */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-sm font-medium text-slate-400">Instances:</span>
                        {uniqueInstances.map(inst => (
                            <button
                                key={inst.id}
                                onClick={() => toggleInstance(inst.name, inst.id)}
                                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${instanceFilters[inst.name] !== false
                                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30'
                                    : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700'
                                    }`}
                            >
                                {inst.name}
                            </button>
                        ))}
                    </div>
                    {/* Refresh Data button */}
                    <button
                        onClick={fetchData}
                        className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30"
                    >
                        Refresh Data
                    </button>
                    {/* Scheduler Config Controls */}
                    <div className="flex items-center gap-2 mt-2">
                        <label className="text-sm text-slate-400">Scheduler:</label>
                        <button
                            onClick={() => {
                                const newConfig = { ...schedulerConfig, enabled: !schedulerConfig.enabled };
                                setSchedulerConfig(newConfig);
                                fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                            }}
                            className={`px-3 py-1 text-xs rounded ${schedulerConfig.enabled ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}
                        >
                            {schedulerConfig.enabled ? 'On' : 'Off'}
                        </button>
                        <label className="text-sm text-slate-400">Interval (min):</label>
                        <input
                            type="number"
                            min={1}
                            max={60}
                            value={schedulerConfig.interval}
                            onChange={e => {
                                const val = Math.max(1, Math.min(60, Number(e.target.value)));
                                const newConfig = { ...schedulerConfig, interval: val };
                                setSchedulerConfig(newConfig);
                                fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                            }}
                            className="w-16 bg-zinc-800 border border-zinc-700 text-white text-sm rounded"
                        />
                        <label className="text-sm text-slate-400">Batch Size:</label>
                        <select
                            value={schedulerConfig.batchSize}
                            onChange={e => {
                                const val = Number(e.target.value);
                                const newConfig = { ...schedulerConfig, batchSize: val };
                                setSchedulerConfig(newConfig);
                                fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                            }}
                            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded"
                        >
                            {[...Array(20)].map((_, i) => (
                                <option key={i + 1} value={i + 1}>{i + 1}</option>
                            ))}
                        </select>
                    </div>
                    {/* Search History */}
                    <div className="mt-4 max-h-48 overflow-y-auto">
                        <h3 className="text-sm font-medium text-slate-400 mb-2">Search History</h3>
                        <ul className="space-y-1">
                            {searchHistory.map((h, idx) => (
                                <li key={idx} className="text-xs text-zinc-300">
                                    {new Date(h.timestamp).toLocaleString()} – {h.profile} – {h.movies.length} movies, {h.episodes.length} episodes – {h.reason}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {combined.length === 0 ? (
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
                        items={combined.map(c => c.idStr)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="grid grid-cols-1 gap-3">
                            {combined.map((item) => {
                                const isToggled = searchToggles[item.idStr] !== false; // Default true
                                return (
                                    <SortableItem key={item.idStr} id={item.idStr} isDraggable={profile === 'custom'}>
                                        <div
                                            className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isToggled ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-900 opacity-60'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-2 h-12 rounded-full ${item.type === 'movie' ? 'bg-yellow-500' : 'bg-cyan-500'}`} />
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${item.type === 'movie' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-cyan-500/20 text-cyan-500'
                                                            }`}>
                                                            {item.type}
                                                        </span>
                                                        {/* Show first two genres as tags if available */}
                                                        {item.genres && item.genres.slice(0, 2).map((g: string) => (
                                                            <span key={g} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-purple-500/20 text-purple-400">
                                                                {g}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <h3 className="text-lg font-medium text-white">
                                                        {item.title}
                                                    </h3>
                                                    <p className="text-sm text-zinc-400">
                                                        {item.type === 'movie'
                                                            ? (item.isDownloaded ? 'Downloaded' : 'Missing from Library')
                                                            : (item.stats ? `${item.stats.episodeFileCount} / ${item.stats.episodeCount} Episodes (${Math.round(item.stats.percentOfEpisodes)}%)` : 'Unknown')}
                                                        {' • Added '}{formatDistanceToNow(item.sortDate, { addSuffix: true })}
                                                        <div className="mt-2 flex items-center gap-2">
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
                                                    </p>
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
                                                        Force Search
                                                    </button>
                                                )}
                                                <span className="text-xs text-zinc-500 font-medium mr-2">Status: {isToggled ? 'Active' : 'Paused'}</span>
                                                <button
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleSearch(item.idStr);
                                                    }}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950 cursor-pointer z-20 ${isToggled ? 'bg-emerald-500' : 'bg-zinc-700'
                                                        }`}
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isToggled ? 'translate-x-6' : 'translate-x-1'
                                                        }`} />
                                                </button>
                                            </div>
                                        </div>
                                    </SortableItem>
                                );
                            })}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}

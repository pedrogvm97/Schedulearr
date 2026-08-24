"use client";

import { useEffect, useState } from "react";
import { Search, Download, CheckCircle, Trash2, AlertCircle, Filter, Film, Tv, ShieldCheck } from "lucide-react";
import { MediaDetailsPanel } from "./MediaDetailsPanel";

export interface SystemActionRecord {
    id: string;
    timestamp: string;
    actionType: 'search' | 'grab' | 'import' | 'delete' | 'fail' | 'system';
    actionLabel: string;
    libraryId?: string;
    libraryName?: string;
    libraryColor?: string;
    title: string;
    indexer?: string;
    size?: number;
    failureReason?: string;
    poster?: string;
    tmdbId?: number;
    tvdbId?: number;
    mediaType?: 'movie' | 'series';
    seasonEpisode?: string;
}

export function SystemActionLedger() {
    const [records, setRecords] = useState<SystemActionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [instances, setInstances] = useState<Record<string, { name: string; color: string; type: string }>>({});

    // Filter state
    const [filterAction, setFilterAction] = useState<string>('all');
    const [filterLibrary, setFilterLibrary] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Modal state
    const [selectedMedia, setSelectedMedia] = useState<any>(null);

    useEffect(() => {
        fetchActionData();
        const interval = setInterval(fetchActionData, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchActionData = async () => {
        try {
            const [statsRes, historyRes, instRes] = await Promise.all([
                fetch('/api/stats?timeframe=month').then(r => r.ok ? r.json() : null),
                fetch('/api/search/history').then(r => r.ok ? r.json() : null),
                fetch('/api/instances').then(r => r.ok ? r.json() : [])
            ]);

            const instMap: Record<string, { name: string; color: string; type: string }> = {};
            if (Array.isArray(instRes)) {
                instRes.forEach((i: any) => {
                    instMap[i.id] = { name: i.name, color: i.color || '#3b82f6', type: i.type };
                });
            }
            setInstances(instMap);

            const unified: SystemActionRecord[] = [];

            // 1. Process Stats / Download Events (Grabs, Imports, Failures)
            if (statsRes?.recentDownloads && Array.isArray(statsRes.recentDownloads)) {
                statsRes.recentDownloads.forEach((dl: any, idx: number) => {
                    let actionType: SystemActionRecord['actionType'] = 'grab';
                    let actionLabel = 'Grabbed';

                    if (dl.status === 'Finalized' || dl.status === 'Imported') {
                        actionType = 'import';
                        actionLabel = 'Imported';
                    } else if (dl.status === 'Failed') {
                        actionType = 'fail';
                        actionLabel = 'Failed';
                    } else if (dl.status === 'Deleted' || dl.status === 'Cleaned') {
                        actionType = 'delete';
                        actionLabel = 'Cleaned';
                    }

                    const inst = instMap[dl.instanceId];

                    unified.push({
                        id: `dl-${idx}-${dl.date}`,
                        timestamp: dl.date,
                        actionType,
                        actionLabel,
                        libraryId: dl.instanceId,
                        libraryName: inst?.name || dl.instanceName || 'Arr Instance',
                        libraryColor: inst?.color || '#3b82f6',
                        title: dl.title,
                        indexer: dl.indexer && dl.indexer !== 'Unknown' ? dl.indexer : undefined,
                        size: dl.size,
                        failureReason: dl.failureReason,
                        poster: dl.poster,
                        tmdbId: dl.tmdbId,
                        tvdbId: dl.tvdbId,
                        mediaType: dl.mediaType
                    });
                });
            }

            // 2. Process Search History Logs
            if (historyRes?.history && Array.isArray(historyRes.history)) {
                historyRes.history.forEach((h: any, idx: number) => {
                    let actionType: SystemActionRecord['actionType'] = 'search';
                    let actionLabel = 'Scheduler Search';

                    if (h.category === 'qbit_clean' || h.category === 'media_clean') {
                        actionType = 'delete';
                        actionLabel = h.category === 'media_clean' ? 'Storage Guard Purge' : 'Auto-Clean';
                    } else if (h.category === 'disk_guard') {
                        actionType = 'system';
                        actionLabel = 'Disk Guard Alert';
                    }

                    const titles = [...(h.movies_searched || []), ...(h.episodes_searched || [])];
                    const titleText = titles.length > 0 ? titles.slice(0, 2).join(', ') + (titles.length > 2 ? ` (+${titles.length - 2} more)` : '') : (h.reason || 'Automated Batch');

                    unified.push({
                        id: `hist-${idx}-${h.timestamp}`,
                        timestamp: h.timestamp,
                        actionType,
                        actionLabel,
                        libraryName: h.profile ? `Profile: ${h.profile}` : 'Scheduler',
                        libraryColor: '#10b981',
                        title: titleText,
                        failureReason: h.reason
                    });
                });
            }

            // Sort chronologically (newest first)
            unified.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setRecords(unified);
        } catch (e) {
            console.error('Failed to load action history', e);
        } finally {
            setLoading(false);
        }
    };

    const getActionBadge = (type: SystemActionRecord['actionType'], label: string) => {
        switch (type) {
            case 'search':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <Search size={11} /> {label}
                    </span>
                );
            case 'grab':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        <Download size={11} /> {label}
                    </span>
                );
            case 'import':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle size={11} /> {label}
                    </span>
                );
            case 'delete':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <Trash2 size={11} /> {label}
                    </span>
                );
            case 'fail':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-600/20 text-rose-300 border border-rose-600/40">
                        <AlertCircle size={11} /> {label}
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        <ShieldCheck size={11} /> {label}
                    </span>
                );
        }
    };

    const formatBytes = (bytes?: number) => {
        if (!bytes) return null;
        const gb = bytes / (1024 ** 3);
        return `${gb.toFixed(2)} GB`;
    };

    const getAge = (dateStr: string) => {
        try {
            const diffMs = Date.now() - new Date(dateStr).getTime();
            const diffMin = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMin / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffDays > 0) return `${diffDays}d ago`;
            if (diffHours > 0) return `${diffHours}h ago`;
            if (diffMin > 0) return `${diffMin}m ago`;
            return 'Just now';
        } catch {
            return dateStr;
        }
    };

    // Filter records
    const filteredRecords = records.filter(r => {
        if (filterAction !== 'all' && r.actionType !== filterAction) return false;
        if (filterLibrary !== 'all' && r.libraryId !== filterLibrary) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return r.title.toLowerCase().includes(q) || r.libraryName?.toLowerCase().includes(q) || r.indexer?.toLowerCase().includes(q);
        }
        return true;
    });

    return (
        <div className="p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 space-y-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black text-white">System Action & Audit Ledger</h2>
                    <p className="text-xs text-zinc-500 font-medium">Complete historical log of searches, snatches, imports, cleans, and system actions.</p>
                </div>
            </div>

            {/* Granular Filtering Control Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800/80">
                {/* Search query */}
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Filter by title, indexer, or instance..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs font-bold text-white placeholder-zinc-500 outline-none focus:border-emerald-500/50"
                    />
                </div>

                {/* Filter Group 1: Action Performed */}
                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider pr-2">Action:</span>
                    {[
                        { id: 'all', label: 'All Actions' },
                        { id: 'search', label: 'Searches' },
                        { id: 'grab', label: 'Grabs' },
                        { id: 'import', label: 'Imports' },
                        { id: 'delete', label: 'Cleans' },
                        { id: 'fail', label: 'Failures' }
                    ].map(act => (
                        <button
                            key={act.id}
                            onClick={() => setFilterAction(act.id)}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${
                                filterAction === act.id
                                    ? 'bg-zinc-800 text-white border border-zinc-700/80 shadow-md'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                            }`}
                        >
                            {act.label}
                        </button>
                    ))}
                </div>

                {/* Filter Group 2: Library Affected */}
                {Object.keys(instances).length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider pr-2">Library:</span>
                        <button
                            onClick={() => setFilterLibrary('all')}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${
                                filterLibrary === 'all'
                                    ? 'bg-zinc-800 text-white border border-zinc-700/80 shadow-md'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                            }`}
                        >
                            All
                        </button>
                        {Object.entries(instances).map(([id, inst]) => (
                            <button
                                key={id}
                                onClick={() => setFilterLibrary(id)}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap border ${
                                    filterLibrary === id
                                        ? 'bg-zinc-800 text-white border-zinc-600 shadow-md'
                                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full inline-block mr-1.5" style={{ backgroundColor: inst.color }} />
                                {inst.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Action Items List */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                </div>
            ) : filteredRecords.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950/40 rounded-2xl border border-zinc-900">
                    <p className="text-zinc-500 font-bold">No actions found matching your criteria.</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-[650px] overflow-y-auto custom-scrollbar pr-1">
                    {filteredRecords.map(rec => (
                        <div
                            key={rec.id}
                            className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                        >
                            <div className="flex items-center gap-4 min-w-0">
                                {/* Media Poster Image */}
                                <div
                                    onClick={() => rec.tmdbId && setSelectedMedia(rec)}
                                    className="w-12 h-16 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex-shrink-0 flex items-center justify-center cursor-pointer group-hover:border-zinc-700 transition-all"
                                >
                                    {rec.poster ? (
                                        <img src={rec.poster} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                                    ) : (
                                        <Film className="text-zinc-700 group-hover:text-emerald-500/50" size={18} />
                                    )}
                                </div>

                                <div className="space-y-1.5 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Action Performed Badge */}
                                        {getActionBadge(rec.actionType, rec.actionLabel)}

                                        {/* Library Affected Badge (Distinct outline tag styling) */}
                                        {rec.libraryName && (
                                            <span
                                                className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border"
                                                style={{
                                                    backgroundColor: `${rec.libraryColor || '#3b82f6'}10`,
                                                    borderColor: `${rec.libraryColor || '#3b82f6'}40`,
                                                    color: rec.libraryColor || '#3b82f6'
                                                }}
                                            >
                                                {rec.libraryName}
                                            </span>
                                        )}
                                    </div>

                                    <h4
                                        onClick={() => rec.tmdbId && setSelectedMedia(rec)}
                                        className="font-bold text-white text-sm truncate hover:text-emerald-400 cursor-pointer transition-colors"
                                        title={rec.title}
                                    >
                                        {rec.title}
                                    </h4>

                                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-medium flex-wrap">
                                        <span>{getAge(rec.timestamp)}</span>
                                        {rec.indexer && <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-400">{rec.indexer}</span>}
                                        {formatBytes(rec.size) && <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded font-bold text-zinc-400">{formatBytes(rec.size)}</span>}
                                        {rec.failureReason && <span className="text-rose-400 font-bold truncate max-w-md" title={rec.failureReason}>Reason: {rec.failureReason}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedMedia && (
                <MediaDetailsPanel
                    item={selectedMedia}
                    onClose={() => setSelectedMedia(null)}
                />
            )}
        </div>
    );
}

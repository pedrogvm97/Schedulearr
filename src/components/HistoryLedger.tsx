"use client";

import { useEffect, useState } from "react";
import { MediaDetailsPanel } from "./MediaDetailsPanel";

interface HistoryEntry {
    id: string;
    timestamp: string;
    profile: string;
    movies_searched: string[];
    episodes_searched: string[];
    reason: string;
    category: string;
}

interface GroupedEntry {
    category: string;
    profile: string;
    entries: HistoryEntry[];
    firstTimestamp: string;
    lastTimestamp: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dotColor: string; icon: string }> = {
    search: {
        label: "Scheduler Search",
        color: "text-emerald-400",
        bg: "bg-emerald-500/8",
        border: "border-emerald-500/20",
        dotColor: "bg-emerald-500",
        icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    },
    qbit_clean: {
        label: "qBit Cleaner",
        color: "text-orange-400",
        bg: "bg-orange-500/8",
        border: "border-orange-500/20",
        dotColor: "bg-orange-500",
        icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    },
    media_clean: {
        label: "Storage Guard Clean",
        color: "text-red-400",
        bg: "bg-red-500/8",
        border: "border-red-500/20",
        dotColor: "bg-red-500",
        icon: "M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    },
    disk_guard: {
        label: "Disk Guard",
        color: "text-amber-400",
        bg: "bg-amber-500/8",
        border: "border-amber-500/20",
        dotColor: "bg-amber-500",
        icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    },
    scheduler: {
        label: "Scheduler",
        color: "text-sky-400",
        bg: "bg-sky-500/8",
        border: "border-sky-500/20",
        dotColor: "bg-sky-500",
        icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    },
    system: {
        label: "System",
        color: "text-violet-400",
        bg: "bg-violet-500/8",
        border: "border-violet-500/20",
        dotColor: "bg-violet-500",
        icon: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
    },
    error: {
        label: "Error",
        color: "text-red-500",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        dotColor: "bg-red-600",
        icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    }
};

function formatRelativeTime(ts: string) {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function groupConsecutiveEntries(history: HistoryEntry[]): GroupedEntry[] {
    const groups: GroupedEntry[] = [];
    for (const entry of history) {
        const cat = entry.category || "search";
        const last = groups[groups.length - 1];
        // Group if same category AND same profile AND within 2 hours
        if (
            last &&
            last.category === cat &&
            last.profile === entry.profile &&
            (new Date(last.lastTimestamp).getTime() - new Date(entry.timestamp).getTime()) < 2 * 3600 * 1000
        ) {
            last.entries.push(entry);
            last.lastTimestamp = entry.timestamp;
        } else {
            groups.push({
                category: cat,
                profile: entry.profile,
                entries: [entry],
                firstTimestamp: entry.timestamp,
                lastTimestamp: entry.timestamp
            });
        }
    }
    return groups;
}

export default function HistoryLedger() {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
    const [filter, setFilter] = useState<string>("all");
    const [tmdbApiKey, setTmdbApiKey] = useState("");
    const [selectedMedia, setSelectedMedia] = useState<any>(null);
    const [libStatus, setLibStatus] = useState<any>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await fetch("/api/history");
                const data = await res.json();
                if (data.history) setHistory(data.history);
            } catch (e) {
                console.error("Failed to fetch history", e);
            }
            setLoading(false);
        };
        fetchHistory();
        fetch("/api/settings")
            .then(r => r.json())
            .then(d => { if (d.tmdbApiKey) setTmdbApiKey(d.tmdbApiKey); });
        const interval = setInterval(fetchHistory, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleOpenMedia = (title: string, type: "movie" | "series") => {
        setSelectedMedia({ title, type });
        fetch(`/api/media/status?title=${encodeURIComponent(title)}&type=${type}`)
            .then(r => r.ok ? r.json() : null)
            .then(s => setLibStatus(s))
            .catch(() => setLibStatus(null));
    };

    const toggleGroup = (key: string) => setExpandedGroups(p => ({ ...p, [key]: !p[key] }));
    const toggleEntry = (key: string) => setExpandedEntries(p => ({ ...p, [key]: !p[key] }));

    const categories = ["all", ...Array.from(new Set(history.map(e => e.category || "search")))];
    const filtered = filter === "all" ? history : history.filter(e => (e.category || "search") === filter);
    const groups = groupConsecutiveEntries(filtered);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 gap-3 text-zinc-600">
                <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                <span className="text-sm font-medium">Loading activity log...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-2 pb-2 border-b border-zinc-800/50">
                {categories.map(cat => {
                    const cfg = cat === "all" ? null : CATEGORY_CONFIG[cat];
                    const isActive = filter === cat;
                    const count = cat === "all" ? history.length : history.filter(e => (e.category || "search") === cat).length;
                    return (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border ${
                                isActive
                                    ? cfg
                                        ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                                        : "bg-zinc-700 border-zinc-600 text-white"
                                    : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                            }`}
                        >
                            {cfg && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} flex-shrink-0`} />}
                            {cfg ? cfg.label : "All Events"}
                            <span className="opacity-60 font-mono">{count}</span>
                        </button>
                    );
                })}
            </div>

            {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                    <svg className="w-12 h-12 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium">No activity logged yet</p>
                    <p className="text-xs mt-1 opacity-60">Events will appear here as the scheduler runs</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {groups.map((group, gi) => {
                        const cfg = CATEGORY_CONFIG[group.category] || CATEGORY_CONFIG.search;
                        const groupKey = `g-${gi}`;
                        const isGroupExpanded = expandedGroups[groupKey] ?? (group.entries.length === 1);
                        const totalItems = group.entries.reduce((s, e) => s + e.movies_searched.length + e.episodes_searched.length, 0);
                        const isBatch = group.entries.length > 1;

                        return (
                            <div key={groupKey} className={`rounded-2xl border overflow-hidden transition-all ${cfg.border} ${isGroupExpanded ? cfg.bg : "bg-zinc-900/40 border-zinc-800/50"}`}>
                                {/* Group Header */}
                                <button
                                    onClick={() => toggleGroup(groupKey)}
                                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                                >
                                    {/* Icon */}
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg} border ${cfg.border}`}>
                                        <svg className={`w-4 h-4 ${cfg.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cfg.icon} />
                                        </svg>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                                            <span className="text-zinc-600 text-[10px] font-mono">·</span>
                                            <span className="text-xs font-semibold text-zinc-300 truncate">{group.profile.replace(/_/g, " ")}</span>
                                            {isBatch && (
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${cfg.bg} ${cfg.border} border ${cfg.color}`}>
                                                    {group.entries.length} events
                                                </span>
                                            )}
                                            {totalItems > 0 && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase bg-zinc-800 border border-zinc-700 text-zinc-400">
                                                    {totalItems} items
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-zinc-600 font-medium">
                                                {isBatch
                                                    ? `${formatRelativeTime(group.firstTimestamp)} — ${new Date(group.firstTimestamp).toLocaleString()} to ${new Date(group.lastTimestamp).toLocaleTimeString()}`
                                                    : formatRelativeTime(group.firstTimestamp) + " · " + new Date(group.firstTimestamp).toLocaleString()
                                                }
                                            </span>
                                        </div>
                                    </div>

                                    <svg className={`w-4 h-4 text-zinc-600 flex-shrink-0 transition-transform ${isGroupExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>

                                {/* Group body — one entry per row if multiple, or single expanded */}
                                {isGroupExpanded && (
                                    <div className="border-t border-zinc-800/40">
                                        {group.entries.map((entry, ei) => {
                                            const entryKey = entry.id;
                                            const isEntryExpanded = expandedEntries[entryKey];
                                            const itemCount = entry.movies_searched.length + entry.episodes_searched.length;

                                            return (
                                                <div key={entryKey} className={ei > 0 ? "border-t border-zinc-800/30" : ""}>
                                                    {/* Entry row */}
                                                    <button
                                                        onClick={() => toggleEntry(entryKey)}
                                                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.015] transition-colors"
                                                    >
                                                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.dotColor}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-zinc-400 leading-relaxed">{entry.reason || "No details"}</p>
                                                            {itemCount > 0 && (
                                                                <p className="text-[10px] text-zinc-600 mt-0.5">
                                                                    {entry.movies_searched.length > 0 && `${entry.movies_searched.length} movie${entry.movies_searched.length > 1 ? "s" : ""}`}
                                                                    {entry.movies_searched.length > 0 && entry.episodes_searched.length > 0 && " · "}
                                                                    {entry.episodes_searched.length > 0 && `${entry.episodes_searched.length} episode${entry.episodes_searched.length > 1 ? "s" : ""}`}
                                                                    {" — click to expand"}
                                                                </p>
                                                            )}
                                                            <p className="text-[10px] text-zinc-700 mt-0.5 font-mono">{new Date(entry.timestamp).toLocaleString()}</p>
                                                        </div>
                                                        {itemCount > 0 && (
                                                            <svg className={`w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-1 transition-transform ${isEntryExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m6 9 6 6 6-6" />
                                                            </svg>
                                                        )}
                                                    </button>

                                                    {/* Item lists */}
                                                    {isEntryExpanded && itemCount > 0 && (
                                                        <div className="px-4 pb-3 space-y-3">
                                                            {entry.episodes_searched.length > 0 && (
                                                                <div>
                                                                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600 mb-1.5">Episodes ({entry.episodes_searched.length})</p>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                                                        {entry.episodes_searched.map((ep, i) => (
                                                                            <button
                                                                                key={i}
                                                                                onClick={() => handleOpenMedia(ep.split(" - S")[0], "series")}
                                                                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sky-500/5 border border-sky-500/10 hover:bg-sky-500/10 transition-all text-left"
                                                                            >
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                                                                                <span className="text-[11px] text-sky-300 truncate">{ep}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {entry.movies_searched.length > 0 && (
                                                                <div>
                                                                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600 mb-1.5">Movies ({entry.movies_searched.length})</p>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                                                        {entry.movies_searched.map((mov, i) => (
                                                                            <button
                                                                                key={i}
                                                                                onClick={() => handleOpenMedia(mov, "movie")}
                                                                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all text-left"
                                                                            >
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                                                                                <span className="text-[11px] text-amber-300 truncate">{mov}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {selectedMedia && (
                <MediaDetailsPanel
                    item={selectedMedia}
                    tmdbApiKey={tmdbApiKey}
                    libStatus={libStatus}
                    onClose={() => { setSelectedMedia(null); setLibStatus(null); }}
                />
            )}
        </div>
    );
}

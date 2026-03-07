"use client";

import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

// --- Interfaces ---
interface Torrent {
    hash: string;
    name: string;
    size: number;
    progress: number;
    dlspeed: number;
    upspeed: number;
    state: string;
    instanceId: string;
    instanceName: string;
    instanceColor: string;
    indexer?: string;
    [key: string]: any; // Allow for dynamic field access during sorting
}

export default function Downloads() {
    const [torrents, setTorrents] = useState<Torrent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal state for delete options
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedHash, setSelectedHash] = useState<{ hash: string, name: string, instanceId: string } | null>(null);

    const [sortField, setSortField] = useState<'name' | 'size' | 'progress' | 'dlspeed'>('name');

    const [deleteFiles, setDeleteFiles] = useState(true);
    const [blacklistRelease, setBlacklistRelease] = useState(true);

    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Auto-Cleanup State
    const [qbitCleanupEnabled, setQbitCleanupEnabled] = useState(false);
    const [qbitCleanupIntervalMin, setQbitCleanupIntervalMin] = useState(15);
    const [qbitStagnationMin, setQbitStagnationMin] = useState(60);
    const [qbitDeleteFiles, setQbitDeleteFiles] = useState(true);
    const [qbitBlacklist, setQbitBlacklist] = useState(true);
    const [qbitSizeCleanupEnabled, setQbitSizeCleanupEnabled] = useState(false);
    const [qbitMaxSizeGb, setQbitMaxSizeGb] = useState(100);
    const [isCleanupSettingsOpen, setIsCleanupSettingsOpen] = useState(false);

    const fetchTorrents = async () => {
        try {
            const res = await fetch('/api/qbittorrent/torrents');
            if (!res.ok) throw new Error('Failed to fetch torrents. Are connections set up?');
            const data = await res.json();
            setTorrents(data.torrents || []);
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();

            if (data.qbit_cleanup_enabled === 'true') setQbitCleanupEnabled(true);
            if (data.qbit_cleanup_interval_min) setQbitCleanupIntervalMin(parseInt(data.qbit_cleanup_interval_min));
            if (data.qbit_cleanup_stagnation_min) setQbitStagnationMin(parseInt(data.qbit_cleanup_stagnation_min));
            if (data.qbit_cleanup_delete_files === 'false') setQbitDeleteFiles(false);
            if (data.qbit_cleanup_blacklist === 'false') setQbitBlacklist(false);

            if (data.qbit_cleanup_max_size_enabled === 'true') setQbitSizeCleanupEnabled(true);
            if (data.qbit_cleanup_max_size_gb) setQbitMaxSizeGb(parseInt(data.qbit_cleanup_max_size_gb));
        } catch (e) {
            console.error(e);
        }
    };

    const updateSetting = async (key: string, value: string | number | boolean) => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: String(value) })
            });
        } catch (e) {
            console.error('Failed to update setting', key, e);
        }
    };

    useEffect(() => {
        fetchTorrents();
        fetchSettings();
        const interval = setInterval(fetchTorrents, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

    const handleDelete = async () => {
        if (!selectedHash) return;

        try {
            await fetch('/api/qbittorrent/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hashes: [selectedHash.hash],
                    deleteFiles,
                    blacklist: blacklistRelease,
                    instanceId: selectedHash.instanceId
                })
            });
            setDeleteModalOpen(false);
            setSuccessMessage(`Successfully removed: ${selectedHash.name}`);
            setTimeout(() => setSuccessMessage(null), 4000);
            fetchTorrents(); // Refresh immediately
        } catch (e) {
            console.error('Error deleting torrent', e);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatSpeed = (bytesPerSec: number) => {
        return formatBytes(bytesPerSec) + '/s';
    };

    const toggleSort = (field: 'name' | 'size' | 'progress' | 'dlspeed') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const sortedTorrents = useMemo(() => {
        const sorted = [...torrents].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            // Added logic for unhandled keys falling back or string comparison
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [torrents, sortField, sortDirection]);

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8 pb-24">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Active Downloads</h1>
                <p className="text-zinc-400">Monitor and manage your active qBittorrent transfers.</p>
            </div>

            {/* qBittorrent Auto-Cleanup Panel */}
            <div className={`bg-zinc-900 border ${isCleanupSettingsOpen ? 'border-emerald-500/30' : 'border-zinc-800'} rounded-2xl transition-all overflow-hidden`}>
                <button
                    onClick={() => setIsCleanupSettingsOpen(!isCleanupSettingsOpen)}
                    className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/50 transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${qbitCleanupEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path></svg>
                        </div>
                        <div className="text-left">
                            <h2 className="text-base font-bold text-white tracking-tight">Auto-Cleanup Settings</h2>
                            <p className="text-xs text-zinc-500 font-medium">Automatically remove stalled or oversized torrents from your client.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${qbitCleanupEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            {qbitCleanupEnabled ? 'Active' : 'Disabled'}
                        </div>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`text-zinc-500 transition-transform duration-300 ${isCleanupSettingsOpen ? 'rotate-180' : ''}`}
                        >
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </div>
                </button>

                {isCleanupSettingsOpen && (
                    <div className="p-6 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 border-t border-zinc-800/50 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                                <div>
                                    <div className="text-sm font-bold text-zinc-200">Enable Cleaner</div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Run background health checks</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const next = !qbitCleanupEnabled;
                                        setQbitCleanupEnabled(next);
                                        updateSetting('qbit_cleanup_enabled', next);
                                    }}
                                    className={`w-10 h-5 rounded-full transition-all relative ${qbitCleanupEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                                >
                                    <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${qbitCleanupEnabled ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-3">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Interval (Minutes)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={qbitCleanupIntervalMin}
                                    onChange={e => {
                                        const val = parseInt(e.target.value) || 15;
                                        setQbitCleanupIntervalMin(val);
                                        updateSetting('qbit_cleanup_interval_min', val);
                                    }}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all"
                                />
                                <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">How often the background process scans your download client.</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                                <div>
                                    <div className="text-sm font-bold text-zinc-200">Delete Files</div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Remove data from disk</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const next = !qbitDeleteFiles;
                                        setQbitDeleteFiles(next);
                                        updateSetting('qbit_cleanup_delete_files', next);
                                    }}
                                    className={`w-10 h-5 rounded-full transition-all relative ${qbitDeleteFiles ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                                >
                                    <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${qbitDeleteFiles ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-3">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Stagnation (Minutes)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={qbitStagnationMin}
                                    onChange={e => {
                                        const val = parseInt(e.target.value) || 60;
                                        setQbitStagnationMin(val);
                                        updateSetting('qbit_cleanup_stagnation_min', val);
                                    }}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all"
                                />
                                <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">Items with no progress changes for longer than this will be purged.</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                                <div>
                                    <div className="text-sm font-bold text-zinc-200">Blacklist Failed</div>
                                    <p className="text-[10px] text-zinc-500 font-medium">Prevent re-grabbing same release</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const next = !qbitBlacklist;
                                        setQbitBlacklist(next);
                                        updateSetting('qbit_cleanup_blacklist', next);
                                    }}
                                    className={`w-10 h-5 rounded-full transition-all relative ${qbitBlacklist ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                >
                                    <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${qbitBlacklist ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Max Size (GB)</label>
                                    <button
                                        onClick={() => {
                                            const next = !qbitSizeCleanupEnabled;
                                            setQbitSizeCleanupEnabled(next);
                                            updateSetting('qbit_cleanup_max_size_enabled', next);
                                        }}
                                        className={`w-10 h-5 rounded-full transition-all relative ${qbitSizeCleanupEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                    >
                                        <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${qbitSizeCleanupEnabled ? 'left-6' : 'left-1'}`} />
                                    </button>
                                </div>
                                <input
                                    type="number"
                                    min="1"
                                    disabled={!qbitSizeCleanupEnabled}
                                    value={qbitMaxSizeGb}
                                    onChange={e => {
                                        const val = parseInt(e.target.value) || 100;
                                        setQbitMaxSizeGb(val);
                                        updateSetting('qbit_cleanup_max_size_gb', val);
                                    }}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all disabled:opacity-30"
                                />
                                <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">Releases larger than this will be rejected and purged.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl">
                    {error}
                </div>
            )}

            {successMessage && (
                <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 p-4 rounded-xl flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    {successMessage}
                </div>
            )}

            {loading && torrents.length === 0 ? (
                <div className="text-zinc-500 text-center py-10">Loading torrents...</div>
            ) : torrents.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                    No active downloads found.
                </div>
            ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
                    {/* Headers */}
                    <div className="hidden md:grid grid-cols-[2fr_0.8fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-zinc-950/50 text-xs font-semibold text-zinc-500 uppercase tracking-wider items-center select-none">
                        <button onClick={() => toggleSort('name')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <button onClick={() => toggleSort('size')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Size {sortField === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <button onClick={() => toggleSort('progress')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Completion {sortField === 'progress' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <button onClick={() => toggleSort('dlspeed')} className="text-left flex items-center gap-1 hover:text-zinc-300 transition-colors">
                            Speed {sortField === 'dlspeed' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                        <div className="text-left">Indexer</div>
                        <div className="w-8 text-center"></div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-zinc-800/50">
                        {sortedTorrents.map(torrent => (
                            <div key={torrent.hash} className="p-3 md:px-4 md:py-3 hover:bg-zinc-800/40 transition-colors flex flex-col md:grid md:grid-cols-[2fr_0.8fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 md:items-center relative group">
                                <div className="min-w-0 pr-8 md:pr-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm bg-opacity-20 text-white truncate max-w-[120px] ${torrent.instanceColor}`}>
                                            {torrent.instanceName || 'qBittorrent'}
                                        </span>
                                        {torrent.state.includes('stalled') && (
                                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm bg-orange-500/20 text-orange-500">
                                                {torrent.state}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-sm font-medium text-white truncate" title={torrent.name}>{torrent.name}</h3>
                                </div>

                                <div className="text-sm text-zinc-400 flex items-center md:items-start group-hover:text-zinc-300 transition-colors">
                                    <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold mr-2 w-16">Size:</span>
                                    {formatBytes(torrent.size)}
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold w-16">Progress:</span>
                                    <span className="text-sm text-zinc-300 w-12 text-right">{(torrent.progress * 100).toFixed(1)}%</span>
                                    <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden lg:block border border-zinc-900 shadow-inner">
                                        <div
                                            className={`h-full ${torrent.instanceColor}`}
                                            style={{ width: `${torrent.progress * 100}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex md:block items-center">
                                    <div className="md:hidden text-xs text-zinc-500 uppercase font-semibold mb-0 mr-2 w-16">Speed:</div>
                                    <div className="flex items-center gap-3 text-xs w-full">
                                        <span className="text-emerald-400 font-mono w-1/2 md:w-auto" title="Download Speed">↓{formatSpeed(torrent.dlspeed)}</span>
                                        <span className="text-sky-400 font-mono w-1/2 md:w-auto" title="Upload Speed">↑{formatSpeed(torrent.upspeed)}</span>
                                    </div>
                                </div>

                                <div className="text-xs font-bold text-zinc-500 md:text-zinc-400 uppercase tracking-wide">
                                    <span className="md:hidden text-xs text-zinc-500 uppercase font-semibold mr-2 w-16 inline-block">Indexer:</span>
                                    <span className={torrent.indexer && torrent.indexer !== 'Unknown' ? 'bg-zinc-800/80 px-2 py-1 rounded text-zinc-300 border border-zinc-700/50' : 'text-zinc-600'}>
                                        {torrent.indexer || 'Unknown'}
                                    </span>
                                </div>

                                <div className="absolute top-3 right-3 md:relative md:top-auto md:right-auto flex-shrink-0 flex items-center justify-center">
                                    <button
                                        onClick={() => {
                                            setSelectedHash({ hash: torrent.hash, name: torrent.name, instanceId: torrent.instanceId });
                                            setDeleteModalOpen(true);
                                        }}
                                        className="p-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100 bg-red-500/10 hover:bg-red-500/80 hover:text-white text-red-500 rounded-md transition-all shadow-sm"
                                        title="Delete Torrent"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && selectedHash && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-4">Confirm Deletion</h2>
                        <p className="text-zinc-400 text-sm mb-6 pb-4 border-b border-zinc-800">
                            Are you sure you want to remove <span className="text-white font-medium break-all">{selectedHash.name}</span>?
                        </p>

                        <div className="space-y-4 mb-8">
                            <label className="flex items-start gap-3 cursor-pointer group p-2 hover:bg-zinc-800/50 rounded-lg transition-colors -mx-2">
                                <div className="relative flex items-center justify-center mt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={deleteFiles}
                                        onChange={(e) => setDeleteFiles(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-950 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-zinc-200 font-semibold group-hover:text-white transition-colors">Delete Downloaded Data</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">Also remove the files from disk.</div>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer group p-2 hover:bg-zinc-800/50 rounded-lg transition-colors -mx-2">
                                <div className="relative flex items-center justify-center mt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={blacklistRelease}
                                        onChange={(e) => setBlacklistRelease(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-950 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-zinc-200 font-semibold group-hover:text-white transition-colors">Blacklist Release</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">Remove from Radarr/Sonarr queue and mark as failed.</div>
                                </div>
                            </label>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 shadow-md shadow-red-500/20 text-white transition-colors flex items-center gap-2"
                            >
                                Delete Torrent
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

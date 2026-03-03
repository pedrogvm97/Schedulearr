"use client";

import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

export default function Downloads() {
    const [torrents, setTorrents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal state for delete options
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedHash, setSelectedHash] = useState<{ hash: string, name: string, instanceId: string } | null>(null);

    const [deleteFiles, setDeleteFiles] = useState(true);
    const [blacklistRelease, setBlacklistRelease] = useState(true);

    // Sorting state
    const [sortField, setSortField] = useState<'name' | 'size' | 'progress' | 'dlspeed'>('added_on'); // Default sort added_on usually nice, but let's default 'progress'
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const fetchTorrents = async () => {
        try {
            const res = await fetch('/api/qbittorrent/torrents');
            if (!res.ok) throw new Error('Failed to fetch torrents. Are connections set up?');
            const data = await res.json();
            setTorrents(data.torrents || []);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTorrents();
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
                    <div className="hidden md:grid grid-cols-[2.5fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-zinc-950/50 text-xs font-semibold text-zinc-500 uppercase tracking-wider items-center select-none">
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
                        <div className="w-8 text-center"></div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-zinc-800/50">
                        {sortedTorrents.map(torrent => (
                            <div key={torrent.hash} className="p-3 md:px-4 md:py-3 hover:bg-zinc-800/40 transition-colors flex flex-col md:grid md:grid-cols-[2.5fr_1fr_1fr_1fr_auto] gap-3 md:gap-4 md:items-center relative group">
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

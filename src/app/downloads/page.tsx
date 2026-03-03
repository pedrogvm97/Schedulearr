"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

export default function Downloads() {
    const [torrents, setTorrents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state for delete options
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedHash, setSelectedHash] = useState<{ hash: string, name: string, instanceId: string } | null>(null);

    const [deleteFiles, setDeleteFiles] = useState(true);
    const [blacklistRelease, setBlacklistRelease] = useState(true);

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

            {loading && torrents.length === 0 ? (
                <div className="text-zinc-500 text-center py-10">Loading torrents...</div>
            ) : torrents.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                    No active downloads found.
                </div>
            ) : (
                <div className="space-y-4">
                    {torrents.map(torrent => (
                        <div key={torrent.hash} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm bg-emerald-500/20 text-emerald-500">
                                        {torrent.instanceName || 'qBittorrent'}
                                    </span>
                                    {torrent.state.includes('stalled') && (
                                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm bg-orange-500/20 text-orange-500">
                                            {torrent.state}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-lg font-medium text-white truncate" title={torrent.name}>{torrent.name}</h3>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm text-zinc-400">
                                    <div>
                                        <div className="text-xs text-zinc-500 uppercase font-semibold">Size</div>
                                        <div>{formatBytes(torrent.size)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-zinc-500 uppercase font-semibold">Progress</div>
                                        <div className="flex items-center gap-2">
                                            <span>{(torrent.progress * 100).toFixed(1)}%</span>
                                            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden sm:block">
                                                <div
                                                    className="h-full bg-emerald-500"
                                                    style={{ width: `${torrent.progress * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-zinc-500 uppercase font-semibold">Health</div>
                                        <div className="text-zinc-300">S: {torrent.num_seeds} / P: {torrent.num_leechs}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-zinc-500 uppercase font-semibold">Speed</div>
                                        <div className="text-emerald-400">↓ {formatSpeed(torrent.dlspeed)}</div>
                                        <div className="text-sky-400">↑ {formatSpeed(torrent.upspeed)}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-shrink-0">
                                <button
                                    onClick={() => {
                                        setSelectedHash({ hash: torrent.hash, name: torrent.name, instanceId: torrent.instanceId });
                                        setDeleteModalOpen(true);
                                    }}
                                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                                    title="Delete Torrent"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && selectedHash && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full">
                        <h2 className="text-xl font-bold text-white mb-4">Confirm Deletion</h2>
                        <p className="text-zinc-400 text-sm mb-6">
                            Are you sure you want to remove <span className="text-white font-medium break-all">{selectedHash.name}</span>?
                        </p>

                        <div className="space-y-4 mb-8">
                            <label className="flex items-start gap-3 cursor-pointer group">
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
                                    <div className="text-zinc-200 font-medium group-hover:text-white transition-colors">Delete Downloaded Data</div>
                                    <div className="text-xs text-zinc-500">Also remove the files from disk.</div>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer group">
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
                                    <div className="text-zinc-200 font-medium group-hover:text-white transition-colors">Blacklist Release</div>
                                    <div className="text-xs text-zinc-500">Remove from Radarr/Sonarr queue and mark as failed.</div>
                                </div>
                            </label>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-2"
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

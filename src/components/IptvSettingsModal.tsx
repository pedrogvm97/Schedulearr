'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, RefreshCw, Check, Clock, Tv2, AlertCircle, Play, ChevronRight, Layers, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface IptvSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    library: {
        id: string;
        name: string;
        folders: string[];
    } | null;
    onUpdated: () => void;
}

interface SyncProgressState {
    status: 'idle' | 'downloading' | 'parsing' | 'saving' | 'scanning_rules' | 'completed' | 'error';
    progressPercent: number;
    message: string;
    programCount: number;
    ruleMatchesCount: number;
    error?: string;
}

export default function IptvSettingsModal({
    isOpen,
    onClose,
    library,
    onUpdated
}: IptvSettingsModalProps) {
    if (!isOpen || !library) return null;

    const streamUrl = library.folders?.[0] || '';
    const initialEpg = library.folders?.[1] || '';
    const initialInterval = library.folders?.[2] || '24';
    const lastSyncDate = library.folders?.[3] ? new Date(library.folders[3]) : null;

    const [providerName, setProviderName] = useState(library.name);
    const [epgUrl, setEpgUrl] = useState(initialEpg);
    const [intervalHours, setIntervalHours] = useState(initialInterval);
    const [isSaving, setIsSaving] = useState(false);
    const [isRefreshingChannels, setIsRefreshingChannels] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Live sync progress states
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgressState>({
        status: 'idle',
        progressPercent: 0,
        message: 'Idle',
        programCount: 0,
        ruleMatchesCount: 0
    });

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-detect Xtream host and credentials to offer XMLTV guide if empty
    const getSuggestedEpg = () => {
        try {
            if (streamUrl.includes('username=') && streamUrl.includes('password=')) {
                const u = new URL(streamUrl);
                const user = u.searchParams.get('username');
                const pass = u.searchParams.get('password');
                if (user && pass) {
                    return `${u.protocol}//${u.host}/xmltv.php?username=${user}&password=${pass}`;
                }
            }
        } catch {
            return '';
        }
        return '';
    };

    const suggestedEpg = getSuggestedEpg();

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const stopPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    };

    const startPolling = (libId: string) => {
        stopPolling();
        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/theater/iptv/epg/sync?libraryId=${libId}`);
                if (res.ok) {
                    const data = await res.json();
                    setSyncProgress({
                        status: data.status || 'idle',
                        progressPercent: data.progressPercent || 0,
                        message: data.message || '',
                        programCount: data.programCount || 0,
                        ruleMatchesCount: data.ruleMatchesCount || 0,
                        error: data.error
                    });

                    if (data.status === 'completed') {
                        stopPolling();
                        toast.success(`EPG Guide synced! (${data.programCount?.toLocaleString()} programmes)`);
                        onUpdated();
                    } else if (data.status === 'error') {
                        stopPolling();
                        toast.error(data.error || 'EPG sync failed');
                    }
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 800);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/theater/libraries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: library.id,
                    name: providerName.trim() || library.name,
                    folders: [
                        streamUrl,
                        epgUrl.trim(),
                        intervalHours,
                        library.folders?.[3] || ''
                    ]
                })
            });

            if (!res.ok) throw new Error('Failed to update provider settings');

            toast.success('Settings saved!');
            onUpdated();
            onClose();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Error saving settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTriggerManualSync = async () => {
        if (!epgUrl.trim()) {
            toast.error('Please configure an XMLTV EPG URL first');
            return;
        }

        setIsSyncModalOpen(true);
        setSyncProgress({
            status: 'downloading',
            progressPercent: 10,
            message: 'Starting guide sync...',
            programCount: 0,
            ruleMatchesCount: 0
        });

        try {
            const res = await fetch('/api/theater/iptv/epg/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    libraryId: library.id,
                    epgUrl: epgUrl.trim()
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to trigger sync');
            }

            // Start polling progress
            startPolling(library.id);
        } catch (err: any) {
            console.error(err);
            setSyncProgress({
                status: 'error',
                progressPercent: 100,
                message: err.message || 'Error triggering sync',
                programCount: 0,
                ruleMatchesCount: 0,
                error: err.message
            });
            toast.error(err.message || 'Error syncing EPG');
        }
    };

    const handleRunInBackground = () => {
        stopPolling();
        setIsSyncModalOpen(false);
        toast.info('EPG sync continuing in background...', {
            description: 'Guide schedules and recording rules will update automatically.'
        });
        onUpdated();
        onClose();
    };

    const handleRefreshChannelsNow = async () => {
        setIsRefreshingChannels(true);
        try {
            const res = await fetch('/api/theater/iptv', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    libraryId: library.id,
                    resyncChannels: true,
                    streamUrl
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to refresh channels');

            toast.success(`Channels refreshed! (${data.channelCount || 0} channels updated)`);
            onUpdated();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Error refreshing channels');
        } finally {
            setIsRefreshingChannels(false);
        }
    };

    const handleDeleteProvider = async () => {
        if (!confirm(`Are you sure you want to delete IPTV provider "${library.name}"? This will permanently remove all of its channels, guide schedules, and shortlists.`)) {
            return;
        }
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/theater/libraries?id=${encodeURIComponent(library.id)}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to delete IPTV provider');
            }
            toast.success(`Provider "${library.name}" deleted`);
            onUpdated();
            onClose();
        } catch (err: any) {
            console.error('Delete provider error:', err);
            toast.error(err.message || 'Error deleting IPTV provider');
        } finally {
            setIsDeleting(false);
        }
    };

    const isSyncActive = syncProgress.status === 'downloading' || syncProgress.status === 'parsing' || syncProgress.status === 'saving' || syncProgress.status === 'scanning_rules';

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0b0c10] border border-zinc-800 rounded-[2.5rem] max-w-xl w-full p-6 sm:p-8 shadow-2xl relative space-y-6 text-zinc-100">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <Calendar size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">EPG &amp; Provider Settings</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Configure guide schedule, sync frequency, and channel sources</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Provider Name */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Provider Name</label>
                        <input
                            type="text"
                            value={providerName}
                            onChange={e => setProviderName(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-amber-500 outline-none"
                        />
                    </div>

                    {/* XMLTV EPG Guide URL */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                                <Calendar size={14} className="text-amber-400" />
                                XMLTV EPG Guide URL
                            </label>
                            {lastSyncDate && (
                                <span className="text-[11px] text-zinc-500 font-bold">
                                    Last synced: {lastSyncDate.toLocaleDateString()} {lastSyncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                        <input
                            type="text"
                            placeholder="http://example.com/xmltv.php?username=...&password=..."
                            value={epgUrl}
                            onChange={e => setEpgUrl(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 font-mono focus:border-amber-500 outline-none"
                        />

                        {/* Suggested EPG auto-fill button */}
                        {!epgUrl && suggestedEpg && (
                            <button
                                type="button"
                                onClick={() => setEpgUrl(suggestedEpg)}
                                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold transition-colors cursor-pointer text-left"
                            >
                                <span>⚡ Auto-detected XMLTV EPG from your Xtream link. Click to apply:</span>
                                <span className="underline truncate max-w-[240px]">{suggestedEpg}</span>
                            </button>
                        )}
                    </div>

                    {/* Auto Sync Schedule */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                                <Clock size={14} className="text-amber-400" />
                                Auto Sync Schedule
                            </label>
                            <span className="text-[11px] text-zinc-500">Automated background guide refresh</span>
                        </div>
                        <select
                            value={intervalHours}
                            onChange={e => setIntervalHours(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:border-amber-500 outline-none cursor-pointer"
                        >
                            <option value="0">Manual Only (Disabled)</option>
                            <option value="6">Every 6 Hours</option>
                            <option value="12">Every 12 Hours</option>
                            <option value="24">Every 24 Hours (Daily)</option>
                            <option value="48">Every 2 Days</option>
                            <option value="168">Every 7 Days (Weekly)</option>
                        </select>
                    </div>

                    {/* Stream Source Info */}
                    <div className="p-3 bg-zinc-950/60 rounded-2xl border border-zinc-900 space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-zinc-400">Stream Source:</span>
                            <span className="text-[11px] text-zinc-500 font-mono truncate max-w-[260px]">{streamUrl || 'Local file upload'}</span>
                        </div>
                    </div>
                </div>

                {/* Quick Actions: Sync Guide & Refresh Channels */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleTriggerManualSync}
                        disabled={!epgUrl.trim()}
                        className="p-3 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={14} />
                        Sync EPG Guide
                    </button>

                    <button
                        type="button"
                        onClick={handleRefreshChannelsNow}
                        disabled={isRefreshingChannels}
                        className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                        <Tv2 size={14} className={isRefreshingChannels ? 'animate-spin' : ''} />
                        {isRefreshingChannels ? 'Reloading...' : 'Reload Channels'}
                    </button>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-zinc-900 gap-3">
                    <button
                        type="button"
                        onClick={handleDeleteProvider}
                        disabled={isDeleting}
                        className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Permanently remove this IPTV provider and its channels"
                    >
                        <Trash2 size={14} />
                        <span>{isDeleting ? 'Deleting...' : 'Delete Provider'}</span>
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving || isDeleting}
                            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Progressive EPG Sync Modal with Run In Background Option ── */}
            {isSyncModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0e0e12] border border-amber-500/30 rounded-[2.5rem] max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 text-zinc-100 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                                    <RefreshCw size={20} className={isSyncActive ? 'animate-spin' : ''} />
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white">Syncing Guide Schedule</h4>
                                    <p className="text-xs text-zinc-400">XMLTV EPG &amp; DVR Rule Evaluation</p>
                                </div>
                            </div>
                            <span className="text-xs font-mono font-black text-amber-400">{syncProgress.progressPercent}%</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-2">
                            <div className="h-3 w-full bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-zinc-800">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                        syncProgress.status === 'error'
                                            ? 'bg-red-500'
                                            : syncProgress.status === 'completed'
                                            ? 'bg-emerald-500'
                                            : 'bg-gradient-to-r from-amber-500 to-amber-300'
                                    }`}
                                    style={{ width: `${Math.max(5, syncProgress.progressPercent)}%` }}
                                />
                            </div>
                            <p className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                                {isSyncActive && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
                                {syncProgress.message}
                            </p>
                        </div>

                        {/* Stats Summary */}
                        <div className="grid grid-cols-2 gap-3 p-4 bg-zinc-950 rounded-2xl border border-zinc-900">
                            <div className="space-y-0.5">
                                <span className="text-[11px] font-bold text-zinc-500 uppercase">Programmes</span>
                                <p className="text-base font-black text-white">{syncProgress.programCount.toLocaleString()}</p>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-[11px] font-bold text-zinc-500 uppercase">DVR Matches</span>
                                <p className="text-base font-black text-amber-400">{syncProgress.ruleMatchesCount}</p>
                            </div>
                        </div>

                        {/* Actions: Run in background vs close */}
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
                            {isSyncActive ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleRunInBackground}
                                        className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/20 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                        <Layers size={14} />
                                        Run in Background
                                    </button>
                                    <span className="text-[11px] text-zinc-500">Syncing live...</span>
                                </>
                            ) : syncProgress.status === 'completed' ? (
                                <div className="w-full flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsSyncModalOpen(false);
                                            onClose();
                                        }}
                                        className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                                    >
                                        Done
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setIsSyncModalOpen(false)}
                                        className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer"
                                    >
                                        Close
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

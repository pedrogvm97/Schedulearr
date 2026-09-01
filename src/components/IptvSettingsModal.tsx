'use client';

import React, { useState } from 'react';
import { X, Calendar, RefreshCw, Check, Copy, ExternalLink, Tv2, AlertCircle } from 'lucide-react';
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

export default function IptvSettingsModal({
    isOpen,
    onClose,
    library,
    onUpdated
}: IptvSettingsModalProps) {
    if (!isOpen || !library) return null;

    const streamUrl = library.folders?.[0] || '';
    const initialEpg = library.folders?.[1] || '';

    const [providerName, setProviderName] = useState(library.name);
    const [epgUrl, setEpgUrl] = useState(initialEpg);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncingEpg, setIsSyncingEpg] = useState(false);
    const [isRefreshingChannels, setIsRefreshingChannels] = useState(false);

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

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/theater/libraries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: library.id,
                    name: providerName.trim() || library.name,
                    folders: [streamUrl, epgUrl.trim()]
                })
            });

            if (!res.ok) throw new Error('Failed to update provider settings');

            toast.success('Provider settings updated!');
            onUpdated();
            onClose();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Error saving settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSyncEpgNow = async () => {
        if (!epgUrl.trim()) {
            toast.error('Please enter a valid XMLTV EPG URL first');
            return;
        }

        setIsSyncingEpg(true);
        try {
            const res = await fetch('/api/theater/iptv', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    libraryId: library.id,
                    epgUrl: epgUrl.trim()
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to sync EPG guide');

            toast.success(`EPG synced successfully! (${data.syncedEpgCount || 0} programmes loaded)`);
            onUpdated();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Error syncing EPG guide');
        } finally {
            setIsSyncingEpg(false);
        }
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

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-[#0b0c10] border border-zinc-800/90 rounded-[2rem] max-w-xl w-full p-6 sm:p-8 shadow-2xl relative space-y-6 text-zinc-100">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-white">EPG &amp; Provider Settings</h3>
                            <p className="text-xs text-zinc-500">Configure XMLTV guide and channel source for "{library.name}"</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Provider Name */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-400">Provider Name</label>
                        <input
                            type="text"
                            value={providerName}
                            onChange={e => setProviderName(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-500 outline-none"
                        />
                    </div>

                    {/* XMLTV EPG Guide URL */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                                <Calendar size={13} className="text-amber-400" />
                                XMLTV EPG Guide URL
                            </label>
                            <span className="text-[10px] text-zinc-500 font-semibold">Live TV schedules &amp; guide</span>
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

                    {/* Stream Source Info (Read-only or status) */}
                    <div className="p-3 bg-zinc-950/60 rounded-2xl border border-zinc-900 space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-zinc-400">Stream Source URL:</span>
                            <span className="text-[10px] text-zinc-600 font-mono truncate max-w-[240px]">{streamUrl || 'Local file'}</span>
                        </div>
                    </div>
                </div>

                {/* Quick Actions: Sync Guide & Refresh Channels */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleSyncEpgNow}
                        disabled={isSyncingEpg || !epgUrl.trim()}
                        className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/20 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={isSyncingEpg ? 'animate-spin' : ''} />
                        {isSyncingEpg ? 'Syncing Guide...' : 'Sync EPG Guide Now'}
                    </button>

                    <button
                        type="button"
                        onClick={handleRefreshChannelsNow}
                        disabled={isRefreshingChannels}
                        className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                        <Tv2 size={13} className={isRefreshingChannels ? 'animate-spin' : ''} />
                        {isRefreshingChannels ? 'Refreshing...' : 'Reload Channels'}
                    </button>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-900">
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
                        disabled={isSaving}
                        className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}

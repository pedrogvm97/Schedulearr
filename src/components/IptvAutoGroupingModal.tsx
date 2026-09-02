'use client';

import React, { useState, useMemo } from 'react';
import { X, Sparkles, Check, Trash2, Plus, Search, Layers, ChevronRight, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface StreamItem {
    url: string;
    quality: string;
    label: string;
}

export interface IptvChannel {
    id: string;
    name: string;
    cleanName?: string;
    logo?: string;
    group: string;
    tvgId?: string;
    url: string;
    streams?: StreamItem[];
}

interface AutoGroupItem {
    key: string;
    suggestedName: string;
    primaryChannelId: string;
    channels: IptvChannel[];
    selected: boolean;
}

interface IptvAutoGroupingModalProps {
    isOpen: boolean;
    onClose: () => void;
    libraryId: string;
    channels: IptvChannel[];
    onApplied: () => void;
}

function cleanChannelTitle(name: string): string {
    return name
        .replace(/\b(8k|4k|uhd|fhd|hd|sd|hevc|h\.?265|1080p|720p|576p|480p|2160p|50fps|60fps|raw|hq|lq|vip|backup|alt|feed)\b/gi, '')
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/[|\-_:]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export default function IptvAutoGroupingModal({
    isOpen,
    onClose,
    libraryId,
    channels,
    onApplied
}: IptvAutoGroupingModalProps) {
    if (!isOpen) return null;

    // Detect clusters of 2 or more channels that share the same cleaned base name
    const initialGroups = useMemo<AutoGroupItem[]>(() => {
        const clusterMap = new Map<string, IptvChannel[]>();

        for (const c of channels) {
            const cleaned = cleanChannelTitle(c.cleanName || c.name);
            if (!cleaned || cleaned.length < 2) continue;

            const normKey = `${c.group.toLowerCase()}:::${cleaned.toLowerCase()}`;
            if (!clusterMap.has(normKey)) {
                clusterMap.set(normKey, []);
            }
            clusterMap.get(normKey)!.push(c);
        }

        const groups: AutoGroupItem[] = [];

        clusterMap.forEach((chanList, key) => {
            if (chanList.length >= 2) {
                // Quality sort to pick best master channel
                const qualityRank = (c: IptvChannel) => {
                    const q = (c.streams?.[0]?.quality || '').toLowerCase();
                    if (q.includes('8k')) return 5;
                    if (q.includes('4k') || q.includes('uhd')) return 4;
                    if (q.includes('fhd') || q.includes('1080')) return 3;
                    if (q.includes('hd') || q.includes('720')) return 2;
                    return 1;
                };

                const sorted = [...chanList].sort((a, b) => qualityRank(b) - qualityRank(a));
                const primary = sorted[0];
                const suggested = cleanChannelTitle(primary.cleanName || primary.name) || primary.name;

                groups.push({
                    key,
                    suggestedName: suggested,
                    primaryChannelId: primary.id,
                    channels: sorted,
                    selected: true
                });
            }
        });

        return groups.sort((a, b) => b.channels.length - a.channels.length);
    }, [channels]);

    const [groups, setGroups] = useState<AutoGroupItem[]>(initialGroups);
    const [searchFilter, setSearchFilter] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [addingToGroupKey, setAddingToGroupKey] = useState<string | null>(null);
    const [manualAddSearch, setManualAddSearch] = useState('');

    // Filter displayed groups
    const filteredGroups = useMemo(() => {
        if (!searchFilter.trim()) return groups;
        const q = searchFilter.toLowerCase().trim();
        return groups.filter(g =>
            g.suggestedName.toLowerCase().includes(q) ||
            g.channels.some(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
        );
    }, [groups, searchFilter]);

    const selectedGroups = useMemo(() => groups.filter(g => g.selected), [groups]);
    const totalChannelsToMerge = useMemo(() => {
        return selectedGroups.reduce((acc, g) => acc + g.channels.length, 0);
    }, [selectedGroups]);

    const toggleSelectAll = (select: boolean) => {
        setGroups(prev => prev.map(g => ({ ...g, selected: select })));
    };

    const toggleGroupSelected = (key: string) => {
        setGroups(prev => prev.map(g => g.key === key ? { ...g, selected: !g.selected } : g));
    };

    const updateGroupName = (key: string, name: string) => {
        setGroups(prev => prev.map(g => g.key === key ? { ...g, suggestedName: name } : g));
    };

    const removeChannelFromGroup = (groupKey: string, channelId: string) => {
        setGroups(prev => prev.map(g => {
            if (g.key !== groupKey) return g;
            const remaining = g.channels.filter(c => c.id !== channelId);
            const newPrimary = g.primaryChannelId === channelId ? (remaining[0]?.id || '') : g.primaryChannelId;
            return {
                ...g,
                channels: remaining,
                primaryChannelId: newPrimary
            };
        }).filter(g => g.channels.length >= 2)); // keep only if at least 2 remaining
    };

    const addChannelToGroup = (groupKey: string, channel: IptvChannel) => {
        setGroups(prev => prev.map(g => {
            if (g.key !== groupKey) return g;
            if (g.channels.some(c => c.id === channel.id)) return g;
            return {
                ...g,
                channels: [...g.channels, channel]
            };
        }));
        setAddingToGroupKey(null);
        setManualAddSearch('');
    };

    // Candidates for manual channel addition
    const candidateChannels = useMemo(() => {
        if (!manualAddSearch.trim()) return [];
        const q = manualAddSearch.toLowerCase().trim();
        return channels
            .filter(c => c.name.toLowerCase().includes(q) || (c.cleanName && c.cleanName.toLowerCase().includes(q)))
            .slice(0, 15);
    }, [channels, manualAddSearch]);

    const handleApplyMerges = async (targetGroups?: AutoGroupItem[]) => {
        const toProcess = targetGroups || selectedGroups;
        if (toProcess.length === 0) {
            toast.error('No groups selected to merge');
            return;
        }

        const batchMerges = toProcess.map(g => ({
            primaryChannelId: g.primaryChannelId,
            channelsToMergeIds: g.channels.map(c => c.id).filter(id => id !== g.primaryChannelId),
            newName: g.suggestedName
        })).filter(m => m.channelsToMergeIds.length > 0);

        setIsApplying(true);
        try {
            const res = await fetch('/api/theater/iptv/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    libraryId,
                    batchMerges
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to merge channels');

            toast.success(`Merged ${data.mergedChannelsCount || 0} channels into ${data.mergedGroupsCount || 0} multi-source channels!`);
            onApplied();
            onClose();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Error merging channels');
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-[#0b0c10] border border-amber-500/30 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] flex flex-col text-zinc-100">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-zinc-900 pb-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white flex items-center gap-2">
                                Auto-group ({groups.length} Groups)
                            </h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Combines same-name channels across stream qualities (4K, 1080p, 720p, SD). Review or edit before saving.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search & Bulk Control Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Filter suggestions by channel name..."
                            value={searchFilter}
                            onChange={e => setSearchFilter(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500 transition-colors"
                        />
                        {searchFilter && (
                            <button
                                type="button"
                                onClick={() => setSearchFilter('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5 cursor-pointer"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold shrink-0">
                        <button
                            type="button"
                            onClick={() => toggleSelectAll(true)}
                            className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-500/20 cursor-pointer"
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleSelectAll(false)}
                            className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 cursor-pointer"
                        >
                            Deselect All
                        </button>
                    </div>
                </div>

                {/* Groups Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 min-h-[300px]">
                    {filteredGroups.length === 0 ? (
                        <div className="p-12 text-center bg-zinc-950 rounded-2xl border border-zinc-900 text-zinc-500 space-y-2">
                            <p className="text-sm font-bold text-white">No multi-source channel groups found</p>
                            <p className="text-xs">All channels currently in your library appear to be unique.</p>
                        </div>
                    ) : (
                        filteredGroups.map(group => {
                            const isAdding = addingToGroupKey === group.key;
                            return (
                                <div
                                    key={group.key}
                                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                                        group.selected
                                            ? 'bg-zinc-950 border-amber-500/40 shadow-lg shadow-amber-500/5'
                                            : 'bg-zinc-950/60 border-zinc-800/80 opacity-60'
                                    }`}
                                >
                                    {/* Group Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                                            <input
                                                type="checkbox"
                                                checked={group.selected}
                                                onChange={() => toggleGroupSelected(group.key)}
                                                className="w-4 h-4 rounded text-amber-500 focus:ring-0 cursor-pointer"
                                            />
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={group.suggestedName}
                                                    onChange={e => updateGroupName(group.key, e.target.value)}
                                                    className="w-full bg-zinc-900 border border-zinc-700/80 focus:border-amber-500 rounded-lg px-3 py-1 text-sm font-black text-white outline-none"
                                                    title="Click to rename master channel"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase">
                                                ⚡ {group.channels.length} Sources
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleApplyMerges([group])}
                                                disabled={isApplying}
                                                className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-amber-500 hover:text-black text-zinc-300 border border-zinc-700 text-xs font-bold transition-all cursor-pointer"
                                            >
                                                Merge This
                                            </button>
                                        </div>
                                    </div>

                                    {/* Sources Chips List */}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {group.channels.map(chan => {
                                            const quality = chan.streams?.[0]?.quality || 'SD';
                                            const isMaster = chan.id === group.primaryChannelId;
                                            return (
                                                <div
                                                    key={chan.id}
                                                    className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
                                                        isMaster
                                                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                                            : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                    }`}
                                                >
                                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/50 font-black text-white">
                                                        {quality}
                                                    </span>
                                                    <span className="font-bold truncate max-w-[160px]">{chan.name}</span>
                                                    {isMaster && (
                                                        <span className="text-[9px] uppercase font-black tracking-wider text-amber-400 bg-amber-500/20 px-1 rounded">
                                                            Primary
                                                        </span>
                                                    )}
                                                    {group.channels.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeChannelFromGroup(group.key, chan.id)}
                                                            className="text-zinc-500 hover:text-red-400 p-0.5 transition-colors cursor-pointer"
                                                            title="Remove source from this group"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Add Channel to Group Button */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAddingToGroupKey(isAdding ? null : group.key);
                                                setManualAddSearch('');
                                            }}
                                            className="px-2.5 py-1.5 rounded-xl border border-dashed border-zinc-700 hover:border-amber-400 hover:text-amber-400 text-zinc-400 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                                        >
                                            <Plus size={12} /> Add Source
                                        </button>
                                    </div>

                                    {/* Inline Channel Picker when "Add Source" is clicked */}
                                    {isAdding && (
                                        <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-2 animate-in fade-in duration-150">
                                            <div className="flex items-center gap-2">
                                                <Search size={12} className="text-zinc-500" />
                                                <input
                                                    type="text"
                                                    placeholder="Search channel to add to this group..."
                                                    value={manualAddSearch}
                                                    onChange={e => setManualAddSearch(e.target.value)}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => setAddingToGroupKey(null)}
                                                    className="p-1 text-zinc-500 hover:text-white"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>

                                            {candidateChannels.length > 0 && (
                                                <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                                                    {candidateChannels.map(cand => (
                                                        <div
                                                            key={cand.id}
                                                            onClick={() => addChannelToGroup(group.key, cand)}
                                                            className="p-2 bg-zinc-950 hover:bg-zinc-800 rounded-lg text-xs font-bold flex items-center justify-between cursor-pointer transition-colors"
                                                        >
                                                            <span className="text-white truncate">{cand.name}</span>
                                                            <span className="text-[10px] text-zinc-500 font-normal">{cand.group}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-900">
                    <div className="text-xs text-zinc-400 font-bold">
                        <span className="text-amber-400">{selectedGroups.length}</span> of {groups.length} groups selected
                        <span className="text-zinc-600 font-normal"> ({totalChannelsToMerge} channels total)</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyMerges()}
                            disabled={isApplying || selectedGroups.length === 0}
                            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                            <Layers size={14} />
                            {isApplying ? 'Merging...' : `Apply ${selectedGroups.length} Group Merges`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

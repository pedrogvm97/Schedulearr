'use client';

import React, { useState } from 'react';
import {
    X, Layers, Plus, ArrowUp, ArrowDown, Trash2, CheckCircle2,
    Radio, Play, AlertCircle, Zap, Search
} from 'lucide-react';
import { toast } from 'sonner';

interface StreamSource {
    url: string;
    quality: string;
    label: string;
}

interface IptvChannelSourcesModalProps {
    isOpen: boolean;
    channel: any;
    libraryId: string;
    allChannels: any[];
    onClose: () => void;
    onChannelUpdated: (updatedChannel: any) => void;
}

const QUALITY_OPTIONS = [
    { id: '8K', label: '8K UHD' },
    { id: '4K', label: '4K UHD' },
    { id: '1080p', label: 'FHD (1080p)' },
    { id: '720p', label: 'HD (720p)' },
    { id: 'SD', label: 'SD (576p/480p)' },
    { id: 'HEVC', label: 'HEVC (H.265)' },
    { id: 'Custom', label: 'Custom' }
];

export function IptvChannelSourcesModal({
    isOpen,
    channel,
    libraryId,
    allChannels,
    onClose,
    onChannelUpdated
}: IptvChannelSourcesModalProps) {
    const [streams, setStreams] = useState<StreamSource[]>(() => {
        if (channel?.streams && Array.isArray(channel.streams) && channel.streams.length > 0) {
            return [...channel.streams];
        }
        return [{ url: channel?.url || '', quality: channel?.quality || 'SD', label: channel?.label || 'Primary Stream' }];
    });

    const [isAddingCustom, setIsAddingCustom] = useState(false);
    const [newStreamUrl, setNewStreamUrl] = useState('');
    const [newStreamQuality, setNewStreamQuality] = useState('1080p');
    const [newStreamLabel, setNewStreamLabel] = useState('');

    const [isMergingOther, setIsMergingOther] = useState(false);
    const [mergeSearch, setMergeSearch] = useState('');
    const [selectedMergeChanIds, setSelectedMergeChanIds] = useState<string[]>([]);

    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen || !channel) return null;

    // Move priority up
    const handleMoveUp = (index: number) => {
        if (index <= 0) return;
        setStreams(prev => {
            const copy = [...prev];
            const temp = copy[index - 1];
            copy[index - 1] = copy[index];
            copy[index] = temp;
            return copy;
        });
    };

    // Move priority down
    const handleMoveDown = (index: number) => {
        if (index >= streams.length - 1) return;
        setStreams(prev => {
            const copy = [...prev];
            const temp = copy[index + 1];
            copy[index + 1] = copy[index];
            copy[index] = temp;
            return copy;
        });
    };

    // Remove a stream
    const handleRemoveStream = (index: number) => {
        if (streams.length <= 1) {
            toast.error('Channels must have at least 1 stream source');
            return;
        }
        setStreams(prev => prev.filter((_, i) => i !== index));
    };

    // Add manual custom stream
    const handleAddCustomStream = () => {
        if (!newStreamUrl.trim()) {
            toast.error('Please enter a stream URL');
            return;
        }
        const qualityObj = QUALITY_OPTIONS.find(q => q.id === newStreamQuality);
        const label = newStreamLabel.trim() || `${qualityObj?.label || newStreamQuality} (Secondary)`;
        setStreams(prev => [
            ...prev,
            {
                url: newStreamUrl.trim(),
                quality: newStreamQuality,
                label
            }
        ]);
        setNewStreamUrl('');
        setNewStreamLabel('');
        setIsAddingCustom(false);
        toast.success('Secondary stream source added with priority!');
    };

    // Merge selected existing channels into this channel
    const handleApplyMergeChannels = () => {
        if (selectedMergeChanIds.length === 0) return;
        const channelsToMerge = allChannels.filter(c => selectedMergeChanIds.includes(c.id));
        const newStreamsToAdd: StreamSource[] = [];

        channelsToMerge.forEach(c => {
            if (c.streams && Array.isArray(c.streams)) {
                c.streams.forEach((s: StreamSource) => {
                    if (!streams.some(existing => existing.url === s.url)) {
                        newStreamsToAdd.push({
                            url: s.url,
                            quality: s.quality || 'SD',
                            label: s.label || `${s.quality} (${c.name})`
                        });
                    }
                });
            } else if (c.url && !streams.some(existing => existing.url === c.url)) {
                newStreamsToAdd.push({
                    url: c.url,
                    quality: c.quality || 'SD',
                    label: `${c.quality || 'SD'} (${c.name})`
                });
            }
        });

        setStreams(prev => [...prev, ...newStreamsToAdd]);
        setSelectedMergeChanIds([]);
        setIsMergingOther(false);
        toast.success(`Merged ${newStreamsToAdd.length} stream sources into ${channel.name}!`);
    };

    // Save changes to server
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/theater/iptv/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    libraryId,
                    primaryChannelId: channel.id,
                    reorderedStreams: streams
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Stream priorities updated for "${channel.name}"!`);
                onChannelUpdated({
                    ...channel,
                    streams
                });
                onClose();
            } else {
                toast.error('Failed to save channel stream configuration');
            }
        } catch {
            toast.error('Error saving stream configuration');
        } finally {
            setIsSaving(false);
        }
    };

    const getQualityBadgeColor = (q: string) => {
        const lower = (q || '').toLowerCase();
        if (lower.includes('8k')) return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
        if (lower.includes('4k') || lower.includes('uhd')) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
        if (lower.includes('fhd') || lower.includes('1080')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
        if (lower.includes('hd') || lower.includes('720')) return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    };

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0c0c0e] border border-amber-500/30 rounded-[2.5rem] w-full max-w-2xl p-6 sm:p-8 shadow-2xl relative space-y-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
                {/* Close button */}
                <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                >
                    <X size={20} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3.5 pb-2 border-b border-zinc-900">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
                        <Zap size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white flex items-center gap-2">
                            Stream Sources &amp; Priority Fallback
                        </h2>
                        <p className="text-xs text-zinc-400 font-medium mt-0.5">
                            Channel: <span className="text-white font-bold">{channel.name}</span> ({channel.group})
                        </p>
                    </div>
                </div>

                {/* Stream Hierarchy Info Banner */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
                    <span className="text-base">⚡</span>
                    <div>
                        <strong className="text-amber-300 block font-black uppercase text-[11px] tracking-wider mb-0.5">
                            Automatic Priority Fallback
                        </strong>
                        Streams are tried in priority order (1 &rarr; 2 &rarr; 3...). If a higher-tier stream (e.g. 8K or 4K) buffers or drops offline, the player immediately switches to the next available backup without interrupting playback.
                    </div>
                </div>

                {/* Active Stream Sources List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                            Configured Stream Sources ({streams.length})
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAddingCustom(!isAddingCustom);
                                    setIsMergingOther(false);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-white flex items-center gap-1 transition-all"
                            >
                                <Plus size={12} /> Add Stream URL
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMergingOther(!isMergingOther);
                                    setIsAddingCustom(false);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-300 flex items-center gap-1 transition-all"
                            >
                                <Layers size={12} /> Merge Other Channels
                            </button>
                        </div>
                    </div>

                    {/* Add Custom Stream Form */}
                    {isAddingCustom && (
                        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3 animate-in fade-in duration-200">
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">
                                Add Direct Stream URL to {channel.name}
                            </h4>
                            <input
                                type="text"
                                placeholder="http://server.domain:port/live/user/pass/stream.m3u8"
                                value={newStreamUrl}
                                onChange={e => setNewStreamUrl(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 font-mono outline-none focus:border-amber-500"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase">Quality Tier</label>
                                    <select
                                        value={newStreamQuality}
                                        onChange={e => setNewStreamQuality(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 font-bold"
                                    >
                                        {QUALITY_OPTIONS.map(q => (
                                            <option key={q.id} value={q.id}>{q.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase">Custom Label (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 4K HDR Secondary"
                                        value={newStreamLabel}
                                        onChange={e => setNewStreamLabel(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsAddingCustom(false)}
                                    className="px-4 py-2 rounded-xl bg-zinc-900 text-xs font-bold text-zinc-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAddCustomStream}
                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider"
                                >
                                    Add Stream
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Merge Other Channels Form */}
                    {isMergingOther && (
                        <div className="p-4 rounded-2xl bg-zinc-950 border border-amber-500/30 space-y-3 animate-in fade-in duration-200">
                            <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider">
                                Select Channels to Merge into {channel.name}
                            </h4>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                                <input
                                    type="text"
                                    placeholder="Search channels (e.g. RTP 1, Sport TV, HBO)..."
                                    value={mergeSearch}
                                    onChange={e => setMergeSearch(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                {allChannels
                                    .filter(c => c.id !== channel.id && (!mergeSearch.trim() || c.name.toLowerCase().includes(mergeSearch.toLowerCase()) || c.group.toLowerCase().includes(mergeSearch.toLowerCase())))
                                    .map(c => {
                                        const isSelected = selectedMergeChanIds.includes(c.id);
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedMergeChanIds(selectedMergeChanIds.filter(id => id !== c.id));
                                                    } else {
                                                        setSelectedMergeChanIds([...selectedMergeChanIds, c.id]);
                                                    }
                                                }}
                                                className={`w-full p-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between ${
                                                    isSelected
                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                                        : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-300 border border-zinc-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                                        isSelected ? 'bg-amber-500 border-amber-400 text-black' : 'border-zinc-700'
                                                    }`}>
                                                        {isSelected && <CheckCircle2 size={12} />}
                                                    </div>
                                                    <span className="truncate">{c.name}</span>
                                                </div>
                                                <span className="text-[10px] text-zinc-500 shrink-0 ml-2">{c.group}</span>
                                            </button>
                                        );
                                    })}
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsMergingOther(false)}
                                    className="px-4 py-2 rounded-xl bg-zinc-900 text-xs font-bold text-zinc-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={selectedMergeChanIds.length === 0}
                                    onClick={handleApplyMergeChannels}
                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider disabled:opacity-50"
                                >
                                    Merge {selectedMergeChanIds.length} Channel(s)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stream Sources Ordered List */}
                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                        {streams.map((stream, idx) => (
                            <div
                                key={idx}
                                className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                    idx === 0
                                        ? 'bg-amber-500/10 border-amber-500/30'
                                        : 'bg-zinc-950/70 border-zinc-800'
                                }`}
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    {/* Priority Badge */}
                                    <div className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${
                                        idx === 0 ? 'bg-amber-500 text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                                    }`}>
                                        #{idx + 1} {idx === 0 ? 'PRIMARY' : 'BACKUP'}
                                    </div>

                                    {/* Quality Badge */}
                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border shrink-0 ${getQualityBadgeColor(stream.quality)}`}>
                                        {stream.quality}
                                    </span>

                                    {/* Label & URL */}
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-xs font-bold text-white truncate">
                                            {stream.label || `Stream #${idx + 1}`}
                                        </h4>
                                        <p className="text-[10px] text-zinc-500 font-mono truncate">
                                            {stream.url}
                                        </p>
                                    </div>
                                </div>

                                {/* Reorder & Action Controls */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => handleMoveUp(idx)}
                                        title="Move Priority Up"
                                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                                    >
                                        <ArrowUp size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={idx === streams.length - 1}
                                        onClick={() => handleMoveDown(idx)}
                                        title="Move Priority Down"
                                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                                    >
                                        <ArrowDown size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={streams.length <= 1}
                                        onClick={() => handleRemoveStream(idx)}
                                        title="Remove Stream"
                                        className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white disabled:opacity-30 transition-colors ml-1"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Save / Cancel */}
                <div className="flex gap-3 pt-3 border-t border-zinc-900">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleSave}
                        className="flex-[2] h-12 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-95"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                <span>Saving Priorities...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} />
                                <span>Save Priority Order</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

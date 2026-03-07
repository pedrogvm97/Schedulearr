'use client';

import React, { useState } from 'react';
import { X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Instance {
    id: string;
    name: string;
    type: string;
    color?: string;
}

interface Props {
    instances: Instance[];
    onClose: () => void;
    onCreated: () => void;
}

// Standard Radarr/Sonarr quality source IDs
const QUALITY_GROUPS = [
    {
        label: '4K / 2160p',
        color: 'text-violet-400 border-violet-500/20 bg-violet-500/5',
        items: [
            { id: 18, name: 'Remux-2160p', desc: 'Lossless 4K Blu-ray remux' },
            { id: 19, name: 'Bluray-2160p', desc: 'Blu-ray encoded in 4K' },
            { id: 17, name: 'WEB 2160p', desc: '4K from streaming (NF, AMZN…)' },
            { id: 16, name: 'HDTV-2160p', desc: '4K broadcast rip' },
        ],
    },
    {
        label: '1080p',
        color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
        items: [
            { id: 30, name: 'Remux-1080p', desc: 'Lossless 1080p Blu-ray remux' },
            { id: 27, name: 'Bluray-1080p', desc: 'Blu-ray encoded 1080p' },
            { id: 3, name: 'WEB 1080p', desc: '1080p from streaming services' },
            { id: 9, name: 'HDTV-1080p', desc: '1080p broadcast rip' },
        ],
    },
    {
        label: '720p',
        color: 'text-sky-400 border-sky-500/20 bg-sky-500/5',
        items: [
            { id: 6, name: 'Bluray-720p', desc: 'Blu-ray encoded 720p' },
            { id: 5, name: 'WEB 720p', desc: '720p from streaming' },
            { id: 7, name: 'HDTV-720p', desc: '720p broadcast rip' },
        ],
    },
    {
        label: 'SD',
        color: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
        items: [
            { id: 2, name: 'DVD', desc: 'DVD rip (480p/576p)' },
            { id: 1, name: 'SDTV', desc: 'Standard-def broadcast' },
        ],
    },
    {
        label: 'Other',
        color: 'text-zinc-400 border-zinc-700 bg-zinc-900/30',
        items: [
            { id: 23, name: 'WEBRip-2160p', desc: 'WEBRip 2160p (re-encoded stream)' },
            { id: 25, name: 'WEBRip-1080p', desc: 'WEBRip 1080p' },
            { id: 26, name: 'WEBRip-720p', desc: 'WEBRip 720p' },
        ],
    },
];

const ALL_QUALITY_IDS = QUALITY_GROUPS.flatMap(g => g.items.map(i => i.id));
const CUTOFF_OPTIONS = [
    { id: 0, name: 'Any (no cutoff)' },
    { id: 27, name: 'Bluray-1080p' },
    { id: 3, name: 'WEB 1080p' },
    { id: 30, name: 'Remux-1080p' },
    { id: 19, name: 'Bluray-2160p' },
    { id: 18, name: 'Remux-2160p' },
    { id: 17, name: 'WEB 2160p' },
];

export function CreateProfileModal({ instances, onClose, onCreated }: Props) {
    const [name, setName] = useState('');
    const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
    const [upgradeAllowed, setUpgradeAllowed] = useState(true);
    const [cutoff, setCutoff] = useState(0);
    const [enabledQuality, setEnabledQuality] = useState<Set<number>>(
        new Set([3, 5, 6, 7, 9, 17, 27, 30]) // sensible defaults: WEB + 1080p + 720p
    );
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['4K / 2160p', '1080p', '720p']));
    const [saving, setSaving] = useState(false);

    const toggleInstance = (id: string) => {
        setSelectedInstances(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleQuality = (id: number) => {
        setEnabledQuality(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleGroup = (label: string, ids: number[]) => {
        const allEnabled = ids.every(id => enabledQuality.has(id));
        setEnabledQuality(prev => {
            const next = new Set(prev);
            if (allEnabled) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
        });
    };

    const toggleExpandGroup = (label: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label); else next.add(label);
            return next;
        });
    };

    const handleCreate = async () => {
        if (!name.trim()) return toast.error('Please enter a profile name');
        if (selectedInstances.length === 0) return toast.error('Select at least one instance');
        if (enabledQuality.size === 0) return toast.error('Enable at least one quality source');

        setSaving(true);
        const t = toast.loading(`Creating in ${selectedInstances.length} instance(s)…`);

        // Build the items array: enabled ones get allowed=true, rest allowed=false
        const items = ALL_QUALITY_IDS.map(id => ({
            quality: { id },
            allowed: enabledQuality.has(id),
        }));

        try {
            const results = await Promise.all(selectedInstances.map(instId =>
                fetch('/api/profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceId: instId,
                        profile: { name: name.trim(), upgradeAllowed, cutoff, items },
                    }),
                })
            ));

            const anyFailed = results.some(r => !r.ok);
            if (anyFailed) {
                toast.error('Some profiles failed to create', { id: t });
            } else {
                toast.success('Profiles created!', { id: t });
                onCreated();
            }
        } catch {
            toast.error('Error creating profiles', { id: t });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0a0a0a] border border-zinc-800 rounded-[2.5rem] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-[0_40px_80px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-900/70 flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-white">Create Quality Profile</h2>
                        <p className="text-[11px] text-zinc-500 font-medium mt-0.5 uppercase tracking-widest">Configure quality sources, cutoff, and instances</p>
                    </div>
                    <button onClick={onClose} className="p-2.5 hover:bg-zinc-900 rounded-2xl transition-colors text-zinc-500 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-8 py-6 space-y-7 custom-scrollbar">

                    {/* Profile Name */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Profile Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Ultra HD Premium"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all placeholder:text-zinc-700"
                        />
                    </div>

                    {/* Instances */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Target Instances</label>
                            <button onClick={() => setSelectedInstances(selectedInstances.length === instances.length ? [] : instances.map(i => i.id))} className="text-[9px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400">
                                {selectedInstances.length === instances.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {instances.map(inst => {
                                const on = selectedInstances.includes(inst.id);
                                return (
                                    <button
                                        key={inst.id}
                                        onClick={() => toggleInstance(inst.id)}
                                        className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${on ? 'bg-emerald-500/8 border-emerald-500/30' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
                                    >
                                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${on ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-700'}`}>
                                            {on && <Check size={10} className="text-black" strokeWidth={3} />}
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-zinc-200">{inst.name}</div>
                                            <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{inst.type}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Quality Sources */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Quality Sources</label>
                            <button onClick={() => setEnabledQuality(new Set(enabledQuality.size === ALL_QUALITY_IDS.length ? [] : ALL_QUALITY_IDS))} className="text-[9px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400">
                                {enabledQuality.size === ALL_QUALITY_IDS.length ? 'Disable All' : 'Enable All'}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {QUALITY_GROUPS.map(group => {
                                const allOn = group.items.every(i => enabledQuality.has(i.id));
                                const someOn = group.items.some(i => enabledQuality.has(i.id));
                                const expanded = expandedGroups.has(group.label);
                                return (
                                    <div key={group.label} className="border border-zinc-900 rounded-2xl overflow-hidden">
                                        {/* Group Header */}
                                        <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/60">
                                            <button
                                                onClick={() => toggleGroup(group.label, group.items.map(i => i.id))}
                                                className={`flex items-center gap-2.5 text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-all ${allOn ? group.color : someOn ? 'text-zinc-400 border-zinc-700 bg-zinc-900/50' : 'text-zinc-600 border-transparent'}`}
                                            >
                                                <div className={`w-2 h-2 rounded-full ${allOn ? 'bg-current' : someOn ? 'bg-zinc-500' : 'bg-zinc-700'}`} />
                                                {group.label}
                                                <span className="text-[9px] opacity-60 font-normal">({group.items.filter(i => enabledQuality.has(i.id)).length}/{group.items.length})</span>
                                            </button>
                                            <button onClick={() => toggleExpandGroup(group.label)} className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors">
                                                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>
                                        </div>
                                        {/* Group Items */}
                                        {expanded && (
                                            <div className="divide-y divide-zinc-900/50">
                                                {group.items.map(item => {
                                                    const on = enabledQuality.has(item.id);
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => toggleQuality(item.id)}
                                                            className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-all hover:bg-zinc-900/40 ${on ? 'bg-zinc-900/20' : ''}`}
                                                        >
                                                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${on ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-700 bg-black'}`}>
                                                                {on && <Check size={10} className="text-black" strokeWidth={3} />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`text-xs font-bold ${on ? 'text-white' : 'text-zinc-500'}`}>{item.name}</div>
                                                                <div className="text-[9px] text-zinc-600 font-medium">{item.desc}</div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Cutoff + Upgrade */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Cutoff */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Upgrade Until (Cutoff)</label>
                            <select
                                value={cutoff}
                                onChange={e => setCutoff(Number(e.target.value))}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all appearance-none"
                            >
                                {CUTOFF_OPTIONS.map(o => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Upgrade Allowed */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Upgrade Allowed</label>
                            <button
                                onClick={() => setUpgradeAllowed(v => !v)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${upgradeAllowed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}
                            >
                                <span className="text-xs font-black uppercase tracking-widest">{upgradeAllowed ? 'YES' : 'NO'}</span>
                                <div className={`w-2 h-2 rounded-full transition-all ${upgradeAllowed ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-8 py-6 border-t border-zinc-900/70 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 font-black text-xs uppercase tracking-widest transition-all">
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={saving}
                        className="flex-1 py-3.5 rounded-2xl bg-white text-black hover:bg-emerald-400 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Creating…' : 'Create Profile'}
                    </button>
                </div>
            </div>
        </div>
    );
}

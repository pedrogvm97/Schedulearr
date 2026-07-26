'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';

interface IndexerRule {
    id: string;
    indexer_id: number;
    prowlarr_instance_id: string;
    name: string;
    max_snatches: number | null;
    max_size_bytes: number | null;
    interval: 'daily' | 'weekly' | 'monthly';
    current_snatches: number;
    current_size_bytes: number;
    last_reset: string;
    auto_manage: boolean;
}

interface Indexer {
    id: number;
    name: string;
    enable: boolean;
    status: number;
    prowlarr_name: string;
    prowlarr_instance_id: string;
    prowlarr_color?: string;
    rule: IndexerRule | null;
}

const tailwindToHex = (twClass: string) => {
    if (!twClass) return '#3b82f6';
    if (twClass.startsWith('#')) return twClass;
    if (twClass.includes('slate')) return '#64748b';
    if (twClass.includes('gray')) return '#6b7280';
    if (twClass.includes('zinc')) return '#71717a';
    if (twClass.includes('neutral')) return '#737373';
    if (twClass.includes('stone')) return '#78716c';
    if (twClass.includes('red')) return '#ef4444';
    if (twClass.includes('orange')) return '#f97316';
    if (twClass.includes('amber')) return '#f59e0b';
    if (twClass.includes('yellow')) return '#eab308';
    if (twClass.includes('lime')) return '#84cc16';
    if (twClass.includes('green')) return '#22c55e';
    if (twClass.includes('emerald')) return '#10b981';
    if (twClass.includes('teal')) return '#14b8a6';
    if (twClass.includes('cyan')) return '#06b6d4';
    if (twClass.includes('sky')) return '#0ea5e9';
    if (twClass.includes('blue')) return '#3b82f6';
    if (twClass.includes('indigo')) return '#6366f1';
    if (twClass.includes('violet')) return '#8b5cf6';
    if (twClass.includes('purple')) return '#a855f7';
    if (twClass.includes('fuchsia')) return '#d946ef';
    if (twClass.includes('pink')) return '#ec4899';
    if (twClass.includes('rose')) return '#f43f5e';
    return '#3b82f6';
};

export function IndexersPanel() {
    const [indexers, setIndexers] = useState<Indexer[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIndexer, setSelectedIndexer] = useState<Indexer | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [isGlobalMode, setIsGlobalMode] = useState(false);

    // Form State
    const [formSnatches, setFormSnatches] = useState<string>('');
    const [formSizeGB, setFormSizeGB] = useState<string>('');
    const [formInterval, setFormInterval] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

    useEffect(() => {
        fetchIndexers();
    }, []);

    const fetchIndexers = async () => {
        try {
            const res = await axios.get('/api/prowlarr/indexers');
            setIndexers(res.data);
        } catch (e) {
            toast.error('Failed to load Prowlarr indexers');
        } finally {
            setLoading(false);
        }
    };

    const toggleIndexer = async (indexer: Indexer) => {
        const originalState = indexer.enable;

        setIndexers(prev => prev.map(i =>
            i.id === indexer.id && i.prowlarr_instance_id === indexer.prowlarr_instance_id ? { ...i, enable: !originalState } : i
        ));

        try {
            await axios.put(`/api/prowlarr/indexers/${indexer.id}`, {
                instanceId: indexer.prowlarr_instance_id,
                enable: !originalState
            });
            toast.success(`${indexer.name} turned ${!originalState ? 'ON' : 'OFF'}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error || `Failed to toggle ${indexer.name}`);
            setIndexers(prev => prev.map(i =>
                i.id === indexer.id && i.prowlarr_instance_id === indexer.prowlarr_instance_id ? { ...i, enable: originalState } : i
            ));
        }
    };

    const openConfigModal = (indexer: Indexer | 'global') => {
        if (indexer === 'global') {
            setIsGlobalMode(true);
            setSelectedIndexer(null);
            setFormSnatches('');
            setFormSizeGB('');
            setFormInterval('monthly');
            setShowModal(true);
            return;
        }

        setIsGlobalMode(false);
        setSelectedIndexer(indexer);
        if (indexer.rule) {
            setFormSnatches(indexer.rule.max_snatches ? indexer.rule.max_snatches.toString() : '');
            setFormSizeGB(indexer.rule.max_size_bytes ? (indexer.rule.max_size_bytes / (1024 ** 3)).toString() : '');
            setFormInterval(indexer.rule.interval);
        } else {
            setFormSnatches('');
            setFormSizeGB('');
            setFormInterval('monthly');
        }
        setShowModal(true);
    };

    const saveRule = async () => {
        if (!selectedIndexer) return;

        try {
            const max_snatches = formSnatches ? parseInt(formSnatches) : null;
            const max_size_bytes = formSizeGB ? parseFloat(formSizeGB) * (1024 ** 3) : null;

            await axios.post('/api/prowlarr/rules', {
                id: selectedIndexer.rule?.id,
                indexer_id: selectedIndexer.id,
                prowlarr_instance_id: selectedIndexer.prowlarr_instance_id,
                name: selectedIndexer.name,
                max_snatches,
                max_size_bytes,
                interval: formInterval
            });

            toast.success(`Rule saved for ${selectedIndexer.name}`);
            setShowModal(false);
            fetchIndexers();
        } catch (e) {
            toast.error('Failed to save indexer rule');
        }
    };

    const applyGlobalRule = async () => {
        try {
            const max_snatches = formSnatches ? parseInt(formSnatches) : null;
            const max_size_bytes = formSizeGB ? parseFloat(formSizeGB) * (1024 ** 3) : null;

            let count = 0;
            for (const indexer of indexers) {
                await axios.post('/api/prowlarr/rules', {
                    id: indexer.rule?.id,
                    indexer_id: indexer.id,
                    prowlarr_instance_id: indexer.prowlarr_instance_id,
                    name: indexer.name,
                    max_snatches,
                    max_size_bytes,
                    interval: formInterval
                });
                count++;
            }

            toast.success(`Bulk rule applied to ${count} indexers`);
            setShowModal(false);
            fetchIndexers();
        } catch (e) {
            toast.error('Failed to apply global rule');
        }
    };

    const deleteRule = async () => {
        if (!selectedIndexer || !selectedIndexer.rule) return;

        try {
            await axios.delete(`/api/prowlarr/rules?id=${selectedIndexer.rule.id}`);
            toast.success(`Rule removed for ${selectedIndexer.name}`);
            setShowModal(false);
            fetchIndexers();
        } catch (e) {
            toast.error('Failed to delete rule');
        }
    };

    const formatBytes = (bytes: number | null) => {
        if (!bytes) return 'Unlimited';
        const gb = bytes / (1024 ** 3);
        return `${gb.toFixed(1)} GB`;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black text-white">Indexers & Prowlarr Rules</h2>
                    <p className="text-xs text-zinc-500 font-medium">Manage indexers, set snatch limits, and configure monthly download quotas.</p>
                </div>
                <button
                    onClick={() => openConfigModal('global')}
                    className="px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-600/30 transition-all flex items-center gap-2 self-start md:self-auto"
                >
                    Apply Limits To All
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                </div>
            ) : indexers.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950/40 rounded-3xl border border-zinc-900">
                    <p className="text-zinc-500 font-bold">No Prowlarr indexers found.</p>
                    <p className="text-zinc-600 text-xs mt-1">Make sure you have added a Prowlarr instance in Settings.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {indexers.map((indexer) => {
                        const hexColor = tailwindToHex(indexer.prowlarr_color || '');
                        const rule = indexer.rule;
                        const isAutoDisabled = rule?.auto_manage && !indexer.enable;

                        const snatchesExceeded = rule?.max_snatches && rule.current_snatches >= rule.max_snatches;
                        const sizeExceeded = rule?.max_size_bytes && rule.current_size_bytes >= rule.max_size_bytes;
                        const limitReached = snatchesExceeded || sizeExceeded;

                        return (
                            <div
                                key={`${indexer.prowlarr_instance_id}-${indexer.id}`}
                                className={`p-5 rounded-2xl bg-zinc-950/60 border transition-all space-y-4 ${
                                    limitReached ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-800/80 hover:border-zinc-700'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-white text-sm truncate">{indexer.name}</span>
                                            <span
                                                className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border"
                                                style={{
                                                    backgroundColor: `${hexColor}15`,
                                                    borderColor: `${hexColor}40`,
                                                    color: hexColor
                                                }}
                                            >
                                                {indexer.prowlarr_name}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => toggleIndexer(indexer)}
                                        className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 p-0.5 ${
                                            indexer.enable ? 'bg-emerald-500' : 'bg-zinc-800'
                                        }`}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                                indexer.enable ? 'translate-x-6' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-zinc-800/50 text-xs">
                                    <div className="flex justify-between items-center text-zinc-400">
                                        <span className="font-bold text-zinc-500 text-[10px] uppercase tracking-wider">Snatches</span>
                                        <span className="font-bold text-white">
                                            {rule ? `${rule.current_snatches} / ${rule.max_snatches ?? '∞'}` : 'No limit'}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center text-zinc-400">
                                        <span className="font-bold text-zinc-500 text-[10px] uppercase tracking-wider">Data Limit</span>
                                        <span className="font-bold text-white">
                                            {rule ? `${(rule.current_size_bytes / (1024 ** 3)).toFixed(1)}GB / ${formatBytes(rule.max_size_bytes)}` : 'No limit'}
                                        </span>
                                    </div>

                                    {rule && (
                                        <div className="flex justify-between items-center text-zinc-500 text-[10px]">
                                            <span>Interval: <strong className="text-zinc-400 capitalize">{rule.interval}</strong></span>
                                            {isAutoDisabled && (
                                                <span className="text-amber-400 font-bold uppercase tracking-wider text-[9px]">Auto-Paused</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => openConfigModal(indexer)}
                                    className="w-full py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:border-zinc-700 transition-all text-center"
                                >
                                    {rule ? 'Edit Limits' : 'Set Limits'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-black text-white">
                            {isGlobalMode ? 'Apply Download Limits To All Indexers' : `Limits for ${selectedIndexer?.name}`}
                        </h3>

                        <div className="space-y-4 text-xs">
                            <div className="space-y-1.5">
                                <label className="font-bold text-zinc-400 block uppercase tracking-wider text-[10px]">Max Snatches</label>
                                <input
                                    type="number"
                                    placeholder="Leave empty for unlimited"
                                    value={formSnatches}
                                    onChange={e => setFormSnatches(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white font-bold outline-none focus:border-emerald-500/50"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-zinc-400 block uppercase tracking-wider text-[10px]">Max Download Size (GB)</label>
                                <input
                                    type="number"
                                    placeholder="Leave empty for unlimited (e.g. 50)"
                                    value={formSizeGB}
                                    onChange={e => setFormSizeGB(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white font-bold outline-none focus:border-emerald-500/50"
                                />
                            </div>

                            <CustomSelect
                                label="Quota Reset Interval"
                                value={formInterval}
                                onChange={(val: any) => setFormInterval(val)}
                                options={[
                                    { id: 'daily', name: 'Daily' },
                                    { id: 'weekly', name: 'Weekly' },
                                    { id: 'monthly', name: 'Monthly' }
                                ]}
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            {isGlobalMode ? (
                                <button
                                    onClick={applyGlobalRule}
                                    className="flex-1 py-3 bg-emerald-500 text-black font-black uppercase text-xs rounded-xl hover:bg-emerald-400 transition-all shadow-lg"
                                >
                                    Apply To All Indexers
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={saveRule}
                                        className="flex-1 py-3 bg-emerald-500 text-black font-black uppercase text-xs rounded-xl hover:bg-emerald-400 transition-all shadow-lg"
                                    >
                                        Save Limits
                                    </button>
                                    {selectedIndexer?.rule && (
                                        <button
                                            onClick={deleteRule}
                                            className="px-4 py-3 bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black uppercase text-xs rounded-xl hover:bg-rose-500/30 transition-all"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </>
                            )}
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-3 bg-zinc-800 text-zinc-300 font-black uppercase text-xs rounded-xl hover:bg-zinc-700 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

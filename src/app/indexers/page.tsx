'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

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

export default function IndexersPage() {
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

        // Optimistic UI update
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
            // Rollback
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

            toast.success(`Rules saved for ${selectedIndexer.name}`);
            setShowModal(false);
            fetchIndexers();
        } catch (e) {
            toast.error('Failed to save rules');
        }
    };

    const applyToAllRules = async () => {
        if (!selectedIndexer) return;

        try {
            const max_snatches = formSnatches ? parseInt(formSnatches) : null;
            const max_size_bytes = formSizeGB ? parseFloat(formSizeGB) * (1024 ** 3) : null;

            const targetIndexers = indexers.filter(i => i.prowlarr_instance_id === selectedIndexer.prowlarr_instance_id);

            const promises = targetIndexers.map(ind =>
                axios.post('/api/prowlarr/rules', {
                    id: ind.rule?.id,
                    indexer_id: ind.id,
                    prowlarr_instance_id: ind.prowlarr_instance_id,
                    name: ind.name,
                    max_snatches,
                    max_size_bytes,
                    interval: formInterval
                })
            );

            await Promise.all(promises);

            toast.success(`Rules applied to all indexers for ${selectedIndexer.prowlarr_name}`);
            setShowModal(false);
            fetchIndexers();
        } catch (e) {
            toast.error('Failed to apply rules to all indexers');
        }
    };

    const applyGlobalToAbsolutelyAll = async () => {
        try {
            const max_snatches = formSnatches ? parseInt(formSnatches) : null;
            const max_size_bytes = formSizeGB ? parseFloat(formSizeGB) * (1024 ** 3) : null;

            const promises = indexers.map(ind =>
                axios.post('/api/prowlarr/rules', {
                    id: ind.rule?.id,
                    indexer_id: ind.id,
                    prowlarr_instance_id: ind.prowlarr_instance_id,
                    name: ind.name,
                    max_snatches,
                    max_size_bytes,
                    interval: formInterval
                })
            );

            await Promise.all(promises);

            toast.success(`Global rules applied to ALL indexers successfully!`);
            setShowModal(false);
            fetchIndexers();
        } catch (e) {
            toast.error('Failed to apply global rules to all indexers');
        }
    };

    const deleteRule = async () => {
        if (!selectedIndexer?.rule) return;
        try {
            await axios.delete(`/api/prowlarr/rules?id=${selectedIndexer.rule.id}`);
            toast.success('Rule deleted');
            setShowModal(false);
            fetchIndexers();
        } catch (e) {
            toast.error('Failed to delete rule');
        }
    }

    if (loading) return <div className="p-8 text-zinc-400">Loading indexers...</div>;

    return (
        <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Prowlarr Indexers</h1>
                    <p className="text-zinc-400">Manage individual indexer states and set automation quotas to prevent indexing bans.</p>
                </div>
                {indexers.length > 0 && (
                    <button
                        onClick={() => openConfigModal('global')}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
                        Global Defaults
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {indexers.map(ind => (
                    <div
                        key={`${ind.prowlarr_instance_id}-${ind.id}`}
                        style={{
                            borderColor: ind.enable ? `${ind.prowlarr_color}` : '#27272a',
                            boxShadow: ind.enable ? `0 0 20px ${ind.prowlarr_color}20` : 'none',
                            backgroundColor: ind.enable ? `${ind.prowlarr_color}08` : 'transparent'
                        }}
                        className={`bg-zinc-900 border-2 rounded-2xl p-6 flex flex-col transition-all duration-300 hover:scale-[1.01] ${ind.enable ? 'opacity-100' : 'opacity-40 grayscale'}`}

                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="min-w-0 pr-4">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2 truncate">
                                    {ind.name}
                                    {ind.status === 0 && <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Failing</span>}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span
                                        style={{ backgroundColor: `${ind.prowlarr_color}20`, color: ind.prowlarr_color, borderColor: `${ind.prowlarr_color}40` }}
                                        className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border"
                                    >
                                        {ind.prowlarr_name}
                                    </span>
                                    {!ind.enable && <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-red-600 text-white shadow-lg shadow-red-600/40">Shutdown</span>}
                                </div>

                            </div>

                            {/* Toggle Switch */}
                            <button
                                onClick={() => toggleIndexer(ind)}
                                style={ind.enable ? {
                                    backgroundColor: ind.prowlarr_color || '#10b981',
                                    boxShadow: `0 0 10px ${ind.prowlarr_color || '#10b981'}60`
                                } : {}}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 ${ind.enable ? '' : 'bg-zinc-800 border border-zinc-700'}`}
                                title={ind.enable ? "Enabled" : "Disabled"}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md ${ind.enable ? 'translate-x-6' : 'translate-x-1 grayscale'}`} />
                            </button>
                        </div>

                        {ind.rule ? (
                            <div className="bg-zinc-950/80 rounded-xl p-4 text-sm mb-6 border border-zinc-800 shadow-inner">
                                <div className="flex justify-between mb-2">
                                    <span className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Data ({ind.rule.interval})</span>
                                    <span className="text-white font-black tabular-nums">
                                        {(ind.rule.current_size_bytes / (1024 ** 3)).toFixed(2)} GB
                                        {ind.rule.max_size_bytes && <span className="text-zinc-600 ml-1">/ {(ind.rule.max_size_bytes / (1024 ** 3)).toFixed(1)} GB</span>}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Snatches</span>
                                    <span className="text-white font-black tabular-nums">
                                        {ind.rule.current_snatches}
                                        {ind.rule.max_snatches && <span className="text-zinc-600 ml-1">/ {ind.rule.max_snatches}</span>}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-950/40 rounded-xl p-4 text-xs mb-6 border border-dashed border-zinc-800 text-zinc-600 font-medium italic text-center">
                                No quota limits configured.
                            </div>
                        )}

                        <div className="mt-auto">
                            <button
                                onClick={() => openConfigModal(ind)}
                                style={ind.enable ? {
                                    color: ind.prowlarr_color || '#34d399',
                                    backgroundColor: ind.prowlarr_color ? `${ind.prowlarr_color}1A` : 'rgba(16, 185, 129, 0.1)',
                                    borderColor: ind.prowlarr_color ? `${ind.prowlarr_color}40` : '#34d39940'
                                } : {}}
                                className={`w-full text-[11px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all border border-zinc-800 hover:scale-[1.02] ${!ind.enable ? 'bg-zinc-800 text-zinc-600' : ''}`}
                            >
                                {ind.rule ? 'Manage Quota' : 'Setup Quota'}
                            </button>
                        </div>
                    </div>
                ))}
                {indexers.length === 0 && (
                    <div className="col-span-full py-12 text-center border border-dashed border-zinc-800 rounded-2xl text-zinc-500">
                        No active Prowlarr instances or indexers found. Connect Prowlarr in Settings.
                    </div>
                )}
            </div>

            {/* Rule Config Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-zinc-800">
                            <h3 className="text-xl font-bold text-white">
                                {isGlobalMode ? 'Global Indexer Rules' : `Configure: ${selectedIndexer?.name}`}
                            </h3>
                            {isGlobalMode && (
                                <p className="text-sm text-indigo-400 mt-1">Applying these rules will explicitly overwrite the limits of strictly ALL indexers across all instances.</p>
                            )}
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-1">Max Data (GB)</label>
                                <input
                                    type="number"
                                    value={formSizeGB}
                                    onChange={e => setFormSizeGB(e.target.value)}
                                    placeholder="e.g. 50"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                                />
                                <p className="text-xs text-zinc-500 mt-1">Leave blank for no limit.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-1">Max Snatches (Pulls)</label>
                                <input
                                    type="number"
                                    value={formSnatches}
                                    onChange={e => setFormSnatches(e.target.value)}
                                    placeholder="e.g. 100"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-1">Interval Reset</label>
                                <select
                                    value={formInterval}
                                    onChange={e => setFormInterval(e.target.value as any)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-6 border-t border-zinc-800 flex gap-3 justify-end bg-zinc-950/50">
                            {!isGlobalMode && selectedIndexer?.rule && (
                                <button
                                    onClick={deleteRule}
                                    className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 mr-auto flex-shrink-0"
                                >
                                    Remove Rule
                                </button>
                            )}

                            {!isGlobalMode ? (
                                <>
                                    <button
                                        onClick={applyToAllRules}
                                        className="px-4 py-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10 rounded-lg transition mr-auto"
                                        title="Apply these exact settings to all active indexers for this App instance"
                                    >
                                        Apply to All Instance
                                    </button>
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={saveRule}
                                        className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg shadow-lg hover:shadow-emerald-500/20 transition disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition mt-auto"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={applyGlobalToAbsolutelyAll}
                                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow-lg hover:shadow-indigo-500/20 transition disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                                        Save & Apply to EVERY Indexer
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

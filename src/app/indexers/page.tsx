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
    rule: IndexerRule | null;
}

export default function IndexersPage() {
    const [indexers, setIndexers] = useState<Indexer[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIndexer, setSelectedIndexer] = useState<Indexer | null>(null);
    const [showModal, setShowModal] = useState(false);

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

    const openConfigModal = (indexer: Indexer) => {
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
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Prowlarr Indexers</h1>
                <p className="text-zinc-400">Manage individual indexer states and set automation quotas to prevent indexing bans.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {indexers.map(ind => (
                    <div key={`${ind.prowlarr_instance_id}-${ind.id}`} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col hover:border-zinc-700 transition">

                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    {ind.name}
                                    {ind.status === 0 && <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full font-medium">Failing</span>}
                                </h3>
                                <span className="text-xs text-zinc-500">{ind.prowlarr_name}</span>
                            </div>

                            {/* Toggle Switch */}
                            <button
                                onClick={() => toggleIndexer(ind)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${ind.enable ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ind.enable ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {ind.rule ? (
                            <div className="bg-zinc-950/50 rounded-lg p-3 text-sm mb-4 border border-zinc-800/50">
                                <div className="flex justify-between mb-1">
                                    <span className="text-zinc-400">Data Used ({ind.rule.interval})</span>
                                    <span className="text-white font-medium">
                                        {(ind.rule.current_size_bytes / (1024 ** 3)).toFixed(2)} GB
                                        {ind.rule.max_size_bytes && ` / ${(ind.rule.max_size_bytes / (1024 ** 3)).toFixed(1)} GB`}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-400">Hits Used</span>
                                    <span className="text-white font-medium">
                                        {ind.rule.current_snatches}
                                        {ind.rule.max_snatches && ` / ${ind.rule.max_snatches}`}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-950/30 rounded-lg p-3 text-sm mb-4 border border-zinc-800/30 text-zinc-500 italic">
                                No quota limits configured.
                            </div>
                        )}

                        <div className="mt-auto">
                            <button
                                onClick={() => openConfigModal(ind)}
                                className="w-full text-sm font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 py-2 rounded-lg transition"
                            >
                                {ind.rule ? 'Edit Rules' : 'Configure Rules'}
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
            {showModal && selectedIndexer && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-zinc-800">
                            <h3 className="text-xl font-bold text-white">Configure: {selectedIndexer.name}</h3>
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
                                <label className="block text-sm font-medium text-zinc-400 mb-1">Max Grabs (Hits)</label>
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
                            {selectedIndexer.rule && (
                                <button
                                    onClick={deleteRule}
                                    className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 mr-auto"
                                >
                                    Remove Rule
                                </button>
                            )}
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

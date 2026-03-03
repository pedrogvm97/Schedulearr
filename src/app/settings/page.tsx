"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Settings() {
    const [instances, setInstances] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [editTargetId, setEditTargetId] = useState<string | null>(null);
    const [type, setType] = useState("radarr");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [color, setColor] = useState('bg-zinc-500'); // default fallback

    // qBittorrent cleanup settings
    const [qbitCleanupEnabled, setQbitCleanupEnabled] = useState(false);
    const [qbitCleanupIntervalMin, setQbitCleanupIntervalMin] = useState(15);
    const [qbitStagnationMin, setQbitStagnationMin] = useState(60);
    const [qbitDeleteFiles, setQbitDeleteFiles] = useState(true);
    const [qbitBlacklist, setQbitBlacklist] = useState(true);

    const [qbitSizeCleanupEnabled, setQbitSizeCleanupEnabled] = useState(false);
    const [qbitMaxSizeGb, setQbitMaxSizeGb] = useState(100);

    const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);

    const predefinedColors = [
        'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500',
        'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
        'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
        'bg-pink-500', 'bg-rose-500', 'bg-zinc-500', 'bg-slate-500', 'bg-stone-500'
    ];

    const fetchInstances = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/instances');
            const data = await res.json();
            if (Array.isArray(data)) setInstances(data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings');
                const data = await res.json();

                if (data.qbit_cleanup_enabled === 'true') setQbitCleanupEnabled(true);
                if (data.qbit_cleanup_interval_min) setQbitCleanupIntervalMin(parseInt(data.qbit_cleanup_interval_min));
                if (data.qbit_cleanup_stagnation_min) setQbitStagnationMin(parseInt(data.qbit_cleanup_stagnation_min));
                if (data.qbit_cleanup_delete_files === 'false') setQbitDeleteFiles(false);
                if (data.qbit_cleanup_blacklist === 'false') setQbitBlacklist(false);

                if (data.qbit_cleanup_max_size_enabled === 'true') setQbitSizeCleanupEnabled(true);
                if (data.qbit_cleanup_max_size_gb) setQbitMaxSizeGb(parseInt(data.qbit_cleanup_max_size_gb));
            } catch (e) {
                console.error(e);
            }
        };

        fetchSettings();
        fetchInstances();
    }, []);

    const updateSetting = async (key: string, value: any) => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: String(value) })
            });
        } catch (e) {
            console.error('Failed to update setting', key, e);
        }
    };

    const handleAddOrEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !url || !apiKey) return;

        const updatedInstance = {
            id: editTargetId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            name,
            url: url.replace(/\/$/, ""), // strip trailing slash
            api_key: apiKey,
            enabled: true,
            color
        };

        try {
            const method = editTargetId ? 'PUT' : 'POST';
            const res = await fetch('/api/instances', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedInstance)
            });

            if (!res.ok) throw new Error('Failed to save instance');

            toast.success(editTargetId ? 'Instance updated successfully!' : 'Instance added successfully!');
            fetchInstances();

            // reset form
            setEditTargetId(null);
            setName(""); setUrl(""); setApiKey(""); setColor('bg-zinc-500');
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to save instance');
        }
    };

    const handleEditClick = (inst: any) => {
        setEditTargetId(inst.id);
        setType(inst.type);
        setName(inst.name);
        setUrl(inst.url);
        setApiKey(inst.api_key);
        setColor(inst.color || 'bg-zinc-500');
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this instance?')) return;

        try {
            const res = await fetch(`/api/instances?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete instance');
            toast.success('Instance deleted successfully');

            if (editTargetId === id) {
                setEditTargetId(null);
                setName(""); setUrl(""); setApiKey(""); setColor('bg-zinc-500');
            }

            fetchInstances();
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to delete instance');
        }
    };

    // Health Badge internal component to fetch its own status
    const HealthBadge = ({ id }: { id: string }) => {
        const [status, setStatus] = useState<'loading' | 'online' | 'offline'>('loading');

        useEffect(() => {
            const checkHealth = async () => {
                try {
                    const res = await fetch(`/api/instances/health?id=${id}`);
                    const data = await res.json();
                    setStatus(data.status || 'offline');
                } catch {
                    setStatus('offline');
                }
            };
            checkHealth();
            // Optional: Re-check every minute
            const interval = setInterval(checkHealth, 60000);
            return () => clearInterval(interval);
        }, [id]);

        if (status === 'loading') return <div className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse" title="Checking health..." />;
        if (status === 'online') return <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" title="Online" />;
        return <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" title="Offline" />;
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 pb-24">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-zinc-400">Configure your connections to Radarr, Sonarr, and Prowlarr.</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-white">{editTargetId ? 'Update Instance' : 'Add Instance'}</h2>
                    {editTargetId && (
                        <button
                            onClick={() => {
                                setEditTargetId(null);
                                setName(""); setUrl(""); setApiKey(""); setColor('bg-zinc-500');
                            }}
                            className="text-sm text-zinc-400 hover:text-white"
                        >
                            Cancel Edit
                        </button>
                    )}
                </div>
                <form onSubmit={handleAddOrEdit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-300">Type</label>
                        <select
                            value={type}
                            onChange={e => setType(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                            <option value="radarr">Radarr</option>
                            <option value="sonarr">Sonarr</option>
                            <option value="prowlarr">Prowlarr</option>
                            <option value="qbittorrent">qBittorrent</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-300">Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Radarr Movies 4K"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-300">URL</label>
                        <input
                            type="url"
                            placeholder="http://192.168.1.125:7878"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-300">
                            {type === 'qbittorrent' ? 'Credentials (username:password)' : 'API Key'}
                        </label>
                        <input
                            type="password"
                            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>

                    <div className="md:col-span-2 space-y-2 mt-2">
                        <label className="text-sm font-medium text-zinc-300">Instance Indicator Color</label>
                        <div className="flex flex-wrap gap-2">
                            {predefinedColors.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={`w-6 h-6 rounded-full ${c} ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 border-2 border-transparent' : 'opacity-70 hover:opacity-100 border border-zinc-800'}`}
                                    aria-label={`Select ${c}`}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="md:col-span-2 mt-2">
                        <button
                            type="submit"
                            disabled={!name || !url || !apiKey}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {editTargetId ? 'Update Connection' : 'Add Connection'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Configured Instances</h2>
                {loading ? (
                    <div className="text-zinc-500">Loading...</div>
                ) : instances.length === 0 ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
                        No instances configured yet. Add one above.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {instances.map(inst => {
                            // Convert standard "bg-red-500" into a Hex for the border or "border-red-500" equivalent
                            let borderColorHex = '#27272a'; // default zinc-800
                            const twClass = inst.color || '';
                            if (twClass.includes('slate')) borderColorHex = '#64748b';
                            else if (twClass.includes('gray')) borderColorHex = '#6b7280';
                            else if (twClass.includes('zinc')) borderColorHex = '#71717a';
                            else if (twClass.includes('neutral')) borderColorHex = '#737373';
                            else if (twClass.includes('stone')) borderColorHex = '#78716c';
                            else if (twClass.includes('red')) borderColorHex = '#ef4444';
                            else if (twClass.includes('orange')) borderColorHex = '#f97316';
                            else if (twClass.includes('amber')) borderColorHex = '#f59e0b';
                            else if (twClass.includes('yellow')) borderColorHex = '#eab308';
                            else if (twClass.includes('lime')) borderColorHex = '#84cc16';
                            else if (twClass.includes('green')) borderColorHex = '#22c55e';
                            else if (twClass.includes('emerald')) borderColorHex = '#10b981';
                            else if (twClass.includes('teal')) borderColorHex = '#14b8a6';
                            else if (twClass.includes('cyan')) borderColorHex = '#06b6d4';
                            else if (twClass.includes('sky')) borderColorHex = '#0ea5e9';
                            else if (twClass.includes('blue')) borderColorHex = '#3b82f6';
                            else if (twClass.includes('indigo')) borderColorHex = '#6366f1';
                            else if (twClass.includes('violet')) borderColorHex = '#8b5cf6';
                            else if (twClass.includes('purple')) borderColorHex = '#a855f7';
                            else if (twClass.includes('fuchsia')) borderColorHex = '#d946ef';
                            else if (twClass.includes('pink')) borderColorHex = '#ec4899';
                            else if (twClass.includes('rose')) borderColorHex = '#f43f5e';

                            return (
                                <div key={inst.id} className="bg-zinc-900 rounded-xl p-4 flex flex-col justify-between" style={{ border: `1px solid ${borderColorHex}80` }}>
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                {inst.color && <div className={`w-3 h-3 rounded-full ${inst.color}`} title="Instance Color"></div>}
                                                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm flex items-center gap-1.5" style={{ color: borderColorHex, backgroundColor: `${borderColorHex}33` }}>
                                                    {inst.type}
                                                </span>
                                                <HealthBadge id={inst.id} />
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleEditClick(inst)}
                                                    className="text-zinc-500 hover:text-blue-400 p-1"
                                                    title="Edit instance"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(inst.id)}
                                                    className="text-zinc-500 hover:text-red-400 p-1"
                                                    title="Delete instance"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        </div>
                                        <h3 className="text-lg font-medium text-white truncate" title={inst.name}>{inst.name}</h3>
                                        <p className="text-sm text-zinc-400 mt-1 truncate" title={inst.url}>{inst.url}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* qBittorrent Auto-Cleanup Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M21 2v6h-6"></path><path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path></svg>
                    qBittorrent Auto-Cleanup
                </h2>
                <p className="text-sm text-zinc-400 mb-6">Automatically groom stalled torrents or large items to keep your instances clean.</p>

                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white font-medium">Enable Auto-Cleanup</div>
                            <div className="text-sm text-zinc-400">Run background checks for stalled torrents</div>
                        </div>
                        <button
                            onClick={() => {
                                const next = !qbitCleanupEnabled;
                                setQbitCleanupEnabled(next);
                                updateSetting('qbit_cleanup_enabled', next);
                            }}
                            className={`w-12 h-6 rounded-full transition-colors relative ${qbitCleanupEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${qbitCleanupEnabled ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-white font-medium block">Cleanup Interval (Minutes)</label>
                        <p className="text-sm text-zinc-400">How often the background auto-cleanup process should run.</p>
                        <input
                            type="number"
                            min="1"
                            value={qbitCleanupIntervalMin}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 15;
                                setQbitCleanupIntervalMin(val);
                                updateSetting('qbit_cleanup_interval_min', val);
                            }}
                            className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white outline-none w-32 focus:border-emerald-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-white font-medium block">Stagnation Time (Minutes)</label>
                        <p className="text-sm text-zinc-400">Torrents stalled longer than this will be removed.</p>
                        <input
                            type="number"
                            min="1"
                            value={qbitStagnationMin}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 60;
                                setQbitStagnationMin(val);
                                updateSetting('qbit_cleanup_stagnation_min', val);
                            }}
                            className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white outline-none w-32 focus:border-emerald-500"
                        />
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                        <div>
                            <div className="text-white font-medium">Enable Max Size Limit Cleanup</div>
                            <div className="text-sm text-zinc-400">Remove torrents that exceed a specific GB threshold</div>
                        </div>
                        <button
                            onClick={() => {
                                const next = !qbitSizeCleanupEnabled;
                                setQbitSizeCleanupEnabled(next);
                                updateSetting('qbit_cleanup_max_size_enabled', next);
                            }}
                            className={`w-12 h-6 rounded-full transition-colors relative ${qbitSizeCleanupEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${qbitSizeCleanupEnabled ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-white font-medium block">Maximum Authorized Size (GB)</label>
                        <p className="text-sm text-zinc-400">Torrents larger than this metric will be removed and blacklisted to grab an alternate release.</p>
                        <input
                            type="number"
                            min="1"
                            value={qbitMaxSizeGb}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 100;
                                setQbitMaxSizeGb(val);
                                updateSetting('qbit_cleanup_max_size_gb', val);
                            }}
                            className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white outline-none w-32 focus:border-emerald-500"
                        />
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                        <div>
                            <div className="text-white font-medium">Delete Downloaded Files</div>
                            <div className="text-sm text-zinc-400">Remove data payload alongside the torrent</div>
                        </div>
                        <button
                            onClick={() => {
                                const next = !qbitDeleteFiles;
                                setQbitDeleteFiles(next);
                                updateSetting('qbit_cleanup_delete_files', next);
                            }}
                            className={`w-12 h-6 rounded-full transition-colors relative ${qbitDeleteFiles ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${qbitDeleteFiles ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white font-medium">Blacklist Release</div>
                            <div className="text-sm text-zinc-400">Remove from Radarr/Sonarr queue and blacklist to trigger new search</div>
                        </div>
                        <button
                            onClick={() => {
                                const next = !qbitBlacklist;
                                setQbitBlacklist(next);
                                updateSetting('qbit_cleanup_blacklist', next);
                            }}
                            className={`w-12 h-6 rounded-full transition-colors relative ${qbitBlacklist ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${qbitBlacklist ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* About / Support Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between text-sm">
                <div className="flex flex-col md:flex-row items-center gap-4 mb-4 md:mb-0 text-center md:text-left">
                    <img
                        src="/author.png"
                        alt="Author"
                        className="w-14 h-14 rounded-full object-cover transition-all border-2 border-zinc-800 shadow-xl hover:scale-105 hover:border-emerald-500/50 cursor-pointer"
                        onClick={() => setIsAuthorModalOpen(true)}
                    />
                    <div>
                        <p className="font-medium text-zinc-300 text-base">Schedulearr is free and unlocked forever.</p>
                        <p className="text-zinc-500 mt-1">If this app saved you time, <a href="https://ko-fi.com/flash4k" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-semibold underline underline-offset-2 transition-colors">you can buy me a coffee here!</a> ☕</p>
                    </div>
                </div>
                <div className="text-zinc-600 text-xs text-center md:text-right">
                    &copy; {new Date().getFullYear()} Flash4K<br />
                    <span className="opacity-50 mt-1 inline-block">v1.0.0</span>
                </div>
            </div>

            {/* Author Appreciation Modal */}
            {isAuthorModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setIsAuthorModalOpen(false)}>
                    <div
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Decorative background gradients */}
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                        <button
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors p-1"
                            onClick={() => setIsAuthorModalOpen(false)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>

                        <div className="relative mb-6 group">
                            <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <img
                                src="/author.png"
                                alt="Author"
                                className="w-32 h-32 rounded-full object-cover border-4 border-zinc-800 shadow-2xl relative z-10"
                            />
                        </div>

                        <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Thank You!</h3>
                        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                            I built Schedulearr to scratch my own itch, and it's amazing to see others finding it useful. Your support helps me keep improving it and motivates me to build more cool things.
                        </p>

                        <a
                            href="https://ko-fi.com/flash4k"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3 px-4 bg-[#FF5E5B] hover:bg-[#ff4642] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#FF5E5B]/20 hover:shadow-[#FF5E5B]/40 hover:-translate-y-0.5"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.143V14.12s5.404.14 7.279-1.928c1.642-1.815 1.543-2.618 1.543-2.618h-.001C25.043 8.358 23.88 8.949 23.88 8.949zm-13.84 5.253a.294.294 0 01-.002.415c-1.354 1.341-3.619 1.332-4.966-.008L3.195 12.72s-1.464-1.428-1.439-3.235c.039-2.028 1.704-3.558 3.659-3.511 1.054.025 2.103.542 2.809 1.488 1.15-.992 2.37-1.488 3.511-1.488 2.339 0 3.738 1.847 3.69 3.824-.044 1.802-1.385 3.398-1.385 3.398l-4.001 3.998zm6.444-4.513h-2.115V6.756h2.15v3.425c.01.218.006.452.006.452s1.428.17 1.423 1.334c-.004 1.002-1.464 1.053-1.464 1.053z" />
                            </svg>
                            Buy me a Coffee on Ko-fi
                        </a>

                        <button
                            className="mt-4 text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                            onClick={() => setIsAuthorModalOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

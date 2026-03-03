"use client";

import { useState, useEffect } from "react";

export default function Settings() {
    const [instances, setInstances] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [type, setType] = useState("radarr");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [color, setColor] = useState('bg-zinc-500'); // default fallback

    // qBittorrent cleanup settings
    const [qbitCleanupEnabled, setQbitCleanupEnabled] = useState(false);
    const [qbitStagnationMin, setQbitStagnationMin] = useState(60);
    const [qbitDeleteFiles, setQbitDeleteFiles] = useState(true);
    const [qbitBlacklist, setQbitBlacklist] = useState(true);

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
                if (data.qbit_cleanup_stagnation_min) setQbitStagnationMin(parseInt(data.qbit_cleanup_stagnation_min));
                if (data.qbit_cleanup_delete_files === 'false') setQbitDeleteFiles(false);
                if (data.qbit_cleanup_blacklist === 'false') setQbitBlacklist(false);
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

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !url || !apiKey) return;

        const newInstance = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            name,
            url: url.replace(/\/$/, ""), // strip trailing slash
            api_key: apiKey,
            enabled: true,
            color
        };

        try {
            await fetch('/api/instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newInstance)
            });
            fetchInstances();
            // reset form
            setName(""); setUrl(""); setApiKey(""); setColor('bg-zinc-500');
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/instances?id=${id}`, { method: 'DELETE' });
            fetchInstances();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 pb-24">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-zinc-400">Configure your connections to Radarr, Sonarr, and Prowlarr.</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Add Instance</h2>
                <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            Add Connection
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
                        {instances.map(inst => (
                            <div key={inst.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            {inst.color && <div className={`w-3 h-3 rounded-full ${inst.color}`} title="Instance Color"></div>}
                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm ${inst.type === 'radarr' ? 'bg-yellow-500/20 text-yellow-500' :
                                                inst.type === 'sonarr' ? 'bg-cyan-500/20 text-cyan-500' :
                                                    inst.type === 'qbittorrent' ? 'bg-emerald-500/20 text-emerald-500' :
                                                        'bg-purple-500/20 text-purple-500'
                                                }`}>
                                                {inst.type}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(inst.id)}
                                            className="text-zinc-500 hover:text-red-400 p-1"
                                            title="Delete instance"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                    <h3 className="text-lg font-medium text-white truncate" title={inst.name}>{inst.name}</h3>
                                    <p className="text-sm text-zinc-400 mt-1 truncate" title={inst.url}>{inst.url}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* qBittorrent Auto-Cleanup Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M21 2v6h-6"></path><path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path></svg>
                    qBittorrent Auto-Cleanup
                </h2>
                <p className="text-sm text-zinc-400 mb-6">Automatically groom stalled torrents based on stagnation time.</p>

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

                    <div className="flex items-center justify-between">
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
                    <img src="/author.png" alt="Author" className="w-14 h-14 rounded-full object-cover grayscale hover:grayscale-0 transition-all border-2 border-zinc-800 shadow-xl" />
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
        </div>
    );
}

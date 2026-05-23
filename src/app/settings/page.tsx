"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CustomSelect } from "@/components/CustomSelect";

export default function Settings() {
    const [instances, setInstances] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [tmdbApiKey, setTmdbApiKey] = useState("");
    const [tmdbInput, setTmdbInput] = useState("");
    const [tmdbState, setTmdbState] = useState<'view' | 'edit' | 'confirm'>('view');

    // Housekeeping stats
    const [dbStats, setDbStats] = useState<{ totalSizeBytes: number, tableStats: any[] } | null>(null);
    const [isHousekeepingOpen, setIsHousekeepingOpen] = useState(false);
    const [editTargetId, setEditTargetId] = useState<string | null>(null);
    const [type, setType] = useState("radarr");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [color, setColor] = useState('bg-zinc-500'); // default fallback

    const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);

    const predefinedColors = [
        'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500',
        'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
        'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
        'bg-pink-500', 'bg-rose-500', 'bg-zinc-500', 'bg-slate-500', 'bg-stone-500'
    ];

    const [allSettings, setAllSettings] = useState<Record<string, string>>({});
    const getSettingValue = (key: string) => allSettings[key] || "";

    // Version management
    const [versionInfo, setVersionInfo] = useState<{
        currentVersion: string;
        latestVersion: string;
        updateAvailable: boolean;
        changelog: string;
        dockerSocketAvailable: boolean;
    } | null>(null);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [updating, setUpdating] = useState(false);

    // Disk Usage
    const [diskInfo, setDiskInfo] = useState<{ totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number; byInstance: any[] } | null>(null);
    const [isDiskOpen, setIsDiskOpen] = useState(false);
    const [diskPauseEnabled, setDiskPauseEnabled] = useState(false);
    const [diskPauseThreshold, setDiskPauseThreshold] = useState(90);

    const fetchInstances = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/instances');
            const data = await res.json();
            if (Array.isArray(data)) setInstances(data);

            // Fetch All Settings
            const sRes = await fetch('/api/settings');
            if (sRes.ok) {
                const sData = await sRes.json();
                setAllSettings(sData);
                setTmdbApiKey(sData.tmdb_api_key || "");
                setTmdbInput(sData.tmdb_api_key || "");
                setTmdbState(sData.tmdb_api_key ? 'view' : 'edit');
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchInstances();
        fetchVersionInfo();
        // Fetch disk info on mount
        fetch('/api/system/disk').then(r => r.ok ? r.json() : null).then(d => { if (d) setDiskInfo(d); }).catch(() => {});
    }, []);

    // Sync disk settings from allSettings when loaded
    useEffect(() => {
        if (allSettings.disk_pause_enabled) setDiskPauseEnabled(allSettings.disk_pause_enabled === 'true');
        if (allSettings.disk_pause_threshold) setDiskPauseThreshold(parseInt(allSettings.disk_pause_threshold) || 90);
    }, [allSettings]);

    const fetchVersionInfo = async () => {
        try {
            const res = await fetch('/api/system/version');
            if (res.ok) {
                const data = await res.json();
                setVersionInfo(data);
            }
        } catch (e) {
            console.error('Failed to fetch version info', e);
        }
    };

    const handleCheckUpdate = async () => {
        setCheckingUpdate(true);
        await fetchVersionInfo();
        setCheckingUpdate(false);
        toast.info("Update check complete");
    };

    const handleUpdate = async () => {
        if (!confirm("This will pull the latest Docker image and prepare the system for update. The app might be unavailable for a few seconds if it restarts. Proceed?")) return;
        
        setUpdating(true);
        try {
            const res = await fetch('/api/system/update', { method: 'POST' });
            const data = await res.json();
            
            if (res.ok) {
                toast.success(data.message || "Update initiated successfully!");
            } else {
                toast.error(data.error || "Update failed");
            }
        } catch (e: any) {
            toast.error("Failed to trigger update: " + e.message);
        }
        setUpdating(false);
    };

    const updateSetting = async (key: string, value: any) => {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: String(value) })
            });
            if (res.ok) {
                if (key === 'tmdb_api_key') toast.success("TMDB API Key updated");
            } else {
                throw new Error("Failed to save");
            }
        } catch (e) {
            console.error('Failed to update setting', key, e);
            toast.error("Failed to update setting");
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

    // Health Badge internal component to fetch its status
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

    const handleExport = async () => {
        const password = window.prompt("Enter a password to encrypt your backup:");
        if (!password) return;

        try {
            const res = await fetch('/api/instances/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (!res.ok) throw new Error('Failed to export');
            const data = await res.json();

            // Trigger download
            const blob = new Blob([data.encryptedData], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename || 'instances_backup.json';
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success("Backup exported successfully!");
        } catch (e: any) {
            toast.error(e.message || "Failed to export backup");
        }
    };

    const handleImport = async () => {
        const password = window.prompt("Enter the password to decrypt your backup:");
        if (!password) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event: any) => {
                const encryptedData = event.target.result;
                try {
                    const res = await fetch('/api/instances/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password, encryptedData })
                    });

                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || 'Failed to import');
                    }

                    toast.success("Backup restored successfully!");
                    fetchInstances();
                } catch (err: any) {
                    toast.error(err.message || "Failed to restore backup");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 pb-24">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-zinc-400">Configure your connections to Radarr, Sonarr, and Prowlarr.</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-4">General Settings</h2>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-300">TMDB API Key (Optional)</label>

                        {tmdbState === 'view' ? (
                            <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3">
                                <div className="flex flex-col">
                                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Status: Configured</span>
                                    <span className="text-white font-mono text-sm">{tmdbApiKey.slice(0, 4)}••••••••</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setTmdbInput(tmdbApiKey);
                                        setTmdbState('edit');
                                    }}
                                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-bold transition-colors"
                                >
                                    Change
                                </button>
                            </div>
                        ) : tmdbState === 'edit' ? (
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    placeholder="Paste your TMDB API Key"
                                    value={tmdbInput}
                                    onChange={e => setTmdbInput(e.target.value)}
                                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-zinc-600"
                                />
                                <button
                                    onClick={() => setTmdbState('confirm')}
                                    disabled={!tmdbInput}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xs transition-colors"
                                >
                                    Save Key
                                </button>
                                {tmdbApiKey && (
                                    <button
                                        onClick={() => setTmdbState('view')}
                                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-bold text-xs transition-colors"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-emerald-500/20 rounded-full">
                                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <span className="text-sm text-emerald-500 font-bold">Confirm saving this key?</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={async () => {
                                            await updateSetting('tmdb_api_key', tmdbInput);
                                            setTmdbApiKey(tmdbInput);
                                            setTmdbState('view');
                                        }}
                                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-black transition-all"
                                    >
                                        Confirm
                                    </button>
                                    <button
                                        onClick={() => setTmdbState('edit')}
                                        className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-bold transition-all"
                                    >
                                        Back
                                    </button>
                                </div>
                            </div>
                        )}
                        <p className="text-[10px] text-zinc-500 mt-2">Enable this for better trending and discovery results on the discovery page.</p>
                    </div>
                    <div className="pt-4 border-t border-zinc-800 space-y-4">
                    {/* Removed Network Speed Interval from here - moved to Dashboard Analytics card */}
                    </div>
                </div>
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
                        <CustomSelect
                            value={type}
                            onChange={(val) => setType(val)}
                            options={[
                                { id: 'radarr', name: 'Radarr' },
                                { id: 'sonarr', name: 'Sonarr' },
                                { id: 'prowlarr', name: 'Prowlarr' },
                                { id: 'qbittorrent', name: 'qBittorrent' },
                                { id: 'plex', name: 'Plex' }
                            ]}
                        />
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
                            {type === 'qbittorrent' ? 'Credentials (username:password)' : type === 'plex' ? 'X-Plex-Token' : 'API Key'}
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

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Backup & Restore</h2>
                        <p className="text-sm text-zinc-400 mt-1">Export your instances into an encrypted file or restore them from a previous backup.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleExport}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Export Backup
                        </button>
                        <button
                            onClick={handleImport}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            Restore Backup
                        </button>
                    </div>
                </div>
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


            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
                <div className="bg-zinc-800/50 p-6 border-b border-zinc-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20 16V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2z"></path><path d="M8 7h8"></path><path d="M8 11h8"></path></svg>
                            System & Updates
                        </h2>
                        <p className="text-sm text-zinc-400 mt-1">Manage your Schedulearr instance version and system health.</p>
                    </div>
                    <button
                        onClick={handleCheckUpdate}
                        disabled={checkingUpdate}
                        className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-2"
                    >
                        {checkingUpdate ? (
                            <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
                        )}
                        Check for Updates
                    </button>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Current Version</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-white font-mono">v{versionInfo?.currentVersion || '0.0.0'}</span>
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-black rounded border border-emerald-500/20 uppercase">Stable</span>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Latest Release</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-200 font-mono">v{versionInfo?.latestVersion || 'Unknown'}</span>
                            {versionInfo?.updateAvailable && (
                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-black rounded border border-amber-500/20 uppercase animate-pulse">Update Ready</span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-end justify-end md:justify-start lg:justify-end">
                        {versionInfo?.updateAvailable ? (
                            <button
                                onClick={handleUpdate}
                                disabled={updating}
                                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-black py-3 px-8 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-95 translate-y-0 hover:-translate-y-1"
                            >
                                {updating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                        Update to v{versionInfo.latestVersion}
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="text-zinc-500 text-xs font-medium italic flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                You are running the latest version
                            </div>
                        )}
                    </div>
                </div>

                {versionInfo?.updateAvailable && versionInfo.changelog && (
                    <div className="px-6 pb-6 pt-2 border-t border-zinc-800/50 bg-zinc-950/30">
                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest block mb-2">Build Changelog</span>
                        <div className="text-xs text-zinc-400 font-medium whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed border border-zinc-800 p-3 rounded-lg bg-zinc-950/50 italic">
                            {versionInfo.changelog}
                        </div>
                    </div>
                )}

                {versionInfo && (
                    <div className="px-6 py-4 bg-zinc-950/30 border-t border-zinc-800/50">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Environment</span>
                                    <span className="text-xs font-bold text-zinc-200">Docker Container</span>
                                </div>
                            </div>

                            {!versionInfo.dockerSocketAvailable && (
                                <details className="group">
                                    <summary className="list-none cursor-pointer flex items-center justify-end gap-2 text-amber-500 hover:text-amber-400 transition-colors">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Status Check Failed</span>
                                            <span className="text-[8px] font-bold opacity-60">Click for details</span>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-open:rotate-180 transition-transform">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2 5-5"></path><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"></path><path d="M13 3v4a2 2 0 0 0 2 2h4"></path></svg>
                                        </div>
                                    </summary>
                                    <div className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 p-1 rounded bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="font-bold text-zinc-100">Docker Socket Not Available</p>
                                                <p className="text-zinc-400 leading-relaxed">
                                                    One-click updates require permission to talk to the Docker daemon. To enable this, ensure your container has <code className="bg-zinc-800 px-1 rounded text-emerald-400">/var/run/docker.sock</code> mounted as a volume.
                                                </p>
                                                <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 font-mono text-[10px] text-zinc-500">
                                                    services:<br/>
                                                    &nbsp;&nbsp;schedulearr:<br/>
                                                    &nbsp;&nbsp;&nbsp;&nbsp;volumes:<br/>
                                                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- /var/run/docker.sock:/var/run/docker.sock
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Storage Guard */}
            <div className={`bg-zinc-900 border ${isDiskOpen ? 'border-emerald-500/30' : 'border-zinc-800'} rounded-2xl transition-all overflow-hidden shadow-lg`}>
                <button
                    onClick={() => {
                        setIsDiskOpen(!isDiskOpen);
                        if (!isDiskOpen) {
                            fetch('/api/system/disk').then(r => r.ok ? r.json() : null).then(d => { if (d) setDiskInfo(d); }).catch(() => {});
                        }
                    }}
                    className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/50 transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${isDiskOpen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                        </div>
                        <div className="text-left">
                            <h2 className="text-base font-bold text-white tracking-tight">Storage Guard</h2>
                            <p className="text-xs text-zinc-500 font-medium">Monitor disk usage and auto-pause searches when drives are nearly full.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {diskInfo && (
                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                diskInfo.usedPercent >= diskPauseThreshold && diskPauseEnabled
                                    ? 'bg-red-500/20 text-red-400'
                                    : diskInfo.usedPercent >= 80
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                                {diskInfo.usedPercent}% used
                            </div>
                        )}
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-zinc-500 transition-transform duration-300 ${isDiskOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                </button>

                {isDiskOpen && (
                    <div className="p-6 pt-0 border-t border-zinc-800/50 animate-in fade-in slide-in-from-top-4 duration-300 space-y-6 mt-0 pt-6">
                        {/* Disk Usage Bar */}
                        {diskInfo ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Disk Usage</span>
                                    <span className="text-xs font-bold text-zinc-200">
                                        {diskInfo.totalBytes >= 1e12
                                            ? `${(diskInfo.usedBytes / 1e12).toFixed(2)} TB used / ${(diskInfo.totalBytes / 1e12).toFixed(2)} TB total`
                                            : `${(diskInfo.usedBytes / 1e9).toFixed(1)} GB used / ${(diskInfo.totalBytes / 1e9).toFixed(1)} GB total`
                                        }
                                    </span>
                                </div>
                                <div className="relative h-4 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            diskInfo.usedPercent >= 90 ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                                            : diskInfo.usedPercent >= 75 ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                                            : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                        }`}
                                        style={{ width: `${diskInfo.usedPercent}%` }}
                                    />
                                    {diskPauseEnabled && (
                                        <div
                                            className="absolute top-0 bottom-0 w-0.5 bg-white/50 border-r border-dashed border-white/30"
                                            style={{ left: `${diskPauseThreshold}%` }}
                                            title={`Pause threshold: ${diskPauseThreshold}%`}
                                        />
                                    )}
                                </div>
                                <div className="flex justify-between text-[10px] text-zinc-500 font-medium">
                                    <span>{diskInfo.totalBytes >= 1e12 ? `${(diskInfo.freeBytes / 1e12).toFixed(2)} TB free` : `${(diskInfo.freeBytes / 1e9).toFixed(1)} GB free`}</span>
                                    <span className={diskInfo.usedPercent >= diskPauseThreshold && diskPauseEnabled ? 'text-red-400 font-bold' : ''}>{diskInfo.usedPercent}% used</span>
                                </div>

                                {/* Per-instance breakdown */}
                                {diskInfo.byInstance.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                        {diskInfo.byInstance.map((inst: any) => {
                                            const instTotal = inst.folders.reduce((s: number, f: any) => s + f.totalBytes, 0);
                                            const instFree = inst.folders.reduce((s: number, f: any) => s + f.freeBytes, 0);
                                            const instUsed = instTotal - instFree;
                                            const instPct = instTotal > 0 ? Math.round((instUsed / instTotal) * 100) : 0;
                                            return (
                                                <div key={inst.id} className="p-3 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider truncate">{inst.name}</span>
                                                        <span className={`text-[10px] font-bold ${ instPct >= 90 ? 'text-red-400' : instPct >= 75 ? 'text-amber-400' : 'text-emerald-400'}`}>{instPct}%</span>
                                                    </div>
                                                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${instPct >= 90 ? 'bg-red-500' : instPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${instPct}%` }} />
                                                    </div>
                                                    <p className="text-[9px] text-zinc-600">
                                                        {instTotal >= 1e12
                                                            ? `${(instFree / 1e12).toFixed(2)} TB free of ${(instTotal / 1e12).toFixed(2)} TB`
                                                            : `${(instFree / 1e9).toFixed(0)} GB free of ${(instTotal / 1e9).toFixed(0)} GB`
                                                        }
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-zinc-500 text-sm">
                                <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                                Loading disk info...
                            </div>
                        )}

                        {/* Pause Threshold Control */}
                        <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-bold text-zinc-200">Pause Scheduler When Full</div>
                                    <p className="text-[10px] text-zinc-500 font-medium mt-0.5">Automatically skip search batches when disk usage exceeds the threshold.</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const next = !diskPauseEnabled;
                                        setDiskPauseEnabled(next);
                                        updateSetting('disk_pause_enabled', next);
                                    }}
                                    className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 ${ diskPauseEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                                >
                                    <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${diskPauseEnabled ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className={`space-y-2 transition-opacity ${diskPauseEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Pause Threshold (%)</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="50"
                                        max="99"
                                        value={diskPauseThreshold}
                                        onChange={e => {
                                            const val = parseInt(e.target.value);
                                            setDiskPauseThreshold(val);
                                            updateSetting('disk_pause_threshold', val);
                                        }}
                                        className="flex-1 accent-emerald-500"
                                        disabled={!diskPauseEnabled}
                                    />
                                    <span className="text-lg font-black text-emerald-400 w-12 text-right">{diskPauseThreshold}%</span>
                                </div>
                                <p className="text-[10px] text-zinc-500">Scheduler will skip batches when disk usage is at or above this percentage. Default: 90%.</p>
                                {diskInfo && diskPauseEnabled && diskInfo.usedPercent >= diskPauseThreshold && (
                                    <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                        <span className="text-xs font-bold text-red-400">Guard is ACTIVE — Scheduler currently paused ({diskInfo.usedPercent}% ≥ {diskPauseThreshold}%)</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Database Housekeeping section */}
            <div className={`bg-zinc-900 border ${isHousekeepingOpen ? 'border-amber-500/30' : 'border-zinc-800'} rounded-2xl transition-all overflow-hidden shadow-lg`}>
                <button
                    onClick={() => {
                        setIsHousekeepingOpen(!isHousekeepingOpen);
                        if (!isHousekeepingOpen) {
                            fetch('/api/stats/db-info').then(r => r.json()).then(setDbStats).catch(console.error);
                        }
                    }}
                    className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/50 transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${isHousekeepingOpen ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </div>
                        <div className="text-left">
                            <h2 className="text-base font-bold text-white tracking-tight">Database Housekeeping</h2>
                            <p className="text-xs text-zinc-500 font-medium tracking-tight">Manage storage and data retention policies.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {dbStats && (
                            <div className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded-md">
                                {Math.round(dbStats.totalSizeBytes / (1024 * 1024))} MB
                            </div>
                        )}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`text-zinc-500 transition-transform duration-300 ${isHousekeepingOpen ? 'rotate-180' : ''}`}
                        >
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </div>
                </button>

                {isHousekeepingOpen && (
                    <div className="p-6 pt-0 border-t border-zinc-800/50 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                            <div className="space-y-6">
                                <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Retention (Days)</label>
                                        <span className="text-[10px] text-zinc-600 font-bold uppercase">Manual Only</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            min="7"
                                            placeholder="30"
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 outline-none transition-all"
                                            defaultValue={getSettingValue('db_retention_days') || '30'}
                                            onBlur={(e) => updateSetting('db_retention_days', e.target.value)}
                                        />
                                        <button 
                                            onClick={async () => {
                                                const res = await fetch('/api/system/housekeeping/', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ daysToKeep: parseInt(getSettingValue('db_retention_days') || '30') })
                                                });
                                                if (res.ok) {
                                                    toast.success("Cleanup complete!");
                                                    fetch('/api/stats/db-info').then(r => r.json()).then(setDbStats);
                                                }
                                            }}
                                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-600/10 active:scale-95"
                                        >
                                            Cleanup
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">Deletes analytics history and search logs older than X days. Database will verify size after operation.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest block px-1">Growth Metrics</span>
                                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
                                    {dbStats?.tableStats.map((table: any) => (
                                        <div key={table.name} className="flex items-center justify-between p-3 bg-zinc-950/30 rounded-lg border border-zinc-800/50">
                                            <span className="text-xs font-medium text-zinc-400 capitalize">{table.name.replace(/_/g, ' ')}</span>
                                            <span className="text-xs font-bold text-zinc-200">{table.count.toLocaleString()} rows</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Support section continues... */}
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
                        <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                            I built Schedulearr to scratch my own itch, and it's amazing to see others finding it useful. Your support helps me keep improving it and motivates me to build more cool things.
                        </p>
                        <p className="text-[10px] text-zinc-500 mb-8 italic">
                            * Note: I'm a PhD student in Nanotechnology from Portugal, and this project helps me pay my tuition. While not strictly enforced by the license, I politely ask that if you modify or redistribute this software, you keep this attribution link intact to support the original project.
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

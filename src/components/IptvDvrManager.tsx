'use client';

import React, { useState, useEffect } from 'react';
import {
    Tv, Folder, Plus, Trash2, Settings, RefreshCw, Layers,
    Sparkles, Film, Calendar, Check, AlertCircle, Play, X,
    HardDrive, Clock, CheckCircle2, ShieldCheck, Search
} from 'lucide-react';
import { toast } from 'sonner';
import { AddIptvProviderModal } from './AddIptvProviderModal';
import IptvSettingsModal from './IptvSettingsModal';
import IptvAutoGroupingModal, { IptvChannel } from './IptvAutoGroupingModal';

interface DvrStorageFolder {
    id: string;
    path: string;
    name: string;
    is_default: boolean;
}

interface DvrRule {
    id: string;
    name: string;
    query: string;
    rule_type: 'sports' | 'actor' | 'keyword' | 'title';
    channel_scope: string;
    check_missing_from_library: boolean;
    destination_folder: string;
    padding_minutes: number;
    enabled: boolean;
}

interface DvrRecording {
    id: string;
    rule_id?: string;
    channel_id: string;
    channel_name: string;
    channel_logo?: string;
    program_title: string;
    start_time: string;
    end_time: string;
    destination_path: string;
    file_path?: string;
    file_size?: number;
    status: 'scheduled' | 'recording' | 'completed' | 'failed' | 'cancelled';
    error_message?: string;
}

export function IptvDvrManager() {
    const [libraries, setLibraries] = useState<any[]>([]);
    const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
    const [channels, setChannels] = useState<IptvChannel[]>([]);
    const [folders, setFolders] = useState<DvrStorageFolder[]>([]);
    const [rules, setRules] = useState<DvrRule[]>([]);
    const [recordings, setRecordings] = useState<DvrRecording[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAutoGroupOpen, setIsAutoGroupOpen] = useState(false);
    const [isNewRuleOpen, setIsNewRuleOpen] = useState(false);
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);

    // New folder form
    const [newFolderPath, setNewFolderPath] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderDefault, setNewFolderDefault] = useState(false);

    // New rule form
    const [ruleName, setRuleName] = useState('');
    const [ruleQuery, setRuleQuery] = useState('');
    const [ruleType, setRuleType] = useState<'sports' | 'actor' | 'keyword' | 'title'>('sports');
    const [ruleChannelScope, setRuleChannelScope] = useState('all');
    const [ruleMissingOnly, setRuleMissingOnly] = useState(true);
    const [ruleFolder, setRuleFolder] = useState('');
    const [rulePadding, setRulePadding] = useState(15);

    const activeLibrary = libraries.find(l => l.id === selectedLibraryId) || libraries[0];

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const libRes = await fetch('/api/theater/libraries');
            const libData = await libRes.json();
            const liveLibs = (libData.libraries || []).filter((l: any) => l.type === 'live');
            setLibraries(liveLibs);
            const activeId = selectedLibraryId || liveLibs[0]?.id || '';
            setSelectedLibraryId(activeId);

            if (activeId) {
                const chanRes = await fetch(`/api/theater/iptv?libraryId=${activeId}`);
                if (chanRes.ok) {
                    const chanData = await chanRes.json();
                    setChannels(chanData.channels || []);
                }
            }

            const dvrRes = await fetch('/api/theater/iptv/dvr');
            if (dvrRes.ok) {
                const dvrData = await dvrRes.json();
                setFolders(dvrData.folders || []);
                setRules(dvrData.rules || []);
                setRecordings(dvrData.recordings || []);
                if (dvrData.folders?.length > 0 && !ruleFolder) {
                    setRuleFolder(dvrData.folders[0].path);
                }
            }
        } catch (e) {
            console.error('Failed to load IPTV/DVR data:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const handleAddFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderPath.trim()) return;
        try {
            const res = await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add_folder',
                    path: newFolderPath.trim(),
                    name: newFolderName.trim() || undefined,
                    isDefault: newFolderDefault
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success('DVR folder added');
            setNewFolderPath('');
            setNewFolderName('');
            setNewFolderDefault(false);
            setIsNewFolderOpen(false);
            fetchAllData();
        } catch (err: any) {
            toast.error(err.message || 'Error adding folder');
        }
    };

    const handleDeleteFolder = async (id: string) => {
        try {
            await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_folder', id })
            });
            toast.success('Folder removed');
            fetchAllData();
        } catch {
            toast.error('Failed to delete folder');
        }
    };

    const handleSaveRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ruleName || !ruleQuery || !ruleFolder) {
            toast.error('Please fill in rule name, query, and choose a destination folder');
            return;
        }

        try {
            const res = await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_rule',
                    rule: {
                        name: ruleName,
                        query: ruleQuery,
                        rule_type: ruleType,
                        channel_scope: ruleChannelScope,
                        check_missing_from_library: ruleMissingOnly,
                        destination_folder: ruleFolder,
                        padding_minutes: rulePadding,
                        enabled: true
                    }
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(`Rule "${ruleName}" created`);
            setIsNewRuleOpen(false);
            setRuleName('');
            setRuleQuery('');
            fetchAllData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to create rule');
        }
    };

    const handleDeleteRule = async (id: string) => {
        try {
            await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_rule', id })
            });
            toast.success('Rule deleted');
            fetchAllData();
        } catch {
            toast.error('Failed to delete rule');
        }
    };

    const handleCancelRecording = async (id: string) => {
        try {
            await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel_recording', id })
            });
            toast.success('Recording cancelled');
            fetchAllData();
        } catch {
            toast.error('Failed to cancel recording');
        }
    };

    const handleScanRules = async () => {
        if (!activeLibrary?.id) return;
        try {
            toast.info('Scanning upcoming EPG schedule for matching rules...');
            const res = await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'scan_rules', libraryId: activeLibrary.id })
            });
            const data = await res.json();
            if (data.matchedCount > 0) {
                toast.success(`Found & scheduled ${data.matchedCount} matching broadcast(s)!`);
            } else {
                toast.info('No new broadcasts matched active rules in current guide.');
            }
            fetchAllData();
        } catch {
            toast.error('Error scanning rules');
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header & Provider Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
                        <Tv size={28} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white flex items-center gap-2">
                            Live TV &amp; DVR Configuration Hub
                        </h2>
                        <p className="text-xs text-zinc-400 mt-1">
                            Manage IPTV providers, EPG guides, stream redundancy groupings, and automated DVR recording rules.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => setIsAddProviderOpen(true)}
                        className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                        <Plus size={14} /> Add IPTV Provider
                    </button>
                    {activeLibrary && (
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <Calendar size={14} /> EPG &amp; Sync
                        </button>
                    )}
                </div>
            </div>

            {/* Provider Details & Quick Actions Bar */}
            {activeLibrary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 bg-zinc-900/40 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Active Provider</span>
                            <h3 className="text-base font-black text-white">{activeLibrary.name}</h3>
                            <span className="text-xs text-amber-400 font-bold">{channels.length} Total Channels</span>
                        </div>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-300 text-xs font-bold cursor-pointer"
                            title="Edit Provider & EPG URL"
                        >
                            <Settings size={16} />
                        </button>
                    </div>

                    <div className="p-5 bg-zinc-900/40 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Channel Grouping &amp; Redundancy</span>
                            <h3 className="text-base font-black text-white">Auto-Grouping Engine</h3>
                            <p className="text-xs text-zinc-400">Detect &amp; merge 4K/FHD/HD variants</p>
                        </div>
                        <button
                            onClick={() => setIsAutoGroupOpen(true)}
                            className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                        >
                            <Sparkles size={14} /> Suggestions
                        </button>
                    </div>

                    <div className="p-5 bg-zinc-900/40 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Automated Smart DVR</span>
                            <h3 className="text-base font-black text-white">{rules.length} Active Rules</h3>
                            <p className="text-xs text-zinc-400">{recordings.length} Scheduled/Completed</p>
                        </div>
                        <button
                            onClick={handleScanRules}
                            className="px-3.5 py-2 bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                            title="Scan Guide Schedule for Rule Matches"
                        >
                            <RefreshCw size={14} /> Scan Guide
                        </button>
                    </div>
                </div>
            )}

            {/* DVR Recording Storage Folders Section */}
            <div className="bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                            <Folder size={18} className="text-amber-400" />
                            DVR Recording Storage Folders
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Directories where captured broadcasts and scheduled recordings will be saved.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsNewFolderOpen(true)}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                        <Plus size={14} /> Add Folder
                    </button>
                </div>

                {isNewFolderOpen && (
                    <form onSubmit={handleAddFolder} className="p-4 bg-zinc-950 rounded-2xl border border-amber-500/30 space-y-3 animate-in fade-in">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-amber-400 uppercase">Add Storage Destination</span>
                            <button type="button" onClick={() => setIsNewFolderOpen(false)} className="text-zinc-500 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-bold text-zinc-400 block mb-1">Directory Path</label>
                                <input
                                    type="text"
                                    placeholder="e.g. /mnt/user/media/recordings or C:\Recordings"
                                    value={newFolderPath}
                                    onChange={e => setNewFolderPath(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-zinc-400 block mb-1">Display Label (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Sports DVR / Movies DVR"
                                    value={newFolderName}
                                    onChange={e => setNewFolderName(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                            <label className="flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={newFolderDefault}
                                    onChange={e => setNewFolderDefault(e.target.checked)}
                                    className="w-4 h-4 rounded text-amber-500"
                                />
                                Set as default recording folder
                            </label>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl cursor-pointer"
                            >
                                Save Folder
                            </button>
                        </div>
                    </form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {folders.length === 0 ? (
                        <div className="col-span-full p-8 text-center bg-zinc-950/50 rounded-2xl border border-zinc-900 text-zinc-500">
                            <Folder size={28} className="mx-auto mb-2 text-zinc-700" />
                            <p className="text-xs font-bold text-zinc-400">No DVR storage folders configured yet</p>
                            <p className="text-[11px] mt-0.5">Add a directory above so recordings have a destination folder to save files.</p>
                        </div>
                    ) : (
                        folders.map(f => (
                            <div key={f.id} className="p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-white">{f.name}</span>
                                        {f.is_default && (
                                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-zinc-500 font-mono block truncate max-w-[220px]">{f.path}</span>
                                </div>
                                <button
                                    onClick={() => handleDeleteFolder(f.id)}
                                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Smart DVR Rules Engine Section */}
            <div className="bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                            <Sparkles size={18} className="text-purple-400" />
                            Smart DVR Automated Recording Rules
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Automate recording by sports teams (e.g. "Benfica"), tournament events (e.g. "Real Madrid Champions League"), or actor films missing from library.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsNewRuleOpen(true)}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-purple-400 border border-purple-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                        <Plus size={14} /> New Smart Rule
                    </button>
                </div>

                {isNewRuleOpen && (
                    <form onSubmit={handleSaveRule} className="p-5 bg-zinc-950 rounded-2xl border border-purple-500/30 space-y-4 animate-in fade-in">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-purple-400 uppercase">Create Automated Recording Rule</span>
                            <button type="button" onClick={() => setIsNewRuleOpen(false)} className="text-zinc-500 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div>
                                <label className="text-[11px] font-bold text-zinc-400 block mb-1">Rule Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. All Benfica Matches"
                                    value={ruleName}
                                    onChange={e => setRuleName(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-zinc-400 block mb-1">Match Query / Keywords</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Benfica OR Real Madrid Champions League OR Bruce Willis"
                                    value={ruleQuery}
                                    onChange={e => setRuleQuery(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-zinc-400 block mb-1">Rule Type</label>
                                <select
                                    value={ruleType}
                                    onChange={e => setRuleType(e.target.value as any)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                                >
                                    <option value="sports">Sports Match / Team</option>
                                    <option value="actor">Actor / Cast Member</option>
                                    <option value="keyword">Keyword / Tournament</option>
                                    <option value="title">Movie / Show Title</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-zinc-400 block mb-1">Destination Storage Folder</label>
                                <select
                                    value={ruleFolder}
                                    onChange={e => setRuleFolder(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                                    required
                                >
                                    {folders.map(f => (
                                        <option key={f.id} value={f.path}>{f.name} ({f.path})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-zinc-400 block mb-1">Post-Broadcast Overtime Padding</label>
                                <select
                                    value={rulePadding}
                                    onChange={e => setRulePadding(parseInt(e.target.value))}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                                >
                                    <option value={0}>0 minutes</option>
                                    <option value={15}>+15 minutes (Standard)</option>
                                    <option value={30}>+30 minutes (Sports Overtime)</option>
                                    <option value={60}>+60 minutes (Heavy Overtime)</option>
                                </select>
                            </div>

                            <div className="flex items-center pt-5">
                                <label className="flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={ruleMissingOnly}
                                        onChange={e => setRuleMissingOnly(e.target.checked)}
                                        className="w-4 h-4 rounded text-purple-500"
                                    />
                                    Only record if missing from library
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                type="submit"
                                className="px-5 py-2 bg-purple-500 hover:bg-purple-400 text-white font-black text-xs rounded-xl cursor-pointer shadow-lg shadow-purple-500/20"
                            >
                                Create Automation Rule
                            </button>
                        </div>
                    </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rules.length === 0 ? (
                        <div className="col-span-full p-8 text-center bg-zinc-950/50 rounded-2xl border border-zinc-900 text-zinc-500">
                            <Sparkles size={28} className="mx-auto mb-2 text-zinc-700" />
                            <p className="text-xs font-bold text-zinc-400">No automated recording rules active</p>
                            <p className="text-[11px] mt-0.5">Click "New Smart Rule" to automate recordings for your favorite football clubs, actors, or competitions.</p>
                        </div>
                    ) : (
                        rules.map(r => (
                            <div key={r.id} className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                        <span className="text-sm font-black text-white">{r.name}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteRule(r.id)}
                                        className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg cursor-pointer"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                                    <span className="px-2 py-0.5 rounded bg-zinc-900 text-purple-300 border border-purple-500/20">
                                        Query: "{r.query}"
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400">
                                        Type: {r.rule_type}
                                    </span>
                                    {r.check_missing_from_library && (
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                            ✓ Skip if in library
                                        </span>
                                    )}
                                    <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-500">
                                        +{r.padding_minutes}m padding
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* DVR Scheduled & Completed Recordings Ledger */}
            <div className="bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                            <Clock size={18} className="text-sky-400" />
                            DVR Recordings Ledger
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Scheduled broadcast timers, active captures, and completed recordings.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    {recordings.length === 0 ? (
                        <div className="p-8 text-center bg-zinc-950/50 rounded-2xl border border-zinc-900 text-zinc-500">
                            <Clock size={28} className="mx-auto mb-2 text-zinc-700" />
                            <p className="text-xs font-bold text-zinc-400">No recordings in ledger</p>
                            <p className="text-[11px] mt-0.5">Right-click any broadcast in the Theater Zapping guide to schedule a recording.</p>
                        </div>
                    ) : (
                        recordings.map(rec => {
                            const isLive = rec.status === 'recording';
                            const isDone = rec.status === 'completed';
                            const isFailed = rec.status === 'failed';
                            return (
                                <div key={rec.id} className="p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full shrink-0 ${
                                            isLive ? 'bg-red-500 animate-pulse' : isDone ? 'bg-emerald-500' : isFailed ? 'bg-red-700' : 'bg-amber-500'
                                        }`} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-white">{rec.program_title}</span>
                                                <span className="text-[10px] text-zinc-400 font-bold">({rec.channel_name})</span>
                                            </div>
                                            <span className="text-[11px] text-zinc-500">
                                                {new Date(rec.start_time).toLocaleString()} &rarr; {new Date(rec.end_time).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                            isLive ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                            isDone ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                            isFailed ? 'bg-red-500/20 text-red-500' : 'bg-zinc-800 text-zinc-300'
                                        }`}>
                                            {rec.status}
                                        </span>
                                        {(isLive || rec.status === 'scheduled') && (
                                            <button
                                                onClick={() => handleCancelRecording(rec.id)}
                                                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 text-xs font-bold cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <AddIptvProviderModal
                isOpen={isAddProviderOpen}
                onClose={() => setIsAddProviderOpen(false)}
                onAdded={fetchAllData}
            />

            {activeLibrary && (
                <IptvSettingsModal
                    isOpen={isSettingsOpen}
                    library={activeLibrary}
                    onClose={() => setIsSettingsOpen(false)}
                    onUpdated={fetchAllData}
                />
            )}

            {activeLibrary && (
                <IptvAutoGroupingModal
                    isOpen={isAutoGroupOpen}
                    libraryId={activeLibrary.id}
                    channels={channels}
                    onClose={() => setIsAutoGroupOpen(false)}
                    onApplied={fetchAllData}
                />
            )}
        </div>
    );
}

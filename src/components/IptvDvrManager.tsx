'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Tv, Folder, Plus, Trash2, Settings, RefreshCw, Layers,
    Sparkles, Calendar, Check, AlertCircle, Play, X,
    HardDrive, Clock, CheckCircle2, ShieldCheck, Search,
    Bookmark, LayoutGrid, List as Rows, Tv2, Edit3, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { AddIptvProviderModal } from './AddIptvProviderModal';
import IptvSettingsModal from './IptvSettingsModal';
import IptvAutoGroupingModal, { IptvChannel } from './IptvAutoGroupingModal';
import { ConfirmModal } from './ConfirmModal';

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

interface IptvShortlist {
    id: string;
    library_id: string;
    name: string;
    channelIds: string[];
}

export function IptvDvrManager() {
    const [libraries, setLibraries] = useState<any[]>([]);
    const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
    const [channels, setChannels] = useState<IptvChannel[]>([]);
    const [groups, setGroups] = useState<{ name: string; count: number }[]>([]);
    const [shortlists, setShortlists] = useState<IptvShortlist[]>([]);
    const [folders, setFolders] = useState<DvrStorageFolder[]>([]);
    const [rules, setRules] = useState<DvrRule[]>([]);
    const [recordings, setRecordings] = useState<DvrRecording[]>([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<'guide' | 'shortlists' | 'providers' | 'storage' | 'rules' | 'recordings'>('guide');

    const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAutoGroupOpen, setIsAutoGroupOpen] = useState(false);
    const [isNewRuleOpen, setIsNewRuleOpen] = useState(false);
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);

    // Guide State
    const [guideMap, setGuideMap] = useState<Record<string, any[]>>({});
    const [loadingGuide, setLoadingGuide] = useState(false);
    const [guideSearch, setGuideSearch] = useState('');
    const [guideGroup, setGuideGroup] = useState('ALL');
    const [guideShortlist, setGuideShortlist] = useState('ALL');
    const [selectedGuideProgram, setSelectedGuideProgram] = useState<{ channel: IptvChannel; program: any } | null>(null);
    const [guideRecordingFolder, setGuideRecordingFolder] = useState('');
    const [guideRecordingPadding, setGuideRecordingPadding] = useState(15);
    const [isSchedulingGuide, setIsSchedulingGuide] = useState(false);

    // Timeline Time Navigation State
    const [timelineWindowStart, setTimelineWindowStart] = useState<Date>(() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
        d.setHours(d.getHours() - 1);
        return d;
    });
    const [timelineWindowHours, setTimelineWindowHours] = useState<number>(4);
    const [guideViewMode, setGuideViewMode] = useState<'timeline' | 'cards'>('timeline');

    // Single Channel Full Schedule State
    const [singleChannelSchedule, setSingleChannelSchedule] = useState<{
        channel: IptvChannel;
        programs: any[];
        selectedDate: string;
        loading: boolean;
        search: string;
    } | null>(null);

    const [isShortlistModalOpen, setIsShortlistModalOpen] = useState(false);
    const [editingShortlistId, setEditingShortlistId] = useState<string | null>(null);
    const [shortlistName, setShortlistName] = useState('');
    const [shortlistSelectedIds, setShortlistSelectedIds] = useState<string[]>([]);
    const [shortlistSearch, setShortlistSearch] = useState('');
    const [shortlistCategory, setShortlistCategory] = useState('ALL');
    const [shortlistFilterMode, setShortlistFilterMode] = useState<'selected' | 'all'>('selected');
    const [shortlistViewMode, setShortlistViewMode] = useState<'grid' | 'list'>('grid');
    const [isSavingShortlist, setIsSavingShortlist] = useState(false);
    const [confirmModalState, setConfirmModalState] = useState<{
        isOpen: boolean;
        title: string;
        description: React.ReactNode;
        confirmText?: string;
        onConfirm: () => void | Promise<void>;
        loading?: boolean;
    }>({
        isOpen: false,
        title: '',
        description: '',
        onConfirm: () => {}
    });

    const [newFolderPath, setNewFolderPath] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderDefault, setNewFolderDefault] = useState(false);

    const [ruleName, setRuleName] = useState('');
    const [ruleQuery, setRuleQuery] = useState('');
    const [ruleType, setRuleType] = useState<'sports' | 'actor' | 'keyword' | 'title'>('sports');
    const [ruleMissingOnly, setRuleMissingOnly] = useState(true);
    const [ruleFolder, setRuleFolder] = useState('');
    const [rulePadding, setRulePadding] = useState(15);

    const activeLibrary = libraries.find(l => l.id === selectedLibraryId) || libraries[0];

    const fetchAllData = async (targetLibId?: string) => {
        setLoading(true);
        try {
            const libRes = await fetch('/api/theater/libraries');
            const libData = await libRes.json();
            const liveLibs = (libData.libraries || []).filter((l: any) => l.type === 'live');
            setLibraries(liveLibs);
            const activeId = targetLibId || selectedLibraryId || liveLibs[0]?.id || '';
            setSelectedLibraryId(activeId);

            if (activeId) {
                const [chanRes, shortRes] = await Promise.all([
                    fetch(`/api/theater/iptv?libraryId=${activeId}`).catch(() => null),
                    fetch(`/api/theater/iptv/shortlists?libraryId=${activeId}`).catch(() => null)
                ]);

                if (chanRes && chanRes.ok) {
                    const chanData = await chanRes.json();
                    const fetchedChans = chanData.channels || [];
                    setChannels(fetchedChans);
                    setGroups(chanData.groups || []);
                    fetchGuideData(activeId, fetchedChans);
                }
                if (shortRes && shortRes.ok) {
                    const sData = await shortRes.json();
                    setShortlists(sData.shortlists || []);
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
            console.error('Failed to load data:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchGuideData = async (libId: string, chanList: IptvChannel[]) => {
        if (!libId || chanList.length === 0) return;
        const tvgIds = chanList
            .slice(0, 150)
            .flatMap(c => [c.tvgId, c.tvgName, c.cleanName, c.name].filter(Boolean)) as string[];

        if (tvgIds.length === 0) return;
        setLoadingGuide(true);
        try {
            const uniqueIds = Array.from(new Set(tvgIds));
            const res = await fetch(`/api/theater/iptv/epg?libraryId=${libId}&tvgIds=${encodeURIComponent(uniqueIds.join(','))}`);
            if (res.ok) {
                const data = await res.json();
                if (data.epg) {
                    setGuideMap(data.epg);
                }
            }
        } catch {} finally {
            setLoadingGuide(false);
        }
    };

    const getChannelPrograms = (chan: IptvChannel): any[] => {
        return (
            (chan.tvgId && guideMap[chan.tvgId]) ||
            (chan.tvgId && guideMap[chan.tvgId.toLowerCase()]) ||
            (chan.cleanName && guideMap[chan.cleanName]) ||
            (chan.cleanName && guideMap[chan.cleanName.toLowerCase()]) ||
            (chan.name && guideMap[chan.name]) ||
            (chan.name && guideMap[chan.name.toLowerCase()]) ||
            []
        );
    };

    const visibleGuideChannels = useMemo(() => {
        let list = channels;
        if (guideShortlist !== 'ALL') {
            const sl = shortlists.find(s => s.id === guideShortlist);
            if (sl && sl.channelIds.length > 0) {
                const set = new Set(sl.channelIds);
                const lowerNames = new Set(sl.channelIds.map(x => String(x).toLowerCase()));
                list = list.filter(c =>
                    set.has(c.id) ||
                    (c.tvgId && set.has(c.tvgId)) ||
                    (c.cleanName && lowerNames.has(c.cleanName.toLowerCase())) ||
                    (c.name && lowerNames.has(c.name.toLowerCase()))
                );
            }
        }
        if (guideGroup !== 'ALL') {
            list = list.filter(c => c.group === guideGroup);
        }
        if (guideSearch.trim()) {
            const q = guideSearch.toLowerCase().trim();
            list = list.filter(c => {
                const chanMatch = c.name.toLowerCase().includes(q) || (c.cleanName && c.cleanName.toLowerCase().includes(q));
                if (chanMatch) return true;
                const progs = getChannelPrograms(c);
                return progs.some(p => p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
            });
        }
        return list;
    }, [channels, guideShortlist, shortlists, guideGroup, guideSearch, guideMap]);

    const totalGuidePrograms = useMemo(() => {
        let count = 0;
        for (const k of Object.keys(guideMap)) {
            count += (guideMap[k] || []).length;
        }
        return count;
    }, [guideMap]);

    const handleScheduleGuideRecording = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGuideProgram || !guideRecordingFolder) {
            toast.error('Please select a destination folder');
            return;
        }
        setIsSchedulingGuide(true);
        try {
            const res = await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'schedule_program',
                    channel: selectedGuideProgram.channel,
                    program: selectedGuideProgram.program,
                    destinationFolder: guideRecordingFolder,
                    paddingMinutes: guideRecordingPadding
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(`Scheduled recording for "${selectedGuideProgram.program.title}"`);
            setSelectedGuideProgram(null);
            fetchAllData(selectedLibraryId);
        } catch (err: any) {
            toast.error(err.message || 'Failed to schedule recording');
        } finally {
            setIsSchedulingGuide(false);
        }
    };

    const shiftTimelineTime = (hours: number) => {
        setTimelineWindowStart(prev => {
            const next = new Date(prev.getTime() + hours * 3600 * 1000);
            return next;
        });
    };

    const jumpToNow = () => {
        const d = new Date();
        d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
        d.setHours(d.getHours() - 1);
        setTimelineWindowStart(d);
    };

    const jumpToDate = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 8, 0, 0);
            setTimelineWindowStart(d);
        }
    };

    const openSingleChannelSchedule = async (channel: IptvChannel) => {
        const todayStr = new Date().toISOString().split('T')[0];
        setSingleChannelSchedule({
            channel,
            programs: [],
            selectedDate: todayStr,
            loading: true,
            search: ''
        });

        if (!selectedLibraryId) return;

        try {
            const tvgId = channel.tvgId || channel.name;
            const res = await fetch(`/api/theater/iptv/epg?libraryId=${selectedLibraryId}&tvgId=${encodeURIComponent(tvgId)}`);
            if (res.ok) {
                const data = await res.json();
                setSingleChannelSchedule(prev => prev ? {
                    ...prev,
                    programs: Array.isArray(data.programs) ? data.programs : [],
                    loading: false
                } : null);
            } else {
                setSingleChannelSchedule(prev => prev ? { ...prev, loading: false } : null);
            }
        } catch {
            setSingleChannelSchedule(prev => prev ? { ...prev, loading: false } : null);
        }
    };

    const handleSelectLibrary = (libId: string) => {
        setSelectedLibraryId(libId);
        fetchAllData(libId);
    };

    const openCreateShortlist = () => {
        setEditingShortlistId(null);
        setShortlistName('');
        setShortlistSelectedIds([]);
        setShortlistSearch('');
        setShortlistCategory('ALL');
        setShortlistFilterMode('all');
        setIsShortlistModalOpen(true);
    };

    const openEditShortlist = (sl: IptvShortlist) => {
        setEditingShortlistId(sl.id);
        setShortlistName(sl.name);
        setShortlistSelectedIds(sl.channelIds || []);
        setShortlistSearch('');
        setShortlistCategory('ALL');
        setShortlistFilterMode('selected');
        setIsShortlistModalOpen(true);
    };

    const handleSaveShortlist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!shortlistName.trim() || !activeLibrary?.id) {
            toast.error('Shortlist name is required');
            return;
        }

        setIsSavingShortlist(true);
        try {
            const res = await fetch('/api/theater/iptv/shortlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingShortlistId || undefined,
                    libraryId: activeLibrary.id,
                    name: shortlistName.trim(),
                    channelIds: shortlistSelectedIds
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success(`Shortlist "${shortlistName.trim()}" saved!`);
            setIsShortlistModalOpen(false);
            fetchAllData(activeLibrary.id);
        } catch (err: any) {
            toast.error(err.message || 'Failed to save shortlist');
        } finally {
            setIsSavingShortlist(false);
        }
    };

    const handleDeleteShortlist = (id: string, name: string) => {
        setConfirmModalState({
            isOpen: true,
            title: 'Delete Shortlist',
            description: <span>Are you sure you want to delete shortlist <strong className="text-white">"{name}"</strong>?</span>,
            confirmText: 'Delete Shortlist',
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/theater/iptv/shortlists?id=${id}`, {
                        method: 'DELETE'
                    });
                    if (res.ok) {
                        toast.success('Shortlist deleted');
                        setConfirmModalState(prev => ({ ...prev, isOpen: false }));
                        fetchAllData(activeLibrary?.id);
                    }
                } catch {
                    toast.error('Failed to delete shortlist');
                }
            }
        });
    };

    const filteredShortlistChannels = useMemo(() => {
        let list = channels;
        if (shortlistFilterMode === 'selected') {
            const set = new Set(shortlistSelectedIds);
            const lowerNames = new Set(shortlistSelectedIds.map(x => String(x).toLowerCase()));
            list = list.filter(c =>
                set.has(c.id) ||
                (c.tvgId && set.has(c.tvgId)) ||
                (c.cleanName && lowerNames.has(c.cleanName.toLowerCase())) ||
                (c.name && lowerNames.has(c.name.toLowerCase()))
            );
        }
        if (shortlistCategory !== 'ALL') {
            list = list.filter(c => c.group === shortlistCategory);
        }
        if (shortlistSearch.trim()) {
            const q = shortlistSearch.toLowerCase().trim();
            list = list.filter(c =>
                c.name.toLowerCase().includes(q) ||
                (c.cleanName && c.cleanName.toLowerCase().includes(q)) ||
                c.group.toLowerCase().includes(q)
            );
        }
        return list;
    }, [channels, shortlistFilterMode, shortlistSelectedIds, shortlistCategory, shortlistSearch]);

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
            toast.success('Storage folder added');
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

    const handleDeleteProvider = (id: string, name: string) => {
        setConfirmModalState({
            isOpen: true,
            title: 'Delete IPTV Provider',
            description: (
                <span>
                    Are you sure you want to delete IPTV provider <strong className="text-white">"{name}"</strong>? This will permanently remove all of its channels, guide schedules, and shortlists.
                </span>
            ),
            confirmText: 'Delete Provider',
            onConfirm: async () => {
                setConfirmModalState(prev => ({ ...prev, loading: true }));
                try {
                    const res = await fetch(`/api/theater/libraries?id=${encodeURIComponent(id)}`, {
                        method: 'DELETE'
                    });
                    if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || 'Failed to delete IPTV provider');
                    }
                    toast.success(`Provider "${name}" deleted`);
                    setConfirmModalState(prev => ({ ...prev, isOpen: false, loading: false }));
                    fetchAllData();
                } catch (err: any) {
                    console.error('Delete provider error:', err);
                    toast.error(err.message || 'Failed to delete provider');
                    setConfirmModalState(prev => ({ ...prev, loading: false }));
                }
            }
        });
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
                        channel_scope: 'all',
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
            toast.info('Scanning guide schedule for matching rules...');
            const res = await fetch('/api/theater/iptv/dvr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'scan_rules', libraryId: activeLibrary.id })
            });
            const data = await res.json();
            if (data.matchedCount > 0) {
                toast.success(`Found & scheduled ${data.matchedCount} broadcast(s)!`);
            } else {
                toast.info('No new broadcasts matched active rules in current guide.');
            }
            fetchAllData();
        } catch {
            toast.error('Error scanning rules');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
                        <Tv size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            Live TV &amp; DVR Setup
                        </h2>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Manage IPTV providers, curated shortlists, stream quality groupings, storage folders, and recording rules.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {libraries.length > 1 && (
                        <select
                            value={selectedLibraryId}
                            onChange={e => handleSelectLibrary(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-500"
                        >
                            {libraries.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    )}

                    <button
                        onClick={() => setIsAddProviderOpen(true)}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                        <Plus size={14} /> Add Provider
                    </button>

                    {activeLibrary && (
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                            title="EPG Sync & Provider Settings"
                        >
                            <Settings size={14} /> Sync &amp; EPG
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3 overflow-x-auto custom-scrollbar">
                {[
                    { id: 'guide', label: 'Guide', count: totalGuidePrograms, icon: Calendar },
                    { id: 'shortlists', label: 'Shortlists', count: shortlists.length, icon: Bookmark },
                    { id: 'providers', label: 'Providers', count: libraries.length, icon: Tv },
                    { id: 'storage', label: 'Storage', count: folders.length, icon: Folder },
                    { id: 'rules', label: 'Rules', count: rules.length, icon: Sparkles },
                    { id: 'recordings', label: 'Recordings', count: recordings.length, icon: Clock }
                ].map(t => {
                    const isActive = activeTab === t.id;
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${
                                isActive
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                            }`}
                        >
                            <Icon size={14} />
                            <span>{t.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-500'}`}>
                                {t.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ══════════════════════════════════════════════════════════════
               1. GUIDE TAB (Schedule Timeline Grid & Single Channel Schedule)
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'guide' && (
                <div className="space-y-4">
                    {/* Header & Controls */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Calendar size={18} className="text-amber-400" />
                                EPG TV Guide &amp; Schedule
                            </h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Travel forwards and backwards in time, view full 7-day schedules for any channel, and schedule DVR recordings.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {/* View Switcher */}
                            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
                                <button
                                    onClick={() => setGuideViewMode('timeline')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        guideViewMode === 'timeline' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Timeline Grid
                                </button>
                                <button
                                    onClick={() => setGuideViewMode('cards')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        guideViewMode === 'cards' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Channel Cards
                                </button>
                            </div>

                            {activeLibrary && (
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                                >
                                    <RefreshCw size={13} className={loadingGuide ? 'animate-spin' : ''} /> Sync EPG
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter & Time Navigation Bar */}
                    <div className="space-y-3 p-3 bg-zinc-950/90 rounded-2xl border border-zinc-800/90">
                        {/* Row 1: Search & Channel Filters */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search shows, movies, sports, or channels..."
                                    value={guideSearch}
                                    onChange={e => setGuideSearch(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500"
                                />
                                {guideSearch && (
                                    <button
                                        onClick={() => setGuideSearch('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            {shortlists.length > 0 && (
                                <select
                                    value={guideShortlist}
                                    onChange={e => setGuideShortlist(e.target.value)}
                                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-500"
                                >
                                    <option value="ALL">All Channels</option>
                                    {shortlists.map(sl => (
                                        <option key={sl.id} value={sl.id}>⭐ {sl.name} ({sl.channelIds?.length || 0})</option>
                                    ))}
                                </select>
                            )}

                            {groups.length > 0 && (
                                <select
                                    value={guideGroup}
                                    onChange={e => setGuideGroup(e.target.value)}
                                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-500 max-w-[180px]"
                                >
                                    <option value="ALL">All Categories ({channels.length})</option>
                                    {groups.map(g => (
                                        <option key={g.name} value={g.name}>{g.name} ({g.count})</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Row 2: Time Travel & Date Controls */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-900">
                            {/* Time Shifts */}
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                                <button
                                    onClick={() => shiftTimelineTime(-2)}
                                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                                    title="Go back 2 hours"
                                >
                                    ◀ -2h
                                </button>
                                <button
                                    onClick={jumpToNow}
                                    className="px-3.5 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 transition-colors flex items-center gap-1.5 cursor-pointer font-black"
                                >
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    NOW
                                </button>
                                <button
                                    onClick={() => shiftTimelineTime(2)}
                                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                                    title="Go forward 2 hours"
                                >
                                    +2h ▶
                                </button>
                            </div>

                            {/* Active Time Window Label & Duration Selector */}
                            <div className="flex items-center gap-3 text-xs">
                                <div className="text-zinc-400 font-mono font-bold flex items-center gap-1.5">
                                    <Clock size={13} className="text-amber-400" />
                                    <span>
                                        {timelineWindowStart.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                        {' '}
                                        {timelineWindowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {' - '}
                                        {new Date(timelineWindowStart.getTime() + timelineWindowHours * 3600 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 text-[11px] font-bold">
                                    {[2, 4, 6].map(h => (
                                        <button
                                            key={h}
                                            onClick={() => setTimelineWindowHours(h)}
                                            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                                timelineWindowHours === h ? 'bg-amber-500 text-black font-black' : 'text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            {h}h
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Unsynced EPG Banner */}
                    {totalGuidePrograms === 0 && !loadingGuide && channels.length > 0 && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 text-amber-300 font-bold">
                                <Calendar size={16} className="text-amber-400 shrink-0" />
                                <span>EPG guide is not synced yet for this provider. Sync now to see full TV schedules.</span>
                            </div>
                            <button
                                onClick={() => setIsSettingsOpen(true)}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl shadow-md cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                            >
                                <RefreshCw size={12} /> Sync Guide
                            </button>
                        </div>
                    )}

                    {/* Guide Channels & Programs */}
                    {visibleGuideChannels.length === 0 ? (
                        <div className="p-12 text-center bg-zinc-950 rounded-2xl border border-zinc-900 text-zinc-500 space-y-2">
                            <p className="text-sm font-bold text-white">
                                {channels.length === 0 ? 'No channels found for this provider' : 'No channels matching filters'}
                            </p>
                            <p className="text-xs">
                                {channels.length === 0
                                    ? 'Add an M3U or Xtream IPTV provider in the Providers tab to load channels.'
                                    : 'Try selecting a different shortlist or clearing your search query.'}
                            </p>
                            {channels.length === 0 && (
                                <button
                                    onClick={() => setIsAddProviderOpen(true)}
                                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer inline-flex items-center gap-2 mt-2"
                                >
                                    <Plus size={14} /> Add IPTV Provider
                                </button>
                            )}
                        </div>
                    ) : guideViewMode === 'timeline' ? (
                        /* ══════════════════════════════════════════════════════════════
                           A. INTERACTIVE HORIZONTAL TIMELINE GRID VIEW
                           ══════════════════════════════════════════════════════════════ */
                        <div className="bg-zinc-950 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-2xl">
                            {/* Timeline Header Ruler */}
                            <div className="flex items-center border-b border-zinc-800 bg-zinc-900/90 sticky top-0 z-10">
                                <div className="w-56 sm:w-64 p-3 font-black text-xs text-zinc-400 border-r border-zinc-800 shrink-0 uppercase tracking-wider flex items-center justify-between">
                                    <span>Channels ({visibleGuideChannels.length})</span>
                                    <span className="text-[10px] text-amber-400 font-mono font-normal">Click for 7-Day</span>
                                </div>
                                <div className="flex-1 flex overflow-hidden">
                                    {Array.from({ length: timelineWindowHours * 2 }).map((_, idx) => {
                                        const tickTime = new Date(timelineWindowStart.getTime() + idx * 30 * 60 * 1000);
                                        return (
                                            <div
                                                key={idx}
                                                className="flex-1 min-w-[80px] p-2.5 text-center text-[11px] font-mono font-bold text-zinc-300 border-r border-zinc-800/60 shrink-0"
                                            >
                                                {tickTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Timeline Channel Rows */}
                            <div className="divide-y divide-zinc-900 max-h-[600px] overflow-y-auto custom-scrollbar">
                                {visibleGuideChannels.slice(0, 50).map(chan => {
                                    const progs = getChannelPrograms(chan);
                                    const windowStartMs = timelineWindowStart.getTime();
                                    const windowEndMs = windowStartMs + timelineWindowHours * 3600 * 1000;
                                    const windowDurationMs = timelineWindowHours * 3600 * 1000;
                                    const now = new Date();
                                    const nowMs = now.getTime();

                                    // Filter programs that overlap this time window
                                    const windowProgs = progs.filter(p => {
                                        const s = new Date(p.start_time).getTime();
                                        const e = new Date(p.end_time).getTime();
                                        return e >= windowStartMs && s <= windowEndMs;
                                    });

                                    // Calculate "NOW" red line indicator percentage
                                    const nowPercent = ((nowMs - windowStartMs) / windowDurationMs) * 100;
                                    const isNowInWindow = nowPercent >= 0 && nowPercent <= 100;

                                    return (
                                        <div key={chan.id} className="flex items-stretch hover:bg-zinc-900/30 transition-colors group">
                                            {/* Channel Header (Left Column) */}
                                            <div
                                                onClick={() => openSingleChannelSchedule(chan)}
                                                className="w-56 sm:w-64 p-3 border-r border-zinc-800 shrink-0 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-zinc-900/80 transition-colors"
                                                title="Click to view full 7-day schedule for this channel"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                                                        {chan.logo ? (
                                                            <img src={chan.logo} alt="" className="max-h-6 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                                        ) : (
                                                            <Tv2 size={14} className="text-zinc-600" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-400 transition-colors">{chan.name}</h4>
                                                        <span className="text-[10px] text-zinc-500 block truncate">{chan.group}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openSingleChannelSchedule(chan);
                                                    }}
                                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-amber-500 hover:text-black text-zinc-400 text-[10px] font-bold shrink-0 transition-colors"
                                                    title="View Full 7-Day Schedule"
                                                >
                                                    <Calendar size={13} />
                                                </button>
                                            </div>

                                            {/* Timeline Programs Track (Right Column) */}
                                            <div className="flex-1 relative min-h-[56px] flex items-center overflow-hidden bg-zinc-950/60">
                                                {/* Vertical NOW Indicator Line */}
                                                {isNowInWindow && (
                                                    <div
                                                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                                                        style={{ left: `${nowPercent}%` }}
                                                    />
                                                )}

                                                {windowProgs.length === 0 ? (
                                                    <div className="p-3 text-[11px] text-zinc-600 italic">
                                                        No guide data mapped for this time window ({chan.tvgId || 'No tvgId'})
                                                    </div>
                                                ) : (
                                                    windowProgs.map((prog: any, pIdx: number) => {
                                                        const pStart = new Date(prog.start_time).getTime();
                                                        const pEnd = new Date(prog.end_time).getTime();
                                                        const clampedStart = Math.max(windowStartMs, pStart);
                                                        const clampedEnd = Math.min(windowEndMs, pEnd);

                                                        const leftPct = ((clampedStart - windowStartMs) / windowDurationMs) * 100;
                                                        const widthPct = Math.max(2, ((clampedEnd - clampedStart) / windowDurationMs) * 100);
                                                        const isLiveNow = nowMs >= pStart && nowMs <= pEnd;

                                                        return (
                                                            <div
                                                                key={pIdx}
                                                                onClick={() => {
                                                                    setSelectedGuideProgram({ channel: chan, program: prog });
                                                                    if (folders.length > 0 && !guideRecordingFolder) {
                                                                        const def = folders.find(f => f.is_default) || folders[0];
                                                                        if (def) setGuideRecordingFolder(def.path);
                                                                    }
                                                                }}
                                                                style={{
                                                                    left: `${leftPct}%`,
                                                                    width: `calc(${widthPct}% - 2px)`
                                                                }}
                                                                className={`absolute top-1 bottom-1 rounded-xl p-2 flex flex-col justify-center cursor-pointer transition-all border overflow-hidden ${
                                                                    isLiveNow
                                                                        ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/50 shadow-md shadow-amber-500/5 z-10'
                                                                        : 'bg-zinc-900/70 hover:bg-zinc-800/90 border-zinc-800 hover:border-zinc-700'
                                                                }`}
                                                                title={`${prog.title}\n${new Date(prog.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(prog.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n${prog.description || ''}`}
                                                            >
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <span className={`text-[11px] font-bold truncate ${isLiveNow ? 'text-amber-300 font-black' : 'text-zinc-200'}`}>
                                                                        {prog.title}
                                                                    </span>
                                                                    {isLiveNow && (
                                                                        <span className="px-1 py-0.2 rounded bg-red-500 text-white text-[8px] font-black uppercase tracking-wider shrink-0 animate-pulse">
                                                                            LIVE
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] text-zinc-400 font-mono truncate">
                                                                    {new Date(prog.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(prog.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* ══════════════════════════════════════════════════════════════
                           B. CHANNEL CARDS VIEW (Detailed Cards with Progress)
                           ══════════════════════════════════════════════════════════════ */
                        <div className="space-y-3">
                            {visibleGuideChannels.slice(0, 40).map(chan => {
                                const progs = getChannelPrograms(chan);
                                const now = new Date();
                                const currentProg = progs.find(p => {
                                    const s = new Date(p.start_time);
                                    const e = new Date(p.end_time);
                                    return now >= s && now <= e;
                                }) || progs[0];
                                const upcomingProgs = progs.filter(p => p !== currentProg).slice(0, 4);

                                const calculateProgress = (prog: any) => {
                                    if (!prog) return 0;
                                    const s = new Date(prog.start_time).getTime();
                                    const e = new Date(prog.end_time).getTime();
                                    const curr = now.getTime();
                                    if (curr < s) return 0;
                                    if (curr > e) return 100;
                                    return Math.min(100, Math.max(0, Math.round(((curr - s) / (e - s)) * 100)));
                                };

                                const formatTime = (iso: string) => {
                                    try {
                                        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    } catch {
                                        return '';
                                    }
                                };

                                return (
                                    <div key={chan.id} className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/80 hover:border-zinc-700 transition-all space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                                                    {chan.logo ? (
                                                        <img src={chan.logo} alt="" className="max-h-7 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                                    ) : (
                                                        <Tv2 size={16} className="text-zinc-600" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm font-black text-white truncate">{chan.name}</h4>
                                                    <span className="text-[10px] text-zinc-500 font-bold uppercase">{chan.group}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openSingleChannelSchedule(chan)}
                                                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-amber-500 hover:text-black text-zinc-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                                >
                                                    <Calendar size={13} /> Full 7-Day Guide
                                                </button>
                                                {chan.streams && chan.streams.length > 1 && (
                                                    <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase font-mono">
                                                        ⚡ {chan.streams.length} Qualities
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {currentProg ? (
                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2 border-t border-zinc-900">
                                                <div className="lg:col-span-5 p-3 rounded-xl bg-zinc-900/80 border border-amber-500/20 space-y-2">
                                                    <div className="flex items-center justify-between text-[11px]">
                                                        <span className="px-1.5 py-0.5 rounded bg-red-500 text-white font-black text-[9px] uppercase tracking-wider animate-pulse">
                                                            LIVE
                                                        </span>
                                                        <span className="text-zinc-400 font-mono font-bold">
                                                            {formatTime(currentProg.start_time)} - {formatTime(currentProg.end_time)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <h5 className="text-xs font-black text-white truncate">{currentProg.title}</h5>
                                                        {currentProg.description && (
                                                            <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{currentProg.description}</p>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden">
                                                            <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${calculateProgress(currentProg)}%` }} />
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedGuideProgram({ channel: chan, program: currentProg });
                                                            if (folders.length > 0 && !guideRecordingFolder) {
                                                                const def = folders.find(f => f.is_default) || folders[0];
                                                                if (def) setGuideRecordingFolder(def.path);
                                                            }
                                                        }}
                                                        className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-300 text-[11px] font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                    >
                                                        <Clock size={12} /> Record Live Show
                                                    </button>
                                                </div>

                                                <div className="lg:col-span-7 space-y-1.5">
                                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Upcoming Next</span>
                                                    {upcomingProgs.length === 0 ? (
                                                        <p className="text-[11px] text-zinc-600 italic">No upcoming schedule available for this channel</p>
                                                    ) : (
                                                        upcomingProgs.map((prog: any, pIdx: number) => (
                                                            <div
                                                                key={pIdx}
                                                                className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 text-xs transition-colors gap-2"
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                    <span className="font-mono text-[11px] text-amber-400 font-bold shrink-0">
                                                                        {formatTime(prog.start_time)}
                                                                    </span>
                                                                    <span className="text-zinc-200 font-bold truncate text-[11px]">{prog.title}</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedGuideProgram({ channel: chan, program: prog });
                                                                        if (folders.length > 0 && !guideRecordingFolder) {
                                                                            const def = folders.find(f => f.is_default) || folders[0];
                                                                            if (def) setGuideRecordingFolder(def.path);
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-300 text-[10px] font-black shrink-0 transition-all cursor-pointer flex items-center gap-1"
                                                                    title="Schedule Recording"
                                                                >
                                                                    <Plus size={11} /> Record
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="pt-2 border-t border-zinc-900 text-[11px] text-zinc-600 italic">
                                                No XMLTV schedule mapped for this channel ({chan.tvgId || 'No tvg-id'}).
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               2. SHORTLISTS TAB
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'shortlists' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Bookmark size={18} className="text-amber-400" />
                                Curated Shortlists
                            </h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Create channel packs (e.g. Sports, News, Kids) and auto-group duplicate stream qualities.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {channels.length > 0 && (
                                <button
                                    onClick={() => setIsAutoGroupOpen(true)}
                                    className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                                    title="Auto-group identical channels with varying stream qualities"
                                >
                                    <Sparkles size={14} /> Auto-group
                                </button>
                            )}
                            <button
                                onClick={openCreateShortlist}
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                            >
                                <Plus size={14} /> New Shortlist
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {shortlists.length === 0 ? (
                            <div className="col-span-full p-10 text-center bg-zinc-950/50 rounded-2xl border border-zinc-900 text-zinc-500 space-y-2">
                                <Bookmark size={32} className="mx-auto text-zinc-700" />
                                <p className="text-sm font-bold text-zinc-300">No shortlists created yet</p>
                                <p className="text-xs max-w-md mx-auto">
                                    Click "New Shortlist" to pick your favorite channels or click "Auto-group" to combine 4K, 1080p, and HD streams.
                                </p>
                            </div>
                        ) : (
                            shortlists.map(sl => (
                                <div key={sl.id} className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800/80 hover:border-zinc-700 space-y-3 transition-all flex flex-col justify-between">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-white truncate">{sl.name}</span>
                                            </div>
                                            <span className="text-xs text-amber-400 font-bold block mt-0.5">
                                                {sl.channelIds?.length || 0} channels
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => openEditShortlist(sl)}
                                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg cursor-pointer transition-colors"
                                                title="Edit Shortlist"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteShortlist(sl.id, sl.name)}
                                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                                                title="Delete Shortlist"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-900">
                                        <span>Ready in Theater</span>
                                        <button
                                            onClick={() => openEditShortlist(sl)}
                                            className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                            Manage <ArrowRight size={11} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'providers' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Tv size={18} className="text-amber-400" />
                                IPTV Providers ({libraries.length})
                            </h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Connected playlist URLs, Xtream Codes credentials, and XMLTV guide sources.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsAddProviderOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20"
                        >
                            <Plus size={14} /> Add Provider
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {libraries.map(lib => {
                            const epgSource = lib.folders?.[1];
                            const schedHours = lib.folders?.[2] || '24';
                            const lastSynced = lib.folders?.[3] ? new Date(lib.folders[3]) : null;

                            return (
                                <div key={lib.id} className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h4 className="text-sm font-black text-white">{lib.name}</h4>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-amber-400 font-bold">
                                                    {lib.id === activeLibrary?.id ? `${channels.length} Channels` : 'Provider'}
                                                </span>
                                                {epgSource && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
                                                        {schedHours === '0' ? 'Manual Sync' : `Sync: ${schedHours}h`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                onClick={() => {
                                                    setSelectedLibraryId(lib.id);
                                                    setIsSettingsOpen(true);
                                                }}
                                                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold cursor-pointer transition-colors"
                                                title="Edit Provider, EPG Schedule & Sync"
                                            >
                                                <Settings size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteProvider(lib.id, lib.name)}
                                                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-bold cursor-pointer transition-colors"
                                                title="Delete IPTV Provider"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="text-[11px] text-zinc-500 font-mono truncate bg-zinc-900/60 p-2 rounded-xl border border-zinc-800/80">
                                        {lib.folders?.[0] || 'Local upload'}
                                    </div>

                                    <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-900">
                                        <span>
                                            {lastSynced ? `Synced: ${lastSynced.toLocaleDateString()}` : 'Not synced yet'}
                                        </span>
                                        <button
                                            onClick={() => {
                                                setSelectedLibraryId(lib.id);
                                                setIsSettingsOpen(true);
                                            }}
                                            className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                            <RefreshCw size={11} /> Sync Guide
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'storage' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Folder size={18} className="text-amber-400" />
                                Storage Folders
                            </h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Target directories where captured live broadcasts and scheduled recordings will be written.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsNewFolderOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
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
                                        placeholder="e.g. /mnt/user/recordings or C:\Recordings"
                                        value={newFolderPath}
                                        onChange={e => setNewFolderPath(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">Display Label</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Sports DVR / Main DVR"
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
                                <p className="text-xs font-bold text-zinc-400">No storage folders configured yet</p>
                                <p className="text-[11px] mt-0.5">Add a directory so recordings have a target folder to write files.</p>
                            </div>
                        ) : (
                            folders.map(f => (
                                <div key={f.id} className="p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-between">
                                    <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-white truncate">{f.name}</span>
                                            {f.is_default && (
                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase">
                                                    Default
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-zinc-500 font-mono block truncate">{f.path}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteFolder(f.id)}
                                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'rules' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Sparkles size={18} className="text-purple-400" />
                                Recording Rules ({rules.length})
                            </h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                Automated recording by keywords, sports clubs (e.g. Benfica), or tournaments.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleScanRules}
                                className="px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                title="Scan Guide Schedule for Rule Matches"
                            >
                                <RefreshCw size={13} /> Scan Guide
                            </button>
                            <button
                                onClick={() => setIsNewRuleOpen(true)}
                                className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-500/20"
                            >
                                <Plus size={14} /> New Rule
                            </button>
                        </div>
                    </div>

                    {isNewRuleOpen && (
                        <form onSubmit={handleSaveRule} className="p-5 bg-zinc-950 rounded-2xl border border-purple-500/30 space-y-4 animate-in fade-in">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-purple-400 uppercase">Create Recording Rule</span>
                                <button type="button" onClick={() => setIsNewRuleOpen(false)} className="text-zinc-500 hover:text-white">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">Rule Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Benfica Matches"
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
                                        placeholder="e.g. Benfica OR Champions League"
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
                                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">Storage Folder</label>
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
                                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">Padding Overtime</label>
                                    <select
                                        value={rulePadding}
                                        onChange={e => setRulePadding(parseInt(e.target.value))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                                    >
                                        <option value={0}>0 minutes</option>
                                        <option value={15}>+15 minutes (Standard)</option>
                                        <option value={30}>+30 minutes (Overtime)</option>
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
                                    Create Rule
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {rules.length === 0 ? (
                            <div className="col-span-full p-8 text-center bg-zinc-950/50 rounded-2xl border border-zinc-900 text-zinc-500">
                                <Sparkles size={28} className="mx-auto mb-2 text-zinc-700" />
                                <p className="text-xs font-bold text-zinc-400">No automated recording rules active</p>
                                <p className="text-[11px] mt-0.5">Click "New Rule" to automate recordings for sports matches or actors.</p>
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
                                        <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-500">
                                            +{r.padding_minutes}m padding
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'recordings' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Clock size={18} className="text-sky-400" />
                                Recordings ({recordings.length})
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
                                <p className="text-[11px] mt-0.5">Record any live broadcast from Theater mode or create an automated rule above.</p>
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
            )}

            {isShortlistModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col shadow-2xl text-zinc-100">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                                    <Bookmark size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white">
                                        {editingShortlistId ? 'Edit Shortlist' : 'New Shortlist'}
                                    </h3>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        Pick channels from provider and auto-group duplicate quality streams.
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setIsShortlistModalOpen(false)} className="text-zinc-500 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveShortlist} className="space-y-4">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-3">
                                <div className="flex-1 space-y-1">
                                    <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Shortlist Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Sports Pack, News, Kids"
                                        value={shortlistName}
                                        onChange={e => setShortlistName(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-amber-500"
                                        required
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsAutoGroupOpen(true)}
                                    className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0"
                                    title="Auto-group channels across stream qualities (4K, 1080p, 720p, SD)"
                                >
                                    <Sparkles size={14} /> Auto-group
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        type="text"
                                        placeholder="Search channels..."
                                        value={shortlistSearch}
                                        onChange={e => setShortlistSearch(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500"
                                    />
                                    {shortlistSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setShortlistSearch('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setShortlistFilterMode('selected')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                shortlistFilterMode === 'selected'
                                                    ? 'bg-amber-500 text-black shadow-sm font-black'
                                                    : 'text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            ⭐ Selected ({shortlistSelectedIds.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShortlistFilterMode('all')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                shortlistFilterMode === 'all'
                                                    ? 'bg-zinc-800 text-white shadow-sm font-black'
                                                    : 'text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            Browse All ({channels.length})
                                        </button>
                                    </div>

                                    {shortlistFilterMode === 'all' && (
                                        <select
                                            value={shortlistCategory}
                                            onChange={e => setShortlistCategory(e.target.value)}
                                            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500 max-w-[180px] truncate"
                                        >
                                            <option value="ALL">All Categories ({channels.length})</option>
                                            {groups.map(g => (
                                                <option key={g.name} value={g.name}>{g.name} ({g.count})</option>
                                            ))}
                                        </select>
                                    )}

                                    <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setShortlistViewMode('grid')}
                                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                shortlistViewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <LayoutGrid size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShortlistViewMode('list')}
                                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                shortlistViewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <Rows size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-1 text-xs">
                                <span className="font-bold text-zinc-400">
                                    <span className="text-amber-400">{shortlistSelectedIds.length}</span> channels selected
                                    <span className="text-zinc-600 font-normal"> ({filteredShortlistChannels.length} found)</span>
                                </span>
                                <div className="flex items-center gap-2 text-[11px] font-bold">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const ids = filteredShortlistChannels.map(c => c.id);
                                            setShortlistSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
                                        }}
                                        className="text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                    >
                                        + Select Filtered
                                    </button>
                                    <span className="text-zinc-700">•</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const set = new Set(filteredShortlistChannels.map(c => c.id));
                                            setShortlistSelectedIds(prev => prev.filter(id => !set.has(id)));
                                        }}
                                        className="text-amber-400 hover:text-amber-300 cursor-pointer"
                                    >
                                        - Deselect Filtered
                                    </button>
                                    <span className="text-zinc-700">•</span>
                                    <button
                                        type="button"
                                        onClick={() => setShortlistSelectedIds([])}
                                        className="text-zinc-500 hover:text-white cursor-pointer"
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 bg-zinc-950 rounded-2xl border border-zinc-900">
                                {filteredShortlistChannels.length === 0 ? (
                                    <div className="p-8 text-center text-zinc-500 text-xs">
                                        No channels found matching filter.
                                    </div>
                                ) : shortlistViewMode === 'grid' ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                        {filteredShortlistChannels.slice(0, 150).map(chan => {
                                            const isSelected = shortlistSelectedIds.includes(chan.id);
                                            const streamCount = chan.streams?.length || 1;
                                            return (
                                                <div
                                                    key={chan.id}
                                                    onClick={() => {
                                                        setShortlistSelectedIds(prev =>
                                                            isSelected ? prev.filter(id => id !== chan.id) : [...prev, chan.id]
                                                        );
                                                    }}
                                                    className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all flex flex-col justify-between gap-1.5 select-none ${
                                                        isSelected
                                                            ? 'bg-amber-500/20 text-white border-amber-500/50 shadow-md'
                                                            : 'bg-zinc-900/40 text-zinc-400 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-zinc-950 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                                                            {chan.logo ? (
                                                                <img src={chan.logo} alt="" className="max-h-6 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                                            ) : (
                                                                <Tv2 size={16} className="text-zinc-600" />
                                                            )}
                                                        </div>
                                                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${isSelected ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-700'}`}>
                                                            {isSelected && <Check size={12} className="stroke-[3]" />}
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-white text-xs">{chan.name}</p>
                                                        <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
                                                            <span className="truncate max-w-[80px]">{chan.group}</span>
                                                            {streamCount > 1 && (
                                                                <span className="text-amber-400 font-mono">⚡{streamCount}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {filteredShortlistChannels.slice(0, 150).map(chan => {
                                            const isSelected = shortlistSelectedIds.includes(chan.id);
                                            const streamCount = chan.streams?.length || 1;
                                            return (
                                                <div
                                                    key={chan.id}
                                                    onClick={() => {
                                                        setShortlistSelectedIds(prev =>
                                                            isSelected ? prev.filter(id => id !== chan.id) : [...prev, chan.id]
                                                        );
                                                    }}
                                                    className={`p-2 px-3 rounded-xl border text-xs font-bold cursor-pointer transition-all flex items-center justify-between gap-3 select-none ${
                                                        isSelected
                                                            ? 'bg-amber-500/20 text-white border-amber-500/50'
                                                            : 'bg-zinc-900/40 text-zinc-400 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${isSelected ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-700'}`}>
                                                            {isSelected && <Check size={12} className="stroke-[3]" />}
                                                        </div>
                                                        <div className="w-7 h-7 rounded-lg bg-zinc-950 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                                                            {chan.logo ? (
                                                                <img src={chan.logo} alt="" className="max-h-5 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                                            ) : (
                                                                <Tv2 size={14} className="text-zinc-600" />
                                                            )}
                                                        </div>
                                                        <span className="truncate font-bold text-white text-xs">{chan.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0 text-[10px] text-zinc-500 font-bold">
                                                        <span>{chan.group}</span>
                                                        {streamCount > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">⚡{streamCount}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
                                <button
                                    type="button"
                                    onClick={() => setIsShortlistModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white text-xs font-bold cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingShortlist || !shortlistName.trim()}
                                    className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                                >
                                    {isSavingShortlist ? 'Saving...' : 'Save Shortlist'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Guide Quick Recording Modal */}
            {selectedGuideProgram && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-[#0b0c10] border border-amber-500/30 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative text-zinc-100">
                        <div className="flex items-start justify-between border-b border-zinc-900 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white">Record Programme</h3>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {selectedGuideProgram.channel.name}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedGuideProgram(null)}
                                className="p-1.5 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleScheduleGuideRecording} className="space-y-4">
                            <div className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-1">
                                <h4 className="text-xs font-black text-white">{selectedGuideProgram.program.title}</h4>
                                {selectedGuideProgram.program.description && (
                                    <p className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed">
                                        {selectedGuideProgram.program.description}
                                    </p>
                                )}
                                <div className="text-[11px] text-amber-400 font-mono font-bold pt-1">
                                    {new Date(selectedGuideProgram.program.start_time).toLocaleString()} - {new Date(selectedGuideProgram.program.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-zinc-400 block mb-1.5">Destination Storage Folder</label>
                                {folders.length === 0 ? (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                                        No storage folders configured yet. Add a folder in the Storage tab first.
                                    </div>
                                ) : (
                                    <select
                                        value={guideRecordingFolder}
                                        onChange={e => setGuideRecordingFolder(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-amber-500"
                                        required
                                    >
                                        <option value="">Select storage folder...</option>
                                        {folders.map(f => (
                                            <option key={f.id} value={f.path}>{f.name} ({f.path})</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-zinc-400 block mb-1.5">Safety Padding (Minutes)</label>
                                <select
                                    value={guideRecordingPadding}
                                    onChange={e => setGuideRecordingPadding(Number(e.target.value))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-amber-500"
                                >
                                    <option value={0}>No padding (exact schedule)</option>
                                    <option value={5}>+5 minutes after show</option>
                                    <option value={15}>+15 minutes after show (recommended)</option>
                                    <option value={30}>+30 minutes after show</option>
                                    <option value={60}>+60 minutes after show (live sports)</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
                                <button
                                    type="button"
                                    onClick={() => setSelectedGuideProgram(null)}
                                    className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white text-xs font-bold cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSchedulingGuide || !guideRecordingFolder}
                                    className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    <Clock size={14} />
                                    {isSchedulingGuide ? 'Scheduling...' : 'Schedule Recording'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Single Channel Full 7-Day Schedule Modal */}
            {singleChannelSchedule && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-[#0b0c10] border border-amber-500/30 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 space-y-5 shadow-2xl relative max-h-[90vh] flex flex-col text-zinc-100">
                        {/* Modal Header */}
                        <div className="flex items-start justify-between border-b border-zinc-900 pb-4">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-lg">
                                    {singleChannelSchedule.channel.logo ? (
                                        <img src={singleChannelSchedule.channel.logo} alt="" className="max-h-8 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                    ) : (
                                        <Tv2 size={24} className="text-zinc-600" />
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-black text-white">{singleChannelSchedule.channel.name}</h3>
                                        <span className="px-2 py-0.5 rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-bold uppercase">
                                            {singleChannelSchedule.channel.group}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        Full 7-Day Program Guide Schedule ({singleChannelSchedule.programs.length} broadcasts loaded)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSingleChannelSchedule(null)}
                                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Date Tabs & Search Filter */}
                        <div className="space-y-3">
                            {/* 7-Day Date Tabs */}
                            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                                {Array.from({ length: 7 }).map((_, dIdx) => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + dIdx);
                                    const dateKey = d.toISOString().split('T')[0];
                                    const isSelected = singleChannelSchedule.selectedDate === dateKey;
                                    const isToday = dIdx === 0;

                                    return (
                                        <button
                                            key={dateKey}
                                            onClick={() => setSingleChannelSchedule(prev => prev ? { ...prev, selectedDate: dateKey } : null)}
                                            className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer flex flex-col items-center min-w-[76px] ${
                                                isSelected
                                                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                                    : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80'
                                            }`}
                                        >
                                            <span className="text-[10px] font-bold uppercase">
                                                {isToday ? 'Today' : d.toLocaleDateString([], { weekday: 'short' })}
                                            </span>
                                            <span className="text-xs font-mono font-black">
                                                {d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Search Within Channel */}
                            <div className="relative">
                                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Filter shows on this channel..."
                                    value={singleChannelSchedule.search}
                                    onChange={e => setSingleChannelSchedule(prev => prev ? { ...prev, search: e.target.value } : null)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500"
                                />
                                {singleChannelSchedule.search && (
                                    <button
                                        onClick={() => setSingleChannelSchedule(prev => prev ? { ...prev, search: '' } : null)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Shows List for Selected Day */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[300px]">
                            {singleChannelSchedule.loading ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-500">
                                    <RefreshCw size={24} className="animate-spin text-amber-500" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Loading complete schedule...</span>
                                </div>
                            ) : (() => {
                                const selectedDayProgs = singleChannelSchedule.programs.filter(p => {
                                    const pDate = p.start_time?.split('T')[0] || '';
                                    if (singleChannelSchedule.selectedDate && pDate !== singleChannelSchedule.selectedDate) return false;
                                    if (singleChannelSchedule.search.trim()) {
                                        const q = singleChannelSchedule.search.toLowerCase().trim();
                                        return p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
                                    }
                                    return true;
                                });

                                if (selectedDayProgs.length === 0) {
                                    return (
                                        <div className="py-16 text-center bg-zinc-950/60 rounded-2xl border border-zinc-900 text-zinc-500 space-y-2">
                                            <Calendar size={32} className="mx-auto text-zinc-700" />
                                            <p className="text-xs font-bold text-white">No shows scheduled for {singleChannelSchedule.selectedDate}</p>
                                            <p className="text-[11px]">Select another date tab or click Sync EPG in Provider settings.</p>
                                        </div>
                                    );
                                }

                                const now = new Date();
                                const nowMs = now.getTime();

                                return selectedDayProgs.map((prog: any, idx: number) => {
                                    const s = new Date(prog.start_time);
                                    const e = new Date(prog.end_time);
                                    const isLiveNow = nowMs >= s.getTime() && nowMs <= e.getTime();
                                    const isPast = nowMs > e.getTime();

                                    return (
                                        <div
                                            key={idx}
                                            className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                isLiveNow
                                                    ? 'bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5'
                                                    : isPast
                                                    ? 'bg-zinc-950/40 border-zinc-900 opacity-60'
                                                    : 'bg-zinc-950 border-zinc-800/80 hover:border-zinc-700'
                                            }`}
                                        >
                                            <div className="space-y-1 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs font-black text-amber-400">
                                                        {s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {isLiveNow && (
                                                        <span className="px-1.5 py-0.2 rounded bg-red-500 text-white text-[9px] font-black uppercase tracking-wider animate-pulse">
                                                            LIVE NOW
                                                        </span>
                                                    )}
                                                    {isPast && (
                                                        <span className="text-[9px] text-zinc-600 font-bold uppercase">
                                                            Ended
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-black text-white">{prog.title}</h4>
                                                {prog.description && (
                                                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{prog.description}</p>
                                                )}
                                            </div>

                                            <div className="shrink-0 flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setSelectedGuideProgram({ channel: singleChannelSchedule.channel, program: prog });
                                                        if (folders.length > 0 && !guideRecordingFolder) {
                                                            const def = folders.find(f => f.is_default) || folders[0];
                                                            if (def) setGuideRecordingFolder(def.path);
                                                        }
                                                    }}
                                                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-md shadow-amber-500/10 cursor-pointer flex items-center gap-1.5"
                                                >
                                                    <Clock size={13} /> Record
                                                </button>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end pt-3 border-t border-zinc-900">
                            <button
                                onClick={() => setSingleChannelSchedule(null)}
                                className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            <ConfirmModal
                isOpen={confirmModalState.isOpen}
                onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModalState.onConfirm}
                loading={confirmModalState.loading}
                title={confirmModalState.title}
                description={confirmModalState.description}
                confirmText={confirmModalState.confirmText}
                variant="danger"
            />
        </div>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
    Folder, Plus, Trash2, Edit3, RefreshCw, X, Film, Tv, Disc,
    Tv2, Check, AlertCircle, HardDrive, Layers, Globe, Radio,
    FolderPlus, ExternalLink, ChevronRight, Server, BookOpen, UploadCloud
} from 'lucide-react';
import { toast } from 'sonner';

export interface TheaterLibrary {
    id: string;
    name: string;
    type: 'movie' | 'tv' | 'music' | 'live' | 'audiobooks';
    folders: string[];
    plexSectionId?: string;
    plex_section_id?: string;
    instanceId?: string;
    instance_id?: string;
}

interface ManageLibrariesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLibrariesChanged?: () => void;
}

export function ManageLibrariesModal({ isOpen, onClose, onLibrariesChanged }: ManageLibrariesModalProps) {
    const [libraries, setLibraries] = useState<TheaterLibrary[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTypeFilter, setActiveTypeFilter] = useState<'all' | 'movie' | 'tv' | 'music' | 'live' | 'audiobooks'>('all');

    // Create Library Form State
    const [isCreating, setIsCreating] = useState(false);
    const [newLibName, setNewLibName] = useState('');
    const [newLibType, setNewLibType] = useState<'movie' | 'tv' | 'music' | 'live' | 'audiobooks'>('movie');
    const [newLibFolders, setNewLibFolders] = useState<string[]>([]);
    const [folderInput, setFolderInput] = useState('');
    const [iptvUrlInput, setIptvUrlInput] = useState('');
    const [iptvEpgInput, setIptvEpgInput] = useState('');
    const [iptvFile, setIptvFile] = useState<File | null>(null);
    const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

    // Edit Library Form State
    const [editingLibId, setEditingLibId] = useState<string | null>(null);
    const [editLibName, setEditLibName] = useState('');
    const [editLibFolders, setEditLibFolders] = useState<string[]>([]);
    const [editFolderInput, setEditFolderInput] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Delete Confirmation State
    const [deletingLib, setDeletingLib] = useState<TheaterLibrary | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Rescanning states per library
    const [rescanningLibIds, setRescanningLibIds] = useState<Record<string, boolean>>({});

    // Sources and Mount Shortcuts
    const [commonMounts, setCommonMounts] = useState<string[]>([]);
    const [plexSources, setPlexSources] = useState<any[]>([]);
    const [radarrSources, setRadarrSources] = useState<any[]>([]);
    const [sonarrSources, setSonarrSources] = useState<any[]>([]);
    const [showPlexImport, setShowPlexImport] = useState(false);
    const [isImportingPlex, setIsImportingPlex] = useState(false);

    // Selected Plex link for newly created library
    const [selectedPlexSectionId, setSelectedPlexSectionId] = useState<string | undefined>(undefined);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>(undefined);

    // IPTV Advanced Modes (M3U URL, Upload, Xtream Codes)
    const [iptvMode, setIptvMode] = useState<'url' | 'upload' | 'xtream'>('url');
    const [xtreamServer, setXtreamServer] = useState('');
    const [xtreamUser, setXtreamUser] = useState('');
    const [xtreamPass, setXtreamPass] = useState('');
    const [xtreamOutput, setXtreamOutput] = useState<'ts' | 'm3u8'>('ts');

    const fetchLibraries = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/theater/libraries');
            if (res.ok) {
                const data = await res.json();
                setLibraries(Array.isArray(data.libraries) ? data.libraries : []);
            }
        } catch (e) {
            console.error('Failed to fetch libraries:', e);
            toast.error('Failed to load libraries');
        } finally {
            setLoading(false);
        }
    };

    const fetchSources = async () => {
        try {
            const res = await fetch('/api/theater/sources');
            if (res.ok) {
                const data = await res.json();
                setCommonMounts(Array.isArray(data.commonMounts) ? data.commonMounts : []);
                setPlexSources(Array.isArray(data.plex) ? data.plex : []);
                setRadarrSources(Array.isArray(data.radarr) ? data.radarr : []);
                setSonarrSources(Array.isArray(data.sonarr) ? data.sonarr : []);
            }
        } catch {}
    };

    useEffect(() => {
        if (isOpen) {
            fetchLibraries();
            fetchSources();
            setIsCreating(false);
            setEditingLibId(null);
            setDeletingLib(null);
            setSelectedPlexSectionId(undefined);
            setSelectedInstanceId(undefined);
        }
    }, [isOpen]);

    const notifyChange = () => {
        onLibrariesChanged?.();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('theater-libraries-updated'));
        }
    };

    // ── Rescan Handler ──
    const handleRescan = async (lib: TheaterLibrary) => {
        setRescanningLibIds(prev => ({ ...prev, [lib.id]: true }));
        try {
            if (lib.type === 'live') {
                const res = await fetch('/api/theater/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ libraryId: lib.id, force: true })
                });
                if (res.ok) {
                    toast.success(`Rescan and EPG sync started for "${lib.name}"`);
                    notifyChange();
                } else {
                    toast.error(`Failed to rescan "${lib.name}"`);
                }
            } else {
                const res = await fetch(`/api/theater/items?libraryId=${encodeURIComponent(lib.id)}&refresh=true`);
                if (res.ok) {
                    const data = await res.json();
                    const count = data.total ?? data.items?.length ?? 0;
                    toast.success(`Rescanned "${lib.name}" (${count} items detected)`);
                    notifyChange();
                } else {
                    toast.error(`Failed to rescan "${lib.name}"`);
                }
            }
        } catch {
            toast.error(`Error rescanning "${lib.name}"`);
        } finally {
            setTimeout(() => {
                setRescanningLibIds(prev => ({ ...prev, [lib.id]: false }));
            }, 800);
        }
    };

    // ── Create Library ──
    const handleCreateLibrary = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLibName.trim()) {
            toast.error('Library name is required');
            return;
        }

        let finalFolders = [...newLibFolders];
        if (folderInput.trim() && !finalFolders.includes(folderInput.trim())) {
            finalFolders.push(folderInput.trim());
        }

        if (newLibType === 'live') {
            let effectiveM3u = iptvUrlInput.trim();
            let effectiveEpg = iptvEpgInput.trim();

            if (iptvMode === 'upload') {
                if (!iptvFile) {
                    toast.error('Please select an M3U playlist file to upload');
                    return;
                }
            } else if (iptvMode === 'url') {
                if (!iptvUrlInput.trim()) {
                    toast.error('Please enter an M3U stream URL');
                    return;
                }
            } else if (iptvMode === 'xtream') {
                if (!xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()) {
                    toast.error('Please fill in Xtream Server URL, Username, and Password');
                    return;
                }
                let base = xtreamServer.trim().replace(/\/$/, '');
                if (!base.startsWith('http://') && !base.startsWith('https://')) {
                    base = `http://${base}`;
                }
                effectiveM3u = `${base}/get.php?username=${encodeURIComponent(xtreamUser.trim())}&password=${encodeURIComponent(xtreamPass.trim())}&type=m3u_plus&output=${xtreamOutput}`;
                if (!effectiveEpg) {
                    effectiveEpg = `${base}/xmltv.php?username=${encodeURIComponent(xtreamUser.trim())}&password=${encodeURIComponent(xtreamPass.trim())}`;
                }
            }

            finalFolders = [effectiveM3u || 'local_file_upload'];
            if (effectiveEpg) finalFolders.push(effectiveEpg);
        } else if (finalFolders.length === 0) {
            toast.error('At least one folder path is required');
            return;
        }

        setIsSubmittingCreate(true);
        try {
            const res = await fetch('/api/theater/libraries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newLibName.trim(),
                    type: newLibType,
                    folders: finalFolders,
                    plexSectionId: selectedPlexSectionId,
                    instanceId: selectedInstanceId
                })
            });

            if (res.ok) {
                const data = await res.json();
                const newLibId = data.id || data.library?.id;

                // Handle IPTV channel import if live TV
                if (newLibType === 'live' && newLibId) {
                    try {
                        const formData = new FormData();
                        formData.append('libraryId', newLibId);
                        if (iptvMode === 'upload' && iptvFile) formData.append('file', iptvFile);
                        else if (finalFolders[0] && finalFolders[0] !== 'local_file_upload') formData.append('url', finalFolders[0]);
                        if (finalFolders[1]) formData.append('epgUrl', finalFolders[1]);

                        await fetch('/api/theater/iptv', { method: 'POST', body: formData });
                    } catch (iptvErr) {
                        console.warn('IPTV channel initial sync warning:', iptvErr);
                    }
                }

                toast.success(`Library "${newLibName}" created successfully!`);
                setNewLibName('');
                setNewLibFolders([]);
                setFolderInput('');
                setIptvUrlInput('');
                setIptvEpgInput('');
                setIptvFile(null);
                setXtreamServer('');
                setXtreamUser('');
                setXtreamPass('');
                setSelectedPlexSectionId(undefined);
                setSelectedInstanceId(undefined);
                setIsCreating(false);
                await fetchLibraries();
                notifyChange();
            } else {
                toast.error('Failed to create library');
            }
        } catch {
            toast.error('Error creating library');
        } finally {
            setIsSubmittingCreate(false);
        }
    };

    // ── Plex 1-Click Import ──
    const handleImportPlex = async (plexLib: any, overrideType?: string) => {
        setIsImportingPlex(true);
        try {
            const finalType = overrideType || plexLib.mediaType || 'other';
            const res = await fetch('/api/theater/libraries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: plexLib.title,
                    type: finalType,
                    folders: plexLib.locations || [],
                    plexSectionId: plexLib.sectionKey,
                    instanceId: plexLib.instanceId
                })
            });

            if (res.ok) {
                toast.success(`Imported "${plexLib.title}" as ${finalType === 'audiobooks' ? 'Audiobook' : finalType} library!`);
                await fetchLibraries();
                notifyChange();
            } else {
                toast.error('Failed to import Plex library');
            }
        } catch {
            toast.error('Error importing Plex library');
        } finally {
            setIsImportingPlex(false);
        }
    };

    // ── Open Edit Library ──
    const handleStartEdit = (lib: TheaterLibrary) => {
        setEditingLibId(lib.id);
        setEditLibName(lib.name);
        setEditLibFolders([...(lib.folders || [])]);
        setEditFolderInput('');
    };

    // ── Save Edit Library ──
    const handleSaveEdit = async () => {
        if (!editingLibId) return;
        if (!editLibName.trim()) {
            toast.error('Library name cannot be empty');
            return;
        }

        let foldersToSave = [...editLibFolders];
        if (editFolderInput.trim() && !foldersToSave.includes(editFolderInput.trim())) {
            foldersToSave.push(editFolderInput.trim());
        }

        if (foldersToSave.length === 0) {
            toast.error('At least one folder path is required');
            return;
        }

        setIsSavingEdit(true);
        try {
            const res = await fetch('/api/theater/libraries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingLibId,
                    name: editLibName.trim(),
                    folders: foldersToSave
                })
            });

            if (res.ok) {
                toast.success(`Updated library "${editLibName}"`);
                setEditingLibId(null);
                await fetchLibraries();
                notifyChange();
            } else {
                toast.error('Failed to update library');
            }
        } catch {
            toast.error('Error updating library');
        } finally {
            setIsSavingEdit(false);
        }
    };

    // ── Delete Library ──
    const handleConfirmDelete = async () => {
        if (!deletingLib) return;
        const deletedId = deletingLib.id;
        const deletedName = deletingLib.name;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/theater/libraries?id=${deletedId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                toast.success(`Library "${deletedName}" deleted`);
                setDeletingLib(null);
                await fetchLibraries();
                notifyChange();

                // Clean up local storage caches so Theater tab reflects deletion immediately
                if (typeof window !== 'undefined') {
                    try {
                        const cachedLibsStr = localStorage.getItem('schedulearr_theater_libraries_cache');
                        if (cachedLibsStr) {
                            const cachedLibs = JSON.parse(cachedLibsStr);
                            if (Array.isArray(cachedLibs)) {
                                const pruned = cachedLibs.filter((l: any) => l.id !== deletedId);
                                localStorage.setItem('schedulearr_theater_libraries_cache', JSON.stringify(pruned));
                            }
                        }
                    } catch {}
                }
            } else {
                toast.error('Failed to delete library');
            }
        } catch {
            toast.error('Error deleting library');
        } finally {
            setIsDeleting(false);
        }
    };

    if (!isOpen) return null;

    const matchesModalTab = (libType: string, tab: string) => {
        if (tab === 'all') return true;
        if (tab === 'tv') return libType === 'tv' || libType === 'show' || libType === 'series';
        return libType === tab;
    };

    const filteredLibs = libraries.filter(l => matchesModalTab(l.type, activeTypeFilter));

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'movie': return <Film size={15} className="text-indigo-400" />;
            case 'tv':
            case 'show': return <Tv size={15} className="text-emerald-400" />;
            case 'music': return <Disc size={15} className="text-amber-400" />;
            case 'audiobooks': return <BookOpen size={15} className="text-orange-400" />;
            case 'live': return <Tv2 size={15} className="text-red-400" />;
            default: return <Folder size={15} className="text-zinc-400" />;
        }
    };

    const getTypeBadgeClass = (type: string) => {
        switch (type) {
            case 'movie': return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
            case 'tv':
            case 'show': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
            case 'music': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
            case 'audiobooks': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
            case 'live': return 'bg-red-500/15 text-red-400 border-red-500/30';
            default: return 'bg-zinc-800 text-zinc-300 border-zinc-700';
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0c0c0e] border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
                
                {/* ── Modal Header ── */}
                <div className="p-6 sm:p-7 border-b border-zinc-900 flex items-center justify-between gap-4 bg-zinc-950/60 shrink-0">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
                            <Layers size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                Libraries & Folders Manager
                            </h2>
                            <p className="text-xs text-zinc-400">
                                Configure media folders, Plex libraries, and IPTV playlists displayed across Media & Theater.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                        title="Close Modal"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ── Subheader Controls ── */}
                <div className="px-6 sm:px-7 py-3.5 bg-zinc-950/40 border-b border-zinc-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    {/* Category Filter Pills */}
                    <div className="flex bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800/80 shadow-inner shrink-0 flex-wrap">
                        {(['all', 'movie', 'tv', 'music', 'audiobooks', 'live'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTypeFilter(tab)}
                                className={`px-3 sm:px-3.5 py-1.5 text-xs font-black rounded-xl transition-all capitalize flex items-center gap-1.5 cursor-pointer ${
                                    activeTypeFilter === tab
                                        ? 'bg-zinc-800 text-white shadow-sm'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                {tab === 'all' ? 'All' : tab === 'movie' ? 'Movies' : tab === 'tv' ? 'TV Shows' : tab === 'music' ? 'Music' : tab === 'audiobooks' ? 'Audiobooks' : 'Live TV'}
                                <span className="text-[10px] opacity-60">
                                    ({tab === 'all' ? libraries.length : libraries.filter(l => matchesModalTab(l.type, tab)).length})
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={() => {
                                setShowPlexImport(!showPlexImport);
                                setIsCreating(false);
                                setEditingLibId(null);
                            }}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 cursor-pointer ${
                                showPlexImport
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                            }`}
                        >
                            <Server size={14} className="text-amber-400" />
                            <span>Plex Libraries {plexSources.length > 0 ? `(${plexSources.length})` : ''}</span>
                        </button>

                        <button
                            onClick={() => {
                                setIsCreating(!isCreating);
                                setShowPlexImport(false);
                                setEditingLibId(null);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
                                isCreating
                                    ? 'bg-zinc-800 text-white border border-zinc-700'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                            }`}
                        >
                            {isCreating ? <X size={15} /> : <Plus size={15} />}
                            <span>{isCreating ? 'Cancel' : 'Add Library'}</span>
                        </button>
                    </div>
                </div>

                {/* ── Main Modal Body ── */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6 custom-scrollbar">

                    {/* ── Plex Sources Dropdown Drawer ── */}
                    {showPlexImport && (
                        <div className="p-5 rounded-3xl bg-amber-500/5 border border-amber-500/20 space-y-4 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                                    <Server size={16} />
                                    <span>Available Plex Media Server Libraries ({plexSources.length})</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowPlexImport(false)}
                                    className="px-3 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                >
                                    <X size={13} />
                                    <span>Close / Back</span>
                                </button>
                            </div>

                            {plexSources.length === 0 ? (
                                <div className="p-6 bg-zinc-950/60 rounded-2xl border border-zinc-900 text-center space-y-2">
                                    <Server size={28} className="mx-auto text-zinc-600" />
                                    <p className="text-sm font-bold text-white">No Plex Libraries Detected</p>
                                    <p className="text-xs text-zinc-400 max-w-md mx-auto">
                                        Ensure your Plex Media Server is running and linked in Settings &gt; Media Servers with a valid server address and access token.
                                    </p>
                                </div>
                            ) : (

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {plexSources.map((ps: any, idx: number) => {
                                    const alreadyImported = libraries.some(l => l.plexSectionId === ps.sectionKey || l.name === ps.title);
                                    return (
                                        <div
                                            key={idx}
                                            className="p-3 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 flex items-center justify-between gap-2"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-white truncate">{ps.title}</span>
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-black bg-zinc-900 text-zinc-400 border border-zinc-800">
                                                        {ps.mediaType}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-zinc-500 truncate block">
                                                    {ps.locations?.[0] || 'Remote Plex Storage'}
                                                </span>
                                            </div>

                                            {alreadyImported ? (
                                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-xl border border-emerald-500/20 flex items-center gap-1 shrink-0">
                                                    <Check size={11} /> Connected
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {(ps.mediaType === 'music' || ps.plexType === 'artist') && (
                                                        <button
                                                            disabled={isImportingPlex}
                                                            onClick={() => handleImportPlex(ps, 'audiobooks')}
                                                            className="px-2.5 py-1 rounded-xl bg-orange-500/20 hover:bg-orange-500 text-orange-300 hover:text-black text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 border border-orange-500/30"
                                                            title="Import as Audiobook Library"
                                                        >
                                                            <BookOpen size={10} /> As Audiobook
                                                        </button>
                                                    )}
                                                    <button
                                                        disabled={isImportingPlex}
                                                        onClick={() => handleImportPlex(ps)}
                                                        className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer disabled:opacity-50"
                                                    >
                                                        Import
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            )}
                        </div>
                    )}

                    {/* ── Create Library Panel ── */}
                    {isCreating && (
                        <form onSubmit={handleCreateLibrary} className="p-6 rounded-3xl bg-zinc-950 border border-emerald-500/30 space-y-5 shadow-2xl animate-in fade-in duration-200">
                            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                                <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                                    <FolderPlus size={18} />
                                    <span>Create New Library</span>
                                </div>
                                <span className="text-xs text-zinc-500">Add local storage or network folder</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                        Library Name:
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 4K Movies, Anime, Pop Music, Local IPTV"
                                        value={newLibName}
                                        onChange={e => setNewLibName(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-500 font-medium"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                        Media Category:
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                        {[
                                            { id: 'movie', label: 'Movie', icon: <Film size={13} /> },
                                            { id: 'tv', label: 'Series', icon: <Tv size={13} /> },
                                            { id: 'music', label: 'Music', icon: <Disc size={13} /> },
                                            { id: 'audiobooks', label: 'Audiobook', icon: <BookOpen size={13} /> },
                                            { id: 'live', label: 'IPTV', icon: <Tv2 size={13} /> }
                                        ].map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setNewLibType(t.id as any)}
                                                className={`py-3 px-2 rounded-2xl border text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer ${
                                                    newLibType === t.id
                                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm'
                                                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                                }`}
                                            >
                                                {t.icon}
                                                <span>{t.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Folders Management (For Movie, TV, Music) */}
                            {newLibType !== 'live' ? (
                                <div className="space-y-3 pt-2">
                                    <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                        Included Folder Paths ({newLibFolders.length}):
                                    </label>

                                    {newLibFolders.length > 0 && (
                                        <div className="space-y-2">
                                            {newLibFolders.map((fp, idx) => (
                                                <div key={idx} className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center justify-between gap-3 text-xs font-mono text-zinc-300">
                                                    <div className="flex items-center gap-2 truncate">
                                                        <Folder size={14} className="text-amber-400 shrink-0" />
                                                        <span className="truncate">{fp}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setNewLibFolders(prev => prev.filter((_, i) => i !== idx))}
                                                        className="p-1 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. /mnt/user/data/media/movies or D:\\Movies"
                                            value={folderInput}
                                            onChange={e => setFolderInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const val = folderInput.trim();
                                                    if (val && !newLibFolders.includes(val)) {
                                                        setNewLibFolders(prev => [...prev, val]);
                                                        setFolderInput('');
                                                    }
                                                }
                                            }}
                                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-500 font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const val = folderInput.trim();
                                                if (val && !newLibFolders.includes(val)) {
                                                    setNewLibFolders(prev => [...prev, val]);
                                                    setFolderInput('');
                                                }
                                            }}
                                            className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-colors shrink-0 cursor-pointer"
                                        >
                                            Add Path
                                        </button>
                                    </div>

                                    {/* Dynamic Plex & Server Storage Suggestions filtered by newLibType */}
                                    {(() => {
                                        // 1. Matching Plex sections
                                        const matchingPlex = plexSources.filter((ps: any) => {
                                            if (newLibType === 'movie') return ps.mediaType === 'movie' || ps.plexType === 'movie';
                                            if (newLibType === 'tv') return ps.mediaType === 'show' || ps.plexType === 'show';
                                            if (newLibType === 'music') return ps.mediaType === 'music' || ps.plexType === 'artist' || ps.plexType === 'music';
                                            if (newLibType === 'audiobooks') return ps.mediaType === 'audiobooks' || (ps.title || '').toLowerCase().includes('book');
                                            return false;
                                        });

                                        // 2. Matching Radarr / Sonarr folders
                                        const matchingArr = newLibType === 'movie' ? radarrSources : (newLibType === 'tv' ? sonarrSources : []);

                                        const hasPlexSuggestions = matchingPlex.length > 0;
                                        const hasArrSuggestions = matchingArr.length > 0;

                                        return (
                                            <div className="pt-2 space-y-3">
                                                {hasPlexSuggestions && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                                                                <Server size={14} />
                                                                <span>Plex {newLibType === 'movie' ? 'Movie' : newLibType === 'tv' ? 'Series' : newLibType === 'music' ? 'Music' : 'Audiobook'} Storage Paths:</span>
                                                            </div>
                                                            <span className="text-[11px] text-zinc-500 font-medium">Click to use full server path</span>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {matchingPlex.flatMap((ps: any, psIdx: number) => {
                                                                const locs: string[] = ps.locations || [];
                                                                return locs.map((locPath: string, lIdx: number) => {
                                                                    const isAdded = newLibFolders.includes(locPath);
                                                                    return (
                                                                        <button
                                                                            key={`plex-${psIdx}-${lIdx}`}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (!newLibFolders.includes(locPath)) {
                                                                                    setNewLibFolders(prev => [...prev, locPath]);
                                                                                }
                                                                                if (!newLibName.trim()) {
                                                                                    setNewLibName(ps.title);
                                                                                }
                                                                                setSelectedPlexSectionId(ps.sectionKey);
                                                                                setSelectedInstanceId(ps.instanceId);
                                                                            }}
                                                                            className={`p-3.5 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                                                                                isAdded
                                                                                    ? 'bg-amber-500/15 border-amber-500/50 text-white'
                                                                                    : 'bg-zinc-900/90 hover:bg-zinc-800/90 border-zinc-800 text-zinc-300 hover:border-amber-500/50'
                                                                            }`}
                                                                        >
                                                                            <div className="min-w-0 flex-1 space-y-1">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className="text-sm font-black text-amber-400 truncate">{ps.title}</span>
                                                                                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                                                                                        Section #{ps.sectionKey}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2 text-sm font-mono font-bold text-white break-all">
                                                                                    <Folder size={14} className="text-amber-400 shrink-0" />
                                                                                    <span className="truncate">{locPath}</span>
                                                                                </div>
                                                                            </div>
                                                                            <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${
                                                                                isAdded ? 'bg-amber-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400'
                                                                            }`}>
                                                                                {isAdded ? 'Selected' : '+ Use'}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                });
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {hasArrSuggestions && (
                                                    <div className="space-y-2">
                                                        <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                                            Connected {newLibType === 'movie' ? 'Radarr' : 'Sonarr'} Root Folders:
                                                        </span>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {matchingArr.map((arrItem: any, idx: number) => {
                                                                const isAdded = newLibFolders.includes(arrItem.path);
                                                                return (
                                                                    <button
                                                                        key={`arr-${idx}`}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (!newLibFolders.includes(arrItem.path)) {
                                                                                setNewLibFolders(prev => [...prev, arrItem.path]);
                                                                            }
                                                                            if (!newLibName.trim()) {
                                                                                setNewLibName(arrItem.instanceName || 'Media');
                                                                            }
                                                                        }}
                                                                        className={`p-3.5 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                                                                            isAdded
                                                                                ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                                                                                : 'bg-zinc-900/80 hover:bg-zinc-800/80 border-zinc-800 text-zinc-300'
                                                                        }`}
                                                                    >
                                                                        <div className="min-w-0 flex-1 space-y-1">
                                                                            <span className="text-sm font-black text-emerald-400 block truncate">{arrItem.title}</span>
                                                                            <span className="text-sm font-mono text-zinc-200 block truncate">{arrItem.path}</span>
                                                                        </div>
                                                                        <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${
                                                                            isAdded ? 'bg-emerald-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400'
                                                                        }`}>
                                                                            {isAdded ? 'Selected' : '+ Use'}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Other Server Mount Shortcuts if present */}
                                                {commonMounts.filter(cp => !matchingPlex.some((p: any) => (p.locations || []).includes(cp))).length > 0 && (
                                                    <div className="space-y-1.5 pt-1">
                                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
                                                            Other Server Mounts:
                                                        </span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {commonMounts
                                                                .filter(cp => !matchingPlex.some((p: any) => (p.locations || []).includes(cp)))
                                                                .map((cp, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (!newLibFolders.includes(cp)) {
                                                                                setNewLibFolders(prev => [...prev, cp]);
                                                                            }
                                                                        }}
                                                                        className="px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-[11px] font-mono text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-all flex items-center gap-1.5 cursor-pointer"
                                                                    >
                                                                        <HardDrive size={11} />
                                                                        <span>{cp}</span>
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                /* Live TV Inputs */
                                <div className="space-y-4 pt-2">
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIptvMode('url')}
                                            className={`py-2 px-3 rounded-xl border text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                iptvMode === 'url' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                            }`}
                                        >
                                            <Radio size={13} /> M3U URL
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIptvMode('xtream')}
                                            className={`py-2 px-3 rounded-xl border text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                iptvMode === 'xtream' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                            }`}
                                        >
                                            <Server size={13} /> Xtream Codes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIptvMode('upload')}
                                            className={`py-2 px-3 rounded-xl border text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                iptvMode === 'upload' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                            }`}
                                        >
                                            <UploadCloud size={13} /> Upload File
                                        </button>
                                    </div>

                                    {iptvMode === 'url' && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                M3U / M3U8 Playlist Stream URL:
                                            </label>
                                            <input
                                                type="url"
                                                placeholder="https://example.com/playlist.m3u8"
                                                value={iptvUrlInput}
                                                onChange={e => setIptvUrlInput(e.target.value)}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-red-500 font-mono"
                                            />
                                        </div>
                                    )}

                                    {iptvMode === 'xtream' && (
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                    Server Address / Host:
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="http://iptv-server.com:8080"
                                                    value={xtreamServer}
                                                    onChange={e => setXtreamServer(e.target.value)}
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500 font-mono"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                        Username:
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="username"
                                                        value={xtreamUser}
                                                        onChange={e => setXtreamUser(e.target.value)}
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500 font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                        Password:
                                                    </label>
                                                    <input
                                                        type="password"
                                                        placeholder="••••••••"
                                                        value={xtreamPass}
                                                        onChange={e => setXtreamPass(e.target.value)}
                                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-amber-500 font-mono"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {iptvMode === 'upload' && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                Select Local M3U File:
                                            </label>
                                            <input
                                                type="file"
                                                accept=".m3u,.m3u8"
                                                onChange={e => setIptvFile(e.target.files?.[0] || null)}
                                                className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                            XMLTV EPG Guide URL (Optional):
                                        </label>
                                        <input
                                            type="url"
                                            placeholder="https://example.com/epg.xml.gz"
                                            value={iptvEpgInput}
                                            onChange={e => setIptvEpgInput(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-red-500 font-mono"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingCreate}
                                    className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                                >
                                    {isSubmittingCreate ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                                    <span>Create Library</span>
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── Libraries List ── */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-10 h-10 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Loading Libraries...</p>
                        </div>
                    ) : filteredLibs.length === 0 ? (
                        <div className="py-20 text-center bg-zinc-950/40 rounded-3xl border border-zinc-900 text-zinc-500 space-y-3">
                            <Layers size={40} className="mx-auto text-zinc-700" />
                            <p className="text-base font-bold text-white">No {activeTypeFilter !== 'all' ? activeTypeFilter : ''} libraries found</p>
                            <p className="text-xs max-w-sm mx-auto">Click "+ Add Library" above or import from your connected Plex media server.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredLibs.map(lib => {
                                const isRescanning = Boolean(rescanningLibIds[lib.id]);
                                const isEditing = editingLibId === lib.id;

                                if (isEditing) {
                                    return (
                                        <div key={lib.id} className="p-6 bg-zinc-950 rounded-3xl border border-indigo-500/40 space-y-4 shadow-xl animate-in fade-in duration-200">
                                            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                                                <div className="flex items-center gap-2 text-indigo-400 font-black text-sm">
                                                    <Edit3 size={16} />
                                                    <span>Edit Library: {lib.name}</span>
                                                </div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-black uppercase ${getTypeBadgeClass(lib.type)}`}>
                                                    {lib.type}
                                                </span>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                    Library Name:
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editLibName}
                                                    onChange={e => setEditLibName(e.target.value)}
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-medium"
                                                />
                                            </div>

                                            {lib.type === 'live' ? (
                                                <div className="space-y-3">
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                            M3U Playlist / Xtream Stream URL:
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="http://example.com/get.php?username=...&password=...&type=m3u_plus"
                                                            value={editLibFolders[0] || ''}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setEditLibFolders(prev => {
                                                                    const next = [...prev];
                                                                    next[0] = val;
                                                                    return next;
                                                                });
                                                            }}
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white font-mono outline-none focus:border-red-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                            XMLTV EPG Guide URL:
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="http://example.com/xmltv.php?username=...&password=..."
                                                            value={editLibFolders[1] || ''}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setEditLibFolders(prev => {
                                                                    const next = [...prev];
                                                                    if (!next[0]) next[0] = '';
                                                                    next[1] = val;
                                                                    return next;
                                                                });
                                                            }}
                                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                                                        Folder Paths ({editLibFolders.length}):
                                                    </label>
                                                    {editLibFolders.map((f, i) => (
                                                        <div key={i} className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center justify-between gap-3 text-xs font-mono text-zinc-300">
                                                            <div className="flex items-center gap-2 truncate">
                                                                <Folder size={14} className="text-amber-400 shrink-0" />
                                                                <span className="truncate">{f}</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditLibFolders(prev => prev.filter((_, idx) => idx !== i))}
                                                                className="p-1 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}

                                                    <div className="flex gap-2 pt-1">
                                                        <input
                                                            type="text"
                                                            placeholder="Add another folder path..."
                                                            value={editFolderInput}
                                                            onChange={e => setEditFolderInput(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    const val = editFolderInput.trim();
                                                                    if (val && !editLibFolders.includes(val)) {
                                                                        setEditLibFolders(prev => [...prev, val]);
                                                                        setEditFolderInput('');
                                                                    }
                                                                }
                                                            }}
                                                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white font-mono placeholder-zinc-500 outline-none focus:border-indigo-500"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const val = editFolderInput.trim();
                                                                if (val && !editLibFolders.includes(val)) {
                                                                    setEditLibFolders(prev => [...prev, val]);
                                                                    setEditFolderInput('');
                                                                }
                                                            }}
                                                            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase rounded-2xl cursor-pointer"
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between pt-3 border-t border-zinc-900">
                                                <button
                                                    type="button"
                                                    onClick={() => setDeletingLib(lib)}
                                                    className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-black uppercase rounded-2xl cursor-pointer transition-all flex items-center gap-1.5"
                                                >
                                                    <Trash2 size={14} /> Delete
                                                </button>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingLibId(null)}
                                                        className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-bold rounded-2xl cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isSavingEdit || editLibFolders.length === 0}
                                                        onClick={handleSaveEdit}
                                                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase rounded-2xl cursor-pointer transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                                    >
                                                        {isSavingEdit ? <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={lib.id}
                                        className="p-5 bg-zinc-950/70 hover:bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 rounded-3xl transition-all space-y-3.5 shadow-lg group"
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                                                    {getTypeIcon(lib.type)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-base font-black text-white truncate">{lib.name}</h3>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-black uppercase ${getTypeBadgeClass(lib.type)}`}>
                                                            {lib.type}
                                                        </span>
                                                        {lib.plexSectionId && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase font-black">
                                                                Plex Connected
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-zinc-500 font-mono block truncate">
                                                        {lib.folders?.length ? `${lib.folders.length} folder${lib.folders.length > 1 ? 's' : ''} mapped` : 'No folders mapped'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                {/* Rescan Button */}
                                                <button
                                                    disabled={isRescanning}
                                                    onClick={() => handleRescan(lib)}
                                                    className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                    title="Rescan directory files"
                                                >
                                                    <RefreshCw size={13} className={isRescanning ? 'animate-spin text-emerald-400' : ''} />
                                                    <span>{isRescanning ? 'Scanning...' : 'Rescan'}</span>
                                                </button>

                                                {/* Edit Button */}
                                                <button
                                                    onClick={() => handleStartEdit(lib)}
                                                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 text-xs font-bold transition-all cursor-pointer"
                                                    title="Edit Library Folders & Name"
                                                >
                                                    <Edit3 size={14} />
                                                </button>

                                                {/* Delete Button */}
                                                <button
                                                    onClick={() => setDeletingLib(lib)}
                                                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all cursor-pointer"
                                                    title="Delete Library"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Folder paths pills */}
                                        {lib.folders && lib.folders.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-900/60">
                                                {lib.folders.map((f, fi) => (
                                                    <div
                                                        key={fi}
                                                        className="px-2.5 py-1 rounded-xl bg-zinc-900/80 text-[11px] font-mono text-zinc-400 border border-zinc-800/80 flex items-center gap-1.5 max-w-full truncate"
                                                        title={f}
                                                    >
                                                        <Folder size={11} className="text-amber-400/80 shrink-0" />
                                                        <span className="truncate">{f}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Delete Confirmation Dialog ── */}
                {deletingLib && (
                    <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
                        <div className="bg-[#111113] border border-red-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto">
                                <AlertCircle size={24} />
                            </div>
                            <div className="text-center space-y-1">
                                <h3 className="text-lg font-black text-white">Delete "${deletingLib.name}"?</h3>
                                <p className="text-xs text-zinc-400">
                                    This removes the library from Schedulearr and stops scanning. Your physical media files on disk will NOT be deleted.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    onClick={() => setDeletingLib(null)}
                                    className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs rounded-xl cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={isDeleting}
                                    onClick={handleConfirmDelete}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
                                >
                                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

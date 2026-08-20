'use client';

import React, { useState, useEffect } from 'react';
import {
    Users, Plus, Trash2, Shield, UserCheck, Folder,
    Check, X, RefreshCw, AlertTriangle, Lock, Mail,
    Film, Tv, Music, Image as ImageIcon, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

interface PlexUser {
    id: string;
    username: string;
    title: string;
    email?: string;
    thumb?: string;
    isAdmin: boolean;
    isRestricted: boolean;
    isHomeUser: boolean;
    instanceId: string;
    sharedLibraries: string[];
}

interface PlexLibrary {
    id: string;
    key: string;
    title: string;
    type: string;
    instanceId: string;
    instanceName: string;
}

export function PlexUserManagerPanel() {
    const [users, setUsers] = useState<PlexUser[]>([]);
    const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

    // Create Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [isHomeUser, setIsHomeUser] = useState(true);
    const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    // Delete Modal State
    const [userToDelete, setUserToDelete] = useState<PlexUser | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/plex/users');
            if (res.ok) {
                const data = await res.json();
                setUsers(Array.isArray(data.users) ? data.users : []);
                setLibraries(Array.isArray(data.libraries) ? data.libraries : []);
                if (Array.isArray(data.libraries)) {
                    setSelectedLibraryIds(data.libraries.map((l: PlexLibrary) => l.id));
                }
            } else {
                toast.error('Failed to load Plex users');
            }
        } catch (e) {
            toast.error('Error fetching Plex users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleToggleLibraryAccess = async (user: PlexUser, libraryId: string) => {
        const currentShared = user.sharedLibraries || [];
        const isCurrentlyShared = currentShared.includes(libraryId);
        const newShared = isCurrentlyShared
            ? currentShared.filter(id => id !== libraryId)
            : [...currentShared, libraryId];

        // Optimistic UI update
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, sharedLibraries: newShared } : u));
        setUpdatingUserId(user.id);

        try {
            const res = await fetch('/api/plex/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    instanceId: user.instanceId,
                    librarySectionIds: newShared
                })
            });

            if (res.ok) {
                toast.success(`Updated library access for ${user.username}`);
            } else {
                toast.error('Failed to update library permissions on Plex');
                // Revert
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, sharedLibraries: currentShared } : u));
            }
        } catch {
            toast.error('Error updating library permissions');
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, sharedLibraries: currentShared } : u));
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleCreateUser = async () => {
        if (isHomeUser && !newUsername.trim()) {
            toast.error('Username is required for managed user');
            return;
        }
        if (!isHomeUser && !newEmail.trim() && !newUsername.trim()) {
            toast.error('Email or username required for Plex friend');
            return;
        }

        setIsCreating(true);
        try {
            const res = await fetch('/api/plex/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: newUsername.trim(),
                    email: newEmail.trim(),
                    isHomeUser,
                    librarySectionIds: selectedLibraryIds
                })
            });

            if (res.ok) {
                toast.success(`User ${newUsername || newEmail} created successfully!`);
                setIsAddModalOpen(false);
                setNewUsername('');
                setNewEmail('');
                fetchUsers();
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'Failed to create Plex user');
            }
        } catch {
            toast.error('Error creating Plex user');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/plex/users?userId=${userToDelete.id}&instanceId=${userToDelete.instanceId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                toast.success(`User ${userToDelete.username} removed from Plex`);
                setUserToDelete(null);
                fetchUsers();
            } else {
                toast.error('Failed to delete Plex user');
            }
        } catch {
            toast.error('Error deleting Plex user');
        } finally {
            setIsDeleting(false);
        }
    };

    const getLibraryIcon = (type: string) => {
        if (type === 'movie') return <Film size={13} className="text-indigo-400" />;
        if (type === 'show') return <Tv size={13} className="text-emerald-400" />;
        if (type === 'artist' || type === 'music') return <Music size={13} className="text-amber-400" />;
        if (type === 'photo') return <ImageIcon size={13} className="text-pink-400" />;
        return <Folder size={13} className="text-zinc-400" />;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Users size={22} className="text-emerald-400" /> Plex Users & Library Access
                    </h2>
                    <p className="text-xs text-zinc-500 font-medium mt-0.5">
                        Create managed users, invite friends, and control granular library section access.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchUsers()}
                        className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        title="Refresh Users"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin text-emerald-400' : ''} />
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-4 py-2.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-emerald-600/30 transition-all flex items-center gap-2 shadow-lg"
                    >
                        <Plus size={15} /> Add Plex User
                    </button>
                </div>
            </div>

            {/* Users & Library Matrix */}
            {loading && users.length === 0 ? (
                <div className="flex justify-center py-24">
                    <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                </div>
            ) : users.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950/40 rounded-3xl border border-zinc-900 space-y-2">
                    <Users size={36} className="mx-auto text-zinc-700" />
                    <p className="text-zinc-400 font-bold">No Plex users found or Plex instance not connected.</p>
                    <p className="text-xs text-zinc-600">Ensure a Plex server with a valid token is configured in Settings.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {users.map(user => {
                        const isOwner = user.isAdmin;
                        return (
                            <div
                                key={user.id}
                                className="p-5 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition-all space-y-4 shadow-xl"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3.5">
                                        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white font-black text-lg overflow-hidden shrink-0 shadow-md">
                                            {user.thumb ? (
                                                <img src={user.thumb} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                user.username.slice(0, 2).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-white text-base">{user.username}</h3>
                                                {isOwner ? (
                                                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                                        <Shield size={10} /> Owner / Admin
                                                    </span>
                                                ) : user.isHomeUser ? (
                                                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                                        <UserCheck size={10} /> Home User
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                                                        <Mail size={10} /> Friend
                                                    </span>
                                                )}
                                            </div>
                                            {user.email && <p className="text-xs text-zinc-500 font-medium">{user.email}</p>}
                                        </div>
                                    </div>

                                    {!isOwner && (
                                        <button
                                            onClick={() => setUserToDelete(user)}
                                            className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-xs font-bold flex items-center gap-1.5"
                                            title="Delete User"
                                        >
                                            <Trash2 size={14} /> Remove User
                                        </button>
                                    )}
                                </div>

                                {/* Library Permissions Row */}
                                <div className="pt-3 border-t border-zinc-900 space-y-2">
                                    <div className="flex items-center justify-between text-xs text-zinc-500 font-bold">
                                        <span className="uppercase tracking-wider text-[10px]">Accessible Plex Libraries:</span>
                                        {isOwner ? (
                                            <span className="text-amber-400/80 text-[10px]">Full Server Access</span>
                                        ) : (
                                            <span className="text-zinc-600 text-[10px]">Click to toggle library access</span>
                                        )}
                                    </div>

                                    {isOwner ? (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {libraries.map(lib => (
                                                <div
                                                    key={lib.id}
                                                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-900/60 border border-zinc-800 text-zinc-300 flex items-center gap-2"
                                                >
                                                    {getLibraryIcon(lib.type)}
                                                    <span>{lib.title}</span>
                                                    <Check size={12} className="text-emerald-400" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {libraries.map(lib => {
                                                const isShared = (user.sharedLibraries || []).includes(lib.id);
                                                return (
                                                    <button
                                                        key={lib.id}
                                                        onClick={() => handleToggleLibraryAccess(user, lib.id)}
                                                        disabled={updatingUserId === user.id}
                                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                                                            isShared
                                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                                                                : 'bg-zinc-900/40 border-zinc-800/80 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'
                                                        }`}
                                                    >
                                                        {getLibraryIcon(lib.type)}
                                                        <span>{lib.title}</span>
                                                        {isShared ? (
                                                            <CheckCircle2 size={13} className="text-emerald-400" />
                                                        ) : (
                                                            <X size={13} className="text-zinc-600" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create User Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative space-y-6">
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                <Users size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white">Add Plex User</h2>
                                <p className="text-xs text-zinc-500 font-medium">Create a Home User or invite a friend to your server.</p>
                            </div>
                        </div>

                        {/* User Type Toggle */}
                        <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
                            <button
                                onClick={() => setIsHomeUser(true)}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    isHomeUser ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Managed Home User
                            </button>
                            <button
                                onClick={() => setIsHomeUser(false)}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    !isHomeUser ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Plex Friend Invite
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block mb-1.5">
                                    {isHomeUser ? 'User Name / Profile Name' : 'Plex Username or Email'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={isHomeUser ? 'e.g. Kids, Guest, Roommate' : 'e.g. friend@example.com or PlexUsername'}
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* Libraries Access Selection */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                                    Assign Accessible Libraries
                                </label>
                                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                    {libraries.map(lib => {
                                        const isSelected = selectedLibraryIds.includes(lib.id);
                                        return (
                                            <button
                                                key={lib.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedLibraryIds(prev =>
                                                        prev.includes(lib.id)
                                                            ? prev.filter(id => id !== lib.id)
                                                            : [...prev, lib.id]
                                                    );
                                                }}
                                                className={`p-2.5 rounded-xl text-xs font-bold border flex items-center justify-between transition-all ${
                                                    isSelected
                                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                                                }`}
                                            >
                                                <span className="flex items-center gap-1.5 truncate">
                                                    {getLibraryIcon(lib.type)}
                                                    <span className="truncate">{lib.title}</span>
                                                </span>
                                                {isSelected && <Check size={12} className="text-emerald-400 shrink-0" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={isCreating}
                                onClick={handleCreateUser}
                                className="flex-[2] h-12 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                            >
                                {isCreating ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Plus size={16} />}
                                {isCreating ? 'Creating...' : 'Confirm & Add'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {userToDelete && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#0c0c0c] border border-zinc-800 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400">
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white">Remove Plex User</h2>
                                <p className="text-xs text-zinc-500 font-medium">{userToDelete.username}</p>
                            </div>
                        </div>

                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Are you sure you want to remove this user from your Plex server? They will lose access to all shared libraries.
                        </p>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setUserToDelete(null)}
                                className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={isDeleting}
                                onClick={handleDeleteUser}
                                className="flex-[2] h-12 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 disabled:opacity-50"
                            >
                                {isDeleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 size={16} />}
                                {isDeleting ? 'Removing...' : 'Delete User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

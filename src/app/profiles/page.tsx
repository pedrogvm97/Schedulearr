"use client";

import React, { useState, useEffect } from 'react';
import {
    Settings,
    Trash2,
    Copy,
    Plus,
    RefreshCcw,
    ShieldCheck,
    AlertCircle,
    ChevronRight,
    Search,
    Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Profile {
    id: number;
    name: string;
    instanceId: string;
    instanceName: string;
    instanceType: string;
    upgradeAllowed: boolean;
    cutoff: number;
    items: any[];
}

interface Instance {
    id: string;
    name: string;
    type: string;
}

export default function ProfilesPage() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [instances, setInstances] = useState<Instance[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterInstance, setFilterInstance] = useState('All');
    const [filterType, setFilterType] = useState('All');

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/profiles');
            if (res.ok) {
                const data = await res.json();
                setProfiles(data);
            }
        } catch (error) {
            console.error('Failed to fetch profiles:', error);
            toast.error('Failed to load quality profiles');
        } finally {
            setLoading(false);
        }
    };

    const fetchInstances = async () => {
        try {
            const res = await fetch('/api/instances');
            if (res.ok) {
                const data = await res.json();
                setInstances(data);
            }
        } catch (error) {
            console.error('Failed to fetch instances:', error);
        }
    };

    useEffect(() => {
        fetchProfiles();
        fetchInstances();
    }, []);

    const handleDelete = async (profile: Profile) => {
        if (!confirm(`Are you sure you want to delete profile "${profile.name}" from ${profile.instanceName}?`)) return;

        try {
            const res = await fetch(`/api/profiles?instanceId=${profile.instanceId}&profileId=${profile.id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                toast.success('Profile deleted successfully');
                setProfiles(prev => prev.filter(p => !(p.id === profile.id && p.instanceId === profile.instanceId)));
            } else {
                const err = await res.json();
                toast.error(err.error || 'Failed to delete profile');
            }
        } catch (error) {
            toast.error('An error occurred while deleting the profile');
        }
    };

    const handleCopy = async (profile: Profile, targetInstanceId: string) => {
        if (profile.instanceId === targetInstanceId) return;

        try {
            const res = await fetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: targetInstanceId,
                    profile: {
                        name: `${profile.name} (Copy)`,
                        upgradeAllowed: profile.upgradeAllowed,
                        cutoff: profile.cutoff,
                        items: profile.items
                    }
                })
            });

            if (res.ok) {
                toast.success(`Profile copied to ${instances.find(i => i.id === targetInstanceId)?.name}`);
                fetchProfiles();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Failed to copy profile');
            }
        } catch (error) {
            toast.error('An error occurred while copying the profile');
        }
    };

    const filteredProfiles = profiles.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.instanceName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesInstance = filterInstance === 'All' || p.instanceId === filterInstance;
        const matchesType = filterType === 'All' || p.instanceType === filterType;
        return matchesSearch && matchesInstance && matchesType;
    });

    return (
        <div className="max-w-7xl mx-auto px-6 py-12 space-y-12 animate-in fade-in duration-700">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">Management</span>
                    </div>
                    <h1 className="text-5xl font-black text-white tracking-tight">Quality Profiles</h1>
                    <p className="text-zinc-500 font-medium text-lg max-w-2xl leading-relaxed text-balance">
                        Manage your quality definitions across all instances. Copy profiles between servers or create consistent standards for your entire library.
                    </p>
                </div>

                <button
                    onClick={fetchProfiles}
                    className="flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl transition-all font-bold text-sm border border-zinc-800"
                >
                    <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Filters bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-2 bg-black/40 backdrop-blur-xl border border-zinc-900 rounded-[2rem]">
                <div className="relative col-span-2">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                    <input
                        type="text"
                        placeholder="Search profiles or instances..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-14 pr-6 py-4 bg-transparent text-white placeholder:text-zinc-600 focus:outline-none font-medium"
                    />
                </div>

                <div className="flex items-center gap-2 px-4 border-l border-zinc-900">
                    <Filter size={16} className="text-zinc-600" />
                    <select
                        value={filterInstance}
                        onChange={(e) => setFilterInstance(e.target.value)}
                        className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer w-full"
                    >
                        <option value="All">All Instances</option>
                        {instances.map(inst => (
                            <option key={inst.id} value={inst.id}>{inst.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2 px-4 border-l border-zinc-900">
                    <ChevronRight size={16} className="text-zinc-600" />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer w-full"
                    >
                        <option value="All">All Types</option>
                        <option value="radarr">Radarr</option>
                        <option value="sonarr">Sonarr</option>
                    </select>
                </div>
            </div>

            {/* Profiles Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-64 bg-zinc-900/50 rounded-[2.5rem] animate-pulse border border-zinc-800/50" />
                    ))}
                </div>
            ) : filteredProfiles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredProfiles.map((profile, idx) => (
                        <div
                            key={`${profile.instanceId}-${profile.id}`}
                            className="group flex flex-col bg-[#090909] border border-zinc-900 hover:border-zinc-800 rounded-[2.5rem] p-8 transition-all duration-500 shadow-2xl hover:-translate-y-1"
                        >
                            <div className="flex justify-between items-start mb-8">
                                <div className="space-y-1">
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border uppercase tracking-widest ${profile.instanceType === 'radarr' ? 'border-amber-500/20 text-amber-500 bg-amber-500/5' : 'border-sky-500/20 text-sky-500 bg-sky-500/5'
                                        }`}>
                                        {profile.instanceName}
                                    </span>
                                    <h3 className="text-2xl font-black text-white truncate max-w-[200px]">{profile.name}</h3>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleDelete(profile)}
                                        className="p-3 rounded-2xl bg-zinc-900/50 text-zinc-600 hover:bg-red-500/10 hover:text-red-500 transition-all border border-zinc-800"
                                        title="Delete Profile"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4 flex-1">
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-zinc-900/50">
                                    <span className="text-xs font-bold text-zinc-500">Upgrade Allowed</span>
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${profile.upgradeAllowed ? 'text-emerald-500 bg-emerald-500/10' : 'text-zinc-600 bg-zinc-900'
                                        }`}>
                                        {profile.upgradeAllowed ? 'YES' : 'NO'}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-1.5 pt-2">
                                    {profile.items?.filter((item: any) => item.allowed).slice(0, 6).map((item: any) => (
                                        <span key={item.quality.id} className="px-2.5 py-1 rounded-lg bg-zinc-900/50 border border-zinc-800 text-[9px] font-bold text-zinc-400">
                                            {item.quality.name}
                                        </span>
                                    ))}
                                    {profile.items?.filter((item: any) => item.allowed).length > 6 && (
                                        <span className="px-2.5 py-1 rounded-lg bg-zinc-900 text-[9px] font-bold text-zinc-600">
                                            +{profile.items.filter((item: any) => item.allowed).length - 6} more
                                        </span>
                                    ) || <span className="text-[9px] font-bold text-zinc-600 px-1">Any quality</span>}
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-zinc-900 flex flex-col gap-3">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block ml-1">Copy to Instance</label>
                                <div className="flex gap-2">
                                    <select
                                        className="flex-1 bg-zinc-900/50 border border-zinc-900 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none"
                                        onChange={(e) => handleCopy(profile, e.target.value)}
                                        value=""
                                    >
                                        <option value="" disabled>Select Target...</option>
                                        {instances
                                            .filter(i => i.id !== profile.instanceId && i.type === profile.instanceType)
                                            .map(inst => (
                                                <option key={inst.id} value={inst.id}>{inst.name}</option>
                                            ))
                                        }
                                    </select>
                                    <div className="p-2 rounded-xl bg-zinc-900 text-zinc-600 border border-zinc-800">
                                        <Copy size={16} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32 space-y-6 bg-zinc-950/20 rounded-[3rem] border border-zinc-900/50 shadow-inner">
                    <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-800">
                        <AlertCircle size={40} />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-2xl font-black text-white">No Profiles Found</h3>
                        <p className="text-zinc-600 font-medium">Make sure your instances are correctly configured and online.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

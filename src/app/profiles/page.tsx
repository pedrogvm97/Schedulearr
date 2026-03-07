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
    Filter,
    X,
    ChevronDown,
    ChevronUp,
    Film,
    Tv,
    ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { CustomSelect } from '@/components/CustomSelect';
import { twColorToHex } from '@/lib/instanceColor';
import { CreateProfileModal } from '@/components/CreateProfileModal';

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
    color?: string;
}

export default function ProfilesPage() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [instances, setInstances] = useState<Instance[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterInstances, setFilterInstances] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'All' | 'radarr' | 'sonarr'>('All');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [expandingProfile, setExpandingProfile] = useState<string | null>(null); // "instanceId-profileId"
    const [profileMedia, setProfileMedia] = useState<Record<string, any[]>>({}); // items grouped by profile key
    const [loadingMedia, setLoadingMedia] = useState<string | null>(null);

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
                // ONLY Radarr and Sonarr are relevant for quality profiles
                setInstances(data.filter((i: any) => i.type === 'radarr' || i.type === 'sonarr'));
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

    const toggleInstanceFilter = (id: string) => {
        setFilterInstances(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const fetchProfileMedia = async (profile: Profile) => {
        const key = `${profile.instanceId}-${profile.id}`;
        if (profileMedia[key]) return; // Already loaded

        setLoadingMedia(key);
        try {
            const endpoint = profile.instanceType === 'radarr' ? '/api/radarr/all' : '/api/sonarr/all';
            const res = await fetch(endpoint);
            if (res.ok) {
                const allMedia = await res.json();
                const items = allMedia.filter((m: any) =>
                    m.instanceId === profile.instanceId && m.qualityProfileId === profile.id
                );
                setProfileMedia(prev => ({ ...prev, [key]: items }));
            }
        } catch (error) {
            console.error('Failed to fetch media for profile:', error);
        } finally {
            setLoadingMedia(null);
        }
    };

    const filteredProfiles = profiles.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.instanceName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesInstance = filterInstances.length > 0 && filterInstances.includes(p.instanceId);
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

                <div className="flex flex-wrap gap-4">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-emerald-400 transition-all font-bold text-sm rounded-2xl shadow-xl shadow-white/5"
                    >
                        <Plus size={18} />
                        Create Profile
                    </button>
                    <button
                        onClick={fetchProfiles}
                        className="flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl transition-all font-bold text-sm border border-zinc-800"
                    >
                        <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Combined Filter Bar */}
            <div className="flex flex-col gap-6 p-6 bg-black/40 backdrop-blur-xl border border-zinc-900 rounded-[2.5rem]">
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                        <input
                            type="text"
                            placeholder="Search by profile name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-14 pr-6 py-4 bg-zinc-950 border border-zinc-800/50 rounded-2xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all font-medium"
                        />
                    </div>

                    {/* Media Type Filter */}
                    <div className="flex p-1 bg-zinc-950 rounded-2xl border border-zinc-900 overflow-hidden">
                        {(['All', 'radarr', 'sonarr'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-6 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${filterType === type ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                            >
                                {type === 'radarr' ? 'Movies' : type === 'sonarr' ? 'Series' : 'All'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Instance Toggler Filter */}
                <div className="flex flex-col gap-3 pt-2">
                    <span className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-1">Filter by Instance</span>
                    <div className="flex flex-wrap gap-2">
                        {instances.filter(i => filterType === 'All' || i.type === filterType).map(inst => {
                            const isSelected = filterInstances.includes(inst.id);
                            const hex = twColorToHex(inst.color);
                            return (
                                <button
                                    key={inst.id}
                                    onClick={() => toggleInstanceFilter(inst.id)}
                                    className="px-4 py-2 text-[11px] font-bold rounded-xl border transition-all flex items-center gap-2.5"
                                    style={isSelected ? {
                                        backgroundColor: `${hex}22`,
                                        borderColor: `${hex}66`,
                                        color: hex,
                                    } : {
                                        backgroundColor: 'rgba(9,9,11,0.5)',
                                        borderColor: '#27272a',
                                        color: '#71717a'
                                    }}
                                >
                                    <div
                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: hex }}
                                    />
                                    {inst.name}
                                    {isSelected && <X size={10} className="ml-1 opacity-60" />}
                                </button>
                            );
                        })}
                        {filterInstances.length > 0 && (
                            <button
                                onClick={() => setFilterInstances([])}
                                className="px-4 py-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest hover:text-white transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                    </div>
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
                                    {(profile.items || []).filter((item: any) => item?.allowed && item?.quality).slice(0, 6).map((item: any) => (
                                        <span key={item.quality.id} className="px-2.5 py-1 rounded-lg bg-zinc-900/50 border border-zinc-800 text-[9px] font-bold text-zinc-400">
                                            {item.quality.name}
                                        </span>
                                    ))}
                                    {(profile.items || []).filter((item: any) => item?.allowed && item?.quality).length > 6 && (
                                        <span className="px-2.5 py-1 rounded-lg bg-zinc-900 text-[9px] font-bold text-zinc-600">
                                            +{(profile.items || []).filter((item: any) => item?.allowed && item?.quality).length - 6} more
                                        </span>
                                    )}
                                    {(!profile.items || profile.items.filter((item: any) => item?.allowed && item?.quality).length === 0) && (
                                        <span className="text-[9px] font-bold text-zinc-600 px-1 italic">Any quality</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-2 items-center mt-auto pt-6">
                                <div className="flex-1">
                                    <CustomSelect
                                        label="Clone to"
                                        options={instances
                                            .filter(i => i.id !== profile.instanceId && i.type === profile.instanceType)
                                            .map(i => ({ id: i.id, name: i.name }))
                                        }
                                        value=""
                                        onChange={(val) => handleCopy(profile, val)}
                                        placeholder="Target Instance..."
                                        minimal
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        const key = `${profile.instanceId}-${profile.id}`;
                                        if (expandingProfile === key) {
                                            setExpandingProfile(null);
                                        } else {
                                            setExpandingProfile(key);
                                            fetchProfileMedia(profile);
                                        }
                                    }}
                                    className={`p-3 rounded-2xl flex items-center justify-center transition-all border ${expandingProfile === `${profile.instanceId}-${profile.id}`
                                        ? 'bg-white text-black border-white'
                                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    title="View Media in Profile"
                                >
                                    {expandingProfile === `${profile.instanceId}-${profile.id}` ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                            </div>

                            {/* Expanded Media List */}
                            {expandingProfile === `${profile.instanceId}-${profile.id}` && (
                                <div className="mt-6 pt-6 border-t border-zinc-900 animate-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Associated Media</h4>
                                        <span className="text-[10px] font-bold text-zinc-600">
                                            {loadingMedia === `${profile.instanceId}-${profile.id}` ? 'Loading...' : `${profileMedia[`${profile.instanceId}-${profile.id}`]?.length || 0} items`}
                                        </span>
                                    </div>

                                    {loadingMedia === `${profile.instanceId}-${profile.id}` ? (
                                        <div className="space-y-2">
                                            {[1, 2, 3].map(i => (
                                                <div key={i} className="h-10 bg-zinc-900/50 rounded-xl animate-pulse" />
                                            ))}
                                        </div>
                                    ) : (profileMedia[`${profile.instanceId}-${profile.id}`]?.length || 0) > 0 ? (
                                        <div className="max-h-60 overflow-y-auto pr-1 custom-scrollbar space-y-2">
                                            {profileMedia[`${profile.instanceId}-${profile.id}`].map((m: any) => (
                                                <div key={m.id} className="flex items-center gap-3 p-3 bg-black/40 border border-zinc-900/50 rounded-xl group/item hover:border-zinc-800 transition-all">
                                                    <div className="w-8 h-10 rounded bg-zinc-900 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                                        {profile.instanceType === 'radarr' ? <Film size={12} className="text-zinc-700" /> : <Tv size={12} className="text-zinc-700" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[11px] font-bold text-zinc-300 truncate">{m.title}</div>
                                                        <div className="text-[9px] text-zinc-600 font-medium">{m.year} • {m.status}</div>
                                                    </div>
                                                    <ChevronRight size={12} className="text-zinc-800 group-hover/item:text-zinc-500" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center bg-zinc-950/40 rounded-2xl border border-zinc-900 border-dashed">
                                            <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">No items found in this profile</p>
                                        </div>
                                    )}
                                </div>
                            )}
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

            {/* Create Profile Modal */}
            {showCreateModal && (
                <CreateProfileModal
                    instances={instances}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); fetchProfiles(); }}
                />
            )}
        </div>
    );
}

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
    colorHex?: string;
}

export function ProfilesPanel() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [instances, setInstances] = useState<Instance[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterInstances, setFilterInstances] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'All' | 'radarr' | 'sonarr'>('All');
    const [editingProfile, setEditingProfile] = useState<{ instanceId: string, profile: Profile } | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [expandingProfile, setExpandingProfile] = useState<string | null>(null);
    const [profileMedia, setProfileMedia] = useState<Record<string, any[]>>({});
    const [loadingMedia, setLoadingMedia] = useState<string | null>(null);

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const instRes = await fetch('/api/instances');
            const instData = await instRes.json();
            setInstances(instData);

            let allProfiles: Profile[] = [];
            for (const inst of instData) {
                const res = await fetch(`/api/instances/profiles?instanceId=${inst.id}`);
                if (res.ok) {
                    const data = await res.json();
                    const mapped = data.map((p: any) => ({
                        ...p,
                        instanceId: inst.id,
                        instanceName: inst.name,
                        instanceType: inst.type
                    }));
                    allProfiles = [...allProfiles, ...mapped];
                }
            }
            setProfiles(allProfiles);
        } catch (e) {
            toast.error('Failed to load profiles');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    const toggleInstanceFilter = (id: string) => {
        setFilterInstances(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleExpandProfile = async (profKey: string, instanceId: string, profileId: number, type: string) => {
        if (expandingProfile === profKey) {
            setExpandingProfile(null);
            return;
        }

        setExpandingProfile(profKey);
        if (profileMedia[profKey]) return;

        setLoadingMedia(profKey);
        try {
            const endpoint = type === 'movie' || type === 'radarr' ? '/api/radarr/all' : '/api/sonarr/all';
            const res = await fetch(`${endpoint}?instanceId=${instanceId}`);
            if (res.ok) {
                const mediaItems = await res.json();
                const matching = mediaItems.filter((item: any) => item.qualityProfileId === profileId);
                setProfileMedia(prev => ({ ...prev, [profKey]: matching }));
            }
        } catch (e) {
            toast.error('Failed to load assigned media');
        } finally {
            setLoadingMedia(null);
        }
    };

    const filteredProfiles = profiles.filter(p => {
        if (filterType !== 'All' && p.instanceType !== filterType) return false;
        if (filterInstances.length > 0 && !filterInstances.includes(p.instanceId)) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.instanceName.toLowerCase().includes(q);
        }
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black text-white">Quality Profiles</h2>
                    <p className="text-xs text-zinc-500 font-medium">Manage and clone quality profiles across Radarr and Sonarr instances.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-600/30 transition-all flex items-center gap-2 self-start md:self-auto"
                >
                    <Plus size={14} /> Create Profile
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <input
                        type="text"
                        placeholder="Search profiles..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-white placeholder-zinc-500 outline-none focus:border-emerald-500/50"
                    />
                </div>

                <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                    {['All', 'radarr', 'sonarr'].map((type) => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type as any)}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                filterType === type ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {type === 'radarr' ? 'Movies' : type === 'sonarr' ? 'Series' : 'All Types'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Profile Grid */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                </div>
            ) : filteredProfiles.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950/40 rounded-3xl border border-zinc-900">
                    <p className="text-zinc-500 font-bold">No profiles matched your filters.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProfiles.map((profile) => {
                        const instance = instances.find(i => i.id === profile.instanceId);
                        const hexColor = twColorToHex(instance?.color || '');
                        const profKey = `${profile.instanceId}-${profile.id}`;
                        const isExpanded = expandingProfile === profKey;
                        const assignedMedia = profileMedia[profKey] || [];

                        return (
                            <div
                                key={profKey}
                                className="p-5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition-all space-y-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <h3 className="font-bold text-white text-base">{profile.name}</h3>
                                        <span
                                            className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border inline-block"
                                            style={{
                                                backgroundColor: `${hexColor}15`,
                                                borderColor: `${hexColor}40`,
                                                color: hexColor
                                            }}
                                        >
                                            {profile.instanceName} ({profile.instanceType})
                                        </span>
                                    </div>

                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                        profile.upgradeAllowed ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                                    }`}>
                                        {profile.upgradeAllowed ? 'Upgrades On' : 'Fixed Quality'}
                                    </span>
                                </div>

                                <button
                                    onClick={() => handleExpandProfile(profKey, profile.instanceId, profile.id, profile.instanceType)}
                                    className="w-full py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:border-zinc-700 transition-all flex items-center justify-between px-4"
                                >
                                    <span>Assigned Media</span>
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {isExpanded && (
                                    <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50 space-y-2 max-h-48 overflow-y-auto custom-scrollbar text-xs">
                                        {loadingMedia === profKey ? (
                                            <p className="text-zinc-500 text-center py-2">Loading media...</p>
                                        ) : assignedMedia.length === 0 ? (
                                            <p className="text-zinc-500 text-center py-2">No media using this profile.</p>
                                        ) : (
                                            assignedMedia.map(m => (
                                                <div key={m.id} className="flex justify-between items-center text-zinc-300 py-1 border-b border-zinc-800/40 last:border-0">
                                                    <span className="truncate max-w-[200px] font-medium">{m.title}</span>
                                                    <span className="text-[10px] text-zinc-500 font-mono">{m.year}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {showCreateModal && (
                <CreateProfileModal
                    instances={instances}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={fetchProfiles}
                />
            )}
        </div>
    );
}

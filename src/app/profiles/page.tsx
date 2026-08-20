'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sliders, Radio, ShieldCheck, Users } from 'lucide-react';
import { ProfilesPanel } from '@/components/ProfilesPanel';
import { IndexersPanel } from '@/components/IndexersPanel';
import { PlexUserManagerPanel } from '@/components/PlexUserManagerPanel';

function ProfilesAndIndexersContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialTab = searchParams.get('tab') === 'indexers' ? 'indexers' : searchParams.get('tab') === 'plex-users' ? 'plex-users' : 'profiles';
    const [activeTab, setActiveTab] = useState<'profiles' | 'indexers' | 'plex-users'>(initialTab);

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam === 'indexers' || tabParam === 'profiles' || tabParam === 'plex-users') {
            setActiveTab(tabParam);
        }
    }, [searchParams]);

    const handleTabChange = (tab: 'profiles' | 'indexers' | 'plex-users') => {
        setActiveTab(tab);
        const url = tab === 'indexers' ? '/profiles?tab=indexers' : tab === 'plex-users' ? '/profiles?tab=plex-users' : '/profiles';
        router.replace(url, { scroll: false });
    };

    return (
        <div className="max-w-[1800px] mx-auto p-4 sm:p-8 space-y-6">
            {/* Header & Sub-Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-2xl p-5 sm:p-6 rounded-[2.5rem] shadow-2xl">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        <Sliders size={26} className="text-emerald-400" /> Profiles, Indexers & Users
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1 font-medium">
                        Manage quality profiles, Prowlarr indexers, and Plex user library permissions in one consolidated place.
                    </p>
                </div>

                {/* Segmented Switcher */}
                <div className="flex flex-wrap bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner self-start sm:self-auto gap-1">
                    <button
                        onClick={() => handleTabChange('profiles')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all ${
                            activeTab === 'profiles'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <ShieldCheck size={16} /> Quality Profiles
                    </button>
                    <button
                        onClick={() => handleTabChange('indexers')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all ${
                            activeTab === 'indexers'
                                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Radio size={16} /> Indexers & Rules
                    </button>
                    <button
                        onClick={() => handleTabChange('plex-users')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all ${
                            activeTab === 'plex-users'
                                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Users size={16} /> Plex Users
                    </button>
                </div>
            </div>

            {/* Active Panel View */}
            <div className="animate-in fade-in duration-200">
                {activeTab === 'profiles' ? (
                    <ProfilesPanel />
                ) : activeTab === 'indexers' ? (
                    <IndexersPanel />
                ) : (
                    <PlexUserManagerPanel />
                )}
            </div>
        </div>
    );
}

export default function ProfilesPage() {
    return (
        <Suspense fallback={
            <div className="max-w-[1800px] mx-auto p-8 flex items-center justify-center py-40">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            </div>
        }>
            <ProfilesAndIndexersContent />
        </Suspense>
    );
}

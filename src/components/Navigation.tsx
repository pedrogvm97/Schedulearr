'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Film, Play, Download, Sliders, Calendar,
    BarChart3, Settings, Menu, X, Tv, ShieldCheck,
    HardDrive, Sparkles, ChevronRight
} from 'lucide-react';

const primaryNavItems = [
    {
        href: '/theater',
        label: 'Theater',
        icon: (active: boolean) => <Play size={active ? 20 : 18} className={active ? 'text-purple-400' : 'text-zinc-400'} />
    },
    {
        href: '/discover',
        label: 'Media',
        icon: (active: boolean) => <Film size={active ? 20 : 18} className={active ? 'text-emerald-400' : 'text-zinc-400'} />
    }
];

const secondaryNavItems = [
    {
        href: '/',
        label: 'Schedule',
        icon: (active: boolean) => <Calendar size={active ? 20 : 18} className={active ? 'text-emerald-400' : 'text-zinc-400'} />
    },
    {
        href: '/downloads',
        label: 'Transfers',
        icon: (active: boolean) => <Download size={active ? 20 : 18} className={active ? 'text-sky-400' : 'text-zinc-400'} />
    },
    {
        href: '/analytics',
        label: 'Analytics',
        icon: (active: boolean) => <BarChart3 size={active ? 20 : 18} className={active ? 'text-indigo-400' : 'text-zinc-400'} />
    },
    {
        href: '/settings',
        label: 'Settings',
        icon: (active: boolean) => <Settings size={active ? 20 : 18} className={active ? 'text-zinc-200' : 'text-zinc-400'} />
    }
];

// Clean 4-tab mobile core navigation
const mobileCoreNavItems = [
    {
        href: '/theater',
        label: 'Theater',
        icon: (active: boolean) => <Play size={20} className={active ? 'text-purple-400' : 'text-zinc-400'} />
    },
    {
        href: '/discover',
        label: 'Media',
        icon: (active: boolean) => <Film size={20} className={active ? 'text-emerald-400' : 'text-zinc-400'} />
    },
    {
        href: '/',
        label: 'Schedule',
        icon: (active: boolean) => <Calendar size={20} className={active ? 'text-emerald-400' : 'text-zinc-400'} />
    },
    {
        href: '/downloads',
        label: 'Transfers',
        icon: (active: boolean) => <Download size={20} className={active ? 'text-sky-400' : 'text-zinc-400'} />
    }
];

export function Navigation() {
    const pathname = usePathname();
    const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
    const [appVersion, setAppVersion] = useState('0.5.84');
    const [activeMusicCount, setActiveMusicCount] = useState(0);

    useEffect(() => {
        const checkQueue = async () => {
            try {
                const res = await fetch('/api/theater/music/queue');
                if (res.ok) {
                    const data = await res.json();
                    setActiveMusicCount((data.activeCount || 0) + (data.queuedCount || 0));
                }
            } catch {}
        };
        checkQueue();
        const interval = setInterval(checkQueue, 4000);

        fetch('/api/system/version')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.currentVersion) setAppVersion(data.currentVersion);
            })
            .catch(() => {});

        return () => clearInterval(interval);
    }, []);

    const allNavItems = [...primaryNavItems, ...secondaryNavItems];

    const isMoreTabActive = ['/profiles', '/analytics', '/settings', '/tv'].includes(pathname);

    return (
        <>
            {/* ── Top Mobile App Header (<640px) ── */}
            <header className="sm:hidden sticky top-0 z-50 w-full bg-zinc-950/85 backdrop-blur-2xl border-b border-white/5 px-4 h-14 flex items-center justify-between shadow-lg">
                <Link href="/" className="flex items-center gap-2.5 active:scale-95 transition-transform">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-zinc-900 p-1 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                        <img src="/icon.png" alt="Schedulearr" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="font-black text-base text-white tracking-tight">Schedulearr</span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-emerald-500/30">v{appVersion}</span>
                    </div>
                </Link>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsMobileMoreOpen(true)}
                        className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white active:scale-95 transition-all"
                        aria-label="Open Navigation Menu"
                    >
                        <Menu size={18} />
                    </button>
                </div>
            </header>

            {/* ── Desktop & Tablet Top Nav (≥640px) ── */}
            <nav className="hidden sm:block border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-2xl sticky top-0 z-50 w-full max-w-full">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-3 group flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-zinc-900 p-1.5 border border-emerald-500/30 transition-transform group-hover:scale-105 shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center">
                            <img src="/icon.png" alt="Schedulearr Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-black text-lg text-white tracking-tight">Schedulearr</span>
                            <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-emerald-500/30">v{appVersion}</span>
                        </div>
                    </Link>

                    {/* Clean Wrapped Desktop Items */}
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-end">
                        {allNavItems.map(item => {
                            const active = pathname === item.href;
                            return (
                                <Link 
                                    key={item.href} 
                                    href={item.href} 
                                    className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                                        active 
                                            ? 'text-white bg-zinc-900 border border-zinc-700/60 shadow-lg shadow-black/40' 
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50 border border-transparent'
                                    }`}
                                >
                                    <span>{item.icon(active)}</span>
                                    <span className="tracking-tight">{item.label}</span>
                                    {item.href === '/downloads' && activeMusicCount > 0 && (
                                        <span className="w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-black flex items-center justify-center animate-pulse">
                                            {activeMusicCount}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </nav>

            {/* ── Modern Floating Glass Bottom Tab Bar (<640px Mobile Only) ── */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pointer-events-none" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                <div className="pointer-events-auto max-w-sm mx-auto bg-zinc-950/85 backdrop-blur-3xl border border-white/10 rounded-[1.75rem] shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-between h-16 px-2 gap-1">
                    {mobileCoreNavItems.map(item => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`relative flex flex-col items-center justify-center flex-1 h-12 rounded-2xl transition-all active:scale-95 select-none ${
                                    active 
                                        ? 'text-white bg-zinc-900/90 border border-zinc-700/60 shadow-inner' 
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <div className={`transition-transform duration-200 relative ${active ? 'scale-110' : ''}`}>
                                    {item.icon(active)}
                                    {item.href === '/downloads' && activeMusicCount > 0 && (
                                        <span className="absolute -top-1.5 -right-2 w-3.5 h-3.5 rounded-full bg-amber-500 text-black text-[8px] font-black flex items-center justify-center animate-pulse">
                                            {activeMusicCount}
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-wider mt-0.5 ${active ? 'text-white' : 'text-zinc-500'}`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}

                    {/* "More" Trigger Tab */}
                    <button
                        onClick={() => setIsMobileMoreOpen(true)}
                        className={`relative flex flex-col items-center justify-center flex-1 h-12 rounded-2xl transition-all active:scale-95 select-none ${
                            isMoreTabActive
                                ? 'text-white bg-zinc-900/90 border border-zinc-700/60 shadow-inner' 
                                : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        <div className={`transition-transform duration-200 ${isMoreTabActive ? 'scale-110 text-emerald-400' : ''}`}>
                            <Menu size={20} />
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider mt-0.5 ${isMoreTabActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            More
                        </span>
                    </button>
                </div>
            </nav>

            {/* ── Modern Mobile Slide-Up Action Sheet / Control Center ── */}
            {isMobileMoreOpen && (
                <div className="sm:hidden fixed inset-0 z-[120] flex flex-col justify-end bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
                    <div 
                        className="fixed inset-0"
                        onClick={() => setIsMobileMoreOpen(false)}
                    />

                    <div className="relative bg-[#0c0c0c] border-t border-zinc-800 rounded-t-[2.5rem] p-6 pb-12 space-y-5 shadow-2xl animate-in slide-in-from-bottom duration-300 z-10">
                        {/* Pull bar */}
                        <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto -mt-2 mb-2" />

                        <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                            <div>
                                <h3 className="text-lg font-black text-white">Hub & Controls</h3>
                                <p className="text-xs text-zinc-500 font-medium">Quick navigation & system tools</p>
                            </div>
                            <button
                                onClick={() => setIsMobileMoreOpen(false)}
                                className="p-2 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Navigation Grid Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <Link
                                href="/settings"
                                onClick={() => setIsMobileMoreOpen(false)}
                                className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all active:scale-95 ${
                                    pathname === '/settings' 
                                        ? 'bg-zinc-900 border-zinc-700 text-white' 
                                        : 'bg-zinc-950/80 border-zinc-900 text-zinc-300 hover:border-zinc-800'
                                }`}
                            >
                                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-200 shadow">
                                    <Settings size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white">Settings</h4>
                                    <p className="text-[11px] text-zinc-500">Instances & Config</p>
                                </div>
                            </Link>

                            <Link
                                href="/profiles"
                                onClick={() => setIsMobileMoreOpen(false)}
                                className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all active:scale-95 ${
                                    pathname === '/profiles' 
                                        ? 'bg-zinc-900 border-zinc-700 text-white' 
                                        : 'bg-zinc-950/80 border-zinc-900 text-zinc-300 hover:border-zinc-800'
                                }`}
                            >
                                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow">
                                    <Sliders size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white">Profiles & Indexers</h4>
                                    <p className="text-[11px] text-zinc-500">Custom formats & rules</p>
                                </div>
                            </Link>

                            <Link
                                href="/analytics"
                                onClick={() => setIsMobileMoreOpen(false)}
                                className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all active:scale-95 ${
                                    pathname === '/analytics' 
                                        ? 'bg-zinc-900 border-zinc-700 text-white' 
                                        : 'bg-zinc-950/80 border-zinc-900 text-zinc-300 hover:border-zinc-800'
                                }`}
                            >
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow">
                                    <BarChart3 size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white">Analytics</h4>
                                    <p className="text-[11px] text-zinc-500">Telemetry & Plex activity</p>
                                </div>
                            </Link>

                            <Link
                                href="/tv"
                                onClick={() => setIsMobileMoreOpen(false)}
                                className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all active:scale-95 ${
                                    pathname === '/tv' 
                                        ? 'bg-zinc-900 border-zinc-700 text-white' 
                                        : 'bg-zinc-950/80 border-zinc-900 text-zinc-300 hover:border-zinc-800'
                                }`}
                            >
                                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow">
                                    <Tv size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white">Smart TV Mode</h4>
                                    <p className="text-[11px] text-zinc-500">Big screen player</p>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

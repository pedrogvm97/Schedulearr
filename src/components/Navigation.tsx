'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const primaryNavItems = [
    {
        href: '/discover',
        label: 'My Media',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect>
                <line x1="7" y1="2" x2="7" y2="22"></line>
                <line x1="17" y1="2" x2="17" y2="22"></line>
                <line x1="2" y1="12" x2="22" y2="12"></line>
            </svg>
        )
    }
];

const secondaryNavItems = [
    {
        href: '/downloads',
        label: 'Downloads',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
        )
    },
    {
        href: '/indexers',
        label: 'Indexers',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
        )
    },
    {
        href: '/profiles',
        label: 'Profiles',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
        )
    },
    {
        href: '/',
        label: 'Schedule',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
        )
    },
    {
        href: '/analytics',
        label: 'Analytics',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
            </svg>
        )
    },
    {
        href: '/settings',
        label: 'Settings',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"></path>
            </svg>
        )
    }
];

const mobileNavItems = [
    primaryNavItems[0], // My Media
    secondaryNavItems[0], // Downloads
    secondaryNavItems[3], // Schedule
    secondaryNavItems[4], // Analytics
    secondaryNavItems[5]  // Settings
];

export function Navigation() {
    const pathname = usePathname();

    const allNavItems = [...primaryNavItems, ...secondaryNavItems];

    return (
        <>
            {/* Top Mobile App Header (<640px) */}
            <header className="sm:hidden sticky top-0 z-50 w-full bg-zinc-950/90 backdrop-blur-2xl border-b border-zinc-800/80 px-4 h-14 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5 active:scale-95 transition-transform">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-zinc-900 p-1 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        <img src="/icon.png" alt="Schedulearr Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-white tracking-tight">Schedulearr</span>
                        </div>
                    </div>
                </Link>
            </header>

            {/* Desktop & Tablet Top Nav (≥640px) */}
            <nav className="hidden sm:block border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-2xl sticky top-0 z-50 w-full max-w-full">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-3 group flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-zinc-900 p-1.5 border border-emerald-500/30 transition-transform group-hover:scale-105 shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center">
                            <img src="/icon.png" alt="Schedulearr Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-extrabold text-base text-white tracking-tight">Schedulearr</span>
                        </div>
                    </Link>

                    {/* Clean Wrapped Nav Items (No Overflow Scroll) */}
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-end">
                        {allNavItems.map(item => {
                            const active = pathname === item.href;
                            return (
                                <Link 
                                    key={item.href} 
                                    href={item.href} 
                                    className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold rounded-xl transition-all ${
                                        active 
                                            ? 'text-white bg-zinc-900 border border-zinc-700/60 shadow-lg shadow-black/40' 
                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50 border border-transparent'
                                    }`}
                                >
                                    <span className={active ? 'text-emerald-400' : 'text-zinc-500'}>
                                        {item.icon(active)}
                                    </span>
                                    <span className="tracking-tight">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </nav>

            {/* Floating Glass Bottom Tab Bar (<640px Mobile Only) */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pointer-events-none" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                <div className="pointer-events-auto max-w-md mx-auto bg-zinc-900/90 backdrop-blur-2xl border border-zinc-800/90 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-stretch h-14 p-1">
                    {mobileNavItems.map(item => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`relative flex flex-col items-center justify-center flex-1 gap-0.5 rounded-xl transition-all active:scale-95 select-none ${
                                    active 
                                        ? 'text-emerald-400 bg-zinc-800/80 border border-zinc-700/50 shadow-inner' 
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                {active && (
                                    <div className="absolute top-1 w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                                )}
                                <div className={`transition-transform ${active ? 'scale-110 mt-1' : ''}`}>
                                    {item.icon(active)}
                                </div>
                                <span className={`text-[9px] font-extrabold uppercase tracking-wider leading-none ${active ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}

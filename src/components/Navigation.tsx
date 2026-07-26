'use client';

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
    },
    {
        href: '/scheduler',
        label: 'Scheduler',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
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
        label: 'Analytics',
        icon: (active: boolean) => (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
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
    primaryNavItems[1], // Scheduler
    secondaryNavItems[0], // Downloads
    secondaryNavItems[3], // Analytics
    secondaryNavItems[4]  // Settings
];

export function Navigation() {
    const pathname = usePathname();

    const isActive = (path: string) =>
        pathname === path
            ? "px-3 py-2 text-sm font-medium rounded-md text-white bg-zinc-900 transition-colors"
            : "px-3 py-2 text-sm font-medium rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors";

    return (
        <>
            {/* Desktop Top Nav */}
            <nav className="border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4 sm:gap-8">
                        <div className="flex items-center gap-2 sm:gap-3 group flex-shrink-0">
                            <div className="w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center transition-transform group-hover:scale-105">
                                <img src="/icon.png" alt="Schedulearr Logo" className="w-full h-full object-contain" />
                            </div>
                            <span className="hidden sm:block font-bold text-lg text-white tracking-tight">Schedulearr</span>
                        </div>
                        {/* Top nav links */}
                        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                            {primaryNavItems.map(item => {
                                const active = pathname === item.href;
                                return (
                                    <Link 
                                        key={item.href} 
                                        href={item.href} 
                                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                            active 
                                                ? 'text-white bg-zinc-900 border border-zinc-800 shadow-md scale-105' 
                                                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40 border border-transparent'
                                        }`}
                                    >
                                        <span className={active ? 'text-emerald-400' : 'text-zinc-500'}>
                                            {item.icon(active)}
                                        </span>
                                        <span className="tracking-tight">{item.label}</span>
                                    </Link>
                                );
                            })}
                            <div className="h-6 w-[1px] bg-zinc-800 mx-2 self-center flex-shrink-0" />
                            {secondaryNavItems.map(item => (
                                <Link key={item.href} href={item.href} className={isActive(item.href)}>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Mobile Bottom Tab Bar (<640px only) */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/80 shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="flex items-stretch h-14">
                    {mobileNavItems.map(item => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`relative flex flex-col items-center justify-center flex-1 gap-0.5 transition-all active:scale-95 select-none ${
                                    active ? 'text-emerald-400' : 'text-zinc-500'
                                }`}
                            >
                                {active && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                )}
                                <div className={`transition-transform ${active ? 'scale-110' : ''}`}>
                                    {item.icon(active)}
                                </div>
                                <span className={`text-[9px] font-bold uppercase tracking-wider leading-none ${active ? 'text-emerald-400' : 'text-zinc-500'}`}>
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

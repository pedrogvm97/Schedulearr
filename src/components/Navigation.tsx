'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
    const pathname = usePathname();

    const isActive = (path: string) => {
        return pathname === path
            ? "px-3 py-2 text-sm font-medium rounded-md text-white bg-zinc-900 transition-colors"
            : "px-3 py-2 text-sm font-medium rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors";
    };

    return (
        <nav className="border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                <polyline points="3.29 7 12 12 20.71 7"></polyline>
                                <line x1="12" y1="22" x2="12" y2="12"></line>
                            </svg>
                        </div>
                        <span className="font-bold text-white tracking-tight">Arr Scheduler</span>
                    </Link>
                    <div className="hidden md:flex items-center gap-1">
                        <Link href="/scheduler" className={isActive('/scheduler')}>Media Search</Link>
                        <Link href="/settings" className={isActive('/settings')}>Settings</Link>
                        <Link href="/" className={isActive('/')}>Analytics</Link>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Prowlarr health indicator will go here */}
                </div>
            </div>
        </nav>
    );
}

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
                    <div className="flex items-center gap-3 group">
                        <div className="w-12 h-12 flex items-center justify-center transition-transform group-hover:scale-105">
                            <img src="/icon.png" alt="Schedulearr Logo" className="w-full h-full object-contain" />
                        </div>
                        <span className="font-bold text-lg text-white tracking-tight">Schedulearr</span>
                    </div>
                    <div className="hidden md:flex items-center gap-1">
                        <Link href="/scheduler" className={isActive('/scheduler')}>Media Search</Link>
                        <Link href="/discover" className={isActive('/discover')}>Discover</Link>
                        <Link href="/downloads" className={isActive('/downloads')}>Downloads</Link>
                        <Link href="/indexers" className={isActive('/indexers')}>Indexers</Link>
                        <Link href="/profiles" className={isActive('/profiles')}>Profiles</Link>
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

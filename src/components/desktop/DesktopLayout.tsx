'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const desktopNavItems = [
  { href: '/discover', label: 'Media' },
  { href: '/scheduler', label: 'Scheduler' },
  { href: '/downloads', label: 'Downloads' },
  { href: '/', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' }
];

export function DesktopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex min-h-screen w-full bg-zinc-950 text-zinc-300 flex-col selection:bg-emerald-500/30">
      {/* 100% Exclusive Desktop Header (≥1024px) */}
      <header className="sticky top-0 z-50 w-full bg-zinc-950/80 backdrop-blur-2xl border-b border-zinc-800/60 h-16 flex items-center px-8 justify-between shadow-sm">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-zinc-900 p-1.5 border border-emerald-500/30 transition-transform group-hover:scale-105 shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center">
            <img src="/icon.png" alt="Schedulearr Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base text-white tracking-tight">Schedulearr</span>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {desktopNavItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all ${
                  active
                    ? 'text-white bg-zinc-900 border border-zinc-700/60 shadow-md shadow-black/40'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50 border border-transparent'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-8">
        {children}
      </main>
    </div>
  );
}

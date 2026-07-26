'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabletNavLinks = [
  { href: '/discover', label: 'My Media', icon: '🎬' },
  { href: '/scheduler', label: 'Scheduler', icon: '⏱️' },
  { href: '/downloads', label: 'Downloads', icon: '📥' },
  { href: '/indexers', label: 'Indexers', icon: '🔍' },
  { href: '/profiles', label: 'Profiles', icon: '👤' },
  { href: '/', label: 'Analytics', icon: '📊' },
  { href: '/settings', label: 'Settings', icon: '⚙️' }
];

export function TabletLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="hidden sm:flex md:hidden min-h-screen w-full bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30 overflow-x-hidden">
      {/* 100% Dedicated Tablet Icon Sidebar (640px–1023px) */}
      <aside className="w-20 bg-zinc-950 border-r border-zinc-800/80 flex flex-col items-center py-6 gap-6 flex-shrink-0 sticky top-0 h-screen z-50">
        <Link href="/" className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500/25 via-teal-500/15 to-zinc-900 p-1.5 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.25)] active:scale-95 transition-transform">
          <img src="/icon.png" alt="Schedulearr" className="w-full h-full object-contain" />
        </Link>

        <nav className="flex flex-col gap-3 w-full px-2.5">
          {tabletNavLinks.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  active
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-950/20'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span className="text-xl mb-0.5">{item.icon}</span>
                <span className="text-[9px] font-extrabold uppercase tracking-tight text-center leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Tablet Content View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Top Tablet Status Header Bar */}
        <header className="sticky top-0 z-40 h-16 bg-zinc-950/90 backdrop-blur-2xl border-b border-zinc-800/80 px-6 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-base text-white tracking-tight">Schedulearr Tablet Console</span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              Tablet OS Active
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            <span>Automated Engine Online</span>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

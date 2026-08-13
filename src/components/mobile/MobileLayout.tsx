'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const mobileNavLinks = [
  {
    href: '/discover',
    label: 'My Media',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect>
        <line x1="7" y1="2" x2="7" y2="22"></line>
        <line x1="17" y1="2" x2="17" y2="22"></line>
        <line x1="2" y1="12" x2="22" y2="12"></line>
      </svg>
    )
  },
  {
    href: '/',
    label: 'Schedule',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"></line>
        <line x1="8" y1="12" x2="21" y2="12"></line>
        <line x1="8" y1="18" x2="21" y2="18"></line>
        <line x1="3" y1="6" x2="3.01" y2="6"></line>
        <line x1="3" y1="12" x2="3.01" y2="12"></line>
        <line x1="3" y1="18" x2="3.01" y2="18"></line>
      </svg>
    )
  },
  {
    href: '/downloads',
    label: 'Downloads',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    )
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
        <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
      </svg>
    )
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"></path>
      </svg>
    )
  }
];

const allMobileDrawerLinks = [
  ...mobileNavLinks,
  {
    href: '/indexers',
    label: 'Indexers',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    )
  },
  {
    href: '/profiles',
    label: 'Profiles',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
      </svg>
    )
  }
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="lg:hidden min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500/30 overflow-x-hidden">
      {/* 100% Exclusive Mobile App Header (<1024px) */}
      <header className="sticky top-0 z-50 w-full h-16 bg-zinc-950/95 backdrop-blur-2xl border-b border-zinc-800/80 px-4 flex items-center justify-between shadow-lg">
        <Link href="/" className="flex items-center gap-3 active:scale-95 transition-transform">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-500/25 via-teal-500/15 to-zinc-900 p-1.5 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.25)]">
            <img src="/icon.png" alt="Schedulearr" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base text-white tracking-tight">Schedulearr</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/90 leading-none">Mobile Edition</span>
          </div>
        </Link>

        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="h-11 px-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-200 active:scale-95 transition-all flex items-center gap-2 touch-target shadow-md"
          aria-label="Toggle Mobile Menu Drawer"
        >
          {drawerOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          )}
          <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">Menu</span>
        </button>
      </header>

      {/* 100% Exclusive Full-Screen Mobile Drawer Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-zinc-950/98 backdrop-blur-3xl pt-20 px-5 pb-28 overflow-y-auto space-y-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl mb-4 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400">Mobile Navigation Center</span>
            <span className="text-[10px] text-zinc-500 font-bold uppercase">v0.3.9</span>
          </div>

          {allMobileDrawerLinks.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-98 touch-target ${
                  active
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-white shadow-xl shadow-emerald-950/30'
                    : 'bg-zinc-900/70 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <div className={`p-3 rounded-2xl ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  {item.icon}
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-base text-white">{item.label}</span>
                  <span className="text-xs text-zinc-400">Open {item.label} view</span>
                </div>
                {active && (
                  <span className="ml-auto w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Main View Area with Mobile Padding */}
      <main className="flex-1 w-full max-w-full px-4 py-6 pb-28 overflow-x-hidden">
        {children}
      </main>

      {/* 100% Exclusive Floating Glass Bottom Navigation Dock (<1024px) */}
      <div className="fixed bottom-4 inset-x-4 z-50">
        <nav className="max-w-md mx-auto bg-zinc-900/90 backdrop-blur-2xl border border-zinc-800/90 rounded-3xl p-2 shadow-[0_10px_35px_rgba(0,0,0,0.7)] flex items-center justify-around">
          {mobileNavLinks.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-2 px-3 rounded-2xl transition-all active:scale-95 touch-target ${
                  active ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="relative">
                  {item.icon}
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  )}
                </div>
                <span className="text-[10px] font-extrabold tracking-tight mt-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

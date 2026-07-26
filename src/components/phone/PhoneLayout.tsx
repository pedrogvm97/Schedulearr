'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const phoneNavLinks = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    )
  },
  {
    href: '/discover',
    label: 'Media',
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
    href: '/scheduler',
    label: 'Scheduler',
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

const allPhoneDrawerLinks = phoneNavLinks;

export function PhoneLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="block sm:hidden min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500/30 overflow-x-hidden">
      {/* 100% Dedicated Mobile Phone Top Header (<640px) */}
      <header className="sticky top-0 z-50 w-full h-14 bg-zinc-950/95 backdrop-blur-2xl border-b border-zinc-800/80 px-4 flex items-center justify-between shadow-lg">
        <Link href="/" className="flex items-center gap-2.5 active:scale-95 transition-transform">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500/25 via-teal-500/15 to-zinc-900 p-1 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.25)]">
            <img src="/icon.png" alt="Schedulearr" className="w-full h-full object-contain" />
          </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm text-white tracking-tight">Schedulearr</span>
            </div>
          </Link>

          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 active:scale-95 transition-all flex items-center gap-1.5 touch-target shadow-md"
            aria-label="Toggle Menu"
          >
            {drawerOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            )}
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-300">Menu</span>
          </button>
        </header>

        {/* Dedicated Full-Screen Menu Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 bg-zinc-950/98 backdrop-blur-3xl pt-16 px-4 pb-28 overflow-y-auto space-y-2.5 animate-in fade-in slide-in-from-top-4 duration-200">
            {allPhoneDrawerLinks.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all active:scale-98 touch-target ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-white shadow-xl shadow-emerald-950/30'
                      : 'bg-zinc-900/70 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    {item.icon}
                  </div>
                  <span className="font-extrabold text-sm text-white">{item.label}</span>
                  {active && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  )}
                </Link>
              );
            })}
          </div>
        )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-full px-3 py-5 pb-28 overflow-x-hidden">
        {children}
      </main>

      {/* 100% Dedicated Floating Glass Bottom Navigation Dock */}
      <div className="fixed bottom-3 inset-x-3 z-50">
        <nav className="max-w-md mx-auto bg-zinc-900/90 backdrop-blur-2xl border border-zinc-800/90 rounded-2xl p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center justify-around">
          {phoneNavLinks.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl transition-all active:scale-95 touch-target ${
                  active ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="relative">
                  {item.icon}
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                  )}
                </div>
                <span className="text-[9px] font-extrabold tracking-tight mt-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';

export function PhoneMediaView() {
  const [filterMode, setFilterMode] = useState<'all' | 'movies' | 'series'>('all');

  return (
    <div className="space-y-4">
      {/* Phone Media Header */}
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-950 p-4 border border-zinc-800/80 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
            Phone Media Catalog
          </span>
          <span className="text-[10px] text-zinc-500 font-bold">Touch Optimized</span>
        </div>
        <h1 className="text-xl font-extrabold text-white">My Media</h1>
        <p className="text-xs text-zinc-400">Mobile-native media catalog with touch cards and zero horizontal scroll.</p>

        {/* Mobile Filter Chips */}
        <div className="flex gap-1.5 pt-2 border-t border-zinc-800/60">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all ${
              filterMode === 'all' ? 'bg-zinc-800 text-white shadow-md border border-zinc-700' : 'text-zinc-500'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterMode('movies')}
            className={`flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all ${
              filterMode === 'movies' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-md' : 'text-zinc-500'
            }`}
          >
            Movies
          </button>
          <button
            onClick={() => setFilterMode('series')}
            className={`flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all ${
              filterMode === 'series' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md' : 'text-zinc-500'
            }`}
          >
            Series
          </button>
        </div>
      </div>

      {/* Phone Single Column Touch Card List */}
      <div className="space-y-3">
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white">Media Overview</h2>
            <span className="text-[10px] text-emerald-400 font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              Synced
            </span>
          </div>
          <p className="text-xs text-zinc-400">All media items rendered in 100% phone-native single-column card format.</p>
        </div>
      </div>
    </div>
  );
}

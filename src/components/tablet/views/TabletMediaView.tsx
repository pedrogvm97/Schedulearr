'use client';

import React, { useState } from 'react';

export function TabletMediaView() {
  const [filterMode, setFilterMode] = useState<'all' | 'movies' | 'series'>('all');

  return (
    <div className="space-y-6">
      {/* Tablet Media Header */}
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-950 p-6 border border-zinc-800/80 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              Tablet Media Console
            </span>
            <h1 className="text-2xl font-extrabold text-white">Media Management Catalog</h1>
          </div>

          <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all ${
                filterMode === 'all' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('movies')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all ${
                filterMode === 'movies' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500'
              }`}
            >
              Movies
            </button>
            <button
              onClick={() => setFilterMode('series')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all ${
                filterMode === 'series' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-500'
              }`}
            >
              Series
            </button>
          </div>
        </div>
      </div>

      {/* Tablet 2-Column Responsive Card Grid */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-white">Tablet Master View</h2>
          <p className="text-xs text-zinc-400">Media items formatted specifically for tablet medium window class (640-1023dp).</p>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-white">Media Inspector</h2>
          <p className="text-xs text-zinc-400">Select any item to inspect quality profiles, file sizes, and instances.</p>
        </div>
      </div>
    </div>
  );
}

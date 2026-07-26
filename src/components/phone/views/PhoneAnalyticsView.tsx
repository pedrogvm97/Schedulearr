'use client';

import React, { useState, useEffect } from 'react';

export function PhoneAnalyticsView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'all'>('day');

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const logs = data?.logs || [];
  const instances = data?.instances || {};

  return (
    <div className="space-y-4">
      {/* Phone Hero Card */}
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-950 p-4 border border-zinc-800/80 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
            Phone Analytics
          </span>
          <span className="text-[10px] text-zinc-500 font-bold">{logs.length} Total Batches</span>
        </div>
        <h1 className="text-xl font-extrabold text-white">Search History</h1>
        <p className="text-xs text-zinc-400">Mobile-native engine metrics and batch search logs.</p>

        {/* Timeframe Chips */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/60">
          {(['day', 'week', 'month', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`flex-1 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all ${
                timeframe === t ? 'bg-zinc-800 text-white shadow-md border border-zinc-700' : 'text-zinc-500'
              }`}
            >
              {t === 'day' ? 'Today' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Phone Metric Stat Stack */}
      <div className="grid grid-cols-1 gap-3">
        {Object.keys(instances).map(id => {
          const inst = instances[id];
          return (
            <div key={id} className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-white" style={{ color: inst.color }}>{inst.name}</span>
                <span className="text-xs text-zinc-400 font-bold">Active Instance</span>
              </div>
              <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: '75%', backgroundColor: inst.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Log Feed */}
      <div className="space-y-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 px-1">Recent Engine Runs</h2>
        {logs.slice(0, 10).map((log: any, index: number) => (
          <div key={index} className="bg-zinc-900/50 border border-zinc-800/70 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">{log.title || 'Automated Batch'}</span>
              <span className="text-[10px] text-zinc-500">{new Date(log.timestamp || Date.now()).toLocaleTimeString()}</span>
            </div>
            <p className="text-[11px] text-zinc-400">{log.message || 'Search execution completed successfully.'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

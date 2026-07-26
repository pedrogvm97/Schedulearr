'use client';

import React, { useState, useEffect } from 'react';

export function TabletAnalyticsView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const logs = data?.logs || [];
  const instances = data?.instances || {};

  return (
    <div className="space-y-6">
      {/* Tablet Header Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-950 p-6 border border-zinc-800/80 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              Tablet Analytics Console
            </span>
            <h1 className="text-2xl font-extrabold text-white">Engine Performance & Batch Logs</h1>
          </div>
          <button className="h-11 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-extrabold text-xs uppercase tracking-wider transition-all shadow-md">
            Trigger Batch
          </button>
        </div>
      </div>

      {/* Tablet 2-Column Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Instance Distribution */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-5 space-y-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-400">Instance Distribution</h2>
          <div className="space-y-3">
            {Object.keys(instances).map(id => {
              const inst = instances[id];
              return (
                <div key={id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-zinc-200">
                    <span>{inst.name}</span>
                    <span>75%</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                    <div className="h-full rounded-full" style={{ width: '75%', backgroundColor: inst.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity Log */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-5 space-y-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-400">Recent Batch Operations</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {logs.slice(0, 8).map((log: any, index: number) => (
              <div key={index} className="bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-3 text-xs space-y-0.5">
                <div className="flex justify-between font-bold text-white">
                  <span>{log.title || 'Batch Execution'}</span>
                  <span className="text-[10px] text-zinc-500">{new Date(log.timestamp || Date.now()).toLocaleTimeString()}</span>
                </div>
                <p className="text-zinc-400 text-[11px]">{log.message || 'Operation finished.'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

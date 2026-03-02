"use client";

import { useState, useEffect } from "react";
import HistoryLedger from "@/components/HistoryLedger";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function Dashboard() {
  const [triggerResult, setTriggerResult] = useState<{
    show: boolean,
    success?: boolean,
    reason?: string,
    movies?: string[],
    episodes?: string[]
  }>({ show: false });
  const [isTriggering, setIsTriggering] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [instances, setInstances] = useState<Record<string, { name: string, color: string, type: string }>>({});
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const json = await res.json();
          setChartData(json.data || []);
          setInstances(json.instances || {});
        }
      } catch (e) {
        console.error("Failed to load stats", e);
      }
      setLoadingStats(false);
    };
    fetchStats();
  }, []);

  const handleManualTrigger = async () => {
    setIsTriggering(true);
    try {
      const res = await fetch('/api/scheduler/trigger', { method: 'POST' });
      const data = await res.json();

      setTriggerResult({
        show: true,
        success: data.success,
        reason: data.reason,
        movies: data.movies || [],
        episodes: data.episodes || []
      });
    } catch (e) {
      setTriggerResult({ show: true, success: false, reason: 'Network error executing trigger.' });
    }
    setIsTriggering(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Search History</h1>
          <p className="text-zinc-400">View logs of background engine batches and manual search triggers.</p>
        </div>

        <div className="flex gap-2 items-center">
          <button
            onClick={handleManualTrigger}
            disabled={isTriggering}
            className={`${isTriggering ? 'bg-emerald-600/10 text-emerald-600' : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'} border border-emerald-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors`}
          >
            {isTriggering ? 'Triggering...' : 'Trigger Search Now'}
          </button>
        </div>
      </div>

      {/* Analytics Graph */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-6">30-Day Download Velocity</h2>
        <div className="h-72 w-full">
          {loadingStats ? (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">Loading aggregated statistics...</div>
          ) : chartData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">No download events logged in the past 30 days.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#52525b"
                  fontSize={12}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis stroke="#52525b" fontSize={12} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#27272a', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                  labelStyle={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '4px' }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                  formatter={(value) => {
                    const inst = instances[value];
                    return inst ? inst.name : value;
                  }}
                />
                {Object.keys(instances).map(id => (
                  <Bar
                    key={id}
                    dataKey={id}
                    name={id}
                    stackId="a"
                    fill={instances[id].color}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <HistoryLedger />
      </div>

      {/* Manual Trigger Result Modal */}
      {
        triggerResult.show && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-lg w-full">
              <h3 className="text-xl font-bold text-white mb-2">
                {triggerResult.success ? 'Search Triggered' : 'Search Skipped'}
              </h3>

              {!triggerResult.success && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 my-6">
                  <p className="text-red-400 text-sm font-medium">{triggerResult.reason}</p>
                </div>
              )}

              {triggerResult.success && (
                <div className="my-6 space-y-4">
                  <p className="text-zinc-400 text-sm">The engine has executed a batch search.</p>

                  {(triggerResult.movies?.length ?? 0) > 0 && (
                    <div>
                      <h4 className="text-white text-sm font-medium mb-2 border-b border-zinc-800 pb-1">Movies Searched</h4>
                      <ul className="text-zinc-400 text-xs space-y-1 list-disc list-inside h-24 overflow-y-auto">
                        {triggerResult.movies?.map(m => <li key={m}>{m}</li>)}
                      </ul>
                    </div>
                  )}

                  {(triggerResult.episodes?.length ?? 0) > 0 && (
                    <div>
                      <h4 className="text-white text-sm font-medium mb-2 border-b border-zinc-800 pb-1">Episodes Searched</h4>
                      <ul className="text-zinc-400 text-xs space-y-1 list-disc list-inside h-24 overflow-y-auto">
                        {triggerResult.episodes?.map(e => <li key={e}>{e}</li>)}
                      </ul>
                    </div>
                  )}

                  {(triggerResult.movies?.length === 0 && triggerResult.episodes?.length === 0) && (
                    <p className="text-zinc-500 text-sm italic">No missing media items matched the priority criteria stringently enough (or they are already fully downloaded).</p>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setTriggerResult({ show: false })}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

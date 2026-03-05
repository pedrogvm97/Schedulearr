"use client";

import { useState, useEffect } from "react";
import HistoryLedger from "@/components/HistoryLedger";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// --- Interfaces ---
interface RecentDownload {
  title: string;
  date: string;
  instanceId: string;
  status: string;
  size: number;
  failureReason?: string;
}

interface IndexerHealth {
  id: number;
  name: string;
  status: number;
}

interface ProwlarrInstance {
  id: string | number;
  name: string;
  health?: {
    indexers?: IndexerHealth[];
  };
}

interface ChartData {
  date: string;
  [key: string]: string | number | string[];
}

export default function Dashboard() {
  const [triggerResult, setTriggerResult] = useState<{
    show: boolean,
    success?: boolean,
    reason?: string,
    movies?: string[],
    episodes?: string[]
  }>({ show: false });
  const [isTriggering, setIsTriggering] = useState(false);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [instances, setInstances] = useState<Record<string, { name: string, color: string, type: string }>>({});
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const [prowlarrHealth, setProwlarrHealth] = useState<ProwlarrInstance[]>([]);
  const [loadingProwlarr, setLoadingProwlarr] = useState(true);

  const [showWelcome, setShowWelcome] = useState(false);
  const [chartType, setChartType] = useState<'grabbed' | 'imported' | 'sizeGB'>('grabbed');
  const [recentDownloadFilters, setRecentDownloadFilters] = useState<Record<string, boolean>>({});

  const toggleRecentFilter = (id: string) => {
    setRecentDownloadFilters((prev: Record<string, boolean>) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getAge = (dateStr: string) => {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'Just now';
  };

  useEffect(() => {
    // Check if user has seen welcome splash
    const seenWelcome = localStorage.getItem('has_seen_welcome');
    if (!seenWelcome) {
      setShowWelcome(true);
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const json = await res.json();
          setChartData(json.data || []);
          setInstances(json.instances || {});
          if (json.recentDownloads) setRecentDownloads(json.recentDownloads);

          // Initialize filters if empty
          if (Object.keys(recentDownloadFilters).length === 0 && json.instances) {
            const initialFilters: Record<string, boolean> = {};
            Object.keys(json.instances).forEach(id => {
              initialFilters[id] = true;
            });
            setRecentDownloadFilters(initialFilters);
          }
        }
      } catch (e) {
        console.error("Failed to load stats", e);
      }
      setLoadingStats(false);
    };

    const fetchProwlarrHealth = async () => {
      try {
        const res = await fetch('/api/prowlarr/health');
        if (res.ok) {
          const json = await res.json();
          setProwlarrHealth(json.instances || []);
        }
      } catch (e) {
        console.error("Failed to load prowlarr health", e);
      }
      setLoadingProwlarr(false);
    };

    fetchStats();
    fetchProwlarrHealth();
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

  const CustomTooltip = ({ active, payload, label }: { active?: boolean, payload?: any[], label?: string }) => {
    if (active && payload && payload.length) {
      const allTitles = payload.flatMap((entry: { payload: any, dataKey: string, fill: string }) => {
        const titles = entry.payload[`${entry.dataKey}_titles`] || [];
        return titles.map((t: string) => ({
          title: t,
          color: entry.fill
        }));
      });

      if (allTitles.length === 0) return null;

      return (
        <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg shadow-xl max-w-lg">
          <p className="text-zinc-400 text-xs mb-2 font-semibold border-b border-zinc-800 pb-2">
            {label ? new Date(String(label)).toDateString() : ''} (Total: {allTitles.length})
          </p>

          <ul className="text-sm space-y-1 max-h-48 overflow-y-auto pr-2">
            {allTitles.map((item: { title: string, color: string }, i: number) => (
              <li key={i} className="truncate font-semibold" style={{ color: item.color }} title={item.title}>
                {item.title}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Search History</h1>
          <p className="text-zinc-400">View logs of background engine batches and manual search triggers.</p>
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1 mr-4">
            <button
              onClick={() => setChartType('grabbed')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition ${chartType === 'grabbed' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Grabs
            </button>
            <button
              onClick={() => setChartType('imported')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition ${chartType === 'imported' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Finalized
            </button>
            <button
              onClick={() => setChartType('sizeGB')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition ${chartType === 'sizeGB' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Data (GB)
            </button>
          </div>
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 mt-2">
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
                  content={<CustomTooltip />}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                  formatter={(value: string) => {
                    const inst = (instances as Record<string, any>)[value];
                    return inst ? inst.name : value;
                  }}
                />
                {Object.keys(instances).map(id => (
                  <>
                    <Bar
                      key={`${id}_grabbed`}
                      dataKey={`${id}_grabbed`}
                      name={`${instances[id].name} (Grabbed)`}
                      stackId="a"
                      fill={instances[id].color}
                      opacity={0.8}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      key={`${id}_downloading`}
                      dataKey={`${id}_downloading`}
                      name={`${instances[id].name} (Downloading)`}
                      stackId="a"
                      fill={instances[id].color}
                      opacity={0.4}
                      radius={[2, 2, 0, 0]}
                    />
                  </>
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        {/* Prowlarr Indexers Health */}
        {!loadingProwlarr && prowlarrHealth.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col max-h-[500px]">
            <h2 className="text-xl font-bold text-white mb-6">Prowlarr Indexer Health</h2>
            <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
              {prowlarrHealth.map((prowlarrInst) => (
                <div key={prowlarrInst.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex-shrink-0">
                  <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                      <h3 className="text-lg font-bold text-white">{prowlarrInst.name}</h3>
                    </div>
                    <div className="text-sm text-zinc-400 font-medium">
                      {prowlarrInst.health?.indexers?.length || 0} Enabled Indexers
                    </div>
                  </div>

                  {(!prowlarrInst.health?.indexers || prowlarrInst.health.indexers.length === 0) ? (
                    <div className="text-zinc-500 italic text-sm py-2">No indexers enabled or accessible.</div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {prowlarrInst.health.indexers.map((indexer: any) => {
                        const isHealthy = indexer.status === 1;
                        return (
                          <div key={indexer.id} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isHealthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-semibold text-zinc-300 truncate" title={indexer.name}>{indexer.name}</span>
                              <span className={`text-[10px] uppercase font-bold tracking-wider ${isHealthy ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                                {isHealthy ? 'Healthy' : 'Failing'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent History */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col max-h-[500px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Recent History</h2>
            <div className="flex gap-1.5 flex-wrap">
              {Object.keys(instances).map(id => (
                <button
                  key={id}
                  onClick={() => toggleRecentFilter(id)}
                  style={{
                    borderColor: recentDownloadFilters[id] ? `${instances[id].color}40` : '#27272a',
                    backgroundColor: recentDownloadFilters[id] ? `${instances[id].color}15` : 'transparent',
                    color: recentDownloadFilters[id] ? instances[id].color : '#52525b'
                  }}
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border transition-all hover:scale-105"
                >
                  {instances[id].name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
            {loadingStats && (
              <div className="text-zinc-500 text-sm italic py-2">Loading recent history...</div>
            )}
            {!loadingStats && recentDownloads.length === 0 && (
              <div className="text-zinc-500 text-sm py-2 flex items-center justify-center p-8 bg-zinc-950/50 rounded-xl border border-zinc-800/50 border-dashed">
                No history grabbed yet.
              </div>
            )}
            {!loadingStats && recentDownloads.filter(dl => recentDownloadFilters[dl.instanceId] !== false).slice(0, 15).map((dl, idx) => {
              const inst = instances[dl.instanceId];
              return (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex-shrink-0 transition hover:border-zinc-700">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="text-sm font-semibold text-zinc-200 truncate" title={dl.title}>{dl.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500 font-medium">{getAge(dl.date)}</span>
                      <span
                        title={dl.failureReason || (dl.status === 'Finalized' ? 'Download imported and completed' : dl.status === 'Grabbed' ? 'Sent to download client' : 'Currently in download queue')}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-help ${dl.status === 'Finalized' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          dl.status === 'Failed' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            dl.status === 'Downloading' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                              'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                        {dl.status}
                      </span>
                      {dl.size > 0 && (
                        <span className="text-[10px] font-bold text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
                          {(dl.size / (1024 ** 3)).toFixed(2)} GB
                        </span>
                      )}
                    </div>
                  </div>
                  {inst && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md border flex-shrink-0" style={{ color: inst.color, borderColor: `${inst.color}40`, backgroundColor: `${inst.color}10` }}>
                      {inst.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
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

      {/* First Time Welcome Splash Modal */}
      {
        showWelcome && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 max-w-2xl w-full shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <img src="/icon.png" alt="Schedulearr" className="w-16 h-16 object-contain" />
                <div>
                  <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 tracking-tight">
                    Welcome to Schedulearr!
                  </h2>
                  <p className="text-zinc-400 font-medium">Your automated release orchestrator for the Arr stack.</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
                  <div className="mt-1 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold">1</div>
                  <div>
                    <h4 className="text-white font-semibold">Connect Your Instances</h4>
                    <p className="text-sm text-zinc-400">Head to the Settings tab to link your Sonarr, Radarr, Prowlarr, and qBittorrent details.</p>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
                  <div className="mt-1 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0 font-bold">2</div>
                  <div>
                    <h4 className="text-white font-semibold">Activate Media</h4>
                    <p className="text-sm text-zinc-400">Jump into the Media Search tab to select which movies or shows you want Schedulearr to orchestrate missing episodes/releases for.</p>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
                  <div className="mt-1 w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0 font-bold">3</div>
                  <div>
                    <h4 className="text-white font-semibold">Sit Back & Relax</h4>
                    <p className="text-sm text-zinc-400">Schedulearr runs in the background continuously pacing Prowlarr searches to avoid API bans while grabbing top tier releases.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-800">
                <button
                  onClick={() => {
                    localStorage.setItem('has_seen_welcome', 'true');
                    setShowWelcome(false);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
                >
                  Let's Go!
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

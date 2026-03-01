"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const [movies, setMovies] = useState<any[]>([]);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'missing' | 'downloaded'>('all');
  const [triggerResult, setTriggerResult] = useState<{
    show: boolean,
    success?: boolean,
    reason?: string,
    movies?: string[],
    episodes?: string[]
  }>({ show: false });

  // Fake state for UI demonstration (would be connected to backend DB in full implementation)
  const [searchToggles, setSearchToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [movieRes, epRes] = await Promise.all([
          fetch('/api/radarr/all'),
          fetch('/api/sonarr/all')
        ]);

        if (movieRes.ok) setMovies(await movieRes.json());
        if (epRes.ok) setEpisodes(await epRes.json());
      } catch (e) {
        console.error("Failed to load missing media", e);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  const toggleSearch = (id: string) => {
    setSearchToggles(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
      </div>
    );
  }

  // Combine and sort all media by date added
  let combined = [
    ...movies.map(m => ({
      ...m,
      type: 'movie',
      sortDate: new Date(m.added).getTime(),
      idStr: `movie-${m.id}`,
      isDownloaded: m.hasFile
    })),
    ...episodes.map(e => ({
      ...e,
      type: 'series',
      sortDate: new Date(e.added).getTime(),
      idStr: `series-${e.id}`,
      isDownloaded: e.statistics?.percentOfEpisodes === 100,
      stats: e.statistics
    }))
  ].sort((a, b) => b.sortDate - a.sortDate); // Newest first

  if (filterStatus === 'missing') combined = combined.filter(c => !c.isDownloaded);
  if (filterStatus === 'downloaded') combined = combined.filter(c => c.isDownloaded);

  if (limit !== null) {
    combined = combined.slice(0, limit);
  }

  return (
    <div className="max-w-7xl mx-auto px-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Media Center</h1>
          <p className="text-zinc-400">View and manage all your tracked media and download statuses.</p>
        </div>

        <div className="flex gap-2 items-center">
          <select
            value={filterStatus}
            onChange={(e: any) => setFilterStatus(e.target.value)}
            className="bg-zinc-900 text-zinc-300 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus:border-emerald-500"
          >
            <option value="all">All Media</option>
            <option value="missing">Missing Only</option>
            <option value="downloaded">Downloaded</option>
          </select>
          <div className="w-px h-6 bg-zinc-800 mx-1"></div>
          <button
            onClick={() => setLimit(limit === null ? null : (limit === 5 ? null : 5))}
            className={`${limit === 5 ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-300'} hover:bg-zinc-800 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-medium transition-colors`}
          >
            Last 5
          </button>
          <button
            onClick={() => setLimit(limit === null ? null : (limit === 10 ? null : 10))}
            className={`${limit === 10 ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-300'} hover:bg-zinc-800 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-medium transition-colors`}
          >
            Last 10
          </button>
          <button
            onClick={async () => {
              const btn = document.getElementById('trigger-btn');
              if (btn) btn.innerText = 'Triggering...';
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

                if (btn) btn.innerText = 'Trigger Search Now';
              } catch (e) {
                if (btn) btn.innerText = 'Trigger Search Now';
                setTriggerResult({ show: true, success: false, reason: 'Network error executing trigger.' });
              }
            }}
            id="trigger-btn"
            className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Trigger Search Now
          </button>
        </div>
      </div>

      {combined.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center flex flex-col items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 mb-4 opacity-50"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <h3 className="text-xl font-semibold text-white">All caught up!</h3>
          <p className="text-zinc-500 mt-2">No missing monitored media found across your connected instances.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {combined.map((item) => {
            const isToggled = searchToggles[item.idStr] !== false; // Default true
            return (
              <div
                key={item.idStr}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isToggled ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-900 opacity-60'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-12 rounded-full ${item.type === 'movie' ? 'bg-yellow-500' : 'bg-cyan-500'}`} />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${item.type === 'movie' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-cyan-500/20 text-cyan-500'
                        }`}>
                        {item.type}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${item.isDownloaded ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
                        }`}>
                        {item.isDownloaded ? 'Downloaded' : 'Missing'}
                      </span>
                      <span className="text-xs text-zinc-500 font-medium">{item.instanceName}</span>
                    </div>
                    <h3 className="text-lg font-medium text-white">
                      {item.title}
                    </h3>
                    <p className="text-sm text-zinc-400">
                      {item.type === 'movie'
                        ? (item.isDownloaded ? '100% Downloaded' : 'Missing from Library')
                        : (item.stats ? `${item.stats.episodeFileCount} / ${item.stats.episodeCount} Episodes (${Math.round(item.stats.percentOfEpisodes)}%)` : 'Unknown')}
                      {' • Added '}{formatDistanceToNow(item.sortDate, { addSuffix: true })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleSearch(item.idStr)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950 ${isToggled ? 'bg-emerald-500' : 'bg-zinc-700'
                      }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isToggled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Manual Trigger Result Modal */}
      {triggerResult.show && (
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
                <p className="text-zinc-400 text-sm">The background scheduler has executed a batch search.</p>

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
      )}
    </div>
  );
}

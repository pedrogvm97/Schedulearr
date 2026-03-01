"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const [movies, setMovies] = useState<any[]>([]);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState<number | null>(null);

  // Fake state for UI demonstration (would be connected to backend DB in full implementation)
  const [searchToggles, setSearchToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [movieRes, epRes] = await Promise.all([
          fetch('/api/radarr/missing'),
          fetch('/api/sonarr/missing')
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

  // Combine and sort all missing media by date added
  let combined = [
    ...movies.map(m => ({ ...m, type: 'movie', sortDate: new Date(m.added).getTime(), idStr: `movie-${m.id}` })),
    ...episodes.map(e => ({ ...e, type: 'episode', sortDate: new Date(e.seriesAdded).getTime(), idStr: `ep-${e.id}` }))
  ].sort((a, b) => b.sortDate - a.sortDate); // Newest first

  if (limit !== null) {
    combined = combined.slice(0, limit);
  }

  return (
    <div className="max-w-7xl mx-auto px-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Missing Media</h1>
          <p className="text-zinc-400">Items missing from your Arr instances, prioritized by date added.</p>
        </div>

        <div className="flex gap-2">
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
                await fetch('/api/scheduler/trigger', { method: 'POST' });
                if (btn) btn.innerText = 'Search Triggered!';
                setTimeout(() => { if (btn) btn.innerText = 'Trigger Search Now' }, 3000);
              } catch (e) {
                if (btn) btn.innerText = 'Error';
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
                      <span className="text-xs text-zinc-500 font-medium">{item.instanceName}</span>
                    </div>
                    <h3 className="text-lg font-medium text-white">
                      {item.type === 'movie' ? item.title : `${item.seriesTitle} - S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')} - ${item.title}`}
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Added {formatDistanceToNow(item.sortDate, { addSuffix: true })}
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
    </div>
  );
}

"use client";

import { useState } from "react";
import HistoryLedger from "@/components/HistoryLedger";

export default function Dashboard() {
  const [triggerResult, setTriggerResult] = useState<{
    show: boolean,
    success?: boolean,
    reason?: string,
    movies?: string[],
    episodes?: string[]
  }>({ show: false });
  const [isTriggering, setIsTriggering] = useState(false);

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

"use client";

import { useState, useEffect } from "react";

export default function SchedulerConfig() {
    const [interval, setIntervalVal] = useState("60");
    const [batchSize, setBatchSize] = useState("10");
    const [enabled, setEnabled] = useState(false);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/scheduler/config')
            .then(res => res.json())
            .then(data => {
                if (data.interval) setIntervalVal(data.interval);
                if (data.batchSize) setBatchSize(data.batchSize);
                if (data.enabled !== undefined) setEnabled(data.enabled);
            });
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await fetch('/api/scheduler/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ interval, batchSize, enabled })
            });
            const btn = document.getElementById('save-config-btn');
            if (btn) {
                const old = btn.innerText;
                btn.innerText = 'Saved!';
                setTimeout(() => { btn.innerText = old; }, 2000);
            }
        } catch (e) {
            console.error('Failed to save config', e);
        }
        setLoading(false);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Scheduler Configuration</h1>
                <p className="text-zinc-400">Fine-tune how often and how aggressively searches are triggered in the background.</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
                <form onSubmit={handleSave} className="space-y-6">

                    <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
                        <div>
                            <h2 className="text-lg font-medium text-white">Enable Background Scheduler</h2>
                            <p className="text-sm text-zinc-400">Automatically trigger searches without opening the app.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEnabled(!enabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                                }`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-white flex justify-between">
                                <span>Search Interval</span>
                                <span className="text-emerald-500">{interval} minutes</span>
                            </label>
                            <input
                                type="range"
                                min="15"
                                max="1440"
                                step="15"
                                value={interval}
                                onChange={e => setIntervalVal(e.target.value)}
                                className="w-full accent-emerald-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                            />
                            <p className="text-xs text-zinc-500">How often the cron job executes.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-white flex justify-between">
                                <span>Batch Size</span>
                                <span className="text-emerald-500">{batchSize} items</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="50"
                                value={batchSize}
                                onChange={e => setBatchSize(e.target.value)}
                                className="w-full accent-emerald-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                            />
                            <p className="text-xs text-zinc-500">Maximum searches to trigger per interval to protect indexers.</p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-800 flex justify-end">
                        <button
                            id="save-config-btn"
                            disabled={loading}
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-8 rounded-lg transition-colors disabled:opacity-50"
                        >
                            Save Settings
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-zinc-950 border border-emerald-900/30 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                </div>
                <h3 className="text-lg font-medium text-emerald-400 mb-2 relative z-10">Prowlarr Protection</h3>
                <p className="text-sm text-zinc-400 relative z-10 max-w-2xl">
                    The scheduler automatically checks your connected Prowlarr instance before executing any batch. If indexers are reporting as rate-limited or offline, the batch size is dynamically reduced or paused until health is restored to prevent permanent bans.
                </p>
            </div>
        </div>
    );
}

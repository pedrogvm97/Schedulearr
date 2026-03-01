'use client';

import { useEffect, useState } from 'react';
import { PackageOpen, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface HistoryEntry {
    id: string;
    timestamp: string;
    profile: string;
    movies_searched: string[];
    episodes_searched: string[];
    reason: string;
}

export default function HistoryLedger() {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await fetch('/api/history');
                const data = await res.json();
                if (data.history) {
                    setHistory(data.history);
                }
            } catch (e) {
                console.error("Failed to fetch history", e);
            }
            setLoading(false);
        };
        fetchHistory();

        // Refresh history every 60 seconds
        const interval = setInterval(fetchHistory, 60000);
        return () => clearInterval(interval);
    }, []);

    const toggleRow = (id: string) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    if (loading) {
        return <div className="p-8 text-slate-400">Loading history ledger...</div>;
    }

    if (history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-800/20 rounded-xl border border-slate-800">
                <PackageOpen size={48} className="mb-4 text-emerald-500/50" />
                <h3 className="text-lg font-medium text-slate-300">No Search History</h3>
                <p className="mt-2 text-sm max-w-sm text-center">
                    The background scheduler hasn&apos;t run yet, or you haven&apos;t triggered any manual searches. Head to the Scheduler tab to queue one up!
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {history.map((entry) => {
                const totalSearched = entry.movies_searched.length + entry.episodes_searched.length;
                const isExpanded = expandedRows[entry.id];

                return (
                    <div key={entry.id} className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden hover:border-slate-600 transition-colors">
                        {/* Summary Header (Clickable) */}
                        <div
                            className="p-4 flex items-center justify-between cursor-pointer"
                            onClick={() => toggleRow(entry.id)}
                        >
                            <div className="flex items-center space-x-4">
                                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${totalSearched > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <h4 className="text-slate-200 font-medium">
                                        Searched {totalSearched} Items
                                        <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-emerald-400 uppercase tracking-wider">
                                            {entry.profile.replace('_', ' ')}
                                        </span>
                                    </h4>
                                    <p className="text-sm text-slate-400">
                                        {new Date(entry.timestamp).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                {totalSearched === 0 && (
                                    <div className="flex items-center text-sm text-yellow-500/80 bg-yellow-500/10 px-3 py-1 rounded-full">
                                        <AlertCircle size={14} className="mr-1.5" />
                                        Skipped
                                    </div>
                                )}
                                {isExpanded ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
                            </div>
                        </div>

                        {/* Expanded Details */}
                        {
                            isExpanded && (
                                <div className="border-t border-slate-700/50 bg-slate-900/30 p-4 space-y-4">
                                    <div className="text-sm text-slate-300">
                                        <span className="font-semibold text-slate-500 mr-2">Status Log:</span>
                                        {entry.reason}
                                    </div>

                                    {entry.episodes_searched.length > 0 && (
                                        <div>
                                            <h5 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Episodes Searched ({entry.episodes_searched.length})</h5>
                                            <ul className="space-y-1">
                                                {entry.episodes_searched.map((ep, i) => (
                                                    <li key={i} className="text-sm text-slate-300 flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-blue-500 before:mr-2">
                                                        {ep}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {entry.movies_searched.length > 0 && (
                                        <div>
                                            <h5 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Movies Searched ({entry.movies_searched.length})</h5>
                                            <ul className="space-y-1">
                                                {entry.movies_searched.map((mov, i) => (
                                                    <li key={i} className="text-sm text-slate-300 flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-yellow-500 before:mr-2">
                                                        {mov}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )
                        }
                    </div>
                );
            })}
        </div >
    );
}

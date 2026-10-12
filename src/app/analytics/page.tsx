'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, Zap } from 'lucide-react';
import { PlexTelemetryPanel } from '@/components/PlexTelemetryPanel';
import { AiApiAnalyticsPanel } from '@/components/AiApiAnalyticsPanel';

function AnalyticsPageContent() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<'streams' | 'apis'>('streams');

    useEffect(() => {
        const t = searchParams.get('tab');
        if (t === 'apis' || t === 'ai' || t === 'quotas') {
            setActiveTab('apis');
        } else if (t === 'streams' || t === 'plex') {
            setActiveTab('streams');
        }
    }, [searchParams]);

    return (
        <div className="max-w-[1800px] mx-auto p-4 sm:p-8 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    Analytics
                </h1>

                <div className="flex items-center gap-2 bg-zinc-900/90 p-2 rounded-2xl border border-zinc-800 shadow-xl">
                    <button
                        onClick={() => setActiveTab('streams')}
                        title="Streaming Telemetry, Watch History & Active Viewers"
                        className={`px-5 py-3 rounded-xl text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeTab === 'streams'
                                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25'
                                : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <Activity size={20} />
                        <span>Streams</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('apis')}
                        title="API Providers Load, Subscription Tier Quotas, Images Generated & Audio Hours Converted"
                        className={`px-5 py-3 rounded-xl text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeTab === 'apis'
                                ? 'bg-indigo-500 text-black shadow-lg shadow-indigo-500/25'
                                : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <Zap size={20} />
                        <span>APIs &amp; Quotas</span>
                    </button>
                </div>
            </div>

            {activeTab === 'streams' ? <PlexTelemetryPanel /> : <AiApiAnalyticsPanel />}
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-zinc-400 font-bold">Loading Analytics...</div>}>
            <AnalyticsPageContent />
        </Suspense>
    );
}

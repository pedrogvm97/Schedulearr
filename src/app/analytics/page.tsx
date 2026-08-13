'use client';

import { PlexTelemetryPanel } from '@/components/PlexTelemetryPanel';

export default function AnalyticsPage() {
    return (
        <div className="max-w-[1800px] mx-auto p-4 sm:p-8 space-y-8">
            <div>
                <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                    Tautulli Telemetry
                </h1>
                <p className="text-sm text-zinc-500 mt-1">Live Plex streaming analytics, watch history, and user activity.</p>
            </div>
            <PlexTelemetryPanel />
        </div>
    );
}

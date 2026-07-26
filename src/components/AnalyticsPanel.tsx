'use client';

import React, { useState, useEffect } from "react";
import HistoryLedger from "@/components/HistoryLedger";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { X, Film, Info, HardDrive, Sliders, AlertTriangle, Trash2, Search, MoveHorizontal, PlayCircle, CheckCircle } from 'lucide-react';
import { MediaDetailsPanel } from "@/components/MediaDetailsPanel";
import { toast } from 'sonner';

interface RecentDownload {
  title: string;
  date: string;
  instanceId: string;
  status: string;
  size: number;
  failureReason?: string;
  indexer?: string;
  poster?: string;
  tmdbId?: number;
  tvdbId?: number;
  mediaType?: 'movie' | 'series';
}

interface SpeedHistory {
  timestamp: string;
  download_speed: number;
  upload_speed: number;
  qbit_dl: number;
  qbit_up: number;
  plex_dl: number;
  plex_up: number;
  total_dl: number;
  total_up: number;
}

interface ChartData {
  date: string;
  [key: string]: string | number | string[];
}

export function AnalyticsPanel() {
  const [diskInfo, setDiskInfo] = useState<{ totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number; byInstance: any[] } | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [instances, setInstances] = useState<Record<string, { name: string, color: string, type: string }>>({});
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);
  const [speedHistory, setSpeedHistory] = useState<SpeedHistory[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [tmdbApiKey, setTmdbApiKey] = useState("");

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [diskRes, instRes, statsRes, speedRes, settingsRes] = await Promise.all([
        fetch('/api/system/disk').then(r => r.ok ? r.json() : null),
        fetch('/api/instances').then(r => r.ok ? r.json() : []),
        fetch('/api/stats').then(r => r.ok ? r.json() : {}),
        fetch('/api/stats/speed').then(r => r.ok ? r.json() : []),
        fetch('/api/settings').then(r => r.ok ? r.json() : {})
      ]);

      if (diskRes) setDiskInfo(diskRes);
      if (settingsRes?.tmdb_api_key) setTmdbApiKey(settingsRes.tmdb_api_key);
      if (speedRes) setSpeedHistory(speedRes);

      if (instRes && Array.isArray(instRes)) {
        const instMap: Record<string, any> = {};
        instRes.forEach((i: any) => {
          instMap[i.id] = { name: i.name, color: i.color || 'bg-blue-500', type: i.type };
        });
        setInstances(instMap);
      }

      if (statsRes?.downloads) {
        setRecentDownloads(statsRes.downloads.slice(0, 10));
      }
    } catch (e) {
      console.error('Failed to load analytics data', e);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
    return `${gb.toFixed(1)} GB`;
  };

  const formatSpeed = (bps: number) => {
    if (!bps) return '0 MB/s';
    const mbps = (bps * 8) / (1024 * 1024);
    return `${mbps.toFixed(1)} Mbps`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-white">System Analytics & Storage</h2>
        <p className="text-xs text-zinc-500 font-medium">Real-time disk space, network speeds, and system metrics.</p>
      </div>

      {/* Disk Space Card */}
      {diskInfo && (
        <div className="p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <HardDrive size={20} />
              </div>
              <div>
                <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Storage Capacity</span>
                <span className="text-lg font-black text-white">{formatBytes(diskInfo.usedBytes)} used of {formatBytes(diskInfo.totalBytes)}</span>
              </div>
            </div>
            <span className={`text-lg font-black ${diskInfo.usedPercent >= 90 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {diskInfo.usedPercent.toFixed(1)}% Used
            </span>
          </div>

          <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                diskInfo.usedPercent >= 90 ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]' : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
              }`}
              style={{ width: `${Math.min(100, diskInfo.usedPercent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Speed Chart */}
      {speedHistory.length > 0 && (
        <div className="p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Network Speeds</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="timestamp" stroke="#71717a" tick={{ fontSize: 10 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="download_speed" name="Download" stroke="#10b981" fill="#10b98120" />
                <Area type="monotone" dataKey="upload_speed" name="Upload" stroke="#3b82f6" fill="#3b82f620" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* History Ledger */}
      <HistoryLedger />

      {selectedMedia && (
        <MediaDetailsPanel
          item={selectedMedia}
          tmdbApiKey={tmdbApiKey}
          onClose={() => setSelectedMedia(null)}
        />
      )}
    </div>
  );
}

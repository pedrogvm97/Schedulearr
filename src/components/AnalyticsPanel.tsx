'use client';

import React, { useState, useEffect } from "react";
import { SystemActionLedger } from "@/components/SystemActionLedger";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { X, Film, Info, HardDrive, Sliders, AlertTriangle, Trash2, Search, MoveHorizontal, PlayCircle, CheckCircle } from 'lucide-react';
import { MediaDetailsPanel } from "@/components/MediaDetailsPanel";
import { toast } from 'sonner';

// --- Interfaces ---
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

export function AnalyticsPanel() {
  const [triggerResult, setTriggerResult] = useState<{
    show: boolean,
    success?: boolean,
    reason?: string,
    movies?: string[],
    episodes?: string[]
  }>({ show: false });
  const [isTriggering, setIsTriggering] = useState(false);

  // Disk and Storage Guard States
  const [diskInfo, setDiskInfo] = useState<{ totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number; byInstance: any[] } | null>(null);
  const [diskPauseEnabled, setDiskPauseEnabled] = useState(false);
  const [diskPauseThreshold, setDiskPauseThreshold] = useState(90);
  const [diskAutocleanEnabled, setDiskAutocleanEnabled] = useState(false);
  const [diskSmartCleanMode, setDiskSmartCleanMode] = useState('largest');
  const [diskSmartCleanImmunityEnabled, setDiskSmartCleanImmunityEnabled] = useState(false);
  const [diskSmartCleanImmunityDays, setDiskSmartCleanImmunityDays] = useState(7);

  // Data States
  const [allTimeData, setAllTimeData] = useState<ChartData[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]); // This is the filtered data used by Recharts
  const [instances, setInstances] = useState<Record<string, { name: string, color: string, type: string }>>({});
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);
  const [summaryData, setSummaryData] = useState<{
    instanceTotals: Record<string, any>,
    indexerTotals: Record<string, any>
  }>({ instanceTotals: {}, indexerTotals: {} });
  const [speedHistory, setSpeedHistory] = useState<SpeedHistory[]>([]);
  const [allSettings, setAllSettings] = useState<Record<string, string>>({});
  const [tmdbApiKey, setTmdbApiKey] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [libStatus, setLibStatus] = useState<any>(null);

  // UI States
  const [loadingStats, setLoadingStats] = useState(true);
  const [prowlarrHealth, setProwlarrHealth] = useState<ProwlarrInstance[]>([]);
  const [loadingProwlarr, setLoadingProwlarr] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [chartType, setChartType] = useState<'grabbed' | 'imported' | 'sizeGB'>('grabbed');
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('month');
  const [recentDownloadFilters, setRecentDownloadFilters] = useState<Record<string, boolean>>({});
  const [showQbit, setShowQbit] = useState(false);
  const [showPlex, setShowPlex] = useState(false);
  const [showTotal, setShowTotal] = useState(true);

  // Tooltip States
  const [stickyTooltip, setStickyTooltip] = useState<any>(null);
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [isBarHovered, setIsBarHovered] = useState(false);
  const [tooltipTimeout, setTooltipTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [speedtestResult, setSpeedtestResult] = useState<{ speedMbps: number, sizeMB: number, durationSec: number } | null>(null);
  const [speedTestError, setSpeedTestError] = useState<string | null>(null);
  const [showSpeedtestModal, setShowSpeedtestModal] = useState(false);
  const [availableInterfaces, setAvailableInterfaces] = useState<string[]>(['total']);
  const [selectedInterface, setSelectedInterface] = useState('total');

  const toggleRecentFilter = (id: string) => {
    setRecentDownloadFilters((prev: Record<string, boolean>) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setAllSettings(data);
        if (data.tmdb_api_key) setTmdbApiKey(data.tmdb_api_key);
        else if (data.tmdbApiKey) setTmdbApiKey(data.tmdbApiKey);
        if (data.networkInterface) setSelectedInterface(data.networkInterface);
      });

    fetch("/api/stats/interfaces")
      .then(res => res.json())
      .then(data => {
        if (data.interfaces) setAvailableInterfaces(data.interfaces);
      });
  }, []);

  const fetchDiskInfo = () => {
    fetch('/api/system/disk')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDiskInfo(d); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchDiskInfo();
    const interval = setInterval(fetchDiskInfo, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (allSettings.disk_pause_enabled) setDiskPauseEnabled(allSettings.disk_pause_enabled === 'true');
    if (allSettings.disk_pause_threshold) setDiskPauseThreshold(parseInt(allSettings.disk_pause_threshold) || 90);
    if (allSettings.disk_autoclean_enabled) setDiskAutocleanEnabled(allSettings.disk_autoclean_enabled === 'true');
    if (allSettings.qbit_smart_clean_mode) setDiskSmartCleanMode(allSettings.qbit_smart_clean_mode);
    if (allSettings.qbit_smart_clean_immunity_enabled) setDiskSmartCleanImmunityEnabled(allSettings.qbit_smart_clean_immunity_enabled === 'true');
    if (allSettings.qbit_smart_clean_immunity_days) setDiskSmartCleanImmunityDays(parseInt(allSettings.qbit_smart_clean_immunity_days) || 7);
  }, [allSettings]);

  const updateSetting = async (key: string, value: any) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: String(value) })
      });
      if (res.ok) {
        setAllSettings(prev => ({ ...prev, [key]: String(value) }));
      } else {
        throw new Error("Failed to save");
      }
    } catch (e) {
      console.error('Failed to update setting', key, e);
      toast.error("Failed to update setting");
    }
  };

  const handleOpenMedia = (dl: RecentDownload) => {
    // Resolve type: mediaType may be undefined for older history records
    const resolvedType: 'movie' | 'series' = dl.mediaType || (dl.tvdbId ? 'series' : 'movie');
    const item = {
      title: dl.title,
      tmdbId: dl.tmdbId || null,
      tvdbId: dl.tvdbId || null,
      type: resolvedType,
      mediaType: resolvedType,
      remotePoster: dl.poster || null
    };
    setSelectedMedia(item);
    
    // Check library status
    fetch(`/api/media/status?title=${encodeURIComponent(dl.title)}&type=${resolvedType}`)
      .then(r => r.ok ? r.json() : null)
      .then(status => setLibStatus(status))
      .catch(() => setLibStatus(null));
  };

  const filterDataLocally = (data: ChartData[], range: string) => {
    if (range === 'all') {
      setChartData(data);
      return;
    }

    let days = 30;
    if (range === 'day') days = 1;
    else if (range === 'week') days = 7;
    else if (range === 'month') days = 30;
    else if (range === 'year') days = 365;

    const now = new Date();
    const cutoff = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    const filtered = data.filter(d => new Date(d.date) >= cutoff);
    setChartData(filtered);
  };

  const fetchStats = async (requestedTimeframe: string) => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/stats?timeframe=${requestedTimeframe}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        setAllTimeData(data);
        filterDataLocally(data, requestedTimeframe);

        setInstances(json.instances || {});
        if (json.recentDownloads) setRecentDownloads(json.recentDownloads);
        if (json.summary) setSummaryData(json.summary);

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

  const fetchSpeedHistory = async () => {
    try {
      const res = await fetch('/api/stats/speed');
      if (res.ok) {
        const data = await res.json();
        setSpeedHistory(data);
      }
    } catch (e) {
      console.error("Failed to load speed history", e);
    }
  };

  useEffect(() => {
    fetchStats(timeframe);
    fetchSpeedHistory();
    
    // Refresh speed history more frequently
    const interval = setInterval(fetchSpeedHistory, 30000);
    return () => clearInterval(interval);
  }, [timeframe]);

  useEffect(() => {
    const seenWelcome = localStorage.getItem('has_seen_welcome');
    if (!seenWelcome) setShowWelcome(true);

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

  const handleSpeedTest = async () => {
    setIsTestingSpeed(true);
    setSpeedtestResult(null);
    setSpeedTestError(null);
    setShowSpeedtestModal(true);
    try {
      const res = await fetch('/api/stats/speedtest?action=test');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSpeedtestResult(data);
        } else {
          setSpeedTestError(data.error || "Failed to reach test server.");
        }
      } else {
        setSpeedTestError("Server error during speedtest.");
      }
    } catch (e) {
      console.error("Speedtest failed", e);
      setSpeedTestError("Network error during speedtest.");
    }
    setIsTestingSpeed(false);
  };

  const updateNetworkInterface = async (iface: string) => {
    setSelectedInterface(iface);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'networkInterface', value: iface })
    });
  };

  const handleMouseMove = (e: any) => {
    if (e.activePayload) {
      setIsBarHovered(true);
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        setTooltipTimeout(null);
      }

      setStickyTooltip((prev: any) => {
        // STATIONARY: Only change position if label actually changed
        if (prev && prev.label === e.label) {
          return { ...prev, ...e };
        }

        // Use client coordinates for accurate screen-relative positioning
        const chartElement = document.querySelector('.recharts-wrapper');
        const rect = chartElement?.getBoundingClientRect();

        return {
          ...e,
          pageX: (rect?.left || 0) + e.chartX,
          pageY: (rect?.top || 0) + e.chartY
        };
      });
    }
  };

  const handleMouseLeave = () => {
    setIsBarHovered(false);
  };

  // Dedicated effect to handle 1s grace period and hover interlock
  useEffect(() => {
    if (!isBarHovered && !isTooltipHovered && stickyTooltip) {
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
      const timeout = setTimeout(() => {
        setStickyTooltip(null);
      }, 1000);
      setTooltipTimeout(timeout);
    } else if (isBarHovered || isTooltipHovered) {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        setTooltipTimeout(null);
      }
    }
  }, [isBarHovered, isTooltipHovered, stickyTooltip]);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean, payload?: any[], label?: string }) => {
    // The actual tooltip is now rendered by StickyTooltipOverlay for persistence.
    // This just acts as a trigger/hidden element for Recharts internal logic if needed.
    return null;
  };

  const StickyTooltipOverlay = () => {
    if (!stickyTooltip || !stickyTooltip.payload || !stickyTooltip.payload.length) return null;

    const displayPayload = stickyTooltip.payload;
    const displayLabel = stickyTooltip.label;

    // Calculate position based on the chart mouse event or center it
    // For now, let's keep it in a fixed but floating position near the right edge
    // or relative to the chart container.

    const groups = displayPayload.filter((p: any) => p.value > 0).map((entry: any) => {
      const dataKey = entry.dataKey as string;
      const titlesKey = `${dataKey}_titles`;
      const itemTitles = entry.payload[titlesKey] || [];

      return {
        dataKey,
        name: entry.name,
        value: entry.value,
        fill: entry.fill,
        titles: itemTitles
      };
    });

    if (groups.length === 0) return null;

    return (
      <div
        className="fixed z-[99999] pointer-events-auto"
        style={{
          top: stickyTooltip.pageY ? Math.max(20, Math.min(stickyTooltip.pageY - 100, window.innerHeight - 450)) : '20%',
          left: stickyTooltip.pageX ? Math.min(stickyTooltip.pageX + 80, window.innerWidth - 520) : '50%',
          transform: stickyTooltip.pageX ? 'none' : 'translateX(-50%)'
        }}
        onMouseEnter={() => {
          setIsTooltipHovered(true);
          if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            setTooltipTimeout(null);
          }
        }}
        onMouseLeave={() => {
          setIsTooltipHovered(false);
          handleMouseLeave();
        }}
      >
        <div className="bg-zinc-950/98 border border-zinc-800 p-4 rounded-xl shadow-2xl backdrop-blur-xl min-w-[320px] max-w-[500px] select-text relative ring-1 ring-white/10">
          <div className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-zinc-800 pb-2 flex justify-between items-center">
            <span>{displayLabel ? new Date(String(displayLabel)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
            <div className="flex items-center gap-3">
              <span className="text-[9px] text-zinc-600 normal-case font-medium animate-pulse">Scrollable Content</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStickyTooltip(null);
                  setIsTooltipHovered(false);
                }}
                className="p-1 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-all border border-transparent hover:border-zinc-700"
              >
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-3 custom-scrollbar">
            {groups.map((group: any, index: number) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between gap-4 sticky top-0 bg-zinc-950/95 backdrop-blur-md py-2 z-10 border-b border-zinc-900/50 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: group.fill }} />
                    <span className="text-zinc-100 text-sm font-bold">{group.name}</span>
                  </div>
                  <span className="text-white text-sm font-black bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{group.value}</span>
                </div>

                {group.titles.length > 0 && (
                  <div className="pl-4 border-l-2 border-zinc-800/80 space-y-2 ml-1 pb-3">
                    {group.titles.map((t: string, i: number) => (
                      <p key={i} className="text-zinc-400 text-[11px] leading-relaxed font-semibold hover:text-emerald-400 transition-colors cursor-default">
                        {t}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute -bottom-2 -left-2 -right-2 h-4 bg-gradient-to-t from-black/20 to-transparent pointer-events-none rounded-b-xl" />
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6 sm:space-y-8 pb-12">
        {/* Dashboard Header Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-950 p-5 sm:p-8 border border-zinc-800/80 shadow-2xl space-y-6">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1 max-w-2xl">
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">Search History</h1>
            </div>

            <button
              onClick={handleManualTrigger}
              disabled={isTriggering}
              className={`w-full sm:w-auto h-12 ${
                isTriggering 
                  ? 'bg-emerald-600/10 text-emerald-600 border-emerald-500/20' 
                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]'
              } border rounded-2xl px-6 font-extrabold text-xs sm:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 touch-target flex-shrink-0`}
            >
              {isTriggering ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Triggering Batch...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>Trigger Search Now</span>
                </>
              )}
            </button>
          </div>

          {/* Filter Bar Chips — Clean Wrapped Mobile Grid */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-800/60 relative z-10">
            {/* Timeframe Selector */}
            <div className="flex flex-wrap items-center bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-1.5 gap-1 w-full sm:w-auto">
              {(['day', 'week', 'month', 'year', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`flex-1 sm:flex-none px-3 py-2 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all text-center ${
                    timeframe === t 
                      ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700/60' 
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t === 'day' ? 'Today' : t}
                </button>
              ))}
            </div>

            {/* Metric Selector */}
            <div className="flex flex-wrap items-center bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-1.5 gap-1 w-full sm:w-auto">
              <button
                onClick={() => setChartType('grabbed')}
                className={`flex-1 sm:flex-none px-3.5 py-2 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all text-center ${
                  chartType === 'grabbed' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Grabs
              </button>
              <button
                onClick={() => setChartType('imported')}
                className={`flex-1 sm:flex-none px-3.5 py-2 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all text-center ${
                  chartType === 'imported' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Finalized
              </button>
              <button
                onClick={() => setChartType('sizeGB')}
                className={`flex-1 sm:flex-none px-3.5 py-2 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all text-center ${
                  chartType === 'sizeGB' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Data
              </button>
            </div>
          </div>
        </div>

        {/* Analytics Dashboard Top Row: Left Column (Rankings + Top Indexers) | Right Column (Trend BarChart) */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8 mt-2 items-stretch">
          {/* Left Column: Stacked Instance Rankings & Top Indexers */}
          <div className="w-full lg:w-96 flex-shrink-0 flex flex-col gap-4">
            {/* Instance Rankings Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col flex-1">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Instance Rankings</h3>
              <div className="space-y-4 flex-1">
                {Object.keys(instances).filter(id => recentDownloadFilters[id] !== false).map(id => {
                  const totals = summaryData.instanceTotals[id] || { grabbed: 0, imported: 0, failed: 0, sizeBytes: 0 };
                  const value = chartType === 'grabbed' ? totals.grabbed : (chartType === 'imported' ? totals.imported : (totals.sizeBytes / (1024 ** 3)));

                  const maxVal = Math.max(...Object.keys(instances).filter(k => recentDownloadFilters[k] !== false).map((id: any) => {
                    const t = summaryData.instanceTotals[id] || { grabbed: 0, imported: 0, sizeBytes: 0 };
                    return chartType === 'grabbed' ? t.grabbed : (chartType === 'imported' ? t.imported : (t.sizeBytes / (1024 ** 3)));
                  }), 1);
                  const percentage = Math.min(100, (value / maxVal) * 100);

                  return (
                    <div key={id} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-zinc-200">{instances[id].name}</span>
                        <span className="text-zinc-400 font-black">
                          {chartType === 'sizeGB' ? `${value.toFixed(1)} GB` : value}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                        <div
                          className="h-full transition-all duration-1000 ease-out rounded-full"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: instances[id].color,
                            boxShadow: `0 0 10px ${instances[id].color}40`
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Indexers Card (Stacked below Instance Rankings) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col flex-1">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Top Indexers</h3>
              <div className="space-y-3 flex-1 flex flex-col justify-center">
                {(() => {
                  const filteredIndexerStats: Record<string, { grabbed: number, imported: number, sizeBytes: number }> = {};
                  recentDownloads.filter(dl => recentDownloadFilters[dl.instanceId] !== false).forEach(dl => {
                    if (!dl.indexer || dl.indexer === 'Unknown') return;
                    if (!filteredIndexerStats[dl.indexer]) {
                      filteredIndexerStats[dl.indexer] = { grabbed: 0, imported: 0, sizeBytes: 0 };
                    }
                    if (dl.status === 'Grabbed') filteredIndexerStats[dl.indexer].grabbed++;
                    if (dl.status === 'Finalized') {
                      filteredIndexerStats[dl.indexer].imported++;
                      filteredIndexerStats[dl.indexer].sizeBytes += dl.size || 0;
                    }
                  });

                  return Object.entries(filteredIndexerStats)
                    .map(([name, stats]: [string, any]) => ({
                      name,
                      value: chartType === 'grabbed' ? stats.grabbed : (chartType === 'imported' ? stats.imported : (stats.sizeBytes / (1024 ** 3)))
                    }))
                    .filter(item => item.value > 0)
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 3)
                    .map((indexer, idx) => (
                      <div key={indexer.name} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black border ${idx === 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                            idx === 1 ? 'bg-zinc-400/10 border-zinc-400/30 text-zinc-400' :
                              'bg-orange-500/10 border-orange-500/30 text-orange-400'
                            }`}>
                            {idx + 1}
                          </div>
                          <span className="text-xs font-bold text-zinc-200 truncate max-w-[140px]">{indexer.name}</span>
                        </div>
                        <span className="text-xs font-black text-white px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800/50 min-w-[50px] text-center">
                          {chartType === 'sizeGB' ? `${indexer.value.toFixed(1)}G` : indexer.value}
                        </span>
                      </div>
                    ));
                })()}
                {(!recentDownloads || recentDownloads.filter(dl => recentDownloadFilters[dl.instanceId] !== false).length === 0) && (
                  <div className="text-center py-4 text-zinc-500 text-xs italic">No indexer data for selected filters</div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Expanded Historical Trend BarChart */}
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between min-h-[420px]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Trend Analysis</h3>
                <div className="text-[10px] text-zinc-500 font-medium">Daily Aggregated Totals</div>
              </div>
            </div>

            <div className="flex-1 min-h-[350px]">
              {loadingStats ? (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">Loading aggregated statistics...</div>
              ) : chartData.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 font-medium">No results for this timeframe.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#52525b"
                      fontSize={10}
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis stroke="#52525b" fontSize={10} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: '#27272a', opacity: 0.4 }}
                      content={<CustomTooltip />}
                      allowEscapeViewBox={{ x: true, y: true }}
                      wrapperStyle={{ zIndex: 1000, pointerEvents: 'auto' }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px', fontSize: '10px' }}
                      formatter={(value: string) => <span className="text-zinc-500 font-black uppercase tracking-tighter">{value}</span>}
                    />
                    {Object.keys(instances).map((id) => {
                      if (recentDownloadFilters[id] === false) return null;
                      return (
                        <React.Fragment key={id}>
                          {(chartType === 'grabbed') && (
                            <>
                              <Bar dataKey={`${id}_grabbed`} name={instances[id].name} stackId="a" fill={instances[id].color} opacity={0.8} radius={[0, 0, 0, 0]} legendType="rect" />
                              <Bar dataKey={`${id}_downloading`} name={`${instances[id].name} (DL)`} stackId="a" fill={instances[id].color} opacity={0.3} radius={[2, 2, 0, 0]} legendType="none" />
                            </>
                          )}
                          {(chartType === 'imported') && (
                            <Bar dataKey={`${id}_imported`} name={instances[id].name} stackId="a" fill={instances[id].color} opacity={1} radius={[2, 2, 0, 0]} legendType="rect" />
                          )}
                          {(chartType === 'sizeGB') && (
                            <Bar dataKey={`${id}_sizeGB`} name={instances[id].name} stackId="a" fill={instances[id].color} opacity={0.9} radius={[2, 2, 0, 0]} legendType="rect" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Indexers and Downloads */}
        <div className="space-y-8 mb-8">
          {/* Prowlarr Indexers Health */}
          {!loadingProwlarr && Array.isArray(prowlarrHealth) && prowlarrHealth.length > 0 && (
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
                        {Array.isArray(prowlarrInst?.health?.indexers) ? prowlarrInst.health.indexers.length : 0} Enabled Indexers
                      </div>
                    </div>

                    {(!Array.isArray(prowlarrInst?.health?.indexers) || prowlarrInst.health.indexers.length === 0) ? (
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
        </div>

        {/* Side-by-Side: Network Speed & Recent Downloads */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 items-stretch">
          {/* Network Stats History */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Network Stats</h2>
              <div className="flex gap-2 items-center">
                <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 gap-1.5">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-tighter">Interval</span>
                  <input 
                    type="number"
                    min="5"
                    step="5"
                    className="bg-transparent text-[9px] font-bold text-white w-6 outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={allSettings.network_speed_interval_sec || '30'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAllSettings(prev => ({ ...prev, network_speed_interval_sec: val }));
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: 'network_speed_interval_sec', value: val })
                      });
                    }}
                  />
                  <span className="text-[8px] font-bold text-zinc-600">s</span>
                </div>
                <button 
                  onClick={() => setShowSpeedtestModal(true)}
                  className="px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase transition-all hover:bg-emerald-500/20"
                >
                  Test Speed
                </button>
                <button 
                  onClick={() => setShowTotal(!showTotal)}
                  className={`px-2 py-1 rounded border text-[9px] font-bold uppercase transition-all ${showTotal ? 'bg-zinc-100 text-black border-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                  title="Show system/global traffic"
                >
                  System
                </button>
                {availableInterfaces.length > 1 && (
                  <select 
                    value={selectedInterface}
                    onChange={(e) => updateNetworkInterface(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[9px] font-bold text-zinc-400 focus:border-emerald-500/50 outline-none uppercase appearance-none cursor-pointer hover:bg-zinc-800"
                  >
                    {availableInterfaces.map(iface => (
                      <option key={iface} value={iface}>{iface === 'total' ? 'All Interfaces' : iface}</option>
                    ))}
                  </select>
                )}
                <button 
                  onClick={() => setShowQbit(!showQbit)}
                  className={`px-2 py-1 rounded border text-[9px] font-bold uppercase transition-all ${showQbit ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                >
                  qBit
                </button>
                <button 
                  onClick={() => setShowPlex(!showPlex)}
                  className={`px-2 py-1 rounded border text-[9px] font-bold uppercase transition-all ${showPlex ? 'bg-orange-500 text-white border-orange-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                >
                  Plex
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[300px]">
              {speedHistory.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2 p-8 border border-zinc-800/50 border-dashed rounded-xl">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
                  <p className="text-sm italic">Monitoring network traffic...</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={speedHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorUp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="timestamp" hide={true} />
                    <YAxis 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickFormatter={(val) => formatSpeed(val)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '11px' }}
                      labelStyle={{ color: '#71717a' }}
                      formatter={(value: any, name: string | undefined) => [formatSpeed(value || 0), name || 'Speed']}
                      labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                    />
                    {showTotal && (
                      <>
                        <Area type="monotone" dataKey="total_dl" name="Total DL" stroke="#10b981" fillOpacity={1} fill="url(#colorDl)" strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="total_up" name="Total UP" stroke="#3b82f6" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" isAnimationActive={false} />
                      </>
                    )}
                    {showQbit && (
                      <>
                        <Area type="monotone" dataKey="qbit_dl" name="qBit DL" stroke="#0ea5e9" fillOpacity={0} strokeWidth={1} isAnimationActive={false} />
                        <Area type="monotone" dataKey="qbit_up" name="qBit UP" stroke="#0ea5e9" fillOpacity={0} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />
                      </>
                    )}
                    {showPlex && (
                      <Area type="monotone" dataKey="plex_up" name="Plex UP" stroke="#f97316" fillOpacity={0.1} fill="#f97316" strokeWidth={1} strokeDasharray="4 4" isAnimationActive={false} />
                    )}
                    {!showTotal && !showQbit && !showPlex && (
                      <>
                        <Area type="monotone" dataKey="download_speed" name="Download" stroke="#10b981" fillOpacity={1} fill="url(#colorDl)" strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="upload_speed" name="Upload" stroke="#3b82f6" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" isAnimationActive={false} />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            {speedHistory.length > 0 && (
              <div className="mt-4 flex justify-between text-[11px] font-bold">
                <div className="flex gap-4">
                  <div className="flex flex-col">
                    <span className="text-zinc-500 uppercase tracking-tighter">Current DL</span>
                    <span className="text-emerald-400">{formatSpeed(showTotal ? speedHistory[speedHistory.length-1].total_dl : speedHistory[speedHistory.length-1].download_speed)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 uppercase tracking-tighter">Current UP</span>
                    <span className="text-blue-400">{formatSpeed(showTotal ? speedHistory[speedHistory.length-1].total_up : speedHistory[speedHistory.length-1].upload_speed)}</span>
                  </div>
                </div>
                <div className="text-zinc-600 self-end italic">Last 60 mins</div>
              </div>
            )}
          </div>

          {/* Recent Downloads */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col max-h-[500px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Recent Downloads</h2>
              <div className="flex gap-1.5 flex-wrap">
                {Object.keys(instances).map(id => (
                  <button
                    key={id}
                    onClick={() => toggleRecentFilter(id)}
                    style={{
                      borderColor: recentDownloadFilters[id] !== false ? `${instances[id].color}40` : '#27272a',
                      backgroundColor: recentDownloadFilters[id] !== false ? `${instances[id].color}15` : 'transparent',
                      color: recentDownloadFilters[id] !== false ? instances[id].color : '#52525b'
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border transition-all hover:scale-105"
                  >
                    {instances[id].name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
              {loadingStats && (
                <div className="text-zinc-500 text-sm italic py-2">Loading recent history...</div>
              )}
              {!loadingStats && recentDownloads.filter(dl => recentDownloadFilters[dl.instanceId] !== false).length === 0 && (
                <div className="text-zinc-500 text-sm py-2 flex items-center justify-center p-8 bg-zinc-950/50 rounded-xl border border-zinc-800/50 border-dashed">
                  No downloads found for current filters.
                </div>
              )}
              {!loadingStats && recentDownloads.filter(dl => recentDownloadFilters[dl.instanceId] !== false).slice(0, 20).map((dl, idx) => {
                const inst = instances[dl.instanceId];
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex-shrink-0 transition hover:border-emerald-500/30 hover:bg-zinc-900 group relative"
                  >
                    {/* Poster */}
                    <div
                      onClick={() => handleOpenMedia(dl)}
                      className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-zinc-900 border border-zinc-800 group-hover:border-emerald-500/20 cursor-pointer transition-all"
                    >
                      {dl.poster ? (
                        <img
                          src={dl.poster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(dl.poster)}` : dl.poster}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '';
                            (e.target as HTMLImageElement).className = 'hidden';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700 group-hover:text-emerald-500/50">
                          <Film size={14} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className="text-sm font-semibold text-zinc-200 truncate group-hover:text-white cursor-pointer"
                        title={dl.title}
                        onClick={() => handleOpenMedia(dl)}
                      >
                        {dl.title}
                      </span>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs text-zinc-500 font-medium">{getAge(dl.date)}</span>
                        <span
                          title={dl.failureReason || dl.status}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${dl.status === 'Finalized' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            dl.status === 'Failed' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            dl.status === 'Downloading' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {dl.status}
                        </span>
                        {inst && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border" style={{ color: inst.color, borderColor: `${inst.color}40`, backgroundColor: `${inst.color}10` }}>
                            {inst.name.split(' ')[0]}
                          </span>
                        )}
                        {dl.indexer && dl.indexer !== 'Unknown' && (
                          <span className="text-[10px] font-bold text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded border border-zinc-700/50">{dl.indexer}</span>
                        )}
                        {dl.size > 0 && (
                          <span className="text-[10px] font-bold text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">{(dl.size / (1024 ** 3)).toFixed(2)} GB</span>
                        )}
                      </div>
                    </div>

                    {/* More Info button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenMedia(dl); }}
                      className="flex-shrink-0 p-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-md transition-all opacity-0 group-hover:opacity-100"
                      title="View Media Details"
                    >
                      <Info size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col mb-8">
          <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Search History Ledger</h3>
            <div className="text-[10px] text-zinc-500 font-medium">Automatic & Manual Scheduler Runs</div>
          </div>
          <SystemActionLedger />
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
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-6 items-center">
                    <div className="relative group overflow-hidden rounded-lg border border-zinc-800 w-32 h-24 flex-shrink-0">
                      <img src="/setup/step1.png" alt="Connect" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      <div className="absolute inset-0 bg-emerald-500/10 mix-blend-overlay"></div>
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold text-xs border border-emerald-500/30">1</div>
                        <h4 className="text-white font-semibold">Connect Your Instances</h4>
                      </div>
                      <p className="text-sm text-zinc-400">Head to the Settings tab to link your Sonarr, Radarr, Prowlarr, and qBittorrent details.</p>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-6 items-center">
                    <div className="relative group overflow-hidden rounded-lg border border-zinc-800 w-32 h-24 flex-shrink-0">
                      <img src="/setup/step2.png" alt="Activate" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      <div className="absolute inset-0 bg-blue-500/10 mix-blend-overlay"></div>
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0 font-bold text-xs border border-blue-500/30">2</div>
                        <h4 className="text-white font-semibold">Activate Media</h4>
                      </div>
                      <p className="text-sm text-zinc-400">Jump into the Media Search tab to select which movies or shows you want Schedulearr to orchestrate.</p>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-6 items-center">
                    <div className="relative group overflow-hidden rounded-lg border border-zinc-800 w-32 h-24 flex-shrink-0">
                      <img src="/setup/step3.png" alt="Relax" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      <div className="absolute inset-0 bg-purple-500/10 mix-blend-overlay"></div>
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0 font-bold text-xs border border-purple-500/30">3</div>
                        <h4 className="text-white font-semibold">Sit Back & Relax</h4>
                      </div>
                      <p className="text-sm text-zinc-400">Schedulearr runs in the background continuously pacing searches to avoid API bans while grabbing top tier releases.</p>
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
 
        {/* Speed Test Modal */}
        {showSpeedtestModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[70] backdrop-blur-md">
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-10 max-w-lg w-full shadow-[0_0_50px_rgba(16,185,129,0.1)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50"></div>
              
              <div className="text-center mb-8">
                <h2 className="text-2xl font-black text-white mb-2 italic tracking-tighter uppercase">Network Speed Test</h2>
                <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase">Benchmarking External Connection</p>
              </div>

              <div className="flex flex-col items-center justify-center py-10 relative">
                {/* Gauge-like UI */}
                <div className="w-56 h-56 rounded-full border-4 border-zinc-900 flex flex-col items-center justify-center relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                   <div className={`absolute inset-0 rounded-full border-t-4 border-emerald-500 transition-all duration-1000 ${isTestingSpeed ? 'animate-spin' : 'opacity-20'}`} style={{ borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent' }}></div>
                   
                   <div className="text-center z-10">
                     {isTestingSpeed ? (
                       <div className="flex flex-col items-center">
                         <span className="text-4xl font-black text-white animate-pulse">...</span>
                         <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-2">Testing</span>
                       </div>
                     ) : speedtestResult ? (
                       <div className="flex flex-col items-center">
                         <span className="text-5xl font-black text-emerald-500 tabular-nums tracking-tighter">{speedtestResult.speedMbps}</span>
                         <span className="text-xs text-zinc-400 font-black uppercase tracking-widest">Mb/s</span>
                       </div>
                     ) : (
                       <button 
                         onClick={handleSpeedTest}
                         className="bg-emerald-500 text-black font-black uppercase tracking-tighter px-8 py-3 rounded-full hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                       >
                         {speedTestError ? 'RETRY' : 'GO'}
                       </button>
                     )}
                   </div>
                </div>

                {speedtestResult && (
                  <div className="grid grid-cols-2 gap-8 mt-10 w-full">
                    <div className="text-center">
                      <div className="text-[10px] text-zinc-500 uppercase font-black mb-1">Payload</div>
                      <div className="text-xl font-bold text-white tracking-tight">{speedtestResult.sizeMB.toFixed(1)} MB</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-zinc-500 uppercase font-black mb-1">Duration</div>
                      <div className="text-xl font-bold text-white tracking-tight">{speedtestResult.durationSec.toFixed(2)} s</div>
                    </div>
                  </div>
                )}
                {speedTestError && (
                  <div className="mt-8 bg-red-500/10 text-red-500/80 px-4 py-2 rounded-xl text-xs font-bold border border-red-500/20 uppercase tracking-widest text-center">
                    {speedTestError}
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => {
                    setShowSpeedtestModal(false);
                    setSpeedtestResult(null);
                    setSpeedTestError(null);
                  }}
                  disabled={isTestingSpeed}
                  className="text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors py-2"
                >
                  {speedtestResult || speedTestError ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div> 
      <StickyTooltipOverlay />

      {selectedMedia && (
        <MediaDetailsPanel
          item={selectedMedia}
          tmdbApiKey={tmdbApiKey}
          libStatus={libStatus}
          onClose={() => {
            setSelectedMedia(null);
            setLibStatus(null);
          }}
        />
      )}
    </>
  );
}

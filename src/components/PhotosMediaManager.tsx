'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    ImageIcon,
    Smartphone,
    Plus,
    RefreshCw,
    Trash2,
    Battery,
    BatteryCharging,
    Wrench,
    ExternalLink,
    HardDrive,
    CheckCircle2,
    AlertCircle,
    ArrowUpRight,
    Zap,
    X,
    Maximize2,
    Cloud,
    Check
} from 'lucide-react';
import { toast } from 'sonner';

export interface PhotosMediaManagerProps {
    controlledSubTab?: 'overview' | 'pixel' | 'heal';
    onControlledSubTabChange?: (tab: 'overview' | 'pixel' | 'heal') => void;
}

interface ImmichPhoto {
    id: string;
    assetId: string;
    title: string;
    posterUrl: string;
    streamUrl: string;
    sizeBytes: number;
    category: 'photo' | 'video';
    addedAt?: string;
    city?: string | null;
    country?: string | null;
}

interface ImmichAlbum {
    id: string;
    name: string;
    assetCount: number;
    coverUrl?: string | null;
}

export function PhotosMediaManager({ controlledSubTab = 'overview', onControlledSubTabChange }: PhotosMediaManagerProps = {}) {
    const subTab = controlledSubTab || 'overview';

    const [instances, setInstances] = useState<any[]>([]);
    const [loadingInstances, setLoadingInstances] = useState(true);

    const [bridgeData, setBridgeData] = useState<{
        paired: boolean;
        node: any;
        stats: any;
        backupSummary: any;
    } | null>(null);
    const [loadingBridge, setLoadingBridge] = useState(true);

    // Photos & Albums state
    const [photos, setPhotos] = useState<ImmichPhoto[]>([]);
    const [albums, setAlbums] = useState<ImmichAlbum[]>([]);
    const [selectedAlbumId, setSelectedAlbumId] = useState<string>('all');
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [lightboxPhoto, setLightboxPhoto] = useState<ImmichPhoto | null>(null);

    // Action execution states
    const [solving, setSolving] = useState(false);
    const [solveLogs, setSolveLogs] = useState<Array<{ step: string; status: 'ok' | 'warn' | 'error'; detail: string }>>([]);
    const [syncingBatch, setSyncingBatch] = useState(false);
    const [cleaningSpace, setCleaningSpace] = useState(false);

    // Fetch instances to check for Immich
    const fetchInstances = async () => {
        try {
            const res = await fetch('/api/instances');
            if (res.ok) {
                const data = await res.json();
                setInstances(data || []);
            }
        } catch {
        } finally {
            setLoadingInstances(false);
        }
    };

    // Fetch paired Pixel bridge telemetry
    const fetchBridge = async () => {
        try {
            const res = await fetch('/api/theater/photos/pixel/bridge');
            if (res.ok) {
                const data = await res.json();
                setBridgeData(data);
            }
        } catch {
        } finally {
            setLoadingBridge(false);
        }
    };

    // Fetch photos from Immich studio
    const fetchImmichPhotos = useCallback(async (albumId = 'all') => {
        setLoadingPhotos(true);
        try {
            if (albumId === 'all') {
                const res = await fetch('/api/theater/photos/immich/studio?action=photos&take=120');
                if (res.ok) {
                    const data = await res.json();
                    setPhotos(data.items || []);
                }
            } else {
                const res = await fetch(`/api/theater/photos/immich/studio?action=album_assets&albumId=${albumId}`);
                if (res.ok) {
                    const data = await res.json();
                    setPhotos(data.items || []);
                }
            }
        } catch {
        } finally {
            setLoadingPhotos(false);
        }
    }, []);

    // Fetch album list from Immich studio
    const fetchImmichAlbums = useCallback(async () => {
        try {
            const res = await fetch('/api/theater/photos/immich/studio?action=overview');
            if (res.ok) {
                const data = await res.json();
                setAlbums(data.albums || []);
            }
        } catch {}
    }, []);

    useEffect(() => {
        fetchInstances();
        fetchBridge();
        fetchImmichAlbums();
        fetchImmichPhotos('all');
    }, [fetchImmichAlbums, fetchImmichPhotos]);

    // Format bytes
    const formatBytes = (bytes?: number) => {
        if (!bytes || bytes <= 0) return '0 B';
        const mb = bytes / (1024 * 1024);
        if (mb < 1000) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
    };

    // Auto-Solver handler
    const handleAutoSolve = async () => {
        setSolving(true);
        setSolveLogs([]);
        try {
            const res = await fetch('/api/theater/photos/pixel/heal', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
                setSolveLogs(data.logs || []);
                toast.success('Connection restored');
                fetchBridge();
            } else {
                setSolveLogs(data.logs || []);
                toast.error(data.error || 'Connection check failed');
            }
        } catch (e: any) {
            toast.error(e.message || 'Auto-Solver failed');
        } finally {
            setSolving(false);
        }
    };

    // Manual sync batch handler
    const handleSyncBatch = async () => {
        setSyncingBatch(true);
        try {
            const res = await fetch('/api/theater/photos/pixel/bridge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync_batch' })
            });
            if (res.ok) {
                toast.success('Batch started');
                fetchBridge();
            } else {
                toast.error('Sync failed');
            }
        } catch {
            toast.error('Sync error');
        } finally {
            setSyncingBatch(false);
        }
    };

    // Manual clean space handler
    const handleCleanSpace = async () => {
        setCleaningSpace(true);
        try {
            const res = await fetch('/api/theater/photos/pixel/bridge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clean_space' })
            });
            if (res.ok) {
                toast.success('Space cleaned');
                fetchBridge();
            } else {
                toast.error('Clean failed');
            }
        } catch {
            toast.error('Clean error');
        } finally {
            setCleaningSpace(false);
        }
    };

    const immichInstances = instances.filter(i => i.type === 'immich');
    const hasImmich = immichInstances.length > 0;

    if (loadingInstances || loadingBridge) {
        return (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
                <div className="w-14 h-14 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!hasImmich) {
        return (
            <div className="p-16 bg-zinc-950/60 rounded-[2.5rem] border border-sky-500/20 text-center space-y-6 max-w-xl mx-auto my-12 shadow-2xl animate-in fade-in">
                <div className="w-24 h-24 rounded-3xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mx-auto">
                    <ImageIcon size={48} />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-white">Immich</h2>
                </div>
                <div className="pt-2 flex justify-center">
                    <Link
                        href="/settings?subtopic=instances&addType=immich"
                        title="Connect Immich in Settings"
                        className="p-4 rounded-2xl bg-sky-500 hover:bg-sky-400 text-black shadow-lg transition-transform hover:scale-105 flex items-center justify-center cursor-pointer"
                    >
                        <Plus size={28} />
                    </Link>
                </div>
            </div>
        );
    }

    const primaryImmich = immichInstances[0];
    const node = bridgeData?.node;
    const stats = bridgeData?.stats;
    const backupSummary = bridgeData?.backupSummary;
    const isPhoneOnline = Boolean(node?.isOnline);

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* ── PHONE STATUS ALERT BAR ── */}
            {node && (
                <div className={`p-4 sm:p-5 rounded-3xl border flex flex-wrap items-center justify-between gap-4 transition-all shadow-xl ${
                    isPhoneOnline
                        ? 'bg-zinc-950/80 border-emerald-500/30 text-zinc-300'
                        : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                }`}>
                    <div className="flex items-center gap-3.5 min-w-0">
                        <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${isPhoneOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                        <div className="min-w-0">
                            <span className="text-sm sm:text-base font-black text-white">
                                {isPhoneOnline
                                    ? `${node.cleanModel || 'Pixel'} Active • Cloud Syncing in Original Quality`
                                    : `Phone Offline (${node.ip || 'Pixel'}) • Connect to Wi-Fi & Unlock Screen`}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {!isPhoneOnline && (
                            <button
                                onClick={handleAutoSolve}
                                disabled={solving}
                                title="Run Connection Fix"
                                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
                            >
                                <Wrench size={16} className={solving ? 'animate-spin' : ''} />
                                <span>Connect</span>
                            </button>
                        )}
                        <button
                            onClick={() => { fetchBridge(); fetchImmichPhotos(selectedAlbumId); }}
                            title="Refresh Status"
                            className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
                        >
                            <RefreshCw size={18} />
                        </button>
                        <a
                            href={primaryImmich.url}
                            target="_blank"
                            rel="noreferrer"
                            title="Open Immich"
                            className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
                        >
                            <ExternalLink size={18} />
                        </a>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* SUBTAB 1: PHOTOS GALLERY (MEDIA FIRST)                           */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {subTab === 'overview' && (
                <div className="space-y-6">
                    {/* Album filter pills */}
                    {albums.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                                onClick={() => { setSelectedAlbumId('all'); fetchImmichPhotos('all'); }}
                                className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border cursor-pointer ${
                                    selectedAlbumId === 'all'
                                        ? 'bg-sky-500 text-black border-sky-400 shadow-md'
                                        : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                                }`}
                            >
                                All Photos
                            </button>
                            {albums.map(alb => (
                                <button
                                    key={alb.id}
                                    onClick={() => { setSelectedAlbumId(alb.id); fetchImmichPhotos(alb.id); }}
                                    className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all border cursor-pointer ${
                                        selectedAlbumId === alb.id
                                            ? 'bg-sky-500 text-black border-sky-400 shadow-md font-black'
                                            : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                                    }`}
                                >
                                    {alb.name} ({alb.assetCount})
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Photo Grid */}
                    {loadingPhotos ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-3">
                            <div className="w-12 h-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
                        </div>
                    ) : photos.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {photos.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => setLightboxPhoto(p)}
                                    className="group relative aspect-square rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800/80 hover:border-sky-500/60 transition-all cursor-pointer shadow-lg hover:scale-[1.02]"
                                >
                                    <img
                                        src={p.posterUrl}
                                        alt={p.title}
                                        loading="lazy"
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                        <p className="text-xs font-bold text-white truncate">{p.title}</p>
                                        {p.city && <p className="text-[10px] text-zinc-400 font-mono">{p.city}</p>}
                                    </div>
                                    <div className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Maximize2 size={14} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-20 bg-zinc-950/60 rounded-3xl border border-zinc-900 text-center space-y-4">
                            <ImageIcon size={48} className="mx-auto text-zinc-600" />
                            <p className="text-zinc-400 font-bold text-sm">No photos found in this view</p>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* SUBTAB 2: PIXEL PHONE DASHBOARD & ACTIVE SYNC                     */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {subTab === 'pixel' && (
                <div className="space-y-6">
                    {/* Hardware Node Card */}
                    {node && (
                        <div className="p-6 sm:p-8 bg-zinc-950/80 rounded-3xl border border-indigo-500/30 shadow-2xl space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 shadow-inner">
                                        <Smartphone size={32} />
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <h3 className="text-2xl font-black text-white tracking-tight truncate">
                                                {node.cleanModel || 'Pixel'}
                                            </h3>
                                            <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                Unlimited Original
                                            </span>
                                            <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${
                                                isPhoneOnline
                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                            }`}>
                                                {isPhoneOnline ? 'Connected' : 'Offline'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-zinc-400">
                                            <span>IP: {node.ip}:{node.port || 5555}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1 text-white font-bold">
                                                {node.isCharging ? <BatteryCharging size={14} className="text-amber-400" /> : <Battery size={14} />}
                                                {node.batteryLevel ?? 85}%
                                            </span>
                                            <span>•</span>
                                            <span className="text-white font-bold">{node.freeStorage || '15G'} Free</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={handleSyncBatch}
                                        disabled={syncingBatch || !isPhoneOnline}
                                        title="Sync Next Batch"
                                        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black text-xs font-black uppercase tracking-wider shadow-lg transition-transform hover:scale-105 cursor-pointer"
                                    >
                                        <ArrowUpRight size={18} className={syncingBatch ? 'animate-bounce' : ''} />
                                        <span>Sync Batch</span>
                                    </button>
                                    <button
                                        onClick={handleCleanSpace}
                                        disabled={cleaningSpace || !isPhoneOnline}
                                        title="Free Up Space on Phone"
                                        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider shadow-lg transition-transform hover:scale-105 cursor-pointer"
                                    >
                                        <Trash2 size={18} className={cleaningSpace ? 'animate-pulse' : ''} />
                                        <span>Free Space</span>
                                    </button>
                                </div>
                            </div>

                            {/* Storage Gauge */}
                            <div className="space-y-2 pt-2 border-t border-zinc-900">
                                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-zinc-400">
                                    <span>Phone Storage</span>
                                    <span className="text-white font-mono">{node.freeStorage || '15G'} Free / {node.totalStorage || '32G'}</span>
                                </div>
                                <div className="w-full h-3 rounded-full bg-zinc-900 overflow-hidden p-0.5 border border-zinc-800">
                                    <div
                                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                        style={{ width: '55%' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stats Metrics Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-6 rounded-3xl bg-zinc-950/80 border border-zinc-900 space-y-2 shadow-xl">
                            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Backed Up</span>
                            <div className="text-3xl font-black text-white font-mono">
                                {stats?.uploadedCount ?? 0}
                            </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-zinc-950/80 border border-zinc-900 space-y-2 shadow-xl">
                            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Storage Freed</span>
                            <div className="text-3xl font-black text-white font-mono">
                                {formatBytes(backupSummary?.counts?.totalBytesCleaned || 0)}
                            </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-zinc-950/80 border border-zinc-900 space-y-2 shadow-xl">
                            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Pending Queue</span>
                            <div className="text-3xl font-black text-white font-mono">
                                {stats?.pendingCount ?? 0}
                            </div>
                        </div>
                    </div>

                    {/* Active Transfer Progress */}
                    {backupSummary?.activeTransferProgress && backupSummary.activeTransferProgress.item && (
                        <div className="p-6 bg-zinc-950/90 rounded-3xl border border-indigo-500/40 space-y-4 shadow-xl">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                                        {backupSummary.activeTransferProgress.item.thumbnailUrl ? (
                                            <img
                                                src={backupSummary.activeTransferProgress.item.thumbnailUrl}
                                                alt={backupSummary.activeTransferProgress.item.filename}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <ImageIcon size={24} className="text-indigo-400" />
                                        )}
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-base font-black text-white truncate">
                                            {backupSummary.activeTransferProgress.item.filename}
                                        </p>
                                        <p className="text-xs font-mono text-zinc-400">
                                            {formatBytes(backupSummary.activeTransferProgress.item.sizeBytes)} • {backupSummary.activeTransferProgress.detail || 'Syncing to Google Cloud'}
                                        </p>
                                    </div>
                                </div>

                                <span className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shrink-0">
                                    {backupSummary.activeTransferProgress.stepName || 'Cloud Upload'} • {backupSummary.activeTransferProgress.percent}%
                                </span>
                            </div>

                            <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 rounded-full transition-all duration-300"
                                    style={{ width: `${backupSummary.activeTransferProgress.percent}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* SUBTAB 3: QUICK CHECKS & ONE-CLICK FIX                           */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {subTab === 'heal' && (
                <div className="space-y-6">
                    <div className="p-6 sm:p-8 bg-zinc-950/80 rounded-3xl border border-zinc-900 space-y-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Wrench size={26} className="text-amber-400 shrink-0" />
                                <h3 className="text-2xl font-black text-white">Fix</h3>
                            </div>

                            <button
                                onClick={handleAutoSolve}
                                disabled={solving}
                                title="Run Connection Fix"
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-black uppercase tracking-wider transition-all shadow-lg cursor-pointer"
                            >
                                <Wrench size={18} className={solving ? 'animate-spin' : ''} />
                                <span>{solving ? 'Running...' : 'Run Fix'}</span>
                            </button>
                        </div>

                        {/* 3 Plain Human Checks */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">1. Home Wi-Fi</span>
                                <p className="text-sm font-bold text-white">
                                    Phone must be on the same home network as Unraid ({node?.ip || '192.168.1.141'}).
                                </p>
                            </div>

                            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">2. Wireless Debugging</span>
                                <p className="text-sm font-bold text-white">
                                    Phone Settings → Developer Options → turn ON Wireless Debugging.
                                </p>
                            </div>

                            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">3. Screen Lock</span>
                                <p className="text-sm font-bold text-white">
                                    Unlock the phone screen so background services are active.
                                </p>
                            </div>
                        </div>

                        {/* Diagnostics Log Output */}
                        {solveLogs.length > 0 && (
                            <div className="space-y-3 pt-4 border-t border-zinc-900">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Results</span>
                                <div className="space-y-2">
                                    {solveLogs.map((log, idx) => (
                                        <div key={idx} className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                {log.status === 'ok' ? (
                                                    <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                                                ) : (
                                                    <AlertCircle size={20} className="text-amber-400 shrink-0" />
                                                )}
                                                <span className="text-sm font-bold text-white">{log.step}</span>
                                            </div>
                                            <span className="text-xs font-mono text-zinc-400">{log.detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── LIGHTBOX MODAL ── */}
            {lightboxPhoto && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                    onClick={() => setLightboxPhoto(null)}
                >
                    <div
                        className="relative max-w-5xl max-h-[90vh] rounded-3xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 bg-zinc-900/80 border-b border-zinc-800">
                            <p className="text-sm font-bold text-white truncate">{lightboxPhoto.title}</p>
                            <button
                                onClick={() => setLightboxPhoto(null)}
                                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-black">
                            <img
                                src={lightboxPhoto.streamUrl || lightboxPhoto.posterUrl}
                                alt={lightboxPhoto.title}
                                className="max-w-full max-h-[75vh] object-contain rounded-xl"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
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
    CheckCircle,
    AlertCircle,
    ArrowUpRight,
    Zap,
    Check,
    Radio,
    Cpu
} from 'lucide-react';
import { toast } from 'sonner';

interface PixelToggles {
    syncEnabled: boolean;
    autoClean: boolean;
    autoStage: boolean;
    autoHeal: boolean;
    chargingOnly: boolean;
    minFreeGb: number;
    batchSize: number;
}

export function PhotosMediaManager() {
    const [instances, setInstances] = useState<any[]>([]);
    const [loadingInstances, setLoadingInstances] = useState(true);

    const [bridgeData, setBridgeData] = useState<{
        paired: boolean;
        node: any;
        toggles: PixelToggles;
        stats: any;
    } | null>(null);
    const [loadingBridge, setLoadingBridge] = useState(true);

    // Auto-Solver state
    const [solving, setSolving] = useState(false);
    const [solveLogs, setSolveLogs] = useState<Array<{ step: string; status: 'ok' | 'warn' | 'error'; detail: string }>>([]);

    // Action execution states
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

    // Fetch paired Pixel bridge telemetry & toggles
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

    useEffect(() => {
        fetchInstances();
        fetchBridge();
    }, []);

    // Toggle update handler
    const handleToggleChange = async (key: keyof PixelToggles, value: any) => {
        if (!bridgeData) return;
        const updated = {
            ...bridgeData.toggles,
            [key]: value
        };
        setBridgeData(prev => prev ? { ...prev, toggles: updated } : null);

        try {
            const res = await fetch('/api/theater/photos/pixel/bridge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_toggles', toggles: updated })
            });
            if (res.ok) {
                toast.success('Updated');
            } else {
                toast.error('Failed to update toggle');
            }
        } catch {
            toast.error('Network error');
        }
    };

    // Auto-Solver handler
    const handleAutoSolve = async () => {
        setSolving(true);
        setSolveLogs([]);
        try {
            const res = await fetch('/api/theater/photos/pixel/heal', {
                method: 'POST'
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSolveLogs(data.logs || []);
                toast.success('Auto-Solver completed successfully');
                fetchBridge();
            } else {
                setSolveLogs(data.logs || []);
                toast.error(data.error || 'Auto-Solver encountered an issue');
            }
        } catch (e: any) {
            toast.error(e.message || 'Auto-Solver failed to execute');
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
                toast.success('Sync batch started');
                fetchBridge();
            } else {
                toast.error('Failed to start sync batch');
            }
        } catch {
            toast.error('Sync batch error');
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
                toast.success('Space clean command sent');
                fetchBridge();
            } else {
                toast.error('Failed to trigger space clean');
            }
        } catch {
            toast.error('Space clean error');
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
                <span className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Loading Photos...</span>
            </div>
        );
    }

    // Empty state: No Immich instance configured yet
    if (!hasImmich) {
        return (
            <div className="p-16 bg-zinc-950/60 rounded-[2.5rem] border border-sky-500/20 text-center space-y-5 max-w-xl mx-auto my-12 shadow-2xl animate-in fade-in">
                <div className="w-24 h-24 rounded-3xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mx-auto">
                    <ImageIcon size={48} />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-white">Immich</h2>
                </div>
                <div className="pt-3 flex justify-center">
                    <Link
                        href="/settings?subtopic=instances&addType=immich"
                        title="Connect Immich Instance in Settings"
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
    const toggles = bridgeData?.toggles || {
        syncEnabled: true,
        autoClean: true,
        autoStage: true,
        autoHeal: true,
        chargingOnly: false,
        minFreeGb: 2,
        batchSize: 25
    };
    const stats = bridgeData?.stats;

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* ── TOP BAR: IMMICH INSTANCE & PIXEL NODE QUICK OVERVIEW ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Immich Instance Status Card */}
                <div className="p-6 bg-zinc-950/80 rounded-3xl border border-sky-500/30 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                                <ImageIcon size={32} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white">{primaryImmich.name || 'Immich'}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs font-mono text-zinc-400 truncate max-w-[260px]">{primaryImmich.url}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <a
                                href={primaryImmich.url}
                                target="_blank"
                                rel="noreferrer"
                                title="Open Immich Web Interface"
                                className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                            >
                                <ExternalLink size={22} />
                            </a>
                            <Link
                                href="/theater?tab=photos"
                                title="View Photos in Theater Canvas"
                                className="p-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-black shadow-lg transition-transform hover:scale-105 cursor-pointer"
                            >
                                <ImageIcon size={22} />
                            </Link>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider">
                        <span>Library Sync: Active</span>
                        <Link
                            href="/settings?subtopic=instances"
                            title="Edit Instance in Settings"
                            className="hover:text-white transition-colors"
                        >
                            Instance Settings
                        </Link>
                    </div>
                </div>

                {/* 2. Pixel Bridge Hardware Node Status Card */}
                <div className="p-6 bg-zinc-950/80 rounded-3xl border border-indigo-500/30 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
                                <Smartphone size={32} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h3 className="text-2xl font-black text-white">{node?.model || 'Pixel Bridge'}</h3>
                                    {node && (
                                        <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                            {node.unlimitedTier === 'original_quality' ? 'Unlimited Original' : 'Storage Saver'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 font-mono">
                                    {node ? (
                                        <>
                                            <span className="flex items-center gap-1.5">
                                                <span className={`w-2.5 h-2.5 rounded-full ${node.isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                {node.ip}:{node.port || 5555}
                                            </span>
                                            {node.batteryLevel !== undefined && (
                                                <span className="flex items-center gap-1">
                                                    {node.isCharging ? <BatteryCharging size={16} className="text-amber-400" /> : <Battery size={16} />}
                                                    {node.batteryLevel}%
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-amber-400">No device paired yet</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleAutoSolve}
                                disabled={solving || !node}
                                title="Auto-Solve / Heal Stalled Pixel Sync"
                                className="p-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black shadow-lg transition-transform hover:scale-105 cursor-pointer"
                            >
                                <Wrench size={22} className={solving ? 'animate-spin' : ''} />
                            </button>
                            <Link
                                href="/settings?subtopic=instances"
                                title="Pair Device in Settings"
                                className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                            >
                                <Plus size={22} />
                            </Link>
                        </div>
                    </div>

                    {/* Storage Headroom Bar */}
                    {node?.freeStorage && (
                        <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
                                <span>Storage Buffer</span>
                                <span className="text-white font-mono">{node.freeStorage} Free / {node.totalStorage || '32G'}</span>
                            </div>
                            <div className="w-full h-2.5 rounded-full bg-zinc-900 overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: '45%' }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── GRANULAR TOGGLES & AUTOMATION CONTROLS ── */}
            <div className="p-6 sm:p-8 bg-zinc-950/80 rounded-3xl border border-zinc-900 shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Cpu size={26} className="text-emerald-400 shrink-0" />
                        <h3 className="text-2xl font-black text-white">Automation</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSyncBatch}
                            disabled={syncingBatch || !node}
                            title="Push Next Batch to Pixel"
                            className="p-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black shadow-lg transition-transform hover:scale-105 cursor-pointer"
                        >
                            <ArrowUpRight size={22} className={syncingBatch ? 'animate-bounce' : ''} />
                        </button>
                        <button
                            onClick={handleCleanSpace}
                            disabled={cleaningSpace || !node}
                            title="Clean Uploaded Photos from Pixel"
                            className="p-3.5 rounded-2xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white shadow-lg transition-transform hover:scale-105 cursor-pointer"
                        >
                            <Trash2 size={22} className={cleaningSpace ? 'animate-pulse' : ''} />
                        </button>
                        <button
                            onClick={() => { fetchBridge(); fetchInstances(); }}
                            title="Refresh Status"
                            className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                        >
                            <RefreshCw size={22} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Toggle 1: Sync to Pixel */}
                    <div
                        onClick={() => handleToggleChange('syncEnabled', !toggles.syncEnabled)}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            toggles.syncEnabled
                                ? 'bg-indigo-600/10 border-indigo-500/50 text-white'
                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                        title="Master switch for feeding photos from Immich to Pixel 1"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toggles.syncEnabled ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                                <Zap size={22} />
                            </div>
                            <span className="text-base font-bold">Sync to Pixel</span>
                        </div>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${toggles.syncEnabled ? 'bg-indigo-500 text-white' : 'bg-zinc-800'}`}>
                            {toggles.syncEnabled && <Check size={16} />}
                        </div>
                    </div>

                    {/* Toggle 2: Auto Space Cleaning */}
                    <div
                        onClick={() => handleToggleChange('autoClean', !toggles.autoClean)}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            toggles.autoClean
                                ? 'bg-emerald-600/10 border-emerald-500/50 text-white'
                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                        title="Automatically cleans uploaded photos from Pixel to maintain free headroom"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toggles.autoClean ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                <Trash2 size={22} />
                            </div>
                            <span className="text-base font-bold">Auto Clean Space</span>
                        </div>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${toggles.autoClean ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}>
                            {toggles.autoClean && <Check size={16} />}
                        </div>
                    </div>

                    {/* Toggle 3: Auto Stage Immich */}
                    <div
                        onClick={() => handleToggleChange('autoStage', !toggles.autoStage)}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            toggles.autoStage
                                ? 'bg-sky-600/10 border-sky-500/50 text-white'
                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                        title="Automatically queue newly arrived photos from Immich into Pixel staging"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toggles.autoStage ? 'bg-sky-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                <ArrowUpRight size={22} />
                            </div>
                            <span className="text-base font-bold">Auto Stage</span>
                        </div>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${toggles.autoStage ? 'bg-sky-500 text-black' : 'bg-zinc-800'}`}>
                            {toggles.autoStage && <Check size={16} />}
                        </div>
                    </div>

                    {/* Toggle 4: Auto-Solver & Watchdog */}
                    <div
                        onClick={() => handleToggleChange('autoHeal', !toggles.autoHeal)}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            toggles.autoHeal
                                ? 'bg-amber-600/10 border-amber-500/50 text-white'
                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                        title="Automatically resolve stuck transfers, ADB socket drops, and wake sync workers"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toggles.autoHeal ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                <Wrench size={22} />
                            </div>
                            <span className="text-base font-bold">Auto Solver</span>
                        </div>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${toggles.autoHeal ? 'bg-amber-500 text-black' : 'bg-zinc-800'}`}>
                            {toggles.autoHeal && <Check size={16} />}
                        </div>
                    </div>

                    {/* Toggle 5: Charging Only */}
                    <div
                        onClick={() => handleToggleChange('chargingOnly', !toggles.chargingOnly)}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            toggles.chargingOnly
                                ? 'bg-orange-600/10 border-orange-500/50 text-white'
                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                        title="Only transfer batches when Pixel is connected to a power charger"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toggles.chargingOnly ? 'bg-orange-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                <BatteryCharging size={22} />
                            </div>
                            <span className="text-base font-bold">Charging Only</span>
                        </div>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${toggles.chargingOnly ? 'bg-orange-500 text-black' : 'bg-zinc-800'}`}>
                            {toggles.chargingOnly && <Check size={16} />}
                        </div>
                    </div>

                    {/* Numeric Setting: Batch Size & Headroom */}
                    <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-zinc-300 flex items-center justify-between">
                        <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center">
                                <HardDrive size={22} />
                            </div>
                            <span className="text-base font-bold">Buffer (GB)</span>
                        </div>
                        <select
                            value={toggles.minFreeGb}
                            onChange={e => handleToggleChange('minFreeGb', parseInt(e.target.value, 10))}
                            title="Minimum free space buffer on Pixel before pushing new batches"
                            className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm outline-none cursor-pointer"
                        >
                            <option value={1}>1 GB</option>
                            <option value={2}>2 GB</option>
                            <option value={4}>4 GB</option>
                            <option value={8}>8 GB</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── AUTO-SOLVER DIAGNOSTIC FEEDBACK ── */}
            {solveLogs.length > 0 && (
                <div className="p-6 bg-zinc-950/80 rounded-3xl border border-amber-500/30 space-y-4 animate-in fade-in">
                    <div className="flex items-center gap-3">
                        <Wrench size={24} className="text-amber-400" />
                        <h3 className="text-xl font-black text-white">Diagnostics</h3>
                    </div>
                    <div className="space-y-2">
                        {solveLogs.map((log, idx) => (
                            <div key={idx} className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    {log.status === 'ok' ? (
                                        <CheckCircle size={18} className="text-emerald-400 shrink-0" />
                                    ) : log.status === 'warn' ? (
                                        <AlertCircle size={18} className="text-amber-400 shrink-0" />
                                    ) : (
                                        <AlertCircle size={18} className="text-rose-400 shrink-0" />
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
    );
}

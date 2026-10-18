'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, Folder, Check, AlertCircle, RefreshCw, HardDrive, Battery, Zap } from 'lucide-react';
import { toast } from 'sonner';

export interface ConnectedDevice {
    id: string;
    name: string;
    type: 'adb' | 'local_folder';
    target: string;
    schedulearrFolder: string;
    enabled: boolean;
    isOnline?: boolean;
    batteryLevel?: number;
    isCharging?: boolean;
    storageFree?: string;
    storageTotal?: string;
}

interface ConnectedDevicesToggleSectionProps {
    media: {
        id: string;
        title: string;
        category?: string;
        path?: string;
        streamUrl?: string;
        sizeBytes?: number;
    };
    onSyncChange?: (deviceId: string, enabled: boolean) => void;
}

export function ConnectedDevicesToggleSection({ media, onSyncChange }: ConnectedDevicesToggleSectionProps) {
    const [devices, setDevices] = useState<ConnectedDevice[]>([]);
    const [syncMap, setSyncMap] = useState<{ [deviceId: string]: boolean }>({});
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const loadDevicesAndSync = async () => {
        try {
            const [devRes, syncRes] = await Promise.all([
                fetch('/api/devices'),
                fetch(`/api/devices/sync?mediaId=${encodeURIComponent(media.id)}`)
            ]);

            if (devRes.ok) {
                const devData = await devRes.json();
                setDevices(devData.devices || []);
            }

            if (syncRes.ok) {
                const syncData = await syncRes.json();
                setSyncMap(syncData.syncMap || {});
            }
        } catch (e: any) {
            console.error('Failed to load connected devices sync state:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (media.id) {
            loadDevicesAndSync();
        }
    }, [media.id]);

    const handleToggle = async (device: ConnectedDevice) => {
        const currentVal = Boolean(syncMap[device.id]);
        const nextVal = !currentVal;

        setTogglingId(device.id);
        // Optimistic UI update
        setSyncMap(prev => ({ ...prev, [device.id]: nextVal }));

        try {
            const res = await fetch('/api/devices/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: device.id,
                    media,
                    enable: nextVal
                })
            });

            if (res.ok) {
                if (nextVal) {
                    toast.success(`Queued for sync to ${device.name}`);
                } else {
                    toast.info(`Removed sync for ${device.name}`);
                }
                if (onSyncChange) onSyncChange(device.id, nextVal);
            } else {
                // Revert on error
                setSyncMap(prev => ({ ...prev, [device.id]: currentVal }));
                toast.error('Failed to update device sync');
            }
        } catch (e: any) {
            setSyncMap(prev => ({ ...prev, [device.id]: currentVal }));
            toast.error('Connection error: ' + e.message);
        } finally {
            setTogglingId(null);
        }
    };

    if (loading) {
        return (
            <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-center gap-2 text-zinc-500">
                <RefreshCw size={18} className="animate-spin text-amber-400" />
            </div>
        );
    }

    if (devices.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-black text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Smartphone size={18} className="text-amber-400" />
                    <span>Connected Devices & Folders</span>
                </label>
                <span className="text-xs text-zinc-400 font-mono font-bold">
                    {Object.values(syncMap).filter(Boolean).length} / {devices.length} marked
                </span>
            </div>

            <div className="space-y-2.5">
                {devices.map(device => {
                    const isMarked = Boolean(syncMap[device.id]);
                    const isBusy = togglingId === device.id;

                    return (
                        <div
                            key={device.id}
                            onClick={() => !isBusy && handleToggle(device)}
                            className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between select-none cursor-pointer ${
                                isMarked
                                    ? 'bg-amber-500/15 border-amber-500/60 text-white font-bold shadow-md'
                                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-900'
                            }`}
                            title={`Toggle offline sync to ${device.name} folder "${device.schedulearrFolder}"`}
                        >
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                    isMarked 
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' 
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                                }`}>
                                    {device.type === 'adb' ? (
                                        <Smartphone size={22} className={device.isOnline ? 'text-emerald-400' : 'text-zinc-500'} />
                                    ) : (
                                        <Folder size={22} className="text-sky-400" />
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-black truncate">{device.name}</span>
                                        {device.isOnline ? (
                                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Device Connected" />
                                        ) : (
                                            <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 shrink-0" title="Offline (will sync when connected)" />
                                        )}
                                    </div>
                                    <div className="text-xs text-zinc-400 font-mono truncate" title={device.schedulearrFolder}>
                                        {device.schedulearrFolder}
                                    </div>
                                    {device.storageFree && (
                                        <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-2 mt-0.5">
                                            <span>{device.storageFree} free</span>
                                            {device.batteryLevel !== undefined && (
                                                <span>• {device.batteryLevel}% {device.isCharging ? '⚡' : ''}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Large Toggle Control */}
                            <div className="flex items-center gap-3 shrink-0 ml-3">
                                <div
                                    className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${
                                        isMarked 
                                            ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]' 
                                            : 'bg-zinc-800 border border-zinc-700'
                                    }`}
                                >
                                    <div 
                                        className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                                            isMarked ? 'left-7' : 'left-1'
                                        }`} 
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
    Smartphone, Folder, Plus, RefreshCw, Trash2, CheckCircle2,
    AlertCircle, HardDrive, Battery, Zap, Edit3, X, Check, ArrowRight,
    FolderPlus, Send, Disc, Film, BookOpen, Music, Cloud
} from 'lucide-react';
import { toast } from 'sonner';

export interface ConnectedDevice {
    id: string;
    name: string;
    type: 'adb' | 'local_folder';
    role?: 'upload_bridge' | 'sync_target';
    target: string;
    schedulearrFolder: string;
    enabled: boolean;
    isOnline?: boolean;
    batteryLevel?: number;
    isCharging?: boolean;
    storageFree?: string;
    storageTotal?: string;
    lastSyncAt?: string;
    createdAt: string;
}

export interface DeviceSyncItem {
    id: string;
    deviceId: string;
    deviceName: string;
    mediaId: string;
    mediaTitle: string;
    mediaType: 'music' | 'album' | 'audiobook' | 'movie' | 'show' | 'photo';
    sourcePath: string;
    targetPath?: string;
    sizeBytes: number;
    status: 'queued' | 'syncing' | 'completed' | 'failed';
    progress: number;
    speedBps: number;
    error?: string;
    addedAt: string;
    completedAt?: string;
}

const FOLDER_PRESETS = [
    '/sdcard/Schedulearr',
    '/sdcard/Music/Schedulearr',
    '/sdcard/Audiobooks/Schedulearr',
    '/sdcard/Movies/Schedulearr',
    '/sdcard/DCIM/SchedulearrSync'
];

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function ConnectedDevicesPanel() {
    const [devices, setDevices] = useState<ConnectedDevice[]>([]);
    const [queue, setQueue] = useState<DeviceSyncItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Partial<ConnectedDevice> | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const loadData = async (shouldTest = false) => {
        try {
            if (shouldTest) setRefreshing(true);
            const res = await fetch(`/api/devices${shouldTest ? '?test=true' : ''}`);
            if (res.ok) {
                const data = await res.json();
                setDevices(data.devices || []);
                setQueue(data.queue || []);
            }
        } catch (e: any) {
            console.error('Failed to load devices:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData(true);
        const interval = setInterval(() => loadData(false), 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSaveDevice = async () => {
        if (!editingDevice || !editingDevice.name || !editingDevice.target) {
            toast.error('Device name and connection target are required');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device: {
                        ...editingDevice,
                        schedulearrFolder: editingDevice.schedulearrFolder || '/sdcard/Schedulearr'
                    }
                })
            });

            if (res.ok) {
                toast.success(`Saved "${editingDevice.name}"`);
                setEditingDevice(null);
                loadData(true);
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Failed to save device');
            }
        } catch (e: any) {
            toast.error('Save failed: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDevice = async (id: string, name: string) => {
        try {
            const res = await fetch(`/api/devices?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success(`Removed ${name}`);
                loadData(false);
            } else {
                toast.error('Failed to remove device');
            }
        } catch (e: any) {
            toast.error('Error removing device: ' + e.message);
        }
    };

    const handleTestDevice = async (device: ConnectedDevice) => {
        setTestingId(device.id);
        try {
            const res = await fetch('/api/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test', device })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success(data.message || `Connected to ${device.name}`);
                loadData(false);
            } else {
                toast.error(data.message || `Could not connect to ${device.name}`);
            }
        } catch (e: any) {
            toast.error('Connection test failed: ' + e.message);
        } finally {
            setTestingId(null);
        }
    };

    const handleRemoveQueueItem = async (itemId: string) => {
        try {
            const res = await fetch(`/api/devices/sync?id=${encodeURIComponent(itemId)}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Sync item removed');
                loadData(false);
            }
        } catch (e: any) {
            toast.error('Error removing sync item: ' + e.message);
        }
    };

    const getMediaIcon = (type: string) => {
        switch (type) {
            case 'music':
            case 'album':
                return <Disc size={18} className="text-amber-400" />;
            case 'audiobook':
                return <BookOpen size={18} className="text-emerald-400" />;
            case 'movie':
            case 'show':
                return <Film size={18} className="text-sky-400" />;
            default:
                return <Folder size={18} className="text-zinc-400" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950/80 border border-zinc-800/80 p-6 rounded-[2.5rem] shadow-xl">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Smartphone size={28} className="text-amber-400" />
                        <span>Connected Devices & Folders</span>
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1">
                        Pair your phones, tablets, or local folders. Select a custom Schedulearr directory on each device for automatic offline media sync.
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                        title="Refresh Device Connections & Headroom"
                    >
                        <RefreshCw size={20} className={refreshing ? 'animate-spin text-amber-400' : ''} />
                    </button>

                    <button
                        onClick={() => setEditingDevice({
                            name: '',
                            type: 'adb',
                            target: '192.168.1.141:5555',
                            schedulearrFolder: '/sdcard/Schedulearr',
                            enabled: true
                        })}
                        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                        title="Add Device or Local Folder"
                    >
                        <Plus size={20} />
                        <span>Add Device</span>
                    </button>
                </div>
            </div>

            {/* Device Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {devices.map(device => {
                    const isTesting = testingId === device.id;

                    return (
                        <div
                            key={device.id}
                            className="bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700/80 rounded-3xl p-6 shadow-xl space-y-5 transition-all relative group flex flex-col justify-between"
                        >
                            <div className="space-y-4">
                                {/* Device Header */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                                            {device.type === 'adb' ? <Smartphone size={28} /> : <Folder size={28} />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-xl font-black text-white truncate">{device.name}</h3>
                                                {device.role === 'upload_bridge' ? (
                                                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                                        Upload Bridge
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                        Sync Target
                                                    </span>
                                                )}
                                                {device.isOnline ? (
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Device Reachable" />
                                                ) : (
                                                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 shrink-0" title="Offline" />
                                                )}
                                            </div>
                                            <p className="text-xs text-zinc-400 font-mono truncate">{device.target}</p>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => handleTestDevice(device)}
                                            disabled={isTesting}
                                            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                                            title="Test Connection & Verify Folder"
                                        >
                                            <RefreshCw size={18} className={isTesting ? 'animate-spin text-amber-400' : ''} />
                                        </button>
                                        <button
                                            onClick={() => setEditingDevice(device)}
                                            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                                            title="Edit Device Settings & Folder"
                                        >
                                            <Edit3 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteDevice(device.id, device.name)}
                                            className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-all cursor-pointer"
                                            title="Remove Device"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Custom Schedulearr Folder on Device */}
                                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                            <FolderPlus size={14} />
                                            <span>Schedulearr Folder</span>
                                        </div>
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                            {device.role === 'upload_bridge' ? 'Cloud Staging' : 'Provenance Folders'}
                                        </span>
                                    </div>
                                    <div className="text-sm font-mono font-bold text-white truncate" title={device.schedulearrFolder}>
                                        {device.schedulearrFolder}
                                    </div>
                                    {device.role !== 'upload_bridge' && (
                                        <div className="text-[10px] text-zinc-400 font-mono">
                                            Subfolders: &lt;Category&gt;/&lt;Provenance&gt;
                                        </div>
                                    )}
                                </div>

                                {/* Telemetry & Headroom */}
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex items-center gap-2">
                                        <HardDrive size={16} className="text-sky-400 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-[10px] uppercase text-zinc-500 font-bold">Storage</div>
                                            <div className="font-mono text-zinc-200 truncate">
                                                {device.storageFree ? `${device.storageFree} free` : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex items-center gap-2">
                                        <Battery size={16} className="text-emerald-400 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-[10px] uppercase text-zinc-500 font-bold">Battery</div>
                                            <div className="font-mono text-zinc-200 truncate flex items-center gap-1">
                                                {device.batteryLevel !== undefined ? (
                                                    <>
                                                        <span>{device.batteryLevel}%</span>
                                                        {device.isCharging && <Zap size={12} className="text-amber-400 fill-amber-400" />}
                                                    </>
                                                ) : '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Status Footer */}
                            <div className="pt-3 border-t border-zinc-900/80 flex items-center justify-between text-xs text-zinc-500">
                                <span>{device.type === 'adb' ? 'Wireless ADB Bridge' : 'Local Directory'}</span>
                                <span className={device.isOnline ? 'text-emerald-400 font-bold' : 'text-zinc-600'}>
                                    {device.isOnline ? 'Active & Ready' : 'Disconnected'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Device Sync Queue & History Section */}
            {queue.length > 0 && (
                <div className="space-y-4 pt-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black text-white flex items-center gap-2">
                            <Send size={22} className="text-amber-400" />
                            <span>Device Sync Activity ({queue.length})</span>
                        </h3>
                    </div>

                    <div className="space-y-3">
                        {queue.map(item => {
                            const isSyncing = item.status === 'syncing';
                            const isCompleted = item.status === 'completed';
                            const isFailed = item.status === 'failed';

                            return (
                                <div
                                    key={item.id}
                                    className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg"
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                                            {getMediaIcon(item.mediaType)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black uppercase px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                    {item.mediaType}
                                                </span>
                                                <span className="text-sm sm:text-base font-black text-white truncate">
                                                    {item.mediaTitle}
                                                </span>
                                            </div>
                                            <div className="text-xs text-zinc-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                                                <span className="text-amber-400 font-bold">📱 {item.deviceName}</span>
                                                <span>•</span>
                                                <span className="truncate max-w-xs">{item.targetPath || item.sourcePath}</span>
                                                {item.sizeBytes > 0 && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{formatBytes(item.sizeBytes)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status & Cancel */}
                                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                                        <div className="text-right">
                                            <div className={`text-xs font-black uppercase ${
                                                isSyncing ? 'text-amber-400 animate-pulse' :
                                                isCompleted ? 'text-emerald-400' :
                                                isFailed ? 'text-rose-400' : 'text-zinc-400'
                                            }`}>
                                                {item.status}
                                            </div>
                                            {item.speedBps > 0 && (
                                                <div className="text-[10px] text-zinc-500 font-mono">
                                                    {formatBytes(item.speedBps)}/s
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleRemoveQueueItem(item.id)}
                                            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                                            title="Cancel / Dismiss Sync"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Add / Edit Device Modal */}
            {editingDevice && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setEditingDevice(null); }}
                    className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
                >
                    <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-8 space-y-6 shadow-2xl relative">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                    <Smartphone size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">
                                        {editingDevice.id ? 'Edit Connected Device' : 'Add Connected Device'}
                                    </h3>
                                    <p className="text-xs text-zinc-400">Configure device target and chosen Schedulearr folder</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingDevice(null)}
                                className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
                                title="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-4">
                            {/* Device Name */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Device Name</label>
                                <input
                                    type="text"
                                    value={editingDevice.name || ''}
                                    onChange={e => setEditingDevice({ ...editingDevice, name: e.target.value })}
                                    placeholder="e.g. Pixel 10, Pixel 1, Bedside Tablet"
                                    className="w-full px-4 py-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 text-sm font-bold"
                                />
                            </div>

                            {/* Device Role Distinction */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Device Capability & Role</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingDevice({
                                            ...editingDevice,
                                            role: 'sync_target',
                                            schedulearrFolder: editingDevice.schedulearrFolder?.includes('DCIM') ? '/sdcard/Schedulearr' : (editingDevice.schedulearrFolder || '/sdcard/Schedulearr')
                                        })}
                                        className={`p-3.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                                            (editingDevice.role || 'sync_target') === 'sync_target'
                                                ? 'bg-amber-500/15 border-amber-500/50 text-white font-bold shadow-md'
                                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <Folder size={20} className={(editingDevice.role || 'sync_target') === 'sync_target' ? 'text-amber-400' : 'text-zinc-500'} />
                                        <div className="min-w-0">
                                            <div className="text-xs font-black">Sync Target Node</div>
                                            <div className="text-[10px] text-zinc-500 font-normal truncate">Offline local media</div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setEditingDevice({
                                            ...editingDevice,
                                            role: 'upload_bridge',
                                            schedulearrFolder: '/sdcard/DCIM/SchedulearrSync'
                                        })}
                                        className={`p-3.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                                            editingDevice.role === 'upload_bridge'
                                                ? 'bg-indigo-500/15 border-indigo-500/50 text-white font-bold shadow-md'
                                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <Cloud size={20} className={editingDevice.role === 'upload_bridge' ? 'text-indigo-400' : 'text-zinc-500'} />
                                        <div className="min-w-0">
                                            <div className="text-xs font-black">Upload Bridge Node</div>
                                            <div className="text-[10px] text-zinc-500 font-normal truncate">Google Photos backup</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Connection Type */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">Connection Type</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingDevice({ ...editingDevice, type: 'adb' })}
                                        className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                                            editingDevice.type === 'adb'
                                                ? 'bg-amber-500/15 border-amber-500/50 text-white font-bold'
                                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                                        }`}
                                    >
                                        <Smartphone size={18} className={editingDevice.type === 'adb' ? 'text-amber-400' : 'text-zinc-500'} />
                                        <div className="text-xs">ADB Wireless Bridge</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingDevice({ ...editingDevice, type: 'local_folder' })}
                                        className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                                            editingDevice.type === 'local_folder'
                                                ? 'bg-amber-500/15 border-amber-500/50 text-white font-bold'
                                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                                        }`}
                                    >
                                        <Folder size={18} className={editingDevice.type === 'local_folder' ? 'text-amber-400' : 'text-zinc-500'} />
                                        <div className="text-xs">Local Directory Mount</div>
                                    </button>
                                </div>
                            </div>

                            {/* Target (IP:Port or local path) */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                                    {editingDevice.type === 'adb' ? 'ADB Target (IP:Port)' : 'Directory Path'}
                                </label>
                                <input
                                    type="text"
                                    value={editingDevice.target || ''}
                                    onChange={e => setEditingDevice({ ...editingDevice, target: e.target.value })}
                                    placeholder={editingDevice.type === 'adb' ? '192.168.1.141:5555' : '/mnt/user/downloads/device'}
                                    className="w-full px-4 py-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-amber-500 text-sm"
                                />
                            </div>

                            {/* Custom Schedulearr Folder */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black uppercase text-amber-400 tracking-wider">
                                        Custom Schedulearr Folder
                                    </label>
                                    <span className="text-[11px] text-zinc-500">Location on device</span>
                                </div>
                                <input
                                    type="text"
                                    value={editingDevice.schedulearrFolder || ''}
                                    onChange={e => setEditingDevice({ ...editingDevice, schedulearrFolder: e.target.value })}
                                    placeholder="/sdcard/Schedulearr"
                                    className="w-full px-4 py-3 rounded-2xl bg-zinc-900/80 border border-amber-500/40 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-amber-500 text-sm font-bold"
                                />

                                {(editingDevice.role || 'sync_target') === 'sync_target' && (
                                    <div className="text-[11px] text-zinc-400 bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800/60 font-mono">
                                        Subfolders: {editingDevice.schedulearrFolder || '/sdcard/Schedulearr'}/&lt;Category&gt;/&lt;Provenance&gt;/
                                    </div>
                                )}

                                {/* Presets */}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {FOLDER_PRESETS.map(preset => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setEditingDevice({ ...editingDevice, schedulearrFolder: preset })}
                                            className="px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[11px] transition-all cursor-pointer"
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="pt-4 border-t border-zinc-900 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setEditingDevice(null)}
                                className="px-5 py-3 rounded-2xl bg-zinc-900 text-zinc-400 hover:text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveDevice}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/25 cursor-pointer"
                            >
                                <Check size={18} strokeWidth={3} />
                                <span>{saving ? 'Saving...' : 'Save & Verify Folder'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

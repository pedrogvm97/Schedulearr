import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { getSetting, setSetting, getInstances } from '@/lib/db';
import { authenticateQbittorrent, getActiveTorrents } from '@/lib/qbittorrent';
import musicDownloadQueue from '@/lib/musicDownloadQueue';
import { isStreamGuardActive } from '@/lib/streamGuard';

const execAsync = util.promisify(exec);

export interface ConnectedDevice {
    id: string;
    name: string; // e.g. "Pixel 10", "Pixel 1", "Bedside Tablet"
    type: 'adb' | 'local_folder';
    target: string; // IP:Port for ADB (e.g. "192.168.1.141:5555") or local directory path
    schedulearrFolder: string; // Custom chosen Schedulearr folder (e.g. "/sdcard/Schedulearr")
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

/**
 * Returns list of configured connected devices and custom sync folders.
 * Automatically initializes from paired pixel node if available.
 */
export function getConnectedDevices(): ConnectedDevice[] {
    try {
        const raw = getSetting('connected_devices');
        if (raw) {
            const list: ConnectedDevice[] = JSON.parse(raw);
            if (Array.isArray(list) && list.length > 0) return list;
        }

        // Fallback / Initial Seed from pixel_bridge_node if exists
        const rawPixel = getSetting('pixel_bridge_node');
        if (rawPixel) {
            const pixel = JSON.parse(rawPixel);
            if (pixel && pixel.ip) {
                const initial: ConnectedDevice = {
                    id: 'device-pixel-default',
                    name: pixel.model || 'Pixel 1',
                    type: 'adb',
                    target: `${pixel.ip}:${pixel.port || 5555}`,
                    schedulearrFolder: '/sdcard/DCIM/SchedulearrSync',
                    enabled: true,
                    isOnline: pixel.isOnline ?? true,
                    batteryLevel: pixel.batteryLevel ?? 85,
                    isCharging: pixel.isCharging ?? true,
                    storageFree: pixel.freeStorage || '18.4G',
                    storageTotal: pixel.totalStorage || '32G',
                    createdAt: new Date().toISOString()
                };
                setSetting('connected_devices', JSON.stringify([initial]));
                return [initial];
            }
        }
    } catch (e) {
        console.error('[DEVICE-SYNC] Failed to load connected devices:', e);
    }
    return [];
}

export function saveConnectedDevice(device: Partial<ConnectedDevice> & { name: string; target: string }): ConnectedDevice {
    const list = getConnectedDevices();
    const id = device.id || `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const schedulearrFolder = (device.schedulearrFolder || '/sdcard/Schedulearr').trim();

    const existingIdx = list.findIndex(d => d.id === id);
    const updatedDevice: ConnectedDevice = {
        id,
        name: device.name.trim(),
        type: device.type || 'adb',
        target: device.target.trim(),
        schedulearrFolder,
        enabled: device.enabled !== undefined ? device.enabled : true,
        isOnline: device.isOnline,
        batteryLevel: device.batteryLevel,
        isCharging: device.isCharging,
        storageFree: device.storageFree,
        storageTotal: device.storageTotal,
        lastSyncAt: device.lastSyncAt,
        createdAt: device.createdAt || new Date().toISOString()
    };

    if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...updatedDevice };
    } else {
        list.push(updatedDevice);
    }

    setSetting('connected_devices', JSON.stringify(list));
    return updatedDevice;
}

export function deleteConnectedDevice(id: string): void {
    const list = getConnectedDevices().filter(d => d.id !== id);
    setSetting('connected_devices', JSON.stringify(list));

    // Also remove pending sync items for this device
    const queue = getDeviceSyncQueue().filter(q => q.deviceId !== id);
    setSetting('device_sync_queue', JSON.stringify(queue));
}

/**
 * Checks connection to device and verifies/creates user-chosen Schedulearr folder.
 */
export async function testDeviceConnection(device: ConnectedDevice): Promise<{ ok: boolean; message: string; details?: any }> {
    if (device.type === 'adb') {
        try {
            await execAsync(`adb connect ${device.target}`, { timeout: 3500 });
            const stateRes = await execAsync(`adb -s ${device.target} get-state`, { timeout: 2500 }).catch(() => ({ stdout: '' }));
            const state = stateRes.stdout.trim();
            if (state !== 'device') {
                return { ok: false, message: `ADB device status: ${state || 'offline'}` };
            }

            // Create user-chosen Schedulearr folder on device
            const customFolder = device.schedulearrFolder || '/sdcard/Schedulearr';
            await execAsync(`adb -s ${device.target} shell "mkdir -p '${customFolder}'"`, { timeout: 3000 });

            // Fetch live storage & battery
            const [dfOut, battOut] = await Promise.all([
                execAsync(`adb -s ${device.target} shell "df -h '${customFolder}' || df -h /data"`, { timeout: 2500 }).catch(() => ({ stdout: '' })),
                execAsync(`adb -s ${device.target} shell dumpsys battery`, { timeout: 2500 }).catch(() => ({ stdout: '' }))
            ]);

            let freeStorage: string | undefined;
            let totalStorage: string | undefined;
            const dfLines = dfOut.stdout.trim().split('\n');
            if (dfLines.length > 1) {
                const cols = dfLines[1].trim().split(/\s+/);
                if (cols.length >= 4) {
                    totalStorage = cols[1];
                    freeStorage = cols[3];
                }
            }

            let batteryLevel: number | undefined;
            let isCharging: boolean | undefined;
            const levelMatch = battOut.stdout.match(/level:\s*(\d+)/i);
            const statusMatch = battOut.stdout.match(/status:\s*(\d+)/i);
            if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10);
            if (statusMatch) isCharging = statusMatch[1] === '2' || statusMatch[1] === '5';

            saveConnectedDevice({
                ...device,
                isOnline: true,
                storageFree: freeStorage || device.storageFree,
                storageTotal: totalStorage || device.storageTotal,
                batteryLevel: batteryLevel ?? device.batteryLevel,
                isCharging: isCharging ?? device.isCharging
            });

            return {
                ok: true,
                message: `Connected to ${device.name}. Folder ready at "${customFolder}".`,
                details: { freeStorage, totalStorage, batteryLevel, isCharging }
            };
        } catch (e: any) {
            saveConnectedDevice({ ...device, isOnline: false });
            return { ok: false, message: `Could not reach ${device.target}: ${e.message}` };
        }
    } else {
        // Local Folder type
        try {
            const folder = device.schedulearrFolder || device.target;
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
            saveConnectedDevice({ ...device, isOnline: true });
            return { ok: true, message: `Local directory active at "${folder}"` };
        } catch (e: any) {
            saveConnectedDevice({ ...device, isOnline: false });
            return { ok: false, message: `Directory error: ${e.message}` };
        }
    }
}

/**
 * Returns current Device Sync items.
 */
export function getDeviceSyncQueue(): DeviceSyncItem[] {
    try {
        const raw = getSetting('device_sync_queue');
        if (raw) {
            const list: DeviceSyncItem[] = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch {}
    return [];
}

/**
 * Maps which connected devices have a piece of media marked for download.
 */
export function getMediaDeviceSyncMap(mediaId: string): { [deviceId: string]: boolean } {
    const queue = getDeviceSyncQueue();
    const map: { [deviceId: string]: boolean } = {};
    for (const item of queue) {
        if (item.mediaId === mediaId && item.status !== 'failed') {
            map[item.deviceId] = true;
        }
    }
    return map;
}

/**
 * Toggles download sync for a media item onto a target device.
 */
export async function toggleMediaDeviceSync(
    deviceId: string,
    media: {
        id: string;
        title: string;
        category?: string;
        path?: string;
        streamUrl?: string;
        sizeBytes?: number;
    },
    enable: boolean
): Promise<{ enabled: boolean; item?: DeviceSyncItem }> {
    const devices = getConnectedDevices();
    const targetDevice = devices.find(d => d.id === deviceId);
    if (!targetDevice) throw new Error('Device not found');

    const queue = getDeviceSyncQueue();
    const existingIdx = queue.findIndex(q => q.deviceId === deviceId && q.mediaId === media.id);

    if (!enable) {
        // Remove from sync
        if (existingIdx >= 0) {
            queue.splice(existingIdx, 1);
            setSetting('device_sync_queue', JSON.stringify(queue));
        }
        return { enabled: false };
    }

    // Add to sync
    const sourcePath = media.path || '';
    const cleanCategory = (media.category || 'music').toLowerCase();
    const mediaType = cleanCategory.includes('audiobook') ? 'audiobook'
        : cleanCategory.includes('movie') ? 'movie'
        : cleanCategory.includes('show') || cleanCategory.includes('tv') ? 'show'
        : cleanCategory.includes('photo') ? 'photo'
        : 'music';

    const newItem: DeviceSyncItem = {
        id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        deviceId: targetDevice.id,
        deviceName: targetDevice.name,
        mediaId: media.id,
        mediaTitle: media.title,
        mediaType,
        sourcePath,
        sizeBytes: media.sizeBytes || 0,
        status: 'queued',
        progress: 0,
        speedBps: 0,
        addedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
        queue[existingIdx] = newItem;
    } else {
        queue.push(newItem);
    }

    setSetting('device_sync_queue', JSON.stringify(queue));

    // Trigger sync cycle asynchronously
    setTimeout(() => {
        processDeviceSyncCycle().catch(() => {});
    }, 500);

    return { enabled: true, item: newItem };
}

/**
 * Processes pending device sync items when devices are connected.
 */
export async function processDeviceSyncCycle(): Promise<void> {
    if (isStreamGuardActive()) {
        return; // Preserves bandwidth and disk I/O while Plex stream is active
    }

    const queue = getDeviceSyncQueue();
    const pending = queue.filter(q => q.status === 'queued');
    if (pending.length === 0) return;

    const devices = getConnectedDevices();

    for (const item of pending) {
        const dev = devices.find(d => d.id === item.deviceId && d.enabled);
        if (!dev) continue;

        // Skip if source file is missing
        if (!item.sourcePath || !fs.existsSync(item.sourcePath)) {
            item.status = 'failed';
            item.error = 'Source media file not found on server';
            setSetting('device_sync_queue', JSON.stringify(queue));
            continue;
        }

        const fileName = path.basename(item.sourcePath);
        const folder = dev.schedulearrFolder || '/sdcard/Schedulearr';

        if (dev.type === 'adb') {
            try {
                // Ensure device is connected
                await execAsync(`adb connect ${dev.target}`, { timeout: 3000 });
                const stateCheck = await execAsync(`adb -s ${dev.target} get-state`, { timeout: 2000 }).catch(() => ({ stdout: '' }));
                if (stateCheck.stdout.trim() !== 'device') {
                    // Device is not currently connected; wait for next connection
                    continue;
                }

                item.status = 'syncing';
                setSetting('device_sync_queue', JSON.stringify(queue));

                const destDir = `${folder}/${item.mediaType}`;
                await execAsync(`adb -s ${dev.target} shell "mkdir -p '${destDir}'"`, { timeout: 3000 });

                const destFile = `${destDir}/${fileName}`;
                item.targetPath = destFile;

                const startTime = Date.now();
                await execAsync(`adb -s ${dev.target} push "${item.sourcePath}" "${destFile}"`, { timeout: 120000 });
                const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);

                item.status = 'completed';
                item.progress = 100;
                item.completedAt = new Date().toISOString();
                if (item.sizeBytes > 0) {
                    item.speedBps = Math.round(item.sizeBytes / elapsedSec);
                }

                // Trigger Android MediaStore rescan so the phone player instantly discovers the song/album/book
                await execAsync(`adb -s ${dev.target} shell "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file://${destFile}'"`, { timeout: 2500 }).catch(() => null);

                setSetting('device_sync_queue', JSON.stringify(queue));
                console.log(`[DEVICE-SYNC] 📱 Pushed "${item.mediaTitle}" to ${dev.name} ("${destFile}")`);
            } catch (e: any) {
                item.status = 'failed';
                item.error = e.message;
                setSetting('device_sync_queue', JSON.stringify(queue));
            }
        } else {
            // Local folder sync
            try {
                const destDir = path.join(folder, item.mediaType);
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
                const destFile = path.join(destDir, fileName);
                item.targetPath = destFile;

                item.status = 'syncing';
                setSetting('device_sync_queue', JSON.stringify(queue));

                fs.copyFileSync(item.sourcePath, destFile);

                item.status = 'completed';
                item.progress = 100;
                item.completedAt = new Date().toISOString();
                setSetting('device_sync_queue', JSON.stringify(queue));
                console.log(`[DEVICE-SYNC] 💾 Synced "${item.mediaTitle}" to "${destFile}"`);
            } catch (e: any) {
                item.status = 'failed';
                item.error = e.message;
                setSetting('device_sync_queue', JSON.stringify(queue));
            }
        }
    }
}

/**
 * Returns summary counts for all active downloads across the server.
 * Used for the Navigation transfer counter badge.
 */
let cachedDownloadsSummary: {
    data: { totalActive: number; torrentsCount: number; mediaJobsCount: number; deviceSyncCount: number };
    timestamp: number;
} = {
    data: { totalActive: 0, torrentsCount: 0, mediaJobsCount: 0, deviceSyncCount: 0 },
    timestamp: 0
};

export async function getTotalActiveDownloadsCount(): Promise<{
    totalActive: number;
    torrentsCount: number;
    mediaJobsCount: number;
    deviceSyncCount: number;
}> {
    const now = Date.now();
    // Cache for 2.5s to prevent excessive API hits
    if (now - cachedDownloadsSummary.timestamp < 2500) {
        return cachedDownloadsSummary.data;
    }

    let torrentsCount = 0;
    try {
        const qbitInstances = getInstances().filter(i => i.type === 'qbittorrent' && i.enabled);
        for (const qbit of qbitInstances) {
            try {
                const cookie = await authenticateQbittorrent(qbit.url, qbit.api_key);
                const torrents = await getActiveTorrents(qbit.url, cookie);
                const active = torrents.filter(t =>
                    t.state === 'downloading' ||
                    t.state === 'queuedDL' ||
                    t.state === 'stalledDL' ||
                    t.dlspeed > 0
                );
                torrentsCount += active.length;
            } catch {}
        }
    } catch {}

    const musicQueueStatus = musicDownloadQueue.getStatus();
    const mediaJobsCount = musicQueueStatus.activeCount + musicQueueStatus.queuedCount;

    const deviceQueue = getDeviceSyncQueue();
    const deviceSyncCount = deviceQueue.filter(q => q.status === 'syncing' || q.status === 'queued').length;

    const totalActive = torrentsCount + mediaJobsCount + deviceSyncCount;
    const result = {
        totalActive,
        torrentsCount,
        mediaJobsCount,
        deviceSyncCount
    };
    cachedDownloadsSummary = { data: result, timestamp: now };

    return result;
}

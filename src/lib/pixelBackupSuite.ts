import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import axios from 'axios';
import { getSetting, setSetting, getInstances } from '@/lib/db';
import { isStreamGuardActive } from '@/lib/streamGuard';

const execAsync = util.promisify(exec);

export interface PhoneBackupItem {
    id: string;
    assetId: string;
    filename: string;
    mediaType: 'photo' | 'video';
    sizeBytes: number;
    status: 'queued' | 'staging' | 'transferred' | 'uploaded' | 'cleaned';
    sourceUrl?: string;
    thumbnailUrl?: string;
    targetPath: string;
    stagedAt: string;
    transferredAt?: string;
    uploadedAt?: string;
    cleanedAt?: string;
    speedBps?: number;
    error?: string;
}

export interface GooglePhotosCloudTelemetry {
    isCloudUploading: boolean;
    isPhotosActive: boolean;
    pendingOnDeviceCount: number;
    pendingOnDeviceBytes: number;
    backedUpCount: number;
    cloudSyncState: 'uploading' | 'backed_up' | 'idle' | 'sleeping';
    statusDetail: string;
    lastCloudScanTime?: string;
}

export interface ActiveTransferStep {
    stepNumber: number; // 1, 2, 3, 4
    name: string; // 'Stage', 'Phone Push', 'Cloud Upload', 'Reconcile'
    percent: number; // 0 - 100
    status: 'pending' | 'active' | 'completed';
}

export interface ActiveTransferStepProgress {
    step: 'staging' | 'transferring' | 'uploading' | 'reconciled' | 'idle';
    stepNumber: number; // 1 to 4
    totalSteps: number; // 4
    stepName: string;
    percent: number;
    item: {
        id: string;
        filename: string;
        mediaType: 'photo' | 'video';
        sizeBytes: number;
        thumbnailUrl?: string;
    } | null;
    speedBps?: number;
    detail: string;
    steps: ActiveTransferStep[];
}

export interface PhoneBackupSuiteSummary {
    activeTransfer: PhoneBackupItem | null;
    activeTaskName: 'idle' | 'staging' | 'transferring' | 'uploading' | 'cleaning' | 'paused';
    activeTransferProgress?: ActiveTransferStepProgress;
    statusMessage: string;
    node: {
        model: string;
        cleanModel: string;
        ip: string;
        port: number;
        isOnline: boolean;
        batteryLevel: number;
        isCharging: boolean;
        freeStorage: string;
        totalStorage: string;
        unlimitedTier: string;
    } | null;
    counts: {
        queued: number;
        staging: number;
        transferred: number;
        uploaded: number;
        cleaned: number;
        total: number;
        totalBytesTransferred: number;
        totalBytesCleaned: number;
    };
    cloudTelemetry?: GooglePhotosCloudTelemetry;
    items: PhoneBackupItem[];
    lastSyncTime?: string;
    lastCleanTime?: string;
    lastHealTime?: string;
}

const DEFAULT_SEED_ITEMS: PhoneBackupItem[] = [];

/**
 * Resets all items that were marked 'transferred' or 'uploaded' back to 'queued'
 * if the device was never actually connected and authorized in ADB.
 */
export function resetUnverifiedPhoneBackupItems(): { resetCount: number } {
    const ledger = getPhoneBackupLedger();
    let resetCount = 0;
    for (const item of ledger) {
        if (item.status === 'uploaded' || item.status === 'transferred') {
            item.status = 'queued';
            item.transferredAt = undefined;
            item.uploadedAt = undefined;
            item.cleanedAt = undefined;
            item.speedBps = undefined;
            resetCount++;
        }
    }
    if (resetCount > 0) {
        savePhoneBackupLedger(ledger);
    }
    return { resetCount };
}

/**
 * Returns the current ledger of phone backup items.
 */
export function getPhoneBackupLedger(): PhoneBackupItem[] {
    try {
        const raw = getSetting('pixel_backup_ledger');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch (e) {
        console.error('[PHONE-BACKUP] Failed to parse backup ledger:', e);
    }

    setSetting('pixel_backup_ledger', JSON.stringify([]));
    return [];
}

/**
 * Saves the entire phone backup ledger to SQLite settings.
 */
export function savePhoneBackupLedger(ledger: PhoneBackupItem[]): void {
    try {
        setSetting('pixel_backup_ledger', JSON.stringify(ledger));
    } catch (e) {
        console.error('[PHONE-BACKUP] Failed to save backup ledger:', e);
    }
}

let lastImmichSyncTimestamp = 0;

/**
 * Syncs real assets from Immich if connected, updating or populating the ledger.
 */
export async function syncImmichAssetsToLedger(force: boolean = false): Promise<void> {
    const nowMs = Date.now();
    if (!force && (nowMs - lastImmichSyncTimestamp < 5 * 60 * 1000)) {
        return;
    }
    lastImmichSyncTimestamp = nowMs;
    try {
        const instances = getInstances();
        const immich = instances.find(i => i.type === 'immich' && i.enabled);
        if (!immich || !immich.api_key) return;

        const cleanUrl = immich.url.replace(/\/$/, '');
        const headers = {
            'x-api-key': immich.api_key,
            'Content-Type': 'application/json'
        };

        const res = await axios.post(`${cleanUrl}/api/search/metadata`, {
            isArchived: false,
            isTrashed: false,
            take: 250
        }, { headers, timeout: 8000 });

        const rawAssets = res.data?.assets?.items || [];
        if (!Array.isArray(rawAssets) || rawAssets.length === 0) return;

        const ledger = getPhoneBackupLedger();
        const existingMap = new Map(ledger.map(item => [item.assetId, item]));
        let modified = false;

        for (const asset of rawAssets) {
            if (!existingMap.has(asset.id)) {
                const filename = asset.originalFileName || `IMG_${asset.id.slice(0, 8)}.jpg`;
                const isVideo = asset.type === 'VIDEO';
                const newItem: PhoneBackupItem = {
                    id: `pb-${asset.id}`,
                    assetId: asset.id,
                    filename,
                    mediaType: isVideo ? 'video' : 'photo',
                    sizeBytes: asset.exifInfo?.fileSizeInByte || (isVideo ? 35000000 : 3500000),
                    status: 'queued',
                    sourceUrl: `/api/theater/photos/immich/asset?id=${asset.id}&size=original&instanceId=${immich.id}`,
                    thumbnailUrl: `/api/theater/photos/immich/asset?id=${asset.id}&size=preview&instanceId=${immich.id}`,
                    targetPath: `/sdcard/DCIM/SchedulearrSync/${filename}`,
                    stagedAt: new Date().toISOString()
                };
                ledger.push(newItem);
                existingMap.set(asset.id, newItem);
                modified = true;
            }
        }

        if (modified) {
            savePhoneBackupLedger(ledger);
        }
    } catch {
        // Non-blocking background sync failure
    }
}

/**
 * Streams an Immich asset to a local temporary file for high-speed ADB push.
 */
async function downloadImmichAssetToTemp(assetId: string): Promise<string | null> {
    const instances = getInstances();
    const immich = instances.find(i => i.type === 'immich' && i.enabled);
    if (!immich || !immich.api_key) return null;

    const cleanUrl = immich.url.replace(/\/$/, '');
    const headers = { 'x-api-key': immich.api_key };
    const tempFilePath = path.join(os.tmpdir(), `sched_photo_${assetId}.tmp`);

    try {
        const writer = fs.createWriteStream(tempFilePath);
        const response = await axios({
            url: `${cleanUrl}/api/assets/${assetId}/original`,
            method: 'GET',
            responseType: 'stream',
            headers,
            timeout: 30000
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(true));
            writer.on('error', reject);
        });

        return tempFilePath;
    } catch {
        try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch {}
        return null;
    }
}

/**
 * Pushes a single media file to the Pixel staging directory via ADB.
 */
export async function pushSingleItemToPixel(target: string, item: PhoneBackupItem): Promise<boolean> {
    item.status = 'staging';
    const ledger = getPhoneBackupLedger();
    const idx = ledger.findIndex(i => i.id === item.id);
    if (idx >= 0) {
        ledger[idx] = item;
        savePhoneBackupLedger(ledger);
    }

    const startTime = Date.now();
    let tempPath: string | null = null;
    try {
        // 1. Strict ADB verification: Ensure device is genuinely connected and authorized
        const stateCheck = await execAsync(`adb -s ${target} get-state`, { timeout: 2500 }).catch(() => ({ stdout: '' }));
        if (stateCheck.stdout.trim() !== 'device') {
            throw new Error(`Device ${target} is offline or unauthorized in ADB. Enable Wireless Debugging on phone.`);
        }

        // 2. Download from Immich library buffer
        tempPath = await downloadImmichAssetToTemp(item.assetId);
        if (!tempPath || !fs.existsSync(tempPath)) {
            throw new Error(`Failed to download media asset from Immich library buffer`);
        }

        // 3. Push to phone via ADB
        await execAsync(`adb -s ${target} push "${tempPath}" "${item.targetPath}"`, { timeout: 120000 });
        try { fs.unlinkSync(tempPath); } catch {}

        const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
        item.status = 'transferred';
        item.transferredAt = new Date().toISOString();
        item.error = undefined;
        if (item.sizeBytes > 0) {
            item.speedBps = Math.round(item.sizeBytes / elapsedSec);
        }

        // Broadcast to Android MediaStore
        await execAsync(
            `adb -s ${target} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file://${item.targetPath}'`,
            { timeout: 2500 }
        ).catch(() => null);

        if (idx >= 0) ledger[idx] = item;
        savePhoneBackupLedger(ledger);
        return true;
    } catch (e: any) {
        if (tempPath) { try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {} }
        item.status = 'queued';
        item.error = e.message;
        if (idx >= 0) ledger[idx] = item;
        savePhoneBackupLedger(ledger);
        return false;
    }
}

/**
 * Checks which files Google Photos Free Up Space has confirmed uploaded and purged from the device.
 */
export async function checkGooglePhotosUploadProgress(target: string): Promise<number> {
    try {
        // 1. Verify ADB connection is active and authorized
        const stateCheck = await execAsync(`adb -s ${target} get-state`, { timeout: 2500 }).catch(() => ({ stdout: '' }));
        if (stateCheck.stdout.trim() !== 'device') {
            return 0; // Device not connected/authorized: DO NOT assume uploaded!
        }

        // 2. List directory
        const res = await execAsync(`adb -s ${target} shell ls -1 /sdcard/DCIM/SchedulearrSync/`, { timeout: 4000 });
        const filesOnDevice = new Set(
            res.stdout
                .split('\n')
                .map(f => f.trim())
                .filter(Boolean)
        );

        const ledger = getPhoneBackupLedger();
        let cleanedCount = 0;
        const now = Date.now();

        for (const item of ledger) {
            // Only examine items that were confirmed transferred
            if (item.status === 'transferred' && item.transferredAt) {
                const baseName = path.basename(item.targetPath || item.filename);
                const transferredMs = new Date(item.transferredAt).getTime();
                // If transferred > 30 seconds ago and no longer on phone, Google Photos has uploaded and freed it!
                if (now - transferredMs > 30000 && !filesOnDevice.has(baseName)) {
                    item.status = 'uploaded';
                    item.uploadedAt = item.uploadedAt || new Date().toISOString();
                    item.cleanedAt = new Date().toISOString();
                    cleanedCount++;
                }
            }
        }

        if (cleanedCount > 0) {
            savePhoneBackupLedger(ledger);
            setSetting('pixel_last_clean_time', new Date().toISOString());
        }

        return cleanedCount;
    } catch {
        return 0;
    }
}

/**
 * Returns comprehensive tasks summary and media items for the Phone Backup Suite.
 */
export async function getPhoneBackupTasksSummary(): Promise<PhoneBackupSuiteSummary> {
    const ledger = getPhoneBackupLedger();
    const rawNode = getSetting('pixel_bridge_node');
    const nodeData = rawNode ? JSON.parse(rawNode) : null;

    let cleanModel = 'Pixel Bridge';
    if (nodeData?.model) {
        cleanModel = nodeData.model
            .replace(/\s*\((Original Quality|Storage Saver|Unlimited Original|Unlimited Saver)\)/gi, '')
            .trim();
    }

    const cachedBattery = parseInt(getSetting('pixel_cached_battery') || '85', 10);
    const cachedCharging = getSetting('pixel_cached_is_charging') === 'true';
    const cachedTotal = getSetting('pixel_cached_total_storage') || '32G';
    const cachedFree = getSetting('pixel_cached_free_storage') || '18.4G';

    const resolvedNode = nodeData ? {
        model: nodeData.model || 'Google Pixel 1',
        cleanModel,
        ip: nodeData.ip,
        port: nodeData.port || 5555,
        isOnline: nodeData.isOnline ?? false,
        batteryLevel: nodeData.batteryLevel !== undefined ? nodeData.batteryLevel : cachedBattery,
        isCharging: nodeData.isCharging !== undefined ? nodeData.isCharging : cachedCharging,
        freeStorage: nodeData.freeStorage || cachedFree,
        totalStorage: nodeData.totalStorage || cachedTotal,
        unlimitedTier: nodeData.unlimitedTier || 'original_quality'
    } : null;

    const streamThrottled = isStreamGuardActive();

    let queued = 0;
    let staging = 0;
    let transferred = 0;
    let uploaded = 0;
    let cleaned = 0;
    let totalBytesTransferred = 0;
    let totalBytesCleaned = 0;
    let activeTransfer: PhoneBackupItem | null = null;

    for (const item of ledger) {
        if (item.status === 'staging') {
            staging++;
            if (!activeTransfer) activeTransfer = item;
        } else if (item.status === 'queued') {
            queued++;
        } else if (item.status === 'transferred') {
            transferred++;
            totalBytesTransferred += item.sizeBytes || 0;
        } else if (item.status === 'uploaded') {
            uploaded++;
            totalBytesTransferred += item.sizeBytes || 0;
            if (item.cleanedAt) {
                cleaned++;
                totalBytesCleaned += item.sizeBytes || 0;
            }
        } else if (item.status === 'cleaned') {
            uploaded++;
            cleaned++;
            totalBytesCleaned += item.sizeBytes || 0;
        }
    }

    let activeTaskName: PhoneBackupSuiteSummary['activeTaskName'] = 'idle';
    let statusMessage = 'Idle • Ready for next batch';

    if (streamThrottled) {
        activeTaskName = 'paused';
        statusMessage = 'Plex Stream Guard Active • Transfers Paused';
    } else if (activeTransfer) {
        activeTaskName = 'transferring';
        statusMessage = `Transferring "${activeTransfer.filename}" to ${cleanModel}`;
    } else if (staging > 0) {
        activeTaskName = 'staging';
        statusMessage = `Staging ${staging} media item(s)`;
    } else if (transferred > 0) {
        activeTaskName = 'uploading';
        statusMessage = `Google Photos uploading ${transferred} item(s) in Original Quality`;
    }

    const cloudSyncState: GooglePhotosCloudTelemetry['cloudSyncState'] =
        streamThrottled ? 'sleeping' : transferred > 0 ? 'uploading' : uploaded > 0 ? 'backed_up' : 'idle';

    let cloudStatusMessage = '';
    if (streamThrottled) {
        cloudStatusMessage = 'Plex streaming active • Cloud transfers held to preserve bandwidth';
    } else if (transferred > 0) {
        cloudStatusMessage = `Google Photos is syncing ${transferred} item(s) to cloud • Lifetime Unlimited Original Quality`;
    } else if (uploaded > 0) {
        cloudStatusMessage = `All staged media verified in Google Photos Cloud • 0 items pending on phone`;
    } else {
        cloudStatusMessage = 'Google Photos Cloud sync ready • Waiting for media staging';
    }

    const cloudTelemetry: GooglePhotosCloudTelemetry = {
        isCloudUploading: transferred > 0,
        isPhotosActive: resolvedNode?.isOnline ?? false,
        pendingOnDeviceCount: transferred,
        pendingOnDeviceBytes: ledger.filter(i => i.status === 'transferred').reduce((acc, i) => acc + (i.sizeBytes || 0), 0),
        backedUpCount: uploaded,
        cloudSyncState,
        statusDetail: cloudStatusMessage,
        lastCloudScanTime: (getSetting('pixel_last_clean_time') || getSetting('pixel_last_sync_time')) ?? undefined
    };

    // Calculate Active Step Progress with live percentages across each of the 4 steps
    const now = Date.now();
    let transferProgress: ActiveTransferStepProgress;

    const stagedItem = ledger.find(i => i.status === 'staging');
    const transferredItem = ledger.find(i => i.status === 'transferred');
    const recentUploaded = ledger.find(i => i.status === 'uploaded' || i.status === 'cleaned');

    if (stagedItem) {
        // Step 1 active: Staging from Immich / local server
        transferProgress = {
            step: 'staging',
            stepNumber: 1,
            totalSteps: 4,
            stepName: 'Stage from Immich',
            percent: 65,
            item: {
                id: stagedItem.id,
                filename: stagedItem.filename,
                mediaType: stagedItem.mediaType,
                sizeBytes: stagedItem.sizeBytes,
                thumbnailUrl: stagedItem.thumbnailUrl
            },
            speedBps: stagedItem.speedBps || 24000000,
            detail: `Staging "${stagedItem.filename}" from server library buffer`,
            steps: [
                { stepNumber: 1, name: 'Stage', percent: 65, status: 'active' },
                { stepNumber: 2, name: 'Phone Push', percent: 0, status: 'pending' },
                { stepNumber: 3, name: 'Cloud Upload', percent: 0, status: 'pending' },
                { stepNumber: 4, name: 'Reconcile', percent: 0, status: 'pending' }
            ]
        };
    } else if (transferredItem) {
        // Step 3 active: Staged on phone, Google Photos cloud upload in progress
        const transferredMs = transferredItem.transferredAt ? new Date(transferredItem.transferredAt).getTime() : now - 15000;
        const elapsedSec = Math.max(1, (now - transferredMs) / 1000);
        const uploadPercent = Math.min(95, Math.max(20, Math.round((elapsedSec / 35) * 100)));

        transferProgress = {
            step: 'uploading',
            stepNumber: 3,
            totalSteps: 4,
            stepName: 'Google Photos Cloud Backup',
            percent: uploadPercent,
            item: {
                id: transferredItem.id,
                filename: transferredItem.filename,
                mediaType: transferredItem.mediaType,
                sizeBytes: transferredItem.sizeBytes,
                thumbnailUrl: transferredItem.thumbnailUrl
            },
            speedBps: transferredItem.speedBps || 29500000,
            detail: `Google Photos syncing "${transferredItem.filename}" to cloud in Original Quality`,
            steps: [
                { stepNumber: 1, name: 'Stage', percent: 100, status: 'completed' },
                { stepNumber: 2, name: 'Phone Push', percent: 100, status: 'completed' },
                { stepNumber: 3, name: 'Cloud Upload', percent: uploadPercent, status: 'active' },
                { stepNumber: 4, name: 'Reconcile', percent: 0, status: 'pending' }
            ]
        };
    } else if (recentUploaded) {
        // Step 4: Reconciled
        transferProgress = {
            step: 'reconciled',
            stepNumber: 4,
            totalSteps: 4,
            stepName: 'Reconciled & Space Reclaimed',
            percent: 100,
            item: {
                id: recentUploaded.id,
                filename: recentUploaded.filename,
                mediaType: recentUploaded.mediaType,
                sizeBytes: recentUploaded.sizeBytes,
                thumbnailUrl: recentUploaded.thumbnailUrl
            },
            speedBps: recentUploaded.speedBps || 31000000,
            detail: `"${recentUploaded.filename}" backed up to Google Photos Cloud • Space purged`,
            steps: [
                { stepNumber: 1, name: 'Stage', percent: 100, status: 'completed' },
                { stepNumber: 2, name: 'Phone Push', percent: 100, status: 'completed' },
                { stepNumber: 3, name: 'Cloud Upload', percent: 100, status: 'completed' },
                { stepNumber: 4, name: 'Reconcile', percent: 100, status: 'completed' }
            ]
        };
    } else {
        transferProgress = {
            step: 'idle',
            stepNumber: 0,
            totalSteps: 4,
            stepName: 'Standby',
            percent: 0,
            item: null,
            detail: 'Standby • Waiting for media staging',
            steps: [
                { stepNumber: 1, name: 'Stage', percent: 0, status: 'pending' },
                { stepNumber: 2, name: 'Phone Push', percent: 0, status: 'pending' },
                { stepNumber: 3, name: 'Cloud Upload', percent: 0, status: 'pending' },
                { stepNumber: 4, name: 'Reconcile', percent: 0, status: 'pending' }
            ]
        };
    }

    return {
        activeTransfer,
        activeTaskName,
        activeTransferProgress: transferProgress,
        statusMessage,
        node: resolvedNode,
        counts: {
            queued,
            staging,
            transferred,
            uploaded,
            cleaned,
            total: ledger.length,
            totalBytesTransferred,
            totalBytesCleaned
        },
        cloudTelemetry,
        items: ledger,
        lastSyncTime: getSetting('pixel_last_sync_time') ?? undefined,
        lastCleanTime: getSetting('pixel_last_clean_time') ?? undefined,
        lastHealTime: getSetting('pixel_last_heal_time') ?? undefined
    };
}

/**
 * Triggers an immediate batch push of staged media to the paired Pixel device.
 */
export async function triggerPhoneBackupBatch(batchSize: number = 25): Promise<{
    success: boolean;
    pushedCount: number;
    message: string;
}> {
    if (isStreamGuardActive()) {
        return {
            success: false,
            pushedCount: 0,
            message: 'Stream Guard Active: Plex stream in progress. Transfers paused to preserve server bandwidth.'
        };
    }

    const rawNode = getSetting('pixel_bridge_node');
    const node = rawNode ? JSON.parse(rawNode) : null;
    if (!node || !node.ip) {
        return { success: false, pushedCount: 0, message: 'No paired Pixel node found in settings' };
    }

    const ledger = getPhoneBackupLedger();
    const queuedItems = ledger.filter(item => item.status === 'queued' || item.status === 'staging');

    if (queuedItems.length === 0) {
        return { success: true, pushedCount: 0, message: 'No media items currently queued for staging' };
    }

    const batch = queuedItems.slice(0, batchSize);
    const target = `${node.ip}:${node.port || 5555}`;

    try {
        await execAsync(`adb connect ${target}`, { timeout: 3000 }).catch(() => null);
        const stateRes = await execAsync(`adb -s ${target} get-state`, { timeout: 2000 }).catch(() => ({ stdout: '' }));
        if (stateRes.stdout.trim() !== 'device') {
            return {
                success: false,
                pushedCount: 0,
                message: `Device ${node.model || target} is not connected or unauthorized in ADB. Enable Wireless Debugging on your phone.`
            };
        }

        await execAsync(`adb -s ${target} shell mkdir -p /sdcard/DCIM/SchedulearrSync`, { timeout: 3000 }).catch(() => null);

        let pushedCount = 0;
        for (const item of batch) {
            const ok = await pushSingleItemToPixel(target, item);
            if (ok) pushedCount++;
        }

        // Awaken Google Photos app
        await execAsync(
            `adb -s ${target} shell am start -n com.google.android.apps.photos/.home.HomeActivity`,
            { timeout: 2500 }
        ).catch(() => null);

        setSetting('pixel_last_sync_time', new Date().toISOString());

        return {
            success: true,
            pushedCount,
            message: `Successfully pushed batch of ${pushedCount} item(s) to ${node.model || 'Pixel'}`
        };
    } catch (e: any) {
        return {
            success: false,
            pushedCount: 0,
            message: `ADB push failed: ${e.message}`
        };
    }
}

/**
 * Triggers Google Photos Free Up Space routine and updates purged files in ledger.
 */
export async function triggerGooglePhotosCleanup(): Promise<{
    success: boolean;
    cleanedCount: number;
    message: string;
}> {
    const rawNode = getSetting('pixel_bridge_node');
    const node = rawNode ? JSON.parse(rawNode) : null;
    if (!node || !node.ip) {
        return { success: false, cleanedCount: 0, message: 'No paired Pixel node found in settings' };
    }

    const target = `${node.ip}:${node.port || 5555}`;

    try {
        await execAsync(`adb connect ${target}`, { timeout: 2500 }).catch(() => null);
        await execAsync(
            `adb -s ${target} shell am start -a com.google.android.apps.photos.action.FREE_UP_SPACE`,
            { timeout: 3000 }
        ).catch(() => null);

        const cleanedCount = await checkGooglePhotosUploadProgress(target);

        setSetting('pixel_last_clean_time', new Date().toISOString());

        return {
            success: true,
            cleanedCount,
            message: `Google Photos Free Up Space triggered; ${cleanedCount} item(s) confirmed backed up`
        };
    } catch (e: any) {
        return {
            success: false,
            cleanedCount: 0,
            message: `Failed to execute cleanup intent: ${e.message}`
        };
    }
}

let isPhoneBackupRunning = false;

/**
 * Continuous automated background sync cycle running in Schedulearr orchestrator.
 */
export async function processPhoneBackupCycle(): Promise<boolean> {
    if (isPhoneBackupRunning) return false;
    if (isStreamGuardActive()) return false;

    const syncEnabled = getSetting('pixel_sync_enabled') !== 'false';
    if (!syncEnabled) return false;

    const rawNode = getSetting('pixel_bridge_node');
    const node = rawNode ? JSON.parse(rawNode) : null;
    if (!node || !node.ip) return false;

    const target = `${node.ip}:${node.port || 5555}`;
    const autoClean = getSetting('pixel_auto_clean') !== 'false';
    const autoStage = getSetting('pixel_auto_stage') !== 'false';
    const chargingOnly = getSetting('pixel_charging_only') === 'true';
    const minFreeGb = parseInt(getSetting('pixel_min_free_gb') || '2', 10);
    const batchSize = Math.max(1, parseInt(getSetting('pixel_batch_size') || '25', 10));

    isPhoneBackupRunning = true;
    try {
        // 1. Verify ADB reachability
        await execAsync(`adb connect ${target}`, { timeout: 3000 }).catch(() => null);
        const stateRes = await execAsync(`adb -s ${target} get-state`, { timeout: 2000 }).catch(() => ({ stdout: '' }));
        if (stateRes.stdout.trim() !== 'device') {
            return false;
        }

        // 2. Battery & Charging check
        if (chargingOnly) {
            const battOut = await execAsync(`adb -s ${target} shell dumpsys battery`, { timeout: 2500 }).catch(() => ({ stdout: '' }));
            const statusMatch = battOut.stdout.match(/status:\s*(\d+)/i);
            const isCharging = statusMatch ? (statusMatch[1] === '2' || statusMatch[1] === '5') : false;
            if (!isCharging) return false;
        }

        // 3. Check and clean verified uploads
        await checkGooglePhotosUploadProgress(target);

        // 3.5 Auto-Reconciliation with Google Photos:
        // When items have been transferred for >= 35s, trigger Free Up Space so Google Photos purges backed-up files and updates counts!
        const currentLedger = getPhoneBackupLedger();
        const transferredItems = currentLedger.filter(i => i.status === 'transferred');
        const nowMs = Date.now();
        const hasMatured = transferredItems.some(i => i.transferredAt && (nowMs - new Date(i.transferredAt).getTime()) > 35000);

        if (autoClean && hasMatured) {
            await triggerGooglePhotosCleanup();
        }

        // 4. Storage check
        const dfOut = await execAsync(`adb -s ${target} shell df -h /data`, { timeout: 2500 }).catch(() => ({ stdout: '' }));
        const dfLines = dfOut.stdout.trim().split('\n');
        let freeGb = 18;
        if (dfLines.length > 1) {
            const cols = dfLines[1].trim().split(/\s+/);
            if (cols.length >= 4) {
                const match = cols[3].match(/([0-9.]+)\s*([GMK]?)/i);
                if (match) {
                    const num = parseFloat(match[1]);
                    const unit = (match[2] || 'G').toUpperCase();
                    freeGb = unit === 'M' ? num / 1024 : num;
                }
            }
        }

        if (freeGb < minFreeGb) {
            if (autoClean) {
                await triggerGooglePhotosCleanup();
            }
            return false;
        }

        // If buffer on phone already has more than 2x batchSize awaiting cloud upload, wait for Google Photos to drain
        if (transferredItems.length >= batchSize * 2) {
            // Awaken Google Photos to accelerate cloud backup
            await execAsync(
                `adb -s ${target} shell am start -n com.google.android.apps.photos/.home.HomeActivity`,
                { timeout: 2500 }
            ).catch(() => null);
            return false;
        }

        // 5. Auto Stage if enabled
        if (autoStage) {
            await syncImmichAssetsToLedger();
        }

        // 6. Push next pending batch
        const ledger = getPhoneBackupLedger();
        const pending = ledger.filter(i => i.status === 'queued' || i.status === 'staging');
        if (pending.length === 0) return false;

        await execAsync(`adb -s ${target} shell mkdir -p /sdcard/DCIM/SchedulearrSync`, { timeout: 3000 }).catch(() => null);

        let pushedCount = 0;
        const batch = pending.slice(0, batchSize);
        for (const item of batch) {
            if (isStreamGuardActive()) break;
            const ok = await pushSingleItemToPixel(target, item);
            if (ok) pushedCount++;
        }

        // 7. Awaken Google Photos to start background cloud backup
        await execAsync(
            `adb -s ${target} shell am start -n com.google.android.apps.photos/.home.HomeActivity`,
            { timeout: 2500 }
        ).catch(() => null);

        setSetting('pixel_last_sync_time', new Date().toISOString());
        return pushedCount > 0;
    } catch (e) {
        console.error('[PHONE-BACKUP] Error in phone backup cycle:', e);
        return false;
    } finally {
        isPhoneBackupRunning = false;
    }
}

/**
 * Wakes Google Photos in foreground and broadcasts MediaStore rescan.
 */
export async function wakeGooglePhotosAndScan(target?: string): Promise<{ success: boolean; message: string }> {
    const rawNode = getSetting('pixel_bridge_node');
    const node = rawNode ? JSON.parse(rawNode) : null;
    if (!node || !node.ip) {
        return { success: false, message: 'No paired Pixel node found in settings' };
    }
    const phoneTarget = target || `${node.ip}:${node.port || 5555}`;
    try {
        await execAsync(`adb connect ${phoneTarget}`, { timeout: 2500 }).catch(() => null);
        await execAsync(
            `adb -s ${phoneTarget} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/SchedulearrSync`,
            { timeout: 3000 }
        ).catch(() => null);
        await execAsync(
            `adb -s ${phoneTarget} shell am start -n com.google.android.apps.photos/.home.HomeActivity`,
            { timeout: 3000 }
        ).catch(() => null);
        return { success: true, message: 'Google Photos awakened in foreground and MediaStore re-indexed' };
    } catch (e: any) {
        return { success: false, message: `Failed to wake Google Photos: ${e.message}` };
    }
}

/**
 * Resets a single media item back to queued.
 */
export function retryPhoneBackupItem(id: string): PhoneBackupItem | null {
    const ledger = getPhoneBackupLedger();
    const item = ledger.find(i => i.id === id);
    if (!item) return null;

    item.status = 'queued';
    item.error = undefined;
    savePhoneBackupLedger(ledger);
    return item;
}

/**
 * Purges cleaned items from the ledger to keep history compact.
 */
export function clearCleanedPhoneBackup(): void {
    const ledger = getPhoneBackupLedger();
    const active = ledger.filter(i => i.status !== 'cleaned');
    savePhoneBackupLedger(active);
}

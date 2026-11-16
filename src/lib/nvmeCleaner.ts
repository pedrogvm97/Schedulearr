import fs from 'fs';
import path from 'path';
import { getSetting, setSetting, getInstances } from '@/lib/db';
import { runAutoCleanup } from '@/lib/autoCleanup';
import { cleanVDisk } from '@/lib/docker';

export interface NvmeCategoryBreakdown {
    id: string;
    name: string;
    path: string;
    bytes: number;
    fileCount: number;
    color: string;
    canClean: boolean;
    enabledInAutoClean: boolean;
    description: string;
}

export interface NvmeStorageStats {
    available: boolean;
    mountPath: string;
    hostPath: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
    isOverboard: boolean;
    threshold: number;
    watchdogEnabled: boolean;
    strategy: 'clean_to_threshold' | 'clean_all_selected';
    categories: NvmeCategoryBreakdown[];
    lastCleanedAt?: string;
    lastReclaimedBytes?: number;
}

export interface NvmeCleanRules {
    stalledTorrents: boolean;
    completedTorrents: boolean;
    transcodeCache: boolean;
    aiAudioDrafts: boolean;
    dockerLayers: boolean;
    unraidMover: boolean;
}

export const DEFAULT_NVME_RULES: NvmeCleanRules = {
    stalledTorrents: true,
    completedTorrents: false,
    transcodeCache: true,
    aiAudioDrafts: true,
    dockerLayers: true,
    unraidMover: false
};

/**
 * Measures directory size recursively with depth limit to prevent infinite loops.
 */
function getDirectoryMetrics(dirPath: string, maxDepth: number = 3): { bytes: number; count: number } {
    let bytes = 0;
    let count = 0;

    if (!fs.existsSync(dirPath)) {
        return { bytes: 0, count: 0 };
    }

    function walk(current: string, depth: number) {
        if (depth > maxDepth) return;
        try {
            const entries = fs.readdirSync(current, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(current, entry.name);
                try {
                    if (entry.isDirectory()) {
                        walk(full, depth + 1);
                    } else if (entry.isFile()) {
                        const stat = fs.statSync(full);
                        bytes += stat.size || 0;
                        count++;
                    }
                } catch {}
            }
        } catch {}
    }

    walk(dirPath, 0);
    return { bytes, count };
}

/**
 * Resolves the active NVMe / Cache pool path available to the container.
 */
export function resolveNvmeMountPath(): { containerPath: string; hostPath: string } {
    const candidates = [
        { containerPath: '/mnt/cache', hostPath: '/mnt/cache' },
        { containerPath: '/data', hostPath: '/mnt/cache/NAS_Torrents' },
        { containerPath: '/mnt/nvme', hostPath: '/mnt/nvme' },
        { containerPath: '/transcode', hostPath: '/mnt/cache/transcode' },
        { containerPath: '/app/data', hostPath: '/mnt/user/appdata/schedulearr/data' },
        { containerPath: '/', hostPath: '/var/lib/docker' }
    ];

    for (const c of candidates) {
        if (fs.existsSync(c.containerPath)) {
            return c;
        }
    }

    return { containerPath: '/', hostPath: 'Host System' };
}

/**
 * Gathers complete storage stats and occupancy breakdown for the NVMe cache.
 */
export async function getNvmeStorageStats(): Promise<NvmeStorageStats> {
    const mount = resolveNvmeMountPath();
    let totalBytes = 0;
    let freeBytes = 0;
    let usedBytes = 0;
    let usedPercent = 0;

    try {
        if (typeof (fs as any).statfsSync === 'function') {
            const stats = (fs as any).statfsSync(mount.containerPath);
            totalBytes = (stats.blocks || 0) * (stats.bsize || 0);
            freeBytes = (stats.bfree || 0) * (stats.bsize || 0);
            usedBytes = Math.max(0, totalBytes - freeBytes);
            usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
        }
    } catch {}

    const threshold = parseInt(getSetting('nvme_occupancy_threshold') || '80', 10);
    const watchdogEnabled = getSetting('nvme_watchdog_enabled') === 'true';
    const strategy = (getSetting('nvme_strategy') as any) || 'clean_to_threshold';

    // Parse configured rules
    let savedRules: NvmeCleanRules = DEFAULT_NVME_RULES;
    try {
        const raw = getSetting('nvme_clean_rules');
        if (raw) savedRules = { ...DEFAULT_NVME_RULES, ...JSON.parse(raw) };
    } catch {}

    // 1. Torrents & Downloads on Cache
    const downloadsPath = fs.existsSync('/data') ? '/data' : (fs.existsSync('/mnt/cache/NAS_Torrents') ? '/mnt/cache/NAS_Torrents' : '');
    const downloadsMetrics = downloadsPath ? getDirectoryMetrics(downloadsPath, 3) : { bytes: 0, count: 0 };

    // 2. Transcode Temp Buffer
    const transcodePath = fs.existsSync('/transcode') ? '/transcode' : (fs.existsSync('/tmp/transcode') ? '/tmp/transcode' : '');
    const transcodeMetrics = transcodePath ? getDirectoryMetrics(transcodePath, 2) : { bytes: 0, count: 0 };

    // 3. Audiobook Studio & AI Wave Caches
    const aiAudioPath = '/app/data/audiobooks/enhanced';
    const aiAudioMetrics = fs.existsSync(aiAudioPath) ? getDirectoryMetrics(aiAudioPath, 2) : { bytes: 0, count: 0 };

    // 4. Temporary / Scratch Staging
    const tempScratchPath = '/app/data/scratch';
    const tempScratchMetrics = fs.existsSync(tempScratchPath) ? getDirectoryMetrics(tempScratchPath, 2) : { bytes: 0, count: 0 };

    // 5. Calculate remaining / other data on the NVMe volume
    const accountedBytes = downloadsMetrics.bytes + transcodeMetrics.bytes + aiAudioMetrics.bytes + tempScratchMetrics.bytes;
    const otherBytes = Math.max(0, usedBytes - accountedBytes);

    const categories: NvmeCategoryBreakdown[] = [
        {
            id: 'downloads',
            name: 'Downloads',
            path: downloadsPath || '/data',
            bytes: downloadsMetrics.bytes,
            fileCount: downloadsMetrics.count,
            color: '#38bdf8', // sky-400
            canClean: true,
            enabledInAutoClean: savedRules.stalledTorrents || savedRules.completedTorrents,
            description: 'Torrents & temporary media downloads residing on fast cache.'
        },
        {
            id: 'transcode',
            name: 'Transcode',
            path: transcodePath || '/transcode',
            bytes: transcodeMetrics.bytes,
            fileCount: transcodeMetrics.count,
            color: '#a855f7', // purple-500
            canClean: true,
            enabledInAutoClean: savedRules.transcodeCache,
            description: 'Plex streaming transcode chunks & temporary video buffers.'
        },
        {
            id: 'ai_audio',
            name: 'AI Audio',
            path: aiAudioPath,
            bytes: aiAudioMetrics.bytes,
            fileCount: aiAudioMetrics.count,
            color: '#10b981', // emerald-500
            canClean: true,
            enabledInAutoClean: savedRules.aiAudioDrafts,
            description: 'Interim neural speech WAV files & audiobook studio drafts.'
        },
        {
            id: 'temp_scratch',
            name: 'Temp Data',
            path: tempScratchPath,
            bytes: tempScratchMetrics.bytes,
            fileCount: tempScratchMetrics.count,
            color: '#f59e0b', // amber-500
            canClean: true,
            enabledInAutoClean: savedRules.aiAudioDrafts,
            description: 'Temporary processing staging files and conversion chunks.'
        },
        {
            id: 'system_other',
            name: 'Appdata & System',
            path: mount.containerPath,
            bytes: otherBytes,
            fileCount: 0,
            color: '#71717a', // zinc-500
            canClean: false,
            enabledInAutoClean: false,
            description: 'Container configs, databases, and host appdata on NVMe.'
        }
    ];

    const isOverboard = usedPercent >= threshold;

    return {
        available: totalBytes > 0,
        mountPath: mount.containerPath,
        hostPath: mount.hostPath,
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercent,
        isOverboard,
        threshold,
        watchdogEnabled,
        strategy,
        categories,
        lastCleanedAt: getSetting('nvme_last_cleaned_at') || undefined,
        lastReclaimedBytes: parseInt(getSetting('nvme_last_reclaimed_bytes') || '0', 10) || undefined
    };
}

/**
 * Executes NVMe purge routine based on selected categories and priority rules.
 */
export async function executeNvmeCleanup(customRules?: Partial<NvmeCleanRules>): Promise<{
    success: boolean;
    reclaimedBytes: number;
    itemsCleaned: number;
    beforePercent: number;
    afterPercent: number;
    actionsExecuted: string[];
}> {
    const beforeStats = await getNvmeStorageStats();
    let rules: NvmeCleanRules = DEFAULT_NVME_RULES;

    try {
        const raw = getSetting('nvme_clean_rules');
        if (raw) rules = { ...DEFAULT_NVME_RULES, ...JSON.parse(raw) };
    } catch {}

    if (customRules) {
        rules = { ...rules, ...customRules };
    }

    const threshold = beforeStats.threshold;
    const strategy = beforeStats.strategy;
    let totalReclaimedBytes = 0;
    let totalItemsCleaned = 0;
    const actionsExecuted: string[] = [];

    const isStillOverboard = () => {
        if (strategy === 'clean_all_selected') return true;
        const mount = resolveNvmeMountPath();
        try {
            if (typeof (fs as any).statfsSync === 'function') {
                const s = (fs as any).statfsSync(mount.containerPath);
                const tot = (s.blocks || 0) * (s.bsize || 0);
                const free = (s.bfree || 0) * (s.bsize || 0);
                const pct = tot > 0 ? Math.round(((tot - free) / tot) * 100) : 0;
                return pct >= threshold;
            }
        } catch {}
        return true;
    };

    // Priority 1: Clear Plex Transcode Buffer Files
    if (rules.transcodeCache && isStillOverboard()) {
        try {
            const transcodeDirs = ['/transcode', '/tmp/transcode', '/data/transcode'];
            let transcodeFreed = 0;
            let transcodeCount = 0;

            for (const tDir of transcodeDirs) {
                if (fs.existsSync(tDir)) {
                    const entries = fs.readdirSync(tDir, { withFileTypes: true });
                    const oneHourAgo = Date.now() - 3600 * 1000;
                    for (const entry of entries) {
                        const full = path.join(tDir, entry.name);
                        try {
                            const stat = fs.statSync(full);
                            // Purge transcode session directories/files older than 1h
                            if (stat.mtimeMs < oneHourAgo) {
                                if (entry.isDirectory()) {
                                    fs.rmSync(full, { recursive: true, force: true });
                                } else {
                                    fs.unlinkSync(full);
                                }
                                transcodeFreed += stat.size || 0;
                                transcodeCount++;
                            }
                        } catch {}
                    }
                }
            }

            if (transcodeCount > 0) {
                totalReclaimedBytes += transcodeFreed;
                totalItemsCleaned += transcodeCount;
                actionsExecuted.push(`Purged ${transcodeCount} expired transcode segments`);
            }
        } catch {}
    }

    // Priority 2: Stalled & Errored Torrents via qBittorrent
    if (rules.stalledTorrents && isStillOverboard()) {
        try {
            const autoRes = await runAutoCleanup();
            if (autoRes) {
                actionsExecuted.push('Purged stalled unseeded downloads');
                totalItemsCleaned += 1;
            }
        } catch {}
    }

    // Priority 3: Interim AI Audio & WAV Chunks (Audiobook Studio temp drafts)
    if (rules.aiAudioDrafts && isStillOverboard()) {
        try {
            const interimAudioDir = '/app/data/audiobooks/enhanced';
            const tempScratch = '/app/data/scratch';
            let audioFreed = 0;
            let audioCount = 0;

            for (const dir of [interimAudioDir, tempScratch]) {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    const twoDaysAgo = Date.now() - 48 * 3600 * 1000;
                    for (const f of files) {
                        if (f.endsWith('.tmp') || f.endsWith('.part') || f.startsWith('preview_') || f.startsWith('scratch_')) {
                            const full = path.join(dir, f);
                            try {
                                const st = fs.statSync(full);
                                if (st.mtimeMs < twoDaysAgo) {
                                    fs.unlinkSync(full);
                                    audioFreed += st.size || 0;
                                    audioCount++;
                                }
                            } catch {}
                        }
                    }
                }
            }

            if (audioCount > 0) {
                totalReclaimedBytes += audioFreed;
                totalItemsCleaned += audioCount;
                actionsExecuted.push(`Cleaned ${audioCount} temporary AI audio drafts`);
            }
        } catch {}
    }

    // Priority 4: Dangling Docker Layers on NVMe
    if (rules.dockerLayers && isStillOverboard()) {
        try {
            const vdiskRes = await cleanVDisk('dangling');
            if (vdiskRes && vdiskRes.spaceReclaimed > 0) {
                totalReclaimedBytes += vdiskRes.spaceReclaimed;
                totalItemsCleaned += vdiskRes.deletedCount;
                actionsExecuted.push(`Pruned ${vdiskRes.deletedCount} unused Docker layers`);
            }
        } catch {}
    }

    const afterStats = await getNvmeStorageStats();
    setSetting('nvme_last_cleaned_at', new Date().toISOString());
    setSetting('nvme_last_reclaimed_bytes', String(totalReclaimedBytes));

    return {
        success: true,
        reclaimedBytes: totalReclaimedBytes,
        itemsCleaned: totalItemsCleaned,
        beforePercent: beforeStats.usedPercent,
        afterPercent: afterStats.usedPercent,
        actionsExecuted
    };
}

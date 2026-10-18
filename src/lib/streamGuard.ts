import axios from 'axios';
import { getInstances, getSetting, setSetting } from '@/lib/db';
import {
    authenticateQbittorrent,
    getActiveTorrents,
    pauseTorrents,
    resumeTorrents
} from '@/lib/qbittorrent';

export interface StreamGuardSettings {
    enabled: boolean;
    pauseQbit: boolean;
    pauseCpuAi: boolean;
    pausePixel: boolean;
    pauseBatchSearch: boolean;
    gracePeriodSeconds: number;
}

export interface StreamGuardActiveStream {
    id: string;
    title: string;
    user: string;
    device: string;
    bandwidthMbps: string;
    isTranscoding: boolean;
    videoDecision: string;
}

export interface StreamGuardStatus {
    enabled: boolean;
    isThrottled: boolean;
    activeSessionsCount: number;
    activeStreams: StreamGuardActiveStream[];
    throttledSince: string | null;
    pausedTorrentHashes: string[];
    settings: StreamGuardSettings;
    lastCheckAt: string;
}

interface StreamGuardGlobalState {
    isThrottled: boolean;
    activeSessionsCount: number;
    activeStreams: StreamGuardActiveStream[];
    throttledSince: string | null;
    pausedTorrentHashes: string[];
    lastStreamDetectedAt: number;
    lastCheckAt: string;
    watchdogRunning: boolean;
}

const g = global as unknown as { __streamGuardState?: StreamGuardGlobalState; __streamGuardInterval?: NodeJS.Timeout };

if (!g.__streamGuardState) {
    g.__streamGuardState = {
        isThrottled: false,
        activeSessionsCount: 0,
        activeStreams: [],
        throttledSince: null,
        pausedTorrentHashes: [],
        lastStreamDetectedAt: 0,
        lastCheckAt: new Date().toISOString(),
        watchdogRunning: false
    };
}

export function getStreamGuardSettings(): StreamGuardSettings {
    return {
        enabled: getSetting('stream_guard_enabled') !== 'false',
        pauseQbit: getSetting('stream_guard_pause_qbit') !== 'false',
        pauseCpuAi: getSetting('stream_guard_pause_cpu_ai') !== 'false',
        pausePixel: getSetting('stream_guard_pause_pixel') !== 'false',
        pauseBatchSearch: getSetting('stream_guard_pause_batch_search') !== 'false',
        gracePeriodSeconds: parseInt(getSetting('stream_guard_grace_seconds') || '30', 10)
    };
}

export function updateStreamGuardSettings(settings: Partial<StreamGuardSettings>): StreamGuardSettings {
    if (settings.enabled !== undefined) setSetting('stream_guard_enabled', settings.enabled ? 'true' : 'false');
    if (settings.pauseQbit !== undefined) setSetting('stream_guard_pause_qbit', settings.pauseQbit ? 'true' : 'false');
    if (settings.pauseCpuAi !== undefined) setSetting('stream_guard_pause_cpu_ai', settings.pauseCpuAi ? 'true' : 'false');
    if (settings.pausePixel !== undefined) setSetting('stream_guard_pause_pixel', settings.pausePixel ? 'true' : 'false');
    if (settings.pauseBatchSearch !== undefined) setSetting('stream_guard_pause_batch_search', settings.pauseBatchSearch ? 'true' : 'false');
    if (settings.gracePeriodSeconds !== undefined) setSetting('stream_guard_grace_seconds', String(settings.gracePeriodSeconds));
    return getStreamGuardSettings();
}

/**
 * Returns true if Plex is currently streaming and Stream Guard is actively throttling background jobs.
 */
export function isStreamGuardActive(): boolean {
    const settings = getStreamGuardSettings();
    if (!settings.enabled) return false;
    return Boolean(g.__streamGuardState?.isThrottled);
}

export function getStreamGuardStatus(): StreamGuardStatus {
    const state = g.__streamGuardState!;
    const settings = getStreamGuardSettings();
    return {
        enabled: settings.enabled,
        isThrottled: state.isThrottled,
        activeSessionsCount: state.activeSessionsCount,
        activeStreams: state.activeStreams,
        throttledSince: state.throttledSince,
        pausedTorrentHashes: state.pausedTorrentHashes,
        settings,
        lastCheckAt: state.lastCheckAt
    };
}

/**
 * Polls Plex instances for active playback sessions.
 */
async function queryPlexActiveSessions(): Promise<StreamGuardActiveStream[]> {
    const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
    const streams: StreamGuardActiveStream[] = [];

    for (const plex of plexInstances) {
        try {
            const cleanUrl = plex.url.replace(/\/$/, '');
            const res = await axios.get(`${cleanUrl}/status/sessions`, {
                headers: {
                    'X-Plex-Token': plex.api_key,
                    'Accept': 'application/json'
                },
                timeout: 3500
            });

            const metadata = res.data?.MediaContainer?.Metadata || [];
            for (const item of metadata) {
                // Ensure session has an active playback player state
                const player = item.Player || {};
                const state = (player.state || '').toLowerCase();
                const viewOffset = item.viewOffset !== undefined ? parseInt(String(item.viewOffset), 10) : 0;

                // Treat as streaming if playing, buffering, or active offset
                if (state !== 'stopped') {
                    const transcode = item.TranscodeSession;
                    const sessionBandwidthKbps = transcode?.bandwidth || item.bandwidth || player.bandwidth || 0;
                    const bandwidthMbps = sessionBandwidthKbps > 0 ? (sessionBandwidthKbps / 1000).toFixed(1) : '2.5';

                    streams.push({
                        id: String(item.sessionKey || item.ratingKey || Math.random()),
                        title: item.title || item.grandparentTitle || 'Media Stream',
                        user: item.User?.title || item.user?.name || player.title || 'Plex Client',
                        device: player.device || player.product || 'Player',
                        bandwidthMbps,
                        isTranscoding: Boolean(transcode && transcode.videoDecision === 'transcode'),
                        videoDecision: transcode?.videoDecision || 'directplay'
                    });
                }
            }
        } catch {
            // Plex instance unreachable or temporary network glitch
        }
    }

    return streams;
}

/**
 * Pauses downloading torrents in qBittorrent and stores their hashes.
 */
async function throttleQbittorrent(): Promise<string[]> {
    const qbitInstances = getInstances().filter(i => i.type === 'qbittorrent' && i.enabled);
    const throttledHashes: string[] = [];

    for (const qbit of qbitInstances) {
        try {
            const cookie = await authenticateQbittorrent(qbit.url, qbit.api_key);
            const torrents = await getActiveTorrents(qbit.url, cookie);

            // Filter torrents that are currently consuming bandwidth or disk I/O
            const activeDownloading = torrents.filter(t =>
                t.state === 'downloading' ||
                t.state === 'stalledDL' ||
                t.state === 'queuedDL' ||
                t.dlspeed > 0
            );

            if (activeDownloading.length > 0) {
                const hashes = activeDownloading.map(t => t.hash);
                await pauseTorrents(qbit.url, cookie, hashes);
                throttledHashes.push(...hashes);
                console.log(`[STREAM-GUARD] 🛡️ Paused ${hashes.length} active qBittorrent download(s) on "${qbit.name || 'qBittorrent'}".`);
            }
        } catch (e: any) {
            console.error('[STREAM-GUARD] Failed to throttle qBittorrent:', e.message);
        }
    }

    return throttledHashes;
}

/**
 * Resumes previously throttled qBittorrent torrents.
 */
async function resumeQbittorrent(hashes: string[]): Promise<void> {
    if (hashes.length === 0) return;
    const qbitInstances = getInstances().filter(i => i.type === 'qbittorrent' && i.enabled);

    for (const qbit of qbitInstances) {
        try {
            const cookie = await authenticateQbittorrent(qbit.url, qbit.api_key);
            await resumeTorrents(qbit.url, cookie, hashes);
            console.log(`[STREAM-GUARD] 🟢 Resumed ${hashes.length} qBittorrent download(s) on "${qbit.name || 'qBittorrent'}".`);
        } catch (e: any) {
            console.error('[STREAM-GUARD] Failed to resume qBittorrent torrents:', e.message);
        }
    }
}

/**
 * Main watchdog poll cycle called every 8-10 seconds.
 */
export async function runStreamGuardCycle(): Promise<void> {
    const state = g.__streamGuardState!;
    const settings = getStreamGuardSettings();
    state.lastCheckAt = new Date().toISOString();

    if (!settings.enabled) {
        if (state.isThrottled) {
            // Disabled while throttled — restore
            await resumeQbittorrent(state.pausedTorrentHashes);
            state.isThrottled = false;
            state.pausedTorrentHashes = [];
            state.throttledSince = null;
        }
        return;
    }

    const currentStreams = await queryPlexActiveSessions();
    state.activeSessionsCount = currentStreams.length;
    state.activeStreams = currentStreams;

    const now = Date.now();

    if (currentStreams.length > 0) {
        state.lastStreamDetectedAt = now;

        if (!state.isThrottled) {
            // First detection of active stream — engage throttle
            state.isThrottled = true;
            state.throttledSince = new Date().toISOString();
            const first = currentStreams[0];
            console.log(`[STREAM-GUARD] 🛡️ Stream Guard ENGAGED: Plex is streaming "${first.title}" to ${first.user} (${first.bandwidthMbps} Mbps). Pausing background tasks...`);

            if (settings.pauseQbit) {
                const pausedHashes = await throttleQbittorrent();
                state.pausedTorrentHashes = pausedHashes;
            }
        }
    } else {
        // No active streams detected
        if (state.isThrottled) {
            const elapsedSinceStreamMs = now - state.lastStreamDetectedAt;
            const gracePeriodMs = (settings.gracePeriodSeconds || 30) * 1000;

            if (elapsedSinceStreamMs >= gracePeriodMs) {
                // Grace period has elapsed — disengage throttle and resume background work
                console.log(`[STREAM-GUARD] 🟢 Stream Guard DISENGAGED: Plex streaming ended (${Math.round(elapsedSinceStreamMs / 1000)}s idle). Resuming background tasks...`);

                if (settings.pauseQbit && state.pausedTorrentHashes.length > 0) {
                    await resumeQbittorrent(state.pausedTorrentHashes);
                    state.pausedTorrentHashes = [];
                }

                state.isThrottled = false;
                state.throttledSince = null;
            }
        }
    }
}

/**
 * Initializes the recurring background Stream Guard watchdog daemon.
 */
export function startStreamGuardWatchdog(): void {
    const state = g.__streamGuardState!;
    if (state.watchdogRunning) return;
    state.watchdogRunning = true;

    // Run first check after 10s to let server startup complete
    setTimeout(() => {
        runStreamGuardCycle().catch(() => {});
    }, 10000);

    // Recurring poll every 8 seconds
    if (g.__streamGuardInterval) {
        clearInterval(g.__streamGuardInterval);
    }
    g.__streamGuardInterval = setInterval(() => {
        runStreamGuardCycle().catch(() => {});
    }, 8000);

    console.log('🛡️ Schedulearr Stream Guard (Plex Playback Watchdog) active.');
}

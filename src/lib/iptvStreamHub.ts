import { spawn, ChildProcess } from 'child_process';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import { logSystemEvent } from '@/lib/db';
import { ensureUnraidPathPermissions } from '@/lib/docker';

export type RecordingOutputFormat = 'mp4' | 'mkv' | 'mp3';

interface SharedUpstreamHub {
    streamUrl: string;
    channelName: string;
    ffmpegProc: ChildProcess | null;
    subscribers: Set<PassThrough>;
    graceTimer: NodeJS.Timeout | null;
    reconnectTimer: NodeJS.Timeout | null;
    closed: boolean;
    reconnectAttempts: number;
    lastChunkAt: number;
    watchdogTimer: NodeJS.Timeout | null;
}

const g = globalThis as unknown as {
    __schedulearrIptvHubs?: Map<string, SharedUpstreamHub>;
};

function getHubsMap(): Map<string, SharedUpstreamHub> {
    if (!g.__schedulearrIptvHubs) {
        g.__schedulearrIptvHubs = new Map<string, SharedUpstreamHub>();
    }
    return g.__schedulearrIptvHubs;
}

function normalizeHubKey(streamUrl: string): string {
    return streamUrl.trim();
}

function startHubProcess(hub: SharedUpstreamHub) {
    if (hub.closed) return;
    if (hub.ffmpegProc) {
        try {
            hub.ffmpegProc.kill('SIGKILL');
        } catch {}
        hub.ffmpegProc = null;
    }

    const args = [
        '-hide_banner',
        '-loglevel', 'warning',
        '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_on_network_error', '1',
        '-reconnect_on_http_error', '4xx,5xx',
        '-reconnect_delay_max', '5',
        '-rw_timeout', '15000000',
        '-fflags', '+genpts+discardcorrupt+igndts',
        '-err_detect', 'ignore_err',
        '-i', hub.streamUrl,
        '-map', '0:v:0?',
        '-map', '0:a:0?',
        '-c', 'copy',
        '-f', 'mpegts',
        'pipe:1'
    ];

    try {
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        hub.ffmpegProc = proc;
        hub.lastChunkAt = Date.now();

        proc.stdout?.on('data', (chunk: Buffer) => {
            hub.lastChunkAt = Date.now();
            hub.reconnectAttempts = 0;
            for (const sub of Array.from(hub.subscribers)) {
                if (sub.destroyed || sub.writableEnded) {
                    hub.subscribers.delete(sub);
                    continue;
                }
                try {
                    sub.write(chunk);
                } catch {
                    hub.subscribers.delete(sub);
                }
            }
        });

        proc.stderr?.on('data', () => {
            // Drain stderr so buffer never blocks
        });

        proc.on('close', (code) => {
            if (hub.closed || hub.subscribers.size === 0) return;
            hub.reconnectAttempts += 1;
            const delayMs = Math.min(4000, 800 * hub.reconnectAttempts);
            logSystemEvent(
                'IPTV-HUB',
                `Upstream stream for "${hub.channelName}" interrupted (exit ${code ?? 'null'}) — auto-reconnecting in ${delayMs}ms (attempt #${hub.reconnectAttempts}) while keeping ${hub.subscribers.size} active consumer(s) alive.`,
                'warn'
            );
            if (hub.reconnectTimer) clearTimeout(hub.reconnectTimer);
            hub.reconnectTimer = setTimeout(() => {
                if (!hub.closed && hub.subscribers.size > 0) {
                    startHubProcess(hub);
                }
            }, delayMs);
        });

        proc.on('error', (err) => {
            logSystemEvent('IPTV-HUB', `FFmpeg upstream hub error for "${hub.channelName}": ${err.message}`, 'error');
        });
    } catch (err: any) {
        logSystemEvent('IPTV-HUB', `Failed to spawn upstream hub for "${hub.channelName}": ${err?.message}`, 'error');
    }
}

function teardownHub(key: string, hub: SharedUpstreamHub) {
    hub.closed = true;
    if (hub.graceTimer) clearTimeout(hub.graceTimer);
    if (hub.reconnectTimer) clearTimeout(hub.reconnectTimer);
    if (hub.watchdogTimer) clearInterval(hub.watchdogTimer);
    if (hub.ffmpegProc) {
        try {
            hub.ffmpegProc.kill('SIGKILL');
        } catch {}
        hub.ffmpegProc = null;
    }
    for (const sub of Array.from(hub.subscribers)) {
        try {
            sub.end();
        } catch {}
    }
    hub.subscribers.clear();
    getHubsMap().delete(key);
}

/**
 * Subscribe to a shared single-connection upstream IPTV stream.
 * Multiple consumers (Live TV player + Server DVR recorder + Local browser download)
 * share 1 upstream connection so 1-connection IPTV lines never drop when recording starts.
 */
export function subscribeToSharedUpstream(streamUrl: string, channelName = 'Live Channel'): {
    stream: PassThrough;
    unsubscribe: () => void;
    activeSubscribers: number;
} {
    const key = normalizeHubKey(streamUrl);
    const hubs = getHubsMap();
    let hub = hubs.get(key);

    if (!hub || hub.closed) {
        hub = {
            streamUrl,
            channelName,
            ffmpegProc: null,
            subscribers: new Set(),
            graceTimer: null,
            reconnectTimer: null,
            closed: false,
            reconnectAttempts: 0,
            lastChunkAt: Date.now(),
            watchdogTimer: null,
        };
        hubs.set(key, hub);
        startHubProcess(hub);

        // Freeze watchdog: if upstream stalls for >18s while consumers are connected, restart upstream ingest seamlessly
        hub.watchdogTimer = setInterval(() => {
            if (!hub || hub.closed || hub.subscribers.size === 0) return;
            const stalledMs = Date.now() - hub.lastChunkAt;
            if (stalledMs > 18000) {
                logSystemEvent(
                    'IPTV-HUB',
                    `Stream freeze detected (${Math.round(stalledMs / 1000)}s without packets) on "${hub.channelName}" — cycling upstream connection seamlessly.`,
                    'warn'
                );
                hub.lastChunkAt = Date.now();
                startHubProcess(hub);
            }
        }, 5000);
    }

    if (hub.graceTimer) {
        clearTimeout(hub.graceTimer);
        hub.graceTimer = null;
    }

    const subscriber = new PassThrough({ highWaterMark: 2 * 1024 * 1024 });
    hub.subscribers.add(subscriber);

    logSystemEvent(
        'IPTV-HUB',
        `Consumer attached to shared hub for "${channelName}" (active consumers sharing 1 IPTV line: ${hub.subscribers.size})`
    );

    const activeHub = hub;
    const unsubscribe = () => {
        if (!activeHub.subscribers.has(subscriber)) return;
        activeHub.subscribers.delete(subscriber);
        try {
            subscriber.end();
        } catch {}

        if (activeHub.subscribers.size === 0 && !activeHub.closed) {
            activeHub.graceTimer = setTimeout(() => {
                if (activeHub.subscribers.size === 0) {
                    teardownHub(key, activeHub);
                }
            }, 3500);
        }
    };

    subscriber.once('close', unsubscribe);
    subscriber.once('error', unsubscribe);

    return {
        stream: subscriber,
        unsubscribe,
        activeSubscribers: hub.subscribers.size
    };
}

/**
 * Creates a browser-ready fragmented MP4 stream (`video/mp4`) or MP3 audio stream (`audio/mpeg`)
 * powered by the shared upstream IPTV hub so watching + downloading/recording never collide.
 */
export function createSharedRemuxWebStream(
    streamUrl: string,
    channelName: string,
    format: 'mp4' | 'mp3' = 'mp4',
    abortSignal?: AbortSignal
): ReadableStream<Uint8Array> {
    const { stream: upstream, unsubscribe } = subscribeToSharedUpstream(streamUrl, channelName);

    const remuxArgs =
        format === 'mp3'
            ? [
                '-hide_banner',
                '-loglevel', 'error',
                '-fflags', '+genpts+discardcorrupt+igndts',
                '-err_detect', 'ignore_err',
                '-i', 'pipe:0',
                '-vn',
                '-c:a', 'libmp3lame',
                '-b:a', '192k',
                '-ar', '48000',
                '-ac', '2',
                '-f', 'mp3',
                'pipe:1'
            ]
            : [
                '-hide_banner',
                '-loglevel', 'error',
                '-fflags', '+genpts+discardcorrupt+igndts',
                '-err_detect', 'ignore_err',
                '-i', 'pipe:0',
                '-map', '0:v:0?',
                '-map', '0:a:0?',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-ar', '48000',
                '-ac', '2',
                '-af', 'aresample=async=1:first_pts=0',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
                '-f', 'mp4',
                'pipe:1'
            ];

    const remuxProc = spawn('ffmpeg', remuxArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    upstream.pipe(remuxProc.stdin!).on('error', () => {});
    remuxProc.stderr?.on('data', () => {});

    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        unsubscribe();
        try {
            remuxProc.stdin?.end();
        } catch {}
        try {
            remuxProc.kill('SIGKILL');
        } catch {}
    };

    if (abortSignal) {
        abortSignal.addEventListener('abort', cleanup, { once: true });
    }

    return new ReadableStream<Uint8Array>({
        start(controller) {
            remuxProc.stdout?.on('data', (chunk: Buffer) => {
                if (cleanedUp) return;
                try {
                    controller.enqueue(new Uint8Array(chunk));
                } catch {
                    cleanup();
                }
            });
            remuxProc.stdout?.on('end', () => {
                cleanup();
                try {
                    controller.close();
                } catch {}
            });
            remuxProc.on('error', () => {
                cleanup();
                try {
                    controller.close();
                } catch {}
            });
        },
        cancel() {
            cleanup();
        }
    });
}

/**
 * Records a channel from the shared upstream hub into a standard user-friendly file
 * (`.mp4`, `.mkv`, or `.mp3` — NEVER `.ts`) with freeze-resilience and Unraid permission setting.
 */
export function startResilientHubRecording(opts: {
    recordingId: string;
    channelName: string;
    title: string;
    streamUrl: string;
    outputPath: string;
    format: RecordingOutputFormat;
    durationSec: number;
    onProgress?: (sizeBytes: number) => void;
    onComplete: (finalSizeBytes: number, finalPath: string) => void;
    onError: (errMsg: string) => void;
}): { stop: () => void } {
    const {
        channelName,
        title,
        streamUrl,
        outputPath,
        format,
        durationSec,
        onProgress,
        onComplete,
        onError
    } = opts;

    const { stream: upstream, unsubscribe } = subscribeToSharedUpstream(streamUrl, channelName);
    let stoppedByUser = false;

    const args: string[] = [
        '-hide_banner',
        '-loglevel', 'warning',
        '-fflags', '+genpts+discardcorrupt+igndts',
        '-err_detect', 'ignore_err',
        '-i', 'pipe:0',
        '-t', String(Math.max(10, durationSec)),
    ];

    if (format === 'mp3') {
        args.push(
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            '-ar', '48000',
            '-ac', '2',
            '-y',
            outputPath
        );
    } else if (format === 'mkv') {
        args.push(
            '-map', '0:v:0?',
            '-map', '0:a:0?',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-af', 'aresample=async=1:first_pts=0',
            '-y',
            outputPath
        );
    } else {
        // Default: standard playable MP4 (fragmented + faststart-ready so it remains playable even if stopped early)
        args.push(
            '-map', '0:v:0?',
            '-map', '0:a:0?',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-af', 'aresample=async=1:first_pts=0',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof+faststart',
            '-f', 'mp4',
            '-y',
            outputPath
        );
    }

    const recorderProc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    upstream.pipe(recorderProc.stdin!).on('error', () => {});

    let stderrTail = '';
    recorderProc.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-1000);
    });

    const progressTimer = setInterval(() => {
        try {
            if (fs.existsSync(outputPath)) {
                const stat = fs.statSync(outputPath);
                onProgress?.(stat.size);
            }
        } catch {}
    }, 4000);

    const stop = () => {
        if (stoppedByUser) return;
        stoppedByUser = true;
        try {
            recorderProc.stdin?.end();
        } catch {}
        setTimeout(() => {
            try {
                recorderProc.kill('SIGINT');
            } catch {}
        }, 400);
    };

    const durationTimer = setTimeout(() => {
        stop();
    }, Math.max(10, durationSec) * 1000);

    recorderProc.on('close', async (code) => {
        clearInterval(progressTimer);
        clearTimeout(durationTimer);
        unsubscribe();

        let finalSize = 0;
        try {
            if (fs.existsSync(outputPath)) {
                finalSize = fs.statSync(outputPath).size;
            }
        } catch {}

        if (finalSize > 0) {
            await ensureUnraidPathPermissions(outputPath).catch(() => {});
            onComplete(finalSize, outputPath);
        } else if (stoppedByUser) {
            onComplete(0, outputPath);
        } else {
            onError(stderrTail.trim() || `FFmpeg recorder exited with code ${code} and 0 bytes written for "${title}"`);
        }
    });

    recorderProc.on('error', (err) => {
        clearInterval(progressTimer);
        clearTimeout(durationTimer);
        unsubscribe();
        onError(err.message);
    });

    return { stop };
}

export function getActiveStreamHubsSummary(): Array<{
    streamUrl: string;
    channelName: string;
    subscribersCount: number;
    reconnectAttempts: number;
    lastPacketSecondsAgo: number;
    isHealthy: boolean;
}> {
    const hubs = getHubsMap();
    const list: Array<{
        streamUrl: string;
        channelName: string;
        subscribersCount: number;
        reconnectAttempts: number;
        lastPacketSecondsAgo: number;
        isHealthy: boolean;
    }> = [];

    for (const [, hub] of hubs.entries()) {
        if (hub.closed || hub.subscribers.size === 0) continue;
        const lastPacketSecondsAgo = Math.max(0, Math.round((Date.now() - hub.lastChunkAt) / 1000));
        list.push({
            streamUrl: hub.streamUrl,
            channelName: hub.channelName,
            subscribersCount: hub.subscribers.size,
            reconnectAttempts: hub.reconnectAttempts,
            lastPacketSecondsAgo,
            isHealthy: lastPacketSecondsAgo < 15
        });
    }
    return list;
}


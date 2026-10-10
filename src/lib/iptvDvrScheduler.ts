import fs from 'fs';
import path from 'path';
import { getDvrRecordings, updateDvrRecordingStatus, DvrRecording, logSystemEvent } from '@/lib/db';
import { startResilientHubRecording, RecordingOutputFormat } from '@/lib/iptvStreamHub';
import { discoverPlexMediaFolderHierarchy, isPathInsidePlexMediaFolder } from '@/app/api/theater/folders/route';
import { ensureUnraidPathPermissions } from '@/lib/docker';

// Global map tracking active recording stop handles
const activeRecorders = new Map<string, { stop: () => void }>();

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

function normalizeFormat(fmt?: string, filePath?: string): RecordingOutputFormat {
    const lowerFmt = (fmt || '').toLowerCase().trim();
    if (lowerFmt === 'mkv' || lowerFmt === 'mp3' || lowerFmt === 'mp4') {
        return lowerFmt;
    }
    const ext = filePath ? path.extname(filePath).replace('.', '').toLowerCase() : '';
    if (ext === 'mkv' || ext === 'mp3' || ext === 'mp4') {
        return ext;
    }
    return 'mp4';
}

export async function resolveValidPlexRecordingFolder(requestedFolder?: string): Promise<string | null> {
    const { plexMediaRoot, libraries, allowedRoots } = await discoverPlexMediaFolderHierarchy();

    if (requestedFolder && isPathInsidePlexMediaFolder(requestedFolder, allowedRoots)) {
        return requestedFolder;
    }

    // Never allow /app/recordings or anything outside the Plex Media Folder
    if (libraries.length > 0 && libraries[0].rootPath) {
        return libraries[0].rootPath;
    }
    if (plexMediaRoot) {
        return plexMediaRoot;
    }
    return null;
}

export function startRecordingProcess(recording: DvrRecording): boolean {
    if (activeRecorders.has(recording.id)) {
        return true; // Already running
    }

    if (!recording.stream_url) {
        updateDvrRecordingStatus(recording.id, 'failed', undefined, 0, 'No stream URL provided for recording');
        return false;
    }

    void (async () => {
        try {
            const validDestFolder = await resolveValidPlexRecordingFolder(recording.destination_path);
            if (!validDestFolder) {
                const msg = 'Recording blocked: No valid Plex Media Folder found on Unraid. Recordings are strictly restricted to folders inside your Plex Media Folder or your Local Device Downloads folder.';
                logSystemEvent('DVR', msg, 'error');
                updateDvrRecordingStatus(recording.id, 'failed', undefined, 0, msg);
                return;
            }

            if (!fs.existsSync(validDestFolder)) {
                fs.mkdirSync(validDestFolder, { recursive: true, mode: 0o777 });
                await ensureUnraidPathPermissions(validDestFolder).catch(() => {});
            }

            const format = normalizeFormat(recording.format, recording.file_path);
            const now = Date.now();
            const endMs = new Date(recording.end_time).getTime();
            const durationSec = Math.max(60, Math.round((endMs - now) / 1000));

            const safeTitle = sanitizeFilename(recording.program_title || 'Live Recording');
            const safeChan = sanitizeFilename(recording.channel_name || 'TV');
            const dateStr = new Date(recording.start_time || now).toISOString().replace(/[:.]/g, '-').slice(0, 16);

            let targetFile = recording.file_path || '';
            // Ensure targetFile is inside validDestFolder and NEVER has a .ts extension
            if (!targetFile || targetFile.endsWith('.ts') || !targetFile.startsWith(validDestFolder)) {
                const fileName = `${safeTitle} - ${safeChan} (${dateStr}).${format}`;
                targetFile = path.join(validDestFolder, fileName);
            }

            updateDvrRecordingStatus(recording.id, 'recording', targetFile);
            logSystemEvent(
                'DVR',
                `Started freeze-resilient ${format.toUpperCase()} recording for "${recording.program_title}" (${recording.channel_name}) -> ${targetFile}`
            );

            const handle = startResilientHubRecording({
                recordingId: recording.id,
                channelName: recording.channel_name,
                title: recording.program_title,
                streamUrl: recording.stream_url!,
                outputPath: targetFile,
                format,
                durationSec,
                onProgress: (sizeBytes) => {
                    updateDvrRecordingStatus(recording.id, 'recording', targetFile, sizeBytes);
                },
                onComplete: (finalSize, finalPath) => {
                    activeRecorders.delete(recording.id);
                    if (finalSize > 1024) {
                        updateDvrRecordingStatus(recording.id, 'completed', finalPath, finalSize);
                        logSystemEvent(
                            'DVR',
                            `Completed ${format.toUpperCase()} recording "${recording.program_title}" (${(finalSize / (1024 * 1024)).toFixed(1)} MB) -> ${finalPath}`
                        );
                    } else {
                        updateDvrRecordingStatus(recording.id, 'failed', finalPath, finalSize, 'Recording ended with empty output file');
                    }
                },
                onError: (errMsg) => {
                    activeRecorders.delete(recording.id);
                    logSystemEvent('DVR', `Recording failed for "${recording.program_title}": ${errMsg}`, 'error');
                    updateDvrRecordingStatus(recording.id, 'failed', targetFile, 0, errMsg);
                }
            });

            activeRecorders.set(recording.id, handle);
        } catch (err: any) {
            activeRecorders.delete(recording.id);
            console.error(`Failed to launch DVR recorder for ${recording.program_title}:`, err.message);
            updateDvrRecordingStatus(recording.id, 'failed', undefined, 0, err.message);
        }
    })();

    return true;
}

export function cancelRecordingProcess(id: string): boolean {
    const handle = activeRecorders.get(id);
    if (handle) {
        try {
            handle.stop();
        } catch {}
        activeRecorders.delete(id);
    }
    updateDvrRecordingStatus(id, 'cancelled');
    return true;
}

export function checkAndRunScheduledRecordings(): void {
    try {
        const recordings = getDvrRecordings();
        const now = Date.now();

        for (const rec of recordings) {
            const startMs = new Date(rec.start_time).getTime();
            const endMs = new Date(rec.end_time).getTime();

            // 1. If currently scheduled and start time has arrived (or within 45s advance)
            if (rec.status === 'scheduled') {
                if (now >= startMs - 45000 && now < endMs) {
                    startRecordingProcess(rec);
                } else if (now >= endMs) {
                    // Missed window entirely
                    updateDvrRecordingStatus(rec.id, 'failed', undefined, 0, 'Missed scheduled time window');
                }
            }
        }
    } catch (e: any) {
        console.warn('DVR scheduler tick warning:', e.message);
    }
}

// Global recurring runner interval (runs every 25 seconds)
let dvrTimer: NodeJS.Timeout | null = null;
if (!dvrTimer && typeof setInterval !== 'undefined') {
    dvrTimer = setInterval(() => {
        checkAndRunScheduledRecordings();
    }, 25000);
}

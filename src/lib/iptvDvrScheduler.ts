import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { getDvrRecordings, updateDvrRecordingStatus, DvrRecording } from '@/lib/db';
import { getFFmpegPath } from '@/lib/transcoder';

// Global map tracking active ffmpeg recording processes
const activeRecorders = new Map<string, ChildProcess>();

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

export function startRecordingProcess(recording: DvrRecording): boolean {
    if (activeRecorders.has(recording.id)) {
        return true; // Already running
    }

    try {
        if (!recording.stream_url) {
            updateDvrRecordingStatus(recording.id, 'failed', undefined, 0, 'No stream URL provided for recording');
            return false;
        }

        const now = Date.now();
        const endMs = new Date(recording.end_time).getTime();
        const durationSec = Math.max(60, Math.round((endMs - now) / 1000));

        // Ensure target folder exists
        const destFolder = recording.destination_path || path.join(process.cwd(), 'recordings');
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }

        let targetFile: string = recording.file_path || '';
        if (!targetFile) {
            const safeTitle = sanitizeFilename(recording.program_title);
            const dateStr = new Date(recording.start_time).toISOString().replace(/[:.]/g, '-').slice(0, 16);
            const fileName = `${safeTitle} - ${sanitizeFilename(recording.channel_name)} (${dateStr}).ts`;
            targetFile = path.join(destFolder, fileName);
        }

        updateDvrRecordingStatus(recording.id, 'recording', targetFile);

        const ffmpegBin = getFFmpegPath() || 'ffmpeg';
        const ffmpegArgs: string[] = [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-headers', 'User-Agent: VLC/3.0.18 LibVLC/3.0.18\r\n',
            '-i', recording.stream_url,
            '-t', durationSec.toString(),
            '-c', 'copy',
            targetFile
        ];

        const child = spawn(ffmpegBin, ffmpegArgs, { detached: true, stdio: 'ignore' }) as ChildProcess;
        activeRecorders.set(recording.id, child);

        child.on('exit', (code: number | null) => {
            activeRecorders.delete(recording.id);
            let finalSize = 0;
            try {
                if (targetFile && fs.existsSync(targetFile)) {
                    finalSize = fs.statSync(targetFile).size;
                }
            } catch {}

            if (code === 0 && finalSize > 1024) {
                updateDvrRecordingStatus(recording.id, 'completed', targetFile, finalSize);
            } else {
                updateDvrRecordingStatus(recording.id, 'failed', targetFile, finalSize, `FFmpeg exited with code ${code}`);
            }
        });

        child.on('error', (err: Error) => {
            activeRecorders.delete(recording.id);
            updateDvrRecordingStatus(recording.id, 'failed', targetFile, 0, err.message);
        });

        child.unref();
        return true;
    } catch (err: any) {
        console.error(`Failed to launch DVR recorder for ${recording.program_title}:`, err.message);
        updateDvrRecordingStatus(recording.id, 'failed', undefined, 0, err.message);
        return false;
    }
}

export function cancelRecordingProcess(id: string): boolean {
    const proc = activeRecorders.get(id);
    if (proc) {
        try {
            proc.kill('SIGTERM');
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

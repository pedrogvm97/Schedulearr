import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import {
    getDvrStorageFolders, addDvrStorageFolder, deleteDvrStorageFolder,
    getDvrRules, saveDvrRule, deleteDvrRule,
    getDvrRecordings, scheduleDvrRecording, updateDvrRecordingStatus, deleteDvrRecording,
    getIptvChannels, getIptvEpg
} from '@/lib/db';
import { getFFmpegPath } from '@/lib/transcoder';

export const dynamic = 'force-dynamic';

// Track running ffmpeg recording processes
const activeRecorders = new Map<string, ChildProcess>();

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

export async function GET() {
    try {
        const folders = getDvrStorageFolders();
        const rules = getDvrRules();
        const recordings = getDvrRecordings();

        return NextResponse.json({
            success: true,
            folders,
            rules,
            recordings
        });
    } catch (e: any) {
        console.error('API /theater/iptv/dvr GET error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        // 1. Manage Storage Folders
        if (action === 'add_folder') {
            const { path: folderPath, name, isDefault } = body;
            if (!folderPath) {
                return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
            }

            // Ensure destination directory exists or can be created
            try {
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }
            } catch (fsErr: any) {
                return NextResponse.json({ error: `Cannot access or create folder: ${fsErr.message}` }, { status: 400 });
            }

            const folder = addDvrStorageFolder(folderPath, name, Boolean(isDefault));
            return NextResponse.json({ success: true, folder });
        }

        if (action === 'delete_folder') {
            const { id } = body;
            if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
            deleteDvrStorageFolder(id);
            return NextResponse.json({ success: true });
        }

        // 2. Manage Smart Rules
        if (action === 'save_rule') {
            const { rule } = body;
            if (!rule || !rule.name || !rule.query || !rule.destination_folder) {
                return NextResponse.json({ error: 'Rule name, query, and destination_folder are required' }, { status: 400 });
            }
            const saved = saveDvrRule(rule);
            return NextResponse.json({ success: true, rule: saved });
        }

        if (action === 'delete_rule') {
            const { id } = body;
            if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
            deleteDvrRule(id);
            return NextResponse.json({ success: true });
        }

        // 3. Start Recording Now or Schedule Recording
        if (action === 'record_now' || action === 'schedule_recording') {
            const {
                channelId, channelName, channelLogo, streamUrl,
                programTitle, programDescription, startTime, endTime,
                destinationFolder, paddingMinutes, ruleId
            } = body;

            if (!channelId || !channelName || !streamUrl || !programTitle || !destinationFolder) {
                return NextResponse.json({ error: 'Missing required recording parameters' }, { status: 400 });
            }

            const paddingSec = (parseInt(paddingMinutes) || 15) * 60;
            const now = Date.now();
            const startMs = startTime ? new Date(startTime).getTime() : now;
            const endMs = endTime ? new Date(endTime).getTime() : (now + 2 * 60 * 60 * 1000);
            
            // Total duration in seconds + padding
            const durationSec = Math.max(300, Math.round((endMs - Math.min(now, startMs)) / 1000) + paddingSec);

            // Determine filename & target path
            const safeTitle = sanitizeFilename(programTitle);
            const dateStr = new Date(startMs).toISOString().replace(/[:.]/g, '-').slice(0, 16);
            const fileName = `${safeTitle} - ${sanitizeFilename(channelName)} (${dateStr}).ts`;
            const destFilePath = path.join(destinationFolder, fileName);

            // Save scheduled record
            const recording = scheduleDvrRecording({
                rule_id: ruleId,
                channel_id: channelId,
                channel_name: channelName,
                channel_logo: channelLogo,
                stream_url: streamUrl,
                program_title: programTitle,
                program_description: programDescription,
                start_time: new Date(startMs).toISOString(),
                end_time: new Date(endMs + paddingSec * 1000).toISOString(),
                destination_path: destinationFolder,
                file_path: destFilePath,
                file_size: 0,
                status: action === 'record_now' ? 'recording' : 'scheduled'
            });

            // If "record_now", spawn FFmpeg capture immediately in background
            if (action === 'record_now') {
                try {
                    const ffmpegBin = getFFmpegPath();
                    const ffmpegArgs = [
                        '-y',
                        '-hide_banner',
                        '-loglevel', 'error',
                        '-headers', 'User-Agent: VLC/3.0.18 LibVLC/3.0.18\r\n',
                        '-i', streamUrl,
                        '-t', durationSec.toString(),
                        '-c', 'copy',
                        destFilePath
                    ];

                    const child = spawn(ffmpegBin, ffmpegArgs, { detached: true, stdio: 'ignore' });
                    activeRecorders.set(recording.id, child);

                    child.on('exit', (code) => {
                        activeRecorders.delete(recording.id);
                        let finalSize = 0;
                        try {
                            if (fs.existsSync(destFilePath)) {
                                finalSize = fs.statSync(destFilePath).size;
                            }
                        } catch {}

                        if (code === 0 && finalSize > 1024) {
                            updateDvrRecordingStatus(recording.id, 'completed', destFilePath, finalSize);
                        } else {
                            updateDvrRecordingStatus(recording.id, 'failed', destFilePath, finalSize, `FFmpeg exited with code ${code}`);
                        }
                    });

                    child.on('error', (err) => {
                        activeRecorders.delete(recording.id);
                        updateDvrRecordingStatus(recording.id, 'failed', undefined, 0, err.message);
                    });

                    child.unref();
                } catch (spawnErr: any) {
                    updateDvrRecordingStatus(recording.id, 'failed', undefined, 0, spawnErr.message);
                }
            }

            return NextResponse.json({ success: true, recording });
        }

        // 4. Cancel active or scheduled recording
        if (action === 'cancel_recording') {
            const { id } = body;
            if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

            const proc = activeRecorders.get(id);
            if (proc) {
                try { proc.kill('SIGTERM'); } catch {}
                activeRecorders.delete(id);
            }

            updateDvrRecordingStatus(id, 'cancelled');
            return NextResponse.json({ success: true });
        }

        // 5. Delete recording record
        if (action === 'delete_recording') {
            const { id, deleteFile } = body;
            if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

            if (deleteFile) {
                const recordings = getDvrRecordings();
                const target = recordings.find(r => r.id === id);
                if (target?.file_path && fs.existsSync(target.file_path)) {
                    try { fs.unlinkSync(target.file_path); } catch {}
                }
            }

            deleteDvrRecording(id);
            return NextResponse.json({ success: true });
        }

        // 6. Scan Rules against EPG
        if (action === 'scan_rules') {
            const { libraryId } = body;
            if (!libraryId) return NextResponse.json({ error: 'libraryId required' }, { status: 400 });

            const rules = getDvrRules().filter(r => r.enabled);
            const channels = getIptvChannels(libraryId);
            const scheduled: any[] = [];

            for (const rule of rules) {
                const queryLower = rule.query.toLowerCase().trim();
                const tokens = queryLower.split(/\s+/).filter(Boolean);

                for (const chan of channels) {
                    if (rule.channel_scope !== 'all' && chan.group !== rule.channel_scope) {
                        continue;
                    }

                    if (!chan.tvgId) continue;
                    const programs = getIptvEpg(libraryId, chan.tvgId);

                    for (const prog of programs) {
                        const titleLower = prog.title.toLowerCase();
                        const descLower = (prog.description || '').toLowerCase();
                        const fullText = `${titleLower} ${descLower}`;

                        // Check if all tokens match
                        const matches = tokens.every(t => fullText.includes(t));
                        if (matches) {
                            // Check if already scheduled
                            const existingRecs = getDvrRecordings();
                            const alreadyExists = existingRecs.some(r =>
                                r.channel_id === chan.id &&
                                r.program_title === prog.title &&
                                Math.abs(new Date(r.start_time).getTime() - new Date(prog.start_time).getTime()) < 60000
                            );

                            if (!alreadyExists) {
                                const newRec = scheduleDvrRecording({
                                    rule_id: rule.id,
                                    channel_id: chan.id,
                                    channel_name: chan.name,
                                    channel_logo: chan.logo,
                                    stream_url: chan.url,
                                    program_title: prog.title,
                                    program_description: prog.description,
                                    start_time: prog.start_time,
                                    end_time: prog.end_time,
                                    destination_path: rule.destination_folder,
                                    status: 'scheduled'
                                });
                                scheduled.push(newRec);
                            }
                        }
                    }
                }
            }

            return NextResponse.json({ success: true, matchedCount: scheduled.length, scheduled });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        console.error('API /theater/iptv/dvr POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

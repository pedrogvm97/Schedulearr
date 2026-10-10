import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
    getDvrStorageFolders, addDvrStorageFolder, deleteDvrStorageFolder,
    getDvrRules, saveDvrRule, deleteDvrRule,
    getDvrRecordings, scheduleDvrRecording, deleteDvrRecording,
    getIptvChannels, getIptvEpg, logSystemEvent
} from '@/lib/db';
import {
    checkAndRunScheduledRecordings,
    startRecordingProcess,
    cancelRecordingProcess,
    resolveValidPlexRecordingFolder
} from '@/lib/iptvDvrScheduler';
import { discoverPlexMediaFolderHierarchy, isPathInsidePlexMediaFolder } from '@/app/api/theater/folders/route';
import { ensureUnraidPathPermissions } from '@/lib/docker';

export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

export async function GET() {
    try {
        checkAndRunScheduledRecordings();

        const { plexMediaRoot, libraries, allowedRoots } = await discoverPlexMediaFolderHierarchy();
        let folders = getDvrStorageFolders().filter(f => isPathInsidePlexMediaFolder(f.path, allowedRoots));

        // Merge discovered Plex library folders so the user always sees their Plex Media Folder libraries
        const existingPaths = new Set(folders.map(f => f.path));
        for (const lib of libraries) {
            if (lib.rootPath && !existingPaths.has(lib.rootPath)) {
                existingPaths.add(lib.rootPath);
                folders.push({
                    id: `plex_lib_${lib.id}`,
                    path: lib.rootPath,
                    name: `${lib.name} (Plex Folder)`,
                    is_default: folders.length === 0,
                    created_at: new Date().toISOString()
                });
            }
        }

        const rules = getDvrRules();
        const recordings = getDvrRecordings();

        return NextResponse.json({
            success: true,
            plexMediaRoot,
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

        const { allowedRoots } = await discoverPlexMediaFolderHierarchy();

        // 1. Manage Storage Folders (Strictly inside Plex Media Folder)
        if (action === 'add_folder') {
            const { path: folderPath, name, isDefault } = body;
            if (!folderPath) {
                return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
            }

            if (!isPathInsidePlexMediaFolder(folderPath, allowedRoots)) {
                return NextResponse.json({
                    error: 'Zero recordings are allowed outside your Plex Media Folder or Local Device Downloads folder. Choose or create a folder inside your Plex Media Folder.'
                }, { status: 400 });
            }

            try {
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true, mode: 0o777 });
                }
                await ensureUnraidPathPermissions(folderPath).catch(() => {});
            } catch (fsErr: any) {
                return NextResponse.json({ error: `Cannot access or create folder: ${fsErr.message}` }, { status: 400 });
            }

            const folder = addDvrStorageFolder(folderPath, name, Boolean(isDefault));
            logSystemEvent('DVR-FOLDER', `Added Plex recording destination folder: ${folderPath}`);
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
            if (!isPathInsidePlexMediaFolder(rule.destination_folder, allowedRoots)) {
                return NextResponse.json({
                    error: 'Smart Rule destination must be a folder inside your Plex Media Folder on Unraid.'
                }, { status: 400 });
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

        // 3. Start Recording Now or Schedule Recording (MP4 / MKV / MP3 — NEVER .ts)
        if (action === 'record_now' || action === 'schedule_recording') {
            const {
                channelId, channelName, channelLogo, streamUrl,
                programTitle, programDescription, startTime, endTime,
                destinationFolder, paddingMinutes, ruleId, format
            } = body;

            if (!channelId || !channelName || !streamUrl || !programTitle) {
                return NextResponse.json({ error: 'Missing required recording parameters' }, { status: 400 });
            }

            const validDestFolder = await resolveValidPlexRecordingFolder(destinationFolder);
            if (!validDestFolder) {
                return NextResponse.json({
                    error: 'No valid folder inside your Plex Media Folder was selected. Please choose a folder inside your Plex Media Folder or record to your Local Device Downloads folder.'
                }, { status: 400 });
            }

            try {
                if (!fs.existsSync(validDestFolder)) {
                    fs.mkdirSync(validDestFolder, { recursive: true, mode: 0o777 });
                }
                await ensureUnraidPathPermissions(validDestFolder).catch(() => {});
            } catch (e: any) {
                return NextResponse.json({ error: `Cannot write to Plex folder "${validDestFolder}": ${e.message}` }, { status: 400 });
            }

            const cleanFormat: 'mp4' | 'mkv' | 'mp3' =
                format === 'mkv' || format === 'mp3' ? format : 'mp4';

            const paddingSec = (parseInt(paddingMinutes) || 15) * 60;
            const now = Date.now();
            const startMs = startTime ? new Date(startTime).getTime() : now;
            const endMs = endTime ? new Date(endTime).getTime() : (now + 2 * 60 * 60 * 1000);

            const safeTitle = sanitizeFilename(programTitle);
            const dateStr = new Date(startMs).toISOString().replace(/[:.]/g, '-').slice(0, 16);
            const fileName = `${safeTitle} - ${sanitizeFilename(channelName)} (${dateStr}).${cleanFormat}`;
            const destFilePath = path.join(validDestFolder, fileName);

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
                destination_path: validDestFolder,
                file_path: destFilePath,
                file_size: 0,
                format: cleanFormat,
                status: action === 'record_now' ? 'recording' : 'scheduled'
            });

            if (action === 'record_now') {
                startRecordingProcess(recording);
            }

            return NextResponse.json({ success: true, recording });
        }

        // 4. Cancel active or scheduled recording
        if (action === 'cancel_recording') {
            const { id } = body;
            if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

            cancelRecordingProcess(id);
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
                const validRuleFolder = await resolveValidPlexRecordingFolder(rule.destination_folder);
                if (!validRuleFolder) continue;

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

                        const matches = tokens.every(t => fullText.includes(t));
                        if (matches) {
                            const existingRecs = getDvrRecordings();
                            const alreadyExists = existingRecs.some(r =>
                                r.channel_id === chan.id &&
                                r.program_title === prog.title &&
                                Math.abs(new Date(r.start_time).getTime() - new Date(prog.start_time).getTime()) < 60000
                            );

                            if (!alreadyExists) {
                                const safeTitle = sanitizeFilename(prog.title);
                                const dateStr = new Date(prog.start_time).toISOString().replace(/[:.]/g, '-').slice(0, 16);
                                const fileName = `${safeTitle} - ${sanitizeFilename(chan.name)} (${dateStr}).mp4`;
                                const newRec = scheduleDvrRecording({
                                    rule_id: rule.id,
                                    channel_id: chan.id,
                                    channel_name: chan.name,
                                    channel_logo: chan.logo,
                                    stream_url: chan.streams?.[0]?.url || (chan as any).url || '',
                                    program_title: prog.title,
                                    program_description: prog.description,
                                    start_time: prog.start_time,
                                    end_time: prog.end_time,
                                    destination_path: validRuleFolder,
                                    file_path: path.join(validRuleFolder, fileName),
                                    format: 'mp4',
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

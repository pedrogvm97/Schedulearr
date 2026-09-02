import axios from 'axios';
import zlib from 'zlib';
import xml2js from 'xml2js';
import {
    getTheaterLibraries, updateTheaterLibrary,
    saveIptvEpg, getIptvChannels, getIptvEpg,
    getDvrRules, getDvrRecordings, scheduleDvrRecording
} from '@/lib/db';

export interface EpgSyncProgress {
    libraryId: string;
    status: 'idle' | 'downloading' | 'parsing' | 'saving' | 'scanning_rules' | 'completed' | 'error';
    progressPercent: number;
    message: string;
    programCount: number;
    ruleMatchesCount: number;
    startedAt?: string;
    finishedAt?: string;
    error?: string;
}

// Global active sync progress store
const syncStatuses = new Map<string, EpgSyncProgress>();

// Helper to parse XMLTV date
export function parseXmltvDate(raw: string): string {
    if (!raw) return new Date().toISOString();
    const clean = raw.trim();
    const match = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
    if (match) {
        const [, year, month, day, hour, min, sec, tz] = match;
        const tzFormatted = tz ? `${tz.slice(0, 3)}:${tz.slice(3, 5)}` : 'Z';
        const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}${tzFormatted}`;
        const parsedDate = new Date(iso);
        if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
        }
    }
    const fallback = new Date(clean);
    return isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
}

export function getEpgSyncStatus(libraryId: string): EpgSyncProgress {
    return syncStatuses.get(libraryId) || {
        libraryId,
        status: 'idle',
        progressPercent: 0,
        message: 'Idle',
        programCount: 0,
        ruleMatchesCount: 0
    };
}

export function updateEpgSyncStatus(libraryId: string, update: Partial<EpgSyncProgress>) {
    const current = getEpgSyncStatus(libraryId);
    const updated = { ...current, ...update };
    syncStatuses.set(libraryId, updated);
    return updated;
}

// Perform rule scan over synced EPG
export function scanDvrRulesForLibrary(libraryId: string): number {
    try {
        const rules = getDvrRules().filter(r => r.enabled);
        if (rules.length === 0) return 0;

        const channels = getIptvChannels(libraryId);
        let scheduledCount = 0;

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

                    const matches = tokens.every(t => fullText.includes(t));
                    if (matches) {
                        const existingRecs = getDvrRecordings();
                        const alreadyExists = existingRecs.some(r =>
                            r.channel_id === chan.id &&
                            r.program_title === prog.title &&
                            Math.abs(new Date(r.start_time).getTime() - new Date(prog.start_time).getTime()) < 60000
                        );

                        if (!alreadyExists) {
                            scheduleDvrRecording({
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
                            scheduledCount++;
                        }
                    }
                }
            }
        }
        return scheduledCount;
    } catch (e) {
        console.warn('Rule scan warning during EPG sync:', e);
        return 0;
    }
}

// Main EPG sync execution with detailed progressive state updates
export async function executeEpgSync(libraryId: string, epgUrl: string): Promise<EpgSyncProgress> {
    if (!libraryId || !epgUrl) {
        throw new Error('libraryId and epgUrl are required');
    }

    // Initialize status
    updateEpgSyncStatus(libraryId, {
        libraryId,
        status: 'downloading',
        progressPercent: 15,
        message: 'Connecting to XMLTV guide source...',
        programCount: 0,
        ruleMatchesCount: 0,
        startedAt: new Date().toISOString(),
        error: undefined
    });

    try {
        const headers = { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.46' };
        
        // Step 1: Download
        const res = await axios.get(epgUrl, {
            timeout: 120000,
            headers,
            responseType: 'arraybuffer',
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        updateEpgSyncStatus(libraryId, {
            status: 'parsing',
            progressPercent: 40,
            message: 'Decompressing & parsing XMLTV structure...'
        });

        let xmlData = '';
        if (epgUrl.endsWith('.gz') || (res.headers['content-encoding'] || '').includes('gzip')) {
            xmlData = zlib.gunzipSync(Buffer.from(res.data)).toString('utf-8');
        } else {
            xmlData = Buffer.from(res.data).toString('utf-8');
        }

        const parser = new xml2js.Parser({ explicitArray: false });
        const parsed = await parser.parseStringPromise(xmlData);

        const programmes = parsed?.tv?.programme;
        if (!programmes) {
            updateEpgSyncStatus(libraryId, {
                status: 'completed',
                progressPercent: 100,
                message: 'No programmes found in guide.',
                programCount: 0,
                finishedAt: new Date().toISOString()
            });
            return getEpgSyncStatus(libraryId);
        }

        const progList = Array.isArray(programmes) ? programmes : [programmes];
        const totalRaw = progList.length;

        updateEpgSyncStatus(libraryId, {
            status: 'saving',
            progressPercent: 65,
            message: `Ingesting ${totalRaw.toLocaleString()} programmes into guide database...`
        });

        const epgItems: Array<{
            channelTvgId: string;
            title: string;
            description?: string;
            startTime: string;
            endTime: string;
        }> = [];

        for (const p of progList.slice(0, 75000)) {
            const channelId = p.$?.channel;
            const startStr = p.$?.start;
            const stopStr = p.$?.stop;
            const title = typeof p.title === 'string' ? p.title : p.title?._ || '';
            const desc = typeof p.desc === 'string' ? p.desc : p.desc?._ || '';

            if (channelId && title && startStr && stopStr) {
                const startTime = parseXmltvDate(startStr);
                const endTime = parseXmltvDate(stopStr);
                epgItems.push({
                    channelTvgId: channelId,
                    title,
                    description: desc || undefined,
                    startTime,
                    endTime
                });
            }
        }

        if (epgItems.length > 0) {
            saveIptvEpg(libraryId, epgItems);
        }

        // Step 4: Scan DVR automation rules
        updateEpgSyncStatus(libraryId, {
            status: 'scanning_rules',
            progressPercent: 85,
            message: 'Scanning recording rules against updated schedule...',
            programCount: epgItems.length
        });

        const ruleMatches = scanDvrRulesForLibrary(libraryId);

        // Update library folders record with last sync timestamp: [streamUrl, epgUrl, intervalHours, lastSyncIso]
        const libs = getTheaterLibraries();
        const currentLib = libs.find(l => l.id === libraryId);
        if (currentLib) {
            const streamUrl = currentLib.folders?.[0] || '';
            const intervalHours = currentLib.folders?.[2] || '24';
            const nowIso = new Date().toISOString();
            updateTheaterLibrary(libraryId, [streamUrl, epgUrl, intervalHours, nowIso]);
        }

        // Final completion state
        return updateEpgSyncStatus(libraryId, {
            status: 'completed',
            progressPercent: 100,
            message: `Guide synced successfully (${epgItems.length.toLocaleString()} programmes, ${ruleMatches} rules matched)`,
            programCount: epgItems.length,
            ruleMatchesCount: ruleMatches,
            finishedAt: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('EPG sync error:', err);
        return updateEpgSyncStatus(libraryId, {
            status: 'error',
            progressPercent: 100,
            message: `Sync failed: ${err.message}`,
            error: err.message,
            finishedAt: new Date().toISOString()
        });
    }
}

// Background scheduler checker
export async function checkAndRunScheduledEpgSyncs(): Promise<void> {
    try {
        const libs = getTheaterLibraries();
        const iptvLibs = libs.filter(l => l.type === 'live');

        for (const lib of iptvLibs) {
            const epgUrl = lib.folders?.[1];
            if (!epgUrl) continue;

            const intervalHoursStr = lib.folders?.[2] || '24';
            const intervalHours = parseInt(intervalHoursStr, 10);
            
            // 0 or NaN means manual only
            if (isNaN(intervalHours) || intervalHours <= 0) continue;

            const lastSyncStr = lib.folders?.[3];
            const lastSync = lastSyncStr ? new Date(lastSyncStr).getTime() : 0;
            const now = Date.now();
            const intervalMs = intervalHours * 60 * 60 * 1000;

            if (now - lastSync >= intervalMs) {
                const currentStatus = getEpgSyncStatus(lib.id);
                if (currentStatus.status !== 'downloading' && currentStatus.status !== 'parsing' && currentStatus.status !== 'saving') {
                    console.log(`[${new Date().toISOString()}] 📡 Scheduled EPG sync starting for "${lib.name}" (${intervalHours}h interval)...`);
                    executeEpgSync(lib.id, epgUrl).catch(err => console.warn(`Scheduled EPG sync failed for ${lib.name}:`, err.message));
                }
            }
        }
    } catch (e) {
        console.warn('Error in checkAndRunScheduledEpgSyncs:', e);
    }
}

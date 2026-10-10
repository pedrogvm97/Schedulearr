import axios from 'axios';
import zlib from 'zlib';
import {
    getTheaterLibraries, updateTheaterLibrary,
    saveIptvEpg, getIptvChannels, getIptvEpg, getIptvShortlists,
    getDvrRules, getDvrRecordings, scheduleDvrRecording
} from '@/lib/db';

export interface EpgSyncProgress {
    libraryId: string;
    libraryName?: string;
    status: 'idle' | 'downloading' | 'parsing' | 'saving' | 'scanning_rules' | 'completed' | 'error';
    progressPercent: number;
    message: string;
    programCount: number;
    ruleMatchesCount: number;
    scopeSummary?: string;
    startedAt?: string;
    finishedAt?: string;
    error?: string;
}

// Global active sync progress store
const syncStatuses = new Map<string, EpgSyncProgress>();

export function getAllActiveEpgSyncs(): EpgSyncProgress[] {
    const active: EpgSyncProgress[] = [];
    for (const st of syncStatuses.values()) {
        if (st.status === 'downloading' || st.status === 'parsing' || st.status === 'saving' || st.status === 'scanning_rules') {
            active.push(st);
        }
    }
    return active;
}

// Helper to auto-derive XMLTV URL from Xtream M3U URL if epgUrl is missing
export function deriveXtreamEpgUrl(streamUrl?: string): string {
    if (!streamUrl) return '';
    try {
        if (streamUrl.includes('username=') && streamUrl.includes('password=')) {
            const u = new URL(streamUrl);
            const user = u.searchParams.get('username');
            const pass = u.searchParams.get('password');
            if (user && pass) {
                return `${u.protocol}//${u.host}/xmltv.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;
            }
        }
    } catch {
        // ignore
    }
    return '';
}

// Helper to parse XMLTV date (e.g. "20261010143000 +0100")
export function parseXmltvDate(raw: string): string {
    if (!raw) return new Date().toISOString();
    const clean = raw.trim();
    const match = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
    if (match) {
        const [, year, month, day, hour, min, sec, tz] = match;
        const tzFormatted = tz ? `${tz.slice(0, 3)}:${tz.slice(3, 5)}` : 'Z';
        const iso = `${year}-${month}-${day}T}${hour}:${min}:${sec}${tzFormatted}`.replace('T}', 'T');
        const parsedDate = new Date(iso);
        if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
        }
    }
    const fallback = new Date(clean);
    return isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
}

function decodeXmlEntities(str: string): string {
    if (!str) return '';
    return str
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .trim();
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

                const lookupKey = chan.tvgId || chan.cleanName || chan.name;
                if (!lookupKey) continue;
                const programs = getIptvEpg(libraryId, lookupKey);

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
                                stream_url: chan.streams?.[0]?.url || (chan as any).url || '',
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
        console.warn('[EPG-SYNC] Rule scan warning during EPG sync:', e);
        return 0;
    }
}

/**
 * Low-memory, Unraid-friendly XMLTV EPG Sync Engine with Channel / Shortlist / Group Scope Filtering.
 * Stores all matched programmes locally in SQLite so clients fetch instantaneously.
 */
export async function executeEpgSync(
    libraryId: string,
    epgUrlInput?: string,
    scopeConfigInput?: string
): Promise<EpgSyncProgress> {
    const libs = getTheaterLibraries();
    const currentLib = libs.find(l => l.id === libraryId);
    const libName = currentLib?.name || libraryId;
    const streamUrl = currentLib?.folders?.[0] || '';
    const epgUrl = (epgUrlInput || currentLib?.folders?.[1] || deriveXtreamEpgUrl(streamUrl)).trim();
    const scopeConfig = (scopeConfigInput ?? currentLib?.folders?.[4] ?? 'all').trim();

    if (!libraryId || !epgUrl) {
        throw new Error('No XMLTV EPG URL configured or derivable for this provider');
    }

    console.log(`[${new Date().toISOString()}] 📡 [EPG-SYNC] Starting EPG sync for "${libName}" (URL: ${epgUrl} | Scope: ${scopeConfig || 'all'})`);

    updateEpgSyncStatus(libraryId, {
        libraryId,
        libraryName: libName,
        status: 'downloading',
        progressPercent: 12,
        message: `Downloading XMLTV guide for ${libName}...`,
        programCount: 0,
        ruleMatchesCount: 0,
        scopeSummary: scopeConfig,
        startedAt: new Date().toISOString(),
        error: undefined
    });

    try {
        const headers = {
            'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.6.2',
            'Accept': '*/*'
        };

        const res = await axios.get(epgUrl, {
            timeout: 180000,
            headers,
            responseType: 'arraybuffer',
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        updateEpgSyncStatus(libraryId, {
            status: 'parsing',
            progressPercent: 35,
            message: 'Decompressing & indexing XMLTV channels (low-memory stream parser)...'
        });

        let xmlData = '';
        const buf = Buffer.from(res.data);
        const isGzip = epgUrl.endsWith('.gz') ||
            (res.headers['content-encoding'] || '').includes('gzip') ||
            (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b);

        if (isGzip) {
            try {
                xmlData = zlib.gunzipSync(buf).toString('utf-8');
            } catch {
                xmlData = buf.toString('utf-8');
            }
        } else {
            xmlData = buf.toString('utf-8');
        }

        // Determine which library channels are in scope based on scopeConfig:
        // - 'all' or '': all channels in the library
        // - 'shortlists_only': only channels belonging to any user shortlist
        // - 'shortlist:<id1>,<id2>' or 'groups:<g1>,<g2>': specific shortlists or channel groups
        const allLibraryChannels = getIptvChannels(libraryId);
        const shortlists = getIptvShortlists(libraryId);
        let scopedChannels = allLibraryChannels;

        if (scopeConfig && scopeConfig !== 'all') {
            if (scopeConfig === 'shortlists_only') {
                const shortlistedIds = new Set<string>();
                for (const sl of shortlists) {
                    for (const cid of sl.channelIds || []) shortlistedIds.add(cid);
                }
                if (shortlistedIds.size > 0) {
                    scopedChannels = allLibraryChannels.filter((c: any) =>
                        shortlistedIds.has(c.id) || shortlistedIds.has(c.tvgId) || shortlistedIds.has(c.cleanName)
                    );
                }
            } else if (scopeConfig.startsWith('shortlists:')) {
                const targetSlIds = new Set(scopeConfig.replace('shortlists:', '').split(',').map((s: string) => s.trim()).filter(Boolean));
                const shortlistedIds = new Set<string>();
                for (const sl of shortlists) {
                    if (targetSlIds.has(sl.id) || targetSlIds.has(sl.name)) {
                        for (const cid of sl.channelIds || []) shortlistedIds.add(cid);
                    }
                }
                if (shortlistedIds.size > 0) {
                    scopedChannels = allLibraryChannels.filter((c: any) =>
                        shortlistedIds.has(c.id) || shortlistedIds.has(c.tvgId) || shortlistedIds.has(c.cleanName)
                    );
                }
            } else if (scopeConfig.startsWith('groups:')) {
                const targetGroups = new Set(scopeConfig.replace('groups:', '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean));
                if (targetGroups.size > 0) {
                    scopedChannels = allLibraryChannels.filter((c: any) =>
                        targetGroups.has((c.group || '').toLowerCase().trim())
                    );
                }
            }
        }

        // Fallback to all channels if filter produced 0 channels
        if (scopedChannels.length === 0) {
            scopedChannels = allLibraryChannels;
        }

        console.log(`[EPG-SYNC] Filtering EPG to ${scopedChannels.length} channels (out of ${allLibraryChannels.length} total in library "${libName}").`);

        // Step 1: Parse <channel id="..."> blocks using lightweight regex (no DOM OOM)
        const xmlIdToNames = new Map<string, string[]>();
        const nameToXmlIds = new Map<string, Set<string>>();

        const channelBlockRegex = /<channel\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/channel>/gi;
        let chMatch: RegExpExecArray | null;
        while ((chMatch = channelBlockRegex.exec(xmlData)) !== null) {
            const chId = decodeXmlEntities(chMatch[1]);
            if (!chId) continue;
            const inner = chMatch[2];
            const names: string[] = [chId];
            const dispRegex = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi;
            let dMatch: RegExpExecArray | null;
            while ((dMatch = dispRegex.exec(inner)) !== null) {
                const disp = decodeXmlEntities(dMatch[1]);
                if (disp) names.push(disp);
            }

            const lowerNames = names.map(n => n.toLowerCase().trim());
            const normNames = names.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
            const allAliases = Array.from(new Set([...names, ...lowerNames, ...normNames]));
            xmlIdToNames.set(chId, allAliases);

            for (const alias of allAliases) {
                if (!nameToXmlIds.has(alias)) nameToXmlIds.set(alias, new Set());
                nameToXmlIds.get(alias)!.add(chId);
            }
        }

        // Step 2: Map XMLTV channel IDs <-> Scoped Library Channel Keys
        const xmlIdToTargetKeys = new Map<string, Set<string>>();
        const isScopedFilterActive = scopeConfig && scopeConfig !== 'all' && scopedChannels.length < allLibraryChannels.length;

        for (const chan of scopedChannels) {
            const chanKeys = [
                chan.tvgId,
                chan.tvgName,
                chan.cleanName,
                chan.name,
                (chan.cleanName || chan.name || '').toLowerCase().trim(),
                (chan.cleanName || chan.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            ].filter(Boolean) as string[];

            for (const key of chanKeys) {
                const lowerKey = key.toLowerCase().trim();
                const normKey = lowerKey.replace(/[^a-z0-9]/g, '');

                if (xmlIdToNames.has(key) || xmlIdToNames.has(lowerKey)) {
                    const xmlId = xmlIdToNames.has(key) ? key : lowerKey;
                    if (!xmlIdToTargetKeys.has(xmlId)) xmlIdToTargetKeys.set(xmlId, new Set());
                    chanKeys.forEach(k => xmlIdToTargetKeys.get(xmlId)!.add(k));
                }

                const matchedXmlIds = nameToXmlIds.get(lowerKey) || nameToXmlIds.get(normKey);
                if (matchedXmlIds) {
                    for (const xmlId of matchedXmlIds) {
                        if (!xmlIdToTargetKeys.has(xmlId)) xmlIdToTargetKeys.set(xmlId, new Set());
                        chanKeys.forEach(k => xmlIdToTargetKeys.get(xmlId)!.add(k));
                    }
                }

                // Also allow direct XML programme channel attribute matching even if <channel> header was omitted
                if (!xmlIdToTargetKeys.has(key)) xmlIdToTargetKeys.set(key, new Set(chanKeys));
                if (!xmlIdToTargetKeys.has(lowerKey)) xmlIdToTargetKeys.set(lowerKey, new Set(chanKeys));
            }
        }

        updateEpgSyncStatus(libraryId, {
            status: 'saving',
            progressPercent: 60,
            message: `Extracting programmes for ${scopedChannels.length.toLocaleString()} channels...`
        });

        // Step 3: Stream through <programme ...> blocks with lightweight regex
        const epgItems: Array<{
            channelTvgId: string;
            title: string;
            description?: string;
            startTime: string;
            endTime: string;
        }> = [];

        // Keep programmes from 12 hours ago up to 7 days ahead to keep SQLite fast and compact
        const minTimeMs = Date.now() - 12 * 3600 * 1000;
        const maxTimeMs = Date.now() + 7 * 24 * 3600 * 1000;

        const progBlockRegex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
        let pMatch: RegExpExecArray | null;
        let rawProgCount = 0;

        while ((pMatch = progBlockRegex.exec(xmlData)) !== null) {
            rawProgCount++;
            const attrs = pMatch[1];
            const inner = pMatch[2];

            const chAttr = attrs.match(/\bchannel=["']([^"']+)["']/i)?.[1];
            const startAttr = attrs.match(/\bstart=["']([^"']+)["']/i)?.[1];
            const stopAttr = attrs.match(/\bstop=["']([^"']+)["']/i)?.[1];
            if (!chAttr || !startAttr || !stopAttr) continue;

            const channelId = decodeXmlEntities(chAttr);
            const targetKeys = xmlIdToTargetKeys.get(channelId) || xmlIdToTargetKeys.get(channelId.toLowerCase());

            // If user selected a specific shortlist/group scope and this channel isn't in scope, skip it!
            if (isScopedFilterActive && !targetKeys) {
                continue;
            }

            const startTime = parseXmltvDate(startAttr);
            const endTime = parseXmltvDate(stopAttr);
            const endMs = new Date(endTime).getTime();
            const startMs = new Date(startTime).getTime();
            if (endMs < minTimeMs || startMs > maxTimeMs) continue;

            const titleMatch = inner.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
            const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';
            if (!title) continue;

            const descMatch = inner.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i);
            const desc = descMatch ? decodeXmlEntities(descMatch[1]) : undefined;

            // 1. Always save under XMLTV channel ID (if within limit)
            epgItems.push({
                channelTvgId: channelId,
                title,
                description: desc || undefined,
                startTime,
                endTime
            });

            // 2. Also save under primary library channel identifiers (tvgId, cleanName, name)
            if (targetKeys) {
                const primaryAliases = Array.from(targetKeys).slice(0, 4);
                for (const targetKey of primaryAliases) {
                    if (targetKey && targetKey !== channelId) {
                        epgItems.push({
                            channelTvgId: targetKey,
                            title,
                            description: desc || undefined,
                            startTime,
                            endTime
                        });
                    }
                }
            }

            if (epgItems.length >= 160000) break;
        }

        console.log(`[EPG-SYNC] Parsed ${rawProgCount.toLocaleString()} raw XMLTV entries -> saving ${epgItems.length.toLocaleString()} matched programme records to local SQLite DB...`);

        if (epgItems.length > 0) {
            saveIptvEpg(libraryId, epgItems);
        }

        // Step 4: Scan DVR automation rules
        updateEpgSyncStatus(libraryId, {
            status: 'scanning_rules',
            progressPercent: 88,
            message: 'Scanning DVR recording rules against updated guide...',
            programCount: epgItems.length
        });

        const ruleMatches = scanDvrRulesForLibrary(libraryId);

        // Update library folders record with last sync timestamp: [streamUrl, epgUrl, intervalHours, lastSyncIso, scopeConfig]
        if (currentLib) {
            const intervalHours = currentLib.folders?.[2] || '24';
            const nowIso = new Date().toISOString();
            const effectiveScope = scopeConfig || currentLib.folders?.[4] || 'all';
            updateTheaterLibrary(libraryId, [streamUrl, epgUrl, intervalHours, nowIso, effectiveScope]);
        }

        console.log(`[${new Date().toISOString()}] ✅ [EPG-SYNC] Completed for "${libName}": ${epgItems.length.toLocaleString()} programmes stored locally, ${ruleMatches} DVR rules scheduled.`);

        return updateEpgSyncStatus(libraryId, {
            status: 'completed',
            progressPercent: 100,
            message: `Guide synced locally (${epgItems.length.toLocaleString()} programmes, ${ruleMatches} DVR matches)`,
            programCount: epgItems.length,
            ruleMatchesCount: ruleMatches,
            finishedAt: new Date().toISOString()
        });
    } catch (err: any) {
        console.error(`[${new Date().toISOString()}] ❌ [EPG-SYNC] Error for "${libName}":`, err?.message || err);
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
            const streamUrl = lib.folders?.[0] || '';
            const epgUrl = lib.folders?.[1] || deriveXtreamEpgUrl(streamUrl);
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
                    const scopeConfig = lib.folders?.[4] || 'all';
                    console.log(`[${new Date().toISOString()}] 📡 Scheduled EPG auto-sync starting for "${lib.name}" (${intervalHours}h interval | Scope: ${scopeConfig})...`);
                    executeEpgSync(lib.id, epgUrl, scopeConfig).catch(err =>
                        console.warn(`Scheduled EPG sync failed for ${lib.name}:`, err.message)
                    );
                }
            }
        }
    } catch (e) {
        console.warn('Error in checkAndRunScheduledEpgSyncs:', e);
    }
}

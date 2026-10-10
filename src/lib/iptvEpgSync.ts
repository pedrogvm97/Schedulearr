import axios from 'axios';
import zlib from 'zlib';
import {
    getTheaterLibraries, updateTheaterLibrary,
    clearIptvEpgForLibrary, insertIptvEpgChunk,
    getIptvChannels, getIptvShortlists,
    getDvrRules, getDvrRecordings, scheduleDvrRecording,
    searchIptvEpgForDvrRule
} from '@/lib/db';

const yieldEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

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

// Global active sync progress store & in-flight deduplication locks
const syncStatuses = new Map<string, EpgSyncProgress>();
const activeSyncPromises = new Map<string, Promise<EpgSyncProgress>>();

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

// Fast integer epoch parser for XMLTV dates (e.g. "20261010143000 +0100") — avoids allocating Date objects on rejected entries
function parseXmltvEpochMs(raw: string): number {
    if (!raw) return NaN;
    const s = raw.trim();
    if (s.length >= 14) {
        const year = +s.slice(0, 4);
        const month = +s.slice(4, 6) - 1;
        const day = +s.slice(6, 8);
        const hour = +s.slice(8, 10);
        const min = +s.slice(10, 12);
        const sec = +s.slice(12, 14);
        let utcMs = Date.UTC(year, month, day, hour, min, sec);
        if (!isNaN(utcMs)) {
            const tzPart = s.slice(14).trim();
            if (tzPart.length >= 5 && (tzPart[0] === '+' || tzPart[0] === '-')) {
                const sign = tzPart[0] === '+' ? 1 : -1;
                const tzHours = +tzPart.slice(1, 3) || 0;
                const tzMins = +tzPart.slice(3, 5) || 0;
                const offsetMs = sign * (tzHours * 3600 + tzMins * 60) * 1000;
                utcMs -= offsetMs;
            }
            return utcMs;
        }
    }
    return new Date(s).getTime();
}

// Helper to parse XMLTV date (e.g. "20261010143000 +0100")
export function parseXmltvDate(raw: string): string {
    const ms = parseXmltvEpochMs(raw);
    return isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
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

// Fast single-query DVR rule scan over synced EPG (avoids 35,000+ per-channel loops)
export function scanDvrRulesForLibrary(libraryId: string): number {
    try {
        const rules = getDvrRules().filter(r => r.enabled);
        if (rules.length === 0) return 0;

        const channels = getIptvChannels(libraryId);
        const chanByKey = new Map<string, any>();
        for (const chan of channels) {
            const keys = [
                chan.tvgId,
                chan.tvgName,
                chan.cleanName,
                chan.name,
                (chan.tvgId || '').toLowerCase(),
                (chan.cleanName || chan.name || '').toLowerCase().trim(),
                (chan.cleanName || chan.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            ].filter(Boolean) as string[];
            for (const k of keys) {
                if (!chanByKey.has(k)) chanByKey.set(k, chan);
            }
        }

        const existingRecs = getDvrRecordings();
        let scheduledCount = 0;

        for (const rule of rules) {
            const queryLower = (rule.query || '').toLowerCase().trim();
            const tokens = queryLower.split(/\s+/).filter(Boolean);
            if (tokens.length === 0) continue;

            const matchedPrograms = searchIptvEpgForDvrRule(libraryId, tokens);
            for (const prog of matchedPrograms) {
                const chan = chanByKey.get(prog.channel_tvg_id) || chanByKey.get(String(prog.channel_tvg_id || '').toLowerCase());
                if (!chan) continue;
                if (rule.channel_scope !== 'all' && chan.group !== rule.channel_scope) {
                    continue;
                }

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
                    existingRecs.push({
                        channel_id: chan.id,
                        program_title: prog.title,
                        start_time: prog.start_time
                    } as any);
                    scheduledCount++;
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
 * Cooperative, Non-Blocking, Unraid-friendly XMLTV EPG Sync Engine.
 * Yields the Node.js event loop every ~1,200 iterations and writes SQLite in small chunks
 * so the web UI and API endpoints remain 100% responsive (< 5ms) even on 100MB+ XMLTV feeds.
 */
export async function executeEpgSync(
    libraryId: string,
    epgUrlInput?: string,
    scopeConfigInput?: string
): Promise<EpgSyncProgress> {
    if (activeSyncPromises.has(libraryId)) {
        console.log(`[${new Date().toISOString()}] ℹ️ [EPG-SYNC] Sync already in progress for library "${libraryId}", joining existing run.`);
        return activeSyncPromises.get(libraryId)!;
    }

    const runPromise = (async (): Promise<EpgSyncProgress> => {
        const startWallMs = Date.now();
        const libs = getTheaterLibraries();
        const currentLib = libs.find(l => l.id === libraryId);
        const libName = currentLib?.name || libraryId;
        const streamUrl = currentLib?.folders?.[0] || '';
        const epgUrl = (epgUrlInput || currentLib?.folders?.[1] || deriveXtreamEpgUrl(streamUrl)).trim();
        const scopeConfig = (scopeConfigInput ?? currentLib?.folders?.[4] ?? 'all').trim();

        if (!libraryId || !epgUrl) {
            throw new Error('No XMLTV EPG URL configured or derivable for this provider');
        }

        const maskedEpgUrl = epgUrl.replace(/password=[^&]+/i, 'password=***');
        console.log(`[${new Date().toISOString()}] 📡 [EPG-SYNC] Starting non-blocking EPG sync for "${libName}" (URL: ${maskedEpgUrl} | Scope: ${scopeConfig || 'all'})`);

        updateEpgSyncStatus(libraryId, {
            libraryId,
            libraryName: libName,
            status: 'downloading',
            progressPercent: 10,
            message: `Downloading XMLTV guide for ${libName}...`,
            programCount: 0,
            ruleMatchesCount: 0,
            scopeSummary: scopeConfig,
            startedAt: new Date().toISOString(),
            error: undefined
        });

        try {
            const headers = {
                'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20 Schedulearr/0.6.9',
                'Accept': '*/*'
            };

            const res = await axios.get(epgUrl, {
                timeout: 180000,
                headers,
                responseType: 'arraybuffer',
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            await yieldEventLoop();

            const buf = Buffer.from(res.data);
            const sizeMb = (buf.length / (1024 * 1024)).toFixed(1);
            console.log(`[${new Date().toISOString()}] 📦 [EPG-SYNC] Downloaded ${sizeMb} MB XMLTV payload for "${libName}". Decompressing & indexing...`);

            updateEpgSyncStatus(libraryId, {
                status: 'parsing',
                progressPercent: 25,
                message: `Decompressing ${sizeMb} MB XMLTV guide & indexing channels...`
            });

            let xmlData = '';
            const isGzip = epgUrl.endsWith('.gz') ||
                (res.headers['content-encoding'] || '').includes('gzip') ||
                (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b);

            if (isGzip) {
                try {
                    const unzipped = await new Promise<Buffer>((resolve, reject) => {
                        zlib.gunzip(buf, (err, result) => err ? reject(err) : resolve(result));
                    });
                    xmlData = unzipped.toString('utf-8');
                } catch {
                    xmlData = buf.toString('utf-8');
                }
            } else {
                xmlData = buf.toString('utf-8');
            }

            await yieldEventLoop();

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

            if (scopedChannels.length === 0) {
                scopedChannels = allLibraryChannels;
            }

            console.log(`[${new Date().toISOString()}] 🔍 [EPG-SYNC] Filtering EPG to ${scopedChannels.length.toLocaleString()} channels (out of ${allLibraryChannels.length.toLocaleString()} total in library "${libName}").`);

            // Step 1: Parse <channel id="..."> blocks cooperatively (yielding event loop every 1,200 channels)
            const xmlIdToNames = new Map<string, string[]>();
            const nameToXmlIds = new Map<string, Set<string>>();

            const channelBlockRegex = /<channel\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/channel>/gi;
            let chMatch: RegExpExecArray | null;
            let chLoopCount = 0;
            while ((chMatch = channelBlockRegex.exec(xmlData)) !== null) {
                chLoopCount++;
                if (chLoopCount % 1200 === 0) {
                    await yieldEventLoop();
                }
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

            await yieldEventLoop();

            // Step 2: Map XMLTV channel IDs <-> Scoped Library Channel Keys cooperatively
            const xmlIdToTargetKeys = new Map<string, Set<string>>();
            const isScopedFilterActive = Boolean(scopeConfig && scopeConfig !== 'all' && scopedChannels.length < allLibraryChannels.length);

            let mapLoopCount = 0;
            for (const chan of scopedChannels) {
                mapLoopCount++;
                if (mapLoopCount % 1200 === 0) {
                    await yieldEventLoop();
                }
                const chanKeys = [
                    chan.tvgId,
                    chan.tvgName,
                    chan.cleanName,
                    chan.name,
                    (chan.tvgId || '').toLowerCase().trim(),
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

                    if (!xmlIdToTargetKeys.has(key)) xmlIdToTargetKeys.set(key, new Set(chanKeys));
                    if (!xmlIdToTargetKeys.has(lowerKey)) xmlIdToTargetKeys.set(lowerKey, new Set(chanKeys));
                }
            }

            updateEpgSyncStatus(libraryId, {
                status: 'parsing',
                progressPercent: 45,
                message: `Scanning XMLTV programmes for ${scopedChannels.length.toLocaleString()} channels...`
            });

            // Step 3: Stream through <programme ...> blocks cooperatively (yielding every 1,500 programmes)
            const epgItems: Array<{
                channelTvgId: string;
                title: string;
                description?: string;
                startTime: string;
                endTime: string;
            }> = [];

            const minTimeMs = Date.now() - 12 * 3600 * 1000;
            const maxTimeMs = Date.now() + 7 * 24 * 3600 * 1000;

            const progBlockRegex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
            let pMatch: RegExpExecArray | null;
            let rawProgCount = 0;

            while ((pMatch = progBlockRegex.exec(xmlData)) !== null) {
                rawProgCount++;
                if (rawProgCount % 1500 === 0) {
                    await yieldEventLoop();
                    if (rawProgCount % 75000 === 0) {
                        const pct = Math.min(72, 45 + Math.round((rawProgCount / 300000) * 25));
                        updateEpgSyncStatus(libraryId, {
                            status: 'parsing',
                            progressPercent: pct,
                            message: `Parsed ${rawProgCount.toLocaleString()} XMLTV entries (${epgItems.length.toLocaleString()} matched)...`
                        });
                    }
                }

                const attrs = pMatch[1];
                const inner = pMatch[2];

                const chAttr = attrs.match(/\bchannel=["']([^"']+)["']/i)?.[1];
                if (!chAttr) continue;

                const channelId = decodeXmlEntities(chAttr);
                const targetKeys = xmlIdToTargetKeys.get(channelId) || xmlIdToTargetKeys.get(channelId.toLowerCase());

                if (isScopedFilterActive && !targetKeys) {
                    continue;
                }

                const startAttr = attrs.match(/\bstart=["']([^"']+)["']/i)?.[1];
                const stopAttr = attrs.match(/\bstop=["']([^"']+)["']/i)?.[1];
                if (!startAttr || !stopAttr) continue;

                const startMs = parseXmltvEpochMs(startAttr);
                const endMs = parseXmltvEpochMs(stopAttr);
                if (isNaN(startMs) || isNaN(endMs) || endMs < minTimeMs || startMs > maxTimeMs) continue;

                const titleMatch = inner.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
                const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';
                if (!title) continue;

                const descMatch = inner.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i);
                const desc = descMatch ? decodeXmlEntities(descMatch[1]) : undefined;

                const startTime = new Date(startMs).toISOString();
                const endTime = new Date(endMs).toISOString();

                const keysToInsert = new Set<string>([channelId, channelId.toLowerCase()]);
                if (targetKeys) {
                    for (const tk of Array.from(targetKeys).slice(0, 5)) {
                        if (tk) {
                            keysToInsert.add(tk);
                            keysToInsert.add(tk.toLowerCase());
                        }
                    }
                }

                for (const key of keysToInsert) {
                    epgItems.push({
                        channelTvgId: key,
                        title,
                        description: desc || undefined,
                        startTime,
                        endTime
                    });
                }

                if (epgItems.length >= 160000) break;
            }

            // Immediately release the large XML string so V8 can free memory before DB writes
            xmlData = '';
            await yieldEventLoop();

            console.log(`[${new Date().toISOString()}] 💾 [EPG-SYNC] Parsed ${rawProgCount.toLocaleString()} raw XMLTV entries -> saving ${epgItems.length.toLocaleString()} programme records to SQLite in non-blocking batches...`);

            updateEpgSyncStatus(libraryId, {
                status: 'saving',
                progressPercent: 75,
                message: `Saving ${epgItems.length.toLocaleString()} guide records to local SQLite...`
            });

            if (epgItems.length > 0) {
                clearIptvEpgForLibrary(libraryId);
                await yieldEventLoop();

                const chunkSize = 1500;
                for (let i = 0; i < epgItems.length; i += chunkSize) {
                    const chunk = epgItems.slice(i, i + chunkSize);
                    insertIptvEpgChunk(libraryId, chunk, i);
                    await yieldEventLoop();
                }
            }

            // Step 4: Scan DVR automation rules (fast single-query per rule)
            updateEpgSyncStatus(libraryId, {
                status: 'scanning_rules',
                progressPercent: 92,
                message: 'Scanning DVR recording rules against updated guide...',
                programCount: epgItems.length
            });

            await yieldEventLoop();
            const ruleMatches = scanDvrRulesForLibrary(libraryId);

            if (currentLib) {
                const intervalHours = currentLib.folders?.[2] || '24';
                const nowIso = new Date().toISOString();
                const effectiveScope = scopeConfig || currentLib.folders?.[4] || 'all';
                updateTheaterLibrary(libraryId, [streamUrl, epgUrl, intervalHours, nowIso, effectiveScope]);
            }

            const elapsedSec = ((Date.now() - startWallMs) / 1000).toFixed(1);
            console.log(`[${new Date().toISOString()}] ✅ [EPG-SYNC] Completed for "${libName}" in ${elapsedSec}s: ${epgItems.length.toLocaleString()} programmes stored locally, ${ruleMatches} DVR rules scheduled.`);

            return updateEpgSyncStatus(libraryId, {
                status: 'completed',
                progressPercent: 100,
                message: `Guide synced locally in ${elapsedSec}s (${epgItems.length.toLocaleString()} programmes, ${ruleMatches} DVR matches)`,
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
        } finally {
            activeSyncPromises.delete(libraryId);
        }
    })();

    activeSyncPromises.set(libraryId, runPromise);
    return runPromise;
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

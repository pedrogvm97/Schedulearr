import { NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import zlib from 'zlib';
import xml2js from 'xml2js';
import { getIptvChannels, saveIptvChannels, StoredIptvChannel, saveIptvEpg, getIptvEpgForChannel, getTheaterLibraries, updateTheaterLibrary } from '@/lib/db';
import { executeEpgSync, parseXmltvDate } from '@/lib/iptvEpgSync';

export const dynamic = 'force-dynamic';

function detectQuality(name: string, group: string): { quality: string; label: string; cleanName: string; canonicalKey: string } {
    const raw = `${name} ${group}`.toLowerCase();
    let quality = 'SD';
    let label = 'SD';

    if (raw.includes('8k') || raw.includes('4320')) {
        quality = '8K';
        label = '8K';
    } else if (raw.includes('4k') || raw.includes('uhd') || raw.includes('2160')) {
        quality = '4K';
        label = '4K';
    } else if (raw.includes('fhd') || raw.includes('1080') || raw.includes('full hd') || raw.includes('1080p')) {
        quality = '1080p';
        label = 'FHD';
    } else if (raw.includes('hd') || raw.includes('720') || raw.includes('720p')) {
        quality = '720p';
        label = 'HD';
    } else if (raw.includes('hevc') || raw.includes('h265') || raw.includes('h.265')) {
        quality = '1080p';
        label = 'HEVC';
    } else if (raw.includes('raw') || raw.includes('50fps') || raw.includes('60fps')) {
        quality = '1080p';
        label = 'RAW';
    } else if (raw.includes('backup') || raw.includes('alt')) {
        quality = 'SD';
        label = 'Backup';
    }

    // Strip country/provider/language prefixes like "VO|", "PT:", "PT |", "|PT|", "[PT]", "MEO|", "NOS|", "PORTUGAL:", "ES:", "US:", "UK:"
    let cleanName = name
        .replace(/^(\s*\|?\s*(?:vo|vodafone|meo|nos|nowo|pt|uk|us|es|fr|de)\s*\|?\s*[:\-\|\/])+/i, '')
        .replace(/^(\s*\|[a-z0-9]+\|\s*)/i, '')
        .replace(/^(\[[a-z0-9]+\]|\([a-z0-9]+\))\s*/i, '')
        .replace(/^(\s*\|?\s*[a-z0-9]{2,4}\s*\|\s*)/i, '');

    // Clean channel name by stripping quality suffixes (e.g. "RTP 1 4K" -> "RTP 1")
    cleanName = cleanName
        .replace(/\b(8k|4k|uhd|fhd|hd|sd|hevc|h\.?265|1080p|720p|576p|480p|2160p|raw|backup|alt|50fps|60fps|vip)\b/gi, '')
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/[*#=\-_~+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || name.trim();

    // Canonical key for merging streams of the same channel across groups (e.g. "rtp 1")
    const canonicalKey = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');

    return { quality, label, cleanName, canonicalKey };
}

// ── Filter Out Decorative Category Headers / Pseudo-Channels ──
export function isDummyChannelOrHeader(name: string, url?: string, group?: string): boolean {
    if (!name) return true;
    const trimmed = name.trim();
    if (url) {
        const u = url.toLowerCase().trim();
        if (u === '#' || u === '' || u.endsWith('/dummy') || u.endsWith('/placeholder') || u.includes('example.com') || u.includes('0.0.0.0')) return true;
    }
    // Only drop if name is solely symbols (e.g. "########", "-------", "=======")
    if (/^[#*=\-_~+/\\<>:\s]{3,}$/.test(trimmed)) return true;

    // Drop decorative header patterns like "--- PT GENERALISTAS ---" or "=== CANAIS ==="
    if (/^[\-=*#\s]{2,}.+[\-=*#\s]{2,}$/.test(trimmed)) return true;

    // Drop pseudo-channels whose name is simply repeating the group / category name (e.g. "PT GENERALISTAS SD" in "PT| GENERALISTAS")
    if (group) {
        const normName = trimmed
            .toLowerCase()
            .replace(/\b(8k|4k|uhd|fhd|hd|sd|hevc|1080p|720p|576p|480p|2160p|raw|backup|alt)\b/gi, '')
            .replace(/[^a-z0-9]/g, '');
        const normGroup = group.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normName && normGroup && (normName === normGroup || (normGroup.includes(normName) && normName.length >= 6))) {
            return true;
        }
    }

    return false;
}

// ── Robust M3U Downloader (Handles Gzip, Large Buffers, Custom Encodings) ──
async function downloadM3uText(url: string): Promise<string> {
    const headers = { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.54' };
    const res = await axios.get(url, {
        timeout: 180000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        responseType: 'arraybuffer',
        headers
    });

    const buf = Buffer.from(res.data);
    if (url.endsWith('.gz') || (res.headers['content-encoding'] || '').includes('gzip') || (buf[0] === 0x1f && buf[1] === 0x8b)) {
        try {
            return zlib.gunzipSync(buf).toString('utf-8');
        } catch {
            return buf.toString('utf-8');
        }
    }
    return buf.toString('utf-8');
}

// ── Auto-Detect Xtream Codes Credentials from URL ──
function tryExtractXtream(urlStr: string): { host: string; username: string; password: string; output: string } | null {
    try {
        const u = new URL(urlStr);
        const username = u.searchParams.get('username');
        const password = u.searchParams.get('password');
        const output = u.searchParams.get('output') || 'ts';
        if (username && password) {
            const host = `${u.protocol}//${u.host}`;
            return { host, username, password, output };
        }
    } catch {
        return null;
    }
    return null;
}

// ── High-Speed Xtream Codes API Ingestion with M3U Fallback ──
async function fetchXtreamLiveChannels(
    xtream: { host: string; username: string; password: string; output: string },
    libraryId: string
): Promise<StoredIptvChannel[]> {
    const { host, username, password, output } = xtream;
    const catUrl = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_categories`;
    const streamUrl = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;

    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

    try {
        const [catRes, streamRes] = await Promise.all([
            axios.get(catUrl, { timeout: 30000, headers }).catch(() => ({ data: [] })),
            axios.get(streamUrl, { timeout: 75000, headers, maxContentLength: Infinity, maxBodyLength: Infinity })
        ]);

        const catMap: Record<string, string> = {};
        if (Array.isArray(catRes.data)) {
            for (const cat of catRes.data) {
                if (cat.category_id && cat.category_name) {
                    catMap[String(cat.category_id)] = String(cat.category_name).trim();
                }
            }
        }

        const streams = Array.isArray(streamRes.data) ? streamRes.data : [];
        if (streams.length > 0) {
            const rawChannels: Array<{
                id: string;
                name: string;
                cleanName: string;
                canonicalKey: string;
                logo?: string;
                group: string;
                tvgId?: string;
                tvgName?: string;
                url: string;
                quality: string;
                label: string;
            }> = [];

            let count = 0;
            for (const s of streams) {
                const rawName = s.name || `Channel ${++count}`;
                const streamPlayUrl = `${host}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${s.stream_id}.${output}`;
                const group = catMap[String(s.category_id)] || 'General';
                if (isDummyChannelOrHeader(rawName, streamPlayUrl, group)) continue;

                const { quality, label, cleanName, canonicalKey } = detectQuality(rawName, group);
                rawChannels.push({
                    id: `chan-${++count}`,
                    name: rawName,
                    cleanName,
                    canonicalKey,
                    logo: s.stream_icon || undefined,
                    group,
                    tvgId: s.epg_channel_id ? String(s.epg_channel_id) : (s.stream_id ? String(s.stream_id) : undefined),
                    tvgName: rawName,
                    url: streamPlayUrl,
                    quality,
                    label
                });
            }

            const mergedMap = new Map<string, StoredIptvChannel>();
            for (const raw of rawChannels) {
                const key = raw.canonicalKey || raw.cleanName.toLowerCase();
                if (!mergedMap.has(key)) {
                    mergedMap.set(key, {
                        id: `chan-${mergedMap.size + 1}`,
                        libraryId,
                        name: raw.cleanName,
                        cleanName: raw.cleanName,
                        logo: raw.logo,
                        group: raw.group,
                        tvgId: raw.tvgId,
                        tvgName: raw.tvgName,
                        streams: [{ url: raw.url, quality: raw.quality, label: `${raw.label} (${raw.name})` }]
                    });
                } else {
                    const existing = mergedMap.get(key)!;
                    if (!existing.streams.some(st => st.url === raw.url)) {
                        existing.streams.push({
                            url: raw.url,
                            quality: raw.quality,
                            label: `${raw.label} (${raw.name})`
                        });
                    }
                    if (!existing.logo && raw.logo) existing.logo = raw.logo;
                    if (!existing.tvgId && raw.tvgId) existing.tvgId = raw.tvgId;
                }
            }

            const qualityRank = (q: string) => {
                const l = (q || '').toLowerCase();
                if (l.includes('8k')) return 5;
                if (l.includes('4k') || l.includes('uhd') || l.includes('2160')) return 4;
                if (l.includes('fhd') || l.includes('1080') || l.includes('raw') || l.includes('hevc')) return 3;
                if (l.includes('hd') || l.includes('720')) return 2;
                return 1;
            };

            const finalChannels = Array.from(mergedMap.values());
            for (const ch of finalChannels) {
                ch.streams.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
            }
            if (finalChannels.length > 0) return finalChannels;
        }
    } catch (e: any) {
        console.warn('Xtream API fetch failed, falling back to direct M3U download:', e.message);
    }

    // Fallback: Direct M3U ingestion via get.php
    const fallbackM3uUrl = `${host}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=${output}`;
    try {
        const text = await downloadM3uText(fallbackM3uUrl);
        return parseM3uContent(text, libraryId);
    } catch (e: any) {
        console.error('Xtream direct M3U fallback error:', e.message);
        return [];
    }
}

function parseM3uContent(content: string, libraryId: string): StoredIptvChannel[] {
    const lines = content.split(/\r?\n/);
    const rawChannels: Array<{
        id: string;
        name: string;
        cleanName: string;
        canonicalKey: string;
        logo?: string;
        group: string;
        tvgId?: string;
        tvgName?: string;
        url: string;
        quality: string;
        label: string;
    }> = [];

    let currentInfo: any = null;
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
            const groupMatch = line.match(/group-title="([^"]+)"/i);
            const idMatch = line.match(/tvg-id="([^"]+)"/i);
            const tvgNameMatch = line.match(/tvg-name="([^"]+)"/i);
            const nameParts = line.split(',');
            const rawName = nameParts.length > 1 ? nameParts.slice(1).join(',').trim() : `Channel ${count + 1}`;
            const group = groupMatch ? groupMatch[1].trim() : 'General';

            const { quality, label, cleanName, canonicalKey } = detectQuality(rawName, group);

            if (!isDummyChannelOrHeader(rawName, undefined, group)) {
                currentInfo = {
                    id: `chan-${++count}`,
                    name: rawName,
                    cleanName,
                    canonicalKey,
                    logo: logoMatch ? logoMatch[1].trim() : undefined,
                    group,
                    tvgId: idMatch ? idMatch[1].trim() : undefined,
                    tvgName: tvgNameMatch ? tvgNameMatch[1].trim() : undefined,
                    quality,
                    label
                };
            }
        } else if (!line.startsWith('#') && currentInfo) {
            if (!isDummyChannelOrHeader(currentInfo.name, line, currentInfo.group)) {
                rawChannels.push({
                    ...currentInfo,
                    url: line
                });
            }
            currentInfo = null;
        }
    }

    // Merge duplicate channels by canonicalKey into redundant multi-stream channels
    const mergedMap = new Map<string, StoredIptvChannel>();

    for (const raw of rawChannels) {
        const key = raw.canonicalKey || raw.cleanName.toLowerCase();
        if (!mergedMap.has(key)) {
            mergedMap.set(key, {
                id: `chan-${mergedMap.size + 1}`,
                libraryId,
                name: raw.cleanName,
                cleanName: raw.cleanName,
                logo: raw.logo,
                group: raw.group,
                tvgId: raw.tvgId,
                tvgName: raw.tvgName,
                streams: [{ url: raw.url, quality: raw.quality, label: `${raw.label} (${raw.name})` }]
            });
        } else {
            const existing = mergedMap.get(key)!;
            if (!existing.streams.some(s => s.url === raw.url)) {
                existing.streams.push({
                    url: raw.url,
                    quality: raw.quality,
                    label: `${raw.label} (${raw.name})`
                });
            }
            if (!existing.logo && raw.logo) existing.logo = raw.logo;
            if (!existing.tvgId && raw.tvgId) existing.tvgId = raw.tvgId;
        }
    }

    const qualityRank = (q: string) => {
        const l = (q || '').toLowerCase();
        if (l.includes('8k')) return 5;
        if (l.includes('4k') || l.includes('uhd') || l.includes('2160')) return 4;
        if (l.includes('fhd') || l.includes('1080')) return 3;
        if (l.includes('hd') || l.includes('720')) return 2;
        return 1;
    };

    const finalChannels = Array.from(mergedMap.values());
    for (const ch of finalChannels) {
        ch.streams.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    }

    return finalChannels;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');
        const sourceUrl = searchParams.get('url');
        const filePath = searchParams.get('path');

        // 1. If libraryId provided and stored channels exist in DB
        let currentLib: any = null;
        if (libraryId) {
            const allLibs = getTheaterLibraries();
            currentLib = allLibs.find(l => l.id === libraryId);

            const stored = getIptvChannels(libraryId);
            if (stored && stored.length > 0) {
                // Perform smart canonical resolution merging on stored channels
                const mergedStoredMap = new Map<string, StoredIptvChannel>();
                for (const c of stored) {
                    const rawName = c.name || '';
                    const { cleanName, canonicalKey, quality, label } = detectQuality(rawName, c.group);
                    const key = canonicalKey || (c.cleanName || rawName).toLowerCase();

                    if (!mergedStoredMap.has(key)) {
                        const existingStreams = (c.streams && c.streams.length > 0)
                            ? [...c.streams]
                            : [{ url: (c as any).url || '', quality, label: `${label} (${rawName})` }];
                        mergedStoredMap.set(key, {
                            ...c,
                            name: cleanName || c.name,
                            cleanName: cleanName || c.cleanName || c.name,
                            streams: existingStreams
                        });
                    } else {
                        const existing = mergedStoredMap.get(key)!;
                        const existingStreams = existing.streams || [];
                        const incomingStreams = (c.streams && c.streams.length > 0)
                            ? c.streams
                            : [{ url: (c as any).url || '', quality, label: `${label} (${rawName})` }];

                        for (const is of incomingStreams) {
                            if (is.url && !existingStreams.some(s => s.url === is.url)) {
                                existingStreams.push(is);
                            }
                        }
                        existing.streams = existingStreams;
                        if (!existing.logo && c.logo) existing.logo = c.logo;
                        if (!existing.tvgId && c.tvgId) existing.tvgId = c.tvgId;
                    }
                }

                const qualityRank = (q: string) => {
                    const l = (q || '').toLowerCase();
                    if (l.includes('8k')) return 5;
                    if (l.includes('4k') || l.includes('uhd') || l.includes('2160')) return 4;
                    if (l.includes('fhd') || l.includes('1080') || l.includes('raw') || l.includes('hevc')) return 3;
                    if (l.includes('hd') || l.includes('720')) return 2;
                    return 1;
                };

                const consolidated = Array.from(mergedStoredMap.values());
                for (const ch of consolidated) {
                    if (ch.streams && ch.streams.length > 1) {
                        ch.streams.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
                    }
                }

                const groupCounts: Record<string, number> = {};
                for (const c of consolidated) {
                    groupCounts[c.group] = (groupCounts[c.group] || 0) + 1;
                }

                const groups = Object.keys(groupCounts).map(g => ({
                    name: g,
                    count: groupCounts[g]
                })).sort((a, b) => b.count - a.count);

                const epgUrl = currentLib?.folders?.[1] || '';

                return NextResponse.json({
                    total: consolidated.length,
                    groups,
                    epgUrl,
                    channels: consolidated.map(c => ({
                        id: c.id,
                        name: c.name,
                        cleanName: c.cleanName,
                        logo: c.logo
                            ? `/api/theater/iptv/logo?url=${encodeURIComponent(c.logo)}&name=${encodeURIComponent(c.cleanName || c.name)}`
                            : `/api/theater/iptv/logo?name=${encodeURIComponent(c.cleanName || c.name)}`,
                        rawLogo: c.logo,
                        group: c.group,
                        tvgId: c.tvgId,
                        url: c.streams[0]?.url || '',
                        streams: c.streams
                    }))
                });
            }
        }

        // 2. Ingest from URL or File (or library's stored folder source)
        const effectiveLibId = libraryId || 'default_iptv';
        const effectiveSourceUrl = sourceUrl || currentLib?.folders?.[0] || '';
        const effectiveFilePath = filePath || '';
        let channels: StoredIptvChannel[] = [];

        const xtreamCreds = effectiveSourceUrl ? tryExtractXtream(effectiveSourceUrl) : null;
        if (xtreamCreds) {
            channels = await fetchXtreamLiveChannels(xtreamCreds, effectiveLibId);
        } else if (effectiveSourceUrl && (effectiveSourceUrl.startsWith('http://') || effectiveSourceUrl.startsWith('https://'))) {
            const rawM3u = await downloadM3uText(effectiveSourceUrl);
            channels = parseM3uContent(rawM3u, effectiveLibId);
        } else if (effectiveFilePath && fs.existsSync(effectiveFilePath)) {
            const rawM3u = fs.readFileSync(effectiveFilePath, 'utf8');
            channels = parseM3uContent(rawM3u, effectiveLibId);
        } else {
            // If library exists but has no source URL yet, return empty list gracefully
            return NextResponse.json({
                total: 0,
                groups: [],
                epgUrl: currentLib?.folders?.[1] || '',
                channels: []
            });
        }

        if (libraryId && channels.length > 0) {
            saveIptvChannels(libraryId, channels);
        }

        const groupCounts: Record<string, number> = {};
        for (const c of channels) {
            groupCounts[c.group] = (groupCounts[c.group] || 0) + 1;
        }

        const groups = Object.keys(groupCounts).map(g => ({
            name: g,
            count: groupCounts[g]
        })).sort((a, b) => b.count - a.count);

        return NextResponse.json({
            total: channels.length,
            groups,
            epgUrl: currentLib?.folders?.[1] || '',
            channels: channels.map(c => ({
                id: c.id,
                name: c.name,
                cleanName: c.cleanName,
                logo: c.logo
                    ? `/api/theater/iptv/logo?url=${encodeURIComponent(c.logo)}&name=${encodeURIComponent(c.cleanName || c.name)}`
                    : `/api/theater/iptv/logo?name=${encodeURIComponent(c.cleanName || c.name)}`,
                rawLogo: c.logo,
                group: c.group,
                tvgId: c.tvgId,
                url: c.streams[0]?.url || '',
                streams: c.streams
            }))
        });
    } catch (error: any) {
        console.error('API /theater/iptv error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ── POST: Handle File Upload, Xtream API, or Raw M3U Parsing & Storing ──
export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const libraryId = (formData.get('libraryId') as string) || `iptv_${Date.now()}`;
        const file = formData.get('file') as File | null;
        const url = formData.get('url') as string | null;
        const rawContent = formData.get('content') as string | null;
        let epgUrl = formData.get('epgUrl') as string | null;

        let parsedChannels: StoredIptvChannel[] = [];
        const xtreamCreds = url ? tryExtractXtream(url) : null;

        if (xtreamCreds) {
            // Auto-deduce XMLTV EPG URL if not provided
            if (!epgUrl) {
                epgUrl = `${xtreamCreds.host}/xmltv.php?username=${encodeURIComponent(xtreamCreds.username)}&password=${encodeURIComponent(xtreamCreds.password)}`;
            }
            parsedChannels = await fetchXtreamLiveChannels(xtreamCreds, libraryId);
        } else {
            let m3uText = '';
            if (file) {
                const buffer = await file.arrayBuffer();
                m3uText = Buffer.from(buffer).toString('utf-8');
            } else if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                m3uText = await downloadM3uText(url);
            } else if (rawContent) {
                m3uText = rawContent;
            } else {
                return NextResponse.json({ error: 'Please upload an M3U file or enter a valid URL.' }, { status: 400 });
            }

            // Also check if M3U header has url-tvg
            if (!epgUrl) {
                const tvgMatch = m3uText.match(/url-tvg="([^"]+)"/i) || m3uText.match(/x-tvg-url="([^"]+)"/i);
                if (tvgMatch) epgUrl = tvgMatch[1].trim();
            }

            parsedChannels = parseM3uContent(m3uText, libraryId);
        }

        if (parsedChannels.length === 0) {
            return NextResponse.json({ error: 'No valid channels found in the provided M3U playlist.' }, { status: 422 });
        }

        saveIptvChannels(libraryId, parsedChannels);

        // Update library folders to store [streamUrl, epgUrl]
        if (libraryId) {
            const allLibs = getTheaterLibraries();
            const currentLib = allLibs.find(l => l.id === libraryId);
            if (currentLib) {
                const streamSource = url || currentLib.folders?.[0] || 'local_file_upload';
                const folders = [streamSource, epgUrl || ''];
                updateTheaterLibrary(libraryId, folders);
            }
        }

        // Kick off background EPG sync if EPG URL available
        if (epgUrl) {
            executeEpgSync(libraryId, epgUrl).catch(e => console.warn('Background EPG sync notice:', e.message));
        }

        return NextResponse.json({
            success: true,
            libraryId,
            totalChannels: parsedChannels.length,
            groupsCount: new Set(parsedChannels.map(c => c.group)).size,
            epgUrl: epgUrl || null
        });
    } catch (error: any) {
        console.error('API /theater/iptv POST error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ── PUT: Update EPG URL or Re-sync Channels/Guide for an Existing Provider ──
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { libraryId, epgUrl, resyncChannels, streamUrl } = body;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const allLibs = getTheaterLibraries();
        const currentLib = allLibs.find(l => l.id === libraryId);
        if (!currentLib) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }

        const activeStreamUrl = streamUrl || currentLib.folders?.[0] || '';
        const activeEpgUrl = typeof epgUrl === 'string' ? epgUrl.trim() : (currentLib.folders?.[1] || '');

        updateTheaterLibrary(libraryId, [activeStreamUrl, activeEpgUrl]);

        let syncedEpgCount = 0;
        if (activeEpgUrl) {
            const syncRes = await executeEpgSync(libraryId, activeEpgUrl);
            syncedEpgCount = syncRes.programCount;
        }

        let channelCount = 0;
        if (resyncChannels && activeStreamUrl) {
            const xtream = tryExtractXtream(activeStreamUrl);
            let channels: StoredIptvChannel[] = [];
            if (xtream) {
                channels = await fetchXtreamLiveChannels(xtream, libraryId);
            } else if (activeStreamUrl.startsWith('http://') || activeStreamUrl.startsWith('https://')) {
                const res = await axios.get(activeStreamUrl, {
                    timeout: 180000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.39' }
                });
                channels = parseM3uContent(res.data, libraryId);
            }
            if (channels.length > 0) {
                saveIptvChannels(libraryId, channels);
                channelCount = channels.length;
            }
        }

        return NextResponse.json({
            success: true,
            libraryId,
            epgUrl: activeEpgUrl,
            syncedEpgCount,
            channelCount: channelCount || undefined
        });
    } catch (error: any) {
        console.error('API /theater/iptv PUT error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

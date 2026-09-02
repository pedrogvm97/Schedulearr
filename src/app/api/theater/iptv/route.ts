import { NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import zlib from 'zlib';
import xml2js from 'xml2js';
import { getIptvChannels, saveIptvChannels, StoredIptvChannel, saveIptvEpg, getIptvEpgForChannel, getTheaterLibraries, updateTheaterLibrary } from '@/lib/db';
import { executeEpgSync, parseXmltvDate } from '@/lib/iptvEpgSync';

export const dynamic = 'force-dynamic';

function detectQuality(name: string, group: string): { quality: string; label: string; cleanName: string } {
    const raw = `${name} ${group}`.toLowerCase();
    let quality = 'SD';
    let label = 'SD';

    if (raw.includes('8k') || raw.includes('4320')) {
        quality = '8K';
        label = '8K UHD';
    } else if (raw.includes('4k') || raw.includes('uhd') || raw.includes('2160')) {
        quality = '4K';
        label = '4K UHD';
    } else if (raw.includes('fhd') || raw.includes('1080') || raw.includes('full hd')) {
        quality = '1080p';
        label = 'FHD';
    } else if (raw.includes('hd') || raw.includes('720')) {
        quality = '720p';
        label = 'HD';
    } else if (raw.includes('hevc') || raw.includes('h265')) {
        quality = '1080p';
        label = 'HEVC';
    }

    // Clean channel name by stripping quality suffixes (e.g. "RTP 1 4K" -> "RTP 1")
    const cleanName = name
        .replace(/\b(8k|4k|uhd|fhd|hd|sd|hevc|h\.?265|1080p|720p|576p|480p|2160p)\b/gi, '')
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim() || name;

    return { quality, label, cleanName };
}

// ── Filter Out Decorative Category Headers / Pseudo-Channels ──
export function isDummyChannelOrHeader(name: string, url?: string): boolean {
    if (!name) return true;
    const trimmed = name.trim();
    // 1. Matches lines with repeated symbols like ####### TITLE #######, === TITLE ===, --- TITLE ---, *** TITLE ***
    if (/^[#*=\-_~+/\\<>]{2,}.*[#*=\-_~+/\\<>]{2,}$/.test(trimmed)) return true;
    if (/^[#*=\-_~+/\\<>]{3,}/.test(trimmed) && trimmed.length < 50) return true;
    // 2. Decorative section words with symbols
    if (/^[\s\-_=|#*~:[\]()]+(vip|channels?|group|category|section|menu|info|welcome|advert|sponsor|vod|series|movies?)[\s\-_=|#*~:[\]()]+$/i.test(trimmed)) return true;
    // 3. URLs that are dummy/fake
    if (url) {
        const u = url.toLowerCase().trim();
        if (u === '#' || u.endsWith('/dummy') || u.endsWith('/placeholder') || u.includes('example.com') || u.includes('0.0.0.0') || u === 'http://' || u === 'https://') return true;
    }
    return false;
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

// ── High-Speed Xtream Codes API Ingestion (Loads 30,000+ channels in ~3.5s) ──
async function fetchXtreamLiveChannels(
    xtream: { host: string; username: string; password: string; output: string },
    libraryId: string
): Promise<StoredIptvChannel[]> {
    const { host, username, password, output } = xtream;
    const catUrl = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_categories`;
    const streamUrl = `${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;

    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

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
    const rawChannels: Array<{
        id: string;
        name: string;
        cleanName: string;
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
        if (isDummyChannelOrHeader(rawName, streamPlayUrl)) continue;

        const group = catMap[String(s.category_id)] || 'General';
        const { quality, label, cleanName } = detectQuality(rawName, group);
        rawChannels.push({
            id: `chan-${++count}`,
            name: rawName,
            cleanName,
            logo: s.stream_icon || undefined,
            group,
            tvgId: s.epg_channel_id ? String(s.epg_channel_id) : (s.stream_id ? String(s.stream_id) : undefined),
            tvgName: rawName,
            url: streamPlayUrl,
            quality,
            label
        });
    }

    // Merge duplicate channels by normalized cleanName into multi-stream channel
    const mergedMap = new Map<string, StoredIptvChannel>();
    for (const raw of rawChannels) {
        const key = `${raw.group}:::${raw.cleanName.toLowerCase()}`;
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

function parseM3uContent(content: string, libraryId: string): StoredIptvChannel[] {
    const lines = content.split(/\r?\n/);
    const rawChannels: Array<{
        id: string;
        name: string;
        cleanName: string;
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

            const { quality, label, cleanName } = detectQuality(rawName, group);

            if (!isDummyChannelOrHeader(rawName)) {
                currentInfo = {
                    id: `chan-${++count}`,
                    name: rawName,
                    cleanName,
                    logo: logoMatch ? logoMatch[1].trim() : undefined,
                    group,
                    tvgId: idMatch ? idMatch[1].trim() : undefined,
                    tvgName: tvgNameMatch ? tvgNameMatch[1].trim() : undefined,
                    quality,
                    label
                };
            }
        } else if (!line.startsWith('#') && currentInfo) {
            if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://') || line.startsWith('mms://')) {
                if (!isDummyChannelOrHeader(currentInfo.name, line)) {
                    rawChannels.push({
                        ...currentInfo,
                        url: line
                    });
                }
            }
            currentInfo = null;
        }
    }

    // Merge duplicate channels by normalized cleanName into redundant multi-stream channels
    const mergedMap = new Map<string, StoredIptvChannel>();

    for (const raw of rawChannels) {
        const key = `${raw.group}:::${raw.cleanName.toLowerCase()}`;
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
        if (libraryId) {
            const stored = getIptvChannels(libraryId);
            if (stored && stored.length > 0) {
                const groupCounts: Record<string, number> = {};
                for (const c of stored) {
                    groupCounts[c.group] = (groupCounts[c.group] || 0) + 1;
                }

                const groups = Object.keys(groupCounts).map(g => ({
                    name: g,
                    count: groupCounts[g]
                })).sort((a, b) => b.count - a.count);

                // Find library to return EPG url
                const allLibs = getTheaterLibraries();
                const currentLib = allLibs.find(l => l.id === libraryId);
                const epgUrl = currentLib?.folders?.[1] || '';

                return NextResponse.json({
                    total: stored.length,
                    groups,
                    epgUrl,
                    channels: stored.map(c => ({
                        id: c.id,
                        name: c.name,
                        cleanName: c.cleanName,
                        logo: c.logo ? `/api/theater/iptv/logo?url=${encodeURIComponent(c.logo)}` : undefined,
                        rawLogo: c.logo,
                        group: c.group,
                        tvgId: c.tvgId,
                        url: c.streams[0]?.url || '',
                        streams: c.streams
                    }))
                });
            }
        }

        // 2. Ingest from URL or File
        const effectiveLibId = libraryId || 'default_iptv';
        let channels: StoredIptvChannel[] = [];

        const xtreamCreds = sourceUrl ? tryExtractXtream(sourceUrl) : null;
        if (xtreamCreds) {
            channels = await fetchXtreamLiveChannels(xtreamCreds, effectiveLibId);
        } else if (sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
            const res = await axios.get(sourceUrl, {
                timeout: 180000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.39' },
                responseType: 'text'
            });
            channels = parseM3uContent(res.data, effectiveLibId);
        } else if (filePath && fs.existsSync(filePath)) {
            const rawM3u = fs.readFileSync(filePath, 'utf8');
            channels = parseM3uContent(rawM3u, effectiveLibId);
        } else {
            return NextResponse.json({ error: 'Valid M3U url, file path, or libraryId is required' }, { status: 400 });
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
            channels: channels.map(c => ({
                id: c.id,
                name: c.name,
                cleanName: c.cleanName,
                logo: c.logo ? `/api/theater/iptv/logo?url=${encodeURIComponent(c.logo)}` : undefined,
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
                const res = await axios.get(url, {
                    timeout: 180000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.39' },
                    responseType: 'text'
                });
                m3uText = res.data;
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

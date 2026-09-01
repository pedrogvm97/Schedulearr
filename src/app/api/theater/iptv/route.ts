import { NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import { getIptvChannels, saveIptvChannels, StoredIptvChannel, saveIptvEpg, getIptvEpgForChannel } from '@/lib/db';

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
        .replace(/\b(8k|4k|uhd|fhd|hd|sd|hevc|h\.?265|1080p|720p|576p|480p)\b/gi, '')
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim() || name;

    return { quality, label, cleanName };
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
        } else if (!line.startsWith('#') && currentInfo) {
            if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://') || line.startsWith('mms://')) {
                rawChannels.push({
                    ...currentInfo,
                    url: line
                });
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

    // Quality ranking sort for stream fallback hierarchy (Highest -> Lowest)
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

                return NextResponse.json({
                    total: stored.length,
                    groups,
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

        // 2. Fetch from URL or File
        let rawM3u = '';
        if (sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
            const res = await axios.get(sourceUrl, {
                timeout: 20000,
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.30' },
                responseType: 'text'
            });
            rawM3u = res.data;
        } else if (filePath && fs.existsSync(filePath)) {
            rawM3u = fs.readFileSync(filePath, 'utf8');
        } else {
            return NextResponse.json({ error: 'Valid M3U url, file path, or libraryId is required' }, { status: 400 });
        }

        const effectiveLibId = libraryId || 'default_iptv';
        const channels = parseM3uContent(rawM3u, effectiveLibId);

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

// ── POST: Handle File Upload or Raw M3U Parsing & Storing ──
export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const libraryId = (formData.get('libraryId') as string) || `iptv_${Date.now()}`;
        const file = formData.get('file') as File | null;
        const url = formData.get('url') as string | null;
        const rawContent = formData.get('content') as string | null;
        const epgUrl = formData.get('epgUrl') as string | null;

        let m3uText = '';

        if (file) {
            const buffer = await file.arrayBuffer();
            m3uText = Buffer.from(buffer).toString('utf-8');
        } else if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            const res = await axios.get(url, {
                timeout: 20000,
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 Schedulearr/0.5.30' },
                responseType: 'text'
            });
            m3uText = res.data;
        } else if (rawContent) {
            m3uText = rawContent;
        } else {
            return NextResponse.json({ error: 'Please upload an M3U file or enter a valid URL.' }, { status: 400 });
        }

        const parsedChannels = parseM3uContent(m3uText, libraryId);

        if (parsedChannels.length === 0) {
            return NextResponse.json({ error: 'No valid channels found in the provided M3U playlist.' }, { status: 422 });
        }

        saveIptvChannels(libraryId, parsedChannels);

        return NextResponse.json({
            success: true,
            libraryId,
            totalChannels: parsedChannels.length,
            groupsCount: new Set(parsedChannels.map(c => c.group)).size
        });
    } catch (error: any) {
        console.error('API /theater/iptv POST error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

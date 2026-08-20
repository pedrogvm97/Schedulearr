import { NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';

export const dynamic = 'force-dynamic';

interface IptvChannel {
    id: string;
    name: string;
    logo?: string;
    group: string;
    url: string;
}

function parseM3u(content: string): IptvChannel[] {
    const lines = content.split(/\r?\n/);
    const channels: IptvChannel[] = [];
    let currentInfo: Partial<IptvChannel> | null = null;
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
            const groupMatch = line.match(/group-title="([^"]+)"/i);
            const nameParts = line.split(',');
            const rawName = nameParts.length > 1 ? nameParts.slice(1).join(',').trim() : `Channel ${count + 1}`;

            currentInfo = {
                id: `chan-${++count}`,
                name: rawName,
                logo: logoMatch ? logoMatch[1] : undefined,
                group: groupMatch ? groupMatch[1] : 'General'
            };
        } else if (!line.startsWith('#') && currentInfo) {
            if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://')) {
                channels.push({
                    id: currentInfo.id || `chan-${count}`,
                    name: currentInfo.name || `Channel ${count}`,
                    logo: currentInfo.logo,
                    group: currentInfo.group || 'General',
                    url: line
                });
            }
            currentInfo = null;
        }
    }

    return channels;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const sourceUrl = searchParams.get('url');
        const filePath = searchParams.get('path');

        let rawM3u = '';

        if (sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
            const res = await axios.get(sourceUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
                },
                responseType: 'text'
            });
            rawM3u = res.data;
        } else if (filePath && fs.existsSync(filePath)) {
            rawM3u = fs.readFileSync(filePath, 'utf8');
        } else {
            return NextResponse.json({ error: 'Valid M3U url or path parameter is required' }, { status: 400 });
        }

        const channels = parseM3u(rawM3u);

        // Group counts
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
            channels
        });
    } catch (error: any) {
        console.error('API /theater/iptv error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { getIptvChannels, getIptvShortlists, StoredIptvChannel } from '@/lib/db';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const exportType = searchParams.get('type') || 'm3u';
        const libraryId = searchParams.get('libraryId') || 'default_iptv';
        const shortlistId = searchParams.get('shortlistId');

        // Resolve base URL for Plex clients
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3010';
        const proto = req.headers.get('x-forwarded-proto') || 'http';
        const baseUrl = `${proto}://${host}`;

        let channels: StoredIptvChannel[] = getIptvChannels(libraryId);

        // Filter by shortlist if specified
        if (shortlistId && shortlistId !== 'all') {
            const shortlists = getIptvShortlists(libraryId);
            const targetShortlist = shortlists.find(s => s.id === shortlistId);
            if (targetShortlist && Array.isArray(targetShortlist.channelIds)) {
                channels = channels.filter(c => targetShortlist.channelIds.includes(c.id));
            }
        }

        // ── 1. M3U Playlist Export for Plex Live TV DVR ──
        if (exportType === 'm3u') {
            let m3u = '#EXTM3U\n';

            for (let i = 0; i < channels.length; i++) {
                const c = channels[i];
                const channelNum = i + 1;
                const tvgId = c.tvgId || `chan_${channelNum}`;
                const tvgName = c.tvgName || c.name;
                const group = c.group || 'General';

                // Proxied Logo URL through Schedulearr with CORS headers for Plex
                const logo = c.logo
                    ? `${baseUrl}/api/theater/iptv/logo?url=${encodeURIComponent(c.logo)}`
                    : '';

                const primaryStream = c.streams?.[0]?.url || '';
                if (!primaryStream) continue;

                m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${logo}" group-title="${group}" tvg-chno="${channelNum}",${c.name}\n`;
                m3u += `${primaryStream}\n`;
            }

            return new Response(m3u, {
                status: 200,
                headers: {
                    'Content-Type': 'application/x-mpegurl; charset=utf-8',
                    'Content-Disposition': 'inline; filename="plex_channels.m3u"',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                }
            });
        }

        // ── 2. XMLTV EPG Guide Export for Plex Live TV DVR ──
        if (exportType === 'epg') {
            let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
            xml += '<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
            xml += '<tv generator-info-name="Schedulearr IPTV Engine">\n';

            // Channel headers
            for (let i = 0; i < channels.length; i++) {
                const c = channels[i];
                const tvgId = c.tvgId || `chan_${i + 1}`;
                const logo = c.logo
                    ? `${baseUrl}/api/theater/iptv/logo?url=${encodeURIComponent(c.logo)}`
                    : '';

                xml += `  <channel id="${tvgId}">\n`;
                xml += `    <display-name>${escapeXml(c.name)}</display-name>\n`;
                if (logo) {
                    xml += `    <icon src="${escapeXml(logo)}" />\n`;
                }
                xml += `  </channel>\n`;
            }

            // Programme schedules from iptv_epg table or dynamic 24/7 placeholder
            const now = new Date();
            const epgRows = db.prepare(`
                SELECT * FROM iptv_epg 
                WHERE library_id = ?
                ORDER BY start_time ASC
            `).all(libraryId) as any[];

            if (epgRows && epgRows.length > 0) {
                for (const prog of epgRows) {
                    const startFormatted = formatXmltvDate(new Date(prog.start_time));
                    const endFormatted = formatXmltvDate(new Date(prog.end_time));

                    xml += `  <programme start="${startFormatted}" stop="${endFormatted}" channel="${prog.channel_tvg_id}">\n`;
                    xml += `    <title lang="en">${escapeXml(prog.title)}</title>\n`;
                    if (prog.description) {
                        xml += `    <desc lang="en">${escapeXml(prog.description)}</desc>\n`;
                    }
                    xml += `  </programme>\n`;
                }
            } else {
                // Generate 24-hour continuous live programming blocks for channels without static XMLTV
                for (let i = 0; i < channels.length; i++) {
                    const c = channels[i];
                    const tvgId = c.tvgId || `chan_${i + 1}`;

                    // Create four 6-hour blocks for today and tomorrow
                    for (let h = 0; h < 48; h += 3) {
                        const blockStart = new Date(now.getTime() + (h - 3) * 3600 * 1000);
                        const blockEnd = new Date(blockStart.getTime() + 3 * 3600 * 1000);
                        const startStr = formatXmltvDate(blockStart);
                        const endStr = formatXmltvDate(blockEnd);

                        xml += `  <programme start="${startStr}" stop="${endStr}" channel="${tvgId}">\n`;
                        xml += `    <title lang="en">${escapeXml(c.name)} Live Broadcast</title>\n`;
                        xml += `    <desc lang="en">Live streaming on ${escapeXml(c.name)} (${c.group}).</desc>\n`;
                        xml += `  </programme>\n`;
                    }
                }
            }

            xml += '</tv>\n';

            return new Response(xml, {
                status: 200,
                headers: {
                    'Content-Type': 'application/xml; charset=utf-8',
                    'Content-Disposition': 'inline; filename="plex_epg.xml"',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                }
            });
        }

        return NextResponse.json({ error: 'Invalid export type. Use ?type=m3u or ?type=epg' }, { status: 400 });
    } catch (error: any) {
        console.error('API /theater/iptv/plex error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function escapeXml(unsafe: string): string {
    return (unsafe || '').replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function formatXmltvDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getUTCFullYear();
    const month = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    const hours = pad(d.getUTCHours());
    const minutes = pad(d.getUTCMinutes());
    const seconds = pad(d.getUTCSeconds());
    return `${year}${month}${day}${hours}${minutes}${seconds} +0000`;
}

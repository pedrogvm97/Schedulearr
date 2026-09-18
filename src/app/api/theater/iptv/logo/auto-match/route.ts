import { NextRequest, NextResponse } from 'next/server';
import { getIptvChannels, batchUpdateIptvChannelLogos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KNOWN_CHANNEL_LOGOS: Record<string, string> = {
    'rtp 1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-1-pt.png',
    'rtp 2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-2-pt.png',
    'rtp 3': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-3-pt.png',
    'rtp memoria': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-memoria-pt.png',
    'rtp acores': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-acores-pt.png',
    'rtp madeira': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-madeira-pt.png',
    'rtp africa': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-africa-pt.png',
    'rtp internacional': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/rtp-internacional-pt.png',
    'sic': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sic-pt.png',
    'sic noticias': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sic-noticias-pt.png',
    'sic radical': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sic-radical-pt.png',
    'sic mulher': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sic-mulher-pt.png',
    'sic caras': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sic-caras-pt.png',
    'sic k': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sic-k-pt.png',
    'sic novelas': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sic-novelas-pt.png',
    'tvi': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/tvi-pt.png',
    'tvi reality': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/tvi-reality-pt.png',
    'tvi ficcao': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/tvi-ficcao-pt.png',
    'cnn portugal': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/cnn-portugal-pt.png',
    'cmtv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/cmtv-pt.png',
    'sport tv 1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sport-tv-1-pt.png',
    'sport tv 2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sport-tv-2-pt.png',
    'sport tv 3': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sport-tv-3-pt.png',
    'sport tv 4': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sport-tv-4-pt.png',
    'sport tv 5': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sport-tv-5-pt.png',
    'sport tv 6': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sport-tv-6-pt.png',
    'sport tv +': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sport-tv-plus-pt.png',
    'canal 11': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/canal-11-pt.png',
    'canal hollywood': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/canal-hollywood-pt.png',
    'star channel': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/star-channel-pt.png',
    'axn': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/axn-pt.png',
    'axn white': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/axn-white-pt.png',
    'axn movies': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/axn-movies-pt.png',
    'discovery': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/discovery-channel-pt.png',
    'national geographic': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/national-geographic-pt.png',
    'canal historia': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/canal-historia-pt.png',
    'odisseia': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/odisseia-pt.png',
    'canal panda': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/canal-panda-pt.png',
    'cartoon network': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/cartoon-network-pt.png',
    'disney channel': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/disney-channel-pt.png',
    'globo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/globo-pt.png',
    'porto canal': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/porto-canal-pt.png',
    'btv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/btv-pt.png',
    'sporting tv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/sporting-tv-pt.png',
    'dazn 1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/dazn-1-pt.png',
    'dazn 2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/dazn-2-pt.png',
    'dazn 3': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/dazn-3-pt.png',
    'dazn 4': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/dazn-4-pt.png',
    'dazn 5': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/dazn-5-pt.png',
    'dazn 6': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/dazn-6-pt.png',
    'eurosport 1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/eurosport-1-pt.png',
    'eurosport 2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/portugal/eurosport-2-pt.png',
    'bbc one': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/bbc-one-uk.png',
    'bbc two': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/bbc-two-uk.png',
    'itv 1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/itv-1-uk.png',
    'channel 4': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/channel-4-uk.png',
    'sky sports main event': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-main-event-uk.png',
    'sky sports premier league': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-premier-league-uk.png',
    'sky sports football': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-football-uk.png',
    'sky sports f1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-f1-uk.png',
    'tnt sports 1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/tnt-sports-1-uk.png',
    'tnt sports 2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/tnt-sports-2-uk.png',
    'hbo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/hbo-us.png',
    'espn': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
    'espn 2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-2-us.png'
};

function cleanChannelName(str: string): string {
    return (str || '')
        .toLowerCase()
        .replace(/^(\s*\|?\s*(?:vo|vodafone|meo|nos|nowo|pt|uk|us|es|fr|de|br)\s*\|?\s*[:\-\|\/])+/i, '')
        .replace(/^(\s*\|[a-z0-9]+\|\s*)/i, '')
        .replace(/^(\[[a-z0-9]+\]|\([a-z0-9]+\))\s*/i, '')
        .replace(/\b(8k|4k|uhd|fhd|hd|sd|hevc|h\.?265|1080p|720p|576p|480p|2160p|raw|backup|alt|50fps|60fps|vip|feed)\b/gi, '')
        .replace(/[\[\]\(\)\-_:]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { libraryId } = body;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        const channels = getIptvChannels(libraryId);
        if (!channels || channels.length === 0) {
            return NextResponse.json({ matchedCount: 0, totalChannels: 0 });
        }

        const updates: Array<{ id: string; logo: string; name: string }> = [];

        for (const ch of channels) {
            // If channel doesn't have a logo or has a generic/dummy logo
            const needsLogo = !ch.logo || ch.logo.includes('placeholder') || ch.logo.includes('dummy');
            if (needsLogo) {
                const cleaned = cleanChannelName(ch.cleanName || ch.name);
                
                // Match against known TV logos
                let matchedLogo = KNOWN_CHANNEL_LOGOS[cleaned];
                if (!matchedLogo) {
                    for (const [key, url] of Object.entries(KNOWN_CHANNEL_LOGOS)) {
                        if (cleaned === key || cleaned.startsWith(key + ' ') || cleaned.endsWith(' ' + key)) {
                            matchedLogo = url;
                            break;
                        }
                    }
                }

                if (matchedLogo) {
                    updates.push({
                        id: ch.id,
                        logo: matchedLogo,
                        name: ch.name
                    });
                }
            }
        }

        let updatedCount = 0;
        if (updates.length > 0) {
            updatedCount = batchUpdateIptvChannelLogos(
                libraryId,
                updates.map(u => ({ id: u.id, logo: u.logo }))
            );
        }

        return NextResponse.json({
            success: true,
            totalChannels: channels.length,
            matchedCount: updatedCount,
            updatedChannels: updates
        });
    } catch (e: any) {
        console.error('Error auto-matching channel logos:', e);
        return NextResponse.json({ error: e.message || 'Error auto-matching channel logos' }, { status: 500 });
    }
}

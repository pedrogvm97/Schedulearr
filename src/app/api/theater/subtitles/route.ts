import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const dynamic = 'force-dynamic';

function srtToVtt(srtContent: string): string {
    // Remove BOM and normalize line breaks
    let clean = srtContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let vtt = 'WEBVTT\n\n' + clean.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
    return vtt;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query');
        const lang = (searchParams.get('lang') || 'all').toLowerCase();
        const videoPath = searchParams.get('videoPath');
        const fetchVttPath = searchParams.get('fetchVttPath');
        const remoteSubUrl = searchParams.get('remoteSubUrl');

        // 1. Convert and serve a local or remote subtitle as WebVTT
        if (fetchVttPath) {
            if (!fs.existsSync(fetchVttPath)) {
                return new NextResponse('Subtitle not found', { status: 404 });
            }
            const content = fs.readFileSync(fetchVttPath, 'utf8');
            const vtt = fetchVttPath.endsWith('.vtt') ? content : srtToVtt(content);
            return new NextResponse(vtt, {
                headers: {
                    'Content-Type': 'text/vtt; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        }

        if (remoteSubUrl) {
            try {
                const res = await axios.get(remoteSubUrl, { timeout: 12000, responseType: 'text' });
                const content = res.data;
                const vtt = remoteSubUrl.endsWith('.vtt') ? content : srtToVtt(String(content));
                return new NextResponse(vtt, {
                    headers: {
                        'Content-Type': 'text/vtt; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, OPTIONS',
                        'Cache-Control': 'public, max-age=3600'
                    }
                });
            } catch (err: any) {
                return new NextResponse(`Failed to fetch remote subtitle: ${err.message}`, { status: 500 });
            }
        }

        // 2. Discover local companion subtitles next to the video
        let localSubtitles: any[] = [];
        if (videoPath && fs.existsSync(videoPath)) {
            try {
                const dir = path.dirname(videoPath);
                const videoBase = path.basename(videoPath, path.extname(videoPath)).toLowerCase();
                const files = fs.readdirSync(dir);

                for (const f of files) {
                    const ext = path.extname(f).toLowerCase();
                    if (['.srt', '.vtt', '.sub', '.ass'].includes(ext)) {
                        const subBase = path.basename(f, ext).toLowerCase();
                        if (subBase.startsWith(videoBase) || files.length < 15) {
                            let language = 'English';
                            let langCode = 'en';

                            if (subBase.includes('.pt') || subBase.includes('por') || subBase.includes('bra')) { language = 'Portuguese'; langCode = 'pt'; }
                            else if (subBase.includes('.es') || subBase.includes('spa')) { language = 'Spanish'; langCode = 'es'; }
                            else if (subBase.includes('.fr') || subBase.includes('fre')) { language = 'French'; langCode = 'fr'; }
                            else if (subBase.includes('.de') || subBase.includes('ger')) { language = 'German'; langCode = 'de'; }
                            else if (subBase.includes('.it') || subBase.includes('ita')) { language = 'Italian'; langCode = 'it'; }
                            else if (subBase.includes('.nl') || subBase.includes('dut')) { language = 'Dutch'; langCode = 'nl'; }
                            else if (subBase.includes('.pl') || subBase.includes('pol')) { language = 'Polish'; langCode = 'pl'; }
                            else if (subBase.includes('.ru') || subBase.includes('rus')) { language = 'Russian'; langCode = 'ru'; }

                            if (lang === 'all' || lang === langCode || language.toLowerCase().includes(lang)) {
                                localSubtitles.push({
                                    id: `local-${f}`,
                                    title: f,
                                    language,
                                    source: 'Local Storage',
                                    vttUrl: `/api/theater/subtitles?fetchVttPath=${encodeURIComponent(path.join(dir, f))}`
                                });
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        // 3. Online Subtitle Search via OpenSubtitles / SubDL mirrors
        let onlineSubtitles: any[] = [];
        if (query) {
            const cleanQuery = query
                .replace(/\b(1080p|720p|2160p|4k|hdr|bluray|web-dl|x264|x265|hevc|aac|dts)\b/gi, '')
                .replace(/[._\-]/g, ' ')
                .trim();

            const targetLang = lang === 'all' ? 'en' : lang;

            // Provider 1: SubDL Public Search API
            try {
                const subdlUrl = `https://api.subdl.com/api/v1/subtitles?film_name=${encodeURIComponent(cleanQuery)}&languages=${targetLang}`;
                const subdlRes = await axios.get(subdlUrl, { timeout: 6000 });
                if (subdlRes.data?.subtitles && Array.isArray(subdlRes.data.subtitles)) {
                    for (const sub of subdlRes.data.subtitles.slice(0, 15)) {
                        const fullUrl = `https://dl.subdl.com${sub.url}`;
                        onlineSubtitles.push({
                            id: `subdl-${sub.id || Math.random()}`,
                            title: sub.release_name || sub.name || `${cleanQuery} (${sub.language || targetLang})`,
                            language: sub.language || targetLang.toUpperCase(),
                            source: 'SubDL',
                            vttUrl: `/api/theater/subtitles?remoteSubUrl=${encodeURIComponent(fullUrl)}`
                        });
                    }
                }
            } catch (e: any) {
                console.warn('SubDL search failed, trying fallback provider:', e.message);
            }

            // Provider 2: OpenSubtitles REST API mirror
            if (onlineSubtitles.length === 0) {
                try {
                    const osUrl = `https://opensubtitles-v3.strem.fun/subtitles/movie/${encodeURIComponent(cleanQuery)}.json`;
                    const osRes = await axios.get(osUrl, { timeout: 5000 });
                    if (osRes.data?.subtitles && Array.isArray(osRes.data.subtitles)) {
                        for (const sub of osRes.data.subtitles.slice(0, 15)) {
                            if (lang === 'all' || sub.lang === targetLang || sub.lang === lang) {
                                onlineSubtitles.push({
                                    id: `os-${sub.id || Math.random()}`,
                                    title: sub.url ? path.basename(sub.url) : `${cleanQuery} Subtitle`,
                                    language: (sub.lang || targetLang).toUpperCase(),
                                    source: 'OpenSubtitles',
                                    vttUrl: `/api/theater/subtitles?remoteSubUrl=${encodeURIComponent(sub.url)}`
                                });
                            }
                        }
                    }
                } catch (e: any) {
                    console.warn('OpenSubtitles fallback failed:', e.message);
                }
            }
        }

        return NextResponse.json({
            local: localSubtitles,
            online: onlineSubtitles
        });
    } catch (error: any) {
        console.error('API /theater/subtitles error:', error);
        return NextResponse.json({ error: error.message, local: [], online: [] }, { status: 500 });
    }
}

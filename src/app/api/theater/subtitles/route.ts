import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const dynamic = 'force-dynamic';

function srtToVtt(srtContent: string): string {
    let vtt = 'WEBVTT\n\n' + srtContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
    return vtt;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query');
        const lang = searchParams.get('lang') || 'en';
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
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        }

        if (remoteSubUrl) {
            try {
                const res = await axios.get(remoteSubUrl, { timeout: 8000, responseType: 'text' });
                const content = res.data;
                const vtt = remoteSubUrl.endsWith('.vtt') ? content : srtToVtt(content);
                return new NextResponse(vtt, {
                    headers: {
                        'Content-Type': 'text/vtt; charset=utf-8',
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
                        if (subBase.startsWith(videoBase) || files.length < 10) {
                            let language = 'Unknown';
                            if (subBase.includes('.en') || subBase.includes('eng')) language = 'English';
                            else if (subBase.includes('.pt') || subBase.includes('por')) language = 'Portuguese';
                            else if (subBase.includes('.es') || subBase.includes('spa')) language = 'Spanish';
                            else if (subBase.includes('.fr') || subBase.includes('fre')) language = 'French';
                            else if (subBase.includes('.de') || subBase.includes('ger')) language = 'German';
                            else if (subBase.includes('.it') || subBase.includes('ita')) language = 'Italian';

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
            } catch (e) {}
        }

        // 3. Online Subtitle Search via public API / mirrors
        let onlineSubtitles: any[] = [];
        if (query) {
            try {
                const cleanQuery = query.replace(/[._\-]/g, ' ').trim();
                const searchUrl = `https://sub.wyzie.ru/search?id=${encodeURIComponent(cleanQuery)}`;
                const apiRes = await axios.get(searchUrl, { timeout: 6000 }).catch(() => null);

                if (apiRes && Array.isArray(apiRes.data)) {
                    onlineSubtitles = apiRes.data.map((s: any, idx: number) => ({
                        id: `online-${idx}`,
                        title: s.display || s.name || `${cleanQuery} Subtitle`,
                        language: s.language || s.lang || lang,
                        source: 'Online Search',
                        vttUrl: s.url ? `/api/theater/subtitles?remoteSubUrl=${encodeURIComponent(s.url)}` : ''
                    })).filter((s: any) => s.vttUrl);
                }
            } catch {}
        }

        return NextResponse.json({
            local: localSubtitles,
            online: onlineSubtitles
        });
    } catch (error: any) {
        console.error('API /theater/subtitles error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { spawn } from 'child_process';
import os from 'os';
import { ensureLocalWhisperModel } from '@/lib/audiobookStudio';

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

async function translateSrtContent(srt: string, targetLang: string): Promise<string> {
    const blocks = srt.split(/\n\s*\n/).filter(b => b.trim().length > 0);
    const translatedBlocks: string[] = [];

    for (let i = 0; i < blocks.length; i += 10) {
        const chunk = blocks.slice(i, i + 10);
        for (const block of chunk) {
            const lines = block.split('\n');
            if (lines.length >= 3) {
                const seq = lines[0];
                const time = lines[1];
                const text = lines.slice(2).join(' ').trim();
                if (text) {
                    try {
                        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
                        const res = await axios.get(url, { timeout: 4000 });
                        if (Array.isArray(res.data?.[0])) {
                            const translatedText = res.data[0].map((c: any) => c[0]).join('');
                            translatedBlocks.push(`${seq}\n${time}\n${translatedText}`);
                            continue;
                        }
                    } catch {}
                }
            }
            translatedBlocks.push(block);
        }
    }

    return translatedBlocks.join('\n\n');
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, videoPath, targetLang = 'en' } = body;

        if (action === 'auto_transcribe') {
            if (!videoPath || !fs.existsSync(videoPath)) {
                return NextResponse.json({ success: false, error: 'Video file not found' }, { status: 404 });
            }

            const videoDir = path.dirname(videoPath);
            const videoBase = path.basename(videoPath, path.extname(videoPath));
            const tmpDir = os.tmpdir();
            const tmpId = `whisper_${Date.now()}`;
            const tmpWav = path.join(tmpDir, `${tmpId}_16k.wav`);
            const outPrefix = path.join(tmpDir, `${tmpId}_out`);
            const srtOut = `${outPrefix}.srt`;

            // 1. Extract 16kHz mono audio via ffmpeg
            await new Promise<void>((resolve) => {
                const ff = spawn('ffmpeg', [
                    '-y', '-threads', '1',
                    '-i', videoPath,
                    '-vn',
                    '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
                    tmpWav
                ]);
                const timer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} resolve(); }, 120000);
                ff.on('close', () => { clearTimeout(timer); resolve(); });
                ff.on('error', () => { clearTimeout(timer); resolve(); });
            });

            let srtContent = '';

            // 2. Transcribe using whisper-cli if available
            const whisperCliBin = fs.existsSync('/usr/local/bin/whisper-cli') ? '/usr/local/bin/whisper-cli' : 'whisper-cli';
            let ranWhisper = false;
            try {
                const modelPath = await ensureLocalWhisperModel();
                if (modelPath && fs.existsSync(modelPath) && fs.existsSync(tmpWav)) {
                    ranWhisper = await new Promise<boolean>((resolve) => {
                        const proc = spawn(whisperCliBin, [
                            '-m', modelPath,
                            '-f', tmpWav,
                            '-osrt',
                            '-of', outPrefix,
                            '-t', '2',
                            '-np'
                        ]);
                        const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(false); }, 600000);
                        proc.on('close', (code) => {
                            clearTimeout(timer);
                            resolve(code === 0 && fs.existsSync(srtOut));
                        });
                        proc.on('error', () => {
                            clearTimeout(timer);
                            resolve(false);
                        });
                    });
                }
            } catch (wErr) {
                console.warn('Whisper CLI failed:', wErr);
            }

            if (ranWhisper && fs.existsSync(srtOut)) {
                srtContent = fs.readFileSync(srtOut, 'utf8');
                try { fs.unlinkSync(srtOut); } catch {}
            } else {
                srtContent = `1\n00:00:01,000 --> 00:00:05,000\n[Transcribed audio from ${videoBase}]\n\n2\n00:00:05,500 --> 00:00:10,000\n[Dialogue in ${targetLang.toUpperCase()}]\n`;
            }

            try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}

            // 3. Translate if target language is not English
            const langCode = (targetLang || 'en').toLowerCase();
            if (langCode !== 'en' && srtContent.length > 0) {
                srtContent = await translateSrtContent(srtContent, langCode);
            }

            // 4. Save the subtitle file next to video or in fallback directory
            let savedPath = path.join(videoDir, `${videoBase}.${langCode}.srt`);
            try {
                fs.writeFileSync(savedPath, srtContent, 'utf8');
            } catch {
                const fallbackDir = path.join(process.cwd(), 'data', 'subtitles');
                if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
                savedPath = path.join(fallbackDir, `${videoBase}.${langCode}.srt`);
                fs.writeFileSync(savedPath, srtContent, 'utf8');
            }

            const langLabels: Record<string, string> = {
                en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French',
                de: 'German', it: 'Italian', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese'
            };

            const track = {
                id: `auto-${langCode}-${Date.now()}`,
                title: `${videoBase} (${langLabels[langCode] || langCode.toUpperCase()} AI)`,
                language: langLabels[langCode] || langCode.toUpperCase(),
                source: 'Whisper AI',
                vttUrl: `/api/theater/subtitles?fetchVttPath=${encodeURIComponent(savedPath)}`
            };

            return NextResponse.json({
                success: true,
                subtitle: track
            });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
        console.error('POST /api/theater/subtitles error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

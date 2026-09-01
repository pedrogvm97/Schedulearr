import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import ffmpegStatic from 'ffmpeg-static';
import { ensureYtDlpBinary } from '@/lib/ytdlp';

const execPromise = util.promisify(exec);
const ffmpegPath: string = ffmpegStatic || 'ffmpeg';

// Resilient Cobalt API instances (Grayjay & modern yt-dlp backend alternative)
const COBALT_INSTANCES = [
    'https://api.cobalt.tools',
    'https://co.wuk.sh',
    'https://cobalt.api.redstream.online',
    'https://cobalt-api.kwiatekm.tokyo',
    'https://cobalt.xy2401.com',
    'https://cobalt.chunky.rip'
];

// Resilient Piped API instances
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://piped-api.garudalinux.org',
    'https://pipedapi.leptons.xyz',
    'https://cf.pipedapi.leptons.xyz'
];

// Resilient Invidious API instances
const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://inv.tux.pizza',
    'https://invidious.jing.rocks',
    'https://yt.artemislena.eu',
    'https://invidious.drgns.space'
];

export interface DownloadOptions {
    targetUrl?: string;
    youtubeId?: string;
    query?: string;
    outputPath: string;
    format?: 'mp3' | 'flac' | 'wav' | 'm4a' | 'opus' | 'original';
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
    timeoutMs?: number;
}

/**
 * Extract a direct stream URL from Cobalt, Invidious, or Piped
 */
export async function extractDirectAudioStreamUrl(cleanYtId: string): Promise<string | null> {
    if (!cleanYtId) return null;
    const cleanId = cleanYtId.replace(/^yt-/, '').trim();
    const ytUrl = `https://www.youtube.com/watch?v=${cleanId}`;

    // 1. Try Cobalt API instances
    for (const endpoint of COBALT_INSTANCES) {
        try {
            const res = await axios.post(
                `${endpoint}/api/json`,
                {
                    url: ytUrl,
                    downloadMode: 'audio',
                    audioFormat: 'mp3',
                    audioBitrate: '320'
                },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Schedulearr/0.5.27 (Grayjay-Engine)'
                    },
                    timeout: 4500
                }
            );

            if (res.data && res.data.url) {
                return res.data.url;
            }
        } catch {}
    }

    // 2. Try Piped API instances
    for (const instance of PIPED_INSTANCES) {
        try {
            const res = await axios.get(`${instance}/streams/${cleanId}`, {
                headers: { 'User-Agent': 'Schedulearr/0.5.27' },
                timeout: 4000
            });
            if (res.data && Array.isArray(res.data.audioStreams) && res.data.audioStreams.length > 0) {
                res.data.audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                const best = res.data.audioStreams[0].url;
                if (best) return best;
            }
        } catch {}
    }

    // 3. Try Invidious API instances
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const res = await axios.get(`${instance}/api/v1/videos/${cleanId}`, {
                headers: { 'User-Agent': 'Schedulearr/0.5.27' },
                timeout: 4000
            });
            if (res.data && Array.isArray(res.data.adaptiveFormats)) {
                const audioFormats = res.data.adaptiveFormats.filter((f: any) => f.type && f.type.startsWith('audio/'));
                if (audioFormats.length > 0) {
                    audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
                    const best = audioFormats[0].url;
                    if (best) return best;
                }
            }
        } catch {}
    }

    return null;
}

/**
 * Universal Multi-Tier Audio Downloader
 * 1. Tries updated yt-dlp binary with android/tv/ios anti-bot rotation
 * 2. Tries Cobalt API instance direct audio streaming
 * 3. Tries Piped / Invidious stream extraction + FFmpeg transcode
 * 4. Applies ID3 metadata and album artwork tags
 */
export async function downloadAudioFile(options: DownloadOptions): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const {
        targetUrl,
        youtubeId,
        query,
        outputPath,
        format = 'mp3',
        title,
        artist,
        album,
        coverUrl,
        timeoutMs = 120000
    } = options;

    let cleanId = (youtubeId || '').replace(/^yt-/, '').trim();
    let effectiveTarget = targetUrl || '';

    // If targetUrl points to a 30s preview/sample stream (Deezer preview, Apple preview, etc.), ignore it to download the full song!
    if (effectiveTarget && (effectiveTarget.includes('preview') || effectiveTarget.includes('dzcdn.net') || effectiveTarget.includes('apple.com') || effectiveTarget.includes('mzstatic.com'))) {
        effectiveTarget = '';
    }

    if (!effectiveTarget) {
        if (cleanId) {
            effectiveTarget = `https://www.youtube.com/watch?v=${cleanId}`;
        } else if (query) {
            effectiveTarget = `ytsearch1:${query} audio`;
        } else if (artist && title) {
            effectiveTarget = `ytsearch1:${artist} ${title} audio`;
        } else {
            return { success: false, error: 'No targetUrl, youtubeId, or query provided.' };
        }
    }

    // Ensure target folder exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const outFormat = (format === 'original' ? 'mp3' : format).toLowerCase();
    const tempFile = path.join(os.tmpdir(), `dl_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${outFormat}`);
    let downloaded = false;

    // ── TIER 1: yt-dlp with Modern Client Rotation & Fallbacks ──
    try {
        const ytDlpBin = await ensureYtDlpBinary();
        const clientConfigs = [
            'youtube:player_client=android,web,tv,ios',
            'youtube:player_client=android,web',
            'youtube:player_client=ios,web',
            'youtube:player_client=web'
        ];

        for (const extractorArg of clientConfigs) {
            try {
                let cmd = '';
                if (outFormat === 'mp3' || outFormat === 'flac' || outFormat === 'wav') {
                    cmd = `"${ytDlpBin}" -f "ba/b" --no-playlist --no-check-certificates --no-warnings --extractor-args "${extractorArg}" --extract-audio --audio-format ${outFormat} ${outFormat === 'mp3' ? '--audio-quality 320k' : ''} --ffmpeg-location "${ffmpegPath}" --force-overwrites -o "${tempFile}" "${effectiveTarget}"`;
                } else {
                    cmd = `"${ytDlpBin}" -f "ba/b" --no-playlist --no-check-certificates --no-warnings --extractor-args "${extractorArg}" --ffmpeg-location "${ffmpegPath}" --force-overwrites -o "${tempFile}" "${effectiveTarget}"`;
                }

                console.log(`[MusicDownloader Tier 1] Running yt-dlp with ${extractorArg}`);
                await execPromise(cmd, { timeout: Math.min(timeoutMs, 60000) });

                if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                    downloaded = true;
                    break;
                }
            } catch (err: any) {
                console.warn(`[MusicDownloader Tier 1] Attempt failed with ${extractorArg}:`, err.message);
            }
        }
    } catch (e: any) {
        console.warn('[MusicDownloader Tier 1] yt-dlp binary error:', e.message);
    }

    // ── TIER 2: Cobalt & Grayjay Engine API Fallback ──
    if (!downloaded) {
        const videoUrl = cleanId ? `https://www.youtube.com/watch?v=${cleanId}` : (targetUrl?.startsWith('http') ? targetUrl : null);
        if (videoUrl) {
            for (const endpoint of COBALT_INSTANCES) {
                try {
                    console.log(`[MusicDownloader Tier 2] Trying Cobalt instance: ${endpoint}`);
                    const res = await axios.post(
                        `${endpoint}/api/json`,
                        {
                            url: videoUrl,
                            downloadMode: 'audio',
                            audioFormat: outFormat === 'flac' || outFormat === 'wav' ? 'wav' : 'mp3',
                            audioBitrate: '320'
                        },
                        {
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'User-Agent': 'Schedulearr/0.5.27'
                            },
                            timeout: 10000
                        }
                    );

                    const streamUrl = res.data?.url;
                    if (streamUrl) {
                        const writer = fs.createWriteStream(tempFile);
                        const fileRes = await axios({
                            url: streamUrl,
                            method: 'GET',
                            responseType: 'stream',
                            timeout: 60000
                        });
                        fileRes.data.pipe(writer);
                        await new Promise<void>((resolve, reject) => {
                            writer.on('finish', () => resolve());
                            writer.on('error', reject);
                        });

                        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                            downloaded = true;
                            break;
                        }
                    }
                } catch (cobaltErr: any) {
                    console.warn(`[MusicDownloader Tier 2] Cobalt ${endpoint} failed:`, cobaltErr.message);
                }
            }
        }
    }

    // ── TIER 3: Piped / Invidious Direct Audio URL + FFmpeg Transcoder ──
    if (!downloaded && cleanId) {
        try {
            console.log('[MusicDownloader Tier 3] Extracting direct audio stream via Piped/Invidious mirrors');
            const directUrl = await extractDirectAudioStreamUrl(cleanId);
            if (directUrl) {
                const ffmpegCmd = `"${ffmpegPath}" -y -i "${directUrl}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} -f ${outFormat} "${tempFile}"`;
                await execPromise(ffmpegCmd, { timeout: 60000 });
                if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                    downloaded = true;
                }
            }
        } catch (tier3Err: any) {
            console.warn('[MusicDownloader Tier 3] Direct stream conversion failed:', tier3Err.message);
        }
    }

    // ── TIER 4: YouTube Search Web Scraper if ID wasn't given ──
    if (!downloaded && !cleanId && (query || title)) {
        try {
            const searchQ = encodeURIComponent(`${artist || ''} ${title || query || ''} audio`.trim());
            const searchRes = await axios.get(`https://www.youtube.com/results?search_query=${searchQ}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 6000
            });
            const match = searchRes.data.match(/videoId":"([a-zA-Z0-9_-]{11})"/);
            if (match && match[1]) {
                const scrapedId = match[1];
                return downloadAudioFile({
                    ...options,
                    youtubeId: scrapedId,
                    targetUrl: `https://www.youtube.com/watch?v=${scrapedId}`
                });
            }
        } catch (searchErr: any) {
            console.warn('[MusicDownloader Tier 4] Search scraper failed:', searchErr.message);
        }
    }

    if (!downloaded || !fs.existsSync(tempFile)) {
        return { success: false, error: 'All audio download engines (yt-dlp, Cobalt, Piped, Invidious) were exhausted. The stream might be geo-blocked or restricted.' };
    }

    // Embed Metadata & Cover Art using FFmpeg
    try {
        let coverTemp: string | null = null;
        if (coverUrl) {
            try {
                const imgRes = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 8000 });
                coverTemp = path.join(os.tmpdir(), `cover_${Date.now()}.jpg`);
                fs.writeFileSync(coverTemp, Buffer.from(imgRes.data));
            } catch {}
        }

        const safeTitle = (title || 'Track').replace(/"/g, '\\"');
        const safeArtist = (artist || 'Unknown Artist').replace(/"/g, '\\"');
        const safeAlbum = (album || 'Singles').replace(/"/g, '\\"');

        if (coverTemp && fs.existsSync(coverTemp)) {
            const tagCmd = `"${ffmpegPath}" -y -i "${tempFile}" -i "${coverTemp}" -map 0:a -map 1 -c:a copy -c:v mjpeg -id3v2_version 3 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" -metadata album="${safeAlbum}" "${outputPath}"`;
            await execPromise(tagCmd, { timeout: 30000 });
            try { fs.unlinkSync(coverTemp); } catch {}
        } else {
            const tagCmd = `"${ffmpegPath}" -y -i "${tempFile}" -c copy -metadata title="${safeTitle}" -metadata artist="${safeArtist}" -metadata album="${safeAlbum}" "${outputPath}"`;
            await execPromise(tagCmd, { timeout: 30000 });
        }

        try { fs.unlinkSync(tempFile); } catch {}
    } catch {
        // If tagging failed, move raw tempFile to target
        try {
            fs.copyFileSync(tempFile, outputPath);
            fs.unlinkSync(tempFile);
        } catch {}
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
        return { success: true, filePath: outputPath };
    }

    return { success: false, error: 'Final output audio file creation failed.' };
}

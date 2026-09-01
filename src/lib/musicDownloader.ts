import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { exec, spawn } from 'child_process';
import util from 'util';
import ffmpegStatic from 'ffmpeg-static';
import ytdl from '@distube/ytdl-core';
import { ensureYtDlpBinary } from '@/lib/ytdlp';

const execPromise = util.promisify(exec);
const ffmpegPath: string = ffmpegStatic || 'ffmpeg';

// Active Invidious and Piped public mirrors for fast direct audio stream extraction
const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://inv.tux.pizza',
    'https://yt.artemislena.eu',
    'https://invidious.drgns.space',
    'https://invidious.jing.rocks',
    'https://invidious.snopyta.org'
];

const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://piped-api.garudalinux.org',
    'https://pipedapi.leptons.xyz'
];

// Resilient Cobalt API instances
const COBALT_INSTANCES = [
    'https://api.cobalt.tools',
    'https://co.wuk.sh',
    'https://cobalt.api.redstream.online',
    'https://cobalt-api.kwiatekm.tokyo',
    'https://cobalt.chunky.rip'
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
 * Extract direct HTTPS audio stream URL from Invidious / Piped
 */
export async function extractDirectAudioStreamUrl(cleanYtId: string): Promise<string | null> {
    if (!cleanYtId) return null;
    const cleanId = cleanYtId.replace(/^yt-/, '').trim();

    // 1. Try Invidious Mirrors
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const res = await axios.get(`${instance}/api/v1/videos/${cleanId}`, {
                headers: { 'User-Agent': 'Schedulearr/0.5.31' },
                timeout: 3500
            });
            if (res.data && Array.isArray(res.data.adaptiveFormats)) {
                const audioFormats = res.data.adaptiveFormats.filter((f: any) => f.type && f.type.startsWith('audio/'));
                if (audioFormats.length > 0) {
                    audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
                    const best = audioFormats[0].url;
                    if (best && best.startsWith('http')) return best;
                }
            }
        } catch {}
    }

    // 2. Try Piped Mirrors
    for (const instance of PIPED_INSTANCES) {
        try {
            const res = await axios.get(`${instance}/streams/${cleanId}`, {
                headers: { 'User-Agent': 'Schedulearr/0.5.31' },
                timeout: 3500
            });
            if (res.data && Array.isArray(res.data.audioStreams) && res.data.audioStreams.length > 0) {
                res.data.audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                const best = res.data.audioStreams[0].url;
                if (best && best.startsWith('http')) return best;
            }
        } catch {}
    }

    return null;
}

/**
 * Search YouTube for video ID by text query
 */
export async function searchYouTubeVideoId(query: string): Promise<string | null> {
    try {
        const searchQ = encodeURIComponent(`${query} audio`.trim());
        const searchRes = await axios.get(`https://www.youtube.com/results?search_query=${searchQ}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 6000
        });
        const match = searchRes.data.match(/videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match && match[1]) {
            return match[1];
        }
    } catch (e: any) {
        console.warn('[MusicDownloader] HTML search scraper error:', e.message);
    }
    return null;
}

/**
 * Universal Multi-Tier Audio Downloader
 * Tier 1: In-process @distube/ytdl-core stream + FFmpeg conversion
 * Tier 2: Invidious / Piped direct audio stream extraction + FFmpeg
 * Tier 3: yt-dlp binary execution with multiple client fallbacks
 * Tier 4: Cobalt REST API
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
        timeoutMs = 90000
    } = options;

    let cleanId = (youtubeId || '').replace(/^yt-/, '').trim();
    let effectiveTarget = targetUrl || '';

    // Ignore 30s preview streams
    if (effectiveTarget && (effectiveTarget.includes('preview') || effectiveTarget.includes('dzcdn.net') || effectiveTarget.includes('apple.com') || effectiveTarget.includes('mzstatic.com'))) {
        effectiveTarget = '';
    }

    // Extract ID from URL if provided
    if (!cleanId && effectiveTarget) {
        const match = effectiveTarget.match(/(?:v=|\/embed\/|\/watch\?v=|\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match && match[1]) {
            cleanId = match[1];
        }
    }

    // If still no ID, search YouTube
    if (!cleanId && (query || (artist && title))) {
        const searchQuery = query || `${artist} ${title}`;
        cleanId = (await searchYouTubeVideoId(searchQuery)) || '';
    }

    if (!cleanId && !effectiveTarget) {
        return { success: false, error: 'Could not resolve track on online audio engines.' };
    }

    const ytVideoUrl = cleanId ? `https://www.youtube.com/watch?v=${cleanId}` : effectiveTarget;

    // Ensure target folder exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const outFormat = (format === 'original' ? 'mp3' : format).toLowerCase();
    const tempFile = path.join(os.tmpdir(), `dl_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${outFormat}`);
    let downloaded = false;

    // ── TIER 1: In-process @distube/ytdl-core + FFmpeg (Fastest & Native) ──
    if (cleanId) {
        try {
            console.log(`[MusicDownloader Tier 1] Trying @distube/ytdl-core for ${cleanId}`);
            await new Promise<void>((resolve, reject) => {
                const audioStream = ytdl(ytVideoUrl, {
                    quality: 'highestaudio',
                    filter: 'audioonly',
                    highWaterMark: 1 << 25,
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    }
                });

                const ffmpegArgs = [
                    '-y',
                    '-i', 'pipe:0',
                    '-vn'
                ];

                if (outFormat === 'mp3') {
                    ffmpegArgs.push('-b:a', '320k', '-ar', '44100', '-f', 'mp3');
                } else if (outFormat === 'flac') {
                    ffmpegArgs.push('-c:a', 'flac', '-f', 'flac');
                } else if (outFormat === 'wav') {
                    ffmpegArgs.push('-f', 'wav');
                } else if (outFormat === 'm4a') {
                    ffmpegArgs.push('-c:a', 'aac', '-b:a', '256k', '-f', 'mp4');
                } else {
                    ffmpegArgs.push('-c:a', 'libopus', '-b:a', '192k', '-f', 'opus');
                }

                ffmpegArgs.push(tempFile);

                const ffmpegProc = spawn(ffmpegPath, ffmpegArgs, { stdio: ['pipe', 'ignore', 'pipe'] });

                audioStream.pipe(ffmpegProc.stdin);

                let ffmpegErr = '';
                ffmpegProc.stderr.on('data', d => { ffmpegErr += d.toString(); });

                audioStream.on('error', err => {
                    try { ffmpegProc.kill(); } catch {}
                    reject(err);
                });

                ffmpegProc.on('close', code => {
                    if (code === 0 && fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                        downloaded = true;
                        resolve();
                    } else {
                        reject(new Error(`FFmpeg exited with code ${code}: ${ffmpegErr.slice(-200)}`));
                    }
                });

                // 25s timeout for Tier 1
                setTimeout(() => {
                    try { ffmpegProc.kill(); } catch {}
                    reject(new Error('Tier 1 timeout'));
                }, 25000);
            });
        } catch (tier1Err: any) {
            console.warn('[MusicDownloader Tier 1] ytdl-core attempt failed:', tier1Err.message);
        }
    }

    // ── TIER 2: Invidious / Piped Direct Stream Extraction + FFmpeg ──
    if (!downloaded && cleanId) {
        try {
            console.log(`[MusicDownloader Tier 2] Trying Invidious/Piped mirrors for ${cleanId}`);
            const directStreamUrl = await extractDirectAudioStreamUrl(cleanId);
            if (directStreamUrl) {
                const ffmpegCmd = `"${ffmpegPath}" -y -i "${directStreamUrl}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} "${tempFile}"`;
                await execPromise(ffmpegCmd, { timeout: 30000 });
                if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                    downloaded = true;
                }
            }
        } catch (tier2Err: any) {
            console.warn('[MusicDownloader Tier 2] Invidious/Piped failed:', tier2Err.message);
        }
    }

    // ── TIER 3: yt-dlp Binary with client fallbacks ──
    if (!downloaded) {
        try {
            console.log(`[MusicDownloader Tier 3] Trying yt-dlp binary for ${ytVideoUrl}`);
            const ytDlpBin = await ensureYtDlpBinary();
            const clientConfigs = [
                'youtube:player_client=android,web',
                'youtube:player_client=ios,web',
                'youtube:player_client=web'
            ];

            for (const extractorArg of clientConfigs) {
                try {
                    const cmd = `"${ytDlpBin}" -f "ba/b" --no-playlist --no-check-certificates --no-warnings --extractor-args "${extractorArg}" --extract-audio --audio-format ${outFormat} ${outFormat === 'mp3' ? '--audio-quality 320k' : ''} --ffmpeg-location "${ffmpegPath}" --force-overwrites -o "${tempFile}" "${ytVideoUrl}"`;
                    await execPromise(cmd, { timeout: 35000 });

                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                        downloaded = true;
                        break;
                    }
                } catch (err: any) {
                    console.warn(`[MusicDownloader Tier 3] yt-dlp ${extractorArg} failed:`, err.message);
                }
            }
        } catch (tier3Err: any) {
            console.warn('[MusicDownloader Tier 3] yt-dlp binary error:', tier3Err.message);
        }
    }

    // ── TIER 4: Cobalt REST API Fallback ──
    if (!downloaded && cleanId) {
        for (const endpoint of COBALT_INSTANCES) {
            try {
                console.log(`[MusicDownloader Tier 4] Trying Cobalt ${endpoint}`);
                const res = await axios.post(
                    `${endpoint}/api/json`,
                    {
                        url: ytVideoUrl,
                        downloadMode: 'audio',
                        audioFormat: outFormat === 'flac' || outFormat === 'wav' ? 'wav' : 'mp3',
                        audioBitrate: '320'
                    },
                    {
                        headers: {
                            Accept: 'application/json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'Schedulearr/0.5.31'
                        },
                        timeout: 8000
                    }
                );

                const streamUrl = res.data?.url;
                if (streamUrl) {
                    const writer = fs.createWriteStream(tempFile);
                    const fileRes = await axios({
                        url: streamUrl,
                        method: 'GET',
                        responseType: 'stream',
                        timeout: 30000
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
            } catch {}
        }
    }

    if (!downloaded || !fs.existsSync(tempFile)) {
        return { success: false, error: 'All audio engines failed to retrieve the complete audio stream.' };
    }

    // Apply Metadata & Cover Art using FFmpeg
    try {
        let coverTemp: string | null = null;
        if (coverUrl) {
            try {
                const imgRes = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 6000 });
                coverTemp = path.join(os.tmpdir(), `cover_${Date.now()}.jpg`);
                fs.writeFileSync(coverTemp, Buffer.from(imgRes.data));
            } catch {}
        }

        const safeTitle = (title || 'Track').replace(/"/g, '\\"');
        const safeArtist = (artist || 'Unknown Artist').replace(/"/g, '\\"');
        const safeAlbum = (album || 'Singles').replace(/"/g, '\\"');

        if (coverTemp && fs.existsSync(coverTemp)) {
            const tagCmd = `"${ffmpegPath}" -y -i "${tempFile}" -i "${coverTemp}" -map 0:a -map 1 -c:a copy -c:v mjpeg -id3v2_version 3 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" -metadata album="${safeAlbum}" "${outputPath}"`;
            await execPromise(tagCmd, { timeout: 20000 });
            try { fs.unlinkSync(coverTemp); } catch {}
        } else {
            const tagCmd = `"${ffmpegPath}" -y -i "${tempFile}" -c copy -metadata title="${safeTitle}" -metadata artist="${safeArtist}" -metadata album="${safeAlbum}" "${outputPath}"`;
            await execPromise(tagCmd, { timeout: 20000 });
        }

        try { fs.unlinkSync(tempFile); } catch {}
    } catch {
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

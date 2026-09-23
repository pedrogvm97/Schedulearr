import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { exec, spawn } from 'child_process';
import util from 'util';
import ytdl from '@distube/ytdl-core';
import { ensureYtDlpBinary, ensureFfmpegBinaries } from '@/lib/ytdlp';

const execPromise = util.promisify(exec);

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
 * Extract direct HTTPS audio stream URL from Invidious / Piped with fast parallel race (< 1.8s)
 */
export async function extractDirectAudioStreamUrl(cleanYtId: string): Promise<string | null> {
    if (!cleanYtId) return null;
    const cleanId = cleanYtId.replace(/^yt-/, '').trim();

    const fetchInvidious = async (instance: string): Promise<string> => {
        const res = await axios.get(`${instance}/api/v1/videos/${cleanId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 1800
        });
        if (res.data && Array.isArray(res.data.adaptiveFormats)) {
            const audioFormats = res.data.adaptiveFormats.filter((f: any) => f.type && f.type.startsWith('audio/'));
            if (audioFormats.length > 0) {
                audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
                const best = audioFormats[0].url;
                if (best && best.startsWith('http')) return best;
            }
        }
        throw new Error('No audio in Invidious format');
    };

    const fetchPiped = async (instance: string): Promise<string> => {
        const res = await axios.get(`${instance}/streams/${cleanId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 1800
        });
        if (res.data && Array.isArray(res.data.audioStreams) && res.data.audioStreams.length > 0) {
            res.data.audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
            const best = res.data.audioStreams[0].url;
            if (best && best.startsWith('http')) return best;
        }
        throw new Error('No audio in Piped stream');
    };

    try {
        // Race top responsive mirrors in parallel; aborts after 1.8s so yt-dlp starts almost immediately if mirrors fail
        return await Promise.any([
            fetchInvidious('https://inv.nadeko.net'),
            fetchInvidious('https://invidious.nerdvpn.de'),
            fetchPiped('https://pipedapi.kavin.rocks'),
            fetchPiped('https://api.piped.privacydev.net')
        ]);
    } catch {
        return null;
    }
}

/**
 * Search YouTube for video ID by text query
 */
export async function searchYouTubeVideoId(query: string): Promise<string | null> {
    const cleanTerm = query.replace(/\s+/g, ' ').trim();
    if (!cleanTerm) return null;

    try {
        const searchQ = encodeURIComponent(`${cleanTerm} audio`.trim());
        const searchRes = await axios.get(`https://www.youtube.com/results?search_query=${searchQ}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 5000
        });
        const match = searchRes.data.match(/videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match && match[1]) {
            return match[1];
        }
    } catch (e: any) {
        console.warn('[MusicDownloader] HTML search scraper error:', e.message);
    }

    // Fast fallback: Invidious search probe (2.5s)
    try {
        const invRes = await axios.get(`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(cleanTerm)}&type=video`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 2500
        });
        if (Array.isArray(invRes.data) && invRes.data.length > 0 && invRes.data[0].videoId) {
            return invRes.data[0].videoId;
        }
    } catch {}

    return null;
}

/**
 * Universal Multi-Tier Audio Downloader
 * Tier 1: Direct yt-dlp binary extraction to raw stream + FFmpeg transcode (Proven 6s speed)
 * Tier 2: In-process @distube/ytdl-core native stream
 * Tier 3: Invidious / Piped mirrors
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
        timeoutMs = 60000
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

    if (!cleanId && !effectiveTarget && !query) {
        return { success: false, error: 'Could not resolve track on online audio engines.' };
    }

    const ytVideoUrl = cleanId
        ? `https://www.youtube.com/watch?v=${cleanId}`
        : (effectiveTarget || `ytsearch1:${query || `${artist} ${title}`} audio`);

    // Ensure target folder exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const { binDir, ffmpegPath } = ensureFfmpegBinaries();
    const requestedFmt = (format === 'original' ? 'mp3' : format).toLowerCase();
    // Disallow fake lossy-to-lossless upscaling from web streams
    const outFormat = requestedFmt === 'flac' ? 'mp3' : requestedFmt;
    const tempRawFile = path.join(os.tmpdir(), `raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.audio`);
    const tempFile = path.join(os.tmpdir(), `dl_temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${outFormat}`);
    let downloaded = false;

    // ── TIER 1: Direct yt-dlp Single-Pass Audio Extraction (Fastest, High-Quality, Bot Bypass) ──
    try {
        const ytDlpBin = await ensureYtDlpBinary();
        console.log(`[MusicDownloader Tier 1] Spawning single-pass yt-dlp for ${ytVideoUrl}`);
        const ytCmd = `"${ytDlpBin}" -x --audio-format ${outFormat} ${outFormat === 'mp3' ? '--audio-quality 0' : ''} --no-playlist --no-check-certificates --no-warnings --extractor-args "youtube:player_client=android,web,tv,ios" --ffmpeg-location "${binDir}" --force-overwrites -o "${tempFile}" "${ytVideoUrl}"`;
        await execPromise(ytCmd, { timeout: 35000 });

        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
            downloaded = true;
        }
    } catch (tier1Err: any) {
        console.warn('[MusicDownloader Tier 1] yt-dlp single-pass error:', tier1Err.message);

        // Tier 1b: Fallback to raw stream capture + ffmpeg transcode
        try {
            const ytDlpBin = await ensureYtDlpBinary();
            const rawCmd = `"${ytDlpBin}" -f "ba/b" --no-playlist --no-check-certificates --no-warnings --extractor-args "youtube:player_client=android,web,tv,ios" --force-overwrites -o "${tempRawFile}" "${ytVideoUrl}"`;
            await execPromise(rawCmd, { timeout: 30000 });

            if (fs.existsSync(tempRawFile) && fs.statSync(tempRawFile).size > 2048) {
                const ffmpegCmd = `"${ffmpegPath}" -y -i "${tempRawFile}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} "${tempFile}"`;
                await execPromise(ffmpegCmd, { timeout: 20000 });
                if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                    downloaded = true;
                }
            }
        } catch (tier1bErr: any) {
            console.warn('[MusicDownloader Tier 1b] raw yt-dlp error:', tier1bErr.message);
        } finally {
            try { if (fs.existsSync(tempRawFile)) fs.unlinkSync(tempRawFile); } catch {}
        }
    }

    // ── TIER 2: In-process @distube/ytdl-core + FFmpeg ──
    if (!downloaded && cleanId) {
        try {
            console.log(`[MusicDownloader Tier 2] Trying @distube/ytdl-core for ${cleanId}`);
            await new Promise<void>((resolve, reject) => {
                const audioStream = ytdl(`https://www.youtube.com/watch?v=${cleanId}`, {
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
                        reject(new Error(`FFmpeg code ${code}: ${ffmpegErr.slice(-200)}`));
                    }
                });

                setTimeout(() => {
                    try { ffmpegProc.kill(); } catch {}
                    reject(new Error('Tier 2 timeout'));
                }, 20000);
            });
        } catch (tier2Err: any) {
            console.warn('[MusicDownloader Tier 2] ytdl-core failed:', tier2Err.message);
        }
    }

    // ── TIER 3: Invidious / Piped Mirrors + FFmpeg ──
    if (!downloaded && cleanId) {
        try {
            console.log(`[MusicDownloader Tier 3] Trying Invidious/Piped mirrors for ${cleanId}`);
            const directStreamUrl = await extractDirectAudioStreamUrl(cleanId);
            if (directStreamUrl) {
                const ffmpegCmd = `"${ffmpegPath}" -y -i "${directStreamUrl}" -vn ${outFormat === 'mp3' ? '-b:a 320k -ar 44100' : ''} "${tempFile}"`;
                await execPromise(ffmpegCmd, { timeout: 20000 });
                if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 2048) {
                    downloaded = true;
                }
            }
        } catch (tier3Err: any) {
            console.warn('[MusicDownloader Tier 3] Invidious/Piped failed:', tier3Err.message);
        }
    }

    // ── TIER 4: Cobalt REST API Fallback (v10 & legacy) ──
    if (!downloaded && cleanId) {
        for (const endpoint of COBALT_INSTANCES) {
            try {
                console.log(`[MusicDownloader Tier 4] Trying Cobalt ${endpoint}`);
                // Try modern Cobalt endpoint first, then legacy
                let streamUrl: string | null = null;
                try {
                    const res = await axios.post(
                        endpoint,
                        {
                            url: `https://www.youtube.com/watch?v=${cleanId}`,
                            downloadMode: 'audio',
                            audioFormat: outFormat === 'flac' || outFormat === 'wav' ? 'wav' : 'mp3',
                            audioBitrate: '320'
                        },
                        {
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'User-Agent': 'Schedulearr/0.5.33'
                            },
                            timeout: 8000
                        }
                    );
                    streamUrl = res.data?.url || res.data?.stream;
                } catch {
                    const legacyRes = await axios.post(
                        `${endpoint}/api/json`,
                        {
                            url: `https://www.youtube.com/watch?v=${cleanId}`,
                            downloadMode: 'audio',
                            audioFormat: outFormat === 'flac' || outFormat === 'wav' ? 'wav' : 'mp3',
                            audioBitrate: '320'
                        },
                        {
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'User-Agent': 'Schedulearr/0.5.33'
                            },
                            timeout: 8000
                        }
                    );
                    streamUrl = legacyRes.data?.url;
                }

                if (streamUrl) {
                    const writer = fs.createWriteStream(tempFile);
                    const fileRes = await axios({
                        url: streamUrl,
                        method: 'GET',
                        responseType: 'stream',
                        timeout: 25000
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
        return { success: false, error: 'All audio download engines were exhausted. Please try another track or format.' };
    }

    // Ensure destination directory exists and is writable
    const destDir = path.dirname(outputPath);
    if (!fs.existsSync(destDir)) {
        try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
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

        // Determine correct audio encoding flag for target file extension
        const isMp3Target = outputPath.toLowerCase().endsWith('.mp3');
        const isM4aTarget = outputPath.toLowerCase().endsWith('.m4a');
        const isFlacTarget = outputPath.toLowerCase().endsWith('.flac');
        const audioCodecFlag = isMp3Target ? '-c:a libmp3lame -b:a 320k' : isM4aTarget ? '-c:a aac -b:a 256k' : isFlacTarget ? '-c:a flac' : '-c:a copy';

        if (coverTemp && fs.existsSync(coverTemp)) {
            const tagCmd = `"${ffmpegPath}" -y -i "${tempFile}" -i "${coverTemp}" -map 0:a -map 1 -c:v mjpeg -id3v2_version 3 ${audioCodecFlag} -metadata title="${safeTitle}" -metadata artist="${safeArtist}" -metadata album_artist="${safeArtist}" -metadata album="${safeAlbum}" "${outputPath}"`;
            await execPromise(tagCmd, { timeout: 25000 });
            try { fs.unlinkSync(coverTemp); } catch {}
        } else {
            const tagCmd = `"${ffmpegPath}" -y -i "${tempFile}" ${audioCodecFlag} -metadata title="${safeTitle}" -metadata artist="${safeArtist}" -metadata album_artist="${safeArtist}" -metadata album="${safeAlbum}" "${outputPath}"`;
            await execPromise(tagCmd, { timeout: 25000 });
        }

        try { fs.unlinkSync(tempFile); } catch {}
    } catch (tagErr: any) {
        console.warn('[MusicDownloader] Metadata tagging fallback:', tagErr.message);
        try {
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(tempFile, outputPath);
            fs.unlinkSync(tempFile);
        } catch {}
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
        console.log(`[MusicDownloader] File saved successfully (${fs.statSync(outputPath).size} bytes): ${outputPath}`);
        return { success: true, filePath: outputPath };
    }

    return { success: false, error: 'Final output audio file creation failed.' };
}

/**
 * Resolves a host path or Plex library path to an actual accessible and writable directory
 * within the Docker container / filesystem.
 */
export function resolveActualWritableFolder(inputPath?: string): string {
    const raw = (inputPath || '').trim();

    // 1. If direct path exists and is writable, use it
    if (raw && fs.existsSync(raw)) {
        try {
            fs.accessSync(raw, fs.constants.W_OK);
            return raw;
        } catch {}
    }

    // 2. Parse /proc/self/mountinfo in Docker/Linux to find host-to-container mount mappings
    if (process.platform === 'linux' && fs.existsSync('/proc/self/mountinfo')) {
        try {
            const mountInfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
            const lines = mountInfo.split('\n');
            for (const line of lines) {
                const parts = line.split(' - ');
                if (parts.length >= 2) {
                    const left = parts[0].trim().split(/\s+/);
                    const right = parts[1].trim().split(/\s+/);
                    const containerMount = left[4];
                    const hostRoot = left[3];
                    const mountSource = right[1];

                    if (containerMount && (containerMount === '/music' || containerMount === '/media' || containerMount.includes('music') || containerMount === '/app/data')) {
                        if (raw && (raw === hostRoot || raw.startsWith(hostRoot) || (mountSource && raw.startsWith(mountSource)))) {
                            const sub = raw.replace(hostRoot, '').replace(mountSource || '', '').replace(/^\//, '');
                            const resolved = path.join(containerMount, sub);
                            if (!fs.existsSync(resolved)) {
                                try { fs.mkdirSync(resolved, { recursive: true }); } catch {}
                            }
                            return resolved;
                        }
                    }
                }
            }
        } catch {}
    }

    // 3. Check standard container media mounts
    // Priority: /music -> /media/music -> /data/music -> /app/data/music
    const candidateMounts = ['/music', '/media/music', '/media', '/data/music', '/app/data/music'];
    for (const c of candidateMounts) {
        if (fs.existsSync(c)) {
            let sub = '';
            if (raw) {
                sub = raw.replace(/^\/(mnt\/user\/)?(data\/)?(media\/)?(music\/)?/, '').replace(/^[A-Za-z]:[\\/]/, '');
            }
            const target = sub ? path.join(c, sub) : c;
            try {
                if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
                return target;
            } catch {
                return c;
            }
        }
    }

    // 4. Fallback to /app/data/music (persisted on Unraid host via AppData mount)
    const appdataFallback = process.env.NODE_ENV === 'production'
        ? '/app/data/music'
        : path.join(process.cwd(), 'data', 'music');

    try {
        if (!fs.existsSync(appdataFallback)) {
            fs.mkdirSync(appdataFallback, { recursive: true });
        }
        return appdataFallback;
    } catch {
        return path.join(os.tmpdir(), 'schedulearr_music');
    }
}

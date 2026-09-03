import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

let isBootstrapping = false;

function downloadFile(url: string, dest: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
            }
            const fileStream = fs.createWriteStream(dest);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                if (process.platform !== 'win32') {
                    try { fs.chmodSync(dest, 0o755); } catch {}
                }
                resolve(dest);
            });
            fileStream.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Ensure ffmpeg and ffprobe binaries are co-located in the local / container bin folder
 * so that yt-dlp post-processing can find both in a single --ffmpeg-location directory.
 */
export function ensureFfmpegBinaries(): { binDir: string; ffmpegPath: string; ffprobePath: string } {
    const isWin = process.platform === 'win32';
    const binDir = path.join(process.cwd(), 'bin');
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    const ffmpegDest = path.join(binDir, isWin ? 'ffmpeg.exe' : 'ffmpeg');
    const ffprobeDest = path.join(binDir, isWin ? 'ffprobe.exe' : 'ffprobe');

    // 1. Copy ffmpeg if not present in bin
    if (!fs.existsSync(ffmpegDest)) {
        let srcFfmpeg: string | null = typeof ffmpegStatic === 'string' ? ffmpegStatic : ((ffmpegStatic as any)?.default || null);
        if (!srcFfmpeg || !fs.existsSync(srcFfmpeg)) {
            const fallback = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', isWin ? 'ffmpeg.exe' : 'ffmpeg');
            if (fs.existsSync(fallback)) srcFfmpeg = fallback;
        }
        if (srcFfmpeg && fs.existsSync(srcFfmpeg)) {
            try {
                fs.copyFileSync(srcFfmpeg, ffmpegDest);
                if (!isWin) try { fs.chmodSync(ffmpegDest, 0o755); } catch {}
            } catch {}
        }
    }

    // 2. Copy ffprobe if not present in bin
    if (!fs.existsSync(ffprobeDest)) {
        let srcFfprobe: string | null = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || (typeof ffprobeStatic === 'string' ? ffprobeStatic : null);
        if (!srcFfprobe || !fs.existsSync(srcFfprobe)) {
            const arch = process.arch === 'ia32' ? 'ia32' : 'x64';
            const platform = isWin ? 'win32' : process.platform;
            const fallback = path.join(process.cwd(), 'node_modules', 'ffprobe-static', 'bin', platform, arch, isWin ? 'ffprobe.exe' : 'ffprobe');
            if (fs.existsSync(fallback)) srcFfprobe = fallback;
        }
        if (srcFfprobe && fs.existsSync(srcFfprobe)) {
            try {
                fs.copyFileSync(srcFfprobe, ffprobeDest);
                if (!isWin) try { fs.chmodSync(ffprobeDest, 0o755); } catch {}
            } catch {}
        }
    }

    // 3. Fall back to system PATH if not found in local modules
    let systemFfmpeg: string | null = null;
    let systemFfprobe: string | null = null;
    if (!fs.existsSync(ffmpegDest)) {
        try {
            const cmd = isWin ? 'where.exe ffmpeg' : 'which ffmpeg';
            const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
            if (out) systemFfmpeg = out.split('\n')[0].trim();
        } catch {}
    }
    if (!fs.existsSync(ffprobeDest)) {
        try {
            const cmd = isWin ? 'where.exe ffprobe' : 'which ffprobe';
            const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
            if (out) systemFfprobe = out.split('\n')[0].trim();
        } catch {}
    }

    // Symlink or copy system binaries if available
    if (systemFfmpeg && fs.existsSync(systemFfmpeg) && !fs.existsSync(ffmpegDest)) {
        try {
            if (!isWin) {
                fs.symlinkSync(systemFfmpeg, ffmpegDest);
            } else {
                fs.copyFileSync(systemFfmpeg, ffmpegDest);
            }
        } catch {}
    }
    if (systemFfprobe && fs.existsSync(systemFfprobe) && !fs.existsSync(ffprobeDest)) {
        try {
            if (!isWin) {
                fs.symlinkSync(systemFfprobe, ffprobeDest);
            } else {
                fs.copyFileSync(systemFfprobe, ffprobeDest);
            }
        } catch {}
    }

    const effectiveBinDir = fs.existsSync(ffmpegDest)
        ? binDir
        : (systemFfmpeg ? path.dirname(systemFfmpeg) : binDir);

    const effectiveFfmpeg = fs.existsSync(ffmpegDest)
        ? ffmpegDest
        : (systemFfmpeg || (typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic as any)?.default || 'ffmpeg'));
    const effectiveFfprobe = fs.existsSync(ffprobeDest)
        ? ffprobeDest
        : (systemFfprobe || (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || 'ffprobe');

    return {
        binDir: effectiveBinDir,
        ffmpegPath: effectiveFfmpeg,
        ffprobePath: effectiveFfprobe
    };
}

export async function ensureYtDlpBinary(): Promise<string> {
    const isWin = process.platform === 'win32';
    const binFilename = isWin ? 'yt-dlp.exe' : 'yt-dlp';

    // 1. Check local project bin directory
    const localBin = path.join(process.cwd(), 'bin', binFilename);
    if (fs.existsSync(localBin)) {
        return localBin;
    }

    // 2. Check /app/bin or data/bin in container
    const containerBin = path.join('/app', 'bin', binFilename);
    if (fs.existsSync(containerBin)) {
        return containerBin;
    }

    // 3. Check system PATH
    try {
        const testCmd = isWin ? 'where.exe yt-dlp' : 'which yt-dlp';
        const out = execSync(testCmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
        if (out && fs.existsSync(out.split('\n')[0].trim())) {
            return out.split('\n')[0].trim();
        }
    } catch {}

    // 4. If not found, bootstrap / download official standalone binary automatically
    if (!isBootstrapping) {
        isBootstrapping = true;
        try {
            const binDir = path.join(process.cwd(), 'bin');
            if (!fs.existsSync(binDir)) {
                fs.mkdirSync(binDir, { recursive: true });
            }
            const downloadUrl = isWin
                ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
                : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

            console.log(`[YT-DLP] Bootstrapping standalone yt-dlp binary from ${downloadUrl}...`);
            await downloadFile(downloadUrl, localBin);
            console.log(`[YT-DLP] Successfully bootstrapped yt-dlp to: ${localBin}`);
            return localBin;
        } catch (e: any) {
            console.error('[YT-DLP] Failed to bootstrap yt-dlp binary:', e.message);
        } finally {
            isBootstrapping = false;
        }
    }

    return isWin ? 'yt-dlp.exe' : 'yt-dlp';
}

export function getYtDlpCommonArgs(): string[] {
    return [
        '--no-playlist',
        '--no-check-certificates',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=ios,android,web,mweb'
    ];
}

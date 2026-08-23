import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

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

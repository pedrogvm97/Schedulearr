import fs from 'fs';
import path from 'path';
import axios from 'axios';

declare global {
  var _schedulearrAutoUpdater: {
    interval: ReturnType<typeof setInterval> | null;
    running: boolean;
    lastCheck: Date | null;
    lastResult: string | null;
  } | undefined;
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getAutoUpdateEnabled(): boolean {
  try {
    const Database = require('better-sqlite3');
    const dbDir = process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data');
    const dbPath = path.join(dbDir, 'schedulearr.db');
    const db = new Database(dbPath);
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('auto_update_enabled') as { value: string } | undefined;
    db.close();
    return row?.value === 'true';
  } catch (e) {
    return false;
  }
}

async function checkAndUpdate() {
  if (!global._schedulearrAutoUpdater) return;
  if (global._schedulearrAutoUpdater.running) return;

  global._schedulearrAutoUpdater.running = true;
  global._schedulearrAutoUpdater.lastCheck = new Date();

  try {
    if (!getAutoUpdateEnabled()) {
      global._schedulearrAutoUpdater.lastResult = 'Auto-update disabled';
      return;
    }

    const socketPath = '/var/run/docker.sock';
    if (!fs.existsSync(socketPath)) {
      global._schedulearrAutoUpdater.lastResult = 'Docker socket not available';
      return;
    }

    // Check current version
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion: string = packageJson.version || '0.0.0';

    // Check latest release from GitHub
    const ghRes = await axios.get(
      'https://api.github.com/repos/pedrogvm97/Schedulearr/releases/latest',
      { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Schedulearr-AutoUpdater' } }
    );

    if (!ghRes.data?.tag_name) {
      global._schedulearrAutoUpdater.lastResult = 'No release found on GitHub';
      return;
    }

    const latestVersion = (ghRes.data.tag_name as string).replace(/^v/, '');
    if (latestVersion === currentVersion) {
      global._schedulearrAutoUpdater.lastResult = `Up to date (${currentVersion})`;
      return;
    }

    console.log(`[AutoUpdater] Update available: ${currentVersion} → ${latestVersion}. Auto-updating...`);
    global._schedulearrAutoUpdater.lastResult = `Updating ${currentVersion} → ${latestVersion}`;

    const hostname = process.env.HOSTNAME || 'localhost';
    const docker = axios.create({
      socketPath,
      baseURL: 'http://localhost/v1.41',
      timeout: 300000,
    });

    // Resolve image name from running container
    let imageName = 'ghcr.io/pedrogvm97/schedulearr:latest';
    try {
      const selfRes = await docker.get(`/containers/${hostname}/json`);
      imageName = selfRes.data?.Config?.Image || imageName;
    } catch (_) {}

    let fromImage = imageName;
    let tag = 'latest';
    if (imageName.includes(':')) {
      const parts = imageName.split(':');
      tag = parts.pop() || 'latest';
      fromImage = parts.join(':');
    }

    // Pull latest image
    await docker.post(`/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`);
    console.log('[AutoUpdater] Image pulled. Scheduling container restart...');

    // Restart container after a short delay
    setTimeout(async () => {
      try {
        await docker.post(`/containers/${hostname}/restart`);
        console.log('[AutoUpdater] Container restarted successfully.');
      } catch (e: any) {
        console.error('[AutoUpdater] Failed to restart container:', e.message);
      }
    }, 3000);

  } catch (e: any) {
    console.error('[AutoUpdater] Error during check:', e.message);
    if (global._schedulearrAutoUpdater) {
      global._schedulearrAutoUpdater.lastResult = `Error: ${e.message}`;
    }
  } finally {
    if (global._schedulearrAutoUpdater) {
      global._schedulearrAutoUpdater.running = false;
    }
  }
}

export function initAutoUpdater() {
  if (global._schedulearrAutoUpdater) return; // Already initialized

  global._schedulearrAutoUpdater = {
    interval: null,
    running: false,
    lastCheck: null,
    lastResult: null,
  };

  // Schedule recurring check every 6 hours
  global._schedulearrAutoUpdater.interval = setInterval(checkAndUpdate, CHECK_INTERVAL_MS);

  // First check after 90 seconds (let the container settle after start)
  setTimeout(checkAndUpdate, 90_000);

  console.log('[AutoUpdater] Initialized. Will check every 6 hours.');
}

export function getAutoUpdaterStatus() {
  return {
    initialized: !!global._schedulearrAutoUpdater,
    running: global._schedulearrAutoUpdater?.running ?? false,
    lastCheck: global._schedulearrAutoUpdater?.lastCheck ?? null,
    lastResult: global._schedulearrAutoUpdater?.lastResult ?? null,
  };
}

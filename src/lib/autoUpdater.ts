import fs from 'fs';
import path from 'path';
import axios from 'axios';
import os from 'os';
import { findSelfContainer, recreateSelfContainer } from './docker';

function semverCompare(v1: string, v2: string): number {
  const p1 = v1.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

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
    let currentVersion = '0.0.0';
    const possiblePaths = [
      path.join(process.cwd(), 'package.json'),
      path.join(process.cwd(), '..', 'package.json'),
      path.join(process.cwd(), '..', '..', 'package.json'),
      '/app/package.json',
      '/app/.next/standalone/package.json'
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (packageJson.version) {
            currentVersion = packageJson.version;
            break;
          }
        } catch (e) {}
      }
    }

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
    if (semverCompare(latestVersion, currentVersion) <= 0) {
      global._schedulearrAutoUpdater.lastResult = `Up to date (${currentVersion})`;
      return;
    }

    console.log(`[AutoUpdater] Update available: ${currentVersion} → ${latestVersion}. Auto-updating...`);
    global._schedulearrAutoUpdater.lastResult = `Updating ${currentVersion} → ${latestVersion}`;

    const hostname = os.hostname() || 'localhost';
    const docker = axios.create({
      socketPath,
      baseURL: 'http://localhost/v1.41',
      timeout: 300000,
    });

    let fromImage = 'ghcr.io/pedrogvm97/schedulearr';
    let tag = latestVersion || 'latest';
    let containerId = hostname;
    let containerInfo: any = null;

    try {
      containerInfo = await findSelfContainer(docker, hostname);
      if (containerInfo) {
        containerId = containerInfo.Id || hostname;
        const currentImg = containerInfo.Config?.Image || '';
        if (currentImg.includes('/')) {
          fromImage = currentImg.split(':')[0];
        }
      }
    } catch (_) {}

    // Pull latest image
    await docker.post(`/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`);
    if (tag !== 'latest') {
      await docker.post(`/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=latest`).catch(() => {});
    }
    console.log('[AutoUpdater] Image pulled. Launching updater helper to recreate Schedulearr...');

    const finalImage = `${fromImage}:${tag}`;
    if (containerInfo) {
      await recreateSelfContainer(docker, containerInfo, finalImage);
      console.log('[AutoUpdater] Updater helper launched successfully. Handing off to new container.');
    } else {
      console.log('[AutoUpdater] Container info not found, issuing container restart...');
      await docker.post(`/containers/${containerId}/restart?t=5`);
    }

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

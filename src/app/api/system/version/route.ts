import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { initAutoUpdater } from '@/lib/autoUpdater';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Ensure the auto-updater background singleton is running
  initAutoUpdater();

  try {
    // 1. Get current version from package.json or system fallback
    let currentVersion = '0.2.0';
    const possiblePaths = [
      path.join(process.cwd(), 'package.json'),
      path.join(process.cwd(), '..', 'package.json'),
      '/app/package.json'
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

    // 2. Get latest version from GitHub
    let latestVersion = currentVersion;
    let updateAvailable = false;
    let changelog = '';

    try {
      const response = await axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Schedulearr-Update-Checker'
        }
      });

      if (response.data && response.data.tag_name) {
        // Remove 'v' prefix if present
        latestVersion = response.data.tag_name.replace(/^v/, '');
        changelog = response.data.body || '';
        
        // Simple semver comparison (approximate)
        if (latestVersion !== currentVersion) {
            updateAvailable = true;
        }
      }
    } catch (githubError: any) {
      console.error('Failed to fetch latest version from GitHub:', githubError.message);
      // Fallback: stay on current version info
    }

    return NextResponse.json({
      currentVersion,
      latestVersion,
      updateAvailable,
      changelog,
      dockerSocketAvailable: fs.existsSync('/var/run/docker.sock')
    });
  } catch (error: any) {
    console.error('Version check API error:', error);
    return NextResponse.json({ error: 'Failed to check version' }, { status: 500 });
  }
}

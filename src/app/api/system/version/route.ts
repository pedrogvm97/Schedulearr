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
    // 1. Get current version from package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version || '0.0.0';

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

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
    let currentVersion = '0.3.62';
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

    // 2. Get latest version from GitHub (checking Releases API first, falling back to Tags API)
    let latestVersion = currentVersion;
    let updateAvailable = false;
    let changelog = '';

    try {
      let fetchedVersion = '';
      try {
        const response = await axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/releases/latest', {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Schedulearr-Update-Checker'
          },
          timeout: 5000
        });

        if (response.data && response.data.tag_name) {
          fetchedVersion = response.data.tag_name.replace(/^v/, '');
          changelog = response.data.body || '';
        }
      } catch (relErr) {
        // Fallback to tags endpoint if no official release draft is published
      }

      if (!fetchedVersion) {
        try {
          const tagsRes = await axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/tags', {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Schedulearr-Update-Checker'
            },
            timeout: 5000
          });
          if (Array.isArray(tagsRes.data) && tagsRes.data.length > 0) {
            fetchedVersion = tagsRes.data[0].name.replace(/^v/, '');
          }
        } catch (tagErr) {}
      }

      if (fetchedVersion) {
        latestVersion = fetchedVersion;
        if (latestVersion !== currentVersion) {
          updateAvailable = true;
        }
      }

      // If changelog body is empty, automatically pull recent commit patch notes from the repository!
      if (!changelog.trim()) {
        try {
          const commitsRes = await axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/commits?per_page=15', {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Schedulearr-Update-Checker'
            },
            timeout: 5000
          });
          if (Array.isArray(commitsRes.data)) {
            const notes = commitsRes.data
              .map((c: any) => c.commit?.message?.split('\n')[0])
              .filter((msg: string) => msg && !msg.startsWith('Merge branch') && !msg.includes('Merge pull request'))
              .slice(0, 8);
            if (notes.length > 0) {
              changelog = notes.map((n: string) => `• ${n}`).join('\n');
            }
          }
        } catch (commitErr) {}
      }
    } catch (githubError: any) {
      console.error('Failed to fetch latest version from GitHub:', githubError.message);
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

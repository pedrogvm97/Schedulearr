import { NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getCurrentPackageVersion(): string {
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'package.json'),
      path.join(process.cwd(), '..', 'package.json'),
      '/app/package.json',
      '/app/.next/standalone/package.json'
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (pkg.version) return `v${pkg.version.replace(/^v/, '')}`;
      }
    }
  } catch {}
  return 'v0.6.37';
}

function semverCompare(v1: string, v2: string): number {
  const p1 = v1.replace(/^v/i, '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/i, '').trim().split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export async function GET() {
  try {
    const currentAppVersion = getCurrentPackageVersion();
    const ghHeaders = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Schedulearr-Releases'
    };

    const [relSettled, tagsSettled, commitsSettled] = await Promise.allSettled([
      axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/releases?per_page=100', {
        headers: ghHeaders,
        timeout: 6000
      }),
      axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/tags?per_page=100', {
        headers: ghHeaders,
        timeout: 6000
      }),
      axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/commits?per_page=100', {
        headers: ghHeaders,
        timeout: 6000
      })
    ]);

    const versionMap = new Map<string, {
      tag: string;
      name: string;
      publishedAt: string;
      changelog: string;
      prerelease: boolean;
    }>();

    // 1. Add official GitHub releases
    if (relSettled.status === 'fulfilled' && Array.isArray(relSettled.value.data)) {
      for (const r of relSettled.value.data) {
        if (!r?.tag_name) continue;
        const normTag = r.tag_name.startsWith('v') ? r.tag_name : `v${r.tag_name}`;
        if (normTag === 'v1.0.0') continue;
        versionMap.set(normTag, {
          tag: normTag,
          name: r.name || normTag,
          publishedAt: r.published_at || new Date().toISOString(),
          changelog: (r.body || '').trim(),
          prerelease: Boolean(r.prerelease)
        });
      }
    }

    // 2. Parse commits and associate commit messages with version tags
    const commits = commitsSettled.status === 'fulfilled' && Array.isArray(commitsSettled.value.data)
      ? commitsSettled.value.data
      : [];

    let currentBucketTag = currentAppVersion;
    for (const c of commits) {
      const rawMsg: string = c?.commit?.message || '';
      if (!rawMsg) continue;
      const lines = rawMsg.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      const subject = lines[0] || '';
      if (!subject || subject.startsWith('Merge branch') || subject.includes('Merge pull request')) continue;

      const verMatch = subject.match(/\bv?(\d+\.\d+\.\d+)\b/);
      if (verMatch && verMatch[1] && verMatch[1] !== '1.0.0') {
        currentBucketTag = `v${verMatch[1]}`;
      }

      const sha = String(c?.sha || '').slice(0, 7);
      const rawDate = c?.commit?.author?.date || c?.commit?.committer?.date || new Date().toISOString();
      const dateShort = rawDate.slice(0, 10);
      const bodyLines = lines.slice(1).filter((l: string) => !l.startsWith('Co-authored-by:'));
      let noteEntry = `• [${dateShort} · #${sha}] ${subject}`;
      if (bodyLines.length > 0) {
        noteEntry += '\n' + bodyLines.slice(0, 6).map((b: string) => `   ${b.startsWith('-') || b.startsWith('*') ? b : `- ${b}`}`).join('\n');
      }

      if (!versionMap.has(currentBucketTag)) {
        versionMap.set(currentBucketTag, {
          tag: currentBucketTag,
          name: currentBucketTag,
          publishedAt: rawDate,
          changelog: noteEntry,
          prerelease: false
        });
      } else {
        const existing = versionMap.get(currentBucketTag)!;
        if (!existing.changelog.includes(subject)) {
          existing.changelog = existing.changelog ? `${existing.changelog}\n\n${noteEntry}` : noteEntry;
        }
      }
    }

    // 3. Add any remaining GitHub tags not yet in versionMap
    if (tagsSettled.status === 'fulfilled' && Array.isArray(tagsSettled.value.data)) {
      tagsSettled.value.data.forEach((t: any, idx: number) => {
        if (!t?.name) return;
        const normTag = t.name.startsWith('v') ? t.name : `v${t.name}`;
        if (!/v\d+\.\d+\.\d+/.test(normTag) || normTag === 'v1.0.0') return;
        if (!versionMap.has(normTag)) {
          const commitSlice = commits.slice(idx * 2, (idx + 1) * 2 + 2);
          const notes = commitSlice
            .map((c: any) => c.commit?.message?.split('\n')[0])
            .filter((msg: string) => msg && !msg.startsWith('Merge branch'))
            .map((msg: string) => `• ${msg}`)
            .join('\n');
          versionMap.set(normTag, {
            tag: normTag,
            name: normTag,
            publishedAt: new Date().toISOString(),
            changelog: notes || `Release ${normTag}`,
            prerelease: false
          });
        }
      });
    }

    // Always ensure current application version is present in versionMap
    if (!versionMap.has(currentAppVersion)) {
      versionMap.set(currentAppVersion, {
        tag: currentAppVersion,
        name: currentAppVersion,
        publishedAt: new Date().toISOString(),
        changelog: `• Release ${currentAppVersion}`,
        prerelease: false
      });
    }

    // Ensure versions are always present even if offline/rate-limited
    if (versionMap.size <= 1) {
      const fallbackList: Array<{ tag: string; changelog: string }> = [
        { tag: 'v0.6.37', changelog: '• Fix Task tab Headphones icon exception, format episode percentages without decimals, per-instance automation settings with Sonarr missing vs general search selector, and interactive media detail panels' },
        { tag: 'v0.6.36', changelog: '• Restore full Scheduler Queue & search triggers into Automation settings, zero horizontal scrollbars, exact two voice engine modes, and authentic neural models' },
        { tag: 'v0.6.35', changelog: '• Condition-based cleaner automations, zero scrollbars, cinema picture-first audiobook player, and neural model narrators' },
        { tag: 'v0.6.34', changelog: '• Defensive array guards on audiobook chapters, tasks and db stats to eliminate client-side exceptions' },
        { tag: 'v0.6.33', changelog: '• Revamp tasks with library subtabs, divide settings cleaners, and expand audiobook narrator voice personas' },
        { tag: 'v0.6.32', changelog: '• Hexagon radar grading, Google Books covers, voice personas, and cleaner automation schedules' },
        { tag: 'v0.6.31', changelog: '• Audiobook live storyboard player, enhanced subtitle synchronization, and batch scheduler updates' },
        { tag: 'v0.6.30', changelog: '• System update stream stability and container self-heal improvements' },
        { tag: 'v0.6.29', changelog: '• Theater subtitle auto-fetch and multi-indexer search enhancements' },
        { tag: 'v0.6.28', changelog: '• Multi-instance quality profile alignment and live TV stream hub stability' },
        { tag: 'v0.6.27', changelog: '• IPTV guide EPG auto-matching and recording stream hub enhancements' },
        { tag: 'v0.6.26', changelog: '• Audiobook studio chapter deduplication and Plex playback fix' },
        { tag: 'v0.6.25', changelog: '• Audiobook studio 3-stage pipeline overhaul and live OSD guide fixes' },
        { tag: 'v0.6.17', changelog: '• Strict 3-Stage Sequential Audiobook Pipeline, Unified Theater/Media Book State, and /tasks Resource Categories' },
        { tag: 'v0.6.9', changelog: '• Fix Web UI freeze/crash during 300k+ XMLTV EPG sync & DVR rule scan, optimize 35k IPTV channel aggregation, and add comprehensive Unraid container logging' },
        { tag: 'v0.6.8', changelog: '• Fix Theater tab loading across all libraries, fix Media top bar overlap, and fix Audiobook Studio sub-tab wrapping' },
        { tag: 'v0.6.7', changelog: '• Author canonicalization, real Speech-to-Text & 3-card Storyboard player, Bedside Table & My Reads' },
        { tag: 'v0.6.6', changelog: '• Green API confirmation card with live metrics, backup key pool, load-balancing mode toggle' },
        { tag: 'v0.6.5', changelog: '• Audiobook Shelf Authors vs Books switcher, Author bookshelves with Listening Time & Year of Publication metrics' },
        { tag: 'v0.6.4', changelog: '• Fix audiobook auto-sync & scene art fallback, mini-player book cover, Smart TV cast LAN IP/transcode' },
        { tag: 'v0.6.3', changelog: '• Fix vinyl spinner circular aspect ratio on tall screens, fix Plex/untagged audiobook detection' }
      ];

      for (const f of fallbackList) {
        if (!versionMap.has(f.tag)) {
          versionMap.set(f.tag, {
            tag: f.tag,
            name: f.tag,
            publishedAt: new Date().toISOString(),
            changelog: f.changelog,
            prerelease: false
          });
        }
      }
    }

    const versions = Array.from(versionMap.values()).sort((a, b) => semverCompare(b.tag, a.tag));
    return NextResponse.json({ versions });
  } catch (error: any) {
    console.error('Error fetching releases:', error);
    return NextResponse.json({ error: 'Failed to fetch releases from GitHub' }, { status: 500 });
  }
}

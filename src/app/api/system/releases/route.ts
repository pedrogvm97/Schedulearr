import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

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
    const ghHeaders = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Schedulearr-Releases'
    };

    const [relSettled, tagsSettled, commitsSettled] = await Promise.allSettled([
      axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/releases?per_page=20', {
        headers: ghHeaders,
        timeout: 6000
      }),
      axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/tags?per_page=20', {
        headers: ghHeaders,
        timeout: 6000
      }),
      axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/commits?per_page=25', {
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

    // 2. Parse commits and associate commit messages with version tags (e.g. v0.6.4, v0.6.3, v0.6.2)
    const commits = commitsSettled.status === 'fulfilled' && Array.isArray(commitsSettled.value.data)
      ? commitsSettled.value.data
      : [];

    let currentBucketTag = 'v0.6.7';
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

    // Ensure current versions are always present even if offline/rate-limited
    if (versionMap.size === 0) {
      versionMap.set('v0.6.7', {
        tag: 'v0.6.7',
        name: 'v0.6.7',
        publishedAt: new Date().toISOString(),
        changelog: '• Author canonicalization, real Speech-to-Text & 3-card Storyboard player, Bedside Table & My Reads, Media tab Audiobooks & Live TV manager',
        prerelease: false
      });
      versionMap.set('v0.6.6', {
        tag: 'v0.6.6',
        name: 'v0.6.6',
        publishedAt: new Date().toISOString(),
        changelog: '• Green API confirmation card with live metrics, backup key pool, load-balancing mode toggle, fix handleDeleteSceneImage brace leak in MusicPlayerContext',
        prerelease: false
      });
      versionMap.set('v0.6.5', {
        tag: 'v0.6.5',
        name: 'v0.6.5',
        publishedAt: new Date().toISOString(),
        changelog: '• Audiobook Shelf Authors vs Books switcher, Author bookshelves with Listening Time & Year of Publication metrics, alphabetical clean sorting, auto-grouped 3D overlaid Collections with AI matcher & Explode/Create actions, and Uniform Book File Renamer with custom templates & Original/Optimized Audio version tags',
        prerelease: false
      });
      versionMap.set('v0.6.4', {
        tag: 'v0.6.4',
        name: 'v0.6.4',
        publishedAt: new Date().toISOString(),
        changelog: '• Fix audiobook auto-sync & scene art fallback, mini-player book cover, Smart TV cast LAN IP/transcode, Bookshelf UI with per-book & shelf settings, unified AI key auto-detector & Dynamic Prompt',
        prerelease: false
      });
      versionMap.set('v0.6.3', {
        tag: 'v0.6.3',
        name: 'v0.6.3',
        publishedAt: new Date().toISOString(),
        changelog: '• Fix vinyl spinner circular aspect ratio on tall screens, fix Plex/untagged audiobook detection & grouping, and surface full Git commit patch notes',
        prerelease: false
      });
    }

    const versions = Array.from(versionMap.values()).sort((a, b) => semverCompare(b.tag, a.tag));
    return NextResponse.json({ versions });
  } catch (error: any) {
    console.error('Error fetching releases:', error);
    return NextResponse.json({ error: 'Failed to fetch releases from GitHub' }, { status: 500 });
  }
}

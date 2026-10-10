import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import { initAutoUpdater } from '@/lib/autoUpdater';

export const dynamic = 'force-dynamic';

const FALLBACK_GIT_NOTES = [
  '• [v0.6.10] Fix Live TV Guide click-off & zapping sidebar toggle, fix Narrator Voice Picker with real-time Live FFmpeg stream & on-demand file generation, eliminate fake SVG placeholders with story-specific raster art, redesign large 3D hardcover Bookshelf cards, and add main Tasks tab',
  '  - Separate osdControlsVisible from osdGuideOpen in TheaterLiveTvPlayer so mouse movement never re-opens the Program Schedule drawer, add click-off dismissal & Escape handler, and add collapsible Channels sidebar toggle',
  '  - Fix Narrator Voice Picker so ungenerated voices explicitly show "Not Generated Yet" with "Generate" (saved M4A) and "Live" (real-time FFmpeg audio filter stream via /api/theater/stream)',
  '  - Purge all fake SVG placeholder files from disk & SQLite, strictly validate binary raster headers (JPEG/PNG/WebP), and generate real story-specific paintings via Gemini/OpenAI/HuggingFace Flux.1-schnell/Pollinations/AI Horde grounded in Wikipedia + Google Books + transcribed audio',
  '  - Redesign Audiobook shelf into large 4-per-row 3D hardcover books with clean titles (stripping leading "YYYY - " year prefixes), larger typography, and icon-first buttons with hover tooltips',
  '  - Add top-level Tasks tab (/tasks) showing all active, queued, and upcoming background tasks with server daemon persistence guarantee, plus shared single-connection IPTV Stream Hub for zero-drop MP4/MKV/MP3 recording',
  '• [v0.6.9] Fix Web UI freeze/crash during 300k+ XMLTV EPG sync & DVR rule scan, optimize 35k IPTV channel aggregation, and add comprehensive Unraid container logging across all playback & UI actions',
  '  - Yield Node.js event loop during 95MB / 306k+ XMLTV EPG parsing and batch SQLite inserts into 1,500-row chunked transactions so the web server stays responsive',
  '  - Eliminate 70,000+ full-table-scan SQLite queries in DVR rule scanning and fix index-killing OR LOWER(channel_tvg_id) clauses in getIptvEpgForChannel / getBatchIptvEpg',
  '  - Deduplicate concurrent EPG sync runs and fast-path 35,000+ IPTV channel aggregation in both API and Live TV Player UI',
  '  - Mirror all client & server actions, playback starts, stream failovers, transcodes, and errors directly to Unraid container stdout/stderr logs and report dynamic package version in scheduler logs',
  '• [v0.6.8] Fix Theater tab loading across all libraries, fix Media top bar overlap, and fix Audiobook Studio sub-tab wrapping & item aggregation',
  '  - Fix empty Set lockout in Theater enabledLibsByTab state and normalize library type matching across Movie, Series, Live TV, Music, Audiobooks, and Photos tabs',
  '  - Restructure Media (/discover) top navigation into two non-overlapping rows so Media Type tabs, Status Filters, and Search never collide',
  '  - Fix 4-button sub-tab pill wrapping in Audiobooks Media Manager and Theater Audiobook Shelf so all 4 options stay on a single row',
  '  - Support library aggregation in /api/theater/items when libraryId is omitted and bump SQLite schema version to 13 so all audiobook_books_meta columns migrate cleanly',
  '• [v0.6.7] Author canonicalization, real Speech-to-Text & 3-card Storyboard player, Bedside Table & My Reads, Media tab Audiobooks & Live TV manager',
  '  - Strip/extract translator, narrator, editor, and lifespan tags so books by the same author always group under one canonical author',
  '  - Fix 0 API hits in Audiobook Studio by persisting chapter file paths, syncing key pools, and running real chunked Speech-to-Text without placeholder lines',
  '  - Redesign Audiobook Player with Left Player + Generate tab (whole-book progress & real counters) and Right 3-Card Storyboard / Picturebook view + Voice preset button on the player bar',
  '  - Separate /theater consumption (Bedside Table, Library shelves, Canonical Authors, My Reads) from /discover Media management (Audiobooks manager & always-visible editable Live TV providers)',
  '• [v0.6.6] Green API confirmation card with live metrics, backup key pool, load-balancing mode toggle, fix handleDeleteSceneImage brace leak in MusicPlayerContext',
  '• [v0.6.5] Audiobook Shelf Authors vs Books switcher, Author bookshelves with Listening Time & Year of Publication metrics, alphabetical clean sorting, auto-grouped 3D overlaid Collections with AI matcher & Explode/Create actions, and Uniform Book File Renamer with custom templates & Original/Optimized Audio version tags',
  '• [v0.6.4] Fix audiobook auto-sync & scene art fallback, mini-player book cover, Smart TV cast LAN IP/transcode, Bookshelf UI with per-book & shelf settings, unified AI key auto-detector & Dynamic Prompt',
  '• [v0.6.3] Fix vinyl spinner 1:1 circular geometry on tall/desktop screens, fix Plex & untagged audiobook grouping ("Unknown Album") & streaming, and surface full Git commit patch notes in System & Updates',
  '  - Fixed Spinning Disk, Turntable Platter, and Minimalist Vinyl aspect-ratio distortion so records always spin as true circles',
  '  - Fixed audiobook detection & grouping so untagged or Plex-cached tracks derive Author & Book Title instead of collapsing into "Unknown Album"',
  '  - Added on-the-fly Plex ratingKey part resolution and .m4b streaming support so audiobooks play directly in the Open Book Spread UI without falling back to Deezer',
  '• [v0.6.2] Fix IPTV Guide EPG auto-matching, Add Library folder browser & Audiobook AI Studio',
  '• [v0.6.1] Fix Plex remote library discovery, audio transcoding fallback & Docker self-update stream',
  '• [v0.6.0] Media Center & Theater overhaul, Live IPTV engine, Subtitles search & Music Vinyl Turntable player'
].join('\n');

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
  // Ensure the auto-updater background singleton is running
  initAutoUpdater();

  try {
    // 1. Get current version from package.json or system fallback
    let currentVersion = '0.6.10';
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

    // 2. Get latest version and recent Git commit notes from GitHub
    let latestVersion = currentVersion;
    let updateAvailable = false;
    let changelog = '';
    let recentCommits: Array<{ sha: string; date: string; title: string; body: string; author: string }> = [];

    const ghHeaders = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Schedulearr-Update-Checker'
    };

    try {
      const [commitsSettled, pkgSettled, relSettled, tagsSettled] = await Promise.allSettled([
        axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/commits?per_page=20', {
          headers: ghHeaders,
          timeout: 6000
        }),
        axios.get('https://raw.githubusercontent.com/pedrogvm97/Schedulearr/main/package.json', {
          timeout: 5000
        }),
        axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/releases/latest', {
          headers: ghHeaders,
          timeout: 5000
        }),
        axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/tags?per_page=20', {
          headers: ghHeaders,
          timeout: 5000
        })
      ]);

      const candidateVersions: string[] = [currentVersion];
      let authoritativeMainVer: string | null = null;

      // Check remote package.json on main branch (authoritative current version on main)
      if (pkgSettled.status === 'fulfilled' && pkgSettled.value.data?.version) {
        const remotePkgVer = String(pkgSettled.value.data.version).replace(/^v/i, '').trim();
        if (/^\d+\.\d+\.\d+$/.test(remotePkgVer)) {
          authoritativeMainVer = remotePkgVer;
          candidateVersions.push(remotePkgVer);
        }
      }

      // Check latest GitHub release
      let releaseNotesBody = '';
      if (relSettled.status === 'fulfilled' && relSettled.value.data?.tag_name) {
        const relVer = String(relSettled.value.data.tag_name).replace(/^v/i, '').trim();
        if (/^\d+\.\d+\.\d+$/.test(relVer) && relVer !== '1.0.0') {
          candidateVersions.push(relVer);
        }
        releaseNotesBody = (relSettled.value.data.body || '').trim();
      }

      // Check GitHub tags
      if (tagsSettled.status === 'fulfilled' && Array.isArray(tagsSettled.value.data)) {
        for (const t of tagsSettled.value.data) {
          const tv = String(t?.name || '').replace(/^v/i, '').trim();
          if (/^\d+\.\d+\.\d+$/.test(tv) && tv !== '1.0.0') {
            candidateVersions.push(tv);
          }
        }
      }

      // Parse recent GitHub commits for detailed commit patch notes (only take version from the newest commit)
      if (commitsSettled.status === 'fulfilled' && Array.isArray(commitsSettled.value.data)) {
        const formattedCommitEntries: string[] = [];
        commitsSettled.value.data.forEach((c: any, idx: number) => {
          const rawMsg: string = c?.commit?.message || '';
          if (!rawMsg) return;
          const lines = rawMsg.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
          const subject = lines[0] || '';
          if (!subject || subject.startsWith('Merge branch') || subject.includes('Merge pull request')) return;

          if (idx === 0) {
            const verMatch = subject.match(/\bv?(\d+\.\d+\.\d+)\b/);
            if (verMatch && verMatch[1] && verMatch[1] !== '1.0.0') {
              candidateVersions.push(verMatch[1]);
            }
          }

          const sha = String(c?.sha || '').slice(0, 7);
          const rawDate = c?.commit?.author?.date || c?.commit?.committer?.date || '';
          const dateStr = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : '';
          const author = c?.commit?.author?.name || c?.author?.login || 'Git';
          const bodyLines = lines.slice(1).filter((l: string) => !l.startsWith('Co-authored-by:'));

          recentCommits.push({
            sha,
            date: dateStr,
            title: subject,
            body: bodyLines.join('\n'),
            author
          });

          if (formattedCommitEntries.length < 12) {
            const prefix = [dateStr, sha ? `#${sha}` : ''].filter(Boolean).join(' · ');
            let entry = `• ${prefix ? `[${prefix}] ` : ''}${subject}`;
            if (bodyLines.length > 0) {
              const formattedBody = bodyLines
                .slice(0, 6)
                .map((b: string) => `   ${b.startsWith('-') || b.startsWith('*') || b.startsWith('•') ? b : `- ${b}`}`)
                .join('\n');
              entry += `\n${formattedBody}`;
            }
            formattedCommitEntries.push(entry);
          }
        });

        if (formattedCommitEntries.length > 0) {
          changelog = formattedCommitEntries.join('\n\n');
        }
      }

      if (authoritativeMainVer) {
        latestVersion = semverCompare(authoritativeMainVer, currentVersion) >= 0 ? authoritativeMainVer : currentVersion;
      } else {
        for (const cand of candidateVersions) {
          if (semverCompare(cand, latestVersion) > 0) {
            latestVersion = cand;
          }
        }
      }

      if (semverCompare(latestVersion, currentVersion) > 0) {
        updateAvailable = true;
      }

      if (!changelog && releaseNotesBody) {
        changelog = releaseNotesBody;
      }
    } catch (githubError: any) {
      console.error('Failed to fetch latest version from GitHub:', githubError.message);
    }

    // 3. Fallback to local git log if GitHub API was unreachable or rate-limited
    if (!changelog.trim()) {
      try {
        const gitOut = execSync('git log -n 10 --date=short --pretty=format:"%ad|%h|%s|%b===END==="', {
          cwd: process.cwd(),
          timeout: 3000,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        if (gitOut && gitOut.trim()) {
          const entries = gitOut
            .split('===END===')
            .map(s => s.trim())
            .filter(Boolean)
            .map(block => {
              const [dateStr, sha, subject, ...bodyParts] = block.split('|');
              if (!subject || subject.startsWith('Merge branch')) return '';
              const body = bodyParts.join('|').trim();
              let entry = `• [${dateStr} · #${sha}] ${subject.trim()}`;
              if (body) {
                const bLines = body
                  .split(/\r?\n/)
                  .map(l => l.trim())
                  .filter(Boolean)
                  .slice(0, 5)
                  .map(l => `   ${l.startsWith('-') || l.startsWith('*') ? l : `- ${l}`}`)
                  .join('\n');
                if (bLines) entry += `\n${bLines}`;
              }
              return entry;
            })
            .filter(Boolean);
          if (entries.length > 0) {
            changelog = entries.join('\n\n');
          }
        }
      } catch {}
    }

    // 4. Built-in fallback so update notes are never blank in Docker containers without .git
    if (!changelog.trim()) {
      changelog = FALLBACK_GIT_NOTES;
    }

    return NextResponse.json({
      currentVersion,
      latestVersion,
      updateAvailable,
      changelog,
      recentCommits,
      dockerSocketAvailable: fs.existsSync('/var/run/docker.sock')
    });
  } catch (error: any) {
    console.error('Version check API error:', error);
    return NextResponse.json({ error: 'Failed to check version' }, { status: 500 });
  }
}

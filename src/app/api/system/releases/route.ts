import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await axios.get(
      'https://api.github.com/repos/pedrogvm97/Schedulearr/releases',
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Schedulearr-Releases'
        },
        timeout: 10000
      }
    );
    const releases = response.data || [];
    let versions = releases.map((r: any) => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at,
      changelog: r.body || '',
      prerelease: r.prerelease
    }));

    // If releases list is empty or releases lack changelogs, fetch tags and commits
    if (versions.length === 0 || versions.every((v: any) => !v.changelog)) {
      try {
        const [tagsRes, commitsRes] = await Promise.all([
          axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/tags?per_page=20', {
            headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Schedulearr-Releases' },
            timeout: 5000
          }),
          axios.get('https://api.github.com/repos/pedrogvm97/Schedulearr/commits?per_page=20', {
            headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Schedulearr-Releases' },
            timeout: 5000
          })
        ]);

        const tags = Array.isArray(tagsRes.data) ? tagsRes.data : [];
        const commits = Array.isArray(commitsRes.data) ? commitsRes.data : [];

        if (tags.length > 0) {
          versions = tags.slice(0, 15).map((t: any, idx: number) => {
            const commitSlice = commits.slice(idx * 2, (idx + 1) * 2 + 2);
            const notes = commitSlice
              .map((c: any) => c.commit?.message?.split('\n')[0])
              .filter((msg: string) => msg && !msg.startsWith('Merge branch'))
              .map((msg: string) => `• ${msg}`)
              .join('\n');

            return {
              tag: t.name,
              name: t.name,
              publishedAt: new Date().toISOString(),
              changelog: notes || `Release ${t.name}`,
              prerelease: false
            };
          });
        }
      } catch (err) {}
    }

    return NextResponse.json({ versions });
  } catch (error: any) {
    console.error('Error fetching releases:', error);
    return NextResponse.json({ error: 'Failed to fetch releases from GitHub' }, { status: 500 });
  }
}

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
    const versions = releases.map((r: any) => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at,
      changelog: r.body || '',
      prerelease: r.prerelease
    }));
    return NextResponse.json({ versions });
  } catch (error: any) {
    console.error('Error fetching releases:', error);
    return NextResponse.json({ error: 'Failed to fetch releases from GitHub' }, { status: 500 });
  }
}

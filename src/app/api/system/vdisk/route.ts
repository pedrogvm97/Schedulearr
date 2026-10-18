import { NextResponse } from 'next/server';
import { getVDiskStats, cleanVDisk } from '@/lib/docker';
import { getSetting, setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getVDiskStats();
    const autoCleanEnabled = getSetting('vdisk_autoclean_enabled') === 'true';
    const autoCleanThreshold = parseInt(getSetting('vdisk_autoclean_threshold') || '80', 10);

    return NextResponse.json({
      ok: true,
      stats,
      settings: {
        autoCleanEnabled,
        autoCleanThreshold
      }
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'save_settings') {
      if (body.autoCleanEnabled !== undefined) {
        setSetting('vdisk_autoclean_enabled', body.autoCleanEnabled ? 'true' : 'false');
      }
      if (body.autoCleanThreshold !== undefined) {
        setSetting('vdisk_autoclean_threshold', String(body.autoCleanThreshold));
      }
      return NextResponse.json({ ok: true, message: 'Settings saved' });
    }

    if (!['images', 'build_cache', 'dangling', 'deep_clean'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
    }

    const result = await cleanVDisk(action);
    const updatedStats = await getVDiskStats();

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount,
      spaceReclaimed: result.spaceReclaimed,
      details: result.details,
      stats: updatedStats
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

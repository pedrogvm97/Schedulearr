import { NextResponse } from 'next/server';
import { getVDiskStats, cleanVDisk } from '@/lib/docker';
import { getSetting, setSetting } from '@/lib/db';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true' || searchParams.get('refresh') === 'true';
    const stats = await getVDiskStats(force);
    const autoCleanEnabled = getSetting('vdisk_autoclean_enabled') === 'true';
    const autoCleanThreshold = parseInt(getSetting('vdisk_autoclean_threshold') || '85', 10);
    const socketExists = fs.existsSync('/var/run/docker.sock');

    return NextResponse.json({
      ok: true,
      stats,
      totalBytes: stats.totalBytes,
      usedBytes: stats.usedBytes,
      freeBytes: stats.freeBytes,
      usedPercent: stats.usedPercent,
      imagesCount: stats.images.totalCount,
      imagesSizeBytes: stats.images.totalBytes,
      imagesReclaimableBytes: stats.images.reclaimableBytes,
      buildCacheSizeBytes: stats.buildCache.reclaimableBytes,
      buildCacheReclaimableBytes: stats.buildCache.reclaimableBytes,
      volumesSizeBytes: stats.volumes.totalBytes,
      volumesReclaimableBytes: stats.layersSizeBytes || stats.images.reclaimableBytes,
      isVDisk: stats.available,
      available: stats.available,
      dockerSocketAvailable: socketExists,
      autoPruneEnabled: autoCleanEnabled,
      autoPruneThreshold: autoCleanThreshold,
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
    const updatedStats = await getVDiskStats(true);
    const autoCleanEnabled = getSetting('vdisk_autoclean_enabled') === 'true';
    const autoCleanThreshold = parseInt(getSetting('vdisk_autoclean_threshold') || '85', 10);

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount,
      spaceReclaimed: result.spaceReclaimed,
      details: result.details,
      stats: updatedStats,
      totalBytes: updatedStats.totalBytes,
      usedBytes: updatedStats.usedBytes,
      freeBytes: updatedStats.freeBytes,
      usedPercent: updatedStats.usedPercent,
      imagesCount: updatedStats.images.totalCount,
      imagesSizeBytes: updatedStats.images.totalBytes,
      imagesReclaimableBytes: updatedStats.images.reclaimableBytes,
      buildCacheSizeBytes: updatedStats.buildCache.reclaimableBytes,
      buildCacheReclaimableBytes: updatedStats.buildCache.reclaimableBytes,
      volumesSizeBytes: updatedStats.volumes.totalBytes,
      volumesReclaimableBytes: updatedStats.layersSizeBytes || updatedStats.images.reclaimableBytes,
      isVDisk: updatedStats.available,
      available: updatedStats.available,
      autoCleanEnabled,
      autoCleanThreshold,
      autoPruneEnabled: autoCleanEnabled,
      autoPruneThreshold: autoCleanThreshold
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

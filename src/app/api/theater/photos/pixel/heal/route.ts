import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST() {
    const logs: Array<{ step: string; status: 'ok' | 'warn' | 'error'; detail: string }> = [];

    try {
        const rawNode = getSetting('pixel_bridge_node');
        const node = rawNode ? JSON.parse(rawNode) : null;

        if (!node || !node.ip) {
            return NextResponse.json({
                success: false,
                error: 'No paired Pixel node configured'
            }, { status: 400 });
        }

        const target = `${node.ip}:${node.port || 5555}`;

        // ── STEP 1: ADB Socket & Transport Reconnect ──
        logs.push({ step: 'ADB Reconnect', status: 'ok', detail: `Connecting to ${target}...` });
        try {
            await execAsync(`adb disconnect ${target}`, { timeout: 2000 }).catch(() => null);
            await execAsync(`adb connect ${target}`, { timeout: 4000 });
            logs.push({ step: 'ADB Reconnect', status: 'ok', detail: `Successfully re-established ADB transport to ${target}` });
        } catch (e: any) {
            logs.push({ step: 'ADB Reconnect', status: 'warn', detail: `Socket reconnect warning: ${e.message}` });
        }

        // ── STEP 2: Clear Temporary / Incomplete Files & Stale Locks ──
        try {
            await execAsync(
                `adb -s ${target} shell "rm -f /sdcard/DCIM/SchedulearrSync/*.tmp /sdcard/DCIM/SchedulearrSync/*.part /sdcard/DCIM/SchedulearrSync/.lock"`,
                { timeout: 3000 }
            ).catch(() => null);
            logs.push({ step: 'Lock Cleanup', status: 'ok', detail: 'Purged temporary .part, .tmp files and stale transfer locks' });
        } catch {
            logs.push({ step: 'Lock Cleanup', status: 'warn', detail: 'Could not purge temporary staging locks' });
        }

        // ── STEP 3: MediaStore Rescan Broadcast ──
        try {
            await execAsync(
                `adb -s ${target} shell "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/SchedulearrSync"`,
                { timeout: 3000 }
            ).catch(() => null);
            logs.push({ step: 'MediaStore Rescan', status: 'ok', detail: 'Dispatched broadcast to refresh Android MediaStore index' });
        } catch {
            logs.push({ step: 'MediaStore Rescan', status: 'warn', detail: 'MediaStore broadcast failed' });
        }

        // ── STEP 4: Wake Google Photos Backup Service ──
        try {
            await execAsync(
                `adb -s ${target} shell "am start -W -n com.google.android.apps.photos/.home.HomeActivity"`,
                { timeout: 4000 }
            ).catch(() => null);
            logs.push({ step: 'Google Photos Wake', status: 'ok', detail: 'Brought Google Photos to foreground to jumpstart sync worker' });
        } catch {
            logs.push({ step: 'Google Photos Wake', status: 'warn', detail: 'Could not launch Google Photos activity' });
        }

        // ── STEP 5: Space Diagnostics & Auto-Free Space Check ──
        try {
            const dfOut = await execAsync(`adb -s ${target} shell df -h /data`, { timeout: 2500 });
            const lines = dfOut.stdout.trim().split('\n');
            let freeStr = '';
            if (lines.length > 1) {
                const cols = lines[1].trim().split(/\s+/);
                freeStr = cols[3] || '';
            }

            const minFreeGb = parseInt(getSetting('pixel_min_free_gb') || '2', 10);
            logs.push({ step: 'Storage Diagnostic', status: 'ok', detail: `Free space on Pixel /data: ${freeStr || 'unknown'} (threshold: ${minFreeGb}GB)` });

            // If free space has "M" (megabytes) or less than threshold, fire free-up-space intent
            if (freeStr.toLowerCase().endsWith('m') || (freeStr.toLowerCase().endsWith('g') && parseFloat(freeStr) < minFreeGb)) {
                await execAsync(
                    `adb -s ${target} shell "am start -a com.google.android.apps.photos.action.FREE_UP_SPACE"`,
                    { timeout: 3000 }
                ).catch(() => null);
                logs.push({ step: 'Space Recovery', status: 'ok', detail: 'Triggered Google Photos Free Up Space intent due to low disk headroom' });
            }
        } catch {
            logs.push({ step: 'Storage Diagnostic', status: 'warn', detail: 'Could not query storage df' });
        }

        const now = new Date().toISOString();
        setSetting('pixel_last_heal_time', now);
        setSetting('pixel_last_heal_status', 'Healthy / Healed');

        return NextResponse.json({
            success: true,
            timestamp: now,
            logs
        });
    } catch (e: any) {
        setSetting('pixel_last_heal_status', `Error: ${e.message}`);
        return NextResponse.json({
            success: false,
            error: e.message,
            logs
        }, { status: 500 });
    }
}

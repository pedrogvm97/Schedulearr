import { NextResponse } from 'next/server';
import { getNvmeStorageStats, executeNvmeCleanup, DEFAULT_NVME_RULES, NvmeCleanRules } from '@/lib/nvmeCleaner';
import { setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const stats = await getNvmeStorageStats();
        return NextResponse.json({ ok: true, ...stats });
    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const action = body.action || 'clean';

        if (action === 'save_settings') {
            if (body.threshold !== undefined) {
                const thresh = Math.max(50, Math.min(99, parseInt(body.threshold, 10) || 80));
                setSetting('nvme_occupancy_threshold', String(thresh));
            }
            if (body.watchdogEnabled !== undefined) {
                setSetting('nvme_watchdog_enabled', body.watchdogEnabled ? 'true' : 'false');
            }
            if (body.strategy) {
                setSetting('nvme_strategy', body.strategy === 'clean_all_selected' ? 'clean_all_selected' : 'clean_to_threshold');
            }
            if (body.rules) {
                setSetting('nvme_clean_rules', JSON.stringify(body.rules));
            }
            const updated = await getNvmeStorageStats();
            return NextResponse.json({ ok: true, message: 'Settings saved', stats: updated });
        }

        if (action === 'clean') {
            const rules: Partial<NvmeCleanRules> = body.rules;
            const result = await executeNvmeCleanup(rules);
            const updated = await getNvmeStorageStats();
            return NextResponse.json({
                ok: true,
                message: `Cleaned ${result.itemsCleaned} items (${(result.reclaimedBytes / (1024 * 1024)).toFixed(1)} MB reclaimed)`,
                result,
                stats: updated
            });
        }

        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}

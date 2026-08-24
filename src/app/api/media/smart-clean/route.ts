import { NextResponse } from 'next/server';
import { runSmartCleanup, runLibrarySmartCleanup, checkAndCleanIndividualLibraries } from '@/lib/autoCleanup';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        if (body.libraryConfig) {
            const result = await runLibrarySmartCleanup(body.libraryConfig);
            return NextResponse.json(result);
        }

        if (body.action === 'clean_all_libraries') {
            const result = await checkAndCleanIndividualLibraries();
            return NextResponse.json({ success: true, results: result });
        }

        const result = await runSmartCleanup();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('API /api/media/smart-clean error:', error);
        return NextResponse.json({ error: error.message || 'Failed to run smart cleanup' }, { status: 500 });
    }
}


import { NextResponse } from 'next/server';
import { executeHousekeeping, getSetting } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        
        // Use provided values or fall back to stored settings
        const daysToKeep = body.daysToKeep || parseInt(getSetting('db_retention_days') || '30');
        const sizeLimitMB = body.sizeLimitMB || parseInt(getSetting('db_size_limit_mb') || '500');
        
        const results = executeHousekeeping(daysToKeep, sizeLimitMB);
        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function GET() {
    // Just run automatic housekeeping based on settings
    try {
        const daysToKeep = parseInt(getSetting('db_retention_days') || '30');
        const sizeLimitMB = parseInt(getSetting('db_size_limit_mb') || '500');
        
        const results = executeHousekeeping(daysToKeep, sizeLimitMB);
        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

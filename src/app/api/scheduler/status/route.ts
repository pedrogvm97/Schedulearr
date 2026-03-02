import { NextResponse } from 'next/server';
import { getSchedulerConfig } from '@/lib/db';
import { getNextSchedulerRun } from '@/lib/scheduler';

export async function GET() {
    const config = getSchedulerConfig();
    const nextRun = getNextSchedulerRun();
    return NextResponse.json({ ...config, nextRun });
}

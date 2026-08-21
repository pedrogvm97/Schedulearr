import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const instanceId = searchParams.get('instanceId');
        const page = parseInt(searchParams.get('page') || '1', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

        const lidarrInstances = getInstances().filter(i => i.type === 'lidarr' && i.enabled);

        if (lidarrInstances.length === 0) {
            return NextResponse.json({ records: [], totalRecords: 0 });
        }

        const targetInstances = instanceId
            ? lidarrInstances.filter(i => i.id === instanceId)
            : lidarrInstances;

        const allMissing: any[] = [];
        let total = 0;

        for (const inst of targetInstances) {
            try {
                const lidarrUrl = inst.url.replace(/\/$/, '');
                const res = await axios.get(`${lidarrUrl}/api/v1/wanted/missing?page=${page}&pageSize=${pageSize}&sortKey=releaseDate&sortDirection=descending`, {
                    headers: { 'X-Api-Key': inst.api_key },
                    timeout: 8000
                });

                if (res.data?.records) {
                    for (const r of res.data.records) {
                        allMissing.push({
                            ...r,
                            instanceId: inst.id,
                            instanceName: inst.name
                        });
                    }
                    total += res.data.totalRecords || res.data.records.length;
                }
            } catch (e: any) {
                console.warn(`Failed to fetch missing from Lidarr ${inst.name}:`, e.message);
            }
        }

        return NextResponse.json({ records: allMissing, totalRecords: total });
    } catch (error: any) {
        console.error('API /lidarr/missing error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';

async function fetchRootFolders(url: string, apiKey: string): Promise<any[]> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/rootfolder`, {
            headers: { 'X-Api-Key': apiKey },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export async function GET() {
    const radarrs = getInstances('radarr', true);
    const sonarrs = getInstances('sonarr', true);

    let totalFreeBytes = 0;
    let totalBytes = 0;
    const byInstance: { id: string; name: string; type: string; folders: { path: string; freeBytes: number; totalBytes: number }[] }[] = [];

    for (const inst of [...radarrs, ...sonarrs]) {
        const folders = await fetchRootFolders(inst.url, inst.api_key);
        const instFolders = folders.map((f: any) => {
            const free = f.freeSpace ?? 0;
            let total = f.totalSpace ?? 0;
            if (total < free) {
                total = free;
            }
            return {
                path: f.path,
                freeBytes: free,
                totalBytes: total
            };
        });

        const instFree = instFolders.reduce((s: number, f: any) => s + f.freeBytes, 0);
        const instTotal = instFolders.reduce((s: number, f: any) => s + f.totalBytes, 0);

        // Avoid double-counting if Radarr and Sonarr share the same root folder
        // We accumulate totals and de-duplicate by tracking max unique total sizes seen
        totalFreeBytes += instFree;
        totalBytes += instTotal;

        byInstance.push({
            id: inst.id,
            name: inst.name,
            type: inst.type,
            folders: instFolders
        });
    }

    // Simple de-duplication: if multiple instances report the same totalSpace, only count once
    // Group by totalBytes value and take unique totals
    const uniqueInstances = new Map<number, typeof byInstance[0]>();
    for (const inst of byInstance) {
        const total = inst.folders.reduce((s, f) => s + f.totalBytes, 0);
        if (!uniqueInstances.has(total) || inst.folders.some(f => f.totalBytes > 0)) {
            uniqueInstances.set(total, inst);
        }
    }

    const deduped = Array.from(uniqueInstances.values());
    const dedupedTotal = deduped.reduce((s, inst) => s + inst.folders.reduce((fs, f) => fs + f.totalBytes, 0), 0);
    const dedupedFree = deduped.reduce((s, inst) => s + inst.folders.reduce((fs, f) => fs + f.freeBytes, 0), 0);
    const dedupedUsed = dedupedTotal - dedupedFree;
    const usedPercent = dedupedTotal > 0 ? Math.round((dedupedUsed / dedupedTotal) * 100) : 0;

    return NextResponse.json({
        totalBytes: dedupedTotal,
        freeBytes: dedupedFree,
        usedBytes: dedupedUsed,
        usedPercent,
        byInstance: deduped
    });
}

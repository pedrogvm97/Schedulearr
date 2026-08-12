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

async function fetchDiskSpace(url: string, apiKey: string): Promise<any[]> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/diskspace`, {
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
        let folders = await fetchDiskSpace(inst.url, inst.api_key);
        if (folders.length === 0) {
            folders = await fetchRootFolders(inst.url, inst.api_key);
        }
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

    // Deduplicate shared NAS volumes across instances
    // Root folders residing on the same volume share matching total & free space signatures
    const allFolders: { path: string; freeBytes: number; totalBytes: number; instanceName: string }[] = [];
    for (const inst of byInstance) {
        for (const f of inst.folders) {
            allFolders.push({ ...f, instanceName: inst.name });
        }
    }

    const uniqueVolumes = new Map<string, typeof allFolders[0]>();
    for (const f of allFolders) {
        if (f.totalBytes <= 0) continue;
        
        // Group by exact totalBytes and fuzzy freeBytes (within 500MB)
        // This prevents distinct physical drives of the exact same size from being merged
        // if they have different free space, while still properly deduplicating shared
        // NAS network volumes that might have slight free space jitter between API calls.
        let foundKey: string | null = null;
        for (const [key, existing] of uniqueVolumes.entries()) {
            if (existing.totalBytes === f.totalBytes) {
                const diffBytes = Math.abs(existing.freeBytes - f.freeBytes);
                if (diffBytes < 500 * 1024 * 1024) { // 500MB jitter allowance
                    foundKey = key;
                    break;
                }
            }
        }

        if (foundKey) {
            // Same volume, keep the most conservative (smallest) free space
            const existing = uniqueVolumes.get(foundKey)!;
            if (f.freeBytes < existing.freeBytes) {
                uniqueVolumes.set(foundKey, f);
            }
        } else {
            uniqueVolumes.set(`${f.path}_${f.totalBytes}_${f.freeBytes}`, f);
        }
    }

    const dedupedFolders = Array.from(uniqueVolumes.values());
    const dedupedTotal = dedupedFolders.reduce((s, f) => s + f.totalBytes, 0);
    const dedupedFree = dedupedFolders.reduce((s, f) => s + f.freeBytes, 0);
    const dedupedUsed = Math.max(0, dedupedTotal - dedupedFree);
    const usedPercent = dedupedTotal > 0 ? Math.round((dedupedUsed / dedupedTotal) * 100) : 0;

    return NextResponse.json({
        totalBytes: dedupedTotal,
        freeBytes: dedupedFree,
        usedBytes: dedupedUsed,
        usedPercent,
        byInstance
    });
}

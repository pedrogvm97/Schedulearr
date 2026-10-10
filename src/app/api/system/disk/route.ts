import { NextResponse } from 'next/server';
import { getInstances, getDvrStorageFolders, getDvrRecordings } from '@/lib/db';
import { twColorToHex } from '@/lib/instanceColor';

async function fetchRootFolders(url: string, apiKey: string): Promise<any[]> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/rootfolder`, {
            headers: { 'X-Api-Key': apiKey },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(4000)
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
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

async function fetchLidarrRootFolders(url: string, apiKey: string): Promise<any[]> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v1/rootfolder`, {
            headers: { 'X-Api-Key': apiKey },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

async function fetchLidarrDiskSpace(url: string, apiKey: string): Promise<any[]> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v1/diskspace`, {
            headers: { 'X-Api-Key': apiKey },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

async function fetchRadarrMediaSize(url: string, apiKey: string): Promise<number> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/movie`, {
            headers: { 'X-Api-Key': apiKey },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return 0;
        const movies = await res.json();
        return (movies || []).reduce((sum: number, m: any) => sum + (m.sizeOnDisk || m.statistics?.sizeOnDisk || m.movieFile?.size || 0), 0);
    } catch {
        return 0;
    }
}

async function fetchSonarrMediaSize(url: string, apiKey: string): Promise<number> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/series`, {
            headers: { 'X-Api-Key': apiKey },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return 0;
        const series = await res.json();
        return (series || []).reduce((sum: number, s: any) => sum + (s.statistics?.sizeOnDisk || s.sizeOnDisk || 0), 0);
    } catch {
        return 0;
    }
}

async function fetchLidarrMediaSize(url: string, apiKey: string): Promise<number> {
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/v1/artist`, {
            headers: { 'X-Api-Key': apiKey },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return 0;
        const artists = await res.json();
        return (artists || []).reduce((sum: number, a: any) => sum + (a.statistics?.sizeOnDisk || 0), 0);
    } catch {
        return 0;
    }
}

export async function GET() {
    const radarrs = getInstances('radarr', true);
    const sonarrs = getInstances('sonarr', true);
    const lidarrs = getInstances('lidarr', true);

    let totalFreeBytes = 0;
    let totalBytes = 0;
    const byInstance: {
        id: string;
        name: string;
        type: string;
        color?: string;
        colorHex: string;
        mediaBytes: number;
        folders: { path: string; freeBytes: number; totalBytes: number }[];
    }[] = [];

    // Process Radarr & Sonarr
    for (const inst of [...radarrs, ...sonarrs]) {
        let folders = await fetchDiskSpace(inst.url, inst.api_key);
        if (folders.length === 0) {
            folders = await fetchRootFolders(inst.url, inst.api_key);
        }
        const instFolders = folders.map((f: any) => {
            const free = f.freeSpace ?? 0;
            let total = f.totalSpace ?? 0;
            if (total < free) total = free;
            return {
                path: f.path,
                freeBytes: free,
                totalBytes: total
            };
        });

        const instFree = instFolders.reduce((s: number, f: any) => s + f.freeBytes, 0);
        const instTotal = instFolders.reduce((s: number, f: any) => s + f.totalBytes, 0);
        totalFreeBytes += instFree;
        totalBytes += instTotal;

        // Fetch actual media content size
        const mediaBytes = inst.type === 'radarr'
            ? await fetchRadarrMediaSize(inst.url, inst.api_key)
            : await fetchSonarrMediaSize(inst.url, inst.api_key);

        byInstance.push({
            id: inst.id,
            name: inst.name,
            type: inst.type,
            color: inst.color,
            colorHex: twColorToHex(inst.color),
            mediaBytes,
            folders: instFolders
        });
    }

    // Process Lidarr (Audio)
    for (const inst of lidarrs) {
        let folders = await fetchLidarrDiskSpace(inst.url, inst.api_key);
        if (folders.length === 0) {
            folders = await fetchLidarrRootFolders(inst.url, inst.api_key);
        }
        const instFolders = folders.map((f: any) => {
            const free = f.freeSpace ?? 0;
            let total = f.totalSpace ?? 0;
            if (total < free) total = free;
            return {
                path: f.path,
                freeBytes: free,
                totalBytes: total
            };
        });

        const instFree = instFolders.reduce((s: number, f: any) => s + f.freeBytes, 0);
        const instTotal = instFolders.reduce((s: number, f: any) => s + f.totalBytes, 0);
        totalFreeBytes += instFree;
        totalBytes += instTotal;

        const mediaBytes = await fetchLidarrMediaSize(inst.url, inst.api_key);

        byInstance.push({
            id: inst.id,
            name: inst.name,
            type: 'lidarr',
            color: inst.color,
            colorHex: twColorToHex(inst.color),
            mediaBytes,
            folders: instFolders
        });
    }

    // Process IPTV DVR Recordings
    const dvrFolders = getDvrStorageFolders();
    const dvrRecordings = getDvrRecordings(500);
    const dvrUsedBytes = dvrRecordings
        .filter(r => (r.status === 'completed' || r.status === 'recording') && r.file_size)
        .reduce((s, r) => s + (r.file_size || 0), 0);

    if (dvrFolders.length > 0 || dvrUsedBytes > 0) {
        byInstance.push({
            id: 'iptv-dvr',
            name: 'IPTV Recordings',
            type: 'iptv_dvr',
            color: 'rose',
            colorHex: '#f43f5e',
            mediaBytes: dvrUsedBytes,
            folders: dvrFolders.map(f => ({
                path: f.path,
                freeBytes: 0,
                totalBytes: dvrUsedBytes
            }))
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

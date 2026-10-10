import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getTheaterLibraries, getInstances, logSystemEvent } from '@/lib/db';
import { discoverUnraidPlexMountsAndRoot, ensureUnraidPathPermissions } from '@/lib/docker';

export const dynamic = 'force-dynamic';

function translateToAccessibleUnraidPath(
    rawPath: string,
    mountMappings: Array<{ hostPath: string; containerPath: string; sourceContainer: string }>
): string {
    if (!rawPath) return '';
    const cleaned = rawPath.replace(/\/+$/, '');
    if (fs.existsSync(cleaned)) return cleaned;

    // 1. Try Docker mount mappings from Plex/Radarr/Sonarr/Schedulearr containers
    for (const m of mountMappings) {
        if (cleaned === m.containerPath || cleaned.startsWith(m.containerPath + '/')) {
            const candidate = m.hostPath + cleaned.slice(m.containerPath.length);
            if (fs.existsSync(candidate) || fs.existsSync(path.dirname(candidate))) {
                return candidate;
            }
        }
        if (cleaned === m.hostPath || cleaned.startsWith(m.hostPath + '/')) {
            const candidate = m.containerPath + cleaned.slice(m.hostPath.length);
            if (fs.existsSync(candidate) || fs.existsSync(path.dirname(candidate))) {
                return candidate;
            }
        }
    }

    // 2. Common Unraid prefixes (/data/media <-> /mnt/user/data/media, /media <-> /mnt/user/media)
    const prefixes: Array<[string, string]> = [
        ['/data/media', '/mnt/user/data/media'],
        ['/mnt/user/data/media', '/data/media'],
        ['/data', '/mnt/user/data'],
        ['/mnt/user/data', '/data'],
        ['/media', '/mnt/user/media'],
        ['/mnt/user/media', '/media'],
        ['/media', '/mnt/user/Media'],
        ['/mnt/user/Media', '/media'],
    ];

    for (const [fromPrefix, toPrefix] of prefixes) {
        if (cleaned === fromPrefix || cleaned.startsWith(fromPrefix + '/')) {
            const candidate = toPrefix + cleaned.slice(fromPrefix.length);
            if (fs.existsSync(candidate) || fs.existsSync(path.dirname(candidate))) {
                return candidate;
            }
        }
    }

    return cleaned;
}

export async function discoverPlexMediaFolderHierarchy(): Promise<{
    plexMediaRoot: string;
    libraries: Array<{ id: string; name: string; type: string; rootPath: string }>;
    allowedRoots: string[];
}> {
    const mountDiscovery = await discoverUnraidPlexMountsAndRoot();
    const dbLibraries = getTheaterLibraries().filter(l => l.type !== 'live');
    const resolvedLibraries: Array<{ id: string; name: string; type: string; rootPath: string }> = [];
    const seenPaths = new Set<string>();

    // 1. Resolve configured Theater libraries
    for (const lib of dbLibraries) {
        let folderList: string[] = [];
        try {
            folderList = typeof lib.folders === 'string' ? JSON.parse(lib.folders) : (Array.isArray(lib.folders) ? lib.folders : []);
        } catch {
            folderList = [];
        }
        const rawRoot = folderList[0] || '';
        const resolvedRoot = translateToAccessibleUnraidPath(rawRoot, mountDiscovery.mountMappings);
        if (resolvedRoot) {
            seenPaths.add(resolvedRoot);
            resolvedLibraries.push({
                id: lib.id,
                name: lib.name,
                type: lib.type,
                rootPath: resolvedRoot
            });
        }
    }

    // 2. Also query live Plex sections so every Plex library folder inside the Plex Media Folder is discovered
    const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
    for (const plex of plexInstances) {
        try {
            const plexUrl = plex.url.replace(/\/$/, '');
            const secRes = await axios.get(`${plexUrl}/library/sections`, {
                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                timeout: 5000
            });
            const rawDirs = secRes.data?.MediaContainer?.Directory || [];
            const dirs = Array.isArray(rawDirs) ? rawDirs : [rawDirs].filter(Boolean);
            for (const dir of dirs) {
                const locs = Array.isArray(dir.Location) ? dir.Location : [dir.Location].filter(Boolean);
                for (const loc of locs) {
                    if (!loc?.path) continue;
                    const resolvedLoc = translateToAccessibleUnraidPath(String(loc.path), mountDiscovery.mountMappings);
                    if (resolvedLoc && !seenPaths.has(resolvedLoc)) {
                        seenPaths.add(resolvedLoc);
                        resolvedLibraries.push({
                            id: `plex-sec-${dir.key}`,
                            name: dir.title || path.basename(resolvedLoc),
                            type: dir.type || 'movie',
                            rootPath: resolvedLoc
                        });
                    }
                }
            }
        } catch {}
    }

    // 3. Determine the parent Plex Media Root Folder (the folder on Unraid containing each library folder)
    const parentCounts = new Map<string, number>();
    for (const lib of resolvedLibraries) {
        if (!lib.rootPath) continue;
        const parentDir = path.dirname(lib.rootPath);
        if (parentDir && parentDir !== '/' && parentDir !== '.') {
            parentCounts.set(parentDir, (parentCounts.get(parentDir) || 0) + 1);
        }
    }

    let plexMediaRoot = '';
    let bestCount = 0;
    for (const [parentDir, count] of parentCounts.entries()) {
        if (count > bestCount && fs.existsSync(parentDir)) {
            bestCount = count;
            plexMediaRoot = parentDir;
        }
    }
    if (!plexMediaRoot) {
        const firstParent = Array.from(parentCounts.keys())[0];
        if (firstParent) {
            plexMediaRoot = firstParent;
        } else if (mountDiscovery.plexRootCandidates.length > 0) {
            plexMediaRoot = mountDiscovery.plexRootCandidates[0];
        } else if (resolvedLibraries[0]?.rootPath) {
            plexMediaRoot = path.dirname(resolvedLibraries[0].rootPath);
        }
    }

    // 4. Also scan direct child folders inside plexMediaRoot so any folder inside the Plex Media Folder is visible
    if (plexMediaRoot && fs.existsSync(plexMediaRoot)) {
        try {
            const entries = fs.readdirSync(plexMediaRoot, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
                const fullChild = path.join(plexMediaRoot, entry.name);
                if (!seenPaths.has(fullChild)) {
                    seenPaths.add(fullChild);
                    resolvedLibraries.push({
                        id: `plex-folder-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                        name: entry.name,
                        type: 'folder',
                        rootPath: fullChild
                    });
                }
            }
        } catch {}
    }

    const allowedRoots = Array.from(new Set([
        ...(plexMediaRoot ? [plexMediaRoot] : []),
        ...resolvedLibraries.map(l => l.rootPath).filter(Boolean),
        ...mountDiscovery.plexRootCandidates
    ]));

    return {
        plexMediaRoot,
        libraries: resolvedLibraries,
        allowedRoots
    };
}

export function isPathInsidePlexMediaFolder(targetPath: string, allowedRoots: string[]): boolean {
    if (!targetPath) return false;
    const normTarget = path.resolve(targetPath).replace(/\\/g, '/').toLowerCase();
    // Never allow /app/recordings or /app/data/recordings
    if (
        normTarget.includes('/app/recordings') ||
        normTarget.includes('/app/data/recordings') ||
        normTarget.endsWith('/arr-scheduler/recordings')
    ) {
        return false;
    }
    if (allowedRoots.length === 0) return true;
    return allowedRoots.some(root => {
        const normRoot = path.resolve(root).replace(/\\/g, '/').toLowerCase();
        return normTarget === normRoot || normTarget.startsWith(normRoot + '/');
    });
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');
        const targetPath = searchParams.get('path');

        const { plexMediaRoot, libraries, allowedRoots } = await discoverPlexMediaFolderHierarchy();

        let activeRoot = targetPath || '';
        if (!activeRoot && libraryId) {
            if (libraryId === '__plex_root__' && plexMediaRoot) {
                activeRoot = plexMediaRoot;
            } else {
                const lib = libraries.find(l => l.id === libraryId);
                if (lib?.rootPath) {
                    activeRoot = lib.rootPath;
                }
            }
        }
        if (!activeRoot) {
            activeRoot = plexMediaRoot || libraries[0]?.rootPath || '';
        }

        const subfolders: Array<{ name: string; path: string }> = [];
        if (activeRoot && fs.existsSync(activeRoot)) {
            try {
                const entries = fs.readdirSync(activeRoot, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        subfolders.push({
                            name: entry.name,
                            path: path.join(activeRoot, entry.name)
                        });
                    }
                }
                subfolders.sort((a, b) => a.name.localeCompare(b.name));
            } catch {
                // Attempt automated permission repair on Unraid if directory listing failed
                await ensureUnraidPathPermissions(activeRoot).catch(() => {});
            }
        }

        const parentDir = activeRoot ? path.dirname(activeRoot) : '';
        const canGoUp = Boolean(
            parentDir &&
            parentDir !== activeRoot &&
            isPathInsidePlexMediaFolder(parentDir, allowedRoots)
        );

        const allLibraryEntries = [
            ...(plexMediaRoot
                ? [{
                    id: '__plex_root__',
                    name: `Plex Media Root (${path.basename(plexMediaRoot) || plexMediaRoot})`,
                    type: 'plex_root',
                    rootPath: plexMediaRoot
                }]
                : []),
            ...libraries
        ];

        return NextResponse.json({
            ok: true,
            plexMediaRoot,
            allowedRoots,
            libraries: allLibraryEntries,
            currentPath: activeRoot,
            parentPath: canGoUp ? parentDir : null,
            subfolders
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { parentPath, folderName, action } = body;

        const { plexMediaRoot, allowedRoots } = await discoverPlexMediaFolderHierarchy();

        if (action === 'fix_permissions') {
            const target = parentPath || plexMediaRoot;
            if (!target) {
                return NextResponse.json({ ok: false, error: 'No Plex Media Folder path found to repair permissions' }, { status: 400 });
            }
            const permResult = await ensureUnraidPathPermissions(target);
            logSystemEvent('UNRAID-PERMS', `Automated Unraid permission command executed on "${target}" via ${permResult.method}`);
            return NextResponse.json({ ...permResult, ok: true, target });
        }

        const effectiveParent = parentPath || plexMediaRoot;
        if (!effectiveParent || !folderName) {
            return NextResponse.json({ ok: false, error: 'parentPath and folderName are required' }, { status: 400 });
        }

        if (!isPathInsidePlexMediaFolder(effectiveParent, allowedRoots)) {
            return NextResponse.json({
                ok: false,
                error: 'Recordings and folders can ONLY be created inside your Plex Media Folder on Unraid (or downloaded to your local device Downloads folder).'
            }, { status: 400 });
        }

        const safeName = String(folderName)
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!safeName) {
            return NextResponse.json({ ok: false, error: 'Invalid folder name' }, { status: 400 });
        }

        const newFullPath = path.join(effectiveParent, safeName);
        if (!fs.existsSync(newFullPath)) {
            fs.mkdirSync(newFullPath, { recursive: true, mode: 0o777 });
        }

        // Automatically run Unraid permission command (chmod 777 + chown 99:100 nobody:users)
        const permRes = await ensureUnraidPathPermissions(newFullPath);

        logSystemEvent(
            'RECORDER-FOLDER',
            `Created folder "${safeName}" inside Plex Media Folder at ${newFullPath} (Unraid permissions applied via ${permRes.method})`
        );

        return NextResponse.json({
            ok: true,
            createdPath: newFullPath,
            folderName: safeName,
            permissionsMethod: permRes.method
        });
    } catch (e: any) {
        console.error('[RECORDER-FOLDER] Error creating folder:', e.message);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

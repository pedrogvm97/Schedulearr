import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTheaterLibraries } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const libraryId = searchParams.get('libraryId');
        const targetPath = searchParams.get('path');

        const libraries = getTheaterLibraries().filter(l => l.type !== 'live');

        let activeRoot = targetPath || '';
        if (!activeRoot && libraryId) {
            const lib = libraries.find(l => l.id === libraryId);
            if (lib && lib.folders?.[0]) {
                activeRoot = lib.folders[0];
            }
        }
        if (!activeRoot && libraries[0]?.folders?.[0]) {
            activeRoot = libraries[0].folders[0];
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
                // ignore permission errors
            }
        }

        return NextResponse.json({
            ok: true,
            libraries: libraries.map(l => ({
                id: l.id,
                name: l.name,
                type: l.type,
                rootPath: l.folders?.[0] || ''
            })),
            currentPath: activeRoot,
            subfolders
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { parentPath, folderName } = body;

        if (!parentPath || !folderName) {
            return NextResponse.json({ ok: false, error: 'parentPath and folderName are required' }, { status: 400 });
        }

        const safeName = String(folderName)
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!safeName) {
            return NextResponse.json({ ok: false, error: 'Invalid folder name' }, { status: 400 });
        }

        const newFullPath = path.join(parentPath, safeName);
        if (!fs.existsSync(newFullPath)) {
            fs.mkdirSync(newFullPath, { recursive: true });
        }

        console.log(`[${new Date().toISOString()}] 📁 [RECORDER-FOLDER] Created custom recording folder on server: ${newFullPath}`);

        return NextResponse.json({
            ok: true,
            createdPath: newFullPath,
            folderName: safeName
        });
    } catch (e: any) {
        console.error('[RECORDER-FOLDER] Error creating folder:', e.message);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

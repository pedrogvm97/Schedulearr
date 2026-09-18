import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

function findVlcBinary(): string | null {
    if (process.platform === 'win32') {
        const standardPaths = [
            'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
            'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'VLC', 'vlc.exe')
        ];
        for (const p of standardPaths) {
            if (fs.existsSync(p)) return p;
        }
        return 'vlc.exe';
    }
    return 'vlc';
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { path: targetPath, action = 'default' } = body;

        if (!targetPath || typeof targetPath !== 'string') {
            return NextResponse.json({ error: 'Missing target path' }, { status: 400 });
        }

        const resolvedPath = path.resolve(targetPath);
        if (!fs.existsSync(resolvedPath)) {
            return NextResponse.json({ error: `File or directory not found on host: "${resolvedPath}"` }, { status: 404 });
        }

        const isWin = process.platform === 'win32';
        const isMac = process.platform === 'darwin';

        if (action === 'reveal') {
            if (isWin) {
                // Windows: explorer /select,"C:\path\to\file"
                const child = spawn('explorer.exe', [`/select,${resolvedPath}`], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
            } else if (isMac) {
                const child = spawn('open', ['-R', resolvedPath], { detached: true, stdio: 'ignore' });
                child.unref();
            } else {
                const parentDir = fs.statSync(resolvedPath).isDirectory() ? resolvedPath : path.dirname(resolvedPath);
                const child = spawn('xdg-open', [parentDir], { detached: true, stdio: 'ignore' });
                child.unref();
            }

            return NextResponse.json({
                success: true,
                message: `Opened folder for "${path.basename(resolvedPath)}"`
            });
        }

        if (action === 'vlc') {
            const vlcPath = findVlcBinary();
            try {
                if (vlcPath && (fs.existsSync(vlcPath) || vlcPath === 'vlc.exe' || vlcPath === 'vlc')) {
                    const child = spawn(vlcPath, [resolvedPath], {
                        detached: true,
                        stdio: 'ignore',
                        shell: isWin
                    });
                    child.unref();
                    return NextResponse.json({
                        success: true,
                        message: `Opened in VLC: "${path.basename(resolvedPath)}"`
                    });
                }
            } catch (err: any) {
                console.warn('[OPEN-FILE] VLC launch failed, falling back to default player:', err.message);
            }
        }

        // Action 'default' or fallback
        if (isWin) {
            const child = spawn('cmd.exe', ['/c', 'start', '""', resolvedPath], {
                detached: true,
                stdio: 'ignore',
                windowsVerbatimArguments: true
            });
            child.unref();
        } else if (isMac) {
            const child = spawn('open', [resolvedPath], { detached: true, stdio: 'ignore' });
            child.unref();
        } else {
            const child = spawn('xdg-open', [resolvedPath], { detached: true, stdio: 'ignore' });
            child.unref();
        }

        return NextResponse.json({
            success: true,
            message: `Opened "${path.basename(resolvedPath)}" with system player.`
        });
    } catch (error: any) {
        console.error('API /system/open-file error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

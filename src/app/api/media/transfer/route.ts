import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import * as radarr from '@/lib/radarr';
import * as sonarr from '@/lib/sonarr';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const {
            item,
            sourceInstanceId,
            targetInstanceId,
            targetProfileId,
            targetRootFolder,
            action, // 'transfer' or 'copy'
            moveFiles,
            mediaType // 'movie' or 'series'
        } = payload;

        if (!item || !sourceInstanceId || !targetInstanceId || !targetProfileId || !targetRootFolder) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const sourceInstance = getInstanceById(sourceInstanceId);
        const targetInstance = getInstanceById(targetInstanceId);

        if (!sourceInstance || !targetInstance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const isMovie = mediaType === 'movie';
        const lib = isMovie ? radarr : sonarr;

        // 1. Prepare payload for adding to target
        let addPayload: any;
        if (isMovie) {
            addPayload = {
                title: item.title,
                tmdbId: item.tmdbId,
                year: item.year,
                qualityProfileId: targetProfileId,
                rootFolderPath: targetRootFolder,
                monitored: true,
                addOptions: { searchForMovie: true }
            };
        } else {
            addPayload = {
                title: item.title,
                tvdbId: item.tvdbId,
                qualityProfileId: targetProfileId,
                rootFolderPath: targetRootFolder,
                monitored: true,
                addOptions: { searchForMissingEpisodes: true }
            };
        }

        // 2. Add to target instance
        const addResult = await (isMovie ? radarr.addMovie(targetInstance.url, targetInstance.api_key, addPayload) : sonarr.addSeries(targetInstance.url, targetInstance.api_key, addPayload));

        if (!addResult.success) {
            // Check if this is a duplicate conflict (Radarr/Sonarr return messages containing these strings)
            const errStr = typeof addResult.error === 'string'
                ? addResult.error
                : Array.isArray(addResult.error)
                    ? addResult.error.map((e: any) => e.errorMessage || JSON.stringify(e)).join(' ')
                    : JSON.stringify(addResult.error);

            const isDuplicate = /already been added|already exists|duplicate/i.test(errStr);

            if (isDuplicate) {
                return NextResponse.json({
                    error: `"${item.title}" already exists on the target instance. No changes were made.`,
                    code: 'ALREADY_EXISTS'
                }, { status: 409 });
            }

            return NextResponse.json({ error: `Failed to add to target: ${errStr}` }, { status: 400 });
        }

        // 3. Handle Files if requested
        if (moveFiles && item.path) {
            try {
                const sourcePath = item.path;
                const folderName = path.basename(sourcePath);
                const destPath = path.join(targetRootFolder, folderName);

                if (fs.existsSync(sourcePath)) {
                    // Create destination parent if it doesn't exist
                    if (!fs.existsSync(targetRootFolder)) {
                        fs.mkdirSync(targetRootFolder, { recursive: true });
                    }

                    if (action === 'transfer') {
                        // Move: Copy + then let the deleteMedia handle it if it fails, 
                        // but better to move now if possible for speed
                        try {
                            fs.renameSync(sourcePath, destPath);
                            console.log(`[TRANSFER] Moved files from ${sourcePath} to ${destPath}`);
                        } catch (moveErr) {
                            // If rename fails (e.g. cross-drive), try copy + unlink
                            fs.cpSync(sourcePath, destPath, { recursive: true });
                            console.log(`[TRANSFER] Copied files from ${sourcePath} to ${destPath} (rename failed)`);
                        }
                    } else {
                        // Copy: Just copy
                        fs.cpSync(sourcePath, destPath, { recursive: true });
                        console.log(`[TRANSFER] Copied files from ${sourcePath} to ${destPath}`);
                    }
                }
            } catch (fileErr) {
                console.error(`[TRANSFER] Failed to manage physical files for ${item.title}:`, fileErr);
                // We don't fail the whole request, as the item was added to the *arr instance
            }
        }

        // 4. If action is 'transfer', delete from source
        if (action === 'transfer') {
            const deleteSuccess = await (isMovie
                ? radarr.deleteMovie(sourceInstance.url, sourceInstance.api_key, item.id, !moveFiles) // If we already moved files, don't ask radarr to delete them (they are gone)
                : sonarr.deleteSeries(sourceInstance.url, sourceInstance.api_key, item.id, !moveFiles)
            );
            if (!deleteSuccess) {
                console.warn(`[TRANSFER] Added to target but failed to delete from source: ${item.title}`);
            }
        }

        return NextResponse.json({ success: true, targetItem: addResult.data });

    } catch (error) {
        console.error('API /media/transfer error:', error);
        return NextResponse.json({ error: 'Internal server error during transfer' }, { status: 500 });
    }
}

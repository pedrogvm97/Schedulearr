import { NextResponse } from 'next/server';
import { getInstanceById } from '@/lib/db';
import * as radarr from '@/lib/radarr';
import * as sonarr from '@/lib/sonarr';
import { refreshRadarrCacheForInstance, refreshSonarrCacheForInstance } from '@/lib/mediaCache';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        let {
            item,
            sourceInstanceId,
            targetInstanceId,
            targetProfileId,
            targetRootFolder,
            action, // 'transfer' or 'copy'
            moveFiles,
            mediaType // 'movie' or 'series'
        } = payload;

        // Support alternative field names from various callers
        sourceInstanceId = sourceInstanceId || payload.sourceId;
        targetInstanceId = targetInstanceId || payload.targetId;
        targetProfileId = targetProfileId || payload.profileId || payload.qualityProfileId;
        targetRootFolder = targetRootFolder || payload.rootFolder || payload.rootFolderPath;
        action = action || (payload.deleteFromSource ? 'transfer' : 'copy');
        moveFiles = moveFiles ?? payload.copyFiles ?? false;
        mediaType = mediaType || payload.type || (payload.item?.type === 'series' || payload.item?.tvdbId ? 'series' : 'movie');

        const sourceInstance = sourceInstanceId ? getInstanceById(sourceInstanceId) : null;
        const targetInstance = targetInstanceId ? getInstanceById(targetInstanceId) : null;

        if (!sourceInstance || !targetInstance) {
            return NextResponse.json({ error: 'Source or Target instance not found' }, { status: 404 });
        }

        if (!targetProfileId || !targetRootFolder) {
            return NextResponse.json({ error: 'Missing targetProfileId or targetRootFolder' }, { status: 400 });
        }

        // If item object not passed, look it up from source instance using mediaId / id
        if (!item) {
            const mediaId = payload.mediaId || payload.id;
            if (mediaId) {
                if (mediaType === 'movie') {
                    const allMovies = await radarr.getAllMovies(sourceInstance.url, sourceInstance.api_key);
                    item = allMovies.find((m: any) => m.id === Number(mediaId));
                } else {
                    const allSeries = await sonarr.getAllSeries(sourceInstance.url, sourceInstance.api_key);
                    item = allSeries.find((s: any) => s.id === Number(mediaId));
                }
            }
        }

        if (!item) {
            return NextResponse.json({ error: 'Missing media item for transfer' }, { status: 400 });
        }

        const isMovie = mediaType === 'movie';

        // 1. Prepare payload for adding to target
        let addPayload: any;
        if (isMovie) {
            let lookupObj: any = null;
            if (item.tmdbId) {
                try {
                    const lookups = await radarr.searchMovies(targetInstance.url, targetInstance.api_key, `tmdb:${item.tmdbId}`);
                    if (Array.isArray(lookups) && lookups.length > 0) {
                        lookupObj = lookups[0];
                    }
                } catch (e) {
                    console.warn(`Radarr lookup failed for tmdb:${item.tmdbId}, using item data`);
                }
            }

            addPayload = {
                ...(lookupObj || {}),
                title: item.title,
                tmdbId: item.tmdbId,
                year: item.year || lookupObj?.year,
                qualityProfileId: targetProfileId,
                rootFolderPath: targetRootFolder,
                monitored: true,
                addOptions: { searchForMovie: !moveFiles }
            };
        } else {
            let lookupObj: any = null;
            if (item.tvdbId) {
                try {
                    const lookups = await sonarr.searchSeries(targetInstance.url, targetInstance.api_key, `tvdb:${item.tvdbId}`);
                    if (Array.isArray(lookups) && lookups.length > 0) {
                        lookupObj = lookups[0];
                    }
                } catch (e) {
                    console.warn(`Sonarr lookup failed for tvdb:${item.tvdbId}, using item data`);
                }
            }

            // Determine seriesType ('anime' vs 'standard')
            let seriesType = item.seriesType || lookupObj?.seriesType || 'standard';
            if (targetInstance.name.toLowerCase().includes('anime')) {
                seriesType = 'anime';
            } else if (sourceInstance.name.toLowerCase().includes('anime') && !targetInstance.name.toLowerCase().includes('anime')) {
                seriesType = 'standard';
            }

            addPayload = {
                ...(lookupObj || {}),
                title: item.title,
                tvdbId: item.tvdbId,
                qualityProfileId: targetProfileId,
                rootFolderPath: targetRootFolder,
                seriesType: seriesType,
                monitored: true,
                seasons: lookupObj?.seasons || item.seasons || [],
                addOptions: { searchForMissingEpisodes: !moveFiles }
            };
        }

        // 2. Add to target instance
        const addResult = await (isMovie 
            ? radarr.addMovie(targetInstance.url, targetInstance.api_key, addPayload) 
            : sonarr.addSeries(targetInstance.url, targetInstance.api_key, addPayload));

        if (!addResult.success) {
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

        const addedTargetId = addResult.data?.id;

        // 3. Handle physical files on disk if requested
        let filesMovedSuccessfully = false;
        if (moveFiles && item.path) {
            try {
                const sourcePath = item.path;
                const folderName = path.basename(sourcePath);
                const destPath = path.join(targetRootFolder, folderName);

                if (fs.existsSync(sourcePath)) {
                    if (!fs.existsSync(targetRootFolder)) {
                        fs.mkdirSync(targetRootFolder, { recursive: true });
                    }

                    if (action === 'transfer') {
                        try {
                            fs.renameSync(sourcePath, destPath);
                            console.log(`[TRANSFER] Moved files from ${sourcePath} to ${destPath}`);
                            filesMovedSuccessfully = true;
                        } catch (moveErr) {
                            fs.cpSync(sourcePath, destPath, { recursive: true });
                            console.log(`[TRANSFER] Copied files from ${sourcePath} to ${destPath} (rename fallback)`);
                            filesMovedSuccessfully = true;
                        }
                    } else {
                        fs.cpSync(sourcePath, destPath, { recursive: true });
                        console.log(`[TRANSFER] Copied files from ${sourcePath} to ${destPath}`);
                        filesMovedSuccessfully = true;
                    }
                } else {
                    console.warn(`[TRANSFER] Source path "${sourcePath}" does not exist directly on server filesystem.`);
                }
            } catch (fileErr) {
                console.error(`[TRANSFER] Failed to manage physical files for ${item.title}:`, fileErr);
            }
        }

        // 4. Trigger rescan on target instance if files were moved/copied
        if (filesMovedSuccessfully && addedTargetId) {
            if (isMovie) {
                await radarr.triggerRescanMovie(targetInstance.url, targetInstance.api_key, addedTargetId);
            } else {
                await sonarr.triggerRescanSeries(targetInstance.url, targetInstance.api_key, addedTargetId);
            }
        }

        // 5. If action is 'transfer', delete from source
        if (action === 'transfer') {
            const deleteSuccess = await (isMovie
                ? radarr.deleteMovie(sourceInstance.url, sourceInstance.api_key, item.id, !filesMovedSuccessfully)
                : sonarr.deleteSeries(sourceInstance.url, sourceInstance.api_key, item.id, !filesMovedSuccessfully)
            );
            if (!deleteSuccess) {
                console.warn(`[TRANSFER] Added to target but failed to delete from source: ${item.title}`);
            }
        }

        // 6. Refresh local caches asynchronously
        if (isMovie) {
            refreshRadarrCacheForInstance(sourceInstance).catch(() => {});
            refreshRadarrCacheForInstance(targetInstance).catch(() => {});
        } else {
            refreshSonarrCacheForInstance(sourceInstance).catch(() => {});
            refreshSonarrCacheForInstance(targetInstance).catch(() => {});
        }

        return NextResponse.json({ success: true, targetItem: addResult.data });

    } catch (error) {
        console.error('API /media/transfer error:', error);
        return NextResponse.json({ error: 'Internal server error during transfer' }, { status: 500 });
    }
}


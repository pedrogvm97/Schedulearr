import { NextResponse } from 'next/server';
import { getInstances, getSetting } from '@/lib/db';
import { getAllMovies } from '@/lib/radarr';
import { getAllSeries } from '@/lib/sonarr';
import { getPlexWatchStatusMap } from '@/lib/plex';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const radarrInstances = getInstances('radarr', true);
        const sonarrInstances = getInstances('sonarr', true);

        const mode = getSetting('qbit_smart_clean_mode') || 'largest';
        const immunityEnabled = getSetting('qbit_smart_clean_immunity_enabled') === 'true';
        const immunityDays = parseInt(getSetting('qbit_smart_clean_immunity_days') || '7');

        // Load the ignore list of media keys
        const ignoredKeysStr = getSetting('media_smart_clean_ignored_keys') || '[]';
        let ignoredKeys: string[] = [];
        try {
            ignoredKeys = JSON.parse(ignoredKeysStr);
        } catch {
            ignoredKeys = [];
        }
        const ignoredSet = new Set(ignoredKeys.map(k => k.toLowerCase()));

        // Fetch Plex watch status map if active
        const plexInstances = getInstances('plex', true);
        let plexWatchMap = new Map<string, boolean>();
        if (plexInstances.length > 0) {
            plexWatchMap = await getPlexWatchStatusMap(plexInstances[0].url, plexInstances[0].api_key);
        }

        const allCandidates: {
            id: number;
            title: string;
            type: 'movie' | 'series';
            size: number;
            added: string;
            path: string;
            instanceId: string;
            instanceName: string;
            key: string;
            ignored: boolean;
            isWatched: boolean;
        }[] = [];

        // Gather movies
        for (const inst of radarrInstances) {
            try {
                const movies = await getAllMovies(inst.url, inst.api_key);
                for (const m of movies) {
                    const size = m.sizeOnDisk || m.statistics?.sizeOnDisk || m.movieFile?.size || 0;
                    if (size === 0) continue; // Skip if no file on disk

                    const key = `movie-${inst.id}-${m.id}`.toLowerCase();
                    const ignored = ignoredSet.has(key);

                    if (immunityEnabled) {
                        const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                        const addedTime = new Date(m.added).getTime();
                        if (addedTime >= cutoff) continue; // Skip immune
                    }

                    // Determine Plex watch status
                    const titleYearKey = `${m.title.toLowerCase()}-${m.added ? new Date(m.added).getFullYear() : ''}`;
                    const tmdbKey = m.tmdbId ? `tmdb://${m.tmdbId}`.toLowerCase() : '';
                    const isWatched = 
                        (tmdbKey && plexWatchMap.get(tmdbKey) === true) || 
                        plexWatchMap.get(titleYearKey) === true;

                    allCandidates.push({
                        id: m.id,
                        title: m.title,
                        type: 'movie',
                        size,
                        added: m.added,
                        path: m.path || m.folder || '',
                        instanceId: inst.id,
                        instanceName: inst.name,
                        key,
                        ignored,
                        isWatched
                    });
                }
            } catch (e) {
                console.error(`Error fetching movies for candidate list from ${inst.name}:`, e);
            }
        }

        // Gather series
        for (const inst of sonarrInstances) {
            try {
                const series = await getAllSeries(inst.url, inst.api_key);
                for (const s of series) {
                    const size = s.statistics?.sizeOnDisk || s.sizeOnDisk || 0;
                    if (size === 0) continue; // Skip if no files on disk

                    const key = `series-${inst.id}-${s.id}`.toLowerCase();
                    const ignored = ignoredSet.has(key);

                    if (immunityEnabled) {
                        const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                        const addedTime = new Date(s.added).getTime();
                        if (addedTime >= cutoff) continue; // Skip immune
                    }

                    // Determine Plex watch status
                    const titleYearKey = `${s.title.toLowerCase()}-${s.added ? new Date(s.added).getFullYear() : ''}`;
                    const tvdbKey = s.tvdbId ? `tvdb://${s.tvdbId}`.toLowerCase() : '';
                    const isWatched = 
                        (tvdbKey && plexWatchMap.get(tvdbKey) === true) || 
                        plexWatchMap.get(titleYearKey) === true;

                    allCandidates.push({
                        id: s.id,
                        title: s.title,
                        type: 'series',
                        size,
                        added: s.added,
                        path: s.path || '',
                        instanceId: inst.id,
                        instanceName: inst.name,
                        key,
                        ignored,
                        isWatched
                    });
                }
            } catch (e) {
                console.error(`Error fetching series for candidate list from ${inst.name}:`, e);
            }
        }

        // Sort candidates
        if (mode === 'largest') {
            allCandidates.sort((a, b) => b.size - a.size);
        } else if (mode === 'oldest') {
            allCandidates.sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());
        } else if (mode === 'unplayed') {
            // Sort: unplayed first, then oldest added
            allCandidates.sort((a, b) => {
                if (a.isWatched !== b.isWatched) {
                    return a.isWatched ? 1 : -1; // Unplayed first
                }
                return new Date(a.added).getTime() - new Date(b.added).getTime();
            });
        }

        return NextResponse.json({ candidates: allCandidates });
    } catch (error: any) {
        console.error('Error fetching smart clean candidates:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch candidates' }, { status: 500 });
    }
}

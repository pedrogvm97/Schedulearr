import { NextResponse } from "next/server";
import { getInstances, getSetting } from "@/lib/db";
import { getAllMovies } from "@/lib/radarr";
import { getAllSeries, getEpisodeFiles } from "@/lib/sonarr";
import { getPlexWatchStatusMap } from "@/lib/plex";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const radarrInstances = getInstances("radarr", true);
        const sonarrInstances = getInstances("sonarr", true);
        const mode = getSetting("qbit_smart_clean_mode") || "largest";
        const immunityEnabled = getSetting("qbit_smart_clean_immunity_enabled") === "true";
        const immunityDays = parseInt(getSetting("qbit_smart_clean_immunity_days") || "7");
        const seriesLevel = (getSetting("media_smart_clean_series_level") || "series");

        const ignoredKeysStr = getSetting("media_smart_clean_ignored_keys") || "[]";
        let ignoredKeys = [];
        try { ignoredKeys = JSON.parse(ignoredKeysStr); } catch { ignoredKeys = []; }
        const ignoredSet = new Set(ignoredKeys.map(k => k.toLowerCase()));

        const plexInstances = getInstances("plex", true);
        let plexWatchMap = new Map();
        if (plexInstances.length > 0) {
            plexWatchMap = await getPlexWatchStatusMap(plexInstances[0].url, plexInstances[0].api_key);
        }

        const allCandidates = [];

        for (const inst of radarrInstances) {
            try {
                const movies = await getAllMovies(inst.url, inst.api_key);
                for (const m of movies) {
                    const size = m.sizeOnDisk || m.statistics?.sizeOnDisk || m.movieFile?.size || 0;
                    if (size === 0) continue;
                    const key = `movie-${inst.id}-${m.id}`.toLowerCase();
                    const ignored = ignoredSet.has(key);
                    if (immunityEnabled) {
                        const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                        if (new Date(m.added).getTime() >= cutoff) continue;
                    }
                    const tmdbKey = m.tmdbId ? `tmdb://${m.tmdbId}`.toLowerCase() : "";
                    const titleYearKey = `${m.title.toLowerCase()}-${m.added ? new Date(m.added).getFullYear() : ""}`;
                    const isWatched = !!(tmdbKey && plexWatchMap.get(tmdbKey)) || !!plexWatchMap.get(titleYearKey);
                    allCandidates.push({ id: m.id, title: m.title, type: "movie", size, added: m.added, path: m.path || m.folder || "", instanceId: inst.id, instanceName: inst.name, key, ignored, isWatched });
                }
            } catch (e) { console.error(`Error fetching movies from ${inst.name}:`, e); }
        }

        for (const inst of sonarrInstances) {
            try {
                const series = await getAllSeries(inst.url, inst.api_key);
                for (const s of series) {
                    const tvdbKey = s.tvdbId ? `tvdb://${s.tvdbId}`.toLowerCase() : "";
                    const titleYearKey = `${s.title.toLowerCase()}-${s.added ? new Date(s.added).getFullYear() : ""}`;
                    const isWatched = !!(tvdbKey && plexWatchMap.get(tvdbKey)) || !!plexWatchMap.get(titleYearKey);

                    if (seriesLevel === "series") {
                        const size = s.statistics?.sizeOnDisk || s.sizeOnDisk || 0;
                        if (size === 0) continue;
                        const key = `series-${inst.id}-${s.id}`.toLowerCase();
                        if (immunityEnabled) {
                            const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                            if (new Date(s.added).getTime() >= cutoff) continue;
                        }
                        allCandidates.push({ id: s.id, title: s.title, type: "series", size, added: s.added, path: s.path || "", instanceId: inst.id, instanceName: inst.name, key, ignored: ignoredSet.has(key), isWatched });
                    } else {
                        const epFiles = await getEpisodeFiles(inst.url, inst.api_key, s.id);
                        if (!epFiles.length) continue;
                        if (seriesLevel === "season") {
                            const bySeasonMap = new Map();
                            for (const f of epFiles) {
                                const sn = f.seasonNumber ?? 0;
                                if (!bySeasonMap.has(sn)) bySeasonMap.set(sn, []);
                                bySeasonMap.get(sn).push(f);
                            }
                            for (const [seasonNum, files] of bySeasonMap.entries()) {
                                const size = files.reduce((acc, f) => acc + (f.size || 0), 0);
                                if (size === 0) continue;
                                const key = `season-${inst.id}-${s.id}-${seasonNum}`.toLowerCase();
                                if (immunityEnabled) {
                                    const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                                    if (new Date(s.added).getTime() >= cutoff) continue;
                                }
                                allCandidates.push({ id: s.id, title: `${s.title} - Season ${seasonNum}`, type: "season", size, added: s.added, path: s.path || "", instanceId: inst.id, instanceName: inst.name, key, ignored: ignoredSet.has(key), isWatched, seriesId: s.id, seasonNumber: seasonNum });
                            }
                        } else if (seriesLevel === "episode") {
                            for (const f of epFiles) {
                                const size = f.size || 0;
                                if (size === 0) continue;
                                const key = `episode-${inst.id}-${s.id}-${f.id}`.toLowerCase();
                                if (immunityEnabled) {
                                    const cutoff = Date.now() - immunityDays * 24 * 60 * 60 * 1000;
                                    if (new Date(s.added).getTime() >= cutoff) continue;
                                }
                                const ep = f.episodes?.[0];
                                const epLabel = ep ? `S${String(f.seasonNumber).padStart(2,"0")}E${String(ep.episodeNumber).padStart(2,"0")} - ${ep.title || "Episode"}` : `S${String(f.seasonNumber).padStart(2,"0")}`;
                                allCandidates.push({ id: f.id, title: `${s.title} - ${epLabel}`, type: "episode", size, added: f.dateAdded || s.added, path: f.relativePath || "", instanceId: inst.id, instanceName: inst.name, key, ignored: ignoredSet.has(key), isWatched, seriesId: s.id, seasonNumber: f.seasonNumber, episodeFileId: f.id });
                            }
                        }
                    }
                }
            } catch (e) { console.error(`Error fetching series from ${inst.name}:`, e); }
        }

        if (mode === "largest") allCandidates.sort((a, b) => b.size - a.size);
        else if (mode === "oldest") allCandidates.sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());
        else if (mode === "unplayed") allCandidates.sort((a, b) => { if (a.isWatched !== b.isWatched) return a.isWatched ? 1 : -1; return new Date(a.added).getTime() - new Date(b.added).getTime(); });

        return NextResponse.json({ candidates: allCandidates, seriesLevel });
    } catch (error) {
        console.error("Error fetching smart clean candidates:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch candidates" }, { status: 500 });
    }
}

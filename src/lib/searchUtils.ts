/**
 * Utility functions for smart search matching across Theater media, music, and IPTV.
 * Handles space insensitivity (e.g. "one republic" <-> "OneRepublic"),
 * accent normalization, punctuation stripping, and multi-token matching.
 */

export function normalizeSearchTerm(str: string | undefined | null): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
        .replace(/[^a-z0-9]/g, ''); // strip all spaces, hyphens, punctuation
}

/**
 * Calculates a search relevance score (0 = no match, higher = better match).
 * @param query The user's search input string
 * @param targets Potential matching strings (e.g. title, artist, album)
 */
export function smartMatchScore(query: string, ...targets: (string | undefined | null)[]): number {
    if (!query || !query.trim()) return 1;

    const rawQ = query.toLowerCase().trim();
    const normQ = normalizeSearchTerm(rawQ);
    if (!normQ) return 0;

    const validTargets = targets.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
    if (validTargets.length === 0) return 0;

    let maxScore = 0;

    // Tokens split for multi-word queries (e.g. "one republic counting")
    const qTokens = rawQ.split(/[\s\-_]+/).filter(t => t.length > 0);
    const normTokens = qTokens.map(normalizeSearchTerm).filter(Boolean);

    for (const target of validTargets) {
        const rawT = target.toLowerCase().trim();
        const normT = normalizeSearchTerm(rawT);

        // 1. Exact raw match (e.g. "Counting Stars" === "Counting Stars")
        if (rawT === rawQ) return 3500;

        // 2. Exact normalized match (e.g. "one republic" === "OneRepublic", "ac dc" === "AC/DC")
        if (normT === normQ) return 3000;

        // 3. Raw startsWith
        if (rawT.startsWith(rawQ)) {
            maxScore = Math.max(maxScore, 2400);
        }

        // 4. Normalized startsWith
        if (normT.startsWith(normQ)) {
            maxScore = Math.max(maxScore, 2000);
        }

        // 5. Raw substring match
        if (rawT.includes(rawQ)) {
            maxScore = Math.max(maxScore, 1600);
        }

        // 6. Normalized substring match (e.g. "one republic" in "OneRepublic - Native")
        if (normT.includes(normQ)) {
            maxScore = Math.max(maxScore, 1400);
        }

        // 7. Target is substring of query
        if (normQ.includes(normT) && normT.length >= 3) {
            maxScore = Math.max(maxScore, 1100);
        }
    }

    // 8. Multi-token match across all target strings combined
    // (e.g. query "onerepublic stars" matches artist "OneRepublic" + title "Counting Stars")
    if (normTokens.length > 1) {
        const combinedNorm = validTargets.map(normalizeSearchTerm).join(' ');
        const allTokensMatch = normTokens.every(tok => combinedNorm.includes(tok));
        if (allTokensMatch) {
            maxScore = Math.max(maxScore, 1800);
        }
    }

    return maxScore;
}

/**
 * Strips noise, opus/catalog notations, track numbers, artist prefixes, and parenthesized tags
 * to cleanly compare track titles between ripped files and online catalog metadata.
 */
export function cleanTrackForMatching(str: string | undefined | null, artist?: string): string {
    if (!str) return '';
    let s = str.replace(/\.[^/.]+$/, ''); // remove file extension if present
    if (artist) {
        // Strip artist prefix if present (e.g. "Tchaikovsky - ")
        const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp('^' + escapedArtist + '\\s*[-–—:]\\s*', 'i'), '');
    }
    // Strip leading track numbers (e.g. "01 - ", "1. ", "01 ")
    s = s.replace(/^\d+[\s\.\-_]+/, '');
    // Strip quotes and apostrophes
    s = s.replace(/["'“”‘’]/g, '');
    // Strip opus, catalog, number notation: "Op. 49", "Opus 49", "No. 1", "BWV 1001", "K. 545", etc.
    s = s.replace(/\b(op|opus|no|bwv|k|kv|hob)\.?\s*\d+[a-z]?\b/gi, '');
    // Strip parenthesized / bracketed tags (e.g. "(1880 Version)", "[2011 Remaster]")
    s = s.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
    // Normalize unicode accents and strip all non-alphanumeric characters
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Intelligent 4-tier track matcher between an official catalog track and a pool of local tracks.
 */
export function findMatchingLocalTrack<T extends { title?: string; name?: string; path?: string; id?: string; trackNumber?: number }>(
    officialTrack: { title: string; trackNumber?: number },
    localTracks: T[],
    matchedKeys: Set<string>,
    artist?: string
): T | undefined {
    const normOfficial = cleanTrackForMatching(officialTrack.title, artist);

    // 1. Direct normalized match
    for (const lt of localTracks) {
        const key = lt.id || lt.path || lt.name || '';
        if (key && matchedKeys.has(key)) continue;
        const normTitle = cleanTrackForMatching(lt.title, artist);
        const normName = cleanTrackForMatching(lt.name, artist);
        if (normOfficial && (normTitle === normOfficial || normName === normOfficial)) {
            return lt;
        }
    }

    // 2. Containment / Substring match (for movements or subtitle variations, min 4 chars)
    if (normOfficial.length >= 4) {
        for (const lt of localTracks) {
            const key = lt.id || lt.path || lt.name || '';
            if (key && matchedKeys.has(key)) continue;
            const normTitle = cleanTrackForMatching(lt.title, artist);
            const normName = cleanTrackForMatching(lt.name, artist);
            if (normTitle && (normTitle.includes(normOfficial) || normOfficial.includes(normTitle))) return lt;
            if (normName && (normName.includes(normOfficial) || normOfficial.includes(normName))) return lt;
        }
    }

    // 3. Track number fallback if available
    const offNum = officialTrack.trackNumber;
    if (offNum) {
        for (const lt of localTracks) {
            const key = lt.id || lt.path || lt.name || '';
            if (key && matchedKeys.has(key)) continue;
            const ltNum = lt.trackNumber || parseInt((lt.name || '').match(/^\d+/)?.[0] || '0', 10);
            if (ltNum === offNum) {
                return lt;
            }
        }
    }

    return undefined;
}


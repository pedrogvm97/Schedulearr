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

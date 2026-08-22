/**
 * Clean & normalize music metadata extracted from YouTube, file paths, or streaming services.
 */
export interface SanitizedSong {
    cleanArtist: string;
    cleanTitle: string;
    searchQueries: string[];
}

export function sanitizeSongMetadata(rawTitle: string, rawArtist?: string): SanitizedSong {
    let artist = (rawArtist || '').trim();
    let title = (rawTitle || '').trim();

    // 1. Remove file extensions if present
    title = title.replace(/\.(mp3|flac|m4a|wav|aac|ogg|opus|webm|mp4)$/i, '');

    // 2. Remove common YouTube and audio tag noise
    const noisePatterns = [
        /\s*\([^)]*(?:official|video|audio|lyrics?|visualizer|clip|version|remaster(?:ed)?|4k|hd|hq|live|performance|extended|edit|explicit)[^)]*\)/gi,
        /\s*\[[^\]]*(?:official|video|audio|lyrics?|visualizer|clip|version|remaster(?:ed)?|4k|hd|hq|live|performance|extended|edit|explicit)[^\]]*\]/gi,
        /\s*\|\s*.*$/gi, // e.g. "Song Title | Channel Name"
        /\s*-\s*official\s*(?:video|audio|music\s*video)$/gi,
        /\s*【[^】]*】/g,
        /\s*（[^）]*）/g
    ];

    let sanitizedTitle = title;
    for (const pattern of noisePatterns) {
        sanitizedTitle = sanitizedTitle.replace(pattern, '').trim();
    }

    // 3. If title contains "Artist - Title" format
    if (sanitizedTitle.includes(' - ')) {
        const parts = sanitizedTitle.split(' - ');
        if (parts.length >= 2) {
            const possibleArtist = parts[0].trim();
            const possibleTitle = parts.slice(1).join(' - ').trim();
            if (possibleArtist && possibleTitle) {
                if (!artist || artist === 'Artist' || /vevo|topic|records|music/i.test(artist)) {
                    artist = possibleArtist;
                }
                sanitizedTitle = possibleTitle;
            }
        }
    }

    // 4. Strip "ft." or "feat." from title for base match while retaining search variation
    const cleanWithoutFeat = sanitizedTitle.replace(/\s*\b(?:ft\.?|feat\.?)\s+[^\-\(\[\,]+/gi, '').trim();

    // 5. Clean artist channel suffixes like "- Topic", "VEVO", etc.
    let sanitizedArtist = artist
        .replace(/\s*-\s*Topic$/i, '')
        .replace(/VEVO$/i, '')
        .replace(/\s*Official\s*$/i, '')
        .trim();

    // Build ordered search query variations for fallback cascading
    const queries = [
        `${sanitizedArtist} ${cleanWithoutFeat}`.trim(),
        `${sanitizedArtist} ${sanitizedTitle}`.trim(),
        cleanWithoutFeat,
        sanitizedTitle,
        `${artist} ${title}`.trim()
    ].filter(q => q.length > 0);

    const uniqueQueries = Array.from(new Set(queries));

    return {
        cleanArtist: sanitizedArtist || artist || 'Unknown Artist',
        cleanTitle: cleanWithoutFeat || sanitizedTitle || title || 'Unknown Track',
        searchQueries: uniqueQueries
    };
}

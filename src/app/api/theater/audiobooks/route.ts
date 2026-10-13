import { NextResponse } from 'next/server';
import axios from 'axios';
import { getAudiobookMeta, upsertAudiobookMeta, getAudiobookAuthorMeta, upsertAudiobookAuthorMeta } from '@/lib/db';
import { parseCleanBookTitleAndNumber, getAudiobookCollectionsState, parseAndCanonicalizeAuthor } from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const title = searchParams.get('title') || searchParams.get('book') || '';
        const author = searchParams.get('author') || searchParams.get('writer') || '';
        const bookKeyParam = searchParams.get('bookKey') || '';
        const query = searchParams.get('q') || `${title} ${author}`.trim();

        if (!query && !title && !author) {
            return NextResponse.json({ error: 'Title or author is required' }, { status: 400 });
        }

        const parsedCatalog = parseCleanBookTitleAndNumber(title || query);
        let bookData: any = null;
        let authorBio: string | null = null;
        let coverUrl: string | null = null;
        let narrator: string | null = null;
        let description: string | null = null;
        let releaseYear: string | null = parsedCatalog.releaseYear || null;
        let itunesYear: string | null = null;
        let genre: string | null = null;

        const availableCovers: Array<{ url: string; label: string; source: string }> = [];
        const addAvailableCover = (url: string | null | undefined, label: string, source: string) => {
            if (!url || typeof url !== 'string' || !url.trim()) return;
            const trimmed = url.trim();
            if (!availableCovers.some(c => c.url === trimmed)) {
                availableCovers.push({ url: trimmed, label, source });
            }
        };

        const candidateKey = bookKeyParam || `${(author || 'Unknown Author').toLowerCase().trim()} - ${(parsedCatalog.cleanTitle || title).toLowerCase().trim()}`;
        const existingDb = getAudiobookMeta(candidateKey, parsedCatalog.cleanTitle || title, author || undefined);
        if (existingDb) {
            if (existingDb.custom_cover_url) addAvailableCover(existingDb.custom_cover_url, 'AI Cover', 'ai');
            if (existingDb.poster_url) addAvailableCover(existingDb.poster_url, 'Library Poster', 'library');
            if (existingDb.thumb) addAvailableCover(existingDb.thumb, 'Saved Cover', 'saved');
        }

        // 1. Query iTunes Audiobooks Search API (best for audiobooks covers, narrator, and audio metadata)
        try {
            const itunesSearchTerm = `${parsedCatalog.cleanTitle || title || query} ${author}`.trim();
            const itunesRes = await axios.get('https://itunes.apple.com/search', {
                params: {
                    term: itunesSearchTerm,
                    media: 'audiobook',
                    entity: 'audiobook',
                    limit: 5
                },
                timeout: 6000
            });

            if (itunesRes.data && Array.isArray(itunesRes.data.results) && itunesRes.data.results.length > 0) {
                const match = itunesRes.data.results[0];
                if (match.artworkUrl100) {
                    coverUrl = match.artworkUrl100.replace('100x100bb', '600x600bb');
                }
                itunesRes.data.results.forEach((item: any, idx: number) => {
                    if (item.artworkUrl100) {
                        const hiRes = item.artworkUrl100.replace('100x100bb', '600x600bb');
                        addAvailableCover(hiRes, idx === 0 ? 'iTunes Cover' : `iTunes Alt #${idx + 1}`, 'itunes');
                    }
                });
                narrator = match.artistName || null;
                description = match.description ? match.description.replace(/<[^>]*>/g, '') : null;
                if (match.releaseDate) {
                    itunesYear = match.releaseDate.split('-')[0];
                }
                genre = match.primaryGenreName || null;
            }
        } catch (e: any) {
            console.warn('iTunes Audiobook lookup notice:', e.message);
        }

        // 2. Query OpenLibrary API (best for author biography, book synopsis, and original publication year)
        try {
            const olParams: any = { limit: 6 };
            if (title) olParams.title = parsedCatalog.cleanTitle || title;
            if (author) olParams.author = author;
            if (!title && !author) olParams.q = query;

            const olRes = await axios.get('https://openlibrary.org/search.json', {
                params: olParams,
                timeout: 6000
            });

            if (olRes.data && Array.isArray(olRes.data.docs) && olRes.data.docs.length > 0) {
                const doc = olRes.data.docs[0];

                if (!coverUrl && doc.cover_i) {
                    coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
                }

                let olCoverCount = 0;
                for (const d of olRes.data.docs) {
                    if (d.cover_i && olCoverCount < 4) {
                        olCoverCount++;
                        addAvailableCover(
                            `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
                            olCoverCount === 1 ? 'OpenLibrary' : `OpenLibrary #${olCoverCount}`,
                            'openlibrary'
                        );
                    }
                    if (Array.isArray(d.cover_edition_key)) {
                        for (const edKey of d.cover_edition_key.slice(0, 2)) {
                            if (olCoverCount < 5) {
                                olCoverCount++;
                                addAvailableCover(
                                    `https://covers.openlibrary.org/b/olid/${edKey}-L.jpg`,
                                    `Edition ${edKey}`,
                                    'openlibrary'
                                );
                            }
                        }
                    }
                }

                // Prefer OpenLibrary first_publish_year over iTunes audiobook recording year
                if (!releaseYear && doc.first_publish_year) {
                    releaseYear = String(doc.first_publish_year);
                }

                if (!genre && Array.isArray(doc.subject) && doc.subject.length > 0) {
                    genre = doc.subject.slice(0, 3).join(', ');
                }

                // If author key available, fetch author biography from OpenLibrary
                const authorKey = doc.author_key?.[0];
                if (authorKey) {
                    try {
                        const authorRes = await axios.get(`https://openlibrary.org/authors/${authorKey}.json`, { timeout: 5000 });
                        if (authorRes.data) {
                            if (typeof authorRes.data.bio === 'string') {
                                authorBio = authorRes.data.bio;
                            } else if (authorRes.data.bio?.value) {
                                authorBio = authorRes.data.bio.value;
                            }
                        }
                    } catch {}
                }

                // If work key available, fetch synopsis if not already found
                const workKey = doc.key;
                if (!description && workKey) {
                    try {
                        const workRes = await axios.get(`https://openlibrary.org${workKey}.json`, { timeout: 5000 });
                        if (workRes.data) {
                            if (typeof workRes.data.description === 'string') {
                                description = workRes.data.description;
                            } else if (workRes.data.description?.value) {
                                description = workRes.data.description.value;
                            }
                        }
                    } catch {}
                }
            }
        } catch (e: any) {
            console.warn('OpenLibrary lookup notice:', e.message);
        }

        if (!releaseYear && itunesYear) {
            releaseYear = itunesYear;
        }

        // Check user-saved bookMetadata for custom synopsis or authorBio overrides
        try {
            const colState = getAudiobookCollectionsState();
            const savedEnrich =
                (bookKeyParam && colState.bookMetadata[bookKeyParam]) ||
                (existingDb?.book_key && colState.bookMetadata[existingDb.book_key]) ||
                colState.bookMetadata[candidateKey] ||
                Object.values(colState.bookMetadata).find(
                    m => m.cleanTitle && m.cleanTitle.toLowerCase() === (parsedCatalog.cleanTitle || title).toLowerCase()
                );
            if (savedEnrich?.synopsis) {
                description = savedEnrich.synopsis;
            }
            if (savedEnrich?.authorBio) {
                authorBio = savedEnrich.authorBio;
            }
        } catch {}

        // If authorBio is still missing or a short stub (< 120 chars, e.g. "Chinese science fiction writer"), enrich it
        const effectiveAuthor = author || existingDb?.canonical_author || existingDb?.author || '';
        if (effectiveAuthor && (!authorBio || authorBio.length < 120)) {
            try {
                const canon = parseAndCanonicalizeAuthor(effectiveAuthor).canonicalAuthor || effectiveAuthor;
                const cachedAuthor = getAudiobookAuthorMeta(canon);
                if (cachedAuthor?.bio && cachedAuthor.bio.length > 120) {
                    authorBio = cachedAuthor.bio;
                } else {
                    try {
                        const wikiRes = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(canon.replace(/\s+/g, '_'))}`, {
                            timeout: 3500,
                            headers: { 'User-Agent': 'ScheduleArr/0.6.24' }
                        });
                        if (wikiRes.data?.extract && wikiRes.data.extract.length > 120) {
                            authorBio = wikiRes.data.extract;
                            upsertAudiobookAuthorMeta({
                                name: canon,
                                bio: authorBio || undefined,
                                photo_url: wikiRes.data.thumbnail?.source || undefined,
                                source: 'Wikipedia'
                            });
                        }
                    } catch {}
                }
            } catch {}
        }

        // Automatically persist discovered coverUrl, releaseYear, genre, and narrator to SQLite so Theater and Media share identical metadata
        if (title && (coverUrl || releaseYear || genre || narrator)) {
            try {
                const existing = existingDb || getAudiobookMeta(candidateKey, parsedCatalog.cleanTitle || title, author || undefined);
                if (existing) {
                    const shouldUpdateYear = releaseYear && (!existing.published_year || (existing.published_year === '2024' && releaseYear !== '2024'));
                    upsertAudiobookMeta({
                        book_key: existing.book_key,
                        thumb: existing.thumb || coverUrl || undefined,
                        published_year: (shouldUpdateYear ? releaseYear : existing.published_year) || undefined,
                        genre: existing.genre || genre || undefined,
                        narrator: existing.narrator || narrator || undefined
                    });
                }
            } catch {}
        }

        bookData = {
            title: existingDb?.title || parsedCatalog.cleanTitle || title || query,
            author: existingDb?.canonical_author || existingDb?.author || author || 'Unknown Author',
            authorBio: authorBio || 'No writer biography available yet for this author.',
            narrator: existingDb?.narrator || narrator || author || 'Narrator not specified',
            description: description || 'No synopsis provided for this audiobook title.',
            coverUrl: (existingDb?.use_custom_cover && existingDb?.custom_cover_url) ? existingDb.custom_cover_url : (existingDb?.thumb || coverUrl || null),
            releaseYear: existingDb?.published_year || releaseYear || null,
            genre: existingDb?.genre || genre || 'Audiobook',
            availableCovers
        };

        return NextResponse.json({
            found: Boolean(coverUrl || authorBio || description || availableCovers.length > 0),
            book: bookData
        });
    } catch (error: any) {
        console.error('API /theater/audiobooks GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

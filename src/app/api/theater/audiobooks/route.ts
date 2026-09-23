import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const title = searchParams.get('title') || searchParams.get('book') || '';
        const author = searchParams.get('author') || searchParams.get('writer') || '';
        const query = searchParams.get('q') || `${title} ${author}`.trim();

        if (!query && !title && !author) {
            return NextResponse.json({ error: 'Title or author is required' }, { status: 400 });
        }

        let bookData: any = null;
        let authorBio: string | null = null;
        let coverUrl: string | null = null;
        let narrator: string | null = null;
        let description: string | null = null;
        let releaseYear: string | null = null;
        let genre: string | null = null;

        // 1. Query iTunes Audiobooks Search API (best for audiobooks covers, narrator, and audio metadata)
        try {
            const itunesSearchTerm = `${title || query} ${author}`.trim();
            const itunesRes = await axios.get('https://itunes.apple.com/search', {
                params: {
                    term: itunesSearchTerm,
                    media: 'audiobook',
                    entity: 'audiobook',
                    limit: 3
                },
                timeout: 6000
            });

            if (itunesRes.data && Array.isArray(itunesRes.data.results) && itunesRes.data.results.length > 0) {
                const match = itunesRes.data.results[0];
                if (match.artworkUrl100) {
                    coverUrl = match.artworkUrl100.replace('100x100bb', '600x600bb');
                }
                narrator = match.artistName || null;
                description = match.description ? match.description.replace(/<[^>]*>/g, '') : null;
                if (match.releaseDate) {
                    releaseYear = match.releaseDate.split('-')[0];
                }
                genre = match.primaryGenreName || null;
            }
        } catch (e: any) {
            console.warn('iTunes Audiobook lookup notice:', e.message);
        }

        // 2. Query OpenLibrary API (best for author biography, book synopsis, and publication history)
        try {
            const olParams: any = { limit: 5 };
            if (title) olParams.title = title;
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

        bookData = {
            title: title || query,
            author: author || 'Unknown Author',
            authorBio: authorBio || 'No writer biography available yet for this author.',
            narrator: narrator || author || 'Narrator not specified',
            description: description || 'No synopsis provided for this audiobook title.',
            coverUrl: coverUrl || null,
            releaseYear: releaseYear || null,
            genre: genre || 'Audiobook'
        };

        return NextResponse.json({
            found: Boolean(coverUrl || authorBio || description),
            book: bookData
        });
    } catch (error: any) {
        console.error('API /theater/audiobooks GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

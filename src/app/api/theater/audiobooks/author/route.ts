import { NextResponse } from 'next/server';
import axios from 'axios';
import { getAudiobookAuthorMeta, upsertAudiobookAuthorMeta } from '@/lib/db';
import { callStudioTextLlmWithFailover, parseAndCanonicalizeAuthor } from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const rawName = searchParams.get('name') || searchParams.get('author') || '';
        const forceRefresh = searchParams.get('refresh') === 'true';

        if (!rawName.trim()) {
            return NextResponse.json({ error: 'Author name is required' }, { status: 400 });
        }

        const canon = parseAndCanonicalizeAuthor(rawName).canonicalAuthor || rawName.trim();
        const existing = getAudiobookAuthorMeta(canon);

        // If we already have a rich bio and photo, and not force refreshing, return immediately
        if (!forceRefresh && existing && existing.bio && existing.bio.length > 140 && existing.photo_url) {
            return NextResponse.json({
                found: true,
                author: {
                    name: existing.name,
                    bio: existing.bio,
                    photoUrl: existing.photo_url,
                    birthDate: existing.birth_date,
                    deathDate: existing.death_date,
                    source: existing.source || 'Database'
                }
            });
        }

        let bio = existing?.bio || '';
        let photoUrl = existing?.photo_url || '';
        let birthDate = existing?.birth_date || '';
        let deathDate = existing?.death_date || '';
        let source = existing?.source || '';

        // 1. Try Wikipedia REST API for genuine encyclopedia bio and authentic author portrait
        try {
            const wikiName = canon.replace(/\s+/g, '_');
            const wikiRes = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`, {
                timeout: 6000,
                headers: { 'User-Agent': 'ScheduleArr/0.6.24 (https://github.com/pedrogvm97/Schedulearr; schedulearr@local)' }
            });

            if (wikiRes.data && wikiRes.data.extract) {
                if (!bio || bio.length < 140 || forceRefresh) {
                    bio = wikiRes.data.extract;
                    source = 'Wikipedia';
                }
                if (!photoUrl && wikiRes.data.thumbnail?.source) {
                    photoUrl = wikiRes.data.thumbnail.source;
                }
                if (wikiRes.data.description) {
                    // Extract birth / death year if present in description e.g. "born 1963"
                    const birthMatch = wikiRes.data.description.match(/born\s+(\d{4})/i);
                    if (birthMatch) birthDate = birthMatch[1];
                }
            }
        } catch {
            // Wikipedia redirect fallback or search
            try {
                const searchRes = await axios.get(`https://en.wikipedia.org/w/api.php`, {
                    params: {
                        action: 'query',
                        list: 'search',
                        srsearch: canon,
                        format: 'json',
                        srlimit: 1
                    },
                    timeout: 5000,
                    headers: { 'User-Agent': 'ScheduleArr/0.6.24' }
                });
                const topTitle = searchRes.data?.query?.search?.[0]?.title;
                if (topTitle) {
                    const wikiPageRes = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle.replace(/\s+/g, '_'))}`, {
                        timeout: 5000,
                        headers: { 'User-Agent': 'ScheduleArr/0.6.24' }
                    });
                    if (wikiPageRes.data?.extract) {
                        if (!bio || bio.length < 140 || forceRefresh) {
                            bio = wikiPageRes.data.extract;
                            source = 'Wikipedia';
                        }
                        if (!photoUrl && wikiPageRes.data.thumbnail?.source) {
                            photoUrl = wikiPageRes.data.thumbnail.source;
                        }
                    }
                }
            } catch {}
        }

        // 2. OpenLibrary Author Lookup (for author photo fallback or dates)
        if (!photoUrl || !birthDate) {
            try {
                const olRes = await axios.get(`https://openlibrary.org/search/authors.json`, {
                    params: { q: canon, limit: 1 },
                    timeout: 5000
                });
                const doc = olRes.data?.docs?.[0];
                if (doc) {
                    if (!photoUrl && doc.key) {
                        photoUrl = `https://covers.openlibrary.org/a/olid/${doc.key}-L.jpg`;
                    }
                    if (!birthDate && doc.birth_date) birthDate = String(doc.birth_date);
                    if (!deathDate && doc.death_date) deathDate = String(doc.death_date);
                    if ((!bio || bio.length < 80) && doc.top_work) {
                        bio = `${canon} is a celebrated author known for works including "${doc.top_work}".`;
                        source = 'OpenLibrary';
                    }
                }
            } catch {}
        }

        // 3. User explicit instruction: "if not found run torugh an llm?"
        // If bio is still missing or very stubby (< 120 chars), generate rich biography via LLM
        if (!bio || bio.length < 120) {
            try {
                const llmPrompt = [
                    `You are a master literary bibliographer and audiobook librarian.`,
                    `Write an engaging, authoritative, and complete biographical overview of the author "${canon}".`,
                    `Include:`,
                    `1. Their background, nationality, and writing career.`,
                    `2. Major literary works, genres, and central themes.`,
                    `3. Writing style, hallmark traits, and literary awards/cultural impact.`,
                    `Format as 2-3 well-written, informative paragraphs. Do NOT include markdown code blocks, titles, or fluff.`
                ].join('\n');

                const llmRes = await callStudioTextLlmWithFailover({
                    prompt: llmPrompt,
                    task: 'art_prompt',
                    maxTokens: 600,
                    description: `Author bio generation for "${canon}"`
                });

                if (llmRes?.text && llmRes.text.length > 100) {
                    bio = llmRes.text.trim();
                    source = `AI Literary Bibliographer (${llmRes.providerUsed})`;
                }
            } catch (llmErr: any) {
                console.warn('⚠️ [Author API] LLM bio fallback error:', llmErr.message);
            }
        }

        if (!bio) {
            bio = `${canon} is an author featured in your audiobook collection.`;
            source = 'Collection';
        }

        // Cache result in SQLite
        const saved = upsertAudiobookAuthorMeta({
            name: canon,
            bio,
            photo_url: photoUrl || undefined,
            birth_date: birthDate || undefined,
            death_date: deathDate || undefined,
            source
        });

        return NextResponse.json({
            found: true,
            author: {
                name: saved?.name || canon,
                bio: saved?.bio || bio,
                photoUrl: saved?.photo_url || photoUrl,
                birthDate: saved?.birth_date || birthDate,
                deathDate: saved?.death_date || deathDate,
                source: saved?.source || source
            }
        });
    } catch (error: any) {
        console.error('API /theater/audiobooks/author GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, name, bio, photoUrl, birthDate, deathDate } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json({ error: 'Author name is required' }, { status: 400 });
        }

        const canon = parseAndCanonicalizeAuthor(name).canonicalAuthor || name.trim();

        if (action === 'regenerate_bio') {
            let generatedBio = '';
            let bioSource = '';
            let newPhotoUrl: string | undefined = undefined;

            // 1. Try LLM first
            try {
                const llmPrompt = [
                    `You are a master literary bibliographer and audiobook librarian.`,
                    `Write an engaging, authoritative, and complete biographical overview of the author "${canon}".`,
                    `Include:`,
                    `1. Their background, nationality, and writing career.`,
                    `2. Major literary works, genres, and central themes.`,
                    `3. Writing style, hallmark traits, and literary awards/cultural impact.`,
                    `Format as 2-3 well-written, informative paragraphs. Do NOT include markdown code blocks, titles, or fluff.`
                ].join('\n');

                const llmRes = await callStudioTextLlmWithFailover({
                    prompt: llmPrompt,
                    task: 'art_prompt',
                    maxTokens: 600,
                    description: `Manual bio regenerate for "${canon}"`
                });

                if (llmRes?.text && llmRes.text.trim().length > 60) {
                    generatedBio = llmRes.text.trim();
                    bioSource = `AI Literary Bibliographer (${llmRes.providerUsed})`;
                }
            } catch (llmErr: any) {
                console.warn('⚠️ [Author API] LLM bio generation error:', llmErr?.message);
            }

            // 2. Wikipedia REST API Fallback
            if (!generatedBio || generatedBio.length < 80) {
                try {
                    const wikiName = canon.replace(/\s+/g, '_');
                    const wikiRes = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`, {
                        timeout: 7000,
                        headers: { 'User-Agent': 'ScheduleArr/0.6.27 (https://github.com/pedrogvm97/Schedulearr)' }
                    });
                    if (wikiRes.data?.extract && wikiRes.data.extract.length > 50) {
                        generatedBio = wikiRes.data.extract.trim();
                        bioSource = 'Wikipedia Encyclopedia';
                        if (wikiRes.data.thumbnail?.source) {
                            newPhotoUrl = wikiRes.data.thumbnail.source;
                        }
                    }
                } catch {
                    // Wikipedia Search Fallback
                    try {
                        const searchRes = await axios.get(`https://en.wikipedia.org/w/api.php`, {
                            params: { action: 'query', list: 'search', srsearch: canon, format: 'json', srlimit: 1 },
                            timeout: 6000,
                            headers: { 'User-Agent': 'ScheduleArr/0.6.27' }
                        });
                        const topTitle = searchRes.data?.query?.search?.[0]?.title;
                        if (topTitle) {
                            const pageRes = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle.replace(/\s+/g, '_'))}`, {
                                timeout: 6000,
                                headers: { 'User-Agent': 'ScheduleArr/0.6.27' }
                            });
                            if (pageRes.data?.extract) {
                                generatedBio = pageRes.data.extract.trim();
                                bioSource = 'Wikipedia Encyclopedia';
                                if (pageRes.data.thumbnail?.source) {
                                    newPhotoUrl = pageRes.data.thumbnail.source;
                                }
                            }
                        }
                    } catch {}
                }
            }

            // 3. OpenLibrary Authors API Fallback
            if (!generatedBio || generatedBio.length < 60) {
                try {
                    const olRes = await axios.get(`https://openlibrary.org/search/authors.json`, {
                        params: { q: canon, limit: 1 },
                        timeout: 6000
                    });
                    const doc = olRes.data?.docs?.[0];
                    if (doc) {
                        if (doc.key) {
                            try {
                                const authorDetailRes = await axios.get(`https://openlibrary.org/authors/${encodeURIComponent(doc.key)}.json`, { timeout: 5000 });
                                const olBio = authorDetailRes.data?.bio;
                                if (typeof olBio === 'string' && olBio.trim().length > 40) {
                                    generatedBio = olBio.trim();
                                    bioSource = 'OpenLibrary Archive';
                                } else if (olBio && typeof olBio === 'object' && olBio.value) {
                                    generatedBio = String(olBio.value).trim();
                                    bioSource = 'OpenLibrary Archive';
                                }
                            } catch {}
                        }
                        if (!generatedBio && doc.top_work) {
                            generatedBio = `${canon} is a celebrated author known for prominent works including "${doc.top_work}". Featured extensively across literary and audio editions.`;
                            bioSource = 'OpenLibrary Catalog';
                        }
                        if (!newPhotoUrl && doc.key) {
                            newPhotoUrl = `https://covers.openlibrary.org/a/olid/${doc.key}-L.jpg`;
                        }
                    }
                } catch {}
            }

            // 4. Guaranteed Synthesis Fallback (never leave the user with a broken bio)
            if (!generatedBio || generatedBio.length < 30) {
                generatedBio = `${canon} is an author featured in your audiobook collection. Known for compelling narrative storytelling, distinct character voice, and expansive literary worldbuilding.`;
                bioSource = 'Audiobook Library';
            }

            const current = getAudiobookAuthorMeta(canon);
            const saved = upsertAudiobookAuthorMeta({
                name: canon,
                bio: generatedBio,
                photo_url: newPhotoUrl || current?.photo_url,
                source: bioSource
            });

            return NextResponse.json({ success: true, author: saved });
        }

        // Save manual edits
        const saved = upsertAudiobookAuthorMeta({
            name: canon,
            bio: bio !== undefined ? bio : undefined,
            photo_url: photoUrl !== undefined ? photoUrl : undefined,
            birth_date: birthDate !== undefined ? birthDate : undefined,
            death_date: deathDate !== undefined ? deathDate : undefined,
            source: 'Custom Edit'
        });

        return NextResponse.json({ success: true, author: saved });
    } catch (error: any) {
        console.error('API /theater/audiobooks/author POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

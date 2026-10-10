import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
    getAllAudiobooksMeta,
    getAudiobookMeta,
    upsertAudiobookMeta,
    reorderAudiobookQueue,
    getAudiobookChaptersMeta,
    getAudiobookChapterMeta,
    upsertAudiobookChapterMeta,
    recalculateAudiobookTotals
} from '@/lib/db';
import {
    getAudiobookStudioConfig,
    saveAudiobookStudioConfig,
    getAudiobookStudioStatus,
    transcribeAudiobookChapter,
    enhanceAudiobookChapterAudio,
    generateAudiobookChapterIllustrations,
    triggerAudiobookQueueWorker,
    getAudiobookArtDir,
    detectAndVerifyAiApiKey
} from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const bookKey = searchParams.get('bookKey');
        const chapterKey = searchParams.get('chapterKey');

        const config = getAudiobookStudioConfig();
        const status = getAudiobookStudioStatus();
        const books = getAllAudiobooksMeta();

        if (chapterKey) {
            const chapter = getAudiobookChapterMeta(chapterKey);
            const book = chapter ? getAudiobookMeta(chapter.book_key) : null;
            return NextResponse.json({
                success: true,
                config,
                status,
                book,
                chapter
            });
        }

        if (bookKey) {
            const book = getAudiobookMeta(bookKey);
            const chapters = getAudiobookChaptersMeta(bookKey);
            return NextResponse.json({
                success: true,
                config,
                status,
                book,
                chapters,
                books
            });
        }

        return NextResponse.json({
            success: true,
            config,
            status,
            books
        });
    } catch (e: any) {
        console.error('Error in GET /api/theater/audiobooks/studio:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'detect_api_key') {
            const { apiKey } = body;
            const { probe, config } = await detectAndVerifyAiApiKey(apiKey || '');
            return NextResponse.json({
                success: true,
                probe,
                config,
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'save_config') {
            const updated = saveAudiobookStudioConfig(body.config || {});
            console.log(`📚 [AudiobookStudio] Updated Studio Config (Provider: ${updated.artProvider}, Daily Quota: ${updated.dailyImageQuota}, STT: ${updated.sttEngine})`);
            if (updated.enabled) {
                triggerAudiobookQueueWorker();
            }
            return NextResponse.json({
                success: true,
                config: updated,
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'update_book_settings') {
            const {
                bookKey,
                title,
                author,
                thumb,
                posterUrl,
                artStyle,
                imagesPerChapter,
                artFocus,
                voicePreset,
                enhancePreset,
                enhanceAudioEnabled,
                transcribeEnabled,
                illustrateEnabled,
                dynamicPromptEnabled,
                customPrompt,
                queueEnabled,
                isQueued
            } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            const existing = getAudiobookMeta(bookKey);
            const updatedBook = upsertAudiobookMeta({
                book_key: bookKey,
                title: title ?? existing?.title ?? 'Untitled Book',
                author: author ?? existing?.author ?? 'Unknown Author',
                thumb: thumb ?? posterUrl ?? existing?.thumb,
                art_style: artStyle !== undefined ? String(artStyle) : existing?.art_style,
                images_per_chapter: imagesPerChapter !== undefined ? Number(imagesPerChapter) : existing?.images_per_chapter,
                art_focus: artFocus !== undefined ? String(artFocus) : existing?.art_focus,
                voice_preset: voicePreset !== undefined ? String(voicePreset) : existing?.voice_preset,
                enhance_preset: enhancePreset !== undefined ? String(enhancePreset) : existing?.enhance_preset,
                enhance_audio_enabled: enhanceAudioEnabled !== undefined ? Boolean(enhanceAudioEnabled) : existing?.enhance_audio_enabled,
                transcribe_enabled: transcribeEnabled !== undefined ? Boolean(transcribeEnabled) : existing?.transcribe_enabled,
                illustrate_enabled: illustrateEnabled !== undefined ? Boolean(illustrateEnabled) : existing?.illustrate_enabled,
                dynamic_prompt_enabled: dynamicPromptEnabled !== undefined ? Boolean(dynamicPromptEnabled) : existing?.dynamic_prompt_enabled,
                custom_prompt: customPrompt !== undefined ? String(customPrompt) : existing?.custom_prompt,
                queue_enabled: queueEnabled !== undefined ? Boolean(queueEnabled) : (isQueued !== undefined ? Boolean(isQueued) : existing?.queue_enabled)
            });

            if (voicePreset !== undefined) {
                const chaps = getAudiobookChaptersMeta(bookKey);
                for (const c of chaps) {
                    upsertAudiobookChapterMeta({
                        chapter_key: c.chapter_key,
                        book_key: bookKey,
                        voice_preset: String(voicePreset)
                    });
                }
            }

            return NextResponse.json({
                success: true,
                book: updatedBook,
                chapters: getAudiobookChaptersMeta(bookKey),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'sync_book') {
            const {
                bookKey,
                title,
                author,
                thumb,
                posterUrl,
                libraryId,
                tracks,
                chapters,
                queueEnabled,
                isQueued,
                transcribeEnabled,
                illustrateEnabled,
                enhanceAudioEnabled,
                voicePreset,
                enhancePreset,
                artStyle,
                imagesPerChapter,
                artFocus,
                dynamicPromptEnabled,
                customPrompt
            } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }

            const rawTracks = Array.isArray(tracks) ? tracks : (Array.isArray(chapters) ? chapters : []);
            const effectiveQueueEnabled = queueEnabled !== undefined
                ? Boolean(queueEnabled)
                : (isQueued !== undefined ? Boolean(isQueued) : undefined);

            const existingBook = getAudiobookMeta(bookKey);
            const allBooks = getAllAudiobooksMeta();
            const maxPriority = allBooks.reduce((m, b) => Math.max(m, b.queue_priority || 0), 0);

            const bookMeta = upsertAudiobookMeta({
                book_key: bookKey,
                title: title || existingBook?.title || 'Untitled Book',
                author: author || existingBook?.author || 'Unknown Author',
                thumb: thumb || posterUrl || existingBook?.thumb,
                library_id: libraryId || existingBook?.library_id,
                queue_priority: existingBook ? existingBook.queue_priority : maxPriority + 1,
                queue_enabled: effectiveQueueEnabled !== undefined ? effectiveQueueEnabled : (existingBook?.queue_enabled ?? false),
                transcribe_enabled: transcribeEnabled !== undefined ? Boolean(transcribeEnabled) : (existingBook?.transcribe_enabled ?? true),
                illustrate_enabled: illustrateEnabled !== undefined ? Boolean(illustrateEnabled) : (existingBook?.illustrate_enabled ?? true),
                enhance_audio_enabled: enhanceAudioEnabled !== undefined ? Boolean(enhanceAudioEnabled) : (existingBook?.enhance_audio_enabled ?? false),
                voice_preset: voicePreset || existingBook?.voice_preset || 'original',
                enhance_preset: enhancePreset !== undefined ? String(enhancePreset) : existingBook?.enhance_preset,
                art_style: artStyle !== undefined ? String(artStyle) : existingBook?.art_style,
                images_per_chapter: imagesPerChapter !== undefined ? Number(imagesPerChapter) : existingBook?.images_per_chapter,
                art_focus: artFocus !== undefined ? String(artFocus) : existingBook?.art_focus,
                dynamic_prompt_enabled: dynamicPromptEnabled !== undefined ? Boolean(dynamicPromptEnabled) : existingBook?.dynamic_prompt_enabled,
                custom_prompt: customPrompt !== undefined ? String(customPrompt) : existingBook?.custom_prompt,
                total_chapters: rawTracks.length > 0 ? rawTracks.length : (existingBook?.total_chapters || 0)
            });

            if (rawTracks.length > 0) {
                rawTracks.forEach((t: any, idx: number) => {
                    const cKey = t.ratingKey || t.chapterKey || t.chapter_key || `${bookKey}_ch_${idx + 1}`;
                    let filePath = t.filePath || t.file_path || '';
                    if (!filePath && typeof cKey === 'string' && cKey.startsWith('local_track_')) {
                        try {
                            filePath = Buffer.from(cKey.replace('local_track_', ''), 'base64url').toString('utf8');
                        } catch {}
                    }
                    const rawDur = Number(t.duration ?? t.durationMs ?? t.duration_sec ?? 0);
                    const durationSec = rawDur > 0 ? Math.round(rawDur / (rawDur > 10000 ? 1000 : 1)) : 0;

                    upsertAudiobookChapterMeta({
                        chapter_key: cKey,
                        book_key: bookKey,
                        chapter_index: t.index ?? t.chapterIndex ?? idx + 1,
                        title: t.title || `Chapter ${idx + 1}`,
                        file_path: filePath || undefined,
                        duration_sec: durationSec,
                        voice_preset: bookMeta.voice_preset
                    });
                });
                recalculateAudiobookTotals(bookKey);
            }

            if (effectiveQueueEnabled) {
                console.log(`📚 [AudiobookStudio] Book "${bookMeta.title}" added to processing queue.`);
                triggerAudiobookQueueWorker();
            }

            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(bookKey),
                chapters: getAudiobookChaptersMeta(bookKey),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'reorder_queue') {
            const { orderedBookKeys } = body;
            if (!Array.isArray(orderedBookKeys)) {
                return NextResponse.json({ success: false, error: 'orderedBookKeys must be an array' }, { status: 400 });
            }
            reorderAudiobookQueue(orderedBookKeys);
            console.log(`📚 [AudiobookStudio] Reordered priority queue (${orderedBookKeys.length} books).`);
            triggerAudiobookQueueWorker();
            return NextResponse.json({
                success: true,
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'prioritize_first') {
            const { bookKey } = body;
            const allBooks = getAllAudiobooksMeta();
            const ordered = [bookKey, ...allBooks.map(b => b.book_key).filter(k => k !== bookKey)];
            upsertAudiobookMeta({ book_key: bookKey, queue_enabled: true, status: 'queued' });
            reorderAudiobookQueue(ordered);
            console.log(`⚡ [AudiobookStudio] Prioritized "${bookKey}" to #1 in processing queue.`);
            triggerAudiobookQueueWorker(bookKey);
            return NextResponse.json({
                success: true,
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'run_chapter_task') {
            const { bookKey, chapterKey, taskType, title, author, posterUrl, thumb, chapterTitle, chapterIndex, filePath, durationSec } = body;
            const resolvedBookKey = bookKey || (chapterKey ? `book_for_${chapterKey}` : '');
            if (!resolvedBookKey || !chapterKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey or chapterKey' }, { status: 400 });
            }

            // Auto-sync book & chapter on the fly if not yet in SQLite so we NEVER fail with "Sync the book first"
            let book = getAudiobookMeta(resolvedBookKey);
            if (!book) {
                book = upsertAudiobookMeta({
                    book_key: resolvedBookKey,
                    title: title || 'Audiobook',
                    author: author || 'Unknown Author',
                    thumb: thumb || posterUrl || undefined,
                    total_chapters: 1
                });
            }

            let chapter = getAudiobookChapterMeta(chapterKey);
            if (!chapter) {
                let decodedPath = filePath || '';
                if (!decodedPath && typeof chapterKey === 'string' && chapterKey.startsWith('local_track_')) {
                    try {
                        decodedPath = Buffer.from(chapterKey.replace('local_track_', ''), 'base64url').toString('utf8');
                    } catch {}
                }
                chapter = upsertAudiobookChapterMeta({
                    chapter_key: chapterKey,
                    book_key: resolvedBookKey,
                    chapter_index: Number(chapterIndex || 1),
                    title: chapterTitle || (decodedPath ? path.basename(decodedPath) : 'Chapter 1'),
                    file_path: decodedPath || undefined,
                    duration_sec: Number(durationSec || 0),
                    voice_preset: body.voicePreset || book.voice_preset || 'original'
                });
                recalculateAudiobookTotals(resolvedBookKey);
            }

            const config = getAudiobookStudioConfig();

            if (taskType === 'transcribe') {
                await transcribeAudiobookChapter(book, chapter, config);
            } else if (taskType === 'illustrate') {
                const freshChapter = getAudiobookChapterMeta(chapterKey) || chapter;
                await generateAudiobookChapterIllustrations(book, freshChapter, config, true);
            } else if (taskType === 'enhance') {
                if (body.voicePreset) {
                    upsertAudiobookChapterMeta({ chapter_key: chapterKey, book_key: resolvedBookKey, voice_preset: body.voicePreset });
                }
                const freshChapter = getAudiobookChapterMeta(chapterKey) || chapter;
                await enhanceAudiobookChapterAudio(book, freshChapter, config);
            } else {
                triggerAudiobookQueueWorker(resolvedBookKey, chapterKey);
            }

            recalculateAudiobookTotals(resolvedBookKey);
            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(resolvedBookKey),
                chapter: getAudiobookChapterMeta(chapterKey),
                chapters: getAudiobookChaptersMeta(resolvedBookKey),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'curate_images') {
            const { chapterKey, toggleImageId, deleteImageId, images } = body;
            const chapter = getAudiobookChapterMeta(chapterKey);
            if (!chapter) {
                return NextResponse.json({ success: false, error: 'Chapter not found' }, { status: 404 });
            }

            let updatedImages = [...(chapter.images || [])];
            if (Array.isArray(images)) {
                updatedImages = images;
            } else if (toggleImageId) {
                updatedImages = updatedImages.map(img =>
                    img.id === toggleImageId ? { ...img, kept: !img.kept } : img
                );
            } else if (deleteImageId) {
                const target = updatedImages.find(i => i.id === deleteImageId);
                if (target && target.url.includes('file=')) {
                    const fName = decodeURIComponent(target.url.split('file=')[1] || '');
                    const fullPath = path.join(getAudiobookArtDir(), path.basename(fName));
                    try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
                }
                updatedImages = updatedImages.filter(img => img.id !== deleteImageId);
            }

            const savedChapter = upsertAudiobookChapterMeta({
                chapter_key: chapter.chapter_key,
                book_key: chapter.book_key,
                images: updatedImages,
                illustration_status: updatedImages.some(i => i.kept) ? 'completed' : 'idle'
            });

            return NextResponse.json({
                success: true,
                chapter: savedChapter,
                chapters: getAudiobookChaptersMeta(chapter.book_key),
                book: getAudiobookMeta(chapter.book_key)
            });
        }

        if (action === 'run_queue_now') {
            console.log(`🚀 [AudiobookStudio] Manual queue processing triggered.`);
            triggerAudiobookQueueWorker(body.bookKey);
            return NextResponse.json({
                success: true,
                status: getAudiobookStudioStatus(),
                books: getAllAudiobooksMeta()
            });
        }

        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        console.error('Error in POST /api/theater/audiobooks/studio:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

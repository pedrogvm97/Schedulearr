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
    getAudiobookArtDir
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

        if (action === 'sync_book') {
            const { bookKey, title, author, thumb, libraryId, tracks, queueEnabled, transcribeEnabled, illustrateEnabled, enhanceAudioEnabled, voicePreset } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }

            const existingBook = getAudiobookMeta(bookKey);
            const allBooks = getAllAudiobooksMeta();
            const maxPriority = allBooks.reduce((m, b) => Math.max(m, b.queue_priority || 0), 0);

            const bookMeta = upsertAudiobookMeta({
                book_key: bookKey,
                title: title || existingBook?.title || 'Untitled Book',
                author: author || existingBook?.author || 'Unknown Author',
                thumb: thumb || existingBook?.thumb,
                library_id: libraryId || existingBook?.library_id,
                queue_priority: existingBook ? existingBook.queue_priority : maxPriority + 1,
                queue_enabled: queueEnabled !== undefined ? Boolean(queueEnabled) : (existingBook?.queue_enabled ?? false),
                transcribe_enabled: transcribeEnabled !== undefined ? Boolean(transcribeEnabled) : (existingBook?.transcribe_enabled ?? true),
                illustrate_enabled: illustrateEnabled !== undefined ? Boolean(illustrateEnabled) : (existingBook?.illustrate_enabled ?? true),
                enhance_audio_enabled: enhanceAudioEnabled !== undefined ? Boolean(enhanceAudioEnabled) : (existingBook?.enhance_audio_enabled ?? false),
                voice_preset: voicePreset || existingBook?.voice_preset || 'original',
                total_chapters: Array.isArray(tracks) ? tracks.length : (existingBook?.total_chapters || 0)
            });

            if (Array.isArray(tracks)) {
                tracks.forEach((t: any, idx: number) => {
                    const cKey = t.ratingKey || t.chapter_key || `${bookKey}_ch_${idx + 1}`;
                    let filePath = t.filePath || t.file_path || '';
                    if (!filePath && typeof cKey === 'string' && cKey.startsWith('local_track_')) {
                        try {
                            filePath = Buffer.from(cKey.replace('local_track_', ''), 'base64url').toString('utf8');
                        } catch {}
                    }
                    const durationSec = t.duration ? Math.round(Number(t.duration) / (Number(t.duration) > 10000 ? 1000 : 1)) : 0;

                    upsertAudiobookChapterMeta({
                        chapter_key: cKey,
                        book_key: bookKey,
                        chapter_index: t.index || idx + 1,
                        title: t.title || `Chapter ${idx + 1}`,
                        file_path: filePath || undefined,
                        duration_sec: durationSec,
                        voice_preset: bookMeta.voice_preset
                    });
                });
                recalculateAudiobookTotals(bookKey);
            }

            if (queueEnabled) {
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
            const { bookKey, chapterKey, taskType } = body;
            const book = getAudiobookMeta(bookKey);
            const chapter = getAudiobookChapterMeta(chapterKey);
            if (!book || !chapter) {
                return NextResponse.json({ success: false, error: 'Book or chapter not found. Sync the book first.' }, { status: 404 });
            }
            const config = getAudiobookStudioConfig();

            if (taskType === 'transcribe') {
                await transcribeAudiobookChapter(book, chapter, config);
            } else if (taskType === 'illustrate') {
                const freshChapter = getAudiobookChapterMeta(chapterKey) || chapter;
                await generateAudiobookChapterIllustrations(book, freshChapter, config, true);
            } else if (taskType === 'enhance') {
                if (body.voicePreset) {
                    upsertAudiobookChapterMeta({ chapter_key: chapterKey, book_key: bookKey, voice_preset: body.voicePreset });
                }
                const freshChapter = getAudiobookChapterMeta(chapterKey) || chapter;
                await enhanceAudiobookChapterAudio(book, freshChapter, config);
            } else {
                triggerAudiobookQueueWorker(bookKey, chapterKey);
            }

            recalculateAudiobookTotals(bookKey);
            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(bookKey),
                chapter: getAudiobookChapterMeta(chapterKey),
                chapters: getAudiobookChaptersMeta(bookKey),
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

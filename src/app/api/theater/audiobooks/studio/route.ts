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
    recalculateAudiobookTotals,
    getTheaterLibraries,
    clearCachedTheaterItems
} from '@/lib/db';
import {
    getAudiobookStudioConfig,
    saveAudiobookStudioConfig,
    getAudiobookStudioStatus,
    transcribeAudiobookChapter,
    enhanceAudiobookChapterAudio,
    generateAudiobookChapterIllustrations,
    generateAudiobookCoverArt,
    discoverBookRealStructureWithAi,
    resetAndRedoAudiobookAssets,
    getQueueBreakdownAndHistory,
    getStudioQueueHistory,
    removeStudioApiKey,
    triggerAudiobookQueueWorker,
    getAudiobookArtDir,
    detectAndVerifyAiApiKey,
    getAudiobookCollectionsState,
    saveAudiobookCollectionsState,
    organizeAudiobookCollectionsWithAi,
    previewRenameAudiobookFiles,
    executeRenameAudiobookFiles
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
        const collectionsState = getAudiobookCollectionsState();
        const queueBreakdown = getQueueBreakdownAndHistory();
        const queueHistory = getStudioQueueHistory();

        if (chapterKey) {
            const chapter = getAudiobookChapterMeta(chapterKey);
            const book = chapter ? getAudiobookMeta(chapter.book_key) : null;
            return NextResponse.json({
                success: true,
                config,
                status,
                book,
                chapter,
                collectionsState,
                queueBreakdown,
                queueHistory
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
                books,
                collectionsState,
                queueBreakdown,
                queueHistory
            });
        }

        return NextResponse.json({
            success: true,
            config,
            status,
            books,
            collectionsState,
            queueBreakdown,
            queueHistory
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
            const { apiKey, role } = body;
            const { probe, config } = await detectAndVerifyAiApiKey(apiKey || '', role || 'primary');
            return NextResponse.json({
                success: true,
                probe,
                config,
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'add_backup_api_key') {
            const { apiKey, role } = body;
            const { probe, config } = await detectAndVerifyAiApiKey(apiKey || '', role || 'backup');
            return NextResponse.json({
                success: true,
                probe,
                config,
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'remove_api_key') {
            const { keyId } = body;
            const config = removeStudioApiKey(keyId);
            return NextResponse.json({
                success: true,
                config,
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'set_key_routing_mode') {
            const { mode } = body;
            const config = saveAudiobookStudioConfig({
                keyRoutingMode: mode === 'load_balance' ? 'load_balance' : 'failover'
            });
            return NextResponse.json({
                success: true,
                config,
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'toggle_custom_cover') {
            const { bookKey, useCustomCover } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            upsertAudiobookMeta({
                book_key: bookKey,
                use_custom_cover: Boolean(useCustomCover)
            });
            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(bookKey),
                books: getAllAudiobooksMeta()
            });
        }

        if (action === 'generate_book_cover') {
            const { bookKey, activateImmediately } = body;
            const book = getAudiobookMeta(bookKey);
            if (!book) {
                return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
            }
            const updated = await generateAudiobookCoverArt(book, Boolean(activateImmediately));
            return NextResponse.json({
                success: true,
                book: updated,
                books: getAllAudiobooksMeta()
            });
        }

        if (action === 'discover_book_structure') {
            const { bookKey } = body;
            const book = getAudiobookMeta(bookKey);
            if (!book) {
                return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
            }
            const structure = await discoverBookRealStructureWithAi(book);
            return NextResponse.json({
                success: true,
                structure,
                book: getAudiobookMeta(bookKey)
            });
        }

        if (action === 'reset_and_redo') {
            const { bookKey, chapterKey, target, redoNow } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            await resetAndRedoAudiobookAssets({
                bookKey,
                chapterKey,
                target: target || 'all',
                redoNow: redoNow !== false
            });
            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(bookKey),
                chapter: chapterKey ? getAudiobookChapterMeta(chapterKey) : null,
                chapters: getAudiobookChaptersMeta(bookKey),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus(),
                queueBreakdown: getQueueBreakdownAndHistory()
            });
        }

        if (action === 'queue_whole_book') {
            const { bookKey } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            upsertAudiobookMeta({
                book_key: bookKey,
                queue_enabled: true,
                transcribe_enabled: true,
                illustrate_enabled: true,
                status: 'queued'
            });
            triggerAudiobookQueueWorker(bookKey);
            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(bookKey),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus(),
                queueBreakdown: getQueueBreakdownAndHistory()
            });
        }

        if (action === 'get_queue_breakdown') {
            return NextResponse.json({
                success: true,
                queueBreakdown: getQueueBreakdownAndHistory(),
                history: getStudioQueueHistory(),
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
                const freshChapter = getAudiobookChapterMeta(chapterKey) || chapter;
                await enhanceAudiobookChapterAudio(book, freshChapter, config, body.voicePreset);
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

        if (action === 'run_queue_now' || action === 'trigger_worker') {
            console.log(`🚀 [AudiobookStudio] Manual queue processing triggered.`);
            triggerAudiobookQueueWorker(body.bookKey);
            return NextResponse.json({
                success: true,
                status: getAudiobookStudioStatus(),
                books: getAllAudiobooksMeta(),
                collectionsState: getAudiobookCollectionsState()
            });
        }

        if (action === 'toggle_queue') {
            const { bookKey, isQueued } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            upsertAudiobookMeta({
                book_key: bookKey,
                queue_enabled: Boolean(isQueued),
                status: isQueued ? 'queued' : 'idle'
            });
            return NextResponse.json({
                success: true,
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'ai_organize_collections') {
            const inputBooks = Array.isArray(body.books) ? body.books : [];
            const { state, usedProvider, collectionsCreated } = await organizeAudiobookCollectionsWithAi(inputBooks);
            return NextResponse.json({
                success: true,
                collectionsState: state,
                usedProvider,
                collectionsCreated
            });
        }

        if (action === 'save_collection') {
            const { id, name, author, description, bookKeys, bookMetadataPatch } = body;
            if (!name || !Array.isArray(bookKeys) || bookKeys.length === 0) {
                return NextResponse.json({ success: false, error: 'Collection name and at least 1 book are required' }, { status: 400 });
            }
            const cur = getAudiobookCollectionsState();
            const colId = id || `col_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const existingIdx = cur.collections.findIndex(c => c.id === colId);

            // Remove selected bookKeys from any other collection so a book only belongs to one collection at a time
            const cleanedCollections = cur.collections.map(c => {
                if (c.id === colId) return c;
                return {
                    ...c,
                    bookKeys: c.bookKeys.filter(k => !bookKeys.includes(k))
                };
            }).filter(c => c.id === colId || c.bookKeys.length > 0);

            const entry = {
                id: colId,
                name: String(name).trim(),
                author: String(author || 'Various Authors').trim(),
                description: description ? String(description).trim() : undefined,
                bookKeys,
                source: 'manual' as const,
                updatedAt: new Date().toISOString()
            };

            if (existingIdx >= 0) {
                const idxInCleaned = cleanedCollections.findIndex(c => c.id === colId);
                if (idxInCleaned >= 0) cleanedCollections[idxInCleaned] = entry;
                else cleanedCollections.push(entry);
            } else {
                cleanedCollections.push(entry);
            }

            const nextMeta = { ...cur.bookMetadata, ...(bookMetadataPatch || {}) };
            bookKeys.forEach((k: string, idx: number) => {
                nextMeta[k] = {
                    ...(nextMeta[k] || { bookKey: k }),
                    bookKey: k,
                    collectionId: colId,
                    collectionName: String(name).trim(),
                    bookNumber: nextMeta[k]?.bookNumber || (idx + 1)
                };
            });

            const saved = saveAudiobookCollectionsState({
                collections: cleanedCollections,
                explodedCollectionIds: cur.explodedCollectionIds.filter(eid => eid !== colId),
                ungroupedBookKeys: cur.ungroupedBookKeys.filter(uk => !bookKeys.includes(uk)),
                bookMetadata: nextMeta
            });

            return NextResponse.json({
                success: true,
                collectionsState: saved
            });
        }

        if (action === 'explode_collection') {
            const { collectionId, bookKeys } = body;
            const cur = getAudiobookCollectionsState();
            const keysToUngroup: string[] = Array.isArray(bookKeys) ? bookKeys : [];

            const targetCol = cur.collections.find(c => c.id === collectionId);
            if (targetCol) {
                for (const k of targetCol.bookKeys) {
                    if (!keysToUngroup.includes(k)) keysToUngroup.push(k);
                }
            }

            const nextCollections = cur.collections.filter(c => c.id !== collectionId);
            const nextExploded = collectionId && !cur.explodedCollectionIds.includes(collectionId)
                ? [...cur.explodedCollectionIds, collectionId]
                : cur.explodedCollectionIds;
            const nextUngrouped = Array.from(new Set([...cur.ungroupedBookKeys, ...keysToUngroup]));

            const nextMeta = { ...cur.bookMetadata };
            for (const k of keysToUngroup) {
                if (nextMeta[k]) {
                    nextMeta[k] = {
                        ...nextMeta[k],
                        collectionId: '',
                        collectionName: ''
                    };
                }
            }

            const saved = saveAudiobookCollectionsState({
                collections: nextCollections,
                explodedCollectionIds: nextExploded,
                ungroupedBookKeys: nextUngrouped,
                bookMetadata: nextMeta
            });

            return NextResponse.json({
                success: true,
                collectionsState: saved
            });
        }

        if (action === 'preview_rename_books') {
            const items = Array.isArray(body.items) ? body.items : [];
            const template = String(body.template || '{Author} - {Title} ({Year}) [{AudioVersion}]');
            const versionMode = body.versionMode || 'auto';
            const previews = previewRenameAudiobookFiles(items, template, versionMode);
            return NextResponse.json({
                success: true,
                previews
            });
        }

        if (action === 'execute_rename_books') {
            const items = Array.isArray(body.items) ? body.items : [];
            const template = String(body.template || '{Author} - {Title} ({Year}) [{AudioVersion}]');
            const versionMode = body.versionMode || 'auto';
            const outcome = executeRenameAudiobookFiles(items, template, versionMode);

            // Invalidate cached audiobook libraries so rescans reflect the new filenames immediately
            try {
                const libs = getTheaterLibraries().filter(l => l.type === 'audiobooks');
                for (const l of libs) {
                    clearCachedTheaterItems(l.id);
                }
            } catch {}

            return NextResponse.json({
                success: true,
                ...outcome
            });
        }

        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        console.error('Error in POST /api/theater/audiobooks/studio:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

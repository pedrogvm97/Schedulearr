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
    detectAudiobookChapterScenesWithLlm,
    paintAudiobookChapterScenes,
    generateAudiobookChapterIllustrations,
    generateAudiobookCoverArt,
    discoverBookRealStructureWithAi,
    resetAndRedoAudiobookAssets,
    getQueueBreakdownAndHistory,
    getStudioQueueHistory,
    removeStudioApiKey,
    triggerAudiobookQueueWorker,
    getAudiobookArtDir,
    getAudiobookEnhancedDir,
    detectAndVerifyAiApiKey,
    getAudiobookCollectionsState,
    saveAudiobookCollectionsState,
    organizeAudiobookCollectionsWithAi,
    previewRenameAudiobookFiles,
    executeRenameAudiobookFiles,
    purgeAllFakeSvgArtFromDbAndDisk,
    purgeAllGeneratedAudiobookData,
    cleanGeneratedAudiobookData,
    setAiGloballyPaused,
    isAiGloballyPaused,
    regenerateSingleAudiobookSceneImage,
    getAudiobookTranscriptsDir,
    getBookVisualPortfolio,
    saveBookVisualPortfolio,
    generateBookVisualPortfolioWithAi,
    paintBookPortfolioItem
} from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        purgeAllFakeSvgArtFromDbAndDisk();
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
            const chapter = getAudiobookChapterMeta(chapterKey, bookKey || undefined);
            const book = chapter ? getAudiobookMeta(chapter.book_key) : (bookKey ? getAudiobookMeta(bookKey) : null);
            const chapters = book ? getAudiobookChaptersMeta(book.book_key) : (bookKey ? getAudiobookChaptersMeta(bookKey) : []);
            const portfolio = book ? getBookVisualPortfolio(book.book_key) : (bookKey ? getBookVisualPortfolio(bookKey) : null);
            return NextResponse.json({
                success: true,
                config,
                status,
                book,
                chapter,
                chapters,
                portfolio,
                books,
                collectionsState,
                queueBreakdown,
                queueHistory
            });
        }

        if (bookKey) {
            const book = getAudiobookMeta(bookKey);
            const chapters = getAudiobookChaptersMeta(bookKey);
            const portfolio = getBookVisualPortfolio(bookKey);
            return NextResponse.json({
                success: true,
                config,
                status,
                book,
                chapters,
                portfolio,
                books,
                collectionsState,
                queueBreakdown,
                queueHistory
            });
        }

        const allChapters = books.flatMap(b => getAudiobookChaptersMeta(b.book_key));

        return NextResponse.json({
            success: true,
            config,
            status,
            books,
            chapters: allChapters,
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

        if (action === 'get_book_portfolio') {
            const { bookKey } = body;
            const portfolio = getBookVisualPortfolio(bookKey);
            return NextResponse.json({ success: true, portfolio });
        }

        if (action === 'generate_book_portfolio') {
            const { bookKey } = body;
            const portfolio = await generateBookVisualPortfolioWithAi(bookKey);
            return NextResponse.json({ success: true, portfolio });
        }

        if (action === 'save_book_portfolio') {
            const { bookKey, portfolio } = body;
            if (bookKey && portfolio) {
                saveBookVisualPortfolio(bookKey, portfolio);
            }
            return NextResponse.json({ success: true, portfolio });
        }

        if (action === 'paint_portfolio_item') {
            const { bookKey, itemId, itemType, customPrompt } = body;
            const result = await paintBookPortfolioItem({ bookKey, itemId, itemType, customPrompt });
            if (!result) {
                return NextResponse.json({ success: false, error: 'Failed to paint portfolio item' }, { status: 500 });
            }
            return NextResponse.json({ success: true, portfolio: result.portfolio, paintedUrl: result.paintedUrl });
        }

        if (action === 'reset_and_redo') {
            const { bookKey, chapterKey, target, scope, redoNow } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            const rawTarget = String(target || scope || 'all').toLowerCase();
            const normalizedTarget: 'transcriptions' | 'art' | 'voices' | 'all' =
                rawTarget === 'transcripts' || rawTarget === 'transcriptions'
                    ? 'transcriptions'
                    : rawTarget === 'illustrations' || rawTarget === 'art' || rawTarget === 'images'
                    ? 'art'
                    : rawTarget === 'voices' || rawTarget === 'audio'
                    ? 'voices'
                    : 'all';
            await resetAndRedoAudiobookAssets({
                bookKey,
                chapterKey,
                target: normalizedTarget,
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

        if (action === 'purge_all_generated_data') {
            const result = purgeAllGeneratedAudiobookData();
            return NextResponse.json({
                success: true,
                ...result,
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
                scening_enabled: true,
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
            if (updated.enabled && updated.aiFeaturesEnabled !== false) {
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
                voicePersona,
                activePersonas,
                activeTimbres,
                voiceEngineMode,
                enhancePreset,
                enhanceAudioEnabled,
                transcribeEnabled,
                sceningEnabled,
                illustrateEnabled,
                dynamicPromptEnabled,
                customPrompt,
                summary,
                queueEnabled,
                isQueued
            } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            const existing = getAudiobookMeta(bookKey);
            const nextScening = sceningEnabled !== undefined ? Boolean(sceningEnabled) : (existing?.scening_enabled ?? true);
            let nextIllustrate = illustrateEnabled !== undefined ? Boolean(illustrateEnabled) : (existing?.illustrate_enabled ?? true);
            // Dependency rule: cannot turn off scening without turning off imaging; enabling imaging enables scening
            const resolvedScening = illustrateEnabled === true ? true : nextScening;
            if (!resolvedScening) {
                nextIllustrate = false;
            }

            const nextQueueEnabled = queueEnabled !== undefined ? Boolean(queueEnabled) : (isQueued !== undefined ? Boolean(isQueued) : existing?.queue_enabled);
            const effectiveVoicePreset = voicePersona || voicePreset || existing?.voice_preset || 'original';
            const updatedBook = upsertAudiobookMeta({
                book_key: bookKey,
                title: title ?? existing?.title ?? 'Untitled Book',
                author: author ?? existing?.author ?? 'Unknown Author',
                thumb: thumb ?? posterUrl ?? existing?.thumb,
                art_style: artStyle !== undefined ? String(artStyle) : existing?.art_style,
                images_per_chapter: imagesPerChapter !== undefined ? Number(imagesPerChapter) : existing?.images_per_chapter,
                art_focus: artFocus !== undefined ? String(artFocus) : existing?.art_focus,
                voice_preset: effectiveVoicePreset,
                active_personas: Array.isArray(activePersonas) ? activePersonas : existing?.active_personas,
                active_timbres: Array.isArray(activeTimbres) ? activeTimbres : existing?.active_timbres,
                voice_engine_mode: voiceEngineMode || existing?.voice_engine_mode,
                enhance_preset: enhancePreset !== undefined ? String(enhancePreset) : existing?.enhance_preset,
                enhance_audio_enabled: enhanceAudioEnabled !== undefined ? Boolean(enhanceAudioEnabled) : existing?.enhance_audio_enabled,
                transcribe_enabled: transcribeEnabled !== undefined ? Boolean(transcribeEnabled) : existing?.transcribe_enabled,
                scening_enabled: resolvedScening,
                illustrate_enabled: nextIllustrate,
                dynamic_prompt_enabled: dynamicPromptEnabled !== undefined ? Boolean(dynamicPromptEnabled) : existing?.dynamic_prompt_enabled,
                custom_prompt: customPrompt !== undefined ? String(customPrompt) : existing?.custom_prompt,
                summary: summary !== undefined ? String(summary) : existing?.summary,
                queue_enabled: nextQueueEnabled
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

            if (nextQueueEnabled) {
                triggerAudiobookQueueWorker(bookKey);
            }

            return NextResponse.json({
                success: true,
                book: updatedBook,
                chapters: getAudiobookChaptersMeta(bookKey),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'set_active_voice') {
            const { chapterKey, bookKey, voicePreset, filePath } = body;
            if (!chapterKey || !filePath) {
                return NextResponse.json({ success: false, error: 'Missing chapterKey or filePath' }, { status: 400 });
            }
            const ch = getAudiobookChapterMeta(chapterKey, bookKey);
            if (!ch) {
                return NextResponse.json({ success: false, error: 'Chapter not found' }, { status: 404 });
            }
            const updatedChapter = upsertAudiobookChapterMeta({
                chapter_key: ch.chapter_key,
                book_key: ch.book_key,
                voice_preset: voicePreset || ch.voice_preset,
                enhanced_audio_path: filePath,
                audio_enhance_status: 'completed'
            });
            return NextResponse.json({
                success: true,
                chapter: updatedChapter,
                chapters: getAudiobookChaptersMeta(ch.book_key),
                book: getAudiobookMeta(ch.book_key),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'delete_voice_alternative') {
            const { chapterKey, bookKey, presetKey } = body;
            if (!chapterKey || !presetKey) {
                return NextResponse.json({ success: false, error: 'Missing chapterKey or presetKey' }, { status: 400 });
            }
            const ch = getAudiobookChapterMeta(chapterKey, bookKey);
            if (!ch) {
                return NextResponse.json({ success: false, error: 'Chapter not found' }, { status: 404 });
            }
            const voices = { ...(ch.processed_voices || {}) };
            const targetPath = voices[presetKey];
            delete voices[presetKey];
            if (targetPath) {
                try {
                    const fullPath = targetPath.startsWith('/') ? targetPath : path.join(getAudiobookEnhancedDir(), path.basename(targetPath));
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                } catch {}
            }
            const isTargetActive = ch.voice_preset === presetKey || ch.enhanced_audio_path === targetPath;
            const remainingVoices = Object.entries(voices);
            const nextActivePath = isTargetActive ? (remainingVoices[0]?.[1] || '') : ch.enhanced_audio_path;
            const nextActivePreset = isTargetActive ? (remainingVoices[0]?.[0] || 'original') : ch.voice_preset;
            const updatedChapter = upsertAudiobookChapterMeta({
                chapter_key: ch.chapter_key,
                book_key: ch.book_key,
                processed_voices: voices,
                enhanced_audio_path: nextActivePath,
                voice_preset: nextActivePreset,
                audio_enhance_status: nextActivePath ? 'completed' : 'idle'
            });
            return NextResponse.json({
                success: true,
                chapter: updatedChapter,
                chapters: getAudiobookChaptersMeta(ch.book_key),
                book: getAudiobookMeta(ch.book_key),
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
                coverUrl,
                libraryId,
                tracks,
                chapters,
                queueEnabled,
                isQueued,
                transcribeEnabled,
                sceningEnabled,
                illustrateEnabled,
                enhanceAudioEnabled,
                voicePreset,
                enhancePreset,
                artStyle,
                imagesPerChapter,
                artFocus,
                dynamicPromptEnabled,
                customPrompt,
                summary,
                synopsis,
                genre,
                publishedYear,
                readingStatus,
                onBedsideTable,
                progressPercent
            } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }

            const rawTracks = Array.isArray(tracks) ? tracks : (Array.isArray(chapters) ? chapters : []);
            const effectiveQueueEnabled = queueEnabled !== undefined
                ? Boolean(queueEnabled)
                : (isQueued !== undefined ? Boolean(isQueued) : undefined);

            const existingBook = getAudiobookMeta(bookKey, title, author);
            const allBooks = getAllAudiobooksMeta();
            const maxPriority = allBooks.reduce((m, b) => Math.max(m, b.queue_priority || 0), 0);

            const resolvedScening = sceningEnabled !== undefined ? Boolean(sceningEnabled) : (existingBook?.scening_enabled ?? true);
            const resolvedIllustrate = !resolvedScening ? false : (illustrateEnabled !== undefined ? Boolean(illustrateEnabled) : (existingBook?.illustrate_enabled ?? true));

            const bookMeta = upsertAudiobookMeta({
                book_key: existingBook?.book_key || bookKey,
                title: title || existingBook?.title || 'Untitled Book',
                author: author || existingBook?.author || 'Unknown Author',
                genre: genre !== undefined ? String(genre) : existingBook?.genre,
                published_year: publishedYear !== undefined ? String(publishedYear) : existingBook?.published_year,
                reading_status: readingStatus || existingBook?.reading_status || 'unstarted',
                on_bedside_table: onBedsideTable !== undefined ? Boolean(onBedsideTable) : existingBook?.on_bedside_table,
                progress_percent: progressPercent !== undefined ? Number(progressPercent) : (existingBook?.progress_percent ?? 0),
                thumb: thumb || posterUrl || coverUrl || existingBook?.thumb,
                library_id: libraryId || existingBook?.library_id,
                queue_priority: existingBook ? existingBook.queue_priority : maxPriority + 1,
                queue_enabled: effectiveQueueEnabled !== undefined ? effectiveQueueEnabled : (existingBook?.queue_enabled ?? false),
                transcribe_enabled: transcribeEnabled !== undefined ? Boolean(transcribeEnabled) : (existingBook?.transcribe_enabled ?? true),
                scening_enabled: resolvedScening,
                illustrate_enabled: resolvedIllustrate,
                enhance_audio_enabled: enhanceAudioEnabled !== undefined ? Boolean(enhanceAudioEnabled) : (existingBook?.enhance_audio_enabled ?? false),
                voice_preset: voicePreset || existingBook?.voice_preset || 'original',
                enhance_preset: enhancePreset !== undefined ? String(enhancePreset) : existingBook?.enhance_preset,
                art_style: artStyle !== undefined ? String(artStyle) : existingBook?.art_style,
                images_per_chapter: imagesPerChapter !== undefined ? Number(imagesPerChapter) : existingBook?.images_per_chapter,
                art_focus: artFocus !== undefined ? String(artFocus) : existingBook?.art_focus,
                dynamic_prompt_enabled: dynamicPromptEnabled !== undefined ? Boolean(dynamicPromptEnabled) : existingBook?.dynamic_prompt_enabled,
                custom_prompt: customPrompt !== undefined ? String(customPrompt) : existingBook?.custom_prompt,
                summary: (summary ?? synopsis) !== undefined ? String(summary ?? synopsis) : existingBook?.summary,
                total_chapters: rawTracks.length > 0 ? rawTracks.length : (existingBook?.total_chapters || 0)
            });

            if (rawTracks.length > 0) {
                rawTracks.forEach((t: any, idx: number) => {
                    const cKey = t.ratingKey || t.chapterKey || t.chapter_key || `${bookMeta.book_key}::ch${idx + 1}`;
                    let filePath = t.path || t.filePath || t.file_path || '';
                    if (!filePath && typeof cKey === 'string' && cKey.startsWith('local_track_')) {
                        try {
                            filePath = Buffer.from(cKey.replace('local_track_', ''), 'base64url').toString('utf8');
                        } catch {}
                    }
                    const rawDur = Number(t.duration ?? t.durationMs ?? t.durationSec ?? t.duration_sec ?? 0);
                    const computedSec = rawDur > 0 ? Math.round(rawDur / (rawDur > 10000 ? 1000 : 1)) : 0;
                    const durationSec = computedSec === 300 ? 0 : computedSec;

                    upsertAudiobookChapterMeta({
                        chapter_key: cKey,
                        book_key: bookMeta.book_key,
                        chapter_index: t.index ?? t.chapterIndex ?? idx + 1,
                        title: t.title || `Chapter ${idx + 1}`,
                        file_path: filePath || undefined,
                        duration_sec: durationSec,
                        voice_preset: bookMeta.voice_preset
                    });
                });
                recalculateAudiobookTotals(bookMeta.book_key);
            }

            if (effectiveQueueEnabled) {
                console.log(`📚 [AudiobookStudio] Book "${bookMeta.title}" added to processing queue.`);
                triggerAudiobookQueueWorker(bookMeta.book_key);
            }

            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(bookMeta.book_key),
                chapters: getAudiobookChaptersMeta(bookMeta.book_key),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'update_reading_state') {
            const { bookKey, title, author, thumb, readingStatus, onBedsideTable, progressPercent, lastPlayedAt } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            const existing = getAudiobookMeta(bookKey, title, author);
            const nextStatus: 'unstarted' | 'ongoing' | 'finished' =
                readingStatus || existing?.reading_status || 'unstarted';
            const nextBedside =
                onBedsideTable !== undefined
                    ? Boolean(onBedsideTable)
                    : nextStatus === 'finished'
                        ? false
                        : nextStatus === 'ongoing'
                            ? true
                            : (existing?.on_bedside_table ?? false);

            const updated = upsertAudiobookMeta({
                book_key: existing?.book_key || bookKey,
                title: title || existing?.title || 'Untitled Book',
                author: author || existing?.author || 'Unknown Author',
                thumb: thumb || existing?.thumb,
                reading_status: nextStatus,
                on_bedside_table: nextBedside,
                progress_percent: progressPercent !== undefined
                    ? Number(progressPercent)
                    : (nextStatus === 'finished' ? 100 : (existing?.progress_percent ?? 0)),
                last_played_at: lastPlayedAt || (nextStatus === 'ongoing' ? new Date().toISOString() : existing?.last_played_at)
            });

            return NextResponse.json({
                success: true,
                book: updated,
                books: getAllAudiobooksMeta()
            });
        }

        if (action === 'edit_book_metadata') {
            const {
                bookKey,
                title,
                author,
                translator,
                narrator,
                genre,
                publishedYear,
                coverUrl,
                posterUrl,
                thumb,
                customCoverUrl,
                useCustomCover,
                artStyle,
                imagesPerChapter,
                artFocus,
                customPrompt,
                synopsis,
                description,
                summary,
                authorBio
            } = body;
            if (!bookKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey' }, { status: 400 });
            }
            const existing = getAudiobookMeta(bookKey, title, author);
            const incomingThumb = coverUrl ?? posterUrl ?? thumb;
            const incomingSynopsis = synopsis !== undefined ? synopsis : (description !== undefined ? description : summary);
            const updated = upsertAudiobookMeta({
                book_key: existing?.book_key || bookKey,
                title: title !== undefined ? String(title).trim() : (existing?.title || 'Untitled Book'),
                author: author !== undefined ? String(author).trim() : (existing?.author || 'Unknown Author'),
                canonical_author: author !== undefined ? String(author).trim() : existing?.canonical_author,
                translator: translator !== undefined ? String(translator).trim() : existing?.translator,
                narrator: narrator !== undefined ? String(narrator).trim() : existing?.narrator,
                genre: genre !== undefined ? String(genre).trim() : existing?.genre,
                published_year: publishedYear !== undefined && publishedYear !== null ? String(publishedYear).trim() : existing?.published_year,
                thumb: incomingThumb !== undefined && incomingThumb !== null ? String(incomingThumb).trim() : existing?.thumb,
                custom_cover_url: customCoverUrl !== undefined ? String(customCoverUrl).trim() : existing?.custom_cover_url,
                use_custom_cover: useCustomCover !== undefined ? Boolean(useCustomCover) : existing?.use_custom_cover,
                art_style: artStyle !== undefined ? String(artStyle) : existing?.art_style,
                images_per_chapter: imagesPerChapter !== undefined ? Number(imagesPerChapter) : existing?.images_per_chapter,
                art_focus: artFocus !== undefined ? String(artFocus) : existing?.art_focus,
                custom_prompt: customPrompt !== undefined ? String(customPrompt) : existing?.custom_prompt,
                summary: incomingSynopsis !== undefined ? String(incomingSynopsis).trim() : existing?.summary
            });

            if (title !== undefined || publishedYear !== undefined || incomingSynopsis !== undefined || authorBio !== undefined) {
                const colState = getAudiobookCollectionsState();
                const prevEnrich = colState.bookMetadata[updated.book_key] || colState.bookMetadata[bookKey] || { bookKey: updated.book_key };
                const nextEntry = {
                    ...prevEnrich,
                    bookKey: updated.book_key,
                    cleanTitle: title !== undefined ? String(title).trim() : prevEnrich.cleanTitle,
                    releaseYear: publishedYear !== undefined && publishedYear !== null ? String(publishedYear).trim() : prevEnrich.releaseYear,
                    synopsis: incomingSynopsis !== undefined ? String(incomingSynopsis).trim() : prevEnrich.synopsis,
                    authorBio: authorBio !== undefined ? String(authorBio).trim() : prevEnrich.authorBio
                };
                const nextMetaMap: typeof colState.bookMetadata = {
                    ...colState.bookMetadata,
                    [updated.book_key]: nextEntry
                };
                if (bookKey && bookKey !== updated.book_key) {
                    nextMetaMap[bookKey] = { ...nextEntry, bookKey };
                }
                saveAudiobookCollectionsState({
                    bookMetadata: nextMetaMap
                });
            }

            return NextResponse.json({
                success: true,
                book: updated,
                books: getAllAudiobooksMeta(),
                collectionsState: getAudiobookCollectionsState()
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
            const {
                bookKey,
                chapterKey,
                taskType,
                task,
                title,
                bookTitle,
                author,
                posterUrl,
                thumb,
                chapterTitle,
                chapterIndex,
                filePath,
                chapterPath,
                path: rawTrackPath,
                durationSec
            } = body;
            const effectiveTaskType = taskType || task;
            const effectiveBookTitle = title || bookTitle || 'Audiobook';
            const rawBookKey = bookKey || (chapterKey ? `book_for_${chapterKey}` : '');
            if (!rawBookKey || !chapterKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey or chapterKey' }, { status: 400 });
            }

            let book = getAudiobookMeta(rawBookKey, effectiveBookTitle, author);
            if (!book) {
                book = upsertAudiobookMeta({
                    book_key: rawBookKey,
                    title: effectiveBookTitle,
                    author: author || 'Unknown Author',
                    thumb: thumb || posterUrl || undefined,
                    total_chapters: 1
                });
            }
            const resolvedBookKey = book.book_key;

            let decodedPath = filePath || chapterPath || rawTrackPath || '';
            if (!decodedPath && typeof chapterKey === 'string' && chapterKey.startsWith('local_track_')) {
                try {
                    decodedPath = Buffer.from(chapterKey.replace('local_track_', ''), 'base64url').toString('utf8');
                } catch {}
            }

            let chapter = getAudiobookChapterMeta(chapterKey, resolvedBookKey, Number(chapterIndex || 0));
            if (!chapter) {
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
            } else if (decodedPath && !chapter.file_path) {
                chapter = upsertAudiobookChapterMeta({
                    chapter_key: chapter.chapter_key,
                    book_key: resolvedBookKey,
                    file_path: decodedPath
                });
            }
            const resolvedChapterKey = chapter.chapter_key;

            // Enforce Stage prerequisites before starting Stage 2 or Stage 3 manually
            if (effectiveTaskType === 'detect_scenes' || effectiveTaskType === 'illustrate') {
                const hasTranscript = Boolean(chapter.synced_lyrics && chapter.synced_lyrics.trim().length > 20 && (chapter.transcription_status === 'completed' || (chapter.transcribed_seconds || 0) >= 180));
                if (!hasTranscript && !body.autoTranscribeFirst) {
                    return NextResponse.json({
                        success: false,
                        error: 'Step 1 Required: Transcribe chapter audio into timestamped text first before LLM scene detection.',
                        book: getAudiobookMeta(resolvedBookKey),
                        chapter,
                        chapters: getAudiobookChaptersMeta(resolvedBookKey),
                        books: getAllAudiobooksMeta(),
                        status: getAudiobookStudioStatus()
                    }, { status: 400 });
                }
            }
            if (effectiveTaskType === 'paint_scenes') {
                const hasScenes = Array.isArray(chapter.images) && chapter.images.length > 0;
                if (!hasScenes) {
                    return NextResponse.json({
                        success: false,
                        error: 'Step 2 Required: Detect scene transitions from the timestamped transcript first before painting scene images.',
                        book: getAudiobookMeta(resolvedBookKey),
                        chapter,
                        chapters: getAudiobookChaptersMeta(resolvedBookKey),
                        books: getAllAudiobooksMeta(),
                        status: getAudiobookStudioStatus()
                    }, { status: 400 });
                }
            }

            const config = getAudiobookStudioConfig();
            const runInBackground = Boolean(body.runInBackground);
            const allChapters = Boolean(body.allChapters);

            const executeSingleChapter = async (targetChKey: string) => {
                const targetCh = getAudiobookChapterMeta(targetChKey, resolvedBookKey);
                if (!targetCh) return;
                const freshBook = getAudiobookMeta(resolvedBookKey) || book!;
                if (effectiveTaskType === 'transcribe') {
                    if (body.forceRestart) {
                        upsertAudiobookChapterMeta({
                            chapter_key: targetCh.chapter_key,
                            book_key: resolvedBookKey,
                            synced_lyrics: '',
                            plain_transcript: '',
                            transcribed_seconds: 0,
                            transcription_status: 'processing',
                            transcription_progress: 2,
                            error_message: ''
                        });
                    }
                    const freshCh = getAudiobookChapterMeta(targetCh.chapter_key, resolvedBookKey) || targetCh;
                    await transcribeAudiobookChapter(freshBook, freshCh, config);
                } else if (effectiveTaskType === 'detect_scenes') {
                    const freshChapter = getAudiobookChapterMeta(targetCh.chapter_key, resolvedBookKey) || targetCh;
                    await detectAudiobookChapterScenesWithLlm(freshBook, freshChapter, config, {
                        autoTranscribeFirst: Boolean(body.autoTranscribeFirst),
                        forceRedetect: Boolean(body.forceRestart)
                    });
                } else if (effectiveTaskType === 'paint_scenes') {
                    const freshChapter = getAudiobookChapterMeta(targetCh.chapter_key, resolvedBookKey) || targetCh;
                    await paintAudiobookChapterScenes(freshBook, freshChapter, config, true);
                } else if (effectiveTaskType === 'illustrate') {
                    const freshChapter = getAudiobookChapterMeta(targetCh.chapter_key, resolvedBookKey) || targetCh;
                    await generateAudiobookChapterIllustrations(freshBook, freshChapter, config, true);
                } else if (effectiveTaskType === 'enhance') {
                    const freshChapter = getAudiobookChapterMeta(targetCh.chapter_key, resolvedBookKey) || targetCh;
                    await enhanceAudiobookChapterAudio(freshBook, freshChapter, config, body.voicePreset);
                } else {
                    triggerAudiobookQueueWorker(resolvedBookKey, targetCh.chapter_key);
                }
                recalculateAudiobookTotals(resolvedBookKey);
            };

            const executeTask = async () => {
                const gAny = globalThis as any;
                gAny.__audiobookStudioLock = true;
                try {
                    if (allChapters) {
                        const bookChapters = getAudiobookChaptersMeta(resolvedBookKey).sort(
                            (a, b) => (a.chapter_index || 0) - (b.chapter_index || 0)
                        );
                        for (const chItem of bookChapters) {
                            await executeSingleChapter(chItem.chapter_key);
                        }
                    } else {
                        await executeSingleChapter(resolvedChapterKey);
                    }
                } finally {
                    gAny.__audiobookStudioLock = false;
                }
            };

            if (runInBackground) {
                if (effectiveTaskType === 'transcribe') {
                    upsertAudiobookChapterMeta({
                        chapter_key: resolvedChapterKey,
                        book_key: resolvedBookKey,
                        transcription_status: 'processing',
                        transcription_progress: Math.max(2, chapter.transcription_progress || 2),
                        error_message: ''
                    });
                } else if (effectiveTaskType === 'detect_scenes' || effectiveTaskType === 'paint_scenes' || effectiveTaskType === 'illustrate') {
                    upsertAudiobookChapterMeta({
                        chapter_key: resolvedChapterKey,
                        book_key: resolvedBookKey,
                        illustration_status: 'processing',
                        illustration_progress: Math.max(5, chapter.illustration_progress || 5),
                        error_message: ''
                    });
                } else if (effectiveTaskType === 'enhance') {
                    upsertAudiobookChapterMeta({
                        chapter_key: resolvedChapterKey,
                        book_key: resolvedBookKey,
                        audio_enhance_status: 'processing',
                        audio_enhance_progress: 15,
                        error_message: ''
                    });
                }
                void executeTask().catch(err => {
                    console.error(`❌ [AudiobookStudio] Background chapter task (${effectiveTaskType}) error:`, err);
                });
                return NextResponse.json({
                    success: true,
                    background: true,
                    book: getAudiobookMeta(resolvedBookKey),
                    chapter: getAudiobookChapterMeta(resolvedChapterKey, resolvedBookKey),
                    chapters: getAudiobookChaptersMeta(resolvedBookKey),
                    books: getAllAudiobooksMeta(),
                    status: getAudiobookStudioStatus()
                });
            }

            await executeTask();
            const finalChapter = getAudiobookChapterMeta(resolvedChapterKey, resolvedBookKey);

            if (effectiveTaskType === 'transcribe' && (!finalChapter?.synced_lyrics || finalChapter.transcription_status === 'failed')) {
                return NextResponse.json({
                    success: false,
                    error: finalChapter?.error_message || 'Speech-to-Text failed to transcribe audio.',
                    book: getAudiobookMeta(resolvedBookKey),
                    chapter: finalChapter,
                    chapters: getAudiobookChaptersMeta(resolvedBookKey),
                    books: getAllAudiobooksMeta(),
                    status: getAudiobookStudioStatus()
                });
            }
            if ((effectiveTaskType === 'detect_scenes' || effectiveTaskType === 'paint_scenes' || effectiveTaskType === 'illustrate') && (finalChapter?.illustration_status === 'failed' || !(finalChapter?.images?.length))) {
                return NextResponse.json({
                    success: false,
                    error: finalChapter?.error_message || 'Scene processing failed.',
                    book: getAudiobookMeta(resolvedBookKey),
                    chapter: finalChapter,
                    chapters: getAudiobookChaptersMeta(resolvedBookKey),
                    books: getAllAudiobooksMeta(),
                    status: getAudiobookStudioStatus()
                });
            }
            if (effectiveTaskType === 'enhance' && (finalChapter?.audio_enhance_status === 'failed' || !finalChapter?.enhanced_audio_path)) {
                return NextResponse.json({
                    success: false,
                    error: finalChapter?.error_message || 'Voice enhancement failed.',
                    book: getAudiobookMeta(resolvedBookKey),
                    chapter: finalChapter,
                    chapters: getAudiobookChaptersMeta(resolvedBookKey),
                    books: getAllAudiobooksMeta(),
                    status: getAudiobookStudioStatus()
                });
            }

            return NextResponse.json({
                success: true,
                book: getAudiobookMeta(resolvedBookKey),
                chapter: finalChapter,
                chapters: getAudiobookChaptersMeta(resolvedBookKey),
                books: getAllAudiobooksMeta(),
                status: getAudiobookStudioStatus()
            });
        }

        if (action === 'curate_images') {
            const { chapterKey, toggleImageId, deleteImageId, imageId, subAction, images } = body;
            const chapter = getAudiobookChapterMeta(chapterKey);
            if (!chapter) {
                return NextResponse.json({ success: false, error: 'Chapter not found' }, { status: 404 });
            }

            const effectiveToggleId = toggleImageId || (subAction === 'keep' ? imageId : undefined);
            const effectiveDeleteId = deleteImageId || (subAction === 'delete' ? imageId : undefined);

            let updatedImages = [...(chapter.images || [])];
            if (Array.isArray(images)) {
                updatedImages = images;
            } else if (effectiveToggleId) {
                updatedImages = updatedImages.map(img =>
                    img.id === effectiveToggleId ? { ...img, kept: img.kept === false ? true : false } : img
                );
            } else if (effectiveDeleteId) {
                const target = updatedImages.find(i => i.id === effectiveDeleteId);
                if (target && target.url.includes('file=')) {
                    const fName = decodeURIComponent(target.url.split('file=')[1] || '');
                    const fullPath = path.join(getAudiobookArtDir(), path.basename(fName));
                    try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
                }
                updatedImages = updatedImages.filter(img => img.id !== effectiveDeleteId);
            }

            const savedChapter = upsertAudiobookChapterMeta({
                chapter_key: chapter.chapter_key,
                book_key: chapter.book_key,
                images: updatedImages,
                illustration_status: updatedImages.some(i => i.kept !== false) ? 'completed' : 'idle'
            });
            recalculateAudiobookTotals(chapter.book_key);

            return NextResponse.json({
                success: true,
                chapter: savedChapter,
                chapters: getAudiobookChaptersMeta(chapter.book_key),
                book: getAudiobookMeta(chapter.book_key)
            });
        }

        if (action === 'update_chapter_transcript') {
            const { chapterKey, bookKey, chapterTitle, chapterIndex, filePath, durationSec, syncedLyrics, plainTranscript } = body;
            if (!chapterKey) {
                return NextResponse.json({ success: false, error: 'Missing chapterKey' }, { status: 400 });
            }
            const resolvedBookKey = bookKey || `book_for_${chapterKey}`;
            let chapter = getAudiobookChapterMeta(chapterKey);
            if (!chapter) {
                chapter = upsertAudiobookChapterMeta({
                    chapter_key: chapterKey,
                    book_key: resolvedBookKey,
                    chapter_index: Number(chapterIndex || 1),
                    title: chapterTitle || 'Chapter 1',
                    file_path: filePath || undefined,
                    duration_sec: Number(durationSec || 300)
                });
            }
            const cleanLrc = String(syncedLyrics ?? '').trim();
            const cleanPlain = String(plainTranscript ?? cleanLrc.replace(/\[\d+:\d+(?:\.\d+)?\]\s*/g, '')).trim();
            const safeChapterId = chapter.chapter_key.replace(/[^a-zA-Z0-9_-]/g, '_');
            const lrcPath = path.join(getAudiobookTranscriptsDir(), `${safeChapterId}.lrc`);
            const txtPath = path.join(getAudiobookTranscriptsDir(), `${safeChapterId}.txt`);
            try {
                if (cleanLrc) {
                    fs.writeFileSync(lrcPath, cleanLrc, 'utf8');
                    fs.writeFileSync(txtPath, cleanPlain, 'utf8');
                }
            } catch {}

            const savedChapter = upsertAudiobookChapterMeta({
                chapter_key: chapter.chapter_key,
                book_key: bookKey || chapter.book_key,
                synced_lyrics: cleanLrc,
                plain_transcript: cleanPlain,
                transcript_lrc_path: cleanLrc ? lrcPath : '',
                transcript_txt_path: cleanLrc ? txtPath : '',
                transcription_status: cleanLrc ? 'completed' : 'idle',
                transcription_progress: cleanLrc ? 100 : 0,
                error_message: ''
            });
            recalculateAudiobookTotals(savedChapter.book_key);
            return NextResponse.json({
                success: true,
                chapter: savedChapter,
                chapters: getAudiobookChaptersMeta(savedChapter.book_key),
                book: getAudiobookMeta(savedChapter.book_key)
            });
        }

        if (action === 'regenerate_single_scene') {
            const { bookKey, bookTitle, author, chapterKey, chapterTitle, chapterIndex, filePath, durationSec, imageId, sceneIndex, customPrompt, sceneTitle, startSec, endSec, artType } = body;
            if (!bookKey || !chapterKey) {
                return NextResponse.json({ success: false, error: 'Missing bookKey or chapterKey' }, { status: 400 });
            }
            if (!getAudiobookMeta(bookKey)) {
                upsertAudiobookMeta({
                    book_key: bookKey,
                    title: bookTitle || 'Audiobook',
                    author: author || 'Unknown Author',
                    total_chapters: 1
                });
            }
            if (!getAudiobookChapterMeta(chapterKey)) {
                upsertAudiobookChapterMeta({
                    chapter_key: chapterKey,
                    book_key: bookKey,
                    chapter_index: Number(chapterIndex || 1),
                    title: chapterTitle || 'Chapter 1',
                    file_path: filePath || undefined,
                    duration_sec: Number(durationSec || 300)
                });
            }
            const updatedChapter = await regenerateSingleAudiobookSceneImage({
                bookKey,
                chapterKey,
                imageId,
                sceneIndex: sceneIndex !== undefined ? Number(sceneIndex) : undefined,
                customPrompt,
                sceneTitle,
                startSec: startSec !== undefined ? Number(startSec) : undefined,
                endSec: endSec !== undefined ? Number(endSec) : undefined,
                artType
            });
            recalculateAudiobookTotals(bookKey);
            return NextResponse.json({
                success: true,
                chapter: updatedChapter,
                chapters: getAudiobookChaptersMeta(bookKey),
                book: getAudiobookMeta(bookKey),
                status: getAudiobookStudioStatus()
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
            const src = (body.collection && typeof body.collection === 'object') ? body.collection : body;
            const { id, name, author, description, bookKeys } = src;
            const bookMetadataPatch = src.bookMetadataPatch || body.bookMetadataPatch;
            if (!name || !Array.isArray(bookKeys) || bookKeys.length === 0) {
                return NextResponse.json({ success: false, error: 'Collection name and at least 1 book are required' }, { status: 400 });
            }
            const cur = getAudiobookCollectionsState();
            const colId = id || `col_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const existingIdx = cur.collections.findIndex(c => c.id === colId);
            const existingCol = existingIdx >= 0 ? cur.collections[existingIdx] : undefined;
            const removedKeys = existingCol ? existingCol.bookKeys.filter(k => !bookKeys.includes(k)) : [];

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
            for (const rk of removedKeys) {
                if (nextMeta[rk] && nextMeta[rk].collectionId === colId) {
                    nextMeta[rk] = {
                        ...nextMeta[rk],
                        collectionId: undefined,
                        collectionName: undefined
                    };
                }
            }
            bookKeys.forEach((k: string, idx: number) => {
                nextMeta[k] = {
                    ...(nextMeta[k] || { bookKey: k }),
                    bookKey: k,
                    collectionId: colId,
                    collectionName: String(name).trim(),
                    bookNumber: bookMetadataPatch?.[k]?.bookNumber ?? (idx + 1)
                };
            });

            const nextUngrouped = Array.from(new Set([
                ...cur.ungroupedBookKeys.filter(uk => !bookKeys.includes(uk)),
                ...removedKeys
            ]));

            const saved = saveAudiobookCollectionsState({
                collections: cleanedCollections,
                explodedCollectionIds: cur.explodedCollectionIds.filter(eid => eid !== colId),
                ungroupedBookKeys: nextUngrouped,
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

        if (action === 'preview_rename_books' || action === 'preview_rename') {
            const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.books) ? body.books : []);
            const template = String(body.template || '{Author} - {Title} ({Year}) [{AudioVersion}]');
            const versionMode = body.versionMode || 'auto';
            const previews = previewRenameAudiobookFiles(items, template, versionMode);
            return NextResponse.json({
                success: true,
                previews
            });
        }

        if (action === 'execute_rename_books' || action === 'execute_rename') {
            const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.books) ? body.books : []);
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

        if (action === 'set_ai_paused' || action === 'pause_all_ai') {
            const nextPaused = typeof body.paused === 'boolean' ? body.paused : !isAiGloballyPaused();
            const savedConfig = setAiGloballyPaused(nextPaused);
            return NextResponse.json({
                success: true,
                aiPaused: nextPaused,
                config: savedConfig,
                status: getAudiobookStudioStatus(),
                books: getAllAudiobooksMeta()
            });
        }

        if (action === 'clean_generated_data') {
            const target = (body.target || 'all') as 'images' | 'scenes' | 'transcripts' | 'voices' | 'api_history' | 'all';
            const bookKey = body.bookKey ? String(body.bookKey) : undefined;
            const pauseAiFirst = Boolean(body.pauseAiFirst);
            const outcome = cleanGeneratedAudiobookData({ target, bookKey, pauseAiFirst });
            return NextResponse.json({
                success: true,
                ...outcome,
                config: getAudiobookStudioConfig(),
                status: getAudiobookStudioStatus(),
                books: getAllAudiobooksMeta(),
                book: bookKey ? getAudiobookMeta(bookKey) : undefined,
                chapters: bookKey ? getAudiobookChaptersMeta(bookKey) : undefined
            });
        }

        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    } catch (e: any) {
        console.error('Error in POST /api/theater/audiobooks/studio:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

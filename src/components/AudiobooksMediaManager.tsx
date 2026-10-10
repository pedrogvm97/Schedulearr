'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BookOpen, Sparkles, Sliders, FolderPlus, Edit3, Trash2, Check,
    RefreshCw, Play, Zap, ArrowUp, ArrowDown, ListPlus, FileText,
    Image as ImageIcon, Mic2, Search, User, Bookmark, Layers, Wrench, X
} from 'lucide-react';
import { toast } from 'sonner';

function canonicalizeAuthorClient(rawAuthor?: string | null): {
    canonicalAuthor: string;
    translator: string | null;
    narrator: string | null;
} {
    const raw = (rawAuthor || '').trim();
    if (!raw || raw.toLowerCase() === 'unknown' || raw.toLowerCase() === 'unknown author') {
        return { canonicalAuthor: 'Unknown Author', translator: null, narrator: null };
    }
    let translator: string | null = null;
    let narrator: string | null = null;
    let working = raw;

    working = working.replace(/\(([^)]+)\)|\[([^\]]+)\]/g, (_full, p1, p2) => {
        const inside = (p1 || p2 || '').trim();
        const transMatch = inside.match(/^(?:trans\.?|translated\s+by|tr\.?|translator:?)\s+(.+)$/i);
        if (transMatch) {
            translator = transMatch[1].trim();
            return '';
        }
        const narrMatch = inside.match(/^(?:read\s+by|narrated\s+by|narr\.?|narrator:?)\s+(.+)$/i);
        if (narrMatch) {
            narrator = narrMatch[1].trim();
            return '';
        }
        return '';
    });

    working = working.replace(/\b(?:translated\s+by|trans\.?)\s+([A-Z][A-Za-z.\s'-]+?)(?=$|[,;|/]|read\s+by|narrated\s+by)/i, (_m, t) => {
        if (!translator) translator = t.trim();
        return '';
    });

    working = working.replace(/\b(?:read\s+by|narrated\s+by)\s+([A-Z][A-Za-z.\s'-]+?)(?=$|[,;|/])/i, (_m, n) => {
        if (!narrator) narrator = n.trim();
        return '';
    });

    const parts = working.split(/\s*(?:;|\/|&|\band\b)\s*/i).map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) working = parts[0];

    if (/^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+,\s*[A-Za-zÀ-ÖØ-öø-ÿ.'-\s]+$/.test(working)) {
        const [last, first] = working.split(',').map(s => s.trim());
        if (first && last) working = `${first} ${last}`;
    }

    working = working.replace(/\s+/g, ' ').replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '').trim();
    return {
        canonicalAuthor: working || raw,
        translator,
        narrator
    };
}

function formatSec(sec: number): string {
    if (!sec || sec <= 0) return '0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function AudiobooksMediaManager() {
    const [activeSubTab, setActiveSubTab] = useState<'books' | 'collections' | 'renamer' | 'queue_settings'>('books');
    const [loading, setLoading] = useState(true);
    const [rescanning, setRescanning] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [audiobookLibraries, setAudiobookLibraries] = useState<any[]>([]);
    const [selectedLibraryFilter, setSelectedLibraryFilter] = useState<string>('all');
    const [rawItems, setRawItems] = useState<any[]>([]);
    const [studioBooksMap, setStudioBooksMap] = useState<Record<string, any>>({});
    const [studioChaptersMap, setStudioChaptersMap] = useState<Record<string, any>>({});
    const [collections, setCollections] = useState<any[]>([]);
    const [studioConfig, setStudioConfig] = useState<any>(null);
    const [workerState, setWorkerState] = useState<any>(null);

    // Book Editor Modal state (Chapters & Scenes Studio + AI Settings + Metadata)
    const [editingBook, setEditingBook] = useState<any | null>(null);
    const [editModalTab, setEditModalTab] = useState<'chapters' | 'studio' | 'metadata'>('chapters');
    const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
    const [scenePromptDrafts, setScenePromptDrafts] = useState<Record<string, string>>({});
    const [repaintingSceneKey, setRepaintingSceneKey] = useState<string | null>(null);
    const [editingTranscriptChapterKey, setEditingTranscriptChapterKey] = useState<string | null>(null);
    const [transcriptDraftText, setTranscriptDraftText] = useState<string>('');
    const [savingTranscript, setSavingTranscript] = useState<boolean>(false);
    const [editTitle, setEditTitle] = useState('');
    const [editAuthor, setEditAuthor] = useState('');
    const [editTranslator, setEditTranslator] = useState('');
    const [editNarrator, setEditNarrator] = useState('');
    const [editGenre, setEditGenre] = useState('');
    const [editYear, setEditYear] = useState('');
    const [savingMetadata, setSavingMetadata] = useState(false);

    // Book Studio AI state inside Edit Modal
    const [editArtStyle, setEditArtStyle] = useState('');
    const [editVoicePreset, setEditVoicePreset] = useState('');
    const [editScenesPerChapter, setEditScenesPerChapter] = useState<number>(0);
    const [editSceneFocus, setEditSceneFocus] = useState('');
    const [editVisualNotes, setEditVisualNotes] = useState('');
    const [runningStudioAction, setRunningStudioAction] = useState<string | null>(null);
    const [runningChapterTaskKey, setRunningChapterTaskKey] = useState<string | null>(null);
    const [didHandleInitialUrlParams, setDidHandleInitialUrlParams] = useState(false);

    // Collection Editor state
    const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
    const [collectionName, setCollectionName] = useState('');
    const [collectionDesc, setCollectionDesc] = useState('');
    const [collectionBookKeys, setCollectionBookKeys] = useState<string[]>([]);
    const [aiGroupingCollections, setAiGroupingCollections] = useState(false);

    // File Renamer state
    const [selectedRenameBookKey, setSelectedRenameBookKey] = useState('');
    const [renamePreview, setRenamePreview] = useState<any[]>([]);
    const [renamingBusy, setRenamingBusy] = useState(false);

    // Config form state
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [savingConfig, setSavingConfig] = useState(false);

    const fetchAll = useCallback(async (forceRefresh = false) => {
        if (forceRefresh) setRescanning(true);
        try {
            const [libsRes, studioRes] = await Promise.all([
                fetch('/api/theater/libraries'),
                fetch('/api/theater/audiobooks/studio')
            ]);

            let discoveredLibs: any[] = [];
            if (libsRes.ok) {
                const libsData = await libsRes.json();
                const allLibs = Array.isArray(libsData?.libraries) ? libsData.libraries : [];
                discoveredLibs = allLibs.filter((l: any) =>
                    l.type === 'audiobooks' ||
                    l.type === 'audiobook' ||
                    /\b(audiobooks?|spoken\s*word)\b/i.test(l.name || '')
                );
                setAudiobookLibraries(discoveredLibs);
            }

            // Fetch items for each discovered audiobook library (exact same flow as Theater tab)
            // plus fallback to ?type=audiobooks aggregation
            const itemPromises: Promise<Response>[] = discoveredLibs.map((lib: any) =>
                fetch(`/api/theater/items?libraryId=${encodeURIComponent(lib.id)}${forceRefresh ? '&refresh=true' : ''}`)
            );
            if (itemPromises.length === 0) {
                itemPromises.push(fetch(`/api/theater/items?type=audiobooks${forceRefresh ? '&refresh=true' : ''}`));
            }

            const itemResponses = await Promise.all(itemPromises);
            const mergedItems: any[] = [];
            const seenItemIds = new Set<string>();

            for (let i = 0; i < itemResponses.length; i++) {
                const res = itemResponses[i];
                const sourceLib = discoveredLibs[i];
                if (!res.ok) continue;
                const data = await res.json();
                if (Array.isArray(data?.libraries) && discoveredLibs.length === 0 && data.libraries.length > 0) {
                    setAudiobookLibraries(data.libraries);
                }
                const list = Array.isArray(data?.items) ? data.items : [];
                for (const item of list) {
                    const uniqueKey = item.id || `${item.path || ''}::${item.title || ''}`;
                    if (seenItemIds.has(uniqueKey)) continue;
                    seenItemIds.add(uniqueKey);
                    mergedItems.push({
                        ...item,
                        libraryId: item.libraryId || sourceLib?.id,
                        libraryName: item.libraryName || sourceLib?.name || 'Audiobooks',
                        libraryType: item.libraryType || sourceLib?.type || 'audiobooks',
                        isAudiobook: true,
                    });
                }
            }

            setRawItems(mergedItems);

            if (studioRes.ok) {
                const sData = await studioRes.json();
                const bMap: Record<string, any> = {};
                (sData.books || []).forEach((b: any) => {
                    if (b?.book_key) bMap[b.book_key] = b;
                });
                const cMap: Record<string, any> = {};
                (sData.chapters || []).forEach((c: any) => {
                    if (c?.chapter_key) cMap[c.chapter_key] = c;
                });
                setStudioBooksMap(bMap);
                setStudioChaptersMap(cMap);
                setCollections(sData.collectionsState?.collections || sData.collections || []);
                setStudioConfig(sData.config || {});
                setWorkerState(sData.status || sData.worker || {});
                if (sData.config?.rawUnifiedApiKey && !apiKeyInput) {
                    setApiKeyInput(sData.config.rawUnifiedApiKey);
                }
            }
        } catch (err) {
            console.error('Failed to load audiobooks studio data:', err);
        } finally {
            setLoading(false);
            if (forceRefresh) setRescanning(false);
        }
    }, [apiKeyInput]);

    useEffect(() => {
        fetchAll(false);
        const timer = setInterval(() => fetchAll(false), 8000);
        const onLibrariesUpdated = () => fetchAll(true);
        window.addEventListener('theater-libraries-updated', onLibrariesUpdated);
        return () => {
            clearInterval(timer);
            window.removeEventListener('theater-libraries-updated', onLibrariesUpdated);
        };
    }, [fetchAll]);

    const groupedBooks = useMemo(() => {
        const map = new Map<string, any>();
        for (const item of rawItems) {
            if (selectedLibraryFilter !== 'all' && item.libraryId && item.libraryId !== selectedLibraryFilter) {
                continue;
            }
            const bookTitle = (item.bookTitle || item.album || item.title || 'Untitled Audiobook').trim();
            const parsed = canonicalizeAuthorClient(item.canonicalAuthor || item.author || item.artist);
            const key = `${parsed.canonicalAuthor}:::${bookTitle}`.toLowerCase();
            const bKey = `${parsed.canonicalAuthor} - ${bookTitle}`.toLowerCase().trim();
            if (!map.has(key)) {
                map.set(key, {
                    id: `ab-${key}`,
                    bookKey: bKey,
                    title: bookTitle,
                    author: parsed.canonicalAuthor,
                    translator: item.translator || parsed.translator || null,
                    narrator: item.narrator || parsed.narrator || null,
                    posterUrl: item.posterUrl || null,
                    libraryId: item.libraryId || null,
                    libraryName: item.libraryName || 'Audiobooks',
                    chapters: [],
                    totalDurationMs: 0,
                    sizeBytes: 0
                });
            }
            const entry = map.get(key)!;
            entry.chapters.push(item);
            entry.totalDurationMs += item.durationMs || 0;
            entry.sizeBytes += item.sizeBytes || 0;
            if (!entry.posterUrl && item.posterUrl) entry.posterUrl = item.posterUrl;
        }

        // Also include any books saved in SQLite studioBooksMap that weren't in rawItems
        if (selectedLibraryFilter === 'all') {
            for (const meta of Object.values(studioBooksMap)) {
                if (!meta?.title) continue;
                const parsed = canonicalizeAuthorClient(meta.canonical_author || meta.author);
                const key = `${parsed.canonicalAuthor}:::${meta.title.trim()}`.toLowerCase();
                const alreadyMatched = Array.from(map.values()).some(
                    b => b.bookKey === meta.book_key || b.title.toLowerCase() === String(meta.title).trim().toLowerCase()
                );
                if (!alreadyMatched && !map.has(key)) {
                    map.set(key, {
                        id: `ab-${key}`,
                        bookKey: meta.book_key,
                        title: String(meta.title).trim(),
                        author: parsed.canonicalAuthor,
                        translator: meta.translator || parsed.translator || null,
                        narrator: meta.narrator || parsed.narrator || null,
                        posterUrl: meta.cover_url || null,
                        libraryId: null,
                        libraryName: 'Audiobook Studio',
                        chapters: [],
                        totalDurationMs: Number(meta.total_duration_sec || 0) * 1000,
                        sizeBytes: 0
                    });
                }
            }
        }

        const list = Array.from(map.values()).map(book => {
            const meta = studioBooksMap[book.bookKey] ||
                Object.values(studioBooksMap).find((m: any) => (m.title || '').toLowerCase() === book.title.toLowerCase());
            const effectiveBookKey = meta?.book_key || book.bookKey;

            // Merge chapters from rawItems and SQLite studioChaptersMap so chapters are never empty
            const dbChaps = Object.values(studioChaptersMap)
                .filter((c: any) => c.book_key === effectiveBookKey)
                .sort((a: any, b: any) => (a.chapter_index || 0) - (b.chapter_index || 0));

            let effectiveChapters = [...book.chapters];
            if (effectiveChapters.length === 0 && dbChaps.length > 0) {
                effectiveChapters = dbChaps.map((c: any, idx: number) => ({
                    id: c.chapter_key,
                    chapterKey: c.chapter_key,
                    title: c.title || `Chapter ${idx + 1}`,
                    path: c.file_path || '',
                    durationMs: Number(c.duration_sec || 300) * 1000
                }));
            }

            const totalCh = Math.max(1, meta?.total_chapters || effectiveChapters.length || dbChaps.length || 1);
            const transCh = meta?.transcribed_chapters || dbChaps.filter((c: any) => c.transcription_status === 'completed' && c.synced_lyrics).length || 0;
            const illCh = meta?.illustrated_chapters || dbChaps.filter((c: any) => (c.images || []).some((i: any) => i.kept !== false)).length || 0;
            const enhCh = meta?.enhanced_chapters || dbChaps.filter((c: any) => c.audio_enhance_status === 'completed').length || 0;
            const transPct = Math.min(100, Math.round((transCh / totalCh) * 100));
            const illPct = Math.min(100, Math.round((illCh / totalCh) * 100));
            const totalPct = Math.min(100, Math.round((transPct + illPct) / 2));

            return {
                ...book,
                chapters: effectiveChapters,
                bookKey: effectiveBookKey,
                title: meta?.title || book.title,
                author: meta?.canonical_author || canonicalizeAuthorClient(meta?.author || book.author).canonicalAuthor,
                translator: meta?.translator || book.translator || null,
                narrator: meta?.narrator || book.narrator || null,
                genre: meta?.genre || null,
                publishedYear: meta?.published_year || null,
                meta,
                totalCh,
                transCh,
                illCh,
                enhCh,
                transPct,
                illPct,
                totalPct,
                transcribedSec: Number(meta?.transcribed_seconds || 0),
                totalDurSec: Number(meta?.total_duration_sec || (book.totalDurationMs ? Math.round(book.totalDurationMs / 1000) : 0)),
                illustratedScenes: Number(meta?.illustrated_scenes || dbChaps.reduce((acc: number, c: any) => acc + ((c.images || []).filter((i: any) => i.kept !== false).length), 0)),
                isQueued: Boolean(meta?.queue_enabled || meta?.is_queued === 1),
                queueOrder: Number(meta?.queue_priority || meta?.queue_order || 0)
            };
        });

        const q = searchQuery.trim().toLowerCase();
        if (!q) return list.sort((a, b) => a.title.localeCompare(b.title));
        return list
            .filter(b =>
                b.title.toLowerCase().includes(q) ||
                b.author.toLowerCase().includes(q) ||
                (b.translator && b.translator.toLowerCase().includes(q)) ||
                (b.narrator && b.narrator.toLowerCase().includes(q)) ||
                (b.genre && b.genre.toLowerCase().includes(q))
            )
            .sort((a, b) => a.title.localeCompare(b.title));
    }, [rawItems, studioBooksMap, studioChaptersMap, searchQuery, selectedLibraryFilter]);

    const resolveChapterMeta = useCallback((bookKey: string, chTrack: any, idx: number) => {
        if (!chTrack) return {};
        const candidates = [
            chTrack.chapterKey,
            chTrack.id,
            `${bookKey}::ch${idx + 1}`,
            `${bookKey}::ch-${idx + 1}`
        ].filter(Boolean);
        for (const k of candidates) {
            if (studioChaptersMap[k]) return studioChaptersMap[k];
        }
        const byBookAndIndex = Object.values(studioChaptersMap).find((c: any) =>
            c.book_key === bookKey && (
                Number(c.chapter_index) === idx + 1 ||
                (chTrack.path && c.file_path && c.file_path === chTrack.path)
            )
        );
        return byBookAndIndex || {};
    }, [studioChaptersMap]);

    const openEditMetadataModal = useCallback((book: any, defaultTab: 'chapters' | 'studio' | 'metadata' = 'chapters') => {
        const meta = studioBooksMap[book.bookKey] || book.meta || {};
        setEditingBook(book);
        setEditModalTab(defaultTab);
        setSelectedChapterIdx(0);
        setEditingTranscriptChapterKey(null);
        setEditTitle(book.title || '');
        setEditAuthor(book.author || '');
        setEditTranslator(book.translator || '');
        setEditNarrator(book.narrator || '');
        setEditGenre(book.genre || '');
        setEditYear(book.publishedYear ? String(book.publishedYear) : '');
        setEditArtStyle(meta.art_style || '');
        setEditVoicePreset(meta.voice_preset || '');
        setEditScenesPerChapter(Number(meta.images_per_chapter || 0));
        setEditSceneFocus(meta.scene_focus || '');
        setEditVisualNotes(meta.visual_notes || '');
    }, [studioBooksMap]);

    // Deep-link support from Theater / Expanded Player (?bookKey=... or ?subTab=...)
    useEffect(() => {
        if (typeof window === 'undefined' || didHandleInitialUrlParams) return;
        const params = new URLSearchParams(window.location.search);
        const subTabParam = params.get('subTab');
        if (subTabParam === 'collections' || subTabParam === 'renamer' || subTabParam === 'queue_settings' || subTabParam === 'books') {
            setActiveSubTab(subTabParam);
        }
        const bookKeyParam = params.get('bookKey');
        if (!bookKeyParam) {
            setDidHandleInitialUrlParams(true);
            return;
        }
        if (groupedBooks.length > 0) {
            const normParam = bookKeyParam.toLowerCase().trim();
            const target = groupedBooks.find(
                b => b.bookKey.toLowerCase() === normParam ||
                     b.title.toLowerCase() === normParam ||
                     b.bookKey.toLowerCase().includes(normParam) ||
                     (b.title.length > 2 && normParam.includes(b.title.toLowerCase()))
            );
            if (target) {
                openEditMetadataModal(target, 'chapters');
            }
            setDidHandleInitialUrlParams(true);
        }
    }, [groupedBooks, didHandleInitialUrlParams, openEditMetadataModal]);

    const handleSyncAndQueueBook = async (book: any, prioritize = false) => {
        try {
            await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'sync_book',
                    bookKey: book.bookKey,
                    title: book.title,
                    author: book.author,
                    coverUrl: book.posterUrl,
                    chapters: book.chapters.map((t: any, idx: number) => ({
                        id: t.id,
                        chapterKey: t.chapterKey || t.id || `${book.bookKey}::ch${idx + 1}`,
                        title: t.title || t.name || `Chapter ${idx + 1}`,
                        path: t.path || '',
                        durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : 300
                    }))
                })
            });

            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'queue_whole_book',
                    bookKey: book.bookKey,
                    title: book.title,
                    author: book.author,
                    prioritize
                })
            });
            if (res.ok) {
                toast.success(`Queued "${book.title}" for Speech-to-Text & Scene Art`);
                fetchAll();
            }
        } catch {
            toast.error('Failed to queue audiobook');
        }
    };

    const handleSaveBookMetadata = async () => {
        if (!editingBook) return;
        setSavingMetadata(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'edit_book_metadata',
                    bookKey: editingBook.bookKey,
                    title: editTitle.trim(),
                    author: editAuthor.trim(),
                    canonicalAuthor: editAuthor.trim(),
                    translator: editTranslator.trim() || null,
                    narrator: editNarrator.trim() || null,
                    genre: editGenre.trim() || null,
                    publishedYear: editYear ? Number(editYear) : null
                })
            });
            if (res.ok) {
                toast.success(`Saved metadata for "${editTitle}"`);
                fetchAll();
            } else {
                toast.error('Failed to save metadata');
            }
        } catch {
            toast.error('Error saving metadata');
        } finally {
            setSavingMetadata(false);
        }
    };

    const handleSaveBookStudioSettings = async () => {
        if (!editingBook) return;
        setRunningStudioAction('save_settings');
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_book_settings',
                    bookKey: editingBook.bookKey,
                    title: editingBook.title,
                    author: editingBook.author,
                    artStyle: editArtStyle,
                    voicePreset: editVoicePreset,
                    imagesPerChapter: editScenesPerChapter,
                    artFocus: editSceneFocus,
                    customPrompt: editVisualNotes
                })
            });
            if (res.ok) {
                toast.success(`Saved Studio settings for "${editingBook.title}"`);
                fetchAll();
            } else {
                toast.error('Failed to save Studio settings');
            }
        } catch {
            toast.error('Error saving Studio settings');
        } finally {
            setRunningStudioAction(null);
        }
    };

    const handleToggleCustomBookCover = async (forceRepaint = false) => {
        if (!editingBook) return;
        const meta = studioBooksMap[editingBook.bookKey] || editingBook.meta || {};
        setRunningStudioAction('cover');
        try {
            if (meta.custom_cover_url && !forceRepaint) {
                const nextUse = !meta.use_custom_cover;
                await fetch('/api/theater/audiobooks/studio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'toggle_custom_cover',
                        bookKey: editingBook.bookKey,
                        useCustomCover: nextUse
                    })
                });
                toast.success(nextUse ? 'Switched to AI Book Cover' : 'Restored Original Cover');
            } else {
                await fetch('/api/theater/audiobooks/studio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generate_book_cover',
                        bookKey: editingBook.bookKey,
                        title: editingBook.title,
                        author: editingBook.author,
                        activateImmediately: true
                    })
                });
                toast.success('Painted Custom AI Book Cover');
            }
            fetchAll();
        } catch {
            toast.error('Failed to update book cover');
        } finally {
            setRunningStudioAction(null);
        }
    };

    const handleResetAndRedoBook = async (scope: 'transcripts' | 'illustrations' | 'all', chapterKey?: string) => {
        if (!editingBook) return;
        setRunningStudioAction(`reset_${scope}`);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reset_and_redo',
                    bookKey: editingBook.bookKey,
                    chapterKey,
                    scope
                })
            });
            if (res.ok) {
                toast.success(`Reset ${scope} and queued fresh generation`);
                fetchAll();
            } else {
                toast.error('Failed to reset assets');
            }
        } catch {
            toast.error('Error resetting assets');
        } finally {
            setRunningStudioAction(null);
        }
    };

    const handleRunChapterTaskInEditor = async (chTrack: any, idx: number, task: 'transcribe' | 'illustrate' | 'enhance' | 'all') => {
        if (!editingBook) return;
        const chMeta = resolveChapterMeta(editingBook.bookKey, chTrack, idx);
        const chapterKey = chMeta.chapter_key || chTrack.chapterKey || chTrack.id || `${editingBook.bookKey}::ch${idx + 1}`;
        const taskKey = `${chapterKey}::${task}`;
        setRunningChapterTaskKey(taskKey);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'run_chapter_task',
                    bookKey: editingBook.bookKey,
                    bookTitle: editingBook.title,
                    author: editingBook.author,
                    chapterKey,
                    chapterIndex: idx + 1,
                    chapterTitle: chTrack.title || chTrack.name || `Chapter ${idx + 1}`,
                    filePath: chTrack.path || chMeta.file_path || '',
                    durationSec: chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300),
                    taskType: task,
                    artStyle: editArtStyle || undefined,
                    voicePreset: editVoicePreset || undefined,
                    imagesPerChapter: editScenesPerChapter > 0 ? editScenesPerChapter : undefined
                })
            });
            const data = await res.json();
            if (res.ok) {
                if (task === 'transcribe') {
                    if (data.chapter?.transcription_status === 'completed' && data.chapter?.synced_lyrics) {
                        toast.success(`Transcribed Chapter ${idx + 1}`);
                    } else {
                        toast.error(data.chapter?.error_message || `Speech-to-Text failed for Chapter ${idx + 1}`);
                    }
                } else {
                    toast.success(`Completed ${task} for Chapter ${idx + 1}`);
                }
                fetchAll();
            } else {
                toast.error(data.error || `Failed ${task} for Chapter ${idx + 1}`);
            }
        } catch {
            toast.error(`Error running ${task}`);
        } finally {
            setRunningChapterTaskKey(null);
        }
    };

    const handleRepaintSingleScene = async (
        chTrack: any,
        chIdx: number,
        opts: {
            imageId?: string;
            sceneIndex?: number;
            customPrompt?: string;
            sceneTitle?: string;
            startSec?: number;
            endSec?: number;
            artType?: 'chapter_header' | 'scene';
        }
    ) => {
        if (!editingBook) return;
        const chMeta = resolveChapterMeta(editingBook.bookKey, chTrack, chIdx);
        const chapterKey = chMeta.chapter_key || chTrack.chapterKey || chTrack.id || `${editingBook.bookKey}::ch${chIdx + 1}`;
        const busyKey = `${chapterKey}::s${opts.sceneIndex ?? 'new'}`;
        setRepaintingSceneKey(busyKey);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'regenerate_single_scene',
                    bookKey: editingBook.bookKey,
                    bookTitle: editingBook.title,
                    author: editingBook.author,
                    chapterKey,
                    chapterIndex: chIdx + 1,
                    chapterTitle: chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`,
                    filePath: chTrack.path || chMeta.file_path || '',
                    durationSec: chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300),
                    ...opts
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success('Painted scene illustration!');
                fetchAll();
            } else {
                toast.error(data.error || 'Failed to paint scene');
            }
        } catch (err: any) {
            toast.error(`Error painting scene: ${err.message}`);
        } finally {
            setRepaintingSceneKey(null);
        }
    };

    const handleSaveChapterTranscriptInStudio = async (chTrack: any, chIdx: number) => {
        if (!editingBook) return;
        const chMeta = resolveChapterMeta(editingBook.bookKey, chTrack, chIdx);
        const chapterKey = chMeta.chapter_key || chTrack.chapterKey || chTrack.id || `${editingBook.bookKey}::ch${chIdx + 1}`;
        const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);
        setSavingTranscript(true);
        try {
            const rawDraft = transcriptDraftText.trim();
            let formattedLrc = rawDraft;
            if (rawDraft && !/\[\d+:\d+/.test(rawDraft)) {
                const lines = rawDraft.split('\n').map(l => l.trim()).filter(Boolean);
                formattedLrc = lines.map((line, i) => {
                    const sec = Math.floor((i / Math.max(1, lines.length)) * Math.max(60, durSec));
                    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
                    const ss = String(sec % 60).padStart(2, '0');
                    return `[${mm}:${ss}.00] ${line}`;
                }).join('\n');
            }
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_chapter_transcript',
                    bookKey: editingBook.bookKey,
                    chapterKey,
                    chapterIndex: chIdx + 1,
                    chapterTitle: chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`,
                    filePath: chTrack.path || chMeta.file_path || '',
                    durationSec: durSec,
                    syncedLyrics: formattedLrc
                })
            });
            if (res.ok) {
                toast.success(`Saved transcript for Chapter ${chIdx + 1}`);
                setEditingTranscriptChapterKey(null);
                fetchAll();
            } else {
                toast.error('Failed to save transcript');
            }
        } catch {
            toast.error('Error saving transcript');
        } finally {
            setSavingTranscript(false);
        }
    };

    const handleCurateSceneImage = async (chapterKey: string, imageId: string, subAction: 'keep' | 'delete') => {
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'curate_images',
                    chapterKey,
                    imageId,
                    subAction
                })
            });
            if (res.ok) {
                toast.success(subAction === 'delete' ? 'Deleted scene illustration' : 'Updated scene status');
                fetchAll();
            }
        } catch {
            toast.error('Failed to update scene illustration');
        }
    };

    const handleAiAutoGroupCollections = async () => {
        setAiGroupingCollections(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ai_organize_collections',
                    books: groupedBooks.map(b => ({
                        bookKey: b.bookKey,
                        title: b.title,
                        author: b.author,
                        chapterCount: b.totalCh
                    }))
                })
            });
            if (res.ok) {
                const data = await res.json();
                const updatedCols = data.collectionsState?.collections || data.collections || [];
                setCollections(updatedCols);
                toast.success(`Created/updated ${updatedCols.length} collections`);
            }
        } catch {
            toast.error('Failed to auto-group collections');
        } finally {
            setAiGroupingCollections(false);
        }
    };

    const handleSaveCollection = async () => {
        if (!collectionName.trim()) {
            toast.error('Enter a collection name');
            return;
        }
        const res = await fetch('/api/theater/audiobooks/studio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save_collection',
                collection: {
                    id: editingCollectionId || undefined,
                    name: collectionName.trim(),
                    description: collectionDesc.trim(),
                    bookKeys: collectionBookKeys
                }
            })
        });
        if (res.ok) {
            const data = await res.json();
            setCollections(data.collectionsState?.collections || data.collections || []);
            setEditingCollectionId(null);
            setCollectionName('');
            setCollectionDesc('');
            setCollectionBookKeys([]);
            toast.success('Collection saved');
        }
    };

    const handleDeleteCollection = async (id: string) => {
        const res = await fetch('/api/theater/audiobooks/studio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'explode_collection', collectionId: id })
        });
        if (res.ok) {
            const data = await res.json();
            setCollections(data.collectionsState?.collections || data.collections || []);
            toast.success('Collection deleted');
        }
    };

    const handlePreviewRename = async (bookKey: string) => {
        if (!bookKey) return;
        const targetBook = groupedBooks.find(b => b.bookKey === bookKey);
        setRenamingBusy(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'preview_rename_books',
                    books: targetBook ? [{
                        bookKey: targetBook.bookKey,
                        title: targetBook.title,
                        author: targetBook.author,
                        translator: targetBook.translator,
                        narrator: targetBook.narrator,
                        samplePath: targetBook.chapters?.[0]?.path || ''
                    }] : []
                })
            });
            if (res.ok) {
                const data = await res.json();
                setRenamePreview(data.previews || data.renamed || []);
            }
        } finally {
            setRenamingBusy(false);
        }
    };

    const handleExecuteRename = async () => {
        if (!selectedRenameBookKey || renamePreview.length === 0) return;
        setRenamingBusy(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'execute_rename_books',
                    renames: renamePreview.map((r: any) => ({
                        oldPath: r.currentFolder || r.oldPath,
                        newPath: r.proposedFolder || r.newPath
                    }))
                })
            });
            if (res.ok) {
                const data = await res.json();
                const results = data.results || data.renamed || [];
                setRenamePreview(results);
                toast.success(`Renamed ${results.filter((r: any) => r.ok || r.status === 'renamed').length} audiobook folders/files`);
                fetchAll(true);
            }
        } finally {
            setRenamingBusy(false);
        }
    };

    const handleSaveConfig = async (patch: Record<string, any>) => {
        setSavingConfig(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_config',
                    config: {
                        ...(studioConfig || {}),
                        ...patch
                    }
                })
            });
            if (res.ok) {
                const data = await res.json();
                setStudioConfig(data.config);
                toast.success('Audiobook Studio settings saved');
            }
        } finally {
            setSavingConfig(false);
        }
    };

    const queuedBooks = useMemo(() => {
        return groupedBooks
            .filter(b => b.isQueued)
            .sort((a, b) => (b.queueOrder || 0) - (a.queueOrder || 0));
    }, [groupedBooks]);

    return (
        <div className="space-y-6">
            {/* Top Management Navigation Strip */}
            <div className="p-5 rounded-[2rem] bg-zinc-950/90 border border-zinc-800/80 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-xl">
                <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-3 py-1 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                            <BookOpen size={15} /> Audiobook Studio &amp; Library Manager
                        </span>
                        <span className="px-3 py-1 rounded-xl bg-zinc-900 text-zinc-300 border border-zinc-800 text-xs sm:text-sm font-bold flex items-center gap-1.5 shrink-0">
                            {audiobookLibraries.length} {audiobookLibraries.length === 1 ? 'Library' : 'Libraries'} • {groupedBooks.length} {groupedBooks.length === 1 ? 'Book' : 'Books'}
                        </span>
                        {(workerState?.isRunning || workerState?.running) && (
                            <span className="px-3 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs sm:text-sm font-mono font-bold flex items-center gap-1.5 animate-pulse shrink-0">
                                <RefreshCw size={13} className="animate-spin" />
                                {workerState.activeBookTitle || workerState.currentTask || workerState.lastLog || 'Processing queue...'}
                            </span>
                        )}
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-400">
                        Edit canonical authors, translators, narrators, collections, file names, and manage whole-book or per-chapter AI transcriptions &amp; illustrations.
                    </p>
                </div>

                <div className="flex items-center bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800 gap-1.5 overflow-x-auto flex-nowrap max-w-full shrink-0">
                    <button
                        onClick={() => setActiveSubTab('books')}
                        className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                            activeSubTab === 'books' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Edit book metadata, AI studio settings, and chapter transcriptions/illustrations"
                    >
                        <BookOpen size={15} /> Books ({groupedBooks.length})
                    </button>
                    <button
                        onClick={() => setActiveSubTab('collections')}
                        className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                            activeSubTab === 'collections' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Create, edit, or auto-group multi-book collections and series"
                    >
                        <Layers size={15} /> Collections ({collections.length})
                    </button>
                    <button
                        onClick={() => setActiveSubTab('renamer')}
                        className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                            activeSubTab === 'renamer' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Preview and standardize audiobook folder and file names on disk"
                    >
                        <Wrench size={15} /> Renamer
                    </button>
                    <button
                        onClick={() => setActiveSubTab('queue_settings')}
                        className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                            activeSubTab === 'queue_settings' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Manage background AI generation queue and default shelf styles"
                    >
                        <Sliders size={15} /> Queue ({queuedBooks.length})
                    </button>
                </div>
            </div>

            {/* Connected Audiobook Libraries Strip */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-400 mr-1">
                        Audiobook Libraries:
                    </span>
                    <button
                        onClick={() => setSelectedLibraryFilter('all')}
                        className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                            selectedLibraryFilter === 'all'
                                ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                        }`}
                        title="Show audiobooks across all libraries"
                    >
                        All ({audiobookLibraries.length})
                    </button>
                    {audiobookLibraries.map((lib: any) => {
                        let folderPaths: string[] = [];
                        try {
                            folderPaths = typeof lib.folders === 'string' ? JSON.parse(lib.folders) : (Array.isArray(lib.folders) ? lib.folders : []);
                        } catch {
                            folderPaths = [];
                        }
                        return (
                            <button
                                key={lib.id}
                                onClick={() => setSelectedLibraryFilter(lib.id)}
                                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border flex items-center gap-2 ${
                                    selectedLibraryFilter === lib.id
                                        ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white'
                                }`}
                                title={folderPaths.join(', ') || lib.name}
                            >
                                <BookOpen size={14} className="text-orange-400" />
                                <span>{lib.name}</span>
                                {folderPaths[0] && (
                                    <span className="text-xs font-mono text-zinc-500 max-w-[180px] truncate">
                                        ({folderPaths[0]})
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {audiobookLibraries.length === 0 && !loading && (
                        <span className="text-xs sm:text-sm text-zinc-500 italic">
                            No Audiobook library linked yet — click &ldquo;Libraries &amp; Folders&rdquo; above to add one.
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fetchAll(true)}
                        disabled={rescanning}
                        className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Rescan all connected Audiobook libraries and disk folders"
                    >
                        <RefreshCw size={14} className={rescanning ? 'animate-spin text-orange-400' : 'text-orange-400'} />
                        {rescanning ? 'Scanning' : 'Rescan'}
                    </button>
                    <a
                        href="/theater?tab=audiobooks"
                        className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all"
                        title="Open Audiobookshelf in Theater for playback"
                    >
                        <Play size={14} className="text-orange-400" /> Shelf
                    </a>
                </div>
            </div>

            {/* SUB-TAB 1: BOOKS, METADATA & STUDIO EDITOR */}
            {activeSubTab === 'books' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-lg">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search books by title, canonical author, translator, narrator..."
                                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-16 text-center text-zinc-500 text-sm font-bold">Loading audiobooks...</div>
                    ) : groupedBooks.length === 0 ? (
                        <div className="p-16 rounded-3xl bg-zinc-950/60 border border-zinc-900 text-center space-y-3">
                            <BookOpen size={40} className="mx-auto text-zinc-700" />
                            <p className="text-base font-bold text-white">
                                {audiobookLibraries.length > 0
                                    ? `Connected to ${audiobookLibraries.map((l: any) => l.name).join(', ')}, but no audio chapters were returned yet`
                                    : 'No Audiobook Libraries Found'}
                            </p>
                            <p className="text-sm text-zinc-500 max-w-md mx-auto">
                                {audiobookLibraries.length > 0
                                    ? 'Click "Rescan" above to refresh from Plex and Unraid disk folders.'
                                    : 'Add an Audiobooks library or folder via "Libraries & Folders" above.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {groupedBooks.map(book => {
                                const customCoverActive = Boolean(book.meta?.use_custom_cover && book.meta?.custom_cover_url);
                                const displayCover = customCoverActive ? book.meta.custom_cover_url : book.posterUrl;
                                const previewChapters = Array.isArray(book.chapters) ? book.chapters.slice(0, 6) : [];
                                return (
                                    <div
                                        key={book.id}
                                        className="p-5 rounded-3xl bg-zinc-950/90 border border-zinc-800/80 hover:border-zinc-700 flex flex-col gap-4 justify-between transition-all shadow-lg"
                                    >
                                        <div className="flex gap-5 items-start justify-between">
                                            <div className="flex gap-4 min-w-0 flex-1">
                                                <div
                                                    onClick={() => openEditMetadataModal(book, 'chapters')}
                                                    className="w-24 h-32 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center relative shadow-md cursor-pointer hover:border-purple-500/50 transition-all"
                                                    title="Open Chapters & Scenes Studio"
                                                >
                                                    {displayCover ? (
                                                        <img src={displayCover} alt={book.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <BookOpen size={32} className="text-orange-500/40" />
                                                    )}
                                                    {customCoverActive && (
                                                        <span className="absolute bottom-1.5 inset-x-1.5 px-1.5 py-0.5 rounded bg-black/80 text-xs font-bold text-amber-300 text-center">
                                                            AI Cover
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1 space-y-2">
                                                    <div className="space-y-1">
                                                        <h3
                                                            onClick={() => openEditMetadataModal(book, 'chapters')}
                                                            className="text-base sm:text-lg font-black text-white hover:text-amber-300 leading-snug break-words cursor-pointer transition-colors"
                                                        >
                                                            {book.title}
                                                        </h3>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {book.libraryName && (
                                                                <span className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 text-xs font-bold">
                                                                    {book.libraryName}
                                                                </span>
                                                            )}
                                                            {book.publishedYear && (
                                                                <span className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-mono font-bold">
                                                                    {book.publishedYear}
                                                                </span>
                                                            )}
                                                            {book.genre && (
                                                                <span className="px-2.5 py-0.5 rounded-lg bg-orange-500/10 text-orange-300 border border-orange-500/20 text-xs font-bold">
                                                                    {book.genre}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="text-xs sm:text-sm text-zinc-400 space-y-0.5">
                                                        <p className="font-bold text-orange-400">Author: <span className="text-white">{book.author}</span></p>
                                                        {book.translator && <p className="text-xs">Translator: <span className="text-zinc-300">{book.translator}</span></p>}
                                                        {book.narrator && <p className="text-xs">Narrator: <span className="text-zinc-300">{book.narrator}</span></p>}
                                                    </div>

                                                    {/* Real Counters: Time Transcribed & Scenes Illustrated */}
                                                    <div className="pt-1 flex flex-wrap items-center gap-2 text-xs font-mono">
                                                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/25 font-bold">
                                                            STT: {formatSec(book.transcribedSec)}{book.totalDurSec > 0 ? ` / ${formatSec(book.totalDurSec)}` : ''} ({book.transCh}/{book.totalCh} ch)
                                                        </span>
                                                        <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/25 font-bold">
                                                            Art: {book.illustratedScenes} scenes ({book.illCh}/{book.totalCh} ch)
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <button
                                                    onClick={() => openEditMetadataModal(book, 'chapters')}
                                                    className="px-4 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer shadow"
                                                    title="Open Chapters & Scenes Studio to inspect chapters, edit transcripts, and paint/repaint scenes"
                                                >
                                                    <Layers size={15} className="text-purple-300" /> Studio
                                                </button>
                                                <button
                                                    onClick={() => handleSyncAndQueueBook(book, true)}
                                                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/35 text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer"
                                                    title="Queue whole book for Speech-to-Text transcription and scene art"
                                                >
                                                    <Sparkles size={14} /> Generate
                                                </button>
                                                <button
                                                    onClick={() => openEditMetadataModal(book, 'metadata')}
                                                    className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                                    title="Edit book title, author, translator, narrator, genre, and year"
                                                >
                                                    <Edit3 size={13} className="text-orange-400" /> Metadata
                                                </button>
                                            </div>
                                        </div>

                                        {/* Visual Chapter & Scene Breakdown Strip */}
                                        {previewChapters.length > 0 && (
                                            <div className="pt-3 border-t border-zinc-900/90 space-y-1.5">
                                                <div className="flex items-center justify-between text-xs text-zinc-400">
                                                    <span className="font-bold uppercase tracking-wider text-zinc-400">
                                                        Book Structure ({book.totalCh} {book.totalCh === 1 ? 'Chapter' : 'Chapters'})
                                                    </span>
                                                    <span className="text-zinc-500">Click any chapter to edit its scenes &amp; transcript</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {previewChapters.map((ch: any, cIdx: number) => {
                                                        const cMeta = resolveChapterMeta(book.bookKey, ch, cIdx);
                                                        const hasStt = cMeta.transcription_status === 'completed' || cMeta.transcript_status === 'done' || Boolean(cMeta.synced_lyrics && String(cMeta.synced_lyrics).trim().length > 20);
                                                        const scenesCount = Array.isArray(cMeta.images) ? cMeta.images.filter((im: any) => im.kept !== false).length : 0;
                                                        return (
                                                            <button
                                                                key={ch.id || cIdx}
                                                                type="button"
                                                                onClick={() => {
                                                                    openEditMetadataModal(book, 'chapters');
                                                                    setSelectedChapterIdx(cIdx);
                                                                }}
                                                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                                                                    hasStt && scenesCount > 0
                                                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20'
                                                                        : hasStt || scenesCount > 0
                                                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20'
                                                                        : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                                                                }`}
                                                                title={`Open Chapter ${cIdx + 1}: ${ch.title || ch.name || `Chapter ${cIdx + 1}`}`}
                                                            >
                                                                <span className="font-black text-white">Ch {cIdx + 1}</span>
                                                                <span className={hasStt ? 'text-amber-300' : 'text-zinc-500'}>
                                                                    {hasStt ? '✓ STT' : 'No STT'}
                                                                </span>
                                                                <span>•</span>
                                                                <span className={scenesCount > 0 ? 'text-purple-300' : 'text-zinc-500'}>
                                                                    {scenesCount} {scenesCount === 1 ? 'scene' : 'scenes'}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                    {book.totalCh > 6 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditMetadataModal(book, 'chapters')}
                                                            className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-purple-300 hover:bg-zinc-800 cursor-pointer"
                                                            title="View all chapters in Studio"
                                                        >
                                                            +{book.totalCh - 6} more
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* SUB-TAB 2: COLLECTIONS & SERIES MANAGER */}
            {activeSubTab === 'collections' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="p-5 rounded-3xl bg-zinc-950/90 border border-zinc-800 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">
                                {editingCollectionId ? 'Edit Collection' : 'Create Collection'}
                            </h3>
                            <button
                                onClick={handleAiAutoGroupCollections}
                                disabled={aiGroupingCollections}
                                className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/35 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                                title="Automatically group related audiobooks into series/author collections"
                            >
                                <Sparkles size={13} className={aiGroupingCollections ? 'animate-spin' : ''} />
                                {aiGroupingCollections ? 'Grouping...' : 'Match'}
                            </button>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="text"
                                value={collectionName}
                                onChange={(e) => setCollectionName(e.target.value)}
                                placeholder="Collection / Series Name (e.g. Franz Kafka Complete Works)"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-white"
                            />
                            <input
                                type="text"
                                value={collectionDesc}
                                onChange={(e) => setCollectionDesc(e.target.value)}
                                placeholder="Optional description..."
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-white"
                            />
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-400">Select Books ({collectionBookKeys.length} selected)</label>
                                <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-zinc-900 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
                                    {groupedBooks.map(b => {
                                        const checked = collectionBookKeys.includes(b.bookKey);
                                        return (
                                            <label key={b.bookKey} className="flex items-center gap-2.5 py-2 px-2 text-xs sm:text-sm text-zinc-300 cursor-pointer hover:bg-zinc-800/50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setCollectionBookKeys(prev =>
                                                            checked ? prev.filter(k => k !== b.bookKey) : [...prev, b.bookKey]
                                                        );
                                                    }}
                                                    className="accent-orange-500"
                                                />
                                                <span className="truncate font-semibold text-white">{b.title}</span>
                                                <span className="text-xs text-zinc-500 ml-auto shrink-0">{b.author}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSaveCollection}
                                    className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
                                    title="Save collection"
                                >
                                    {editingCollectionId ? 'Update' : 'Save'}
                                </button>
                                {editingCollectionId && (
                                    <button
                                        onClick={() => {
                                            setEditingCollectionId(null);
                                            setCollectionName('');
                                            setCollectionDesc('');
                                            setCollectionBookKeys([]);
                                        }}
                                        className="px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-400 text-xs sm:text-sm font-bold cursor-pointer"
                                        title="Cancel editing collection"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-3">
                        {collections.length === 0 ? (
                            <div className="p-12 rounded-3xl bg-zinc-950/60 border border-zinc-900 text-center text-zinc-500 text-sm">
                                No collections yet. Create one on the left or click &ldquo;Match&rdquo;.
                            </div>
                        ) : (
                            collections.map((col: any) => (
                                <div key={col.id} className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="text-base font-black text-white">{col.name}</h4>
                                        {col.description && <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">{col.description}</p>}
                                        <p className="text-xs text-orange-400 font-mono mt-1">{(col.bookKeys || col.book_keys || []).length} books</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingCollectionId(col.id);
                                                setCollectionName(col.name || '');
                                                setCollectionDesc(col.description || '');
                                                setCollectionBookKeys(col.bookKeys || col.book_keys || []);
                                            }}
                                            className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                                            title="Edit books in this collection"
                                        >
                                            <Edit3 size={14} /> Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCollection(col.id)}
                                            className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                                            title="Ungroup collection so books return to individual shelf items"
                                        >
                                            <Trash2 size={14} /> Split
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* SUB-TAB 3: BOOK FILE RENAMER */}
            {activeSubTab === 'renamer' && (
                <div className="p-6 rounded-3xl bg-zinc-950/90 border border-zinc-800 space-y-5">
                    <div>
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                            <Wrench size={16} className="text-orange-400" />
                            Standardize &amp; Rename Audiobook Folders &amp; Chapter Files
                        </h3>
                        <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                            Preview and safely rename audiobook folders/chapter files on disk to clean canonical naming.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <select
                            value={selectedRenameBookKey}
                            onChange={(e) => {
                                setSelectedRenameBookKey(e.target.value);
                                if (e.target.value) handlePreviewRename(e.target.value);
                            }}
                            className="flex-1 px-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-bold text-white"
                        >
                            <option value="">Select an audiobook to preview file renames...</option>
                            {groupedBooks.map(b => (
                                <option key={b.bookKey} value={b.bookKey}>{b.title} — {b.author}</option>
                            ))}
                        </select>
                        <button
                            disabled={!selectedRenameBookKey || renamingBusy}
                            onClick={handleExecuteRename}
                            className="px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-black font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
                            title="Execute the previewed folder and file renames on disk"
                        >
                            {renamingBusy ? 'Working...' : 'Rename'}
                        </button>
                    </div>

                    {renamePreview.length > 0 && (
                        <div className="divide-y divide-zinc-900 rounded-2xl border border-zinc-800 bg-zinc-900/40 max-h-96 overflow-y-auto custom-scrollbar">
                            {renamePreview.map((r, i) => (
                                <div key={i} className="p-3 text-xs sm:text-sm font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <span className="text-zinc-400 truncate">{r.currentFolder || r.oldPath}</span>
                                    <span className="text-emerald-400 font-bold truncate">→ {r.proposedFolder || r.newPath} ({r.status || (r.alreadyClean ? 'already clean' : r.canRename ? 'ready' : 'pending')})</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* SUB-TAB 4: AI QUEUE & SHELF DEFAULTS */}
            {activeSubTab === 'queue_settings' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Shelf Defaults & Unified AI Key */}
                    <div className="p-6 rounded-3xl bg-zinc-950/90 border border-zinc-800 space-y-4">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <Sliders size={15} className="text-orange-400" />
                            Shelf Defaults &amp; AI Provider Key
                        </h3>

                        <div className="space-y-1.5">
                            <label className="text-xs sm:text-sm font-bold text-zinc-300">
                                Unified AI API Key (Gemini / OpenAI / Groq — comma-separated supported)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="AIzaSy... or sk-... or gsk_..."
                                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-white font-mono"
                                />
                                <button
                                    onClick={() => handleSaveConfig({ unifiedApiKey: apiKeyInput })}
                                    disabled={savingConfig}
                                    className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs sm:text-sm uppercase cursor-pointer"
                                    title="Save Unified AI API Key"
                                >
                                    Save
                                </button>
                            </div>
                            <p className="text-xs text-zinc-500">
                                Real audio transcription uses Gemini 2.0/1.5 Flash Audio, Groq Whisper Large v3, or OpenAI Whisper-1.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-400">Default Art Style</label>
                                <select
                                    value={studioConfig?.artStyle || 'cinematic_concept'}
                                    onChange={(e) => handleSaveConfig({ artStyle: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-bold text-white"
                                >
                                    <option value="cinematic_concept">Cinematic Concept Art</option>
                                    <option value="oil_painting">Classical Oil Painting</option>
                                    <option value="dark_fantasy">Dark Fantasy Illustration</option>
                                    <option value="graphic_novel">Graphic Novel / Comic Ink</option>
                                    <option value="watercolor">Storybook Watercolor</option>
                                    <option value="vintage_etching">Vintage Bookplate Etching</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-400">Default Audio Filter</label>
                                <select
                                    value={studioConfig?.voicePreset || 'original'}
                                    onChange={(e) => handleSaveConfig({ voicePreset: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-bold text-white"
                                >
                                    <option value="original">Original Audio (Bypass)</option>
                                    <option value="clear_voice">Clear Voice (Vocal Boost)</option>
                                    <option value="warm_bass">Warm Studio (Rich Bass)</option>
                                    <option value="deep_pitch">Deeper Voice (-8% Pitch)</option>
                                    <option value="crisp_treble">Crisp Treble (Articulation)</option>
                                    <option value="bright_pitch">Higher Voice (+6% Pitch)</option>
                                    <option value="night_compress">Night Leveler (Even Volume)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Priority Queue List */}
                    <div className="p-6 rounded-3xl bg-zinc-950/90 border border-zinc-800 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Zap size={15} className="text-amber-400" />
                                Active Generation Queue ({queuedBooks.length})
                            </h3>
                            <button
                                onClick={async () => {
                                    await fetch('/api/theater/audiobooks/studio', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'trigger_worker' })
                                    });
                                    toast.success('Triggered background studio worker');
                                    fetchAll();
                                }}
                                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/35 text-xs sm:text-sm font-black cursor-pointer"
                                title="Trigger background worker to process queued books immediately"
                            >
                                Run
                            </button>
                        </div>

                        {queuedBooks.length === 0 ? (
                            <p className="text-xs sm:text-sm text-zinc-500 py-8 text-center">
                                No books currently in queue. Click &ldquo;Generate&rdquo; on any book to start.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {queuedBooks.map((b, idx) => (
                                    <div key={b.bookKey} className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs sm:text-sm font-black text-white truncate">#{idx + 1} • {b.title}</p>
                                            <p className="text-xs text-zinc-400 font-mono">
                                                Transcribed: {formatSec(b.transcribedSec)} • Scenes: {b.illustratedScenes}
                                            </p>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                await fetch('/api/theater/audiobooks/studio', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ action: 'toggle_queue', bookKey: b.bookKey, isQueued: false })
                                                });
                                                fetchAll();
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 text-xs font-bold cursor-pointer"
                                            title="Remove book from generation queue"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MASTER-DETAIL AUDIOBOOK STUDIO MODAL (CHAPTERS & SCENES + STUDIO AI + METADATA) */}
            {editingBook && (() => {
                const liveBook = groupedBooks.find(b => b.bookKey === editingBook.bookKey) || editingBook;
                const liveMeta = studioBooksMap[liveBook.bookKey] || liveBook.meta || {};
                const customCoverActive = Boolean(liveMeta.use_custom_cover && liveMeta.custom_cover_url);
                const effectiveCover = customCoverActive ? liveMeta.custom_cover_url : liveBook.posterUrl;
                const bookChapters = Array.isArray(liveBook.chapters) ? liveBook.chapters : [];
                const safeChIdx = Math.min(Math.max(0, selectedChapterIdx), Math.max(0, bookChapters.length - 1));
                const activeChTrack = bookChapters[safeChIdx] || null;
                const activeChMeta = activeChTrack ? resolveChapterMeta(liveBook.bookKey, activeChTrack, safeChIdx) : {};
                const activeChapterKey = activeChMeta.chapter_key || activeChTrack?.chapterKey || activeChTrack?.id || `${liveBook.bookKey}::ch${safeChIdx + 1}`;
                const activeChDurSec = activeChTrack?.durationMs
                    ? Math.round(activeChTrack.durationMs / 1000)
                    : Number(activeChMeta.duration_sec || 600);
                const activeSyncedLyrics = typeof activeChMeta.synced_lyrics === 'string' ? activeChMeta.synced_lyrics.trim() : '';
                const activeHasTranscript =
                    activeChMeta.transcription_status === 'completed' ||
                    activeChMeta.transcript_status === 'done' ||
                    activeSyncedLyrics.length > 20;

                // Parse timestamped LRC lines for the selected chapter
                const parsedLrcLines: Array<{ timeSec: number; timeLabel: string; text: string }> = activeSyncedLyrics
                    ? activeSyncedLyrics
                        .split('\n')
                        .map((line: string) => {
                            const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
                            if (m) {
                                const min = parseInt(m[1], 10);
                                const sec = parseFloat(m[2]);
                                const total = min * 60 + sec;
                                const mm = String(Math.floor(total / 60)).padStart(2, '0');
                                const ss = String(Math.floor(total % 60)).padStart(2, '0');
                                return { timeSec: total, timeLabel: `${mm}:${ss}`, text: m[3].trim() };
                            }
                            const clean = line.trim();
                            return clean ? { timeSec: 0, timeLabel: '00:00', text: clean } : null;
                        })
                        .filter(Boolean) as Array<{ timeSec: number; timeLabel: string; text: string }>
                    : [];

                const existingScenes: any[] = Array.isArray(activeChMeta.images) ? activeChMeta.images : [];
                const targetSceneSlotsCount = Math.max(
                    existingScenes.length,
                    editScenesPerChapter > 0 ? editScenesPerChapter : Number(liveMeta.images_per_chapter || studioConfig?.imagesPerChapter || 2)
                );

                // Build unified Scene Breakdown Slots so user ALWAYS sees how the chapter is divided into scenes
                const sceneSlots = Array.from({ length: Math.max(1, targetSceneSlotsCount) }, (_, sIdx) => {
                    const existingImg = existingScenes[sIdx] || null;
                    const slotStartSec = existingImg?.startSec !== undefined
                        ? Number(existingImg.startSec)
                        : Math.floor((sIdx / Math.max(1, targetSceneSlotsCount)) * activeChDurSec);
                    const slotEndSec = existingImg?.endSec !== undefined
                        ? Number(existingImg.endSec)
                        : Math.floor(((sIdx + 1) / Math.max(1, targetSceneSlotsCount)) * activeChDurSec);

                    const linesInWindow = parsedLrcLines.filter(
                        l => l.timeSec >= slotStartSec - 2 && l.timeSec <= slotEndSec + 5
                    );
                    const fallbackSliceStart = Math.floor((sIdx / Math.max(1, targetSceneSlotsCount)) * parsedLrcLines.length);
                    const fallbackSliceEnd = Math.max(fallbackSliceStart + 1, Math.floor(((sIdx + 1) / Math.max(1, targetSceneSlotsCount)) * parsedLrcLines.length));
                    const sceneLines = linesInWindow.length > 0
                        ? linesInWindow
                        : parsedLrcLines.slice(fallbackSliceStart, fallbackSliceEnd);

                    return {
                        sceneIndex: sIdx,
                        existingImg,
                        startSec: slotStartSec,
                        endSec: slotEndSec,
                        sceneLines
                    };
                });

                const formatClock = (sec: number) => {
                    const s = Math.max(0, Math.floor(sec || 0));
                    const m = Math.floor(s / 60);
                    const rem = String(s % 60).padStart(2, '0');
                    return `${m}:${rem}`;
                };

                const isTranscribingActive = runningChapterTaskKey === `${activeChapterKey}::transcribe`;
                const isIllustratingActive = runningChapterTaskKey === `${activeChapterKey}::illustrate`;
                const isEnhancingActive = runningChapterTaskKey === `${activeChapterKey}::enhance`;
                const isEditingActiveTranscript = editingTranscriptChapterKey === activeChapterKey;

                return (
                    <div
                        onClick={(e) => { if (e.target === e.currentTarget) setEditingBook(null); }}
                        className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto"
                    >
                        <div className="bg-[#0c0c0e] border border-zinc-800 rounded-3xl w-full max-w-7xl p-5 sm:p-6 space-y-4 shadow-2xl my-auto h-[92vh] flex flex-col overflow-hidden">
                            {/* Top Modal Header */}
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-900 pb-4 shrink-0">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-14 h-20 rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                                        {effectiveCover ? (
                                            <img src={effectiveCover} alt={liveBook.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <BookOpen size={24} className="text-orange-400" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-black uppercase tracking-wider text-purple-400">
                                                Audiobook Studio
                                            </span>
                                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold">
                                                STT: {liveBook.transCh}/{liveBook.totalCh} ch ({formatSec(liveBook.transcribedSec)})
                                            </span>
                                            <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-xs font-mono font-bold">
                                                Art: {liveBook.illustratedScenes} scenes ({liveBook.illCh}/{liveBook.totalCh} ch)
                                            </span>
                                        </div>
                                        <h3 className="text-lg sm:text-2xl font-black text-white leading-snug break-words mt-0.5">
                                            {liveBook.title}
                                        </h3>
                                        <p className="text-xs sm:text-sm font-semibold text-zinc-400">
                                            {liveBook.author} • {liveBook.totalCh} {liveBook.totalCh === 1 ? 'chapter' : 'chapters'}
                                        </p>
                                    </div>
                                </div>

                                {/* Sub-Tab Switcher inside Header */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800">
                                        <button
                                            type="button"
                                            onClick={() => setEditModalTab('chapters')}
                                            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                                                editModalTab === 'chapters'
                                                    ? 'bg-purple-500 text-black shadow'
                                                    : 'text-zinc-300 hover:text-white'
                                            }`}
                                            title="Inspect chapters, view time-windowed scenes, edit prompts, repaint scenes, and edit Speech-to-Text transcripts"
                                        >
                                            <Layers size={15} /> Chapters &amp; Scenes ({bookChapters.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditModalTab('studio')}
                                            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                                                editModalTab === 'studio'
                                                    ? 'bg-amber-500 text-black shadow'
                                                    : 'text-zinc-300 hover:text-white'
                                            }`}
                                            title="Configure default art style, audio filter, scenes per chapter, visual notes, and whole-book reset/redo"
                                        >
                                            <Sparkles size={15} /> Studio Settings
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditModalTab('metadata')}
                                            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                                                editModalTab === 'metadata'
                                                    ? 'bg-orange-500 text-black shadow'
                                                    : 'text-zinc-300 hover:text-white'
                                            }`}
                                            title="Edit book title, canonical author, translator, narrator, genre, and year"
                                        >
                                            <Edit3 size={15} /> Metadata
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => setEditingBook(null)}
                                        className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer border border-zinc-800"
                                        title="Close Audiobook Studio"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                                {/* TAB 1: MASTER-DETAIL CHAPTERS & SCENES STUDIO */}
                                {editModalTab === 'chapters' && (
                                    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
                                        {/* LEFT SIDEBAR: CHAPTERS NAVIGATOR (4 cols) */}
                                        <div className="lg:col-span-4 flex flex-col min-h-0 rounded-2xl bg-zinc-950/90 border border-zinc-800/90 overflow-hidden">
                                            <div className="p-3.5 border-b border-zinc-900 flex items-center justify-between gap-2 shrink-0 bg-zinc-900/40">
                                                <div>
                                                    <div className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                                                        1. Select Chapter ({bookChapters.length})
                                                    </div>
                                                    <div className="text-xs text-zinc-400">
                                                        Click a chapter to view &amp; edit its scenes and transcript
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSyncAndQueueBook(liveBook, true)}
                                                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase flex items-center gap-1 cursor-pointer shrink-0 shadow"
                                                    title="Queue all chapters in this book for background Speech-to-Text and Scene Art"
                                                >
                                                    <Sparkles size={13} /> Queue All
                                                </button>
                                            </div>

                                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-zinc-900/80 p-2 space-y-1">
                                                {bookChapters.length === 0 ? (
                                                    <div className="p-8 text-center text-zinc-500 text-sm">
                                                        No audio chapter tracks found for this book.
                                                    </div>
                                                ) : (
                                                    bookChapters.map((chTrack: any, idx: number) => {
                                                        const chMeta = resolveChapterMeta(liveBook.bookKey, chTrack, idx);
                                                        const chLyrics = typeof chMeta.synced_lyrics === 'string' ? chMeta.synced_lyrics.trim() : '';
                                                        const hasTranscript =
                                                            chMeta.transcription_status === 'completed' ||
                                                            chMeta.transcript_status === 'done' ||
                                                            chLyrics.length > 20;
                                                        const chImages = Array.isArray(chMeta.images) ? chMeta.images.filter((im: any) => im.kept !== false) : [];
                                                        const durSec = chTrack.durationMs
                                                            ? Math.round(chTrack.durationMs / 1000)
                                                            : Number(chMeta.duration_sec || 0);
                                                        const isSelected = idx === safeChIdx;

                                                        return (
                                                            <button
                                                                key={chTrack.id || idx}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedChapterIdx(idx);
                                                                    setEditingTranscriptChapterKey(null);
                                                                }}
                                                                className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2.5 border ${
                                                                    isSelected
                                                                        ? 'bg-purple-500/20 border-purple-400/60 text-white shadow-md'
                                                                        : 'bg-zinc-900/40 hover:bg-zinc-900/80 border-transparent text-zinc-300'
                                                                }`}
                                                            >
                                                                <div className="min-w-0 flex-1 space-y-1">
                                                                    <div className="text-sm font-black text-white truncate">
                                                                        {idx + 1}. {chTrack.title || chTrack.name || `Chapter ${idx + 1}`}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono">
                                                                        {durSec > 0 && (
                                                                            <span className="text-zinc-400">{formatClock(durSec)}</span>
                                                                        )}
                                                                        <span className={`px-2 py-0.5 rounded font-bold ${
                                                                            hasTranscript
                                                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                                : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                                                                        }`}>
                                                                            {hasTranscript ? '✓ STT' : 'No STT'}
                                                                        </span>
                                                                        <span className={`px-2 py-0.5 rounded font-bold ${
                                                                            chImages.length > 0
                                                                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                                                                : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                                                                        }`}>
                                                                            {chImages.length} {chImages.length === 1 ? 'scene' : 'scenes'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        {/* RIGHT STAGE: SELECTED CHAPTER SCENES & TRANSCRIPT WORKSPACE (8 cols) */}
                                        <div className="lg:col-span-8 flex flex-col min-h-0 rounded-2xl bg-zinc-950/90 border border-zinc-800/90 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-5">
                                            {!activeChTrack ? (
                                                <div className="p-12 text-center text-zinc-500 text-sm">
                                                    Select a chapter on the left to inspect its scenes and transcript.
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Selected Chapter Header & Direct Generation Toolbar */}
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-900">
                                                        <div className="space-y-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-black uppercase">
                                                                    Chapter {safeChIdx + 1} of {bookChapters.length}
                                                                </span>
                                                                {activeChDurSec > 0 && (
                                                                    <span className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-mono font-bold">
                                                                        Duration: {formatClock(activeChDurSec)}
                                                                    </span>
                                                                )}
                                                                <span className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-mono font-bold">
                                                                    {sceneSlots.length} {sceneSlots.length === 1 ? 'Scene Window' : 'Scene Windows'}
                                                                </span>
                                                            </div>
                                                            <h4 className="text-lg sm:text-xl font-black text-white break-words">
                                                                {activeChTrack.title || activeChTrack.name || `Chapter ${safeChIdx + 1}`}
                                                            </h4>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRunChapterTaskInEditor(activeChTrack, safeChIdx, 'transcribe')}
                                                                disabled={Boolean(runningChapterTaskKey)}
                                                                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                title="Run real Speech-to-Text on this chapter's audio stream"
                                                            >
                                                                <RefreshCw size={14} className={isTranscribingActive ? 'animate-spin' : ''} />
                                                                {isTranscribingActive ? 'Transcribing...' : activeHasTranscript ? 'Redo STT' : 'Transcribe'}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleRunChapterTaskInEditor(activeChTrack, safeChIdx, 'illustrate')}
                                                                disabled={Boolean(runningChapterTaskKey)}
                                                                className="px-3.5 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                title="Generate scene illustrations for all scene windows in this chapter"
                                                            >
                                                                <ImageIcon size={14} className={isIllustratingActive ? 'animate-pulse' : ''} />
                                                                {isIllustratingActive ? 'Painting...' : 'Paint All Scenes'}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleRepaintSingleScene(activeChTrack, safeChIdx, { sceneIndex: existingScenes.length })}
                                                                disabled={Boolean(repaintingSceneKey)}
                                                                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-purple-300 border border-purple-500/30 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                title="Generate and append an additional scene illustration to this chapter"
                                                            >
                                                                <Sparkles size={14} /> + Scene
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleRunChapterTaskInEditor(activeChTrack, safeChIdx, 'enhance')}
                                                                disabled={Boolean(runningChapterTaskKey)}
                                                                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-emerald-300 border border-emerald-500/30 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                title="Save enhanced .m4a voice track on disk for this chapter"
                                                            >
                                                                <Mic2 size={14} className={isEnhancingActive ? 'animate-pulse' : ''} />
                                                                {isEnhancingActive ? 'Saving...' : 'Save .m4a'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* SECTION A: CHAPTER SPEECH-TO-TEXT TRANSCRIPT VIEWER & EDITOR */}
                                                    <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                                                                    Chapter Speech-to-Text Transcript
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                                    activeHasTranscript
                                                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                                                        : 'bg-zinc-800 text-zinc-400'
                                                                }`}>
                                                                    {activeHasTranscript ? `${parsedLrcLines.length} timestamped lines` : 'Not Transcribed Yet'}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                {!isEditingActiveTranscript ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingTranscriptChapterKey(activeChapterKey);
                                                                            setTranscriptDraftText(activeSyncedLyrics);
                                                                        }}
                                                                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-200 border border-zinc-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                                                        title="Edit or paste chapter transcript lines ([mm:ss.xx] or plain text)"
                                                                    >
                                                                        <Edit3 size={13} /> {activeHasTranscript ? 'Edit Transcript' : 'Paste / Write Transcript'}
                                                                    </button>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSaveChapterTranscriptInStudio(activeChTrack, safeChIdx)}
                                                                            disabled={savingTranscript}
                                                                            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase flex items-center gap-1 cursor-pointer"
                                                                            title="Save transcript to database and .lrc sidecar"
                                                                        >
                                                                            <Check size={13} /> {savingTranscript ? 'Saving...' : 'Save Transcript'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditingTranscriptChapterKey(null)}
                                                                            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {isEditingActiveTranscript ? (
                                                            <div className="space-y-2">
                                                                <textarea
                                                                    value={transcriptDraftText}
                                                                    onChange={(e) => setTranscriptDraftText(e.target.value)}
                                                                    rows={7}
                                                                    placeholder="Paste [mm:ss.xx] synced LRC lines or plain chapter text (plain lines will be auto-timed across the chapter duration)..."
                                                                    className="w-full p-3 rounded-xl bg-black/80 border border-amber-500/40 text-xs sm:text-sm text-zinc-100 font-mono leading-relaxed focus:outline-none"
                                                                />
                                                            </div>
                                                        ) : activeHasTranscript ? (
                                                            <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-xl bg-black/50 border border-zinc-800/80 p-3 space-y-1.5">
                                                                {parsedLrcLines.slice(0, 80).map((line, lIdx) => (
                                                                    <div key={lIdx} className="text-xs sm:text-sm flex items-start gap-2.5 leading-relaxed">
                                                                        <span className="font-mono text-amber-400/90 font-bold shrink-0">[{line.timeLabel}]</span>
                                                                        <span className="text-zinc-200">{line.text}</span>
                                                                    </div>
                                                                ))}
                                                                {parsedLrcLines.length > 80 && (
                                                                    <div className="text-xs text-zinc-500 font-mono pt-1">
                                                                        + {parsedLrcLines.length - 80} more timestamped lines (click &ldquo;Edit Transcript&rdquo; to view/edit all)
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="p-3 rounded-xl bg-black/40 border border-zinc-800/60 text-xs sm:text-sm text-zinc-400 flex items-center justify-between gap-3">
                                                                <span>
                                                                    No Speech-to-Text transcript yet. Click <strong className="text-amber-300">Transcribe</strong> above to run real audio STT, or <strong className="text-amber-200">Paste / Write Transcript</strong>.
                                                                </span>
                                                                {activeChMeta.error_message && (
                                                                    <span className="text-red-400 font-mono text-xs">{activeChMeta.error_message}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* SECTION B: CHAPTER SCENE BREAKDOWN & PROMPT STUDIO */}
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <h5 className="text-xs sm:text-sm font-black uppercase tracking-wider text-purple-300">
                                                                    2. Chapter Scenes Breakdown ({sceneSlots.length} {sceneSlots.length === 1 ? 'Scene' : 'Scenes'} in Chapter {safeChIdx + 1})
                                                                </h5>
                                                                <p className="text-xs text-zinc-400">
                                                                    Each scene covers a specific time window of the chapter. Edit any scene&rsquo;s visual prompt below and click <strong>Repaint</strong> to regenerate that single scene.
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {sceneSlots.map((slot) => {
                                                                const sIdx = slot.sceneIndex;
                                                                const img = slot.existingImg;
                                                                const draftKey = `${activeChapterKey}::s${sIdx}`;
                                                                const promptValue = scenePromptDrafts[draftKey] !== undefined
                                                                    ? scenePromptDrafts[draftKey]
                                                                    : (img?.prompt || '');
                                                                const isRepaintingThis = repaintingSceneKey === draftKey;

                                                                return (
                                                                    <div
                                                                        key={img?.id || `slot-${sIdx}`}
                                                                        className="rounded-2xl bg-zinc-900/70 border border-zinc-800 overflow-hidden flex flex-col justify-between shadow-lg"
                                                                    >
                                                                        {/* Scene Header Bar */}
                                                                        <div className="px-3.5 py-2.5 bg-zinc-950/90 border-b border-zinc-800 flex items-center justify-between gap-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-black">
                                                                                    Scene {sIdx + 1} of {sceneSlots.length}
                                                                                </span>
                                                                                <span className="text-xs font-mono font-bold text-zinc-300">
                                                                                    {formatClock(slot.startSec)} – {formatClock(slot.endSec)}
                                                                                </span>
                                                                            </div>

                                                                            {img && (
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleCurateSceneImage(activeChapterKey, img.id, 'keep')}
                                                                                        className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer ${
                                                                                            img.kept !== false
                                                                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                                                : 'bg-zinc-800 text-zinc-400'
                                                                                        }`}
                                                                                        title="Toggle whether this scene is shown during playback"
                                                                                    >
                                                                                        {img.kept !== false ? '✓ Kept' : 'Hidden'}
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleCurateSceneImage(activeChapterKey, img.id, 'delete')}
                                                                                        className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/35 text-red-300 cursor-pointer"
                                                                                        title="Delete this scene image"
                                                                                    >
                                                                                        <Trash2 size={13} />
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {/* Scene Image Preview or Unpainted Slot */}
                                                                        <div className="relative aspect-[16/10] bg-black flex items-center justify-center overflow-hidden border-b border-zinc-800/80">
                                                                            {img?.url ? (
                                                                                <img
                                                                                    src={img.url}
                                                                                    alt={`Chapter ${safeChIdx + 1} Scene ${sIdx + 1}`}
                                                                                    className="w-full h-full object-cover"
                                                                                />
                                                                            ) : (
                                                                                <div className="p-6 text-center space-y-2">
                                                                                    <ImageIcon size={32} className="mx-auto text-purple-400/40" />
                                                                                    <div className="text-xs sm:text-sm font-bold text-zinc-300">
                                                                                        Scene {sIdx + 1} Not Painted Yet ({formatClock(slot.startSec)} – {formatClock(slot.endSec)})
                                                                                    </div>
                                                                                    <p className="text-xs text-zinc-500">
                                                                                        Enter a custom scene description below or click Paint Scene to generate from the chapter transcript.
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {/* Scene Prompt Editor + Single-Scene Repaint Button + Transcript Excerpt */}
                                                                        <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                                                                            <div className="space-y-1.5">
                                                                                <label className="block text-xs font-bold text-zinc-300">
                                                                                    Scene {sIdx + 1} Visual Prompt (Editable):
                                                                                </label>
                                                                                <div className="flex gap-2">
                                                                                    <input
                                                                                        type="text"
                                                                                        value={promptValue}
                                                                                        onChange={(e) =>
                                                                                            setScenePromptDrafts(prev => ({
                                                                                                ...prev,
                                                                                                [draftKey]: e.target.value
                                                                                            }))
                                                                                        }
                                                                                        placeholder="Describe exact characters, action, lighting, or leave blank to auto-derive from spoken lines..."
                                                                                        className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-white"
                                                                                    />
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleRepaintSingleScene(activeChTrack, safeChIdx, {
                                                                                            sceneIndex: sIdx,
                                                                                            imageId: img?.id,
                                                                                            customPrompt: promptValue,
                                                                                            startSec: slot.startSec,
                                                                                            endSec: slot.endSec
                                                                                        })}
                                                                                        disabled={Boolean(repaintingSceneKey)}
                                                                                        className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-black font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50 shadow"
                                                                                        title="Paint or repaint this specific scene using the prompt on the left"
                                                                                    >
                                                                                        <RefreshCw size={13} className={isRepaintingThis ? 'animate-spin' : ''} />
                                                                                        {isRepaintingThis ? 'Painting...' : img ? 'Repaint' : 'Paint'}
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            {/* Spoken Lines in This Scene Time Window */}
                                                                            <div className="p-2.5 rounded-xl bg-black/50 border border-zinc-800/70 space-y-1">
                                                                                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                                                                                    Spoken in Scene {sIdx + 1} ({formatClock(slot.startSec)} – {formatClock(slot.endSec)}):
                                                                                </div>
                                                                                {slot.sceneLines.length > 0 ? (
                                                                                    <div className="max-h-20 overflow-y-auto custom-scrollbar space-y-0.5 text-xs text-zinc-300">
                                                                                        {slot.sceneLines.slice(0, 6).map((l, li) => (
                                                                                            <p key={li} className="leading-snug">
                                                                                                <span className="font-mono text-amber-400/80 mr-1.5">[{l.timeLabel}]</span>
                                                                                                {l.text}
                                                                                            </p>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : (
                                                                                    <p className="text-xs text-zinc-500 italic">
                                                                                        Transcribe this chapter to see the exact spoken lines for this scene window.
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: STUDIO & AI SETTINGS */}
                                {editModalTab === 'studio' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                                        {/* Progress Counters */}
                                        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                                                <div className="text-xs font-bold text-zinc-400">Audio Transcribed</div>
                                                <div className="text-sm sm:text-base font-mono font-black text-amber-300 mt-0.5">
                                                    {formatSec(liveBook.transcribedSec)} / {formatSec(liveBook.totalDurSec)} ({liveBook.transCh}/{liveBook.totalCh} ch)
                                                </div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                                                <div className="text-xs font-bold text-zinc-400">Scenes Illustrated</div>
                                                <div className="text-sm sm:text-base font-mono font-black text-purple-300 mt-0.5">
                                                    {liveBook.illustratedScenes} scenes ({liveBook.illCh}/{liveBook.totalCh} ch)
                                                </div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                                                <div className="text-xs font-bold text-zinc-400">Saved .m4a Audio Files</div>
                                                <div className="text-sm sm:text-base font-mono font-black text-emerald-300 mt-0.5">
                                                    {liveBook.enhCh}/{liveBook.totalCh} chapters
                                                </div>
                                            </div>
                                        </div>

                                        {/* Per-Book AI Studio Settings */}
                                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-300 mb-1">Book Illustration Style</label>
                                                    <select
                                                        value={editArtStyle}
                                                        onChange={(e) => setEditArtStyle(e.target.value)}
                                                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-white font-semibold"
                                                    >
                                                        <option value="">Shelf Default Style</option>
                                                        <option value="Cinematic Concept Art">Cinematic Concept Art</option>
                                                        <option value="Dark Fantasy Oil Painting">Dark Fantasy Oil Painting</option>
                                                        <option value="Studio Ghibli Anime">Studio Ghibli Anime</option>
                                                        <option value="Watercolor Book Illustration">Watercolor Book Illustration</option>
                                                        <option value="Graphic Novel Ink & Wash">Graphic Novel Ink &amp; Wash</option>
                                                        <option value="Classic Golden Age Storybook">Classic Golden Age Storybook</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-300 mb-1">Default Audio Filter</label>
                                                    <select
                                                        value={editVoicePreset}
                                                        onChange={(e) => setEditVoicePreset(e.target.value)}
                                                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-white font-semibold"
                                                    >
                                                        <option value="">Shelf Default Filter</option>
                                                        <option value="original">Original Audio (Bypass)</option>
                                                        <option value="clear_voice">Clear Voice (Vocal Boost)</option>
                                                        <option value="warm_bass">Warm Studio (Rich Bass)</option>
                                                        <option value="deep_pitch">Deeper Voice (-8% Pitch)</option>
                                                        <option value="crisp_treble">Crisp Treble (Articulation)</option>
                                                        <option value="bright_pitch">Higher Voice (+6% Pitch)</option>
                                                        <option value="night_compress">Night Leveler (Even Volume)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-300 mb-1">Scenes per Chapter</label>
                                                    <select
                                                        value={editScenesPerChapter}
                                                        onChange={(e) => setEditScenesPerChapter(Number(e.target.value))}
                                                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-white font-semibold"
                                                    >
                                                        <option value={0}>Shelf Default (2 Scenes)</option>
                                                        <option value={1}>1 Scene / Chapter</option>
                                                        <option value={2}>2 Scenes / Chapter</option>
                                                        <option value={3}>3 Scenes / Chapter</option>
                                                        <option value={4}>4 Scenes / Chapter</option>
                                                        <option value={6}>6 Scenes / Chapter</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-300 mb-1">Scene Visual Focus</label>
                                                    <select
                                                        value={editSceneFocus}
                                                        onChange={(e) => setEditSceneFocus(e.target.value)}
                                                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-white font-semibold"
                                                    >
                                                        <option value="">Balanced Action &amp; Atmosphere</option>
                                                        <option value="characters">Character Close-ups &amp; Emotion</option>
                                                        <option value="environments">Wide Landscapes &amp; Architecture</option>
                                                        <option value="action">Dramatic Action Moments</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-zinc-300 mb-1">
                                                    Character &amp; Setting Visual Notes (Injected into all scene prompts for this book)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editVisualNotes}
                                                    onChange={(e) => setEditVisualNotes(e.target.value)}
                                                    placeholder="e.g. Early 20th-century Prague apartment, gaslight shadows, period attire..."
                                                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-white"
                                                />
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleCustomBookCover( false )}
                                                    disabled={runningStudioAction === 'cover'}
                                                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                                                    title="Toggle or generate custom AI cover artwork for this book"
                                                >
                                                    <ImageIcon size={15} />
                                                    {liveMeta.custom_cover_url
                                                        ? (customCoverActive ? 'Use Original Cover' : 'Use AI Cover')
                                                        : 'Generate AI Cover'}
                                                </button>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveBookStudioSettings}
                                                        disabled={runningStudioAction === 'save_settings'}
                                                        className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                                                        title="Save per-book Studio & AI settings"
                                                    >
                                                        <Check size={15} /> Save Settings
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSyncAndQueueBook(liveBook, true)}
                                                        className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg"
                                                        title="Queue whole book for background Speech-to-Text transcription and scene illustration"
                                                    >
                                                        <Sparkles size={15} /> Generate Whole Book
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Reset & Redo Controls */}
                                        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="text-xs sm:text-sm font-black text-white">Reset &amp; Regenerate Book Assets</div>
                                                <div className="text-xs text-zinc-400">Clear existing transcripts or scene illustrations and re-queue them with current settings.</div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetAndRedoBook('transcripts')}
                                                    disabled={Boolean(runningStudioAction)}
                                                    className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                                                    title="Clear all transcripts for this book and re-transcribe"
                                                >
                                                    <RefreshCw size={13} /> Redo STT
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetAndRedoBook('illustrations')}
                                                    disabled={Boolean(runningStudioAction)}
                                                    className="px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                                                    title="Clear all scene illustrations for this book and re-illustrate"
                                                >
                                                    <ImageIcon size={13} /> Redo Art
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetAndRedoBook('all')}
                                                    disabled={Boolean(runningStudioAction)}
                                                    className="px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                                                    title="Clear both transcripts and scene illustrations and regenerate everything"
                                                >
                                                    <Trash2 size={13} /> Reset All
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: BOOK METADATA */}
                                {editModalTab === 'metadata' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-zinc-300">Book Title</label>
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-300">Canonical Author (Groups all works by author)</label>
                                                <input
                                                    type="text"
                                                    value={editAuthor}
                                                    onChange={(e) => setEditAuthor(e.target.value)}
                                                    placeholder="e.g. Franz Kafka"
                                                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-300">Translator (Optional)</label>
                                                <input
                                                    type="text"
                                                    value={editTranslator}
                                                    onChange={(e) => setEditTranslator(e.target.value)}
                                                    placeholder="e.g. Ian Johnston"
                                                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-300">Narrator (Optional)</label>
                                                <input
                                                    type="text"
                                                    value={editNarrator}
                                                    onChange={(e) => setEditNarrator(e.target.value)}
                                                    placeholder="e.g. LibriVox"
                                                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-300">Genre</label>
                                                <input
                                                    type="text"
                                                    value={editGenre}
                                                    onChange={(e) => setEditGenre(e.target.value)}
                                                    placeholder="e.g. Classic Fiction"
                                                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-300">Publication Year</label>
                                                <input
                                                    type="number"
                                                    value={editYear}
                                                    onChange={(e) => setEditYear(e.target.value)}
                                                    placeholder="e.g. 1915"
                                                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-900">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const bKey = liveBook.bookKey;
                                                    setEditingBook(null);
                                                    setActiveSubTab('renamer');
                                                    setSelectedRenameBookKey(bKey);
                                                    handlePreviewRename(bKey);
                                                }}
                                                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
                                                title="Open File Renamer for this audiobook"
                                            >
                                                <Wrench size={14} className="text-orange-400" /> Rename Files
                                            </button>

                                            <button
                                                type="button"
                                                onClick={handleSaveBookMetadata}
                                                disabled={savingMetadata}
                                                className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                                                title="Save updated book metadata"
                                            >
                                                <Check size={15} /> {savingMetadata ? 'Saving...' : 'Save Metadata'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

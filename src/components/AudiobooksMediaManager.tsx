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
    const [searchQuery, setSearchQuery] = useState('');
    const [rawItems, setRawItems] = useState<any[]>([]);
    const [studioBooksMap, setStudioBooksMap] = useState<Record<string, any>>({});
    const [studioChaptersMap, setStudioChaptersMap] = useState<Record<string, any>>({});
    const [collections, setCollections] = useState<any[]>([]);
    const [studioConfig, setStudioConfig] = useState<any>(null);
    const [workerState, setWorkerState] = useState<any>(null);

    // Book Metadata Editor Modal state
    const [editingBook, setEditingBook] = useState<any | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editAuthor, setEditAuthor] = useState('');
    const [editTranslator, setEditTranslator] = useState('');
    const [editNarrator, setEditNarrator] = useState('');
    const [editGenre, setEditGenre] = useState('');
    const [editYear, setEditYear] = useState('');
    const [savingMetadata, setSavingMetadata] = useState(false);

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

    const fetchAll = useCallback(async () => {
        try {
            const [itemsRes, studioRes] = await Promise.all([
                fetch('/api/theater/items'),
                fetch('/api/theater/audiobooks/studio')
            ]);
            if (itemsRes.ok) {
                const itemsData = await itemsRes.json();
                const allItems = Array.isArray(itemsData?.items) ? itemsData.items : [];
                setRawItems(allItems.filter((i: any) => i.type === 'audiobook' || i.libraryType === 'audiobooks'));
            }
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
                setCollections(sData.collections || []);
                setStudioConfig(sData.config || {});
                setWorkerState(sData.worker || {});
                if (sData.config?.rawUnifiedApiKey && !apiKeyInput) {
                    setApiKeyInput(sData.config.rawUnifiedApiKey);
                }
            }
        } catch (err) {
            console.error('Failed to load audiobooks studio data:', err);
        } finally {
            setLoading(false);
        }
    }, [apiKeyInput]);

    useEffect(() => {
        fetchAll();
        const timer = setInterval(fetchAll, 6000);
        return () => clearInterval(timer);
    }, [fetchAll]);

    const groupedBooks = useMemo(() => {
        const map = new Map<string, any>();
        for (const item of rawItems) {
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

        const list = Array.from(map.values()).map(book => {
            const meta = studioBooksMap[book.bookKey] ||
                Object.values(studioBooksMap).find((m: any) => (m.title || '').toLowerCase() === book.title.toLowerCase());
            const effectiveBookKey = meta?.book_key || book.bookKey;
            const totalCh = Math.max(1, meta?.total_chapters || book.chapters.length || 1);
            const transCh = meta?.transcribed_chapters || 0;
            const illCh = meta?.illustrated_chapters || 0;
            const enhCh = meta?.enhanced_chapters || 0;
            const transPct = Math.min(100, Math.round((transCh / totalCh) * 100));
            const illPct = Math.min(100, Math.round((illCh / totalCh) * 100));
            const totalPct = Math.min(100, Math.round((transPct + illPct) / 2));

            return {
                ...book,
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
                illustratedScenes: Number(meta?.illustrated_scenes || 0),
                isQueued: meta?.is_queued === 1,
                queueOrder: meta?.queue_order || 0
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
    }, [rawItems, studioBooksMap, searchQuery]);

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
                        chapterKey: `${book.bookKey}::ch${idx + 1}`,
                        title: t.title || t.name || `Chapter ${idx + 1}`,
                        path: t.path || '',
                        durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : 0
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
                toast.success(`Queued "${book.title}" for full-book transcription & scene illustration`);
                fetchAll();
            }
        } catch {
            toast.error('Failed to queue audiobook');
        }
    };

    const openEditMetadataModal = (book: any) => {
        setEditingBook(book);
        setEditTitle(book.title || '');
        setEditAuthor(book.author || '');
        setEditTranslator(book.translator || '');
        setEditNarrator(book.narrator || '');
        setEditGenre(book.genre || '');
        setEditYear(book.publishedYear ? String(book.publishedYear) : '');
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
                setEditingBook(null);
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

    const handleAiAutoGroupCollections = async () => {
        setAiGroupingCollections(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ai_create_collections' })
            });
            if (res.ok) {
                const data = await res.json();
                setCollections(data.collections || []);
                toast.success(`Created/updated ${(data.collections || []).length} collections`);
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
                id: editingCollectionId || undefined,
                name: collectionName.trim(),
                description: collectionDesc.trim(),
                bookKeys: collectionBookKeys
            })
        });
        if (res.ok) {
            const data = await res.json();
            setCollections(data.collections || []);
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
            body: JSON.stringify({ action: 'delete_collection', id })
        });
        if (res.ok) {
            const data = await res.json();
            setCollections(data.collections || []);
            toast.success('Collection deleted');
        }
    };

    const handlePreviewRename = async (bookKey: string) => {
        if (!bookKey) return;
        setRenamingBusy(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename_book_files', bookKey, dryRun: true })
            });
            if (res.ok) {
                const data = await res.json();
                setRenamePreview(data.renamed || []);
            }
        } finally {
            setRenamingBusy(false);
        }
    };

    const handleExecuteRename = async () => {
        if (!selectedRenameBookKey) return;
        setRenamingBusy(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename_book_files', bookKey: selectedRenameBookKey, dryRun: false })
            });
            if (res.ok) {
                const data = await res.json();
                setRenamePreview(data.renamed || []);
                toast.success(`Renamed ${(data.renamed || []).filter((r: any) => r.status === 'renamed').length} chapter files`);
                fetchAll();
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
            .sort((a, b) => (a.queueOrder || 999) - (b.queueOrder || 999));
    }, [groupedBooks]);

    return (
        <div className="space-y-6">
            {/* Top Management Navigation Strip */}
            <div className="p-5 rounded-[2rem] bg-zinc-950/90 border border-zinc-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen size={14} /> Audiobook Studio &amp; Library Manager
                        </span>
                        {workerState?.running && (
                            <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse">
                                <RefreshCw size={12} className="animate-spin" />
                                {workerState.currentTask || 'Processing queue...'}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-zinc-400">
                        Edit canonical authors, translators, narrators, collections, file names, and manage whole-book AI transcriptions &amp; illustrations.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 flex-wrap gap-1">
                        <button
                            onClick={() => setActiveSubTab('books')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                activeSubTab === 'books' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <BookOpen size={14} /> Books &amp; Metadata ({groupedBooks.length})
                        </button>
                        <button
                            onClick={() => setActiveSubTab('collections')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                activeSubTab === 'collections' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Layers size={14} /> Collections ({collections.length})
                        </button>
                        <button
                            onClick={() => setActiveSubTab('renamer')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                activeSubTab === 'renamer' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Wrench size={14} /> File Renamer
                        </button>
                        <button
                            onClick={() => setActiveSubTab('queue_settings')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                activeSubTab === 'queue_settings' ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Sliders size={14} /> AI Queue &amp; Defaults ({queuedBooks.length})
                        </button>
                    </div>
                </div>
            </div>

            {/* SUB-TAB 1: BOOKS & METADATA EDITOR */}
            {activeSubTab === 'books' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-md">
                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search books by title, canonical author, translator, narrator..."
                                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <a
                                href="/theater?tab=audiobooks"
                                className="px-4 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-bold flex items-center gap-1.5 transition-all"
                            >
                                <Play size={13} className="text-orange-400" /> Open Bookshelf in Theater
                            </a>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-16 text-center text-zinc-500 text-xs font-bold">Loading audiobooks...</div>
                    ) : groupedBooks.length === 0 ? (
                        <div className="p-16 rounded-3xl bg-zinc-950/60 border border-zinc-900 text-center space-y-2">
                            <BookOpen size={36} className="mx-auto text-zinc-700" />
                            <p className="text-sm font-bold text-white">No Audiobooks Found</p>
                            <p className="text-xs text-zinc-500">Add an Audiobooks folder via &ldquo;Libraries &amp; Folders&rdquo; above.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {groupedBooks.map(book => (
                                <div
                                    key={book.id}
                                    className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 flex gap-4 items-start justify-between transition-all shadow-lg"
                                >
                                    <div className="flex gap-4 min-w-0 flex-1">
                                        <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                                            {book.posterUrl ? (
                                                <img src={book.posterUrl} alt={book.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <BookOpen size={28} className="text-orange-500/40" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-sm sm:text-base font-black text-white truncate">{book.title}</h3>
                                                {book.publishedYear && (
                                                    <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 text-[10px] font-mono font-bold">
                                                        {book.publishedYear}
                                                    </span>
                                                )}
                                                {book.genre && (
                                                    <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px] font-bold">
                                                        {book.genre}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="text-xs text-zinc-400 space-y-0.5">
                                                <p className="font-bold text-orange-400">Author: <span className="text-white">{book.author}</span></p>
                                                {book.translator && <p className="text-[11px]">Translator: <span className="text-zinc-300">{book.translator}</span></p>}
                                                {book.narrator && <p className="text-[11px]">Narrator: <span className="text-zinc-300">{book.narrator}</span></p>}
                                            </div>

                                            {/* Real Counters: Time Transcribed & Scenes Illustrated */}
                                            <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                                                <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/25">
                                                    Transcribed: {formatSec(book.transcribedSec)}{book.totalDurSec > 0 ? ` / ${formatSec(book.totalDurSec)}` : ''} ({book.transCh}/{book.totalCh} ch)
                                                </span>
                                                <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/25">
                                                    Illustrated: {book.illustratedScenes} scenes ({book.illCh}/{book.totalCh} ch)
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <button
                                            onClick={() => openEditMetadataModal(book)}
                                            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Edit3 size={12} className="text-orange-400" /> Edit
                                        </button>
                                        <button
                                            onClick={() => handleSyncAndQueueBook(book, true)}
                                            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/35 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                                            title="Queue whole book for real Speech-to-Text transcription and scene art"
                                        >
                                            <Sparkles size={12} /> Generate Book
                                        </button>
                                    </div>
                                </div>
                            ))}
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
                            >
                                <Sparkles size={12} className={aiGroupingCollections ? 'animate-spin' : ''} />
                                {aiGroupingCollections ? 'Grouping...' : 'AI Auto-Group'}
                            </button>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="text"
                                value={collectionName}
                                onChange={(e) => setCollectionName(e.target.value)}
                                placeholder="Collection / Series Name (e.g. Franz Kafka Complete Works)"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                            />
                            <input
                                type="text"
                                value={collectionDesc}
                                onChange={(e) => setCollectionDesc(e.target.value)}
                                placeholder="Optional description..."
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                            />
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-zinc-400">Select Books ({collectionBookKeys.length} selected)</label>
                                <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-zinc-900 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
                                    {groupedBooks.map(b => {
                                        const checked = collectionBookKeys.includes(b.bookKey);
                                        return (
                                            <label key={b.bookKey} className="flex items-center gap-2.5 py-1.5 px-2 text-xs text-zinc-300 cursor-pointer hover:bg-zinc-800/50 rounded-lg">
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
                                                <span className="text-[10px] text-zinc-500 ml-auto shrink-0">{b.author}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSaveCollection}
                                    className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs uppercase tracking-wider cursor-pointer"
                                >
                                    {editingCollectionId ? 'Update Collection' : 'Save Collection'}
                                </button>
                                {editingCollectionId && (
                                    <button
                                        onClick={() => {
                                            setEditingCollectionId(null);
                                            setCollectionName('');
                                            setCollectionDesc('');
                                            setCollectionBookKeys([]);
                                        }}
                                        className="px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-bold cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-3">
                        {collections.length === 0 ? (
                            <div className="p-12 rounded-3xl bg-zinc-950/60 border border-zinc-900 text-center text-zinc-500 text-xs">
                                No collections yet. Create one on the left or click &ldquo;AI Auto-Group&rdquo;.
                            </div>
                        ) : (
                            collections.map((col: any) => (
                                <div key={col.id} className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="text-sm font-black text-white">{col.name}</h4>
                                        {col.description && <p className="text-xs text-zinc-400 mt-0.5">{col.description}</p>}
                                        <p className="text-[11px] text-orange-400 font-mono mt-1">{(col.book_keys || []).length} books</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingCollectionId(col.id);
                                                setCollectionName(col.name || '');
                                                setCollectionDesc(col.description || '');
                                                setCollectionBookKeys(col.book_keys || []);
                                            }}
                                            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-bold cursor-pointer"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCollection(col.id)}
                                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 cursor-pointer"
                                        >
                                            <Trash2 size={14} />
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
                            Standardize &amp; Rename Audiobook Chapter Files
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Preview and safely rename chapter files on disk to clean sequential numbering (<code className="text-orange-300">01 - Chapter Title.mp3</code>).
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <select
                            value={selectedRenameBookKey}
                            onChange={(e) => {
                                setSelectedRenameBookKey(e.target.value);
                                if (e.target.value) handlePreviewRename(e.target.value);
                            }}
                            className="flex-1 px-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-white"
                        >
                            <option value="">Select an audiobook to preview file renames...</option>
                            {groupedBooks.map(b => (
                                <option key={b.bookKey} value={b.bookKey}>{b.title} — {b.author}</option>
                            ))}
                        </select>
                        <button
                            disabled={!selectedRenameBookKey || renamingBusy}
                            onClick={handleExecuteRename}
                            className="px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-black font-black text-xs uppercase tracking-wider cursor-pointer"
                        >
                            {renamingBusy ? 'Working...' : 'Apply File Renames on Disk'}
                        </button>
                    </div>

                    {renamePreview.length > 0 && (
                        <div className="divide-y divide-zinc-900 rounded-2xl border border-zinc-800 bg-zinc-900/40 max-h-96 overflow-y-auto custom-scrollbar">
                            {renamePreview.map((r, i) => (
                                <div key={i} className="p-3 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <span className="text-zinc-400 truncate">{r.oldPath}</span>
                                    <span className="text-emerald-400 font-bold truncate">→ {r.newPath} ({r.status})</span>
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
                            <label className="text-xs font-bold text-zinc-300">
                                Unified AI API Key (Gemini / OpenAI / Groq — comma-separated supported)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="AIzaSy... or sk-... or gsk_..."
                                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white font-mono"
                                />
                                <button
                                    onClick={() => handleSaveConfig({ unifiedApiKey: apiKeyInput })}
                                    disabled={savingConfig}
                                    className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs uppercase cursor-pointer"
                                >
                                    Save Key
                                </button>
                            </div>
                            <p className="text-[11px] text-zinc-500">
                                Real audio transcription uses Gemini 2.0/1.5 Flash Audio, Groq Whisper Large v3, or OpenAI Whisper-1.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-zinc-400">Default Art Style</label>
                                <select
                                    value={studioConfig?.artStyle || 'cinematic_concept'}
                                    onChange={(e) => handleSaveConfig({ artStyle: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-white"
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
                                <label className="text-[11px] font-bold text-zinc-400">Default Narrator Voice Preset</label>
                                <select
                                    value={studioConfig?.voicePreset || 'warm_storyteller'}
                                    onChange={(e) => handleSaveConfig({ voicePreset: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-white"
                                >
                                    <option value="original">Original Narrator</option>
                                    <option value="warm_storyteller">Warm Fireside Storyteller</option>
                                    <option value="deep_cinema">Deep Cinema Narrator</option>
                                    <option value="crisp_modern">Crisp Studio Voice</option>
                                    <option value="late_night_radio">Late-Night Velvet Radio</option>
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
                                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/35 text-xs font-black cursor-pointer"
                            >
                                Run Queue Now
                            </button>
                        </div>

                        {queuedBooks.length === 0 ? (
                            <p className="text-xs text-zinc-500 py-8 text-center">
                                No books currently in queue. Click &ldquo;Generate Book&rdquo; on any book to start.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {queuedBooks.map((b, idx) => (
                                    <div key={b.bookKey} className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-white truncate">#{idx + 1} • {b.title}</p>
                                            <p className="text-[11px] text-zinc-400 font-mono">
                                                Transcribed: {formatSec(b.transcribedSec)} • Scenes: {b.illustratedScenes}
                                            </p>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                await fetch('/api/theater/audiobooks/studio', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ action: 'unqueue_book', bookKey: b.bookKey })
                                                });
                                                fetchAll();
                                            }}
                                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 text-[11px] font-bold cursor-pointer"
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

            {/* EDIT BOOK METADATA MODAL */}
            {editingBook && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setEditingBook(null); }}
                    className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
                >
                    <div className="bg-[#0c0c0e] border border-zinc-800 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <Edit3 size={16} className="text-orange-400" />
                                Edit Book Metadata
                            </h3>
                            <button onClick={() => setEditingBook(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-zinc-400">Book Title</label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-zinc-400">Canonical Author (Used to group all works by this author)</label>
                                <input
                                    type="text"
                                    value={editAuthor}
                                    onChange={(e) => setEditAuthor(e.target.value)}
                                    placeholder="e.g. Franz Kafka"
                                    className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-zinc-400">Translator (Optional)</label>
                                    <input
                                        type="text"
                                        value={editTranslator}
                                        onChange={(e) => setEditTranslator(e.target.value)}
                                        placeholder="e.g. Ian Johnston"
                                        className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-zinc-400">Narrator (Optional)</label>
                                    <input
                                        type="text"
                                        value={editNarrator}
                                        onChange={(e) => setEditNarrator(e.target.value)}
                                        placeholder="e.g. LibriVox"
                                        className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-zinc-400">Genre</label>
                                    <input
                                        type="text"
                                        value={editGenre}
                                        onChange={(e) => setEditGenre(e.target.value)}
                                        placeholder="e.g. Classic Fiction"
                                        className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-zinc-400">Publication Year</label>
                                    <input
                                        type="number"
                                        value={editYear}
                                        onChange={(e) => setEditYear(e.target.value)}
                                        placeholder="e.g. 1915"
                                        className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setEditingBook(null)}
                                className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-bold cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveBookMetadata}
                                disabled={savingMetadata}
                                className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs uppercase cursor-pointer"
                            >
                                {savingMetadata ? 'Saving...' : 'Save Metadata'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

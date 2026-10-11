'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BookOpen, Sparkles, Sliders, FolderPlus, Edit3, Trash2, Check,
    RefreshCw, Play, Zap, FileText, Image as ImageIcon, Mic2,
    Search, User, Layers, Wrench, X, Plus, Headphones, ChevronDown, ChevronUp, Wand2
} from 'lucide-react';
import { toast } from 'sonner';

const CLIENT_BOOK_CATALOG: Array<{ pattern: RegExp; cleanTitle: string; collection: string; bookNumber: number; releaseYear: string }> = [
    // Alastair Reynolds — Poseidon's Children
    { pattern: /\bblue\s+remembered\s+earth\b/i, cleanTitle: 'Blue Remembered Earth', collection: "Poseidon's Children", bookNumber: 1, releaseYear: '2012' },
    { pattern: /\bon\s+the\s+steel\s+breeze\b/i, cleanTitle: 'On the Steel Breeze', collection: "Poseidon's Children", bookNumber: 2, releaseYear: '2013' },
    { pattern: /\bposeidon'?s\s+wake\b/i, cleanTitle: "Poseidon's Wake", collection: "Poseidon's Children", bookNumber: 3, releaseYear: '2015' },
    // Alastair Reynolds — Revelation Space Universe
    { pattern: /\brevelation\s+space\b/i, cleanTitle: 'Revelation Space', collection: 'Revelation Space', bookNumber: 1, releaseYear: '2000' },
    { pattern: /\bchasm\s+city\b/i, cleanTitle: 'Chasm City', collection: 'Revelation Space', bookNumber: 2, releaseYear: '2001' },
    { pattern: /\bredemption\s+ark\b/i, cleanTitle: 'Redemption Ark', collection: 'Revelation Space', bookNumber: 3, releaseYear: '2002' },
    { pattern: /\babsolution\s+gap\b/i, cleanTitle: 'Absolution Gap', collection: 'Revelation Space', bookNumber: 4, releaseYear: '2003' },
    { pattern: /\binhibitor\s+phase\b/i, cleanTitle: 'Inhibitor Phase', collection: 'Revelation Space', bookNumber: 5, releaseYear: '2021' },
    { pattern: /\bgalactic\s+north\b/i, cleanTitle: 'Galactic North', collection: 'Revelation Space', bookNumber: 6, releaseYear: '2006' },
    { pattern: /\bdiamond\s+dogs.*turquoise\s+days\b/i, cleanTitle: 'Diamond Dogs, Turquoise Days', collection: 'Revelation Space', bookNumber: 7, releaseYear: '2003' },
    // Alastair Reynolds — Prefect Dreyfus Emergencies
    { pattern: /\b(the\s+prefect|aurora\s+rising)\b/i, cleanTitle: 'Aurora Rising (The Prefect)', collection: 'Prefect Dreyfus Emergencies', bookNumber: 1, releaseYear: '2007' },
    { pattern: /\belysium\s+fire\b/i, cleanTitle: 'Elysium Fire', collection: 'Prefect Dreyfus Emergencies', bookNumber: 2, releaseYear: '2018' },
    { pattern: /\bmachine\s+vendetta\b/i, cleanTitle: 'Machine Vendetta', collection: 'Prefect Dreyfus Emergencies', bookNumber: 3, releaseYear: '2024' },
    // Alastair Reynolds — Revenger Trilogy
    { pattern: /\brevenger\b/i, cleanTitle: 'Revenger', collection: 'Revenger Trilogy', bookNumber: 1, releaseYear: '2016' },
    { pattern: /\bshadow\s+captain\b/i, cleanTitle: 'Shadow Captain', collection: 'Revenger Trilogy', bookNumber: 2, releaseYear: '2019' },
    { pattern: /\bbone\s+silence\b/i, cleanTitle: 'Bone Silence', collection: 'Revenger Trilogy', bookNumber: 3, releaseYear: '2020' },
    // Alastair Reynolds — Standalones & Novellas
    { pattern: /\bcentury\s+rain\b/i, cleanTitle: 'Century Rain', collection: '', bookNumber: 0, releaseYear: '2004' },
    { pattern: /\bpushing\s+ice\b/i, cleanTitle: 'Pushing Ice', collection: '', bookNumber: 0, releaseYear: '2005' },
    { pattern: /\bhouse\s+of\s+suns\b/i, cleanTitle: 'House of Suns', collection: '', bookNumber: 0, releaseYear: '2008' },
    { pattern: /\bterminal\s+world\b/i, cleanTitle: 'Terminal World', collection: '', bookNumber: 0, releaseYear: '2010' },
    { pattern: /\btroika\b/i, cleanTitle: 'Troika', collection: '', bookNumber: 0, releaseYear: '2011' },
    { pattern: /\bslow\s+bullets\b/i, cleanTitle: 'Slow Bullets', collection: '', bookNumber: 0, releaseYear: '2015' },
    { pattern: /\bbeyond\s+the\s+aquila\s+rift\b/i, cleanTitle: 'Beyond the Aquila Rift', collection: '', bookNumber: 0, releaseYear: '2016' },
    { pattern: /\bpermafrost\b/i, cleanTitle: 'Permafrost', collection: '', bookNumber: 0, releaseYear: '2019' },
    { pattern: /\beversion\b/i, cleanTitle: 'Eversion', collection: '', bookNumber: 0, releaseYear: '2022' },
    { pattern: /\bzima\s+blue\b/i, cleanTitle: 'Zima Blue and Other Stories', collection: '', bookNumber: 0, releaseYear: '2006' },
    { pattern: /\bthousandth\s+night\b/i, cleanTitle: 'Thousandth Night', collection: '', bookNumber: 0, releaseYear: '2005' },
    { pattern: /\bbelladonna\s+nights\b/i, cleanTitle: 'Belladonna Nights', collection: '', bookNumber: 0, releaseYear: '2021' },
    // Cixin Liu — Remembrance of Earth's Past (Three-Body Trilogy)
    { pattern: /\b(the\s+)?three[- ]body\s+problem\b/i, cleanTitle: 'The Three-Body Problem', collection: "Remembrance of Earth's Past", bookNumber: 1, releaseYear: '2008' },
    { pattern: /\b(the\s+)?dark\s+forest\b/i, cleanTitle: 'The Dark Forest', collection: "Remembrance of Earth's Past", bookNumber: 2, releaseYear: '2008' },
    { pattern: /\bdeath'?s\s+end\b/i, cleanTitle: "Death's End", collection: "Remembrance of Earth's Past", bookNumber: 3, releaseYear: '2010' },
    // Frank Herbert — Pandora Sequence
    { pattern: /\bdestination[:\s]+void\b/i, cleanTitle: 'Destination: Void', collection: 'Pandora Sequence', bookNumber: 1, releaseYear: '1966' },
    { pattern: /\bthe\s+jesus\s+incident\b/i, cleanTitle: 'The Jesus Incident', collection: 'Pandora Sequence', bookNumber: 2, releaseYear: '1979' },
    { pattern: /\bthe\s+lazarus\s+effect\b/i, cleanTitle: 'The Lazarus Effect', collection: 'Pandora Sequence', bookNumber: 3, releaseYear: '1983' },
    { pattern: /\bthe\s+ascension\s+factor\b/i, cleanTitle: 'The Ascension Factor', collection: 'Pandora Sequence', bookNumber: 4, releaseYear: '1988' },
    // Frank Herbert — Dune Chronicles
    { pattern: /^(\d+\s*[-_.]*\s*)?dune$/i, cleanTitle: 'Dune', collection: 'Dune Chronicles', bookNumber: 1, releaseYear: '1965' },
    { pattern: /\bdune\s+messiah\b/i, cleanTitle: 'Dune Messiah', collection: 'Dune Chronicles', bookNumber: 2, releaseYear: '1969' },
    { pattern: /\bchildren\s+of\s+dune\b/i, cleanTitle: 'Children of Dune', collection: 'Dune Chronicles', bookNumber: 3, releaseYear: '1976' },
    { pattern: /\bgod\s+emperor\s+of\s+dune\b/i, cleanTitle: 'God Emperor of Dune', collection: 'Dune Chronicles', bookNumber: 4, releaseYear: '1981' },
    { pattern: /\bheretics\s+of\s+dune\b/i, cleanTitle: 'Heretics of Dune', collection: 'Dune Chronicles', bookNumber: 5, releaseYear: '1984' },
    { pattern: /\bchapterhouse[:\s]+dune\b/i, cleanTitle: 'Chapterhouse: Dune', collection: 'Dune Chronicles', bookNumber: 6, releaseYear: '1985' },
    // Frank Herbert — ConSentiency
    { pattern: /\bwhipping\s+star\b/i, cleanTitle: 'Whipping Star', collection: 'ConSentiency', bookNumber: 1, releaseYear: '1970' },
    { pattern: /\bthe\s+dosadi\s+experiment\b/i, cleanTitle: 'The Dosadi Experiment', collection: 'ConSentiency', bookNumber: 2, releaseYear: '1977' }
];

function parseBookMetaClient(rawBookTitle: string, folder?: string, filePath?: string) {
    let working = (rawBookTitle || '').trim();
    let releaseYear: string | undefined;
    let bookNumber: number | undefined;
    let inferredCollection: string | undefined;

    const yearMatch = working.match(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/) ||
        (folder || '').match(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/) ||
        (filePath || '').match(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/);
    if (yearMatch) {
        releaseYear = yearMatch[1];
        working = working.replace(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/g, '').trim();
    }

    const leadYearMatch = working.match(/^(19\d{2}|20\d{2})\s*[-–—._:]+\s*(.+)$/);
    if (leadYearMatch) {
        if (!releaseYear) releaseYear = leadYearMatch[1];
        working = leadYearMatch[2].trim();
    }

    const trailYearMatch = working.match(/^(.+?)\s+[-–—]\s*(19\d{2}|20\d{2})$/);
    if (trailYearMatch) {
        if (!releaseYear) releaseYear = trailYearMatch[2];
        working = trailYearMatch[1].trim();
    }

    const bracketSeries = working.match(/^[\[\(]([^\]\)]+?)\s*(?:#|book\s*|vol\.?\s*)(\d{1,2})[\]\)]\s*[-–—:]?\s*(.+)$/i);
    if (bracketSeries) {
        inferredCollection = bracketSeries[1].trim();
        bookNumber = parseInt(bracketSeries[2], 10);
        working = bracketSeries[3].trim();
    }

    const leadNumMatch = working.match(/^(?:book\s*|vol\.?\s*|#)?(\d{1,2})\s*[-–—._:]+\s*(.+)$/i);
    if (leadNumMatch) {
        if (!bookNumber) bookNumber = parseInt(leadNumMatch[1], 10);
        working = leadNumMatch[2].trim();
    }

    const secondLeadYear = working.match(/^(19\d{2}|20\d{2})\s*[-–—._:]+\s*(.+)$/);
    if (secondLeadYear) {
        if (!releaseYear) releaseYear = secondLeadYear[1];
        working = secondLeadYear[2].trim();
    }

    const trailBookNum = working.match(/^(.+?)\s*[\(\[]\s*(?:book|vol\.?|volume|#)\s*(\d{1,2})\s*[\)\]]$/i);
    if (trailBookNum) {
        if (!bookNumber) bookNumber = parseInt(trailBookNum[2], 10);
        working = trailBookNum[1].trim();
    }

    working = working
        .replace(/\s*[\[\(]\s*(?:original(?:\s+audio)?|optimized(?:\s+hq|\s+audio)?|unabridged|abridged|m4b|mp3|flac|aac|\d+\s*kbps|read\s+by\s+[^\]\)]+|narrated\s+by\s+[^\]\)]+)\s*[\]\)]/gi, '')
        .replace(/\s*[-_]\s*(?:unabridged|abridged|\d+\s*kbps|m4b|mp3)$/gi, '')
        .trim();

    for (const entry of CLIENT_BOOK_CATALOG) {
        if (entry.pattern.test(working) || entry.pattern.test(rawBookTitle)) {
            if (!releaseYear && entry.releaseYear) releaseYear = entry.releaseYear;
            if (!bookNumber && entry.bookNumber > 0) bookNumber = entry.bookNumber;
            if (!inferredCollection && entry.collection) inferredCollection = entry.collection;
            working = entry.cleanTitle;
            break;
        }
    }

    return {
        cleanTitle: working || rawBookTitle,
        bookNumber,
        releaseYear,
        inferredCollection
    };
}

function canonicalizeAuthorClient(rawAuthor?: string | null, rawTitle?: string): {
    canonicalAuthor: string;
    translator: string | null;
    narrator: string | null;
} {
    let working = (rawAuthor || '').trim();
    if (!working || working.toLowerCase() === 'unknown' || working.toLowerCase() === 'unknown author') {
        return { canonicalAuthor: 'Unknown Author', translator: null, narrator: null };
    }
    let translator: string | null = null;
    let narrator: string | null = null;

    const extractFromText = (str: string) => {
        let s = str;
        const transRe = /[\(\[]\s*(?:trans\.?|translated\s+by|translator:?)\s+([^\)\]]+)[\)\]]/gi;
        let m: RegExpExecArray | null;
        while ((m = transRe.exec(s)) !== null) {
            if (!translator) translator = m[1].trim();
        }
        s = s.replace(transRe, ' ');

        const narrRe = /[\(\[]\s*(?:read\s+by|narrated\s+by|narrator:?|performed\s+by|voiced\s+by)\s+([^\)\]]+)[\)\]]/gi;
        while ((m = narrRe.exec(s)) !== null) {
            if (!narrator) narrator = m[1].trim();
        }
        s = s.replace(narrRe, ' ');
        s = s.replace(/[\(\[]\s*(?:ed\.?|edited\s+by|editor:?|foreword\s+by|intro(?:duction)?\s+by|adapted\s+by|compiled\s+by|abridged\s+by)\s+([^\)\]]+)[\)\]]/gi, ' ');
        return s;
    };

    working = extractFromText(working);
    if (rawTitle) extractFromText(rawTitle);

    working = working
        .replace(/,\s*(?:trans\.?|translated\s+by)\s+([^,;]+)$/i, (_, t) => {
            if (!translator) translator = t.trim();
            return '';
        })
        .replace(/,\s*(?:read\s+by|narrated\s+by)\s+([^,;]+)$/i, (_, n) => {
            if (!narrator) narrator = n.trim();
            return '';
        })
        .replace(/[\(\[]\s*\d{3,4}\s*[-–—]\s*\d{0,4}\s*[\)\]]/g, ' ')
        .replace(/[\(\[][^\)\]]*[\)\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[-–—,:;\s]+|[-–—,:;\s]+$/g, '')
        .trim();

    const parts = working.split(/\s*(?:;|\/|&|\band\b)\s*/i).map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) working = parts[0];

    if (/^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+,\s*[A-Za-zÀ-ÖØ-öø-ÿ.'-\s]+$/.test(working)) {
        const [last, first] = working.split(',').map(s => s.trim());
        if (first && last) working = `${first} ${last}`;
    }

    working = working.replace(/\s+/g, ' ').replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '').trim();
    return {
        canonicalAuthor: working || 'Unknown Author',
        translator,
        narrator
    };
}

function inferBookGenre(title: string, author: string, collection?: string): string {
    const combined = `${title} ${author} ${collection || ''}`.toLowerCase();
    if (/reynolds|herbert|asimov|clarke|cixin|dune|revelation\s+space|poseidon|hyperion|neuromancer|foundation|sci-fi|science\s+fiction|space|galactic|cyberpunk|mars|robot|android|three-body|dark\s+forest/.test(combined)) {
        return 'Science Fiction';
    }
    if (/tolkien|martin|rowling|sanderson|jordan|witcher|dragon|fantasy|magic|throne|rings|hobbit|narnia|wizard|myth/.test(combined)) {
        return 'Fantasy';
    }
    if (/kafka|dostoevsky|tolstoy|orwell|camus|dickens|austen|homer|shakespeare|metamorphosis|trial|castle|classic|literature|odyssey|iliad/.test(combined)) {
        return 'Classics & Literature';
    }
    if (/christie|doyle|sherlock|poirot|thriller|mystery|detective|crime|murder|noir/.test(combined)) {
        return 'Mystery & Thriller';
    }
    if (/king|lovecraft|poe|horror|ghost|cthulhu|haunting/.test(combined)) {
        return 'Horror & Supernatural';
    }
    if (/history|biography|memoir|philosophy|psychology|science|sapiens|non-fiction/.test(combined)) {
        return 'Non-Fiction & History';
    }
    return 'Fiction & Literature';
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

function formatMMSS(sec: number): string {
    const s = Math.max(0, Math.floor(sec || 0));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

export function AudiobooksMediaManager() {
    const [activeSubTab, setActiveSubTab] = useState<'books' | 'collections' | 'renamer' | 'queue_settings'>('books');
    const [loading, setLoading] = useState(true);
    const [rescanning, setRescanning] = useState(false);

    // Filtering & Sorting (identical to Theater tab)
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGenreFilter, setSelectedGenreFilter] = useState<string>('ALL');
    const [selectedAuthorFilter, setSelectedAuthorFilter] = useState<string>('ALL');
    const [sortBy, setSortBy] = useState<'title' | 'author' | 'year' | 'duration'>('title');
    const [audiobookLibraries, setAudiobookLibraries] = useState<any[]>([]);
    const [selectedLibraryFilter, setSelectedLibraryFilter] = useState<string>('all');

    const [rawItems, setRawItems] = useState<any[]>([]);
    const [studioBooksMap, setStudioBooksMap] = useState<Record<string, any>>({});
    const [studioChaptersMap, setStudioChaptersMap] = useState<Record<string, any>>({});
    const [collections, setCollections] = useState<any[]>([]);
    const [studioConfig, setStudioConfig] = useState<any>(null);
    const [workerState, setWorkerState] = useState<any>(null);

    // Book Modal state:
    // Top-level tabs: 'book' (Book data, fetched metadata, chapters) | 'ai' (AI Features)
    // Inside 'ai', ONLY 3 subtabs: 'illustration' | 'transcription' | 'voice'
    const [editingBook, setEditingBook] = useState<any | null>(null);
    const [bookModalMainTab, setBookModalMainTab] = useState<'book' | 'ai'>('ai');
    const [aiSubTab, setAiSubTab] = useState<'illustration' | 'transcription' | 'voice'>('illustration');
    const [expandedChapterIndices, setExpandedChapterIndices] = useState<Record<number, boolean>>({ 0: true });

    // Auto-fetched book metadata (Cover, Synopsis, Author Bio, Year, Genre)
    const [fetchedDetails, setFetchedDetails] = useState<{
        loading: boolean;
        description?: string;
        authorBio?: string;
        coverUrl?: string;
        releaseYear?: string;
        genre?: string;
        narrator?: string;
    }>({ loading: false });

    // Editable Book Metadata fields
    const [editTitle, setEditTitle] = useState('');
    const [editAuthor, setEditAuthor] = useState('');
    const [editTranslator, setEditTranslator] = useState('');
    const [editNarrator, setEditNarrator] = useState('');
    const [editGenre, setEditGenre] = useState('');
    const [editYear, setEditYear] = useState('');
    const [editCoverUrl, setEditCoverUrl] = useState('');
    const [savingMetadata, setSavingMetadata] = useState(false);

    // Prominent AI Gen Options (Styles & Number of Alternatives)
    const [editArtStyle, setEditArtStyle] = useState('Cinematic Concept Art');
    const [editScenesPerChapter, setEditScenesPerChapter] = useState<number>(3);
    const [editNumAlternatives, setEditNumAlternatives] = useState<number>(2);
    const [editSceneFocus, setEditSceneFocus] = useState('auto-choice');
    const [editVisualNotes, setEditVisualNotes] = useState('');

    // Transcription Gen Options
    const [editSttEngine, setEditSttEngine] = useState('gemini_audio');
    const [editTranscriptAlternatives, setEditTranscriptAlternatives] = useState('synced_lines');

    // Voice Gen Options
    const [editVoicePreset, setEditVoicePreset] = useState('clear_voice');
    const [editEnhancePreset, setEditEnhancePreset] = useState('denoise_clarity');

    // Busy states & Scene drafts
    const [scenePromptDrafts, setScenePromptDrafts] = useState<Record<string, string>>({});
    const [repaintingSceneKey, setRepaintingSceneKey] = useState<string | null>(null);
    const [runningStudioAction, setRunningStudioAction] = useState<string | null>(null);
    const [runningChapterTaskKey, setRunningChapterTaskKey] = useState<string | null>(null);
    const [didHandleInitialUrlParams, setDidHandleInitialUrlParams] = useState(false);

    // Series / Collections state
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

    // Build clean book list using the exact same parser & catalog as Theater
    const allBooks = useMemo(() => {
        const map = new Map<string, any>();

        const isGenericMeta = (val: string | undefined | null, libName?: string): boolean => {
            if (!val) return true;
            const v = val.trim();
            if (!v) return true;
            if (libName && v.toLowerCase() === libName.trim().toLowerCase()) return true;
            return /^(\[?\s*unknown(\s+(album|artist|author|book|track))?\s*\]?|various(\s+artists)?|audiobooks?|audio\s*books?|books?|spoken\s*word|podcasts?|music|media|library|root|single|untagged|default)$/i.test(v);
        };

        const stripPartSuffix = (str: string): string => {
            const cleaned = str
                .replace(/\s*[-–—:|]\s*(?:chapter|ch\.?|part|pt\.?|track|disc|cd|vol\.?|volume|book)\s*\d+(?:\s*of\s*\d+)?.*$/i, '')
                .replace(/\s*[\(\[]\s*(?:chapter|ch\.?|part|pt\.?|track|disc|cd|unabridged|abridged|audiobook)\s*\d*[^\)\]]*[\)\]]\s*$/i, '')
                .replace(/\s+(?:chapter|ch\.?|part|pt\.?)\s+\d+(?:\s*of\s*\d+)?$/i, '')
                .trim();
            return cleaned.length >= 2 ? cleaned : str.trim();
        };

        for (const item of rawItems) {
            if (selectedLibraryFilter !== 'all' && item.libraryId && item.libraryId !== selectedLibraryFilter) {
                continue;
            }
            const libName = item.libraryName;
            let rawBookTitle = !isGenericMeta(item.album, libName) ? item.album!.trim() : '';
            let rawAuthorStr = !isGenericMeta(item.artist, libName) ? item.artist!.trim() : '';

            if (!rawBookTitle && !isGenericMeta(item.folder, libName)) {
                const folderClean = item.folder.trim();
                const folderDash = folderClean.match(/^([^-–—]+?)\s+[-–—]\s+(.+)$/);
                if (folderDash) {
                    const leftCandidate = folderDash[1].trim();
                    if (/^(19\d{2}|20\d{2}|\d{1,2})$/.test(leftCandidate)) {
                        rawBookTitle = stripPartSuffix(folderClean);
                    } else {
                        if (!rawAuthorStr) rawAuthorStr = leftCandidate;
                        rawBookTitle = stripPartSuffix(folderDash[2].trim());
                    }
                } else {
                    rawBookTitle = stripPartSuffix(folderClean);
                }
            }

            if (!rawBookTitle) {
                rawBookTitle = stripPartSuffix((item.bookTitle || item.title || item.name || 'Untitled Book').replace(/\.(mp3|flac|m4a|m4b|wav|aac|ogg|opus|mp4)$/i, ''));
            }
            if (!rawAuthorStr) {
                rawAuthorStr = item.canonicalAuthor || item.author || 'Unknown Author';
            }

            const parsedTitle = parseBookMetaClient(rawBookTitle, item.folder, item.path);
            const parsedAuthor = canonicalizeAuthorClient(rawAuthorStr, rawBookTitle);
            const cleanTitle = parsedTitle.cleanTitle;
            const canonicalAuthor = parsedAuthor.canonicalAuthor;

            const bKey = `${canonicalAuthor} - ${cleanTitle}`.toLowerCase().trim();
            if (!map.has(bKey)) {
                map.set(bKey, {
                    id: `ab-${bKey}`,
                    bookKey: bKey,
                    title: cleanTitle,
                    rawTitle: rawBookTitle,
                    cleanTitle,
                    bookNumber: parsedTitle.bookNumber,
                    releaseYear: parsedTitle.releaseYear || (item.releaseYear ? String(item.releaseYear) : null),
                    inferredCollection: parsedTitle.inferredCollection || null,
                    author: canonicalAuthor,
                    translator: item.translator || parsedAuthor.translator || null,
                    narrator: item.narrator || parsedAuthor.narrator || null,
                    genre: inferBookGenre(cleanTitle, canonicalAuthor, parsedTitle.inferredCollection),
                    posterUrl: item.posterUrl || null,
                    libraryId: item.libraryId || null,
                    libraryName: item.libraryName || 'Audiobooks',
                    chapters: [],
                    totalDurationMs: 0,
                    sizeBytes: 0
                });
            }
            const entry = map.get(bKey)!;
            entry.chapters.push(item);
            entry.totalDurationMs += item.durationMs || 0;
            entry.sizeBytes += item.sizeBytes || 0;
            if (!entry.posterUrl && item.posterUrl) entry.posterUrl = item.posterUrl;
        }

        // Sort chapters numerically inside each book
        for (const b of map.values()) {
            b.chapters.sort((a: any, c: any) => (a.trackNumber || 0) - (c.trackNumber || 0) || String(a.title || '').localeCompare(String(c.title || '')));
        }

        const list = Array.from(map.values()).map(book => {
            const rawAltKey = `${book.author} - ${book.rawTitle}`.toLowerCase().trim();
            const meta =
                studioBooksMap[book.bookKey] ||
                studioBooksMap[rawAltKey] ||
                Object.values(studioBooksMap).find((m: any) => {
                    const mClean = parseBookMetaClient(String(m?.title || '')).cleanTitle.toLowerCase();
                    return mClean === book.cleanTitle.toLowerCase();
                });
            const effectiveBookKey = meta?.book_key || book.bookKey;

            // Gather deduplicated chapters from SQLite matching this book
            const dbChaps = Object.values(studioChaptersMap)
                .filter((c: any) => c.book_key === effectiveBookKey || c.book_key === book.bookKey || c.book_key === rawAltKey)
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

            // Always use the real physical chapter count when effectiveChapters exist so 3-chapter books never say 6
            const totalCh = Math.max(1, effectiveChapters.length > 0 ? effectiveChapters.length : (dbChaps.length || meta?.total_chapters || 1));

            // Count transcribed, illustrated, and voice-enhanced chapters across the actual chapters
            let transCh = 0;
            let illCh = 0;
            let enhCh = 0;
            let totalScenesCount = 0;

            effectiveChapters.forEach((chTrack: any, idx: number) => {
                const cMeta =
                    studioChaptersMap[chTrack.chapterKey] ||
                    studioChaptersMap[chTrack.id] ||
                    studioChaptersMap[`${effectiveBookKey}::ch${idx + 1}`] ||
                    studioChaptersMap[`${book.bookKey}::ch${idx + 1}`] ||
                    dbChaps.find((c: any) => Number(c.chapter_index) === idx + 1 || Number(c.chapter_index) === idx || (chTrack.path && c.file_path === chTrack.path));

                if (cMeta) {
                    if (cMeta.transcription_status === 'completed' && cMeta.synced_lyrics) transCh++;
                    const validImages = (cMeta.images || []).filter((i: any) => i.kept !== false && i.url && !String(i.url).toLowerCase().includes('.svg'));
                    if (validImages.length > 0) {
                        illCh++;
                        totalScenesCount += validImages.length;
                    }
                    if (cMeta.audio_enhance_status === 'completed' || cMeta.enhanced_audio_path) enhCh++;
                }
            });

            const customCoverUrl = meta?.custom_cover_url && !String(meta.custom_cover_url).toLowerCase().includes('.svg')
                ? meta.custom_cover_url
                : null;
            const effectivePosterUrl = (meta?.use_custom_cover && customCoverUrl)
                ? customCoverUrl
                : (book.posterUrl || meta?.thumb || customCoverUrl || null);

            return {
                ...book,
                chapters: effectiveChapters,
                bookKey: effectiveBookKey,
                title: parseBookMetaClient(meta?.title || book.cleanTitle).cleanTitle,
                cleanTitle: parseBookMetaClient(meta?.title || book.cleanTitle).cleanTitle,
                author: meta?.canonical_author || canonicalizeAuthorClient(meta?.author || book.author).canonicalAuthor,
                translator: meta?.translator || book.translator || null,
                narrator: meta?.narrator || book.narrator || null,
                genre: meta?.genre || book.genre || inferBookGenre(book.cleanTitle, book.author, book.inferredCollection),
                publishedYear: meta?.published_year ? String(meta.published_year) : (book.releaseYear || null),
                posterUrl: effectivePosterUrl,
                customCoverUrl,
                meta,
                totalCh,
                transCh,
                illCh,
                enhCh,
                totalDurSec: Number(meta?.total_duration_sec || (book.totalDurationMs ? Math.round(book.totalDurationMs / 1000) : 0)),
                illustratedScenes: totalScenesCount || Number(meta?.illustrated_scenes || 0),
                isQueued: Boolean(meta?.queue_enabled || meta?.is_queued === 1),
                queueOrder: Number(meta?.queue_priority || meta?.queue_order || 0)
            };
        });

        return list;
    }, [rawItems, studioBooksMap, studioChaptersMap, selectedLibraryFilter]);

    // Available Genres & Authors for the Filter Bar
    const availableGenres = useMemo(() => {
        return Array.from(new Set(allBooks.map(b => b.genre).filter(Boolean))).sort();
    }, [allBooks]);

    const availableAuthors = useMemo(() => {
        const counts = new Map<string, number>();
        for (const b of allBooks) {
            counts.set(b.author, (counts.get(b.author) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allBooks]);

    // Filtered & Sorted Books
    const groupedBooks = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return allBooks
            .filter(b => {
                if (selectedGenreFilter !== 'ALL' && b.genre !== selectedGenreFilter) return false;
                if (selectedAuthorFilter !== 'ALL' && b.author !== selectedAuthorFilter) return false;
                if (!q) return true;
                return (
                    b.title.toLowerCase().includes(q) ||
                    b.author.toLowerCase().includes(q) ||
                    (b.translator && b.translator.toLowerCase().includes(q)) ||
                    (b.narrator && b.narrator.toLowerCase().includes(q)) ||
                    (b.genre && b.genre.toLowerCase().includes(q))
                );
            })
            .sort((a, b) => {
                if (sortBy === 'author') {
                    const cmp = a.author.localeCompare(b.author);
                    if (cmp !== 0) return cmp;
                } else if (sortBy === 'year') {
                    const ya = parseInt(a.publishedYear || '0', 10) || 0;
                    const yb = parseInt(b.publishedYear || '0', 10) || 0;
                    if (ya !== yb) return yb - ya;
                } else if (sortBy === 'duration') {
                    if (a.totalDurSec !== b.totalDurSec) return b.totalDurSec - a.totalDurSec;
                }
                return a.title.localeCompare(b.title);
            });
    }, [allBooks, searchQuery, selectedGenreFilter, selectedAuthorFilter, sortBy]);

    const resolveChapterMeta = useCallback((bookKey: string, chTrack: any, idx: number) => {
        if (!chTrack) return {};
        const candidates = [
            chTrack.chapterKey,
            chTrack.id,
            `${bookKey}::ch${idx + 1}`,
            `${bookKey}::ch${idx}`,
            `${bookKey}::ch-${idx + 1}`
        ].filter(Boolean);
        for (const k of candidates) {
            if (studioChaptersMap[k]) return studioChaptersMap[k];
        }
        const byBookAndIndex = Object.values(studioChaptersMap).find((c: any) =>
            c.book_key === bookKey && (
                Number(c.chapter_index) === idx + 1 ||
                Number(c.chapter_index) === idx ||
                (chTrack.path && c.file_path && c.file_path === chTrack.path)
            )
        );
        return byBookAndIndex || {};
    }, [studioChaptersMap]);

    // Fetch book metadata (cover image, synopsis, author bio, year, genre) from OpenLibrary / iTunes / Google Books
    const handleFetchBookMetadata = useCallback(async (bookToFetch: any, showToast = false) => {
        if (!bookToFetch) return;
        setFetchedDetails(prev => ({ ...prev, loading: true }));
        try {
            const res = await fetch(`/api/theater/audiobooks?title=${encodeURIComponent(bookToFetch.cleanTitle || bookToFetch.title)}&author=${encodeURIComponent(bookToFetch.author)}`);
            if (res.ok) {
                const data = await res.json();
                const info = data?.book || {};
                setFetchedDetails({
                    loading: false,
                    description: info.description || '',
                    authorBio: info.authorBio || '',
                    coverUrl: info.coverUrl || '',
                    releaseYear: info.releaseYear ? String(info.releaseYear) : '',
                    genre: info.genre || '',
                    narrator: info.narrator || ''
                });

                if (info.releaseYear && !editYear) setEditYear(String(info.releaseYear));
                if (info.genre && !editGenre) setEditGenre(info.genre);
                if (info.narrator && !editNarrator) setEditNarrator(info.narrator);
                if (info.coverUrl && !editCoverUrl) setEditCoverUrl(info.coverUrl);

                // If the book had no cover or year in DB, save it automatically so the library shelf has it
                if ((info.coverUrl && !bookToFetch.posterUrl) || (info.releaseYear && !bookToFetch.publishedYear)) {
                    await fetch('/api/theater/audiobooks/studio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'edit_book_metadata',
                            bookKey: bookToFetch.bookKey,
                            title: bookToFetch.title,
                            author: bookToFetch.author,
                            canonicalAuthor: bookToFetch.author,
                            genre: info.genre || bookToFetch.genre || null,
                            publishedYear: info.releaseYear ? Number(info.releaseYear) : (bookToFetch.publishedYear ? Number(bookToFetch.publishedYear) : null),
                            coverUrl: info.coverUrl || bookToFetch.posterUrl || null
                        })
                    });
                    fetchAll(false);
                }

                if (showToast) {
                    toast.success('Fetched book metadata & cover');
                }
            } else {
                setFetchedDetails({ loading: false });
                if (showToast) toast.error('No online metadata found');
            }
        } catch {
            setFetchedDetails({ loading: false });
            if (showToast) toast.error('Metadata lookup failed');
        }
    }, [editYear, editGenre, editNarrator, editCoverUrl, fetchAll]);

    // Ensure book chapters are synced to SQLite whenever a book is opened
    const syncBookChaptersSilently = useCallback(async (book: any) => {
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
                        durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : 300
                    }))
                })
            });
        } catch {}
    }, []);

    const openBookModal = useCallback((
        book: any,
        mainTab: 'book' | 'ai' = 'ai',
        initialAiSubTab: 'illustration' | 'transcription' | 'voice' = 'illustration'
    ) => {
        const meta = studioBooksMap[book.bookKey] || book.meta || {};
        setEditingBook(book);
        setBookModalMainTab(mainTab);
        setAiSubTab(initialAiSubTab);
        setExpandedChapterIndices({ 0: true });
        setEditTitle(book.title || '');
        setEditAuthor(book.author || '');
        setEditTranslator(book.translator || '');
        setEditNarrator(book.narrator || '');
        setEditGenre(book.genre || '');
        setEditYear(book.publishedYear ? String(book.publishedYear) : '');
        setEditCoverUrl(book.posterUrl || '');
        setEditArtStyle(meta.art_style || studioConfig?.artStyle || 'Cinematic Concept Art');
        setEditVoicePreset(meta.voice_preset || studioConfig?.defaultVoicePreset || 'clear_voice');
        setEditEnhancePreset(meta.enhance_preset || studioConfig?.audioEnhancePreset || 'denoise_clarity');
        setEditScenesPerChapter(Number(meta.images_per_chapter || studioConfig?.imagesPerChapter || 3));
        setEditNumAlternatives(2);
        setEditSceneFocus(meta.art_focus || studioConfig?.artFocus || 'auto-choice');
        setEditVisualNotes(meta.custom_prompt || '');
        setFetchedDetails({ loading: true });

        syncBookChaptersSilently(book);
        handleFetchBookMetadata(book, false);
    }, [studioBooksMap, studioConfig, syncBookChaptersSilently, handleFetchBookMetadata]);

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
        if (allBooks.length > 0) {
            const normParam = bookKeyParam.toLowerCase().trim();
            const target = allBooks.find(
                b => b.bookKey.toLowerCase() === normParam ||
                     b.title.toLowerCase() === normParam ||
                     b.bookKey.toLowerCase().includes(normParam) ||
                     (b.title.length > 2 && normParam.includes(b.title.toLowerCase()))
            );
            if (target) {
                openBookModal(target, 'ai', 'illustration');
            }
            setDidHandleInitialUrlParams(true);
        }
    }, [allBooks, didHandleInitialUrlParams, openBookModal]);

    // Keep editingBook synchronized when studioBooksMap/studioChaptersMap refreshes
    const currentModalBook = useMemo(() => {
        if (!editingBook) return null;
        return allBooks.find(b => b.bookKey === editingBook.bookKey || b.title === editingBook.title) || editingBook;
    }, [editingBook, allBooks]);

    const handleSaveBookMetadata = async () => {
        if (!currentModalBook) return;
        setSavingMetadata(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'edit_book_metadata',
                    bookKey: currentModalBook.bookKey,
                    title: editTitle.trim(),
                    author: editAuthor.trim(),
                    canonicalAuthor: editAuthor.trim(),
                    translator: editTranslator.trim() || null,
                    narrator: editNarrator.trim() || null,
                    genre: editGenre.trim() || null,
                    publishedYear: editYear ? Number(editYear) : null,
                    coverUrl: editCoverUrl.trim() || null
                })
            });
            if (res.ok) {
                toast.success(`Saved "${editTitle}"`);
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

    const handleSaveBookStudioSettings = async (silent = false) => {
        if (!currentModalBook) return;
        if (!silent) setRunningStudioAction('save_settings');
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_book_settings',
                    bookKey: currentModalBook.bookKey,
                    title: currentModalBook.title,
                    author: currentModalBook.author,
                    artStyle: editArtStyle,
                    voicePreset: editVoicePreset,
                    enhancePreset: editEnhancePreset,
                    imagesPerChapter: editScenesPerChapter,
                    artFocus: editSceneFocus,
                    customPrompt: editVisualNotes
                })
            });
            if (res.ok) {
                if (!silent) toast.success('Saved options');
                fetchAll();
            }
        } catch {
            if (!silent) toast.error('Error saving options');
        } finally {
            if (!silent) setRunningStudioAction(null);
        }
    };

    // AUTO GEN SCENES: Discovers chapter/scene structure and initializes scene slots across chapters
    const handleAutoGenScenes = async () => {
        if (!currentModalBook) return;
        setRunningStudioAction('auto_gen_scenes');
        try {
            await handleSaveBookStudioSettings(true);
            await syncBookChaptersSilently(currentModalBook);
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'discover_book_structure',
                    bookKey: currentModalBook.bookKey
                })
            });
            if (res.ok) {
                toast.success(`Auto-generated scene breakdown (${editScenesPerChapter} scenes/chapter)`);
                fetchAll();
            } else {
                toast.error('Scene discovery failed');
            }
        } catch {
            toast.error('Failed to auto-generate scenes');
        } finally {
            setRunningStudioAction(null);
        }
    };

    // GEN ALL for the active AI Subtab ('illustration' | 'transcription' | 'voice')
    const handleGenAllForSubTab = async (targetSubTab: 'illustration' | 'transcription' | 'voice') => {
        if (!currentModalBook) return;
        setRunningStudioAction(`gen_all_${targetSubTab}`);
        try {
            await handleSaveBookStudioSettings(true);
            await syncBookChaptersSilently(currentModalBook);

            const taskType =
                targetSubTab === 'illustration'
                    ? 'illustrate'
                    : targetSubTab === 'transcription'
                    ? 'transcribe'
                    : 'enhance';

            const label =
                targetSubTab === 'illustration'
                    ? 'Illustrations'
                    : targetSubTab === 'transcription'
                    ? 'Transcriptions'
                    : 'Voice Audio';

            toast.info(`Generating all ${label} for "${currentModalBook.title}"...`);

            // If Illustration, also generate/ensure book cover
            if (targetSubTab === 'illustration' && !currentModalBook.customCoverUrl) {
                fetch('/api/theater/audiobooks/studio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generate_book_cover',
                        bookKey: currentModalBook.bookKey,
                        title: currentModalBook.title,
                        author: currentModalBook.author,
                        activateImmediately: true
                    })
                }).catch(() => {});
            }

            // Run across all chapters in sequence so immediate feedback appears chapter by chapter
            for (let idx = 0; idx < currentModalBook.chapters.length; idx++) {
                const chTrack = currentModalBook.chapters[idx];
                const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, idx);
                const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${idx + 1}`;
                await fetch('/api/theater/audiobooks/studio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'run_chapter_task',
                        bookKey: currentModalBook.bookKey,
                        bookTitle: currentModalBook.title,
                        author: currentModalBook.author,
                        chapterKey,
                        chapterIndex: idx + 1,
                        chapterTitle: chTrack.title || chTrack.name || `Chapter ${idx + 1}`,
                        filePath: chTrack.path || chMeta.file_path || '',
                        durationSec: chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300),
                        taskType,
                        artStyle: editArtStyle || undefined,
                        voicePreset: editVoicePreset || undefined,
                        imagesPerChapter: editScenesPerChapter > 0 ? editScenesPerChapter : 3
                    })
                });
                fetchAll(false);
            }

            toast.success(`Completed ${label} for "${currentModalBook.title}"`);
            fetchAll(false);
        } catch {
            toast.error('Generation failed');
        } finally {
            setRunningStudioAction(null);
        }
    };

    const handleToggleCustomBookCover = async (forceRepaint = false) => {
        if (!currentModalBook) return;
        const meta = studioBooksMap[currentModalBook.bookKey] || currentModalBook.meta || {};
        setRunningStudioAction('cover');
        try {
            if (meta.custom_cover_url && !forceRepaint) {
                const nextUse = !meta.use_custom_cover;
                await fetch('/api/theater/audiobooks/studio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'toggle_custom_cover',
                        bookKey: currentModalBook.bookKey,
                        useCustomCover: nextUse
                    })
                });
                toast.success(nextUse ? 'Using AI Cover' : 'Using Original Cover');
            } else {
                await fetch('/api/theater/audiobooks/studio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'generate_book_cover',
                        bookKey: currentModalBook.bookKey,
                        title: currentModalBook.title,
                        author: currentModalBook.author,
                        activateImmediately: true
                    })
                });
                toast.success('Generated Book Cover');
            }
            fetchAll();
        } catch {
            toast.error('Cover generation failed');
        } finally {
            setRunningStudioAction(null);
        }
    };

    const handleResetAssets = async (scope: 'transcripts' | 'illustrations' | 'voices' | 'all', chapterKey?: string, redoNow = false) => {
        if (!currentModalBook) return;
        setRunningStudioAction(`reset_${scope}_${chapterKey || 'all'}`);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reset_and_redo',
                    bookKey: currentModalBook.bookKey,
                    chapterKey,
                    scope,
                    redoNow
                })
            });
            if (res.ok) {
                toast.success(redoNow ? 'Regenerating...' : 'Deleted');
                fetchAll();
            } else {
                toast.error('Action failed');
            }
        } catch {
            toast.error('Error resetting assets');
        } finally {
            setRunningStudioAction(null);
        }
    };

    const handleRunChapterTask = async (chTrack: any, idx: number, task: 'transcribe' | 'illustrate' | 'enhance' | 'all', overrideVoicePreset?: string) => {
        if (!currentModalBook) return;
        const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, idx);
        const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${idx + 1}`;
        const taskKey = `${chapterKey}::${task}`;
        setRunningChapterTaskKey(taskKey);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'run_chapter_task',
                    bookKey: currentModalBook.bookKey,
                    bookTitle: currentModalBook.title,
                    author: currentModalBook.author,
                    chapterKey,
                    chapterIndex: idx + 1,
                    chapterTitle: chTrack.title || chTrack.name || `Chapter ${idx + 1}`,
                    filePath: chTrack.path || chMeta.file_path || '',
                    durationSec: chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300),
                    taskType: task,
                    artStyle: editArtStyle || undefined,
                    voicePreset: overrideVoicePreset || editVoicePreset || undefined,
                    imagesPerChapter: editScenesPerChapter > 0 ? editScenesPerChapter : 3
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Completed Chapter ${idx + 1}`);
                fetchAll();
            } else {
                toast.error(data.error || `Failed Chapter ${idx + 1}`);
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
        if (!currentModalBook) return;
        const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
        const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
        const busyKey = `${chapterKey}::s${opts.sceneIndex ?? 'new'}`;
        setRepaintingSceneKey(busyKey);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'regenerate_single_scene',
                    bookKey: currentModalBook.bookKey,
                    bookTitle: currentModalBook.title,
                    author: currentModalBook.author,
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
                toast.success('Generated scene illustration');
                fetchAll();
            } else {
                toast.error(data.error || 'Failed to generate scene');
            }
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setRepaintingSceneKey(null);
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
                toast.success(subAction === 'delete' ? 'Deleted scene' : 'Updated scene');
                fetchAll();
            }
        } catch {
            toast.error('Failed to update scene');
        }
    };

    const handleDeleteSingleTranscriptLine = async (chTrack: any, chIdx: number, lineIndexToRemove: number, allLines: string[]) => {
        if (!currentModalBook) return;
        const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
        const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
        const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);
        const updatedLrc = allLines.filter((_, i) => i !== lineIndexToRemove).join('\n');
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_chapter_transcript',
                    bookKey: currentModalBook.bookKey,
                    chapterKey,
                    chapterIndex: chIdx + 1,
                    chapterTitle: chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`,
                    filePath: chTrack.path || chMeta.file_path || '',
                    durationSec: durSec,
                    syncedLyrics: updatedLrc
                })
            });
            if (res.ok) {
                toast.success('Removed line');
                fetchAll();
            }
        } catch {
            toast.error('Failed to remove line');
        }
    };

    // Collections & Renamer & Settings handlers
    const handleSaveCollection = async () => {
        if (!collectionName.trim()) {
            toast.error('Enter a series name');
            return;
        }
        try {
            const id = editingCollectionId || `col-${Date.now()}`;
            const updatedCollections = editingCollectionId
                ? collections.map((c: any) => c.id === editingCollectionId ? { ...c, name: collectionName.trim(), description: collectionDesc.trim(), bookKeys: collectionBookKeys } : c)
                : [...collections, { id, name: collectionName.trim(), description: collectionDesc.trim(), bookKeys: collectionBookKeys, source: 'manual', updatedAt: new Date().toISOString() }];
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_collections_state',
                    collections: updatedCollections
                })
            });
            if (res.ok) {
                toast.success(`Saved "${collectionName}"`);
                setEditingCollectionId(null);
                setCollectionName('');
                setCollectionDesc('');
                setCollectionBookKeys([]);
                fetchAll();
            }
        } catch {
            toast.error('Failed to save series');
        }
    };

    const handleDeleteCollection = async (id: string) => {
        try {
            const updatedCollections = collections.filter((c: any) => c.id !== id);
            await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_collections_state',
                    collections: updatedCollections
                })
            });
            toast.success('Deleted series');
            fetchAll();
        } catch {
            toast.error('Failed to delete series');
        }
    };

    const handleAiAutoGroupCollections = async () => {
        if (allBooks.length === 0) return;
        setAiGroupingCollections(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ai_organize_collections',
                    books: allBooks.map(b => ({
                        bookKey: b.bookKey,
                        title: b.title,
                        author: b.author,
                        folder: b.chapters?.[0]?.folder || '',
                        filePath: b.chapters?.[0]?.path || ''
                    }))
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`Grouped ${data.collectionsCreated ?? 0} series`);
                fetchAll();
            } else {
                toast.error(data.error || 'Failed to group series');
            }
        } catch {
            toast.error('Error grouping series');
        } finally {
            setAiGroupingCollections(false);
        }
    };

    const handlePreviewRename = async (book: any) => {
        setSelectedRenameBookKey(book.bookKey);
        setRenamingBusy(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'preview_rename_files',
                    items: book.chapters.map((ch: any, idx: number) => ({
                        bookKey: book.bookKey,
                        title: book.title,
                        cleanTitle: book.cleanTitle,
                        author: book.author,
                        releaseYear: book.publishedYear || '',
                        chapterKey: `${book.bookKey}::ch${idx + 1}`,
                        chapterIndex: idx + 1,
                        chapterTitle: ch.title || ch.name || `Chapter ${idx + 1}`,
                        totalChapters: book.chapters.length,
                        filePath: ch.path || ''
                    }))
                })
            });
            if (res.ok) {
                const data = await res.json();
                setRenamePreview(data.previews || []);
            }
        } catch {
            toast.error('Failed to preview rename');
        } finally {
            setRenamingBusy(false);
        }
    };

    const handleExecuteRename = async () => {
        if (!selectedRenameBookKey || renamePreview.length === 0) return;
        const book = allBooks.find(b => b.bookKey === selectedRenameBookKey);
        if (!book) return;
        setRenamingBusy(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'execute_rename_files',
                    items: book.chapters.map((ch: any, idx: number) => ({
                        bookKey: book.bookKey,
                        title: book.title,
                        cleanTitle: book.cleanTitle,
                        author: book.author,
                        releaseYear: book.publishedYear || '',
                        chapterKey: `${book.bookKey}::ch${idx + 1}`,
                        chapterIndex: idx + 1,
                        chapterTitle: ch.title || ch.name || `Chapter ${idx + 1}`,
                        totalChapters: book.chapters.length,
                        filePath: ch.path || ''
                    }))
                })
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Renamed ${data.renamedCount || 0} files`);
                setRenamePreview([]);
                fetchAll(true);
            }
        } catch {
            toast.error('Rename failed');
        } finally {
            setRenamingBusy(false);
        }
    };

    const handleSaveConfig = async (patch: Record<string, any>) => {
        setSavingConfig(true);
        try {
            const next = { ...(studioConfig || {}), ...patch };
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_config',
                    config: next,
                    apiKey: apiKeyInput.trim() || undefined
                })
            });
            if (res.ok) {
                toast.success('Saved settings');
                fetchAll();
            }
        } catch {
            toast.error('Failed to save settings');
        } finally {
            setSavingConfig(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* ── Top Bar: Simple Big Symbols + Single-Word Labels ── */}
            <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveSubTab('books')}
                        title="Books"
                        className={`px-5 py-3 rounded-2xl text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeSubTab === 'books'
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                : 'bg-zinc-950/90 text-zinc-300 hover:text-white border border-zinc-800'
                        }`}
                    >
                        <BookOpen size={20} />
                        <span>Books</span>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-black ${
                            activeSubTab === 'books' ? 'bg-black/20 text-black' : 'bg-zinc-800 text-amber-400'
                        }`}>
                            {allBooks.length}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveSubTab('collections')}
                        title="Series Collections"
                        className={`px-5 py-3 rounded-2xl text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeSubTab === 'collections'
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                : 'bg-zinc-950/90 text-zinc-300 hover:text-white border border-zinc-800'
                        }`}
                    >
                        <FolderPlus size={20} />
                        <span>Series</span>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-black ${
                            activeSubTab === 'collections' ? 'bg-black/20 text-black' : 'bg-zinc-800 text-amber-400'
                        }`}>
                            {collections.length}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveSubTab('renamer')}
                        title="Uniform File Renamer"
                        className={`px-5 py-3 rounded-2xl text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeSubTab === 'renamer'
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                : 'bg-zinc-950/90 text-zinc-300 hover:text-white border border-zinc-800'
                        }`}
                    >
                        <Wrench size={20} />
                        <span>Rename</span>
                    </button>

                    <button
                        onClick={() => setActiveSubTab('queue_settings')}
                        title="AI Keys & Queue Settings"
                        className={`px-5 py-3 rounded-2xl text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeSubTab === 'queue_settings'
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                : 'bg-zinc-950/90 text-zinc-300 hover:text-white border border-zinc-800'
                        }`}
                    >
                        <Sliders size={20} />
                        <span>Settings</span>
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {workerState?.isRunning && (
                        <div className="px-4 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm font-black flex items-center gap-2 animate-pulse">
                            <RefreshCw size={16} className="animate-spin" />
                            <span>{workerState.activeBookTitle || 'Working...'}</span>
                        </div>
                    )}
                    <button
                        onClick={() => fetchAll(true)}
                        disabled={rescanning}
                        title="Rescan Audiobook Libraries"
                        className="px-5 py-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-amber-500/30 text-sm font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={rescanning ? 'animate-spin' : ''} />
                        <span>Rescan</span>
                    </button>
                </div>
            </div>

            {/* ── TAB 1: BOOKS (WITH GENRE, AUTHOR, SORT & SEARCH) ── */}
            {activeSubTab === 'books' && (
                <div className="space-y-5">
                    {/* Filter & Sort Toolbar (Identical to Theater) */}
                    <div className="p-5 rounded-3xl bg-zinc-900/50 border border-zinc-800/80 space-y-4">
                        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
                            {/* Genre Pills */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                <button
                                    onClick={() => setSelectedGenreFilter('ALL')}
                                    className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider whitespace-nowrap cursor-pointer transition-all ${
                                        selectedGenreFilter === 'ALL'
                                            ? 'bg-amber-400 text-black shadow'
                                            : 'bg-zinc-950 text-zinc-300 hover:text-white border border-zinc-800'
                                    }`}
                                >
                                    All ({allBooks.length})
                                </button>
                                {availableGenres.map(g => (
                                    <button
                                        key={g}
                                        onClick={() => setSelectedGenreFilter(prev => prev === g ? 'ALL' : g)}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer transition-all ${
                                            selectedGenreFilter === g
                                                ? 'bg-amber-400 text-black font-black shadow'
                                                : 'bg-zinc-950 text-zinc-300 hover:text-white border border-zinc-800'
                                        }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>

                            {/* Author Filter, Sort By & Search */}
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Author Dropdown */}
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                                    <User size={16} className="text-amber-400 shrink-0" />
                                    <select
                                        value={selectedAuthorFilter}
                                        onChange={e => setSelectedAuthorFilter(e.target.value)}
                                        title="Filter by Author"
                                        className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer"
                                    >
                                        <option value="ALL" className="bg-zinc-900 text-white">All Authors ({availableAuthors.length})</option>
                                        {availableAuthors.map(a => (
                                            <option key={a.name} value={a.name} className="bg-zinc-900 text-white">
                                                {a.name} ({a.count})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Sort Dropdown */}
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                                    <Layers size={16} className="text-amber-400 shrink-0" />
                                    <select
                                        value={sortBy}
                                        onChange={e => setSortBy(e.target.value as any)}
                                        title="Sort Books"
                                        className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer"
                                    >
                                        <option value="title" className="bg-zinc-900 text-white">Sort: Title</option>
                                        <option value="author" className="bg-zinc-900 text-white">Sort: Author</option>
                                        <option value="year" className="bg-zinc-900 text-white">Sort: Year</option>
                                        <option value="duration" className="bg-zinc-900 text-white">Sort: Duration</option>
                                    </select>
                                </div>

                                {/* Search Box */}
                                <div className="relative flex-1 min-w-[220px]">
                                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Search..."
                                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-base text-white focus:outline-none focus:border-amber-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-16 text-center text-zinc-400 text-lg font-bold">Loading...</div>
                    ) : groupedBooks.length === 0 ? (
                        <div className="p-16 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 text-center space-y-3">
                            <BookOpen size={44} className="mx-auto text-zinc-600" />
                            <p className="text-lg font-black text-white">No audiobooks match the current filter</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {groupedBooks.map((book) => (
                                <div
                                    key={book.id}
                                    onClick={() => openBookModal(book, 'ai', 'illustration')}
                                    className="p-5 rounded-3xl bg-zinc-900/70 hover:bg-zinc-900 border-2 border-zinc-800/90 hover:border-amber-500/60 flex flex-col justify-between gap-4 transition-all cursor-pointer shadow-xl group"
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Book Cover or Styled Hardcover Placeholder */}
                                        <div className="w-28 h-40 rounded-2xl bg-gradient-to-br from-amber-950/80 via-zinc-900 to-zinc-950 border-2 border-amber-700/40 overflow-hidden shrink-0 flex flex-col items-center justify-center relative shadow-lg">
                                            {book.posterUrl ? (
                                                <img src={book.posterUrl} alt={book.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="p-3 text-center flex flex-col items-center justify-center h-full w-full bg-gradient-to-b from-[#2a1b10] to-[#120c07]">
                                                    <BookOpen size={28} className="text-amber-400/80 mb-1.5 shrink-0" />
                                                    <span className="text-xs font-black text-amber-100 line-clamp-3 leading-tight">
                                                        {book.title}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-amber-400/80 mt-1 line-clamp-1">
                                                        {book.author}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-2">
                                            <h4 className="text-lg sm:text-xl font-black text-white leading-snug line-clamp-2 group-hover:text-amber-300 transition-colors">
                                                {book.title}
                                            </h4>
                                            <p className="text-sm sm:text-base font-bold text-amber-300 truncate">
                                                {book.author}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-zinc-400 flex-wrap">
                                                {book.publishedYear && (
                                                    <span className="px-2.5 py-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono">
                                                        {book.publishedYear}
                                                    </span>
                                                )}
                                                {book.genre && (
                                                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
                                                        {book.genre}
                                                    </span>
                                                )}
                                                <span className="font-mono">{book.totalCh} Ch</span>
                                                {book.totalDurSec > 0 && (
                                                    <span className="font-mono">• {formatSec(book.totalDurSec)}</span>
                                                )}
                                            </div>

                                            {/* AI Asset Counters */}
                                            <div className="pt-1 flex items-center gap-2 flex-wrap">
                                                <span className="px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/35 text-purple-300 text-xs font-black flex items-center gap-1.5">
                                                    <ImageIcon size={13} />
                                                    {book.illustratedScenes}
                                                </span>
                                                <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-black flex items-center gap-1.5">
                                                    <FileText size={13} />
                                                    {book.transCh}/{book.totalCh}
                                                </span>
                                                <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-black flex items-center gap-1.5">
                                                    <Headphones size={13} />
                                                    {book.enhCh}/{book.totalCh}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Bottom Action Bar: Book Info vs AI Features */}
                                    <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-2 gap-2.5" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => openBookModal(book, 'book', 'illustration')}
                                            title="Open Book Details, Cover & Metadata"
                                            className="px-4 py-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <BookOpen size={17} className="text-amber-400" />
                                            <span>Book</span>
                                        </button>
                                        <button
                                            onClick={() => openBookModal(book, 'ai', 'illustration')}
                                            title="Open AI Features (Illustration, Transcription, Voice)"
                                            className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                                        >
                                            <Sparkles size={17} />
                                            <span>AI</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 2: SERIES (COLLECTIONS) ── */}
            {activeSubTab === 'collections' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <FolderPlus size={20} className="text-amber-400" />
                                {editingCollectionId ? 'Edit Series' : 'New Series'}
                            </h4>
                            <button
                                onClick={handleAiAutoGroupCollections}
                                disabled={aiGroupingCollections}
                                title="Auto-detect book series"
                                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                <Sparkles size={14} className={aiGroupingCollections ? 'animate-spin' : ''} />
                                <span>Auto Group</span>
                            </button>
                        </div>

                        <input
                            type="text"
                            value={collectionName}
                            onChange={e => setCollectionName(e.target.value)}
                            placeholder="Series Name..."
                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-base text-white focus:outline-none focus:border-amber-500"
                        />

                        <div className="max-h-72 overflow-y-auto space-y-1.5 p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                            {allBooks.map(b => {
                                const checked = collectionBookKeys.includes(b.bookKey);
                                return (
                                    <label
                                        key={b.bookKey}
                                        className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer text-sm ${
                                            checked ? 'bg-amber-500/15 text-amber-200 font-bold' : 'text-zinc-300 hover:bg-zinc-900'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                                setCollectionBookKeys(prev =>
                                                    prev.includes(b.bookKey) ? prev.filter(k => k !== b.bookKey) : [...prev, b.bookKey]
                                                );
                                            }}
                                            className="accent-amber-500 w-4 h-4"
                                        />
                                        <span className="truncate flex-1">{b.title}</span>
                                    </label>
                                );
                            })}
                        </div>

                        <button
                            onClick={handleSaveCollection}
                            className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider cursor-pointer"
                        >
                            Save Series
                        </button>
                    </div>

                    <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {collections.map((col: any) => (
                            <div key={col.id} className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between gap-4">
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <h5 className="text-lg font-black text-white">{col.name}</h5>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => {
                                                    setEditingCollectionId(col.id);
                                                    setCollectionName(col.name || '');
                                                    setCollectionDesc(col.description || '');
                                                    setCollectionBookKeys(col.bookKeys || []);
                                                }}
                                                title="Edit Series"
                                                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteCollection(col.id)}
                                                title="Delete Series"
                                                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-amber-400 mt-1">{(col.bookKeys || []).length} Books</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TAB 3: RENAME ── */}
            {activeSubTab === 'renamer' && (
                <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-5">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                        <select
                            value={selectedRenameBookKey}
                            onChange={(e) => {
                                const b = allBooks.find(x => x.bookKey === e.target.value);
                                if (b) handlePreviewRename(b);
                            }}
                            className="flex-1 px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-base font-bold text-white"
                        >
                            <option value="">Select Book...</option>
                            {allBooks.map(b => (
                                <option key={b.bookKey} value={b.bookKey}>
                                    {b.author} — {b.title} ({b.chapters.length} files)
                                </option>
                            ))}
                        </select>

                        {renamePreview.length > 0 && (
                            <button
                                onClick={handleExecuteRename}
                                disabled={renamingBusy}
                                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                            >
                                <Check size={18} />
                                <span>Apply Rename</span>
                            </button>
                        )}
                    </div>

                    {renamePreview.length > 0 && (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {renamePreview.map((r, i) => (
                                <div key={i} className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm font-mono flex flex-col gap-1">
                                    <span className="text-zinc-500 line-through truncate">{r.oldFileName || r.from}</span>
                                    <span className="text-emerald-400 font-bold truncate">{r.newFileName || r.to}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 4: SETTINGS ── */}
            {activeSubTab === 'queue_settings' && (
                <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-5 max-w-3xl">
                    <h4 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <Sliders size={20} className="text-amber-400" />
                        AI API Key &amp; Defaults
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={e => setApiKeyInput(e.target.value)}
                            placeholder="Paste Gemini / OpenAI / Claude / Groq API Key (or leave blank for Free Built-in)..."
                            className="flex-1 px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-base text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                        <button
                            onClick={() => handleSaveConfig({})}
                            disabled={savingConfig}
                            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider cursor-pointer"
                        >
                            Save Key
                        </button>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════════
                BOOK & AI MODAL:
                - Top: Included Book Data (Image or Hardcover Placeholder + Fetched Metadata + Synopsis)
                - Tabs: [Book] | [AI]
                - Inside [AI]: ONLY [Illustration] | [Transcription] | [Voice]
                - Inside each AI subtab:
                  1. TOP PROMINENT MENU: Gen Options (Style & Alternatives) + AUTO GEN SCENES + GEN ALL
                  2. BELOW: Division of chapters/scenes with tools to go inside and Delete / Add / Regen each item
               ══════════════════════════════════════════════════════════════════════════════ */}
            {currentModalBook && (
                <div
                    className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
                    onClick={() => setEditingBook(null)}
                >
                    <div
                        className="w-full max-w-6xl rounded-3xl bg-zinc-950 border-2 border-zinc-800 shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* ── MODAL TOP BOOK HEADER (Included Image / Placeholder + Fetched Metadata + Main Tabs) ── */}
                        <div className="p-5 sm:p-6 bg-gradient-to-r from-[#1c130b] via-zinc-900 to-zinc-950 border-b border-zinc-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 shrink-0">
                            <div className="flex items-start sm:items-center gap-5 min-w-0 flex-1">
                                {/* Book Cover Image or Styled Hardcover Placeholder */}
                                <div className="w-28 h-40 sm:w-32 sm:h-44 rounded-2xl bg-gradient-to-b from-[#2e1d11] to-[#120b07] border-2 border-amber-500/40 overflow-hidden shrink-0 flex flex-col items-center justify-center shadow-2xl relative">
                                    {(currentModalBook.posterUrl || fetchedDetails.coverUrl) ? (
                                        <img
                                            src={currentModalBook.posterUrl || fetchedDetails.coverUrl}
                                            alt={currentModalBook.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="p-3 text-center flex flex-col items-center justify-center h-full w-full">
                                            <BookOpen size={34} className="text-amber-400 mb-2" />
                                            <span className="text-xs font-black text-amber-100 line-clamp-3 leading-tight">
                                                {currentModalBook.title}
                                            </span>
                                            <span className="text-[11px] font-bold text-amber-400/80 mt-1 line-clamp-1">
                                                {currentModalBook.author}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Included Book Metadata */}
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">
                                            {currentModalBook.title}
                                        </h2>
                                        {(currentModalBook.publishedYear || fetchedDetails.releaseYear) && (
                                            <span className="px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-700 text-amber-300 text-sm font-mono font-black">
                                                {currentModalBook.publishedYear || fetchedDetails.releaseYear}
                                            </span>
                                        )}
                                        <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-sm font-black">
                                            {currentModalBook.genre || fetchedDetails.genre || 'Fiction'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 text-base font-bold text-amber-200 flex-wrap">
                                        <span>{currentModalBook.author}</span>
                                        <span className="text-zinc-600">•</span>
                                        <span className="font-mono text-zinc-300">{currentModalBook.totalCh} Chapters</span>
                                        {currentModalBook.totalDurSec > 0 && (
                                            <>
                                                <span className="text-zinc-600">•</span>
                                                <span className="font-mono text-zinc-300">{formatSec(currentModalBook.totalDurSec)}</span>
                                            </>
                                        )}
                                    </div>

                                    {/* Auto-fetched Synopsis Preview */}
                                    {fetchedDetails.description ? (
                                        <p className="text-sm text-zinc-300 line-clamp-2 leading-relaxed max-w-3xl">
                                            {fetchedDetails.description}
                                        </p>
                                    ) : fetchedDetails.loading ? (
                                        <p className="text-sm text-zinc-500 italic">Fetching book metadata...</p>
                                    ) : null}

                                    <div className="pt-1 flex items-center gap-2.5 flex-wrap">
                                        <button
                                            onClick={() => handleFetchBookMetadata(currentModalBook, true)}
                                            disabled={fetchedDetails.loading}
                                            title="Fetch cover, synopsis, year & genre from OpenLibrary / iTunes"
                                            className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                            <RefreshCw size={15} className={fetchedDetails.loading ? 'animate-spin' : ''} />
                                            <span>Fetch Metadata</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Main Modal Switcher: [Book] vs [AI] + Close */}
                            <div className="flex items-center gap-3 self-end lg:self-center shrink-0">
                                <div className="flex items-center gap-2 bg-black/70 p-1.5 rounded-2xl border border-zinc-800">
                                    <button
                                        onClick={() => setBookModalMainTab('book')}
                                        title="Book Data, Metadata & Chapters"
                                        className={`px-5 py-3 rounded-xl text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                                            bookModalMainTab === 'book'
                                                ? 'bg-white text-black shadow-lg'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <BookOpen size={19} />
                                        <span>Book</span>
                                    </button>
                                    <button
                                        onClick={() => setBookModalMainTab('ai')}
                                        title="AI Features: Illustration, Transcription, Voice"
                                        className={`px-5 py-3 rounded-xl text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                                            bookModalMainTab === 'ai'
                                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/25'
                                                : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        <Sparkles size={19} />
                                        <span>AI</span>
                                    </button>
                                </div>

                                <button
                                    onClick={() => setEditingBook(null)}
                                    title="Close"
                                    className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 cursor-pointer"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* ── MODAL BODY ── */}
                        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
                            {/* ═════════════════════════════════════════════════════════════
                                MAIN TAB 1: BOOK (Included Data, Synopsis, Metadata & Chapters)
                               ═════════════════════════════════════════════════════════════ */}
                            {bookModalMainTab === 'book' && (
                                <div className="space-y-6">
                                    {/* Synopsis & Author Bio */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-5 rounded-3xl bg-zinc-900/50 border border-zinc-800 space-y-2">
                                            <h4 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                                                <BookOpen size={16} />
                                                <span>Synopsis</span>
                                            </h4>
                                            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed max-h-48 overflow-y-auto">
                                                {fetchedDetails.description || 'Click "Fetch Metadata" above to pull the book synopsis.'}
                                            </p>
                                        </div>
                                        <div className="p-5 rounded-3xl bg-zinc-900/50 border border-zinc-800 space-y-2">
                                            <h4 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                                                <User size={16} />
                                                <span>Author</span>
                                            </h4>
                                            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed max-h-48 overflow-y-auto">
                                                {fetchedDetails.authorBio || `${currentModalBook.author}`}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Metadata Editor */}
                                    <div className="p-5 rounded-3xl bg-zinc-900/50 border border-zinc-800 space-y-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                                <Edit3 size={18} className="text-amber-400" />
                                                <span>Metadata</span>
                                            </h4>
                                            <button
                                                onClick={handleSaveBookMetadata}
                                                disabled={savingMetadata}
                                                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                            >
                                                <Check size={16} />
                                                <span>Save</span>
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Title</label>
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={e => setEditTitle(e.target.value)}
                                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Author</label>
                                                <input
                                                    type="text"
                                                    value={editAuthor}
                                                    onChange={e => setEditAuthor(e.target.value)}
                                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Year</label>
                                                <input
                                                    type="number"
                                                    value={editYear}
                                                    onChange={e => setEditYear(e.target.value)}
                                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-mono font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Genre</label>
                                                <input
                                                    type="text"
                                                    value={editGenre}
                                                    onChange={e => setEditGenre(e.target.value)}
                                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Narrator</label>
                                                <input
                                                    type="text"
                                                    value={editNarrator}
                                                    onChange={e => setEditNarrator(e.target.value)}
                                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Cover Image URL</label>
                                                <input
                                                    type="text"
                                                    value={editCoverUrl}
                                                    onChange={e => setEditCoverUrl(e.target.value)}
                                                    placeholder="https://..."
                                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Clean Chapter List (Zero .M4A badges) */}
                                    <div className="p-5 rounded-3xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                                        <h4 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                            <Layers size={18} className="text-amber-400" />
                                            <span>Chapters ({currentModalBook.chapters.length})</span>
                                        </h4>
                                        <div className="divide-y divide-zinc-800/80 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden">
                                            {currentModalBook.chapters.map((ch: any, idx: number) => {
                                                const durSec = ch.durationMs ? Math.round(ch.durationMs / 1000) : 0;
                                                return (
                                                    <div key={ch.id || idx} className="p-4 flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="w-8 text-center font-mono text-sm font-black text-amber-400">
                                                                {idx + 1}
                                                            </span>
                                                            <span className="text-base font-bold text-white truncate">
                                                                {ch.title || ch.name || `Chapter ${idx + 1}`}
                                                            </span>
                                                        </div>
                                                        {durSec > 0 && (
                                                            <span className="font-mono text-sm font-bold text-zinc-400 shrink-0">
                                                                {formatMMSS(durSec)}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═════════════════════════════════════════════════════════════
                                MAIN TAB 2: AI FEATURES
                                ONLY 3 SUBTABS: Illustration | Transcription | Voice
                               ═════════════════════════════════════════════════════════════ */}
                            {bookModalMainTab === 'ai' && (
                                <div className="space-y-6">
                                    {/* ── THE 3 AI SUBTABS ── */}
                                    <div className="grid grid-cols-3 gap-3 bg-zinc-900/80 p-2 rounded-3xl border border-zinc-800">
                                        <button
                                            onClick={() => setAiSubTab('illustration')}
                                            className={`py-4 px-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer ${
                                                aiSubTab === 'illustration'
                                                    ? 'bg-purple-500 text-black shadow-xl shadow-purple-500/25'
                                                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                            }`}
                                        >
                                            <ImageIcon size={22} />
                                            <span>Illustration</span>
                                        </button>

                                        <button
                                            onClick={() => setAiSubTab('transcription')}
                                            className={`py-4 px-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer ${
                                                aiSubTab === 'transcription'
                                                    ? 'bg-amber-500 text-black shadow-xl shadow-amber-500/25'
                                                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                            }`}
                                        >
                                            <FileText size={22} />
                                            <span>Transcription</span>
                                        </button>

                                        <button
                                            onClick={() => setAiSubTab('voice')}
                                            className={`py-4 px-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer ${
                                                aiSubTab === 'voice'
                                                    ? 'bg-emerald-500 text-black shadow-xl shadow-emerald-500/25'
                                                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                            }`}
                                        >
                                            <Headphones size={22} />
                                            <span>Voice</span>
                                        </button>
                                    </div>

                                    {/* ═══════════════════════════════════════════════════════════
                                        SUBTAB 1: ILLUSTRATION
                                        1. PROMINENT TOP MENU: Gen Options (Style, Scenes/Ch, Alternatives) + AUTO GEN SCENES + GEN ALL
                                        2. BELOW: Book Cover + Chapters/Scenes division with Delete / Add / Regen on each
                                       ═══════════════════════════════════════════════════════════ */}
                                    {aiSubTab === 'illustration' && (
                                        <div className="space-y-6">
                                            {/* ── TOP PROMINENT CREATION MENU ── */}
                                            <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-950/40 via-zinc-900 to-zinc-950 border-2 border-purple-500/50 shadow-2xl space-y-5">
                                                {/* Gen Options Row */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-black text-purple-300 uppercase tracking-wider mb-1.5">
                                                            Style
                                                        </label>
                                                        <select
                                                            value={editArtStyle}
                                                            onChange={e => setEditArtStyle(e.target.value)}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-purple-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value="Cinematic Concept Art">Cinematic Concept Art</option>
                                                            <option value="Oil Painting">Classic Oil Painting</option>
                                                            <option value="Dark Fantasy">Dark Atmospheric Painting</option>
                                                            <option value="Watercolor">Storybook Watercolor</option>
                                                            <option value="Graphic Novel">Graphic Novel Ink</option>
                                                            <option value="Anime">Anime Masterpiece</option>
                                                            <option value="Vintage Book Plate">Vintage Book Engraving</option>
                                                            <option value="Photorealistic">Photorealistic Film Still</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-black text-purple-300 uppercase tracking-wider mb-1.5">
                                                            Scenes / Chapter
                                                        </label>
                                                        <select
                                                            value={editScenesPerChapter}
                                                            onChange={e => setEditScenesPerChapter(Number(e.target.value))}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-purple-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value={1}>1 Scene / Chapter</option>
                                                            <option value={2}>2 Scenes / Chapter</option>
                                                            <option value={3}>3 Scenes / Chapter</option>
                                                            <option value={4}>4 Scenes / Chapter</option>
                                                            <option value={6}>6 Scenes / Chapter</option>
                                                            <option value={8}>8 Scenes / Chapter</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-black text-purple-300 uppercase tracking-wider mb-1.5">
                                                            Alternatives / Scene
                                                        </label>
                                                        <select
                                                            value={editNumAlternatives}
                                                            onChange={e => setEditNumAlternatives(Number(e.target.value))}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-purple-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value={1}>1 Image</option>
                                                            <option value={2}>2 Alternatives</option>
                                                            <option value={3}>3 Alternatives</option>
                                                            <option value={4}>4 Alternatives</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-black text-purple-300 uppercase tracking-wider mb-1.5">
                                                            Focus
                                                        </label>
                                                        <select
                                                            value={editSceneFocus}
                                                            onChange={e => setEditSceneFocus(e.target.value)}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-purple-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value="auto-choice">Auto Story Focus</option>
                                                            <option value="characters">Characters &amp; Faces</option>
                                                            <option value="landscapes">World &amp; Architecture</option>
                                                            <option value="ambient">Mood &amp; Atmosphere</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* HUGE PRIMARY ACTION BUTTONS: AUTO GEN SCENES + GEN ALL */}
                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                                                    <button
                                                        onClick={handleAutoGenScenes}
                                                        disabled={runningStudioAction !== null}
                                                        title="Automatically discover and divide chapters into scenes"
                                                        className="sm:col-span-5 py-4 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-purple-200 border-2 border-purple-500/50 font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-lg cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Wand2 size={22} className={runningStudioAction === 'auto_gen_scenes' ? 'animate-spin text-purple-400' : 'text-purple-400'} />
                                                        <span>Auto Gen Scenes</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleGenAllForSubTab('illustration')}
                                                        disabled={runningStudioAction !== null}
                                                        title="Generate illustrations for all scenes across all chapters"
                                                        className="sm:col-span-5 py-4 px-6 rounded-2xl bg-purple-500 hover:bg-purple-400 text-black font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl shadow-purple-500/30 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Sparkles size={22} className={runningStudioAction === 'gen_all_illustration' ? 'animate-spin' : ''} />
                                                        <span>Gen All</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleResetAssets('illustrations', undefined, false)}
                                                        disabled={runningStudioAction !== null}
                                                        title="Delete all generated illustrations for this book"
                                                        className="sm:col-span-2 py-4 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Trash2 size={18} />
                                                        <span>Delete All</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* ── BOOK COVER ILLUSTRATION CARD ── */}
                                            <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-20 h-28 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                                                        {(currentModalBook.customCoverUrl || currentModalBook.posterUrl) ? (
                                                            <img src={currentModalBook.customCoverUrl || currentModalBook.posterUrl} alt="Cover" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <BookOpen size={24} className="text-zinc-600" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h5 className="text-lg font-black text-white">Book Cover</h5>
                                                        <p className="text-sm font-bold text-zinc-400">
                                                            {currentModalBook.meta?.use_custom_cover ? 'Active: AI Cover' : 'Active: Standard Cover'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    <button
                                                        onClick={() => handleToggleCustomBookCover(true)}
                                                        disabled={runningStudioAction === 'cover'}
                                                        className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-black font-black text-sm uppercase flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <Sparkles size={16} />
                                                        <span>{currentModalBook.customCoverUrl ? 'Regen Cover' : 'Gen Cover'}</span>
                                                    </button>
                                                    {currentModalBook.customCoverUrl && (
                                                        <button
                                                            onClick={() => handleToggleCustomBookCover(false)}
                                                            className="px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold text-sm cursor-pointer"
                                                        >
                                                            {currentModalBook.meta?.use_custom_cover ? 'Use Original' : 'Use AI Cover'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ── BELOW: CHAPTERS & CREATED SCENES DIVISION (WITH INDIVIDUAL DELETE / ADD / REGEN) ── */}
                                            <div className="space-y-4">
                                                {currentModalBook.chapters.map((chTrack: any, chIdx: number) => {
                                                    const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
                                                    const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
                                                    const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);
                                                    const existingImages: any[] = (chMeta.images || []).filter(
                                                        (i: any) => i.kept !== false && i.url && !String(i.url).toLowerCase().includes('.svg')
                                                    );
                                                    const isExpanded = Boolean(expandedChapterIndices[chIdx]);
                                                    const targetSlotsCount = Math.max(editScenesPerChapter || 3, existingImages.length, 1);

                                                    return (
                                                        <div key={chapterKey} className="rounded-3xl bg-zinc-900/50 border border-zinc-800 overflow-hidden">
                                                            {/* Chapter Division Header */}
                                                            <div
                                                                onClick={() => setExpandedChapterIndices(prev => ({ ...prev, [chIdx]: !prev[chIdx] }))}
                                                                className="p-4 sm:p-5 bg-zinc-900/90 hover:bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                                                            >
                                                                <div className="flex items-center gap-3.5 min-w-0">
                                                                    <span className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono text-sm font-black flex items-center justify-center shrink-0">
                                                                        {chIdx + 1}
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <h5 className="text-base sm:text-lg font-black text-white truncate">
                                                                            {chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`}
                                                                        </h5>
                                                                        <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-400">
                                                                            <span className="font-mono">{formatMMSS(durSec)}</span>
                                                                            <span>•</span>
                                                                            <span className={existingImages.length > 0 ? 'text-purple-300 font-black' : 'text-zinc-500'}>
                                                                                {existingImages.length} {existingImages.length === 1 ? 'Scene' : 'Scenes'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Individual Chapter Tools: + Add Scene | Gen Chapter | Delete All */}
                                                                <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => {
                                                                            setExpandedChapterIndices(prev => ({ ...prev, [chIdx]: true }));
                                                                            const newIdx = existingImages.length;
                                                                            const sliceSec = Math.max(30, Math.round(durSec / (newIdx + 1)));
                                                                            handleRepaintSingleScene(chTrack, chIdx, {
                                                                                sceneIndex: newIdx,
                                                                                sceneTitle: `Scene ${newIdx + 1}`,
                                                                                startSec: Math.min(durSec - 10, newIdx * sliceSec),
                                                                                endSec: durSec,
                                                                                artType: 'scene'
                                                                            });
                                                                        }}
                                                                        title="Add and generate a new scene in this chapter"
                                                                        className="px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-purple-300 border border-purple-500/40 text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer"
                                                                    >
                                                                        <Plus size={15} />
                                                                        <span>Add Scene</span>
                                                                    </button>

                                                                    <button
                                                                        onClick={() => handleRunChapterTask(chTrack, chIdx, 'illustrate')}
                                                                        disabled={runningChapterTaskKey === `${chapterKey}::illustrate`}
                                                                        title="Generate all scenes in this chapter"
                                                                        className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-black text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                    >
                                                                        <RefreshCw size={15} className={runningChapterTaskKey === `${chapterKey}::illustrate` ? 'animate-spin' : ''} />
                                                                        <span>{existingImages.length > 0 ? 'Regen Ch' : 'Gen Ch'}</span>
                                                                    </button>

                                                                    {existingImages.length > 0 && (
                                                                        <button
                                                                            onClick={() => handleResetAssets('illustrations', chapterKey, false)}
                                                                            title="Delete all scenes in this chapter"
                                                                            className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 cursor-pointer"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    )}

                                                                    <span className="p-1.5 text-zinc-400">
                                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Expanded Chapter Scenes Grid */}
                                                            {isExpanded && (
                                                                <div className="p-5 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                                    {Array.from({ length: targetSlotsCount }).map((_, sIdx) => {
                                                                        const existingImg = existingImages[sIdx];
                                                                        const sliceSec = Math.max(15, Math.round(durSec / targetSlotsCount));
                                                                        const startSec = existingImg?.timestampSec ?? (sIdx * sliceSec);
                                                                        const endSec = existingImg?.endTimestampSec ?? Math.min(durSec, (sIdx + 1) * sliceSec);
                                                                        const draftKey = `${chapterKey}::s${sIdx}`;
                                                                        const promptVal = scenePromptDrafts[draftKey] !== undefined
                                                                            ? scenePromptDrafts[draftKey]
                                                                            : (existingImg?.prompt || '');
                                                                        const isSceneBusy = repaintingSceneKey === draftKey;

                                                                        return (
                                                                            <div
                                                                                key={existingImg?.id || `slot-${sIdx}`}
                                                                                className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden flex flex-col justify-between"
                                                                            >
                                                                                {/* 16:9 Scene Artwork or Gen Button */}
                                                                                <div className="aspect-video bg-zinc-900 relative flex items-center justify-center overflow-hidden border-b border-zinc-800">
                                                                                    {existingImg?.url ? (
                                                                                        <img
                                                                                            src={existingImg.url}
                                                                                            alt={`Scene ${sIdx + 1}`}
                                                                                            className="w-full h-full object-cover"
                                                                                        />
                                                                                    ) : (
                                                                                        <button
                                                                                            onClick={() =>
                                                                                                handleRepaintSingleScene(chTrack, chIdx, {
                                                                                                    sceneIndex: sIdx,
                                                                                                    customPrompt: promptVal.trim() || undefined,
                                                                                                    sceneTitle: `Scene ${sIdx + 1}`,
                                                                                                    startSec,
                                                                                                    endSec,
                                                                                                    artType: sIdx === 0 ? 'chapter_header' : 'scene'
                                                                                                })
                                                                                            }
                                                                                            disabled={isSceneBusy}
                                                                                            className="px-5 py-3 rounded-2xl bg-purple-500 hover:bg-purple-400 text-black font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-xl cursor-pointer disabled:opacity-50"
                                                                                        >
                                                                                            <Sparkles size={18} className={isSceneBusy ? 'animate-spin' : ''} />
                                                                                            <span>{isSceneBusy ? 'Painting...' : 'Gen Scene'}</span>
                                                                                        </button>
                                                                                    )}

                                                                                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/80 text-white text-xs font-black">
                                                                                        Scene {sIdx + 1}
                                                                                    </div>
                                                                                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/80 text-amber-300 text-xs font-mono font-bold">
                                                                                        {formatMMSS(startSec)} – {formatMMSS(endSec)}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Scene Prompt & Individual Controls (Regen | + Alt | Delete) */}
                                                                                <div className="p-3.5 space-y-3">
                                                                                    <textarea
                                                                                        rows={2}
                                                                                        value={promptVal}
                                                                                        onChange={e => setScenePromptDrafts(prev => ({ ...prev, [draftKey]: e.target.value }))}
                                                                                        placeholder={`Scene ${sIdx + 1} visual description...`}
                                                                                        className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-purple-500 resize-none"
                                                                                    />

                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <button
                                                                                            onClick={() =>
                                                                                                handleRepaintSingleScene(chTrack, chIdx, {
                                                                                                    imageId: existingImg?.id,
                                                                                                    sceneIndex: sIdx,
                                                                                                    customPrompt: promptVal.trim() || undefined,
                                                                                                    sceneTitle: existingImg?.sceneTitle || `Scene ${sIdx + 1}`,
                                                                                                    startSec,
                                                                                                    endSec,
                                                                                                    artType: sIdx === 0 ? 'chapter_header' : 'scene'
                                                                                                })
                                                                                            }
                                                                                            disabled={isSceneBusy}
                                                                                            title="Regenerate this scene illustration"
                                                                                            className="flex-1 py-2 px-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                                        >
                                                                                            <RefreshCw size={14} className={isSceneBusy ? 'animate-spin' : ''} />
                                                                                            <span>{existingImg ? 'Regen' : 'Gen'}</span>
                                                                                        </button>

                                                                                        <button
                                                                                            onClick={() =>
                                                                                                handleRepaintSingleScene(chTrack, chIdx, {
                                                                                                    sceneIndex: existingImages.length,
                                                                                                    customPrompt: promptVal.trim() || undefined,
                                                                                                    sceneTitle: `Scene ${sIdx + 1} (Alt)`,
                                                                                                    startSec,
                                                                                                    endSec,
                                                                                                    artType: 'scene'
                                                                                                })
                                                                                            }
                                                                                            disabled={isSceneBusy}
                                                                                            title="Generate an alternative version for this scene"
                                                                                            className="py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-black uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                                                        >
                                                                                            <Plus size={14} />
                                                                                            <span>Alt</span>
                                                                                        </button>

                                                                                        {existingImg?.id && (
                                                                                            <button
                                                                                                onClick={() => handleCurateSceneImage(chapterKey, existingImg.id, 'delete')}
                                                                                                title="Delete this scene image"
                                                                                                className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 cursor-pointer"
                                                                                            >
                                                                                                <Trash2 size={15} />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══════════════════════════════════════════════════════════
                                        SUBTAB 2: TRANSCRIPTION
                                        1. PROMINENT TOP MENU: Gen Options (Engine/Style & Mode) + AUTO GEN SCENES + GEN ALL
                                        2. BELOW: Chapters & Synced Lines division with Regen / Delete (Zero manual typing)
                                       ═══════════════════════════════════════════════════════════ */}
                                    {aiSubTab === 'transcription' && (
                                        <div className="space-y-6">
                                            {/* ── TOP PROMINENT CREATION MENU ── */}
                                            <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-950 border-2 border-amber-500/50 shadow-2xl space-y-5">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-black text-amber-300 uppercase tracking-wider mb-1.5">
                                                            Engine / Style
                                                        </label>
                                                        <select
                                                            value={editSttEngine}
                                                            onChange={e => setEditSttEngine(e.target.value)}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-amber-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value="gemini_audio">Gemini Audio (Synced Karaoke)</option>
                                                            <option value="whisper_tiny_local">Whisper Local</option>
                                                            <option value="openai_whisper">OpenAI Whisper</option>
                                                            <option value="acoustic_cadence">Acoustic Cadence Sync</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-black text-amber-300 uppercase tracking-wider mb-1.5">
                                                            Segmentation / Alternatives
                                                        </label>
                                                        <select
                                                            value={editTranscriptAlternatives}
                                                            onChange={e => setEditTranscriptAlternatives(e.target.value)}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-amber-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value="synced_lines">Live Karaoke Timestamped Lines</option>
                                                            <option value="scene_aligned">Scene-Aligned Paragraphs</option>
                                                            <option value="detailed">High-Density Timestamps</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* HUGE PRIMARY ACTION BUTTONS: AUTO GEN SCENES + GEN ALL */}
                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                                                    <button
                                                        onClick={handleAutoGenScenes}
                                                        disabled={runningStudioAction !== null}
                                                        title="Auto-detect chapter & scene time windows"
                                                        className="sm:col-span-5 py-4 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-amber-200 border-2 border-amber-500/50 font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-lg cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Wand2 size={22} className="text-amber-400" />
                                                        <span>Auto Gen Scenes</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleGenAllForSubTab('transcription')}
                                                        disabled={runningStudioAction !== null}
                                                        title="Transcribe all chapters in this book"
                                                        className="sm:col-span-5 py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl shadow-amber-500/30 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Sparkles size={22} className={runningStudioAction === 'gen_all_transcription' ? 'animate-spin' : ''} />
                                                        <span>Gen All</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleResetAssets('transcripts', undefined, false)}
                                                        disabled={runningStudioAction !== null}
                                                        title="Delete all transcripts for this book"
                                                        className="sm:col-span-2 py-4 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Trash2 size={18} />
                                                        <span>Delete All</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* ── BELOW: CHAPTERS & SYNCED TRANSCRIPT LINES DIVISION ── */}
                                            <div className="space-y-4">
                                                {currentModalBook.chapters.map((chTrack: any, chIdx: number) => {
                                                    const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
                                                    const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
                                                    const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);
                                                    const rawLyrics: string = chMeta.synced_lyrics || '';
                                                    const lines = rawLyrics.split('\n').map((l: string) => l.trim()).filter(Boolean);
                                                    const isExpanded = Boolean(expandedChapterIndices[chIdx]);
                                                    const isBusy = runningChapterTaskKey === `${chapterKey}::transcribe`;

                                                    return (
                                                        <div key={chapterKey} className="rounded-3xl bg-zinc-900/50 border border-zinc-800 overflow-hidden">
                                                            <div
                                                                onClick={() => setExpandedChapterIndices(prev => ({ ...prev, [chIdx]: !prev[chIdx] }))}
                                                                className="p-4 sm:p-5 bg-zinc-900/90 hover:bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                                                            >
                                                                <div className="flex items-center gap-3.5 min-w-0">
                                                                    <span className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-sm font-black flex items-center justify-center shrink-0">
                                                                        {chIdx + 1}
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <h5 className="text-base sm:text-lg font-black text-white truncate">
                                                                            {chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`}
                                                                        </h5>
                                                                        <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-400">
                                                                            <span className="font-mono">{formatMMSS(durSec)}</span>
                                                                            <span>•</span>
                                                                            <span className={lines.length > 0 ? 'text-amber-300 font-black' : 'text-zinc-500'}>
                                                                                {lines.length > 0 ? `${lines.length} Synced Lines` : 'Not Transcribed'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => handleRunChapterTask(chTrack, chIdx, 'transcribe')}
                                                                        disabled={isBusy}
                                                                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                    >
                                                                        <RefreshCw size={15} className={isBusy ? 'animate-spin' : ''} />
                                                                        <span>{lines.length > 0 ? 'Regen' : 'Gen'}</span>
                                                                    </button>

                                                                    {lines.length > 0 && (
                                                                        <button
                                                                            onClick={() => handleResetAssets('transcripts', chapterKey, false)}
                                                                            title="Delete transcript for this chapter"
                                                                            className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 cursor-pointer"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    )}

                                                                    <span className="p-1.5 text-zinc-400">
                                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {isExpanded && (
                                                                <div className="p-5 border-t border-zinc-800/80">
                                                                    {lines.length === 0 ? (
                                                                        <div className="py-8 text-center">
                                                                            <button
                                                                                onClick={() => handleRunChapterTask(chTrack, chIdx, 'transcribe')}
                                                                                disabled={isBusy}
                                                                                className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                                                                            >
                                                                                <Mic2 size={18} className={isBusy ? 'animate-spin' : ''} />
                                                                                <span>{isBusy ? 'Transcribing Audio...' : 'Gen Chapter Transcript'}</span>
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                                                                            {lines.map((line: string, lIdx: number) => {
                                                                                const match = line.match(/^\[(\d+:\d+(?:\.\d+)?)\]\s*(.*)$/);
                                                                                const timeTag = match ? match[1] : '';
                                                                                const textBody = match ? match[2] : line;
                                                                                return (
                                                                                    <div
                                                                                        key={lIdx}
                                                                                        className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-3 group"
                                                                                    >
                                                                                        <div className="flex items-start gap-3 min-w-0">
                                                                                            {timeTag && (
                                                                                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-xs font-bold shrink-0">
                                                                                                    {timeTag}
                                                                                                </span>
                                                                                            )}
                                                                                            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed">
                                                                                                {textBody}
                                                                                            </p>
                                                                                        </div>
                                                                                        <button
                                                                                            onClick={() => handleDeleteSingleTranscriptLine(chTrack, chIdx, lIdx, lines)}
                                                                                            title="Delete this synced line"
                                                                                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                                                                                        >
                                                                                            <Trash2 size={15} />
                                                                                        </button>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══════════════════════════════════════════════════════════
                                        SUBTAB 3: VOICE
                                        1. PROMINENT TOP MENU: Gen Options (Voice Style & Enhancement Mode) + AUTO GEN SCENES + GEN ALL
                                        2. BELOW: Chapters & Voice Alternatives division with Regen / + Alt / Delete
                                       ═══════════════════════════════════════════════════════════ */}
                                    {aiSubTab === 'voice' && (
                                        <div className="space-y-6">
                                            {/* ── TOP PROMINENT CREATION MENU ── */}
                                            <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 border-2 border-emerald-500/50 shadow-2xl space-y-5">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-black text-emerald-300 uppercase tracking-wider mb-1.5">
                                                            Voice Style
                                                        </label>
                                                        <select
                                                            value={editVoicePreset}
                                                            onChange={e => setEditVoicePreset(e.target.value)}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-emerald-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value="clear_voice">Clear Voice (Vocal Presence)</option>
                                                            <option value="warm_bass">Warm Studio Narrator</option>
                                                            <option value="deep_pitch">Deeper Baritone (-8% Pitch)</option>
                                                            <option value="crisp_treble">Crisp Articulation</option>
                                                            <option value="bright_pitch">Brighter Voice (+6% Pitch)</option>
                                                            <option value="night_compress">Night Leveler</option>
                                                            <option value="original">Original Voice</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-black text-emerald-300 uppercase tracking-wider mb-1.5">
                                                            Mastering / Alternatives
                                                        </label>
                                                        <select
                                                            value={editEnhancePreset}
                                                            onChange={e => setEditEnhancePreset(e.target.value)}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-emerald-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value="denoise_clarity">Denoise &amp; Studio Clarity</option>
                                                            <option value="crystal_voice">Crystal Broadcast</option>
                                                            <option value="vintage_restore">Warm Tape Restoration</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* HUGE PRIMARY ACTION BUTTONS: AUTO GEN SCENES + GEN ALL */}
                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                                                    <button
                                                        onClick={() => handleSaveBookStudioSettings(false)}
                                                        disabled={runningStudioAction !== null}
                                                        title="Apply selected Voice Style across the book"
                                                        className="sm:col-span-5 py-4 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-emerald-200 border-2 border-emerald-500/50 font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-lg cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Check size={22} className="text-emerald-400" />
                                                        <span>Save Voice Style</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleGenAllForSubTab('voice')}
                                                        disabled={runningStudioAction !== null}
                                                        title="Generate enhanced voice tracks for all chapters"
                                                        className="sm:col-span-5 py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/30 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Sparkles size={22} className={runningStudioAction === 'gen_all_voice' ? 'animate-spin' : ''} />
                                                        <span>Gen All</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleResetAssets('voices', undefined, false)}
                                                        disabled={runningStudioAction !== null}
                                                        title="Delete all enhanced voice tracks for this book"
                                                        className="sm:col-span-2 py-4 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Trash2 size={18} />
                                                        <span>Delete All</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* ── BELOW: CHAPTERS & VOICE TRACKS DIVISION ── */}
                                            <div className="space-y-4">
                                                {currentModalBook.chapters.map((chTrack: any, chIdx: number) => {
                                                    const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
                                                    const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
                                                    const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);
                                                    const isEnhDone = chMeta.audio_enhance_status === 'completed' || Boolean(chMeta.enhanced_audio_path);
                                                    const processedVoices: Record<string, string> = chMeta.processed_voices || {};
                                                    const voiceEntries = Object.entries(processedVoices);
                                                    const isExpanded = Boolean(expandedChapterIndices[chIdx]);
                                                    const isBusy = runningChapterTaskKey === `${chapterKey}::enhance`;

                                                    return (
                                                        <div key={chapterKey} className="rounded-3xl bg-zinc-900/50 border border-zinc-800 overflow-hidden">
                                                            <div
                                                                onClick={() => setExpandedChapterIndices(prev => ({ ...prev, [chIdx]: !prev[chIdx] }))}
                                                                className="p-4 sm:p-5 bg-zinc-900/90 hover:bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                                                            >
                                                                <div className="flex items-center gap-3.5 min-w-0">
                                                                    <span className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-sm font-black flex items-center justify-center shrink-0">
                                                                        {chIdx + 1}
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <h5 className="text-base sm:text-lg font-black text-white truncate">
                                                                            {chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`}
                                                                        </h5>
                                                                        <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-400">
                                                                            <span className="font-mono">{formatMMSS(durSec)}</span>
                                                                            <span>•</span>
                                                                            <span className={isEnhDone ? 'text-emerald-300 font-black' : 'text-zinc-500'}>
                                                                                {isEnhDone ? `Enhanced (${chMeta.voice_preset || editVoicePreset})` : 'Original Audio'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => handleRunChapterTask(chTrack, chIdx, 'enhance')}
                                                                        disabled={isBusy}
                                                                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                    >
                                                                        <RefreshCw size={15} className={isBusy ? 'animate-spin' : ''} />
                                                                        <span>{isEnhDone ? 'Regen' : 'Gen'}</span>
                                                                    </button>

                                                                    {isEnhDone && (
                                                                        <button
                                                                            onClick={() => handleResetAssets('voices', chapterKey, false)}
                                                                            title="Delete enhanced voice audio for this chapter"
                                                                            className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 cursor-pointer"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    )}

                                                                    <span className="p-1.5 text-zinc-400">
                                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {isExpanded && (
                                                                <div className="p-5 border-t border-zinc-800/80 space-y-3">
                                                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                                                        <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                                                                            Voice Alternatives ({voiceEntries.length || (isEnhDone ? 1 : 0)})
                                                                        </span>
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            {['clear_voice', 'warm_bass', 'deep_pitch', 'night_compress'].map(preset => (
                                                                                <button
                                                                                    key={preset}
                                                                                    onClick={() => handleRunChapterTask(chTrack, chIdx, 'enhance', preset)}
                                                                                    disabled={isBusy}
                                                                                    className="px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-emerald-300 border border-emerald-500/30 text-xs font-black uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                                                >
                                                                                    <Plus size={13} />
                                                                                    <span>{preset.replace('_', ' ')}</span>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    {voiceEntries.length > 0 ? (
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                            {voiceEntries.map(([presetKey, filePath]) => (
                                                                                <div
                                                                                    key={presetKey}
                                                                                    className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3"
                                                                                >
                                                                                    <div className="min-w-0">
                                                                                        <p className="text-sm font-black text-emerald-300 uppercase">
                                                                                            {presetKey.replace('_', ' ')}
                                                                                        </p>
                                                                                        <p className="text-xs font-mono text-zinc-500 truncate">
                                                                                            {filePath}
                                                                                        </p>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                                        <button
                                                                                            onClick={() => handleRunChapterTask(chTrack, chIdx, 'enhance', presetKey)}
                                                                                            title="Regenerate this voice alternative"
                                                                                            className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 cursor-pointer"
                                                                                        >
                                                                                            <RefreshCw size={15} />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleResetAssets('voices', chapterKey, false)}
                                                                                            title="Delete enhanced voice"
                                                                                            className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 cursor-pointer"
                                                                                        >
                                                                                            <Trash2 size={15} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="py-6 text-center">
                                                                            <button
                                                                                onClick={() => handleRunChapterTask(chTrack, chIdx, 'enhance')}
                                                                                disabled={isBusy}
                                                                                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                                                            >
                                                                                <Headphones size={18} />
                                                                                <span>{isBusy ? 'Enhancing Voice...' : 'Gen Enhanced Voice'}</span>
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

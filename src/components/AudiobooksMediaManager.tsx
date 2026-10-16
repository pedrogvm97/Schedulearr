'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BookOpen, Sparkles, Sliders, FolderPlus, Edit3, Trash2, Check,
    RefreshCw, Play, Pause, Zap, FileText, Image as ImageIcon, Mic2,
    Search, User, Layers, Wrench, X, Plus, Headphones, ChevronDown, ChevronUp, Wand2, ArrowUp, Save,
    Maximize2, ZoomIn, ZoomOut, Info, Download, Printer, Share2, Volume2, ArrowLeft, ArrowRight, Star, Heart, Compass, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmModal } from '@/components/ConfirmModal';
import { AudiobookImageLightboxModal } from '@/components/AudiobookImageLightboxModal';
import { AudiobookDocumentExportModal } from '@/components/AudiobookDocumentExportModal';
import { AudiobookTranscriptViewerModal } from '@/components/AudiobookTranscriptViewerModal';
import { UnifiedCleanerModal } from '@/components/UnifiedCleanerModal';
import { AudiobookVoiceSelector } from '@/components/AudiobookVoiceSelector';
import { AudiobookExportModal } from '@/components/AudiobookExportModal';
import {
    CURATED_VOICE_PROFILES,
    CuratedVoiceProfile,
    BookVisualPortfolio,
    BookPortfolioCharacter,
    BookPortfolioLocation
} from '@/lib/audiobookStudioShared';

const CLIENT_BOOK_CATALOG: Array<{ pattern: RegExp; cleanTitle: string; collection: string; bookNumber: number; releaseYear: string; summary?: string }> = [
    // Alastair Reynolds — Poseidon's Children
    { pattern: /\bblue\s+remembered\s+earth\b/i, cleanTitle: 'Blue Remembered Earth', collection: "Poseidon's Children", bookNumber: 1, releaseYear: '2012', summary: 'In a solar system under utopian surveillance, Geoffrey and Sunday Akinya follow a breadcrumb trail left by their late grandmother across the Moon, Mars, and the outer planets.' },
    { pattern: /\bon\s+the\s+steel\s+breeze\b/i, cleanTitle: 'On the Steel Breeze', collection: "Poseidon's Children", bookNumber: 2, releaseYear: '2013', summary: 'Centuries later, cloned sisters Chiku Red, Green, and Yellow navigate an interstellar holoship fleet racing toward Crucible and its mysterious alien Mandala.' },
    { pattern: /\bposeidon'?s\s+wake\b/i, cleanTitle: "Poseidon's Wake", collection: "Poseidon's Children", bookNumber: 3, releaseYear: '2015', summary: 'In the far future of the Poseidon’s Children saga, humanity and the Watchkeepers confront an ancient cosmic intelligence awakened across deep space.' },
    // Alastair Reynolds — Revelation Space Universe
    { pattern: /\brevelation\s+space\b/i, cleanTitle: 'Revelation Space', collection: 'Revelation Space', bookNumber: 1, releaseYear: '2000', summary: 'Archaeologist Dan Sylveste, lighthugger crewman Ilia Volyova, and assassin Ana Khouri converge around Resurgam as the ancient Inhibitor machines stir.' },
    { pattern: /\bchasm\s+city\b/i, cleanTitle: 'Chasm City', collection: 'Revelation Space', bookNumber: 2, releaseYear: '2001', summary: 'Security specialist Tanner Mirabel pursues a vengeance mission from Sky’s Edge to the nanotech-mutated gothic spires of Chasm City on Yellowstone.' },
    { pattern: /\bredemption\s+ark\b/i, cleanTitle: 'Redemption Ark', collection: 'Revelation Space', bookNumber: 3, releaseYear: '2002', summary: 'Conjoiner factions led by Clavain and Skade clash over cache-weapons aboard Nostalgia for Infinity as the Wolves begin sterilizing human star systems.' },
    { pattern: /\babsolution\s+gap\b/i, cleanTitle: 'Absolution Gap', collection: 'Revelation Space', bookNumber: 4, releaseYear: '2003', summary: 'Survivors flee across moving cathedrals on Hela while Scorpio, Aura, and Rashmika seek a desperate alliance against the Inhibitors.' },
    { pattern: /\binhibitor\s+phase\b/i, cleanTitle: 'Inhibitor Phase', collection: 'Revelation Space', bookNumber: 5, releaseYear: '2021', summary: 'Miguel de Ruyter hides a small human colony beneath the rubble of Sun Hollow until a lone ship forces him back into the Inhibitor war.' },
    { pattern: /\bgalactic\s+north\b/i, cleanTitle: 'Galactic North', collection: 'Revelation Space', bookNumber: 6, releaseYear: '2006', summary: 'Eight stories chronicling thousands of years in the Revelation Space universe, from early Conjoiner experiments to the far edges of the galaxy.' },
    { pattern: /\bdiamond\s+dogs.*turquoise\s+days\b/i, cleanTitle: 'Diamond Dogs, Turquoise Days', collection: 'Revelation Space', bookNumber: 7, releaseYear: '2003', summary: 'Two novellas exploring the lethal mathematical Blood Spire on Golgotha and the Pattern Juggler oceans of Turquoise.' },
    // Alastair Reynolds — Prefect Dreyfus Emergencies
    { pattern: /\b(the\s+prefect|aurora\s+rising)\b/i, cleanTitle: 'Aurora Rising (The Prefect)', collection: 'Prefect Dreyfus Emergencies', bookNumber: 1, releaseYear: '2007', summary: 'Field Prefect Tom Dreyfus investigates the destruction of an orbital habitat in the Glitter Band and uncovers a plot by the digital consciousness Aurora.' },
    { pattern: /\belysium\s+fire\b/i, cleanTitle: 'Elysium Fire', collection: 'Prefect Dreyfus Emergencies', bookNumber: 2, releaseYear: '2018', summary: 'A wave of fatal neural-implant meltdowns sweeps the ten thousand habitats of the Glitter Band as secessionist movements threaten Panoply.' },
    { pattern: /\bmachine\s+vendetta\b/i, cleanTitle: 'Machine Vendetta', collection: 'Prefect Dreyfus Emergencies', bookNumber: 3, releaseYear: '2024', summary: 'After the mysterious death of a veteran operative inside a perilous orbital habitat, Tom Dreyfus confronts long-buried secrets inside Panoply.' },
    // Alastair Reynolds — Revenger Trilogy
    { pattern: /\brevenger\b/i, cleanTitle: 'Revenger', collection: 'Revenger Trilogy', bookNumber: 1, releaseYear: '2016', summary: 'Sisters Arafura and Adrana Ness sign aboard a solar-sail bone ship hunting ancient baubles across the shattered worlds of the Congregation.' },
    { pattern: /\bshadow\s+captain\b/i, cleanTitle: 'Shadow Captain', collection: 'Revenger Trilogy', bookNumber: 2, releaseYear: '2019', summary: 'Now commanding the dread pirate vessel Nightjammer, the Ness sisters navigate bounty hunters and the mystery of the ancient Quoins.' },
    { pattern: /\bbone\s+silence\b/i, cleanTitle: 'Bone Silence', collection: 'Revenger Trilogy', bookNumber: 3, releaseYear: '2020', summary: 'Pursued by the entire Congregation, Adrana and Fura seek the truth behind the skulls that link the ancient bone ships across space.' },
    // Alastair Reynolds — Standalones & Novellas
    { pattern: /\bcentury\s+rain\b/i, cleanTitle: 'Century Rain', collection: '', bookNumber: 0, releaseYear: '2004', summary: 'Archaeologist Verity Auger steps through an ancient wormhole from nanotech-ravaged Earth into an alternate 1959 Paris where World War II never happened.' },
    { pattern: /\bpushing\s+ice\b/i, cleanTitle: 'Pushing Ice', collection: '', bookNumber: 0, releaseYear: '2005', summary: 'When Saturn’s moon Janus breaks orbit and accelerates toward a distant star, ice-miner Bella Lind and her crew of Rockhopper give chase into deep time.' },
    { pattern: /\bhouse\s+of\s+suns\b/i, cleanTitle: 'House of Suns', collection: '', bookNumber: 0, releaseYear: '2008', summary: 'Six-million-year-old shatterlings Campion and Purslane survive a catastrophic ambush on Gentian Line and hunt the shadowy conspiracy behind it.' },
    { pattern: /\bterminal\s+world\b/i, cleanTitle: 'Terminal World', collection: '', bookNumber: 0, releaseYear: '2010', summary: 'Exiled physician Quillon descends from the towering spire of Spearpoint through shifting technological zones accompanied by a fleet of steampunk airships.' },
    { pattern: /\btroika\b/i, cleanTitle: 'Troika', collection: '', bookNumber: 0, releaseYear: '2011', summary: 'Three Soviet cosmonauts enter an enigmatic alien artifact known as the Matryoshka that alters reality and memory with every expedition.' },
    { pattern: /\bslow\s+bullets\b/i, cleanTitle: 'Slow Bullets', collection: '', bookNumber: 0, releaseYear: '2015', summary: 'Soldiers from opposing sides of an interstellar war awaken from broken hibernation centuries late aboard a drifting prisoner transport ship.' },
    { pattern: /\bbeyond\s+the\s+aquila\s+rift\b/i, cleanTitle: 'Beyond the Aquila Rift', collection: '', bookNumber: 0, releaseYear: '2016', summary: 'Far-future science fiction novellas exploring cosmic isolation, alien routing networks, and humanity across deep space.' },
    { pattern: /\bpermafrost\b/i, cleanTitle: 'Permafrost', collection: '', bookNumber: 0, releaseYear: '2019', summary: 'In 2080, seventy-one-year-old teacher Valentina Lidova projects her mind backward to 2028 Siberia to rescue humanity from an ecological collapse.' },
    { pattern: /\beversion\b/i, cleanTitle: 'Eversion', collection: '', bookNumber: 0, releaseYear: '2022', summary: 'Surgeon Silas Coade experiences recurring expeditions toward a mysterious Edifice across shifting centuries—from sailing ships to deep-space vessels.' },
    { pattern: /\bzima\s+blue\b/i, cleanTitle: 'Zima Blue and Other Stories', collection: '', bookNumber: 0, releaseYear: '2006', summary: 'Visionary science fiction tales centered on cybernetic artist Zima, memory, and humanity’s place in the cosmos.' },
    { pattern: /\bthousandth\s+night\b/i, cleanTitle: 'Thousandth Night', collection: '', bookNumber: 0, releaseYear: '2005', summary: 'At the grand reunion of Gentian Line, Campion and Purslane uncover a tampered memory pointing to an impossible cosmic secret.' },
    { pattern: /\bbelladonna\s+nights\b/i, cleanTitle: 'Belladonna Nights', collection: '', bookNumber: 0, releaseYear: '2021', summary: 'Stories spanning the House of Suns universe and far-future interstellar voyages.' },
    // Cixin Liu — Remembrance of Earth's Past (Three-Body Trilogy)
    { pattern: /\b(the\s+)?three[- \u2010-\u2015]body\s+problem\b/i, cleanTitle: 'The Three-Body Problem', collection: "Remembrance of Earth's Past", bookNumber: 1, releaseYear: '2008', summary: 'A secret Cold War radio signal sent from Red Coast Base by astrophysicist Ye Wenjie makes contact with the dying alien civilization of Trisolaris.' },
    { pattern: /\b(the\s+)?dark\s+forest\b/i, cleanTitle: 'The Dark Forest', collection: "Remembrance of Earth's Past", bookNumber: 2, releaseYear: '2008', summary: 'With Earth under sophon surveillance and a Trisolaran fleet four centuries away, reluctant Wallfacer Luo Ji deduces the lethal sociology of the cosmos.' },
    { pattern: /\bdeath'?s\s+end\b/i, cleanTitle: "Death's End", collection: "Remembrance of Earth's Past", bookNumber: 3, releaseYear: '2010', summary: 'Aerospace engineer Cheng Xin and Yun Tianming’s deep-space Staircase Program probe span eras from Deterrence to dimensional collapse.' },
    { pattern: /\b(the\s+)?redemption\s+of\s+time\b/i, cleanTitle: 'The Redemption of Time', collection: "Remembrance of Earth's Past", bookNumber: 4, releaseYear: '2011', summary: 'In the wake of the Trisolaran crisis, Yun Tianming is enlisted in an eons-long cosmic conflict between the Master and the Lurker.' },
    // Frank Herbert — Pandora Sequence
    { pattern: /\bdestination[:\s]+void\b/i, cleanTitle: 'Destination: Void', collection: 'Pandora Sequence', bookNumber: 1, releaseYear: '1966', summary: 'Stranded clones aboard the starship Earthling must engineer an artificial consciousness to survive after their organic brains fail.' },
    { pattern: /\bthe\s+jesus\s+incident\b/i, cleanTitle: 'The Jesus Incident', collection: 'Pandora Sequence', bookNumber: 2, releaseYear: '1979', summary: 'The sentient starship Ship demands that its human colonists learn how to worship—or face extinction on the deadly ocean world of Pandora.' },
    { pattern: /\bthe\s+lazarus\s+effect\b/i, cleanTitle: 'The Lazarus Effect', collection: 'Pandora Sequence', bookNumber: 3, releaseYear: '1983', summary: 'Generations after the fall of Pandora’s sentient kelp, Mermen and Islanders join forces to revive their world.' },
    { pattern: /\bthe\s+ascension\s+factor\b/i, cleanTitle: 'The Ascension Factor', collection: 'Pandora Sequence', bookNumber: 4, releaseYear: '1988', summary: 'As a tyrannical Director rules Pandora, the ancient sentient kelp awakens once more to guide humanity’s next evolution.' },
    // Frank Herbert — Dune Chronicles
    { pattern: /^(\d+\s*[-_.]*\s*)?dune$/i, cleanTitle: 'Dune', collection: 'Dune Chronicles', bookNumber: 1, releaseYear: '1965', summary: 'Young Paul Atreides is thrust into the deadly politics and Fremen prophecy of desert planet Arrakis, sole source of the spice melange.' },
    { pattern: /\bdune\s+messiah\b/i, cleanTitle: 'Dune Messiah', collection: 'Dune Chronicles', bookNumber: 2, releaseYear: '1969', summary: 'Twelve years into his imperial jihad, Emperor Paul Muad’Dib faces a Bene Gesserit, Tleilaxu, and Spacing Guild conspiracy.' },
    { pattern: /\bchildren\s+of\s+dune\b/i, cleanTitle: 'Children of Dune', collection: 'Dune Chronicles', bookNumber: 3, releaseYear: '1976', summary: 'Paul’s twin children Leto II and Ghanima navigate prescient genetic memories and the Golden Path on a greening Arrakis.' },
    { pattern: /\bgod\s+emperor\s+of\s+dune\b/i, cleanTitle: 'God Emperor of Dune', collection: 'Dune Chronicles', bookNumber: 4, releaseYear: '1981', summary: 'Three millennia into his reign as a human-sandworm hybrid, Leto II enforces the Golden Path to ensure humanity’s survival.' },
    { pattern: /\bheretics\s+of\s+dune\b/i, cleanTitle: 'Heretics of Dune', collection: 'Dune Chronicles', bookNumber: 5, releaseYear: '1984', summary: 'Thousands of years after Leto II’s death, the Bene Gesserit confront the violent Honored Matres returning from the Scattering.' },
    { pattern: /\bchapterhouse[:\s]+dune\b/i, cleanTitle: 'Chapterhouse: Dune', collection: 'Dune Chronicles', bookNumber: 6, releaseYear: '1985', summary: 'On their hidden sanctuary world Chapterhouse, Mother Superior Darwi Odrade fights a desperate war against the Honored Matres.' },
    // Frank Herbert — ConSentiency
    { pattern: /\bwhipping\s+star\b/i, cleanTitle: 'Whipping Star', collection: 'ConSentiency', bookNumber: 1, releaseYear: '1970', summary: 'BuSab agent Jorj X. McKie negotiates with the last Caleban—a sentient star whose death would instantaneously kill billions across the galaxy.' },
    { pattern: /\bthe\s+dosadi\s+experiment\b/i, cleanTitle: 'The Dosadi Experiment', collection: 'ConSentiency', bookNumber: 2, releaseYear: '1977', summary: 'Saboteur Extraordinary Jorj X. McKie infiltrates the lethal, overpopulated prison planet Dosadi sealed behind the God Wall.' },
    // Franz Kafka
    { pattern: /\b(?:the\s+)?metamorphosis\b/i, cleanTitle: 'The Metamorphosis', collection: '', bookNumber: 1, releaseYear: '1915', summary: 'Traveling salesman Gregor Samsa wakes one morning to find himself transformed into a monstrous insect inside his family’s apartment.' }
];

function normalizeSearchText(str?: string | null): string {
    return String(str || '')
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .toLowerCase()
        .trim();
}

function parseBookMetaClient(rawBookTitle: string, folder?: string, filePath?: string) {
    const normInput = (rawBookTitle || '')
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .trim();
    let working = normInput;
    let releaseYear: string | undefined;
    let bookNumber: number | undefined;
    let inferredCollection: string | undefined;
    let catalogSummary: string | undefined;

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
        if (entry.pattern.test(working) || entry.pattern.test(normInput)) {
            if (!releaseYear && entry.releaseYear) releaseYear = entry.releaseYear;
            if (!bookNumber && entry.bookNumber > 0) bookNumber = entry.bookNumber;
            if (!inferredCollection && entry.collection) inferredCollection = entry.collection;
            if (entry.summary) catalogSummary = entry.summary;
            working = entry.cleanTitle;
            break;
        }
    }

    return {
        cleanTitle: working || normInput || rawBookTitle,
        bookNumber,
        releaseYear,
        inferredCollection,
        catalogSummary
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
    const [activeSubTab, setActiveSubTab] = useState<'books' | 'collections' | 'renamer' | 'ai' | 'queue_settings'>('books');
    const [aiMainSubTab, setAiMainSubTab] = useState<'queue' | 'settings'>('queue');
    const [draggedBookKey, setDraggedBookKey] = useState<string | null>(null);
    const [dragOverBookKey, setDragOverBookKey] = useState<string | null>(null);
    const [priorityMovedBookKeys, setPriorityMovedBookKeys] = useState<Record<string, boolean>>({});
    const [showFullBookTranscript, setShowFullBookTranscript] = useState(false);
    const [loading, setLoading] = useState(true);
    const [rescanning, setRescanning] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: React.ReactNode;
        confirmText?: string;
        cancelText?: string;
        variant?: 'danger' | 'warning' | 'primary';
        onConfirm: () => void | Promise<void>;
    } | null>(null);

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
    const [collectionsUngroupedKeys, setCollectionsUngroupedKeys] = useState<string[]>([]);
    const [collectionsBookMeta, setCollectionsBookMeta] = useState<Record<string, any>>({});
    const [studioConfig, setStudioConfig] = useState<any>(null);
    const [workerState, setWorkerState] = useState<any>(null);

    // Book Modal state:
    // Top-level tabs: 'book' (Book data, fetched metadata, chapters) | 'ai' (AI Features)
    // Inside 'ai', strictly 4 distinct pipeline subtabs: 'transcription' -> 'scening' -> 'illustration' -> 'voice'
    const [editingBook, setEditingBook] = useState<any | null>(null);
    const [bookModalMainTab, setBookModalMainTab] = useState<'book' | 'ai'>('book');
    const [aiSubTab, setAiSubTab] = useState<'transcription' | 'scening' | 'illustration' | 'voice'>('transcription');
    const [expandedChapterIndices, setExpandedChapterIndices] = useState<Record<number, boolean>>({ 0: true });
    const [showBookCustomizePanel, setShowBookCustomizePanel] = useState(false);

    // Book Visual Portfolio (Characters & Settings Bible)
    const [bookPortfolio, setBookPortfolio] = useState<BookVisualPortfolio | null>(null);
    const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
    const [paintingPortfolioItemId, setPaintingPortfolioItemId] = useState<string | null>(null);

    // Lightbox Zoom Modal
    const [lightboxImage, setLightboxImage] = useState<{
        url: string;
        title: string;
        chapterTitle?: string;
        prompt?: string;
        date?: string;
        startSec?: number;
        endSec?: number;
        characters?: string[];
        transitionReason?: string;
        chapterKey?: string;
        imageId?: string;
        allImages?: Array<any>;
        currentIndex?: number;
    } | null>(null);
    const [showLightboxInfoDrawer, setShowLightboxInfoDrawer] = useState(true);
    const [lightboxZoomLevel, setLightboxZoomLevel] = useState<number>(1);

    // Document / PDF Export Modal
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportIncludeCover, setExportIncludeCover] = useState(true);
    const [exportIncludeCharacters, setExportIncludeCharacters] = useState(true);
    const [exportIncludeArtwork, setExportIncludeArtwork] = useState(true);
    const [exportIncludeSceneDesc, setExportIncludeSceneDesc] = useState(true);
    const [exportIncludeTranscripts, setExportIncludeTranscripts] = useState(false);

    // Full Transcript Modal, Unified Cleaner Modal, and Disabled Feature Alert
    const [transcriptViewerState, setTranscriptViewerState] = useState<{ isOpen: boolean; chapterIndex: number | null } | null>(null);
    const [unifiedCleanerModal, setUnifiedCleanerModal] = useState<{ isOpen: boolean; bookKey?: string | null; bookTitle?: string | null }>({ isOpen: false });
    const [aiDisabledFeatureAlert, setAiDisabledFeatureAlert] = useState<{ feature: string; reason: string } | null>(null);

    // Voice subtab curated filter
    const [curatedVoiceCategory, setCuratedVoiceCategory] = useState<'all' | 'iconic' | 'classic' | 'intimate' | 'broadcast'>('all');

    // Auto-fetched book metadata (Cover, Synopsis, Author Bio, Year, Genre, Available Covers)
    const [fetchedDetails, setFetchedDetails] = useState<{
        loading: boolean;
        description?: string;
        authorBio?: string;
        coverUrl?: string;
        releaseYear?: string;
        genre?: string;
        narrator?: string;
        availableCovers?: Array<{ url: string; label: string; source: string }>;
    }>({ loading: false });

    // Editable Book Metadata fields
    const [editTitle, setEditTitle] = useState('');
    const [editAuthor, setEditAuthor] = useState('');
    const [editTranslator, setEditTranslator] = useState('');
    const [editNarrator, setEditNarrator] = useState('');
    const [editGenre, setEditGenre] = useState('');
    const [editYear, setEditYear] = useState('');
    const [editCoverUrl, setEditCoverUrl] = useState('');
    const [editSynopsis, setEditSynopsis] = useState('');
    const [editAuthorBio, setEditAuthorBio] = useState('');
    const [savingMetadata, setSavingMetadata] = useState(false);

    // Prominent AI Gen Options (Styles & Number of Alternatives) + Per-Book Step Toggles
    const [editArtStyle, setEditArtStyle] = useState('Cinematic Concept Art');
    const [editScenesPerChapter, setEditScenesPerChapter] = useState<number>(3);
    const [editNumAlternatives, setEditNumAlternatives] = useState<number>(2);
    const [editSceneFocus, setEditSceneFocus] = useState('auto-choice');
    const [editVisualNotes, setEditVisualNotes] = useState('');
    const [editBookTranscribeEnabled, setEditBookTranscribeEnabled] = useState(true);
    const [editBookSceningEnabled, setEditBookSceningEnabled] = useState(true);
    const [editBookIllustrateEnabled, setEditBookIllustrateEnabled] = useState(true);

    // Voice Gen Options
    const [editVoicePreset, setEditVoicePreset] = useState('clear_voice');
    const [editEnhancePreset, setEditEnhancePreset] = useState('denoise_clarity');
    const [voiceCategoryFilter, setVoiceCategoryFilter] = useState<'all' | 'iconic' | 'classic' | 'intimate' | 'broadcast'>('all');

    // Busy states & Scene drafts
    const [scenePromptDrafts, setScenePromptDrafts] = useState<Record<string, string>>({});
    const [repaintingSceneKey, setRepaintingSceneKey] = useState<string | null>(null);
    const [runningStudioAction, setRunningStudioAction] = useState<string | null>(null);
    const [runningChapterTaskKey, setRunningChapterTaskKey] = useState<string | null>(null);
    const [didHandleInitialUrlParams, setDidHandleInitialUrlParams] = useState(false);

    // Series / Collections state
    const [showSeriesModal, setShowSeriesModal] = useState(false);
    const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
    const [collectionName, setCollectionName] = useState('');
    const [collectionAuthor, setCollectionAuthor] = useState('');
    const [collectionDesc, setCollectionDesc] = useState('');
    const [collectionBookKeys, setCollectionBookKeys] = useState<string[]>([]);
    const [seriesSearchQuery, setSeriesSearchQuery] = useState('');
    const [seriesBuilderSearch, setSeriesBuilderSearch] = useState('');
    const [seriesBuilderAuthor, setSeriesBuilderAuthor] = useState('ALL');
    const [aiGroupingCollections, setAiGroupingCollections] = useState(false);

    // File Renamer state
    const [selectedRenameBookKey, setSelectedRenameBookKey] = useState('');
    const [renamePreview, setRenamePreview] = useState<any[]>([]);
    const [renamingBusy, setRenamingBusy] = useState(false);

    // Config form state
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [savingConfig, setSavingConfig] = useState(false);

    const pollStudioOnly = useCallback(async () => {
        try {
            const studioRes = await fetch('/api/theater/audiobooks/studio');
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
                setCollectionsUngroupedKeys(sData.collectionsState?.ungroupedBookKeys || []);
                setCollectionsBookMeta(sData.collectionsState?.bookMetadata || {});
                setStudioConfig(sData.config || {});
                setWorkerState(sData.status || sData.worker || {});
            }
        } catch {}
    }, []);

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
                setCollectionsUngroupedKeys(sData.collectionsState?.ungroupedBookKeys || []);
                setCollectionsBookMeta(sData.collectionsState?.bookMetadata || {});
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
        const onLibrariesUpdated = () => fetchAll(true);
        window.addEventListener('theater-libraries-updated', onLibrariesUpdated);
        return () => {
            window.removeEventListener('theater-libraries-updated', onLibrariesUpdated);
        };
    }, [fetchAll]);

    useEffect(() => {
        const isFastPoll = Boolean(workerState?.isRunning || editingBook || runningStudioAction || runningChapterTaskKey);
        const timer = setInterval(() => {
            pollStudioOnly();
        }, isFastPoll ? 2500 : 8000);
        return () => clearInterval(timer);
    }, [workerState?.isRunning, editingBook, runningStudioAction, runningChapterTaskKey, pollStudioOnly]);

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
                    catalogSummary: parsedTitle.catalogSummary || null,
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

            // Count transcribed, scened, illustrated, and voice-enhanced chapters across the actual chapters
            let transCh = 0;
            let scenedCh = 0;
            let illCh = 0;
            let enhCh = 0;
            let totalScenesCount = 0;
            let summedChapterDurSec = 0;
            let transcribedAudioSec = 0;
            let paintedScenesCount = 0;
            let hasChapterTranscribing = false;
            let hasChapterIllustrating = false;

            effectiveChapters.forEach((chTrack: any, idx: number) => {
                const cMeta =
                    studioChaptersMap[chTrack.chapterKey] ||
                    studioChaptersMap[chTrack.id] ||
                    studioChaptersMap[`${effectiveBookKey}::ch${idx + 1}`] ||
                    studioChaptersMap[`${book.bookKey}::ch${idx + 1}`] ||
                    dbChaps.find((c: any) => Number(c.chapter_index) === idx + 1 || Number(c.chapter_index) === idx || (chTrack.path && c.file_path === chTrack.path));

                const cDurSec = Number(cMeta?.duration_sec || 0);
                if ((!chTrack.durationMs || chTrack.durationMs === 300000) && cDurSec > 0 && cDurSec !== 300) {
                    chTrack.durationMs = cDurSec * 1000;
                }
                const trackDurSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (cDurSec || 300);
                if (trackDurSec > 0) summedChapterDurSec += trackDurSec;

                if (cMeta) {
                    if (cMeta.transcription_status === 'processing') hasChapterTranscribing = true;
                    if (cMeta.illustration_status === 'processing') hasChapterIllustrating = true;

                    if (cMeta.transcription_status === 'completed' && cMeta.synced_lyrics) {
                        transCh++;
                        transcribedAudioSec += trackDurSec;
                    } else if (Number(cMeta.transcribed_seconds || 0) > 0) {
                        transcribedAudioSec += Math.min(trackDurSec, Number(cMeta.transcribed_seconds));
                    } else if (Number(cMeta.transcription_progress || 0) > 0) {
                        transcribedAudioSec += Math.round(trackDurSec * (Number(cMeta.transcription_progress) / 100));
                    }

                    const validImages = (cMeta.images || []).filter((i: any) => i && i.kept !== false && !String(i.url || '').toLowerCase().includes('.svg'));
                    if (validImages.length > 0) {
                        scenedCh++;
                        totalScenesCount += validImages.length;
                        const paintedInCh = validImages.filter((i: any) => Boolean(i.url)).length;
                        paintedScenesCount += paintedInCh;
                        if (paintedInCh > 0) illCh++;
                    }
                    if (cMeta.audio_enhance_status === 'completed' || cMeta.enhanced_audio_path) enhCh++;
                }
            });

            const customCoverUrl = meta?.custom_cover_url && !String(meta.custom_cover_url).toLowerCase().includes('.svg')
                ? meta.custom_cover_url
                : null;
            const effectivePosterUrl = (meta?.use_custom_cover && customCoverUrl)
                ? customCoverUrl
                : (meta?.thumb || book.posterUrl || customCoverUrl || null);

            const rawBookDurSec = book.totalDurationMs ? Math.round(book.totalDurationMs / 1000) : 0;
            const metaDurSec = Number(meta?.total_duration_sec || 0);
            const effectiveTotalDurSec = Math.max(rawBookDurSec, summedChapterDurSec, metaDurSec);
            const enrichMeta = collectionsBookMeta[effectiveBookKey] || collectionsBookMeta[book.bookKey] || {};

            const parsedCleanMeta = parseBookMetaClient(meta?.title || book.cleanTitle);
            const resolvedSynopsis = enrichMeta.synopsis || meta?.summary || parsedCleanMeta.catalogSummary || book.catalogSummary || null;
            const shortSummary = resolvedSynopsis
                ? String(resolvedSynopsis).replace(/\s+/g, ' ').trim()
                : `${meta?.genre || book.genre || 'Audiobook'} • ${totalCh} ${totalCh === 1 ? 'Chapter' : 'Chapters'}${effectiveTotalDurSec > 0 ? ` • ${formatSec(effectiveTotalDurSec)}` : ''}`;

            const bookTranscribeEnabled = meta?.transcribe_enabled !== undefined ? Boolean(meta.transcribe_enabled) : true;
            const bookSceningEnabled = meta?.scening_enabled !== undefined ? Boolean(meta.scening_enabled) : true;
            const bookIllustrateEnabled = bookSceningEnabled
                ? (meta?.illustrate_enabled !== undefined ? Boolean(meta.illustrate_enabled) : true)
                : false;

            const isTranscribingNow = Boolean(
                hasChapterTranscribing ||
                workerState?.activeTranscriptionBookKey === effectiveBookKey ||
                workerState?.activeTranscriptionBookKey === book.bookKey
            );
            const isSceningNow = Boolean(
                workerState?.activeSceningBookKey === effectiveBookKey ||
                workerState?.activeSceningBookKey === book.bookKey ||
                (workerState?.activeBookKey === effectiveBookKey && /scene/i.test(workerState?.currentStep || ''))
            );
            const isImagingNow = Boolean(
                hasChapterIllustrating ||
                workerState?.activeImagingBookKey === effectiveBookKey ||
                workerState?.activeImagingBookKey === book.bookKey
            );

            return {
                ...book,
                chapters: effectiveChapters,
                bookKey: effectiveBookKey,
                title: parsedCleanMeta.cleanTitle,
                cleanTitle: parsedCleanMeta.cleanTitle,
                author: meta?.canonical_author || canonicalizeAuthorClient(meta?.author || book.author).canonicalAuthor,
                translator: meta?.translator || book.translator || null,
                narrator: meta?.narrator || book.narrator || null,
                genre: meta?.genre || book.genre || inferBookGenre(book.cleanTitle, book.author, book.inferredCollection),
                publishedYear: book.releaseYear || (meta?.published_year ? String(meta.published_year) : null),
                posterUrl: effectivePosterUrl,
                rawPosterUrl: book.posterUrl || null,
                customCoverUrl,
                savedSynopsis: resolvedSynopsis,
                shortSummary,
                savedAuthorBio: enrichMeta.authorBio || null,
                meta,
                totalCh,
                transCh,
                scenedCh: Math.max(scenedCh, Number(meta?.scened_chapters || 0)),
                illCh,
                enhCh,
                totalDurSec: effectiveTotalDurSec,
                transcribedSec: Math.min(effectiveTotalDurSec || transcribedAudioSec, Math.max(transcribedAudioSec, Number(meta?.transcribed_seconds || 0))),
                detectedScenesCount: Math.max(totalScenesCount, Number(meta?.total_scenes || 0)),
                paintedScenesCount,
                illustratedScenes: paintedScenesCount || Number(meta?.illustrated_scenes || 0),
                transcribeEnabled: bookTranscribeEnabled,
                sceningEnabled: bookSceningEnabled,
                illustrateEnabled: bookIllustrateEnabled,
                isTranscribingNow,
                isSceningNow,
                isImagingNow,
                isQueued: meta?.is_queued !== undefined ? Boolean(meta.queue_enabled || meta.is_queued === 1) : true,
                queueOrder: Number(meta?.queue_priority || meta?.queue_order || 9999)
            };
        });

        return list;
    }, [rawItems, studioBooksMap, studioChaptersMap, collectionsBookMeta, selectedLibraryFilter, workerState]);

    // Priority Queue Books sorted by priority (queueOrder ascending, then title)
    const priorityQueueBooks = useMemo(() => {
        return [...allBooks].sort((a, b) => {
            if (a.isQueued !== b.isQueued) return a.isQueued ? -1 : 1;
            if (a.queueOrder !== b.queueOrder) return a.queueOrder - b.queueOrder;
            return a.title.localeCompare(b.title);
        });
    }, [allBooks]);

    // Clear priority waiting indicator once the book starts actively running a task
    useEffect(() => {
        const activeKeys = [
            workerState?.activeBookKey,
            workerState?.activeTranscriptionBookKey,
            workerState?.activeSceningBookKey,
            workerState?.activeImagingBookKey
        ].filter(Boolean);
        if (activeKeys.length > 0) {
            setPriorityMovedBookKeys(prev => {
                let changed = false;
                const next = { ...prev };
                for (const k of activeKeys) {
                    if (next[k]) {
                        delete next[k];
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }
    }, [workerState]);

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
        const q = normalizeSearchText(searchQuery);
        return allBooks
            .filter(b => {
                if (selectedGenreFilter !== 'ALL' && b.genre !== selectedGenreFilter) return false;
                if (selectedAuthorFilter !== 'ALL' && b.author !== selectedAuthorFilter) return false;
                if (!q) return true;
                return (
                    normalizeSearchText(b.title).includes(q) ||
                    normalizeSearchText(b.rawTitle).includes(q) ||
                    normalizeSearchText(b.author).includes(q) ||
                    normalizeSearchText(b.inferredCollection).includes(q) ||
                    normalizeSearchText(b.translator).includes(q) ||
                    normalizeSearchText(b.narrator).includes(q) ||
                    normalizeSearchText(b.genre).includes(q)
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

    // Merge saved collections with auto-detected series from CLIENT_BOOK_CATALOG / parseBookMetaClient
    const combinedSeriesList = useMemo(() => {
        const booksByKey = new Map<string, any>();
        for (const b of allBooks) {
            booksByKey.set(b.bookKey, b);
            booksByKey.set(b.bookKey.toLowerCase(), b);
            booksByKey.set(normalizeSearchText(b.bookKey), b);
        }

        const resolveBook = (bk: string) => {
            if (!bk) return null;
            const direct = booksByKey.get(bk) || booksByKey.get(bk.toLowerCase()) || booksByKey.get(normalizeSearchText(bk));
            if (direct) return direct;
            const norm = normalizeSearchText(bk);
            return allBooks.find(
                b =>
                    normalizeSearchText(b.bookKey) === norm ||
                    normalizeSearchText(b.title) === norm ||
                    normalizeSearchText(`${b.author} - ${b.title}`) === norm
            ) || null;
        };

        const ungroupedSet = new Set(collectionsUngroupedKeys.map(k => normalizeSearchText(k)));

        const seriesMap = new Map<string, {
            id: string;
            name: string;
            author: string;
            description: string;
            source: 'manual' | 'auto';
            bookKeys: string[];
            books: any[];
            totalDurSec: number;
        }>();

        // 1. Add saved collections from DB
        for (const col of collections) {
            if (!col || !col.name) continue;
            const normName = normalizeSearchText(col.name);
            const rawKeys: string[] = Array.isArray(col.bookKeys) ? col.bookKeys : [];
            const resolvedBooks: any[] = [];
            const seenKeys = new Set<string>();
            for (const k of rawKeys) {
                const rb = resolveBook(k);
                if (rb && !seenKeys.has(rb.bookKey)) {
                    seenKeys.add(rb.bookKey);
                    resolvedBooks.push(rb);
                }
            }
            const author = col.author || resolvedBooks[0]?.author || 'Various Authors';
            const totalDurSec = resolvedBooks.reduce((acc, b) => acc + (b.totalDurSec || 0), 0);
            seriesMap.set(normName, {
                id: col.id || `col-${normName.replace(/[^a-z0-9]+/g, '-')}`,
                name: col.name,
                author,
                description: col.description || '',
                source: col.source === 'auto' ? 'auto' : 'manual',
                bookKeys: resolvedBooks.length > 0 ? resolvedBooks.map(b => b.bookKey) : rawKeys,
                books: resolvedBooks,
                totalDurSec
            });
        }

        // 2. Auto-detect series from allBooks (inferredCollection from catalog / folder / title)
        const autoGroups = new Map<string, any[]>();
        for (const b of allBooks) {
            const seriesName = b.inferredCollection?.trim();
            if (!seriesName) continue;
            if (ungroupedSet.has(normalizeSearchText(b.bookKey))) continue;
            const normName = normalizeSearchText(seriesName);
            if (!autoGroups.has(normName)) {
                autoGroups.set(normName, []);
            }
            autoGroups.get(normName)!.push(b);
        }

        for (const [normName, groupBooks] of autoGroups.entries()) {
            const sortedBooks = [...groupBooks].sort((a, b) => {
                const na = a.bookNumber ?? 999;
                const nb = b.bookNumber ?? 999;
                if (na !== nb) return na - nb;
                const ya = parseInt(a.publishedYear || '9999', 10) || 9999;
                const yb = parseInt(b.publishedYear || '9999', 10) || 9999;
                if (ya !== yb) return ya - yb;
                return a.title.localeCompare(b.title);
            });

            if (seriesMap.has(normName)) {
                const existing = seriesMap.get(normName)!;
                // Only auto-append newly discovered catalog books if the user hasn't explicitly ungrouped them
                const seen = new Set(existing.books.map((x: any) => x.bookKey));
                for (const sb of sortedBooks) {
                    if (!seen.has(sb.bookKey) && !ungroupedSet.has(normalizeSearchText(sb.bookKey))) {
                        existing.books.push(sb);
                        existing.bookKeys.push(sb.bookKey);
                        existing.totalDurSec += sb.totalDurSec || 0;
                    }
                }
                if (existing.source === 'auto') {
                    existing.books.sort((a: any, b: any) => (a.bookNumber ?? 999) - (b.bookNumber ?? 999));
                    existing.bookKeys = existing.books.map((b: any) => b.bookKey);
                }
            } else {
                const displaySeriesName = sortedBooks[0].inferredCollection;
                const author = sortedBooks[0]?.author || 'Unknown Author';
                const totalDurSec = sortedBooks.reduce((acc, b) => acc + (b.totalDurSec || 0), 0);
                seriesMap.set(normName, {
                    id: `auto-${normName.replace(/[^a-z0-9]+/g, '-')}`,
                    name: displaySeriesName,
                    author,
                    description: `${author} • ${sortedBooks.length} ${sortedBooks.length === 1 ? 'Book' : 'Books'}`,
                    source: 'auto',
                    bookKeys: sortedBooks.map(b => b.bookKey),
                    books: sortedBooks,
                    totalDurSec
                });
            }
        }

        return Array.from(seriesMap.values()).sort((a, b) => {
            if (b.books.length !== a.books.length) return b.books.length - a.books.length;
            return a.name.localeCompare(b.name);
        });
    }, [collections, collectionsUngroupedKeys, allBooks]);

    const filteredSeriesList = useMemo(() => {
        const q = normalizeSearchText(seriesSearchQuery);
        if (!q) return combinedSeriesList;
        return combinedSeriesList.filter(
            s =>
                normalizeSearchText(s.name).includes(q) ||
                normalizeSearchText(s.author).includes(q) ||
                s.books.some((b: any) => normalizeSearchText(b.title).includes(q) || normalizeSearchText(b.rawTitle).includes(q))
        );
    }, [combinedSeriesList, seriesSearchQuery]);

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

    // Fetch book metadata (cover image, synopsis, author bio, year, genre, available covers) from OpenLibrary / iTunes
    const handleFetchBookMetadata = useCallback(async (bookToFetch: any, showToast = false) => {
        if (!bookToFetch) return;
        setFetchedDetails(prev => ({ ...prev, loading: true }));
        try {
            const res = await fetch(
                `/api/theater/audiobooks?title=${encodeURIComponent(bookToFetch.cleanTitle || bookToFetch.title)}&author=${encodeURIComponent(bookToFetch.author)}&bookKey=${encodeURIComponent(bookToFetch.bookKey || '')}`
            );
            if (res.ok) {
                const data = await res.json();
                const info = data?.book || {};
                const resolvedSynopsis = bookToFetch.savedSynopsis || info.description || '';
                const resolvedBio = bookToFetch.savedAuthorBio || info.authorBio || '';
                setFetchedDetails({
                    loading: false,
                    description: resolvedSynopsis,
                    authorBio: resolvedBio,
                    coverUrl: info.coverUrl || '',
                    releaseYear: info.releaseYear ? String(info.releaseYear) : '',
                    genre: info.genre || '',
                    narrator: info.narrator || '',
                    availableCovers: Array.isArray(info.availableCovers) ? info.availableCovers : []
                });

                if (info.releaseYear && !editYear) setEditYear(String(info.releaseYear));
                if (info.genre && !editGenre) setEditGenre(info.genre);
                if (info.narrator && !editNarrator) setEditNarrator(info.narrator);
                if (info.coverUrl && !editCoverUrl) setEditCoverUrl(info.coverUrl);
                if (resolvedSynopsis) setEditSynopsis(prev => prev || resolvedSynopsis);
                if (resolvedBio) setEditAuthorBio(prev => prev || resolvedBio);

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
                    toast.success('Fetched book metadata & covers');
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
                        durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : 0
                    }))
                })
            });
        } catch {}
    }, []);

    const openBookModal = useCallback((
        book: any,
        mainTab: 'book' | 'ai' = 'book',
        initialAiSubTab: 'transcription' | 'scening' | 'illustration' | 'voice' = 'transcription',
        openCustomize = false
    ) => {
        const meta = studioBooksMap[book.bookKey] || book.meta || {};
        const enrich = collectionsBookMeta[book.bookKey] || {};
        setEditingBook(book);
        setBookModalMainTab(mainTab);
        setAiSubTab(initialAiSubTab);
        setShowBookCustomizePanel(openCustomize);
        setShowFullBookTranscript(false);
        setExpandedChapterIndices({ 0: true });
        setEditTitle(book.title || '');
        setEditAuthor(book.author || '');
        setEditTranslator(book.translator || '');
        setEditNarrator(book.narrator || '');
        setEditGenre(book.genre || '');
        setEditYear(book.publishedYear ? String(book.publishedYear) : '');
        setEditCoverUrl(book.posterUrl || '');
        setEditSynopsis(enrich.synopsis || book.savedSynopsis || '');
        setEditAuthorBio(enrich.authorBio || book.savedAuthorBio || '');
        setEditArtStyle(meta.art_style || studioConfig?.artStyle || 'Cinematic Concept Art');
        setEditVoicePreset(meta.voice_preset || studioConfig?.defaultVoicePreset || 'clear_voice');
        setEditEnhancePreset(meta.enhance_preset || studioConfig?.audioEnhancePreset || 'denoise_clarity');
        setEditScenesPerChapter(Number(meta.images_per_chapter || studioConfig?.imagesPerChapter || 3));
        setEditNumAlternatives(2);
        setEditSceneFocus(meta.art_focus || studioConfig?.artFocus || 'auto-choice');
        setEditVisualNotes(meta.custom_prompt || '');
        const bTrans = meta.transcribe_enabled !== undefined ? Boolean(meta.transcribe_enabled) : true;
        const bScen = meta.scening_enabled !== undefined ? Boolean(meta.scening_enabled) : true;
        const bIll = bScen ? (meta.illustrate_enabled !== undefined ? Boolean(meta.illustrate_enabled) : true) : false;
        setEditBookTranscribeEnabled(bTrans);
        setEditBookSceningEnabled(bScen);
        setEditBookIllustrateEnabled(bIll);
        setFetchedDetails({ loading: true });

        // Load visual portfolio (characters & settings bible) and fresh chapter metadata (transcripts & images)
        fetch(`/api/theater/audiobooks/studio?bookKey=${encodeURIComponent(book.bookKey)}`)
            .then(r => r.json())
            .then(d => {
                if (d && d.portfolio) setBookPortfolio(d.portfolio);
                else setBookPortfolio(null);

                if (d && Array.isArray(d.chapters)) {
                    setStudioChaptersMap(prev => {
                        const next = { ...prev };
                        for (const ch of d.chapters) {
                            if (ch.chapter_key) next[ch.chapter_key] = ch;
                            if (ch.track_id) next[ch.track_id] = ch;
                            next[`${ch.book_key}::ch${ch.chapter_index}`] = ch;
                        }
                        return next;
                    });
                }
            })
            .catch(() => setBookPortfolio(null));

        syncBookChaptersSilently(book);
        handleFetchBookMetadata(book, false);
    }, [studioBooksMap, collectionsBookMeta, studioConfig, syncBookChaptersSilently, handleFetchBookMetadata]);

    // Deep-link support from Theater / Expanded Player (?bookKey=... or ?subTab=...)
    useEffect(() => {
        if (typeof window === 'undefined' || didHandleInitialUrlParams) return;
        const params = new URLSearchParams(window.location.search);
        const subTabParam = params.get('subTab');
        if (subTabParam === 'collections' || subTabParam === 'renamer' || subTabParam === 'ai' || subTabParam === 'queue_settings' || subTabParam === 'books') {
            setActiveSubTab(subTabParam);
        }
        const bookKeyParam = params.get('bookKey');
        if (!bookKeyParam) {
            setDidHandleInitialUrlParams(true);
            return;
        }
        if (allBooks.length > 0) {
            const normParam = normalizeSearchText(bookKeyParam);
            const target = allBooks.find(
                b => normalizeSearchText(b.bookKey) === normParam ||
                     normalizeSearchText(b.title) === normParam ||
                     normalizeSearchText(b.bookKey).includes(normParam) ||
                     (b.title.length > 2 && normParam.includes(normalizeSearchText(b.title)))
            );
            if (target) {
                openBookModal(target, 'ai', 'transcription');
            }
            setDidHandleInitialUrlParams(true);
        }
    }, [allBooks, didHandleInitialUrlParams, openBookModal]);

    // Keep editingBook synchronized when studioBooksMap/studioChaptersMap refreshes
    const currentModalBook = useMemo(() => {
        if (!editingBook) return null;
        return allBooks.find(b => b.bookKey === editingBook.bookKey || b.title === editingBook.title) || editingBook;
    }, [editingBook, allBooks]);

    const allBookPaintedImages = useMemo(() => {
        const list: Array<any> = [];
        if (!currentModalBook) return list;

        // Custom AI Book Cover
        if (currentModalBook.customCoverUrl) {
            list.push({
                id: 'custom_cover',
                url: currentModalBook.customCoverUrl,
                title: 'Custom AI Book Cover',
                chapterTitle: 'Book Cover Edition',
                prompt: currentModalBook.meta?.custom_prompt || 'Custom AI Book Cover Edition',
                artType: 'cover',
                createdAt: currentModalBook.meta?.updated_at
            });
        }

        // Chapter Scenes
        (currentModalBook.chapters || []).forEach((chTrack: any, chIdx: number) => {
            const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
            const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
            (chMeta.images || []).forEach((img: any, sIdx: number) => {
                if (img && img.url && img.kept !== false && !String(img.url).toLowerCase().includes('.svg')) {
                    list.push({
                        ...img,
                        chapterIndex: chIdx,
                        chapterTitle: chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`,
                        chapterKey,
                        sceneIndex: sIdx
                    });
                }
            });
        });
        return list;
    }, [currentModalBook, studioBooksMap, studioChaptersMap, resolveChapterMeta]);

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
                    coverUrl: editCoverUrl.trim() || null,
                    useCustomCover: currentModalBook.customCoverUrl && editCoverUrl.trim() === currentModalBook.customCoverUrl ? true : false,
                    synopsis: editSynopsis.trim(),
                    authorBio: editAuthorBio.trim()
                })
            });
            if (res.ok) {
                setFetchedDetails(prev => ({
                    ...prev,
                    description: editSynopsis.trim() || prev.description,
                    authorBio: editAuthorBio.trim() || prev.authorBio,
                    coverUrl: editCoverUrl.trim() || prev.coverUrl,
                    releaseYear: editYear || prev.releaseYear,
                    genre: editGenre || prev.genre,
                    narrator: editNarrator || prev.narrator
                }));
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

    const handleSelectBookCover = async (chosenUrl: string, sourceLabel = 'Cover') => {
        if (!currentModalBook || !chosenUrl) return;
        setEditCoverUrl(chosenUrl);
        setSavingMetadata(true);
        try {
            const isAi = Boolean(currentModalBook.customCoverUrl && chosenUrl === currentModalBook.customCoverUrl);
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'edit_book_metadata',
                    bookKey: currentModalBook.bookKey,
                    title: currentModalBook.title,
                    author: currentModalBook.author,
                    coverUrl: chosenUrl,
                    thumb: chosenUrl,
                    useCustomCover: isAi
                })
            });
            if (res.ok) {
                setFetchedDetails(prev => ({ ...prev, coverUrl: chosenUrl }));
                toast.success(`Switched to ${sourceLabel}`);
                fetchAll();
            } else {
                toast.error('Failed to swap cover art');
            }
        } catch {
            toast.error('Error swapping cover art');
        } finally {
            setSavingMetadata(false);
        }
    };

    const handleSaveBookStudioSettings = async (
        silent = false,
        overrideStepToggles?: { transcribeEnabled?: boolean; sceningEnabled?: boolean; illustrateEnabled?: boolean }
    ) => {
        if (!currentModalBook) return;
        if (!silent) setRunningStudioAction('save_settings');
        try {
            const nextTrans = overrideStepToggles?.transcribeEnabled ?? editBookTranscribeEnabled;
            const nextScen = overrideStepToggles?.sceningEnabled ?? editBookSceningEnabled;
            const nextIll = nextScen ? (overrideStepToggles?.illustrateEnabled ?? editBookIllustrateEnabled) : false;

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
                    customPrompt: editVisualNotes,
                    transcribeEnabled: nextTrans,
                    sceningEnabled: nextScen,
                    illustrateEnabled: nextIll
                })
            });
            if (res.ok) {
                if (!silent) toast.success('Saved book AI options');
                fetchAll();
            }
        } catch {
            if (!silent) toast.error('Error saving options');
        } finally {
            if (!silent) setRunningStudioAction(null);
        }
    };

    // Priority Queue Reordering (Drag & Drop or Up/Down/Top Arrow Buttons)
    const handleReorderPriorityQueue = async (orderedBookKeys: string[], movedBookKey?: string, movedToHigherPriority = false) => {
        try {
            if (movedBookKey && movedToHigherPriority && workerState?.isRunning && workerState?.activeBookKey && workerState.activeBookKey !== movedBookKey) {
                setPriorityMovedBookKeys(prev => ({ ...prev, [movedBookKey]: true }));
            }
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reorder_queue',
                    orderedBookKeys
                })
            });
            if (res.ok) {
                toast.success('Updated book priority queue');
                pollStudioOnly();
            }
        } catch {
            toast.error('Failed to reorder queue');
        }
    };

    const handleMoveBookInQueue = async (bookKey: string, direction: 'top' | 'up' | 'down') => {
        const currentKeys = priorityQueueBooks.map(b => b.bookKey);
        const fromIdx = currentKeys.indexOf(bookKey);
        if (fromIdx === -1) return;
        const toIdx =
            direction === 'top'
                ? 0
                : direction === 'up'
                ? Math.max(0, fromIdx - 1)
                : Math.min(currentKeys.length - 1, fromIdx + 1);
        if (fromIdx === toIdx) return;

        // Ensure all books in priorityQueueBooks have their chapters synced if moving to #1
        const movedBook = priorityQueueBooks[fromIdx];
        if (movedBook && toIdx === 0) {
            syncBookChaptersSilently(movedBook);
        }

        const nextKeys = [...currentKeys];
        const [removed] = nextKeys.splice(fromIdx, 1);
        nextKeys.splice(toIdx, 0, removed);
        await handleReorderPriorityQueue(nextKeys, bookKey, toIdx < fromIdx);
    };

    const handleDropBookOnQueue = async (targetBookKey: string) => {
        if (!draggedBookKey || draggedBookKey === targetBookKey) {
            setDraggedBookKey(null);
            setDragOverBookKey(null);
            return;
        }
        const currentKeys = priorityQueueBooks.map(b => b.bookKey);
        const fromIdx = currentKeys.indexOf(draggedBookKey);
        const toIdx = currentKeys.indexOf(targetBookKey);
        setDraggedBookKey(null);
        setDragOverBookKey(null);
        if (fromIdx === -1 || toIdx === -1) return;

        const movedBook = priorityQueueBooks[fromIdx];
        if (movedBook) {
            syncBookChaptersSilently(movedBook);
        }

        const nextKeys = [...currentKeys];
        const [removed] = nextKeys.splice(fromIdx, 1);
        nextKeys.splice(toIdx, 0, removed);
        await handleReorderPriorityQueue(nextKeys, draggedBookKey, toIdx < fromIdx);
    };

    const handleToggleBookQueueStatus = async (book: any) => {
        try {
            await syncBookChaptersSilently(book);
            const nextQueued = !book.isQueued;
            await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_book_settings',
                    bookKey: book.bookKey,
                    title: book.title,
                    author: book.author,
                    isQueued: nextQueued,
                    queuePriority: nextQueued ? (book.queueOrder < 9000 ? book.queueOrder : priorityQueueBooks.length + 1) : 9999
                })
            });
            toast.success(nextQueued ? `Queued "${book.title}"` : `Paused "${book.title}"`);
            pollStudioOnly();
        } catch {
            toast.error('Failed to update book queue status');
        }
    };

    const handleTriggerAutomatedQueueRun = async () => {
        setRunningStudioAction('run_queue');
        try {
            // Sync top queued books so their chapters exist in SQLite before worker runs
            for (const b of priorityQueueBooks.slice(0, 6)) {
                await syncBookChaptersSilently(b);
            }
            const orderedBookKeys = priorityQueueBooks.filter(b => b.isQueued).map(b => b.bookKey);
            if (orderedBookKeys.length > 0) {
                await fetch('/api/theater/audiobooks/studio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'reorder_queue',
                        orderedBookKeys
                    })
                });
            }
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'run_worker_step'
                })
            });
            if (res.ok) {
                toast.success('Started automated pipeline queue');
                pollStudioOnly();
            }
        } catch {
            toast.error('Failed to start queue');
        } finally {
            setRunningStudioAction(null);
        }
    };

    // STAGE 2: Detect Scene Transitions with LLM from Timestamped Transcript (without painting images yet)
    const handleAutoGenScenes = async () => {
        if (!currentModalBook) return;
        setRunningStudioAction('auto_gen_scenes');
        try {
            await handleSaveBookStudioSettings(true);
            await syncBookChaptersSilently(currentModalBook);
            const firstCh = currentModalBook.chapters[0];
            const firstMeta = firstCh ? resolveChapterMeta(currentModalBook.bookKey, firstCh, 0) : {};
            const firstChKey = firstMeta.chapter_key || `${currentModalBook.bookKey}::ch1`;

            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'run_chapter_task',
                    bookKey: currentModalBook.bookKey,
                    bookTitle: currentModalBook.title,
                    author: currentModalBook.author,
                    chapterKey: firstChKey,
                    chapterIndex: 1,
                    chapterTitle: firstCh?.title || firstCh?.name || 'Chapter 1',
                    filePath: firstCh?.path || firstMeta.file_path || '',
                    durationSec: firstCh?.durationMs ? Math.round(firstCh.durationMs / 1000) : (firstMeta.duration_sec || 300),
                    taskType: 'detect_scenes',
                    artStyle: editArtStyle || undefined,
                    voicePreset: editVoicePreset || undefined,
                    runInBackground: true,
                    allChapters: true
                })
            });
            const data = await res.json();
            if (res.ok && data.success !== false) {
                setExpandedChapterIndices(prev => ({ ...prev, 0: true }));
                toast.info(`Started LLM Scene Detection across "${currentModalBook.title}"`);
                pollStudioOnly();
            } else {
                toast.error(data.error || 'Complete Step 1 (Transcription) before detecting scenes');
            }
        } catch {
            toast.error('Failed to start scene detection');
        } finally {
            setRunningStudioAction(null);
        }
    };

    // STAGE 3: Paint Created Scenes with Image API across the book
    const handlePaintAllScenes = async () => {
        if (!currentModalBook) return;
        setRunningStudioAction('paint_all_scenes');
        try {
            await handleSaveBookStudioSettings(true);
            await syncBookChaptersSilently(currentModalBook);
            const firstCh = currentModalBook.chapters[0];
            const firstMeta = firstCh ? resolveChapterMeta(currentModalBook.bookKey, firstCh, 0) : {};
            const firstChKey = firstMeta.chapter_key || `${currentModalBook.bookKey}::ch1`;

            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'run_chapter_task',
                    bookKey: currentModalBook.bookKey,
                    bookTitle: currentModalBook.title,
                    author: currentModalBook.author,
                    chapterKey: firstChKey,
                    chapterIndex: 1,
                    chapterTitle: firstCh?.title || firstCh?.name || 'Chapter 1',
                    filePath: firstCh?.path || firstMeta.file_path || '',
                    durationSec: firstCh?.durationMs ? Math.round(firstCh.durationMs / 1000) : (firstMeta.duration_sec || 300),
                    taskType: 'paint_scenes',
                    artStyle: editArtStyle || undefined,
                    voicePreset: editVoicePreset || undefined,
                    runInBackground: true,
                    allChapters: true
                })
            });
            const data = await res.json();
            if (res.ok && data.success !== false) {
                setExpandedChapterIndices(prev => ({ ...prev, 0: true }));
                toast.info(`Started painting detected scenes across "${currentModalBook.title}"`);
                pollStudioOnly();
            } else {
                toast.error(data.error || 'Detect scenes (Step 2) before painting');
            }
        } catch {
            toast.error('Failed to start scene painting');
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
                    ? 'Full Pipeline (Transcribe → Scenes → Paint)'
                    : targetSubTab === 'transcription'
                    ? 'Transcriptions'
                    : 'Voice Audio';

            const firstCh = currentModalBook.chapters[0];
            const firstMeta = firstCh ? resolveChapterMeta(currentModalBook.bookKey, firstCh, 0) : {};
            const firstChKey = firstMeta.chapter_key || `${currentModalBook.bookKey}::ch1`;

            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'run_chapter_task',
                    bookKey: currentModalBook.bookKey,
                    bookTitle: currentModalBook.title,
                    author: currentModalBook.author,
                    chapterKey: firstChKey,
                    chapterIndex: 1,
                    chapterTitle: firstCh?.title || firstCh?.name || 'Chapter 1',
                    filePath: firstCh?.path || firstMeta.file_path || '',
                    durationSec: firstCh?.durationMs ? Math.round(firstCh.durationMs / 1000) : (firstMeta.duration_sec || 300),
                    taskType,
                    artStyle: editArtStyle || undefined,
                    voicePreset: editVoicePreset || undefined,
                    runInBackground: true,
                    allChapters: true
                })
            });
            const data = await res.json();
            if (res.ok && data.success !== false) {
                setExpandedChapterIndices(prev => ({ ...prev, 0: true }));
                toast.info(`Started ${label} across "${currentModalBook.title}"`);
                pollStudioOnly();
            } else {
                toast.error(data.error || `Failed to start ${label}`);
            }
        } catch {
            toast.error('Generation failed to start');
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

    const handleRunChapterTask = async (
        chTrack: any,
        idx: number,
        task: 'transcribe' | 'detect_scenes' | 'paint_scenes' | 'illustrate' | 'enhance' | 'all',
        overrideVoicePreset?: string
    ) => {
        if (!currentModalBook) return;
        const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, idx);
        const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${idx + 1}`;
        const taskKey = `${chapterKey}::${task}`;
        setRunningChapterTaskKey(taskKey);
        setExpandedChapterIndices(prev => ({ ...prev, [idx]: true }));
        try {
            await syncBookChaptersSilently(currentModalBook);
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
                    forceRestart: task === 'transcribe',
                    runInBackground: true
                })
            });
            const data = await res.json();
            if (res.ok && data.success !== false) {
                const taskLabel =
                    task === 'transcribe'
                        ? 'Step 1: Transcription'
                        : task === 'detect_scenes'
                        ? 'Step 2: LLM Scene Detection'
                        : task === 'paint_scenes'
                        ? 'Step 3: Scene Painting'
                        : task === 'illustrate'
                        ? 'Full Scene Pipeline'
                        : 'Voice Enhancement';
                toast.info(`Started ${taskLabel} for Chapter ${idx + 1}`);
                pollStudioOnly();
            } else {
                toast.error(data.error || `Failed Chapter ${idx + 1}`);
            }
        } catch {
            toast.error(`Error running ${task}`);
        } finally {
            setRunningChapterTaskKey(null);
        }
    };

    const handleGeneratePortfolio = async () => {
        if (!currentModalBook) return;
        setIsLoadingPortfolio(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate_book_portfolio',
                    bookKey: currentModalBook.bookKey
                })
            });
            const data = await res.json();
            if (data.success && data.portfolio) {
                setBookPortfolio(data.portfolio);
                toast.success('Visual character & setting bible generated!');
            } else {
                toast.error(data.error || 'Failed to generate visual portfolio');
            }
        } catch {
            toast.error('Network error generating portfolio');
        } finally {
            setIsLoadingPortfolio(false);
        }
    };

    const handlePaintPortfolioItem = async (itemId: string, itemType: 'character' | 'location', customPrompt?: string) => {
        if (!currentModalBook) return;
        setPaintingPortfolioItemId(itemId);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'paint_portfolio_item',
                    bookKey: currentModalBook.bookKey,
                    itemId,
                    itemType,
                    customPrompt
                })
            });
            const data = await res.json();
            if (data.success && data.portfolio) {
                setBookPortfolio(data.portfolio);
                toast.success(itemType === 'character' ? 'Character portrait painted!' : 'Setting illustration painted!');
            } else {
                toast.error(data.error || 'Could not paint item');
            }
        } catch {
            toast.error('Network error painting portfolio item');
        } finally {
            setPaintingPortfolioItemId(null);
        }
    };

    const handlePromoteImageToBookCover = async (imageUrl: string) => {
        if (!currentModalBook || !imageUrl) return;
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'edit_book_metadata',
                    bookKey: currentModalBook.bookKey,
                    title: currentModalBook.title,
                    author: currentModalBook.author,
                    coverUrl: imageUrl,
                    thumb: imageUrl,
                    useCustomCover: true
                })
            });
            if (res.ok) {
                toast.success('Promoted image to primary book cover!');
                fetchAll();
            } else {
                toast.error('Failed to set book cover');
            }
        } catch {
            toast.error('Error setting book cover');
        }
    };

    const handleDeleteImageFromLightbox = async (chapterKey: string, imageId: string) => {
        if (!chapterKey || !imageId) return;
        await handleCurateSceneImage(chapterKey, imageId, 'delete');
        setLightboxImage(null);
    };

    const handleNavigateLightbox = (direction: 'prev' | 'next') => {
        if (!lightboxImage || !lightboxImage.allImages || lightboxImage.allImages.length === 0) return;
        const curIdx = lightboxImage.currentIndex ?? 0;
        const total = lightboxImage.allImages.length;
        const nextIdx = direction === 'next' ? (curIdx + 1) % total : (curIdx - 1 + total) % total;
        const nextItem = lightboxImage.allImages[nextIdx];
        if (nextItem) {
            setLightboxImage({
                ...nextItem,
                allImages: lightboxImage.allImages,
                currentIndex: nextIdx
            });
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
    const openCreateSeriesModal = () => {
        setEditingCollectionId(null);
        setCollectionName('');
        setCollectionAuthor('');
        setCollectionDesc('');
        setCollectionBookKeys([]);
        setSeriesBuilderSearch('');
        setSeriesBuilderAuthor('ALL');
        setShowSeriesModal(true);
    };

    const openEditSeriesModal = (series: any) => {
        setEditingCollectionId(series.id);
        setCollectionName(series.name || '');
        setCollectionAuthor(series.author || '');
        setCollectionDesc(series.description || '');
        setCollectionBookKeys(Array.isArray(series.bookKeys) ? [...series.bookKeys] : []);
        setSeriesBuilderSearch('');
        const matchedAuthor = availableAuthors.find(
            a => normalizeSearchText(a.name) === normalizeSearchText(series.author)
        )?.name;
        setSeriesBuilderAuthor(matchedAuthor || 'ALL');
        setShowSeriesModal(true);
    };

    const handleSaveCollection = async () => {
        if (!collectionName.trim()) {
            toast.error('Enter a series name');
            return;
        }
        if (collectionBookKeys.length === 0) {
            toast.error('Select at least 1 book for the series');
            return;
        }
        try {
            const id = editingCollectionId && !editingCollectionId.startsWith('auto-')
                ? editingCollectionId
                : `col-${collectionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const firstBook = allBooks.find(b => collectionBookKeys.includes(b.bookKey));
            const effectiveAuthor = collectionAuthor.trim() || firstBook?.author || 'Various Authors';
            const cleanName = collectionName.trim();
            const cleanDesc = collectionDesc.trim() || `${effectiveAuthor} • ${collectionBookKeys.length} Books`;

            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_collection',
                    id,
                    name: cleanName,
                    author: effectiveAuthor,
                    description: cleanDesc,
                    bookKeys: collectionBookKeys,
                    collection: {
                        id,
                        name: cleanName,
                        author: effectiveAuthor,
                        description: cleanDesc,
                        bookKeys: collectionBookKeys,
                        source: 'manual'
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                toast.success(`Saved "${cleanName}" (${collectionBookKeys.length} books)`);
                setShowSeriesModal(false);
                setEditingCollectionId(null);
                setCollectionName('');
                setCollectionAuthor('');
                setCollectionDesc('');
                setCollectionBookKeys([]);
                fetchAll();
            } else {
                toast.error(data.error || 'Failed to save series');
            }
        } catch {
            toast.error('Failed to save series');
        }
    };

    const handleReorderSeriesBook = async (series: any, fromIdx: number, toIdx: number) => {
        const nextKeys = [...(series.bookKeys || [])];
        if (toIdx < 0 || toIdx >= nextKeys.length) return;
        const [moved] = nextKeys.splice(fromIdx, 1);
        nextKeys.splice(toIdx, 0, moved);

        try {
            const id = series.id && !String(series.id).startsWith('auto-')
                ? series.id
                : `col-${series.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_collection',
                    id,
                    name: series.name,
                    author: series.author,
                    description: series.description,
                    bookKeys: nextKeys,
                    collection: {
                        id,
                        name: series.name,
                        author: series.author,
                        description: series.description,
                        bookKeys: nextKeys,
                        source: 'manual'
                    }
                })
            });
            pollStudioOnly();
        } catch {
            toast.error('Failed to reorder series');
        }
    };

    const handleDeleteCollection = async (id: string) => {
        try {
            await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'explode_collection',
                    collectionId: id
                })
            });
            toast.success('Removed series');
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
                toast.success(`Grouped ${data.collectionsCreated ?? combinedSeriesList.length} series`);
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
                    action: 'preview_rename_books',
                    books: [{
                        bookKey: book.bookKey,
                        title: book.title,
                        cleanTitle: book.cleanTitle,
                        author: book.author,
                        releaseYear: book.publishedYear || '',
                        collectionName: book.inferredCollection || '',
                        bookNumber: book.bookNumber,
                        chapters: book.chapters.map((ch: any, idx: number) => ({
                            chapterIndex: idx + 1,
                            title: ch.title || ch.name || `Chapter ${idx + 1}`,
                            path: ch.path || ''
                        }))
                    }]
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
                    action: 'execute_rename_books',
                    books: [{
                        bookKey: book.bookKey,
                        title: book.title,
                        cleanTitle: book.cleanTitle,
                        author: book.author,
                        releaseYear: book.publishedYear || '',
                        collectionName: book.inferredCollection || '',
                        bookNumber: book.bookNumber,
                        chapters: book.chapters.map((ch: any, idx: number) => ({
                            chapterIndex: idx + 1,
                            title: ch.title || ch.name || `Chapter ${idx + 1}`,
                            path: ch.path || ''
                        }))
                    }]
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

    const handleToggleAiPaused = async () => {
        const nextPaused = !Boolean(studioConfig?.aiPaused);
        setSavingConfig(true);
        try {
            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_ai_paused',
                    paused: nextPaused
                })
            });
            if (res.ok) {
                toast.success(nextPaused ? 'Paused all AI tasks' : 'Resumed AI tasks');
                fetchAll();
            } else {
                toast.error('Failed to update AI pause state');
            }
        } catch {
            toast.error('Error updating AI pause state');
        } finally {
            setSavingConfig(false);
        }
    };

    const handleCleanGeneratedData = (
        target: 'images' | 'scenes' | 'transcripts' | 'voices' | 'api_history' | 'all',
        label: string,
        bookKey?: string
    ) => {
        setConfirmModal({
            isOpen: true,
            title: `Clean ${label}`,
            description: target === 'all'
                ? 'This will pause the AI engine and permanently wipe all generated scene images, prompts, transcripts, and voice exports.'
                : `Are you sure you want to clean ${label.toLowerCase()}? This will permanently remove the selected generated data.`,
            confirmText: 'Clean',
            variant: target === 'all' ? 'danger' : 'warning',
            onConfirm: async () => {
                setConfirmModal(null);
                setSavingConfig(true);
                try {
                    const res = await fetch('/api/theater/audiobooks/studio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'clean_generated_data',
                            target,
                            bookKey,
                            pauseAiFirst: target === 'all' && !bookKey
                        })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const r = data.result || {};
                        toast.success(`Cleaned ${label} (${r.deletedFilesCount || 0} files deleted)`);
                        fetchAll();
                    } else {
                        toast.error(`Failed to clean ${label}`);
                    }
                } catch {
                    toast.error(`Error cleaning ${label}`);
                } finally {
                    setSavingConfig(false);
                }
            }
        });
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
                            {combinedSeriesList.length}
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

                    {studioConfig?.aiFeaturesEnabled !== false && (
                        <button
                            onClick={() => setActiveSubTab('ai')}
                            title="AI Queue & Processing Pipeline"
                            className={`px-5 py-3 rounded-2xl text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                                activeSubTab === 'ai'
                                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                    : 'bg-zinc-950/90 text-amber-300 hover:text-white border border-amber-500/40'
                            }`}
                        >
                            <Sparkles size={20} />
                            <span>AI</span>
                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-black ${
                                activeSubTab === 'ai' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                                {priorityQueueBooks.filter(b => b.isQueued).length}
                            </span>
                        </button>
                    )}

                    <button
                        onClick={() => setActiveSubTab('queue_settings')}
                        title="Audiobook Features, Providers & AI Toggle"
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

                <div className="flex items-center gap-3 flex-wrap">
                    {workerState?.isRunning && !studioConfig?.aiPaused && (
                        <div className="px-4 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm font-black flex items-center gap-2 animate-pulse">
                            <RefreshCw size={16} className="animate-spin" />
                            <span>{workerState.currentStep || workerState.activeBookTitle || 'Working...'}</span>
                        </div>
                    )}
                    <button
                        onClick={handleToggleAiPaused}
                        disabled={savingConfig}
                        title={
                            studioConfig?.aiPaused
                                ? 'AI is paused. Click to resume background AI tasks.'
                                : 'Immediately pause all AI tasks (transcription, scening, and image generation) to prevent API calls.'
                        }
                        className={`px-5 py-3 rounded-2xl text-sm font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 ${
                            studioConfig?.aiPaused
                                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg'
                                : 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40'
                        }`}
                    >
                        {studioConfig?.aiPaused ? <Play size={18} /> : <Pause size={18} />}
                        <span>{studioConfig?.aiPaused ? 'Resume AI' : 'Pause AI'}</span>
                    </button>
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
                    {/* Filter & Sort Toolbar (Identical to Theater, wrapping Genre pills with zero horizontal scrollbar) */}
                    <div className="p-5 rounded-3xl bg-zinc-900/50 border border-zinc-800/80 space-y-4">
                        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
                            {/* Genre Pills */}
                            <div className="flex items-center gap-2 flex-wrap">
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
                                    onClick={() => openBookModal(book, 'book', 'transcription')}
                                    className="p-5 rounded-3xl bg-zinc-900/70 hover:bg-zinc-900 border-2 border-zinc-800/90 hover:border-amber-500/60 flex flex-col justify-between gap-4 transition-all cursor-pointer shadow-xl group"
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Book Cover or Styled Hardcover Placeholder — Clicking opens Expanded Book Showcase */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openBookModal(book, 'book', 'transcription');
                                            }}
                                            title="Open Expanded Book View"
                                            className="w-28 h-40 rounded-2xl bg-gradient-to-br from-amber-950/80 via-zinc-900 to-zinc-950 border-2 border-amber-700/40 group-hover:border-amber-400 overflow-hidden shrink-0 flex flex-col items-center justify-center relative shadow-lg transition-all"
                                        >
                                            {book.posterUrl ? (
                                                <img src={book.posterUrl} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openBookModal(book, 'book', 'transcription', true);
                                                }}
                                                title="Swap Cover Art & Edit Synopsis"
                                                className="absolute top-1.5 right-1.5 p-1.5 rounded-xl bg-black/80 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 shadow-lg transition-all cursor-pointer"
                                            >
                                                <Sliders size={14} />
                                            </button>
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

                                            {/* AI Asset Counters (Strictly ordered: 1. Transcription -> 2. Scening -> 3. Illustration + Voice) */}
                                            <div className="pt-1 flex items-center gap-2 flex-wrap">
                                                <span
                                                    title="1. Timestamped Transcription Progress"
                                                    className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-black flex items-center gap-1.5"
                                                >
                                                    <FileText size={13} />
                                                    {book.transCh}/{book.totalCh}
                                                </span>
                                                <span
                                                    title="2. Detected Scenes"
                                                    className="px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/35 text-purple-300 text-xs font-black flex items-center gap-1.5"
                                                >
                                                    <Wand2 size={13} />
                                                    {book.detectedScenesCount || 0}
                                                </span>
                                                <span
                                                    title="3. Painted Illustrations & Voice Presets"
                                                    className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-black flex items-center gap-1.5"
                                                >
                                                    <ImageIcon size={13} />
                                                    {book.paintedScenesCount || 0} • <Headphones size={12} /> {book.enhCh}/{book.totalCh}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Bottom Action Bar: Book Info vs AI Features */}
                                    <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-2 gap-2.5" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => openBookModal(book, 'book', 'transcription')}
                                            title="Open Book Details, Cover & Synopsis"
                                            className="px-4 py-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <BookOpen size={17} className="text-amber-400" />
                                            <span>Book</span>
                                        </button>
                                        <button
                                            onClick={() => openBookModal(book, 'ai', 'transcription')}
                                            title="Open AI Features (1. Transcription -> 2. Scening -> 3. Illustration + Voice)"
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

            {/* ── TAB 2: SERIES (FULL-WIDTH VISUAL SERIES CARDS + SERIES BUILDER MODAL) ── */}
            {activeSubTab === 'collections' && (
                <div className="space-y-6">
                    {/* Top Series Bar */}
                    <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input
                                type="text"
                                value={seriesSearchQuery}
                                onChange={e => setSeriesSearchQuery(e.target.value)}
                                placeholder="Search series, author, or book..."
                                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-base text-white focus:outline-none focus:border-amber-500"
                            />
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={handleAiAutoGroupCollections}
                                disabled={aiGroupingCollections}
                                title="Scan library and group series automatically"
                                className="px-5 py-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-amber-500/40 text-sm font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                <Sparkles size={18} className={aiGroupingCollections ? 'animate-spin' : ''} />
                                <span>Auto Group</span>
                            </button>

                            <button
                                onClick={openCreateSeriesModal}
                                title="Create a new book series"
                                className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
                            >
                                <Plus size={18} />
                                <span>New Series</span>
                            </button>
                        </div>
                    </div>

                    {/* Series Cards Grid */}
                    {filteredSeriesList.length === 0 ? (
                        <div className="p-16 rounded-3xl bg-zinc-900/40 border border-zinc-800 text-center space-y-4">
                            <FolderPlus size={48} className="mx-auto text-amber-400/60" />
                            <p className="text-xl font-black text-white">No Series Found</p>
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    onClick={handleAiAutoGroupCollections}
                                    className="px-6 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/40 font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                                >
                                    <Sparkles size={18} />
                                    <span>Auto Group</span>
                                </button>
                                <button
                                    onClick={openCreateSeriesModal}
                                    className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                                >
                                    <Plus size={18} />
                                    <span>New Series</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {filteredSeriesList.map((series: any) => {
                                const seriesBooks: any[] = series.books || [];
                                const coverPreviews = seriesBooks.slice(0, 4);

                                return (
                                    <div
                                        key={series.id}
                                        className="p-6 rounded-3xl bg-zinc-900/70 border-2 border-zinc-800/90 hover:border-amber-500/50 flex flex-col justify-between gap-5 shadow-xl transition-all"
                                    >
                                        {/* Series Top Header: Fanned Book Covers + Title + Author + Controls */}
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4 min-w-0">
                                                {/* Fanned Cover Stack */}
                                                <div className="flex items-center -space-x-5 shrink-0 pr-2">
                                                    {coverPreviews.length > 0 ? (
                                                        coverPreviews.map((b: any, cIdx: number) => (
                                                            <div
                                                                key={b.bookKey || cIdx}
                                                                onClick={() => openBookModal(b, 'book', 'transcription')}
                                                                title={b.title}
                                                                style={{ zIndex: 10 - cIdx }}
                                                                className="w-16 h-24 rounded-xl bg-gradient-to-b from-[#2e1d11] to-[#120b07] border-2 border-amber-500/40 hover:border-amber-300 overflow-hidden shadow-lg flex items-center justify-center shrink-0 cursor-pointer transition-transform hover:-translate-y-1"
                                                            >
                                                                {b.posterUrl ? (
                                                                    <img src={b.posterUrl} alt={b.title} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <BookOpen size={20} className="text-amber-400/80" />
                                                                )}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="w-16 h-24 rounded-xl bg-zinc-950 border-2 border-amber-500/30 flex items-center justify-center">
                                                            <BookOpen size={24} className="text-amber-400" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="min-w-0 space-y-1.5">
                                                    <h4 className="text-xl sm:text-2xl font-black text-white leading-tight">
                                                        {series.name}
                                                    </h4>
                                                    <p className="text-base font-bold text-amber-300">
                                                        {series.author}
                                                    </p>
                                                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                                        <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-black uppercase">
                                                            {seriesBooks.length} {seriesBooks.length === 1 ? 'Book' : 'Books'}
                                                        </span>
                                                        {series.totalDurSec > 0 && (
                                                            <span className="px-3 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono font-bold">
                                                                {formatSec(series.totalDurSec)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => openEditSeriesModal(series)}
                                                    title="Edit Series Books & Reading Order"
                                                    className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 cursor-pointer"
                                                >
                                                    <Edit3 size={18} />
                                                </button>
                                                {series.source === 'manual' && (
                                                    <button
                                                        onClick={() => handleDeleteCollection(series.id)}
                                                        title="Delete Saved Series"
                                                        className="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 cursor-pointer"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Ordered Books Inside Series */}
                                        <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
                                            {seriesBooks.map((book: any, bIdx: number) => (
                                                <div
                                                    key={book.bookKey}
                                                    onClick={() => openBookModal(book, 'book', 'transcription')}
                                                    className="p-3 rounded-2xl bg-zinc-950/90 hover:bg-zinc-900 border border-zinc-800/90 hover:border-amber-500/40 flex items-center justify-between gap-3 cursor-pointer transition-all group"
                                                >
                                                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                        {/* Reading Order Badge */}
                                                        <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-sm font-black flex items-center justify-center shrink-0">
                                                            #{book.bookNumber ?? (bIdx + 1)}
                                                        </span>

                                                        {/* Mini Book Cover */}
                                                        <div className="w-12 h-16 rounded-lg bg-gradient-to-b from-[#2a1b10] to-[#120c07] border border-amber-500/30 overflow-hidden shrink-0 flex items-center justify-center">
                                                            {book.posterUrl ? (
                                                                <img src={book.posterUrl} alt={book.title} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <BookOpen size={16} className="text-amber-400/80" />
                                                            )}
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-base font-black text-white group-hover:text-amber-300 transition-colors leading-snug">
                                                                {book.title}
                                                            </p>
                                                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 flex-wrap mt-0.5">
                                                                {book.publishedYear && (
                                                                    <span className="font-mono text-zinc-300">{book.publishedYear}</span>
                                                                )}
                                                                <span>•</span>
                                                                <span className="font-mono">{book.totalCh} Ch</span>
                                                                {book.totalDurSec > 0 && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span className="font-mono">{formatSec(book.totalDurSec)}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Reorder & Open Controls */}
                                                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                                        {seriesBooks.length > 1 && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleReorderSeriesBook(series, bIdx, bIdx - 1)}
                                                                    disabled={bIdx === 0}
                                                                    title="Move Up in Reading Order"
                                                                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 disabled:opacity-30 cursor-pointer"
                                                                >
                                                                    <ChevronUp size={15} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleReorderSeriesBook(series, bIdx, bIdx + 1)}
                                                                    disabled={bIdx === seriesBooks.length - 1}
                                                                    title="Move Down in Reading Order"
                                                                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 disabled:opacity-30 cursor-pointer"
                                                                >
                                                                    <ChevronDown size={15} />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => openBookModal(book, 'book', 'transcription')}
                                                            title="Book Details"
                                                            className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-black uppercase cursor-pointer"
                                                        >
                                                            Book
                                                        </button>
                                                        <button
                                                            onClick={() => openBookModal(book, 'ai', 'transcription')}
                                                            title="AI Features"
                                                            className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase cursor-pointer"
                                                        >
                                                            AI
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── VISUAL SERIES BUILDER MODAL ── */}
                    {showSeriesModal && (
                        <div
                            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
                            onClick={() => setShowSeriesModal(false)}
                        >
                            <div
                                className="w-full max-w-4xl rounded-3xl bg-zinc-950 border-2 border-zinc-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="p-5 sm:p-6 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <FolderPlus size={24} className="text-amber-400" />
                                        <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">
                                            {editingCollectionId ? 'Edit Series' : 'New Series'}
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => setShowSeriesModal(false)}
                                        className="p-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 cursor-pointer"
                                    >
                                        <X size={22} />
                                    </button>
                                </div>

                                <div className="p-6 overflow-y-auto space-y-5 flex-1">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-black text-amber-300 uppercase tracking-wider mb-1.5">
                                                Series Name
                                            </label>
                                            <input
                                                type="text"
                                                value={collectionName}
                                                onChange={e => setCollectionName(e.target.value)}
                                                placeholder="e.g. Dune Chronicles, Harry Potter..."
                                                className="w-full px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-base font-bold text-white focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-amber-300 uppercase tracking-wider mb-1.5">
                                                Author
                                            </label>
                                            <input
                                                type="text"
                                                value={collectionAuthor}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setCollectionAuthor(val);
                                                    const exactAuthor = availableAuthors.find(
                                                        a => normalizeSearchText(a.name) === normalizeSearchText(val)
                                                    )?.name;
                                                    if (exactAuthor) {
                                                        setSeriesBuilderAuthor(exactAuthor);
                                                    } else if (!val.trim()) {
                                                        setSeriesBuilderAuthor('ALL');
                                                    }
                                                }}
                                                placeholder="Author name..."
                                                className="w-full px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-base font-bold text-white focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Filter Books inside Builder */}
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <select
                                            value={seriesBuilderAuthor}
                                            onChange={e => {
                                                const nextAuth = e.target.value;
                                                setSeriesBuilderAuthor(nextAuth);
                                                if (nextAuth !== 'ALL' && !collectionAuthor.trim()) {
                                                    setCollectionAuthor(nextAuth);
                                                }
                                            }}
                                            title="Filter candidate books by Author"
                                            className="px-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm font-bold text-white cursor-pointer"
                                        >
                                            <option value="ALL">All Authors ({allBooks.length} Books)</option>
                                            {availableAuthors.map(a => (
                                                <option key={a.name} value={a.name}>
                                                    {a.name} ({a.count})
                                                </option>
                                            ))}
                                        </select>

                                        <div className="relative flex-1">
                                            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                            <input
                                                type="text"
                                                value={seriesBuilderSearch}
                                                onChange={e => setSeriesBuilderSearch(e.target.value)}
                                                placeholder="Filter books by title, author, or series..."
                                                className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
                                            />
                                            {seriesBuilderSearch && (
                                                <button
                                                    onClick={() => setSeriesBuilderSearch('')}
                                                    title="Clear filter"
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Visual Selectable Book Grid (Selected books pinned at top in #1, #2... order) */}
                                    {(() => {
                                        const q = normalizeSearchText(seriesBuilderSearch);
                                        const matchesQuery = (b: any) => {
                                            if (!q) return true;
                                            return (
                                                normalizeSearchText(b.title).includes(q) ||
                                                normalizeSearchText(b.rawTitle).includes(q) ||
                                                normalizeSearchText(b.cleanTitle).includes(q) ||
                                                normalizeSearchText(b.author).includes(q) ||
                                                normalizeSearchText(b.inferredCollection).includes(q) ||
                                                normalizeSearchText(b.bookKey).includes(q)
                                            );
                                        };
                                        let builderBooks = allBooks.filter(b => {
                                            const isSelected = collectionBookKeys.includes(b.bookKey);
                                            if (!matchesQuery(b)) return false;
                                            if (isSelected) return true;
                                            if (seriesBuilderAuthor !== 'ALL' && b.author !== seriesBuilderAuthor) return false;
                                            return true;
                                        });
                                        // If user typed a search query that matched books outside the selected author dropdown, show all matching books
                                        if (q && builderBooks.length === 0 && seriesBuilderAuthor !== 'ALL') {
                                            builderBooks = allBooks.filter(matchesQuery);
                                        }
                                        builderBooks.sort((a, b) => {
                                            const idxA = collectionBookKeys.indexOf(a.bookKey);
                                            const idxB = collectionBookKeys.indexOf(b.bookKey);
                                            const selA = idxA !== -1;
                                            const selB = idxB !== -1;
                                            if (selA && selB) return idxA - idxB;
                                            if (selA) return -1;
                                            if (selB) return 1;
                                            const authMatchA = collectionAuthor && normalizeSearchText(a.author) === normalizeSearchText(collectionAuthor);
                                            const authMatchB = collectionAuthor && normalizeSearchText(b.author) === normalizeSearchText(collectionAuthor);
                                            if (authMatchA && !authMatchB) return -1;
                                            if (!authMatchA && authMatchB) return 1;
                                            if ((a.bookNumber ?? 999) !== (b.bookNumber ?? 999)) {
                                                return (a.bookNumber ?? 999) - (b.bookNumber ?? 999);
                                            }
                                            return a.title.localeCompare(b.title);
                                        });

                                        return builderBooks.length === 0 ? (
                                            <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center space-y-2">
                                                <p className="text-base font-black text-zinc-300">No books match "{seriesBuilderSearch}"</p>
                                                {seriesBuilderAuthor !== 'ALL' && (
                                                    <button
                                                        onClick={() => setSeriesBuilderAuthor('ALL')}
                                                        className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-black uppercase cursor-pointer"
                                                    >
                                                        Show All Authors
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                                                {builderBooks.map(b => {
                                                    const orderIdx = collectionBookKeys.indexOf(b.bookKey);
                                                    const selected = orderIdx !== -1;
                                                    return (
                                                        <div
                                                            key={b.bookKey}
                                                            onClick={() => {
                                                                setCollectionBookKeys(prev =>
                                                                    prev.includes(b.bookKey)
                                                                        ? prev.filter(k => k !== b.bookKey)
                                                                        : [...prev, b.bookKey]
                                                                );
                                                                if (!collectionAuthor && b.author) {
                                                                    setCollectionAuthor(b.author);
                                                                }
                                                            }}
                                                            className={`p-3 rounded-2xl border-2 flex items-center gap-3.5 cursor-pointer transition-all ${
                                                                selected
                                                                    ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg'
                                                                    : 'bg-zinc-900/70 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                                                            }`}
                                                        >
                                                            <div className="w-12 h-16 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                                                                {b.posterUrl ? (
                                                                    <img src={b.posterUrl} alt={b.title} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <BookOpen size={18} className="text-amber-400" />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm sm:text-base font-black text-white leading-snug">
                                                                    {b.title}
                                                                </p>
                                                                <p className="text-xs font-bold text-amber-300 truncate">
                                                                    {b.author}
                                                                </p>
                                                            </div>
                                                            <div className={`w-8 h-8 rounded-xl font-mono text-xs font-black flex items-center justify-center shrink-0 ${
                                                                selected ? 'bg-amber-500 text-black' : 'bg-zinc-950 text-zinc-500 border border-zinc-800'
                                                            }`}>
                                                                {selected ? `#${orderIdx + 1}` : '+'}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="p-5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-4">
                                    <span className="text-sm font-black text-amber-300">
                                        {collectionBookKeys.length} {collectionBookKeys.length === 1 ? 'Book' : 'Books'} Selected
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setShowSeriesModal(false)}
                                            className="px-5 py-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-black text-sm uppercase cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveCollection}
                                            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                                        >
                                            <Check size={18} />
                                            <span>Save Series</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
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
                                    <span className="text-zinc-500 line-through truncate">{r.oldFileName || r.oldFolderPath || r.from}</span>
                                    <span className="text-emerald-400 font-bold truncate">{r.newFileName || r.newFolderPath || r.to}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 4: AI (SUBTAB 1: QUEUE | SUBTAB 2: SETTINGS) ── */}
            {activeSubTab === 'ai' && studioConfig?.aiFeaturesEnabled !== false && (
                <div className="space-y-6">
                    {/* Subtab Switcher inside AI Tab: [Queue] | [Settings] + Automation Controls */}
                    <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/70 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={() => setAiMainSubTab('queue')}
                                title="Priority Queue of Books to be Processed"
                                className={`px-6 py-3.5 rounded-2xl text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                                    aiMainSubTab === 'queue'
                                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                        : 'bg-zinc-950 text-zinc-300 hover:text-white border border-zinc-800'
                                }`}
                            >
                                <Layers size={20} />
                                <span>Queue</span>
                                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-black ${
                                    aiMainSubTab === 'queue' ? 'bg-black/20 text-black' : 'bg-zinc-800 text-amber-400'
                                }`}>
                                    {priorityQueueBooks.length}
                                </span>
                            </button>

                            <button
                                onClick={() => setAiMainSubTab('settings')}
                                title="Settings for Transcription, Scening & Imaging"
                                className={`px-6 py-3.5 rounded-2xl text-base font-black uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                                    aiMainSubTab === 'settings'
                                        ? 'bg-purple-500 text-black shadow-lg shadow-purple-500/20'
                                        : 'bg-zinc-950 text-zinc-300 hover:text-white border border-zinc-800'
                                }`}
                            >
                                <Sliders size={20} />
                                <span>Settings</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={() => handleSaveConfig({ autoBackgroundWorker: studioConfig?.autoBackgroundWorker === false ? true : false })}
                                title="Toggle Automated Pipelined Queue Processing"
                                className={`px-5 py-3 rounded-2xl text-sm font-black uppercase tracking-wider flex items-center gap-2 border cursor-pointer transition-all ${
                                    studioConfig?.autoBackgroundWorker !== false
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                                }`}
                            >
                                <Zap size={18} className={studioConfig?.autoBackgroundWorker !== false ? 'text-emerald-400' : 'text-zinc-500'} />
                                <span>Auto: {studioConfig?.autoBackgroundWorker !== false ? 'ON' : 'OFF'}</span>
                            </button>

                            <button
                                onClick={handleTriggerAutomatedQueueRun}
                                disabled={runningStudioAction === 'run_queue'}
                                title="Start or step automated pipeline across queued books"
                                className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                            >
                                <Play size={18} className={runningStudioAction === 'run_queue' ? 'animate-spin' : ''} />
                                <span>{workerState?.isRunning ? 'Pipeline Active' : 'Run Queue'}</span>
                            </button>
                        </div>
                    </div>

                    {/* ── AI SUBTAB 1: BOOK PROCESSING QUEUE ── */}
                    {aiMainSubTab === 'queue' && (() => {
                        const activeWorkerBookKey = workerState?.activeBookKey || workerState?.activeTranscriptionBookKey || workerState?.activeSceningBookKey || workerState?.activeImagingBookKey || null;
                        const activeBookIdx = activeWorkerBookKey
                            ? priorityQueueBooks.findIndex(b => b.bookKey === activeWorkerBookKey)
                            : -1;
                        const globalTransOn = studioConfig?.transcribeEnabled !== false;
                        const globalScenOn = studioConfig?.sceningEnabled !== false;
                        const globalImgOn = globalScenOn && studioConfig?.imagingEnabled !== false;

                        return (
                            <div className="space-y-4">
                                {priorityQueueBooks.map((book, bIdx) => {
                                    const totalCh = Math.max(1, book.totalCh || 1);
                                    const transCh = book.transCh || 0;
                                    const scenedCh = book.scenedCh || 0;
                                    const illCh = book.illCh || 0;
                                    const totalDurSec = Math.max(1, book.totalDurSec || 0);
                                    const transcribedSec = book.transcribedSec || 0;

                                    // 1. Transcription % (uses audio duration ratio or chapter ratio, whichever is more granular)
                                    const transPctByDur = book.totalDurSec > 0 ? Math.round((transcribedSec / totalDurSec) * 100) : 0;
                                    const transPctByCh = Math.round((transCh / totalCh) * 100);
                                    const transPct = Math.min(100, Math.max(transPctByDur, transPctByCh));

                                    // 2. Scening %
                                    const scenedPct = Math.min(100, Math.round((scenedCh / totalCh) * 100));

                                    // 3. Imaging %
                                    const imgPct = book.detectedScenesCount > 0
                                        ? Math.min(100, Math.round(((book.paintedScenesCount || 0) / book.detectedScenesCount) * 100))
                                        : Math.min(100, Math.round((illCh / totalCh) * 100));

                                    const effTransOn = globalTransOn && book.transcribeEnabled !== false;
                                    const effScenOn = globalScenOn && book.sceningEnabled !== false;
                                    const effImgOn = globalImgOn && effScenOn && book.illustrateEnabled !== false;

                                    // Determine if this book was moved to higher priority (or sits above the currently running book) and is waiting for the ongoing task chunk to finish
                                    const isActivelyWorkingThisBook =
                                        book.isTranscribingNow ||
                                        book.isSceningNow ||
                                        book.isImagingNow ||
                                        workerState?.activeBookKey === book.bookKey;

                                    const isWaitingForOngoingTask =
                                        !isActivelyWorkingThisBook &&
                                        book.isQueued &&
                                        Boolean(workerState?.isRunning) &&
                                        (Boolean(priorityMovedBookKeys[book.bookKey]) || (activeBookIdx > bIdx));

                                    const isDragOver = dragOverBookKey === book.bookKey && draggedBookKey !== book.bookKey;

                                    return (
                                        <div
                                            key={book.bookKey}
                                            draggable
                                            onDragStart={() => setDraggedBookKey(book.bookKey)}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                if (dragOverBookKey !== book.bookKey) setDragOverBookKey(book.bookKey);
                                            }}
                                            onDragLeave={() => {
                                                if (dragOverBookKey === book.bookKey) setDragOverBookKey(null);
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                handleDropBookOnQueue(book.bookKey);
                                            }}
                                            onClick={() => openBookModal(book, 'ai', 'transcription')}
                                            className={`p-5 sm:p-6 rounded-3xl border-2 transition-all cursor-pointer shadow-xl flex flex-col xl:flex-row items-stretch xl:items-center gap-6 group ${
                                                isDragOver
                                                    ? 'bg-amber-500/15 border-amber-400 scale-[1.01]'
                                                    : isActivelyWorkingThisBook
                                                    ? 'bg-gradient-to-r from-amber-950/30 via-zinc-900/90 to-zinc-900/90 border-amber-500/70'
                                                    : book.isQueued
                                                    ? 'bg-zinc-900/75 hover:bg-zinc-900 border-zinc-800/90 hover:border-amber-500/50'
                                                    : 'bg-zinc-950/60 border-zinc-900 opacity-60 hover:opacity-90'
                                            }`}
                                        >
                                            {/* LEFT + MIDDLE: Priority Controls, Large Book Image, Title (Year), Author, Short Summary */}
                                            <div className="flex items-start sm:items-center gap-5 min-w-0 flex-1">
                                                {/* Drag & Arrow Priority Controls */}
                                                <div
                                                    className="flex flex-col items-center gap-1.5 shrink-0"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <span
                                                        title="Priority Rank (Drag card or click arrows to reorder)"
                                                        className={`px-3 py-1 rounded-xl font-mono text-sm font-black ${
                                                            bIdx === 0 && book.isQueued
                                                                ? 'bg-amber-500 text-black shadow'
                                                                : 'bg-zinc-950 text-amber-300 border border-zinc-800'
                                                        }`}
                                                    >
                                                        #{bIdx + 1}
                                                    </span>
                                                    <button
                                                        onClick={() => handleMoveBookInQueue(book.bookKey, 'top')}
                                                        disabled={bIdx === 0}
                                                        title="Move to Top Priority (#1)"
                                                        className="px-2.5 py-1.5 rounded-xl bg-zinc-950 hover:bg-amber-500 text-amber-300 hover:text-black border border-zinc-800 text-xs font-black disabled:opacity-30 cursor-pointer"
                                                    >
                                                        ⏫
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveBookInQueue(book.bookKey, 'up')}
                                                        disabled={bIdx === 0}
                                                        title="Move Up Priority"
                                                        className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 disabled:opacity-30 cursor-pointer"
                                                    >
                                                        <ChevronUp size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveBookInQueue(book.bookKey, 'down')}
                                                        disabled={bIdx === priorityQueueBooks.length - 1}
                                                        title="Move Down Priority"
                                                        className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 disabled:opacity-30 cursor-pointer"
                                                    >
                                                        <ChevronDown size={18} />
                                                    </button>
                                                </div>

                                                {/* Large Book Cover Image on the Left */}
                                                <div className="w-28 h-40 sm:w-32 sm:h-44 rounded-2xl bg-gradient-to-br from-[#2a1b10] to-[#120c07] border-2 border-amber-500/40 group-hover:border-amber-400 overflow-hidden shrink-0 flex flex-col items-center justify-center shadow-xl relative">
                                                    {book.posterUrl ? (
                                                        <img
                                                            src={book.posterUrl}
                                                            alt={book.title}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                    ) : (
                                                        <div className="p-3 text-center flex flex-col items-center justify-center h-full w-full">
                                                            <BookOpen size={30} className="text-amber-400 mb-1.5" />
                                                            <span className="text-xs font-black text-amber-100 line-clamp-3 leading-tight">
                                                                {book.title}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Title (Year) to the Right, Author Below, Very Short Summary Below */}
                                                <div className="min-w-0 flex-1 space-y-2">
                                                    <div className="flex items-center gap-2.5 flex-wrap">
                                                        <h4 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors leading-tight">
                                                            {book.title}{' '}
                                                            {book.publishedYear && (
                                                                <span className="text-zinc-400 font-mono font-bold">
                                                                    ({book.publishedYear})
                                                                </span>
                                                            )}
                                                        </h4>
                                                    </div>

                                                    <p className="text-base sm:text-lg font-bold text-amber-300 truncate">
                                                        {book.author}
                                                    </p>

                                                    <p className="text-sm sm:text-base text-zinc-300 line-clamp-2 leading-snug">
                                                        {book.shortSummary}
                                                    </p>

                                                    {/* Waiting Sign when moved to higher priority while an ongoing task is finishing */}
                                                    {isWaitingForOngoingTask && (
                                                        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-500/20 border-2 border-amber-400/60 text-amber-200 text-xs sm:text-sm font-black shadow-lg animate-pulse">
                                                            <RefreshCw size={15} className="animate-spin text-amber-300 shrink-0" />
                                                            <span>Waiting for ongoing task to finish before starting</span>
                                                        </div>
                                                    )}

                                                    {/* Active Pipelined Step Badges */}
                                                    {(book.isTranscribingNow || book.isSceningNow || book.isImagingNow) && (
                                                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                                            {book.isTranscribingNow && (
                                                                <span className="px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-black uppercase flex items-center gap-1.5 animate-pulse">
                                                                    <Mic2 size={13} />
                                                                    <span>Transcribing</span>
                                                                </span>
                                                            )}
                                                            {book.isSceningNow && (
                                                                <span className="px-3 py-1 rounded-xl bg-purple-500/20 border border-purple-400/50 text-purple-200 text-xs font-black uppercase flex items-center gap-1.5 animate-pulse">
                                                                    <Wand2 size={13} />
                                                                    <span>Scening</span>
                                                                </span>
                                                            )}
                                                            {book.isImagingNow && (
                                                                <span className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-black uppercase flex items-center gap-1.5 animate-pulse">
                                                                    <Sparkles size={13} />
                                                                    <span>Imaging</span>
                                                                </span>
                                                            )}
                                                            {transCh >= totalCh && (book.isSceningNow || book.isImagingNow) && (
                                                                <span className="px-3 py-1 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-300 text-xs font-bold">
                                                                    Transcription moved to next book
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* RIGHT: Three Horizontal Bars for Transcription, Scening, Imaging */}
                                            <div className="w-full xl:w-[440px] shrink-0 space-y-3.5 bg-zinc-950/90 p-4 rounded-2xl border border-zinc-800/90">
                                                {/* BAR 1: TRANSCRIPTION */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between text-xs sm:text-sm font-black">
                                                        <span className="text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                                                            <Mic2 size={15} />
                                                            <span>1. Transcription</span>
                                                        </span>
                                                        <span className="font-mono text-zinc-200">
                                                            {!effTransOn
                                                                ? 'OFF'
                                                                : `${transPct}% (${transCh}/${totalCh} Ch)`}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-3.5 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                !effTransOn
                                                                    ? 'bg-zinc-700'
                                                                    : book.isTranscribingNow
                                                                    ? 'bg-gradient-to-r from-amber-500 to-yellow-300 animate-pulse'
                                                                    : 'bg-gradient-to-r from-amber-600 to-amber-400'
                                                            }`}
                                                            style={{ width: `${!effTransOn ? 0 : Math.max(transPct > 0 ? 4 : 0, transPct)}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* BAR 2: SCENING (Starts as soon as enough transcript is ready) */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between text-xs sm:text-sm font-black">
                                                        <span className="text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                                                            <Wand2 size={15} />
                                                            <span>2. Scening</span>
                                                        </span>
                                                        <span className="font-mono text-zinc-200">
                                                            {!effScenOn
                                                                ? 'OFF'
                                                                : scenedCh === 0 && transcribedSec < 180 && transCh === 0
                                                                ? 'Waiting for transcript'
                                                                : `${scenedPct}% (${book.detectedScenesCount || 0} scenes)`}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-3.5 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                !effScenOn
                                                                    ? 'bg-zinc-700'
                                                                    : book.isSceningNow
                                                                    ? 'bg-gradient-to-r from-purple-500 to-fuchsia-400 animate-pulse'
                                                                    : 'bg-gradient-to-r from-purple-600 to-purple-400'
                                                            }`}
                                                            style={{ width: `${!effScenOn ? 0 : Math.max(scenedPct > 0 ? 4 : 0, scenedPct)}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* BAR 3: IMAGING (Starts as soon as a few scenes are defined) */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between text-xs sm:text-sm font-black">
                                                        <span className="text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                                                            <ImageIcon size={15} />
                                                            <span>3. Imaging</span>
                                                        </span>
                                                        <span className="font-mono text-zinc-200">
                                                            {!effImgOn
                                                                ? 'OFF'
                                                                : (book.detectedScenesCount || 0) < 2 && (book.paintedScenesCount || 0) === 0
                                                                ? 'Waiting for scenes'
                                                                : `${imgPct}% (${book.paintedScenesCount || 0}/${book.detectedScenesCount || 0})`}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-3.5 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                !effImgOn
                                                                    ? 'bg-zinc-700'
                                                                    : book.isImagingNow
                                                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-300 animate-pulse'
                                                                    : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                                                            }`}
                                                            style={{ width: `${!effImgOn ? 0 : Math.max(imgPct > 0 ? 4 : 0, imgPct)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                    {/* ── AI SUBTAB 2: CLEAN 4 AI FEATURES PIPELINE ── */}
                    {aiMainSubTab === 'settings' && (() => {
                        const aiOn = studioConfig?.aiFeaturesEnabled !== false;
                        const step1On = aiOn && studioConfig?.transcribeEnabled !== false;
                        const step2On = step1On && studioConfig?.sceningEnabled !== false;
                        const step3On = step2On && studioConfig?.imagingEnabled !== false;
                        const step4On = step2On && studioConfig?.voiceEnabled !== false;

                        return (
                            <div className="space-y-6">
                                {/* Master Row: 1 General Switch + 1 General Cleaner Button */}
                                <div className="p-6 rounded-3xl bg-zinc-900/90 border-2 border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <button
                                        onClick={() => handleSaveConfig({ aiFeaturesEnabled: !aiOn })}
                                        title="Master general switch for all 4 Audiobook AI pipeline stages"
                                        className={`px-7 py-4 rounded-2xl text-lg font-black uppercase tracking-wider flex items-center gap-3 transition-all cursor-pointer ${
                                            aiOn
                                                ? 'bg-amber-500 text-black shadow-xl shadow-amber-500/25'
                                                : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700'
                                        }`}
                                    >
                                        <Sparkles size={24} className={aiOn ? 'text-black' : 'text-zinc-400'} />
                                        <span>{aiOn ? 'AI Features: ON' : 'AI Features: OFF'}</span>
                                    </button>

                                    <button
                                        onClick={() => setUnifiedCleanerModal({ isOpen: true, bookKey: undefined, bookTitle: 'Entire Audiobook Library' })}
                                        disabled={savingConfig}
                                        title="Permanently clean all generated transcripts, detected scenes, scene artwork, and voice exports"
                                        className="px-6 py-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-base uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer transition-all shrink-0 disabled:opacity-50"
                                    >
                                        <Trash2 size={22} />
                                        <span>Clean All</span>
                                    </button>
                                </div>

                                {/* 4 Cascading Pipeline Stages (Steps 2-4 greyed out if Step 1 is off; Steps 3-4 greyed out if Step 2 is off) */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Step 1: Transcribing */}
                                    <button
                                        disabled={!aiOn}
                                        onClick={() => {
                                            const nextVal = !step1On;
                                            handleSaveConfig({
                                                transcribeEnabled: nextVal,
                                                sceningEnabled: nextVal ? (studioConfig?.sceningEnabled !== false) : false,
                                                imagingEnabled: nextVal ? (studioConfig?.imagingEnabled !== false) : false,
                                                voiceEnabled: nextVal ? (studioConfig?.voiceEnabled !== false) : false
                                            });
                                        }}
                                        title={!aiOn ? 'Turn on AI Features first' : 'Step 1: Speech-to-Text Transcription'}
                                        className={`p-5 rounded-3xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                            !aiOn
                                                ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                                : step1On
                                                ? 'bg-sky-500/15 border-sky-500/50 text-white cursor-pointer'
                                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Mic2 size={24} className={step1On ? 'text-sky-400' : 'text-zinc-500'} />
                                            <span className="text-base sm:text-lg font-black truncate">1. Transcribing</span>
                                        </div>
                                        <span className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase shrink-0 ${
                                            step1On ? 'bg-sky-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {step1On ? 'ON' : 'OFF'}
                                        </span>
                                    </button>

                                    {/* Step 2: Scening (Defining scenes) */}
                                    <button
                                        disabled={!aiOn || !step1On}
                                        onClick={() => {
                                            const nextVal = !step2On;
                                            handleSaveConfig({
                                                sceningEnabled: nextVal,
                                                imagingEnabled: nextVal ? (studioConfig?.imagingEnabled !== false) : false,
                                                voiceEnabled: nextVal ? (studioConfig?.voiceEnabled !== false) : false
                                            });
                                        }}
                                        title={!step1On ? 'Requires Step 1 (Transcribing)' : 'Step 2: Defining scenes from narrative transcript'}
                                        className={`p-5 rounded-3xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                            !aiOn || !step1On
                                                ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                                : step2On
                                                ? 'bg-purple-500/15 border-purple-500/50 text-white cursor-pointer'
                                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Wand2 size={24} className={step2On ? 'text-purple-400' : 'text-zinc-500'} />
                                            <span className="text-base sm:text-lg font-black truncate">2. Scening</span>
                                        </div>
                                        <span className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase shrink-0 ${
                                            step2On ? 'bg-purple-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {step2On ? 'ON' : 'OFF'}
                                        </span>
                                    </button>

                                    {/* Step 3: Illustrating scenes */}
                                    <button
                                        disabled={!aiOn || !step1On || !step2On}
                                        onClick={() => {
                                            const nextVal = !step3On;
                                            handleSaveConfig({
                                                imagingEnabled: nextVal,
                                                sceningEnabled: nextVal ? true : step2On,
                                                transcribeEnabled: nextVal ? true : step1On
                                            });
                                        }}
                                        title={!step2On ? 'Requires Step 2 (Scening)' : 'Step 3: Illustrating scenes with artwork'}
                                        className={`p-5 rounded-3xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                            !aiOn || !step1On || !step2On
                                                ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                                : step3On
                                                ? 'bg-emerald-500/15 border-emerald-500/50 text-white cursor-pointer'
                                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <ImageIcon size={24} className={step3On ? 'text-emerald-400' : 'text-zinc-500'} />
                                            <span className="text-base sm:text-lg font-black truncate">3. Illustrating</span>
                                        </div>
                                        <span className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase shrink-0 ${
                                            step3On ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {step3On ? 'ON' : 'OFF'}
                                        </span>
                                    </button>

                                    {/* Step 4: Voice enhancing/replacing */}
                                    <button
                                        disabled={!aiOn || !step1On || !step2On}
                                        onClick={() => {
                                            const nextVal = !step4On;
                                            handleSaveConfig({
                                                voiceEnabled: nextVal,
                                                sceningEnabled: nextVal ? true : step2On,
                                                transcribeEnabled: nextVal ? true : step1On
                                            });
                                        }}
                                        title={!step2On ? 'Requires Step 2 (Scening)' : 'Step 4: Voice enhancing & narration styles'}
                                        className={`p-5 rounded-3xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                            !aiOn || !step1On || !step2On
                                                ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                                : step4On
                                                ? 'bg-indigo-500/15 border-indigo-500/50 text-white cursor-pointer'
                                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Headphones size={24} className={step4On ? 'text-indigo-400' : 'text-zinc-500'} />
                                            <span className="text-base sm:text-lg font-black truncate">4. Voice</span>
                                        </div>
                                        <span className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase shrink-0 ${
                                            step4On ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {step4On ? 'ON' : 'OFF'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ── TAB 5: AUDIOBOOK SUBTAB SETTINGS (AI FEATURES TOGGLE & PROVIDERS) ── */}
            {/* ── TAB 5: AUDIOBOOK SUBTAB SETTINGS (4 AI FEATURES, PROVIDERS & API KEY) ── */}
            {activeSubTab === 'queue_settings' && (() => {
                const aiOn = studioConfig?.aiFeaturesEnabled !== false;
                const step1On = aiOn && studioConfig?.transcribeEnabled !== false;
                const step2On = step1On && studioConfig?.sceningEnabled !== false;
                const step3On = step2On && studioConfig?.imagingEnabled !== false;
                const step4On = step2On && studioConfig?.voiceEnabled !== false;

                return (
                    <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-6 max-w-4xl">
                        {/* Master Row: 1 General Switch + 1 General Cleaner Button */}
                        <div className="p-5 rounded-3xl bg-zinc-950 border-2 border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <button
                                onClick={() => {
                                    const nextAi = !aiOn;
                                    handleSaveConfig({ aiFeaturesEnabled: nextAi });
                                }}
                                title="Master general switch for all 4 Audiobook AI pipeline stages"
                                className={`px-7 py-3.5 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center gap-3 transition-all cursor-pointer ${
                                    aiOn
                                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/25'
                                        : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700'
                                }`}
                            >
                                <Sparkles size={22} className={aiOn ? 'text-black' : 'text-zinc-400'} />
                                <span>{aiOn ? 'AI Features: ON' : 'AI Features: OFF'}</span>
                            </button>

                            <button
                                onClick={() => setUnifiedCleanerModal({ isOpen: true, bookKey: undefined, bookTitle: 'Entire Audiobook Library' })}
                                disabled={savingConfig}
                                title="Permanently clean all generated transcripts, detected scenes, scene artwork, and voice exports"
                                className="px-5 py-3.5 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer transition-all shrink-0 disabled:opacity-50"
                            >
                                <Trash2 size={20} />
                                <span>Clean All</span>
                            </button>
                        </div>

                        {/* 4 Cascading Pipeline Stages (Steps 2-4 greyed out if Step 1 is off; Steps 3-4 greyed out if Step 2 is off) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                            {/* Step 1: Transcribing */}
                            <button
                                disabled={!aiOn}
                                onClick={() => {
                                    const nextVal = !step1On;
                                    handleSaveConfig({
                                        transcribeEnabled: nextVal,
                                        sceningEnabled: nextVal ? (studioConfig?.sceningEnabled !== false) : false,
                                        imagingEnabled: nextVal ? (studioConfig?.imagingEnabled !== false) : false,
                                        voiceEnabled: nextVal ? (studioConfig?.voiceEnabled !== false) : false
                                    });
                                }}
                                title={!aiOn ? 'Turn on AI Features first' : 'Step 1: Speech-to-Text Transcription'}
                                className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                    !aiOn
                                        ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                        : step1On
                                        ? 'bg-sky-500/15 border-sky-500/50 text-white cursor-pointer'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <Mic2 size={22} className={step1On ? 'text-sky-400' : 'text-zinc-500'} />
                                    <span className="text-base font-black truncate">1. Transcribing</span>
                                </div>
                                <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${
                                    step1On ? 'bg-sky-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {step1On ? 'ON' : 'OFF'}
                                </span>
                            </button>

                            {/* Step 2: Scening */}
                            <button
                                disabled={!aiOn || !step1On}
                                onClick={() => {
                                    const nextVal = !step2On;
                                    handleSaveConfig({
                                        sceningEnabled: nextVal,
                                        imagingEnabled: nextVal ? (studioConfig?.imagingEnabled !== false) : false,
                                        voiceEnabled: nextVal ? (studioConfig?.voiceEnabled !== false) : false
                                    });
                                }}
                                title={!step1On ? 'Requires Step 1 (Transcribing)' : 'Step 2: Defining scenes from narrative transcript'}
                                className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                    !aiOn || !step1On
                                        ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                        : step2On
                                        ? 'bg-purple-500/15 border-purple-500/50 text-white cursor-pointer'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <Wand2 size={22} className={step2On ? 'text-purple-400' : 'text-zinc-500'} />
                                    <span className="text-base font-black truncate">2. Scening</span>
                                </div>
                                <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${
                                    step2On ? 'bg-purple-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {step2On ? 'ON' : 'OFF'}
                                </span>
                            </button>

                            {/* Step 3: Illustrating */}
                            <button
                                disabled={!aiOn || !step1On || !step2On}
                                onClick={() => {
                                    const nextVal = !step3On;
                                    handleSaveConfig({
                                        imagingEnabled: nextVal,
                                        sceningEnabled: nextVal ? true : step2On,
                                        transcribeEnabled: nextVal ? true : step1On
                                    });
                                }}
                                title={!step2On ? 'Requires Step 2 (Scening)' : 'Step 3: Illustrating scenes with artwork'}
                                className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                    !aiOn || !step1On || !step2On
                                        ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                        : step3On
                                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white cursor-pointer'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <ImageIcon size={22} className={step3On ? 'text-emerald-400' : 'text-zinc-500'} />
                                    <span className="text-base font-black truncate">3. Illustrating</span>
                                </div>
                                <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${
                                    step3On ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {step3On ? 'ON' : 'OFF'}
                                </span>
                            </button>

                            {/* Step 4: Voice */}
                            <button
                                disabled={!aiOn || !step1On || !step2On}
                                onClick={() => {
                                    const nextVal = !step4On;
                                    handleSaveConfig({
                                        voiceEnabled: nextVal,
                                        sceningEnabled: nextVal ? true : step2On,
                                        transcribeEnabled: nextVal ? true : step1On
                                    });
                                }}
                                title={!step2On ? 'Requires Step 2 (Scening)' : 'Step 4: Voice enhancing & narration styles'}
                                className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all ${
                                    !aiOn || !step1On || !step2On
                                        ? 'opacity-35 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
                                        : step4On
                                        ? 'bg-indigo-500/15 border-indigo-500/50 text-white cursor-pointer'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 cursor-pointer'
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <Headphones size={22} className={step4On ? 'text-indigo-400' : 'text-zinc-500'} />
                                    <span className="text-base font-black truncate">4. Voice</span>
                                </div>
                                <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${
                                    step4On ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {step4On ? 'ON' : 'OFF'}
                                </span>
                            </button>
                        </div>

                        {/* Audiobook Providers */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-base font-black text-white">OpenLibrary Covers &amp; Synopsis</p>
                                    <p className="text-xs font-bold text-zinc-400">Auto-fetch book editions, covers &amp; descriptions</p>
                                </div>
                                <button
                                    onClick={() => handleSaveConfig({ openLibraryProvider: studioConfig?.openLibraryProvider === false ? true : false })}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer ${
                                        studioConfig?.openLibraryProvider !== false ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                    }`}
                                >
                                    {studioConfig?.openLibraryProvider !== false ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-base font-black text-white">Apple iTunes Audiobook Lookup</p>
                                    <p className="text-xs font-bold text-zinc-400">High-res square &amp; portrait audiobook artwork</p>
                                </div>
                                <button
                                    onClick={() => handleSaveConfig({ itunesAudiobookProvider: studioConfig?.itunesAudiobookProvider === false ? true : false })}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer ${
                                        studioConfig?.itunesAudiobookProvider !== false ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                    }`}
                                >
                                    {studioConfig?.itunesAudiobookProvider !== false ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>

                        {/* AI Provider API Key */}
                        <div className="space-y-3 pt-2 border-t border-zinc-800">
                            <h4 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Sliders size={18} className="text-amber-400" />
                                <span>AI Provider API Key</span>
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
                    </div>
                );
            })()}

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
                        {/* ── MODAL TOP BOOK HEADER (3D Book Cover + Settings Icon + Metadata + Main Tabs) ── */}
                        <div className="p-5 sm:p-6 bg-gradient-to-r from-[#1c130b] via-zinc-900 to-zinc-950 border-b border-zinc-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 shrink-0">
                            <div className="flex items-start sm:items-center gap-5 min-w-0 flex-1">
                                {/* Book Cover Image or Styled Hardcover Placeholder with Settings Icon Overlay */}
                                <div
                                    onClick={() => {
                                        setBookModalMainTab('book');
                                        setShowBookCustomizePanel(prev => !prev);
                                    }}
                                    title="Click cover or settings icon to swap cover art & edit book details"
                                    className="w-28 h-40 sm:w-32 sm:h-44 rounded-2xl bg-gradient-to-b from-[#2e1d11] to-[#120b07] border-2 border-amber-500/40 hover:border-amber-400 overflow-hidden shrink-0 flex flex-col items-center justify-center shadow-2xl relative group cursor-pointer transition-all"
                                >
                                    {(currentModalBook.posterUrl || fetchedDetails.coverUrl) ? (
                                        <img
                                            src={currentModalBook.posterUrl || fetchedDetails.coverUrl}
                                            alt={currentModalBook.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setBookModalMainTab('book');
                                            setShowBookCustomizePanel(prev => !prev);
                                        }}
                                        title="Swap cover art, edit synopsis & book metadata"
                                        className={`absolute bottom-2 right-2 p-2 rounded-xl border shadow-xl transition-all cursor-pointer ${
                                            showBookCustomizePanel && bookModalMainTab === 'book'
                                                ? 'bg-amber-500 text-black border-amber-300'
                                                : 'bg-black/85 hover:bg-amber-500 text-amber-300 hover:text-black border-amber-500/50'
                                        }`}
                                    >
                                        <Sliders size={18} />
                                    </button>
                                </div>

                                {/* Included Book Metadata */}
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
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

                                    <div className="pt-1 flex items-center gap-2.5 flex-wrap">
                                        <button
                                            onClick={() => {
                                                setBookModalMainTab('book');
                                                setShowBookCustomizePanel(prev => !prev);
                                            }}
                                            title="Swap between available cover arts, edit synopsis, author bio & metadata"
                                            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-2 border transition-all cursor-pointer ${
                                                showBookCustomizePanel && bookModalMainTab === 'book'
                                                    ? 'bg-amber-500 text-black border-amber-400 shadow-lg'
                                                    : 'bg-zinc-900 hover:bg-zinc-800 text-amber-300 border-amber-500/40'
                                            }`}
                                        >
                                            <Sliders size={16} />
                                            <span>Customize</span>
                                        </button>
                                        <button
                                            onClick={() => handleFetchBookMetadata(currentModalBook, true)}
                                            disabled={fetchedDetails.loading}
                                            title="Fetch available cover arts, synopsis, year & genre from OpenLibrary & iTunes"
                                            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                            <RefreshCw size={15} className={fetchedDetails.loading ? 'animate-spin text-amber-400' : 'text-amber-400'} />
                                            <span>Fetch</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Main Modal Switcher: [Book] vs [AI] + Close */}
                            <div className="flex items-center gap-3 self-end lg:self-center shrink-0">
                                <div className="flex items-center gap-2 bg-black/70 p-1.5 rounded-2xl border border-zinc-800">
                                    <button
                                        onClick={() => setBookModalMainTab('book')}
                                        title="Book Showcase, Cover Arts, Synopsis & Chapters"
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
                                        title="AI Studio: Illustration, Transcription & Voice"
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
                                MAIN TAB 1: BOOK (Expanded Book Showcase, Cover Art Switcher, Synopsis & Chapters)
                               ═════════════════════════════════════════════════════════════ */}
                            {bookModalMainTab === 'book' && (() => {
                                // Collect all unique available cover arts for 1-click swapping
                                const allAvailableCovers: Array<{ url: string; label: string; source: string }> = [];
                                const seenUrls = new Set<string>();
                                const addCoverCandidate = (url: string | undefined | null, label: string, source: string) => {
                                    const clean = (url || '').trim();
                                    if (!clean || seenUrls.has(clean)) return;
                                    seenUrls.add(clean);
                                    allAvailableCovers.push({ url: clean, label, source });
                                };
                                addCoverCandidate(currentModalBook.rawPosterUrl, 'Library Cover', 'library');
                                addCoverCandidate(currentModalBook.customCoverUrl, 'AI Cover', 'ai');
                                addCoverCandidate(currentModalBook.posterUrl, 'Active Cover', 'active');
                                addCoverCandidate(editCoverUrl, 'Selected Cover', 'custom');
                                addCoverCandidate(fetchedDetails.coverUrl, 'Catalog Cover', 'catalog');
                                if (Array.isArray(fetchedDetails.availableCovers)) {
                                    for (const c of fetchedDetails.availableCovers) {
                                        addCoverCandidate(c.url, c.label || 'Edition Cover', c.source || 'catalog');
                                    }
                                }
                                const activeCoverDisplayUrl = editCoverUrl || currentModalBook.posterUrl || fetchedDetails.coverUrl || '';
                                const displaySynopsis = editSynopsis || currentModalBook.savedSynopsis || fetchedDetails.description || '';
                                const displayAuthorBio = editAuthorBio || currentModalBook.savedAuthorBio || fetchedDetails.authorBio || '';

                                return (
                                    <div className="space-y-6">
                                        {/* ── LARGE EXPANDED 3D BOOK SHOWCASE ── */}
                                        <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-[#22160c] via-zinc-900/95 to-zinc-950 border-2 border-amber-500/35 shadow-2xl flex flex-col md:flex-row items-center md:items-start gap-7">
                                            {/* 3D Hardcover Book Presentation with Settings Icon */}
                                            <div className="relative group shrink-0">
                                                <div
                                                    onClick={() => setShowBookCustomizePanel(prev => !prev)}
                                                    title="Click book or settings icon to swap cover art & edit synopsis"
                                                    className="w-48 h-72 sm:w-56 sm:h-80 rounded-r-3xl rounded-l-lg bg-gradient-to-br from-[#3b2514] via-[#1f130a] to-[#0f0905] border-2 border-amber-500/50 shadow-[12px_16px_38px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col items-center justify-center relative cursor-pointer transition-transform duration-300 group-hover:scale-[1.02]"
                                                >
                                                    {/* Book Spine Crease Effect */}
                                                    <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/75 via-white/10 to-transparent z-10 pointer-events-none" />
                                                    {activeCoverDisplayUrl ? (
                                                        <img
                                                            src={activeCoverDisplayUrl}
                                                            alt={currentModalBook.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="p-5 text-center flex flex-col items-center justify-center h-full w-full">
                                                            <BookOpen size={52} className="text-amber-400 mb-3" />
                                                            <span className="text-base sm:text-lg font-black text-amber-100 leading-snug line-clamp-4">
                                                                {currentModalBook.title}
                                                            </span>
                                                            <span className="text-sm font-bold text-amber-400/90 mt-2 line-clamp-2">
                                                                {currentModalBook.author}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Prominent Settings Icon on the Book Cover */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setShowBookCustomizePanel(prev => !prev);
                                                        }}
                                                        title="Swap cover art, edit synopsis & book details"
                                                        className={`absolute top-3 right-3 z-20 p-3 rounded-2xl border-2 shadow-2xl flex items-center gap-2 transition-all cursor-pointer ${
                                                            showBookCustomizePanel
                                                                ? 'bg-amber-500 text-black border-amber-200 scale-105'
                                                                : 'bg-black/85 hover:bg-amber-500 text-amber-300 hover:text-black border-amber-500/60'
                                                        }`}
                                                    >
                                                        <Sliders size={22} />
                                                    </button>

                                                    {/* Bottom Cover Badge */}
                                                    <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
                                                        <span className="px-3 py-1 rounded-xl bg-black/85 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider">
                                                            {allAvailableCovers.length} {allAvailableCovers.length === 1 ? 'Art' : 'Arts'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right Column: Synopsis, Author Bio & Quick Actions */}
                                            <div className="flex-1 min-w-0 space-y-4 w-full">
                                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                                    <div className="flex items-center gap-2.5 flex-wrap">
                                                        <span className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-sm font-black">
                                                            {currentModalBook.transCh}/{currentModalBook.totalCh} Text
                                                        </span>
                                                        <span className="px-3.5 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/35 text-purple-300 text-sm font-black">
                                                            {currentModalBook.detectedScenesCount || 0} Scenes • {currentModalBook.paintedScenesCount || 0} Art
                                                        </span>
                                                        <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-sm font-black">
                                                            {currentModalBook.enhCh}/{currentModalBook.totalCh} Voice
                                                        </span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => setShowBookCustomizePanel(prev => !prev)}
                                                        title="Open book settings to swap cover arts and edit synopsis"
                                                        className={`px-4 py-2.5 rounded-2xl text-sm font-black uppercase tracking-wider flex items-center gap-2 border transition-all cursor-pointer ${
                                                            showBookCustomizePanel
                                                                ? 'bg-amber-500 text-black border-amber-300 shadow-lg'
                                                                : 'bg-zinc-900 hover:bg-zinc-800 text-amber-300 border-amber-500/40'
                                                        }`}
                                                    >
                                                        <Sliders size={18} />
                                                        <span>Settings</span>
                                                    </button>
                                                </div>

                                                {/* Synopsis Card */}
                                                <div className="p-5 rounded-3xl bg-zinc-950/85 border border-zinc-800 space-y-2.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                                                            <BookOpen size={18} />
                                                            <span>Synopsis</span>
                                                        </h4>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowBookCustomizePanel(true)}
                                                            title="Edit synopsis"
                                                            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-300 border border-zinc-800 cursor-pointer"
                                                        >
                                                            <Edit3 size={16} />
                                                        </button>
                                                    </div>
                                                    {displaySynopsis ? (
                                                        <p className="text-base text-zinc-200 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-line">
                                                            {displaySynopsis}
                                                        </p>
                                                    ) : (
                                                        <div className="flex items-center gap-3 py-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFetchBookMetadata(currentModalBook, true)}
                                                                disabled={fetchedDetails.loading}
                                                                title="Fetch book synopsis from OpenLibrary & iTunes"
                                                                className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-sm font-black uppercase flex items-center gap-2 cursor-pointer"
                                                            >
                                                                <RefreshCw size={16} className={fetchedDetails.loading ? 'animate-spin' : ''} />
                                                                <span>Fetch</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowBookCustomizePanel(true)}
                                                                title="Write or edit synopsis"
                                                                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-sm font-black uppercase flex items-center gap-2 cursor-pointer"
                                                            >
                                                                <Edit3 size={16} />
                                                                <span>Edit</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Author Card */}
                                                <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/85 border border-zinc-800 space-y-1.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                                                            <User size={18} />
                                                            <span>Author</span>
                                                        </h4>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowBookCustomizePanel(true)}
                                                            title="Edit author details"
                                                            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-300 border border-zinc-800 cursor-pointer"
                                                        >
                                                            <Edit3 size={16} />
                                                        </button>
                                                    </div>
                                                    <p className="text-sm sm:text-base text-zinc-200 leading-relaxed max-h-36 overflow-y-auto">
                                                        {displayAuthorBio || currentModalBook.author}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── EXPANDABLE BOOK CUSTOMIZATION DRAWER (AVAILABLE COVER ARTS SWITCHER + SYNOPSIS & METADATA EDITOR) ── */}
                                        {showBookCustomizePanel && (
                                            <div className="p-6 rounded-3xl bg-zinc-900/80 border-2 border-amber-500/50 shadow-2xl space-y-6">
                                                {/* 1. AVAILABLE COVER ARTS SWITCHER */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                                        <h4 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                                                            <ImageIcon size={20} className="text-amber-400" />
                                                            <span>Arts ({allAvailableCovers.length})</span>
                                                        </h4>
                                                        <div className="flex items-center gap-2.5 flex-wrap">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFetchBookMetadata(currentModalBook, true)}
                                                                disabled={fetchedDetails.loading}
                                                                title="Search OpenLibrary & iTunes for more cover editions"
                                                                className="px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-amber-500/40 text-sm font-black uppercase flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                                            >
                                                                <RefreshCw size={16} className={fetchedDetails.loading ? 'animate-spin' : ''} />
                                                                <span>Fetch</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleCustomBookCover(true)}
                                                                disabled={runningStudioAction === 'cover'}
                                                                title="Generate an AI custom illustration for the book cover"
                                                                className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-black text-sm font-black uppercase flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                                            >
                                                                <Sparkles size={16} className={runningStudioAction === 'cover' ? 'animate-spin' : ''} />
                                                                <span>AI Cover</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {allAvailableCovers.length > 0 ? (
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                                                            {allAvailableCovers.map((cov, cIdx) => {
                                                                const isSelected = activeCoverDisplayUrl === cov.url;
                                                                return (
                                                                    <div
                                                                        key={`${cov.url}-${cIdx}`}
                                                                        onClick={() => handleSelectBookCover(cov.url, cov.label)}
                                                                        title={`Use ${cov.label}`}
                                                                        className={`group rounded-2xl overflow-hidden border-2 transition-all cursor-pointer flex flex-col bg-zinc-950 ${
                                                                            isSelected
                                                                                ? 'border-amber-400 ring-2 ring-amber-400/40 scale-[1.02] shadow-xl'
                                                                                : 'border-zinc-800 hover:border-amber-500/60'
                                                                        }`}
                                                                    >
                                                                        <div className="aspect-[2/3] w-full bg-zinc-900 relative overflow-hidden">
                                                                            <img
                                                                                src={cov.url}
                                                                                alt={cov.label}
                                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                            />
                                                                            {isSelected && (
                                                                                <div className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-amber-500 text-black text-xs font-black uppercase flex items-center gap-1 shadow-lg">
                                                                                    <Check size={13} />
                                                                                    <span>Active</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="p-2.5 text-center bg-zinc-950 border-t border-zinc-800/80">
                                                                            <span className="text-xs font-black text-zinc-200 line-clamp-1">
                                                                                {cov.label}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {/* 2. SYNOPSIS, AUTHOR BIO & METADATA EDITOR */}
                                                <div className="pt-4 border-t border-zinc-800 space-y-4">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h4 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                                                            <Edit3 size={20} className="text-amber-400" />
                                                            <span>Details</span>
                                                        </h4>
                                                        <button
                                                            onClick={handleSaveBookMetadata}
                                                            disabled={savingMetadata}
                                                            title="Save synopsis, cover URL & book metadata"
                                                            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm sm:text-base uppercase tracking-wider flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                                                        >
                                                            <Check size={18} />
                                                            <span>{savingMetadata ? 'Saving...' : 'Save'}</span>
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Title</label>
                                                            <input
                                                                type="text"
                                                                value={editTitle}
                                                                onChange={e => setEditTitle(e.target.value)}
                                                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold focus:outline-none focus:border-amber-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Author</label>
                                                            <input
                                                                type="text"
                                                                value={editAuthor}
                                                                onChange={e => setEditAuthor(e.target.value)}
                                                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold focus:outline-none focus:border-amber-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Year</label>
                                                            <input
                                                                type="number"
                                                                value={editYear}
                                                                onChange={e => setEditYear(e.target.value)}
                                                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Genre</label>
                                                            <input
                                                                type="text"
                                                                value={editGenre}
                                                                onChange={e => setEditGenre(e.target.value)}
                                                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold focus:outline-none focus:border-amber-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Narrator</label>
                                                            <input
                                                                type="text"
                                                                value={editNarrator}
                                                                onChange={e => setEditNarrator(e.target.value)}
                                                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-bold focus:outline-none focus:border-amber-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Cover URL</label>
                                                            <input
                                                                type="text"
                                                                value={editCoverUrl}
                                                                onChange={e => setEditCoverUrl(e.target.value)}
                                                                placeholder="https://..."
                                                                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-base text-white font-mono focus:outline-none focus:border-amber-500"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Synopsis</label>
                                                            <textarea
                                                                rows={5}
                                                                value={editSynopsis}
                                                                onChange={e => setEditSynopsis(e.target.value)}
                                                                placeholder="Book synopsis..."
                                                                className="w-full p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-base text-zinc-100 leading-relaxed focus:outline-none focus:border-amber-500 resize-y"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-black text-zinc-400 uppercase mb-1.5">Author Bio</label>
                                                            <textarea
                                                                rows={5}
                                                                value={editAuthorBio}
                                                                onChange={e => setEditAuthorBio(e.target.value)}
                                                                placeholder="Author bio..."
                                                                className="w-full p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-base text-zinc-100 leading-relaxed focus:outline-none focus:border-amber-500 resize-y"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

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
                                );
                            })()}

                            {/* ═════════════════════════════════════════════════════════════
                                MAIN TAB 2: AI FEATURES
                                ONLY 3 SUBTABS: Illustration | Transcription | Voice
                               ═════════════════════════════════════════════════════════════ */}
                            {bookModalMainTab === 'ai' && (
                                <div className="space-y-6">
                                    {/* ── PER-BOOK AI PIPELINE & CUSTOMIZATION BAR ── */}
                                    <div className="p-5 sm:p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4">
                                        <div className="flex flex-wrap items-center justify-between gap-4">
                                            <div className="flex flex-wrap items-center gap-3">
                                                {/* Step 1: Transcription Toggle */}
                                                <button
                                                    onClick={() => {
                                                        const next = !editBookTranscribeEnabled;
                                                        setEditBookTranscribeEnabled(next);
                                                        handleSaveBookStudioSettings(false, {
                                                            transcribeEnabled: next,
                                                            sceningEnabled: editBookSceningEnabled,
                                                            illustrateEnabled: editBookIllustrateEnabled
                                                        });
                                                    }}
                                                    title="Toggle automated Speech-to-Text Transcription for this book"
                                                    className={`px-4 py-2.5 rounded-2xl border-2 font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                                                        editBookTranscribeEnabled
                                                            ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                                                            : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                                                    }`}
                                                >
                                                    <FileText size={18} className={editBookTranscribeEnabled ? 'text-amber-400' : 'text-zinc-500'} />
                                                    <span>Transcription: {editBookTranscribeEnabled ? 'ON' : 'OFF'}</span>
                                                </button>

                                                {/* Step 2: Scening Toggle (Disabling Scening also disables Imaging) */}
                                                <button
                                                    onClick={() => {
                                                        const nextScen = !editBookSceningEnabled;
                                                        const nextIll = nextScen ? editBookIllustrateEnabled : false;
                                                        setEditBookSceningEnabled(nextScen);
                                                        if (!nextScen) setEditBookIllustrateEnabled(false);
                                                        handleSaveBookStudioSettings(false, {
                                                            transcribeEnabled: editBookTranscribeEnabled,
                                                            sceningEnabled: nextScen,
                                                            illustrateEnabled: nextIll
                                                        });
                                                    }}
                                                    title="Toggle LLM Scene Detection for this book (Required for Imaging)"
                                                    className={`px-4 py-2.5 rounded-2xl border-2 font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                                                        editBookSceningEnabled
                                                            ? 'bg-sky-500/20 text-sky-200 border-sky-500/50'
                                                            : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                                                    }`}
                                                >
                                                    <Wand2 size={18} className={editBookSceningEnabled ? 'text-sky-400' : 'text-zinc-500'} />
                                                    <span>Scening: {editBookSceningEnabled ? 'ON' : 'OFF'}</span>
                                                </button>

                                                {/* Step 3: Imaging Toggle (Requires Scening) */}
                                                <button
                                                    onClick={() => {
                                                        if (!editBookSceningEnabled) {
                                                            toast.error('Enable Scening first — Imaging depends on Scening');
                                                            return;
                                                        }
                                                        const nextIll = !editBookIllustrateEnabled;
                                                        setEditBookIllustrateEnabled(nextIll);
                                                        handleSaveBookStudioSettings(false, {
                                                            transcribeEnabled: editBookTranscribeEnabled,
                                                            sceningEnabled: editBookSceningEnabled,
                                                            illustrateEnabled: nextIll
                                                        });
                                                    }}
                                                    title={
                                                        editBookSceningEnabled
                                                            ? 'Toggle Scene Illustration Imaging for this book'
                                                            : 'Requires Scening to be ON before Imaging can be enabled'
                                                    }
                                                    className={`px-4 py-2.5 rounded-2xl border-2 font-black text-sm uppercase tracking-wider flex items-center gap-2.5 transition-all cursor-pointer ${
                                                        editBookIllustrateEnabled && editBookSceningEnabled
                                                            ? 'bg-purple-500/20 text-purple-200 border-purple-500/50'
                                                            : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                                                    }`}
                                                >
                                                    <ImageIcon size={18} className={editBookIllustrateEnabled && editBookSceningEnabled ? 'text-purple-400' : 'text-zinc-500'} />
                                                    <span>Imaging: {editBookIllustrateEnabled && editBookSceningEnabled ? 'ON' : 'OFF'}</span>
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-2.5">
                                                <button
                                                    onClick={() => handleMoveBookInQueue(currentModalBook.bookKey, 'top')}
                                                    title="Move this book to #1 Priority in the automated AI queue"
                                                    className="px-4 py-2.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                                                >
                                                    <ArrowUp size={18} />
                                                    <span>Priority #1</span>
                                                </button>

                                                <button
                                                    onClick={() => handleToggleBookQueueStatus(currentModalBook)}
                                                    title={currentModalBook.isQueued ? 'Remove book from automated queue' : 'Add book to automated queue'}
                                                    className={`px-4 py-2.5 rounded-2xl border font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer ${
                                                        currentModalBook.isQueued
                                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                                    }`}
                                                >
                                                    <Layers size={18} />
                                                    <span>{currentModalBook.isQueued ? 'Queued' : 'Paused'}</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Per-book Custom Visual Notes / Character & Era Directive */}
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                                            <input
                                                type="text"
                                                value={editVisualNotes}
                                                onChange={e => setEditVisualNotes(e.target.value)}
                                                placeholder="Book-specific visual direction (e.g. Hard sci-fi space probe, character clothing, era)..."
                                                className="flex-1 px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-base text-white focus:outline-none focus:border-purple-500"
                                            />
                                            <button
                                                onClick={() => handleSaveBookStudioSettings(false)}
                                                title="Save custom visual notes and book AI settings"
                                                className="px-5 py-3 rounded-2xl bg-purple-500 hover:bg-purple-400 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shrink-0"
                                            >
                                                <Save size={18} />
                                                <span>Save</span>
                                            </button>
                                        </div>

                                        {/* Per-book Unified Cleanup */}
                                        <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
                                            <span className="text-xs sm:text-sm font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                                <Trash2 size={16} className="text-red-400" />
                                                <span>Clean Assets</span>
                                            </span>
                                            <button
                                                onClick={() => setUnifiedCleanerModal({ isOpen: true, bookKey: currentModalBook.bookKey, bookTitle: currentModalBook.cleanTitle || currentModalBook.title })}
                                                disabled={savingConfig}
                                                title="Open unified asset cleaner to delete images, scenes, transcripts, or voices for this book"
                                                className="px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-black border border-red-500/40 text-xs sm:text-sm font-black uppercase flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all shadow-md"
                                            >
                                                <Trash2 size={16} />
                                                <span>Clean Assets...</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── THE 4 AI SUBTABS (PIPELINE ORDER: 1. TRANSCRIPTION -> 2. SCENING -> 3. ILLUSTRATION -> 4. VOICE) ── */}
                                    {(() => {
                                        const isTranscribeDisabled = studioConfig?.aiFeaturesEnabled === false || studioConfig?.transcribeEnabled === false;
                                        const isSceningDisabled = isTranscribeDisabled || studioConfig?.sceningEnabled === false;
                                        const isIllustrationDisabled = isSceningDisabled || studioConfig?.imagingEnabled === false;
                                        const isVoiceDisabled = studioConfig?.aiFeaturesEnabled === false || studioConfig?.voiceEnabled === false;

                                        const onSubTabClick = (target: 'transcription' | 'scening' | 'illustration' | 'voice') => {
                                            if (studioConfig?.aiFeaturesEnabled === false) {
                                                toast.info("AI Features are disabled in Settings", {
                                                    action: { label: "Open Settings", onClick: () => { window.location.href = '/settings?subtopic=ai'; } }
                                                });
                                                setAiDisabledFeatureAlert({
                                                    feature: 'AI Features',
                                                    reason: 'All automated AI audiobook features are currently switched OFF in Settings.'
                                                });
                                                return;
                                            }
                                            if (target === 'transcription' && isTranscribeDisabled) {
                                                toast.info("Transcribing is disabled in Settings", {
                                                    action: { label: "Open Settings", onClick: () => { window.location.href = '/settings?subtopic=ai'; } }
                                                });
                                                setAiDisabledFeatureAlert({
                                                    feature: '1. Transcribing',
                                                    reason: 'Speech-to-Text Transcription is currently turned OFF in Settings.'
                                                });
                                                return;
                                            }
                                            if (target === 'scening' && isSceningDisabled) {
                                                toast.info("Scening is disabled in Settings", {
                                                    action: { label: "Open Settings", onClick: () => { window.location.href = '/settings?subtopic=ai'; } }
                                                });
                                                setAiDisabledFeatureAlert({
                                                    feature: '2. Scening',
                                                    reason: 'Scene Detection is currently turned OFF in Settings (requires Transcribing to be enabled).'
                                                });
                                                return;
                                            }
                                            if (target === 'illustration' && isIllustrationDisabled) {
                                                toast.info("Illustrating is disabled in Settings", {
                                                    action: { label: "Open Settings", onClick: () => { window.location.href = '/settings?subtopic=ai'; } }
                                                });
                                                setAiDisabledFeatureAlert({
                                                    feature: '3. Illustrating',
                                                    reason: 'Scene Artwork painting is currently turned OFF in Settings (requires Scening to be enabled).'
                                                });
                                                return;
                                            }
                                            if (target === 'voice' && isVoiceDisabled) {
                                                toast.info("Voice Enhancing is disabled in Settings", {
                                                    action: { label: "Open Settings", onClick: () => { window.location.href = '/settings?subtopic=ai'; } }
                                                });
                                                setAiDisabledFeatureAlert({
                                                    feature: '4. Voice',
                                                    reason: 'Voice Narration & Audio Enhancing is currently turned OFF in Settings.'
                                                });
                                                return;
                                            }
                                            setAiSubTab(target);
                                        };

                                        return (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/80 p-2 rounded-3xl border border-zinc-800">
                                                <button
                                                    onClick={() => onSubTabClick('transcription')}
                                                    title={isTranscribeDisabled ? "Transcribing is disabled in Settings (click to open Settings)" : "Speech-to-Text verbatim synced transcription"}
                                                    className={`py-4 px-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer ${
                                                        isTranscribeDisabled
                                                            ? 'opacity-40 grayscale border border-dashed border-zinc-700 hover:border-amber-500/60'
                                                            : aiSubTab === 'transcription'
                                                            ? 'bg-amber-500 text-black shadow-xl shadow-amber-500/25'
                                                            : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                                    }`}
                                                >
                                                    <FileText size={22} />
                                                    <span>Transcription</span>
                                                </button>

                                                <button
                                                    onClick={() => onSubTabClick('scening')}
                                                    title={isSceningDisabled ? "Scening is disabled in Settings (click to open Settings)" : "LLM-powered scene breakdown and narrative chunking"}
                                                    className={`py-4 px-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer ${
                                                        isSceningDisabled
                                                            ? 'opacity-40 grayscale border border-dashed border-zinc-700 hover:border-purple-500/60'
                                                            : aiSubTab === 'scening'
                                                            ? 'bg-purple-500 text-black shadow-xl shadow-purple-500/25'
                                                            : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                                    }`}
                                                >
                                                    <Wand2 size={22} />
                                                    <span>Scening</span>
                                                </button>

                                                <button
                                                    onClick={() => onSubTabClick('illustration')}
                                                    title={isIllustrationDisabled ? "Illustrating is disabled in Settings (click to open Settings)" : "Scene painting and custom AI book cover"}
                                                    className={`py-4 px-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer ${
                                                        isIllustrationDisabled
                                                            ? 'opacity-40 grayscale border border-dashed border-zinc-700 hover:border-emerald-500/60'
                                                            : aiSubTab === 'illustration'
                                                            ? 'bg-emerald-500 text-black shadow-xl shadow-emerald-500/25'
                                                            : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                                    }`}
                                                >
                                                    <Sparkles size={22} />
                                                    <span>Illustration</span>
                                                </button>

                                                <button
                                                    onClick={() => onSubTabClick('voice')}
                                                    title={isVoiceDisabled ? "Voice Enhancing is disabled in Settings (click to open Settings)" : "Voice styles, studio denoise, and narrator mastering"}
                                                    className={`py-4 px-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer ${
                                                        isVoiceDisabled
                                                            ? 'opacity-40 grayscale border border-dashed border-zinc-700 hover:border-indigo-500/60'
                                                            : aiSubTab === 'voice'
                                                            ? 'bg-indigo-500 text-black shadow-xl shadow-indigo-500/25'
                                                            : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                                    }`}
                                                >
                                                    <Headphones size={22} />
                                                    <span>Voice</span>
                                                </button>
                                            </div>
                                        );
                                    })()}

                                    {/* ── LIVE PROGRESS & STEP LOG BANNER (VISIBLE WHENEVER AI WORK IS RUNNING) ── */}
                                    {(workerState?.isRunning ||
                                        currentModalBook.chapters.some((ch: any, idx: number) => {
                                            const cm = resolveChapterMeta(currentModalBook.bookKey, ch, idx);
                                            return (
                                                cm.transcription_status === 'processing' ||
                                                cm.illustration_status === 'processing' ||
                                                cm.audio_enhance_status === 'processing'
                                            );
                                        })) && (
                                        <div className="p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 space-y-3 shadow-xl">
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <RefreshCw size={22} className="text-amber-400 animate-spin shrink-0" />
                                                    <div className="min-w-0">
                                                        <p className="text-base sm:text-lg font-black text-white truncate">
                                                            {workerState?.currentStep || 'Reading & processing audiobook chapters...'}
                                                        </p>
                                                        {workerState?.activeChapterTitle && (
                                                            <p className="text-xs sm:text-sm font-bold text-amber-300 truncate">
                                                                {workerState.activeChapterTitle}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="px-3 py-1 rounded-xl bg-amber-500 text-black text-xs font-black uppercase tracking-wider shrink-0">
                                                    Live Progress
                                                </span>
                                            </div>

                                            {Array.isArray(workerState?.recentLogs) && workerState.recentLogs.length > 0 && (
                                                <div className="p-3 rounded-2xl bg-zinc-950/90 border border-zinc-800 max-h-28 overflow-y-auto space-y-1 font-mono text-xs text-zinc-300">
                                                    {workerState.recentLogs.slice(0, 4).map((logLine: string, lIdx: number) => (
                                                        <div key={lIdx} className={lIdx === 0 ? 'text-amber-300 font-bold' : 'text-zinc-400'}>
                                                            {logLine}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ═══════════════════════════════════════════════════════════
                                        TAB 1: TRANSCRIPTION (ALWAYS FIRST, NO OPTIONS, FULL BOOK TIMESTAMPED TEXT)
                                       ═══════════════════════════════════════════════════════════ */}
                                    {aiSubTab === 'transcription' && (
                                        <div className="space-y-6">
                                            {/* ── TOP PROMINENT ACTION BAR (ZERO OPTIONS) ── */}
                                            <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-950 border-2 border-amber-500/50 shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                                                        <FileText size={24} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                                                            Full Book Transcription
                                                        </h4>
                                                        <p className="text-xs sm:text-sm font-bold text-amber-300/90 truncate">
                                                            Exact [MM:SS] timestamps across all chapters • {currentModalBook.transCh || 0}/{currentModalBook.totalCh} Transcribed
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <button
                                                        onClick={() => setTranscriptViewerState({ isOpen: true, chapterIndex: null })}
                                                        title="Open full-book transcript reader modal across all chapters"
                                                        className="px-5 py-3.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-amber-500/40 font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg"
                                                    >
                                                        <FileText size={18} />
                                                        <span>Full Transcript</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleGenAllForSubTab('transcription')}
                                                        disabled={runningStudioAction !== null}
                                                        title="Transcribe all chapters with timestamps"
                                                        className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-amber-500/30 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Mic2 size={18} className={runningStudioAction === 'gen_all_transcription' ? 'animate-spin' : ''} />
                                                        <span>Transcribe All</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleResetAssets('transcripts', undefined, false)}
                                                        disabled={runningStudioAction !== null}
                                                        title="Delete all transcripts for this book"
                                                        className="px-4 py-3.5 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Trash2 size={18} />
                                                        <span>Delete All</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* ── FULL BOOK CONTINUOUS VIEW OR PER-CHAPTER DIVISION ── */}
                                            {showFullBookTranscript ? (
                                                <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-black text-white uppercase tracking-wider">
                                                            Continuous Book Transcript
                                                        </span>
                                                        <span className="text-xs font-mono font-bold text-amber-300">
                                                            {currentModalBook.chapters.reduce((acc: number, ch: any, idx: number) => {
                                                                const cm = resolveChapterMeta(currentModalBook.bookKey, ch, idx);
                                                                const count = (cm.synced_lyrics || '').split('\n').filter((l: string) => l.trim()).length;
                                                                return acc + count;
                                                            }, 0)} Total Synced Lines
                                                        </span>
                                                    </div>
                                                    <div className="max-h-[550px] overflow-y-auto space-y-2 pr-1">
                                                        {currentModalBook.chapters.map((ch: any, chIdx: number) => {
                                                            const cm = resolveChapterMeta(currentModalBook.bookKey, ch, chIdx);
                                                            const rawLyrics: string = cm.synced_lyrics || '';
                                                            const chLines = rawLyrics.split('\n').map((l: string) => l.trim()).filter(Boolean);
                                                            if (chLines.length === 0) return null;
                                                            return (
                                                                <div key={chIdx} className="space-y-1.5 pt-2">
                                                                    <div className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-black text-amber-300 uppercase flex items-center justify-between">
                                                                        <span>Chapter {chIdx + 1}: {ch.title || ch.name || `Chapter ${chIdx + 1}`}</span>
                                                                        <span className="font-mono">{chLines.length} Lines</span>
                                                                    </div>
                                                                    {chLines.map((line: string, lIdx: number) => {
                                                                        const match = line.match(/^\[(\d+:\d+(?:\.\d+)?)\]\s*(.*)$/);
                                                                        const timeTag = match ? match[1] : '';
                                                                        const textBody = match ? match[2] : line;
                                                                        return (
                                                                            <div key={lIdx} className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3">
                                                                                {timeTag && (
                                                                                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-xs font-bold shrink-0">
                                                                                        {timeTag}
                                                                                    </span>
                                                                                )}
                                                                                <p className="text-sm sm:text-base text-zinc-200 leading-relaxed">
                                                                                    {textBody}
                                                                                </p>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between gap-3 px-2">
                                                        <span className="text-sm font-black text-zinc-300 uppercase tracking-wider">
                                                            Chapters ({currentModalBook.chapters.length})
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    const allOpen: Record<number, boolean> = {};
                                                                    currentModalBook.chapters.forEach((_: any, i: number) => {
                                                                        allOpen[i] = true;
                                                                    });
                                                                    setExpandedChapterIndices(allOpen);
                                                                }}
                                                                title="Expand all chapter transcripts"
                                                                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-800 font-black text-xs uppercase tracking-wider cursor-pointer"
                                                            >
                                                                Expand All
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedChapterIndices({})}
                                                                title="Collapse all chapter transcripts"
                                                                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-black text-xs uppercase tracking-wider cursor-pointer"
                                                            >
                                                                Collapse
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {currentModalBook.chapters.map((chTrack: any, chIdx: number) => {
                                                        const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
                                                        const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
                                                        const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);
                                                        const rawLyrics: string = chMeta.synced_lyrics || '';
                                                        const lines = rawLyrics.split('\n').map((l: string) => l.trim()).filter(Boolean);
                                                        const isExpanded = Boolean(expandedChapterIndices[chIdx]);
                                                        const isTranscribing = chMeta.transcription_status === 'processing' || runningChapterTaskKey === `${chapterKey}::transcribe`;
                                                        const transProgress = Number(chMeta.transcription_progress || 0);
                                                        const transcribedSec = Number(chMeta.transcribed_seconds || 0);

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
                                                                            <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-400 flex-wrap">
                                                                                <span className="font-mono">{formatMMSS(durSec)}</span>
                                                                                <span>•</span>
                                                                                <span
                                                                                    onClick={(e) => {
                                                                                        if (lines.length > 0) {
                                                                                            e.stopPropagation();
                                                                                            setTranscriptViewerState({ isOpen: true, chapterIndex: chIdx });
                                                                                        }
                                                                                    }}
                                                                                    title={lines.length > 0 ? "Click to view full transcript lines for this chapter" : "Not transcribed yet"}
                                                                                    className={`text-xs font-bold transition-all ${
                                                                                        lines.length > 0
                                                                                            ? 'text-amber-300 font-black cursor-pointer hover:underline hover:text-amber-200'
                                                                                            : 'text-zinc-500'
                                                                                    }`}
                                                                                >
                                                                                    {lines.length > 0 ? `${lines.length} Synced Lines` : 'Not Transcribed'}
                                                                                </span>
                                                                                {isTranscribing && (
                                                                                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 font-mono font-black animate-pulse">
                                                                                        Transcribing {transProgress > 0 ? `${transProgress}%` : '...'}
                                                                                        {transcribedSec > 0 ? ` (${formatMMSS(transcribedSec)} / ${formatMMSS(durSec)})` : ''}
                                                                                    </span>
                                                                                )}
                                                                                {chMeta.transcription_status === 'failed' && chMeta.error_message && (
                                                                                    <span className="px-2.5 py-0.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 font-bold">
                                                                                        {chMeta.error_message}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                        <button
                                                                            onClick={() => handleRunChapterTask(chTrack, chIdx, 'transcribe')}
                                                                            disabled={isTranscribing}
                                                                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                        >
                                                                            <RefreshCw size={15} className={isTranscribing ? 'animate-spin' : ''} />
                                                                            <span>{isTranscribing ? 'Working...' : lines.length > 0 ? 'Regen' : 'Gen'}</span>
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
                                                                    <div className="p-5 border-t border-zinc-800/80 space-y-3">
                                                                        {isTranscribing && (
                                                                            <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                                                                                <div
                                                                                    className="bg-amber-400 h-full transition-all duration-500"
                                                                                    style={{ width: `${Math.max(4, Math.min(100, transProgress))}%` }}
                                                                                />
                                                                            </div>
                                                                        )}

                                                                        {lines.length === 0 ? (
                                                                            <div className="py-8 text-center">
                                                                                <button
                                                                                    onClick={() => handleRunChapterTask(chTrack, chIdx, 'transcribe')}
                                                                                    disabled={isTranscribing}
                                                                                    className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                                                                                >
                                                                                    <Mic2 size={18} className={isTranscribing ? 'animate-spin' : ''} />
                                                                                    <span>{isTranscribing ? 'Transcribing...' : 'Transcribe Chapter'}</span>
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
                                            )}
                                        </div>
                                    )}

                                    {/* ═══════════════════════════════════════════════════════════
                                        TAB 2: SCENING (SECOND, CREATES SCENE WINDOWS & PROMPTS FROM TRANSCRIPT)
                                       ═══════════════════════════════════════════════════════════ */}
                                    {aiSubTab === 'scening' && (
                                        <div className="space-y-6">
                                            {/* ── TOP PROMINENT SCENING CREATION MENU ── */}
                                            <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-950/40 via-zinc-900 to-zinc-950 border-2 border-purple-500/50 shadow-2xl space-y-5">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-black text-purple-300 uppercase tracking-wider mb-1.5">
                                                            Scene Focus
                                                        </label>
                                                        <select
                                                            value={editSceneFocus}
                                                            onChange={e => setEditSceneFocus(e.target.value)}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-purple-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value="auto-choice">Characters &amp; Plot Action</option>
                                                            <option value="characters">Character Portraits &amp; Faces</option>
                                                            <option value="landscapes">Characters in World &amp; Setting</option>
                                                            <option value="ambient">Dramatic Lighting &amp; Mood</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-black text-purple-300 uppercase tracking-wider mb-1.5">
                                                            Target Scenes / Chapter
                                                        </label>
                                                        <select
                                                            value={editScenesPerChapter}
                                                            onChange={e => setEditScenesPerChapter(Number(e.target.value))}
                                                            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-purple-500/40 text-base font-bold text-white cursor-pointer"
                                                        >
                                                            <option value={2}>2 Scenes / Chapter</option>
                                                            <option value={3}>3 Scenes / Chapter (Auto Natural Windows)</option>
                                                            <option value={4}>4 Scenes / Chapter</option>
                                                            <option value={5}>5 Scenes / Chapter</option>
                                                            <option value={6}>6 Scenes / Chapter</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                                                    <button
                                                        onClick={handleAutoGenScenes}
                                                        disabled={(currentModalBook.transCh || 0) === 0 || runningStudioAction !== null}
                                                        title={
                                                            (currentModalBook.transCh || 0) === 0
                                                                ? 'Requires Stage 1 (Transcription) first before LLM can detect scene transitions'
                                                                : 'Feed timestamped transcript into LLM to create scene transition timestamps and prompts across all chapters'
                                                        }
                                                        className="sm:col-span-9 py-4 px-6 rounded-2xl bg-purple-500 hover:bg-purple-400 text-black font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl shadow-purple-500/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <Wand2 size={22} className={runningStudioAction === 'auto_gen_scenes' ? 'animate-spin' : ''} />
                                                        <span>Detect All Scenes</span>
                                                    </button>

                                                    <button
                                                        onClick={() => setUnifiedCleanerModal({ isOpen: true, bookKey: currentModalBook.bookKey, bookTitle: currentModalBook.cleanTitle || currentModalBook.title })}
                                                        disabled={runningStudioAction !== null}
                                                        title="Delete all detected scenes for this book"
                                                        className="sm:col-span-3 py-4 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Trash2 size={18} />
                                                        <span>Delete All</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* ── CHAPTERS & DETECTED SCENE WINDOWS DIVISION ── */}
                                            <div className="space-y-4">
                                                {currentModalBook.chapters.map((chTrack: any, chIdx: number) => {
                                                    const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
                                                    const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
                                                    const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);
                                                    const rawLyrics: string = chMeta.synced_lyrics || '';
                                                    const transcriptLinesCount = rawLyrics.split('\n').map((l: string) => l.trim()).filter(Boolean).length;
                                                    const isTranscribed = chMeta.transcription_status === 'completed' && transcriptLinesCount > 0;

                                                    const detectedScenes: any[] = (chMeta.images || []).filter(
                                                        (i: any) => i && i.kept !== false && !String(i.url || '').toLowerCase().includes('.svg')
                                                    );
                                                    const isExpanded = Boolean(expandedChapterIndices[chIdx]);
                                                    const isDetectingScenes = runningChapterTaskKey === `${chapterKey}::detect_scenes` || chMeta.illustration_status === 'scenes_detected';

                                                    return (
                                                        <div key={chapterKey} className="rounded-3xl bg-zinc-900/50 border border-zinc-800 overflow-hidden">
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
                                                                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 flex-wrap mt-0.5">
                                                                            <span className="font-mono">{formatMMSS(durSec)}</span>
                                                                            <span>•</span>
                                                                            <span className={isTranscribed ? 'text-amber-300 font-black' : 'text-zinc-500'}>
                                                                                {isTranscribed ? `1. Text (${transcriptLinesCount} lines)` : '1. Needs Transcript'}
                                                                            </span>
                                                                            <span>•</span>
                                                                            <span className={detectedScenes.length > 0 ? 'text-purple-300 font-black' : 'text-zinc-500'}>
                                                                                2. {detectedScenes.length} {detectedScenes.length === 1 ? 'Scene' : 'Scenes'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => handleRunChapterTask(chTrack, chIdx, 'detect_scenes')}
                                                                        disabled={!isTranscribed || isDetectingScenes}
                                                                        title={
                                                                            !isTranscribed
                                                                                ? 'Requires Stage 1 (Transcription) before detecting scenes'
                                                                                : 'Feed transcript to LLM to create scenes with transition timestamps'
                                                                        }
                                                                        className="px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-purple-200 border border-purple-500/50 text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                                                                    >
                                                                        <Wand2 size={15} className={isDetectingScenes ? 'animate-spin text-purple-400' : 'text-purple-400'} />
                                                                        <span>{detectedScenes.length > 0 ? 'Redetect' : 'Detect Scenes'}</span>
                                                                    </button>

                                                                    <button
                                                                        onClick={() => {
                                                                            setExpandedChapterIndices(prev => ({ ...prev, [chIdx]: true }));
                                                                            const newIdx = detectedScenes.length;
                                                                            const lastEnd = detectedScenes.length > 0
                                                                                ? (detectedScenes[detectedScenes.length - 1]?.endSec ?? detectedScenes[detectedScenes.length - 1]?.endTimestampSec ?? 0)
                                                                                : 0;
                                                                            const nextStart = lastEnd > 0 && lastEnd < durSec - 30 ? lastEnd : Math.min(durSec - 30, newIdx * 180);
                                                                            handleRepaintSingleScene(chTrack, chIdx, {
                                                                                sceneIndex: newIdx,
                                                                                sceneTitle: `Scene ${newIdx + 1}`,
                                                                                startSec: Math.max(0, nextStart),
                                                                                endSec: Math.min(durSec, nextStart + 180),
                                                                                artType: 'scene'
                                                                            });
                                                                        }}
                                                                        disabled={!isTranscribed}
                                                                        title="Manually add a custom scene window to this chapter"
                                                                        className="px-3 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-black uppercase flex items-center gap-1 cursor-pointer disabled:opacity-40"
                                                                    >
                                                                        <Plus size={14} />
                                                                        <span>Scene</span>
                                                                    </button>

                                                                    {detectedScenes.length > 0 && (
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

                                                            {isExpanded && (
                                                                <div className="p-5 border-t border-zinc-800/80 space-y-4">
                                                                    {detectedScenes.length === 0 ? (
                                                                        <div className="py-8 text-center space-y-3">
                                                                            <p className="text-sm font-bold text-zinc-400">
                                                                                {isTranscribed ? 'Transcript is ready. Run Scene Detection to create scene windows.' : 'Complete Stage 1 (Transcription) before detecting scenes.'}
                                                                            </p>
                                                                            <button
                                                                                onClick={() => handleRunChapterTask(chTrack, chIdx, 'detect_scenes')}
                                                                                disabled={!isTranscribed || isDetectingScenes}
                                                                                className="px-6 py-3.5 rounded-2xl bg-purple-500 hover:bg-purple-400 text-black font-black text-sm uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-40"
                                                                            >
                                                                                <Wand2 size={18} className={isDetectingScenes ? 'animate-spin' : ''} />
                                                                                <span>{isDetectingScenes ? 'Detecting Scenes...' : 'Detect Chapter Scenes'}</span>
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                                            {detectedScenes.map((existingImg: any, sIdx: number) => {
                                                                                const startSec = existingImg?.startSec ?? existingImg?.timestampSec ?? (sIdx * 180);
                                                                                const endSec = existingImg?.endSec ?? existingImg?.endTimestampSec ?? Math.min(durSec, startSec + 180);
                                                                                const draftKey = `${chapterKey}::s${sIdx}`;
                                                                                const promptVal = scenePromptDrafts[draftKey] !== undefined
                                                                                    ? scenePromptDrafts[draftKey]
                                                                                    : (existingImg?.prompt || '');
                                                                                const sceneCharacters: string[] = Array.isArray(existingImg?.characters) ? existingImg.characters : [];

                                                                                return (
                                                                                    <div
                                                                                        key={existingImg?.id || `scene-${sIdx}`}
                                                                                        className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4 flex flex-col justify-between gap-3"
                                                                                    >
                                                                                        <div className="flex items-center justify-between gap-2">
                                                                                            <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-200 text-xs font-black">
                                                                                                {existingImg?.sceneTitle || `Scene ${sIdx + 1}`}
                                                                                            </span>
                                                                                            <span className="px-2.5 py-1 rounded-lg bg-zinc-900 text-amber-300 font-mono text-xs font-bold border border-zinc-800">
                                                                                                {formatMMSS(startSec)} – {formatMMSS(endSec)}
                                                                                            </span>
                                                                                        </div>

                                                                                        {(existingImg?.transitionReason || sceneCharacters.length > 0) && (
                                                                                            <div className="space-y-1.5">
                                                                                                {existingImg?.transitionReason && (
                                                                                                    <p className="text-xs font-bold text-purple-300 leading-snug line-clamp-2">
                                                                                                        {existingImg.transitionReason}
                                                                                                    </p>
                                                                                                )}
                                                                                                {sceneCharacters.length > 0 && (
                                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                                        {sceneCharacters.map((charName: string, cIdx: number) => (
                                                                                                            <span
                                                                                                                key={cIdx}
                                                                                                                className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-200 text-[11px] font-bold"
                                                                                                            >
                                                                                                                {charName}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        )}

                                                                                        <textarea
                                                                                            rows={3}
                                                                                            value={promptVal}
                                                                                            onChange={e => setScenePromptDrafts(prev => ({ ...prev, [draftKey]: e.target.value }))}
                                                                                            placeholder={`Scene ${sIdx + 1} character & action prompt...`}
                                                                                            className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-purple-500 resize-none"
                                                                                        />

                                                                                        <div className="flex items-center justify-between gap-2 pt-1">
                                                                                            <span className="text-xs font-mono text-zinc-500">
                                                                                                Window: {Math.max(1, Math.round(endSec - startSec))}s
                                                                                            </span>
                                                                                            {existingImg?.id && (
                                                                                                <button
                                                                                                    onClick={() => handleCurateSceneImage(chapterKey, existingImg.id, 'delete')}
                                                                                                    title="Delete this scene window"
                                                                                                    className="p-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 cursor-pointer"
                                                                                                >
                                                                                                    <Trash2 size={14} />
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
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
                                        TAB 3: ILLUSTRATION + VOICE (THIRD, PAINTS SCENES & BOOK COVER + GENERATES VOICE)
                                       ═══════════════════════════════════════════════════════════ */}
                                    {aiSubTab === 'illustration' && (
                                        <div className="space-y-8">
                                            {/* ── PART 1: ILLUSTRATION SECTION ── */}
                                            <div className="space-y-6">
                                                {/* Top Artwork Bar */}
                                                <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 border-2 border-emerald-500/50 shadow-2xl space-y-5">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-black text-emerald-300 uppercase tracking-wider mb-1.5">
                                                                Art Style
                                                            </label>
                                                            <select
                                                                value={editArtStyle}
                                                                onChange={e => setEditArtStyle(e.target.value)}
                                                                className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-emerald-500/40 text-base font-bold text-white cursor-pointer"
                                                            >
                                                                <option value="Auto">Auto (Smart Genre)</option>
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
                                                            <label className="block text-xs font-black text-emerald-300 uppercase tracking-wider mb-1.5">
                                                                Alternatives / Scene
                                                            </label>
                                                            <select
                                                                value={editNumAlternatives}
                                                                onChange={e => setEditNumAlternatives(Number(e.target.value))}
                                                                className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-emerald-500/40 text-base font-bold text-white cursor-pointer"
                                                            >
                                                                <option value={1}>1 Image</option>
                                                                <option value={2}>2 Alternatives</option>
                                                                <option value={3}>3 Alternatives</option>
                                                                <option value={4}>4 Alternatives</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                                                        <button
                                                            onClick={handlePaintAllScenes}
                                                            disabled={(currentModalBook.detectedScenesCount || 0) === 0 || runningStudioAction !== null}
                                                            title={
                                                                (currentModalBook.detectedScenesCount || 0) === 0
                                                                    ? 'Requires Stage 2 (Scening) first before painting artwork'
                                                                    : 'Paint artwork for all LLM-detected scenes using Image API'
                                                            }
                                                            className="sm:col-span-6 py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            <Sparkles size={22} className={runningStudioAction === 'paint_all_scenes' ? 'animate-spin' : ''} />
                                                            <span>Paint All Scenes</span>
                                                        </button>

                                                        <button
                                                            onClick={() => setShowExportModal(true)}
                                                            title="Export Illustrated Manuscript / PDF Artbook with high-res artwork, characters, and transcripts"
                                                            className="sm:col-span-3 py-4 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-emerald-300 border-2 border-emerald-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                                                        >
                                                            <Printer size={18} />
                                                            <span>Export</span>
                                                        </button>

                                                        <button
                                                            onClick={() => setUnifiedCleanerModal({ isOpen: true, bookKey: currentModalBook.bookKey, bookTitle: currentModalBook.cleanTitle || currentModalBook.title })}
                                                            disabled={runningStudioAction !== null}
                                                            title="Delete all generated scene images for this book"
                                                            className="sm:col-span-3 py-4 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                                        >
                                                            <Trash2 size={18} />
                                                            <span>Delete Images</span>
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
                                                            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase flex items-center gap-2 cursor-pointer"
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

                                                {/* ── CAST & LORE BIBLE (CHARACTERS & SETTINGS PORTFOLIO) ── */}
                                                <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-5">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <User size={22} className="text-emerald-400" />
                                                            <h4 className="text-xl font-black text-white uppercase tracking-wider">Cast &amp; Lore Bible</h4>
                                                        </div>
                                                        <button
                                                            onClick={handleGeneratePortfolio}
                                                            disabled={isLoadingPortfolio}
                                                            title="Scan book synopsis and lore to generate reference character portraits and key settings"
                                                            className="px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-emerald-300 border border-emerald-500/40 text-xs sm:text-sm font-black uppercase flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                                        >
                                                            <Sparkles size={16} className={isLoadingPortfolio ? 'animate-spin' : ''} />
                                                            <span>{isLoadingPortfolio ? 'Analyzing Lore...' : (bookPortfolio ? 'Refresh Lore' : 'Generate Lore')}</span>
                                                        </button>
                                                    </div>

                                                    {bookPortfolio && (
                                                        <div className="space-y-5">
                                                            {/* Characters */}
                                                            {bookPortfolio.characters && bookPortfolio.characters.length > 0 && (
                                                                <div className="space-y-2.5">
                                                                    <span className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                                                                        Characters ({bookPortfolio.characters.length})
                                                                    </span>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                        {bookPortfolio.characters.map((char: any) => (
                                                                            <div key={char.id} className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center gap-3.5 group">
                                                                                <div
                                                                                    onClick={() => char.imageUrl && setLightboxImage({
                                                                                        url: char.imageUrl,
                                                                                        title: char.name,
                                                                                        chapterTitle: char.role || 'Character',
                                                                                        prompt: char.visualPrompt,
                                                                                        characters: [char.name]
                                                                                    })}
                                                                                    className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-700/80 overflow-hidden flex items-center justify-center shrink-0 relative cursor-pointer"
                                                                                    title={char.imageUrl ? "Click to view character portrait" : "Not painted yet"}
                                                                                >
                                                                                    {char.imageUrl ? (
                                                                                        <img src={char.imageUrl} alt={char.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                                    ) : (
                                                                                        <User size={22} className="text-zinc-600" />
                                                                                    )}
                                                                                </div>
                                                                                <div className="min-w-0 flex-1">
                                                                                    <div className="flex items-center justify-between gap-1">
                                                                                        <h5 className="text-sm font-black text-white truncate">{char.name}</h5>
                                                                                        <button
                                                                                            onClick={() => handlePaintPortfolioItem(char.id, 'character')}
                                                                                            disabled={paintingPortfolioItemId === char.id}
                                                                                            title="Paint character portrait"
                                                                                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-black uppercase cursor-pointer disabled:opacity-50 shrink-0"
                                                                                        >
                                                                                            {paintingPortfolioItemId === char.id ? 'Painting...' : (char.imageUrl ? 'Repaint' : 'Paint')}
                                                                                        </button>
                                                                                    </div>
                                                                                    <p className="text-xs text-amber-300 font-bold truncate">{char.role || 'Character'}</p>
                                                                                    <p className="text-[11px] text-zinc-400 line-clamp-1">{char.visualPrompt}</p>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Locations */}
                                                            {bookPortfolio.locations && bookPortfolio.locations.length > 0 && (
                                                                <div className="space-y-2.5 pt-2">
                                                                    <span className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                                                                        Key Settings &amp; Locations ({bookPortfolio.locations.length})
                                                                    </span>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                        {bookPortfolio.locations.map((loc: any) => (
                                                                            <div key={loc.id} className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center gap-3.5 group">
                                                                                <div
                                                                                    onClick={() => loc.imageUrl && setLightboxImage({
                                                                                        url: loc.imageUrl,
                                                                                        title: loc.name,
                                                                                        chapterTitle: loc.type || 'Setting',
                                                                                        prompt: loc.visualPrompt
                                                                                    })}
                                                                                    className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-700/80 overflow-hidden flex items-center justify-center shrink-0 relative cursor-pointer"
                                                                                    title={loc.imageUrl ? "Click to view setting artwork" : "Not painted yet"}
                                                                                >
                                                                                    {loc.imageUrl ? (
                                                                                        <img src={loc.imageUrl} alt={loc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                                    ) : (
                                                                                        <Compass size={22} className="text-zinc-600" />
                                                                                    )}
                                                                                </div>
                                                                                <div className="min-w-0 flex-1">
                                                                                    <div className="flex items-center justify-between gap-1">
                                                                                        <h5 className="text-sm font-black text-white truncate">{loc.name}</h5>
                                                                                        <button
                                                                                            onClick={() => handlePaintPortfolioItem(loc.id, 'location')}
                                                                                            disabled={paintingPortfolioItemId === loc.id}
                                                                                            title="Paint setting artwork"
                                                                                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-black uppercase cursor-pointer disabled:opacity-50 shrink-0"
                                                                                        >
                                                                                            {paintingPortfolioItemId === loc.id ? 'Painting...' : (loc.imageUrl ? 'Repaint' : 'Paint')}
                                                                                        </button>
                                                                                    </div>
                                                                                    <p className="text-xs text-purple-300 font-bold truncate">{loc.type || 'Setting'}</p>
                                                                                    <p className="text-[11px] text-zinc-400 line-clamp-1">{loc.visualPrompt}</p>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ── SHOWCASE GALLERY (ALL PAINTED SCENES) ── */}
                                                {allBookPaintedImages.length > 0 && (
                                                    <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <ImageIcon size={22} className="text-emerald-400" />
                                                                <h4 className="text-xl font-black text-white uppercase tracking-wider">Showcase Gallery</h4>
                                                            </div>
                                                            <span className="px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black">
                                                                {allBookPaintedImages.length} Artwork{allBookPaintedImages.length > 1 ? 's' : ''}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                            {allBookPaintedImages.map((img: any, gIdx: number) => (
                                                                <div
                                                                    key={`${img.url}-${gIdx}`}
                                                                    onClick={() => setLightboxImage({
                                                                        ...img,
                                                                        allImages: allBookPaintedImages,
                                                                        currentIndex: gIdx
                                                                    })}
                                                                    className="aspect-square rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/60 overflow-hidden relative group cursor-pointer shadow-md transition-all"
                                                                >
                                                                    <img src={img.url} alt={img.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
                                                                        <p className="text-white text-xs font-bold truncate">{img.title}</p>
                                                                        <p className="text-zinc-400 text-[10px] truncate">{img.chapterTitle}</p>
                                                                    </div>
                                                                    <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <Maximize2 size={13} />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── CHAPTERS & PAINTED SCENES GRID ── */}
                                                <div className="space-y-4">
                                                    {currentModalBook.chapters.map((chTrack: any, chIdx: number) => {
                                                        const chMeta = resolveChapterMeta(currentModalBook.bookKey, chTrack, chIdx);
                                                        const chapterKey = chMeta.chapter_key || `${currentModalBook.bookKey}::ch${chIdx + 1}`;
                                                        const durSec = chTrack.durationMs ? Math.round(chTrack.durationMs / 1000) : (chMeta.duration_sec || 300);

                                                        const detectedScenes: any[] = (chMeta.images || []).filter(
                                                            (i: any) => i && i.kept !== false && !String(i.url || '').toLowerCase().includes('.svg')
                                                        );
                                                        const paintedScenesCount = detectedScenes.filter((i: any) => Boolean(i.url)).length;
                                                        const isExpanded = Boolean(expandedChapterIndices[chIdx]);
                                                        const isPaintingScenes = runningChapterTaskKey === `${chapterKey}::paint_scenes`;

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
                                                                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 flex-wrap mt-0.5">
                                                                                <span className="font-mono">{formatMMSS(durSec)}</span>
                                                                                <span>•</span>
                                                                                <span className={paintedScenesCount > 0 ? 'text-emerald-300 font-black' : 'text-zinc-500'}>
                                                                                    {paintedScenesCount}/{detectedScenes.length} Painted
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                                                                        <button
                                                                            onClick={() => handleRunChapterTask(chTrack, chIdx, 'paint_scenes')}
                                                                            disabled={detectedScenes.length === 0 || isPaintingScenes}
                                                                            title={
                                                                                detectedScenes.length === 0
                                                                                    ? 'Requires Stage 2 (Scening) first'
                                                                                    : 'Paint images for all detected scenes in this chapter'
                                                                            }
                                                                            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                                                                        >
                                                                            <Sparkles size={15} className={isPaintingScenes ? 'animate-spin' : ''} />
                                                                            <span>{isPaintingScenes ? 'Painting...' : 'Paint Scenes'}</span>
                                                                        </button>

                                                                        <span className="p-1.5 text-zinc-400">
                                                                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {isExpanded && (
                                                                    <div className="p-5 border-t border-zinc-800/80">
                                                                        {detectedScenes.length === 0 ? (
                                                                            <div className="py-8 text-center text-sm font-bold text-zinc-500">
                                                                                No scenes detected yet for this chapter. Open the Scening tab to detect scenes first.
                                                                            </div>
                                                                        ) : (
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                                                {detectedScenes.map((existingImg: any, sIdx: number) => {
                                                                                    const startSec = existingImg?.startSec ?? existingImg?.timestampSec ?? (sIdx * 180);
                                                                                    const endSec = existingImg?.endSec ?? existingImg?.endTimestampSec ?? Math.min(durSec, startSec + 180);
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
                                                                                            <div className="aspect-video bg-zinc-900 relative flex items-center justify-center overflow-hidden border-b border-zinc-800">
                                                                                                {existingImg?.url ? (
                                                                                                    <div
                                                                                                        onClick={() => setLightboxImage({
                                                                                                            url: existingImg.url,
                                                                                                            title: existingImg?.sceneTitle || `Scene ${sIdx + 1}`,
                                                                                                            chapterTitle: chTrack.title || chTrack.name || `Chapter ${chIdx + 1}`,
                                                                                                            prompt: existingImg.prompt || promptVal,
                                                                                                            date: existingImg.createdAt,
                                                                                                            startSec,
                                                                                                            endSec,
                                                                                                            characters: existingImg.characters,
                                                                                                            transitionReason: existingImg.transitionReason,
                                                                                                            chapterKey,
                                                                                                            imageId: existingImg.id,
                                                                                                            allImages: allBookPaintedImages,
                                                                                                            currentIndex: allBookPaintedImages.findIndex((x: any) => x.url === existingImg.url)
                                                                                                        })}
                                                                                                        className="w-full h-full relative group cursor-pointer"
                                                                                                        title="Click to zoom and view details"
                                                                                                    >
                                                                                                        <img
                                                                                                            src={existingImg.url}
                                                                                                            alt={existingImg?.sceneTitle || `Scene ${sIdx + 1}`}
                                                                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                                                        />
                                                                                                        <div className="absolute top-2.5 right-12 p-1.5 rounded-lg bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                                            <Maximize2 size={14} />
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ) : (
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
                                                                                                        title="Paint this scene illustration"
                                                                                                        className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                                                                                                    >
                                                                                                        <Sparkles size={16} className={isSceneBusy ? 'animate-spin' : ''} />
                                                                                                        <span>{isSceneBusy ? 'Painting...' : 'Paint Scene'}</span>
                                                                                                    </button>
                                                                                                )}

                                                                                                <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/85 text-white text-xs font-black max-w-[62%] truncate">
                                                                                                    {existingImg?.sceneTitle || `Scene ${sIdx + 1}`}
                                                                                                </div>
                                                                                                <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/85 text-amber-300 text-xs font-mono font-bold">
                                                                                                    {formatMMSS(startSec)} – {formatMMSS(endSec)}
                                                                                                </div>
                                                                                            </div>

                                                                                            <div className="p-3.5 space-y-2.5">
                                                                                                <p className="text-xs text-zinc-300 line-clamp-2">
                                                                                                    {promptVal || 'Automatic scene prompt'}
                                                                                                </p>

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
                                                                                                        title="Paint or regenerate this scene illustration"
                                                                                                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                                                    >
                                                                                                        <RefreshCw size={14} className={isSceneBusy ? 'animate-spin' : ''} />
                                                                                                        <span>{existingImg?.url ? 'Regen' : 'Paint'}</span>
                                                                                                    </button>

                                                                                                    <button
                                                                                                        onClick={() =>
                                                                                                            handleRepaintSingleScene(chTrack, chIdx, {
                                                                                                                sceneIndex: detectedScenes.length,
                                                                                                                customPrompt: promptVal.trim() || undefined,
                                                                                                                sceneTitle: `${existingImg?.sceneTitle || `Scene ${sIdx + 1}`} (Alt)`,
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
                                                                                                            title="Delete this scene"
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
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══════════════════════════════════════════════════════════
                                        TAB 4: VOICE GENERATION (DECOUPLED SUBTAB)
                                       ═══════════════════════════════════════════════════════════ */}
                                    {aiSubTab === 'voice' && (
                                        <div className="space-y-8">
                                            {/* Curated Voice Options: Unified Two-Column Tone vs Timbre Selector */}
                                            <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-5">
                                                <div className="flex items-center gap-3 pb-2 border-b border-zinc-800">
                                                    <Headphones size={24} className="text-amber-400" />
                                                    <h4 className="text-xl font-black text-white uppercase tracking-wider">Voice Profile</h4>
                                                </div>
                                                <AudiobookVoiceSelector
                                                    selectedPreset={editVoicePreset}
                                                    onSelectPreset={(pId) => setEditVoicePreset(pId)}
                                                />
                                            </div>

                                            {/* Voice Action & Controls Bar */}
                                            <div className="space-y-6">
                                                {/* Top Voice Menu */}
                                                <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 border-2 border-emerald-500/50 shadow-2xl space-y-5">
                                                    <div className="flex items-center gap-3">
                                                        <Headphones size={24} className="text-emerald-400" />
                                                        <h4 className="text-xl font-black text-white uppercase tracking-wider">Voice Generation</h4>
                                                    </div>

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
                                                            <span>Gen All Voice</span>
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

                                                {/* Chapters & Voice Tracks */}
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
                                                                            <div className="pt-2 w-full max-w-md" onClick={e => e.stopPropagation()}>
                                                                                <audio
                                                                                    controls
                                                                                    preload="none"
                                                                                    src={`/api/theater/stream?path=${encodeURIComponent(chMeta.enhanced_audio_path || chTrack.path || '')}`}
                                                                                    className="w-full h-8 rounded-lg"
                                                                                />
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
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── LIGHTBOX ZOOM MODAL ── */}
            {lightboxImage && (
                <AudiobookImageLightboxModal
                    item={lightboxImage}
                    onClose={() => setLightboxImage(null)}
                    onNavigate={handleNavigateLightbox}
                    onSetCustomCover={handlePromoteImageToBookCover}
                    onDeleteImage={handleDeleteImageFromLightbox}
                />
            )}

            {/* ── DOCUMENT & PDF EXPORT MODAL ── */}
            {showExportModal && currentModalBook && (
                <AudiobookDocumentExportModal
                    book={currentModalBook}
                    portfolio={bookPortfolio}
                    chapters={currentModalBook.chapters || []}
                    resolveChapterMeta={resolveChapterMeta}
                    onClose={() => setShowExportModal(false)}
                />
            )}

            {/* ── FULL TRANSCRIPT VIEWER MODAL ── */}
            {transcriptViewerState?.isOpen && currentModalBook && (
                <AudiobookTranscriptViewerModal
                    isOpen={transcriptViewerState.isOpen}
                    bookTitle={currentModalBook.cleanTitle || currentModalBook.title || 'Audiobook'}
                    bookAuthor={currentModalBook.author}
                    bookCoverUrl={currentModalBook.customCoverUrl || currentModalBook.coverUrl || currentModalBook.posterUrl}
                    chapters={(currentModalBook.chapters || []).map((ch: any, idx: number) => {
                        const cm = resolveChapterMeta(currentModalBook.bookKey, ch, idx);
                        return {
                            index: idx,
                            title: ch.title || ch.name || `Chapter ${idx + 1}`,
                            syncedLyrics: cm.synced_lyrics,
                            durationSec: cm.duration_sec,
                            audioPath: cm.enhanced_audio_path || ch.path
                        };
                    })}
                    initialChapterIndex={transcriptViewerState.chapterIndex}
                    onClose={() => setTranscriptViewerState(null)}
                />
            )}

            {/* ── UNIFIED CLEANER MODAL ── */}
            {unifiedCleanerModal.isOpen && (
                <UnifiedCleanerModal
                    isOpen={unifiedCleanerModal.isOpen}
                    bookKey={unifiedCleanerModal.bookKey}
                    bookTitle={unifiedCleanerModal.bookTitle}
                    onClose={() => setUnifiedCleanerModal({ isOpen: false })}
                    onSuccess={() => {
                        fetchAll();
                    }}
                />
            )}

            {/* ── DISABLED FEATURE ALERT MODAL ── */}
            {aiDisabledFeatureAlert && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md bg-zinc-950 border-2 border-amber-500/60 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto border border-amber-500/40">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-xl font-black text-white">{aiDisabledFeatureAlert.feature} Disabled</h3>
                        <p className="text-sm text-zinc-300 leading-relaxed">{aiDisabledFeatureAlert.reason}</p>
                        <div className="flex items-center gap-3 pt-2">
                            <button
                                onClick={() => setAiDisabledFeatureAlert(null)}
                                className="flex-1 py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-sm cursor-pointer border border-zinc-800"
                            >
                                Dismiss
                            </button>
                            <a
                                href="/settings?subtopic=ai"
                                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                            >
                                Open Settings
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirm Modal */}
            {confirmModal && (
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    onClose={() => setConfirmModal(null)}
                    onConfirm={confirmModal.onConfirm}
                    title={confirmModal.title}
                    description={confirmModal.description}
                    confirmText={confirmModal.confirmText}
                    cancelText={confirmModal.cancelText}
                    variant={confirmModal.variant}
                />
            )}
        </div>
    );
}

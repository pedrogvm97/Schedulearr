'use client';

import React, { useState } from 'react';
import {
    X, Printer, Download, BookOpen, Sparkles, User, FileText, Check, Compass, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { BookVisualPortfolio } from '@/lib/audiobookStudioShared';

interface AudiobookDocumentExportModalProps {
    book: any;
    portfolio: BookVisualPortfolio | null;
    chapters: any[];
    resolveChapterMeta: (bookKey: string, track: any, index: number) => any;
    onClose: () => void;
}

const formatMMSS = (sec: number): string => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const AudiobookDocumentExportModal: React.FC<AudiobookDocumentExportModalProps> = ({
    book,
    portfolio,
    chapters,
    resolveChapterMeta,
    onClose
}) => {
    const [includeCover, setIncludeCover] = useState(true);
    const [includePortfolio, setIncludePortfolio] = useState(true);
    const [includeImages, setIncludeImages] = useState(true);
    const [includePrompts, setIncludePrompts] = useState(true);
    const [includeTranscripts, setIncludeTranscripts] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Gather statistics
    let totalPaintedImages = 0;
    chapters.forEach((ch, idx) => {
        const meta = resolveChapterMeta(book.bookKey, ch, idx);
        const painted = (meta.images || []).filter((i: any) => i && i.url && i.kept !== false && !String(i.url).toLowerCase().includes('.svg'));
        totalPaintedImages += painted.length;
    });

    const generateHtmlDocument = (): string => {
        const coverUrl = book.customCoverUrl || book.posterUrl || '';
        const title = book.cleanTitle || book.title || 'Audiobook';
        const author = book.author || 'Unknown Author';

        let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title} — Illustrated Artbook & Manuscript</title>
<style>
    @page { margin: 1.5cm; size: portrait; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #111; background: #fff; margin: 0; padding: 2rem; max-width: 900px; margin-left: auto; margin-right: auto; }
    h1, h2, h3, h4 { color: #000; font-weight: 800; line-height: 1.2; }
    .cover-page { text-align: center; page-break-after: always; padding-top: 4rem; padding-bottom: 4rem; }
    .cover-page img { max-width: 380px; max-height: 520px; object-fit: cover; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); margin-bottom: 2rem; }
    .cover-title { font-size: 2.8rem; margin: 0.5rem 0; font-weight: 900; }
    .cover-author { font-size: 1.5rem; color: #555; margin-bottom: 1.5rem; }
    .cover-meta { font-size: 0.95rem; color: #777; }
    .section-break { page-break-before: always; margin-top: 3rem; }
    .portfolio-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; margin-top: 1.5rem; }
    .portfolio-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem; background: #f9fafb; page-break-inside: avoid; }
    .portfolio-card img { width: 100%; height: 220px; object-fit: cover; border-radius: 8px; margin-bottom: 0.75rem; }
    .portfolio-card h4 { margin: 0 0 0.25rem 0; font-size: 1.2rem; }
    .portfolio-card .role { font-weight: bold; color: #059669; font-size: 0.85rem; margin-bottom: 0.5rem; text-transform: uppercase; }
    .chapter-block { page-break-before: always; margin-top: 2rem; }
    .chapter-header { border-bottom: 2px solid #000; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
    .scene-card { margin-bottom: 2.5rem; page-break-inside: avoid; }
    .scene-card img { width: 100%; max-height: 480px; object-fit: cover; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); margin-bottom: 0.75rem; }
    .scene-meta { display: flex; justify-content: space-between; font-weight: bold; font-size: 0.9rem; color: #4b5563; margin-bottom: 0.5rem; }
    .scene-prompt { font-size: 0.95rem; color: #374151; background: #f3f4f6; padding: 0.75rem 1rem; border-radius: 8px; border-left: 4px solid #10b981; }
    .transcript-block { margin-top: 1rem; font-size: 0.9rem; color: #4b5563; white-space: pre-wrap; background: #fafafa; padding: 1rem; border-radius: 8px; border: 1px solid #e5e7eb; max-height: 400px; overflow-y: auto; }
    @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
        .section-break, .chapter-block, .cover-page { page-break-before: always; }
        .scene-card, .portfolio-card { page-break-inside: avoid; }
    }
</style>
</head>
<body>
`;

        // 1. Cover Page
        if (includeCover) {
            html += `
<div class="cover-page">
    ${coverUrl ? `<img src="${coverUrl}" alt="Book Cover" />` : ''}
    <h1 class="cover-title">${title}</h1>
    <div class="cover-author">By ${author}</div>
    <div class="cover-meta">
        ${book.publishedYear ? `Published ${book.publishedYear} • ` : ''}
        ${book.genre ? `${book.genre} • ` : ''}
        Illustrated Artbook Edition
    </div>
</div>
`;
        }

        // 2. Characters & Settings Bible
        if (includePortfolio && portfolio && ((portfolio.characters && portfolio.characters.length > 0) || (portfolio.locations && portfolio.locations.length > 0))) {
            html += `
<div class="section-break">
    <div class="chapter-header">
        <h2>Visual Bible — Characters & Settings</h2>
    </div>
    <p style="font-size: 1.1rem; color: #4b5563; font-style: italic;">${portfolio.summary || 'Canonical character profiles and key settings.'}</p>
    
    ${portfolio.characters && portfolio.characters.length > 0 ? `
    <h3 style="margin-top: 2rem;">Main Characters</h3>
    <div class="portfolio-grid">
        ${portfolio.characters.map(c => `
        <div class="portfolio-card">
            ${c.imageUrl ? `<img src="${c.imageUrl}" alt="${c.name}" />` : ''}
            <h4>${c.name}</h4>
            <div class="role">${c.role}</div>
            <p style="font-size: 0.9rem; margin-bottom: 0.5rem;"><strong>Appearance:</strong> ${c.appearance}</p>
            <p style="font-size: 0.9rem;"><strong>Wardrobe:</strong> ${c.clothing}</p>
        </div>
        `).join('')}
    </div>
    ` : ''}

    ${portfolio.locations && portfolio.locations.length > 0 ? `
    <h3 style="margin-top: 2.5rem;">Key Locations & Architecture</h3>
    <div class="portfolio-grid">
        ${portfolio.locations.map(l => `
        <div class="portfolio-card">
            ${l.imageUrl ? `<img src="${l.imageUrl}" alt="${l.name}" />` : ''}
            <h4>${l.name}</h4>
            ${l.era ? `<div class="role">${l.era}</div>` : ''}
            <p style="font-size: 0.9rem;">${l.visualDescription}</p>
        </div>
        `).join('')}
    </div>
    ` : ''}
</div>
`;
        }

        // 3. Chapters with Illustrated Scenes
        chapters.forEach((ch, chIdx) => {
            const chMeta = resolveChapterMeta(book.bookKey, ch, chIdx);
            const chapterTitle = ch.title || ch.name || `Chapter ${chIdx + 1}`;
            const images = (chMeta.images || []).filter((i: any) => i && i.url && i.kept !== false && !String(i.url).toLowerCase().includes('.svg'));

            if (!includeImages && !includeTranscripts && images.length === 0) return;

            html += `
<div class="chapter-block">
    <div class="chapter-header">
        <h2>Chapter ${chIdx + 1}: ${chapterTitle}</h2>
    </div>
`;

            if (includeImages && images.length > 0) {
                images.forEach((img: any, sIdx: number) => {
                    const sceneTitle = img.sceneTitle || `Scene ${sIdx + 1}`;
                    const timeRange = (img.startSec !== undefined && img.endSec !== undefined)
                        ? `${formatMMSS(img.startSec)} – ${formatMMSS(img.endSec)}`
                        : '';

                    html += `
    <div class="scene-card">
        <img src="${img.url}" alt="${sceneTitle}" />
        <div class="scene-meta">
            <span>${sceneTitle}</span>
            <span>${timeRange}</span>
        </div>
        ${includePrompts && img.prompt ? `<div class="scene-prompt">${img.prompt}</div>` : ''}
    </div>
`;
                });
            }

            if (includeTranscripts && (chMeta.plain_transcript || chMeta.synced_lyrics)) {
                html += `
    <h4 style="margin-top: 2rem;">Spoken Transcript</h4>
    <div class="transcript-block">${chMeta.plain_transcript || chMeta.synced_lyrics}</div>
`;
            }

            html += `</div>`;
        });

        html += `
</body>
</html>`;
        return html;
    };

    const handlePrintPdf = () => {
        setIsGenerating(true);
        try {
            const docHtml = generateHtmlDocument();
            const printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            document.body.appendChild(printFrame);

            const frameDoc = printFrame.contentWindow?.document;
            if (frameDoc) {
                frameDoc.open();
                frameDoc.write(docHtml);
                frameDoc.close();
                setTimeout(() => {
                    printFrame.contentWindow?.focus();
                    printFrame.contentWindow?.print();
                    setTimeout(() => document.body.removeChild(printFrame), 1000);
                }, 500);
            }
            toast.success('Print dialog opened. Select "Save as PDF" to export.');
        } catch (e: any) {
            toast.error(`Export failed: ${e?.message || e}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadHtml = () => {
        try {
            const docHtml = generateHtmlDocument();
            const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(book.cleanTitle || book.title || 'audiobook').replace(/[^a-zA-Z0-9_-]/g, '_')}_Artbook.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('HTML Artbook downloaded');
        } catch (e: any) {
            toast.error(`Download failed: ${e?.message || e}`);
        }
    };

    return (
        <div className="fixed inset-0 z-[260] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-zinc-950 border-2 border-emerald-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="p-6 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <span className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                            <BookOpen size={24} />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-xl font-black text-white truncate">
                                Export Illustrated Document
                            </h3>
                            <p className="text-sm font-bold text-zinc-400 truncate">
                                {book.cleanTitle || book.title}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        title="Close export modal"
                        className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content Body */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Live Stats Badge */}
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                            <Sparkles size={16} />
                            <span>Available Content</span>
                        </span>
                        <div className="flex items-center gap-3 text-xs sm:text-sm font-mono font-bold text-zinc-300">
                            <span>{totalPaintedImages} Artwork(s)</span>
                            <span>•</span>
                            <span>{portfolio?.characters?.length || 0} Characters</span>
                            <span>•</span>
                            <span>{chapters.length} Chapters</span>
                        </div>
                    </div>

                    {/* Inclusion Toggles */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                            Choose Included Sections
                        </label>

                        {/* Toggle 1: Cover */}
                        <div
                            onClick={() => setIncludeCover(!includeCover)}
                            className="p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm ${includeCover ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {includeCover ? <Check size={16} /> : null}
                                </span>
                                <div>
                                    <h5 className="text-base font-black text-white">Title Page & Cover Art</h5>
                                    <p className="text-xs text-zinc-400">High-resolution book cover, author byline, and publication details</p>
                                </div>
                            </div>
                        </div>

                        {/* Toggle 2: Characters & Settings Bible */}
                        <div
                            onClick={() => setIncludePortfolio(!includePortfolio)}
                            className="p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm ${includePortfolio ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {includePortfolio ? <Check size={16} /> : null}
                                </span>
                                <div>
                                    <h5 className="text-base font-black text-white">Characters & Settings Bible</h5>
                                    <p className="text-xs text-zinc-400">Character portrait gallery, wardrobe directives, and key location lore</p>
                                </div>
                            </div>
                        </div>

                        {/* Toggle 3: Scene Artwork */}
                        <div
                            onClick={() => setIncludeImages(!includeImages)}
                            className="p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm ${includeImages ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {includeImages ? <Check size={16} /> : null}
                                </span>
                                <div>
                                    <h5 className="text-base font-black text-white">Generated Scene Artwork</h5>
                                    <p className="text-xs text-zinc-400">High-res scene illustrations embedded throughout each chapter</p>
                                </div>
                            </div>
                        </div>

                        {/* Toggle 4: Scene Descriptions & Prompts */}
                        {includeImages && (
                            <div
                                onClick={() => setIncludePrompts(!includePrompts)}
                                className="p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 cursor-pointer transition-all ml-4"
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm ${includePrompts ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                        {includePrompts ? <Check size={16} /> : null}
                                    </span>
                                    <div>
                                        <h5 className="text-base font-black text-white">Scene Prompts & Timestamps</h5>
                                        <p className="text-xs text-zinc-400">Include exact timestamp intervals and narrative art directions</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Toggle 5: Spoken Transcripts */}
                        <div
                            onClick={() => setIncludeTranscripts(!includeTranscripts)}
                            className="p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm ${includeTranscripts ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {includeTranscripts ? <Check size={16} /> : null}
                                </span>
                                <div>
                                    <h5 className="text-base font-black text-white">Full Spoken Chapter Transcripts</h5>
                                    <p className="text-xs text-zinc-400">Include the full spoken text beneath each chapter's scene artwork</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer / Action Buttons */}
                <div className="p-6 bg-zinc-900/90 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-sm cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDownloadHtml}
                        title="Download as self-contained offline HTML document"
                        className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer border border-zinc-700"
                    >
                        <Download size={18} />
                        <span>Download HTML</span>
                    </button>
                    <button
                        onClick={handlePrintPdf}
                        disabled={isGenerating}
                        title="Print or Save as PDF"
                        className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 cursor-pointer"
                    >
                        <Printer size={18} />
                        <span>Print / Save PDF</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

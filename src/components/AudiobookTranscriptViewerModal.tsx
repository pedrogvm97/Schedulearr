'use client';

import React, { useState, useMemo } from 'react';
import {
    X, FileText, Search, Copy, Download, Check, Headphones,
    Layers, BookOpen, Clock, Music
} from 'lucide-react';
import { toast } from 'sonner';

export interface AudiobookTranscriptViewerModalProps {
    isOpen: boolean;
    bookTitle: string;
    bookAuthor?: string;
    bookCoverUrl?: string | null;
    chapters: Array<{
        index: number;
        title: string;
        syncedLyrics?: string;
        durationSec?: number;
        audioPath?: string;
    }>;
    initialChapterIndex?: number | null; // null or -1 means All Chapters
    onClose: () => void;
}

export const AudiobookTranscriptViewerModal: React.FC<AudiobookTranscriptViewerModalProps> = ({
    isOpen,
    bookTitle,
    bookAuthor,
    bookCoverUrl,
    chapters,
    initialChapterIndex = null,
    onClose
}) => {
    const [selectedChapterIdx, setSelectedChapterIdx] = useState<number | null>(
        initialChapterIndex !== null && initialChapterIndex >= 0 ? initialChapterIndex : (chapters.length > 0 ? 0 : null)
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [copied, setCopied] = useState(false);
    const [viewFormat, setViewFormat] = useState<'timestamped' | 'prose'>('timestamped');
    const [visibleLineLimit, setVisibleLineLimit] = useState(300);

    // Update selected chapter when modal opens with a specific initialChapterIndex
    React.useEffect(() => {
        setSelectedChapterIdx(initialChapterIndex !== null && initialChapterIndex >= 0 ? initialChapterIndex : (chapters.length > 0 ? 0 : null));
        setSearchQuery('');
        setVisibleLineLimit(300);
    }, [initialChapterIndex, isOpen, chapters.length]);

    // Parse lines per chapter
    const parsedChapters = useMemo(() => {
        return chapters.map((ch, idx) => {
            const rawLyrics = ch.syncedLyrics || '';
            const rawLines = rawLyrics.split('\n').map(l => l.trim()).filter(Boolean);
            const parsedLines = rawLines.map((line, lIdx) => {
                const match = line.match(/^\[(\d+:\d+(?:\.\d+)?)\]\s*(.*)$/);
                return {
                    id: `${idx}_${lIdx}`,
                    timeTag: match ? match[1] : '',
                    text: match ? match[2] : line,
                    raw: line
                };
            });
            return {
                ...ch,
                chapterIndex: idx,
                displayNumber: idx + 1,
                lines: parsedLines,
                lineCount: parsedLines.length
            };
        });
    }, [chapters]);

    // Active chapters to display based on selector
    const activeChapters = useMemo(() => {
        if (selectedChapterIdx === null || selectedChapterIdx < 0) {
            return parsedChapters;
        }
        return parsedChapters.filter(c => c.chapterIndex === selectedChapterIdx);
    }, [parsedChapters, selectedChapterIdx]);

    // Filter lines based on search query
    const filteredChapters = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return activeChapters;
        return activeChapters.map(ch => ({
            ...ch,
            lines: ch.lines.filter(l => l.text.toLowerCase().includes(query) || l.timeTag.includes(query))
        })).filter(ch => ch.lines.length > 0);
    }, [activeChapters, searchQuery]);

    const totalLinesInView = useMemo(() => {
        return filteredChapters.reduce((acc, ch) => acc + ch.lines.length, 0);
    }, [filteredChapters]);

    const handleCopyAll = () => {
        const linesToCopy: string[] = [];
        filteredChapters.forEach(ch => {
            linesToCopy.push(`--- Chapter ${ch.displayNumber}: ${ch.title} ---`);
            ch.lines.forEach(l => {
                if (viewFormat === 'timestamped' && l.timeTag) {
                    linesToCopy.push(`[${l.timeTag}] ${l.text}`);
                } else {
                    linesToCopy.push(l.text);
                }
            });
            linesToCopy.push('');
        });
        navigator.clipboard.writeText(linesToCopy.join('\n'));
        setCopied(true);
        toast.success(`Copied ${totalLinesInView} transcript lines`);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const linesToExport: string[] = [];
        filteredChapters.forEach(ch => {
            linesToExport.push(`--- Chapter ${ch.displayNumber}: ${ch.title} ---`);
            ch.lines.forEach(l => {
                if (viewFormat === 'timestamped' && l.timeTag) {
                    linesToExport.push(`[${l.timeTag}] ${l.text}`);
                } else {
                    linesToExport.push(l.text);
                }
            });
            linesToExport.push('');
        });
        const content = linesToExport.join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const chapSuffix = selectedChapterIdx !== null && selectedChapterIdx >= 0 ? `_Ch${selectedChapterIdx + 1}` : '_Full';
        a.download = `${bookTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}${chapSuffix}_Transcript.${viewFormat === 'timestamped' ? 'lrc' : 'txt'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Downloaded transcript file');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-5xl h-[92vh] flex flex-col bg-zinc-950 border-2 border-amber-500/50 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden">
                {/* Header */}
                <div className="p-5 sm:p-6 bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border-b-2 border-amber-500/30 flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-4 min-w-0">
                        {bookCoverUrl ? (
                            <img
                                src={bookCoverUrl}
                                alt={bookTitle}
                                className="w-14 h-18 sm:w-16 sm:h-20 object-cover rounded-xl border border-amber-500/40 shadow shrink-0"
                            />
                        ) : (
                            <div className="w-14 h-18 sm:w-16 sm:h-20 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center shrink-0">
                                <BookOpen size={28} className="text-amber-400" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black uppercase tracking-wider">
                                    Speech-to-Text
                                </span>
                                <span className="text-xs font-bold text-zinc-400">
                                    {totalLinesInView} Lines Displayed
                                </span>
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black text-white truncate drop-shadow">
                                {bookTitle}
                            </h2>
                            {bookAuthor && (
                                <p className="text-sm font-bold text-amber-200/90 truncate">
                                    {bookAuthor}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            title="Close transcript viewer"
                            className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 cursor-pointer transition-all"
                        >
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Sub-Header: Chapter Filter Pills + Search + Export Actions */}
                <div className="p-4 sm:p-5 bg-zinc-900/60 border-b border-zinc-800/80 space-y-3 shrink-0">
                    {/* Chapter Filter Bar */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        <button
                            onClick={() => setSelectedChapterIdx(null)}
                            title="View complete transcript across all chapters"
                            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer border ${
                                selectedChapterIdx === null
                                    ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                                    : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white hover:bg-zinc-800'
                            }`}
                        >
                            All Chapters ({parsedChapters.length})
                        </button>
                        {parsedChapters.map((ch) => {
                            const isSelected = selectedChapterIdx === ch.chapterIndex;
                            return (
                                <button
                                    key={ch.chapterIndex}
                                    onClick={() => setSelectedChapterIdx(ch.chapterIndex)}
                                    title={`View Chapter ${ch.displayNumber}: ${ch.title} (${ch.lineCount} synced lines)`}
                                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-all cursor-pointer border flex items-center gap-2 ${
                                        isSelected
                                            ? 'bg-amber-500 text-black border-amber-400 shadow-md font-black'
                                            : ch.lineCount > 0
                                            ? 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white hover:bg-zinc-800'
                                            : 'bg-zinc-950/60 text-zinc-600 border-zinc-900'
                                    }`}
                                >
                                    <span>Ch {ch.displayNumber}</span>
                                    {ch.lineCount > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                                            isSelected ? 'bg-black/30 text-black' : 'bg-amber-500/15 text-amber-300'
                                        }`}>
                                            {ch.lineCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Search & Actions Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-md">
                            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search spoken lines, timestamps, characters..."
                                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {/* View Format Toggle: Timestamps vs Plain Prose */}
                            <button
                                onClick={() => setViewFormat(prev => prev === 'timestamped' ? 'prose' : 'timestamped')}
                                title={viewFormat === 'timestamped' ? 'Switch to continuous readable prose format' : 'Switch to exact [MM:SS.xx] timestamped format'}
                                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                                <Clock size={15} className={viewFormat === 'timestamped' ? 'text-amber-400' : 'text-zinc-500'} />
                                <span>{viewFormat === 'timestamped' ? 'LRC' : 'Text'}</span>
                            </button>

                            <button
                                onClick={handleCopyAll}
                                title="Copy transcript to clipboard"
                                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                                {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                                <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>

                            <button
                                onClick={handleDownload}
                                title="Download transcript file"
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs sm:text-sm font-black uppercase flex items-center gap-1.5 cursor-pointer shadow"
                            >
                                <Download size={15} />
                                <span>Export</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content: Transcript Lines */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin">
                    {filteredChapters.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
                            <FileText size={48} className="text-zinc-700" />
                            <p className="text-lg font-bold text-zinc-400">
                                {searchQuery ? `No spoken lines match "${searchQuery}"` : 'No transcription available for this chapter'}
                            </p>
                            <p className="text-sm text-zinc-500 max-w-md">
                                Run Step 1 (Speech-to-Text Transcription) in the Audiobook Studio to generate verbatim synced lines.
                            </p>
                        </div>
                    ) : (() => {
                        let lineCounter = 0;
                        const hasMoreLines = totalLinesInView > visibleLineLimit;

                        return (
                            <>
                                {filteredChapters.map((ch) => {
                                    if (lineCounter >= visibleLineLimit) return null;
                                    const availableBudget = visibleLineLimit - lineCounter;
                                    const linesToRender = ch.lines.slice(0, availableBudget);
                                    lineCounter += linesToRender.length;

                                    return (
                                        <div key={ch.chapterIndex} className="space-y-3">
                                            {/* Chapter Banner */}
                                            <div className="sticky -top-4 sm:-top-6 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#0c0c0c] border-b border-zinc-800 flex items-center justify-between gap-3 shadow-lg">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 font-mono text-xs font-black flex items-center justify-center">
                                                        {ch.displayNumber}
                                                    </span>
                                                    <h4 className="text-sm sm:text-base font-black text-white truncate">
                                                        {ch.title}
                                                    </h4>
                                                </div>
                                                <span className="text-xs font-mono font-bold text-amber-300/80">
                                                    {ch.lines.length} lines
                                                </span>
                                            </div>

                                            {/* Spoken Lines */}
                                            <div className="space-y-2 pl-1 sm:pl-3">
                                                {linesToRender.map((line) => (
                                                    <div
                                                        key={line.id}
                                                        className="group p-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/60 hover:border-amber-500/40 flex items-start gap-3 transition-colors"
                                                    >
                                                        {viewFormat === 'timestamped' && line.timeTag && (
                                                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 group-hover:bg-amber-500/25 text-amber-300 font-mono text-xs sm:text-sm font-black shrink-0 tracking-wider">
                                                                [{line.timeTag}]
                                                            </span>
                                                        )}
                                                        <p className="text-base sm:text-lg text-zinc-100 font-medium leading-relaxed flex-1 select-text">
                                                            {line.text}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}

                                {hasMoreLines && (
                                    <div className="pt-4 pb-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => setVisibleLineLimit(prev => prev + 300)}
                                            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider cursor-pointer shadow-lg transition-all"
                                        >
                                            Show Next 300 Lines ({visibleLineLimit} of {totalLinesInView} shown)
                                        </button>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

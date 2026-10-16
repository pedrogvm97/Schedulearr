'use client';

import React, { useState } from 'react';
import {
    X,
    Download,
    Music,
    FileText,
    Image as ImageIcon,
    Database,
    Sparkles,
    Check,
    Layers
} from 'lucide-react';

export interface AudiobookExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    bookKey: string;
    bookTitle: string;
}

export const AudiobookExportModal: React.FC<AudiobookExportModalProps> = ({
    isOpen,
    onClose,
    bookKey,
    bookTitle
}) => {
    const [includeAudio, setIncludeAudio] = useState(false);
    const [audioSource, setAudioSource] = useState<'original' | 'enhanced'>('original');
    const [includeVtt, setIncludeVtt] = useState(true);
    const [includeSrt, setIncludeSrt] = useState(true);
    const [includeTxt, setIncludeTxt] = useState(true);
    const [includeJson, setIncludeJson] = useState(true);
    const [includeCover, setIncludeCover] = useState(true);
    const [includeScenes, setIncludeScenes] = useState(true);
    const [includeMetadata, setIncludeMetadata] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    if (!isOpen) return null;

    const handleStartExport = () => {
        setIsExporting(true);
        const params = new URLSearchParams({
            bookKey,
            includeAudio: includeAudio ? 'true' : 'false',
            audioSource,
            includeVtt: includeVtt ? 'true' : 'false',
            includeSrt: includeSrt ? 'true' : 'false',
            includeTxt: includeTxt ? 'true' : 'false',
            includeJson: includeJson ? 'true' : 'false',
            includeCover: includeCover ? 'true' : 'false',
            includeScenes: includeScenes ? 'true' : 'false',
            includeMetadata: includeMetadata ? 'true' : 'false'
        });

        // Trigger direct browser download
        const url = `/api/theater/audiobooks/export?${params.toString()}`;
        window.location.href = url;

        setTimeout(() => {
            setIsExporting(false);
            onClose();
        }, 1200);
    };

    return (
        <div
            className="fixed inset-0 z-[500] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-zinc-850">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                            <Download size={26} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl sm:text-2xl font-black text-white truncate">
                                Export
                            </h2>
                            <p className="text-sm font-bold text-amber-400/90 truncate mt-0.5">
                                {bookTitle}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer"
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Option Sections */}
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                    {/* 1. Transcripts Section */}
                    <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400">
                            <FileText size={20} />
                            <h3 className="text-base font-black uppercase tracking-wider text-white">Transcripts</h3>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <button
                                type="button"
                                onClick={() => setIncludeVtt(v => !v)}
                                className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    includeVtt
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                }`}
                                title="WebVTT timestamped subtitles (.vtt)"
                            >
                                <span className="font-mono font-black text-sm">VTT</span>
                                {includeVtt && <Check size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIncludeSrt(v => !v)}
                                className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    includeSrt
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                }`}
                                title="SubRip timestamped subtitles (.srt)"
                            >
                                <span className="font-mono font-black text-sm">SRT</span>
                                {includeSrt && <Check size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIncludeTxt(v => !v)}
                                className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    includeTxt
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                }`}
                                title="Plain full text transcript (.txt)"
                            >
                                <span className="font-mono font-black text-sm">TXT</span>
                                {includeTxt && <Check size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIncludeJson(v => !v)}
                                className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    includeJson
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                }`}
                                title="Structured timestamped JSON manifest (.json)"
                            >
                                <span className="font-mono font-black text-sm">JSON</span>
                                {includeJson && <Check size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* 2. Artwork & Storyboard Section */}
                    <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-3">
                        <div className="flex items-center gap-2 text-purple-400">
                            <ImageIcon size={20} />
                            <h3 className="text-base font-black uppercase tracking-wider text-white">Artwork</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <button
                                type="button"
                                onClick={() => setIncludeCover(v => !v)}
                                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    includeCover
                                        ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                }`}
                                title="Full resolution cover image"
                            >
                                <span className="font-bold text-sm">Cover</span>
                                {includeCover && <Check size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIncludeScenes(v => !v)}
                                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    includeScenes
                                        ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                }`}
                                title="All chapter scene paintings"
                            >
                                <span className="font-bold text-sm">Scenes</span>
                                {includeScenes && <Check size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* 3. Audio Files Section */}
                    <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-400">
                                <Music size={20} />
                                <h3 className="text-base font-black uppercase tracking-wider text-white">Audio</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIncludeAudio(v => !v)}
                                className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                                    includeAudio
                                        ? 'bg-amber-400 text-black border-amber-300'
                                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                                }`}
                                title="Toggle Audio files in export"
                            >
                                {includeAudio ? 'Included' : 'Excluded'}
                            </button>
                        </div>

                        {includeAudio && (
                            <div className="grid grid-cols-2 gap-2.5 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setAudioSource('original')}
                                    className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                        audioSource === 'original'
                                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                            : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                    }`}
                                    title="Original unedited audio files"
                                >
                                    <span className="font-bold text-sm">Original</span>
                                    {audioSource === 'original' && <Check size={16} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAudioSource('enhanced')}
                                    className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                        audioSource === 'enhanced'
                                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                            : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                    }`}
                                    title="Voice-profile enhanced audio files"
                                >
                                    <span className="font-bold text-sm">Enhanced</span>
                                    {audioSource === 'enhanced' && <Check size={16} />}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 4. Metadata & Storyboard Section */}
                    <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-3">
                        <div className="flex items-center gap-2 text-cyan-400">
                            <Database size={20} />
                            <h3 className="text-base font-black uppercase tracking-wider text-white">Metadata</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-2.5">
                            <button
                                type="button"
                                onClick={() => setIncludeMetadata(v => !v)}
                                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    includeMetadata
                                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                                }`}
                                title="Book metadata and storyboard manifest"
                            >
                                <span className="font-bold text-sm">Metadata &amp; Storyboard</span>
                                {includeMetadata && <Check size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-850">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-sm font-bold uppercase tracking-wider cursor-pointer transition-all"
                        title="Cancel"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleStartExport}
                        disabled={isExporting}
                        className="px-7 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-base font-black uppercase tracking-wider flex items-center gap-2.5 shadow-xl shadow-amber-500/25 cursor-pointer transition-all disabled:opacity-50"
                        title="Download ZIP Archive"
                    >
                        <Download size={22} className={isExporting ? 'animate-bounce' : ''} />
                        <span>Export</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

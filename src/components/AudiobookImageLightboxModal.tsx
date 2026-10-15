'use client';

import React, { useState, useEffect } from 'react';
import {
    X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
    Info, Download, Sparkles, Trash2, Copy, Check, Clock, User, Compass
} from 'lucide-react';
import { toast } from 'sonner';

export interface LightboxImageItem {
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
}

interface AudiobookImageLightboxModalProps {
    item: LightboxImageItem;
    onClose: () => void;
    onNavigate?: (direction: 'prev' | 'next') => void;
    onSetCustomCover?: (url: string) => void;
    onDeleteImage?: (chapterKey: string, imageId: string) => void;
}

const formatMMSS = (sec: number): string => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const AudiobookImageLightboxModal: React.FC<AudiobookImageLightboxModalProps> = ({
    item,
    onClose,
    onNavigate,
    onSetCustomCover,
    onDeleteImage
}) => {
    const [showInfo, setShowInfo] = useState(true);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    // Keyboard shortcuts (Left/Right arrows for nav, Escape to close)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft' && onNavigate) onNavigate('prev');
            else if (e.key === 'ArrowRight' && onNavigate) onNavigate('next');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNavigate]);

    const handleCopyPrompt = () => {
        if (!item.prompt) return;
        navigator.clipboard.writeText(item.prompt);
        setCopiedPrompt(true);
        toast.success('Prompt copied to clipboard');
        setTimeout(() => setCopiedPrompt(false), 2000);
    };

    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = item.url;
        a.download = `${(item.chapterTitle || 'scene').replace(/[^a-zA-Z0-9_-]/g, '_')}_${(item.title || 'art').replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success('Image download started');
    };

    const allImages = item.allImages || [];
    const currentIndex = item.currentIndex ?? allImages.findIndex(img => img.url === item.url);
    const hasMultiple = allImages.length > 1;

    return (
        <div className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-2xl flex flex-col select-none animate-in fade-in duration-200">
            {/* Top Toolbar */}
            <div className="h-20 px-6 bg-zinc-950/80 border-b border-zinc-800/80 flex items-center justify-between gap-4 shrink-0 z-10">
                <div className="flex items-center gap-3.5 min-w-0">
                    <span className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        <Sparkles size={22} />
                    </span>
                    <div className="min-w-0">
                        <h4 className="text-lg sm:text-xl font-black text-white truncate">
                            {item.title || 'Scene Artwork'}
                        </h4>
                        <p className="text-xs sm:text-sm font-bold text-zinc-400 truncate">
                            {item.chapterTitle ? `${item.chapterTitle} • ` : ''}
                            {hasMultiple && `Image ${currentIndex + 1} of ${allImages.length}`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Zoom Controls */}
                    <div className="hidden sm:flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden p-1">
                        <button
                            onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.25))}
                            title="Zoom out"
                            className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg cursor-pointer"
                        >
                            <ZoomOut size={18} />
                        </button>
                        <span className="px-2 text-xs font-mono font-bold text-zinc-300">
                            {Math.round(zoomLevel * 100)}%
                        </span>
                        <button
                            onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))}
                            title="Zoom in"
                            className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg cursor-pointer"
                        >
                            <ZoomIn size={18} />
                        </button>
                        <button
                            onClick={() => setZoomLevel(1)}
                            title="Reset zoom to fit"
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg cursor-pointer"
                        >
                            <Maximize2 size={16} />
                        </button>
                    </div>

                    {/* Toggle Info Side Panel */}
                    <button
                        onClick={() => setShowInfo(prev => !prev)}
                        title={showInfo ? 'Hide metadata details panel' : 'Show prompt & scene details panel'}
                        className={`px-4 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all ${
                            showInfo
                                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                                : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <Info size={18} />
                        <span className="hidden sm:inline">Info</span>
                    </button>

                    {/* Download Button */}
                    <button
                        onClick={handleDownload}
                        title="Download high-resolution artwork file"
                        className="p-2.5 sm:px-4 sm:py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-black text-sm uppercase flex items-center gap-2 cursor-pointer"
                    >
                        <Download size={18} />
                        <span className="hidden sm:inline">Save</span>
                    </button>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        title="Close lightbox viewer (Esc)"
                        className="p-2.5 rounded-xl bg-zinc-900 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 border border-zinc-800 cursor-pointer"
                    >
                        <X size={22} />
                    </button>
                </div>
            </div>

            {/* Main Stage (Image Area + Slide-out Drawer) */}
            <div className="flex-1 relative flex overflow-hidden">
                {/* Center Image Container */}
                <div
                    onClick={onClose}
                    className="flex-1 relative flex items-center justify-center p-4 sm:p-8 overflow-auto cursor-zoom-out"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative max-w-full max-h-full flex items-center justify-center cursor-default transition-transform duration-150"
                        style={{ transform: `scale(${zoomLevel})` }}
                    >
                        <img
                            src={item.url}
                            alt={item.title || 'Scene Artwork'}
                            className="max-h-[82vh] max-w-[85vw] object-contain rounded-2xl shadow-2xl border border-zinc-800/80 bg-zinc-950"
                        />
                    </div>

                    {/* Prev / Next Floating Navigation Arrows */}
                    {hasMultiple && onNavigate && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onNavigate('prev'); }}
                                title="Previous image (Left Arrow)"
                                className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-2xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 text-white flex items-center justify-center shadow-2xl cursor-pointer hover:scale-105 transition-all"
                            >
                                <ChevronLeft size={30} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); onNavigate('next'); }}
                                title="Next image (Right Arrow)"
                                className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-2xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 text-white flex items-center justify-center shadow-2xl cursor-pointer hover:scale-105 transition-all"
                            >
                                <ChevronRight size={30} />
                            </button>
                        </>
                    )}
                </div>

                {/* Side Drawer: Prompt, Scene, Characters & Actions */}
                {showInfo && (
                    <div className="w-full sm:w-[420px] max-w-full bg-zinc-950 border-l border-zinc-800 flex flex-col shrink-0 animate-in slide-in-from-right duration-200 z-20 overflow-y-auto">
                        <div className="p-6 space-y-6">
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                                <h5 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles size={18} className="text-emerald-400" />
                                    <span>Artwork Details</span>
                                </h5>
                                <button
                                    onClick={() => setShowInfo(false)}
                                    title="Close info panel"
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Scene Association */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Compass size={14} />
                                    <span>Associated Scene</span>
                                </label>
                                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                                    <p className="text-base font-black text-white">
                                        {item.title || 'Scene Artwork'}
                                    </p>
                                    {item.chapterTitle && (
                                        <p className="text-sm font-bold text-zinc-400">
                                            {item.chapterTitle}
                                        </p>
                                    )}
                                    {item.startSec !== undefined && item.endSec !== undefined && (
                                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-300">
                                            <Clock size={13} />
                                            <span>{formatMMSS(item.startSec)} – {formatMMSS(item.endSec)}</span>
                                        </div>
                                    )}
                                    {item.transitionReason && (
                                        <p className="text-xs text-zinc-400 italic pt-1 border-t border-zinc-800/60">
                                            {item.transitionReason}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Characters Detected */}
                            {Array.isArray(item.characters) && item.characters.length > 0 && (
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <User size={14} />
                                        <span>Characters in Scene</span>
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {item.characters.map((c, i) => (
                                            <span
                                                key={i}
                                                className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-bold"
                                            >
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Full AI Prompt */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                                        Art Direction Prompt
                                    </label>
                                    <button
                                        onClick={handleCopyPrompt}
                                        title="Copy full prompt text"
                                        className="text-xs font-bold text-zinc-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                                    >
                                        {copiedPrompt ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                        <span>{copiedPrompt ? 'Copied' : 'Copy'}</span>
                                    </button>
                                </div>
                                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-zinc-300 leading-relaxed max-h-56 overflow-y-auto font-sans select-text">
                                    {item.prompt || 'Automatic narrative scene prompt derived from spoken chapter transcript.'}
                                </div>
                            </div>

                            {/* Quick Image Actions */}
                            <div className="space-y-3 pt-2">
                                {onSetCustomCover && (
                                    <button
                                        onClick={() => {
                                            onSetCustomCover(item.url);
                                            toast.success('Set as custom book cover');
                                        }}
                                        title="Promote this scene image to become the book's custom cover"
                                        className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                                    >
                                        <Sparkles size={18} />
                                        <span>Set as Book Cover</span>
                                    </button>
                                )}

                                {onDeleteImage && item.chapterKey && item.imageId && (
                                    <button
                                        onClick={() => {
                                            onDeleteImage(item.chapterKey!, item.imageId!);
                                            onClose();
                                        }}
                                        title="Delete this scene illustration file"
                                        className="w-full py-3 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/40 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                                    >
                                        <Trash2 size={17} />
                                        <span>Delete Image</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

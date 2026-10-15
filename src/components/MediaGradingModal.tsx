'use client';

import React, { useState, useEffect } from 'react';
import { X, Star, Check, Trash2, Award } from 'lucide-react';
import { toast } from 'sonner';

export type MediaTypeForGrading = 'book' | 'movie' | 'show';

export interface CategoryDefinition {
    id: string;
    label: string;
    tooltip: string;
    weight?: number;
}

const CATEGORIES_BY_MEDIA_TYPE: Record<MediaTypeForGrading, CategoryDefinition[]> = {
    book: [
        { id: 'plot', label: 'Plot', tooltip: 'Narrative structure, suspense, twists, and storyline satisfaction' },
        { id: 'characters', label: 'Characters', tooltip: 'Character depth, dialogue, complexity, and growth' },
        { id: 'worldbuilding', label: 'World', tooltip: 'Lore, setting, atmosphere, immersive details, and rules' },
        { id: 'pacing', label: 'Pacing', tooltip: 'Rhythm, momentum, engagement, and narrative flow' },
        { id: 'writing', label: 'Prose', tooltip: 'Writing style, vocabulary, emotional resonance, and elegance' },
        { id: 'narration', label: 'Voice', tooltip: 'Audiobook narration, voice acting, cadence, and sound delivery' }
    ],
    movie: [
        { id: 'story', label: 'Story', tooltip: 'Screenplay, narrative tension, dialogue, and thematic depth' },
        { id: 'acting', label: 'Acting', tooltip: 'Cast performances, chemistry, charisma, and emotional weight' },
        { id: 'visuals', label: 'Visuals', tooltip: 'Cinematography, color grading, lighting, framing, and effects' },
        { id: 'direction', label: 'Directing', tooltip: 'Directorial vision, scene composition, tone, and execution' },
        { id: 'sound', label: 'Score', tooltip: 'Original music, sound design, mixing, and audio atmosphere' },
        { id: 'pacing', label: 'Pacing', tooltip: 'Editing, rhythm, runtime discipline, and scene momentum' }
    ],
    show: [
        { id: 'story', label: 'Story', tooltip: 'Overarching storyline, episode hooks, and seasonal plot arcs' },
        { id: 'characters', label: 'Characters', tooltip: 'Ensemble cast, character arcs, motivations, and relationships' },
        { id: 'world', label: 'World', tooltip: 'Setting immersion, production design, atmosphere, and lore' },
        { id: 'pacing', label: 'Pacing', tooltip: 'Episode-to-episode momentum and narrative balance' },
        { id: 'production', label: 'Production', tooltip: 'Cinematography, visual fidelity, score, and set design' },
        { id: 'payoff', label: 'Payoff', tooltip: 'Season finales, story payoffs, climax, and consistency' }
    ]
};

interface MediaGradingModalProps {
    isOpen: boolean;
    onClose: () => void;
    itemKey: string;
    title: string;
    subtitle?: string;
    posterUrl?: string | null;
    mediaType: MediaTypeForGrading;
    initialRating?: {
        overallScore: number;
        categoryScores: Record<string, number>;
        notes?: string;
    } | null;
    onSaveRating: (data: { itemKey: string; mediaType: string; overallScore: number; categoryScores: Record<string, number>; notes?: string }) => Promise<void>;
    onDeleteRating?: (itemKey: string) => Promise<void>;
}

export const MediaGradingModal: React.FC<MediaGradingModalProps> = ({
    isOpen,
    onClose,
    itemKey,
    title,
    subtitle,
    posterUrl,
    mediaType,
    initialRating,
    onSaveRating,
    onDeleteRating
}) => {
    const categories = CATEGORIES_BY_MEDIA_TYPE[mediaType] || CATEGORIES_BY_MEDIA_TYPE.book;

    const [scores, setScores] = useState<Record<string, number>>(() => {
        const init: Record<string, number> = {};
        categories.forEach(c => {
            init[c.id] = initialRating?.categoryScores?.[c.id] ?? 75;
        });
        return init;
    });

    const [notes, setNotes] = useState<string>(initialRating?.notes || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const init: Record<string, number> = {};
            categories.forEach(c => {
                init[c.id] = initialRating?.categoryScores?.[c.id] ?? 75;
            });
            setScores(init);
            setNotes(initialRating?.notes || '');
        }
    }, [isOpen, initialRating, categories]);

    if (!isOpen) return null;

    const overallScore = Math.round(
        categories.reduce((acc, cat) => acc + (scores[cat.id] ?? 0), 0) / categories.length
    );

    const getScoreBadgeColor = (val: number) => {
        if (val >= 90) return 'bg-amber-400 text-black border-amber-300';
        if (val >= 75) return 'bg-emerald-500 text-black border-emerald-400';
        if (val >= 60) return 'bg-sky-500 text-black border-sky-400';
        if (val >= 45) return 'bg-orange-500 text-white border-orange-400';
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    };

    const handleScoreChange = (catId: string, val: number) => {
        const clamped = Math.max(0, Math.min(100, Math.round(val)));
        setScores(prev => ({ ...prev, [catId]: clamped }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSaveRating({
                itemKey,
                mediaType,
                overallScore,
                categoryScores: scores,
                notes: notes.trim() || undefined
            });
            toast.success(`Saved rating: ${overallScore}/100`);
            onClose();
        } catch {
            toast.error('Failed to save rating');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!onDeleteRating) return;
        setIsSaving(true);
        try {
            await onDeleteRating(itemKey);
            toast.info('Rating deleted');
            onClose();
        } catch {
            toast.error('Failed to delete rating');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            className="fixed inset-0 z-[280] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
        >
            <div className="bg-[#0e0e11] border-2 border-zinc-800 rounded-[2.5rem] w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
                    <div className="flex items-center gap-4 min-w-0">
                        {posterUrl ? (
                            <img
                                src={posterUrl}
                                alt={title}
                                className="w-16 h-22 sm:w-20 sm:h-28 rounded-2xl object-cover border border-zinc-800 shadow-xl shrink-0"
                            />
                        ) : (
                            <div className="w-16 h-22 sm:w-20 sm:h-28 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 shrink-0 shadow-xl">
                                <Award size={36} />
                            </div>
                        )}
                        <div className="min-w-0 space-y-1">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-black uppercase tracking-wider">
                                {mediaType === 'book' ? 'Book Grading' : mediaType === 'movie' ? 'Movie Grading' : 'Series Grading'}
                            </span>
                            <h3 className="text-xl sm:text-2xl font-black text-white truncate" title={title}>
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="text-sm font-bold text-zinc-400 truncate">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className={`px-4 py-2.5 rounded-2xl border-2 font-mono text-2xl font-black flex items-center gap-2 shadow-xl ${getScoreBadgeColor(overallScore)}`}>
                            <Star size={24} className="fill-current" />
                            <span>{overallScore}</span>
                        </div>
                        <button
                            onClick={onClose}
                            title="Close"
                            className="p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                        >
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* 6 Category Sliders */}
                <div className="space-y-4">
                    {categories.map((cat, idx) => {
                        const curVal = scores[cat.id] ?? 75;
                        return (
                            <div
                                key={cat.id}
                                className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2 hover:border-zinc-700 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                        </span>
                                        <span className="text-base font-black text-white truncate" title={cat.tooltip}>
                                            {cat.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-mono text-lg font-black text-amber-300 w-10 text-right">
                                            {curVal}
                                        </span>
                                        <span className="text-xs font-mono text-zinc-500">/ 100</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={curVal}
                                        onChange={(e) => handleScoreChange(cat.id, Number(e.target.value))}
                                        className="flex-1 h-3 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-amber-400"
                                        title={cat.tooltip}
                                    />
                                    <div className="flex items-center gap-1 shrink-0">
                                        {[50, 75, 90, 100].map(p => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => handleScoreChange(cat.id, p)}
                                                className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold transition-colors cursor-pointer ${
                                                    curVal === p
                                                        ? 'bg-amber-400 text-black'
                                                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Optional Review Note */}
                <div className="space-y-1.5">
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-400">
                        Personal Thoughts
                    </label>
                    <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Write your quick impression or notes..."
                        className="w-full p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm font-medium text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 resize-none"
                    />
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
                    {initialRating?.overallScore !== undefined && onDeleteRating ? (
                        <button
                            onClick={handleDelete}
                            disabled={isSaving}
                            title="Delete personal rating"
                            className="px-4 py-3 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-sm font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Trash2 size={18} />
                            <span>Delete</span>
                        </button>
                    ) : (
                        <div />
                    )}

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-bold transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            title="Save grade and compute personal 0-100 rating"
                            className="px-7 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-base uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-amber-400/20 transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Check size={20} className="stroke-[3]" />
                            <span>{isSaving ? 'Saving...' : 'Save Grade'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

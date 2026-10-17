'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Star, Check, Trash2, Award } from 'lucide-react';
import { toast } from 'sonner';

export type MediaTypeForGrading = 'book' | 'movie' | 'show';

export interface CategoryDefinition {
    id: string;
    label: string;
    tooltip: string;
    weight?: number;
}

export const CATEGORIES_BY_MEDIA_TYPE: Record<MediaTypeForGrading, CategoryDefinition[]> = {
    book: [
        { id: 'plot', label: 'Plot', tooltip: 'Narrative structure, suspense, twists, and storyline satisfaction' },
        { id: 'characters', label: 'Characters', tooltip: 'Character depth, dialogue, complexity, and growth' },
        { id: 'worldbuilding', label: 'World', tooltip: 'Lore, setting, atmosphere, immersive details, and rules' },
        { id: 'pacing', label: 'Pacing', tooltip: 'Rhythm, momentum, engagement, and narrative flow' },
        { id: 'writing', label: 'Prose', tooltip: 'Writing style, vocabulary, emotional resonance, and elegance' },
        { id: 'theme', label: 'Theme', tooltip: 'Thematic depth, philosophical weight, meaning, and conceptual originality' }
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

// ── SVG Hexagon Radar Plot Component ──
export const HexagonRadarPlot: React.FC<{
    categories: CategoryDefinition[];
    scores: Record<string, number>;
    size?: number;
    showLabels?: boolean;
}> = ({ categories, scores, size = 260, showLabels = true }) => {
    const cx = size / 2;
    const cy = size / 2;
    const r = (size / 2) - (showLabels ? 34 : 12);
    const numPoints = 6;

    // 6 vertex angles starting from top (-pi / 2)
    const angles = useMemo(() => {
        return Array.from({ length: numPoints }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / numPoints);
    }, [numPoints]);

    // Concentric ring points (25%, 50%, 75%, 100%)
    const ringPolygons = useMemo(() => {
        return [0.25, 0.5, 0.75, 1.0].map(fraction => {
            const pts = angles.map(a => {
                const x = cx + r * fraction * Math.cos(a);
                const y = cy + r * fraction * Math.sin(a);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            return { fraction, pts: pts.join(' ') };
        });
    }, [angles, cx, cy, r]);

    // Data polygon points
    const dataPoints = useMemo(() => {
        return categories.map((cat, i) => {
            const rawScore = scores[cat.id] ?? 75;
            const clamped = Math.max(5, Math.min(100, rawScore));
            const fraction = clamped / 100;
            const a = angles[i] ?? 0;
            const x = cx + r * fraction * Math.cos(a);
            const y = cy + r * fraction * Math.sin(a);
            return { x, y, score: rawScore, angle: a };
        });
    }, [categories, scores, angles, cx, cy, r]);

    const polygonPointsStr = useMemo(() => {
        return dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    }, [dataPoints]);

    return (
        <div className="relative flex items-center justify-center select-none">
            <svg
                width={size}
                height={size}
                className="overflow-visible"
                viewBox={`0 0 ${size} ${size}`}
            >
                <defs>
                    <radialGradient id="hexRadarFill" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
                        <stop offset="70%" stopColor="#d97706" stopOpacity="0.30" />
                        <stop offset="100%" stopColor="#b45309" stopOpacity="0.15" />
                    </radialGradient>
                    <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* Concentric Hexagon Grid Rings */}
                {ringPolygons.map(({ fraction, pts }) => (
                    <polygon
                        key={fraction}
                        points={pts}
                        fill="none"
                        stroke={fraction === 1.0 ? '#52525b' : '#27272a'}
                        strokeWidth={fraction === 1.0 ? 1.5 : 1}
                        strokeDasharray={fraction < 1.0 ? '3 3' : undefined}
                    />
                ))}

                {/* 6 Radial Axes from Center */}
                {angles.map((a, i) => {
                    const x2 = cx + r * Math.cos(a);
                    const y2 = cy + r * Math.sin(a);
                    return (
                        <line
                            key={i}
                            x1={cx}
                            y1={cy}
                            x2={x2}
                            y2={y2}
                            stroke="#3f3f46"
                            strokeWidth="1"
                        />
                    );
                })}

                {/* Filled Data Polygon with Glowing Amber Outline */}
                <polygon
                    points={polygonPointsStr}
                    fill="url(#hexRadarFill)"
                    stroke="#fbbf24"
                    strokeWidth="2.5"
                    filter="url(#radarGlow)"
                    className="transition-all duration-300"
                />

                {/* 6 Interactive Vertices Dots */}
                {dataPoints.map((p, i) => (
                    <g key={i}>
                        <circle
                            cx={p.x}
                            cy={p.y}
                            r="5"
                            fill="#fbbf24"
                            stroke="#000000"
                            strokeWidth="2"
                            className="transition-all duration-300"
                        />
                    </g>
                ))}

                {/* Category Labels around the Hexagon */}
                {showLabels && categories.map((cat, i) => {
                    const a = angles[i] ?? 0;
                    const labelDist = r + 22;
                    const lx = cx + labelDist * Math.cos(a);
                    const ly = cy + labelDist * Math.sin(a);
                    const curVal = scores[cat.id] ?? 75;

                    return (
                        <g key={cat.id} className="cursor-default">
                            <text
                                x={lx}
                                y={ly - 4}
                                textAnchor="middle"
                                dominantBaseline="central"
                                className="fill-amber-300 font-black text-[11px] uppercase tracking-wider drop-shadow"
                            >
                                {cat.label}
                            </text>
                            <text
                                x={lx}
                                y={ly + 8}
                                textAnchor="middle"
                                dominantBaseline="central"
                                className="fill-zinc-400 font-mono text-[10px] font-black"
                            >
                                {curVal}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
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
            init[c.id] = initialRating?.categoryScores?.[c.id]
                ?? (c.id === 'theme' ? initialRating?.categoryScores?.['narration'] ?? 75 : 75);
        });
        return init;
    });

    const [notes, setNotes] = useState<string>(initialRating?.notes || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const init: Record<string, number> = {};
            categories.forEach(c => {
                init[c.id] = initialRating?.categoryScores?.[c.id]
                    ?? (c.id === 'theme' ? initialRating?.categoryScores?.['narration'] ?? 75 : 75);
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

    const getScoreTierText = (val: number) => {
        if (val >= 90) return 'Masterpiece';
        if (val >= 80) return 'Exceptional';
        if (val >= 70) return 'Recommended';
        if (val >= 55) return 'Solid';
        if (val >= 40) return 'Mixed';
        return 'Unsatisfactory';
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
            className="fixed inset-0 z-[280] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200"
        >
            <div className="bg-[#0e0e11] border-2 border-zinc-800 rounded-[2.5rem] w-full max-w-4xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto custom-scrollbar">
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
                                {mediaType === 'book' ? 'Book Evaluation' : mediaType === 'movie' ? 'Movie Evaluation' : 'Series Evaluation'}
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
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Main Body: 2-Column Responsive Layout (Hexagon Radar Plot + 6 Category Sliders) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {/* Left Column: Authentic Hexagon Radar Plot */}
                    <div className="md:col-span-5 p-5 rounded-3xl bg-zinc-950/80 border border-zinc-800/80 flex flex-col items-center justify-center space-y-4 shadow-inner">
                        <HexagonRadarPlot
                            categories={categories}
                            scores={scores}
                            size={280}
                            showLabels={true}
                        />
                        <div className="text-center pt-2">
                            <span className="px-3 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-black uppercase tracking-wider">
                                {getScoreTierText(overallScore)}
                            </span>
                        </div>
                    </div>

                    {/* Right Column: 6 Distributed Category Controls */}
                    <div className="md:col-span-7 space-y-3">
                        {categories.map((cat, idx) => {
                            const curVal = scores[cat.id] ?? 75;
                            return (
                                <div
                                    key={cat.id}
                                    className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2 hover:border-amber-500/40 transition-colors"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400 font-mono text-xs font-bold flex items-center justify-center shrink-0">
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
                </div>

                {/* Personal Notes */}
                <div className="space-y-1.5">
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-400">
                        Notes
                    </label>
                    <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Write your personal thoughts or impressions..."
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
                            className="p-3 rounded-2xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Trash2 size={20} />
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
                            className="p-3 px-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-base uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-amber-400/20 transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Check size={22} className="stroke-[3]" />
                            <span>{isSaving ? 'Saving...' : 'Save'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

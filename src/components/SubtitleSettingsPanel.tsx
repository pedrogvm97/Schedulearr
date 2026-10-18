'use client';

import React, { useState, useEffect } from 'react';
import { Subtitles, Sparkles, Check, RotateCcw, Eye, Film, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

export interface SubtitleAppearanceConfig {
    fontSize: 'small' | 'medium' | 'large' | 'xlarge' | 'massive';
    fontWeight: 'normal' | 'bold' | 'heavy';
    backdrop: 'translucent' | 'solid' | 'shadow';
    highlightColor: 'amber' | 'emerald' | 'white' | 'sky';
    position: 'bottom' | 'top';
}

export const DEFAULT_SUBTITLE_APPEARANCE: SubtitleAppearanceConfig = {
    fontSize: 'medium',
    fontWeight: 'bold',
    backdrop: 'translucent',
    highlightColor: 'amber',
    position: 'bottom'
};

export function applySubtitleCssVariables(config: SubtitleAppearanceConfig) {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const sizeMap: Record<string, string> = {
        small: '0.95rem',
        medium: '1.2rem',
        large: '1.45rem',
        xlarge: '1.75rem',
        massive: '2.15rem'
    };
    const weightMap: Record<string, string> = {
        normal: '500',
        bold: '700',
        heavy: '900'
    };
    const bgMap: Record<string, string> = {
        translucent: 'rgba(0, 0, 0, 0.75)',
        solid: 'rgba(0, 0, 0, 0.95)',
        shadow: 'transparent'
    };
    const colorMap: Record<string, string> = {
        amber: '#fbbf24',
        emerald: '#34d399',
        white: '#ffffff',
        sky: '#38bdf8'
    };

    root.style.setProperty('--sub-font-size', sizeMap[config.fontSize] || '1.2rem');
    root.style.setProperty('--sub-font-weight', weightMap[config.fontWeight] || '700');
    root.style.setProperty('--sub-bg-color', bgMap[config.backdrop] || 'rgba(0, 0, 0, 0.75)');
    root.style.setProperty('--sub-text-color', colorMap[config.highlightColor] || '#fbbf24');
    window.dispatchEvent(new Event('schedulearr-subtitles-changed'));
}

export function getStoredSubtitleAppearance(): SubtitleAppearanceConfig {
    if (typeof window === 'undefined') return DEFAULT_SUBTITLE_APPEARANCE;
    try {
        const local = localStorage.getItem('schedulearr_subtitle_appearance');
        if (local) {
            const parsed = JSON.parse(local);
            return { ...DEFAULT_SUBTITLE_APPEARANCE, ...parsed };
        }
    } catch {}
    return DEFAULT_SUBTITLE_APPEARANCE;
}

export function SubtitleSettingsPanel() {
    const [config, setConfig] = useState<SubtitleAppearanceConfig>(DEFAULT_SUBTITLE_APPEARANCE);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Load initial config from localStorage or API
        const initial = getStoredSubtitleAppearance();
        setConfig(initial);
        applySubtitleCssVariables(initial);

        fetch('/api/settings')
            .then(r => r.ok ? r.json() : {})
            .then(data => {
                if (data?.subtitle_appearance) {
                    try {
                        const parsed = JSON.parse(data.subtitle_appearance);
                        const merged = { ...DEFAULT_SUBTITLE_APPEARANCE, ...parsed };
                        setConfig(merged);
                        localStorage.setItem('schedulearr_subtitle_appearance', JSON.stringify(merged));
                        applySubtitleCssVariables(merged);
                    } catch {}
                }
            })
            .catch(() => {});
    }, []);

    const updateConfig = async (patch: Partial<SubtitleAppearanceConfig>) => {
        const next = { ...config, ...patch };
        setConfig(next);
        applySubtitleCssVariables(next);
        try {
            localStorage.setItem('schedulearr_subtitle_appearance', JSON.stringify(next));
        } catch {}

        setSaving(true);
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'subtitle_appearance', value: JSON.stringify(next) })
            });
            toast.success('Subtitle appearance updated');
        } catch {
            toast.error('Failed to sync setting to server');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        await updateConfig(DEFAULT_SUBTITLE_APPEARANCE);
    };

    const sizeOptions: Array<{ id: SubtitleAppearanceConfig['fontSize']; label: string; sample: string }> = [
        { id: 'small', label: 'Small', sample: '14px' },
        { id: 'medium', label: 'Medium', sample: '16px' },
        { id: 'large', label: 'Large', sample: '20px' },
        { id: 'xlarge', label: 'X-Large', sample: '24px' },
        { id: 'massive', label: 'Massive', sample: '28px' }
    ];

    const weightOptions: Array<{ id: SubtitleAppearanceConfig['fontWeight']; label: string }> = [
        { id: 'normal', label: 'Regular' },
        { id: 'bold', label: 'Bold' },
        { id: 'heavy', label: 'Heavy' }
    ];

    const backdropOptions: Array<{ id: SubtitleAppearanceConfig['backdrop']; label: string }> = [
        { id: 'translucent', label: 'Translucent' },
        { id: 'solid', label: 'Solid' },
        { id: 'shadow', label: 'Shadow' }
    ];

    const colorOptions: Array<{ id: SubtitleAppearanceConfig['highlightColor']; label: string; bg: string; text: string }> = [
        { id: 'amber', label: 'Amber', bg: 'bg-amber-500', text: 'text-amber-400' },
        { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-500', text: 'text-emerald-400' },
        { id: 'white', label: 'White', bg: 'bg-white', text: 'text-white' },
        { id: 'sky', label: 'Sky', bg: 'bg-sky-500', text: 'text-sky-400' }
    ];

    const positionOptions: Array<{ id: SubtitleAppearanceConfig['position']; label: string }> = [
        { id: 'bottom', label: 'Bottom' },
        { id: 'top', label: 'Top' }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
                        <Subtitles size={26} />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-white">Subtitles</h2>
                        <span className="text-xs font-mono font-bold text-zinc-400">Appearance across Books, Movies, Series &amp; Songs</span>
                    </div>
                </div>

                <button
                    onClick={handleReset}
                    title="Reset Subtitle Appearance to Default"
                    className="p-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all flex items-center gap-2 text-xs font-black self-start sm:self-auto cursor-pointer"
                >
                    <RotateCcw size={16} />
                    <span>Reset</span>
                </button>
            </div>

            {/* Live Interactive Preview */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <span className="text-xs font-black uppercase text-purple-400 tracking-wider flex items-center gap-2">
                        <Eye size={16} /> Live Preview
                    </span>
                    <span className="text-xs font-bold text-zinc-500">Real-time Rendering</span>
                </div>

                <div className="relative w-full h-64 sm:h-72 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden flex flex-col justify-between p-6 select-none shadow-inner">
                    {/* Background cinematic artwork simulation */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-purple-950/40 via-zinc-900/60 to-black/80 pointer-events-none" />
                    <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
                        <div className="p-1.5 rounded-lg bg-black/60 border border-white/10 text-zinc-400">
                            <BookOpen size={16} />
                        </div>
                        <span className="text-xs font-bold text-zinc-400">Chapter 1: The Boy Who Lived</span>
                    </div>

                    <div className={`relative z-10 w-full flex justify-center ${config.position === 'top' ? 'mt-8' : 'mt-auto mb-2'}`}>
                        <div
                            className={`px-5 py-2.5 rounded-xl transition-all duration-200 text-center max-w-xl ${
                                config.backdrop === 'translucent'
                                    ? 'bg-black/75 backdrop-blur-md border border-white/10 shadow-2xl'
                                    : config.backdrop === 'solid'
                                        ? 'bg-black border border-zinc-700 shadow-2xl'
                                        : 'bg-transparent'
                            } ${
                                config.fontSize === 'small' ? 'text-sm' :
                                config.fontSize === 'medium' ? 'text-base sm:text-lg' :
                                config.fontSize === 'large' ? 'text-lg sm:text-xl' :
                                config.fontSize === 'xlarge' ? 'text-xl sm:text-2xl' :
                                'text-2xl sm:text-3xl'
                            } ${
                                config.fontWeight === 'normal' ? 'font-normal' :
                                config.fontWeight === 'bold' ? 'font-bold' :
                                'font-black'
                            } ${
                                config.highlightColor === 'amber' ? 'text-amber-300 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]' :
                                config.highlightColor === 'emerald' ? 'text-emerald-300 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]' :
                                config.highlightColor === 'white' ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]' :
                                'text-sky-300 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                            } ${
                                config.backdrop === 'shadow' ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,1)]' : ''
                            }`}
                        >
                            &ldquo;Mr. and Mrs. Dursley of number four, Privet Drive, were proud to say that they were perfectly normal.&rdquo;
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Font Size Selector */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-xs font-black uppercase text-purple-400 tracking-wider">
                        Size
                    </span>
                    <div className="grid grid-cols-5 gap-2">
                        {sizeOptions.map(opt => {
                            const active = config.fontSize === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ fontSize: opt.id })}
                                    title={`Subtitle Size: ${opt.label} (${opt.sample})`}
                                    className={`py-3 px-1 rounded-xl text-xs font-black uppercase transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${
                                        active
                                            ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    <span>{opt.label}</span>
                                    <span className="text-[10px] font-mono opacity-60">{opt.sample}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Font Weight Selector */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-xs font-black uppercase text-purple-400 tracking-wider">
                        Weight
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                        {weightOptions.map(opt => {
                            const active = config.fontWeight === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ fontWeight: opt.id })}
                                    title={`Font Weight: ${opt.label}`}
                                    className={`py-3.5 px-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    {active && <Check size={14} />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Backdrop Style */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-xs font-black uppercase text-purple-400 tracking-wider">
                        Backdrop
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                        {backdropOptions.map(opt => {
                            const active = config.backdrop === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ backdrop: opt.id })}
                                    title={`Backdrop Style: ${opt.label}`}
                                    className={`py-3.5 px-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    {active && <Check size={14} />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 4. Highlight Color */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-xs font-black uppercase text-purple-400 tracking-wider">
                        Highlight
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                        {colorOptions.map(opt => {
                            const active = config.highlightColor === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ highlightColor: opt.id })}
                                    title={`Highlight Color: ${opt.label}`}
                                    className={`py-3.5 px-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    <span className={`w-3 h-3 rounded-full ${opt.bg} shrink-0`} />
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 5. Placement Position */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4 md:col-span-2">
                    <span className="text-xs font-black uppercase text-purple-400 tracking-wider">
                        Position
                    </span>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                        {positionOptions.map(opt => {
                            const active = config.position === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ position: opt.id })}
                                    title={`Screen Position: ${opt.label}`}
                                    className={`py-3.5 px-4 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    {active && <Check size={14} />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

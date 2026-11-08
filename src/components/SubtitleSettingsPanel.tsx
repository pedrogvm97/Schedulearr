'use client';

import React, { useState, useEffect } from 'react';
import { Subtitles, Check, RotateCcw, Eye, BookOpen, Languages } from 'lucide-react';
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

const DEFAULT_SUPPORTED_LANGUAGES = [
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' }
];

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
    const [, setSaving] = useState(false);
    const [targetLanguages, setTargetLanguages] = useState<string[]>(['en', 'pt']);
    const [supportedLanguages, setSupportedLanguages] = useState<Array<{ code: string; name: string; flag: string }>>(DEFAULT_SUPPORTED_LANGUAGES);
    const [updatingLang, setUpdatingLang] = useState<string | null>(null);

    useEffect(() => {
        // Load initial config from localStorage or API
        const initial = getStoredSubtitleAppearance();
        setConfig(initial);
        applySubtitleCssVariables(initial);

        fetch('/api/settings')
            .then(r => r.ok ? r.json() : {})
            .then((data: any) => {
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

        // Fetch configured auto-translation languages
        fetch('/api/ai/video')
            .then(r => r.ok ? r.json() : {})
            .then((data: any) => {
                if (data?.targetLanguages && Array.isArray(data.targetLanguages)) {
                    setTargetLanguages(data.targetLanguages);
                }
                if (data?.supportedLanguages && Array.isArray(data.supportedLanguages)) {
                    setSupportedLanguages(data.supportedLanguages);
                }
            })
            .catch(() => {});
    }, []);

    const handleToggleLanguage = async (code: string) => {
        const clean = code.toLowerCase().trim();
        let next: string[];
        if (targetLanguages.includes(clean)) {
            if (targetLanguages.length <= 1) {
                toast.warning('At least one target language must remain active');
                return;
            }
            next = targetLanguages.filter(l => l !== clean);
        } else {
            next = [...targetLanguages, clean];
        }

        setTargetLanguages(next);
        setUpdatingLang(clean);
        try {
            const res = await fetch('/api/ai/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_target_languages', languages: next })
            });
            if (res.ok) {
                toast.success('Auto-translation target languages updated');
            } else {
                toast.error('Failed to update language');
            }
        } catch {
            toast.error('Network error saving languages');
        } finally {
            setUpdatingLang(null);
        }
    };

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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
                        <Subtitles size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-white">Subtitles</h2>
                    </div>
                </div>

                <button
                    onClick={handleReset}
                    title="Reset Subtitle Appearance to Default"
                    className="px-5 py-3.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all flex items-center gap-2.5 text-sm font-black cursor-pointer shadow-sm"
                >
                    <RotateCcw size={18} />
                    <span>Reset</span>
                </button>
            </div>

            {/* Live Interactive Preview */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <span className="text-sm sm:text-base font-black uppercase text-sky-400 tracking-wider flex items-center gap-2.5">
                        <Eye size={22} /> Preview
                    </span>
                </div>

                <div className="relative w-full h-64 sm:h-72 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden flex flex-col justify-between p-6 select-none shadow-inner">
                    <div className="absolute inset-0 bg-gradient-to-tr from-sky-950/30 via-zinc-900/60 to-black/80 pointer-events-none" />
                    <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
                        <div className="p-2 rounded-xl bg-black/60 border border-white/10 text-zinc-300">
                            <BookOpen size={18} />
                        </div>
                    </div>

                    <div className={`relative z-10 w-full flex justify-center ${config.position === 'top' ? 'mt-8' : 'mt-auto mb-2'}`}>
                        <div
                            className={`px-6 py-3.5 rounded-2xl transition-all duration-200 text-center max-w-xl ${
                                config.backdrop === 'translucent'
                                    ? 'bg-black/75 backdrop-blur-md border border-white/10 shadow-2xl'
                                    : config.backdrop === 'solid'
                                        ? 'bg-black border border-zinc-700 shadow-2xl'
                                        : 'bg-transparent'
                            } ${
                                config.fontSize === 'small' ? 'text-base sm:text-lg' :
                                config.fontSize === 'medium' ? 'text-lg sm:text-xl' :
                                config.fontSize === 'large' ? 'text-xl sm:text-2xl' :
                                config.fontSize === 'xlarge' ? 'text-2xl sm:text-3xl' :
                                'text-3xl sm:text-4xl'
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

            {/* Auto-Translation Target Languages Picker */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <span className="text-sm sm:text-base font-black uppercase text-sky-400 tracking-wider flex items-center gap-2.5">
                        <Languages size={22} /> Languages
                    </span>
                    <span className="text-sm font-mono font-bold text-zinc-300 bg-zinc-950 px-3 py-1 rounded-xl border border-zinc-800">{targetLanguages.length} Active</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                    {supportedLanguages.map(lang => {
                        const active = targetLanguages.includes(lang.code.toLowerCase());
                        const isUpdating = updatingLang === lang.code.toLowerCase();
                        return (
                            <button
                                key={lang.code}
                                onClick={() => handleToggleLanguage(lang.code)}
                                disabled={isUpdating}
                                title={`Toggle Auto-Translation into ${lang.name} (${lang.code.toUpperCase()})`}
                                className={`p-4 sm:p-5 rounded-2xl text-center transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer border ${
                                    active
                                        ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-600/30 ring-2 ring-sky-400/50'
                                        : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40'
                                } ${isUpdating ? 'opacity-50 animate-pulse' : ''}`}
                            >
                                <span className="text-4xl select-none">{lang.flag}</span>
                                <div className="flex items-center gap-2 font-black text-sm sm:text-base">
                                    {active && <Check size={18} className="text-white shrink-0" />}
                                    <span>{lang.name}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Font Size Selector */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-sm sm:text-base font-black uppercase text-sky-400 tracking-wider">
                        Size
                    </span>
                    <div className="grid grid-cols-5 gap-2.5">
                        {sizeOptions.map(opt => {
                            const active = config.fontSize === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ fontSize: opt.id })}
                                    title={`Subtitle Size: ${opt.label} (${opt.sample})`}
                                    className={`py-4 px-2 rounded-2xl text-xs sm:text-sm font-black uppercase transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer border ${
                                        active
                                            ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    <span>{opt.label}</span>
                                    <span className="text-xs font-mono opacity-70">{opt.sample}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Font Weight Selector */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-sm sm:text-base font-black uppercase text-sky-400 tracking-wider">
                        Weight
                    </span>
                    <div className="grid grid-cols-3 gap-2.5">
                        {weightOptions.map(opt => {
                            const active = config.fontWeight === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ fontWeight: opt.id })}
                                    title={`Font Weight: ${opt.label}`}
                                    className={`py-4 px-3 rounded-2xl text-xs sm:text-sm font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    {active && <Check size={16} />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Backdrop Style */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-sm sm:text-base font-black uppercase text-sky-400 tracking-wider">
                        Backdrop
                    </span>
                    <div className="grid grid-cols-3 gap-2.5">
                        {backdropOptions.map(opt => {
                            const active = config.backdrop === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ backdrop: opt.id })}
                                    title={`Backdrop Style: ${opt.label}`}
                                    className={`py-4 px-3 rounded-2xl text-xs sm:text-sm font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    {active && <Check size={16} />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 4. Highlight Color */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <span className="text-sm sm:text-base font-black uppercase text-sky-400 tracking-wider">
                        Color
                    </span>
                    <div className="grid grid-cols-4 gap-2.5">
                        {colorOptions.map(opt => {
                            const active = config.highlightColor === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => updateConfig({ highlightColor: opt.id })}
                                    title={`Highlight Color: ${opt.label}`}
                                    className={`py-4 px-3 rounded-2xl text-xs sm:text-sm font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    <span className={`w-3.5 h-3.5 rounded-full ${opt.bg} shrink-0 shadow-sm`} />
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 5. Placement Position */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4 md:col-span-2">
                    <span className="text-sm sm:text-base font-black uppercase text-sky-400 tracking-wider">
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
                                    className={`py-4 px-4 rounded-2xl text-xs sm:text-sm font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                                        active
                                            ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-600/30'
                                            : 'bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    {active && <Check size={16} />}
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

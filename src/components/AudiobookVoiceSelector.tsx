'use client';

import React from 'react';
import {
    AUDIOBOOK_VOICE_TONE_PRESETS,
    AUDIOBOOK_VOICE_TIMBRE_PRESETS,
    CuratedVoiceProfile
} from '@/lib/audiobookStudioShared';
import { Mic, Volume2, Sparkles, Check, Sliders } from 'lucide-react';

export interface AudiobookVoiceSelectorProps {
    selectedPreset: string;
    onSelectPreset: (presetId: string) => void;
    disabled?: boolean;
}

export const AudiobookVoiceSelector: React.FC<AudiobookVoiceSelectorProps> = ({
    selectedPreset,
    onSelectPreset,
    disabled = false
}) => {
    // Legacy mapping helpers
    const normalizePresetId = (id: string): string => {
        if (id === 'denoise_clarity') return 'clear_voice';
        if (id === 'warm_storyteller') return 'warm_bass';
        if (id === 'deep_narrator') return 'deep_pitch';
        if (id === 'crisp_clear') return 'crisp_treble';
        if (id === 'late_night_radio') return 'night_compress';
        return id;
    };

    const activeId = normalizePresetId(selectedPreset || 'clear_voice');

    const renderPresetCard = (preset: CuratedVoiceProfile) => {
        const isSelected = activeId === preset.id;
        return (
            <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectPreset(preset.id)}
                className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative group ${
                    isSelected
                        ? 'bg-zinc-900 border-amber-400 ring-2 ring-amber-400/30 shadow-xl shadow-amber-500/10'
                        : 'bg-zinc-950/70 border-zinc-850 hover:border-zinc-700 hover:bg-zinc-900/60'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={`${preset.name}: ${preset.subtitle}. ${preset.description}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`text-base font-black truncate ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                                {preset.name}
                            </h4>
                            {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0">
                                    <Check size={13} className="stroke-[3]" />
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-bold text-zinc-400 mt-0.5 truncate">
                            {preset.subtitle}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                            {preset.description}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    {preset.tags.slice(0, 3).map((tag, tIdx) => (
                        <span
                            key={tIdx}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                                isSelected
                                    ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30'
                                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                            }`}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </button>
        );
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* ── Column 1: Tone (Acoustic Clarity & Studio Mastering) ── */}
                <div className="space-y-3 p-4 rounded-3xl bg-zinc-950/60 border border-zinc-850">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-850">
                        <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            <Sliders size={20} />
                        </div>
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-white">Tone</h3>
                        </div>
                    </div>
                    <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                        {AUDIOBOOK_VOICE_TONE_PRESETS.map(renderPresetCard)}
                    </div>
                </div>

                {/* ── Column 2: Timbre (Custom Personas & Iconic Resonances) ── */}
                <div className="space-y-3 p-4 rounded-3xl bg-zinc-950/60 border border-zinc-850">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-850">
                        <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-white">Timbre</h3>
                        </div>
                    </div>
                    <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                        {AUDIOBOOK_VOICE_TIMBRE_PRESETS.map(renderPresetCard)}
                    </div>
                </div>
            </div>
        </div>
    );
};

'use client';

import React, { useState } from 'react';
import {
    AUDIOBOOK_VOICE_TONE_PRESETS,
    AUDIOBOOK_VOICE_TIMBRE_PRESETS,
    CuratedVoiceProfile
} from '@/lib/audiobookStudioShared';
import { Sparkles, Check, Sliders, Volume2, Mic2 } from 'lucide-react';

export interface AudiobookVoiceSelectorProps {
    selectedPreset?: string;
    onSelectPreset?: (presetId: string) => void;
    selectedPersonas?: string[];
    onTogglePersona?: (personaId: string) => void;
    enhancerEnabled?: boolean;
    onToggleEnhancer?: (enabled: boolean) => void;
    personasEnabled?: boolean;
    onTogglePersonas?: (enabled: boolean) => void;
    disabled?: boolean;
}

export const AudiobookVoiceSelector: React.FC<AudiobookVoiceSelectorProps> = ({
    selectedPreset = 'clear_voice',
    onSelectPreset,
    selectedPersonas,
    onTogglePersona,
    enhancerEnabled = true,
    onToggleEnhancer,
    personasEnabled = true,
    onTogglePersonas,
    disabled = false
}) => {
    // Local state fallbacks if parent does not provide explicit toggle callbacks
    const [localEnhancerOn, setLocalEnhancerOn] = useState(enhancerEnabled);
    const [localPersonasOn, setLocalPersonasOn] = useState(personasEnabled);
    const [localSelectedPersonas, setLocalSelectedPersonas] = useState<string[]>(
        selectedPersonas || (selectedPreset ? [selectedPreset] : ['ava_neural'])
    );

    const isEnhancerOn = onToggleEnhancer ? enhancerEnabled : localEnhancerOn;
    const isPersonasOn = onTogglePersonas ? personasEnabled : localPersonasOn;
    const activePersonas = selectedPersonas || localSelectedPersonas;

    const handleToggleEnhancer = () => {
        const next = !isEnhancerOn;
        if (onToggleEnhancer) onToggleEnhancer(next);
        else setLocalEnhancerOn(next);
    };

    const handleTogglePersonas = () => {
        const next = !isPersonasOn;
        if (onTogglePersonas) onTogglePersonas(next);
        else setLocalPersonasOn(next);
    };

    const handleSelectPersona = (id: string) => {
        if (onTogglePersona) {
            onTogglePersona(id);
        } else {
            const next = localSelectedPersonas.includes(id)
                ? localSelectedPersonas.filter(p => p !== id)
                : [...localSelectedPersonas, id];
            const safeNext = next.length > 0 ? next : [id];
            setLocalSelectedPersonas(safeNext);
            if (onSelectPreset) onSelectPreset(id);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ══════════════════════════════════════════════════════════
                    OPTION 1: AUDIO ENHANCER (ACOUSTIC DENOISE & CLARITY)
                   ══════════════════════════════════════════════════════════ */}
                <div className={`p-6 rounded-3xl bg-zinc-950/70 border-2 transition-all space-y-5 ${
                    isEnhancerOn ? 'border-emerald-500/50 shadow-2xl shadow-emerald-500/10' : 'border-zinc-850 opacity-60'
                }`}>
                    {/* Switch 1: Audio Enhancer Master Toggle */}
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <Sliders size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white">Audio Enhancer</h3>
                        </div>

                        <button
                            type="button"
                            disabled={disabled}
                            onClick={handleToggleEnhancer}
                            className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${
                                isEnhancerOn ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'
                            }`}
                            title={isEnhancerOn ? 'Disable audio enhancer' : 'Enable audio enhancer'}
                        >
                            <div className={`w-6 h-6 rounded-full bg-white transition-transform ${isEnhancerOn ? 'translate-x-7' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Presets List */}
                    {isEnhancerOn ? (
                        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 no-scrollbar">
                            {AUDIOBOOK_VOICE_TONE_PRESETS.map(preset => {
                                const isSelected = selectedPreset === preset.id;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => onSelectPreset && onSelectPreset(preset.id)}
                                        title={`${preset.name}: ${preset.subtitle}. ${preset.description}`}
                                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4 ${
                                            isSelected
                                                ? 'bg-zinc-900 border-emerald-400 ring-2 ring-emerald-400/30 shadow-lg'
                                                : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2.5">
                                                <h4 className={`text-base font-black truncate ${isSelected ? 'text-emerald-300' : 'text-white'}`}>
                                                    {preset.name}
                                                </h4>
                                                <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold">
                                                    {preset.subtitle}
                                                </span>
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="w-6 h-6 rounded-full bg-emerald-400 text-black flex items-center justify-center shrink-0 shadow-md">
                                                <Check size={14} className="stroke-[3]" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-8 text-center bg-zinc-900/40 rounded-2xl border border-zinc-850 text-sm font-bold text-zinc-500">
                            Enhancer Off
                        </div>
                    )}
                </div>

                {/* ══════════════════════════════════════════════════════════
                    OPTION 2: VOICE PERSONAS (MULTI-SELECT REAL NEURAL MODELS)
                   ══════════════════════════════════════════════════════════ */}
                <div className={`p-6 rounded-3xl bg-zinc-950/70 border-2 transition-all space-y-5 ${
                    isPersonasOn ? 'border-amber-500/50 shadow-2xl shadow-amber-500/10' : 'border-zinc-850 opacity-60'
                }`}>
                    {/* Switch 2: Voice Personas Master Toggle */}
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <Mic2 size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white">Voice Personas</h3>
                        </div>

                        <button
                            type="button"
                            disabled={disabled}
                            onClick={handleTogglePersonas}
                            className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${
                                isPersonasOn ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-zinc-800'
                            }`}
                            title={isPersonasOn ? 'Disable voice personas' : 'Enable voice personas'}
                        >
                            <div className={`w-6 h-6 rounded-full bg-white transition-transform ${isPersonasOn ? 'translate-x-7' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Multi-Select Real Neural Voice Models */}
                    {isPersonasOn ? (
                        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 no-scrollbar">
                            {AUDIOBOOK_VOICE_TIMBRE_PRESETS.map(preset => {
                                const isChecked = activePersonas.includes(preset.id) || activePersonas.includes(preset.modelName || '');
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => handleSelectPersona(preset.id)}
                                        title={`${preset.name}: Exact neural model [${preset.modelName}]. ${preset.subtitle}. ${preset.description}`}
                                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4 ${
                                            isChecked
                                                ? 'bg-zinc-900 border-amber-400 ring-2 ring-amber-400/30 shadow-lg'
                                                : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <h4 className={`text-base font-black truncate ${isChecked ? 'text-amber-300' : 'text-white'}`}>
                                                    {preset.name}
                                                </h4>
                                                {preset.modelName && (
                                                    <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-lg bg-zinc-800 text-amber-400 border border-amber-500/40">
                                                        {preset.modelName}
                                                    </span>
                                                )}
                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                                                    {preset.gender === 'female' ? 'Female' : 'Male'} · {preset.tags.find(t => t.includes('Accent')) || 'Neural'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                                            isChecked ? 'bg-amber-400 border-amber-400 text-black shadow-md' : 'border-zinc-700 bg-zinc-900'
                                        }`}>
                                            {isChecked && <Check size={14} className="stroke-[3]" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-8 text-center bg-zinc-900/40 rounded-2xl border border-zinc-850 text-sm font-bold text-zinc-500">
                            Personas Off
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

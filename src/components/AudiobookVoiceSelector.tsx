'use client';

import React, { useState } from 'react';
import {
    AUDIOBOOK_VOICE_TONE_PRESETS,
    AUDIOBOOK_VOICE_TIMBRE_PRESETS,
    CuratedVoiceProfile
} from '@/lib/audiobookStudioShared';
import { Sparkles, Check, Sliders, Volume2, Mic2 } from 'lucide-react';

export interface AudiobookVoiceSelectorProps {
    engineMode?: 'timbre_filter' | 'neural_tts';
    onChangeEngineMode?: (mode: 'timbre_filter' | 'neural_tts') => void;
    selectedPreset?: string;
    onSelectPreset?: (presetId: string) => void;
    selectedPersonas?: string[];
    onTogglePersona?: (personaId: string) => void;
    selectedTimbres?: string[];
    onToggleTimbre?: (timbreId: string) => void;
    disabled?: boolean;
}

export const AudiobookVoiceSelector: React.FC<AudiobookVoiceSelectorProps> = ({
    engineMode: propEngineMode,
    onChangeEngineMode,
    selectedPreset = 'kokoro_af_heart',
    onSelectPreset,
    selectedPersonas,
    onTogglePersona,
    selectedTimbres,
    onToggleTimbre,
    disabled = false
}) => {
    const [localEngineMode, setLocalEngineMode] = useState<'timbre_filter' | 'neural_tts'>('neural_tts');
    const [localSelectedPersonas, setLocalSelectedPersonas] = useState<string[]>(
        selectedPersonas || (selectedPreset ? [selectedPreset] : ['kokoro_af_heart', 'kokoro_bf_emma'])
    );
    const [localSelectedTimbres, setLocalSelectedTimbres] = useState<string[]>(
        selectedTimbres || ['clear_voice', 'warm_bass']
    );

    const activeEngineMode = propEngineMode || localEngineMode;
    const activePersonas = selectedPersonas || localSelectedPersonas;
    const activeTimbres = selectedTimbres || localSelectedTimbres;

    const handleSwitchMode = (mode: 'timbre_filter' | 'neural_tts') => {
        setLocalEngineMode(mode);
        if (onChangeEngineMode) onChangeEngineMode(mode);
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

    const handleSelectTimbre = (id: string) => {
        if (onToggleTimbre) {
            onToggleTimbre(id);
        } else {
            const next = localSelectedTimbres.includes(id)
                ? localSelectedTimbres.filter(t => t !== id)
                : [...localSelectedTimbres, id];
            const safeNext = next.length > 0 ? next : [id];
            setLocalSelectedTimbres(safeNext);
            if (onSelectPreset) onSelectPreset(id);
        }
    };

    return (
        <div className="space-y-6">
            {/* ══════════════════════════════════════════════════════════
                AUDIO ENGINE MODE SWITCH (EXACTLY TWO OPTIONS)
               ══════════════════════════════════════════════════════════ */}
            <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <span className="text-sm font-black uppercase tracking-wider text-emerald-400">
                    Audio Engine Mode
                </span>

                <div className="flex items-center gap-2 p-1.5 bg-zinc-900/90 rounded-2xl border border-zinc-800">
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => handleSwitchMode('timbre_filter')}
                        className={`px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wider cursor-pointer transition-all ${
                            activeEngineMode === 'timbre_filter'
                                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                        title="Timbre Filter: Multi-band acoustic resonance, analog curves & intelligibility mastering"
                    >
                        Timbre Filter
                    </button>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => handleSwitchMode('neural_tts')}
                        className={`px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wider cursor-pointer transition-all ${
                            activeEngineMode === 'neural_tts'
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                        title="Neural TTS: Open-source neural speech synthesis models (Kokoro-82M, Piper ONNX)"
                    >
                        Neural TTS
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                MODE 1: TIMBRE FILTER (MULTI-SELECT ACOUSTIC PRESETS)
               ══════════════════════════════════════════════════════════ */}
            {activeEngineMode === 'timbre_filter' && (
                <div className="p-6 rounded-3xl bg-zinc-950/80 border-2 border-emerald-500/40 space-y-4 shadow-2xl shadow-emerald-500/5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <Sliders size={22} />
                            </div>
                            <h3 className="text-lg font-black text-white">Timbre Filter Presets</h3>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                            {activeTimbres.length} Active
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
                        {AUDIOBOOK_VOICE_TONE_PRESETS.map(preset => {
                            const isChecked = activeTimbres.includes(preset.id);
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => handleSelectTimbre(preset.id)}
                                    title={`${preset.name}: ${preset.subtitle}. ${preset.description}`}
                                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4 ${
                                        isChecked
                                            ? 'bg-zinc-900 border-emerald-400 ring-2 ring-emerald-400/30 shadow-lg'
                                            : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <h4 className={`text-base font-black truncate ${isChecked ? 'text-emerald-300' : 'text-white'}`}>
                                                {preset.name}
                                            </h4>
                                            <span className="text-xs px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold">
                                                {preset.subtitle}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                                        isChecked ? 'bg-emerald-400 border-emerald-400 text-black shadow-md' : 'border-zinc-700 bg-zinc-900'
                                    }`}>
                                        {isChecked && <Check size={14} className="stroke-[3]" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                MODE 2: NEURAL TTS (MULTI-SELECT AUTHENTIC OPEN MODELS)
               ══════════════════════════════════════════════════════════ */}
            {activeEngineMode === 'neural_tts' && (
                <div className="p-6 rounded-3xl bg-zinc-950/80 border-2 border-amber-500/40 space-y-4 shadow-2xl shadow-amber-500/5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <Mic2 size={22} />
                            </div>
                            <h3 className="text-lg font-black text-white">Neural Voice Models</h3>
                        </div>
                        <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">
                            {activePersonas.length} Active
                        </span>
                    </div>

                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
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
                                            : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
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
                </div>
            )}
        </div>
    );
};

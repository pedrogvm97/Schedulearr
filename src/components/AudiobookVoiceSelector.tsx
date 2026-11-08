'use client';

import React, { useState, useMemo } from 'react';
import {
    REAL_PERSON_VOICES,
    RealPersonVoice,
    VOICE_STYLE_PRESETS,
    VoiceStylePreset,
    calculateVoiceCombinations
} from '@/lib/audiobookStudioShared';
import { Mic, Check, Sliders, User, Cpu, Sparkles, Volume2 } from 'lucide-react';

export interface AudiobookVoiceSelectorProps {
    enabled?: boolean;
    onToggleEnabled?: (enabled: boolean) => void;
    selectedStyles?: string[];
    onToggleStyle?: (styleId: string) => void;
    selectedPersons?: string[];
    onTogglePerson?: (personId: string) => void;
    disabled?: boolean;
    onSave?: (settings: { enabled: boolean; styles: string[]; persons: string[] }) => void;
    isSaving?: boolean;

    // Legacy backwards-compatibility props
    engineMode?: string;
    onChangeEngineMode?: (mode: any) => void;
    selectedPreset?: string;
    onSelectPreset?: (val: any) => void;
    selectedPersonas?: any;
    onTogglePersona?: (id: any) => void;
    selectedTimbres?: any;
    onToggleTimbre?: (id: any) => void;
}

export function AudiobookVoiceSelector({
    enabled = true,
    onToggleEnabled,
    selectedStyles,
    onToggleStyle,
    selectedPersons,
    onTogglePerson,
    disabled = false,
    onSave,
    isSaving = false,
    engineMode,
    onChangeEngineMode,
    selectedPreset,
    onSelectPreset,
    selectedPersonas,
    onTogglePersona,
    selectedTimbres,
    onToggleTimbre
}: AudiobookVoiceSelectorProps) {
    const effectiveStyles = selectedStyles || (selectedPreset ? [selectedPreset] : ['warm']);
    const effectivePersons = selectedPersons || (Array.isArray(selectedPersonas) ? selectedPersonas : ['original']);
    const effectiveToggleStyle = onToggleStyle || onSelectPreset;
    const effectiveTogglePerson = onTogglePerson || onTogglePersona;
    const [localEnabled, setLocalEnabled] = useState(enabled);
    const [localStyles, setLocalStyles] = useState<string[]>(effectiveStyles.length > 0 ? effectiveStyles : ['warm']);
    const [localPersons, setLocalPersons] = useState<string[]>(effectivePersons.length > 0 ? effectivePersons : ['original']);

    const isVoiceActive = onToggleEnabled ? enabled : localEnabled;
    const currentStyles = effectiveToggleStyle ? effectiveStyles : localStyles;
    const currentPersons = effectiveTogglePerson ? effectivePersons : localPersons;

    const toggleStyle = (id: string) => {
        if (effectiveToggleStyle) {
            effectiveToggleStyle(id);
        } else {
            setLocalStyles(prev => {
                const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
                return next.length > 0 ? next : [id];
            });
        }
    };

    const togglePerson = (id: string) => {
        if (effectiveTogglePerson) {
            effectiveTogglePerson(id);
        } else {
            setLocalPersons(prev => {
                const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
                return next.length > 0 ? next : [id];
            });
        }
    };

    const comboData = useMemo(() => {
        return calculateVoiceCombinations(currentStyles, currentPersons);
    }, [currentStyles, currentPersons]);

    return (
        <div className="space-y-6">
            {/* ── STEP 1: MASTER SWITCH ── */}
            <div className="p-6 rounded-3xl bg-zinc-950/95 border-2 border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black transition-all ${
                        isVoiceActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500/50 shadow-inner'
                            : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                    }`}>
                        <Mic size={28} />
                    </div>
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl sm:text-2xl font-black text-white">
                            Voice
                        </h3>
                        <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                            isVoiceActive
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-zinc-800 text-zinc-400'
                        }`}>
                            {isVoiceActive ? 'ON' : 'OFF'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            const next = !isVoiceActive;
                            if (onToggleEnabled) onToggleEnabled(next);
                            else setLocalEnabled(next);
                        }}
                        className={`px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all cursor-pointer shadow-lg ${
                            isVoiceActive
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/25'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                        }`}
                        title="Toggle Voice Enhancement On/Off"
                    >
                        {isVoiceActive ? 'Active' : 'Enable'}
                    </button>

                    {onSave && (
                        <button
                            type="button"
                            onClick={() => onSave({ enabled: isVoiceActive, styles: currentStyles, persons: currentPersons })}
                            disabled={isSaving}
                            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider cursor-pointer shadow-lg disabled:opacity-50"
                            title="Save Voice Configuration"
                        >
                            {isSaving ? '...' : 'Save'}
                        </button>
                    )}
                </div>
            </div>

            {isVoiceActive && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    {/* ── STEP 2: STYLES ── */}
                    <div className="p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <Sliders size={22} className="text-amber-400" />
                                <h4 className="text-lg font-black text-white uppercase tracking-wider">
                                    Styles ({currentStyles.length})
                                </h4>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                            {VOICE_STYLE_PRESETS.map(preset => {
                                const isSelected = currentStyles.includes(preset.id);
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => toggleStyle(preset.id)}
                                        title={`${preset.subtitle}: ${preset.description}`}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 min-h-[92px] ${
                                            isSelected
                                                ? 'bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/40 shadow-lg'
                                                : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700 text-zinc-400'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`text-base font-black ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                                {preset.label}
                                            </span>
                                            {isSelected && (
                                                <span className="w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center shrink-0">
                                                    <Check size={14} strokeWidth={3} />
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs font-mono font-bold text-amber-300/80 truncate">
                                            {preset.subtitle}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── STEP 3: MODELS & DSP EQUALIZERS ── */}
                    <div className="p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <Cpu size={22} className="text-purple-400" />
                                <h4 className="text-lg font-black text-white uppercase tracking-wider">
                                    Models ({currentPersons.length})
                                </h4>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {REAL_PERSON_VOICES.map(person => {
                                const isSelected = currentPersons.includes(person.id);
                                return (
                                    <div
                                        key={person.id}
                                        onClick={() => togglePerson(person.id)}
                                        title={person.description}
                                        className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[140px] ${
                                            isSelected
                                                ? 'bg-gradient-to-br from-purple-950/70 via-zinc-950 to-zinc-950 border-purple-400 ring-2 ring-purple-400/40 shadow-xl'
                                                : 'bg-zinc-950/90 border-zinc-800 hover:border-zinc-700 text-zinc-400'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <h5 className={`text-base sm:text-lg font-black truncate ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                                    {person.name}
                                                </h5>
                                                <span className="text-xs font-mono font-bold text-purple-300 block truncate">
                                                    {person.subtitle}
                                                </span>
                                            </div>
                                            {isSelected ? (
                                                <span className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center shrink-0 shadow">
                                                    <Check size={14} strokeWidth={3} />
                                                </span>
                                            ) : (
                                                <span className="w-6 h-6 rounded-full border border-zinc-700 shrink-0" />
                                            )}
                                        </div>

                                        {/* Authentic Technology Badge */}
                                        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-black uppercase tracking-wider border ${
                                                person.engineType === 'neural'
                                                    ? 'bg-purple-950/60 border-purple-500/40 text-purple-200'
                                                    : person.engineType === 'dsp'
                                                    ? 'bg-sky-950/60 border-sky-500/40 text-sky-200'
                                                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'
                                            }`}>
                                                {person.engineLabel}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {person.tags.slice(0, 1).map((t, idx) => (
                                                    <span key={idx} className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── STEP 4: COMBINATION ITERATIONS ── */}
                    <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-950/40 via-zinc-950 to-amber-950/40 border border-purple-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border-2 border-amber-400/40 flex items-center justify-center text-amber-300 font-mono font-black text-xl shrink-0">
                                1+{comboData.totalExtraIterations}
                            </div>
                            <div>
                                <h5 className="text-base sm:text-lg font-black text-white">
                                    {comboData.summaryText}
                                </h5>
                                <span className="text-xs font-mono font-bold text-amber-300/90" title={`${currentStyles.length} Styles × ${currentPersons.length} Models`}>
                                    {currentStyles.length} × {currentPersons.length} = {comboData.totalExtraIterations}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {comboData.combinations.slice(0, 4).map((c, idx) => (
                                <span
                                    key={idx}
                                    className="px-3.5 py-1.5 rounded-xl bg-black/70 border border-zinc-800 text-xs font-bold text-zinc-200 font-mono"
                                >
                                    {c.label}
                                </span>
                            ))}
                            {comboData.combinations.length > 4 && (
                                <span className="px-3.5 py-1.5 rounded-xl bg-purple-500/20 text-purple-200 border border-purple-500/40 text-xs font-black">
                                    +{comboData.combinations.length - 4}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

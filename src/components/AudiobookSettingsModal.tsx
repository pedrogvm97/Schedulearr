'use client';

import React, { useState } from 'react';
import {
    X,
    Settings,
    Download,
    Palette,
    Cpu,
    BookOpen,
    Layers,
    Sparkles,
    Check
} from 'lucide-react';
import { AudiobookVoiceSelector } from './AudiobookVoiceSelector';
import { AudiobookExportModal } from './AudiobookExportModal';

export interface AudiobookSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    bookKey: string;
    bookTitle: string;
    selectedVoicePreset: string;
    onSelectVoicePreset: (presetId: string) => void;
    selectedPersonas?: string[];
    onTogglePersona?: (personaId: string) => void;
    currentArtStyle?: string;
    onSelectArtStyle?: (style: string) => void;
}

const ART_STYLES = [
    'Auto',
    'Cinematic Concept Art',
    'Dramatic Realism',
    'Dark Fantasy Oil Painting',
    'Vintage Literary Classic',
    'Graphic Novel Illustration',
    'Cyberpunk Neo-Noir',
    'Watercolor & Ink'
];

export const AudiobookSettingsModal: React.FC<AudiobookSettingsModalProps> = ({
    isOpen,
    onClose,
    bookKey,
    bookTitle,
    selectedVoicePreset,
    onSelectVoicePreset,
    selectedPersonas,
    onTogglePersona,
    currentArtStyle = 'Auto',
    onSelectArtStyle
}) => {
    const [activeTab, setActiveTab] = useState<'voice' | 'art' | 'export'>('voice');
    const [showExportModal, setShowExportModal] = useState(false);
    const [selectedStyle, setSelectedStyle] = useState(currentArtStyle);

    if (!isOpen) return null;

    const handleStyleChange = (style: string) => {
        setSelectedStyle(style);
        if (onSelectArtStyle) onSelectArtStyle(style);
    };

    return (
        <>
            <div
                className="fixed inset-0 z-[480] bg-black/85 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
                onClick={onClose}
            >
                <div
                    className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-850">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                                <Settings size={26} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl sm:text-2xl font-black text-white truncate">
                                    Settings
                                </h2>
                                <p className="text-sm font-bold text-amber-400/90 truncate mt-0.5">
                                    {bookTitle}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowExportModal(true)}
                                className="p-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/30 transition-all cursor-pointer"
                                title="Export Audiobook Assets"
                            >
                                <Download size={20} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer"
                                title="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Navigation Pills */}
                    <div className="flex items-center gap-2 p-1.5 bg-zinc-900/90 rounded-2xl border border-zinc-800 shrink-0 w-fit">
                        <button
                            type="button"
                            onClick={() => setActiveTab('voice')}
                            className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                                activeTab === 'voice'
                                    ? 'bg-amber-500 text-black shadow-md'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Sparkles size={16} />
                            <span>Voice</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('art')}
                            className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                                activeTab === 'art'
                                    ? 'bg-amber-500 text-black shadow-md'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Palette size={16} />
                            <span>Art</span>
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                        {activeTab === 'voice' && (
                            <AudiobookVoiceSelector
                                selectedPreset={selectedVoicePreset}
                                onSelectPreset={onSelectVoicePreset}
                                selectedPersonas={selectedPersonas}
                                onTogglePersona={onTogglePersona}
                            />
                        )}

                        {activeTab === 'art' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {ART_STYLES.map(style => {
                                        const isSelected = selectedStyle === style;
                                        return (
                                            <button
                                                key={style}
                                                type="button"
                                                onClick={() => handleStyleChange(style)}
                                                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                    isSelected
                                                        ? 'bg-zinc-900 border-amber-400 ring-2 ring-amber-400/20 shadow-lg'
                                                        : 'bg-zinc-950/70 border-zinc-850 hover:border-zinc-700'
                                                }`}
                                                title={`Select art style: ${style}`}
                                            >
                                                <span className={`text-sm font-black ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                                                    {style}
                                                </span>
                                                {isSelected && (
                                                    <span className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0">
                                                        <Check size={13} className="stroke-[3]" />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-zinc-850">
                        <button
                            type="button"
                            onClick={() => setShowExportModal(true)}
                            className="px-5 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/30 text-sm font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all"
                            title="Export Audiobook (Audio, Transcripts, Artwork, Metadata)"
                        >
                            <Download size={18} />
                            <span>Export</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black uppercase tracking-wider cursor-pointer transition-all"
                            title="Done"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>

            {/* Export Modal */}
            <AudiobookExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                bookKey={bookKey}
                bookTitle={bookTitle}
            />
        </>
    );
};

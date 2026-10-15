'use client';

import React, { useState } from 'react';
import {
    X, Trash2, AlertTriangle, Image as ImageIcon,
    FileText, Headphones, Sparkles, Database, Check
} from 'lucide-react';
import { toast } from 'sonner';

export type CleanerTargetScope = 'all' | 'images' | 'scenes' | 'transcripts' | 'voices' | 'api_history';

export interface UnifiedCleanerModalProps {
    isOpen: boolean;
    bookKey?: string | null;
    bookTitle?: string | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export const UnifiedCleanerModal: React.FC<UnifiedCleanerModalProps> = ({
    isOpen,
    bookKey = null,
    bookTitle = null,
    onClose,
    onSuccess
}) => {
    const [selectedScope, setSelectedScope] = useState<CleanerTargetScope>('all');
    const [isCleaning, setIsCleaning] = useState(false);
    const [applyToWholeLibrary, setApplyToWholeLibrary] = useState<boolean>(!bookKey);
    const [isConfirmed, setIsConfirmed] = useState(false);

    if (!isOpen) return null;

    const cleanerOptions: Array<{
        id: CleanerTargetScope;
        title: string;
        desc: string;
        icon: React.ReactNode;
        color: string;
    }> = [
        {
            id: 'all',
            title: 'Clean Everything',
            desc: 'Permanently purge all generated artwork, scenes, transcripts, and voice audio files.',
            icon: <Trash2 size={22} className="text-red-400" />,
            color: 'border-red-500/50 hover:border-red-400 bg-red-950/20'
        },
        {
            id: 'images',
            title: 'Artwork Only',
            desc: 'Delete generated scene artwork and covers while keeping text transcripts and scene timestamps intact.',
            icon: <ImageIcon size={22} className="text-emerald-400" />,
            color: 'border-emerald-500/40 hover:border-emerald-400 bg-emerald-950/20'
        },
        {
            id: 'scenes',
            title: 'Scenes & Artwork',
            desc: 'Delete LLM-detected scenes and artwork while keeping Speech-to-Text transcripts intact.',
            icon: <Sparkles size={22} className="text-purple-400" />,
            color: 'border-purple-500/40 hover:border-purple-400 bg-purple-950/20'
        },
        {
            id: 'transcripts',
            title: 'Transcripts Only',
            desc: 'Delete verbatim Speech-to-Text .lrc and .txt transcripts across audio files.',
            icon: <FileText size={22} className="text-amber-400" />,
            color: 'border-amber-500/40 hover:border-amber-400 bg-amber-950/20'
        },
        {
            id: 'voices',
            title: 'Voice Exports',
            desc: 'Delete generated .m4a audio tracks from narrator enhancements and voice styles.',
            icon: <Headphones size={22} className="text-blue-400" />,
            color: 'border-blue-500/40 hover:border-blue-400 bg-blue-950/20'
        },
        {
            id: 'api_history',
            title: 'API Usage Logs',
            desc: 'Clear recorded AI provider request history and quota telemetry.',
            icon: <Database size={22} className="text-zinc-400" />,
            color: 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/40'
        }
    ];

    const handleExecuteClean = async () => {
        setIsCleaning(true);
        try {
            const payload: any = {
                action: 'clean_generated_data',
                target: selectedScope
            };
            if (!applyToWholeLibrary && bookKey) {
                payload.bookKey = bookKey;
            }

            const res = await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`Cleaned successfully: ${data.deletedFilesCount || 0} files deleted, ${data.booksAffected || 0} books updated`);
                if (onSuccess) onSuccess();
                onClose();
            } else {
                toast.error(data.error || 'Failed to clean generated data');
            }
        } catch {
            toast.error('Network error executing clean operation');
        } finally {
            setIsCleaning(false);
            setIsConfirmed(false);
        }
    };

    const targetLabel = (!applyToWholeLibrary && bookTitle)
        ? `"${bookTitle}"`
        : 'All Audiobooks in Library';

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl bg-zinc-950 border-2 border-red-500/50 rounded-3xl shadow-[0_0_50px_rgba(220,38,38,0.25)] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 bg-gradient-to-r from-red-950/40 via-zinc-900 to-zinc-950 border-b-2 border-red-500/30 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                            <Trash2 size={24} className="text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">
                                Clean Assets
                            </h2>
                            <p className="text-xs sm:text-sm font-bold text-zinc-400">
                                Target: <span className="text-amber-300">{targetLabel}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        title="Close cleaner"
                        className="p-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scope Selection */}
                <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
                    {/* Library vs Single Book Switch (if bookKey exists) */}
                    {bookKey && (
                        <div className="p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setApplyToWholeLibrary(false)}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    !applyToWholeLibrary
                                        ? 'bg-amber-500 text-black shadow'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                                This Book Only
                            </button>
                            <button
                                type="button"
                                onClick={() => setApplyToWholeLibrary(true)}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    applyToWholeLibrary
                                        ? 'bg-red-500 text-black shadow'
                                        : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                                Whole Library
                            </button>
                        </div>
                    )}

                    <div className="space-y-2.5">
                        <label className="text-xs font-black uppercase tracking-wider text-zinc-400 block">
                            Select What To Clean
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {cleanerOptions.map(opt => {
                                const isSelected = selectedScope === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedScope(opt.id);
                                            setIsConfirmed(false);
                                        }}
                                        className={`p-4 rounded-2xl border-2 text-left flex items-start gap-3 transition-all cursor-pointer ${
                                            isSelected
                                                ? 'border-amber-400 bg-amber-500/15 shadow-lg'
                                                : opt.color
                                        }`}
                                    >
                                        <div className="mt-0.5 shrink-0">{opt.icon}</div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-black text-white">{opt.title}</h4>
                                            <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
                                                {opt.desc}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Confirmation Checkbox */}
                    <div
                        onClick={() => setIsConfirmed(prev => !prev)}
                        className={`p-4 rounded-2xl border-2 flex items-center gap-3.5 cursor-pointer transition-all ${
                            isConfirmed
                                ? 'bg-red-950/40 border-red-500/80 text-white'
                                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        <div className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${
                            isConfirmed ? 'bg-red-500 border-red-400 text-black' : 'border-zinc-700 bg-zinc-950'
                        }`}>
                            {isConfirmed && <Check size={16} strokeWidth={3} />}
                        </div>
                        <div className="text-xs sm:text-sm font-bold">
                            I understand this permanently deletes selected files from disk.
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={handleExecuteClean}
                            disabled={!isConfirmed || isCleaning}
                            title="Execute clean operation"
                            className="w-full py-4 px-6 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl shadow-red-600/30 cursor-pointer transition-all"
                        >
                            <Trash2 size={22} className={isCleaning ? 'animate-spin' : ''} />
                            <span>{isCleaning ? 'Cleaning...' : 'Clean Now'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

'use client';

import React, { useState } from 'react';
import { X, Trash2, HardDrive, Monitor, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DeleteMediaModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: {
        id: number;
        instanceId: string;
        title: string;
        type: 'movie' | 'series';
        path?: string;
    } | null;
    onConfirm: (options: { deleteFiles: boolean; removeFromApp: boolean; deleteFilesOnly?: boolean }) => void;
    loading: boolean;
}

export function DeleteMediaModal({
    isOpen,
    onClose,
    item,
    onConfirm,
    loading
}: DeleteMediaModalProps) {
    const [selectedOption, setSelectedOption] = useState<'remove' | 'wipe' | 'files_only'>('remove');

    if (!isOpen || !item) return null;

    const options = [
        {
            id: 'remove',
            title: 'Remove from Library',
            description: 'Stops tracking this media. Files on your disk will NOT be touched.',
            icon: <Monitor size={22} />,
            color: 'text-blue-400',
            borderColor: 'border-blue-500/20',
            bgColor: 'bg-blue-500/5',
            activeBorder: 'border-blue-500',
            activeBg: 'bg-blue-500/10'
        },
        {
            id: 'wipe',
            title: 'Total Wipeout',
            description: 'Removes from the app AND permanently deletes all files from disk.',
            icon: <Trash2 size={22} />,
            color: 'text-red-400',
            borderColor: 'border-red-500/20',
            bgColor: 'bg-red-500/5',
            activeBorder: 'border-red-500',
            activeBg: 'bg-red-500/10'
        },
        {
            id: 'files_only',
            title: 'Clear Disk Only',
            description: 'Deletes the files but keeps the entry. Tells the app to re-search later.',
            icon: <HardDrive size={22} />,
            color: 'text-amber-400',
            borderColor: 'border-amber-500/20',
            bgColor: 'bg-amber-500/5',
            activeBorder: 'border-amber-500',
            activeBg: 'bg-amber-500/10'
        }
    ];

    const handleConfirm = () => {
        if (selectedOption === 'remove') {
            onConfirm({ deleteFiles: false, removeFromApp: true });
        } else if (selectedOption === 'wipe') {
            onConfirm({ deleteFiles: true, removeFromApp: true });
        } else if (selectedOption === 'files_only') {
            onConfirm({ deleteFiles: true, removeFromApp: false, deleteFilesOnly: true });
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-[#0a0a0a] border border-zinc-800/50 rounded-[3rem] w-full max-w-xl flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-8 border-b border-zinc-900/50 flex justify-between items-center bg-zinc-900/10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white">Delete Media</h2>
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                                Managing <span className="text-zinc-300">{item.title}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex flex-col gap-6">
                    <div className="bg-zinc-900/20 p-4 rounded-2xl border border-zinc-900/50">
                        <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-[0.1em] mb-2 px-1 opacity-50">Choose an action</p>
                        <div className="grid gap-3">
                            {options.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setSelectedOption(opt.id as any)}
                                    className={`flex items-start gap-4 p-5 rounded-[2rem] border transition-all text-left group ${selectedOption === opt.id
                                            ? `${opt.activeBorder} ${opt.activeBg} shadow-lg scale-[1.02]`
                                            : `${opt.borderColor} ${opt.bgColor} hover:border-zinc-700`
                                        }`}
                                >
                                    <div className={`mt-0.5 ${opt.color} p-3 rounded-2xl bg-black/40 border border-white/5 ring-4 ring-transparent group-hover:ring-white/5 transition-all`}>
                                        {opt.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-black text-white">{opt.title}</h4>
                                            {selectedOption === opt.id && <ShieldCheck size={16} className="text-emerald-500 mr-2" />}
                                        </div>
                                        <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1">{opt.description}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {item.path && (
                        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-zinc-950 border border-zinc-900 text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                            <HardDrive size={12} className="opacity-40" />
                            <span className="truncate opacity-60">Path: {item.path}</span>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-4 px-6 rounded-2xl bg-zinc-900 text-zinc-400 text-xs font-black uppercase tracking-widest border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className={`flex-[1.5] py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 ${selectedOption === 'wipe'
                                    ? 'bg-red-500 text-white hover:bg-red-600'
                                    : 'bg-white text-black hover:bg-zinc-200'
                                }`}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
                            ) : (
                                <>
                                    Confirm Action
                                    <Trash2 size={14} />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

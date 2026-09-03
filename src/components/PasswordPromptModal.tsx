'use client';

import React, { useState } from 'react';
import { Lock, X, KeyRound } from 'lucide-react';

export interface PasswordPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (password: string) => void | Promise<void>;
    title: string;
    description: string;
    confirmText?: string;
    loading?: boolean;
}

export function PasswordPromptModal({
    isOpen,
    onClose,
    onSubmit,
    title,
    description,
    confirmText = 'Submit',
    loading = false
}: PasswordPromptModalProps) {
    const [password, setPassword] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        onSubmit(password);
        setPassword('');
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0c0d12] border border-zinc-800/80 rounded-[2.5rem] max-w-md w-full p-6 sm:p-8 shadow-2xl relative space-y-6 text-zinc-100 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-13 h-13 rounded-2xl flex items-center justify-center border shrink-0 bg-indigo-500/10 text-indigo-400 border-indigo-500/25">
                            <KeyRound size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                {title}
                            </h2>
                            <p className="text-xs sm:text-sm text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">
                                Security Verification
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <p className="text-sm sm:text-base text-zinc-300 font-medium">
                        {description}
                    </p>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                            <Lock size={18} />
                        </div>
                        <input
                            type="password"
                            autoFocus
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password..."
                            className="w-full pl-11 pr-4 py-3.5 bg-zinc-950/80 border border-zinc-800 rounded-2xl text-white placeholder-zinc-500 text-base focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-5 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-sm sm:text-base font-bold transition-all disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="px-6 py-3 rounded-2xl text-sm sm:text-base font-black transition-all active:scale-95 disabled:opacity-50 bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 shadow-lg flex items-center gap-2"
                        >
                            {loading ? (
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                            ) : null}
                            {confirmText}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

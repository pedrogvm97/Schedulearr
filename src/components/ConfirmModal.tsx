'use client';

import React from 'react';
import { AlertTriangle, Trash2, X, AlertCircle, Info, Check } from 'lucide-react';

export interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    loading?: boolean;
    icon?: React.ReactNode;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    loading = false,
    icon
}: ConfirmModalProps) {
    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            iconBg: 'bg-red-500/10 text-red-400 border-red-500/25',
            confirmBtn: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 shadow-lg',
            defaultIcon: <Trash2 size={24} />
        },
        warning: {
            iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
            confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-black font-black shadow-amber-500/20 shadow-lg',
            defaultIcon: <AlertTriangle size={24} />
        },
        primary: {
            iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
            confirmBtn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 shadow-lg',
            defaultIcon: <Check size={24} />
        }
    }[variant];

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0c0d12] border border-zinc-800/80 rounded-[2.5rem] max-w-lg w-full p-6 sm:p-8 shadow-2xl relative space-y-6 text-zinc-100 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-13 h-13 rounded-2xl flex items-center justify-center border shrink-0 ${variantStyles.iconBg}`}>
                            {icon || variantStyles.defaultIcon}
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                {title}
                            </h2>
                            <p className="text-xs sm:text-sm text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">
                                Please Confirm Action
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

                {/* Body / Description */}
                <div className="text-sm sm:text-base text-zinc-300 leading-relaxed font-medium bg-zinc-950/60 border border-zinc-900/90 rounded-2xl p-4 sm:p-5">
                    {description}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-5 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-sm sm:text-base font-bold transition-all disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-6 py-3 rounded-2xl text-sm sm:text-base font-black transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 ${variantStyles.confirmBtn}`}
                    >
                        {loading ? (
                            <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                        ) : null}
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

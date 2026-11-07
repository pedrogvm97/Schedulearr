'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SleekSelectOption {
    id: string | number;
    label: string;
    count?: number;
    icon?: React.ReactNode;
}

interface SleekSelectProps {
    options: SleekSelectOption[];
    value: string | number;
    onChange: (val: any) => void;
    placeholder?: string;
    label?: string;
    icon?: React.ReactNode;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    colorScheme?: 'amber' | 'emerald' | 'purple' | 'zinc';
    minWidth?: string;
    title?: string;
}

export function SleekSelect({
    options,
    value,
    onChange,
    placeholder = 'Select option...',
    label,
    icon,
    className = '',
    size = 'md',
    colorScheme = 'amber',
    minWidth,
    title
}: SleekSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(
        o => o.id === value || String(o.id) === String(value)
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const themeBorder = {
        amber: 'hover:border-amber-500/60 focus:border-amber-500',
        emerald: 'hover:border-emerald-500/60 focus:border-emerald-500',
        purple: 'hover:border-purple-500/60 focus:border-purple-500',
        zinc: 'hover:border-zinc-500 focus:border-zinc-400'
    }[colorScheme];

    const themeSelected = {
        amber: 'bg-amber-500/15 text-amber-300 font-black',
        emerald: 'bg-emerald-500/15 text-emerald-300 font-black',
        purple: 'bg-purple-500/15 text-purple-300 font-black',
        zinc: 'bg-zinc-800 text-white font-black'
    }[colorScheme];

    const themeDot = {
        amber: 'bg-amber-400',
        emerald: 'bg-emerald-400',
        purple: 'bg-purple-400',
        zinc: 'bg-zinc-200'
    }[colorScheme];

    const sizePadding = {
        sm: 'px-3.5 py-2 text-sm font-bold',
        md: 'px-4 sm:px-5 py-3 text-base sm:text-lg font-black',
        lg: 'px-6 py-4 text-lg sm:text-xl font-black'
    }[size];

    return (
        <div
            ref={containerRef}
            className={`relative inline-block ${minWidth || 'min-w-[180px]'} ${className}`}
            title={title}
        >
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl bg-zinc-950/90 border border-zinc-800 ${themeBorder} ${sizePadding} text-white transition-all cursor-pointer shadow-lg active:scale-[0.99]`}
            >
                <div className="flex items-center gap-2.5 truncate">
                    {icon && <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{icon}</span>}
                    {label && (
                        <span className="text-xs sm:text-sm uppercase tracking-wider text-zinc-400 font-black shrink-0">
                            {label}:
                        </span>
                    )}
                    <span className="truncate text-zinc-100 font-black">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    {selectedOption?.count !== undefined && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs sm:text-sm font-mono font-black shrink-0">
                            {selectedOption.count}
                        </span>
                    )}
                </div>
                <ChevronDown
                    size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20}
                    className={`text-zinc-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`}
                />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-2 left-0 min-w-full max-w-md w-max rounded-2xl bg-[#0e0e11] border border-zinc-700/80 shadow-[0_20px_50px_rgba(0,0,0,0.95)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                        {options.length === 0 ? (
                            <div className="px-4 py-4 text-center text-zinc-500 text-sm font-bold uppercase tracking-wider">
                                No Options
                            </div>
                        ) : (
                            options.map(opt => {
                                const isSelected =
                                    opt.id === value || String(opt.id) === String(value);
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                            onChange(opt.id);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left text-base font-bold transition-all cursor-pointer ${
                                            isSelected
                                                ? themeSelected
                                                : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 truncate">
                                            {isSelected && (
                                                <span className={`w-2.5 h-2.5 rounded-full ${themeDot} shrink-0`} />
                                            )}
                                            {opt.icon && <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5">{opt.icon}</span>}
                                            <span className="truncate">{opt.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {opt.count !== undefined && (
                                                <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-xs sm:text-sm font-bold">
                                                    {opt.count}
                                                </span>
                                            )}
                                            {isSelected && <Check size={20} className="shrink-0" />}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

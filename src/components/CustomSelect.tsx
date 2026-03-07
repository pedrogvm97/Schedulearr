'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface Option {
    id: string | number;
    name: string;
}

interface CustomSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: any) => void;
    placeholder?: string;
    className?: string;
    label?: string;
    icon?: React.ReactNode;
    minimal?: boolean;
    small?: boolean;
}

export function CustomSelect({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    className = '',
    label,
    icon,
    minimal = false,
    small = false
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(o => o.id === value) || options.find(o => o.id.toString() === value?.toString());

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionId: string | number) => {
        onChange(optionId);
        setIsOpen(false);
    };

    return (
        <div className={`relative w-full ${className}`} ref={containerRef}>
            {label && (
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-2 ml-1">
                    {icon} {label}
                </label>
            )}

            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={minimal
                    ? `flex items-center gap-2 text-sm font-bold text-white cursor-pointer outline-none transition-all hover:text-emerald-400 ${isOpen ? 'text-emerald-500' : ''}`
                    : `flex items-center justify-between w-full bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-[1.25rem] px-5 py-3.5 text-sm text-white focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all hover:bg-zinc-900 hover:border-zinc-700/50 ${isOpen ? 'ring-4 ring-emerald-500/10 border-emerald-500/40 bg-zinc-900 shadow-[0_0_20px_rgba(0,0,0,0.3)]' : ''}`}
            >
                <span className={selectedOption ? (minimal ? '' : 'text-white font-bold tracking-tight') : 'text-zinc-600 font-medium'}>
                    {selectedOption ? selectedOption.name : placeholder}
                </span>
                <ChevronDown size={minimal ? 14 : 18} className={`text-zinc-500 transition-all duration-500 ${isOpen ? 'rotate-180 text-emerald-500' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-[100] w-full mt-3 bg-[#0a0a0a]/95 backdrop-blur-xl border border-zinc-800/50 rounded-[1.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 ease-out">
                    <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {options.length === 0 ? (
                            <div className="px-4 py-8 text-center text-zinc-600 font-bold text-[10px] uppercase tracking-widest">
                                No Options Available
                            </div>
                        ) : (
                            options.map((option) => {
                                const isSelected = option.id === value || option.id.toString() === value?.toString();
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleSelect(option.id)}
                                        className={`flex items-center justify-between w-full px-4 py-3 text-sm rounded-[1rem] transition-all group active:scale-[0.98] ${isSelected
                                            ? 'bg-emerald-500/10 text-emerald-400 font-black shadow-[0_0_20px_rgba(16,185,129,0.05)]'
                                            : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-white'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />}
                                            <span className={isSelected ? 'translate-x-0' : 'group-hover:translate-x-1 transition-transform'}>
                                                {option.name}
                                            </span>
                                        </div>
                                        {isSelected && (
                                            <div className="bg-emerald-500/20 p-1 rounded-lg">
                                                <Check size={12} className="text-emerald-400" strokeWidth={4} />
                                            </div>
                                        )}
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

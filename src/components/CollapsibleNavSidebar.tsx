'use client';

import React, { useState, useEffect } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

export interface CollapsibleSidebarSubItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    count?: number;
    badge?: string;
    title?: string;
}

export interface CollapsibleSidebarItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    count?: number;
    badge?: string;
    title?: string;
    subItems?: CollapsibleSidebarSubItem[];
}

interface CollapsibleNavSidebarProps {
    items: CollapsibleSidebarItem[];
    activeItemId: string;
    activeSubItemId?: string;
    onSelectItem: (itemId: string, subItemId?: string) => void;
    title?: string;
    storageKey?: string;
    className?: string;
    colorScheme?: 'amber' | 'emerald' | 'purple' | 'sky';
}

export function CollapsibleNavSidebar({
    items,
    activeItemId,
    activeSubItemId,
    onSelectItem,
    title,
    storageKey = 'schedulearr_sidebar_collapsed',
    className = '',
    colorScheme = 'amber'
}: CollapsibleNavSidebarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [expandedAccordionId, setExpandedAccordionId] = useState<string>(activeItemId);

    // Keep accordion aligned with active item (auto-collapse previous when changing)
    useEffect(() => {
        setExpandedAccordionId(activeItemId);
    }, [activeItemId]);

    // Read stored collapse state
    useEffect(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved !== null) {
                setIsCollapsed(saved === 'true');
            }
        } catch {}
    }, [storageKey]);

    const toggleCollapse = () => {
        setIsCollapsed(prev => {
            const next = !prev;
            try {
                localStorage.setItem(storageKey, String(next));
            } catch {}
            return next;
        });
    };

    const colors = {
        amber: {
            activeBg: 'bg-amber-500 text-black shadow-lg shadow-amber-500/25 font-black',
            activeSubBg: 'bg-amber-500/25 text-amber-200 border-l-4 border-amber-400 font-black shadow-sm',
            badgeBg: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
            toggleBtn: 'hover:bg-amber-500/20 hover:text-amber-300'
        },
        emerald: {
            activeBg: 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 font-black',
            activeSubBg: 'bg-emerald-500/25 text-emerald-200 border-l-4 border-emerald-400 font-black shadow-sm',
            badgeBg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
            toggleBtn: 'hover:bg-emerald-500/20 hover:text-emerald-300'
        },
        purple: {
            activeBg: 'bg-purple-600 text-white shadow-lg shadow-purple-600/25 font-black',
            activeSubBg: 'bg-purple-500/25 text-purple-200 border-l-4 border-purple-400 font-black shadow-sm',
            badgeBg: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
            toggleBtn: 'hover:bg-purple-500/20 hover:text-purple-300'
        },
        sky: {
            activeBg: 'bg-sky-600 text-white shadow-lg shadow-sky-600/25 font-black',
            activeSubBg: 'bg-sky-500/25 text-sky-200 border-l-4 border-sky-400 font-black shadow-sm',
            badgeBg: 'bg-sky-500/20 text-sky-300 border border-sky-500/40',
            toggleBtn: 'hover:bg-sky-500/20 hover:text-sky-300'
        }
    }[colorScheme];

    return (
        <aside
            className={`transition-all duration-300 flex flex-col shrink-0 select-none ${
                isCollapsed ? 'w-[84px] sm:w-[92px]' : 'w-[290px] sm:w-[320px] lg:w-[350px] 2xl:w-[380px]'
            } ${className}`}
        >
            <div className="rounded-3xl bg-zinc-950/90 border border-zinc-800/90 p-3 sm:p-4 flex flex-col justify-between gap-4 shadow-2xl backdrop-blur-md min-h-[520px]">
                {/* Header with Title (if expanded) and Collapse Button */}
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-900/90">
                    {!isCollapsed && title && (
                        <span className="text-sm sm:text-base font-black uppercase tracking-widest text-zinc-300 truncate">
                            {title}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={toggleCollapse}
                        title={isCollapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
                        className={`p-2.5 sm:p-3 rounded-2xl text-zinc-400 hover:text-white transition-all cursor-pointer ${colors.toggleBtn} ${
                            isCollapsed ? 'mx-auto' : 'ml-auto'
                        }`}
                    >
                        {isCollapsed ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
                    </button>
                </div>

                {/* Main Navigation Items */}
                <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-0.5">
                    {items.map(item => {
                        const isCurrentActive = activeItemId === item.id;
                        const isAccordionOpen = expandedAccordionId === item.id;
                        const hasSubItems = Array.isArray(item.subItems) && item.subItems.length > 0;

                        return (
                            <div key={item.id} className="space-y-1.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (hasSubItems && !isCollapsed) {
                                            // Auto-collapse previous: switch active accordion to this item
                                            setExpandedAccordionId(item.id);
                                        }
                                        const defaultSub = item.subItems?.[0]?.id;
                                        onSelectItem(item.id, defaultSub);
                                    }}
                                    title={item.title || item.label}
                                    className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
                                        isCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5 sm:py-4'
                                    } ${
                                        isCurrentActive
                                            ? colors.activeBg
                                            : 'text-zinc-300 hover:text-white hover:bg-zinc-900/80'
                                    }`}
                                >
                                    <div className="flex items-center gap-3.5 truncate">
                                        <span className="shrink-0 flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6 sm:[&>svg]:w-7 sm:[&>svg]:h-7">
                                            {item.icon}
                                        </span>
                                        {!isCollapsed && (
                                            <span className="text-base sm:text-lg lg:text-xl font-black uppercase tracking-wider truncate">
                                                {item.label}
                                            </span>
                                        )}
                                    </div>

                                    {!isCollapsed && (
                                        <div className="flex items-center gap-2 shrink-0">
                                            {item.count !== undefined && (
                                                <span
                                                    className={`px-3 py-1 rounded-xl text-sm sm:text-base font-mono font-black ${
                                                        isCurrentActive
                                                            ? 'bg-black/30 text-white'
                                                            : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                                                    }`}
                                                >
                                                    {item.count}
                                                </span>
                                            )}
                                            {hasSubItems && (
                                                <span className="text-current opacity-80">
                                                    {isAccordionOpen ? (
                                                        <ChevronUp size={22} />
                                                    ) : (
                                                        <ChevronDown size={22} />
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </button>

                                {/* Nested Accordion Sub-items */}
                                {!isCollapsed && hasSubItems && isAccordionOpen && (
                                    <div className="pl-5 pr-1 py-1.5 space-y-1.5 animate-in fade-in duration-200">
                                        {item.subItems!.map(sub => {
                                            const isSubActive =
                                                isCurrentActive && activeSubItemId === sub.id;
                                            return (
                                                <button
                                                    key={sub.id}
                                                    type="button"
                                                    onClick={() => onSelectItem(item.id, sub.id)}
                                                    title={sub.title || sub.label}
                                                    className={`w-full flex items-center justify-between px-4 py-3 sm:py-3.5 rounded-2xl text-sm sm:text-base lg:text-lg font-black transition-all cursor-pointer ${
                                                        isSubActive
                                                            ? colors.activeSubBg
                                                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 truncate">
                                                        {sub.icon && (
                                                            <span className="shrink-0 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6">
                                                                {sub.icon}
                                                            </span>
                                                        )}
                                                        <span className="truncate">{sub.label}</span>
                                                    </div>
                                                    {sub.count !== undefined && (
                                                        <span className="px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-mono font-black text-zinc-300">
                                                            {sub.count}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Search, Sparkles, Check, Image as ImageIcon,
    RefreshCw, ExternalLink, Link as LinkIcon, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface LogoCandidate {
    id: string;
    title: string;
    url: string;
    previewUrl: string;
    source: string;
    width?: number;
    height?: number;
    format?: string;
}

interface ChannelLogoModalProps {
    isOpen: boolean;
    onClose: () => void;
    channel: {
        id: string;
        name: string;
        cleanName?: string;
        logo?: string;
        group?: string;
    } | null;
    libraryId: string;
    onLogoUpdated: (channelId: string, newLogo: string) => void;
}

export function ChannelLogoModal({
    isOpen,
    onClose,
    channel,
    libraryId,
    onLogoUpdated
}: ChannelLogoModalProps) {
    const [query, setQuery] = useState('');
    const [candidates, setCandidates] = useState<LogoCandidate[]>([]);
    const [selectedLogo, setSelectedLogo] = useState<string>('');
    const [customUrl, setCustomUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && channel) {
            const initialQ = (channel.cleanName || channel.name || '')
                .replace(/^(\s*\|?\s*(?:vo|vodafone|meo|nos|nowo|pt|uk|us|es|fr|de|br)\s*\|?\s*[:\-\|\/])+/i, '')
                .replace(/\b(8k|4k|uhd|fhd|hd|sd|hevc|h\.?265|1080p|720p|576p|480p|2160p|raw|backup|alt|50fps|60fps|vip|feed)\b/gi, '')
                .replace(/[\[\]\(\)\-_:]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            setQuery(initialQ);
            setSelectedLogo(channel.logo || '');
            setCustomUrl('');
            handleSearch(initialQ);
        }
    }, [isOpen, channel]);

    const handleSearch = async (searchTerm: string) => {
        if (!searchTerm.trim()) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/theater/iptv/logo/search?q=${encodeURIComponent(searchTerm.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setCandidates(data.results || []);
                if (!selectedLogo && data.results && data.results.length > 0) {
                    setSelectedLogo(data.results[0].url);
                }
            } else {
                toast.error('Failed to search logos');
            }
        } catch {
            toast.error('Error searching logo candidates');
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = async () => {
        const finalUrl = customUrl.trim() || selectedLogo.trim();
        if (!finalUrl) {
            toast.error('Please pick a logo candidate or paste an image URL');
            return;
        }

        if (!channel) return;

        setIsSaving(true);
        try {
            const res = await fetch('/api/theater/iptv/logo/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    libraryId,
                    channelId: channel.id,
                    logoUrl: finalUrl
                })
            });

            if (res.ok) {
                toast.success(`Logo updated for "${channel.name}"!`);
                onLogoUpdated(channel.id, finalUrl);
                onClose();
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'Failed to update channel logo');
            }
        } catch {
            toast.error('Error saving logo update');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !channel) return null;

    const effectivePreview = customUrl.trim() || selectedLogo || channel.logo;

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0c0c0e] border border-amber-500/30 rounded-[2.5rem] w-full max-w-2xl p-6 sm:p-8 shadow-2xl relative space-y-6 max-h-[92vh] overflow-y-auto custom-scrollbar flex flex-col">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                >
                    <X size={20} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-4 pb-3 border-b border-zinc-900">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-2 shrink-0 shadow-inner overflow-hidden relative">
                        {effectivePreview ? (
                            <img
                                src={effectivePreview}
                                alt=""
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `/api/theater/iptv/logo?name=${encodeURIComponent(channel.name)}`;
                                }}
                            />
                        ) : (
                            <ImageIcon size={24} className="text-zinc-600" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                Channel Logo Matcher
                            </span>
                            {channel.group && (
                                <span className="text-[11px] text-zinc-500 font-bold truncate">
                                    • {channel.group}
                                </span>
                            )}
                        </div>
                        <h2 className="text-lg sm:text-xl font-black text-white truncate mt-1">
                            {channel.name}
                        </h2>
                    </div>
                </div>

                {/* Interactive Search Bar */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSearch(query);
                    }}
                    className="flex items-center gap-2.5"
                >
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search logo (e.g. Sport TV 1, RTP 1, HBO)..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500 transition-all font-medium"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading || !query.trim()}
                        className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                        {isLoading ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
                        <span>Search</span>
                    </button>
                </form>

                {/* Results Candidates Grid */}
                <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-bold px-1">
                        <span>Available Logo Matches ({candidates.length})</span>
                        {isLoading && <span className="text-amber-400 text-[11px] flex items-center gap-1"><RefreshCw size={11} className="animate-spin" /> Searching databases...</span>}
                    </div>

                    {candidates.length === 0 && !isLoading ? (
                        <div className="p-8 rounded-2xl bg-zinc-950/60 border border-zinc-900 text-center space-y-2">
                            <ImageIcon size={32} className="text-zinc-700 mx-auto" />
                            <p className="text-sm font-bold text-zinc-400">No logo matches found for "{query}"</p>
                            <p className="text-xs text-zinc-600">Try simplifying your search query or paste a direct image link below.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto custom-scrollbar p-1">
                            {candidates.map((cand) => {
                                const isSelected = selectedLogo === cand.url;
                                return (
                                    <div
                                        key={cand.id || cand.url}
                                        onClick={() => {
                                            setSelectedLogo(cand.url);
                                            setCustomUrl('');
                                        }}
                                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-between gap-2.5 relative group select-none ${
                                            isSelected
                                                ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/15 ring-2 ring-amber-500/40'
                                                : 'bg-zinc-950 hover:bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700'
                                        }`}
                                    >
                                        {/* Checkmark badge */}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-md">
                                                <Check size={12} strokeWidth={3} />
                                            </div>
                                        )}

                                        {/* Logo display container with dark checkered background */}
                                        <div className="w-full h-20 rounded-xl bg-zinc-900/90 border border-zinc-800/60 flex items-center justify-center p-2.5 overflow-hidden shadow-inner">
                                            <img
                                                src={cand.previewUrl || cand.url}
                                                alt=""
                                                className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = `/api/theater/iptv/logo?name=${encodeURIComponent(channel.name)}`;
                                                }}
                                            />
                                        </div>

                                        {/* Metadata */}
                                        <div className="w-full text-center min-w-0">
                                            <p className="text-xs font-bold text-white truncate" title={cand.title}>
                                                {cand.title}
                                            </p>
                                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                                                {cand.source} {cand.format ? `• ${cand.format}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Custom URL Input Fallback */}
                <div className="pt-2 border-t border-zinc-900 space-y-2">
                    <label className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                        <LinkIcon size={14} className="text-zinc-500" />
                        <span>Or Paste Custom Direct Image Link:</span>
                    </label>
                    <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => {
                            setCustomUrl(e.target.value);
                            if (e.target.value.trim()) setSelectedLogo('');
                        }}
                        placeholder="https://example.com/logo.png"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-amber-500 font-mono transition-colors"
                    />
                </div>

                {/* Footer Actions */}
                <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-bold text-xs transition-all cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={isSaving || (!selectedLogo && !customUrl.trim())}
                        className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                        {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                        <span>Apply Logo</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

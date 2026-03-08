'use client';

import React from 'react';
import { X, Search, CheckCircle, PlayCircle, Star } from 'lucide-react';

interface Release {
    guid: string;
    title: string;
    size: number;
    indexer: string;
    customFormatScore?: number;
    quality?: string | { quality?: { name: string } };
    rejected?: boolean;
    rejections?: string[];
    protocol?: string;
    indexerId: number;
}

interface InteractiveSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: {
        type: 'movie' | 'series' | 'episode';
        id: number;
        instanceId: string;
        title: string;
        poster?: string;
        sizeOnDisk?: number;
        statistics?: { sizeOnDisk: number };
    } | null;
    releases: Release[];
    isLoading: boolean;
    triggeringReleaseGuid: string | null;
    onTriggerDownload: (guid: string, indexerId: number) => void;
}

export function InteractiveSearchModal({
    isOpen,
    onClose,
    item,
    releases,
    isLoading,
    triggeringReleaseGuid,
    onTriggerDownload
}: InteractiveSearchModalProps) {
    if (!isOpen || !item) return null;

    const formatSize = (bytes: number) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const displaySize = item.type === 'movie' ? (item.sizeOnDisk || 0) : (item.statistics?.sizeOnDisk || 0);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-zinc-900 bg-zinc-900/30 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-black text-white mb-1 flex items-center gap-2">
                            <Search size={20} className="text-emerald-500" />
                            Interactive Search
                        </h2>
                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                            Results for <span className="text-emerald-400">{item.title}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {/* Item Summary */}
                    <div className="flex flex-col md:flex-row gap-6 bg-zinc-900/20 p-5 rounded-3xl border border-zinc-900">
                        {item.poster && (
                            <div className="w-28 aspect-[2/3] rounded-2xl overflow-hidden border border-zinc-800 shrink-0 shadow-2xl">
                                <img src={item.poster} className="w-full h-full object-cover" alt="" />
                            </div>
                        )}
                        <div className="flex-1 flex flex-col justify-center gap-4">
                            <div className="space-y-1">
                                <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest opacity-60">Status on Disk</div>
                                <div className="text-sm font-black text-white bg-zinc-900 border border-zinc-800/50 px-4 py-2 rounded-xl shadow-inner inline-block">
                                    {formatSize(displaySize)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Results List */}
                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mb-6 shadow-[0_0_20px_rgba(16,185,129,0.2)]"></div>
                                <p className="text-zinc-500 font-black uppercase tracking-widest text-xs animate-pulse">Querying indexers...</p>
                            </div>
                        ) : releases.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-zinc-950 rounded-3xl border-2 border-dashed border-zinc-900">
                                <Search size={48} className="text-zinc-800 mb-4" />
                                <h3 className="text-lg font-bold text-zinc-600">No Releases Found</h3>
                                <p className="text-xs text-zinc-700 mt-2 max-w-xs text-center font-medium uppercase tracking-wider">Your indexers could not find any active releases for this item.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {releases.map((release, idx) => (
                                    <div key={release.guid} className="bg-zinc-950/50 border border-zinc-900 hover:border-emerald-500/30 transition-all p-4 rounded-3xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between group/release">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="flex items-center justify-center px-2 py-0.5 rounded-lg bg-zinc-900 text-zinc-500 text-[10px] font-black border border-zinc-800">#{idx + 1}</span>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${(release.customFormatScore ?? 0) > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-900 text-zinc-600 border-zinc-800'}`}>Score: {release.customFormatScore ?? 0}</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                                                    {typeof release.quality === 'string' ? release.quality : (release.quality as any)?.quality?.name || 'Unknown'}
                                                </span>
                                                {release.rejected && (
                                                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500">Rejected</span>
                                                )}
                                            </div>
                                            <h4 className="text-sm font-bold text-zinc-300 break-words leading-relaxed group-hover/release:text-white transition-colors">
                                                {release.title}
                                            </h4>
                                            <div className="flex items-center gap-4 mt-2.5 text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                                                <span className="flex items-center gap-1.5"><CheckCircle size={10} className="text-zinc-800" /> {(release.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                                <span className="opacity-20">•</span>
                                                <span>{release.indexer}</span>
                                                <span className="opacity-20">•</span>
                                                <span>{release.protocol}</span>
                                            </div>
                                            {release.rejected && release.rejections && release.rejections.length > 0 && (
                                                <div className="mt-3 text-[10px] text-red-400/80 bg-red-500/5 p-2 rounded-xl border border-red-500/10 font-bold uppercase tracking-tight">
                                                    Rejection: {release.rejections.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-shrink-0 w-full md:w-auto">
                                            <button
                                                onClick={() => onTriggerDownload(release.guid, release.indexerId)}
                                                disabled={!!triggeringReleaseGuid}
                                                className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3.5 text-xs font-black uppercase tracking-widest rounded-2xl border transition-all ${triggeringReleaseGuid === release.guid
                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 cursor-wait'
                                                    : triggeringReleaseGuid
                                                        ? 'bg-zinc-900 text-zinc-700 border-zinc-800 cursor-not-allowed'
                                                        : 'bg-white text-black hover:bg-emerald-400 border-white/10 shadow-xl active:scale-95'
                                                    }`}
                                            >
                                                {triggeringReleaseGuid === release.guid ? (
                                                    <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></div>
                                                ) : (
                                                    <PlayCircle size={16} />
                                                )}
                                                {triggeringReleaseGuid === release.guid ? 'Grabbing' : 'Grab Release'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

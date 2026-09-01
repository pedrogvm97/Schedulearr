'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Star, Calendar, User, Film, CheckCircle, Plus, ChevronDown,
    Search, PlayCircle, Play, MoveHorizontal, Trash2, ChevronUp,
    ListOrdered, Clock, HardDrive, Radio, FileText, Layers, Monitor,
    AlertCircle, Sparkles, ShieldCheck, Volume2, Video, Subtitles,
    Folder, CheckCircle2, ArrowDownToLine, Tv, Globe, ExternalLink,
    Clapperboard, Download
} from 'lucide-react';
import { toast } from 'sonner';

interface MediaDetailsPanelProps {
    item: any;
    tmdbApiKey?: string;
    libStatus?: {
        exists: boolean;
        hasFile: boolean;
        isDownloading: boolean;
        sizeOnDisk: number;
        percentage: number;
        qualityProfileId?: number;
        instances: { id: string; name: string; internalId?: number; colorHex?: string }[];
    };
    onClose: () => void;
    onSelectRecommended?: (media: any) => void;
    onSelectPerson?: (personId: number) => void;
    onAdd?: () => void;
    onDelete?: (payload: any) => void;
    onTransfer?: (payload: any) => void;
    onInteractiveSearch?: (payload: any) => void;
    onQuickSearch?: (payload: any) => void;
    watchHistory?: any[];
}

function formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ──────────────────────────────────────────────
// Expandable Episode List Component
// ──────────────────────────────────────────────
function EpisodeList({
    instanceId,
    seriesId,
    seriesTitle,
    onInteractiveSearch,
    onQuickSearch
}: {
    instanceId: string;
    seriesId: number;
    seriesTitle?: string;
    onInteractiveSearch?: (ep: any) => void;
    onQuickSearch?: (target: any) => void;
}) {
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
    const [isExtended, setIsExtended] = useState(true);
    const [expandedEpId, setExpandedEpId] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    useEffect(() => {
        if (!instanceId || !seriesId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        fetch(`/api/sonarr/episodes?instanceId=${instanceId}&seriesId=${seriesId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                setEpisodes(list);
                const seasons = [...new Set(list.map((e: any) => e.seasonNumber))].sort((a: any, b: any) => a - b);
                if (seasons.length > 0) {
                    // Default to latest regular season or season 1
                    const regularSeasons = seasons.filter(s => s > 0);
                    setSelectedSeason(regularSeasons.length > 0 ? regularSeasons[0] : seasons[0]);
                }
            })
            .catch(() => setEpisodes([]))
            .finally(() => setLoading(false));
    }, [instanceId, seriesId]);

    const handleDeleteEpisodeFile = async (episodeFileId: number, epTitle: string, epId: number) => {
        setDeletingId(epId);
        try {
            const res = await fetch(`/api/sonarr/file?episodeFileId=${episodeFileId}&instanceId=${instanceId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                toast.success(`Deleted file for "${epTitle}"`);
                setEpisodes(prev => prev.map(e => e.id === epId ? { ...e, hasFile: false, episodeFile: null, episodeFileId: undefined } : e));
            } else {
                toast.error('Failed to delete episode file');
            }
        } catch {
            toast.error('Error deleting episode file');
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8 gap-3 text-zinc-500 text-sm font-bold bg-zinc-950/40 rounded-2xl border border-zinc-900">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>Loading seasons and episodes...</span>
            </div>
        );
    }

    if (episodes.length === 0) {
        return (
            <div className="p-6 bg-zinc-950/40 border border-zinc-900 rounded-2xl text-center space-y-2">
                <p className="text-sm font-bold text-zinc-400">No episodes found for this series.</p>
                <p className="text-xs text-zinc-600">The series may be newly added or refreshing metadata from indexers.</p>
            </div>
        );
    }

    const seasons = [...new Set(episodes.map(e => e.seasonNumber))].sort((a: any, b: any) => a - b);
    const displayedEpisodes = episodes.filter(e => e.seasonNumber === selectedSeason);
    const haveCount = displayedEpisodes.filter(e => e.hasFile).length;

    return (
        <div className="space-y-4">
            {/* Header Accordion Toggle */}
            <button
                onClick={() => setIsExtended(!isExtended)}
                className="w-full flex items-center justify-between gap-3 bg-zinc-950/60 hover:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 transition-all group shadow-sm"
            >
                <div className="flex items-center gap-2.5 text-sm sm:text-base font-black text-zinc-200 group-hover:text-white">
                    <ListOrdered size={18} className="text-emerald-400" />
                    <span>Seasons & Episodes ({episodes.length} total)</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                        {episodes.filter(e => e.hasFile).length}/{episodes.length} Downloaded
                    </span>
                    {isExtended ? <ChevronUp size={18} className="text-zinc-400" /> : <ChevronDown size={18} className="text-zinc-400" />}
                </div>
            </button>

            {isExtended && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Season Selector Tabs */}
                    <div className="flex items-center justify-between gap-2 bg-zinc-950/60 p-2.5 rounded-2xl border border-zinc-800/80 flex-wrap">
                        <div className="flex flex-1 overflow-x-auto no-scrollbar gap-2 py-0.5">
                            {seasons.map(s => {
                                const seasonEps = episodes.filter(e => e.seasonNumber === s);
                                const seasonHave = seasonEps.filter(e => e.hasFile).length;
                                const isAll = seasonHave === seasonEps.length && seasonEps.length > 0;
                                const isSelected = selectedSeason === s;

                                return (
                                    <button
                                        key={s}
                                        onClick={() => setSelectedSeason(s)}
                                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex-shrink-0 border ${
                                            isSelected
                                                ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-md'
                                                : 'bg-zinc-900/70 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                                        }`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${isAll ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : seasonHave > 0 ? 'bg-amber-400' : 'bg-zinc-700'}`} />
                                        <span>{s === 0 ? 'Specials' : `Season ${s}`}</span>
                                        <span className="text-[11px] font-bold text-zinc-500">
                                            ({seasonHave}/{seasonEps.length})
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {selectedSeason !== null && (
                            <button
                                onClick={() => onQuickSearch?.({ type: 'season', id: seriesId, instanceId, seasonNumber: selectedSeason })}
                                className="px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500 hover:text-black text-emerald-400 border border-emerald-500/30 transition-all flex items-center gap-2 shrink-0 active:scale-95 shadow-sm"
                            >
                                <PlayCircle size={14} /> Auto Search Season {selectedSeason}
                            </button>
                        )}
                    </div>

                    {/* Season Episode Counter Info */}
                    <div className="flex items-center justify-between text-xs sm:text-sm text-zinc-400 font-bold px-2">
                        <span>
                            Showing <span className="text-white font-extrabold">{displayedEpisodes.length}</span> episodes in {selectedSeason === 0 ? 'Specials' : `Season ${selectedSeason}`}
                        </span>
                        <span className="text-emerald-400 font-extrabold">
                            {haveCount} of {displayedEpisodes.length} files available on disk
                        </span>
                    </div>

                    {/* Episodes List Accordion Grid */}
                    <div className="space-y-2.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                        {displayedEpisodes.map(ep => {
                            const isExpanded = expandedEpId === ep.id;
                            const isDeletingThis = deletingId === ep.id;
                            const isConfirmingThis = confirmDeleteId === ep.id;
                            const mediaInfo = ep.episodeFile?.mediaInfo;
                            const fileQuality = ep.episodeFile?.quality?.quality?.name;
                            const videoDetails = [
                                fileQuality,
                                mediaInfo?.resolution,
                                mediaInfo?.videoCodec,
                                mediaInfo?.videoDynamicRange
                            ].filter(Boolean).join(' • ');

                            const audioDetails = [
                                mediaInfo?.audioCodec,
                                mediaInfo?.audioChannels ? `${mediaInfo.audioChannels} ch` : null,
                                mediaInfo?.audioLanguages
                            ].filter(Boolean).join(' • ');

                            return (
                                <div
                                    key={ep.id}
                                    className={`rounded-2xl border transition-all overflow-hidden ${
                                        ep.hasFile
                                            ? 'bg-zinc-950/70 border-zinc-800/90 shadow-md hover:border-zinc-700'
                                            : 'bg-zinc-950/30 border-zinc-900/80 opacity-75 hover:opacity-100'
                                    }`}
                                >
                                    {/* Episode Header Line */}
                                    <div className="p-3 sm:p-4 flex items-center justify-between gap-3">
                                        <button
                                            onClick={() => setExpandedEpId(isExpanded ? null : ep.id)}
                                            className="flex-1 min-w-0 flex items-center gap-3 text-left group/btn"
                                        >
                                            <div className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${ep.hasFile ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900 text-zinc-600 border border-zinc-800'}`}>
                                                E{String(ep.episodeNumber).padStart(2, '0')}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className={`text-sm sm:text-base font-bold truncate group-hover/btn:text-emerald-400 transition-colors ${ep.hasFile ? 'text-white' : 'text-zinc-400'}`}>
                                                        {ep.title || `Episode ${ep.episodeNumber}`}
                                                    </h4>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-zinc-400 font-semibold">
                                                    <span>{ep.airDate || ep.airDateUtc?.split('T')[0] || 'Air Date TBA'}</span>
                                                    {ep.hasFile ? (
                                                        <>
                                                            <span className="text-zinc-600">•</span>
                                                            <span className="text-emerald-400 font-black flex items-center gap-1">
                                                                <CheckCircle2 size={12} className="text-emerald-400" />
                                                                Downloaded {ep.episodeFile?.size ? `(${formatBytes(ep.episodeFile.size)})` : ''}
                                                            </span>
                                                            {fileQuality && (
                                                                <>
                                                                    <span className="text-zinc-600">•</span>
                                                                    <span className="text-zinc-300 font-bold bg-white/5 px-2 py-0.5 rounded-lg border border-white/10 text-[10px]">
                                                                        {fileQuality}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-zinc-600">•</span>
                                                            <span className="text-amber-500 font-bold">Missing</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="p-1 rounded-xl bg-zinc-900/60 text-zinc-400 group-hover/btn:text-white shrink-0 ml-1">
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        </button>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {ep.hasFile && (
                                                <button
                                                    onClick={() => {
                                                        const query = encodeURIComponent(ep.title || `${seriesTitle || ''} S${ep.seasonNumber}E${ep.episodeNumber}`);
                                                        window.location.href = `/theater?tab=show&search=${query}&autoplay=true`;
                                                    }}
                                                    title="Play Episode in Theater"
                                                    className="p-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 transition-all active:scale-95 touch-target flex items-center gap-1"
                                                >
                                                    <Play size={14} className="fill-current" />
                                                </button>
                                            )}

                                            <button
                                                onClick={() => onInteractiveSearch?.({
                                                    type: 'episode',
                                                    id: ep.id,
                                                    instanceId,
                                                    title: `${seriesTitle || 'Series'} - S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`
                                                })}
                                                title="Interactive Search"
                                                className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-all active:scale-95 touch-target"
                                            >
                                                <Search size={14} />
                                            </button>

                                            <button
                                                onClick={() => onQuickSearch?.({ type: 'episode', id: ep.id, instanceId })}
                                                title="Automatic Quick Search"
                                                className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 border border-zinc-800 transition-all active:scale-95 touch-target"
                                            >
                                                <PlayCircle size={14} />
                                            </button>

                                            {ep.hasFile && ep.episodeFileId && (
                                                isConfirmingThis ? (
                                                    <button
                                                        disabled={isDeletingThis}
                                                        onClick={() => handleDeleteEpisodeFile(ep.episodeFileId, ep.title, ep.id)}
                                                        className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-500 transition-all active:scale-95 shadow-md"
                                                    >
                                                        {isDeletingThis ? '...' : 'Confirm Del'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDeleteId(ep.id)}
                                                        title="Delete Episode File"
                                                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all active:scale-95 touch-target"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </div>

                                    {/* Expandable Synopsis & Codec Details */}
                                    {isExpanded && (
                                        <div className="px-4 pb-4 pt-2 border-t border-zinc-900 bg-zinc-950/90 space-y-3.5 animate-in fade-in duration-200">
                                            {/* Episode Synopsis */}
                                            <div className="space-y-1.5">
                                                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                                                    <FileText size={13} className="text-emerald-400" /> Episode Synopsis
                                                </span>
                                                <p className="text-sm sm:text-base text-zinc-300 font-medium leading-relaxed bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/80">
                                                    {ep.overview || 'No synopsis available for this episode.'}
                                                </p>
                                            </div>

                                            {/* File & Codec Details */}
                                            {ep.hasFile && ep.episodeFile && (
                                                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/90 space-y-2.5">
                                                    <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                                                        <HardDrive size={13} /> Physical Media & Codec Specifications
                                                    </span>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm font-semibold">
                                                        {ep.episodeFile.path && (
                                                            <div className="sm:col-span-2 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 flex items-start gap-2">
                                                                <Folder size={14} className="text-zinc-500 mt-0.5 shrink-0" />
                                                                <span className="text-zinc-300 break-all font-mono text-xs">{ep.episodeFile.path}</span>
                                                            </div>
                                                        )}

                                                        <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                                                            <span className="text-zinc-500 font-bold flex items-center gap-1"><HardDrive size={13} /> File Size:</span>
                                                            <span className="text-emerald-400 font-black">{formatBytes(ep.episodeFile.size)}</span>
                                                        </div>

                                                        {videoDetails && (
                                                            <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                                                                <span className="text-zinc-500 font-bold flex items-center gap-1"><Video size={13} /> Video Codec:</span>
                                                                <span className="text-zinc-200 font-bold truncate">{videoDetails}</span>
                                                            </div>
                                                        )}

                                                        {audioDetails && (
                                                            <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                                                                <span className="text-zinc-500 font-bold flex items-center gap-1"><Volume2 size={13} /> Audio Track:</span>
                                                                <span className="text-zinc-200 font-bold truncate">{audioDetails}</span>
                                                            </div>
                                                        )}

                                                        {mediaInfo?.subtitles && (
                                                            <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                                                                <span className="text-zinc-500 font-bold flex items-center gap-1"><Subtitles size={13} /> Subtitles:</span>
                                                                <span className="text-zinc-300 font-bold truncate">{mediaInfo.subtitles}</span>
                                                            </div>
                                                        )}

                                                        {ep.episodeFile.dateAdded && (
                                                            <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                                                                <span className="text-zinc-500 font-bold flex items-center gap-1"><Calendar size={13} /> Date Added:</span>
                                                                <span className="text-zinc-300 font-bold">{new Date(ep.episodeFile.dateAdded).toLocaleDateString()}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────
// Error Boundary
// ──────────────────────────────────────────────
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-8 bg-black/95 text-white font-mono text-sm overflow-auto">
                    <h1 className="text-red-500 font-bold mb-4 flex items-center gap-2">
                        <AlertCircle size={20} /> Media Details Error
                    </h1>
                    <pre className="text-zinc-400 whitespace-pre-wrap max-w-4xl bg-zinc-900 p-6 rounded-2xl border border-red-500/30">
                        {this.state.error?.stack || this.state.error?.message}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// ──────────────────────────────────────────────
// Main Media Details Inner
// ──────────────────────────────────────────────
function MediaDetailsPanelInner({
    item,
    tmdbApiKey,
    libStatus,
    onClose,
    onSelectRecommended,
    onSelectPerson,
    onAdd,
    onDelete,
    onTransfer,
    onInteractiveSearch,
    onQuickSearch,
    watchHistory: propWatchHistory
}: MediaDetailsPanelProps) {
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [credits, setCredits] = useState<any[]>([]);
    const [directors, setDirectors] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [localWatchHistory, setLocalWatchHistory] = useState<any[]>([]);

    // Streaming Availability & Web Stream Resolver States
    const [providersData, setProvidersData] = useState<{
        shortlist: string[];
        sortedCountries: string[];
        providers: Record<string, any>;
    } | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<string>('PT');
    const [streamData, setStreamData] = useState<{
        available: boolean;
        sources: Array<{ name: string; url: string; type: string; quality: string }>;
        imdbId?: string;
        tmdbId?: string;
    } | null>(null);
    const [isWatchingWebStream, setIsWatchingWebStream] = useState(false);
    const [activeStreamSourceIdx, setActiveStreamSourceIdx] = useState(0);
    const [streamSeason, setStreamSeason] = useState(1);
    const [streamEpisode, setStreamEpisode] = useState(1);
    const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);

    const isSeries = item.type === 'series' || item.mediaType === 'series' || !!item.tvdbId || !!item.seasons;
    // tmdbId is only valid if explicitly tagged as tmdbId or if item came from TMDB
    const tmdbId = item.tmdbId || (item.isTmdb ? item.id : null);

    // Fetch Rich TMDB Details with guaranteed fallback to avoid freezing
    useEffect(() => {
        let isCancelled = false;

        const performSearch = async () => {
            if (!tmdbApiKey) {
                setLoading(false);
                return;
            }

            try {
                // Strategy 1: Direct TMDB ID
                if (tmdbId && Number(tmdbId) > 0) {
                    await fetchFullDetails(Number(tmdbId));
                    return;
                }

                // Strategy 2: TVDB ID Lookup for Series
                if (item.tvdbId && Number(item.tvdbId) > 0) {
                    try {
                        const findRes = await fetch(`https://api.themoviedb.org/3/find/${item.tvdbId}?api_key=${tmdbApiKey}&external_source=tvdb_id`);
                        if (findRes.ok) {
                            const findData = await findRes.json();
                            const tvResult = findData.tv_results?.[0] || findData.movie_results?.[0];
                            if (tvResult?.id) {
                                await fetchFullDetails(tvResult.id);
                                return;
                            }
                        }
                    } catch (err) {
                        console.warn('TMDB find by tvdbId error:', err);
                    }
                }

                // Strategy 3: Clean Title & Year Search
                const titleToSearch = String(item.title || item.name || '').replace(/\s+S\d{2}E\d{2}.*/i, '').trim();
                if (titleToSearch) {
                    const searchType = isSeries ? 'tv' : 'movie';
                    const year = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : null);
                    let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbApiKey}&query=${encodeURIComponent(titleToSearch)}`;
                    if (year) {
                        url += `&${searchType === 'tv' ? 'first_air_date_year' : 'year'}=${year}`;
                    }

                    const searchRes = await fetch(url);
                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        if (searchData.results && searchData.results.length > 0) {
                            await fetchFullDetails(searchData.results[0].id);
                            return;
                        }
                    }

                    // Fallback search without year filter
                    if (year) {
                        const fallbackRes = await fetch(`https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbApiKey}&query=${encodeURIComponent(titleToSearch)}`);
                        if (fallbackRes.ok) {
                            const fbData = await fallbackRes.json();
                            if (fbData.results && fbData.results.length > 0) {
                                await fetchFullDetails(fbData.results[0].id);
                                return;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error during media details resolution:', error);
            } finally {
                if (!isCancelled) setLoading(false);
            }
        };

        const fetchFullDetails = async (id: number) => {
            try {
                const type = isSeries ? 'tv' : 'movie';
                const [detailsRes, creditsRes, recRes] = await Promise.all([
                    fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbApiKey}&append_to_response=videos,images,external_ids`).catch(() => null),
                    fetch(`https://api.themoviedb.org/3/${type}/${id}/credits?api_key=${tmdbApiKey}`).catch(() => null),
                    fetch(`https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${tmdbApiKey}`).catch(() => null)
                ]);

                if (detailsRes && detailsRes.ok) setDetails(await detailsRes.json());
                if (creditsRes && creditsRes.ok) {
                    const cData = await creditsRes.json();
                    setCredits(cData.cast?.slice(0, 10) || []);
                    setDirectors(cData.crew?.filter((p: any) => p.job === 'Director') || []);
                }
                if (recRes && recRes.ok) {
                    const rData = await recRes.json();
                    setRecommendations(rData.results?.slice(0, 6) || []);
                }
            } catch (error) {
                console.error('Error fetching TMDB full details:', error);
            } finally {
                if (!isCancelled) setLoading(false);
            }
        };

        performSearch();

        return () => {
            isCancelled = true;
        };
    }, [tmdbId, tmdbApiKey, isSeries, item.title, item.name, item.tvdbId, item.year]);

    // Fetch Streaming Watch Providers & Web Stream Resolver (IMDb / TMDB)
    useEffect(() => {
        const resolvedTmdb = details?.id || tmdbId || item.tmdbId;
        const resolvedImdb = details?.external_ids?.imdb_id || details?.imdb_id || item.imdbId || (item.id && String(item.id).startsWith('tt') ? item.id : null);
        const type = isSeries ? 'tv' : 'movie';

        if (resolvedTmdb || resolvedImdb || item.title || item.name) {
            const params = new URLSearchParams();
            if (resolvedTmdb) params.set('tmdbId', String(resolvedTmdb));
            if (resolvedImdb) params.set('imdbId', String(resolvedImdb));
            params.set('type', type);
            if (isSeries) {
                params.set('season', String(streamSeason));
                params.set('episode', String(streamEpisode));
            }

            fetch(`/api/media/providers?${params.toString()}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data && data.providers) {
                        setProvidersData(data);
                        if (data.sortedCountries && data.sortedCountries.length > 0) {
                            setSelectedCountry(data.sortedCountries[0]);
                        }
                    }
                })
                .catch(() => {});

            fetch(`/api/media/stream-resolver?${params.toString()}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data && data.sources) {
                        setStreamData(data);
                    }
                })
                .catch(() => {});
        }
    }, [details, tmdbId, item.tmdbId, item.imdbId, item.id, item.title, item.name, isSeries, streamSeason, streamEpisode]);

    // Fetch Quality Profiles for the instance
    useEffect(() => {
        const instanceId = libStatus?.instances?.[0]?.id || item.instanceId;
        if (instanceId) {
            fetch(`/api/instances/profiles?instanceId=${instanceId}`)
                .then(r => r.ok ? r.json() : [])
                .then(data => setAvailableProfiles(Array.isArray(data) ? data : []))
                .catch(() => {});
        }
    }, [libStatus, item.instanceId]);

    // Auto-fetch Play History from Plex if not provided
    useEffect(() => {
        if (propWatchHistory && propWatchHistory.length > 0) return;

        const title = (item.title || item.name || details?.name || details?.title || '').toLowerCase().trim();
        if (!title) return;

        fetch('/api/plex/history?limit=300')
            .then(r => r.ok ? r.json() : { history: [] })
            .then(d => {
                const historyList: any[] = d.history || [];
                const matched = historyList.filter(h => {
                    const hTitle = (h.title || '').toLowerCase();
                    const hSeries = (h.seriesTitle || '').toLowerCase();
                    return hTitle.includes(title) || hSeries.includes(title) || title.includes(hTitle) || (hSeries && title.includes(hSeries));
                });
                setLocalWatchHistory(matched.slice(0, 15));
            })
            .catch(() => {});
    }, [item.title, item.name, details?.name, details?.title, propWatchHistory]);

    const handleUpdateProfile = async (profileId: number) => {
        const internalId = libStatus?.instances?.[0]?.internalId || item.id;
        const instanceId = libStatus?.instances?.[0]?.id || item.instanceId;

        if (!internalId || !instanceId) {
            toast.error('Missing instance reference. Cannot update profile.');
            return;
        }

        setIsUpdatingProfile(true);
        try {
            const res = await fetch('/api/media/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId,
                    type: isSeries ? 'series' : 'movie',
                    mediaId: internalId,
                    profileId
                })
            });
            if (res.ok) {
                toast.success('Quality profile updated');
            } else {
                toast.error('Failed to update quality profile');
            }
        } catch {
            toast.error('Error updating quality profile');
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    if (!item) return null;

    // Poster & Backdrop URLs
    const backdrop = details?.backdrop_path ? `/api/proxy?url=${encodeURIComponent(`https://image.tmdb.org/t/p/original${details.backdrop_path}`)}` : null;
    const rawPoster = item.remotePoster || item.poster || (details?.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null);
    const poster = rawPoster ? (rawPoster.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(rawPoster)}` : rawPoster) : null;

    // Resolved identifiers
    const resolvedInternalId = libStatus?.instances?.[0]?.internalId || item.id;
    const resolvedInstanceId = libStatus?.instances?.[0]?.id || item.instanceId;
    const resolvedInstanceName = libStatus?.instances?.[0]?.name || item.instanceName || 'Arr Instance';

    // Robust rating resolution
    const resolvedRating = details?.vote_average
        || item.ratings?.value
        || item.ratings?.imdb?.value
        || item.ratings?.tmdb?.value
        || item.vote_average
        || (typeof item.ratings === 'number' ? item.ratings : null);

    // Robust release date resolution
    const rawReleaseDate = details?.release_date
        || details?.first_air_date
        || item.releaseDate
        || item.inCinemas
        || item.physicalRelease
        || item.firstAired
        || item.year;
    const formattedReleaseYear = rawReleaseDate ? String(rawReleaseDate).split('-')[0] : 'N/A';

    // Size on disk
    const diskSizeBytes = libStatus?.sizeOnDisk || item.statistics?.sizeOnDisk || item.sizeOnDisk || item.movieFile?.size || 0;

    const displayWatchHistory = propWatchHistory && propWatchHistory.length > 0 ? propWatchHistory : localWatchHistory;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 lg:p-10 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300">
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[130] p-3.5 rounded-full bg-zinc-900/90 text-white hover:bg-zinc-800 transition-all border border-white/10 shadow-2xl active:scale-95"
                aria-label="Close Media Modal"
            >
                <X size={22} />
            </button>

            <div className="relative w-full h-full max-w-7xl bg-[#080808] rounded-[2.5rem] sm:rounded-[3rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col lg:flex-row animate-in zoom-in-95 duration-300">
                {/* Backdrop background for mobile */}
                {backdrop && (
                    <div className="absolute inset-0 opacity-20 pointer-events-none lg:hidden">
                        <img src={backdrop} className="w-full h-full object-cover blur-2xl" alt="" />
                    </div>
                )}

                {/* ── Left Column: Poster & Library Status & Metadata ── */}
                <div className="w-full lg:w-[420px] xl:w-[460px] p-6 sm:p-8 lg:p-10 flex flex-col gap-6 relative z-10 border-r border-white/5 overflow-y-auto custom-scrollbar">
                    {/* Poster */}
                    <div className="aspect-[2/3] w-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 group relative flex-shrink-0 bg-zinc-900">
                        {poster ? (
                            <img src={poster} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={item.title || item.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-800">
                                {isSeries ? <Tv size={64} /> : <Film size={64} />}
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </div>

                    {/* Library Controls Card */}
                    <div className="p-5 sm:p-6 rounded-[2rem] bg-zinc-950 border border-white/5 space-y-4 shadow-inner">
                        {libStatus?.exists ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Library Status</span>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2.5 h-2.5 rounded-full ${libStatus.hasFile ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : libStatus.isDownloading ? 'bg-amber-400 animate-pulse' : 'bg-blue-400'}`} />
                                            <span className={`text-sm sm:text-base font-black uppercase tracking-wider ${libStatus.hasFile ? 'text-emerald-400' : libStatus.isDownloading ? 'text-amber-400' : 'text-blue-400'}`}>
                                                {libStatus.hasFile ? 'Available on Disk' : libStatus.isDownloading ? 'Downloading...' : 'In Library'}
                                            </span>
                                        </div>
                                    </div>
                                    <CheckCircle size={22} className="text-emerald-400" />
                                </div>

                                {/* Instances Badges */}
                                <div className="pt-2 space-y-2 border-t border-white/5">
                                    <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Instances</span>
                                    <div className="flex flex-wrap gap-2">
                                        {(libStatus.instances && libStatus.instances.length > 0 ? libStatus.instances : [{ id: resolvedInstanceId, name: resolvedInstanceName }]).map((inst: any) => {
                                            const hex = inst.colorHex || '#10b981';
                                            return (
                                                <div
                                                    key={inst.id}
                                                    className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border"
                                                    style={{ backgroundColor: `${hex}15`, borderColor: `${hex}40`, color: hex }}
                                                >
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hex }} />
                                                    <span>{inst.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Quality Profile Select */}
                                {availableProfiles.length > 0 && (
                                    <div className="pt-2 space-y-2 border-t border-white/5">
                                        <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Quality Profile</span>
                                        <div className="relative">
                                            <select
                                                disabled={isUpdatingProfile}
                                                defaultValue={libStatus.qualityProfileId || item.qualityProfileId}
                                                onChange={(e) => handleUpdateProfile(parseInt(e.target.value))}
                                                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold text-zinc-200 appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/50 transition-all disabled:opacity-50"
                                            >
                                                {availableProfiles.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                                                <ChevronDown size={16} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="pt-3 grid grid-cols-2 gap-2 border-t border-white/5">
                                    <button
                                        onClick={() => onInteractiveSearch?.({
                                            type: isSeries ? 'series' : 'movie',
                                            id: resolvedInternalId,
                                            instanceId: resolvedInstanceId,
                                            title: item.title || details?.name,
                                            poster: rawPoster
                                        })}
                                        className="h-11 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider touch-target"
                                        title="Search Releases"
                                    >
                                        <Search size={14} /> Search
                                    </button>

                                    <button
                                        onClick={() => onQuickSearch?.({
                                            type: isSeries ? 'series' : 'movie',
                                            id: resolvedInternalId,
                                            instanceId: resolvedInstanceId
                                        })}
                                        className="h-11 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 hover:text-emerald-400 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider touch-target"
                                        title="Auto Quick Search"
                                    >
                                        <PlayCircle size={14} /> Auto Search
                                    </button>

                                    <button
                                        onClick={() => onTransfer?.({
                                            ...item,
                                            id: resolvedInternalId,
                                            instanceId: resolvedInstanceId,
                                            instanceName: resolvedInstanceName,
                                            qualityProfileId: libStatus.qualityProfileId || item.qualityProfileId,
                                            title: item.title || details?.name || item.name
                                        })}
                                        className="h-11 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider touch-target"
                                        title="Transfer or Copy to another instance"
                                    >
                                        <MoveHorizontal size={14} /> Transfer
                                    </button>

                                    <button
                                        onClick={() => onDelete?.({
                                            ...item,
                                            id: resolvedInternalId,
                                            instanceId: resolvedInstanceId,
                                            title: item.title || details?.name || item.name
                                        })}
                                        className="h-11 px-3 rounded-xl bg-red-500/10 hover:bg-red-500 border border-red-500/20 text-red-400 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider touch-target"
                                        title="Delete from Library"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Library</span>
                                    <p className="text-xs sm:text-sm text-zinc-400 font-medium">Not currently in your Arr instances.</p>
                                </div>
                                <button
                                    onClick={onAdd}
                                    className="w-full h-12 flex items-center justify-center gap-2.5 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-emerald-400 transition-all shadow-xl active:scale-95"
                                >
                                    <Plus size={18} /> Add to Library
                                </button>
                            </div>
                        )}

                        {/* Web Stream & IMDb Player Action Card */}
                        <div className="pt-3 border-t border-white/5 space-y-2">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Web Stream &amp; Playback</span>
                            {streamData?.available && streamData.sources.length > 0 ? (
                                <button
                                    onClick={() => setIsWatchingWebStream(true)}
                                    className="w-full h-12 flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black uppercase text-xs sm:text-sm tracking-wider transition-all shadow-xl shadow-amber-500/20 active:scale-95"
                                >
                                    <Clapperboard size={18} /> Watch Web Stream (IMDb / Multi-Server)
                                </button>
                            ) : (
                                <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 text-center">
                                    <p className="text-xs text-zinc-500 font-medium">No direct web stream available for this title</p>
                                </div>
                            )}
                        </div>

                        {/* Streaming Availability by Region (Netflix, HBO, Disney, Prime, etc.) */}
                        {providersData && Object.keys(providersData.providers).length > 0 && (
                            <div className="pt-3 border-t border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Globe size={14} className="text-amber-400" /> Streaming Availability
                                    </span>
                                    {providersData.shortlist && (
                                        <span className="text-[10px] text-zinc-500 font-bold">Shortlist Top</span>
                                    )}
                                </div>

                                {/* Country Selector Pills (Shortlist Prioritized on Top) */}
                                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                                    {providersData.sortedCountries.map(cc => {
                                        const isSelected = selectedCountry === cc;
                                        const isShortlisted = providersData.shortlist.includes(cc);
                                        const countryFlags: Record<string, string> = {
                                            PT: '🇵🇹', ES: '🇪🇸', FR: '🇫🇷', US: '🇺🇸', GB: '🇬🇧',
                                            DE: '🇩🇪', IT: '🇮🇹', BR: '🇧🇷', CA: '🇨🇦', AU: '🇦🇺',
                                            NL: '🇳🇱', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', FI: '🇫🇮',
                                            IE: '🇮🇪', CH: '🇨🇭', AT: '🇦🇹', BE: '🇧🇪', PL: '🇵🇱',
                                            JP: '🇯🇵', KR: '🇰🇷', MX: '🇲🇽', AR: '🇦🇷'
                                        };
                                        const flag = countryFlags[cc] || '🌐';

                                        return (
                                            <button
                                                key={cc}
                                                onClick={() => setSelectedCountry(cc)}
                                                className={`px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1 border ${
                                                    isSelected
                                                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm'
                                                        : isShortlisted
                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
                                                            : 'bg-zinc-950 border-zinc-900 text-zinc-600 hover:text-zinc-400'
                                                }`}
                                            >
                                                <span>{flag}</span>
                                                <span>{cc}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Active Country Providers Display */}
                                {(() => {
                                    const current = providersData.providers[selectedCountry];
                                    if (!current) return <p className="text-xs text-zinc-600 italic">No provider info for {selectedCountry}</p>;

                                    const flatrate = current.flatrate || [];
                                    const rent = current.rent || [];
                                    const buy = current.buy || [];

                                    return (
                                        <div className="space-y-2 bg-zinc-900/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                                            {flatrate.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">
                                                        Included with Subscription ({selectedCountry}):
                                                    </span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {flatrate.map((p: any) => (
                                                            <div key={p.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 rounded-xl border border-zinc-800 shadow-sm" title={p.name}>
                                                                {p.logoUrl ? (
                                                                    <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded-md object-cover" />
                                                                ) : null}
                                                                <span className="text-xs font-bold text-white">{p.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-zinc-500 font-medium">
                                                    Not currently included on subscription services in {selectedCountry}.
                                                </p>
                                            )}

                                            {(rent.length > 0 || buy.length > 0) && (
                                                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400">
                                                    <span>Available to Rent / Buy:</span>
                                                    <span className="text-zinc-300 font-bold truncate max-w-[180px]">
                                                        {[...rent, ...buy].map((p: any) => p.name).slice(0, 3).join(', ')}
                                                    </span>
                                                </div>
                                            )}

                                            {current.link && (
                                                <a
                                                    href={current.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="pt-1.5 flex items-center justify-end gap-1 text-[11px] text-amber-400/80 hover:text-amber-300 font-bold transition-colors"
                                                >
                                                    <span>View details on JustWatch</span>
                                                    <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* Metadata Summary Tiles (Release, Rating, Size) */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                            <span className="block text-[11px] font-black text-zinc-500 uppercase tracking-widest">Release Year</span>
                            <span className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                                <Calendar size={15} className="text-zinc-500" />
                                {formattedReleaseYear}
                            </span>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                            <span className="block text-[11px] font-black text-zinc-500 uppercase tracking-widest">Rating</span>
                            <div className="flex items-center gap-1.5 font-bold text-amber-400 text-sm sm:text-base">
                                <Star size={15} fill="currentColor" />
                                <span>{resolvedRating ? Number(resolvedRating).toFixed(1) : 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Size on Disk Card */}
                    {libStatus?.exists && (
                        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 space-y-1">
                            <span className="block text-[11px] font-black text-zinc-500 uppercase tracking-widest">Total Size on Disk</span>
                            <span className="text-sm sm:text-base font-black text-emerald-400 flex items-center gap-2">
                                <HardDrive size={16} />
                                {formatBytes(diskSizeBytes)}
                            </span>
                        </div>
                    )}

                    {/* Genres */}
                    {((details?.genres && details.genres.length > 0) || (item.genres && item.genres.length > 0)) && (
                        <div className="space-y-2">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Genres</span>
                            <div className="flex flex-wrap gap-2">
                                {(details?.genres || (item.genres || []).map((g: any) => typeof g === 'string' ? { name: g } : g)).map((g: any, idx: number) => (
                                    <span key={g.id || idx} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-wider text-zinc-300">
                                        {g.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Studios & Networks */}
                    {((details?.networks && details.networks.length > 0) || (details?.production_companies && details.production_companies.length > 0) || (item.productionCompanies && item.productionCompanies.length > 0) || item.network || item.studio) && (
                        <div className="space-y-2">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Studios & Networks</span>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    ...(details?.networks || []),
                                    ...(details?.production_companies || []),
                                    ...(Array.isArray(item.productionCompanies) ? item.productionCompanies : []).map((name: string) => ({ name })),
                                    ...(item.network ? [{ name: item.network }] : []),
                                    ...(item.studio ? [{ name: item.studio }] : [])
                                ]
                                .filter((c: any, index: number, self: any[]) => c?.name && self.findIndex((x: any) => x.name?.toLowerCase() === c.name?.toLowerCase()) === index)
                                .map((c: any, idx: number) => (
                                    <span key={c.id || idx} className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 flex items-center gap-2">
                                        {c.logo_path && (
                                            <img src={`https://image.tmdb.org/t/p/w92${c.logo_path}`} className="h-4 object-contain brightness-200" alt="" />
                                        )}
                                        {c.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Directors */}
                    {directors.length > 0 && (
                        <div className="p-5 rounded-2xl bg-zinc-950 border border-white/5 space-y-2 shadow-inner">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Director</span>
                            <div className="flex flex-wrap gap-2">
                                {directors.map((d: any) => (
                                    <button
                                        key={d.id}
                                        onClick={() => onSelectPerson?.(d.id)}
                                        className="px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm font-bold text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all flex items-center gap-2"
                                    >
                                        <User size={14} />
                                        {d.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right Column: Overview, Movie File breakdown, Episodes, Cast & History ── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {/* Desktop Backdrop Header */}
                    {backdrop && (
                        <div className="absolute top-0 right-0 left-0 h-[360px] z-0 hidden lg:block pointer-events-none">
                            <img src={backdrop} className="w-full h-full object-cover opacity-25 mask-gradient-b" alt="" />
                            <div className="absolute inset-0 bg-gradient-to-b from-[#080808]/0 via-[#080808]/50 to-[#080808]" />
                        </div>
                    )}

                    <div className="p-6 sm:p-10 lg:p-14 relative z-10 space-y-10">
                        {/* Title & Tagline */}
                        <header className="space-y-3">
                            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
                                {item.title || details?.name || item.name}
                            </h2>
                            {details?.tagline && (
                                <p className="text-base sm:text-xl font-bold text-emerald-400 italic opacity-85">
                                    "{details.tagline}"
                                </p>
                            )}
                        </header>

                        {/* Overview Synopsis */}
                        <div className="space-y-3 max-w-4xl">
                            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                <FileText size={14} className="text-emerald-400" /> Storyline Overview
                            </h3>
                            <p className="text-zinc-200 text-base sm:text-lg leading-relaxed font-medium transition-all bg-zinc-950/40 p-4 sm:p-6 rounded-3xl border border-zinc-900/90 shadow-sm">
                                {details?.overview || item.overview || 'No synopsis available for this media item.'}
                            </p>
                        </div>

                        {/* Movie File & Quality Breakdown (When applicable for Movies) */}
                        {!isSeries && libStatus?.exists && (
                            <div className="space-y-4 max-w-4xl border-t border-white/5 pt-8">
                                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                    <HardDrive size={15} className="text-emerald-400" /> Movie File & Codec Specifications
                                </h3>

                                <div className="p-5 sm:p-6 rounded-3xl bg-zinc-950 border border-zinc-800/80 space-y-4 shadow-xl">
                                    {/* Path on disk */}
                                    <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-zinc-800 flex items-start gap-3">
                                        <Folder size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider block">Disk Location</span>
                                            <span className="text-xs sm:text-sm text-zinc-200 font-mono break-all">
                                                {item.path || item.movieFile?.path || item.movieFile?.relativePath || 'Path managed in library'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Codec & Details Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs sm:text-sm font-semibold">
                                        <div className="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/80 space-y-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
                                                <HardDrive size={12} /> File Size
                                            </span>
                                            <span className="text-emerald-400 font-black text-sm sm:text-base">
                                                {formatBytes(diskSizeBytes)}
                                            </span>
                                        </div>

                                        <div className="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/80 space-y-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
                                                <Layers size={12} /> Quality Profile
                                            </span>
                                            <span className="text-white font-bold truncate block">
                                                {item.movieFile?.quality?.quality?.name || item.qualityProfileId || 'Standard'}
                                            </span>
                                        </div>

                                        <div className="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/80 space-y-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
                                                <Video size={12} /> Video Specs
                                            </span>
                                            <span className="text-zinc-200 font-bold truncate block">
                                                {[item.movieFile?.mediaInfo?.videoCodec, item.movieFile?.mediaInfo?.resolution, item.movieFile?.mediaInfo?.videoDynamicRange].filter(Boolean).join(' • ') || 'N/A'}
                                            </span>
                                        </div>

                                        <div className="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/80 space-y-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
                                                <Volume2 size={12} /> Audio Track
                                            </span>
                                            <span className="text-zinc-200 font-bold truncate block">
                                                {[item.movieFile?.mediaInfo?.audioCodec, item.movieFile?.mediaInfo?.audioChannels ? `${item.movieFile.mediaInfo.audioChannels} ch` : null].filter(Boolean).join(' • ') || 'N/A'}
                                            </span>
                                        </div>

                                        <div className="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/80 space-y-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
                                                <Subtitles size={12} /> Audio / Subs
                                            </span>
                                            <span className="text-zinc-300 font-bold truncate block">
                                                {item.movieFile?.mediaInfo?.audioLanguages || item.movieFile?.mediaInfo?.subtitles || 'Standard'}
                                            </span>
                                        </div>

                                        <div className="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/80 space-y-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
                                                <Calendar size={12} /> Date Added
                                            </span>
                                            <span className="text-zinc-300 font-bold truncate block">
                                                {item.added ? new Date(item.added).toLocaleDateString() : item.movieFile?.dateAdded ? new Date(item.movieFile.dateAdded).toLocaleDateString() : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Seasons & Episodes Accordion (For Series) */}
                        {isSeries && (
                            <div className="space-y-4 border-t border-white/5 pt-8">
                                <EpisodeList
                                    instanceId={resolvedInstanceId}
                                    seriesId={resolvedInternalId}
                                    seriesTitle={item.title || details?.name || item.name}
                                    onInteractiveSearch={onInteractiveSearch}
                                    onQuickSearch={onQuickSearch}
                                />
                            </div>
                        )}

                        {/* Playback History (Plex) */}
                        {displayWatchHistory && displayWatchHistory.length > 0 && (
                            <div className="space-y-4 border-t border-white/5 pt-8">
                                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                    <Clock size={15} className="text-sky-400" /> Chronological Watch History
                                </h3>

                                <div className="space-y-3">
                                    {displayWatchHistory.map((entry, index) => (
                                        <div
                                            key={entry.id || index}
                                            className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-4 shadow-md hover:border-zinc-700 transition-colors"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 shrink-0">
                                                    {entry.user?.thumb ? (
                                                        <img src={entry.user.thumb} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <User size={16} />
                                                    )}
                                                </div>

                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white truncate">{entry.user?.name || 'Plex Viewer'}</span>
                                                        <span className="text-xs font-black text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                                                            {entry.player?.platform || entry.player?.title || 'Player'}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-zinc-400 font-semibold block mt-0.5">
                                                        {entry.mediaType === 'series' && entry.seasonNumber !== undefined
                                                            ? `Watched S${String(entry.seasonNumber).padStart(2, '0')}E${String(entry.episodeNumber || 1).padStart(2, '0')} • ${entry.title || ''}`
                                                            : `Watched Movie`}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="text-xs font-bold text-zinc-400 block">
                                                    {new Date(entry.viewedAt).toLocaleDateString()}
                                                </span>
                                                <span className="text-[11px] font-black text-zinc-500">
                                                    {new Date(entry.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Top Cast */}
                        <div className="space-y-4 border-t border-white/5 pt-8">
                            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.25em]">Top Cast</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                                {credits.length > 0 ? (
                                    credits.map((person: any) => (
                                        <div
                                            key={person.id}
                                            className="group cursor-pointer p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-900 hover:border-emerald-500/40 transition-all"
                                            onClick={() => onSelectPerson?.(person.id)}
                                        >
                                            <div className="aspect-square rounded-xl overflow-hidden bg-zinc-900 mb-2 border border-white/5 group-hover:scale-105 transition-transform duration-300">
                                                {person.profile_path ? (
                                                    <img src={`/api/proxy?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w185${person.profile_path}`)}`} className="w-full h-full object-cover" alt={person.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-800"><User size={24} /></div>
                                                )}
                                            </div>
                                            <p className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-400 transition-colors truncate">{person.name}</p>
                                            <p className="text-xs text-zinc-400 font-medium truncate">{person.character}</p>
                                        </div>
                                    ))
                                ) : loading ? (
                                    Array(5).fill(0).map((_, i) => <div key={i} className="aspect-square bg-zinc-900/50 rounded-2xl animate-pulse" />)
                                ) : (
                                    <p className="text-zinc-500 text-sm">No cast information available.</p>
                                )}
                            </div>
                        </div>

                        {/* Recommendations */}
                        {recommendations.length > 0 && (
                            <div className="space-y-4 border-t border-white/5 pt-8">
                                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.25em]">Recommended & Similar</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                    {recommendations.map((media: any) => (
                                        <div
                                            key={media.id}
                                            onClick={() => onSelectRecommended?.({
                                                ...media,
                                                id: media.id,
                                                title: media.title || media.name,
                                                type: media.media_type === 'tv' ? 'series' : 'movie',
                                                isTmdb: true,
                                                tmdbId: media.id
                                            })}
                                            className="group flex gap-3.5 p-3 rounded-2xl bg-zinc-950/60 border border-zinc-900 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all cursor-pointer shadow-sm"
                                        >
                                            <div className="w-14 aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 bg-zinc-900">
                                                {media.poster_path && <img src={`/api/proxy?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w185${media.poster_path}`)}`} className="w-full h-full object-cover" alt="" />}
                                            </div>
                                            <div className="min-w-0 flex flex-col justify-center gap-1">
                                                <p className="text-xs sm:text-sm font-bold text-zinc-200 group-hover:text-white truncate transition-colors">{media.title || media.name}</p>
                                                <p className="text-xs text-zinc-500 font-bold">{media.release_date?.split('-')[0] || media.first_air_date?.split('-')[0]}</p>
                                                <span className="text-xs text-amber-400 font-black flex items-center gap-1">★ {media.vote_average ? Number(media.vote_average).toFixed(1) : ''}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Embedded Web Stream Player Modal ── */}
                {isWatchingWebStream && streamData?.sources && streamData.sources.length > 0 && (
                    <div className="fixed inset-0 z-[150] flex flex-col bg-black/95 backdrop-blur-3xl p-3 sm:p-6 animate-in fade-in duration-200">
                        {/* Player Header Bar */}
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    <Clapperboard size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base sm:text-lg font-black text-white truncate">
                                        {item.title || item.name || details?.title || details?.name}
                                    </h3>
                                    <p className="text-xs text-zinc-400">
                                        {isSeries ? `Season ${streamSeason} Episode ${streamEpisode}` : 'Full Movie'} • Web Stream Player
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Server Switcher Desktop */}
                                <div className="hidden sm:flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                                    {streamData.sources.map((src, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setActiveStreamSourceIdx(idx)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                activeStreamSourceIdx === idx
                                                    ? 'bg-amber-500 text-black shadow-md'
                                                    : 'text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            {src.name}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setIsWatchingWebStream(false)}
                                    className="p-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-all shadow-md active:scale-95"
                                    aria-label="Close Stream Player"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Server Switcher Mobile Bar */}
                        <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto py-2 border-b border-zinc-800/60 custom-scrollbar">
                            {streamData.sources.map((src, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveStreamSourceIdx(idx)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all ${
                                        activeStreamSourceIdx === idx
                                            ? 'bg-amber-500 text-black shadow-md'
                                            : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                                    }`}
                                >
                                    {src.name}
                                </button>
                            ))}
                        </div>

                        {/* TV Series Episode & Season Quick Selector */}
                        {isSeries && (
                            <div className="flex items-center gap-3 py-2 text-xs font-bold text-zinc-400">
                                <span className="text-zinc-500 uppercase tracking-wider">Episode:</span>
                                <div className="flex items-center gap-2">
                                    <label className="text-zinc-400">S</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={streamSeason}
                                        onChange={e => setStreamSeason(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-14 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-white text-center"
                                    />
                                    <label className="text-zinc-400">E</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={streamEpisode}
                                        onChange={e => setStreamEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-14 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-white text-center"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Embedded Iframe Player with sandboxed popups */}
                        <div className="flex-1 w-full bg-black rounded-2xl overflow-hidden mt-3 border border-zinc-800/80 relative shadow-2xl">
                            <iframe
                                src={streamData.sources[activeStreamSourceIdx]?.url || streamData.sources[0]?.url}
                                className="w-full h-full border-0"
                                allowFullScreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-fullscreen"
                            />
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .mask-gradient-b {
                    mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
                    -webkit-mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.15);
                }
            `}</style>
        </div>
    );
}

export function MediaDetailsPanel(props: MediaDetailsPanelProps) {
    return (
        <ErrorBoundary>
            <MediaDetailsPanelInner {...props} />
        </ErrorBoundary>
    );
}


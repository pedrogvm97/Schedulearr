'use client';

import React, { useState, useEffect } from 'react';
import { X, Star, Calendar, User, Film, CheckCircle, Plus, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface MediaDetailsPanelProps {
    item: any;
    tmdbApiKey?: string;
    libStatus?: { exists: boolean; hasFile: boolean; isDownloading: boolean; sizeOnDisk: number; percentage: number; instances: { id: string; name: string; internalId?: number }[] };
    onClose: () => void;
    onSelectRecommended?: (media: any) => void;
    onSelectPerson?: (personId: number) => void;
    onAdd?: () => void;
}

export function MediaDetailsPanel({ item, tmdbApiKey, libStatus, onClose, onSelectRecommended, onSelectPerson, onAdd }: MediaDetailsPanelProps) {
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [credits, setCredits] = useState<any[]>([]);
    const [directors, setDirectors] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

    const isSeries = item.type === 'series' || (item.tvdbId && !item.tmdbId) || !!item.seasons;
    const tmdbId = item.tmdbId || (item.type === 'movie' ? item.id : !isSeries ? item.id : null);

    useEffect(() => {
        if (!tmdbApiKey) return;

        // If we have a title but no ID, we need to search first
        const performSearch = async () => {
            if (!item.tmdbId && !item.tvdbId && item.title) {
                setLoading(true);
                try {
                    const searchType = isSeries ? 'tv' : 'movie';
                    const searchRes = await fetch(`https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbApiKey}&query=${encodeURIComponent(item.title)}`);
                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        if (searchData.results && searchData.results.length > 0) {
                            // Take the first match
                            const match = searchData.results[0];
                            fetchFullDetails(match.id);
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Error searching TMDB by title:', error);
                }
                setLoading(false);
            } else if (tmdbId) {
                fetchFullDetails(tmdbId);
            } else {
                setLoading(false);
            }
        };

        const fetchFullDetails = async (id: number) => {
            // Deep reset
            setDetails(null);
            setCredits([]);
            setDirectors([]);
            setRecommendations([]);
            setLoading(true);

            try {
                const type = isSeries ? 'tv' : 'movie';
                const [detailsRes, creditsRes, recRes] = await Promise.all([
                    fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbApiKey}&append_to_response=videos,images`),
                    fetch(`https://api.themoviedb.org/3/${type}/${id}/credits?api_key=${tmdbApiKey}`),
                    fetch(`https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${tmdbApiKey}`)
                ]);

                if (detailsRes.ok) setDetails(await detailsRes.json());
                if (creditsRes.ok) {
                    const cData = await creditsRes.json();
                    setCredits(cData.cast?.slice(0, 10) || []);
                    setDirectors(cData.crew?.filter((p: any) => p.job === 'Director') || []);
                }
                if (recRes.ok) {
                    const rData = await recRes.json();
                    setRecommendations(rData.results?.slice(0, 6) || []);
                }
            } catch (error) {
                console.error('Error fetching media details:', error);
                toast.error('Failed to load rich media details');
            } finally {
                setLoading(false);
            }
        };

        performSearch();
    }, [tmdbId, tmdbApiKey, isSeries, item.title, item.tmdbId, item.tvdbId]);

    useEffect(() => {
        if (libStatus?.exists && libStatus.instances.length > 0) {
            fetch(`/api/instances/profiles?instanceId=${libStatus.instances[0].id}`)
                .then(r => r.ok ? r.json() : [])
                .then(data => setAvailableProfiles(data))
                .catch(err => console.error('Error fetching profiles:', err));
        }
    }, [libStatus]);

    const handleUpdateProfile = async (profileId: number) => {
        if (!libStatus?.instances?.[0]?.internalId) {
            toast.error('Internal ID missing. Cannot update profile.');
            return;
        }
        setIsUpdatingProfile(true);
        try {
            const res = await fetch('/api/media/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: libStatus.instances[0].id,
                    type: isSeries ? 'series' : 'movie',
                    mediaId: libStatus.instances[0].internalId,
                    profileId
                })
            });
            if (res.ok) {
                toast.success('Quality profile updated');
            } else {
                toast.error('Failed to update quality profile');
            }
        } catch (e) {
            toast.error('Error updating quality profile');
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    if (!item) return null;

    const backdrop = details?.backdrop_path ? `/api/proxy?url=${encodeURIComponent(`https://image.tmdb.org/t/p/original${details.backdrop_path}`)}` : null;
    const posterUrl = item.remotePoster || (details?.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null);
    const poster = posterUrl ? (posterUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(posterUrl)}` : posterUrl) : null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-10 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-500">
            <button
                onClick={onClose}
                className="absolute top-6 right-6 z-[120] p-4 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all border border-white/10"
            >
                <X size={24} />
            </button>

            <div className="relative w-full h-full max-w-7xl bg-[#080808] rounded-[3rem] border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col lg:flex-row animate-in zoom-in-95 duration-500">
                {/* Backdrop Background (Mobile) */}
                {backdrop && (
                    <div className="absolute inset-0 opacity-20 pointer-events-none lg:hidden">
                        <img src={backdrop} className="w-full h-full object-cover blur-2xl" alt="" />
                    </div>
                )}

                {/* Left side: Poster & Quick Info */}
                <div className="w-full lg:w-[400px] xl:w-[450px] p-8 lg:p-12 flex flex-col gap-8 relative z-10 border-r border-white/5 overflow-y-auto custom-scrollbar">
                    <div className="aspect-[2/3] w-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 group relative flex-shrink-0">
                        {poster ? (
                            <img src={poster} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt={item.title} />
                        ) : (
                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">
                                <Film size={64} />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </div>

                    <div className="space-y-6">
                        {/* Library Access & Control */}
                        <div className="p-6 rounded-[2rem] bg-zinc-950 border border-white/5 space-y-4 shadow-inner">
                            {libStatus?.exists ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Status</span>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${libStatus.hasFile ? 'bg-emerald-500' : libStatus.isDownloading ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`} />
                                                <span className={`text-sm font-black uppercase tracking-wider ${libStatus.hasFile ? 'text-emerald-400' : libStatus.isDownloading ? 'text-amber-400' : 'text-blue-400'}`}>
                                                    {libStatus.hasFile ? 'Available' : libStatus.isDownloading ? 'Downloading' : 'In Library'}
                                                </span>
                                            </div>
                                        </div>
                                        <CheckCircle size={20} className="text-emerald-500" />
                                    </div>

                                    <div className="pt-2 space-y-2 border-t border-white/5">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Instances</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {libStatus.instances.map((inst: any) => (
                                                <div key={inst.id} className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[9px] font-bold text-zinc-400">
                                                    {inst.name}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {libStatus.exists && availableProfiles.length > 0 && (
                                        <div className="pt-2 space-y-2 border-t border-white/5">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Quality Profile</span>
                                            <div className="relative group/select">
                                                <select
                                                    disabled={isUpdatingProfile}
                                                    defaultValue={libStatus.qualityProfileId || item.qualityProfileId}
                                                    onChange={(e) => handleUpdateProfile(parseInt(e.target.value))}
                                                    className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-2 text-xs font-bold text-zinc-300 appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/50 transition-all disabled:opacity-50"
                                                >
                                                    {availableProfiles.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                                    <ChevronDown size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Library</span>
                                        <p className="text-xs text-zinc-600 font-medium">Not in any of your instances.</p>
                                    </div>
                                    <button
                                        onClick={onAdd}
                                        className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-white text-black font-black uppercase text-[11px] tracking-widest hover:bg-emerald-400 transition-all shadow-xl shadow-white/5 disabled:opacity-50"
                                    >
                                        <Plus size={16} /> Add to Library
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Release</span>
                                <span className="text-sm font-bold text-white">{item.year || details?.release_date?.split('-')[0] || details?.first_air_date?.split('-')[0] || 'N/A'}</span>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Rating</span>
                                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                                    <Star size={14} fill="currentColor" />
                                    <span>{details?.vote_average?.toFixed(1) || item.ratings?.value?.toFixed(1) || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {libStatus?.exists && (
                            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                                <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Size on Disk</span>
                                <span className="text-sm font-bold text-emerald-400">
                                    {(() => {
                                        const bytes = libStatus.sizeOnDisk || item.statistics?.sizeOnDisk || item.movieFile?.size || 0;
                                        if (bytes === 0) {
                                            return libStatus.hasFile ? 'Scanning...' : '0 GB';
                                        }
                                        if (bytes > 1024**4) return `${(bytes / 1024**4).toFixed(2)} TB`;
                                        if (bytes > 1024**3) return `${(bytes / 1024**3).toFixed(2)} GB`;
                                        return `${(bytes / 1024**2).toFixed(0)} MB`;
                                    })()}
                                </span>
                            </div>
                        )}

                        {details?.genres && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {details.genres.map((g: any) => (
                                    <span key={g.id} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                        {g.name}
                                    </span>
                                ))}
                            </div>
                        )}

                        {directors.length > 0 && (
                            <div className="p-6 rounded-[2rem] bg-zinc-950 border border-white/5 space-y-3 shadow-inner">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Director</span>
                                <div className="flex flex-wrap gap-2">
                                    {directors.map((d: any) => (
                                        <button
                                            key={d.id}
                                            onClick={() => onSelectPerson?.(d.id)}
                                            className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-sm font-bold text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all flex items-center gap-2"
                                        >
                                            <User size={14} />
                                            {d.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side: Summary & Details */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {/* Backdrop Header (Desktop) */}
                    {backdrop && (
                        <div className="absolute top-0 right-0 left-0 h-[400px] z-0 hidden lg:block">
                            <img src={backdrop} className="w-full h-full object-cover opacity-30 mask-gradient-b" alt="" />
                            <div className="absolute inset-0 bg-gradient-to-b from-[#080808]/0 via-[#080808]/50 to-[#080808]" />
                        </div>
                    )}

                    <div className="p-8 lg:p-16 relative z-10 space-y-12">
                        <header className="space-y-4">
                            <h2 className="text-4xl lg:text-6xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
                                {item.title || details?.name}
                            </h2>
                            {details?.tagline && (
                                <p className="text-lg lg:text-xl font-bold text-emerald-400 italic opacity-80">
                                    "{details.tagline}"
                                </p>
                            )}
                        </header>

                        <div className="space-y-4 max-w-3xl">
                            <h3 className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.3em]">Overview</h3>
                            <p className="text-zinc-300 text-lg leading-relaxed font-medium transition-all">
                                {details?.overview || item.overview || 'No overview available.'}
                            </p>
                        </div>

                        {/* Cast */}
                        <div className="space-y-6">
                            <h3 className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.3em]">Top Cast</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                {credits.length > 0 ? (
                                    credits.map((person: any) => (
                                        <div
                                            key={person.id}
                                            className="group cursor-pointer"
                                            onClick={() => onSelectPerson?.(person.id)}
                                        >
                                            <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-900 mb-3 border border-white/5 group-hover:border-emerald-500/50 transition-all">
                                                {person.profile_path ? (
                                                    <img src={`/api/proxy?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w185${person.profile_path}`)}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={person.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-800"><User size={24} /></div>
                                                )}
                                            </div>
                                            <p className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate">{person.name}</p>
                                            <p className="text-[10px] text-zinc-500 font-medium truncate">{person.character}</p>
                                        </div>
                                    ))
                                ) : loading ? (
                                    Array(5).fill(0).map((_, i) => <div key={i} className="aspect-square bg-zinc-900/50 rounded-2xl animate-pulse" />)
                                ) : (
                                    <p className="text-zinc-600 text-xs">No cast information available.</p>
                                )}
                            </div>
                        </div>

                        {/* Similar / Recommendations */}
                        {recommendations.length > 0 && (
                            <div className="space-y-6">
                                <h3 className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.3em]">Recommended</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {recommendations.map((media: any) => (
                                        <div
                                            key={media.id}
                                            onClick={() => onSelectRecommended?.({
                                                ...media,
                                                id: media.id,
                                                title: media.title || media.name,
                                                type: media.media_type === 'tv' ? 'series' : 'movie',
                                                tmdbId: media.id
                                            })}
                                            className="group flex gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer"
                                        >
                                            <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900">
                                                {media.poster_path && <img src={`/api/proxy?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w185${media.poster_path}`)}`} className="w-full h-full object-cover" alt="" />}
                                            </div>
                                            <div className="min-w-0 flex flex-col justify-center">
                                                <p className="text-xs font-bold text-zinc-300 group-hover:text-white truncate transition-colors">{media.title || media.name}</p>
                                                <p className="text-[10px] text-zinc-600 font-black">{media.release_date?.split('-')[0] || media.first_air_date?.split('-')[0]}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
                .mask-gradient-b {
                    mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
                    -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </div>
    );
}

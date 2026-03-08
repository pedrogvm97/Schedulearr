'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Calendar, MapPin, Film, Tv, Star, Info, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface PersonDetailsPanelProps {
    personId: number;
    tmdbApiKey: string;
    onClose: () => void;
    onSelectMedia: (media: any) => void;
}

export function PersonDetailsPanel({ personId, tmdbApiKey, onClose, onSelectMedia }: PersonDetailsPanelProps) {
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [credits, setCredits] = useState<any[]>([]);

    useEffect(() => {
        if (!tmdbApiKey || !personId) return;

        // Clear previous state to prevent stale data
        setDetails(null);
        setCredits([]);

        const fetchPerson = async () => {
            setLoading(true);
            try {
                const [detailsRes, creditsRes] = await Promise.all([
                    fetch(`https://api.themoviedb.org/3/person/${personId}?api_key=${tmdbApiKey}&append_to_response=images`),
                    fetch(`https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${tmdbApiKey}`)
                ]);

                if (detailsRes.ok) setDetails(await detailsRes.json());
                if (creditsRes.ok) {
                    const cData = await creditsRes.json();

                    // Combine cast and crew to find both acting and directing roles
                    const cast = cData.cast || [];
                    const crew = (cData.crew || []).filter((m: any) => m.job === 'Director');

                    const combined = [...cast, ...crew]
                        .filter((m: any) => {
                            const char = (m.character || '').toLowerCase();
                            const job = (m.job || '').toLowerCase();
                            const title = (m.title || m.name || '').toLowerCase();

                            const isMinor = char.includes('self') ||
                                char.includes('thanks') ||
                                char.includes('uncredited') ||
                                char.includes('voice') ||
                                char.includes('additional') ||
                                char.includes('undetermined') ||
                                char.includes('unknown') ||
                                title.includes('documentary') ||
                                title.includes('making of');

                            return m.poster_path && !isMinor;
                        })
                        // Remove duplicates (sometimes person is both actor and director)
                        .filter((v, i, a) => a.findIndex(t => t.id === v.id && t.media_type === v.media_type) === i)
                        .sort((a: any, b: any) => {
                            // Weight: (vote_count * vote_average) * popularity
                            const scoreA = (a.vote_count || 0) * (a.vote_average || 1) * (a.popularity || 1);
                            const scoreB = (b.vote_count || 0) * (b.vote_average || 1) * (b.popularity || 1);
                            return scoreB - scoreA;
                        })
                        .slice(0, 48);
                    setCredits(combined);
                }
            } catch (error) {
                console.error('Error fetching person details:', error);
                toast.error('Failed to load person details');
            } finally {
                setLoading(false);
            }
        };

        fetchPerson();
    }, [personId, tmdbApiKey]);

    if (!personId) return null;

    const profilePath = details?.profile_path ? `https://image.tmdb.org/t/p/h632${details.profile_path}` : null;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 lg:p-10 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300">
            <button
                onClick={onClose}
                className="absolute top-6 right-6 z-[140] p-4 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all border border-white/10"
            >
                <X size={24} />
            </button>

            <div className="relative w-full h-full max-w-6xl bg-[#0a0a0a] rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col lg:flex-row animate-in zoom-in-95 duration-300">
                {/* Left side: Profile Image & Basic Info */}
                <div className="w-full lg:w-[350px] p-8 lg:p-12 border-r border-white/5 space-y-8 overflow-y-auto custom-scrollbar">
                    <div className="aspect-[2/3] w-full rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl bg-zinc-900 flex-shrink-0">
                        {profilePath ? (
                            <img src={profilePath} className="w-full h-full object-cover" alt={details?.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-800"><User size={64} /></div>
                        )}
                    </div>

                    <div className="space-y-6">
                        <h2 className="text-3xl font-black text-white leading-tight">{details?.name}</h2>

                        <div className="space-y-4">
                            {details?.birthday && (
                                <div className="flex items-center gap-3 text-zinc-400">
                                    <Calendar size={16} className="text-emerald-500" />
                                    <span className="text-sm font-bold">{details.birthday} {details.deathday ? `(Died ${details.deathday})` : ''}</span>
                                </div>
                            )}
                            {details?.place_of_birth && (
                                <div className="flex items-center gap-3 text-zinc-400">
                                    <MapPin size={16} className="text-emerald-500" />
                                    <span className="text-sm font-bold">{details.place_of_birth}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-3 text-zinc-400">
                                <TrendingUp size={16} className="text-emerald-500" />
                                <span className="text-sm font-bold">{details?.known_for_department}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right side: Biography & Filmography */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-16 space-y-12">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-40 gap-4">
                            <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                            <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Loading Biography...</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <h3 className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.3em]">Biography</h3>
                                <p className="text-zinc-300 text-lg leading-relaxed font-medium">
                                    {details?.biography || "No biography available."}
                                </p>
                            </div>

                            <div className="space-y-6">
                                <h3 className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.3em]">Filmography</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-6">
                                    {credits.map(media => (
                                        <div
                                            key={`${media.id}-${media.media_type}`}
                                            onClick={() => onSelectMedia({
                                                ...media,
                                                id: media.id,
                                                title: media.title || media.name,
                                                type: media.media_type === 'tv' ? 'series' : 'movie',
                                                tmdbId: media.id
                                            })}
                                            className="group cursor-pointer space-y-2"
                                        >
                                            <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-white/5 bg-zinc-900 group-hover:border-emerald-500/50 transition-all">
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w342${media.poster_path}`}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                    alt={media.title || media.name}
                                                />
                                            </div>
                                            <p className="text-xs font-black text-zinc-300 group-hover:text-white truncate transition-colors">
                                                {media.title || media.name}
                                            </p>
                                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">
                                                {media.character ? `as ${media.character}` : (media.media_type === 'tv' ? 'Series' : 'Movie')}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

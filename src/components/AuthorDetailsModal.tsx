'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Wand2, Edit3, Check, BookOpen, Clock, Calendar, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface AuthorDetailsModalProps {
    authorName: string | null;
    isOpen: boolean;
    onClose: () => void;
    onSelectBook: (book: any) => void;
    allBooks?: any[];
}

export function AuthorDetailsModal({
    authorName,
    isOpen,
    onClose,
    onSelectBook,
    allBooks = []
}: AuthorDetailsModalProps) {
    const [authorData, setAuthorData] = useState<{
        name: string;
        bio?: string;
        photoUrl?: string;
        birthDate?: string;
        deathDate?: string;
        source?: string;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [isEditingBio, setIsEditingBio] = useState(false);
    const [editedBio, setEditedBio] = useState('');
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !authorName) {
            setAuthorData(null);
            setIsEditingBio(false);
            return;
        }

        const fetchAuthor = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/theater/audiobooks/author?name=${encodeURIComponent(authorName)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.author) {
                        setAuthorData(data.author);
                        setEditedBio(data.author.bio || '');
                    }
                }
            } catch (err: any) {
                console.error('Failed to load author profile:', err);
                toast.error('Failed to load author details');
            } finally {
                setLoading(false);
            }
        };

        fetchAuthor();
    }, [isOpen, authorName]);

    if (!isOpen || !authorName) return null;

    // Filter all books by this author
    const normAuthor = authorName.toLowerCase().trim();
    const authorBooks = allBooks.filter(b => {
        const bAuthor = (b.author || b.cleanAuthor || '').toLowerCase().trim();
        return bAuthor.includes(normAuthor) || normAuthor.includes(bAuthor);
    });

    const handleRegenerateBio = async () => {
        setIsRegenerating(true);
        toast.info(`Generating rich literary biography for ${authorName}...`);
        try {
            const res = await fetch('/api/theater/audiobooks/author', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'regenerate_bio', name: authorName })
            });
            const data = await res.json();
            if (res.ok && data.author) {
                setAuthorData(data.author);
                setEditedBio(data.author.bio || '');
                setIsEditingBio(false);
                toast.success('Generated author biography');
            } else {
                toast.error(data.error || 'Failed to generate biography');
            }
        } catch {
            toast.error('Failed to generate biography');
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleSaveBio = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/theater/audiobooks/author', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: authorName,
                    bio: editedBio
                })
            });
            const data = await res.json();
            if (res.ok && data.author) {
                setAuthorData(data.author);
                setIsEditingBio(false);
                toast.success('Saved biography');
            } else {
                toast.error(data.error || 'Failed to save biography');
            }
        } catch {
            toast.error('Failed to save biography');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            className="fixed inset-0 z-[330] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
        >
            <div className="bg-[#0c0c0e] border-2 border-amber-500/30 rounded-[2.5rem] w-full max-w-5xl p-6 sm:p-9 space-y-7 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer z-20"
                    title="Close author profile"
                >
                    <X size={22} />
                </button>

                {/* Top Profile Header */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-7 pb-6 border-b border-zinc-800/80">
                    {/* Portrait Photo */}
                    <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-br from-[#24170d] via-zinc-900 to-zinc-950 border-3 border-amber-500/50 overflow-hidden flex items-center justify-center text-amber-400 shrink-0 shadow-[0_12px_36px_rgba(0,0,0,0.85)] relative">
                        {authorData?.photoUrl ? (
                            <img
                                src={authorData.photoUrl}
                                alt={authorName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextElementSibling) {
                                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                }}
                            />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center ${authorData?.photoUrl ? 'hidden' : 'flex'}`}>
                            <User size={64} className="text-amber-500/60" />
                        </div>
                    </div>

                    {/* Author Details & Quick Controls */}
                    <div className="space-y-3.5 text-center sm:text-left flex-1 min-w-0">
                        <div className="flex items-center justify-center sm:justify-start gap-2.5 flex-wrap">
                            <span className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-black uppercase tracking-wider">
                                Author &amp; Playwright
                            </span>
                            <span className="px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-black">
                                {authorBooks.length} {authorBooks.length === 1 ? 'Book in Library' : 'Books in Library'}
                            </span>
                            {authorData?.birthDate && (
                                <span className="px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-mono font-bold flex items-center gap-1.5">
                                    <Calendar size={13} />
                                    <span>b. {authorData.birthDate}{authorData.deathDate ? ` — d. ${authorData.deathDate}` : ''}</span>
                                </span>
                            )}
                        </div>

                        <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                            {authorName}
                        </h2>

                        <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap pt-1">
                            <button
                                onClick={handleRegenerateBio}
                                disabled={isRegenerating}
                                title="Run LLM to generate rich literary biography, stylistic hallmarks & themes"
                                className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                            >
                                <Wand2 size={16} className={isRegenerating ? 'animate-spin' : ''} />
                                <span>{isRegenerating ? 'Generating...' : 'Enhance Bio'}</span>
                            </button>

                            <button
                                onClick={() => setIsEditingBio(prev => !prev)}
                                title="Edit author biography text"
                                className="px-4 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
                            >
                                <Edit3 size={16} />
                                <span>{isEditingBio ? 'Cancel' : 'Edit'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Biography Showcase */}
                <div className="p-6 sm:p-7 rounded-3xl bg-zinc-950/80 border border-zinc-900 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                            <Sparkles size={16} />
                            <span>Biography</span>
                        </h3>
                        {authorData?.source && (
                            <span className="text-[11px] font-mono text-zinc-500 font-bold">
                                Source: {authorData.source}
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <div className="py-8 text-center text-zinc-500 text-sm font-bold flex items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                            <span>Loading biography...</span>
                        </div>
                    ) : isEditingBio ? (
                        <div className="space-y-3">
                            <textarea
                                rows={6}
                                value={editedBio}
                                onChange={e => setEditedBio(e.target.value)}
                                placeholder="Author biography..."
                                className="w-full p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-base text-zinc-100 leading-relaxed focus:outline-none focus:border-amber-500 resize-y"
                            />
                            <div className="flex justify-end gap-2.5">
                                <button
                                    onClick={() => setIsEditingBio(false)}
                                    className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-300 text-xs font-bold cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveBio}
                                    disabled={isSaving}
                                    className="px-5 py-2 rounded-xl bg-amber-500 text-black font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    <Check size={14} />
                                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-base sm:text-lg text-zinc-200 leading-relaxed whitespace-pre-line">
                            {authorData?.bio || `${authorName} is an author featured in your audiobook collection.`}
                        </p>
                    )}
                </div>

                {/* Library Audiobooks by this Author */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <BookOpen size={20} className="text-amber-400" />
                            <span>Books by {authorName} ({authorBooks.length})</span>
                        </h3>
                    </div>

                    {authorBooks.length === 0 ? (
                        <div className="py-8 text-center text-sm font-bold text-zinc-500">
                            No other books found in library for this author.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {authorBooks.map((book) => {
                                const coverUrl = book.posterUrl || book.customCoverUrl || book.thumb || '';
                                return (
                                    <div
                                        key={book.id || book.bookKey}
                                        onClick={() => {
                                            onSelectBook(book);
                                            onClose();
                                        }}
                                        title={`Open "${book.title || book.cleanTitle}"`}
                                        className="group relative rounded-2xl bg-zinc-950/80 border border-zinc-800 hover:border-amber-500/70 p-3 space-y-2.5 transition-all duration-200 cursor-pointer hover:scale-[1.02] shadow-lg flex flex-col"
                                    >
                                        <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-zinc-900 relative flex items-center justify-center">
                                            {coverUrl ? (
                                                <img
                                                    src={coverUrl}
                                                    alt={book.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <BookOpen size={36} className="text-amber-500/50" />
                                            )}
                                        </div>
                                        <div className="min-w-0 space-y-1 flex-1 flex flex-col justify-between">
                                            <h4 className="font-black text-white text-sm line-clamp-2 group-hover:text-amber-300 leading-snug">
                                                {book.cleanTitle || book.title}
                                            </h4>
                                            <div className="flex items-center justify-between text-xs font-mono text-zinc-400 pt-1">
                                                {book.releaseYear && <span>{book.releaseYear}</span>}
                                                {book.chapters?.length ? <span>{book.chapters.length} Ch</span> : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

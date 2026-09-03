'use client';

import React, { useState } from 'react';
import {
    X, Radio, UploadCloud, Link as LinkIcon, Key,
    Calendar, CheckCircle2, AlertCircle, Tv, Sparkles, Server, Zap
} from 'lucide-react';
import { toast } from 'sonner';

interface AddIptvProviderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProviderCreated?: (newLibId: string) => void;
    onAdded?: (newLibId?: string) => void;
}

export function AddIptvProviderModal({
    isOpen,
    onClose,
    onProviderCreated,
    onAdded
}: AddIptvProviderModalProps) {
    const [mode, setMode] = useState<'upload' | 'url' | 'xtream'>('url');
    const [providerName, setProviderName] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [m3uUrl, setM3uUrl] = useState('');
    const [epgUrl, setEpgUrl] = useState('');

    // Xtream Codes Fields
    const [xtreamServer, setXtreamServer] = useState('');
    const [xtreamUser, setXtreamUser] = useState('');
    const [xtreamPass, setXtreamPass] = useState('');
    const [xtreamOutput, setXtreamOutput] = useState<'ts' | 'm3u8'>('ts');

    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    // Smart Xtream Codes URL Generation
    const getComputedXtreamM3u = () => {
        if (!xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()) return '';
        let base = xtreamServer.trim().replace(/\/$/, '');
        if (!base.startsWith('http://') && !base.startsWith('https://')) {
            base = `http://${base}`;
        }
        return `${base}/get.php?username=${encodeURIComponent(xtreamUser.trim())}&password=${encodeURIComponent(xtreamPass.trim())}&type=m3u_plus&output=${xtreamOutput}`;
    };

    const getComputedXtreamEpg = () => {
        if (!xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()) return '';
        let base = xtreamServer.trim().replace(/\/$/, '');
        if (!base.startsWith('http://') && !base.startsWith('https://')) {
            base = `http://${base}`;
        }
        return `${base}/xmltv.php?username=${encodeURIComponent(xtreamUser.trim())}&password=${encodeURIComponent(xtreamPass.trim())}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let effectiveM3u = '';
        let effectiveEpg = epgUrl.trim();

        if (mode === 'upload') {
            if (!uploadFile) {
                toast.error('Please select an M3U playlist file to upload');
                return;
            }
        } else if (mode === 'url') {
            if (!m3uUrl.trim()) {
                toast.error('Please enter an M3U stream or playlist URL');
                return;
            }
            effectiveM3u = m3uUrl.trim();
        } else if (mode === 'xtream') {
            if (!xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()) {
                toast.error('Please fill in Server URL, Username, and Password for Xtream Codes');
                return;
            }
            effectiveM3u = getComputedXtreamM3u();
            if (!effectiveEpg) {
                effectiveEpg = getComputedXtreamEpg();
            }
        }

        const effectiveName = providerName.trim() || (
            mode === 'upload' && uploadFile ? uploadFile.name.replace(/\.(m3u8?|txt)$/i, '') :
            mode === 'xtream' ? `IPTV (${xtreamUser.trim()})` :
            'My IPTV Provider'
        );

        setIsSubmitting(true);
        try {
            // Step 1: Create Theater Library of type 'live'
            const libRes = await fetch('/api/theater/libraries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: effectiveName,
                    type: 'live',
                    folders: [effectiveM3u || 'local_file_upload']
                })
            });

            if (!libRes.ok) {
                const errData = await libRes.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to initialize IPTV provider');
            }

            const libData = await libRes.json();
            const newLibId = libData.id || libData.library?.id;

            // Step 2: Upload M3U / Fetch URL and Parse Channels
            const formData = new FormData();
            formData.append('libraryId', newLibId);
            if (mode === 'upload' && uploadFile) {
                formData.append('file', uploadFile);
            } else if (effectiveM3u) {
                formData.append('url', effectiveM3u);
            }
            if (effectiveEpg) {
                formData.append('epgUrl', effectiveEpg);
            }

            const parseRes = await fetch('/api/theater/iptv', {
                method: 'POST',
                body: formData
            });

            if (!parseRes.ok) {
                const errData = await parseRes.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to parse channels from provider. Check stream URL/credentials.');
            }

            const parseData = await parseRes.json();
            toast.success(`IPTV Provider "${effectiveName}" connected! Loaded ${parseData.totalChannels || 0} channels.`);
            if (typeof onProviderCreated === 'function') {
                onProviderCreated(newLibId);
            }
            if (typeof onAdded === 'function') {
                onAdded(newLibId);
            }
            onClose();
        } catch (error: any) {
            console.error('Error creating IPTV provider:', error);
            toast.error(error.message || 'Error configuring IPTV provider');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0c0c0e] border border-red-500/30 rounded-[2.5rem] w-full max-w-2xl p-6 sm:p-8 shadow-2xl relative space-y-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
                {/* Close button */}
                <button
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-50"
                >
                    <X size={20} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3.5 pb-2 border-b border-zinc-900">
                    <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 shadow-lg shadow-red-500/10">
                        <Radio size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                            Add IPTV Provider
                        </h2>
                        <p className="text-xs text-zinc-400 font-medium mt-0.5">
                            Connect your playlist file, M3U URL, or Xtream Codes server with guide support.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Provider Name */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block">
                            Provider Name
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. World TV, Portugal Live, Sports HD"
                            value={providerName}
                            onChange={e => setProviderName(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-red-500 font-bold transition-colors"
                        />
                    </div>

                    {/* Mode Selector Tabs */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-zinc-400 uppercase tracking-wider block">
                            Choose Connection Method
                        </label>
                        <div className="grid grid-cols-3 gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setMode('url')}
                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
                                    mode === 'url'
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-md'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <LinkIcon size={14} /> M3U URL
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('upload')}
                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
                                    mode === 'upload'
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-md'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <UploadCloud size={14} /> Upload File
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('xtream')}
                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
                                    mode === 'xtream'
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-md'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <Server size={14} /> Xtream Codes
                            </button>
                        </div>
                    </div>

                    {/* Mode 1: URL */}
                    {mode === 'url' && (
                        <div className="space-y-2 animate-in fade-in duration-200">
                            <label className="text-xs font-bold text-zinc-300 block">
                                M3U / M3U8 Playlist Stream URL
                            </label>
                            <input
                                type="text"
                                placeholder="http://example.com/playlist.m3u8 or https://iptv-org.github.io/iptv/index.m3u"
                                value={m3uUrl}
                                onChange={e => {
                                    const val = e.target.value;
                                    setM3uUrl(val);
                                    if (val.includes('username=') && val.includes('password=')) {
                                        try {
                                            const u = new URL(val);
                                            const user = u.searchParams.get('username');
                                            const pass = u.searchParams.get('password');
                                            if (user && pass && !epgUrl) {
                                                setEpgUrl(`${u.protocol}//${u.host}/xmltv.php?username=${user}&password=${pass}`);
                                            }
                                        } catch {}
                                    }
                                    if (!providerName && val) {
                                        try {
                                            const hostname = new URL(val).hostname;
                                            setProviderName(`IPTV (${hostname})`);
                                        } catch {}
                                    }
                                }}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-xs text-white placeholder-zinc-600 outline-none focus:border-red-500 font-mono transition-colors"
                            />
                            {m3uUrl.includes('username=') && m3uUrl.includes('password=') && (
                                <div className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl font-medium">
                                    <Zap size={13} className="shrink-0" />
                                    <span>High-speed Xtream provider detected! Channels load in 3.5s and XMLTV guide is auto-configured.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Mode 2: File Upload */}
                    {mode === 'upload' && (
                        <div className="space-y-2 animate-in fade-in duration-200">
                            <label className="text-xs font-bold text-zinc-300 block">
                                Upload M3U / M3U8 / TXT Playlist File
                            </label>
                            <div className="p-6 rounded-2xl bg-zinc-950/80 border border-dashed border-zinc-800 hover:border-red-500/50 transition-all text-center space-y-2 relative">
                                <input
                                    type="file"
                                    accept=".m3u,.m3u8,.txt"
                                    onChange={e => {
                                        const f = e.target.files?.[0];
                                        if (f) {
                                            setUploadFile(f);
                                            if (!providerName.trim()) {
                                                setProviderName(f.name.replace(/\.(m3u8?|txt)$/i, ''));
                                            }
                                        }
                                    }}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                />
                                <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
                                    <UploadCloud size={20} />
                                </div>
                                {uploadFile ? (
                                    <div>
                                        <p className="text-sm font-bold text-white flex items-center justify-center gap-2">
                                            <CheckCircle2 size={16} className="text-emerald-400" />
                                            {uploadFile.name}
                                        </p>
                                        <p className="text-[11px] text-zinc-500">{(uploadFile.size / 1024).toFixed(1)} KB • Click or drag to replace</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-xs sm:text-sm font-bold text-zinc-300">Click to browse or drop your local .m3u / .m3u8 file here</p>
                                        <p className="text-[11px] text-zinc-500">Supports standard M3U &amp; M3U_Plus playlists with tvg-logo and group-title</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Mode 3: Xtream Codes */}
                    {mode === 'xtream' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-300 block">
                                    Server / Host URL
                                </label>
                                <input
                                    type="text"
                                    placeholder="http://iptvprovider.domain:8080"
                                    value={xtreamServer}
                                    onChange={e => setXtreamServer(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-red-500 font-mono transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-zinc-300 block">
                                        Username
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Username"
                                        value={xtreamUser}
                                        onChange={e => setXtreamUser(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-red-500 font-mono transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-zinc-300 block">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        placeholder="Password"
                                        value={xtreamPass}
                                        onChange={e => setXtreamPass(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-red-500 font-mono transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <span className="text-[11px] text-zinc-400 font-bold">Stream Container Output:</span>
                                <div className="flex gap-2">
                                    {(['ts', 'm3u8'] as const).map(fmt => (
                                        <button
                                            key={fmt}
                                            type="button"
                                            onClick={() => setXtreamOutput(fmt)}
                                            className={`px-3 py-1 rounded-xl text-xs font-black uppercase transition-all ${
                                                xtreamOutput === fmt
                                                    ? 'bg-red-500 text-white'
                                                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            {fmt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Optional XMLTV EPG Guide URL */}
                    <div className="space-y-2 pt-3 border-t border-zinc-900">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                                <Calendar size={13} className="text-amber-400" />
                                XMLTV EPG Guide URL (Optional)
                            </label>
                            {mode === 'xtream' && (
                                <span className="text-[10px] text-emerald-400 font-bold">
                                    Auto-generated from Xtream credentials
                                </span>
                            )}
                        </div>
                        <input
                            type="text"
                            placeholder={mode === 'xtream' ? (getComputedXtreamEpg() || 'http://server:port/xmltv.php?username=...&password=...') : 'http://example.com/epg.xml'}
                            value={epgUrl}
                            onChange={e => setEpgUrl(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-amber-500 font-mono transition-colors"
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-400 font-black uppercase text-xs tracking-widest rounded-2xl hover:text-white transition-all disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-[2] h-12 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-50 active:scale-95"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Connecting Provider...</span>
                                </>
                            ) : (
                                <>
                                    <Radio size={16} />
                                    <span>Add IPTV Provider</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

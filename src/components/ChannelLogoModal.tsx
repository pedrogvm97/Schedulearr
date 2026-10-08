'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Search, Sparkles, Check, Image as ImageIcon,
    RefreshCw, Link as LinkIcon, Upload, Sliders,
    Square, Circle, Wand2, RotateCcw, Move, FileDown,
    Palette
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

function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '').trim();
    const num = parseInt(clean, 16);
    if (isNaN(num)) return [255, 255, 255];
    if (clean.length === 3) {
        const r = ((num >> 8) & 0xf) * 17;
        const g = ((num >> 4) & 0xf) * 17;
        const b = (num & 0xf) * 17;
        return [r, g, b];
    }
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
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

    // Uniform Processing Tool States
    const [enableProcessing, setEnableProcessing] = useState(false);
    const [bgStyle, setBgStyle] = useState<'transparent' | 'dark' | 'black'>('dark');
    const [zoomLevel, setZoomLevel] = useState(85); // 20% to 250%
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [shapeStyle, setShapeStyle] = useState<'rounded' | 'circle' | 'square'>('rounded');

    // Background Remover
    const [enableBgRemoval, setEnableBgRemoval] = useState(false);
    const [keyColor, setKeyColor] = useState('#ffffff');
    const [tolerance, setTolerance] = useState(30); // 1 to 100

    // Compression & Format Optimizer
    const [exportFormat, setExportFormat] = useState<'image/webp' | 'image/png' | 'image/jpeg'>('image/webp');
    const [exportQuality, setExportQuality] = useState(85); // 10 to 100
    const [estimatedSizeKb, setEstimatedSizeKb] = useState<number | null>(null);

    const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Drag-to-pan tracking
    const isDraggingRef = useRef(false);
    const [isCurrentlyDragging, setIsCurrentlyDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 });

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
            setProcessedDataUrl(null);
            setEnableProcessing(false);
            setZoomLevel(85);
            setPanX(0);
            setPanY(0);
            setEnableBgRemoval(false);
            setKeyColor('#ffffff');
            setTolerance(30);
            setExportFormat('image/webp');
            setExportQuality(85);
            setEstimatedSizeKb(null);
            handleSearch(initialQ);
        }
    }, [isOpen, channel]);

    const activeRawSource = customUrl.trim() || selectedLogo || channel?.logo || '';

    // Re-render canvas processing whenever inputs change
    const renderCanvas = useCallback(() => {
        if (!enableProcessing || !activeRawSource) {
            setProcessedDataUrl(null);
            setEstimatedSizeKb(null);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';

        // Use backend proxy for remote http(s) images to avoid CORS canvas taint
        let resolvedSrc = activeRawSource;
        if (resolvedSrc.startsWith('http://') || resolvedSrc.startsWith('https://')) {
            resolvedSrc = `/api/theater/iptv/logo?url=${encodeURIComponent(resolvedSrc)}`;
        }

        img.onload = () => {
            const canvas = canvasRef.current || document.createElement('canvas');
            const size = 256;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // 1. Offscreen canvas for the raw image + background removal
            const offCanvas = document.createElement('canvas');
            offCanvas.width = size;
            offCanvas.height = size;
            const offCtx = offCanvas.getContext('2d');
            if (!offCtx) return;

            // Calculate scaled dimensions & centered position with pan offset
            const scaleFactor = zoomLevel / 100;
            const maxDimension = size * scaleFactor;
            const aspect = (img.width && img.height) ? (img.width / img.height) : 1;
            let drawW = maxDimension;
            let drawH = maxDimension;

            if (aspect > 1) {
                drawH = maxDimension / aspect;
            } else {
                drawW = maxDimension * aspect;
            }

            const drawX = ((size - drawW) / 2) + panX;
            const drawY = ((size - drawH) / 2) + panY;

            offCtx.drawImage(img, drawX, drawY, drawW, drawH);

            // Apply Background Removal on offscreen canvas if active
            if (enableBgRemoval) {
                try {
                    const [keyR, keyG, keyB] = hexToRgb(keyColor);
                    const maxDist = 441.6729559; // Math.hypot(255, 255, 255)
                    const threshold = (tolerance / 100) * maxDist;
                    const feather = Math.max(1, threshold * 0.15);

                    const imgData = offCtx.getImageData(0, 0, size, size);
                    const d = imgData.data;
                    for (let i = 0; i < d.length; i += 4) {
                        const a = d[i + 3];
                        if (a === 0) continue;
                        const r = d[i];
                        const g = d[i + 1];
                        const b = d[i + 2];
                        const dist = Math.hypot(r - keyR, g - keyG, b - keyB);
                        if (dist < threshold - feather) {
                            d[i + 3] = 0;
                        } else if (dist <= threshold) {
                            const factor = (dist - (threshold - feather)) / feather;
                            d[i + 3] = Math.round(a * Math.min(1, Math.max(0, factor)));
                        }
                    }
                    offCtx.putImageData(imgData, 0, 0);
                } catch {
                    // Ignore security or pixel read errors
                }
            }

            // 2. Main Canvas rendering: Background & Clipping
            ctx.clearRect(0, 0, size, size);
            ctx.save();

            // Clip shape
            if (shapeStyle === 'circle') {
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.clip();
            } else if (shapeStyle === 'rounded') {
                const r = 40;
                ctx.beginPath();
                ctx.roundRect(0, 0, size, size, r);
                ctx.clip();
            }

            // Fill background
            if (bgStyle === 'dark') {
                ctx.fillStyle = '#18181b';
                ctx.fillRect(0, 0, size, size);
            } else if (bgStyle === 'black') {
                ctx.fillStyle = '#09090b';
                ctx.fillRect(0, 0, size, size);
            }

            // Draw processed offscreen logo onto clipped canvas
            ctx.drawImage(offCanvas, 0, 0);
            ctx.restore();

            try {
                const qualityParam = exportFormat === 'image/png' ? undefined : (exportQuality / 100);
                const dataUrl = canvas.toDataURL(exportFormat, qualityParam);
                setProcessedDataUrl(dataUrl);

                // Estimate size in KB
                const base64Str = dataUrl.split(',')[1] || '';
                const bytes = (base64Str.length * 3) / 4;
                setEstimatedSizeKb(Math.round((bytes / 1024) * 10) / 10);
            } catch {}
        };
        img.src = resolvedSrc;
    }, [
        activeRawSource, enableProcessing, bgStyle, zoomLevel,
        panX, panY, shapeStyle, enableBgRemoval, keyColor,
        tolerance, exportFormat, exportQuality
    ]);

    useEffect(() => {
        renderCanvas();
    }, [renderCanvas]);

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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file (PNG, JPG, SVG, WebP)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            if (result) {
                setCustomUrl(result);
                setSelectedLogo('');
                setEnableProcessing(true); // Automatically open uniform tools for uploaded files
                toast.success('Uploaded custom channel photo');
            }
        };
        reader.readAsDataURL(file);
    };

    // Mouse drag handlers for canvas panning
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!enableProcessing) return;
        isDraggingRef.current = true;
        setIsCurrentlyDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            initialPanX: panX,
            initialPanY: panY
        };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPanX(Math.round(dragStartRef.current.initialPanX + dx));
        setPanY(Math.round(dragStartRef.current.initialPanY + dy));
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
        setIsCurrentlyDragging(false);
    };

    // Touch drag handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        if (!enableProcessing || e.touches.length !== 1) return;
        isDraggingRef.current = true;
        setIsCurrentlyDragging(true);
        dragStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            initialPanX: panX,
            initialPanY: panY
        };
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDraggingRef.current || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - dragStartRef.current.x;
        const dy = e.touches[0].clientY - dragStartRef.current.y;
        setPanX(Math.round(dragStartRef.current.initialPanX + dx));
        setPanY(Math.round(dragStartRef.current.initialPanY + dy));
    };

    const handleTouchEnd = () => {
        isDraggingRef.current = false;
        setIsCurrentlyDragging(false);
    };

    const handleResetPosition = () => {
        setPanX(0);
        setPanY(0);
        setZoomLevel(85);
        toast.info('Reset position & zoom');
    };

    const handleApply = async () => {
        const finalUrl = (enableProcessing && processedDataUrl)
            ? processedDataUrl
            : (customUrl.trim() || selectedLogo.trim());

        if (!finalUrl) {
            toast.error('Please pick a logo candidate, upload a photo, or enter a URL');
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
                toast.success(`Uniform logo updated for "${channel.name}"!`);
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

    const effectivePreview = (enableProcessing && processedDataUrl)
        ? processedDataUrl
        : (customUrl.trim() || selectedLogo || channel.logo);

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="bg-[#0c0c0e] border border-amber-500/30 rounded-[2.5rem] w-full max-w-3xl p-6 sm:p-8 shadow-2xl relative space-y-6 max-h-[94vh] overflow-y-auto custom-scrollbar flex flex-col text-[125%]">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                >
                    <X size={24} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-4 pb-4 border-b border-zinc-900">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-2 shrink-0 shadow-inner overflow-hidden relative">
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
                            <ImageIcon size={30} className="text-zinc-600" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                Channel Logo Matcher
                            </span>
                            {channel.group && (
                                <span className="text-xs text-zinc-500 font-bold truncate">
                                    • {channel.group}
                                </span>
                            )}
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-white truncate mt-1">
                            {channel.name}
                        </h2>
                    </div>
                </div>

                {/* Search Bar + Upload Button */}
                <div className="flex flex-wrap items-center gap-2.5">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSearch(query);
                        }}
                        className="flex-1 flex items-center gap-2"
                    >
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
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
                            className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                        >
                            {isLoading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            <span>Search</span>
                        </button>
                    </form>

                    {/* File Upload trigger */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                        title="Upload logo file from this device"
                    >
                        <Upload size={16} className="text-amber-400" />
                        <span>Upload Photo</span>
                    </button>
                </div>

                {/* Results Candidates Grid */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-bold px-1">
                        <span>Database Matches ({candidates.length})</span>
                        {isLoading && <span className="text-amber-400 text-xs flex items-center gap-1"><RefreshCw size={14} className="animate-spin" /> Searching...</span>}
                    </div>

                    {candidates.length === 0 && !isLoading ? (
                        <div className="p-5 rounded-2xl bg-zinc-950/60 border border-zinc-900 text-center space-y-1">
                            <ImageIcon size={28} className="text-zinc-700 mx-auto" />
                            <p className="text-xs font-bold text-zinc-400">No matches for "{query}"</p>
                            <p className="text-[12px] text-zinc-600">Upload a photo above or paste a direct image URL below.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-44 overflow-y-auto custom-scrollbar p-1">
                            {candidates.map((cand) => {
                                const isSelected = selectedLogo === cand.url;
                                return (
                                    <div
                                        key={cand.id || cand.url}
                                        onClick={() => {
                                            setSelectedLogo(cand.url);
                                            setCustomUrl('');
                                        }}
                                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-between gap-2 relative group select-none ${
                                            isSelected
                                                ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/15 ring-2 ring-amber-500/40'
                                                : 'bg-zinc-950 hover:bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700'
                                        }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-md">
                                                <Check size={12} strokeWidth={3} />
                                            </div>
                                        )}
                                        <div className="w-full h-14 rounded-xl bg-zinc-900/90 border border-zinc-800/60 flex items-center justify-center p-2 overflow-hidden shadow-inner">
                                            <img
                                                src={cand.previewUrl || cand.url}
                                                alt=""
                                                className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = `/api/theater/iptv/logo?name=${encodeURIComponent(channel.name)}`;
                                                }}
                                            />
                                        </div>
                                        <div className="w-full text-center min-w-0">
                                            <p className="text-xs font-bold text-white truncate" title={cand.title}>
                                                {cand.title}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Uniformity & Processing Tools Bar ── */}
                <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
                            <Sliders size={16} />
                            <span>Uniform Processing & Optimization</span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setEnableProcessing(!enableProcessing)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                enableProcessing
                                    ? 'bg-amber-500 text-black font-black shadow-md shadow-amber-500/20'
                                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                            }`}
                        >
                            {enableProcessing ? 'Processing Active' : 'Enable Uniform Tools'}
                        </button>
                    </div>

                    {enableProcessing && (
                        <div className="space-y-4 pt-3 border-t border-zinc-900 animate-in fade-in duration-150">
                            {/* Interactive Canvas Drag Preview */}
                            <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800/80">
                                <div
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                    onTouchStart={handleTouchStart}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={handleTouchEnd}
                                    className={`relative w-44 h-44 rounded-2xl overflow-hidden border border-zinc-700/80 flex items-center justify-center shrink-0 bg-[radial-gradient(#27272a_1.5px,transparent_1.5px)] [background-size:12px_12px] shadow-inner select-none ${
                                        isCurrentlyDragging ? 'cursor-grabbing' : 'cursor-grab'
                                    }`}
                                    title="Click and drag to position logo"
                                >
                                    <canvas
                                        ref={canvasRef}
                                        className="w-full h-full object-contain pointer-events-none"
                                    />
                                    {/* Overlay Hint */}
                                    <div className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] text-zinc-300 font-bold flex items-center justify-between pointer-events-none">
                                        <span className="flex items-center gap-1">
                                            <Move size={11} className="text-amber-400" />
                                            <span>Drag to pan</span>
                                        </span>
                                        <span className="font-mono text-amber-400">{panX !== 0 || panY !== 0 ? `${panX},${panY}` : '0,0'}</span>
                                    </div>
                                </div>

                                <div className="flex-1 w-full space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                                            <span>Scale / Zoom:</span>
                                            <span className="font-mono font-black text-amber-400">{zoomLevel}%</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleResetPosition}
                                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                                            title="Reset zoom and position"
                                        >
                                            <RotateCcw size={13} />
                                            <span>Reset Position</span>
                                        </button>
                                    </div>

                                    {/* Zoom Slider (20% to 250%) */}
                                    <input
                                        type="range"
                                        min={20}
                                        max={250}
                                        value={zoomLevel}
                                        onChange={e => setZoomLevel(Number(e.target.value))}
                                        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    />

                                    {/* Real-time Size Estimation Badge */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Est. Output Size:</span>
                                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 font-mono font-black text-xs text-amber-400 flex items-center gap-1.5">
                                            <FileDown size={13} />
                                            {estimatedSizeKb !== null ? `${estimatedSizeKb} KB` : 'Computing...'}
                                            <span className="text-zinc-500 text-[11px] font-sans">
                                                ({exportFormat.replace('image/', '').toUpperCase()}{exportFormat !== 'image/png' ? ` @ ${exportQuality}%` : ''})
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Canvas Shape & Background Tile Controls */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-semibold">
                                {/* Background Tile */}
                                <div className="space-y-1.5">
                                    <span className="text-[11px] text-zinc-400 uppercase block font-bold">Background Tile</span>
                                    <div className="flex gap-1.5">
                                        {[
                                            { id: 'dark', label: 'Dark Zinc' },
                                            { id: 'black', label: 'True Black' },
                                            { id: 'transparent', label: 'Transparent' }
                                        ].map(b => (
                                            <button
                                                key={b.id}
                                                type="button"
                                                onClick={() => setBgStyle(b.id as any)}
                                                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                    bgStyle === b.id
                                                        ? 'bg-amber-500 text-black shadow-md font-black'
                                                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                                                }`}
                                            >
                                                {b.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Shape Style */}
                                <div className="space-y-1.5">
                                    <span className="text-[11px] text-zinc-400 uppercase block font-bold">Canvas Shape</span>
                                    <div className="flex gap-1.5">
                                        {[
                                            { id: 'rounded', label: 'Rounded 1:1' },
                                            { id: 'circle', label: 'Circle 1:1' },
                                            { id: 'square', label: 'Square' }
                                        ].map(s => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setShapeStyle(s.id as any)}
                                                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                    shapeStyle === s.id
                                                        ? 'bg-amber-500 text-black shadow-md font-black'
                                                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                                                }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ── Background Remover Section ── */}
                            <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black uppercase text-amber-400/90 tracking-wider flex items-center gap-1.5">
                                        <Wand2 size={15} />
                                        <span>Color Key Background Remover</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setEnableBgRemoval(!enableBgRemoval)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            enableBgRemoval
                                                ? 'bg-amber-500 text-black font-black'
                                                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                                        }`}
                                    >
                                        {enableBgRemoval ? 'Active' : 'Enable Keying'}
                                    </button>
                                </div>

                                {enableBgRemoval && (
                                    <div className="space-y-3 pt-2 border-t border-zinc-800 animate-in fade-in duration-100">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className="text-[11px] text-zinc-400 uppercase font-bold">Key Color:</span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setKeyColor('#ffffff')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                                                        keyColor.toLowerCase() === '#ffffff'
                                                            ? 'bg-white text-black border-amber-500 ring-2 ring-amber-500/50'
                                                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                                    }`}
                                                >
                                                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-zinc-400 inline-block" />
                                                    <span>White</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setKeyColor('#000000')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                                                        keyColor.toLowerCase() === '#000000'
                                                            ? 'bg-zinc-950 text-white border-amber-500 ring-2 ring-amber-500/50'
                                                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                                    }`}
                                                >
                                                    <span className="w-2.5 h-2.5 rounded-full bg-black border border-zinc-700 inline-block" />
                                                    <span>Black</span>
                                                </button>

                                                {/* Custom Hex Color Picker */}
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded-lg border border-zinc-700">
                                                    <Palette size={13} className="text-zinc-400" />
                                                    <input
                                                        type="color"
                                                        value={keyColor}
                                                        onChange={e => setKeyColor(e.target.value)}
                                                        className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                                                        title="Pick custom key color"
                                                    />
                                                    <span className="font-mono text-[11px] text-zinc-300 uppercase">{keyColor}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tolerance Slider */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-xs text-zinc-300">
                                                <span>Keying Tolerance:</span>
                                                <span className="font-mono font-bold text-amber-400">{tolerance}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={1}
                                                max={100}
                                                value={tolerance}
                                                onChange={e => setTolerance(Number(e.target.value))}
                                                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Compression & Format Optimizer ── */}
                            <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
                                <span className="text-xs font-black uppercase text-amber-400/90 tracking-wider flex items-center gap-1.5">
                                    <FileDown size={15} />
                                    <span>Compression & Format Optimizer</span>
                                </span>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    {/* Format selector */}
                                    <div className="space-y-1.5">
                                        <span className="text-[11px] text-zinc-400 uppercase block font-bold">Image Format</span>
                                        <div className="flex gap-1.5">
                                            {[
                                                { id: 'image/webp', label: 'WebP (Smallest)' },
                                                { id: 'image/png', label: 'PNG (Lossless)' },
                                                { id: 'image/jpeg', label: 'JPEG' }
                                            ].map(fmt => (
                                                <button
                                                    key={fmt.id}
                                                    type="button"
                                                    onClick={() => setExportFormat(fmt.id as any)}
                                                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                        exportFormat === fmt.id
                                                            ? 'bg-amber-500 text-black shadow-md font-black'
                                                            : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                                                    }`}
                                                >
                                                    {fmt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Quality Slider (for WebP and JPEG) */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs text-zinc-300">
                                            <span className="text-[11px] text-zinc-400 uppercase font-bold">Quality Factor:</span>
                                            <span className="font-mono font-bold text-amber-400">
                                                {exportFormat === 'image/png' ? 'Lossless (100%)' : `${exportQuality}%`}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={10}
                                            max={100}
                                            disabled={exportFormat === 'image/png'}
                                            value={exportQuality}
                                            onChange={e => setExportQuality(Number(e.target.value))}
                                            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-40"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Custom URL Input Fallback */}
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                        <LinkIcon size={14} className="text-zinc-500" />
                        <span>Or Paste Direct Image Link:</span>
                    </label>
                    <input
                        type="url"
                        value={customUrl.startsWith('data:') ? '' : customUrl}
                        onChange={(e) => {
                            setCustomUrl(e.target.value);
                            if (e.target.value.trim()) setSelectedLogo('');
                        }}
                        placeholder="https://example.com/logo.png"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-amber-500 font-mono transition-colors"
                    />
                </div>

                {/* Footer Actions */}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-900">
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
                        disabled={isSaving || (!selectedLogo && !customUrl.trim() && !processedDataUrl)}
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


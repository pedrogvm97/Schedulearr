'use client';

import React, { useState, useEffect } from 'react';
import {
    Sparkles, Check, X, Shield, Lock, Cpu, Cloud, Sliders,
    BookOpen, Film, Tv, Music, AlertCircle, Info, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

export interface AiFeatureItem {
    id: string;
    mediaType: 'audiobooks' | 'movie' | 'show' | 'music';
    name: string;
    description: string;
    enabled: boolean;
    localAi: boolean;
    localAiEngine: string;
    cloudAi: boolean;
    cloudAiEngine: string;
    dependsOn?: string;
}

export function AiFeaturesMatrix() {
    const [audiobooksConfig, setAudiobooksConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Local / video / music feature toggles
    const [mediaFeatures, setMediaFeatures] = useState<Record<string, boolean>>({
        // Video
        subtitles_whisper: true,
        scene_chaptering: true,
        poster_upscale: false,
        // Music
        lyrics_transcribe: true,
        mood_classification: false
    });

    useEffect(() => {
        fetch('/api/theater/audiobooks/studio')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && d.config) {
                    setAudiobooksConfig(d.config);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleSaveAudiobooksConfig = async (patch: any) => {
        const next = { ...(audiobooksConfig || {}), ...patch };
        setAudiobooksConfig(next);
        setSaving(true);
        try {
            await fetch('/api/theater/audiobooks/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save_config', config: next })
            });
            toast.success('AI Matrix Updated');
        } catch {
            toast.error('Failed to save config');
        } finally {
            setSaving(false);
        }
    };

    // Audiobook Features with cascading dependencies
    const abAiOn = audiobooksConfig?.aiFeaturesEnabled !== false;
    const abTransOn = abAiOn && audiobooksConfig?.transcribeEnabled !== false;
    const abScenOn = abTransOn && audiobooksConfig?.sceningEnabled !== false;
    const abImgOn = abScenOn && audiobooksConfig?.imagingEnabled !== false;
    const abVoiceOn = abScenOn && audiobooksConfig?.voiceEnabled !== false;

    const toggleAudiobookFeature = (featId: string) => {
        if (featId === 'transcription') {
            const next = !abTransOn;
            handleSaveAudiobooksConfig({
                transcribeEnabled: next,
                sceningEnabled: next ? (audiobooksConfig?.sceningEnabled !== false) : false,
                imagingEnabled: next ? (audiobooksConfig?.imagingEnabled !== false) : false,
                voiceEnabled: next ? (audiobooksConfig?.voiceEnabled !== false) : false
            });
        } else if (featId === 'scening') {
            const next = !abScenOn;
            handleSaveAudiobooksConfig({
                sceningEnabled: next,
                imagingEnabled: next ? (audiobooksConfig?.imagingEnabled !== false) : false,
                voiceEnabled: next ? (audiobooksConfig?.voiceEnabled !== false) : false
            });
        } else if (featId === 'imaging') {
            const next = !abImgOn;
            handleSaveAudiobooksConfig({
                imagingEnabled: next,
                sceningEnabled: next ? true : abScenOn,
                transcribeEnabled: next ? true : abTransOn
            });
        } else if (featId === 'voice') {
            const next = !abVoiceOn;
            handleSaveAudiobooksConfig({
                voiceEnabled: next,
                sceningEnabled: next ? true : abScenOn,
                transcribeEnabled: next ? true : abTransOn
            });
        }
    };

    const toggleMediaFeature = (key: string, dependsOn?: string) => {
        setMediaFeatures(prev => {
            const current = Boolean(prev[key]);
            const next = !current;
            const updated = { ...prev, [key]: next };
            if (!next && key === 'subtitles_whisper') {
                updated.scene_chaptering = false;
            }
            if (next && dependsOn && !prev[dependsOn]) {
                updated[dependsOn] = true;
            }
            return updated;
        });
        toast.success('Feature toggled');
    };

    const audiobookFeatures: AiFeatureItem[] = [
        {
            id: 'transcription',
            mediaType: 'audiobooks',
            name: '1. Transcription',
            description: 'Automated speech-to-text generating synced lyrics & word timestamps',
            enabled: abTransOn,
            localAi: true,
            localAiEngine: 'Local Faster-Whisper / whisper.cpp',
            cloudAi: true,
            cloudAiEngine: 'OpenAI Whisper / Groq Whisper API'
        },
        {
            id: 'scening',
            mediaType: 'audiobooks',
            name: '2. Scene Detection',
            description: 'Narrative context windows, character tracking & prompt generation',
            enabled: abScenOn,
            localAi: true,
            localAiEngine: 'Local Ollama / Llama 3',
            cloudAi: true,
            cloudAiEngine: 'Google Gemini 2.5 / OpenAI GPT-4o / Claude',
            dependsOn: '1. Transcription'
        },
        {
            id: 'imaging',
            mediaType: 'audiobooks',
            name: '3. Scene Illustration',
            description: 'Visual paintings and artwork for detected chapter scenes',
            enabled: abImgOn,
            localAi: true,
            localAiEngine: 'Local Flux.1 / SDXL / WebUI',
            cloudAi: true,
            cloudAiEngine: 'Google Imagen 3 / OpenAI DALL-E 3',
            dependsOn: '2. Scene Detection'
        },
        {
            id: 'voice',
            mediaType: 'audiobooks',
            name: '4. Voice Narration & Mastering',
            description: 'Voice style adaptation, studio presence, and known person personas',
            enabled: abVoiceOn,
            localAi: true,
            localAiEngine: 'FFmpeg DSP Audio Filters / Kokoro',
            cloudAi: false,
            cloudAiEngine: '100% On-Device DSP',
            dependsOn: '2. Scene Detection'
        }
    ];

    const videoFeatures: AiFeatureItem[] = [
        {
            id: 'subtitles_whisper',
            mediaType: 'movie',
            name: 'Smart Subtitles',
            description: 'Automated subtitle extraction, translation & sync',
            enabled: mediaFeatures.subtitles_whisper,
            localAi: true,
            localAiEngine: 'Faster-Whisper Local',
            cloudAi: true,
            cloudAiEngine: 'Cloud Subtitle APIs'
        },
        {
            id: 'scene_chaptering',
            mediaType: 'movie',
            name: 'Chapter Detection',
            description: 'Automated scene cut boundaries and highlight generation',
            enabled: mediaFeatures.scene_chaptering,
            localAi: true,
            localAiEngine: 'PySceneDetect / OpenCV',
            cloudAi: true,
            cloudAiEngine: 'Gemini 1.5 Video Analysis',
            dependsOn: 'Smart Subtitles'
        },
        {
            id: 'poster_upscale',
            mediaType: 'movie',
            name: 'Artwork Upscaler',
            description: 'High-definition neural upscaling for movie & TV posters',
            enabled: mediaFeatures.poster_upscale,
            localAi: true,
            localAiEngine: 'Real-ESRGAN / Waifu2x',
            cloudAi: false,
            cloudAiEngine: 'On-Device Super-Res'
        }
    ];

    const musicFeatures: AiFeatureItem[] = [
        {
            id: 'lyrics_transcribe',
            mediaType: 'music',
            name: 'Synced Lyrics',
            description: 'Karaoke-style timestamped lyrics matched to tracks',
            enabled: mediaFeatures.lyrics_transcribe,
            localAi: true,
            localAiEngine: 'Faster-Whisper / LRCLIB',
            cloudAi: true,
            cloudAiEngine: 'Musixmatch / Genius Cloud'
        },
        {
            id: 'mood_classification',
            mediaType: 'music',
            name: 'Mood & Genre Tags',
            description: 'Neural tempo, mood, and valence acoustic classification',
            enabled: mediaFeatures.mood_classification,
            localAi: true,
            localAiEngine: 'Essentia / MusicNN',
            cloudAi: false,
            cloudAiEngine: 'On-Device Audio DSP'
        }
    ];

    const renderFeatureRow = (feat: AiFeatureItem, onToggle: () => void) => {
        return (
            <tr key={feat.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40 transition-colors">
                <td className="py-4 px-4 sm:px-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                            <span className="font-black text-white text-base">{feat.name}</span>
                            {feat.dependsOn && (
                                <span className="px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-amber-400">
                                    Requires {feat.dependsOn}
                                </span>
                            )}
                        </div>
                        
                    </div>
                </td>
                <td className="py-4 px-4 text-center">
                    <button
                        onClick={onToggle}
                        title={feat.enabled ? "Click to turn off" : "Click to turn on"}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                            feat.enabled
                                ? 'bg-emerald-500 text-black shadow-md'
                                : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                    >
                        {feat.enabled ? 'ON' : 'OFF'}
                    </button>
                </td>
                <td className="py-4 px-4 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800" title={feat.localAiEngine}>
                        {feat.localAi ? (
                            <>
                                <Check size={16} className="text-emerald-400 shrink-0" />
                                <span className="text-xs font-bold text-zinc-300">Local AI</span>
                            </>
                        ) : (
                            <span className="text-xs font-bold text-zinc-600">—</span>
                        )}
                    </div>
                </td>
                <td className="py-4 px-4 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800" title={feat.cloudAiEngine}>
                        {feat.cloudAi ? (
                            <>
                                <Check size={16} className="text-sky-400 shrink-0" />
                                <span className="text-xs font-bold text-zinc-300">Cloud AI</span>
                            </>
                        ) : (
                            <span className="text-xs font-bold text-zinc-600">—</span>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header */}
            <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
                        <Sliders size={28} className="text-purple-400" />
                        Features
                    </h2>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            const next = !abAiOn;
                            handleSaveAudiobooksConfig({ aiFeaturesEnabled: next });
                        }}
                        className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all ${
                            abAiOn ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-zinc-800 text-zinc-400'
                        }`}
                    >
                        <Sparkles size={16} />
                        <span>Master AI: {abAiOn ? 'ON' : 'OFF'}</span>
                    </button>
                </div>
            </div>

            {/* Matrix Table */}
            <div className="rounded-3xl bg-zinc-950/90 border border-zinc-800 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-900/70 text-xs font-black uppercase tracking-wider text-zinc-400">
                                <th className="py-4 px-6">Media Library &amp; Feature</th>
                                <th className="py-4 px-4 text-center">Status</th>
                                <th className="py-4 px-4 text-center">
                                    <div className="inline-flex items-center gap-1.5 text-emerald-400">
                                        <Cpu size={15} />
                                        <span>Local AI</span>
                                    </div>
                                </th>
                                <th className="py-4 px-4 text-center">
                                    <div className="inline-flex items-center gap-1.5 text-sky-400">
                                        <Cloud size={15} />
                                        <span>Cloud AI (API Key)</span>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                            {/* Group 1: Audiobooks */}
                            <tr className="bg-amber-500/10">
                                <td colSpan={4} className="py-3 px-6 text-sm font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
                                    <BookOpen size={20} /> Books
                                </td>
                            </tr>
                            {audiobookFeatures.map(f => renderFeatureRow(f, () => toggleAudiobookFeature(f.id)))}

                            {/* Group 2: Movies & Series */}
                            <tr className="bg-indigo-500/10">
                                <td colSpan={4} className="py-3 px-6 text-sm font-black text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                                    <Film size={20} /> Video
                                </td>
                            </tr>
                            {videoFeatures.map(f => renderFeatureRow(f, () => toggleMediaFeature(f.id, f.dependsOn ? 'subtitles_whisper' : undefined)))}

                            {/* Group 3: Music */}
                            <tr className="bg-emerald-500/10">
                                <td colSpan={4} className="py-3 px-6 text-sm font-black text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                                    <Music size={20} /> Music
                                </td>
                            </tr>
                            {musicFeatures.map(f => renderFeatureRow(f, () => toggleMediaFeature(f.id)))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

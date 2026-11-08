// Pure TypeScript interfaces and client-safe constants for Audiobook Studio
// (No Node.js built-ins like fs, child_process, or better-sqlite3)

export interface BookPortfolioCharacter {
    id: string;
    name: string;
    role: string;
    appearance: string;
    clothing: string;
    personality?: string;
    imageUrl?: string;
    imagePrompt?: string;
}

export interface BookPortfolioLocation {
    id: string;
    name: string;
    era?: string;
    visualDescription: string;
    imageUrl?: string;
    imagePrompt?: string;
}

export interface BookVisualPortfolio {
    bookKey: string;
    bookTitle: string;
    author: string;
    summary: string;
    characters: BookPortfolioCharacter[];
    locations: BookPortfolioLocation[];
    updatedAt: string;
}

export interface CuratedVoiceProfile {
    id: string;
    name: string;
    subtitle: string;
    gender: 'male' | 'female' | 'neutral';
    category: 'tone' | 'timbre' | 'iconic' | 'classic' | 'intimate' | 'broadcast' | 'person';
    type: 'tone' | 'timbre';
    description: string;
    tags: string[];
    pitchOffset: number;
    color: string;
    modelName?: string;
    avatarUrl?: string;
}

// ── Real Iconic Person Voices (Known Real Human Models) ──
export interface RealPersonVoice {
    id: string;
    name: string;
    subtitle: string;
    description: string;
    isOriginal?: boolean;
    color: string;
    tags: string[];
    engineType: 'original' | 'dsp' | 'neural';
    engineLabel: string;
}

export const REAL_PERSON_VOICES: RealPersonVoice[] = [
    {
        id: 'original',
        name: 'Original Audio',
        subtitle: 'Authentic Recording',
        description: 'Preserve authentic book reader recording with zero alterations.',
        isOriginal: true,
        color: 'from-zinc-700 to-zinc-900',
        tags: ['Original', 'Lossless'],
        engineType: 'original',
        engineLabel: 'Original Recording'
    },
    {
        id: 'studio_clarity',
        name: 'Studio Clarity',
        subtitle: 'Speech Denoise & EQ',
        description: 'Clean acoustic denoise, balanced speech EQ, vocal presence boost, and dynamic normalization.',
        color: 'from-emerald-700 to-teal-950',
        tags: ['Denoise', 'Presence'],
        engineType: 'dsp',
        engineLabel: 'FFmpeg Real-Time DSP'
    },
    {
        id: 'warm_mids',
        name: 'Warm Mids EQ',
        subtitle: 'Fireside Warmth',
        description: 'Smooth lower-mid presence, cozy acoustics, and zero listener fatigue.',
        color: 'from-amber-700 to-orange-950',
        tags: ['Warmth', 'Zero Fatigue'],
        engineType: 'dsp',
        engineLabel: 'FFmpeg Real-Time DSP'
    },
    {
        id: 'deep_baritone',
        name: 'Deep Baritone',
        subtitle: 'Sub-Harmonics Resonance',
        description: 'Imposing acoustic depth with rich chest sub-harmonics for epic narration.',
        color: 'from-purple-800 to-indigo-950',
        tags: ['Sub-Bass', 'Resonance'],
        engineType: 'dsp',
        engineLabel: 'FFmpeg Real-Time DSP'
    },
    {
        id: 'midnight_leveler',
        name: 'Midnight Leveler',
        subtitle: 'Broadcast Compression',
        description: 'Analog broadcast compression, silky rolled-off highs, and intimate dynamic control.',
        color: 'from-blue-800 to-slate-950',
        tags: ['Broadcast', 'Dynamic Leveler'],
        engineType: 'dsp',
        engineLabel: 'FFmpeg Real-Time DSP'
    },
    {
        id: 'kokoro_af_heart',
        name: 'Kokoro (af_heart)',
        subtitle: 'US Female Narrator',
        description: 'Hexgrad Kokoro-82M v0.19 open-weights neural TTS with natural phrasing.',
        color: 'from-rose-600 to-pink-950',
        tags: ['Kokoro-82M', 'Neural TTS'],
        engineType: 'neural',
        engineLabel: 'Kokoro-82M Neural Model'
    },
    {
        id: 'kokoro_am_adam',
        name: 'Kokoro (am_adam)',
        subtitle: 'US Male Narrator',
        description: 'Hexgrad Kokoro-82M rich male baritone with commanding pacing.',
        color: 'from-amber-600 to-yellow-950',
        tags: ['Kokoro-82M', 'Neural TTS'],
        engineType: 'neural',
        engineLabel: 'Kokoro-82M Neural Model'
    },
    {
        id: 'kokoro_bf_emma',
        name: 'Kokoro (bf_emma)',
        subtitle: 'UK Female Narrator',
        description: 'Hexgrad Kokoro-82M British female neural model with refined cadence.',
        color: 'from-purple-600 to-fuchsia-950',
        tags: ['Kokoro-82M', 'Neural TTS'],
        engineType: 'neural',
        engineLabel: 'Kokoro-82M Neural Model'
    }
];

export interface VoiceStylePreset {
    id: string;
    label: string;
    subtitle: string;
    description: string;
    color: string;
}

export const VOICE_STYLE_PRESETS: VoiceStylePreset[] = [
    {
        id: 'warm',
        label: 'Warm Storyteller',
        subtitle: 'Fireside Warmth & Zero Fatigue',
        description: 'Smooth lower-mid presence, cozy dynamics, zero harshness.',
        color: 'border-amber-500/50 text-amber-300'
    },
    {
        id: 'bright',
        label: 'Bright & Articulate',
        subtitle: 'Vocal Clarity & Modern EQ',
        description: 'Airy highs, articulate consonants, modern audiobook broadcast fidelity.',
        color: 'border-sky-500/50 text-sky-300'
    },
    {
        id: 'cheerful',
        label: 'Cheerful & Vibrant',
        subtitle: 'Uplifting Pace & Dynamic Energy',
        description: 'Lively narrative cadence with buoyant dialogue phrasing.',
        color: 'border-emerald-500/50 text-emerald-300'
    },
    {
        id: 'deep',
        label: 'Deep Baritone',
        subtitle: 'Cinematic Sub-Harmonics & Gravitas',
        description: 'Resonant low-frequency presence suited for epic sagas.',
        color: 'border-purple-500/50 text-purple-300'
    },
    {
        id: 'studio',
        label: 'Studio Neutral',
        subtitle: 'Clean Acoustic Normalization',
        description: 'Balanced uncolored mastering with pure studio dynamic control.',
        color: 'border-zinc-500/50 text-zinc-300'
    }
];

export function calculateVoiceCombinations(
    styles: string[],
    persons: string[]
): {
    totalExtraIterations: number;
    summaryText: string;
    combinations: Array<{ styleId: string; personId: string; label: string }>;
} {
    const validStyles = styles.length > 0 ? styles : ['warm'];
    const validPersons = persons.length > 0 ? persons : ['original'];

    const hasOriginal = validPersons.includes('original');
    const extraPersons = validPersons.filter(p => p !== 'original');

    const combinations: Array<{ styleId: string; personId: string; label: string }> = [];

    // Combinations of styles with original voice
    if (hasOriginal) {
        validStyles.forEach(s => {
            const stObj = VOICE_STYLE_PRESETS.find(x => x.id === s);
            combinations.push({
                styleId: s,
                personId: 'original',
                label: `Original Voice (${stObj?.label || s})`
            });
        });
    }

    // Combinations of styles with extra personas
    extraPersons.forEach(p => {
        const pObj = REAL_PERSON_VOICES.find(x => x.id === p);
        validStyles.forEach(s => {
            const stObj = VOICE_STYLE_PRESETS.find(x => x.id === s);
            combinations.push({
                styleId: s,
                personId: p,
                label: `${pObj?.name || p} (${stObj?.label || s})`
            });
        });
    });

    const totalExtraIterations = combinations.length;
    const summaryText = `1 + ${totalExtraIterations} Available (Original + ${totalExtraIterations} Generated Iterations)`;

    return {
        totalExtraIterations,
        summaryText,
        combinations
    };
}

// ── Column 1: Tone (Acoustic Clarity & Studio Mastering) ──
export const AUDIOBOOK_VOICE_TONE_PRESETS: CuratedVoiceProfile[] = [
    {
        id: 'clear_voice',
        name: 'Studio Clarity',
        subtitle: 'Denoise & Vocal Presence',
        gender: 'neutral',
        category: 'tone',
        type: 'tone',
        description: 'Clean acoustic denoise, balanced speech EQ, vocal presence boost, and dynamic normalization.',
        tags: ['Speech Clarity', 'Anti-Rumble', 'Balanced'],
        pitchOffset: 0,
        color: 'from-emerald-600 to-teal-800'
    },
    {
        id: 'warm_bass',
        name: 'Warm Storyteller',
        subtitle: 'Fireside Warmth & Zero Fatigue',
        gender: 'neutral',
        category: 'tone',
        type: 'tone',
        description: 'Cozy, inviting acoustic balance with gentle lower-mid warmth, smooth compression, and zero listener fatigue.',
        tags: ['Cozy Fireside', 'Zero Fatigue', 'Natural Warmth'],
        pitchOffset: -4,
        color: 'from-amber-500 to-orange-700'
    },
    {
        id: 'crystal_voice',
        name: 'Crystal Presence',
        subtitle: 'High-Fidelity Intelligibility',
        gender: 'neutral',
        category: 'tone',
        type: 'tone',
        description: 'Pristine high-definition articulation, cutting-edge sibilance management, and razor-sharp intelligibility.',
        tags: ['Crisp Presence', 'High Intelligibility', 'Modern EQ'],
        pitchOffset: 2,
        color: 'from-cyan-500 to-blue-700'
    },
    {
        id: 'deep_pitch',
        name: 'Deep Baritone',
        subtitle: 'Cinematic Sub-Harmonics & Depth',
        gender: 'male',
        category: 'tone',
        type: 'tone',
        description: 'Imposing cinematic depth with rich sub-harmonics, tailored for high-stakes space operas and epic fantasy.',
        tags: ['Epic Depth', 'Resonant Sub-Bass', 'Cinematic'],
        pitchOffset: -8,
        color: 'from-purple-600 to-indigo-900'
    },
    {
        id: 'crisp_treble',
        name: 'Crisp Articulation',
        subtitle: 'Modern Podcast & Voiceover',
        gender: 'neutral',
        category: 'tone',
        type: 'tone',
        description: 'Fast-response broadcast compression, upper-mid presence lift, and articulate consonants for clarity.',
        tags: ['Broadcast', 'Articulate', 'Airy Top-End'],
        pitchOffset: 3,
        color: 'from-sky-500 to-indigo-700'
    },
    {
        id: 'night_compress',
        name: 'Midnight FM',
        subtitle: 'Vintage Tube Warmth & Rolled-Off Highs',
        gender: 'neutral',
        category: 'tone',
        type: 'tone',
        description: 'Analog broadcast compression, silky rolled-off highs, and intimate FM broadcast presence for late-night listening.',
        tags: ['Analog Tube', 'FM Broadcast', 'Night Companion'],
        pitchOffset: -5,
        color: 'from-violet-600 to-fuchsia-900'
    },
    {
        id: 'vintage_restore',
        name: 'Vintage Tape',
        subtitle: 'Warm Analog Tape Restoration',
        gender: 'neutral',
        category: 'tone',
        type: 'tone',
        description: 'Nostalgic tape saturation curves, gentle flutter reduction, and warm rounded acoustic dynamics.',
        tags: ['Analog Tape', 'Vintage Warmth', 'Classic Book'],
        pitchOffset: 0,
        color: 'from-amber-700 to-yellow-900'
    },
    {
        id: 'original',
        name: 'Original Master',
        subtitle: 'Clean Normalization Only',
        gender: 'neutral',
        category: 'tone',
        type: 'tone',
        description: 'Preserves the original narrator voice with zero pitch manipulation, applying only clean studio noise reduction.',
        tags: ['Pure Voice', 'Original Actor', 'Lossless Pitch'],
        pitchOffset: 0,
        color: 'from-zinc-600 to-zinc-800'
    }
];

// ── Column 2: Authentic Open-Weights Neural Voice Models (Kokoro-82M & Piper ONNX) ──
export const AUDIOBOOK_VOICE_TIMBRE_PRESETS: CuratedVoiceProfile[] = [
    {
        id: 'kokoro_af_heart',
        name: 'Kokoro (af_heart)',
        subtitle: 'Natural Audiobook Narrator',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Hexgrad Kokoro-82M v0.19 open-weights neural model. Velvety natural phrasing and expressive audiobook cadence.',
        tags: ['Female', 'US Accent', 'Kokoro-82M', 'Warm Narration'],
        pitchOffset: 0,
        color: 'from-rose-500 to-pink-800',
        modelName: 'af_heart (Kokoro-82M)'
    },
    {
        id: 'kokoro_bf_emma',
        name: 'Kokoro (bf_emma)',
        subtitle: 'Classic British Literature',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Hexgrad Kokoro-82M British female neural model with refined Austen cadence, articulate consonants, and elegant tone.',
        tags: ['Female', 'UK Accent', 'Kokoro-82M', 'Classic British'],
        pitchOffset: 0,
        color: 'from-purple-600 to-indigo-800',
        modelName: 'bf_emma (Kokoro-82M)'
    },
    {
        id: 'kokoro_af_bella',
        name: 'Kokoro (af_bella)',
        subtitle: 'Crisp Dynamic Storyteller',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Hexgrad Kokoro-82M dynamic neural voice. Crisp clarity, high intelligibility, and vibrant dialogue contrast.',
        tags: ['Female', 'US Accent', 'Kokoro-82M', 'Crisp Dynamic'],
        pitchOffset: 0,
        color: 'from-pink-500 to-rose-700',
        modelName: 'af_bella (Kokoro-82M)'
    },
    {
        id: 'kokoro_af_nicole',
        name: 'Kokoro (af_nicole)',
        subtitle: 'Bedside Soft Storyteller',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Hexgrad Kokoro-82M intimate neural voice with gentle bedside cadence and zero listener fatigue.',
        tags: ['Female', 'US Accent', 'Kokoro-82M', 'Bedside Soft'],
        pitchOffset: 0,
        color: 'from-teal-600 to-emerald-800',
        modelName: 'af_nicole (Kokoro-82M)'
    },
    {
        id: 'kokoro_am_adam',
        name: 'Kokoro (am_adam)',
        subtitle: 'Deep Baritone Narrator',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Hexgrad Kokoro-82M rich male baritone with cinematic gravitas, commanding pacing, and deep chest resonance.',
        tags: ['Male', 'US Accent', 'Kokoro-82M', 'Cinematic Depth'],
        pitchOffset: 0,
        color: 'from-amber-600 to-yellow-800',
        modelName: 'am_adam (Kokoro-82M)'
    },
    {
        id: 'kokoro_bm_george',
        name: 'Kokoro (bm_george)',
        subtitle: 'BBC Classic Heritage',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Hexgrad Kokoro-82M British male model with distinguished Oxford cadence, measured delivery, and historical presence.',
        tags: ['Male', 'UK Accent', 'Kokoro-82M', 'BBC Heritage'],
        pitchOffset: 0,
        color: 'from-emerald-600 to-teal-800',
        modelName: 'bm_george (Kokoro-82M)'
    },
    {
        id: 'piper_libritts_f',
        name: 'Piper LibriTTS',
        subtitle: 'Local VITS Audiobook Model',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Rhasspy Piper local high-speed ONNX VITS model trained specifically on LibriTTS audiobooks.',
        tags: ['Female', 'US Accent', 'Piper ONNX', 'Local VITS'],
        pitchOffset: 0,
        color: 'from-blue-600 to-indigo-800',
        modelName: 'en_US-libritts_r-medium'
    },
    {
        id: 'piper_alan_m',
        name: 'Piper Alan',
        subtitle: 'British Documentary ONNX',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Rhasspy Piper local ONNX model with articulate British non-fiction cadence and clear pronunciation.',
        tags: ['Male', 'UK Accent', 'Piper ONNX', 'Documentary'],
        pitchOffset: 0,
        color: 'from-cyan-600 to-teal-800',
        modelName: 'en_GB-alan-medium'
    }
];

export const ALL_AUDIOBOOK_VOICE_PRESETS: CuratedVoiceProfile[] = [
    ...AUDIOBOOK_VOICE_TONE_PRESETS,
    ...AUDIOBOOK_VOICE_TIMBRE_PRESETS
];

export const CURATED_VOICE_PROFILES: CuratedVoiceProfile[] = ALL_AUDIOBOOK_VOICE_PRESETS;

export const getVoicePresetById = (id?: string): CuratedVoiceProfile => {
    if (!id) return AUDIOBOOK_VOICE_TONE_PRESETS[0];
    const match = ALL_AUDIOBOOK_VOICE_PRESETS.find(p => p.id === id || p.modelName === id);
    if (match) return match;
    // Map legacy aliases & previous neural models safely
    if (id === 'ava_neural' || id === 'scarlett_johansson' || id === 'ava') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[0];
    if (id === 'sonia_neural' || id === 'ygritte' || id === 'sonia') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[1];
    if (id === 'emma_neural' || id === 'ana_de_armas' || id === 'emma') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[2];
    if (id === 'jenny_neural' || id === 'jenny') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[3];
    if (id === 'christopher_neural' || id === 'morgan_freeman' || id === 'nelson_mandela' || id === 'barack_obama' || id === 'mlk' || id === 'jon_snow' || id === 'christopher') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[4];
    if (id === 'ryan_neural' || id === 'attenborough' || id === 'ryan') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[5];
    if (id === 'guy_neural' || id === 'tom_cruise' || id === 'robert_downey_jr' || id === 'jack_sparrow' || id === 'snoop_dogg' || id === 'donald_trump' || id === 'guy') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[6];
    if (id === 'denoise_clarity') return AUDIOBOOK_VOICE_TONE_PRESETS[0];
    if (id === 'warm_storyteller') return AUDIOBOOK_VOICE_TONE_PRESETS[1];
    if (id === 'deep_narrator') return AUDIOBOOK_VOICE_TONE_PRESETS[3];
    if (id === 'crisp_clear') return AUDIOBOOK_VOICE_TONE_PRESETS[4];
    if (id === 'late_night_radio') return AUDIOBOOK_VOICE_TONE_PRESETS[5];
    return AUDIOBOOK_VOICE_TONE_PRESETS[0];
};

export const resolveSmartAutoArtStyle = (book?: any, rawStyle?: string): string => {
    const chosen = (rawStyle || '').trim();
    if (chosen && chosen.toLowerCase() !== 'auto') {
        return chosen;
    }
    const haystack = `${book?.title || ''} ${book?.cleanTitle || ''} ${book?.genre || ''} ${book?.inferredCollection || ''} ${book?.collection || ''} ${book?.author || ''} ${book?.summary || ''}`.toLowerCase();
    
    if (/sci-fi|science fiction|space|galaxy|cyber|star|quantum|orbit|dune|revelation|robot|alien|void/.test(haystack)) {
        return 'Cinematic Sci-Fi Concept Art';
    }
    if (/fantasy|magic|dragon|sword|witch|wizard|lord|realm|king|queen|throne|sorcery/.test(haystack)) {
        return 'Atmospheric High Fantasy Painting';
    }
    if (/horror|dark|gothic|vampire|ghost|demon|lovecraft|nightmare|macabre/.test(haystack)) {
        return 'Dark Atmospheric Gothic Illustration';
    }
    if (/history|historical|war|biography|memoir|classic|philosophy|ancient/.test(haystack)) {
        return 'Vintage Classic Book Engraving & Oil';
    }
    if (/watercolor|children|fable|tale|storybook|cozy/.test(haystack)) {
        return 'Storybook Watercolor';
    }
    if (/noir|detective|crime|mystery|thriller|spy/.test(haystack)) {
        return 'Moody Noir & Neon Film Still';
    }
    return 'Cinematic Concept Art';
};


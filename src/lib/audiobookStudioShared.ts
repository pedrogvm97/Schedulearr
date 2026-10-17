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
    category: 'tone' | 'timbre' | 'iconic' | 'classic' | 'intimate' | 'broadcast';
    type: 'tone' | 'timbre';
    description: string;
    tags: string[];
    pitchOffset: number;
    color: string;
    modelName?: string;
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

// ── Column 2: Neural Voice Personas (Authentic Edge Neural Models) ──
export const AUDIOBOOK_VOICE_TIMBRE_PRESETS: CuratedVoiceProfile[] = [
    {
        id: 'ava_neural',
        name: 'Ava Neural',
        subtitle: 'Studio Intimate Storyteller',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Authentic neural voice model with velvety bedside intimacy, natural phrasing, and warm acoustic presence.',
        tags: ['Female', 'US Accent', 'Neural TTS', 'Bedside Velvet'],
        pitchOffset: 0,
        color: 'from-rose-500 to-pink-800',
        modelName: 'en-US-AvaNeural'
    },
    {
        id: 'sonia_neural',
        name: 'Sonia Neural',
        subtitle: 'Elegant British Narration',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Sophisticated British neural model with crisp BBC articulation, refined cadence, and aristocratic clarity.',
        tags: ['Female', 'UK Accent', 'Neural TTS', 'Classic BBC'],
        pitchOffset: 0,
        color: 'from-purple-600 to-indigo-800',
        modelName: 'en-GB-SoniaNeural'
    },
    {
        id: 'emma_neural',
        name: 'Emma Neural',
        subtitle: 'Clear Storybook & Drama',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Expressive neural actress with melodic warmth, vibrant dialogue inflection, and exceptional character range.',
        tags: ['Female', 'US Accent', 'Neural TTS', 'Expressive Drama'],
        pitchOffset: 0,
        color: 'from-pink-500 to-rose-700',
        modelName: 'en-US-EmmaNeural'
    },
    {
        id: 'jenny_neural',
        name: 'Jenny Neural',
        subtitle: 'Natural Expressive Voiceover',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Engaging, clear conversational neural delivery suitable for long-form literature and non-fiction.',
        tags: ['Female', 'US Accent', 'Neural TTS', 'Natural'],
        pitchOffset: 0,
        color: 'from-teal-600 to-emerald-800',
        modelName: 'en-US-JennyNeural'
    },
    {
        id: 'christopher_neural',
        name: 'Christopher Neural',
        subtitle: 'Cinematic Baritone Depth',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Deep authoritative chest resonance with cinematic gravitas, commanding pacing, and moral weight.',
        tags: ['Male', 'US Accent', 'Neural TTS', 'Cinematic Depth'],
        pitchOffset: 0,
        color: 'from-amber-600 to-yellow-800',
        modelName: 'en-US-ChristopherNeural'
    },
    {
        id: 'ryan_neural',
        name: 'Ryan Neural',
        subtitle: 'Natural British Storyteller',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Naturalist cadence with quiet wonder, articulate British consonants, and engaging documentary flair.',
        tags: ['Male', 'UK Accent', 'Neural TTS', 'Naturalist'],
        pitchOffset: 0,
        color: 'from-emerald-600 to-teal-800',
        modelName: 'en-GB-RyanNeural'
    },
    {
        id: 'guy_neural',
        name: 'Guy Neural',
        subtitle: 'Dynamic Broadcast Energy',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Charismatic, forward-focused narrative drive with clear broadcast projection and confident articulation.',
        tags: ['Male', 'US Accent', 'Neural TTS', 'Dynamic Drive'],
        pitchOffset: 0,
        color: 'from-blue-600 to-indigo-800',
        modelName: 'en-US-GuyNeural'
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
    // Map legacy aliases to real neural models
    if (id === 'scarlett_johansson' || id === 'ava') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[0];
    if (id === 'ygritte' || id === 'sonia') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[1];
    if (id === 'ana_de_armas' || id === 'emma') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[2];
    if (id === 'jenny') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[3];
    if (id === 'morgan_freeman' || id === 'nelson_mandela' || id === 'barack_obama' || id === 'mlk' || id === 'jon_snow' || id === 'christopher') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[4];
    if (id === 'attenborough' || id === 'ryan') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[5];
    if (id === 'tom_cruise' || id === 'robert_downey_jr' || id === 'jack_sparrow' || id === 'snoop_dogg' || id === 'donald_trump' || id === 'guy') return AUDIOBOOK_VOICE_TIMBRE_PRESETS[6];
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


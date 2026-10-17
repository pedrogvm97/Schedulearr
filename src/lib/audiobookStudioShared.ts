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

// ── Column 2: Timbre (Custom Personas & Iconic Resonances) ──
export const AUDIOBOOK_VOICE_TIMBRE_PRESETS: CuratedVoiceProfile[] = [
    {
        id: 'nelson_mandela',
        name: 'Nelson Mandela',
        subtitle: 'Wise Dignity & Moral Gravitas',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Profound statesman dignity, slow deliberate cadence, deep warm chest resonance, and reflective wisdom.',
        tags: ['Wise Statesman', 'Deep Gravitas', 'Slow Measured Cadence'],
        pitchOffset: -12,
        color: 'from-amber-600 to-emerald-800'
    },
    {
        id: 'mlk',
        name: 'Martin Luther King Jr.',
        subtitle: 'Resonant Oratorical Passion',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Melodic rhetorical rise and fall, commanding mid-baritone resonance, and stirring historical oratorical power.',
        tags: ['Oratorical Power', 'Melodic Rhythm', 'Passionate Mid-Bass'],
        pitchOffset: -8,
        color: 'from-indigo-600 to-blue-900'
    },
    {
        id: 'scarlett_johansson',
        name: 'Scarlett Johansson',
        subtitle: 'Intimate Velvet & Bedside Whisper',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Silky close-mic presence, breathy subtle huskiness, intimate bedside storytelling tone, and velvet warmth.',
        tags: ['Intimate Velvet', 'Breathy Whisper', 'Bedside', 'Sensual Warmth'],
        pitchOffset: 2,
        color: 'from-rose-500 to-pink-800'
    },
    {
        id: 'morgan_freeman',
        name: 'Morgan Freeman',
        subtitle: 'Authoritative Wisdom & Chest Rumble',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Deep authoritative resonance, warm baritone chest rumble, slow deliberate cadence, and iconic gravitas.',
        tags: ['Authoritative', 'Deep Bass', 'Cinematic', 'Gravitas'],
        pitchOffset: -11,
        color: 'from-amber-600 to-yellow-800'
    },
    {
        id: 'barack_obama',
        name: 'Barack Obama',
        subtitle: 'Melodic Rhetoric & Measured Cadence',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Melodic rhetorical cadence, signature deliberate pacing, warm mid-range baritone clarity, and measured gravitas.',
        tags: ['Rhythmic', 'Oratorical', 'Warm Baritone', 'Measured'],
        pitchOffset: -7,
        color: 'from-blue-600 to-indigo-800'
    },
    {
        id: 'attenborough',
        name: 'Sir David Attenborough',
        subtitle: 'Naturalist Wonder & British Cadence',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Quiet breathless wonder, precise BBC naturalist articulation, gentle grandfatherly warmth, and reverence.',
        tags: ['British Accent', 'Naturalist', 'Quiet Wonder', 'Articulate'],
        pitchOffset: -3,
        color: 'from-emerald-600 to-teal-800'
    },
    {
        id: 'tom_cruise',
        name: 'Tom Cruise',
        subtitle: 'Dynamic Cinematic Drive & Energy',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Crisp energetic articulation, commanding forward focus, charismatic cinematic drive, and confident pacing.',
        tags: ['Cinematic Energy', 'Dynamic Drive', 'Confident Articulation'],
        pitchOffset: 3,
        color: 'from-red-600 to-amber-700'
    },
    {
        id: 'ana_de_armas',
        name: 'Ana de Armas',
        subtitle: 'Soft Melodic Warmth & Intimacy',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Soft expressive cadence, gentle breathy warmth, delicate melodic inflection, and intimate cinema tone.',
        tags: ['Melodic Warmth', 'Delicate Presence', 'Intimate Cinema'],
        pitchOffset: 5,
        color: 'from-pink-500 to-purple-800'
    },
    {
        id: 'jack_sparrow',
        name: 'Captain Jack Sparrow',
        subtitle: 'Whimsical Rogue Flair & Swashbuckler Charisma',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Eccentric pirate charm, slurred playful theatrical cadence, unpredictable rhythm, and whimsical rogue wit.',
        tags: ['Swashbuckler', 'Pirate Charisma', 'Theatrical', 'Whimsical'],
        pitchOffset: -1,
        color: 'from-amber-600 to-red-800'
    },
    {
        id: 'jon_snow',
        name: 'Jon Snow',
        subtitle: 'Brooding Heroic Northern Cadence',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Earnest northern British rasp, quiet stoic intensity, brooding vulnerability, and battle-hardened gravity.',
        tags: ['Northern British', 'Stoic Hero', 'Brooding', 'Grit'],
        pitchOffset: -4,
        color: 'from-slate-600 to-zinc-900'
    },
    {
        id: 'ygritte',
        name: 'Ygritte',
        subtitle: 'Wildling Spirit & Playful Husky Warmth',
        gender: 'female',
        category: 'timbre',
        type: 'timbre',
        description: 'Feisty northern lilt, fiery spirited cadence, husky playful rasp, and untamed adventurous resonance.',
        tags: ['Northern Lilt', 'Husky Rasp', 'Wildling Spirit', 'Playful'],
        pitchOffset: 3,
        color: 'from-orange-500 to-red-800'
    },
    {
        id: 'robert_downey_jr',
        name: 'Robert Downey Jr.',
        subtitle: 'Charismatic Witty Cadence & Fast Presence',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Rapid-fire witty articulation, magnetic charisma, sarcastic intellectual bite, and effortless narrative flair.',
        tags: ['Charismatic Wit', 'Rapid-Fire', 'Intellectual', 'MCU Presence'],
        pitchOffset: -2,
        color: 'from-amber-500 to-rose-700'
    },
    {
        id: 'donald_trump',
        name: 'Donald Trump',
        subtitle: 'Iconic Emphatic Cadence & Rhythmic Inflection',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Distinctive punchy cadence, high-contrast dynamic inflection, repetitive oratorical cadence, and unmistakable presence.',
        tags: ['Punchy Cadence', 'High Dynamic', 'Unmistakable', 'New York'],
        pitchOffset: -3,
        color: 'from-yellow-600 to-red-700'
    },
    {
        id: 'snoop_dogg',
        name: 'Snoop Dogg',
        subtitle: 'Ultra-Smooth West Coast Laid-Back Drawl',
        gender: 'male',
        category: 'timbre',
        type: 'timbre',
        description: 'Silky smooth conversational drawl, relaxed melodic delivery, rhythmic cadence, and effortlessly chill storytelling.',
        tags: ['West Coast', 'Laid-Back Drawl', 'Smooth Melodic', 'Chill'],
        pitchOffset: -5,
        color: 'from-teal-600 to-emerald-900'
    }
];

export const ALL_AUDIOBOOK_VOICE_PRESETS: CuratedVoiceProfile[] = [
    ...AUDIOBOOK_VOICE_TONE_PRESETS,
    ...AUDIOBOOK_VOICE_TIMBRE_PRESETS
];

export const CURATED_VOICE_PROFILES: CuratedVoiceProfile[] = ALL_AUDIOBOOK_VOICE_PRESETS;

export const getVoicePresetById = (id?: string): CuratedVoiceProfile => {
    if (!id) return AUDIOBOOK_VOICE_TONE_PRESETS[0];
    const match = ALL_AUDIOBOOK_VOICE_PRESETS.find(p => p.id === id);
    if (match) return match;
    // Map legacy aliases
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


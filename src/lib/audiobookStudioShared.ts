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
    category: 'iconic' | 'classic' | 'intimate' | 'broadcast';
    description: string;
    tags: string[];
    pitchOffset: number;
    color: string;
}

export const CURATED_VOICE_PROFILES: CuratedVoiceProfile[] = [
    {
        id: 'morgan_freeman',
        name: 'Morgan Freeman',
        subtitle: 'The Voice of God & Wisdom',
        gender: 'male',
        category: 'iconic',
        description: 'Deep authoritative resonance, warm baritone chest rumble, slow deliberate cadence and profound gravitas.',
        tags: ['Authoritative', 'Deep Bass', 'Cinematic', 'Gravitas'],
        pitchOffset: -11,
        color: 'from-amber-600 to-yellow-800'
    },
    {
        id: 'barack_obama',
        name: 'Barack Obama',
        subtitle: 'Oratorical Rhythm & Presence',
        gender: 'male',
        category: 'iconic',
        description: 'Melodic rhetorical cadence, signature deliberate pacing, warm mid-range baritone clarity, and measured gravitas.',
        tags: ['Rhythmic', 'Oratorical', 'Warm Baritone', 'Measured'],
        pitchOffset: -7,
        color: 'from-blue-600 to-indigo-800'
    },
    {
        id: 'scarlett_johansson',
        name: 'Scarlett Johansson',
        subtitle: 'Intimate Velvet & Warm Whisper',
        gender: 'female',
        category: 'intimate',
        description: 'Silky close-mic presence, breathy subtle huskiness, intimate bedside storytelling tone, and velvet warmth.',
        tags: ['Intimate', 'Breathy Velvet', 'Bedside', 'Sensual Warmth'],
        pitchOffset: 2,
        color: 'from-rose-500 to-pink-800'
    },
    {
        id: 'attenborough',
        name: 'Sir David Attenborough',
        subtitle: 'Naturalist Wonder & British Cadence',
        gender: 'male',
        category: 'iconic',
        description: 'Quiet breathless wonder, precise BBC naturalist articulation, gentle grandfatherly warmth and awe.',
        tags: ['British Accent', 'Naturalist', 'Quiet Wonder', 'Articulate'],
        pitchOffset: -3,
        color: 'from-emerald-600 to-teal-800'
    },
    {
        id: 'deep_narrator',
        name: 'Deep Studio Baritone',
        subtitle: 'Epic Sci-Fi & Fantasy Narrator',
        gender: 'male',
        category: 'classic',
        description: 'Imposing cinematic depth with rich sub-harmonics, tailored for high-stakes space operas and epic mythos.',
        tags: ['Epic Depth', 'Resonant Sub-Bass', 'Sci-Fi Voice'],
        pitchOffset: -8,
        color: 'from-purple-600 to-indigo-900'
    },
    {
        id: 'warm_storyteller',
        name: 'Warm Fireside Storyteller',
        subtitle: 'Balanced Classic Audio Edition',
        gender: 'neutral',
        category: 'classic',
        description: 'Cozy, inviting acoustic balance with boosted speech clarity, gentle compression, and zero listener fatigue.',
        tags: ['All-Genre', 'Cozy', 'Zero Fatigue', 'Natural'],
        pitchOffset: -4,
        color: 'from-amber-500 to-orange-700'
    },
    {
        id: 'crisp_clear',
        name: 'Crystal Clear Voice',
        subtitle: 'Modern High-Fidelity Presence',
        gender: 'neutral',
        category: 'broadcast',
        description: 'Pristine high-definition articulation, cutting-edge sibilance management, and razor-sharp intelligibility.',
        tags: ['Crisp Presence', 'High Intelligibility', 'Modern Podcast'],
        pitchOffset: 4,
        color: 'from-cyan-500 to-blue-700'
    },
    {
        id: 'late_night_radio',
        name: 'Midnight FM Host',
        subtitle: 'Vintage Tube Warmth & Compression',
        gender: 'male',
        category: 'broadcast',
        description: 'Analog broadcast compression, silky rolled-off highs, and intimate FM broadcast presence for late-night listening.',
        tags: ['Analog Tube', 'FM Broadcast', 'Night Companion'],
        pitchOffset: -6,
        color: 'from-violet-600 to-fuchsia-900'
    },
    {
        id: 'original',
        name: 'Original Recording Master',
        subtitle: 'Studio Denoise & Normalization Only',
        gender: 'neutral',
        category: 'classic',
        description: 'Preserves the original narrator voice without pitch manipulation, applying only clean studio noise reduction and loudness mastering.',
        tags: ['Pure Voice', 'Original Actor', 'Lossless Pitch'],
        pitchOffset: 0,
        color: 'from-zinc-600 to-zinc-800'
    }
];

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


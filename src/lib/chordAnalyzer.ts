// ══════════════════════════════════════════════════════════════
// EXPERIMENTAL HARMONIC DECONVOLUTION & CHORD ANALYZER ENGINE
// ══════════════════════════════════════════════════════════════

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type InstrumentType = 'guitar' | 'ukulele' | 'piano';

export interface ChordEvent {
    time: number; // in seconds
    chord: string;
    simplifiedChord?: string;
    lyricSnippet?: string;
    duration?: number;
}

export interface ChordDiagramData {
    instrument: InstrumentType;
    chord: string;
    frets: (number | 'x' | 0)[]; // e.g. [-1, 0, 2, 2, 1, 0] for Am on guitar (-1 is x)
    fingers?: number[];
    barres?: number[];
    baseFret?: number;
    pianoKeys?: number[]; // MIDI note numbers or 0-11 pitch classes
}

// ── 1. Musical Notes & Transposition ──
const CHROMATIC_SCALE_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_SCALE_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function noteToPitchClass(note: string): number {
    const clean = note.trim();
    const sharpIdx = CHROMATIC_SCALE_SHARP.indexOf(clean);
    if (sharpIdx !== -1) return sharpIdx;
    const flatIdx = CHROMATIC_SCALE_FLAT.indexOf(clean);
    if (flatIdx !== -1) return flatIdx;
    return 0;
}

export function transposeChord(chord: string, semitones: number): string {
    if (semitones === 0 || !chord) return chord;

    // Handle slash chords like G/B or D/F#
    if (chord.includes('/')) {
        const [root, bass] = chord.split('/');
        return `${transposeChord(root, semitones)}/${transposeChord(bass, semitones)}`;
    }

    const match = chord.match(/^([A-Ga-g][#b]?)(.*)$/);
    if (!match) return chord;

    const root = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const suffix = match[2];

    const currentPc = noteToPitchClass(root);
    let newPc = (currentPc + semitones) % 12;
    if (newPc < 0) newPc += 12;

    const useFlat = chord.includes('b') || chord.includes('F') || chord.includes('Bb') || chord.includes('Eb');
    const newRoot = useFlat ? CHROMATIC_SCALE_FLAT[newPc] : CHROMATIC_SCALE_SHARP[newPc];

    return `${newRoot}${suffix}`;
}

// ── 2. Chord Difficulty Simplifier ──
export function simplifyChordForDifficulty(chord: string, difficulty: DifficultyLevel): string {
    if (!chord) return '';
    if (difficulty === 'advanced') return chord;

    // Split slash chords
    const mainPart = chord.split('/')[0];
    const match = mainPart.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return chord;

    const root = match[1];
    const quality = match[2];

    if (difficulty === 'beginner') {
        // Beginner: Reduce to simple Major, Minor, or standard Power chord
        if (quality.includes('m') && !quality.includes('maj')) {
            return `${root}m`;
        }
        if (quality.includes('dim') || quality.includes('m7b5')) {
            return `${root}m`;
        }
        if (quality.includes('5')) {
            return `${root}5`;
        }
        return root; // Root major
    }

    if (difficulty === 'intermediate') {
        // Intermediate: Keep 7ths, sus, add9, but simplify complex altered tensions
        if (quality.includes('m7b5')) return `${root}m7`;
        if (quality.includes('7alt') || quality.includes('7#9') || quality.includes('7b9')) return `${root}7`;
        if (quality.includes('13') || quality.includes('11') || quality.includes('9')) {
            return quality.includes('m') && !quality.includes('maj') ? `${root}m7` : `${root}7`;
        }
        return mainPart;
    }

    return chord;
}

// ── 3. Guitar & Ukulele Chord Voicings Database ──
const GUITAR_CHORD_VOICINGS: Record<string, { frets: (number | 'x')[]; fingers?: number[]; baseFret?: number }> = {
    // Open Majors
    'C': { frets: ['x', 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
    'D': { frets: ['x', 'x', 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
    'E': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
    'F': { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1 },
    'G': { frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] },
    'A': { frets: ['x', 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
    'B': { frets: ['x', 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], baseFret: 2 },
    // Open Minors
    'Am': { frets: ['x', 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
    'Dm': { frets: ['x', 'x', 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
    'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
    'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1 },
    'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 3 },
    'Bm': { frets: ['x', 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2 },
    'Cm': { frets: ['x', 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], baseFret: 3 },
    // 7ths
    'C7': { frets: ['x', 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
    'D7': { frets: ['x', 'x', 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
    'E7': { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
    'G7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
    'A7': { frets: ['x', 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
    'B7': { frets: ['x', 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
    'Am7': { frets: ['x', 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
    'Dm7': { frets: ['x', 'x', 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
    'Em7': { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 1, 0, 0, 0, 0] },
    // Sus & Add
    'Dsus4': { frets: ['x', 'x', 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 4] },
    'Asus4': { frets: ['x', 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
    'Cadd9': { frets: ['x', 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4] },
    'Fmaj7': { frets: ['x', 'x', 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
    'Cmaj7': { frets: ['x', 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] }
};

const UKULELE_CHORD_VOICINGS: Record<string, { frets: (number | 'x')[]; fingers?: number[]; baseFret?: number }> = {
    'C': { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3] },
    'G': { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2] },
    'Am': { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0] },
    'F': { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0] },
    'Em': { frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1] },
    'Dm': { frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0] },
    'D': { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0] },
    'A': { frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0] },
    'E': { frets: [4, 4, 4, 2], fingers: [2, 3, 4, 1] },
    'C7': { frets: [0, 0, 0, 1], fingers: [0, 0, 0, 1] },
    'G7': { frets: [0, 2, 1, 2], fingers: [0, 2, 1, 3] },
    'Am7': { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0] }
};

export function getChordDiagram(chordName: string, instrument: InstrumentType = 'guitar'): ChordDiagramData {
    const cleanChord = chordName.replace(/[/\\].*$/, '').trim();

    if (instrument === 'ukulele') {
        const uke = UKULELE_CHORD_VOICINGS[cleanChord] || UKULELE_CHORD_VOICINGS[cleanChord.replace(/[0-9].*$/, '')] || { frets: [0, 0, 0, 0] };
        return {
            instrument: 'ukulele',
            chord: chordName,
            frets: uke.frets,
            fingers: uke.fingers,
            baseFret: uke.baseFret || 1
        };
    }

    // Default: Guitar
    const gtr = GUITAR_CHORD_VOICINGS[cleanChord] || GUITAR_CHORD_VOICINGS[cleanChord.replace(/[0-9].*$/, '')] || { frets: ['x', 0, 2, 2, 2, 0] };
    return {
        instrument: 'guitar',
        chord: chordName,
        frets: gtr.frets,
        fingers: gtr.fingers,
        baseFret: gtr.baseFret || 1
    };
}

// ── 4. Web Audio Real-Time Chromagram & Harmonic Deconvolution ──
// 12-bin Pitch Class Profile Chroma Template matching
const CHORD_TEMPLATES: Record<string, number[]> = {
    // Major (Root, Major 3rd, Perfect 5th)
    'C': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'D': [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
    'E': [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    'F': [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'F#': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    'G': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    'G#': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    'A': [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'B': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    // Minor (Root, Minor 3rd, Perfect 5th)
    'Cm': [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    'C#m': [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'Dm': [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'D#m': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
    'Em': [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
    'Fm': [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'F#m': [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'Gm': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
    'G#m': [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    'Am': [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#m': [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'Bm': [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1]
};

export function computeChromagramFromFrequencies(
    frequencyData: Float32Array | Uint8Array,
    sampleRate: number,
    fftSize: number
): number[] {
    const chroma = new Array(12).fill(0);
    const binWidth = sampleRate / fftSize;

    // Iterate across musical octaves (A1 ~ 55Hz to B6 ~ 1975Hz)
    const minFreq = 55;
    const maxFreq = 2000;
    const minBin = Math.floor(minFreq / binWidth);
    const maxBin = Math.min(Math.floor(maxFreq / binWidth), frequencyData.length - 1);

    for (let bin = minBin; bin <= maxBin; bin++) {
        const magnitude = frequencyData instanceof Uint8Array ? frequencyData[bin] / 255 : (frequencyData[bin] + 100) / 100;
        if (magnitude <= 0.05) continue;

        const freq = bin * binWidth;
        // MIDI note number formula: 69 + 12 * log2(freq / 440)
        const midiNote = 69 + 12 * Math.log2(freq / 440);
        const pitchClass = Math.round(midiNote) % 12;
        const safePc = (pitchClass + 12) % 12;

        chroma[safePc] += magnitude * magnitude;
    }

    // Normalize chroma energy vector
    const total = Math.sqrt(chroma.reduce((acc, v) => acc + v * v, 0));
    if (total > 0.001) {
        for (let i = 0; i < 12; i++) {
            chroma[i] = chroma[i] / total;
        }
    }

    return chroma;
}

export function matchChordFromChromagram(chroma: number[]): { chord: string; confidence: number } {
    let bestChord = 'C';
    let maxSimilarity = -1;

    for (const [chordName, template] of Object.entries(CHORD_TEMPLATES)) {
        // Cosine similarity
        let dot = 0;
        let normTemplate = 0;
        for (let i = 0; i < 12; i++) {
            dot += chroma[i] * template[i];
            normTemplate += template[i] * template[i];
        }
        const sim = normTemplate > 0 ? dot / Math.sqrt(normTemplate) : 0;
        if (sim > maxSimilarity) {
            maxSimilarity = sim;
            bestChord = chordName;
        }
    }

    return {
        chord: bestChord,
        confidence: Math.min(Math.max(maxSimilarity, 0), 1)
    };
}

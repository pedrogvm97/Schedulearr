// ══════════════════════════════════════════════════════════════
// EXPERIMENTAL HARMONIC DECONVOLUTION & CHORD ANALYZER ENGINE
// ══════════════════════════════════════════════════════════════

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type InstrumentType = 'guitar' | 'bass' | 'ukulele';

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
    frets: (number | 'x' | 0)[]; // array of fret numbers or 'x' (muted) or 0 (open)
    fingers?: number[];
    barres?: number[];
    baseFret?: number;
    stringLabels?: string[];
    rootNote?: string;
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

    const mainPart = chord.split('/')[0];
    const match = mainPart.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return chord;

    const root = match[1];
    const quality = match[2];

    if (difficulty === 'beginner') {
        if (quality.includes('m') && !quality.includes('maj')) return `${root}m`;
        if (quality.includes('dim') || quality.includes('m7b5')) return `${root}m`;
        if (quality.includes('5')) return `${root}5`;
        return root;
    }

    if (difficulty === 'intermediate') {
        if (quality.includes('m7b5')) return `${root}m7`;
        if (quality.includes('7alt') || quality.includes('7#9') || quality.includes('7b9')) return `${root}7`;
        if (quality.includes('13') || quality.includes('11') || quality.includes('9')) {
            return quality.includes('m') && !quality.includes('maj') ? `${root}m7` : `${root}7`;
        }
        return mainPart;
    }

    return chord;
}

// ── 3. Guitar, Bass & Ukulele Chord Voicings Database ──
const GUITAR_CHORD_VOICINGS: Record<string, { frets: (number | 'x')[]; fingers?: number[]; baseFret?: number }> = {
    // Majors
    'C': { frets: ['x', 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
    'C#': { frets: ['x', 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], baseFret: 4 },
    'Db': { frets: ['x', 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], baseFret: 4 },
    'D': { frets: ['x', 'x', 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
    'D#': { frets: ['x', 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], baseFret: 6 },
    'Eb': { frets: ['x', 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], baseFret: 6 },
    'E': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
    'F': { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1 },
    'F#': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], baseFret: 2 },
    'Gb': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], baseFret: 2 },
    'G': { frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] },
    'G#': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], baseFret: 4 },
    'Ab': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], baseFret: 4 },
    'A': { frets: ['x', 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
    'A#': { frets: ['x', 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1 },
    'Bb': { frets: ['x', 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1 },
    'B': { frets: ['x', 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], baseFret: 2 },
    // Minors
    'Cm': { frets: ['x', 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], baseFret: 3 },
    'C#m': { frets: ['x', 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], baseFret: 4 },
    'Dbm': { frets: ['x', 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], baseFret: 4 },
    'Dm': { frets: ['x', 'x', 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
    'D#m': { frets: ['x', 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], baseFret: 6 },
    'Ebm': { frets: ['x', 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], baseFret: 6 },
    'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
    'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1 },
    'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], baseFret: 2 },
    'Gbm': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], baseFret: 2 },
    'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 3 },
    'G#m': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], baseFret: 4 },
    'Abm': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], baseFret: 4 },
    'Am': { frets: ['x', 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
    'A#m': { frets: ['x', 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1 },
    'Bbm': { frets: ['x', 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1 },
    'Bm': { frets: ['x', 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2 },
    // 7ths
    'C7': { frets: ['x', 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
    'D7': { frets: ['x', 'x', 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
    'E7': { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
    'F7': { frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], baseFret: 1 },
    'G7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
    'A7': { frets: ['x', 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
    'B7': { frets: ['x', 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
    'Am7': { frets: ['x', 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
    'Dm7': { frets: ['x', 'x', 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
    'Em7': { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 1, 0, 0, 0, 0] },
    'Cmaj7': { frets: ['x', 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
    'Fmaj7': { frets: ['x', 'x', 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
    'Gmaj7': { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
    'Dsus4': { frets: ['x', 'x', 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 4] },
    'Asus4': { frets: ['x', 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
    'Cadd9': { frets: ['x', 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4] }
};

// 4-String Bass Guitar Patterns (E1, A1, D2, G2)
// Array maps [E-string, A-string, D-string, G-string]
const BASS_CHORD_VOICINGS: Record<string, { frets: (number | 'x')[]; rootNote: string; baseFret?: number }> = {
    'C': { frets: ['x', 3, 2, 5], rootNote: 'C (A-3)', baseFret: 1 },
    'C#': { frets: ['x', 4, 3, 6], rootNote: 'C# (A-4)', baseFret: 3 },
    'Db': { frets: ['x', 4, 3, 6], rootNote: 'Db (A-4)', baseFret: 3 },
    'D': { frets: ['x', 5, 4, 7], rootNote: 'D (A-5)', baseFret: 4 },
    'D#': { frets: ['x', 6, 5, 8], rootNote: 'D# (A-6)', baseFret: 5 },
    'Eb': { frets: ['x', 6, 5, 8], rootNote: 'Eb (A-6)', baseFret: 5 },
    'E': { frets: [0, 2, 2, 'x'], rootNote: 'E (Open E)', baseFret: 1 },
    'F': { frets: [1, 3, 3, 'x'], rootNote: 'F (E-1)', baseFret: 1 },
    'F#': { frets: [2, 4, 4, 'x'], rootNote: 'F# (E-2)', baseFret: 1 },
    'Gb': { frets: [2, 4, 4, 'x'], rootNote: 'Gb (E-2)', baseFret: 1 },
    'G': { frets: [3, 5, 5, 'x'], rootNote: 'G (E-3)', baseFret: 1 },
    'G#': { frets: [4, 6, 6, 'x'], rootNote: 'G# (E-4)', baseFret: 3 },
    'Ab': { frets: [4, 6, 6, 'x'], rootNote: 'Ab (E-4)', baseFret: 3 },
    'A': { frets: [5, 7, 7, 'x'], rootNote: 'A (E-5 / Open A)', baseFret: 4 },
    'A#': { frets: [6, 8, 8, 'x'], rootNote: 'A# (E-6)', baseFret: 5 },
    'Bb': { frets: [6, 8, 8, 'x'], rootNote: 'Bb (E-6)', baseFret: 5 },
    'B': { frets: [7, 9, 9, 'x'], rootNote: 'B (E-7)', baseFret: 6 },
    // Minors
    'Cm': { frets: ['x', 3, 1, 5], rootNote: 'C (A-3)', baseFret: 1 },
    'C#m': { frets: ['x', 4, 2, 6], rootNote: 'C# (A-4)', baseFret: 2 },
    'Dbm': { frets: ['x', 4, 2, 6], rootNote: 'Db (A-4)', baseFret: 2 },
    'Dm': { frets: ['x', 5, 3, 7], rootNote: 'D (A-5)', baseFret: 3 },
    'D#m': { frets: ['x', 6, 4, 8], rootNote: 'D# (A-6)', baseFret: 4 },
    'Ebm': { frets: ['x', 6, 4, 8], rootNote: 'Eb (A-6)', baseFret: 4 },
    'Em': { frets: [0, 2, 2, 0], rootNote: 'E (Open E)', baseFret: 1 },
    'Fm': { frets: [1, 3, 3, 1], rootNote: 'F (E-1)', baseFret: 1 },
    'F#m': { frets: [2, 4, 4, 2], rootNote: 'F# (E-2)', baseFret: 1 },
    'Gbm': { frets: [2, 4, 4, 2], rootNote: 'Gb (E-2)', baseFret: 1 },
    'Gm': { frets: [3, 5, 5, 3], rootNote: 'G (E-3)', baseFret: 1 },
    'G#m': { frets: [4, 6, 6, 4], rootNote: 'G# (E-4)', baseFret: 3 },
    'Abm': { frets: [4, 6, 6, 4], rootNote: 'Ab (E-4)', baseFret: 3 },
    'Am': { frets: ['x', 0, 2, 2], rootNote: 'A (Open A)', baseFret: 1 },
    'A#m': { frets: ['x', 1, 3, 3], rootNote: 'A# (A-1)', baseFret: 1 },
    'Bbm': { frets: ['x', 1, 3, 3], rootNote: 'Bb (A-1)', baseFret: 1 },
    'Bm': { frets: ['x', 2, 4, 4], rootNote: 'B (A-2)', baseFret: 1 }
};

export function getChordDiagram(chordName: string, instrument: InstrumentType = 'guitar'): ChordDiagramData {
    const cleanChord = (chordName || 'C').replace(/[/\\].*$/, '').trim();

    if (instrument === 'bass') {
        const bass = BASS_CHORD_VOICINGS[cleanChord] || BASS_CHORD_VOICINGS[cleanChord.replace(/[0-9].*$/, '')] || {
            frets: ['x', 3, 2, 5],
            rootNote: cleanChord,
            baseFret: 1
        };
        return {
            instrument: 'bass',
            chord: chordName,
            frets: bass.frets,
            baseFret: bass.baseFret || 1,
            stringLabels: ['E', 'A', 'D', 'G'],
            rootNote: bass.rootNote
        };
    }

    // Default: Guitar (6 strings)
    const gtr = GUITAR_CHORD_VOICINGS[cleanChord] || GUITAR_CHORD_VOICINGS[cleanChord.replace(/[0-9].*$/, '')] || {
        frets: ['x', 0, 2, 2, 2, 0],
        fingers: [0, 0, 1, 2, 3, 0],
        baseFret: 1
    };
    return {
        instrument: 'guitar',
        chord: chordName,
        frets: gtr.frets,
        fingers: gtr.fingers,
        baseFret: gtr.baseFret || 1,
        stringLabels: ['E', 'A', 'D', 'G', 'B', 'e']
    };
}

// ── 4. Web Audio Real-Time Vocal Pitch Detection (Autocorrelation / YIN) ──
export function detectPitchFromAudioBuffer(
    buffer: Float32Array,
    sampleRate: number
): { pitchHz: number; noteName: string; midiNote: number; clarity: number } | null {
    const SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / SIZE);

    // If signal is too quiet (noise floor)
    if (rms < 0.015) {
        return null;
    }

    // Autocorrelation
    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buffer[i]) < thres) {
            r1 = i;
            break;
        }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buffer[SIZE - i]) < thres) {
            r2 = SIZE - i;
            break;
        }
    }

    const trimmed = buffer.slice(r1, r2);
    const c = new Array(trimmed.length).fill(0);
    for (let i = 0; i < trimmed.length; i++) {
        for (let j = 0; j < trimmed.length - i; j++) {
            c[i] = c[i] + trimmed[j] * trimmed[j + i];
        }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < trimmed.length; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }

    let T0 = maxpos;
    if (T0 <= 0) return null;

    // Parabolic interpolation around peak
    const x1 = c[T0 - 1] || 0;
    const x2 = c[T0] || 0;
    const x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    const pitchHz = sampleRate / T0;
    if (pitchHz < 60 || pitchHz > 1200) return null; // Human vocal pitch range (C2 - D6)

    const midiNote = 69 + 12 * Math.log2(pitchHz / 440);
    const roundedMidi = Math.round(midiNote);
    const pitchClass = (roundedMidi % 12 + 12) % 12;
    const octave = Math.floor(roundedMidi / 12) - 1;
    const noteName = `${CHROMATIC_SCALE_SHARP[pitchClass]}${octave}`;
    const clarity = Math.min(Math.max(maxval / (c[0] || 1), 0), 1);

    return {
        pitchHz: Math.round(pitchHz * 10) / 10,
        noteName,
        midiNote: Math.round(midiNote * 10) / 10,
        clarity
    };
}

// ── 5. Real-Time Chromagram & Harmonic Deconvolution ──
const CHORD_TEMPLATES: Record<string, number[]> = {
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

    const minFreq = 55;
    const maxFreq = 2000;
    const minBin = Math.floor(minFreq / binWidth);
    const maxBin = Math.min(Math.floor(maxFreq / binWidth), frequencyData.length - 1);

    for (let bin = minBin; bin <= maxBin; bin++) {
        const magnitude = frequencyData instanceof Uint8Array ? frequencyData[bin] / 255 : (frequencyData[bin] + 100) / 100;
        if (magnitude <= 0.05) continue;

        const freq = bin * binWidth;
        const midiNote = 69 + 12 * Math.log2(freq / 440);
        const pitchClass = Math.round(midiNote) % 12;
        const safePc = (pitchClass + 12) % 12;

        chroma[safePc] += magnitude * magnitude;
    }

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

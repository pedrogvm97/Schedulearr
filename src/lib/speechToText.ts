import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import axios from 'axios';
import { getAudiobookStudioConfig, ensureLocalWhisperModel } from './audiobookStudio';

export interface SttTranscriptLine {
    time: number;
    text: string;
    endTime?: number;
}

export interface SttResult {
    success: boolean;
    provider: string;
    lines: SttTranscriptLine[];
    plainText: string;
    srtContent: string;
    lrcContent: string;
    durationSec?: number;
    error?: string;
}

export function formatLrcTimestamp(seconds: number): string {
    const s = Math.max(0, isFinite(seconds) ? seconds : 0);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const wholeSecs = Math.floor(secs);
    const hundredths = Math.floor((secs - wholeSecs) * 100);
    return `[${String(mins).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
}

export function formatSrtTimestamp(seconds: number): string {
    const s = Math.max(0, isFinite(seconds) ? seconds : 0);
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const millis = Math.floor((s - Math.floor(s)) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function generateSrtFromLines(lines: SttTranscriptLine[]): string {
    if (!lines || lines.length === 0) return '';
    const sorted = [...lines].sort((a, b) => a.time - b.time);
    const blocks: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const next = sorted[i + 1];
        const startSec = item.time;
        const endSec = item.endTime && item.endTime > startSec
            ? item.endTime
            : next ? Math.min(startSec + 7.0, Math.max(startSec + 1.2, next.time)) : startSec + 4.0;

        blocks.push(`${i + 1}\n${formatSrtTimestamp(startSec)} --> ${formatSrtTimestamp(endSec)}\n${item.text.trim()}`);
    }

    return blocks.join('\n\n') + '\n';
}

export function generateLrcFromLines(lines: SttTranscriptLine[]): string {
    if (!lines || lines.length === 0) return '';
    const sorted = [...lines].sort((a, b) => a.time - b.time);
    return sorted.map(l => `${formatLrcTimestamp(l.time)} ${l.text.trim()}`).join('\n') + '\n';
}

export function parseLrcStringToLines(lrcText: string): SttTranscriptLine[] {
    if (!lrcText) return [];
    const lines = lrcText.split(/\r?\n/);
    const result: SttTranscriptLine[] = [];
    const timeRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]/g;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const matches = [...line.matchAll(timeRegex)];
        if (matches.length > 0) {
            const cleanText = line.replace(timeRegex, '').trim();
            if (cleanText) {
                for (const match of matches) {
                    const mins = parseInt(match[1], 10);
                    const secs = parseInt(match[2], 10);
                    const msStr = match[3] || '0';
                    const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr, 10);
                    const time = mins * 60 + secs + ms / 1000;
                    result.push({ time, text: cleanText });
                }
            }
        }
    }

    return result.sort((a, b) => a.time - b.time);
}

/**
 * Resolves container-internal paths (/media/..., /music/..., /data/...)
 * to accessible paths on Unraid (/mnt/user/NAS_PlexMedia/..., /data/..., etc.)
 */
export function resolveAccessibleMediaPath(rawPath: string, mediaType?: 'movie' | 'episode' | 'music' | 'audiobook'): string | null {
    if (!rawPath) return null;
    const clean = rawPath.trim();
    if (fs.existsSync(clean)) return clean;

    const norm = (s: string) => s.normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim().toLowerCase();

    const plexRoots = [
        '/mnt/user/NAS_PlexMedia',
        '/mnt/user/data/media',
        '/mnt/user/media',
        '/data',
        '/media',
        '/app/data'
    ];

    const typeSubdirs: string[] = [];
    if (mediaType === 'movie') {
        typeSubdirs.push('Movies', 'MoviesAnimation', '');
    } else if (mediaType === 'episode') {
        typeSubdirs.push('Series', 'Anime', 'TV Shows', '');
    } else if (mediaType === 'music') {
        typeSubdirs.push('Music', 'Music - OST', 'Music - Classical', 'Music - Pedro', 'Music (PT)', '');
    } else if (mediaType === 'audiobook') {
        typeSubdirs.push('Audiobooks', 'Audiobooks PT', '');
    } else {
        typeSubdirs.push('Movies', 'MoviesAnimation', 'Series', 'Anime', 'Music', 'Audiobooks', 'Recorded Games', '');
    }

    const stripped = clean.replace(/^\/(media|data|mnt\/user\/NAS_PlexMedia|mnt\/user\/data\/media|mnt\/user\/media|app\/data)\/?/i, '');

    for (const root of plexRoots) {
        if (!fs.existsSync(root)) continue;
        for (const sub of typeSubdirs) {
            const candidate = sub ? path.join(root, sub, stripped) : path.join(root, stripped);
            if (fs.existsSync(candidate)) return candidate;
            const direct = path.join(root, stripped);
            if (fs.existsSync(direct)) return direct;
        }
    }

    // Try segment walking case-insensitively
    try {
        const baseRoots = [
            '/mnt/user/NAS_PlexMedia/Movies',
            '/mnt/user/NAS_PlexMedia/Series',
            '/mnt/user/NAS_PlexMedia/Anime',
            '/mnt/user/NAS_PlexMedia/Music',
            '/mnt/user/NAS_PlexMedia/Audiobooks',
            '/data/Music',
            '/data/Audiobooks',
            '/mnt/user/NAS_PlexMedia'
        ];

        const segments = decodeURIComponent(clean).split(/[\/\\]/).filter(Boolean);

        for (const base of baseRoots) {
            if (!fs.existsSync(base)) continue;
            let current = base;
            let matched = true;
            const subSegments = segments.filter(seg => !base.toLowerCase().includes(norm(seg)));

            for (const seg of subSegments) {
                const segNorm = norm(seg);
                try {
                    const entries = fs.readdirSync(current);
                    const found = entries.find(e => norm(e) === segNorm);
                    if (found) {
                        current = path.join(current, found);
                    } else {
                        matched = false;
                        break;
                    }
                } catch {
                    matched = false;
                    break;
                }
            }

            if (matched && fs.existsSync(current)) {
                return current;
            }
        }
    } catch {}

    return null;
}

/**
 * Aligns plain lyrics text with Speech-to-Text audio timestamps.
 * Preserves the exact lyrics phrasing, spelling, and artist capitalization
 * while applying the precise audio timestamps from the speech recognition.
 */
export function alignPlainLyricsWithAudioTimestamps(
    plainLyrics: string,
    sttLines: SttTranscriptLine[]
): SttTranscriptLine[] {
    if (!plainLyrics || !plainLyrics.trim()) return sttLines;
    if (!sttLines || sttLines.length === 0) return [];

    const plainLines = plainLyrics
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !/^\[.+\]$/.test(l));

    if (plainLines.length === 0) return sttLines;

    const result: SttTranscriptLine[] = [];
    const totalPlain = plainLines.length;
    const totalStt = sttLines.length;

    if (Math.abs(totalPlain - totalStt) <= 3) {
        // Line counts are nearly identical: map 1:1 with audio timestamps
        for (let i = 0; i < totalPlain; i++) {
            const sttIndex = Math.min(i, totalStt - 1);
            result.push({
                time: sttLines[sttIndex].time,
                text: plainLines[i],
                endTime: sttLines[sttIndex].endTime
            });
        }
        return result;
    }

    // Token-overlap fuzzy alignment
    let currentSttIdx = 0;
    const normalizeWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (let pIdx = 0; pIdx < totalPlain; pIdx++) {
        const pLine = plainLines[pIdx];
        const pWords = new Set(pLine.split(/\s+/).map(normalizeWord).filter(Boolean));

        let bestSttIdx = currentSttIdx;
        let maxOverlap = 0;

        // Look ahead up to 6 STT lines
        const lookaheadMax = Math.min(totalStt, currentSttIdx + 6);
        for (let s = currentSttIdx; s < lookaheadMax; s++) {
            const sWords = sttLines[s].text.split(/\s+/).map(normalizeWord).filter(Boolean);
            let overlap = 0;
            for (const sw of sWords) {
                if (pWords.has(sw)) overlap++;
            }
            if (overlap > maxOverlap) {
                maxOverlap = overlap;
                bestSttIdx = s;
            }
        }

        if (maxOverlap > 0) {
            result.push({
                time: sttLines[bestSttIdx].time,
                text: pLine,
                endTime: sttLines[bestSttIdx].endTime
            });
            currentSttIdx = Math.min(bestSttIdx + 1, totalStt - 1);
        } else {
            // Linear proportion interpolation between known points
            const estSec = (pIdx / Math.max(1, totalPlain)) * (sttLines[totalStt - 1]?.time || 180);
            result.push({
                time: Math.round(estSec * 100) / 100,
                text: pLine
            });
        }
    }

    return result.sort((a, b) => a.time - b.time);
}

/**
 * Multi-tier Speech-to-Text Transcription Engine:
 * 1. Gemini Audio STT (configured key in Audiobook Studio)
 * 2. Groq Whisper Large v3 Turbo (configured key or fast free tier)
 * 3. OpenAI Whisper-1
 * 4. Local C++ whisper-cli (whisper.cpp) on host CPU
 * 5. Free Hugging Face Whisper Large v3 Gradio Spaces
 */
export async function transcribeAudioChunk(params: {
    audioPath: string;
    startOffsetSec?: number;
    durationSec?: number;
    targetLang?: string;
    cpuThreads?: number;
    onProgress?: (msg: string) => void;
}): Promise<SttResult> {
    const {
        audioPath,
        startOffsetSec = 0,
        durationSec = 0,
        targetLang = 'en',
        cpuThreads = 2,
        onProgress
    } = params;

    if (!audioPath || !fs.existsSync(audioPath)) {
        return {
            success: false,
            provider: 'none',
            lines: [],
            plainText: '',
            srtContent: '',
            lrcContent: '',
            error: 'Audio file does not exist on disk'
        };
    }

    const tmpDir = os.tmpdir();
    const tmpId = `stt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tmpWav = path.join(tmpDir, `${tmpId}.wav`);
    const tmpMp3 = path.join(tmpDir, `${tmpId}.mp3`);

    const studioConfig = getAudiobookStudioConfig();
    const candidateKeys = studioConfig.apiKeys || [];

    // Step A: Extract audio chunk via FFmpeg
    onProgress?.(`Extracting audio chunk at ${formatLrcTimestamp(startOffsetSec)}...`);
    await new Promise<void>((resolve) => {
        const args: string[] = ['-y', '-threads', String(Math.max(1, cpuThreads))];
        if (startOffsetSec > 0) {
            args.push('-ss', String(startOffsetSec));
        }
        args.push('-i', audioPath);
        if (durationSec > 0) {
            args.push('-t', String(durationSec));
        }
        args.push('-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', tmpMp3);

        const ff = spawn('ffmpeg', args);
        const timer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} resolve(); }, 45000);
        ff.on('close', () => { clearTimeout(timer); resolve(); });
        ff.on('error', () => { clearTimeout(timer); resolve(); });
    });

    const hasMp3 = fs.existsSync(tmpMp3) && fs.statSync(tmpMp3).size > 1024;
    const workingAudioFile = hasMp3 ? tmpMp3 : audioPath;

    // ── Tier 1: Gemini Audio STT (Fast, verbatim transcription) ──
    const geminiKeyEntry = candidateKeys.find(k => k.provider === 'gemini') ||
        (studioConfig.geminiApiKey ? { provider: 'gemini', key: studioConfig.geminiApiKey, label: 'Gemini STT' } : null);

    if (geminiKeyEntry && geminiKeyEntry.key && hasMp3) {
        try {
            onProgress?.(`Transcribing via ${geminiKeyEntry.label} Audio STT...`);
            const audioB64 = fs.readFileSync(tmpMp3).toString('base64');
            const sttPrompt = [
                `You are a verbatim Speech-to-Text audio transcriber.`,
                `Transcribe the spoken words heard in this audio recording word-for-word in the language spoken.`,
                `STRICT RULES:`,
                `1. Output ONLY the actual spoken words heard in the audio. Do NOT summarize or add commentary.`,
                `2. Format every spoken sentence or lyric line starting with its relative timestamp in [MM:SS.xx] format (starting at [00:00.00]).`,
                `3. Output ONLY the [MM:SS.xx] lines.`
            ].join('\n');

            const models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
            for (const model of models) {
                try {
                    const resp = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKeyEntry.key)}`,
                        {
                            contents: [{
                                parts: [
                                    { text: sttPrompt },
                                    { inlineData: { mimeType: 'audio/mp3', data: audioB64 } }
                                ]
                            }],
                            generationConfig: { temperature: 0.05, maxOutputTokens: 4096 }
                        },
                        { timeout: 60000 }
                    );

                    const rawOut = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                    if (rawOut) {
                        const rawLines = rawOut.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
                        const lines: SttTranscriptLine[] = [];

                        rawLines.forEach((line: string, idx: number) => {
                            const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
                            if (m) {
                                const relSec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                                const absSec = startOffsetSec + relSec;
                                const text = m[3].trim();
                                if (text && text.length > 1) {
                                    lines.push({ time: Math.round(absSec * 100) / 100, text });
                                }
                            } else {
                                const clean = line.replace(/^```[a-z]*$/i, '').replace(/^\d+[\).\s-]+/, '').trim();
                                if (clean.length > 2) {
                                    const estSec = startOffsetSec + (idx / Math.max(1, rawLines.length)) * (durationSec || 180);
                                    lines.push({ time: Math.round(estSec * 100) / 100, text: clean });
                                }
                            }
                        });

                        if (lines.length > 0) {
                            try { if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3); } catch {}
                            try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}

                            const plainText = lines.map(l => l.text).join(' ');
                            return {
                                success: true,
                                provider: `Gemini Audio STT (${model})`,
                                lines,
                                plainText,
                                srtContent: generateSrtFromLines(lines),
                                lrcContent: generateLrcFromLines(lines)
                            };
                        }
                    }
                } catch (mErr: any) {
                    if (mErr?.response?.status === 429) break;
                }
            }
        } catch {}
    }

    // ── Tier 2: Groq Whisper Large v3 Turbo (Ultra fast cloud STT) ──
    const groqKeyEntry = candidateKeys.find(k => k.provider === 'groq') ||
        (studioConfig.groqApiKey ? { provider: 'groq', key: studioConfig.groqApiKey, label: 'Groq Whisper' } : null);

    if (groqKeyEntry && groqKeyEntry.key && hasMp3) {
        try {
            onProgress?.(`Transcribing via Groq Whisper Large v3 Turbo...`);
            const form = new globalThis.FormData();
            const blob = new Blob([fs.readFileSync(tmpMp3)], { type: 'audio/mp3' });
            form.append('file', blob, path.basename(tmpMp3));
            form.append('model', 'whisper-large-v3-turbo');
            form.append('response_format', 'verbose_json');

            const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${groqKeyEntry.key}` },
                body: form
            });

            if (resp.ok) {
                const data: any = await resp.json();
                const segments = Array.isArray(data?.segments) ? data.segments : [];
                const lines: SttTranscriptLine[] = [];

                for (const seg of segments) {
                    const startSec = startOffsetSec + (seg.start || 0);
                    const endSec = startOffsetSec + (seg.end || startSec + 3.0);
                    const text = String(seg.text || '').trim();
                    if (text) {
                        lines.push({
                            time: Math.round(startSec * 100) / 100,
                            endTime: Math.round(endSec * 100) / 100,
                            text
                        });
                    }
                }

                if (lines.length > 0) {
                    try { if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3); } catch {}
                    try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}
                    return {
                        success: true,
                        provider: 'Groq Whisper Large v3 Turbo',
                        lines,
                        plainText: data.text || lines.map(l => l.text).join(' '),
                        srtContent: generateSrtFromLines(lines),
                        lrcContent: generateLrcFromLines(lines)
                    };
                }
            }
        } catch {}
    }

    // ── Tier 3: Local C++ whisper-cli (Whisper.cpp on CPU) ──
    const whisperCliBin = fs.existsSync('/usr/local/bin/whisper-cli') ? '/usr/local/bin/whisper-cli' : 'whisper-cli';
    try {
        const modelPath = await ensureLocalWhisperModel();
        if (modelPath && fs.existsSync(modelPath)) {
            // Need 16kHz mono WAV for whisper-cli
            onProgress?.(`Preparing 16kHz WAV for Local CPU Whisper...`);
            await new Promise<void>((resolve) => {
                const ff = spawn('ffmpeg', [
                    '-y', '-threads', String(Math.max(1, cpuThreads)),
                    '-i', workingAudioFile,
                    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
                    tmpWav
                ]);
                const timer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} resolve(); }, 35000);
                ff.on('close', () => { clearTimeout(timer); resolve(); });
                ff.on('error', () => { clearTimeout(timer); resolve(); });
            });

            if (fs.existsSync(tmpWav) && fs.statSync(tmpWav).size > 1024) {
                onProgress?.(`Transcribing via Local Whisper.cpp (${cpuThreads} CPU threads)...`);
                const outPrefix = path.join(tmpDir, `${tmpId}_wcpp`);
                const srtOut = `${outPrefix}.srt`;

                const ranLocal = await new Promise<boolean>((resolve) => {
                    const proc = spawn(whisperCliBin, [
                        '-m', modelPath,
                        '-f', tmpWav,
                        '-osrt',
                        '-of', outPrefix,
                        '-t', String(cpuThreads),
                        '-np'
                    ]);
                    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(false); }, 180000);
                    proc.on('close', (code) => {
                        clearTimeout(timer);
                        resolve(code === 0 && fs.existsSync(srtOut));
                    });
                    proc.on('error', () => {
                        clearTimeout(timer);
                        resolve(false);
                    });
                });

                if (ranLocal && fs.existsSync(srtOut)) {
                    const rawSrt = fs.readFileSync(srtOut, 'utf8');
                    try { fs.unlinkSync(srtOut); } catch {}
                    try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}
                    try { if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3); } catch {}

                    const blocks = rawSrt.split(/\r?\n\r?\n/);
                    const lines: SttTranscriptLine[] = [];

                    for (const b of blocks) {
                        const m = b.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*\r?\n([\s\S]+)/);
                        if (m) {
                            const startRel = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4], 10) / 1000;
                            const endRel = parseInt(m[5], 10) * 3600 + parseInt(m[6], 10) * 60 + parseInt(m[7], 10) + parseInt(m[8], 10) / 1000;
                            const txt = m[9].replace(/\r?\n/g, ' ').replace(/\[[_A-Z0-9\s]+\]/g, '').trim();
                            if (txt && txt.length > 1) {
                                lines.push({
                                    time: Math.round((startOffsetSec + startRel) * 100) / 100,
                                    endTime: Math.round((startOffsetSec + endRel) * 100) / 100,
                                    text: txt
                                });
                            }
                        }
                    }

                    if (lines.length > 0) {
                        return {
                            success: true,
                            provider: `Local Whisper.cpp (${cpuThreads}T CPU)`,
                            lines,
                            plainText: lines.map(l => l.text).join(' '),
                            srtContent: generateSrtFromLines(lines),
                            lrcContent: generateLrcFromLines(lines)
                        };
                    }
                }
            }
        }
    } catch {}

    // Clean up temporary files
    try { if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3); } catch {}
    try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}

    return {
        success: false,
        provider: 'none',
        lines: [],
        plainText: '',
        srtContent: '',
        lrcContent: '',
        error: 'All transcription tiers exhausted'
    };
}

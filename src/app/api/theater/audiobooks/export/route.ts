import { NextRequest, NextResponse } from 'next/server';
import { ZipArchive } from 'archiver';
import { PassThrough, Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import {
    getAudiobookMeta,
    getAudiobookChaptersMeta,
    AudiobookBookMeta,
    AudiobookChapterMeta
} from '@/lib/db';
import {
    getAudiobookArtDir,
    getAudiobookTranscriptsDir,
    getAudiobookEnhancedDir,
    resolveChapterAudioFilePath
} from '@/lib/audiobookStudio';

export const dynamic = 'force-dynamic';

function formatTimestampVtt(seconds: number): string {
    const totalMs = Math.round(seconds * 1000);
    const hrs = Math.floor(totalMs / 3600000);
    const mins = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function formatTimestampSrt(seconds: number): string {
    const totalMs = Math.round(seconds * 1000);
    const hrs = Math.floor(totalMs / 3600000);
    const mins = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

interface ParsedLine {
    startSec: number;
    endSec?: number;
    text: string;
}

function parseLrcToLines(lrc: string, totalDurationSec?: number): ParsedLine[] {
    if (!lrc) return [];
    const rawLines = lrc.split('\n');
    const parsed: ParsedLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

    for (const raw of rawLines) {
        const trimmed = raw.trim();
        const m = timeRegex.exec(trimmed);
        if (m) {
            const min = parseInt(m[1], 10);
            const sec = parseInt(m[2], 10);
            const msStr = m[3] || '0';
            const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr, 10);
            const startSec = min * 60 + sec + ms / 1000;
            const text = (m[4] || '').trim();
            if (text) {
                parsed.push({ startSec, text });
            }
        }
    }

    parsed.sort((a, b) => a.startSec - b.startSec);

    for (let i = 0; i < parsed.length; i++) {
        if (i < parsed.length - 1) {
            parsed[i].endSec = parsed[i + 1].startSec;
        } else {
            parsed[i].endSec = totalDurationSec && totalDurationSec > parsed[i].startSec
                ? totalDurationSec
                : parsed[i].startSec + 5;
        }
    }

    return parsed;
}

function linesToVtt(lines: ParsedLine[], title: string): string {
    const out = ['WEBVTT', `NOTE Title: ${title}`, ''];
    for (const line of lines) {
        const start = formatTimestampVtt(line.startSec);
        const end = formatTimestampVtt(line.endSec || line.startSec + 4);
        out.push(`${start} --> ${end}`);
        out.push(line.text);
        out.push('');
    }
    return out.join('\n');
}

function linesToSrt(lines: ParsedLine[]): string {
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const start = formatTimestampSrt(line.startSec);
        const end = formatTimestampSrt(line.endSec || line.startSec + 4);
        out.push(String(i + 1));
        out.push(`${start} --> ${end}`);
        out.push(line.text);
        out.push('');
    }
    return out.join('\n');
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const bookKey = (searchParams.get('bookKey') || '').trim();

        if (!bookKey) {
            return NextResponse.json({ error: 'Missing bookKey parameter' }, { status: 400 });
        }

        const book = getAudiobookMeta(bookKey);
        if (!book) {
            return NextResponse.json({ error: `Audiobook not found: "${bookKey}"` }, { status: 404 });
        }

        const chapters = getAudiobookChaptersMeta(bookKey).sort(
            (a, b) => (Number(a.chapter_index) || 0) - (Number(b.chapter_index) || 0)
        );

        const includeAudio = searchParams.get('includeAudio') === 'true';
        const audioSource = searchParams.get('audioSource') || 'original'; // 'original' | 'enhanced'
        const includeVtt = searchParams.get('includeVtt') !== 'false';
        const includeSrt = searchParams.get('includeSrt') === 'true';
        const includeTxt = searchParams.get('includeTxt') !== 'false';
        const includeJson = searchParams.get('includeJson') === 'true';
        const includeCover = searchParams.get('includeCover') !== 'false';
        const includeScenes = searchParams.get('includeScenes') !== 'false';
        const includeMetadata = searchParams.get('includeMetadata') !== 'false';

        const safeTitle = (book.title || 'Audiobook')
            .replace(/[^a-zA-Z0-9_\- ]/g, '')
            .trim()
            .replace(/\s+/g, '_')
            .slice(0, 48);
        const zipFilename = `${safeTitle}_Export.zip`;

        const archive = new ZipArchive({ zlib: { level: 6 } });
        const passThrough = new PassThrough();
        archive.pipe(passThrough);

        // Async archival work
        (async () => {
            try {
                // 1. Metadata & Storyboard
                if (includeMetadata) {
                    const metadataPayload = {
                        book: {
                            book_key: book.book_key,
                            title: book.title,
                            author: book.author,
                            canonical_author: book.canonical_author,
                            translator: book.translator,
                            narrator: book.narrator,
                            genre: book.genre,
                            published_year: book.published_year,
                            total_chapters: chapters.length
                        },
                        chapters: chapters.map(ch => ({
                            chapter_index: ch.chapter_index,
                            title: ch.title,
                            duration_sec: ch.duration_sec,
                            voice_preset: ch.voice_preset || book.voice_preset || 'clear_voice',
                            has_transcript: Boolean(ch.synced_lyrics || ch.plain_transcript),
                            scene_count: (ch.images || []).length
                        })),
                        exportedAt: new Date().toISOString()
                    };
                    archive.append(JSON.stringify(metadataPayload, null, 2), { name: 'metadata.json' });

                    const storyboardPayload = {
                        title: book.title,
                        author: book.author,
                        chapters: chapters.map(ch => ({
                            chapter_index: ch.chapter_index,
                            title: ch.title,
                            scenes: (ch.images || []).map((img, sIdx) => ({
                                scene_index: sIdx + 1,
                                id: img.id,
                                title: img.sceneTitle || `Scene ${sIdx + 1}`,
                                start_sec: img.startSec,
                                end_sec: img.endSec,
                                transition_reason: img.transitionReason,
                                prompt: img.prompt,
                                file: `Artwork/scenes/ch${String(ch.chapter_index).padStart(2, '0')}_scene${String(sIdx + 1).padStart(2, '0')}.jpg`
                            }))
                        }))
                    };
                    archive.append(JSON.stringify(storyboardPayload, null, 2), { name: 'storyboard.json' });
                }

                // 2. Cover Artwork
                if (includeCover) {
                    const artDir = getAudiobookArtDir();
                    let coverFound = false;
                    const possibleCoverNames = [
                        `cover_${book.book_key}.jpg`,
                        `cover_custom_${book.book_key}.jpg`,
                        book.custom_cover_url ? path.basename(book.custom_cover_url) : null
                    ].filter(Boolean) as string[];

                    for (const cName of possibleCoverNames) {
                        const fp = path.join(artDir, cName);
                        if (fs.existsSync(fp)) {
                            archive.file(fp, { name: 'Artwork/cover.jpg' });
                            coverFound = true;
                            break;
                        }
                    }

                    if (!coverFound && book.thumb && fs.existsSync(book.thumb)) {
                        archive.file(book.thumb, { name: 'Artwork/cover.jpg' });
                    }
                }

                // 3. Scene Artworks
                if (includeScenes) {
                    const artDir = getAudiobookArtDir();
                    chapters.forEach(ch => {
                        const imgs = (ch.images || []).filter(img => img && img.kept !== false && img.url);
                        imgs.forEach((img, sIdx) => {
                            const urlStr = String(img.url);
                            let fileName = '';
                            if (urlStr.includes('file=')) {
                                const m = /file=([^&]+)/.exec(urlStr);
                                if (m) fileName = decodeURIComponent(m[1]);
                            } else {
                                fileName = path.basename(urlStr);
                            }

                            if (fileName) {
                                const fullArtPath = path.join(artDir, fileName);
                                if (fs.existsSync(fullArtPath)) {
                                    const zipSceneName = `Artwork/scenes/ch${String(ch.chapter_index).padStart(2, '0')}_scene${String(sIdx + 1).padStart(2, '0')}.jpg`;
                                    archive.file(fullArtPath, { name: zipSceneName });
                                }
                            }
                        });
                    });
                }

                // 4. Transcripts
                for (const ch of chapters) {
                    const chPrefix = `${String(ch.chapter_index).padStart(2, '0')} - ${(ch.title || `Chapter ${ch.chapter_index}`).replace(/[^a-zA-Z0-9_\- ]/g, '').trim()}`;
                    const lrcStr = ch.synced_lyrics || '';
                    const parsedLines = parseLrcToLines(lrcStr, ch.duration_sec);

                    if (includeVtt) {
                        const vttContent = linesToVtt(parsedLines, `${book.title} - ${ch.title}`);
                        archive.append(vttContent, { name: `Transcripts/${chPrefix}.vtt` });
                    }

                    if (includeSrt) {
                        const srtContent = linesToSrt(parsedLines);
                        archive.append(srtContent, { name: `Transcripts/${chPrefix}.srt` });
                    }

                    if (includeTxt) {
                        const txtContent = ch.plain_transcript || parsedLines.map(l => l.text).join('\n') || '';
                        if (txtContent) {
                            archive.append(txtContent, { name: `Transcripts/${chPrefix}.txt` });
                        }
                    }

                    if (includeJson) {
                        const jsonContent = JSON.stringify({
                            book_title: book.title,
                            chapter_index: ch.chapter_index,
                            chapter_title: ch.title,
                            duration_sec: ch.duration_sec,
                            lines: parsedLines
                        }, null, 2);
                        archive.append(jsonContent, { name: `Transcripts/${chPrefix}.json` });
                    }
                }

                // 5. Audio Files
                if (includeAudio) {
                    for (const ch of chapters) {
                        const chPrefix = `${String(ch.chapter_index).padStart(2, '0')} - ${(ch.title || `Chapter ${ch.chapter_index}`).replace(/[^a-zA-Z0-9_\- ]/g, '').trim()}`;
                        let audioToIncludePath: string | undefined;

                        if (audioSource === 'enhanced' && ch.enhanced_audio_path && fs.existsSync(ch.enhanced_audio_path)) {
                            audioToIncludePath = ch.enhanced_audio_path;
                        } else {
                            audioToIncludePath = resolveChapterAudioFilePath(book, ch);
                        }

                        if (audioToIncludePath && fs.existsSync(audioToIncludePath)) {
                            const ext = path.extname(audioToIncludePath) || '.mp3';
                            archive.file(audioToIncludePath, { name: `Audio/${chPrefix}${ext}` });
                        }
                    }
                }

                await archive.finalize();
            } catch (err: any) {
                console.error('❌ [AudiobookExport] Archiving error:', err);
                archive.abort();
            }
        })();

        return new Response(Readable.toWeb(passThrough) as any, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFilename)}"`,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
    } catch (e: any) {
        console.error('❌ [AudiobookExport] Route error:', e);
        return NextResponse.json({ error: e?.message || 'Export failed' }, { status: 500 });
    }
}

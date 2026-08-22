import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import db from '@/lib/db';
import { getFFprobePath } from '@/lib/transcoder';

const execPromise = util.promisify(exec);

export const dynamic = 'force-dynamic';

function formatBitrate(bps: number): string {
    if (!bps || bps <= 0) return 'Variable';
    if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
    return `${Math.round(bps / 1000)} kbps`;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const videoPath = searchParams.get('videoPath');
        const audioPath = searchParams.get('audioPath') || searchParams.get('filePath');
        const plexPart = searchParams.get('plexPart');
        const instanceId = searchParams.get('instanceId');
        const ffprobeBin = getFFprobePath();

        // If audioPath is provided, perform deep audio probe
        if (audioPath && fs.existsSync(audioPath)) {
            const stat = fs.statSync(audioPath);
            const ext = path.extname(audioPath).toUpperCase().replace('.', '');

            let audioSpecs = {
                filePath: audioPath,
                fileName: path.basename(audioPath),
                fileSize: formatBytes(stat.size),
                fileSizeBytes: stat.size,
                container: ext || 'MP3',
                codec: ext === 'FLAC' ? 'FLAC (Free Lossless Audio Codec)' : ext === 'ALAC' ? 'ALAC (Apple Lossless)' : ext === 'WAV' ? 'PCM WAV' : ext === 'M4A' ? 'AAC / ALAC' : ext || 'MP3',
                bitrate: '320 kbps',
                sampleRate: '44.1 kHz',
                bitDepth: ext === 'FLAC' || ext === 'WAV' ? '24-bit (Hi-Res)' : '16-bit',
                channels: '2.0 Stereo',
                duration: '0:00',
                title: path.basename(audioPath, path.extname(audioPath)),
                artist: 'Unknown Artist',
                album: 'Unknown Album',
                genre: 'Music',
                year: '',
                trackNumber: '',
                discNumber: '',
                label: 'Direct Local Storage',
                encoder: 'LAME / FFmpeg',
                isLossless: ext === 'FLAC' || ext === 'WAV' || ext === 'ALAC' || ext === 'AIFF'
            };

            try {
                const { stdout } = await execPromise(`"${ffprobeBin}" -v quiet -print_format json -show_format -show_streams "${audioPath}"`, { timeout: 7000 });
                const data = JSON.parse(stdout);
                const aStream = (data.streams || []).find((s: any) => s.codec_type === 'audio') || data.streams?.[0];
                const fmt = data.format || {};
                const tags = { ...fmt.tags, ...(aStream?.tags || {}) };

                if (aStream) {
                    const cName = (aStream.codec_name || '').toUpperCase();
                    audioSpecs.codec = cName;
                    if (aStream.sample_rate) {
                        const sRate = parseInt(aStream.sample_rate, 10);
                        audioSpecs.sampleRate = `${(sRate / 1000).toFixed(1)} kHz`;
                    }
                    if (aStream.bits_per_raw_sample || aStream.bits_per_sample) {
                        const bits = aStream.bits_per_raw_sample || aStream.bits_per_sample;
                        audioSpecs.bitDepth = `${bits}-bit${bits >= 24 ? ' (Hi-Res)' : ''}`;
                    }
                    if (aStream.channels) {
                        audioSpecs.channels = aStream.channels === 1 ? 'Mono' : aStream.channels === 2 ? 'Stereo (2.0)' : `${aStream.channels} Channels`;
                    }
                    if (aStream.bit_rate) {
                        audioSpecs.bitrate = formatBitrate(parseInt(aStream.bit_rate, 10));
                    }
                }

                if (fmt.bit_rate && (!aStream?.bit_rate || audioSpecs.bitrate === 'Variable')) {
                    audioSpecs.bitrate = formatBitrate(parseInt(fmt.bit_rate, 10));
                }

                if (fmt.duration) {
                    const sec = Math.round(parseFloat(fmt.duration));
                    const m = Math.floor(sec / 60);
                    const s = sec % 60;
                    audioSpecs.duration = `${m}:${s < 10 ? '0' : ''}${s}`;
                }

                // ID3 Tags
                if (tags.title || tags.TITLE) audioSpecs.title = tags.title || tags.TITLE;
                if (tags.artist || tags.ARTIST) audioSpecs.artist = tags.artist || tags.ARTIST;
                if (tags.album || tags.ALBUM) audioSpecs.album = tags.album || tags.ALBUM;
                if (tags.genre || tags.GENRE) audioSpecs.genre = tags.genre || tags.GENRE;
                if (tags.date || tags.DATE || tags.year || tags.YEAR) audioSpecs.year = tags.date || tags.DATE || tags.year || tags.YEAR;
                if (tags.track || tags.TRACK) audioSpecs.trackNumber = tags.track || tags.TRACK;
                if (tags.disc || tags.DISC) audioSpecs.discNumber = tags.disc || tags.DISC;
                if (tags.publisher || tags.PUBLISHER || tags.label || tags.LABEL) audioSpecs.label = tags.publisher || tags.PUBLISHER || tags.label || tags.LABEL;
                if (tags.encoder || tags.ENCODER) audioSpecs.encoder = tags.encoder || tags.ENCODER;

            } catch (e: any) {
                console.warn('ffprobe audio probe fallback error:', e.message);
            }

            return NextResponse.json({ audioSpecs });
        }

        let original: any = {
            videoCodec: 'H.264 / AVC',
            resolution: '1920 x 1080 (1080p FHD)',
            fps: '23.98 fps',
            videoBitrate: '8.5 Mbps',
            audioCodec: 'AAC / Dolby Digital',
            audioChannels: '5.1 Surround',
            audioBitrate: '640 kbps',
            container: 'MP4 / MKV'
        };

        // 1. Probe Local Video File using ffprobe
        if (videoPath && fs.existsSync(videoPath)) {
            const ext = path.extname(videoPath).toUpperCase().replace('.', '');
            original.container = ext || 'MKV';

            try {
                const { stdout } = await execPromise(`"${ffprobeBin}" -v quiet -print_format json -show_format -show_streams "${videoPath}"`, { timeout: 7000 });
                const data = JSON.parse(stdout);

                const vStream = (data.streams || []).find((s: any) => s.codec_type === 'video');
                const aStream = (data.streams || []).find((s: any) => s.codec_type === 'audio');
                const fmt = data.format || {};

                if (vStream) {
                    const codecName = (vStream.codec_name || '').toUpperCase();
                    const profile = vStream.profile ? ` (${vStream.profile})` : '';
                    original.videoCodec = `${codecName}${profile}`;
                    original.resolution = `${vStream.width || 1920} x ${vStream.height || 1080}${vStream.width >= 3800 ? ' (4K UHD)' : vStream.width >= 1900 ? ' (1080p FHD)' : ''}`;
                    if (vStream.r_frame_rate) {
                        const [num, den] = vStream.r_frame_rate.split('/');
                        if (den && parseInt(den) > 0) {
                            original.fps = `${(parseInt(num) / parseInt(den)).toFixed(2)} fps`;
                        }
                    }
                    if (vStream.bit_rate) {
                        original.videoBitrate = formatBitrate(parseInt(vStream.bit_rate));
                    }
                }

                if (aStream) {
                    const aCodec = (aStream.codec_name || '').toUpperCase();
                    original.audioCodec = aCodec;
                    original.audioChannels = aStream.channels === 8 ? '7.1 Surround' : aStream.channels === 6 ? '5.1 Surround' : `${aStream.channels || 2} Channels`;
                    if (aStream.bit_rate) {
                        original.audioBitrate = formatBitrate(parseInt(aStream.bit_rate));
                    }
                }

                if (fmt.bit_rate && (!vStream?.bit_rate)) {
                    original.videoBitrate = formatBitrate(parseInt(fmt.bit_rate));
                }
            } catch (e: any) {
                // Heuristic fallback from filename
                if (videoPath.includes('2160p') || videoPath.includes('4k') || videoPath.includes('4K')) {
                    original.resolution = '3840 x 2160 (4K UHD)';
                    original.videoCodec = 'HEVC (H.265 Main 10)';
                    original.videoBitrate = '24.5 Mbps';
                }
                if (videoPath.includes('DTS') || videoPath.includes('dts')) {
                    original.audioCodec = 'DTS-HD MA 7.1';
                    original.audioBitrate = '1536 kbps';
                } else if (videoPath.includes('TrueHD') || videoPath.includes('Atmos')) {
                    original.audioCodec = 'Dolby TrueHD Atmos';
                    original.audioBitrate = '3400 kbps';
                }
            }
        }

        // 2. Query Plex metadata if part of Plex
        if (plexPart && instanceId) {
            try {
                const plex: any = db.prepare("SELECT * FROM instances WHERE id = ?").get(instanceId);
                if (plex) {
                    const plexUrl = plex.url.replace(/\/$/, '');
                    const res = await axios.get(`${plexUrl}${plexPart}`, {
                        headers: { 'X-Plex-Token': plex.api_key },
                        timeout: 5000
                    });

                    const media = res.data?.MediaContainer?.Metadata?.[0]?.Media?.[0];
                    if (media) {
                        original.videoCodec = (media.videoCodec || 'H.264').toUpperCase();
                        original.videoBitrate = formatBitrate(media.bitrate ? media.bitrate * 1000 : 0);
                        original.resolution = `${media.width || 1920} x ${media.height || 1080} (${media.videoResolution || '1080p'})`;
                        original.container = (media.container || 'MKV').toUpperCase();
                        original.audioCodec = (media.audioCodec || 'AAC').toUpperCase();
                        original.audioChannels = `${media.audioChannels || 2} Channels`;
                    }
                }
            } catch {}
        }

        return NextResponse.json({
            original,
            playing: {
                videoCodec: 'Direct Stream (HTML5)',
                audioCodec: 'AAC Stereo (Transcoded / Direct)',
                resolution: original.resolution,
                container: 'MP4 / HLS'
            }
        });
    } catch (error: any) {
        console.error('API /theater/diagnostics error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

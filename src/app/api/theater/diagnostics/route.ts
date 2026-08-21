import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import db from '@/lib/db';

const execPromise = util.promisify(exec);

export const dynamic = 'force-dynamic';

function formatBitrate(bps: number): string {
    if (!bps || bps <= 0) return 'Variable';
    if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
    return `${Math.round(bps / 1000)} kbps`;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const videoPath = searchParams.get('videoPath');
        const plexPart = searchParams.get('plexPart');
        const instanceId = searchParams.get('instanceId');

        let original: any = {
            videoCodec: 'H.264 / AVC',
            videoBitrate: 'Unknown',
            resolution: '1920 x 1080 (1080p)',
            fps: '24 fps',
            audioCodec: 'AAC / Dolby Digital',
            audioBitrate: '384 kbps',
            audioChannels: '5.1 Surround',
            container: 'MP4 / MKV'
        };

        // 1. Probe Local File using ffprobe if available
        if (videoPath && fs.existsSync(videoPath)) {
            const ext = path.extname(videoPath).toUpperCase().replace('.', '');
            original.container = ext || 'MKV';

            try {
                const { stdout } = await execPromise(`ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`, { timeout: 7000 });
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
                        headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                        timeout: 5000
                    }).catch(() => null);

                    if (res?.data?.MediaContainer?.Metadata?.[0]) {
                        const m = res.data.MediaContainer.Metadata[0];
                        const media = m.Media?.[0];
                        if (media) {
                            original.videoCodec = (media.videoCodec || 'H.264').toUpperCase();
                            original.resolution = `${media.width || 1920} x ${media.height || 1080}`;
                            original.audioCodec = (media.audioCodec || 'AAC').toUpperCase();
                            original.audioChannels = `${media.audioChannels || 2} Channels`;
                            original.container = (media.container || 'MKV').toUpperCase();
                            if (media.bitrate) original.videoBitrate = `${(media.bitrate / 1000).toFixed(1)} Mbps`;
                        }
                    }
                }
            } catch {}
        }

        return NextResponse.json({
            original,
            playing: {
                videoCodec: original.videoCodec.includes('HEVC') ? 'Direct Stream / Transcode' : 'Direct Play (HTML5)',
                audioCodec: original.audioCodec.includes('DTS') || original.audioCodec.includes('TRUEHD') ? 'AAC Stereo (Transcoded 256k)' : 'Direct Audio Play',
                resolution: original.resolution,
                container: 'HTML5 Web Media'
            }
        });
    } catch (error: any) {
        console.error('API /theater/diagnostics error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

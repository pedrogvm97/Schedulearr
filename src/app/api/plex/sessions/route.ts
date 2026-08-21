export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getInstances, getActivePlaybackSessions } from '@/lib/db';
import axios from 'axios';

export async function GET(req: Request) {
    try {
        const instances = getInstances().filter(i => i.type === 'plex');
        const localSessions = getActivePlaybackSessions();

        const allSessions: any[] = [...localSessions];
        let totalBandwidthKbps = localSessions.reduce((acc, s) => acc + (parseFloat(s.playback.bandwidthMbps || '0.3') * 1000), 0);

        if (instances.length === 0 && localSessions.length === 0) {
            return NextResponse.json({
                hasPlex: false,
                activeStreamsCount: 0,
                totalBandwidthMbps: '0.0',
                sessions: [],
                topUsers: [],
                history: []
            });
        }

        for (const plex of instances) {
            try {
                const res = await axios.get(`${plex.url}/status/sessions`, {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'Accept': 'application/json'
                    },
                    timeout: 4000
                });

                const container = res.data?.MediaContainer;
                const metadata = container?.Metadata || [];

                metadata.forEach((item: any) => {
                    const viewOffset = item.viewOffset || 0;
                    const duration = item.duration || 1;
                    const progressPercent = Math.min(100, Math.round((viewOffset / duration) * 100));

                    const bandwidthKbps = item.Session?.bandwidth || 0;
                    totalBandwidthKbps += bandwidthKbps;

                    const transcode = item.TranscodeSession;
                    let streamType = 'Direct Play';
                    if (transcode) {
                        if (transcode.videoDecision === 'transcode' || transcode.audioDecision === 'transcode') {
                            streamType = 'Transcode';
                        } else if (transcode.videoDecision === 'copy') {
                            streamType = 'Direct Stream';
                        }
                    }

                    // Format stream details
                    const media = item.Media?.[0];
                    const part = media?.Part?.[0];
                    const videoStream = media?.VideoStream || media?.Part?.[0]?.Stream?.find((s: any) => s.streamType === 1);

                    const userTitle = item.User?.title || item.User?.name || 'Local User';
                    const userThumb = item.User?.thumb || null;

                    const playerTitle = item.Player?.title || item.Player?.product || item.Player?.device || 'Plex Client';
                    const playerPlatform = item.Player?.platform || item.Player?.device || 'Web';
                    const playerState = item.Player?.state || 'playing';

                    // Poster processing
                    let poster = item.thumb || item.parentThumb || item.grandparentThumb || '';
                    if (poster && !poster.startsWith('http')) {
                        poster = `${plex.url}${poster}?X-Plex-Token=${plex.api_key}`;
                    }

                    allSessions.push({
                        id: item.sessionKey || item.ratingKey,
                        instanceName: plex.name,
                        title: item.title,
                        seriesTitle: item.grandparentTitle,
                        seasonNumber: item.parentIndex,
                        episodeNumber: item.index,
                        year: item.year,
                        mediaType: item.type === 'episode' ? 'series' : 'movie',
                        poster,
                        user: {
                            name: userTitle,
                            thumb: userThumb
                        },
                        player: {
                            title: playerTitle,
                            platform: playerPlatform,
                            state: playerState,
                            address: item.Player?.address
                        },
                        playback: {
                            progressPercent,
                            viewOffsetMs: viewOffset,
                            durationMs: duration,
                            bandwidthMbps: (bandwidthKbps / 1000).toFixed(1)
                        },
                        transcode: {
                            streamType,
                            videoDecision: transcode?.videoDecision || 'directplay',
                            audioDecision: transcode?.audioDecision || 'directplay',
                            videoCodec: videoStream?.codec || media?.videoCodec || 'h264',
                            resolution: videoStream?.videoResolution || media?.videoResolution || '1080p',
                            transcodeSpeed: transcode?.speed
                        }
                    });
                });
            } catch (e: any) {
                console.warn(`Failed to fetch Plex sessions for ${plex.name}:`, e.message);
            }
        }

        // Aggregate top user statistics from current active sessions & recent downloads pool
        const userStats: Record<string, { name: string; avatar?: string; activeStreams: number }> = {};
        allSessions.forEach(s => {
            if (!userStats[s.user.name]) {
                userStats[s.user.name] = { name: s.user.name, avatar: s.user.thumb, activeStreams: 0 };
            }
            userStats[s.user.name].activeStreams++;
        });

        const topUsers = Object.values(userStats);

        return NextResponse.json({
            hasPlex: true,
            activeStreamsCount: allSessions.length,
            totalBandwidthMbps: (totalBandwidthKbps / 1000).toFixed(1),
            sessions: allSessions,
            topUsers
        });
    } catch (e: any) {
        console.error('Error in /api/plex/sessions:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

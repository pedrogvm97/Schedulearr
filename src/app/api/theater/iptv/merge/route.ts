import { NextResponse } from 'next/server';
import { mergeIptvChannels, batchMergeIptvChannels, getIptvChannels, saveIptvChannels } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { libraryId, primaryChannelId, channelsToMergeIds, reorderedStreams, batchMerges } = body;

        if (!libraryId) {
            return NextResponse.json({ error: 'libraryId is required' }, { status: 400 });
        }

        // 1. Batch Merge from Auto-Grouping Suggestions
        if (Array.isArray(batchMerges) && batchMerges.length > 0) {
            const result = batchMergeIptvChannels(libraryId, batchMerges);
            if (result.success) {
                return NextResponse.json({
                    success: true,
                    mergedGroupsCount: result.mergedGroupsCount,
                    mergedChannelsCount: result.mergedChannelsCount,
                    message: `Merged ${result.mergedChannelsCount} channels across ${result.mergedGroupsCount} groups.`
                });
            }
            return NextResponse.json({ error: 'Failed to process batch merges' }, { status: 500 });
        }

        // 2. Reorder streams for a specific channel
        if (primaryChannelId && Array.isArray(reorderedStreams)) {
            const channels = getIptvChannels(libraryId);
            const target = channels.find(c => c.id === primaryChannelId);
            if (!target) {
                return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
            }

            target.streams = reorderedStreams;
            saveIptvChannels(libraryId, channels);

            return NextResponse.json({ success: true, channel: target });
        }

        // 3. Single Merge multiple channels into one
        if (!primaryChannelId || !Array.isArray(channelsToMergeIds) || channelsToMergeIds.length === 0) {
            return NextResponse.json({ error: 'primaryChannelId and channelsToMergeIds array are required' }, { status: 400 });
        }

        const success = mergeIptvChannels(libraryId, primaryChannelId, channelsToMergeIds);

        if (success) {
            return NextResponse.json({
                success: true,
                message: `Successfully merged ${channelsToMergeIds.length} channels into primary channel.`
            });
        }

        return NextResponse.json({ error: 'Failed to merge channels' }, { status: 500 });
    } catch (e: any) {
        console.error('API /theater/iptv/merge error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

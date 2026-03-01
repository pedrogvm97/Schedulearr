export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { logSearchHistory, getInstances } from '@/lib/db';
import { triggerMovieSearch } from '@/lib/radarr';
import { triggerEpisodeSearch } from '@/lib/sonarr';

export async function POST(req: Request) {
    try {
        const { instanceId, type, mediaId } = await req.json();
        if (!instanceId || !type || !mediaId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const instances = getInstances();
        const instance = instances.find(inst => inst.id === instanceId);

        if (!instance) {
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        let success = false;
        if (type === 'movie') {
            success = await triggerMovieSearch(instance.url, instance.api_key, [mediaId]);
            if (success) {
                logSearchHistory('manual', [`Movie ID: ${mediaId}`], [], `Manual force search via UI`);
            }
        } else if (type === 'series') {
            success = await triggerEpisodeSearch(instance.url, instance.api_key, [mediaId]);
            if (success) {
                logSearchHistory('manual', [], [`Episode ID: ${mediaId}`], `Manual force search via UI`);
            }
        }

        if (success) {
            return NextResponse.json({ success: true, message: 'Search triggered remotely' });
        } else {
            return NextResponse.json({ error: 'Failed to trigger search on the instance' }, { status: 500 });
        }
    } catch (e) {
        console.error('Error in search trigger', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

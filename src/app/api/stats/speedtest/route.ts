
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'test') {
        try {
            // Speed test logic
            const startTime = Date.now();
            const testUrl = 'https://cachefly.cachefly.net/10mb.test';
            const response = await axios.get(testUrl, {
                responseType: 'arraybuffer',
                onDownloadProgress: (progressEvent) => {
                    // This won't work easily in Next.js Server Actions/Routes as we're proxying
                }
            });
            const endTime = Date.now();
            const durationSec = (endTime - startTime) / 1000;
            const sizeMB = response.data.byteLength / (1024 * 1024);
            const speedMbps = (sizeMB * 8) / durationSec;

            return NextResponse.json({
                success: true,
                speedMbps: parseFloat(speedMbps.toFixed(2)),
                sizeMB,
                durationSec
            });
        } catch (error: any) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}

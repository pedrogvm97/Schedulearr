export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import axios from 'axios';

const CLIENT_ID = 'Schedulearr-Plex-App-Client';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { action, pinId, authToken } = body;

        // Step 1: Request a new PIN for 1-click authentication
        if (action === 'create_pin') {
            const res = await axios.post(
                'https://plex.tv/api/v2/pins?strong=true',
                {},
                {
                    headers: {
                        'X-Plex-Product': 'Schedulearr',
                        'X-Plex-Client-Identifier': CLIENT_ID,
                        'Accept': 'application/json'
                    },
                    timeout: 8000
                }
            );

            const pinData = res.data;
            const code = pinData.code;
            const id = pinData.id;
            const authUrl = `https://app.plex.tv/auth#?clientID=${CLIENT_ID}&code=${code}&context%5Bdevice%5D%5Bproduct%5D=Schedulearr`;

            return NextResponse.json({ id, code, authUrl });
        }

        // Step 2: Poll to check if user approved the PIN on Plex.tv
        if (action === 'check_pin') {
            if (!pinId) {
                return NextResponse.json({ error: 'pinId is required' }, { status: 400 });
            }

            const res = await axios.get(
                `https://plex.tv/api/v2/pins/${pinId}`,
                {
                    headers: {
                        'X-Plex-Client-Identifier': CLIENT_ID,
                        'Accept': 'application/json'
                    },
                    timeout: 8000
                }
            );

            const pinData = res.data;
            if (pinData?.authToken) {
                // Fetch server connections for this user
                let servers: any[] = [];
                try {
                    const serverRes = await axios.get('https://plex.tv/api/v2/resources?includeHttps=1', {
                        headers: {
                            'X-Plex-Token': pinData.authToken,
                            'X-Plex-Client-Identifier': CLIENT_ID,
                            'Accept': 'application/json'
                        },
                        timeout: 5000
                    });

                    if (Array.isArray(serverRes.data)) {
                        servers = serverRes.data
                            .filter((r: any) => r.provides && r.provides.includes('server'))
                            .map((r: any) => {
                                const connections = r.connections || [];
                                const localConn = connections.find((c: any) => c.local) || connections[0];
                                return {
                                    name: r.name,
                                    product: r.product,
                                    uri: localConn?.uri || `http://${r.publicAddress}:32400`,
                                    localUri: localConn?.uri,
                                    accessToken: r.accessToken || pinData.authToken
                                };
                            });
                    }
                } catch (e) {
                    console.warn('Could not fetch Plex servers list:', e);
                }

                return NextResponse.json({
                    approved: true,
                    authToken: pinData.authToken,
                    servers
                });
            }

            return NextResponse.json({ approved: false });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (e: any) {
        console.error('Error in Plex Auth API:', e.message);
        return NextResponse.json({ error: e.message || 'Plex Auth Failed' }, { status: 500 });
    }
}

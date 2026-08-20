import { NextResponse } from 'next/server';
import { getInstances } from '@/lib/db';
import axios from 'axios';
import xml2js from 'xml2js';

export const dynamic = 'force-dynamic';

const CLIENT_ID = 'Schedulearr-Plex-Client';

async function parseXml(xmlString: string): Promise<any> {
    try {
        return await xml2js.parseStringPromise(xmlString, { explicitArray: false, mergeAttrs: true });
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        if (plexInstances.length === 0) {
            return NextResponse.json({ users: [], libraries: [], error: 'No active Plex instances configured' });
        }

        let allUsers: any[] = [];
        let allLibraries: any[] = [];

        for (const plex of plexInstances) {
            let sections: any[] = [];
            let machineIdentifier = '';

            // 1. Fetch Plex Server Local Libraries & Identity
            try {
                const secRes = await axios.get(`${plex.url}/library/sections`, {
                    headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                    timeout: 6000
                });
                const dirs = secRes.data?.MediaContainer?.Directory || [];
                sections = (Array.isArray(dirs) ? dirs : [dirs]).filter(Boolean).map((d: any) => ({
                    id: String(d.key),
                    key: String(d.key),
                    title: d.title,
                    type: d.type,
                    instanceId: plex.id,
                    instanceName: plex.name
                }));
                allLibraries.push(...sections);

                const identRes = await axios.get(`${plex.url}/identity`, {
                    headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                    timeout: 5000
                });
                machineIdentifier = identRes.data?.MediaContainer?.machineIdentifier || '';
            } catch (err) {
                console.error(`Failed to fetch sections for ${plex.name}:`, err);
            }

            // 2. Fetch Server Shares from Plex TV API
            if (machineIdentifier) {
                try {
                    const sharesRes = await axios.get(`https://plex.tv/api/servers/${machineIdentifier}/shares`, {
                        headers: {
                            'X-Plex-Token': plex.api_key,
                            'X-Plex-Client-Identifier': CLIENT_ID
                        },
                        timeout: 7000
                    });

                    if (sharesRes.data) {
                        const parsed = typeof sharesRes.data === 'string' ? await parseXml(sharesRes.data) : sharesRes.data;
                        const rawShares = parsed?.MediaContainer?.SharedServer || [];
                        const shareList = Array.isArray(rawShares) ? rawShares : [rawShares].filter(Boolean);

                        for (const s of shareList) {
                            const shareId = String(s.id || s['@_id'] || '');
                            const userId = String(s.userID || s['@_userID'] || shareId);
                            const username = s.username || s['@_username'] || s.title || s['@_title'] || 'Plex Friend';
                            const email = s.email || s['@_email'] || '';
                            const thumb = s.thumb || s['@_thumb'] || '';

                            // Parse shared sections
                            const rawSecs = s.Section || s.section || [];
                            const secList = Array.isArray(rawSecs) ? rawSecs : [rawSecs].filter(Boolean);
                            const sharedSectionIds: string[] = [];

                            secList.forEach((sec: any) => {
                                const isShared = sec.shared === '1' || sec['@_shared'] === '1' || sec.shared === true;
                                const secKey = String(sec.id || sec['@_id'] || sec.key || sec['@_key'] || '');
                                if (isShared && secKey) {
                                    sharedSectionIds.push(secKey);
                                }
                            });

                            if (userId && !allUsers.some(x => x.id === userId || (x.sharedServerId && x.sharedServerId === shareId))) {
                                allUsers.push({
                                    id: userId,
                                    sharedServerId: shareId,
                                    username,
                                    title: username,
                                    email,
                                    thumb,
                                    isAdmin: false,
                                    isRestricted: false,
                                    isHomeUser: false,
                                    instanceId: plex.id,
                                    machineIdentifier,
                                    sharedLibraries: sharedSectionIds
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch server shares from Plex.tv:', e);
                }
            }

            // 3. Fetch Home Users from Plex TV API
            try {
                const homeRes = await axios.get('https://plex.tv/api/home/users', {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'X-Plex-Client-Identifier': CLIENT_ID
                    },
                    timeout: 6000
                }).catch(() => null);

                if (homeRes?.data) {
                    const parsed = typeof homeRes.data === 'string' ? await parseXml(homeRes.data) : homeRes.data;
                    const rawUsers = parsed?.MediaContainer?.User || [];
                    const userList = Array.isArray(rawUsers) ? rawUsers : [rawUsers].filter(Boolean);

                    userList.forEach((u: any) => {
                        const id = String(u.id || u['@_id'] || '');
                        const title = u.title || u.username || u['@_title'] || 'Home User';
                        const email = u.email || '';
                        const thumb = u.thumb || '';
                        const admin = u.admin === '1' || u.admin === true || u.protected === '1';
                        const restricted = u.restricted === '1' || u.restricted === true;

                        const existing = allUsers.find(x => x.id === id);
                        if (existing) {
                            existing.isHomeUser = true;
                            existing.isAdmin = admin;
                            existing.isRestricted = restricted;
                        } else if (id) {
                            allUsers.push({
                                id,
                                username: title,
                                title,
                                email,
                                thumb,
                                isAdmin: admin,
                                isRestricted: restricted,
                                isHomeUser: true,
                                instanceId: plex.id,
                                machineIdentifier,
                                sharedLibraries: sections.map(s => s.id)
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to fetch Plex home users:', e);
            }

            // 4. Fetch Friends v2 JSON API
            try {
                const friendsRes = await axios.get('https://plex.tv/api/v2/friends', {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'X-Plex-Client-Identifier': CLIENT_ID,
                        'Accept': 'application/json'
                    },
                    timeout: 6000
                }).catch(() => null);

                if (friendsRes?.data && Array.isArray(friendsRes.data)) {
                    friendsRes.data.forEach((f: any) => {
                        const id = String(f.id);
                        const existing = allUsers.find(x => x.id === id);
                        const sharedSectionIds = (f.sharingSettings?.sectionIds || []).map(String);

                        if (existing && sharedSectionIds.length > 0) {
                            existing.sharedLibraries = sharedSectionIds;
                        } else if (!existing && id) {
                            allUsers.push({
                                id,
                                username: f.username || f.title || f.friendlyName || 'Plex Friend',
                                title: f.friendlyName || f.username || 'Plex Friend',
                                email: f.email || '',
                                thumb: f.thumb || f.avatarUrl || '',
                                isAdmin: false,
                                isRestricted: f.restricted || false,
                                isHomeUser: false,
                                instanceId: plex.id,
                                machineIdentifier,
                                sharedLibraries: sharedSectionIds.length > 0 ? sharedSectionIds : sections.map(s => s.id)
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to fetch Plex friends v2:', e);
            }
        }

        return NextResponse.json({
            users: allUsers,
            libraries: allLibraries
        });
    } catch (error: any) {
        console.error('API /plex/users error:', error);
        return NextResponse.json({ error: error?.message || 'Failed to fetch Plex users' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { instanceId, username, email, isHomeUser, librarySectionIds } = body;

        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

        if (!plex) {
            return NextResponse.json({ error: 'Plex instance not found or not configured' }, { status: 400 });
        }

        if (isHomeUser) {
            if (!username) {
                return NextResponse.json({ error: 'Username is required for managed user' }, { status: 400 });
            }

            const res = await axios.post(`https://plex.tv/api/home/users?name=${encodeURIComponent(username)}`, {}, {
                headers: {
                    'X-Plex-Token': plex.api_key,
                    'X-Plex-Client-Identifier': CLIENT_ID,
                    'Accept': 'application/json'
                },
                timeout: 8000
            });

            return NextResponse.json({ success: true, data: res.data });
        } else {
            if (!email && !username) {
                return NextResponse.json({ error: 'Email or username is required' }, { status: 400 });
            }

            const targetUser = email || username;
            const res = await axios.post(
                `https://plex.tv/api/v2/friends?user=${encodeURIComponent(targetUser)}`,
                {
                    sharingSettings: {
                        sectionIds: (librarySectionIds || []).map(Number)
                    }
                },
                {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'X-Plex-Client-Identifier': CLIENT_ID,
                        'Accept': 'application/json'
                    },
                    timeout: 8000
                }
            );

            return NextResponse.json({ success: true, data: res.data });
        }
    } catch (error: any) {
        console.error('API /plex/users POST error:', error);
        return NextResponse.json({ error: error?.response?.data?.message || error?.message || 'Failed to create Plex user' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { userId, sharedServerId, instanceId, librarySectionIds } = body;

        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

        if (!plex) {
            return NextResponse.json({ error: 'Plex instance not found' }, { status: 400 });
        }

        let machineIdentifier = '';
        try {
            const identRes = await axios.get(`${plex.url}/identity`, {
                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                timeout: 5000
            });
            machineIdentifier = identRes.data?.MediaContainer?.machineIdentifier || '';
        } catch {
            // Ignore
        }

        const secIdsArray = Array.isArray(librarySectionIds) ? librarySectionIds.map(String) : [];
        const secIdsCsv = secIdsArray.join(',');
        let updated = false;

        // Method 1: Update via Plex TV Server Shares API (Primary Plex Share Mechanism)
        if (machineIdentifier) {
            // Find shareId if not supplied
            let targetShareId = sharedServerId;
            if (!targetShareId) {
                try {
                    const sharesRes = await axios.get(`https://plex.tv/api/servers/${machineIdentifier}/shares`, {
                        headers: { 'X-Plex-Token': plex.api_key, 'X-Plex-Client-Identifier': CLIENT_ID },
                        timeout: 6000
                    });
                    if (sharesRes.data) {
                        const parsed = typeof sharesRes.data === 'string' ? await parseXml(sharesRes.data) : sharesRes.data;
                        const rawShares = parsed?.MediaContainer?.SharedServer || [];
                        const shareList = Array.isArray(rawShares) ? rawShares : [rawShares].filter(Boolean);
                        const match = shareList.find((s: any) => String(s.userID || s['@_userID'] || s.id || s['@_id']) === String(userId));
                        if (match) {
                            targetShareId = String(match.id || match['@_id']);
                        }
                    }
                } catch {
                    // Ignore
                }
            }

            if (targetShareId) {
                try {
                    await axios.put(
                        `https://plex.tv/api/servers/${machineIdentifier}/shares/${targetShareId}?library_section_ids=${encodeURIComponent(secIdsCsv)}`,
                        {},
                        {
                            headers: {
                                'X-Plex-Token': plex.api_key,
                                'X-Plex-Client-Identifier': CLIENT_ID
                            },
                            timeout: 8000
                        }
                    );
                    updated = true;
                } catch (e) {
                    console.error('Failed to update share via PUT shares/{id}:', e);
                }
            }
        }

        // Method 2: Update via Plex Friends v2 API
        try {
            await axios.post(
                `https://plex.tv/api/v2/friends/${userId}`,
                {
                    sharingSettings: {
                        sectionIds: secIdsArray.map(Number)
                    }
                },
                {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'X-Plex-Client-Identifier': CLIENT_ID,
                        'Accept': 'application/json'
                    },
                    timeout: 8000
                }
            );
            updated = true;
        } catch (e) {
            // Ignore if already updated
        }

        // Method 3: Update via Plex Home User sections API
        try {
            await axios.post(
                `https://plex.tv/api/home/users/${userId}/sections?library_section_ids=${encodeURIComponent(secIdsCsv)}`,
                {},
                {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'X-Plex-Client-Identifier': CLIENT_ID
                    },
                    timeout: 8000
                }
            );
            updated = true;
        } catch (e) {
            // Ignore
        }

        return NextResponse.json({ success: true, updated });
    } catch (error: any) {
        console.error('API /plex/users PUT error:', error);
        return NextResponse.json({ error: error?.message || 'Failed to update library permissions' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const instanceId = searchParams.get('instanceId');

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

        if (!plex) {
            return NextResponse.json({ error: 'Plex instance not found' }, { status: 400 });
        }

        let machineIdentifier = '';
        try {
            const identRes = await axios.get(`${plex.url}/identity`, {
                headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                timeout: 5000
            });
            machineIdentifier = identRes.data?.MediaContainer?.machineIdentifier || '';
        } catch {
            // Ignore
        }

        // 1. Try deleting share from Plex Server Shares
        if (machineIdentifier) {
            try {
                const sharesRes = await axios.get(`https://plex.tv/api/servers/${machineIdentifier}/shares`, {
                    headers: { 'X-Plex-Token': plex.api_key, 'X-Plex-Client-Identifier': CLIENT_ID },
                    timeout: 6000
                });
                if (sharesRes.data) {
                    const parsed = typeof sharesRes.data === 'string' ? await parseXml(sharesRes.data) : sharesRes.data;
                    const rawShares = parsed?.MediaContainer?.SharedServer || [];
                    const shareList = Array.isArray(rawShares) ? rawShares : [rawShares].filter(Boolean);
                    const match = shareList.find((s: any) => String(s.userID || s['@_userID'] || s.id || s['@_id']) === String(userId));
                    if (match) {
                        const targetShareId = String(match.id || match['@_id']);
                        await axios.delete(`https://plex.tv/api/servers/${machineIdentifier}/shares/${targetShareId}`, {
                            headers: { 'X-Plex-Token': plex.api_key, 'X-Plex-Client-Identifier': CLIENT_ID },
                            timeout: 8000
                        });
                    }
                }
            } catch {
                // Ignore
            }
        }

        // 2. Try deleting from Plex Home
        try {
            await axios.delete(`https://plex.tv/api/home/users/${userId}`, {
                headers: {
                    'X-Plex-Token': plex.api_key,
                    'X-Plex-Client-Identifier': CLIENT_ID
                },
                timeout: 8000
            });
        } catch {
            // 3. Try deleting from friends
            await axios.delete(`https://plex.tv/api/v2/friends/${userId}`, {
                headers: {
                    'X-Plex-Token': plex.api_key,
                    'X-Plex-Client-Identifier': CLIENT_ID
                },
                timeout: 8000
            }).catch(() => null);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('API /plex/users DELETE error:', error);
        return NextResponse.json({ error: error?.message || 'Failed to delete user' }, { status: 500 });
    }
}

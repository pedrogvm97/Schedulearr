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
            // 1. Fetch Plex Server Libraries
            let sections: any[] = [];
            let machineIdentifier = '';
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

                // Fetch server machine identifier
                const identRes = await axios.get(`${plex.url}/identity`, {
                    headers: { 'X-Plex-Token': plex.api_key, 'Accept': 'application/json' },
                    timeout: 5000
                });
                machineIdentifier = identRes.data?.MediaContainer?.machineIdentifier || '';
            } catch (err) {
                console.error(`Failed to fetch sections for ${plex.name}:`, err);
            }

            // 2. Fetch Plex Home Users & Friends
            try {
                // Try Plex TV Home Users API
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
                        const id = u.id || u['@_id'];
                        const title = u.title || u.username || u['@_title'] || 'Home User';
                        const email = u.email || '';
                        const thumb = u.thumb || '';
                        const admin = u.admin === '1' || u.admin === true || u.protected === '1';
                        const restricted = u.restricted === '1' || u.restricted === true;

                        if (id && !allUsers.some(x => x.id === String(id))) {
                            allUsers.push({
                                id: String(id),
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

                // Try Plex TV Friends API (v2 JSON)
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
                        if (!allUsers.some(x => x.id === id)) {
                            const sharedSectionIds = (f.sharingSettings?.sectionIds || []).map(String);
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

                // Try legacy Plex TV Users XML API fallback
                if (allUsers.length === 0) {
                    const usersRes = await axios.get('https://plex.tv/api/users', {
                        headers: {
                            'X-Plex-Token': plex.api_key,
                            'X-Plex-Client-Identifier': CLIENT_ID
                        },
                        timeout: 6000
                    }).catch(() => null);

                    if (usersRes?.data) {
                        const parsed = typeof usersRes.data === 'string' ? await parseXml(usersRes.data) : usersRes.data;
                        const rawUsers = parsed?.MediaContainer?.User || [];
                        const userList = Array.isArray(rawUsers) ? rawUsers : [rawUsers].filter(Boolean);

                        userList.forEach((u: any) => {
                            const id = String(u.id || u['@_id']);
                            if (!allUsers.some(x => x.id === id)) {
                                allUsers.push({
                                    id,
                                    username: u.title || u.username || 'User',
                                    title: u.title || u.username || 'User',
                                    email: u.email || '',
                                    thumb: u.thumb || '',
                                    isAdmin: u.admin === '1',
                                    isRestricted: false,
                                    isHomeUser: false,
                                    instanceId: plex.id,
                                    machineIdentifier,
                                    sharedLibraries: sections.map(s => s.id)
                                });
                            }
                        });
                    }
                }
            } catch (err) {
                console.error(`Failed to fetch Plex users for ${plex.name}:`, err);
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
                        sectionIds: librarySectionIds || []
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
        const { userId, instanceId, librarySectionIds } = body;

        const plexInstances = getInstances().filter(i => i.type === 'plex' && i.enabled);
        const plex = instanceId ? plexInstances.find(i => i.id === instanceId) : plexInstances[0];

        if (!plex) {
            return NextResponse.json({ error: 'Plex instance not found' }, { status: 400 });
        }

        // Update library access settings on Plex TV
        await axios.post(
            `https://plex.tv/api/v2/friends/${userId}/sections`,
            { sectionIds: librarySectionIds },
            {
                headers: {
                    'X-Plex-Token': plex.api_key,
                    'X-Plex-Client-Identifier': CLIENT_ID,
                    'Accept': 'application/json'
                },
                timeout: 8000
            }
        ).catch(async () => {
            return axios.post(
                `https://plex.tv/api/home/users/${userId}/sections`,
                { sectionIds: librarySectionIds },
                {
                    headers: {
                        'X-Plex-Token': plex.api_key,
                        'X-Plex-Client-Identifier': CLIENT_ID
                    },
                    timeout: 8000
                }
            );
        });

        return NextResponse.json({ success: true, updated: true });
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

        try {
            await axios.delete(`https://plex.tv/api/home/users/${userId}`, {
                headers: {
                    'X-Plex-Token': plex.api_key,
                    'X-Plex-Client-Identifier': CLIENT_ID
                },
                timeout: 8000
            });
        } catch {
            await axios.delete(`https://plex.tv/api/v2/friends/${userId}`, {
                headers: {
                    'X-Plex-Token': plex.api_key,
                    'X-Plex-Client-Identifier': CLIENT_ID
                },
                timeout: 8000
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('API /plex/users DELETE error:', error);
        return NextResponse.json({ error: error?.message || 'Failed to delete user' }, { status: 500 });
    }
}

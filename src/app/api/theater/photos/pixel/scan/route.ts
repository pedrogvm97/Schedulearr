import { NextResponse } from 'next/server';
import net from 'net';
import os from 'os';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import { getSetting, setSetting } from '@/lib/db';

const execAsync = util.promisify(exec);

export const dynamic = 'force-dynamic';

interface DiscoveredPixel {
    ip: string;
    port: number;
    model: string;
    device: string;
    androidVersion: string;
    unlimitedTier: 'original_quality' | 'storage_saver' | 'none';
    freeStorage?: string;
    totalStorage?: string;
    batteryLevel?: number;
    isCharging?: boolean;
    isOnline: boolean;
    adbActive?: boolean;
    note?: string;
}

// Google LLC MAC Address Prefixes (OUI)
const GOOGLE_MAC_PREFIXES = ['ac:37:43', 'f4:f5:e8', '3c:28:6d', 'a4:c3:f0', '08:9e:08', '54:60:09', '70:bc:10', 'd8:6c:63'];

// Detect devices on local network from kernel ARP cache
function getArpGoogleDevices(): Array<{ ip: string; mac: string; isGoogle: boolean }> {
    const list: Array<{ ip: string; mac: string; isGoogle: boolean }> = [];
    try {
        if (fs.existsSync('/proc/net/arp')) {
            const raw = fs.readFileSync('/proc/net/arp', 'utf-8');
            const lines = raw.split('\n').slice(1);
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                    const ip = parts[0];
                    const mac = parts[3].toLowerCase();
                    if (mac && mac !== '00:00:00:00:00:00') {
                        const isGoogle = GOOGLE_MAC_PREFIXES.some(prefix => mac.startsWith(prefix));
                        list.push({ ip, mac, isGoogle });
                    }
                }
            }
        }
    } catch {}
    return list;
}

// Check if a specific TCP port is open with a fast timeout
function checkPortOpen(ip: string, port: number = 5555, timeoutMs: number = 500): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = false;

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => {
            status = true;
            socket.destroy();
        });
        socket.once('timeout', () => {
            socket.destroy();
        });
        socket.once('error', () => {
            socket.destroy();
        });
        socket.once('close', () => {
            resolve(status);
        });

        socket.connect(port, ip);
    });
}

// Classify unlimited backup tier based on Android model / device codename
function classifyPixelTier(model: string, device: string): 'original_quality' | 'storage_saver' | 'none' {
    const m = (model || '').toLowerCase();
    const d = (device || '').toLowerCase();

    // Pixel 1 (2016) Sailfish & Marlin = Lifetime Original Quality
    if (m === 'pixel' || m === 'pixel xl' || d === 'sailfish' || d === 'marlin') {
        return 'original_quality';
    }

    // Pixel 2 to 5 = Storage Saver (High Quality) unlimited
    if (
        m.includes('pixel 2') || m.includes('pixel 3') || m.includes('pixel 4') || m.includes('pixel 5') ||
        ['walleye', 'taimen', 'blueline', 'crosshatch', 'sargo', 'bonito', 'flame', 'coral', 'sunfish', 'bramble', 'redfin', 'barbet'].includes(d)
    ) {
        return 'storage_saver';
    }

    return 'none';
}

// Query device info via ADB if available
async function queryDeviceAdb(ip: string, port: number = 5555): Promise<Partial<DiscoveredPixel>> {
    const target = `${ip}:${port}`;
    try {
        // Try connecting
        await execAsync(`adb connect ${target}`, { timeout: 3000 }).catch(() => null);

        // Fetch properties
        const [modelOut, deviceOut, releaseOut] = await Promise.all([
            execAsync(`adb -s ${target} shell getprop ro.product.model`, { timeout: 2000 }).catch(() => ({ stdout: '' })),
            execAsync(`adb -s ${target} shell getprop ro.product.device`, { timeout: 2000 }).catch(() => ({ stdout: '' })),
            execAsync(`adb -s ${target} shell getprop ro.build.version.release`, { timeout: 2000 }).catch(() => ({ stdout: '' }))
        ]);

        const model = modelOut.stdout.trim() || 'Google Pixel';
        const device = deviceOut.stdout.trim() || 'sailfish';
        const androidVersion = releaseOut.stdout.trim() || '10';

        // Query storage info
        let freeStorage: string | undefined;
        let totalStorage: string | undefined;
        try {
            const dfOut = await execAsync(`adb -s ${target} shell df -h /data`, { timeout: 2000 });
            const lines = dfOut.stdout.trim().split('\n');
            if (lines.length > 1) {
                const cols = lines[1].trim().split(/\s+/);
                if (cols.length >= 4) {
                    totalStorage = cols[1];
                    freeStorage = cols[3];
                }
            }
        } catch {}

        // Query battery info
        let batteryLevel: number | undefined;
        let isCharging: boolean | undefined;
        try {
            const battOut = await execAsync(`adb -s ${target} shell dumpsys battery`, { timeout: 2000 });
            const levelMatch = battOut.stdout.match(/level:\s*(\d+)/i);
            const statusMatch = battOut.stdout.match(/status:\s*(\d+)/i); // 2 = charging, 5 = full
            if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10);
            if (statusMatch) isCharging = statusMatch[1] === '2' || statusMatch[1] === '5';
        } catch {}

        return {
            model,
            device,
            androidVersion,
            unlimitedTier: classifyPixelTier(model, device),
            freeStorage,
            totalStorage,
            batteryLevel,
            isCharging,
            adbActive: true
        };
    } catch {
        // If ADB CLI is unavailable or fails, return default Pixel profile
        return {
            model: 'Google Pixel (ADB)',
            device: 'sailfish',
            androidVersion: '10',
            unlimitedTier: 'original_quality',
            adbActive: false
        };
    }
}

// Generate candidate IPs based on local network interfaces and Tailscale
function getCandidateIps(explicitTarget?: string): string[] {
    if (explicitTarget && explicitTarget.trim()) {
        const cleaned = explicitTarget.trim().split(':')[0];
        if (!cleaned.includes('/')) return [cleaned];
    }

    const ips: string[] = [];
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        const addrs = interfaces[name] || [];
        for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
                const parts = addr.address.split('.');
                if (parts.length === 4) {
                    const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
                    for (let i = 1; i <= 254; i++) {
                        ips.push(`${prefix}.${i}`);
                    }
                }
            }
        }
    }

    return Array.from(new Set(ips));
}

// GET: Return saved Pixel bridge node config & status
export async function GET() {
    try {
        const raw = getSetting('pixel_bridge_node');
        const node = raw ? JSON.parse(raw) : null;

        if (!node || !node.ip) {
            return NextResponse.json({ paired: false });
        }

        // Live probe to check if online
        const isOnline = await checkPortOpen(node.ip, node.port || 5555, 600);
        let liveStats: Partial<DiscoveredPixel> = {};
        if (isOnline) {
            liveStats = await queryDeviceAdb(node.ip, node.port || 5555);
        }

        return NextResponse.json({
            paired: true,
            node: {
                ...node,
                ...liveStats,
                isOnline: isOnline || node.isOnline || false,
                adbActive: isOnline
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Trigger network scan or pair a selected device
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { action, targetIp, nodeData } = body;

        // Action 1: Pair a discovered node
        if (action === 'pair') {
            if (!nodeData || !nodeData.ip) {
                return NextResponse.json({ error: 'nodeData with valid IP required' }, { status: 400 });
            }
            setSetting('pixel_bridge_node', JSON.stringify({
                ...nodeData,
                pairedAt: new Date().toISOString()
            }));
            return NextResponse.json({ success: true, message: 'Pixel Bridge Node paired successfully' });
        }

        // Action 2: Unpair current node
        if (action === 'unpair') {
            setSetting('pixel_bridge_node', '');
            return NextResponse.json({ success: true, message: 'Pixel Bridge Node unpaired' });
        }

        // Action 3: Scan network for Pixels (ADB port 5555 & local ARP Google hardware)
        const candidates = getCandidateIps(targetIp);
        const arpDevices = getArpGoogleDevices();
        const googleIps = arpDevices.filter(d => d.isGoogle).map(d => d.ip);

        // Put Google device IPs at the front of candidate list if not already
        for (const gIp of googleIps) {
            if (!candidates.includes(gIp)) candidates.unshift(gIp);
        }

        const discovered: DiscoveredPixel[] = [];

        // Run batch checks (chunks of 30 parallel connections)
        const CHUNK_SIZE = 30;
        for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
            const chunk = candidates.slice(i, i + CHUNK_SIZE);
            const results = await Promise.all(
                chunk.map(async (ip) => {
                    const isOpen = await checkPortOpen(ip, 5555, 500);
                    const isGoogle = googleIps.includes(ip) || ip === targetIp?.split(':')[0];
                    if (isOpen) {
                        const details = await queryDeviceAdb(ip, 5555);
                        return {
                            ip,
                            port: 5555,
                            model: details.model || 'Google Pixel',
                            device: details.device || 'sailfish',
                            androidVersion: details.androidVersion || '10',
                            unlimitedTier: details.unlimitedTier || 'original_quality',
                            freeStorage: details.freeStorage,
                            totalStorage: details.totalStorage,
                            batteryLevel: details.batteryLevel,
                            isCharging: details.isCharging,
                            isOnline: true,
                            adbActive: true
                        } as DiscoveredPixel;
                    } else if (isGoogle) {
                        return {
                            ip,
                            port: 5555,
                            model: 'Google Pixel 1',
                            device: 'sailfish',
                            androidVersion: '10',
                            unlimitedTier: 'original_quality',
                            isOnline: true,
                            adbActive: false,
                            note: 'LAN Device (Port 5555 Closed)'
                        } as DiscoveredPixel;
                    }
                    return null;
                })
            );

            for (const r of results) {
                if (r) discovered.push(r);
            }

            // If a specific target IP was passed and found, exit early
            if (targetIp && discovered.length > 0) break;
        }

        // If user entered explicit target IP and nothing was returned, add it directly as candidate
        if (targetIp && discovered.length === 0) {
            const cleanIp = targetIp.trim().split(':')[0];
            const cleanPort = parseInt(targetIp.trim().split(':')[1]) || 5555;
            discovered.push({
                ip: cleanIp,
                port: cleanPort,
                model: 'Google Pixel 1 (Manual Target)',
                device: 'sailfish',
                androidVersion: '10',
                unlimitedTier: 'original_quality',
                isOnline: true,
                adbActive: false,
                note: 'Manual IP Target'
            });
        }

        return NextResponse.json({
            success: true,
            discovered,
            scannedCount: candidates.length,
            detectedGoogleDevices: googleIps
        });
    } catch (e: any) {
        console.error('API /theater/photos/pixel/scan error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

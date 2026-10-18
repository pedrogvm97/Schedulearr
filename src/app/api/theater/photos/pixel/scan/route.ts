import { NextResponse } from 'next/server';
import net from 'net';
import os from 'os';
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
            isCharging
        };
    } catch {
        // If ADB CLI is unavailable or fails, return default Pixel profile
        return {
            model: 'Google Pixel (ADB)',
            device: 'sailfish',
            androidVersion: '10',
            unlimitedTier: 'original_quality'
        };
    }
}

// Generate candidate IPs based on local network interfaces and Tailscale
function getCandidateIps(explicitTarget?: string): string[] {
    if (explicitTarget && explicitTarget.trim()) {
        const cleaned = explicitTarget.trim();
        if (!cleaned.includes('/')) return [cleaned];
    }

    const ips: string[] = [];
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        const addrs = interfaces[name] || [];
        for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
                // If it's a standard home subnet (e.g. 192.168.1.x or 10.x.x.x)
                const parts = addr.address.split('.');
                if (parts.length === 4) {
                    const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
                    // Sweep common host addresses near server
                    for (let i = 1; i <= 254; i++) {
                        ips.push(`${prefix}.${i}`);
                    }
                }
            }
        }
    }

    // Deduplicate
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
                isOnline
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

        // Action 3: Scan network for Pixels on port 5555
        const candidates = getCandidateIps(targetIp);
        const discovered: DiscoveredPixel[] = [];

        // Run batch checks (chunks of 30 parallel connections)
        const CHUNK_SIZE = 30;
        for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
            const chunk = candidates.slice(i, i + CHUNK_SIZE);
            const results = await Promise.all(
                chunk.map(async (ip) => {
                    const isOpen = await checkPortOpen(ip, 5555, 500);
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
                            isOnline: true
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

        return NextResponse.json({
            success: true,
            discovered,
            scannedCount: candidates.length
        });
    } catch (e: any) {
        console.error('API /theater/photos/pixel/scan error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

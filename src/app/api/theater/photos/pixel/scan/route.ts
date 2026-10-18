import { NextResponse } from 'next/server';
import net from 'net';
import os from 'os';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import { getSetting, setSetting } from '@/lib/db';
import { saveConnectedDevice } from '@/lib/deviceSync';

const execAsync = util.promisify(exec);

export const dynamic = 'force-dynamic';

interface DiscoveredPixel {
    ip: string;
    port: number;
    model: string;
    device: string;
    androidVersion: string;
    unlimitedTier: 'original_quality' | 'storage_saver' | 'none';
    role?: 'upload_bridge' | 'sync_target';
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

// Detect devices on local network from kernel ARP cache or arp -a
function getArpDevices(): Array<{ ip: string; mac: string; isGoogle: boolean }> {
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
    if (m === 'pixel' || m === 'pixel xl' || d === 'sailfish' || d === 'marlin' || m.includes('pixel 1')) {
        return 'original_quality';
    }

    // Pixel 2 to 5 = Storage Saver (High Quality) unlimited
    if (
        m.includes('pixel 2') || m.includes('pixel 3') || m.includes('pixel 4') || m.includes('pixel 5') ||
        ['walleye', 'taimen', 'blueline', 'crosshatch', 'sargo', 'bonito', 'flame', 'coral', 'sunfish', 'bramble', 'redfin', 'barbet'].includes(d)
    ) {
        return 'storage_saver';
    }

    // Modern Pixels (Pixel 6, 7, 8, 9, 10, Fold, Tablet) have 'none' unlimited cloud tier
    // but are premier sync_target devices for offline media!
    return 'none';
}

// Query already connected / authorized ADB devices (via USB or network)
async function queryAdbConnectedDevices(): Promise<DiscoveredPixel[]> {
    try {
        const { stdout } = await execAsync('adb devices -l', { timeout: 3000 });
        const lines = stdout.split('\n').slice(1);
        const list: DiscoveredPixel[] = [];

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && (parts[1] === 'device' || parts[1] === 'unauthorized')) {
                const target = parts[0];
                const [ip, portStr] = target.split(':');
                const port = parseInt(portStr, 10) || 5555;
                const modelMatch = line.match(/model:(\S+)/);
                const deviceMatch = line.match(/device:(\S+)/);
                const rawModel = modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'Google Pixel 10';
                const rawDevice = deviceMatch ? deviceMatch[1] : '';
                const unlimitedTier = classifyPixelTier(rawModel, rawDevice);
                const role: 'upload_bridge' | 'sync_target' = unlimitedTier !== 'none' ? 'upload_bridge' : 'sync_target';

                list.push({
                    ip: ip || '127.0.0.1',
                    port,
                    model: rawModel,
                    device: rawDevice,
                    androidVersion: '14',
                    unlimitedTier,
                    role,
                    isOnline: parts[1] === 'device',
                    adbActive: parts[1] === 'device',
                    note: parts[1] === 'unauthorized' ? 'Unauthorized (Accept ADB prompt on phone)' : 'Active Wireless Debugging Node'
                });
            }
        }
        return list;
    } catch {
        return [];
    }
}

// Query device info via ADB if available
async function queryDeviceAdb(ip: string, port: number = 5555): Promise<Partial<DiscoveredPixel>> {
    const target = `${ip}:${port}`;
    try {
        // Try connecting
        await execAsync(`adb connect ${target}`, { timeout: 3000 }).catch(() => null);

        // Verify ADB device state
        const stateRes = await execAsync(`adb -s ${target} get-state`, { timeout: 2000 }).catch(() => ({ stdout: '' }));
        const state = stateRes.stdout.trim();
        const isDevice = state === 'device';

        if (!isDevice) {
            return {
                model: 'Google Pixel 10',
                device: 'husky',
                androidVersion: '14',
                unlimitedTier: 'none',
                role: 'sync_target',
                adbActive: false,
                note: state === 'unauthorized'
                    ? 'Unauthorized (Accept ADB prompt on phone)'
                    : 'Port 5555 Closed / Offline'
            };
        }

        // Fetch properties
        const [modelOut, deviceOut, releaseOut] = await Promise.all([
            execAsync(`adb -s ${target} shell getprop ro.product.model`, { timeout: 2000 }).catch(() => ({ stdout: '' })),
            execAsync(`adb -s ${target} shell getprop ro.product.device`, { timeout: 2000 }).catch(() => ({ stdout: '' })),
            execAsync(`adb -s ${target} shell getprop ro.build.version.release`, { timeout: 2000 }).catch(() => ({ stdout: '' }))
        ]);

        const rawModel = modelOut.stdout.trim();
        const model = rawModel || 'Google Pixel 10';
        const device = deviceOut.stdout.trim() || 'husky';
        const androidVersion = releaseOut.stdout.trim() || '14';
        const tier = classifyPixelTier(model, device);
        const role: 'upload_bridge' | 'sync_target' = tier !== 'none' ? 'upload_bridge' : 'sync_target';

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
            unlimitedTier: tier,
            role,
            freeStorage,
            totalStorage,
            batteryLevel,
            isCharging,
            adbActive: true,
            note: 'Active ADB Connection'
        };
    } catch {
        return {
            model: 'Google Pixel 10',
            device: 'husky',
            androidVersion: '14',
            unlimitedTier: 'none',
            role: 'sync_target',
            adbActive: false,
            note: 'Port 5555 Closed / Offline'
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
            const role: 'upload_bridge' | 'sync_target' = nodeData.unlimitedTier !== 'none' ? 'upload_bridge' : 'sync_target';
            setSetting('pixel_bridge_node', JSON.stringify({
                ...nodeData,
                role,
                pairedAt: new Date().toISOString()
            }));

            // Also synchronize into Connected Devices so it is accessible across all media sync tabs
            saveConnectedDevice({
                name: nodeData.model || 'Google Pixel 10',
                type: 'adb',
                role,
                target: `${nodeData.ip}:${nodeData.port || 5555}`,
                schedulearrFolder: role === 'upload_bridge' ? '/sdcard/DCIM/SchedulearrSync' : '/sdcard/Schedulearr',
                enabled: true,
                isOnline: nodeData.isOnline ?? true,
                batteryLevel: nodeData.batteryLevel,
                isCharging: nodeData.isCharging,
                storageFree: nodeData.freeStorage,
                storageTotal: nodeData.totalStorage
            });

            return NextResponse.json({
                success: true,
                message: `${nodeData.model || 'Device'} paired successfully (${role === 'upload_bridge' ? 'Upload Bridge' : 'Sync Target'})`
            });
        }

        // Action 2: Unpair current node
        if (action === 'unpair') {
            setSetting('pixel_bridge_node', '');
            return NextResponse.json({ success: true, message: 'Pixel Bridge Node unpaired' });
        }

        // Action: Pair with Android 11+ Wireless Debugging 6-digit pairing code
        if (action === 'pair_code') {
            const { ip, pairingPort, pairingCode, connectPort } = body;
            if (!ip || !pairingPort || !pairingCode) {
                return NextResponse.json({ error: 'IP, pairing port, and 6-digit pairing code are required' }, { status: 400 });
            }
            try {
                const pairRes = await execAsync(`adb pair ${ip}:${pairingPort} ${pairingCode}`, { timeout: 12000 });
                const connPort = connectPort || 5555;
                const connectRes = await execAsync(`adb connect ${ip}:${connPort}`, { timeout: 5000 }).catch(() => ({ stdout: '' }));
                return NextResponse.json({
                    success: true,
                    pairOutput: pairRes.stdout.trim(),
                    connectOutput: connectRes.stdout.trim(),
                    message: `Successfully paired with ${ip}:${pairingPort}`
                });
            } catch (err: any) {
                return NextResponse.json({ error: `Pairing failed: ${err.message}` }, { status: 500 });
            }
        }

        // Action: Run 'adb tcpip 5555' for USB-connected device (e.g. Pixel 1)
        if (action === 'usb_tcpip') {
            const { targetIp } = body;
            try {
                const devRes = await execAsync('adb devices -l', { timeout: 4000 }).catch(e => ({ stdout: e.message, stderr: '' }));
                const tcpipRes = await execAsync('adb tcpip 5555', { timeout: 8000 }).catch(e => ({ stdout: e.message, stderr: '' }));
                let connectOutput = '';
                if (targetIp && targetIp.trim()) {
                    const cleanIp = targetIp.trim().split(':')[0];
                    const connectRes = await execAsync(`adb connect ${cleanIp}:5555`, { timeout: 5000 }).catch(e => ({ stdout: e.message, stderr: '' }));
                    connectOutput = connectRes.stdout.trim();
                }
                const isSuccess = tcpipRes.stdout.toLowerCase().includes('restarting in tcp mode');
                return NextResponse.json({
                    success: isSuccess,
                    devicesOutput: devRes.stdout.trim(),
                    tcpipOutput: tcpipRes.stdout.trim(),
                    connectOutput: connectOutput || null,
                    message: isSuccess
                        ? 'TCP/IP mode activated on port 5555! You can now unplug the USB cable.'
                        : (tcpipRes.stdout.trim() || 'No USB device detected in ADB')
                });
            } catch (err: any) {
                return NextResponse.json({ error: `Failed to activate TCP/IP: ${err.message}` }, { status: 500 });
            }
        }

        // Action 3: Scan network for Pixels (ADB connected list, wireless debugging ports & local ARP)
        const discovered: DiscoveredPixel[] = [];

        // 3a. Immediately check already connected ADB devices (USB or Wireless Debugging)
        const adbConnected = await queryAdbConnectedDevices();
        for (const dev of adbConnected) {
            discovered.push(dev);
        }

        // 3b. If explicit target IP / Port passed (e.g. 192.168.1.150:41235 or 192.168.1.150)
        if (targetIp && targetIp.trim()) {
            const cleanIp = targetIp.trim().split(':')[0];
            const cleanPort = parseInt(targetIp.trim().split(':')[1], 10) || 5555;
            const details = await queryDeviceAdb(cleanIp, cleanPort);
            const tier = details.unlimitedTier || 'none';
            const role: 'upload_bridge' | 'sync_target' = tier !== 'none' ? 'upload_bridge' : 'sync_target';

            const alreadyIdx = discovered.findIndex(d => d.ip === cleanIp);
            const targetDev: DiscoveredPixel = {
                ip: cleanIp,
                port: cleanPort,
                model: details.model || 'Google Pixel 10',
                device: details.device || 'husky',
                androidVersion: details.androidVersion || '14',
                unlimitedTier: tier,
                role,
                freeStorage: details.freeStorage,
                totalStorage: details.totalStorage,
                batteryLevel: details.batteryLevel,
                isCharging: details.isCharging,
                isOnline: true,
                adbActive: details.adbActive ?? true,
                note: 'Direct Target Probed'
            };

            if (alreadyIdx >= 0) {
                discovered[alreadyIdx] = targetDev;
            } else {
                discovered.unshift(targetDev);
            }
        }

        // 3c. Scan candidate IPs across ARP cache & local subnet
        const candidates = getCandidateIps(targetIp);
        const arpDevices = getArpDevices();
        const googleIps = arpDevices.filter(d => d.isGoogle).map(d => d.ip);

        // Put Google device IPs and all ARP active IPs at the front of candidate list
        for (const a of arpDevices) {
            if (!candidates.includes(a.ip)) candidates.unshift(a.ip);
        }

        // Run batch checks (chunks of 30 parallel connections)
        const CHUNK_SIZE = 30;
        for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
            const chunk = candidates.slice(i, i + CHUNK_SIZE);
            const results = await Promise.all(
                chunk.map(async (ip) => {
                    if (discovered.some(d => d.ip === ip)) return null;

                    const isOpen = await checkPortOpen(ip, 5555, 500);
                    const isGoogle = googleIps.includes(ip) || ip === targetIp?.split(':')[0];

                    if (isOpen) {
                        const details = await queryDeviceAdb(ip, 5555);
                        const tier = details.unlimitedTier || 'none';
                        const role: 'upload_bridge' | 'sync_target' = tier !== 'none' ? 'upload_bridge' : 'sync_target';

                        return {
                            ip,
                            port: 5555,
                            model: details.model || 'Google Pixel 10',
                            device: details.device || 'husky',
                            androidVersion: details.androidVersion || '14',
                            unlimitedTier: tier,
                            role,
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
                            model: 'Google Pixel 10',
                            device: 'husky',
                            androidVersion: '14',
                            unlimitedTier: 'none',
                            role: 'sync_target',
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

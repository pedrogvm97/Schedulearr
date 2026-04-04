import { getInstances, logNetworkSpeed, pruneNetworkSpeedHistory, getSetting } from '@/lib/db';
import { authenticateQbittorrent, getTransferInfo } from '@/lib/qbittorrent';
import fs from 'fs';
import axios from 'axios';

let monitorInterval: NodeJS.Timeout | null = null;
let lastAuthTime = 0;
let cachedCookie = '';

// For Total Speed Monitoring (Linux)
let lastTotalRx = 0;
let lastTotalTx = 0;
let lastTotalTime = 0;

async function getQbitCookie(instance: any) {
    const now = Date.now();
    // Cache cookie for 30 minutes
    if (cachedCookie && (now - lastAuthTime < 30 * 60 * 1000)) {
        return cachedCookie;
    }

    try {
        const cookie = await authenticateQbittorrent(instance.url, instance.api_key);
        cachedCookie = cookie;
        lastAuthTime = now;
        return cookie;
    } catch (error) {
        console.error('Failed to authenticate with qBittorrent for speed monitor:', error);
        return null;
    }
}

async function getPlexThroughput() {
    const plexInstances = getInstances('plex', true);
    if (plexInstances.length === 0) return { dl: 0, up: 0 };

    let totalBandwidthKbps = 0;
    for (const inst of plexInstances) {
        try {
            const res = await axios.get(`${inst.url}/status/sessions`, {
                headers: { 'X-Plex-Token': inst.api_key, 'Accept': 'application/json' },
                timeout: 5000
            });
            const sessions = res.data?.MediaContainer?.Metadata || [];
            for (const s of sessions) {
                totalBandwidthKbps += (s.Session?.bandwidth || 0);
            }
        } catch (e: any) {
            console.error(`Plex speed monitor error (${inst.name}):`, e.message);
        }
    }
    // Convert kbps to bytes per second (kbps / 8 * 1024)
    // Actually our DB stores bytes per second for qbit, let's keep it consistent.
    // 1 kbps = 1000 bits per second = 125 bytes per second.
    return { dl: 0, up: totalBandwidthKbps * 125 }; 
}

function getTotalThroughput() {
    try {
        const content = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = content.split('\n');
        const targetInterface = getSetting('networkInterface') || 'total';
        
        let totalRx = 0;
        let totalTx = 0;
        
        // Skip header lines
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [iface, stats] = line.split(':');
            const name = iface.trim();
            
            if (!stats) continue;
            if (name === 'lo') continue; // Skip loopback
            
            if (targetInterface !== 'total' && name !== targetInterface) continue;
            
            const parts = stats.trim().split(/\s+/);
            if (parts.length < 9) continue;
            
            // parts[0] is Rx bytes, parts[8] is Tx bytes
            const rx = parseInt(parts[0], 10);
            const tx = parseInt(parts[8], 10);
            
            if (!isNaN(rx)) totalRx += rx;
            if (!isNaN(tx)) totalTx += tx;
        }

        const now = Date.now();
        let dlRate = 0;
        let upRate = 0;

        if (lastTotalTime > 0 && now > lastTotalTime) {
            const timeDiff = (now - lastTotalTime) / 1000;
            // Handle counter wrap-around or reset
            if (totalRx >= lastTotalRx) dlRate = (totalRx - lastTotalRx) / timeDiff;
            if (totalTx >= lastTotalTx) upRate = (totalTx - lastTotalTx) / timeDiff;
        }

        lastTotalRx = totalRx;
        lastTotalTx = totalTx;
        lastTotalTime = now;

        return { dl: dlRate, up: upRate };
    } catch (e) {
        return { dl: 0, up: 0 };
    }
}

export async function recordCurrentSpeed() {
    let qbitDl = 0;
    let qbitUp = 0;
    
    const qbitInstances = getInstances('qbittorrent', true);
    if (qbitInstances.length > 0) {
        const instance = qbitInstances[0];
        const cookie = await getQbitCookie(instance);
        if (cookie) {
            try {
                const { dl_info_speed, up_info_speed } = await getTransferInfo(instance.url, cookie);
                qbitDl = dl_info_speed;
                qbitUp = up_info_speed;
            } catch (error) {
                console.error('Error recording qBit speed:', error);
                cachedCookie = '';
            }
        }
    }

    const plex = await getPlexThroughput();
    const total = getTotalThroughput();

    logNetworkSpeed(qbitDl, qbitUp, qbitDl, qbitUp, plex.dl, plex.up, total.dl, total.up);
    
    if (Math.random() < 0.01) {
        pruneNetworkSpeedHistory(7); 
    }

    // Schedule next run based on current setting
    if (monitorInterval) {
        const intervalSec = parseInt(getSetting('network_speed_interval_sec') || '30');
        const validInterval = (isNaN(intervalSec) || intervalSec < 5) ? 30 : intervalSec;
        monitorInterval = setTimeout(recordCurrentSpeed, validInterval * 1000);
    }
}

export function startSpeedMonitor(intervalSeconds: number = 30) {
    if (monitorInterval) {
        clearTimeout(monitorInterval as NodeJS.Timeout);
    }

    console.log(`🚀 Network speed monitor started (Initial Interval: ${intervalSeconds}s)`);
    
    // We use a dummy timeout ID to indicate it's running
    monitorInterval = setTimeout(recordCurrentSpeed, 100);
}

export function stopSpeedMonitor() {
    if (monitorInterval) {
        clearTimeout(monitorInterval as NodeJS.Timeout);
        monitorInterval = null;
    }
}

import { getInstances, logNetworkSpeed, pruneNetworkSpeedHistory } from '@/lib/db';
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
        if (!fs.existsSync('/proc/net/dev')) return { dl: 0, up: 0 };
        
        const content = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = content.split('\n');
        let totalRx = 0;
        let totalTx = 0;
        
        // Skip header lines
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split(/\s+/);
            if (parts.length < 10) continue;
            
            // parts[0] is interface like "eth0:", parts[1] is Rx bytes, parts[9] is Tx bytes
            const rx = parseInt(parts[1], 10);
            const tx = parseInt(parts[9], 10);
            
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

    // The legacy dl/up in logNetworkSpeed was mainly for qbit, but now we have refined ones.
    // We'll pass qbit stats as the 'primary' for backward compatibility in the dashboard's main graph lines
    // IF the user hasn't toggled them yet.
    logNetworkSpeed(qbitDl, qbitUp, qbitDl, qbitUp, plex.dl, plex.up, total.dl, total.up);
    
    // Prune old data once an hour roughly
    if (Math.random() < 0.01) {
        pruneNetworkSpeedHistory(7); 
    }
}

export function startSpeedMonitor(intervalSeconds: number = 30) {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }

    console.log(`🚀 Network speed monitor started (Interval: ${intervalSeconds}s)`);
    
    // Run immediately
    recordCurrentSpeed();

    monitorInterval = setInterval(recordCurrentSpeed, intervalSeconds * 1000);
}

export function stopSpeedMonitor() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
}

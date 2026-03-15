import { getInstances, logNetworkSpeed, pruneNetworkSpeedHistory } from '@/lib/db';
import { authenticateQbittorrent, getTransferInfo } from '@/lib/qbittorrent';

let monitorInterval: NodeJS.Timeout | null = null;
let lastAuthTime = 0;
let cachedCookie = '';

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

export async function recordCurrentSpeed() {
    const qbitInstances = getInstances('qbittorrent', true);
    if (qbitInstances.length === 0) return;

    const instance = qbitInstances[0];
    const cookie = await getQbitCookie(instance);
    if (!cookie) return;

    try {
        const { dl_info_speed, up_info_speed } = await getTransferInfo(instance.url, cookie);
        logNetworkSpeed(dl_info_speed, up_info_speed);
        
        // Prune old data once an hour roughly (if called every 30s, this is every 120 calls)
        if (Math.random() < 0.01) {
            pruneNetworkSpeedHistory(7); // Keep 7 days
        }
    } catch (error) {
        console.error('Error recording network speed:', error);
        // Clear cookie if error, might be auth expired
        cachedCookie = '';
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

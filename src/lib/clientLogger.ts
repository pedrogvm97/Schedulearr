export type ClientLogLevel = 'info' | 'warn' | 'error';

export function logClientEvent(
    category: string,
    message: string,
    details?: Record<string, any> | string,
    level: ClientLogLevel = 'info'
): void {
    if (typeof window === 'undefined') return;
    try {
        fetch('/api/system/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, message, details, level }),
            keepalive: true
        }).catch(() => {});
    } catch {
        // Never disrupt UI execution if logging fails
    }
}

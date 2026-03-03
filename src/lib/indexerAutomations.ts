import axios from 'axios';
import { getInstances, getIndexerRules, updateIndexerRuleMetrics } from '@/lib/db';

export async function evaluateIndexerRules() {
    console.log('[INDEXER-SYNC] 🔄 Checking Prowlarr Indexer Quotas...');
    const prowlarrs = getInstances('prowlarr', true);
    if (prowlarrs.length === 0) return;

    const rules = getIndexerRules();
    if (rules.length === 0) return;

    for (const prowlarr of prowlarrs) {
        try {
            // Fetch Prowlarr History targeting Grabbed events
            const historyRes = await axios.get(`${prowlarr.url}/api/v1/history?page=1&pageSize=200&sortKey=date&sortDir=descending&eventType=grabbed`, {
                headers: { 'X-Api-Key': prowlarr.api_key }
            });

            const records = historyRes.data.records || [];
            if (records.length === 0) continue;

            // Map the rules associated with this specific Prowlarr instance
            const instanceRules = rules.filter(r => r.prowlarr_instance_id === prowlarr.id && r.auto_manage);
            if (instanceRules.length === 0) continue;

            const now = new Date();

            for (const rule of instanceRules) {
                // 1. Check Interval Reset
                let resetOccurred = false;
                const lastReset = new Date(rule.last_reset);

                let shouldReset = false;
                if (rule.interval === 'daily' && now.getDate() !== lastReset.getDate()) shouldReset = true;
                if (rule.interval === 'weekly' && (now.getTime() - lastReset.getTime()) > 7 * 24 * 60 * 60 * 1000) shouldReset = true;
                // Simple monthly check
                if (rule.interval === 'monthly' && now.getMonth() !== lastReset.getMonth()) shouldReset = true;

                if (shouldReset) {
                    console.log(`[INDEXER-SYNC] ♻️ Resetting interval for ${rule.name}`);
                    rule.current_size_bytes = 0;
                    rule.current_snatches = 0;
                    rule.last_reset = now.toISOString();
                    resetOccurred = true;

                    // Re-enable indexer in Prowlarr if it was previously disabled
                    try {
                        const indexerRes = await axios.get(`${prowlarr.url}/api/v1/indexer/${rule.indexer_id}`, { headers: { 'X-Api-Key': prowlarr.api_key } });
                        if (!indexerRes.data.enable) {
                            indexerRes.data.enable = true;
                            await axios.put(`${prowlarr.url}/api/v1/indexer/${rule.indexer_id}`, indexerRes.data, { headers: { 'X-Api-Key': prowlarr.api_key } });
                            console.log(`[INDEXER-SYNC] 🟢 Re-enabled ${rule.name} (Quota Reset)`);
                        }
                    } catch (e) {
                        console.error(`[INDEXER-SYNC] Failed to re-enable indexer ${rule.name}`, e);
                    }
                }

                // 2. Tally up Grabs since Last Reset
                // We only count records that occurred AFTER the last_reset date
                const relevantRecords = records.filter((r: any) =>
                    r.indexerId === rule.indexer_id &&
                    new Date(r.date) > new Date(rule.last_reset)
                );

                // For simplicity MVP we will assume the records we fetch are exactly the new ones 
                // In a robust production environment we'd compare specific Grab IDs to avoid double counting,
                // but since we refresh the array by summing what Prowlarr reports since `last_reset`, we can just replace the running total.

                // Let's do a complete recalculation of the "current window" from Prowlarr's history 
                // (assuming our 200 pageSize is deep enough for the interval, otherwise we'd need pagination loop)
                const totalBytesInHistoryWindow = relevantRecords.reduce((acc: number, curr: any) => acc + (curr.size || 0), 0);
                const totalSnatchesInHistoryWindow = relevantRecords.length;

                // Update Rule Metrics Memory Array
                rule.current_size_bytes = totalBytesInHistoryWindow;
                rule.current_snatches = totalSnatchesInHistoryWindow;

                updateIndexerRuleMetrics(rule.id, rule.current_snatches, rule.current_size_bytes, resetOccurred ? rule.last_reset : undefined);

                // 3. Evaluate Rule Thresholds
                let thresholdHit = false;
                if (rule.max_size_bytes && rule.current_size_bytes >= rule.max_size_bytes) thresholdHit = true;
                if (rule.max_snatches && rule.current_snatches >= rule.max_snatches) thresholdHit = true;

                if (thresholdHit) {
                    // Disable indexer in Prowlarr
                    try {
                        const indexerRes = await axios.get(`${prowlarr.url}/api/v1/indexer/${rule.indexer_id}`, { headers: { 'X-Api-Key': prowlarr.api_key } });
                        if (indexerRes.data.enable) {
                            indexerRes.data.enable = false;
                            await axios.put(`${prowlarr.url}/api/v1/indexer/${rule.indexer_id}`, indexerRes.data, { headers: { 'X-Api-Key': prowlarr.api_key } });
                            console.log(`[INDEXER-SYNC] 🔴 Disabled ${rule.name} (Quota Exceeded)`);
                        }
                    } catch (e) {
                        console.error(`[INDEXER-SYNC] Failed to disable indexer ${rule.name}`, e);
                    }
                }
            }
        } catch (e) {
            console.error(`[INDEXER-SYNC] Error processing Prowlarr instance ${prowlarr.name}:`, e);
        }
    }
}

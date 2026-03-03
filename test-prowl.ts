import Database from 'better-sqlite3';

const db = new Database('./data/schedulearr.db');
const instances = db.prepare('SELECT * FROM instances WHERE enabled = 1 AND type = ?').all('prowlarr');

async function test() {
    for (const inst of instances) {
        console.log('Testing', inst.url);
        const fetch = (await import('node-fetch')).default;

        // Check indexer stats capabilities
        try {
            const res = await fetch(`${inst.url}/api/v1/indexer`, { headers: { 'X-Api-Key': inst.api_key } });
            const indexers = await res.json();

            console.log("Found", indexers.length, "indexers");
            if (indexers.length > 0) {
                console.log(JSON.stringify(indexers[0], null, 2));
            }

            // Check History
            console.log("Fetching Prowlarr History...");
            const historyRes = await fetch(`${inst.url}/api/v1/history?page=1&pageSize=5&sortKey=date&sortDir=descending`, { headers: { 'X-Api-Key': inst.api_key } });
            const history = await historyRes.json();

            if (history.records && history.records.length > 0) {
                console.log("Sample History Record:");
                console.log(JSON.stringify(history.records[0], null, 2));
            } else {
                console.log("No history found.");
            }
        } catch (e) {
            console.error(e);
        }
    }
}

test().catch(console.error);

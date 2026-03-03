import Database from 'better-sqlite3';

const db = new Database('./data/arr-scheduler.db');
const instances = db.prepare('SELECT * FROM instances WHERE type = ?').all('prowlarr');

async function test() {
    for (const inst of instances) {
        console.log('Testing', inst.url);
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(`${inst.url}/api/v1/indexer`, { headers: { 'X-Api-Key': inst.api_key } });
        const json = await res.json();
        console.log(json.slice(0, 2).map((i: any) => ({ name: i.name, status: i.status, priority: i.priority })));
    }
}

test().catch(console.error);

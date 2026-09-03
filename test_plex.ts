import { getInstances } from './src/lib/db';
import axios from 'axios';

async function run() {
    const instances = getInstances();
    const p = instances.find(i => (i.type as any) === 'plex');
    if (p) {
        console.log("Found Plex: " + p.url);
        const res = await axios.get(p.url + '/status/sessions/history/all', {
            headers: { 'X-Plex-Token': p.api_key, 'Accept': 'application/json' },
            params: { limit: 1 }
        });
        console.log(JSON.stringify(res.data.MediaContainer.Metadata, null, 2));
    } else {
        console.log("No plex found in", instances);
    }
}
run();

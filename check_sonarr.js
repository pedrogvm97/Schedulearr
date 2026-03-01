const axios = require('axios');

async function check() {
    try {
        const url = 'http://192.168.1.125:9797';
        const apiKey = 'ec7078e261fb4841ba2ceaed1dda1921';

        console.log('Fetching recent commands from Sonarr...');
        const res = await axios.get(`${url}/api/v3/command`, {
            headers: { 'X-Api-Key': apiKey }
        });

        const commands = res.data;
        const searchCommands = commands.filter(c => c.name === 'EpisodeSearch' || c.name === 'SeasonSearch' || c.name === 'SeriesSearch');

        console.log('\n--- Recent Search Commands Triggered ---');
        searchCommands.slice(0, 5).forEach(c => {
            console.log(`Command: ${c.name}`);
            console.log(`Status: ${c.status}`);
            console.log(`Started: ${c.startedOn}`);
            console.log(`Message: ${c.message}`);
            console.log(`Episode IDs: ${c.body?.episodeIds ? c.body.episodeIds.join(', ') : 'None'}`);
            console.log('---------------------------');
        });

        if (searchCommands.length === 0) {
            console.log('No recent search commands found.');
        }
    } catch (e) {
        console.error('Error fetching data:', e.message);
    }
}

check();

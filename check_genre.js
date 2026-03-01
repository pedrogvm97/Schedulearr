const axios = require('axios');

async function check() {
    try {
        const sonarrUrl = 'http://192.168.1.125:9797';
        const sonarrKey = 'ec7078e261fb4841ba2ceaed1dda1921';

        console.log('Fetching 1 item from Sonarr...');
        const res = await axios.get(`${sonarrUrl}/api/v3/series`, {
            headers: { 'X-Api-Key': sonarrKey }
        });

        console.log('Sonarr Genres mapped:', res.data[0].genres);
    } catch (e) {
        console.error('Error fetching data:', e.message);
    }
}

check();

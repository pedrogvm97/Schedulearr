const axios = require('axios');
const API_KEY = '101861274577265a6f2cd2d126588506';
const PERSON_ID = 30614;

async function test() {
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/person/${PERSON_ID}/combined_credits?api_key=${API_KEY}`);
        const cast = res.data.cast || [];
        const sortedByPop = [...cast].sort((a, b) => b.popularity - a.popularity).slice(0, 20);
        console.log('--- SORTED BY POPULARITY ---');
        sortedByPop.forEach(m => console.log(`${m.title || m.name} (Pop: ${m.popularity}, VoteCount: ${m.vote_count}, Order: ${m.order}, Character: ${m.character})`));

        // Let's try to find a better sorting metric
        // Maybe (vote_count * popularity) or just more filtering
        const sortedByFamous = [...cast]
            .filter(m => m.poster_path && m.character && !m.character.toLowerCase().includes('self'))
            .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
            .slice(0, 20);
        console.log('\n--- SORTED BY VOTE COUNT (Filtered) ---');
        sortedByFamous.forEach(m => console.log(`${m.title || m.name} (Pop: ${m.popularity}, VoteCount: ${m.vote_count}, Order: ${m.order}, Character: ${m.character})`));
    } catch (e) {
        console.error(e.message);
    }
}
test();

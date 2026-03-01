import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';

const dbPath = path.join(process.cwd(), 'data', 'arr-scheduler.db');
const db = new Database(dbPath);

console.log('Inserting instances...');

// Insert Radarr
db.prepare('INSERT INTO instances (id, type, name, url, api_key) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    'radarr',
    'Radarr',
    'http://192.168.1.125:7878',
    '64d509ce7704443ea1f0c3a270b2ed42' // Assuming this didn't change from phase 1
);

// Insert Sonarr
db.prepare('INSERT INTO instances (id, type, name, url, api_key) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    'sonarr',
    'Sonarr',
    'http://192.168.1.125:8989',
    '9ca4ce4009bb453f86e8da46e8c7bedb' // Assuming this didn't change
);

// Insert Sonarr Anime with the NEW key
db.prepare('INSERT INTO instances (id, type, name, url, api_key) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    'sonarr',
    'Sonarr Anime',
    'http://192.168.1.125:9797',
    'ec7078e261fb4841ba2ceaed1dda1921'
);

const updatedRows = db.prepare('SELECT * FROM instances').all();
console.log('Updated instances:');
console.log(updatedRows);

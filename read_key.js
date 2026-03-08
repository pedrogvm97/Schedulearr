const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.cwd(), 'data', 'schedulearr.db');
const db = new Database(dbPath);
const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const result = stmt.get('tmdb_api_key');
console.log(result ? result.value : 'Key not found');
db.close();

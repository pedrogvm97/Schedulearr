import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Default to in-memory for basic local dev if not specified, 
// but Docker container uses /app/data which maps to standard unraid appdata
const dbDir = process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'arr-scheduler.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL, -- 'movie' or 'series'
    title TEXT NOT NULL,
    last_searched_at INTEGER NOT NULL,
    status TEXT NOT NULL -- 'pending', 'searching', 'found', 'failed'
  );

  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY, -- Generate UUID
    type TEXT NOT NULL, -- 'radarr', 'sonarr', 'prowlarr'
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    api_key TEXT NOT NULL
  );
`);

export interface Setting {
    key: string;
    value: string;
}

export interface Instance {
    id: string;
    type: 'radarr' | 'sonarr' | 'prowlarr';
    name: string;
    url: string;
    api_key: string;
}

export const getSetting = (key: string): string | null => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key) as Setting | undefined;
    return result ? result.value : null;
};

export const setSetting = (key: string, value: string) => {
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    stmt.run(key, value);
};

export const getInstances = (type?: string): Instance[] => {
    if (type) {
        const stmt = db.prepare('SELECT * FROM instances WHERE type = ?');
        return stmt.all(type) as Instance[];
    }
    const stmt = db.prepare('SELECT * FROM instances');
    return stmt.all() as Instance[];
};

export const addInstance = (instance: Instance) => {
    const stmt = db.prepare('INSERT INTO instances (id, type, name, url, api_key) VALUES (?, ?, ?, ?, ?)');
    stmt.run(instance.id, instance.type, instance.name, instance.url, instance.api_key);
}

export const removeInstance = (id: string) => {
    const stmt = db.prepare('DELETE FROM instances WHERE id = ?');
    stmt.run(id);
}

export default db;

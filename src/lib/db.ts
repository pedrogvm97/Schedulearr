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

  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY, -- Generate UUID
    type TEXT NOT NULL, -- 'radarr', 'sonarr', 'prowlarr'
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS search_history (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    profile TEXT NOT NULL,
    movies_searched TEXT,
    episodes_searched TEXT,
    reason TEXT
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
    enabled: boolean;
}

export const getSetting = (key: string): string | null => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const result = stmt.get(key) as Setting | undefined;
    return result ? result.value : null;
};

export const setSetting = (key: string, value: string): void => {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(key, value);
};

export const getInstances = (type?: string, activeOnly: boolean = false): Instance[] => {
    let raw;
    if (type) {
        if (activeOnly) {
            const stmt = db.prepare('SELECT * FROM instances WHERE type = ? AND enabled = 1');
            raw = stmt.all(type);
        } else {
            const stmt = db.prepare('SELECT * FROM instances WHERE type = ?');
            raw = stmt.all(type);
        }
    } else {
        if (activeOnly) {
            const stmt = db.prepare('SELECT * FROM instances WHERE enabled = 1');
            raw = stmt.all();
        } else {
            const stmt = db.prepare('SELECT * FROM instances');
            raw = stmt.all();
        }
    }

    return raw.map((r: any) => ({
        ...r,
        enabled: r.enabled === 1
    })) as Instance[];
};

export const addInstance = (instance: Instance) => {
    const stmt = db.prepare('INSERT INTO instances (id, type, name, url, api_key, enabled) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(instance.id, instance.type, instance.name, instance.url, instance.api_key, instance.enabled ? 1 : 0);
}

export const removeInstance = (id: string) => {
    const stmt = db.prepare('DELETE FROM instances WHERE id = ?');
    stmt.run(id);
}

export const toggleInstanceEnabled = (id: string, enabled: boolean) => {
    const stmt = db.prepare('UPDATE instances SET enabled = ? WHERE id = ?');
    stmt.run(enabled ? 1 : 0, id);
}

export const logSearchHistory = (profile: string, movies: string[], episodes: string[], reason: string = '') => {
    const stmt = db.prepare('INSERT INTO search_history (id, profile, movies_searched, episodes_searched, reason) VALUES (?, ?, ?, ?, ?)');
    stmt.run(
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        profile,
        JSON.stringify(movies),
        JSON.stringify(episodes),
        reason
    );
};

export const getSearchHistory = (limit: number = 50) => {
    const stmt = db.prepare('SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit).map((row: any) => ({
        ...row,
        movies_searched: JSON.parse(row.movies_searched),
        episodes_searched: JSON.parse(row.episodes_searched)
    }));
};

export default db;

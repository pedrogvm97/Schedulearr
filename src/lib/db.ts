import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Default to in-memory for basic local dev if not specified, 
// but Docker container uses /app/data which maps to standard unraid appdata
const dbDir = process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'schedulearr.db');
console.log('[DEBUG] INITIALIZING DB AT PATH:', dbPath, 'WITH NODE_ENV:', process.env.NODE_ENV);
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
    type TEXT NOT NULL, -- 'radarr', 'sonarr', 'prowlarr', 'qbittorrent'
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

  CREATE TABLE IF NOT EXISTS prowlarr_indexer_rules (
    id TEXT PRIMARY KEY,
    indexer_id INTEGER NOT NULL,
    prowlarr_instance_id TEXT NOT NULL,
    name TEXT NOT NULL,
    max_snatches INTEGER,
    max_size_bytes INTEGER,
    interval TEXT DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly'
    current_snatches INTEGER DEFAULT 0,
    current_size_bytes INTEGER DEFAULT 0,
    last_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
    auto_manage INTEGER DEFAULT 1,
    UNIQUE(indexer_id, prowlarr_instance_id)
  );

  CREATE TABLE IF NOT EXISTS scheduler_tracking (
    media_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'movie', 'episode'
    attempts INTEGER DEFAULT 0,
    last_search DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(media_id, instance_id, type)
  );
`);

// Simple schema migrations for existing databases
try { db.exec("ALTER TABLE instances ADD COLUMN enabled INTEGER DEFAULT 1;"); } catch (e) { /* column exists */ }
try { db.exec("ALTER TABLE instances ADD COLUMN color TEXT;"); } catch (e) { /* column exists */ }
try { db.exec("ALTER TABLE search_history ADD COLUMN timestamp DATETIME DEFAULT CURRENT_TIMESTAMP;"); } catch (e) { /* column exists */ }
try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_tracking (
      media_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      type TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_search DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(media_id, instance_id, type)
    );
  `);
} catch (e) { /* table exists */ }

export interface Setting {
    key: string;
    value: string;
}

export interface Instance {
    id: string;
    type: 'radarr' | 'sonarr' | 'prowlarr' | 'qbittorrent';
    name: string;
    url: string;
    api_key: string;
    enabled: boolean;
    color?: string;
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

// Scheduler Config Helpers
export const getSchedulerConfig = () => {
    const enabled = getSetting('scheduler_enabled') === 'true';
    const interval = parseInt(getSetting('scheduler_interval') || '30'); // minutes
    const batchSize = parseInt(getSetting('scheduler_batch') || '10');
    const batchBehavior = getSetting('batch_behavior') || 'repeat'; // 'repeat' or 'rotate'
    const maxAttempts = parseInt(getSetting('max_attempts') || '3');
    return { enabled, interval, batchSize, batchBehavior, maxAttempts };
};

export const setSchedulerConfig = (config: { enabled: boolean; interval: number; batchSize: number; batchBehavior?: string; maxAttempts?: number }) => {
    setSetting('scheduler_enabled', config.enabled ? 'true' : 'false');
    setSetting('scheduler_interval', config.interval.toString());
    setSetting('scheduler_batch', config.batchSize.toString());
    if (config.batchBehavior) setSetting('batch_behavior', config.batchBehavior);
    if (config.maxAttempts) setSetting('max_attempts', config.maxAttempts.toString());
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
    const stmt = db.prepare('INSERT INTO instances (id, type, name, url, api_key, enabled, color) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run(instance.id, instance.type, instance.name, instance.url, instance.api_key, instance.enabled ? 1 : 0, instance.color || null);
}

export const removeInstance = (id: string) => {
    const stmt = db.prepare('DELETE FROM instances WHERE id = ?');
    stmt.run(id);
}

export const toggleInstanceEnabled = (id: string, enabled: boolean) => {
    const stmt = db.prepare('UPDATE instances SET enabled = ? WHERE id = ?');
    stmt.run(enabled ? 1 : 0, id);
}

export const updateInstance = (instance: Instance) => {
    const stmt = db.prepare(`
        UPDATE instances 
        SET type = ?, name = ?, url = ?, api_key = ?, color = ?
        WHERE id = ?
    `);
    stmt.run(instance.type, instance.name, instance.url, instance.api_key, instance.color || null, instance.id);
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

// --- Scheduler Item Tracking ---
export const getSchedulerTracking = (mediaId: string, instanceId: string, type: string) => {
    const stmt = db.prepare('SELECT * FROM scheduler_tracking WHERE media_id = ? AND instance_id = ? AND type = ?');
    return stmt.get(mediaId, instanceId, type) as { media_id: string, instance_id: string, type: string, attempts: number, last_search: string } | undefined;
};

export const incrementSchedulerAttempt = (mediaId: string, instanceId: string, type: string) => {
    const stmt = db.prepare(`
        INSERT INTO scheduler_tracking (media_id, instance_id, type, attempts, last_search)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(media_id, instance_id, type) DO UPDATE SET
            attempts = attempts + 1,
            last_search = CURRENT_TIMESTAMP
    `);
    stmt.run(mediaId, instanceId, type);
};

export const resetSchedulerAttempts = (mediaId: string, instanceId: string, type: string) => {
    const stmt = db.prepare('UPDATE scheduler_tracking SET attempts = 0 WHERE media_id = ? AND instance_id = ? AND type = ?');
    stmt.run(mediaId, instanceId, type);
};

export const getSearchHistory = (limit: number = 50) => {
    const stmt = db.prepare('SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit).map((row: any) => ({
        ...row,
        movies_searched: JSON.parse(row.movies_searched),
        episodes_searched: JSON.parse(row.episodes_searched)
    }));
};

// --- Prowlarr Indexer Rules ---
export interface ProwlarrIndexerRule {
    id: string;
    indexer_id: number;
    prowlarr_instance_id: string;
    name: string;
    max_snatches: number | null;
    max_size_bytes: number | null;
    interval: 'daily' | 'weekly' | 'monthly';
    current_snatches: number;
    current_size_bytes: number;
    last_reset: string;
    auto_manage: boolean;
}

export const getIndexerRules = (): ProwlarrIndexerRule[] => {
    const stmt = db.prepare('SELECT * FROM prowlarr_indexer_rules');
    return stmt.all().map((r: any) => ({
        ...r,
        auto_manage: r.auto_manage === 1
    }));
};

export const getIndexerRule = (indexerId: number, instanceId: string): ProwlarrIndexerRule | undefined => {
    const stmt = db.prepare('SELECT * FROM prowlarr_indexer_rules WHERE indexer_id = ? AND prowlarr_instance_id = ?');
    const result: any = stmt.get(indexerId, instanceId);
    if (!result) return undefined;
    return {
        ...result,
        auto_manage: result.auto_manage === 1
    };
};

export const saveIndexerRule = (rule: ProwlarrIndexerRule) => {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO prowlarr_indexer_rules 
        (id, indexer_id, prowlarr_instance_id, name, max_snatches, max_size_bytes, interval, current_snatches, current_size_bytes, last_reset, auto_manage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        rule.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        rule.indexer_id,
        rule.prowlarr_instance_id,
        rule.name,
        rule.max_snatches,
        rule.max_size_bytes,
        rule.interval,
        rule.current_snatches,
        rule.current_size_bytes,
        rule.last_reset,
        rule.auto_manage ? 1 : 0
    );
};

export const deleteIndexerRule = (id: string) => {
    const stmt = db.prepare('DELETE FROM prowlarr_indexer_rules WHERE id = ?');
    stmt.run(id);
};

export const updateIndexerRuleMetrics = (id: string, newSnatches: number, newBytes: number, resetDate?: string) => {
    if (resetDate) {
        const stmt = db.prepare('UPDATE prowlarr_indexer_rules SET current_snatches = ?, current_size_bytes = ?, last_reset = ? WHERE id = ?');
        stmt.run(newSnatches, newBytes, resetDate, id);
    } else {
        const stmt = db.prepare('UPDATE prowlarr_indexer_rules SET current_snatches = ?, current_size_bytes = ? WHERE id = ?');
        stmt.run(newSnatches, newBytes, id);
    }
};

export default db;

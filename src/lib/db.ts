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

let _db: any;
function getDb() {
    if (!_db) {
        console.log('[DEBUG] INITIALIZING DB AT PATH:', dbPath, 'WITH NODE_ENV:', process.env.NODE_ENV);
        _db = new Database(dbPath);
        _db.pragma('journal_mode = WAL');
        initializeSchema(_db);
    }
    return _db;
}

const db = {
    prepare: (sql: string) => getDb().prepare(sql),
    exec: (sql: string) => getDb().exec(sql),
    pragma: (sql: string) => getDb().pragma(sql),
};

function initializeSchema(d: any) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
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
        reason TEXT,
        category TEXT DEFAULT 'search'
      );
    
      CREATE TABLE IF NOT EXISTS prowlarr_indexer_rules (
        id TEXT PRIMARY KEY,
        indexer_id INTEGER NOT NULL,
        prowlarr_instance_id TEXT NOT NULL,
        name TEXT NOT NULL,
        max_snatches INTEGER,
        max_size_bytes INTEGER,
        interval TEXT DEFAULT 'monthly',
        current_snatches INTEGER DEFAULT 0,
        current_size_bytes INTEGER DEFAULT 0,
        last_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
        auto_manage INTEGER DEFAULT 1,
        UNIQUE(indexer_id, prowlarr_instance_id)
      );
    
      CREATE TABLE IF NOT EXISTS scheduler_tracking (
        media_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        type TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_search DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(media_id, instance_id, type)
      );
    
      CREATE TABLE IF NOT EXISTS torrent_activity (
        hash TEXT PRIMARY KEY,
        last_progress REAL NOT NULL,
        last_change DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS network_speed (
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        download_speed REAL DEFAULT 0,
        upload_speed REAL DEFAULT 0,
        qbit_dl REAL DEFAULT 0,
        qbit_up REAL DEFAULT 0,
        plex_dl REAL DEFAULT 0,
        plex_up REAL DEFAULT 0,
        total_dl REAL DEFAULT 0,
        total_up REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS media_cache (
        instance_id TEXT NOT NULL,
        media_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(instance_id, media_type)
      );

      CREATE TABLE IF NOT EXISTS theater_libraries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        folders TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrations
    try { d.exec("ALTER TABLE instances ADD COLUMN enabled INTEGER DEFAULT 1;"); } catch (e) { }
    try { d.exec("ALTER TABLE instances ADD COLUMN color TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE search_history ADD COLUMN timestamp DATETIME DEFAULT CURRENT_TIMESTAMP;"); } catch (e) { }
    try { d.exec("ALTER TABLE network_speed ADD COLUMN qbit_dl REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE network_speed ADD COLUMN qbit_up REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE network_speed ADD COLUMN plex_dl REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE network_speed ADD COLUMN plex_up REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE network_speed ADD COLUMN total_dl REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE network_speed ADD COLUMN total_up REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE search_history ADD COLUMN category TEXT DEFAULT 'search';"); } catch (e) { }
}

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
    const networkInterval = parseInt(getSetting('network_speed_interval_sec') || '30');
    return { enabled, interval, batchSize, batchBehavior, maxAttempts, networkInterval };
};

export const setSchedulerConfig = (config: { enabled: boolean; interval: number; batchSize: number; batchBehavior?: string; maxAttempts?: number }) => {
    setSetting('scheduler_enabled', config.enabled ? 'true' : 'false');
    setSetting('scheduler_interval', config.interval.toString());
    setSetting('scheduler_batch', config.batchSize.toString());
    if (config.batchBehavior) setSetting('batch_behavior', config.batchBehavior);
    if (config.maxAttempts) setSetting('max_attempts', config.maxAttempts.toString());
    if ((config as any).networkInterval) setSetting('network_speed_interval_sec', (config as any).networkInterval.toString());
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

    return raw.map((r: Instance) => ({
        ...r,
        enabled: Number(r.enabled) === 1
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

export const getInstanceById = (id: string): Instance | undefined => {
    const stmt = db.prepare('SELECT * FROM instances WHERE id = ?');
    const raw = stmt.get(id) as any;
    if (!raw) return undefined;
    return { ...raw, enabled: raw.enabled === 1 } as Instance;
};

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

export type LogCategory = 'search' | 'qbit_clean' | 'media_clean' | 'disk_guard' | 'scheduler' | 'system' | 'error';

export const logSearchHistory = (profile: string, movies: string[], episodes: string[], reason: string = '', category: LogCategory = 'search') => {
    const stmt = db.prepare('INSERT INTO search_history (id, profile, movies_searched, episodes_searched, reason, category) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        profile,
        JSON.stringify(movies),
        JSON.stringify(episodes),
        reason,
        category
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

export const getSearchHistory = (limit: number = 100) => {
    const stmt = db.prepare('SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit).map((row: any) => ({
        ...row,
        movies_searched: row.movies_searched ? JSON.parse(row.movies_searched) : [],
        episodes_searched: row.episodes_searched ? JSON.parse(row.episodes_searched) : [],
        category: row.category || 'search'
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
        auto_manage: Number(r.auto_manage) === 1
    }));
};

export const getIndexerRule = (indexerId: number, instanceId: string): ProwlarrIndexerRule | undefined => {
    const stmt = db.prepare('SELECT * FROM prowlarr_indexer_rules WHERE indexer_id = ? AND prowlarr_instance_id = ?');
    const result: any = stmt.get(indexerId, instanceId);
    if (!result) return undefined;
    return {
        ...result,
        auto_manage: Number(result.auto_manage) === 1
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

// --- Torrent Activity Tracking ---
export const getTorrentActivity = (hash: string) => {
    const stmt = db.prepare('SELECT * FROM torrent_activity WHERE hash = ?');
    return stmt.get(hash) as { hash: string, last_progress: number, last_change: string } | undefined;
};

export const updateTorrentActivity = (hash: string, progress: number, resetChange: boolean = false) => {
    if (resetChange) {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO torrent_activity (hash, last_progress, last_change)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(hash, progress);
    } else {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO torrent_activity (hash, last_progress, last_change)
            VALUES (?, ?, (SELECT last_change FROM torrent_activity WHERE hash = ?))
        `);
        stmt.run(hash, progress, hash);
    }
};

export const deleteTorrentActivity = (hash: string) => {
    const stmt = db.prepare('DELETE FROM torrent_activity WHERE hash = ?');
    stmt.run(hash);
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

// --- Network Speed History ---
export const logNetworkSpeed = (
    downloadSpeed: number, uploadSpeed: number,
    qbitDl: number = 0, qbitUp: number = 0,
    plexDl: number = 0, plexUp: number = 0,
    totalDl: number = 0, totalUp: number = 0
) => {
    const stmt = db.prepare(`
        INSERT INTO network_speed (
            download_speed, upload_speed, 
            qbit_dl, qbit_up, 
            plex_dl, plex_up, 
            total_dl, total_up
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(downloadSpeed, uploadSpeed, qbitDl, qbitUp, plexDl, plexUp, totalDl, totalUp);
};

export const getNetworkSpeedHistory = (limit: number = 60) => {
    const stmt = db.prepare('SELECT * FROM network_speed ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit);
};

export const pruneNetworkSpeedHistory = (daysToKeep: number = 7) => {
    const stmt = db.prepare("DELETE FROM network_speed WHERE timestamp < datetime('now', '-' || ? || ' days')");
    stmt.run(daysToKeep);
};

export const getDatabaseStats = () => {
    const stats = {
        sizeBytes: 0,
        tables: [] as { name: string, count: number }[]
    };

    try {
        if (fs.existsSync(dbPath)) {
            stats.sizeBytes = fs.statSync(dbPath).size;
        }

        const tables = ['network_speed', 'search_history', 'scheduler_tracking', 'torrent_activity'];
        for (const table of tables) {
            const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get() as any;
            stats.tables.push({ name: table, count: row.count });
        }
    } catch (e) {
        console.error('Failed to get DB stats', e);
    }

    return stats;
};

export const executeHousekeeping = (daysToKeep?: number, sizeLimitMB?: number) => {
    const results = { deletedRows: 0, initialSize: 0, finalSize: 0 };
    
    if (fs.existsSync(dbPath)) {
        results.initialSize = fs.statSync(dbPath).size;
    }

    // 1. Age-based pruning
    if (daysToKeep && daysToKeep > 0) {
        const speedPrune = db.prepare("DELETE FROM network_speed WHERE timestamp < datetime('now', '-' || ? || ' days')");
        const historyPrune = db.prepare("DELETE FROM search_history WHERE timestamp < datetime('now', '-' || ? || ' days')");
        
        results.deletedRows += speedPrune.run(daysToKeep).changes;
        results.deletedRows += historyPrune.run(daysToKeep).changes;
    }

    // 2. Size-based pruning (if still over limit)
    if (sizeLimitMB && sizeLimitMB > 0) {
        let currentSize = fs.statSync(dbPath).size;
        const limitBytes = sizeLimitMB * 1024 * 1024;
        
        if (currentSize > limitBytes) {
            // Delete oldest 20% of network speed data until under limit or 5 iterations
            for (let i = 0; i < 5; i++) {
                const oldestRows = db.prepare("SELECT timestamp FROM network_speed ORDER BY timestamp ASC LIMIT (SELECT count(*) / 5 FROM network_speed)").all() as any[];
                if (oldestRows.length > 0) {
                    const lastTimestamp = oldestRows[oldestRows.length - 1].timestamp;
                    results.deletedRows += db.prepare("DELETE FROM network_speed WHERE timestamp <= ?").run(lastTimestamp).changes;
                }
                
                db.exec('VACUUM');
                currentSize = fs.statSync(dbPath).size;
                if (currentSize <= limitBytes) break;
            }
        }
    } else {
        db.exec('VACUUM');
    }

    if (fs.existsSync(dbPath)) {
        results.finalSize = fs.statSync(dbPath).size;
    }

    return results;
};

export const getMediaCache = (instanceId: string, mediaType: string): any[] | null => {
    try {
        const row = db.prepare('SELECT payload, updated_at FROM media_cache WHERE instance_id = ? AND media_type = ?').get(instanceId, mediaType) as any;
        if (row && row.payload) {
            return JSON.parse(row.payload);
        }
        return null;
    } catch (e) {
        console.error('Error fetching media cache:', e);
        return null;
    }
};

export const setMediaCache = (instanceId: string, mediaType: string, payload: any[]) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO media_cache (instance_id, media_type, payload, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(instance_id, media_type) DO UPDATE SET
                payload = excluded.payload,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(instanceId, mediaType, JSON.stringify(payload));
    } catch (e) {
        console.error('Error setting media cache:', e);
    }
};

export const getCombinedMediaCache = (mediaType: string): any[] | null => {
    try {
        const rows = db.prepare('SELECT payload FROM media_cache WHERE media_type = ?').all(mediaType) as any[];
        if (!rows || rows.length === 0) return null;
        let combined: any[] = [];
        for (const row of rows) {
            if (row.payload) {
                const items = JSON.parse(row.payload);
                if (Array.isArray(items)) {
                    combined = combined.concat(items);
                }
            }
        }
        return combined;
    } catch (e) {
        console.error('Error getting combined media cache:', e);
        return null;
    }
};

export const getTheaterLibraries = (): any[] => {
    try {
        const rows = db.prepare('SELECT * FROM theater_libraries ORDER BY created_at ASC').all() as any[];
        return (rows || []).map(r => ({
            ...r,
            folders: JSON.parse(r.folders || '[]')
        }));
    } catch (e) {
        console.error('Error fetching theater libraries:', e);
        return [];
    }
};

export const createTheaterLibrary = (id: string, name: string, type: string, folders: string[]) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO theater_libraries (id, name, type, folders)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(id, name, type, JSON.stringify(folders));
        return true;
    } catch (e) {
        console.error('Error creating theater library:', e);
        return false;
    }
};

export const deleteTheaterLibrary = (id: string) => {
    try {
        const stmt = db.prepare('DELETE FROM theater_libraries WHERE id = ?');
        stmt.run(id);
        return true;
    } catch (e) {
        console.error('Error deleting theater library:', e);
        return false;
    }
};

export default db;

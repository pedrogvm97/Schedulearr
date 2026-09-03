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

function handleCorruptDatabase() {
    console.warn('[DB RECOVERY] Attempting recovery of corrupted/malformed database...');
    try {
        if (_db) {
            try { _db.close(); } catch {}
            _db = null;
        }
        const timestamp = Date.now();
        const corruptBackup = path.join(dbDir, `schedulearr.db.corrupt.${timestamp}`);
        if (fs.existsSync(dbPath)) {
            fs.renameSync(dbPath, corruptBackup);
            console.log(`[DB RECOVERY] Corrupted database backed up to: ${corruptBackup}`);
        }
        // Remove stale WAL and SHM files
        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;
        if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch {} }
        if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch {} }
    } catch (e: any) {
        console.error('[DB RECOVERY ERROR] Failed during backup of malformed db:', e.message);
    }
}

function initDbConnection(isRetry: boolean = false): any {
    try {
        console.log('[DEBUG] INITIALIZING DB AT PATH:', dbPath, 'WITH NODE_ENV:', process.env.NODE_ENV);
        const d = new Database(dbPath, { timeout: 10000 });
        d.pragma('journal_mode = WAL');
        d.pragma('busy_timeout = 10000');
        d.pragma('synchronous = NORMAL');
        d.pragma('wal_autocheckpoint = 1000');
        
        // Integrity check to catch malformed disk images before queries run
        const integrity = d.pragma('integrity_check');
        const isOk = Array.isArray(integrity) && integrity.length > 0 && integrity[0].integrity_check === 'ok';
        if (!isOk) {
            throw new Error(`Integrity check failed: ${JSON.stringify(integrity)}`);
        }

        initializeSchema(d);
        return d;
    } catch (err: any) {
        console.error('[DB ERROR] Database initialization failed or malformed:', err.message);
        if (!isRetry) {
            handleCorruptDatabase();
            return initDbConnection(true);
        }
        throw err;
    }
}

function getDb() {
    if (!_db) {
        _db = initDbConnection();
    }
    return _db;
}

const db = {
    prepare: (sql: string) => {
        try {
            return getDb().prepare(sql);
        } catch (err: any) {
            if (err.message && (err.message.includes('malformed') || err.message.includes('corrupt') || err.message.includes('SQLITE_CORRUPT'))) {
                console.error('[DB ERROR] Malformed disk image detected during prepare. Recovering...', err.message);
                handleCorruptDatabase();
                _db = null;
                return getDb().prepare(sql);
            }
            throw err;
        }
    },
    exec: (sql: string) => {
        try {
            return getDb().exec(sql);
        } catch (err: any) {
            if (err.message && (err.message.includes('malformed') || err.message.includes('corrupt') || err.message.includes('SQLITE_CORRUPT'))) {
                console.error('[DB ERROR] Malformed disk image detected during exec. Recovering...', err.message);
                handleCorruptDatabase();
                _db = null;
                return getDb().exec(sql);
            }
            throw err;
        }
    },
    pragma: (sql: string) => {
        try {
            return getDb().pragma(sql);
        } catch (err: any) {
            if (err.message && (err.message.includes('malformed') || err.message.includes('corrupt') || err.message.includes('SQLITE_CORRUPT'))) {
                console.error('[DB ERROR] Malformed disk image detected during pragma. Recovering...', err.message);
                handleCorruptDatabase();
                _db = null;
                return getDb().pragma(sql);
            }
            throw err;
        }
    },
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

      CREATE TABLE IF NOT EXISTS theater_items_cache (
        library_id TEXT PRIMARY KEY,
        items_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS iptv_shortlists (
        id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        name TEXT NOT NULL,
        channel_ids TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS iptv_channels (
        id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        name TEXT NOT NULL,
        clean_name TEXT NOT NULL,
        logo TEXT,
        group_title TEXT NOT NULL,
        tvg_id TEXT,
        tvg_name TEXT,
        streams_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS iptv_epg (
        id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        channel_tvg_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dvr_storage_folders (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dvr_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        channel_scope TEXT DEFAULT 'all',
        check_missing_from_library INTEGER DEFAULT 0,
        destination_folder TEXT NOT NULL,
        padding_minutes INTEGER DEFAULT 15,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dvr_recordings (
        id TEXT PRIMARY KEY,
        rule_id TEXT,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        channel_logo TEXT,
        stream_url TEXT,
        program_title TEXT NOT NULL,
        program_description TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        destination_path TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER DEFAULT 0,
        status TEXT DEFAULT 'scheduled',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS music_playlists (
        id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        name TEXT NOT NULL,
        items_json TEXT NOT NULL,
        cover_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_iptv_epg_lookup ON iptv_epg (library_id, channel_tvg_id, end_time);
      CREATE INDEX IF NOT EXISTS idx_iptv_epg_start ON iptv_epg (library_id, start_time);
      CREATE INDEX IF NOT EXISTS idx_iptv_channels_lib ON iptv_channels (library_id);
      CREATE INDEX IF NOT EXISTS idx_dvr_recordings_status ON dvr_recordings (status, start_time);

      CREATE TABLE IF NOT EXISTS music_lyrics (
        track_key TEXT PRIMARY KEY,
        artist TEXT NOT NULL,
        title TEXT NOT NULL,
        synced_lyrics TEXT,
        plain_lyrics TEXT,
        source TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS music_chords (
        track_key TEXT PRIMARY KEY,
        artist TEXT NOT NULL,
        title TEXT NOT NULL,
        chords_json TEXT NOT NULL,
        cifra_text TEXT,
        key_signature TEXT,
        tempo INTEGER,
        source TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS playback_sessions (
        session_id TEXT PRIMARY KEY,
        user_name TEXT DEFAULT 'Pedro',
        media_id TEXT,
        title TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        media_type TEXT DEFAULT 'music',
        poster TEXT,
        device_name TEXT DEFAULT 'Web Music Player',
        platform TEXT DEFAULT 'Web',
        state TEXT DEFAULT 'playing',
        progress_percent INTEGER DEFAULT 0,
        view_offset_ms INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        bandwidth_mbps TEXT DEFAULT '0.3',
        transcode_decision TEXT DEFAULT 'Direct Play',
        last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS playback_history (
        id TEXT PRIMARY KEY,
        user_name TEXT DEFAULT 'Pedro',
        media_id TEXT,
        title TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        media_type TEXT DEFAULT 'music',
        poster TEXT,
        device_name TEXT DEFAULT 'Web Music Player',
        platform TEXT DEFAULT 'Web',
        duration_ms INTEGER DEFAULT 0,
        view_offset_ms INTEGER DEFAULT 0,
        viewed_at INTEGER NOT NULL
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
    try { d.exec("ALTER TABLE theater_libraries ADD COLUMN plex_section_id TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE theater_libraries ADD COLUMN instance_id TEXT;"); } catch (e) { }
}

export interface Setting {
    key: string;
    value: string;
}

export interface Instance {
    id: string;
    type: 'radarr' | 'sonarr' | 'lidarr' | 'prowlarr' | 'qbittorrent' | 'plex';
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

export const createTheaterLibrary = (id: string, name: string, type: string, folders: string[], plexSectionId?: string, instanceId?: string) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO theater_libraries (id, name, type, folders, plex_section_id, instance_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, name, type, JSON.stringify(folders), plexSectionId || null, instanceId || null);
        return true;
    } catch (e) {
        console.error('Error creating theater library:', e);
        return false;
    }
};

export const deleteTheaterLibrary = (id: string) => {
    try {
        db.prepare('DELETE FROM iptv_channels WHERE library_id = ?').run(id);
        db.prepare('DELETE FROM iptv_epg WHERE library_id = ?').run(id);
        db.prepare('DELETE FROM iptv_shortlists WHERE library_id = ?').run(id);
        db.prepare('DELETE FROM theater_items_cache WHERE library_id = ?').run(id);
        const stmt = db.prepare('DELETE FROM theater_libraries WHERE id = ?');
        stmt.run(id);
        return true;
    } catch (e) {
        console.error('Error deleting theater library:', e);
        return false;
    }
};

export const updateTheaterLibrary = (id: string, folders: string[], name?: string): boolean => {
    try {
        if (name) {
            const stmt = db.prepare('UPDATE theater_libraries SET folders = ?, name = ? WHERE id = ?');
            stmt.run(JSON.stringify(folders), name.trim(), id);
        } else {
            const stmt = db.prepare('UPDATE theater_libraries SET folders = ? WHERE id = ?');
            stmt.run(JSON.stringify(folders), id);
        }
        return true;
    } catch (e) {
        console.error('Error updating theater library:', e);
        return false;
    }
};

export const getIptvShortlists = (libraryId: string): any[] => {
    try {
        const rows = db.prepare('SELECT * FROM iptv_shortlists WHERE library_id = ? ORDER BY created_at ASC').all(libraryId) as any[];
        return (rows || []).map(r => ({
            ...r,
            channelIds: JSON.parse(r.channel_ids || '[]')
        }));
    } catch (e) {
        console.error('Error fetching IPTV shortlists:', e);
        return [];
    }
};

export const saveIptvShortlist = (id: string, libraryId: string, name: string, channelIds: string[]) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO iptv_shortlists (id, library_id, name, channel_ids)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, channel_ids = excluded.channel_ids
        `);
        stmt.run(id, libraryId, name.trim(), JSON.stringify(channelIds));
        return true;
    } catch (e) {
        console.error('Error saving IPTV shortlist:', e);
        return false;
    }
};

export const deleteIptvShortlist = (id: string) => {
    try {
        const stmt = db.prepare('DELETE FROM iptv_shortlists WHERE id = ?');
        stmt.run(id);
        return true;
    } catch (e) {
        console.error('Error deleting IPTV shortlist:', e);
        return false;
    }
};

// ── Theater Items Cache (Local SQLite Storage) ──
export const getCachedTheaterItems = (libraryId: string): { items: any[]; updatedAt: string } | null => {
    try {
        const row = db.prepare('SELECT items_json, updated_at FROM theater_items_cache WHERE library_id = ?').get(libraryId) as any;
        if (!row || !row.items_json) return null;
        return {
            items: JSON.parse(row.items_json),
            updatedAt: row.updated_at
        };
    } catch (e) {
        console.error('Error fetching cached theater items:', e);
        return null;
    }
};

export const saveCachedTheaterItems = (libraryId: string, items: any[]): boolean => {
    try {
        const json = JSON.stringify(items);
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO theater_items_cache (library_id, items_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(library_id) DO UPDATE SET items_json = excluded.items_json, updated_at = excluded.updated_at
        `).run(libraryId, json, now);
        return true;
    } catch (e) {
        console.error('Error saving cached theater items:', e);
        return false;
    }
};

export const clearCachedTheaterItems = (libraryId?: string): boolean => {
    try {
        if (libraryId) {
            db.prepare('DELETE FROM theater_items_cache WHERE library_id = ?').run(libraryId);
        } else {
            db.prepare('DELETE FROM theater_items_cache').run();
        }
        return true;
    } catch (e) {
        console.error('Error clearing cached theater items:', e);
        return false;
    }
};

// ── IPTV Channels & Merged Redundancy Management ──
export interface StoredIptvChannel {
    id: string;
    libraryId: string;
    name: string;
    cleanName: string;
    logo?: string;
    group: string;
    tvgId?: string;
    tvgName?: string;
    streams: Array<{ url: string; quality: string; label: string }>;
}

export const saveIptvChannels = (libraryId: string, channels: StoredIptvChannel[]): boolean => {
    try {
        const deleteStmt = db.prepare('DELETE FROM iptv_channels WHERE library_id = ?');
        deleteStmt.run(libraryId);

        const insertStmt = db.prepare(`
            INSERT INTO iptv_channels (id, library_id, name, clean_name, logo, group_title, tvg_id, tvg_name, streams_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((chanList: StoredIptvChannel[]) => {
            for (const c of chanList) {
                insertStmt.run(
                    c.id,
                    libraryId,
                    c.name,
                    c.cleanName || c.name,
                    c.logo || null,
                    c.group || 'General',
                    c.tvgId || null,
                    c.tvgName || null,
                    JSON.stringify(c.streams || [])
                );
            }
        });

        insertMany(channels);
        return true;
    } catch (e) {
        console.error('Error saving IPTV channels:', e);
        return false;
    }
};

export const getIptvChannels = (libraryId: string): StoredIptvChannel[] => {
    try {
        const rows = db.prepare('SELECT * FROM iptv_channels WHERE library_id = ? ORDER BY rowid ASC').all(libraryId) as any[];
        return (rows || []).map(r => ({
            id: r.id,
            libraryId: r.library_id,
            name: r.name,
            cleanName: r.clean_name,
            logo: r.logo || undefined,
            group: r.group_title,
            tvgId: r.tvg_id || undefined,
            tvgName: r.tvg_name || undefined,
            streams: JSON.parse(r.streams_json || '[]')
        }));
    } catch (e) {
        console.error('Error fetching IPTV channels:', e);
        return [];
    }
};

export const mergeIptvChannels = (
    libraryId: string,
    primaryChannelId: string,
    channelsToMergeIds: string[]
): boolean => {
    try {
        const allChannels = getIptvChannels(libraryId);
        const primary = allChannels.find(c => c.id === primaryChannelId);
        if (!primary) return false;

        const otherChannels = allChannels.filter(c => channelsToMergeIds.includes(c.id) && c.id !== primaryChannelId);
        const combinedStreams = Array.isArray(primary.streams) ? [...primary.streams] : [];

        for (const other of otherChannels) {
            const otherStreams = Array.isArray(other.streams) ? other.streams : [];
            for (const st of otherStreams) {
                if (st && st.url && !combinedStreams.some(s => s.url === st.url)) {
                    combinedStreams.push(st);
                }
            }
        }

        // Sort streams by quality: 8K > 4K > FHD > HD > SD
        const qualityRank = (q: string) => {
            const l = (q || '').toLowerCase();
            if (l.includes('8k')) return 5;
            if (l.includes('4k') || l.includes('uhd') || l.includes('2160')) return 4;
            if (l.includes('fhd') || l.includes('1080')) return 3;
            if (l.includes('hd') || l.includes('720')) return 2;
            return 1;
        };

        combinedStreams.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

        // Update primary channel with merged streams
        db.prepare('UPDATE iptv_channels SET streams_json = ? WHERE id = ?').run(
            JSON.stringify(combinedStreams),
            primaryChannelId
        );

        // Delete the merged channels from the channel list
        for (const other of otherChannels) {
            try {
                db.prepare('DELETE FROM iptv_channels WHERE id = ?').run(other.id);
            } catch {}
        }

        return true;
    } catch (e) {
        console.error('Error merging IPTV channels:', e);
        return false;
    }
};

export const batchMergeIptvChannels = (
    libraryId: string,
    merges: Array<{ primaryChannelId: string; channelsToMergeIds: string[]; newName?: string }>
): { success: boolean; mergedGroupsCount: number; mergedChannelsCount: number } => {
    try {
        if (!libraryId || !Array.isArray(merges) || merges.length === 0) {
            return { success: true, mergedGroupsCount: 0, mergedChannelsCount: 0 };
        }

        const allChannels = getIptvChannels(libraryId);
        const channelMap = new Map(allChannels.map(c => [c.id, c]));
        const deletedIds = new Set<string>();

        const qualityRank = (q: string) => {
            const l = (q || '').toLowerCase();
            if (l.includes('8k')) return 5;
            if (l.includes('4k') || l.includes('uhd') || l.includes('2160')) return 4;
            if (l.includes('fhd') || l.includes('1080')) return 3;
            if (l.includes('hd') || l.includes('720')) return 2;
            return 1;
        };

        const updatePrimary = db.prepare('UPDATE iptv_channels SET streams_json = ?, name = COALESCE(?, name), clean_name = COALESCE(?, clean_name) WHERE id = ?');
        const deleteChan = db.prepare('DELETE FROM iptv_channels WHERE id = ?');

        let mergedGroups = 0;
        let mergedChannels = 0;

        const transaction = db.transaction(() => {
            for (const item of merges) {
                if (!item || !item.primaryChannelId) continue;
                const primary = channelMap.get(item.primaryChannelId);
                if (!primary || deletedIds.has(primary.id)) continue;

                const combinedStreams = Array.isArray(primary.streams) ? [...primary.streams] : [];
                const toMerge = (item.channelsToMergeIds || []).filter(id => id && id !== primary.id && !deletedIds.has(id));
                if (toMerge.length === 0) continue;

                for (const otherId of toMerge) {
                    const other = channelMap.get(otherId);
                    if (!other) continue;
                    const otherStreams = Array.isArray(other.streams) ? other.streams : [];
                    for (const st of otherStreams) {
                        if (st && st.url && !combinedStreams.some(s => s.url === st.url)) {
                            combinedStreams.push(st);
                        }
                    }
                    try {
                        deleteChan.run(otherId);
                    } catch {}
                    deletedIds.add(otherId);
                    mergedChannels++;
                }

                combinedStreams.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

                updatePrimary.run(
                    JSON.stringify(combinedStreams),
                    item.newName?.trim() || null,
                    item.newName?.trim() || null,
                    primary.id
                );
                mergedGroups++;
            }
        });

        transaction();
        return { success: true, mergedGroupsCount: mergedGroups, mergedChannelsCount: mergedChannels };
    } catch (e) {
        console.error('Error in batchMergeIptvChannels:', e);
        return { success: false, mergedGroupsCount: 0, mergedChannelsCount: 0 };
    }
};

// ── IPTV EPG Guide Data Persistence ──
export const saveIptvEpg = (libraryId: string, epgList: Array<{
    channelTvgId: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
}>): boolean => {
    try {
        const stmt = db.prepare(`
            INSERT INTO iptv_epg (id, library_id, channel_tvg_id, title, description, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((items: any[]) => {
            for (const item of items) {
                const id = `epg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                stmt.run(
                    id,
                    libraryId,
                    item.channelTvgId,
                    item.title,
                    item.description || '',
                    item.startTime,
                    item.endTime
                );
            }
        });

        insertMany(epgList);
        return true;
    } catch (e) {
        console.error('Error saving IPTV EPG:', e);
        return false;
    }
};

export const getIptvEpgForChannel = (
    libraryId: string,
    tvgId: string,
    startTime?: string,
    endTime?: string,
    limit: number = 200
): any[] => {
    try {
        let query = `
            SELECT * FROM iptv_epg 
            WHERE library_id = ? AND (channel_tvg_id = ? OR LOWER(channel_tvg_id) = LOWER(?))
        `;
        const params: any[] = [libraryId, tvgId, tvgId];

        if (startTime) {
            query += ' AND end_time >= ?';
            params.push(startTime);
        }
        if (endTime) {
            query += ' AND start_time <= ?';
            params.push(endTime);
        }

        query += ' ORDER BY start_time ASC LIMIT ?';
        params.push(limit);

        const rows = db.prepare(query).all(...params) as any[];
        return rows || [];
    } catch (e) {
        console.error('Error fetching IPTV EPG for channel:', e);
        return [];
    }
};

export const getIptvEpg = getIptvEpgForChannel;

export const getMusicPlaylists = (libraryId?: string) => {
    try {
        let query = 'SELECT * FROM music_playlists ORDER BY created_at DESC';
        let params: any[] = [];
        if (libraryId && libraryId !== 'all') {
            query = "SELECT * FROM music_playlists WHERE library_id = ? OR library_id = 'global' OR library_id IS NULL ORDER BY created_at DESC";
            params = [libraryId];
        }
        const rows = db.prepare(query).all(...params) as any[];
        return (rows || []).map(r => ({
            ...r,
            items: r.items_json ? JSON.parse(r.items_json) : []
        }));
    } catch (e) {
        console.error('Error fetching music playlists:', e);
        return [];
    }
};

export const saveMusicPlaylist = (id: string, libraryId: string, name: string, items: any[], coverUrl?: string) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO music_playlists (id, library_id, name, items_json, cover_url)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, items_json = excluded.items_json, cover_url = excluded.cover_url
        `);
        stmt.run(id, libraryId, name.trim(), JSON.stringify(items), coverUrl || null);
        return true;
    } catch (e) {
        console.error('Error saving music playlist:', e);
        return false;
    }
};

export const deleteMusicPlaylist = (id: string) => {
    try {
        const stmt = db.prepare('DELETE FROM music_playlists WHERE id = ?');
        stmt.run(id);
        return true;
    } catch (e) {
        console.error('Error deleting music playlist:', e);
        return false;
    }
};

export const getSavedLyrics = (trackKey: string) => {
    try {
        const row = db.prepare('SELECT * FROM music_lyrics WHERE track_key = ?').get(trackKey) as any;
        return row || null;
    } catch (e) {
        console.error('Error getting saved lyrics:', e);
        return null;
    }
};

export const saveLyrics = (trackKey: string, artist: string, title: string, syncedLyrics: string, plainLyrics: string, source: string = 'manual') => {
    try {
        const stmt = db.prepare(`
            INSERT INTO music_lyrics (track_key, artist, title, synced_lyrics, plain_lyrics, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(track_key) DO UPDATE SET
                artist = excluded.artist,
                title = excluded.title,
                synced_lyrics = excluded.synced_lyrics,
                plain_lyrics = excluded.plain_lyrics,
                source = excluded.source,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(trackKey, artist, title, syncedLyrics, plainLyrics, source);
        return true;
    } catch (e) {
        console.error('Error saving lyrics:', e);
        return false;
    }
};

export const getSavedChords = (trackKey: string) => {
    try {
        const row = db.prepare('SELECT * FROM music_chords WHERE track_key = ?').get(trackKey) as any;
        return row || null;
    } catch (e) {
        console.error('Error getting saved chords:', e);
        return null;
    }
};

export const saveChords = (trackKey: string, artist: string, title: string, chordsJson: string, cifraText: string = '', keySignature: string = 'C', tempo: number = 120, source: string = 'manual') => {
    try {
        const stmt = db.prepare(`
            INSERT INTO music_chords (track_key, artist, title, chords_json, cifra_text, key_signature, tempo, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(track_key) DO UPDATE SET
                artist = excluded.artist,
                title = excluded.title,
                chords_json = excluded.chords_json,
                cifra_text = excluded.cifra_text,
                key_signature = excluded.key_signature,
                tempo = excluded.tempo,
                source = excluded.source,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(trackKey, artist, title, chordsJson, cifraText, keySignature, tempo, source);
        return true;
    } catch (e) {
        console.error('Error saving chords:', e);
        return false;
    }
};

export const recordPlaybackHeartbeat = (data: {
    sessionId: string;
    userName?: string;
    mediaId?: string;
    title: string;
    artist?: string;
    album?: string;
    mediaType?: 'music' | 'movie' | 'series' | 'livetv' | 'track';
    poster?: string;
    deviceName?: string;
    platform?: string;
    state?: 'playing' | 'paused';
    progressPercent?: number;
    viewOffsetMs?: number;
    durationMs?: number;
    bandwidthMbps?: string;
    transcodeDecision?: string;
}) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO playback_sessions (
                session_id, user_name, media_id, title, artist, album, media_type,
                poster, device_name, platform, state, progress_percent, view_offset_ms,
                duration_ms, bandwidth_mbps, transcode_decision, last_heartbeat
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(session_id) DO UPDATE SET
                user_name = excluded.user_name,
                media_id = excluded.media_id,
                title = excluded.title,
                artist = excluded.artist,
                album = excluded.album,
                media_type = excluded.media_type,
                poster = excluded.poster,
                device_name = excluded.device_name,
                platform = excluded.platform,
                state = excluded.state,
                progress_percent = excluded.progress_percent,
                view_offset_ms = excluded.view_offset_ms,
                duration_ms = excluded.duration_ms,
                bandwidth_mbps = excluded.bandwidth_mbps,
                transcode_decision = excluded.transcode_decision,
                last_heartbeat = CURRENT_TIMESTAMP
        `);

        stmt.run(
            data.sessionId,
            data.userName || 'Pedro',
            data.mediaId || '',
            data.title,
            data.artist || '',
            data.album || '',
            data.mediaType || 'music',
            data.poster || '',
            data.deviceName || 'Web Music Player',
            data.platform || 'Web',
            data.state || 'playing',
            data.progressPercent || 0,
            data.viewOffsetMs || 0,
            data.durationMs || 0,
            data.bandwidthMbps || '0.3',
            data.transcodeDecision || 'Direct Play'
        );

        // Also record to playback_history if viewed for >= 5s
        if ((data.viewOffsetMs || 0) >= 5000 || (data.progressPercent || 0) >= 2) {
            const histId = `${data.sessionId}-${data.mediaId || data.title}`;
            const histStmt = db.prepare(`
                INSERT INTO playback_history (
                    id, user_name, media_id, title, artist, album, media_type,
                    poster, device_name, platform, duration_ms, view_offset_ms, viewed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    view_offset_ms = MAX(playback_history.view_offset_ms, excluded.view_offset_ms),
                    duration_ms = excluded.duration_ms,
                    viewed_at = excluded.viewed_at
            `);
            histStmt.run(
                histId,
                data.userName || 'Pedro',
                data.mediaId || '',
                data.title,
                data.artist || '',
                data.album || '',
                data.mediaType || 'music',
                data.poster || '',
                data.deviceName || 'Web Music Player',
                data.platform || 'Web',
                data.durationMs || 0,
                data.viewOffsetMs || 0,
                Date.now()
            );
        }

        return true;
    } catch (e) {
        console.error('Error recording playback heartbeat:', e);
        return false;
    }
};

export const endPlaybackSession = (sessionId: string) => {
    try {
        db.prepare('DELETE FROM playback_sessions WHERE session_id = ?').run(sessionId);
        return true;
    } catch (e) {
        console.error('Error ending playback session:', e);
        return false;
    }
};

export const clearAllPlaybackSessions = () => {
    try {
        db.prepare('DELETE FROM playback_sessions').run();
        return true;
    } catch (e) {
        console.error('Error clearing all playback sessions:', e);
        return false;
    }
};

export const getActivePlaybackSessions = () => {
    try {
        // Prune stale sessions older than 25 seconds
        db.prepare("DELETE FROM playback_sessions WHERE datetime(last_heartbeat) < datetime('now', '-25 seconds')").run();
        const rows = db.prepare('SELECT * FROM playback_sessions ORDER BY last_heartbeat DESC').all() as any[];
        return rows.map(r => ({
            id: r.session_id,
            instanceName: r.media_type === 'music' ? 'Schedulearr Music' : 'Schedulearr Theater',
            title: r.title,
            seriesTitle: r.artist || r.album || undefined,
            mediaType: r.media_type,
            poster: r.poster,
            user: {
                name: r.user_name || 'Pedro'
            },
            player: {
                title: r.device_name || 'Web Player',
                platform: r.platform || 'Web',
                state: r.state || 'playing'
            },
            playback: {
                progressPercent: r.progress_percent || 0,
                viewOffsetMs: r.view_offset_ms || 0,
                durationMs: r.duration_ms || 0,
                bandwidthMbps: r.bandwidth_mbps || '0.3'
            },
            transcode: {
                streamType: r.transcode_decision || 'Direct Play',
                videoDecision: 'direct',
                audioDecision: 'direct',
                videoCodec: '',
                resolution: 'Audio / Lossless'
            }
        }));
    } catch (e) {
        console.error('Error getting active playback sessions:', e);
        return [];
    }
};

export const getPlaybackHistory = (limit: number = 500) => {
    try {
        const rows = db.prepare('SELECT * FROM playback_history ORDER BY viewed_at DESC LIMIT ?').all(limit) as any[];
        return rows.map(r => ({
            id: r.id,
            instanceName: r.media_type === 'music' ? 'Schedulearr Music' : 'Schedulearr Theater',
            title: r.title,
            seriesTitle: r.artist || r.album || undefined,
            mediaType: r.media_type,
            poster: r.poster,
            viewedAt: r.viewed_at,
            durationMs: r.duration_ms,
            viewOffsetMs: r.view_offset_ms,
            user: {
                name: r.user_name || 'Pedro'
            },
            player: {
                title: r.device_name || 'Web Player',
                platform: r.platform || 'Web'
            }
        }));
    } catch (e) {
        console.error('Error getting playback history:', e);
        return [];
    }
};

// ── Batch IPTV EPG Query ──
export const getBatchIptvEpg = (
    libraryId: string,
    tvgIds: string[],
    startTime?: string,
    endTime?: string,
    limitPerChannel: number = 30
) => {
    try {
        if (!tvgIds || tvgIds.length === 0) return {};
        // Default time window: 6 hours ago to 48 hours in the future
        const effectiveStart = startTime || new Date(Date.now() - 6 * 3600 * 1000).toISOString();
        const lowerIds = tvgIds.map(t => t.toLowerCase().trim());
        const placeholders = tvgIds.map(() => '?').join(',');

        let query = `
            SELECT * FROM iptv_epg 
            WHERE library_id = ? AND (channel_tvg_id IN (${placeholders}) OR LOWER(channel_tvg_id) IN (${placeholders})) AND end_time >= ?
        `;
        const params: any[] = [libraryId, ...tvgIds, ...lowerIds, effectiveStart];

        if (endTime) {
            query += ' AND start_time <= ?';
            params.push(endTime);
        }

        query += ' ORDER BY start_time ASC';

        const rows = db.prepare(query).all(...params) as any[];

        const result: Record<string, any[]> = {};
        for (const row of (rows || [])) {
            const exactKey = row.channel_tvg_id;
            const lowerKey = (exactKey || '').toLowerCase();

            // Store by exact key
            if (!result[exactKey]) result[exactKey] = [];
            if (result[exactKey].length < limitPerChannel) result[exactKey].push(row);

            // Also store by lowercased key for lookup flexibility
            if (lowerKey && lowerKey !== exactKey) {
                if (!result[lowerKey]) result[lowerKey] = [];
                if (result[lowerKey].length < limitPerChannel) result[lowerKey].push(row);
            }
        }
        return result;
    } catch (e) {
        console.error('Error fetching batch IPTV EPG:', e);
        return {};
    }
};

// ── DVR Storage Folders ──
export interface DvrStorageFolder {
    id: string;
    path: string;
    name: string;
    is_default: boolean;
    created_at: string;
}

export const getDvrStorageFolders = (): DvrStorageFolder[] => {
    try {
        const rows = db.prepare('SELECT * FROM dvr_storage_folders ORDER BY is_default DESC, name ASC').all() as any[];
        return (rows || []).map(r => ({
            ...r,
            is_default: Boolean(r.is_default)
        }));
    } catch (e) {
        console.error('Error getting DVR storage folders:', e);
        return [];
    }
};

export const addDvrStorageFolder = (folderPath: string, name?: string, isDefault: boolean = false): DvrStorageFolder => {
    const id = `dvr_fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const folderName = name || folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Recordings';
    if (isDefault) {
        db.prepare('UPDATE dvr_storage_folders SET is_default = 0').run();
    }
    db.prepare('INSERT INTO dvr_storage_folders (id, path, name, is_default) VALUES (?, ?, ?, ?)').run(
        id,
        folderPath,
        folderName,
        isDefault ? 1 : 0
    );
    return {
        id,
        path: folderPath,
        name: folderName,
        is_default: isDefault,
        created_at: new Date().toISOString()
    };
};

export const deleteDvrStorageFolder = (id: string): boolean => {
    try {
        db.prepare('DELETE FROM dvr_storage_folders WHERE id = ?').run(id);
        return true;
    } catch (e) {
        console.error('Error deleting DVR folder:', e);
        return false;
    }
};

// ── DVR Smart Rules ──
export interface DvrRule {
    id: string;
    name: string;
    query: string;
    rule_type: 'sports' | 'actor' | 'keyword' | 'title';
    channel_scope: string;
    check_missing_from_library: boolean;
    destination_folder: string;
    padding_minutes: number;
    enabled: boolean;
    created_at: string;
}

export const getDvrRules = (): DvrRule[] => {
    try {
        const rows = db.prepare('SELECT * FROM dvr_rules ORDER BY created_at DESC').all() as any[];
        return (rows || []).map(r => ({
            ...r,
            check_missing_from_library: Boolean(r.check_missing_from_library),
            enabled: Boolean(r.enabled)
        }));
    } catch (e) {
        console.error('Error getting DVR rules:', e);
        return [];
    }
};

export const saveDvrRule = (rule: Partial<DvrRule> & { name: string; query: string; destination_folder: string }): DvrRule => {
    const id = rule.id || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ruleType = rule.rule_type || 'keyword';
    const channelScope = rule.channel_scope || 'all';
    const checkMissing = rule.check_missing_from_library ? 1 : 0;
    const padding = rule.padding_minutes ?? 15;
    const enabled = rule.enabled !== false ? 1 : 0;

    const existing = db.prepare('SELECT id FROM dvr_rules WHERE id = ?').get(id);
    if (existing) {
        db.prepare(`
            UPDATE dvr_rules SET
                name = ?, query = ?, rule_type = ?, channel_scope = ?,
                check_missing_from_library = ?, destination_folder = ?,
                padding_minutes = ?, enabled = ?
            WHERE id = ?
        `).run(rule.name, rule.query, ruleType, channelScope, checkMissing, rule.destination_folder, padding, enabled, id);
    } else {
        db.prepare(`
            INSERT INTO dvr_rules (id, name, query, rule_type, channel_scope, check_missing_from_library, destination_folder, padding_minutes, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, rule.name, rule.query, ruleType, channelScope, checkMissing, rule.destination_folder, padding, enabled);
    }

    return {
        id,
        name: rule.name,
        query: rule.query,
        rule_type: ruleType,
        channel_scope: channelScope,
        check_missing_from_library: Boolean(checkMissing),
        destination_folder: rule.destination_folder,
        padding_minutes: padding,
        enabled: Boolean(enabled),
        created_at: new Date().toISOString()
    };
};

export const deleteDvrRule = (id: string): boolean => {
    try {
        db.prepare('DELETE FROM dvr_rules WHERE id = ?').run(id);
        return true;
    } catch (e) {
        console.error('Error deleting DVR rule:', e);
        return false;
    }
};

// ── DVR Recordings ──
export interface DvrRecording {
    id: string;
    rule_id?: string;
    channel_id: string;
    channel_name: string;
    channel_logo?: string;
    stream_url?: string;
    program_title: string;
    program_description?: string;
    start_time: string;
    end_time: string;
    destination_path: string;
    file_path?: string;
    file_size?: number;
    status: 'scheduled' | 'recording' | 'completed' | 'failed' | 'cancelled';
    error_message?: string;
    created_at: string;
}

export const getDvrRecordings = (limit: number = 200): DvrRecording[] => {
    try {
        const rows = db.prepare('SELECT * FROM dvr_recordings ORDER BY start_time DESC LIMIT ?').all(limit) as any[];
        return rows || [];
    } catch (e) {
        console.error('Error getting DVR recordings:', e);
        return [];
    }
};

export const scheduleDvrRecording = (rec: Omit<DvrRecording, 'id' | 'created_at'>): DvrRecording => {
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(`
        INSERT INTO dvr_recordings (
            id, rule_id, channel_id, channel_name, channel_logo, stream_url,
            program_title, program_description, start_time, end_time,
            destination_path, file_path, file_size, status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        rec.rule_id || null,
        rec.channel_id,
        rec.channel_name,
        rec.channel_logo || null,
        rec.stream_url || null,
        rec.program_title,
        rec.program_description || '',
        rec.start_time,
        rec.end_time,
        rec.destination_path,
        rec.file_path || null,
        rec.file_size || 0,
        rec.status || 'scheduled',
        rec.error_message || null
    );

    return {
        ...rec,
        id,
        created_at: new Date().toISOString()
    };
};

export const updateDvrRecordingStatus = (
    id: string,
    status: 'scheduled' | 'recording' | 'completed' | 'failed' | 'cancelled',
    filePath?: string,
    fileSize?: number,
    error?: string
) => {
    try {
        db.prepare(`
            UPDATE dvr_recordings SET
                status = ?,
                file_path = COALESCE(?, file_path),
                file_size = COALESCE(?, file_size),
                error_message = COALESCE(?, error_message)
            WHERE id = ?
        `).run(status, filePath || null, fileSize || null, error || null, id);
        return true;
    } catch (e) {
        console.error('Error updating DVR recording:', e);
        return false;
    }
};

export const deleteDvrRecording = (id: string): boolean => {
    try {
        db.prepare('DELETE FROM dvr_recordings WHERE id = ?').run(id);
        return true;
    } catch (e) {
        console.error('Error deleting DVR recording:', e);
        return false;
    }
};

export default db;

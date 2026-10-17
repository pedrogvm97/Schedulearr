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
    const startTime = Date.now();
    try {
        console.log(`[Startup 1/4] 📦 Connecting to SQLite database at: ${dbPath}...`);
        const d = new Database(dbPath, { timeout: 10000 });
        d.pragma('journal_mode = WAL');
        d.pragma('busy_timeout = 10000');
        d.pragma('synchronous = NORMAL');
        d.pragma('wal_autocheckpoint = 1000');
        d.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O for instant reads
        d.pragma('temp_store = MEMORY');
        d.pragma('cache_size = -64000'); // 64MB cache
        
        console.log(`[Startup 2/4] 🔍 Verifying database connection probe...`);
        // Instant probe: verifies database header and responsiveness without disk-thrashing quick_check
        d.prepare("SELECT 1").get();

        console.log(`[Startup 3/4] 🛠️ Applying database schema and migrations...`);
        initializeSchema(d);

        const elapsed = Date.now() - startTime;
        console.log(`[Startup 4/4] 🚀 Database initialized successfully in ${elapsed}ms! Ready to serve traffic.`);
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
    transaction: (fn: any) => {
        try {
            return getDb().transaction(fn);
        } catch (err: any) {
            if (err.message && (err.message.includes('malformed') || err.message.includes('corrupt') || err.message.includes('SQLITE_CORRUPT'))) {
                console.error('[DB ERROR] Malformed disk image detected during transaction. Recovering...', err.message);
                handleCorruptDatabase();
                _db = null;
                return getDb().transaction(fn);
            }
            throw err;
        }
    },
};

function initializeSchema(d: any) {
    const CURRENT_SCHEMA_VER = 16;
    try {
        const v = d.pragma('user_version', { simple: true });
        if (typeof v === 'number' && v >= CURRENT_SCHEMA_VER) {
            return; // Schema & migrations already applied
        }
    } catch {}

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

      CREATE TABLE IF NOT EXISTS audiobook_books_meta (
        book_key TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        canonical_author TEXT,
        translator TEXT,
        narrator TEXT,
        genre TEXT,
        published_year TEXT,
        thumb TEXT,
        poster_url TEXT,
        library_id TEXT,
        total_chapters INTEGER DEFAULT 0,
        transcribed_chapters INTEGER DEFAULT 0,
        scened_chapters INTEGER DEFAULT 0,
        total_scenes INTEGER DEFAULT 0,
        illustrated_chapters INTEGER DEFAULT 0,
        enhanced_chapters INTEGER DEFAULT 0,
        transcribed_seconds REAL DEFAULT 0,
        total_duration_sec REAL DEFAULT 0,
        illustrated_scenes INTEGER DEFAULT 0,
        summary TEXT DEFAULT '',
        reading_status TEXT DEFAULT 'unstarted',
        on_bedside_table INTEGER DEFAULT 0,
        progress_percent REAL DEFAULT 0,
        last_played_at DATETIME,
        queue_priority INTEGER DEFAULT 100,
        queue_enabled INTEGER DEFAULT 1,
        transcribe_enabled INTEGER DEFAULT 1,
        scening_enabled INTEGER DEFAULT 1,
        illustrate_enabled INTEGER DEFAULT 1,
        enhance_audio_enabled INTEGER DEFAULT 0,
        enhance_enabled INTEGER DEFAULT 0,
        enhance_preset TEXT DEFAULT 'denoise_clarity',
        voice_preset TEXT DEFAULT 'original',
        art_style TEXT,
        images_per_chapter INTEGER,
        art_focus TEXT,
        dynamic_prompt_enabled INTEGER,
        custom_prompt TEXT,
        custom_cover_url TEXT,
        use_custom_cover INTEGER DEFAULT 0,
        real_structure_json TEXT DEFAULT '',
        status TEXT DEFAULT 'idle',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audiobook_authors_meta (
        author_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        bio TEXT,
        photo_url TEXT,
        birth_date TEXT,
        death_date TEXT,
        source TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audiobook_chapters_meta (
        chapter_key TEXT PRIMARY KEY,
        book_key TEXT NOT NULL,
        chapter_index INTEGER DEFAULT 0,
        title TEXT NOT NULL,
        file_path TEXT,
        duration_sec INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        transcribed_seconds REAL DEFAULT 0,
        transcription_status TEXT DEFAULT 'idle',
        transcription_progress INTEGER DEFAULT 0,
        synced_lyrics TEXT,
        synced_transcript TEXT,
        plain_transcript TEXT,
        transcript_lrc_path TEXT,
        transcript_txt_path TEXT,
        illustration_status TEXT DEFAULT 'idle',
        illustration_progress INTEGER DEFAULT 0,
        images_json TEXT DEFAULT '[]',
        audio_enhance_status TEXT DEFAULT 'idle',
        audio_enhance_progress INTEGER DEFAULT 0,
        enhance_status TEXT DEFAULT 'idle',
        enhance_progress INTEGER DEFAULT 0,
        enhance_preset TEXT DEFAULT 'none',
        voice_preset TEXT DEFAULT 'original',
        enhanced_audio_path TEXT,
        enhanced_file_path TEXT,
        processed_voices_json TEXT DEFAULT '{}',
        error_message TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audiobook_chapters_book ON audiobook_chapters_meta (book_key, chapter_index);
      CREATE INDEX IF NOT EXISTS idx_audiobook_books_priority ON audiobook_books_meta (queue_priority ASC);

      CREATE TABLE IF NOT EXISTS ai_api_usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        provider TEXT NOT NULL,
        provider_label TEXT NOT NULL,
        key_id TEXT,
        task_type TEXT NOT NULL,
        success INTEGER DEFAULT 1,
        rate_limited INTEGER DEFAULT 0,
        images_count INTEGER DEFAULT 0,
        audio_seconds REAL DEFAULT 0,
        tokens_estimated INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        book_title TEXT,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ai_api_usage_ts ON ai_api_usage_events (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_api_usage_prov ON ai_api_usage_events (provider, timestamp DESC);

      CREATE TABLE IF NOT EXISTS instant_stream_downloads (
        id TEXT PRIMARY KEY,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        tmdb_id INTEGER,
        imdb_id TEXT,
        tvdb_id INTEGER,
        instance_id TEXT,
        arr_media_id INTEGER,
        root_folder_path TEXT,
        season_number INTEGER DEFAULT 1,
        episode_number INTEGER DEFAULT 1,
        stream_source_name TEXT,
        stream_source_url TEXT,
        instant_file_path TEXT,
        hq_file_path TEXT,
        status TEXT DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        replace_when_hq INTEGER DEFAULT 1,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_instant_dl_status ON instant_stream_downloads (status, replace_when_hq);

      CREATE TABLE IF NOT EXISTS calendar_releases_cache (
        id TEXT PRIMARY KEY,
        release_date TEXT NOT NULL,
        date_day TEXT NOT NULL,
        instance_id TEXT,
        media_type TEXT,
        payload_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_releases_day ON calendar_releases_cache (date_day);
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
    // Audiobook Studio column migrations
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN thumb TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN enhance_audio_enabled INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN enhance_preset TEXT DEFAULT 'denoise_clarity';"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN art_style TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN images_per_chapter INTEGER;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN art_focus TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN dynamic_prompt_enabled INTEGER;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN custom_prompt TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN custom_cover_url TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN use_custom_cover INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN real_structure_json TEXT DEFAULT '';"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN canonical_author TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN translator TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN narrator TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN genre TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN published_year TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN transcribed_seconds REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN total_duration_sec REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN illustrated_scenes INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN reading_status TEXT DEFAULT 'unstarted';"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN on_bedside_table INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN progress_percent REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN last_played_at DATETIME;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN scening_enabled INTEGER DEFAULT 1;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN scened_chapters INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN total_scenes INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN summary TEXT DEFAULT '';"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_books_meta ADD COLUMN active_personas_json TEXT DEFAULT '[\"original\"]';"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN duration_sec INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN transcribed_seconds REAL DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN synced_lyrics TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN transcript_lrc_path TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN transcript_txt_path TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN audio_enhance_status TEXT DEFAULT 'idle';"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN audio_enhance_progress INTEGER DEFAULT 0;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN enhanced_audio_path TEXT;"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN processed_voices_json TEXT DEFAULT '{}';"); } catch (e) { }
    try { d.exec("ALTER TABLE audiobook_chapters_meta ADD COLUMN error_message TEXT;"); } catch (e) { }
    // Purge any polluted music_lyrics entries that belong to audiobook files
    try { d.exec("DELETE FROM music_lyrics WHERE file_path IN (SELECT file_path FROM audiobook_chapters_meta WHERE file_path IS NOT NULL);"); } catch (e) { }
    // Purge Plex author portrait thumbnails erroneously saved into audiobook_books_meta.thumb
    try {
        d.exec(`
            UPDATE audiobook_books_meta
            SET thumb = NULL, poster_url = NULL
            WHERE thumb LIKE '%11710/thumb%' -- George Orwell author portrait
               OR thumb LIKE '%11297/thumb%' -- Jules Verne author portrait
               OR poster_url LIKE '%11710/thumb%'
               OR poster_url LIKE '%11297/thumb%';
        `);
    } catch (e) { }
    // Purge any fake placeholder transcripts generated by old fallback logic
    try {
        d.exec(`
            UPDATE audiobook_chapters_meta SET
                transcription_status = 'idle',
                transcription_progress = 0,
                transcribed_seconds = 0,
                synced_lyrics = NULL,
                synced_transcript = NULL,
                plain_transcript = NULL,
                transcript_lrc_path = NULL,
                transcript_txt_path = NULL
            WHERE plain_transcript LIKE '%The narrator establishes the setting%'
               OR plain_transcript LIKE '%Opening narration —%'
               OR synced_lyrics LIKE '%The narrator establishes the setting%'
               OR synced_lyrics LIKE '%Opening narration —%';
        `);
    } catch (e) { }
    try { d.exec("ALTER TABLE dvr_recordings ADD COLUMN format TEXT DEFAULT 'mp4';"); } catch (e) { }
    try {
        d.exec(`
            DELETE FROM dvr_storage_folders
            WHERE path LIKE '%/app/recordings%'
               OR path LIKE '%/app/data/recordings%'
               OR path LIKE '%\\recordings';
        `);
    } catch (e) { }
    try {
        d.exec(`
            CREATE TABLE IF NOT EXISTS audiobook_authors_meta (
                author_key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                bio TEXT,
                photo_url TEXT,
                birth_date TEXT,
                death_date TEXT,
                source TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (e) { }
    try {
        d.exec(`
            CREATE TABLE IF NOT EXISTS video_ai_subtitles (
                id TEXT PRIMARY KEY,
                video_path TEXT NOT NULL,
                media_title TEXT NOT NULL,
                media_type TEXT DEFAULT 'movie',
                library_id TEXT DEFAULT '',
                library_name TEXT DEFAULT '',
                language TEXT DEFAULT 'en',
                language_name TEXT DEFAULT 'English',
                sub_path TEXT NOT NULL,
                sub_size_bytes INTEGER DEFAULT 0,
                status TEXT DEFAULT 'completed',
                duration_ms INTEGER DEFAULT 0,
                cpu_power_pct REAL DEFAULT 0,
                cpu_threads INTEGER DEFAULT 2,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                error_message TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_video_ai_subtitles_created ON video_ai_subtitles (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_video_ai_subtitles_status ON video_ai_subtitles (status);

            CREATE TABLE IF NOT EXISTS video_ai_history (
                id TEXT PRIMARY KEY,
                video_path TEXT NOT NULL,
                media_title TEXT NOT NULL,
                library_id TEXT DEFAULT '',
                library_name TEXT DEFAULT '',
                language TEXT DEFAULT 'en',
                action TEXT DEFAULT 'transcribe',
                status TEXT DEFAULT 'completed',
                duration_ms INTEGER DEFAULT 0,
                cpu_power_pct REAL DEFAULT 0,
                cpu_threads INTEGER DEFAULT 2,
                details TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_video_ai_history_created ON video_ai_history (created_at DESC);
        `);
    } catch (e) { }
    try { d.pragma(`user_version = ${CURRENT_SCHEMA_VER}`); } catch (e) { }
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

export interface UserMediaGradingCategories {
    cat1: number;
    cat2: number;
    cat3: number;
    cat4: number;
    cat5: number;
    cat6: number;
}

export interface UserMediaRating {
    itemKey: string;
    mediaType: 'book' | 'movie' | 'show' | 'track' | 'album';
    title: string;
    overall: number; // 0 - 100
    categories: UserMediaGradingCategories;
    notes?: string;
    updatedAt: string;
}

export const getAllUserMediaRatings = (): Record<string, UserMediaRating> => {
    try {
        const raw = getSetting('user_media_ratings') || '{}';
        return JSON.parse(raw);
    } catch {
        return {};
    }
};

export const saveUserMediaRating = (rating: UserMediaRating): void => {
    try {
        const all = getAllUserMediaRatings();
        all[rating.itemKey] = {
            ...rating,
            updatedAt: new Date().toISOString()
        };
        setSetting('user_media_ratings', JSON.stringify(all));
    } catch (e) {
        console.error('Failed to save media rating:', e);
    }
};

export const deleteUserMediaRating = (itemKey: string): void => {
    try {
        const all = getAllUserMediaRatings();
        delete all[itemKey];
        setSetting('user_media_ratings', JSON.stringify(all));
    } catch (e) {
        console.error('Failed to delete media rating:', e);
    }
};

export const getUserMediaFavorites = (): string[] => {
    try {
        const raw = getSetting('user_media_favorites') || '[]';
        return JSON.parse(raw);
    } catch {
        return [];
    }
};

export const toggleUserMediaFavorite = (itemKey: string): { isFavorite: boolean; favorites: string[] } => {
    try {
        const current = new Set(getUserMediaFavorites());
        let isFavorite = false;
        if (current.has(itemKey)) {
            current.delete(itemKey);
            isFavorite = false;
        } else {
            current.add(itemKey);
            isFavorite = true;
        }
        const updated = Array.from(current);
        setSetting('user_media_favorites', JSON.stringify(updated));
        return { isFavorite, favorites: updated };
    } catch {
        return { isFavorite: false, favorites: [] };
    }
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
        // Normalize any legacy 'iptv' type rows to 'live'
        try {
            db.prepare("UPDATE theater_libraries SET type = 'live' WHERE type IN ('iptv', 'livetv', 'live_tv')").run();
        } catch {}

        // Auto-reconcile any iptv_channels library_id that is missing from theater_libraries
        try {
            const orphanLibs = db.prepare(`
                SELECT DISTINCT library_id, COUNT(*) as ch_count
                FROM iptv_channels
                WHERE library_id IS NOT NULL AND library_id != ''
                  AND library_id NOT IN (SELECT id FROM theater_libraries)
                GROUP BY library_id
            `).all() as any[];
            for (const o of (orphanLibs || [])) {
                const sample = db.prepare('SELECT streams_json FROM iptv_channels WHERE library_id = ? LIMIT 1').get(o.library_id) as any;
                let inferredFolder = '';
                try {
                    const streams = JSON.parse(sample?.streams_json || '[]');
                    if (Array.isArray(streams) && streams[0]?.url) {
                        const u = new URL(streams[0].url);
                        inferredFolder = `${u.protocol}//${u.host}`;
                    }
                } catch {}
                db.prepare(`
                    INSERT OR IGNORE INTO theater_libraries (id, name, type, folders)
                    VALUES (?, ?, 'live', ?)
                `).run(o.library_id, `Live TV Provider (${o.ch_count} ch)`, JSON.stringify(inferredFolder ? [inferredFolder] : []));
            }
        } catch {}

        const rows = db.prepare('SELECT * FROM theater_libraries ORDER BY created_at ASC').all() as any[];
        return (rows || []).map(r => {
            let folders: string[] = [];
            try {
                folders = typeof r.folders === 'string' ? JSON.parse(r.folders) : (Array.isArray(r.folders) ? r.folders : []);
            } catch {
                folders = r.folders ? [r.folders] : [];
            }
            const rawType = String(r.type || '').toLowerCase().trim();
            const normalizedType =
                (rawType === 'iptv' || rawType === 'livetv' || rawType === 'live_tv') ? 'live' :
                (rawType === 'tv' || rawType === 'series') ? 'show' :
                (rawType === 'audiobook') ? 'audiobooks' :
                (rawType === 'photo') ? 'photos' :
                (rawType === 'movies') ? 'movie' :
                rawType;
            return {
                ...r,
                type: normalizedType,
                folders
            };
        });
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

export const deleteTheaterLibrary = (id: string, deleteGeneratedData?: boolean) => {
    try {
        if (deleteGeneratedData) {
            try {
                // Find all books belonging to this library to purge generated AI data
                const books = db.prepare('SELECT book_key FROM audiobook_books_meta WHERE library_id = ?').all(id) as any[];
                for (const b of books) {
                    db.prepare('DELETE FROM audiobook_chapters_meta WHERE book_key = ?').run(b.book_key);
                    db.prepare('DELETE FROM audiobook_books_meta WHERE book_key = ?').run(b.book_key);
                }
            } catch (cleanupErr) {
                console.warn('Error purging associated generated data for library:', cleanupErr);
            }
        }
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

export const unlinkIptvChannelStream = (
    libraryId: string,
    channelId: string,
    streamUrl: string,
    createSeparateChannel: boolean = true
): { success: boolean; newChannelId?: string } => {
    try {
        const row: any = db.prepare('SELECT * FROM iptv_channels WHERE library_id = ? AND id = ?').get(libraryId, channelId);
        if (!row) return { success: false };

        const streams: Array<{ url: string; quality: string; label: string }> = row.streams_json ? JSON.parse(row.streams_json) : [];
        const unlinkedStream = streams.find(s => s.url === streamUrl);
        const remaining = streams.filter(s => s.url !== streamUrl);

        if (!unlinkedStream || remaining.length === 0) {
            return { success: false };
        }

        db.prepare('UPDATE iptv_channels SET streams_json = ? WHERE id = ?').run(
            JSON.stringify(remaining),
            channelId
        );

        let newChannelId: string | undefined;
        if (createSeparateChannel) {
            newChannelId = `chan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            let originalName = row.name;
            const parenthesized = unlinkedStream.label ? unlinkedStream.label.match(/\((.+?)\)/) : null;
            if (parenthesized && parenthesized[1]) {
                originalName = parenthesized[1].trim();
            } else if (unlinkedStream.label && !unlinkedStream.label.toLowerCase().includes('stream')) {
                originalName = unlinkedStream.label.trim();
            } else {
                originalName = `${row.name} (Alt)`;
            }
            if (originalName === row.name) {
                originalName = `${row.name} (Alt)`;
            }

            db.prepare(`
                INSERT INTO iptv_channels (id, library_id, name, clean_name, logo, group_title, tvg_id, tvg_name, streams_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                newChannelId,
                libraryId,
                originalName,
                originalName,
                row.logo,
                row.group_title,
                row.tvg_id,
                row.tvg_name,
                JSON.stringify([unlinkedStream])
            );
        }

        return { success: true, newChannelId };
    } catch (e) {
        console.error('Error in unlinkIptvChannelStream:', e);
        return { success: false };
    }
};

export const updateIptvChannelLogo = (libraryId: string, channelId: string, logoUrl: string): boolean => {
    try {
        const stmt = db.prepare('UPDATE iptv_channels SET logo = ? WHERE library_id = ? AND id = ?');
        const res = stmt.run(logoUrl, libraryId, channelId);
        return res.changes > 0;
    } catch (e) {
        console.error('Error updating IPTV channel logo:', e);
        return false;
    }
};

export const batchUpdateIptvChannelLogos = (libraryId: string, updates: Array<{ id: string; logo: string }>): number => {
    try {
        if (!libraryId || !Array.isArray(updates) || updates.length === 0) return 0;
        const stmt = db.prepare('UPDATE iptv_channels SET logo = ? WHERE library_id = ? AND id = ?');
        let count = 0;
        const transaction = db.transaction(() => {
            for (const u of updates) {
                if (u && u.id && u.logo) {
                    const res = stmt.run(u.logo, libraryId, u.id);
                    count += res.changes;
                }
            }
        });
        transaction();
        return count;
    } catch (e) {
        console.error('Error batch updating IPTV channel logos:', e);
        return 0;
    }
};

// ── IPTV EPG Guide Data Persistence ──
export const clearIptvEpgForLibrary = (libraryId: string): boolean => {
    try {
        if (!libraryId) return false;
        db.prepare('DELETE FROM iptv_epg WHERE library_id = ?').run(libraryId);
        return true;
    } catch (e) {
        console.error('[DB-ERROR] Error clearing IPTV EPG for library:', e);
        return false;
    }
};

export const getIptvEpgCountForLibrary = (libraryId: string): number => {
    try {
        if (!libraryId) return 0;
        const row = db.prepare('SELECT COUNT(*) as cnt FROM iptv_epg WHERE library_id = ?').get(libraryId) as any;
        return Number(row?.cnt || 0);
    } catch {
        return 0;
    }
};

export const insertIptvEpgChunk = (
    libraryId: string,
    chunk: Array<{
        channelTvgId: string;
        title: string;
        description?: string;
        startTime: string;
        endTime: string;
    }>,
    chunkOffset: number = 0
): boolean => {
    try {
        if (!chunk || chunk.length === 0) return true;
        const stmt = db.prepare(`
            INSERT INTO iptv_epg (id, library_id, channel_tvg_id, title, description, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const nowTs = Date.now();
        const tx = db.transaction((items: typeof chunk) => {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const id = `epg_${nowTs}_${chunkOffset + i}_${Math.random().toString(36).slice(2, 6)}`;
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
        tx(chunk);
        return true;
    } catch (e) {
        console.error('[DB-ERROR] Error inserting IPTV EPG chunk:', e);
        return false;
    }
};

export const saveIptvEpg = (libraryId: string, epgList: Array<{
    channelTvgId: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
}>, replaceExisting: boolean = true): boolean => {
    try {
        if (replaceExisting && libraryId) {
            clearIptvEpgForLibrary(libraryId);
        }
        const batchSize = 1500;
        for (let i = 0; i < epgList.length; i += batchSize) {
            insertIptvEpgChunk(libraryId, epgList.slice(i, i + batchSize), i);
        }
        return true;
    } catch (e) {
        console.error('[DB-ERROR] Error saving IPTV EPG:', e);
        return false;
    }
};

export const getIptvEpgForChannel = (
    libraryId: string,
    tvgId: string,
    startTime?: string,
    endTime?: string,
    limit: number = 200,
    allowCrossLibraryFallback: boolean = true
): any[] => {
    try {
        if (!tvgId) return [];
        const cleanId = tvgId.trim();
        const lowerId = cleanId.toLowerCase();
        const normId = lowerId.replace(/[^a-z0-9]/g, '');
        const hasSpecificLib = Boolean(libraryId && libraryId !== 'ALL');

        // Use exact IN (?, ?, ?) so SQLite always uses idx_iptv_epg_lookup (library_id, channel_tvg_id, end_time) in <0.5ms
        let query = `
            SELECT * FROM iptv_epg 
            WHERE ${hasSpecificLib ? 'library_id = ? AND ' : ''}channel_tvg_id IN (?, ?, ?)
        `;
        const params: any[] = hasSpecificLib ? [libraryId, cleanId, lowerId, normId] : [cleanId, lowerId, normId];

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

        let rows = db.prepare(query).all(...params) as any[];
        if ((!rows || rows.length === 0) && hasSpecificLib && allowCrossLibraryFallback) {
            let fallbackQuery = `
                SELECT * FROM iptv_epg 
                WHERE channel_tvg_id IN (?, ?, ?)
            `;
            const fbParams: any[] = [cleanId, lowerId, normId];
            if (startTime) {
                fallbackQuery += ' AND end_time >= ?';
                fbParams.push(startTime);
            }
            if (endTime) {
                fallbackQuery += ' AND start_time <= ?';
                fbParams.push(endTime);
            }
            fallbackQuery += ' ORDER BY start_time ASC LIMIT ?';
            fbParams.push(limit);
            rows = db.prepare(fallbackQuery).all(...fbParams) as any[];
        }
        return rows || [];
    } catch (e) {
        console.error('[DB-ERROR] Error fetching IPTV EPG for channel:', e);
        return [];
    }
};

export const getIptvEpg = getIptvEpgForChannel;

export const getMusicPlaylists = (libraryId?: string) => {
    try {
        // Universal user playlists: return all playlists across all views so playlists are never hidden when switching libraries
        const query = 'SELECT * FROM music_playlists ORDER BY created_at DESC';
        const rows = db.prepare(query).all() as any[];
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
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, items_json = excluded.items_json, cover_url = COALESCE(excluded.cover_url, music_playlists.cover_url)
        `);
        stmt.run(id, libraryId || 'global', name.trim(), JSON.stringify(items), coverUrl || null);
        return true;
    } catch (e) {
        console.error('Error saving music playlist:', e);
        return false;
    }
};

export const updatePlaylistItems = (id: string, items: any[], name?: string, coverUrl?: string) => {
    try {
        if (name && coverUrl) {
            const stmt = db.prepare('UPDATE music_playlists SET items_json = ?, name = ?, cover_url = ? WHERE id = ?');
            stmt.run(JSON.stringify(items), name.trim(), coverUrl, id);
        } else if (name) {
            const stmt = db.prepare('UPDATE music_playlists SET items_json = ?, name = ? WHERE id = ?');
            stmt.run(JSON.stringify(items), name.trim(), id);
        } else if (coverUrl) {
            const stmt = db.prepare('UPDATE music_playlists SET items_json = ?, cover_url = ? WHERE id = ?');
            stmt.run(JSON.stringify(items), coverUrl, id);
        } else {
            const stmt = db.prepare('UPDATE music_playlists SET items_json = ? WHERE id = ?');
            stmt.run(JSON.stringify(items), id);
        }
        return true;
    } catch (e) {
        console.error('Error updating playlist items:', e);
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

// ── Batch IPTV EPG Query (Indexed <1ms Lookup) ──
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
        const uniqueIds = Array.from(new Set(tvgIds.filter(Boolean)));
        if (uniqueIds.length === 0) return {};

        const result: Record<string, any[]> = {};
        const chunkSize = 200; // SQLite max variables safety (200 * 3 = 600 bind params)

        for (let i = 0; i < uniqueIds.length; i += chunkSize) {
            const chunk = uniqueIds.slice(i, i + chunkSize);
            const allKeys = Array.from(new Set([
                ...chunk,
                ...chunk.map(t => t.toLowerCase().trim()),
                ...chunk.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
            ].filter(Boolean)));
            if (allKeys.length === 0) continue;
            const placeholders = allKeys.map(() => '?').join(',');

            const runQuery = (restrictLib: boolean) => {
                let query = `
                    SELECT * FROM iptv_epg 
                    WHERE ${restrictLib ? 'library_id = ? AND ' : ''}channel_tvg_id IN (${placeholders}) AND end_time >= ?
                `;
                const params: any[] = restrictLib
                    ? [libraryId, ...allKeys, effectiveStart]
                    : [...allKeys, effectiveStart];

                if (endTime) {
                    query += ' AND start_time <= ?';
                    params.push(endTime);
                }

                query += ' ORDER BY start_time ASC';
                return db.prepare(query).all(...params) as any[];
            };

            let rows = (libraryId && libraryId !== 'ALL') ? runQuery(true) : runQuery(false);
            if ((!rows || rows.length === 0) && libraryId && libraryId !== 'ALL') {
                rows = runQuery(false);
            }

            for (const row of (rows || [])) {
                const exactKey = row.channel_tvg_id;
                const lowerKey = (exactKey || '').toLowerCase();
                const normKey = lowerKey.replace(/[^a-z0-9]/g, '');

                const keysToStore = Array.from(new Set([exactKey, lowerKey, normKey])).filter(Boolean);
                for (const k of keysToStore) {
                    if (!result[k]) result[k] = [];
                    if (result[k].length < limitPerChannel) result[k].push(row);
                }
            }
        }
        return result;
    } catch (e) {
        console.error('[DB-ERROR] Error fetching batch IPTV EPG:', e);
        return {};
    }
};

export const searchIptvEpgForDvrRule = (libraryId: string, tokens: string[]): any[] => {
    try {
        const cleanTokens = (tokens || []).map(t => t.trim().toLowerCase()).filter(Boolean);
        if (cleanTokens.length === 0) return [];
        const nowIso = new Date().toISOString();
        const clauses = cleanTokens.map(() => '(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)').join(' AND ');
        const params: any[] = [libraryId, nowIso];
        for (const t of cleanTokens) {
            const likePat = `%${t}%`;
            params.push(likePat, likePat);
        }
        const query = `
            SELECT * FROM iptv_epg
            WHERE library_id = ? AND end_time >= ? AND ${clauses}
            ORDER BY start_time ASC
            LIMIT 500
        `;
        return (db.prepare(query).all(...params) as any[]) || [];
    } catch (e) {
        console.error('[DB-ERROR] Error searching IPTV EPG for DVR rule:', e);
        return [];
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
    format?: 'mp4' | 'mkv' | 'mp3';
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
    const fmt = (rec.format === 'mkv' || rec.format === 'mp3') ? rec.format : 'mp4';
    db.prepare(`
        INSERT INTO dvr_recordings (
            id, rule_id, channel_id, channel_name, channel_logo, stream_url,
            program_title, program_description, start_time, end_time,
            destination_path, file_path, file_size, format, status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        fmt,
        rec.status || 'scheduled',
        rec.error_message || null
    );

    return {
        ...rec,
        format: fmt,
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

// ── Author Canonicalization & Audiobook Studio Helpers ──
export interface CanonicalAuthorResult {
    canonicalAuthor: string;
    translator?: string;
    narrator?: string;
    year?: string;
    cleanTitle?: string;
}

export const parseAndCanonicalizeAuthor = (rawAuthor?: string, rawTitle?: string): CanonicalAuthorResult => {
    let s = String(rawAuthor || '').trim();
    if (!s || /^unknown(\s+author|\s+artist)?$/i.test(s) || /^various(\s+artists|\s+authors)?$/i.test(s)) {
        return { canonicalAuthor: 'Unknown Author', cleanTitle: rawTitle };
    }

    let translator: string | undefined;
    let narrator: string | undefined;
    let year: string | undefined;

    const extractMetaFromChunk = (chunk: string): boolean => {
        const clean = chunk.replace(/^[\(\[\{\s\-–—,;:/]+|[\)\]\}\s\-–—,;:/]+$/g, '').trim();
        if (!clean) return true;

        // Translator patterns: "trans. X", "translated by X", "tr. X", "X, translator", "X (translator)"
        const transMatch =
            clean.match(/^(?:trans\.?|translated\s+by|transl\.?|tr\.?|translation\s+by)\s+(.+)$/i) ||
            clean.match(/^(.+?)\s*(?:,\s*|\s+)(?:translator|trans\.?)$/i);
        if (transMatch) {
            translator = translator || transMatch[1].trim();
            return true;
        }

        // Narrator patterns: "read by X", "narrated by X", "narr. X", "performed by X", "X, narrator"
        const narrMatch =
            clean.match(/^(?:read\s+by|narrated\s+by|narr\.?|narrator:?|performed\s+by|voiced\s+by)\s+(.+)$/i) ||
            clean.match(/^(.+?)\s*(?:,\s*|\s+)(?:narrator|reader)$/i);
        if (narrMatch) {
            narrator = narrator || narrMatch[1].trim();
            return true;
        }

        // Editor / Adapter / Illustrator / Introduction patterns
        if (/^(?:ed\.?|edited\s+by|editor:?|adapted\s+by|intro\.?\s+by|introduction\s+by|foreword\s+by|illustrated\s+by|ill\.?)\b/i.test(clean)) {
            return true;
        }

        // Edition / format noise
        if (/^(?:unabridged|abridged|audiobook|audio\s+edition|full\s+cast|dramatized|classic|complete|edition|vol\.?\s*\d+|book\s*\d+)$/i.test(clean)) {
            return true;
        }

        // Year or lifespan e.g. (1883-1924) or (1915)
        const yearMatch = clean.match(/^(\d{4})(?:\s*[-–—]\s*\d{2,4})?$/);
        if (yearMatch) {
            year = year || yearMatch[1];
            return true;
        }

        return false;
    };

    // 1. Inspect and strip parenthetical / bracketed segments: (...), [...], {...}
    s = s.replace(/(\([^\)]*\)|\[[^\]]*\]|\{[^\}]*\})/g, (match) => {
        if (extractMetaFromChunk(match)) return ' ';
        // Also strip if inside parens it contains trans/narr/ed anywhere
        if (/\b(?:trans\.?|translated|translator|narr\.?|narrated|narrator|read\s+by|ed\.?|edited|unabridged|abridged)\b/i.test(match)) {
            extractMetaFromChunk(match);
            return ' ';
        }
        return ' ';
    });

    // 2. Strip trailing inline clauses like " - trans. Ian Johnston" or ", trans. Ian Johnston" or "; read by X"
    const inlineTailPatterns = [
        /(?:[,;:/\-–—]|\s+)\b(?:trans\.?|translated\s+by|tr\.?|translation\s+by)\s+([^,;()\[\]]+)$/i,
        /(?:[,;:/\-–—]|\s+)\b(?:read\s+by|narrated\s+by|narr\.?|performed\s+by)\s+([^,;()\[\]]+)$/i,
        /(?:[,;:/\-–—]|\s+)\b(?:ed\.?|edited\s+by|adapted\s+by|foreword\s+by|introduction\s+by)\s+([^,;()\[\]]+)$/i
    ];
    let changed = true;
    while (changed) {
        changed = false;
        for (const pat of inlineTailPatterns) {
            const m = s.match(pat);
            if (m) {
                extractMetaFromChunk(m[0]);
                s = s.slice(0, m.index).trim();
                changed = true;
            }
        }
    }

    // 3. If comma-separated segments exist, check if the second segment is a role or "Last, First" inversion
    if (s.includes(',')) {
        const parts = s.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length === 2) {
            const [first, second] = parts;
            if (extractMetaFromChunk(second)) {
                s = first;
            } else if (
                // "Kafka, Franz" -> single surname + given name(s)
                !first.includes(' ') &&
                second.split(/\s+/).length <= 3 &&
                !/\b(?:and|&|jr\.?|sr\.?|ii|iii|iv)\b/i.test(second)
            ) {
                s = `${second} ${first}`;
            }
        } else if (parts.length > 2) {
            const kept: string[] = [];
            for (const p of parts) {
                if (!extractMetaFromChunk(p)) kept.push(p);
            }
            if (kept.length > 0) s = kept[0];
        }
    }

    // 4. Also check rawTitle for embedded year or translator if not found yet
    if (rawTitle) {
        const titleParens = String(rawTitle).match(/(\([^\)]*\)|\[[^\]]*\])/g) || [];
        for (const tp of titleParens) {
            extractMetaFromChunk(tp);
        }
    }

    // 5. Normalize initials and whitespace: "J.R.R. Tolkien" -> "J. R. R. Tolkien"
    s = s
        .replace(/\.([A-Za-z])/g, '. $1')
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–—,:;/|]+|[\s\-–—,:;/|]+$/g, '')
        .trim();

    if (!s) s = 'Unknown Author';

    return {
        canonicalAuthor: s,
        translator,
        narrator,
        year
    };
};

export interface AudiobookBookMeta {
    book_key: string;
    title: string;
    author: string;
    canonical_author?: string;
    translator?: string;
    narrator?: string;
    genre?: string;
    published_year?: string;
    thumb?: string;
    poster_url?: string;
    custom_cover_url?: string;
    use_custom_cover?: boolean;
    real_structure_json?: string;
    library_id?: string;
    queue_priority: number;
    queue_order?: number;
    queue_enabled: boolean;
    is_queued?: number;
    transcribe_enabled: boolean;
    scening_enabled: boolean;
    illustrate_enabled: boolean;
    enhance_audio_enabled: boolean;
    voice_preset: string;
    active_personas?: string[];
    active_personas_json?: string;
    enhance_preset?: string;
    art_style?: string;
    images_per_chapter?: number;
    art_focus?: string;
    dynamic_prompt_enabled?: boolean;
    custom_prompt?: string;
    total_chapters: number;
    transcribed_chapters: number;
    scened_chapters: number;
    total_scenes: number;
    illustrated_chapters: number;
    enhanced_chapters: number;
    transcribed_seconds: number;
    total_duration_sec: number;
    illustrated_scenes: number;
    summary?: string;
    reading_status: 'unstarted' | 'ongoing' | 'finished';
    on_bedside_table: boolean;
    progress_percent: number;
    last_played_at?: string;
    status: string;
    updated_at: string;
}

export interface AudiobookChapterSceneImage {
    id: string;
    url: string;
    prompt: string;
    kept: boolean;
    sceneIndex: number;
    artType?: 'cover' | 'chapter' | 'scene';
    startSec?: number;
    endSec?: number;
    sceneTitle?: string;
    chapterTitle?: string;
    transitionReason?: string;
    characters?: string[];
    createdAt: string;
}

export interface AudiobookChapterMeta {
    chapter_key: string;
    book_key: string;
    chapter_index: number;
    title: string;
    file_path?: string;
    duration_sec: number;
    transcribed_seconds: number;
    transcription_status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
    transcription_progress: number;
    synced_lyrics?: string;
    plain_transcript?: string;
    transcript_lrc_path?: string;
    transcript_txt_path?: string;
    illustration_status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
    illustration_progress: number;
    images: AudiobookChapterSceneImage[];
    audio_enhance_status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
    audio_enhance_progress: number;
    enhanced_audio_path?: string;
    voice_preset: string;
    processed_voices?: Record<string, string>;
    error_message?: string;
    updated_at: string;
}

const mapBookRow = (r: any): AudiobookBookMeta => {
    const thumbVal = r.thumb || r.poster_url || undefined;
    const queueEnabled = Boolean(r.queue_enabled ?? r.is_queued);
    const queuePriority = Number(r.queue_priority ?? r.queue_order ?? 100);
    const parsedAuthor = parseAndCanonicalizeAuthor(r.canonical_author || r.author, r.title);
    const rawParsed = parseAndCanonicalizeAuthor(r.author, r.title);
    const canonicalAuthor = r.canonical_author || parsedAuthor.canonicalAuthor || 'Unknown Author';
    const progressPercent = Number(r.progress_percent ?? 0);
    let readingStatus: 'unstarted' | 'ongoing' | 'finished' =
        r.reading_status === 'finished' ? 'finished' :
        r.reading_status === 'ongoing' ? 'ongoing' :
        progressPercent >= 95 ? 'finished' :
        progressPercent > 0 ? 'ongoing' : 'unstarted';

    const sceningEnabled = r.scening_enabled !== 0;
    const illustrateEnabled = sceningEnabled ? (r.illustrate_enabled !== 0) : false;

    let extractedSummary = r.summary || '';
    if (!extractedSummary && r.real_structure_json) {
        try {
            const st = JSON.parse(r.real_structure_json);
            if (st?.overallSynopsis) extractedSummary = String(st.overallSynopsis).slice(0, 260);
        } catch {}
    }

    const rawCover = r.custom_cover_url && !String(r.custom_cover_url).toLowerCase().includes('.svg') ? r.custom_cover_url : undefined;

    return {
        book_key: r.book_key,
        title: r.title || 'Untitled Book',
        author: canonicalAuthor,
        canonical_author: canonicalAuthor,
        translator: r.translator || rawParsed.translator || undefined,
        narrator: r.narrator || rawParsed.narrator || undefined,
        genre: r.genre || undefined,
        published_year: r.published_year || rawParsed.year || undefined,
        thumb: thumbVal,
        poster_url: thumbVal,
        custom_cover_url: rawCover,
        use_custom_cover: Boolean(r.use_custom_cover && rawCover),
        real_structure_json: r.real_structure_json || '',
        library_id: r.library_id || undefined,
        queue_priority: queuePriority,
        queue_order: queuePriority,
        queue_enabled: queueEnabled,
        is_queued: queueEnabled ? 1 : 0,
        transcribe_enabled: r.transcribe_enabled !== 0,
        scening_enabled: sceningEnabled,
        illustrate_enabled: illustrateEnabled,
        enhance_audio_enabled: Boolean(r.enhance_audio_enabled ?? r.enhance_enabled),
        voice_preset: r.voice_preset || 'original',
        active_personas: (() => {
            try {
                const parsed = JSON.parse(r.active_personas_json || '["original"]');
                return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['original'];
            } catch {
                return ['original'];
            }
        })(),
        active_personas_json: r.active_personas_json || '["original"]',
        enhance_preset: r.enhance_preset || '',
        art_style: r.art_style || '',
        images_per_chapter: Number(r.images_per_chapter ?? 0),
        art_focus: r.art_focus || '',
        dynamic_prompt_enabled: r.dynamic_prompt_enabled !== undefined && r.dynamic_prompt_enabled !== null ? Boolean(r.dynamic_prompt_enabled) : true,
        custom_prompt: r.custom_prompt || '',
        total_chapters: Number(r.total_chapters ?? 0),
        transcribed_chapters: Number(r.transcribed_chapters ?? 0),
        scened_chapters: Number(r.scened_chapters ?? 0),
        total_scenes: Number(r.total_scenes ?? 0),
        illustrated_chapters: Number(r.illustrated_chapters ?? 0),
        enhanced_chapters: Number(r.enhanced_chapters ?? 0),
        transcribed_seconds: Number(r.transcribed_seconds ?? 0),
        total_duration_sec: Number(r.total_duration_sec ?? 0),
        illustrated_scenes: Number(r.illustrated_scenes ?? 0),
        summary: extractedSummary || undefined,
        reading_status: readingStatus,
        on_bedside_table: Boolean(r.on_bedside_table) || readingStatus === 'ongoing',
        progress_percent: progressPercent,
        last_played_at: r.last_played_at || undefined,
        status: r.status || 'idle',
        updated_at: r.updated_at || new Date().toISOString()
    };
};

const mapChapterRow = (r: any): AudiobookChapterMeta => {
    let parsedImages: AudiobookChapterSceneImage[] = [];
    try {
        const raw = JSON.parse(r.images_json || '[]');
        parsedImages = (Array.isArray(raw) ? raw : []).filter(img => img && img.url && !String(img.url).toLowerCase().includes('.svg'));
    } catch {
        parsedImages = [];
    }
    let parsedVoices: Record<string, string> = {};
    try {
        parsedVoices = JSON.parse(r.processed_voices_json || '{}') || {};
    } catch {
        parsedVoices = {};
    }
    const enhancedPath = r.enhanced_audio_path || r.enhanced_file_path || undefined;
    const vPreset = r.voice_preset || 'original';
    if (enhancedPath && vPreset && vPreset !== 'original' && !parsedVoices[vPreset]) {
        parsedVoices[vPreset] = enhancedPath;
    }
    const durationSec = Number(r.duration_sec ?? (r.duration_ms ? Math.round(Number(r.duration_ms) / 1000) : 0));
    const status = r.transcription_status || 'idle';
    const progress = Number(r.transcription_progress ?? 0);
    const rawTranscribedSec = Number(r.transcribed_seconds ?? 0);
    const effectiveTranscribedSec =
        rawTranscribedSec > 0
            ? rawTranscribedSec
            : status === 'completed'
                ? durationSec
                : status === 'processing' && durationSec > 0
                    ? Math.round((durationSec * progress) / 100)
                    : 0;

    return {
        chapter_key: r.chapter_key,
        book_key: r.book_key,
        chapter_index: Number(r.chapter_index ?? 0),
        title: r.title || 'Chapter',
        file_path: r.file_path || undefined,
        duration_sec: durationSec,
        transcribed_seconds: effectiveTranscribedSec,
        transcription_status: status,
        transcription_progress: progress,
        synced_lyrics: r.synced_lyrics || r.synced_transcript || undefined,
        plain_transcript: r.plain_transcript || undefined,
        transcript_lrc_path: r.transcript_lrc_path || undefined,
        transcript_txt_path: r.transcript_txt_path || undefined,
        illustration_status: r.illustration_status || 'idle',
        illustration_progress: Number(r.illustration_progress ?? 0),
        images: parsedImages,
        audio_enhance_status: r.audio_enhance_status || r.enhance_status || 'idle',
        audio_enhance_progress: Number(r.audio_enhance_progress ?? 0),
        enhanced_audio_path: enhancedPath,
        voice_preset: vPreset,
        processed_voices: parsedVoices,
        error_message: r.error_message || undefined,
        updated_at: r.updated_at || new Date().toISOString()
    };
};

let hasReconciledAudiobookChaptersThisBoot = false;

const normalizeBookTitleForMatch = (t: string): string =>
    (t || '')
        .toLowerCase()
        .replace(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/g, '')
        .replace(/^\d{1,2}\s*[-–—._:]+\s*/, '')
        .replace(/^(the|a|an)\s+/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const normalizeBookKeyIdentity = (rawBookKeyOrTitle: string, rawAuthor?: string): string => {
    const raw = (rawBookKeyOrTitle || '').trim();
    if (rawAuthor) {
        const cleanAuth = parseAndCanonicalizeAuthor(rawAuthor, raw).canonicalAuthor.toLowerCase().trim();
        return `${normalizeBookTitleForMatch(raw)}::${cleanAuth}`;
    }
    if (raw.includes('__')) {
        const [tPart, aPart] = raw.split('__');
        const cleanAuth = parseAndCanonicalizeAuthor(aPart || '', tPart || '').canonicalAuthor.toLowerCase().trim();
        return `${normalizeBookTitleForMatch(tPart || '')}::${cleanAuth}`;
    }
    if (raw.includes(' - ')) {
        const [aPart, ...tParts] = raw.split(' - ');
        const tJoined = tParts.join(' - ');
        const cleanAuth = parseAndCanonicalizeAuthor(aPart || '', tJoined).canonicalAuthor.toLowerCase().trim();
        return `${normalizeBookTitleForMatch(tJoined)}::${cleanAuth}`;
    }
    return normalizeBookTitleForMatch(raw);
};

export const getAllAudiobooksMeta = (): AudiobookBookMeta[] => {
    try {
        if (!hasReconciledAudiobookChaptersThisBoot) {
            hasReconciledAudiobookChaptersThisBoot = true;
            try {
                // 1. Clear legacy pre-v0.6.16 "No Speech-to-Text API key configured" error banners so local Whisper.cpp / HF Spaces can run cleanly
                db.prepare(`
                    UPDATE audiobook_chapters_meta
                    SET transcription_status = CASE WHEN (synced_lyrics IS NULL OR synced_lyrics = '') THEN 'idle' ELSE transcription_status END,
                        error_message = ''
                    WHERE error_message LIKE '%No Speech-to-Text API key%'
                       OR error_message LIKE '%Speech-to-Text failed to transcribe%'
                `).run();

                // 2. Deduplicate audiobook_books_meta rows that refer to the exact same book (e.g. "The Metamorphosis" vs "Metamorphosis (1915)")
                const allRawRows = db.prepare('SELECT * FROM audiobook_books_meta').all() as any[];
                const byCanonicalIdentity = new Map<string, any[]>();
                for (const r of allRawRows) {
                    const mapped = mapBookRow(r);
                    const idKey = normalizeBookKeyIdentity(mapped.title, mapped.canonical_author || mapped.author);
                    if (!normalizeBookTitleForMatch(mapped.title)) continue;
                    const arr = byCanonicalIdentity.get(idKey) || [];
                    arr.push(r);
                    byCanonicalIdentity.set(idKey, arr);
                }

                for (const [, group] of byCanonicalIdentity.entries()) {
                    if (group.length <= 1) continue;
                    const scored = group.map(r => {
                        const chCountRow = db.prepare('SELECT COUNT(*) as cnt FROM audiobook_chapters_meta WHERE book_key = ?').get(r.book_key) as { cnt: number };
                        const chCnt = Number(chCountRow?.cnt || 0);
                        const hasThumb = r.thumb ? 20 : 0;
                        const hasCustomCover = r.custom_cover_url ? 15 : 0;
                        return { row: r, score: chCnt * 100 + hasThumb + hasCustomCover };
                    }).sort((a, b) => b.score - a.score);

                    const keeper = scored[0].row;
                    const keeperKey = keeper.book_key;
                    for (let i = 1; i < scored.length; i++) {
                        const dup = scored[i].row;
                        const dupKey = dup.book_key;
                        // Merge metadata fields from duplicate row into keeper row
                        db.prepare(`
                            UPDATE audiobook_books_meta SET
                                thumb = COALESCE(audiobook_books_meta.thumb, ?),
                                custom_cover_url = COALESCE(audiobook_books_meta.custom_cover_url, ?),
                                published_year = COALESCE(NULLIF(audiobook_books_meta.published_year, '2024'), ?),
                                genre = COALESCE(audiobook_books_meta.genre, ?),
                                narrator = COALESCE(audiobook_books_meta.narrator, ?),
                                translator = COALESCE(audiobook_books_meta.translator, ?),
                                real_structure_json = CASE WHEN audiobook_books_meta.real_structure_json IS NULL OR audiobook_books_meta.real_structure_json = '' THEN ? ELSE audiobook_books_meta.real_structure_json END,
                                on_bedside_table = CASE WHEN audiobook_books_meta.on_bedside_table = 1 OR ? = 1 THEN 1 ELSE 0 END,
                                reading_status = CASE WHEN audiobook_books_meta.reading_status != 'unstarted' THEN audiobook_books_meta.reading_status ELSE ? END,
                                queue_enabled = CASE WHEN audiobook_books_meta.queue_enabled = 1 OR ? = 1 THEN 1 ELSE 0 END
                            WHERE book_key = ?
                        `).run(
                            dup.thumb || null,
                            dup.custom_cover_url || null,
                            dup.published_year || null,
                            dup.genre || null,
                            dup.narrator || null,
                            dup.translator || null,
                            dup.real_structure_json || '',
                            dup.on_bedside_table ? 1 : 0,
                            dup.reading_status || 'unstarted',
                            dup.queue_enabled ? 1 : 0,
                            keeperKey
                        );

                        // Move chapters to keeperKey and let getAudiobookChaptersMeta merge them by chapter_index
                        db.prepare('UPDATE audiobook_chapters_meta SET book_key = ? WHERE book_key = ?').run(keeperKey, dupKey);
                        db.prepare('DELETE FROM audiobook_books_meta WHERE book_key = ?').run(dupKey);
                    }
                    getAudiobookChaptersMeta(keeperKey);
                }

                const rawKeys = db.prepare('SELECT book_key FROM audiobook_books_meta').all() as Array<{ book_key: string }>;
                for (const rk of (rawKeys || [])) {
                    if (rk.book_key) recalculateAudiobookTotals(rk.book_key);
                }

                // 3. Purge Plex author portrait thumbnails shared across multiple books by the same author
                try {
                    const allBooksForThumbs = db.prepare('SELECT book_key, title, author, thumb FROM audiobook_books_meta').all() as any[];
                    const thumbCountsByAuthor = new Map<string, Map<string, number>>();
                    for (const b of allBooksForThumbs) {
                        if (!b.thumb || !b.author) continue;
                        const aKey = b.author.toLowerCase().trim();
                        if (!thumbCountsByAuthor.has(aKey)) thumbCountsByAuthor.set(aKey, new Map());
                        const m = thumbCountsByAuthor.get(aKey)!;
                        m.set(b.thumb, (m.get(b.thumb) || 0) + 1);
                    }
                    for (const [aKey, tMap] of thumbCountsByAuthor.entries()) {
                        for (const [tUrl, cnt] of tMap.entries()) {
                            if (cnt >= 2) {
                                db.prepare('UPDATE audiobook_books_meta SET thumb = NULL, poster_url = NULL WHERE LOWER(author) = ? AND (thumb = ? OR poster_url = ?)').run(aKey, tUrl, tUrl);
                            }
                        }
                    }
                    db.prepare(`
                        UPDATE audiobook_books_meta SET thumb = NULL, poster_url = NULL
                        WHERE thumb LIKE '%11710/thumb%' OR thumb LIKE '%11297/thumb%' OR poster_url LIKE '%11710/thumb%' OR poster_url LIKE '%11297/thumb%'
                    `).run();
                } catch {}

                // 4. Background auto-healing: for books missing covers, fetch authentic iTunes book jacket covers
                setTimeout(async () => {
                    try {
                        const { fetchBestAudiobookCoverArt } = await import('@/lib/audiobookStudio');
                        const needsCover = db.prepare('SELECT book_key, title, author FROM audiobook_books_meta WHERE (thumb IS NULL OR thumb = "") AND (custom_cover_url IS NULL OR custom_cover_url = "") LIMIT 25').all() as any[];
                        for (const b of (needsCover || [])) {
                            const realCover = await fetchBestAudiobookCoverArt(b.title, b.author);
                            if (realCover) {
                                db.prepare('UPDATE audiobook_books_meta SET custom_cover_url = ?, use_custom_cover = 1, thumb = ? WHERE book_key = ?').run(realCover, realCover, b.book_key);
                            }
                        }
                    } catch {}
                }, 1500);
            } catch {}
        }
        const rows = db.prepare('SELECT * FROM audiobook_books_meta ORDER BY queue_enabled DESC, queue_priority ASC, title ASC').all() as any[];
        return (rows || []).map(mapBookRow);
    } catch (e) {
        console.error('Error fetching all audiobooks meta:', e);
        return [];
    }
};

export const getAudiobookMeta = (bookKey: string, fallbackTitle?: string, fallbackAuthor?: string): AudiobookBookMeta | null => {
    try {
        if (!bookKey) return null;
        const row = db.prepare('SELECT * FROM audiobook_books_meta WHERE book_key = ?').get(bookKey) as any;
        if (row) return mapBookRow(row);

        // Fallback: check normalized book identity so "franz kafka - metamorphosis" and "franz kafka - the metamorphosis" always resolve to the same row
        const targetId = fallbackTitle
            ? normalizeBookKeyIdentity(fallbackTitle, fallbackAuthor)
            : normalizeBookKeyIdentity(bookKey);
        const targetTitleOnly = fallbackTitle
            ? normalizeBookTitleForMatch(fallbackTitle)
            : normalizeBookTitleForMatch(bookKey.includes(' - ') ? bookKey.split(' - ').slice(1).join(' - ') : bookKey);

        if (!targetTitleOnly) return null;
        const allRows = db.prepare('SELECT * FROM audiobook_books_meta').all() as any[];
        for (const r of allRows) {
            const mapped = mapBookRow(r);
            const rowId = normalizeBookKeyIdentity(mapped.title, mapped.canonical_author || mapped.author);
            if (rowId === targetId || normalizeBookTitleForMatch(mapped.title) === targetTitleOnly) {
                return mapped;
            }
        }
        return null;
    } catch (e) {
        console.error('Error fetching audiobook meta:', e);
        return null;
    }
};

export const upsertAudiobookMeta = (meta: Partial<AudiobookBookMeta> & { book_key: string }): AudiobookBookMeta => {
    const existing = getAudiobookMeta(meta.book_key, meta.title, meta.canonical_author || meta.author);
    const effectiveBookKey = existing?.book_key || meta.book_key;
    const thumbVal = meta.thumb ?? meta.poster_url ?? existing?.thumb;
    const queueEnabled = meta.queue_enabled !== undefined ? meta.queue_enabled : (meta.is_queued !== undefined ? Boolean(meta.is_queued) : (existing?.queue_enabled ?? false));
    const queuePriority = meta.queue_priority ?? meta.queue_order ?? existing?.queue_priority ?? 100;

    const rawAuthorInput = meta.canonical_author ?? meta.author ?? existing?.canonical_author ?? existing?.author ?? 'Unknown Author';
    const rawTitleInput = meta.title ?? existing?.title ?? 'Untitled Book';
    const parsedAuthor = parseAndCanonicalizeAuthor(rawAuthorInput, rawTitleInput);
    const canonicalAuthor = parsedAuthor.canonicalAuthor || 'Unknown Author';

    const mergedReadingStatus: 'unstarted' | 'ongoing' | 'finished' =
        meta.reading_status ?? existing?.reading_status ?? 'unstarted';
    const mergedBedside =
        meta.on_bedside_table !== undefined
            ? Boolean(meta.on_bedside_table)
            : (existing?.on_bedside_table ?? (mergedReadingStatus === 'ongoing'));

    let nextScening = meta.scening_enabled !== undefined ? Boolean(meta.scening_enabled) : (existing?.scening_enabled ?? true);
    let nextIllustrate = meta.illustrate_enabled !== undefined ? Boolean(meta.illustrate_enabled) : (existing?.illustrate_enabled ?? true);
    // Dependency rule: Imaging depends on Scening! You can turn off Imaging, or turn off Scening + Imaging, but never Scening without Imaging.
    if (meta.scening_enabled === false) {
        nextIllustrate = false;
    } else if (meta.illustrate_enabled === true) {
        nextScening = true;
    }
    if (!nextScening) {
        nextIllustrate = false;
    }

    const merged: AudiobookBookMeta = {
        book_key: effectiveBookKey,
        title: rawTitleInput,
        author: canonicalAuthor,
        canonical_author: canonicalAuthor,
        translator: meta.translator !== undefined ? meta.translator : (parsedAuthor.translator ?? existing?.translator),
        narrator: meta.narrator !== undefined ? meta.narrator : (parsedAuthor.narrator ?? existing?.narrator),
        genre: meta.genre !== undefined ? meta.genre : existing?.genre,
        published_year: meta.published_year !== undefined ? meta.published_year : (parsedAuthor.year ?? existing?.published_year),
        thumb: thumbVal,
        poster_url: thumbVal,
        custom_cover_url: meta.custom_cover_url !== undefined ? meta.custom_cover_url : existing?.custom_cover_url,
        use_custom_cover: meta.use_custom_cover !== undefined ? meta.use_custom_cover : (existing?.use_custom_cover ?? false),
        real_structure_json: meta.real_structure_json !== undefined ? meta.real_structure_json : (existing?.real_structure_json ?? ''),
        library_id: meta.library_id ?? existing?.library_id,
        queue_priority: queuePriority,
        queue_order: queuePriority,
        queue_enabled: queueEnabled,
        is_queued: queueEnabled ? 1 : 0,
        transcribe_enabled: meta.transcribe_enabled ?? existing?.transcribe_enabled ?? true,
        scening_enabled: nextScening,
        illustrate_enabled: nextIllustrate,
        enhance_audio_enabled: meta.enhance_audio_enabled ?? existing?.enhance_audio_enabled ?? false,
        voice_preset: meta.voice_preset ?? existing?.voice_preset ?? 'original',
        active_personas: (() => {
            if (Array.isArray(meta.active_personas) && meta.active_personas.length > 0) return meta.active_personas;
            if (meta.active_personas_json) {
                try {
                    const parsed = JSON.parse(meta.active_personas_json);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                } catch {}
            }
            return existing?.active_personas || ['original'];
        })(),
        active_personas_json: (() => {
            if (Array.isArray(meta.active_personas) && meta.active_personas.length > 0) return JSON.stringify(meta.active_personas);
            if (meta.active_personas_json) return meta.active_personas_json;
            return JSON.stringify(existing?.active_personas || ['original']);
        })(),
        enhance_preset: meta.enhance_preset !== undefined ? meta.enhance_preset : (existing?.enhance_preset ?? ''),
        art_style: meta.art_style !== undefined ? meta.art_style : (existing?.art_style ?? ''),
        images_per_chapter: meta.images_per_chapter !== undefined ? meta.images_per_chapter : (existing?.images_per_chapter ?? 0),
        art_focus: meta.art_focus !== undefined ? meta.art_focus : (existing?.art_focus ?? ''),
        dynamic_prompt_enabled: meta.dynamic_prompt_enabled !== undefined ? meta.dynamic_prompt_enabled : (existing?.dynamic_prompt_enabled ?? true),
        custom_prompt: meta.custom_prompt !== undefined ? meta.custom_prompt : (existing?.custom_prompt ?? ''),
        total_chapters: meta.total_chapters ?? existing?.total_chapters ?? 0,
        transcribed_chapters: meta.transcribed_chapters ?? existing?.transcribed_chapters ?? 0,
        scened_chapters: meta.scened_chapters ?? existing?.scened_chapters ?? 0,
        total_scenes: meta.total_scenes ?? existing?.total_scenes ?? 0,
        illustrated_chapters: meta.illustrated_chapters ?? existing?.illustrated_chapters ?? 0,
        enhanced_chapters: meta.enhanced_chapters ?? existing?.enhanced_chapters ?? 0,
        transcribed_seconds: meta.transcribed_seconds ?? existing?.transcribed_seconds ?? 0,
        total_duration_sec: meta.total_duration_sec ?? existing?.total_duration_sec ?? 0,
        illustrated_scenes: meta.illustrated_scenes ?? existing?.illustrated_scenes ?? 0,
        summary: meta.summary !== undefined ? meta.summary : existing?.summary,
        reading_status: mergedReadingStatus,
        on_bedside_table: mergedBedside,
        progress_percent: meta.progress_percent ?? existing?.progress_percent ?? 0,
        last_played_at: meta.last_played_at !== undefined ? meta.last_played_at : existing?.last_played_at,
        status: meta.status ?? existing?.status ?? 'idle',
        updated_at: new Date().toISOString()
    };

    db.prepare(`
        INSERT INTO audiobook_books_meta (
            book_key, title, author, canonical_author, translator, narrator, genre, published_year,
            thumb, custom_cover_url, use_custom_cover, real_structure_json,
            library_id, queue_priority, queue_enabled,
            transcribe_enabled, scening_enabled, illustrate_enabled, enhance_audio_enabled, voice_preset, active_personas_json,
            enhance_preset, art_style, images_per_chapter, art_focus, dynamic_prompt_enabled, custom_prompt,
            total_chapters, transcribed_chapters, scened_chapters, total_scenes, illustrated_chapters, enhanced_chapters,
            transcribed_seconds, total_duration_sec, illustrated_scenes, summary,
            reading_status, on_bedside_table, progress_percent, last_played_at,
            status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(book_key) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            canonical_author = excluded.canonical_author,
            translator = COALESCE(excluded.translator, audiobook_books_meta.translator),
            narrator = COALESCE(excluded.narrator, audiobook_books_meta.narrator),
            genre = COALESCE(excluded.genre, audiobook_books_meta.genre),
            published_year = COALESCE(excluded.published_year, audiobook_books_meta.published_year),
            thumb = COALESCE(excluded.thumb, audiobook_books_meta.thumb),
            custom_cover_url = excluded.custom_cover_url,
            use_custom_cover = excluded.use_custom_cover,
            real_structure_json = excluded.real_structure_json,
            library_id = COALESCE(excluded.library_id, audiobook_books_meta.library_id),
            queue_priority = excluded.queue_priority,
            queue_enabled = excluded.queue_enabled,
            transcribe_enabled = excluded.transcribe_enabled,
            scening_enabled = excluded.scening_enabled,
            illustrate_enabled = excluded.illustrate_enabled,
            enhance_audio_enabled = excluded.enhance_audio_enabled,
            voice_preset = excluded.voice_preset,
            active_personas_json = excluded.active_personas_json,
            enhance_preset = excluded.enhance_preset,
            art_style = excluded.art_style,
            images_per_chapter = excluded.images_per_chapter,
            art_focus = excluded.art_focus,
            dynamic_prompt_enabled = excluded.dynamic_prompt_enabled,
            custom_prompt = excluded.custom_prompt,
            total_chapters = excluded.total_chapters,
            transcribed_chapters = excluded.transcribed_chapters,
            scened_chapters = excluded.scened_chapters,
            total_scenes = excluded.total_scenes,
            illustrated_chapters = excluded.illustrated_chapters,
            enhanced_chapters = excluded.enhanced_chapters,
            transcribed_seconds = excluded.transcribed_seconds,
            total_duration_sec = excluded.total_duration_sec,
            illustrated_scenes = excluded.illustrated_scenes,
            summary = COALESCE(NULLIF(excluded.summary, ''), audiobook_books_meta.summary),
            reading_status = excluded.reading_status,
            on_bedside_table = excluded.on_bedside_table,
            progress_percent = excluded.progress_percent,
            last_played_at = COALESCE(excluded.last_played_at, audiobook_books_meta.last_played_at),
            status = excluded.status,
            updated_at = excluded.updated_at
    `).run(
        merged.book_key,
        merged.title,
        merged.author,
        merged.canonical_author || merged.author,
        merged.translator || null,
        merged.narrator || null,
        merged.genre || null,
        merged.published_year || null,
        merged.thumb || null,
        merged.custom_cover_url || null,
        merged.use_custom_cover ? 1 : 0,
        merged.real_structure_json || '',
        merged.library_id || null,
        merged.queue_priority,
        merged.queue_enabled ? 1 : 0,
        merged.transcribe_enabled ? 1 : 0,
        merged.scening_enabled ? 1 : 0,
        merged.illustrate_enabled ? 1 : 0,
        merged.enhance_audio_enabled ? 1 : 0,
        merged.voice_preset,
        merged.active_personas_json || '["original"]',
        merged.enhance_preset || '',
        merged.art_style || '',
        merged.images_per_chapter || 0,
        merged.art_focus || '',
        merged.dynamic_prompt_enabled !== false ? 1 : 0,
        merged.custom_prompt || '',
        merged.total_chapters,
        merged.transcribed_chapters,
        merged.scened_chapters,
        merged.total_scenes,
        merged.illustrated_chapters,
        merged.enhanced_chapters,
        merged.transcribed_seconds,
        merged.total_duration_sec,
        merged.illustrated_scenes,
        merged.summary || '',
        merged.reading_status,
        merged.on_bedside_table ? 1 : 0,
        merged.progress_percent,
        merged.last_played_at || null,
        merged.status,
        merged.updated_at
    );

    return merged;
};

export interface AudiobookAuthorMeta {
    author_key: string;
    name: string;
    bio?: string;
    photo_url?: string;
    birth_date?: string;
    death_date?: string;
    source?: string;
    updated_at?: string;
}

export const getAudiobookAuthorMeta = (name: string): AudiobookAuthorMeta | null => {
    try {
        const key = name.toLowerCase().trim();
        const row = db.prepare('SELECT * FROM audiobook_authors_meta WHERE author_key = ?').get(key) as any;
        return row || null;
    } catch {
        return null;
    }
};

export const upsertAudiobookAuthorMeta = (meta: Partial<AudiobookAuthorMeta> & { name: string }): AudiobookAuthorMeta | null => {
    try {
        const key = meta.author_key || meta.name.toLowerCase().trim();
        const existing = getAudiobookAuthorMeta(meta.name);
        const merged: AudiobookAuthorMeta = {
            author_key: key,
            name: meta.name.trim(),
            bio: meta.bio !== undefined ? meta.bio : existing?.bio,
            photo_url: meta.photo_url !== undefined ? meta.photo_url : existing?.photo_url,
            birth_date: meta.birth_date !== undefined ? meta.birth_date : existing?.birth_date,
            death_date: meta.death_date !== undefined ? meta.death_date : existing?.death_date,
            source: meta.source !== undefined ? meta.source : existing?.source,
            updated_at: new Date().toISOString()
        };
        db.prepare(`
            INSERT INTO audiobook_authors_meta (author_key, name, bio, photo_url, birth_date, death_date, source, updated_at)
            VALUES (@author_key, @name, @bio, @photo_url, @birth_date, @death_date, @source, @updated_at)
            ON CONFLICT(author_key) DO UPDATE SET
                name = excluded.name,
                bio = excluded.bio,
                photo_url = excluded.photo_url,
                birth_date = excluded.birth_date,
                death_date = excluded.death_date,
                source = excluded.source,
                updated_at = excluded.updated_at
        `).run(merged);
        return merged;
    } catch (e) {
        console.error('Error upserting audiobook author meta:', e);
        return null;
    }
};

export const reorderAudiobookQueue = (orderedBookKeys: string[]) => {
    try {
        const stmt = db.prepare('UPDATE audiobook_books_meta SET queue_priority = ?, updated_at = ? WHERE book_key = ?');
        const now = new Date().toISOString();
        const tx = db.transaction((keys: string[]) => {
            keys.forEach((key, idx) => {
                stmt.run(idx + 1, now, key);
            });
        });
        tx(orderedBookKeys);
        return true;
    } catch (e) {
        console.error('Error reordering audiobook queue:', e);
        return false;
    }
};

export const getAudiobookChaptersMeta = (bookKey: string): AudiobookChapterMeta[] => {
    try {
        const canonicalBook = getAudiobookMeta(bookKey);
        const effectiveBookKey = canonicalBook?.book_key || bookKey;
        if (effectiveBookKey !== bookKey) {
            try {
                db.prepare('UPDATE audiobook_chapters_meta SET book_key = ? WHERE book_key = ?').run(effectiveBookKey, bookKey);
            } catch {}
        }

        const rows = db.prepare('SELECT * FROM audiobook_chapters_meta WHERE book_key = ? ORDER BY chapter_index ASC').all(effectiveBookKey) as any[];
        const mapped = (rows || []).map(mapChapterRow);
        if (mapped.length <= 1) return mapped;

        // Deduplicate chapters that represent the same audio track (by chapter_index when > 0, or file_path)
        const canonicalByTrack = new Map<string, AudiobookChapterMeta>();
        const duplicateKeysToDelete: string[] = [];

        for (const ch of mapped) {
            const normFile = (ch.file_path || '').trim().toLowerCase();
            const normTitle = (ch.title || '').trim().toLowerCase();
            const canonicalKey = ch.chapter_index > 0
                ? `idx:${ch.chapter_index}`
                : normFile
                    ? `file:${normFile}`
                    : `title:${normTitle}`;

            const existing = canonicalByTrack.get(canonicalKey);
            if (!existing) {
                canonicalByTrack.set(canonicalKey, ch);
            } else {
                const curIsPlex = /^plex[-_]\d+/i.test(ch.chapter_key);
                const existIsPlex = /^plex[-_]\d+/i.test(existing.chapter_key);
                const preferCurrent = curIsPlex && !existIsPlex
                    ? true
                    : (!existIsPlex && ch.chapter_key.includes('::ch') && !existing.chapter_key.includes('::ch'));
                const keeper = preferCurrent ? ch : existing;
                const donor = preferCurrent ? existing : ch;

                // Merge images without duplicates
                const combinedImages = [...(keeper.images || [])];
                for (const img of (donor.images || [])) {
                    const isDup = combinedImages.some(
                        k => (img?.url && k.url === img.url) || (!img?.url && !k.url && k.startSec === img?.startSec && k.sceneTitle === img?.sceneTitle)
                    );
                    if (!isDup) {
                        combinedImages.push(img);
                    }
                }
                keeper.images = combinedImages;
                if (combinedImages.some(i => i.kept !== false && i.url) && keeper.illustration_status !== 'completed') {
                    keeper.illustration_status = 'completed';
                    keeper.illustration_progress = 100;
                }
                if (!keeper.synced_lyrics && donor.synced_lyrics) {
                    keeper.synced_lyrics = donor.synced_lyrics;
                    keeper.plain_transcript = keeper.plain_transcript || donor.plain_transcript;
                    keeper.transcription_status = donor.transcription_status;
                    keeper.transcription_progress = donor.transcription_progress;
                    keeper.transcribed_seconds = Math.max(keeper.transcribed_seconds || 0, donor.transcribed_seconds || 0);
                }
                if (!keeper.enhanced_audio_path && donor.enhanced_audio_path) {
                    keeper.enhanced_audio_path = donor.enhanced_audio_path;
                    keeper.audio_enhance_status = donor.audio_enhance_status;
                    keeper.audio_enhance_progress = donor.audio_enhance_progress;
                }
                if (!keeper.file_path && donor.file_path) {
                    keeper.file_path = donor.file_path;
                }
                // Preserve real probed/Plex duration over 300s fallback
                if ((keeper.duration_sec === 300 || !keeper.duration_sec || keeper.duration_sec <= 0) && donor.duration_sec && donor.duration_sec > 0) {
                    keeper.duration_sec = donor.duration_sec;
                } else if (donor.duration_sec && donor.duration_sec !== 300 && donor.duration_sec > (keeper.duration_sec || 0)) {
                    keeper.duration_sec = donor.duration_sec;
                }

                canonicalByTrack.set(canonicalKey, keeper);
                duplicateKeysToDelete.push(donor.chapter_key);
            }
        }

        if (duplicateKeysToDelete.length > 0) {
            try {
                const delStmt = db.prepare('DELETE FROM audiobook_chapters_meta WHERE chapter_key = ?');
                for (const dk of duplicateKeysToDelete) {
                    delStmt.run(dk);
                }
                for (const kept of canonicalByTrack.values()) {
                    db.prepare(`
                        UPDATE audiobook_chapters_meta SET
                            file_path = COALESCE(?, file_path),
                            images_json = ?,
                            illustration_status = ?,
                            illustration_progress = ?,
                            synced_lyrics = ?,
                            plain_transcript = ?,
                            transcription_status = ?,
                            transcription_progress = ?,
                            transcribed_seconds = ?,
                            enhanced_audio_path = ?,
                            audio_enhance_status = ?,
                            audio_enhance_progress = ?,
                            duration_sec = ?
                        WHERE chapter_key = ?
                    `).run(
                        kept.file_path || null,
                        JSON.stringify(kept.images || []),
                        kept.illustration_status,
                        kept.illustration_progress,
                        kept.synced_lyrics || null,
                        kept.plain_transcript || null,
                        kept.transcription_status,
                        kept.transcription_progress,
                        kept.transcribed_seconds || 0,
                        kept.enhanced_audio_path || null,
                        kept.audio_enhance_status,
                        kept.audio_enhance_progress,
                        kept.duration_sec || 0,
                        kept.chapter_key
                    );
                }
            } catch {}
        }

        return Array.from(canonicalByTrack.values()).sort((a, b) => a.chapter_index - b.chapter_index);
    } catch (e) {
        console.error('Error fetching audiobook chapters meta:', e);
        return [];
    }
};

export const getAudiobookChapterMeta = (chapterKey: string, fallbackBookKey?: string, fallbackChapterIndex?: number): AudiobookChapterMeta | null => {
    try {
        if (!chapterKey) return null;
        const row = db.prepare('SELECT * FROM audiobook_chapters_meta WHERE chapter_key = ?').get(chapterKey) as any;
        if (row) return mapChapterRow(row);

        // Fallback 1: Match trailing Plex numeric ratingKey (e.g. "plex-1-12191" <-> "plex-12191")
        const plexMatch = chapterKey.match(/^plex[-_](?:[^-_]+[-_])?(\d+)$/i);
        if (plexMatch) {
            const ratingKey = plexMatch[1];
            const byPlex = db.prepare(
                'SELECT * FROM audiobook_chapters_meta WHERE chapter_key = ? OR chapter_key LIKE ?'
            ).get(`plex-${ratingKey}`, `plex-%-${ratingKey}`) as any;
            if (byPlex) return mapChapterRow(byPlex);
        }

        // Fallback 2: Parse "bookKey::chN" or "bookKey_ch_N"
        const matchCh = chapterKey.match(/^(.+?)(?:::ch|_ch_|::ch-)(\d+)$/i);
        const targetBookPart = fallbackBookKey || (matchCh ? matchCh[1] : '');
        const targetIdx = fallbackChapterIndex ?? (matchCh ? parseInt(matchCh[2], 10) : 0);

        if (targetBookPart && targetIdx > 0) {
            const canonicalBook = getAudiobookMeta(targetBookPart);
            const effBookKey = canonicalBook?.book_key || targetBookPart;
            const byIdx = db.prepare('SELECT * FROM audiobook_chapters_meta WHERE book_key = ? AND chapter_index = ?').get(effBookKey, targetIdx) as any;
            if (byIdx) return mapChapterRow(byIdx);
        }
        return null;
    } catch (e) {
        console.error('Error fetching audiobook chapter meta:', e);
        return null;
    }
};

export const upsertAudiobookChapterMeta = (meta: Partial<AudiobookChapterMeta> & { chapter_key: string; book_key: string }): AudiobookChapterMeta => {
    const canonicalBook = getAudiobookMeta(meta.book_key);
    const effectiveBookKey = canonicalBook?.book_key || meta.book_key;
    const existing = getAudiobookChapterMeta(meta.chapter_key, effectiveBookKey, meta.chapter_index);
    const effectiveChapterKey = existing?.chapter_key || meta.chapter_key;

    const mergedVoices: Record<string, string> = {
        ...(existing?.processed_voices || {}),
        ...(meta.processed_voices || {})
    };
    const mergedVoicePreset = meta.voice_preset ?? existing?.voice_preset ?? 'original';
    const mergedEnhancedPath = meta.enhanced_audio_path !== undefined ? meta.enhanced_audio_path : existing?.enhanced_audio_path;
    if (mergedEnhancedPath && mergedVoicePreset && mergedVoicePreset !== 'original') {
        mergedVoices[mergedVoicePreset] = mergedEnhancedPath;
    }

    const incomingDur = meta.duration_sec ?? 0;
    const prevDur = existing?.duration_sec ?? 0;
    const durationSec = (incomingDur > 0 && incomingDur !== 300)
        ? incomingDur
        : (prevDur > 0 ? prevDur : incomingDur);

    const tStatus = meta.transcription_status ?? existing?.transcription_status ?? 'idle';
    const tProgress = meta.transcription_progress ?? existing?.transcription_progress ?? 0;
    const transcribedSec =
        meta.transcribed_seconds !== undefined
            ? meta.transcribed_seconds
            : tStatus === 'completed' && durationSec > 0
                ? durationSec
                : existing?.transcribed_seconds ?? 0;

    const merged: AudiobookChapterMeta = {
        chapter_key: effectiveChapterKey,
        book_key: effectiveBookKey,
        chapter_index: meta.chapter_index ?? existing?.chapter_index ?? 0,
        title: (existing?.title && existing.title.length > (meta.title || '').length && !/^(chapter\s+\d+|i+|v|x+)$/i.test(existing.title))
            ? existing.title
            : (meta.title ?? existing?.title ?? 'Chapter'),
        file_path: meta.file_path || existing?.file_path,
        duration_sec: durationSec,
        transcribed_seconds: transcribedSec,
        transcription_status: tStatus,
        transcription_progress: tProgress,
        synced_lyrics: meta.synced_lyrics !== undefined ? meta.synced_lyrics : existing?.synced_lyrics,
        plain_transcript: meta.plain_transcript !== undefined ? meta.plain_transcript : existing?.plain_transcript,
        transcript_lrc_path: meta.transcript_lrc_path !== undefined ? meta.transcript_lrc_path : existing?.transcript_lrc_path,
        transcript_txt_path: meta.transcript_txt_path !== undefined ? meta.transcript_txt_path : existing?.transcript_txt_path,
        illustration_status: meta.illustration_status ?? existing?.illustration_status ?? 'idle',
        illustration_progress: meta.illustration_progress ?? existing?.illustration_progress ?? 0,
        images: meta.images ?? existing?.images ?? [],
        audio_enhance_status: meta.audio_enhance_status ?? existing?.audio_enhance_status ?? 'idle',
        audio_enhance_progress: meta.audio_enhance_progress ?? existing?.audio_enhance_progress ?? 0,
        enhanced_audio_path: mergedEnhancedPath,
        voice_preset: mergedVoicePreset,
        processed_voices: mergedVoices,
        error_message: meta.error_message !== undefined ? meta.error_message : existing?.error_message,
        updated_at: new Date().toISOString()
    };

    db.prepare(`
        INSERT INTO audiobook_chapters_meta (
            chapter_key, book_key, chapter_index, title, file_path, duration_sec, transcribed_seconds,
            transcription_status, transcription_progress, synced_lyrics, plain_transcript,
            transcript_lrc_path, transcript_txt_path,
            illustration_status, illustration_progress, images_json,
            audio_enhance_status, audio_enhance_progress, enhanced_audio_path,
            voice_preset, processed_voices_json, error_message, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chapter_key) DO UPDATE SET
            book_key = excluded.book_key,
            chapter_index = excluded.chapter_index,
            title = excluded.title,
            file_path = COALESCE(excluded.file_path, audiobook_chapters_meta.file_path),
            duration_sec = CASE WHEN excluded.duration_sec > 0 AND excluded.duration_sec != 300 THEN excluded.duration_sec WHEN audiobook_chapters_meta.duration_sec > 0 THEN audiobook_chapters_meta.duration_sec ELSE excluded.duration_sec END,
            transcribed_seconds = excluded.transcribed_seconds,
            transcription_status = excluded.transcription_status,
            transcription_progress = excluded.transcription_progress,
            synced_lyrics = excluded.synced_lyrics,
            plain_transcript = excluded.plain_transcript,
            transcript_lrc_path = excluded.transcript_lrc_path,
            transcript_txt_path = excluded.transcript_txt_path,
            illustration_status = excluded.illustration_status,
            illustration_progress = excluded.illustration_progress,
            images_json = excluded.images_json,
            audio_enhance_status = excluded.audio_enhance_status,
            audio_enhance_progress = excluded.audio_enhance_progress,
            enhanced_audio_path = excluded.enhanced_audio_path,
            voice_preset = excluded.voice_preset,
            processed_voices_json = excluded.processed_voices_json,
            error_message = excluded.error_message,
            updated_at = excluded.updated_at
    `).run(
        merged.chapter_key,
        merged.book_key,
        merged.chapter_index,
        merged.title,
        merged.file_path || null,
        merged.duration_sec,
        merged.transcribed_seconds,
        merged.transcription_status,
        merged.transcription_progress,
        merged.synced_lyrics || null,
        merged.plain_transcript || null,
        merged.transcript_lrc_path || null,
        merged.transcript_txt_path || null,
        merged.illustration_status,
        merged.illustration_progress,
        JSON.stringify(merged.images || []),
        merged.audio_enhance_status,
        merged.audio_enhance_progress,
        merged.enhanced_audio_path || null,
        merged.voice_preset,
        JSON.stringify(merged.processed_voices || {}),
        merged.error_message || null,
        merged.updated_at
    );

    recalculateAudiobookTotals(merged.book_key);
    return merged;
};

export const resetAudiobookAssetsInDb = (
    bookKey: string,
    chapterKey?: string,
    target: 'transcriptions' | 'art' | 'voices' | 'all' = 'all'
) => {
    try {
        const chapters = chapterKey
            ? [getAudiobookChapterMeta(chapterKey)].filter((c): c is AudiobookChapterMeta => Boolean(c))
            : getAudiobookChaptersMeta(bookKey);

        const now = new Date().toISOString();
        for (const ch of chapters) {
            if (target === 'transcriptions' || target === 'all') {
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        transcription_status = 'idle',
                        transcription_progress = 0,
                        transcribed_seconds = 0,
                        synced_lyrics = NULL,
                        synced_transcript = NULL,
                        plain_transcript = NULL,
                        transcript_lrc_path = NULL,
                        transcript_txt_path = NULL,
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(now, ch.chapter_key);
                if (ch.file_path) {
                    try { db.prepare('DELETE FROM music_lyrics WHERE file_path = ?').run(ch.file_path); } catch {}
                }
            }
            if (target === 'art' || target === 'all') {
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        illustration_status = 'idle',
                        illustration_progress = 0,
                        images_json = '[]',
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(now, ch.chapter_key);
            }
            if (target === 'voices' || target === 'all') {
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        audio_enhance_status = 'idle',
                        audio_enhance_progress = 0,
                        enhanced_audio_path = NULL,
                        enhanced_file_path = NULL,
                        voice_preset = 'original',
                        processed_voices_json = '{}',
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(now, ch.chapter_key);
            }
        }

        if (!chapterKey && (target === 'art' || target === 'all')) {
            db.prepare(`
                UPDATE audiobook_books_meta SET
                    custom_cover_url = NULL,
                    use_custom_cover = 0,
                    real_structure_json = CASE WHEN ? = 'all' THEN NULL ELSE real_structure_json END,
                    updated_at = ?
                WHERE book_key = ?
            `).run(target, now, bookKey);
        }

        recalculateAudiobookTotals(bookKey);
        return chapters;
    } catch (e) {
        console.error('Error resetting audiobook assets in db:', e);
        return [];
    }
};

export const recalculateAudiobookTotals = (bookKey: string) => {
    try {
        const chapters = getAudiobookChaptersMeta(bookKey);
        if (chapters.length === 0) {
            db.prepare(`
                UPDATE audiobook_books_meta SET
                    transcribed_chapters = 0,
                    scened_chapters = 0,
                    total_scenes = 0,
                    illustrated_chapters = 0,
                    enhanced_chapters = 0,
                    transcribed_seconds = 0,
                    illustrated_scenes = 0,
                    updated_at = ?
                WHERE book_key = ?
            `).run(new Date().toISOString(), bookKey);
            return;
        }
        const transcribed = chapters.filter(c => c.transcription_status === 'completed' && c.synced_lyrics && c.synced_lyrics.trim().length > 20).length;
        const scened = chapters.filter(c => (c.images || []).some(img => img.kept !== false && (img.sceneTitle || img.prompt))).length;
        const totalScenes = chapters.reduce((acc, c) => acc + (c.images || []).filter(img => img.kept !== false && (img.sceneTitle || img.prompt || img.url)).length, 0);
        const illustrated = chapters.filter(c => (c.images || []).some(img => img.kept !== false && img.url && !String(img.url).toLowerCase().includes('.svg'))).length;
        const enhanced = chapters.filter(c => c.audio_enhance_status === 'completed').length;
        const totalDurationSec = chapters.reduce((acc, c) => acc + (Number(c.duration_sec) || 0), 0);
        const transcribedSeconds = chapters.reduce((acc, c) => {
            if (c.transcription_status === 'completed') {
                return acc + Math.max(Number(c.transcribed_seconds) || 0, Number(c.duration_sec) || 0);
            }
            if (c.transcription_status === 'processing') {
                return acc + (Number(c.transcribed_seconds) || Math.round(((Number(c.duration_sec) || 0) * (Number(c.transcription_progress) || 0)) / 100));
            }
            return acc;
        }, 0);
        const illustratedScenes = chapters.reduce((acc, c) => acc + (c.images || []).filter(img => img.kept !== false && img.url && !String(img.url).toLowerCase().includes('.svg')).length, 0);

        const isProcessing = chapters.some(c =>
            c.transcription_status === 'processing' ||
            c.illustration_status === 'processing' ||
            c.audio_enhance_status === 'processing'
        );

        const book = getAudiobookMeta(bookKey);
        if (!book) return;

        let newStatus = book.status;
        const targetTranscribed = !book.transcribe_enabled || transcribed >= chapters.length;
        const targetScened = !book.scening_enabled || scened >= chapters.length;
        const targetIllustrated = !book.illustrate_enabled || illustrated >= chapters.length;
        const targetEnhanced = !book.enhance_audio_enabled || enhanced >= chapters.length;

        if (isProcessing) {
            newStatus = 'processing';
        } else if (targetTranscribed && targetScened && targetIllustrated && targetEnhanced && chapters.length > 0) {
            newStatus = 'completed';
        } else if (book.queue_enabled) {
            newStatus = 'queued';
        } else {
            newStatus = 'idle';
        }

        db.prepare(`
            UPDATE audiobook_books_meta SET
                total_chapters = ?,
                transcribed_chapters = ?,
                scened_chapters = ?,
                total_scenes = ?,
                illustrated_chapters = ?,
                enhanced_chapters = ?,
                transcribed_seconds = ?,
                total_duration_sec = ?,
                illustrated_scenes = ?,
                status = ?,
                updated_at = ?
            WHERE book_key = ?
        `).run(
            chapters.length,
            transcribed,
            scened,
            totalScenes,
            illustrated,
            enhanced,
            transcribedSeconds,
            totalDurationSec,
            illustratedScenes,
            newStatus,
            new Date().toISOString(),
            bookKey
        );
    } catch (e) {
        console.error('Error recalculating audiobook totals:', e);
    }
};

export const getRecentAudiobookActivity = (limit: number = 100) => {
    try {
        const rows = db.prepare(`
            SELECT c.*, b.title as book_title, b.author as book_author, b.thumb as book_thumb, b.custom_cover_url as book_custom_cover_url, b.use_custom_cover as book_use_custom_cover
            FROM audiobook_chapters_meta c
            LEFT JOIN audiobook_books_meta b ON c.book_key = b.book_key
            WHERE c.transcription_status = 'completed'
               OR c.illustration_status = 'completed'
               OR c.audio_enhance_status = 'completed'
               OR c.transcription_status = 'processing'
               OR c.illustration_status = 'processing'
            ORDER BY c.updated_at DESC
            LIMIT ?
        `).all(limit) as any[];
        return rows || [];
    } catch (e) {
        console.error('Error getting recent audiobook activity:', e);
        return [];
    }
};

export interface SystemLogEntry {
    id: string;
    timestamp: string;
    category: string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

const gLogs = globalThis as unknown as {
    __schedulearrSystemLogs?: SystemLogEntry[];
};

export const logSystemEvent = (
    category: string,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info'
) => {
    try {
        if (!gLogs.__schedulearrSystemLogs) {
            gLogs.__schedulearrSystemLogs = [];
        }
        const entry: SystemLogEntry = {
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
            category,
            level,
            message
        };
        gLogs.__schedulearrSystemLogs.unshift(entry);
        if (gLogs.__schedulearrSystemLogs.length > 250) {
            gLogs.__schedulearrSystemLogs.length = 250;
        }
        const prefix = `[${entry.timestamp}] [${category}]`;
        if (level === 'error') {
            console.error(`${prefix} ❌ ${message}`);
        } else if (level === 'warn') {
            console.warn(`${prefix} ⚠️ ${message}`);
        } else {
            console.log(`${prefix} ℹ️ ${message}`);
        }
    } catch {}
};

export const getSystemLogs = (limit: number = 50): SystemLogEntry[] => {
    if (!gLogs.__schedulearrSystemLogs) return [];
    return gLogs.__schedulearrSystemLogs.slice(0, limit);
};

export const purgeAllGeneratedAudiobookDataInDb = (): { booksReset: number; chaptersDeleted: number } => {
    try {
        const now = new Date().toISOString();
        const chRes = db.prepare(`
            UPDATE audiobook_chapters_meta SET
                transcription_status = 'idle',
                transcription_progress = 0,
                transcribed_seconds = 0,
                synced_lyrics = NULL,
                synced_transcript = NULL,
                plain_transcript = NULL,
                transcript_lrc_path = NULL,
                transcript_txt_path = NULL,
                illustration_status = 'idle',
                illustration_progress = 0,
                images_json = '[]',
                audio_enhance_status = 'idle',
                audio_enhance_progress = 0,
                enhanced_audio_path = NULL,
                enhanced_file_path = NULL,
                voice_preset = 'original',
                processed_voices_json = '{}',
                error_message = NULL,
                updated_at = ?
        `).run(now);

        const bkRes = db.prepare(`
            UPDATE audiobook_books_meta SET
                transcribed_chapters = 0,
                scened_chapters = 0,
                total_scenes = 0,
                illustrated_chapters = 0,
                enhanced_chapters = 0,
                transcribed_seconds = 0,
                illustrated_scenes = 0,
                custom_cover_url = NULL,
                use_custom_cover = 0,
                real_structure_json = '',
                queue_enabled = 0,
                status = 'idle',
                updated_at = ?
        `).run(now);

        try {
            db.prepare("DELETE FROM music_lyrics WHERE source = 'audiobook-studio'").run();
        } catch {}

        return {
            booksReset: Number(bkRes?.changes || 0),
            chaptersDeleted: Number(chRes?.changes || 0)
        };
    } catch (e) {
        console.error('Error purging all generated audiobook data in DB:', e);
        return { booksReset: 0, chaptersDeleted: 0 };
    }
};

export interface AiApiUsageEventRecord {
    id?: number;
    timestamp: string;
    provider: string;
    provider_label: string;
    key_id?: string;
    task_type: string;
    success: boolean | number;
    rate_limited?: boolean | number;
    images_count?: number;
    audio_seconds?: number;
    tokens_estimated?: number;
    latency_ms?: number;
    book_title?: string;
    chapter_title?: string;
    error_message?: string;
    detail?: string;
}

export const logAiApiUsageEvent = (evt: Omit<AiApiUsageEventRecord, 'id' | 'timestamp'> & { timestamp?: string }) => {
    try {
        const ts = evt.timestamp || new Date().toISOString();
        const detailStr = evt.detail || evt.error_message || evt.chapter_title || null;
        db.prepare(`
            INSERT INTO ai_api_usage_events (
                timestamp, provider, provider_label, key_id, task_type,
                success, rate_limited, images_count, audio_seconds,
                tokens_estimated, latency_ms, book_title, detail
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            ts,
            evt.provider || 'unknown',
            evt.provider_label || evt.provider || 'Unknown Provider',
            evt.key_id || null,
            evt.task_type || 'other',
            evt.success ? 1 : 0,
            evt.rate_limited ? 1 : 0,
            Number(evt.images_count || 0),
            Number(evt.audio_seconds || 0),
            Number(evt.tokens_estimated || 0),
            Number(evt.latency_ms || 0),
            evt.book_title || null,
            detailStr
        );
    } catch (e) {
        console.warn('Error logging AI API usage event:', e);
    }
};

export const getAiApiUsageEvents = (sinceIso?: string, limit: number = 5000): AiApiUsageEventRecord[] => {
    try {
        const rows = sinceIso
            ? (db.prepare('SELECT * FROM ai_api_usage_events WHERE timestamp >= ? ORDER BY timestamp ASC LIMIT ?').all(sinceIso, limit) as any[])
            : (db.prepare('SELECT * FROM ai_api_usage_events ORDER BY timestamp ASC LIMIT ?').all(limit) as any[]);
        return (rows || []).map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            provider: r.provider,
            provider_label: r.provider_label,
            key_id: r.key_id || undefined,
            task_type: r.task_type,
            success: Boolean(r.success),
            rate_limited: Boolean(r.rate_limited),
            images_count: Number(r.images_count || 0),
            audio_seconds: Number(r.audio_seconds || 0),
            tokens_estimated: Number(r.tokens_estimated || 0),
            latency_ms: Number(r.latency_ms || 0),
            book_title: r.book_title || undefined,
            detail: r.detail || undefined
        }));
    } catch {
        return [];
    }
};

export const getAiApiUsageTimeSeries = (range: '24h' | '7d' | '30d' | 'all' = '24h', providerFilter?: string) => {
    try {
        const now = Date.now();
        const sinceIso =
            range === '24h'
                ? new Date(now - 24 * 3600 * 1000).toISOString()
                : range === '7d'
                ? new Date(now - 7 * 24 * 3600 * 1000).toISOString()
                : range === '30d'
                ? new Date(now - 30 * 24 * 3600 * 1000).toISOString()
                : '1970-01-01T00:00:00.000Z';

        const bucketExpr = range === '24h' ? "substr(timestamp, 1, 13) || ':00'" : 'substr(timestamp, 1, 10)';
        const hasProviderFilter = Boolean(providerFilter && providerFilter !== 'all');
        const whereClause = hasProviderFilter ? 'WHERE timestamp >= ? AND provider = ?' : 'WHERE timestamp >= ?';
        const queryArgs = hasProviderFilter ? [sinceIso, providerFilter!] : [sinceIso];

        const bucketRows = db
            .prepare(
                `
            SELECT
                ${bucketExpr} as bucket,
                COUNT(*) as requests,
                SUM(COALESCE(images_count, 0)) as images_generated,
                SUM(COALESCE(audio_seconds, 0)) as audio_seconds,
                SUM(COALESCE(tokens_estimated, 0)) as tokens_used,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors
            FROM ai_api_usage_events
            ${whereClause}
            GROUP BY bucket
            ORDER BY bucket ASC
        `
            )
            .all(...queryArgs) as any[];

        // Compute per-minute request and token peaks within each bucket
        const minutePeakRows = db
            .prepare(
                `
            SELECT
                bucket,
                MAX(req_per_min) as peak_rpm,
                MAX(tok_per_min) as peak_tpm
            FROM (
                SELECT
                    ${bucketExpr} as bucket,
                    substr(timestamp, 1, 16) as minute_key,
                    COUNT(*) as req_per_min,
                    SUM(COALESCE(tokens_estimated, 0)) as tok_per_min
                FROM ai_api_usage_events
                ${whereClause}
                GROUP BY bucket, minute_key
            )
            GROUP BY bucket
        `
            )
            .all(...queryArgs) as any[];
        const minutePeakMap = new Map<string, { peakRpm: number; peakTpm: number }>();
        for (const mp of minutePeakRows || []) {
            minutePeakMap.set(String(mp.bucket || ''), {
                peakRpm: Number(mp.peak_rpm || 0),
                peakTpm: Number(mp.peak_tpm || 0)
            });
        }

        // Compute daily request totals for RPD trend
        const dayPeakRows = db
            .prepare(
                `
            SELECT
                substr(timestamp, 1, 10) as day_key,
                COUNT(*) as req_per_day
            FROM ai_api_usage_events
            ${whereClause}
            GROUP BY day_key
        `
            )
            .all(...queryArgs) as any[];
        const dayPeakMap = new Map<string, number>();
        for (const dp of dayPeakRows || []) {
            dayPeakMap.set(String(dp.day_key || ''), Number(dp.req_per_day || 0));
        }

        // Live rolling 60-second RPM & TPM
        const oneMinAgoIso = new Date(now - 60 * 1000).toISOString();
        const liveMinRow = db
            .prepare(
                `
            SELECT
                COUNT(*) as rpm_now,
                SUM(COALESCE(tokens_estimated, 0)) as tpm_now
            FROM ai_api_usage_events
            WHERE timestamp >= ?
        `
            )
            .get(oneMinAgoIso) as any;

        const byProviderRows = db
            .prepare(
                `
            SELECT
                provider,
                COUNT(*) as requests,
                SUM(COALESCE(images_count, 0)) as images_generated,
                SUM(COALESCE(audio_seconds, 0)) as audio_seconds,
                SUM(COALESCE(tokens_estimated, 0)) as tokens_used,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN rate_limited = 1 THEN 1 ELSE 0 END) as rate_limited
            FROM ai_api_usage_events
            WHERE timestamp >= ?
            GROUP BY provider
        `
            )
            .all(sinceIso) as any[];

        // Also compute per-provider peak RPM / TPM / RPD
        const providerMinutePeaks = db
            .prepare(
                `
            SELECT
                provider,
                MAX(req_per_min) as peak_rpm,
                MAX(tok_per_min) as peak_tpm
            FROM (
                SELECT
                    provider,
                    substr(timestamp, 1, 16) as minute_key,
                    COUNT(*) as req_per_min,
                    SUM(COALESCE(tokens_estimated, 0)) as tok_per_min
                FROM ai_api_usage_events
                WHERE timestamp >= ?
                GROUP BY provider, minute_key
            )
            GROUP BY provider
        `
            )
            .all(sinceIso) as any[];
        const provPeakMap = new Map<string, { peakRpm: number; peakTpm: number }>();
        for (const pp of providerMinutePeaks || []) {
            provPeakMap.set(String(pp.provider || ''), {
                peakRpm: Number(pp.peak_rpm || 0),
                peakTpm: Number(pp.peak_tpm || 0)
            });
        }

        const recentEvents = getAiApiUsageEvents(sinceIso, 50).reverse();

        const buckets = (bucketRows || []).map(r => {
            const bKey = String(r.bucket || '');
            const dayKey = bKey.slice(0, 10);
            const mp = minutePeakMap.get(bKey) || { peakRpm: 0, peakTpm: 0 };
            const peakRpd = dayPeakMap.get(dayKey) || Number(r.requests || 0);
            return {
                bucket: bKey,
                requests: Number(r.requests || 0),
                imagesGenerated: Number(r.images_generated || 0),
                audioSeconds: Number(r.audio_seconds || 0),
                audioHours: Number((Number(r.audio_seconds || 0) / 3600).toFixed(2)),
                tokensUsed: Number(r.tokens_used || 0),
                errors: Number(r.errors || 0),
                peakRpm: mp.peakRpm,
                peakTpm: mp.peakTpm,
                peakRpd
            };
        });

        const totalRequests = buckets.reduce((a, b) => a + b.requests, 0);
        const totalImages = buckets.reduce((a, b) => a + b.imagesGenerated, 0);
        const totalAudioSeconds = buckets.reduce((a, b) => a + b.audioSeconds, 0);
        const totalAudioHours = Number((totalAudioSeconds / 3600).toFixed(2));
        const totalTokens = buckets.reduce((a, b) => a + b.tokensUsed, 0);
        const totalErrors = buckets.reduce((a, b) => a + b.errors, 0);
        const maxPeakRpm = buckets.reduce((m, b) => Math.max(m, b.peakRpm || 0), 0);
        const maxPeakTpm = buckets.reduce((m, b) => Math.max(m, b.peakTpm || 0), 0);
        const maxPeakRpd = buckets.reduce((m, b) => Math.max(m, b.peakRpd || 0), 0);

        const enrichedByProvider = (byProviderRows || []).map((r: any) => {
            const pk = provPeakMap.get(String(r.provider || '')) || { peakRpm: 0, peakTpm: 0 };
            return {
                ...r,
                peak_rpm: pk.peakRpm,
                peak_tpm: pk.peakTpm
            };
        });

        return {
            buckets,
            byProvider: enrichedByProvider,
            recentEvents,
            totals: {
                totalRequests,
                totalImages,
                totalAudioSeconds,
                totalAudioHours,
                totalTokens,
                totalErrors,
                maxPeakRpm,
                maxPeakTpm,
                maxPeakRpd,
                currentRpm: Number(liveMinRow?.rpm_now || 0),
                currentTpm: Number(liveMinRow?.tpm_now || 0)
            }
        };
    } catch (e) {
        console.warn('Error computing AI API usage time series:', e);
        return {
            buckets: [],
            byProvider: [],
            recentEvents: [],
            totals: {
                totalRequests: 0,
                totalImages: 0,
                totalAudioSeconds: 0,
                totalAudioHours: 0,
                totalTokens: 0,
                totalErrors: 0,
                maxPeakRpm: 0,
                maxPeakTpm: 0,
                maxPeakRpd: 0,
                currentRpm: 0,
                currentTpm: 0
            }
        };
    }
};

export type GranularAiCleanupTarget = 'images' | 'scenes' | 'transcripts' | 'voices' | 'api_history' | 'all';

export const cleanGeneratedAudiobookDataInDb = (options: {
    target: GranularAiCleanupTarget;
    bookKey?: string;
}): { booksUpdated: number; chaptersUpdated: number; eventsCleared: number } => {
    const now = new Date().toISOString();
    const { target, bookKey } = options;
    let booksUpdated = 0;
    let chaptersUpdated = 0;
    let eventsCleared = 0;

    try {
        if (target === 'api_history') {
            const res = db.prepare('DELETE FROM ai_api_usage_events').run();
            return { booksUpdated: 0, chaptersUpdated: 0, eventsCleared: Number(res?.changes || 0) };
        }

        if (target === 'all' && !bookKey) {
            const res = purgeAllGeneratedAudiobookDataInDb();
            const evRes = db.prepare('DELETE FROM ai_api_usage_events').run();
            return {
                booksUpdated: res.booksReset,
                chaptersUpdated: res.chaptersDeleted,
                eventsCleared: Number(evRes?.changes || 0)
            };
        }

        const chapters = bookKey
            ? (db.prepare('SELECT * FROM audiobook_chapters_meta WHERE book_key = ?').all(bookKey) as any[])
            : (db.prepare('SELECT * FROM audiobook_chapters_meta').all() as any[]);

        const affectedBookKeys = new Set<string>();
        if (bookKey) affectedBookKeys.add(bookKey);

        for (const ch of chapters) {
            affectedBookKeys.add(ch.book_key);
            if (target === 'images') {
                // Keep scene timestamps & prompts, strip generated image URLs
                let nextImagesJson = '[]';
                try {
                    const parsed = JSON.parse(ch.images_json || '[]');
                    if (Array.isArray(parsed)) {
                        nextImagesJson = JSON.stringify(
                            parsed.map((sc: any) => ({
                                ...sc,
                                url: ''
                            }))
                        );
                    }
                } catch {}
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        illustration_status = 'idle',
                        illustration_progress = 0,
                        images_json = ?,
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(nextImagesJson, now, ch.chapter_key);
                chaptersUpdated++;
            } else if (target === 'scenes') {
                // Wipe both scenes and images, keep transcripts intact
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        illustration_status = 'idle',
                        illustration_progress = 0,
                        images_json = '[]',
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(now, ch.chapter_key);
                chaptersUpdated++;
            } else if (target === 'transcripts') {
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        transcription_status = 'idle',
                        transcription_progress = 0,
                        transcribed_seconds = 0,
                        synced_lyrics = NULL,
                        synced_transcript = NULL,
                        plain_transcript = NULL,
                        transcript_lrc_path = NULL,
                        transcript_txt_path = NULL,
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(now, ch.chapter_key);
                chaptersUpdated++;
            } else if (target === 'voices') {
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        audio_enhance_status = 'idle',
                        audio_enhance_progress = 0,
                        enhanced_audio_path = NULL,
                        enhanced_file_path = NULL,
                        voice_preset = 'original',
                        processed_voices_json = '{}',
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(now, ch.chapter_key);
                chaptersUpdated++;
            } else if (target === 'all') {
                db.prepare(`
                    UPDATE audiobook_chapters_meta SET
                        transcription_status = 'idle',
                        transcription_progress = 0,
                        transcribed_seconds = 0,
                        synced_lyrics = NULL,
                        synced_transcript = NULL,
                        plain_transcript = NULL,
                        transcript_lrc_path = NULL,
                        transcript_txt_path = NULL,
                        illustration_status = 'idle',
                        illustration_progress = 0,
                        images_json = '[]',
                        audio_enhance_status = 'idle',
                        audio_enhance_progress = 0,
                        enhanced_audio_path = NULL,
                        enhanced_file_path = NULL,
                        voice_preset = 'original',
                        processed_voices_json = '{}',
                        error_message = NULL,
                        updated_at = ?
                    WHERE chapter_key = ?
                `).run(now, ch.chapter_key);
                chaptersUpdated++;
            }
        }

        for (const bKey of affectedBookKeys) {
            recalculateAudiobookTotals(bKey);
            booksUpdated++;
        }

        return { booksUpdated, chaptersUpdated, eventsCleared };
    } catch (e) {
        console.error('Error in cleanGeneratedAudiobookDataInDb:', e);
        return { booksUpdated, chaptersUpdated, eventsCleared };
    }
};

// ── Cached Calendar Releases Across Instances ──
export const getCachedCalendarReleases = (startDay: string, endDay: string): any[] => {
    try {
        const sDay = String(startDay || '').slice(0, 10);
        const eDay = String(endDay || '').slice(0, 10);
        const rows = db
            .prepare(
                `
            SELECT payload_json
            FROM calendar_releases_cache
            WHERE date_day >= ? AND date_day <= ?
            ORDER BY release_date ASC
        `
            )
            .all(sDay, eDay) as any[];
        const events: any[] = [];
        for (const r of rows || []) {
            try {
                events.push(JSON.parse(r.payload_json));
            } catch {}
        }
        return events;
    } catch (e) {
        console.warn('Error reading cached calendar releases:', e);
        return [];
    }
};

export const getTotalCachedCalendarReleasesCount = (): number => {
    try {
        const row = db.prepare('SELECT COUNT(*) as cnt FROM calendar_releases_cache').get() as any;
        return Number(row?.cnt || 0);
    } catch {
        return 0;
    }
};

export const replaceCachedCalendarReleases = (startDay: string, endDay: string, events: any[]): number => {
    try {
        const sDay = String(startDay || '').slice(0, 10);
        const eDay = String(endDay || '').slice(0, 10);
        const now = new Date().toISOString();

        const tx = db.transaction((items: any[]) => {
            db.prepare('DELETE FROM calendar_releases_cache WHERE date_day >= ? AND date_day <= ?').run(sDay, eDay);
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO calendar_releases_cache (
                    id, release_date, date_day, instance_id, media_type, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            for (const ev of items) {
                if (!ev?.id || !ev?.releaseDate) continue;
                const dayKey = String(ev.releaseDate).slice(0, 10);
                insertStmt.run(
                    String(ev.id),
                    String(ev.releaseDate),
                    dayKey,
                    ev.instanceId ? String(ev.instanceId) : null,
                    ev.mediaType ? String(ev.mediaType) : null,
                    JSON.stringify(ev),
                    now
                );
            }
        });
        tx(events || []);
        return (events || []).length;
    } catch (e) {
        console.warn('Error replacing cached calendar releases:', e);
        return 0;
    }
};

export const getCalendarSyncConfig = () => {
    const enabledRaw = getSetting('calendar_sync_enabled');
    const enabled = enabledRaw === null ? true : enabledRaw === 'true';
    const intervalMin = Math.max(1, parseInt(getSetting('calendar_sync_interval_min') || '15', 10) || 15);
    const lastSync = getSetting('calendar_sync_last_run') || null;
    const lastDurationMs = parseInt(getSetting('calendar_sync_last_duration_ms') || '0', 10) || 0;
    const cachedCount = getTotalCachedCalendarReleasesCount();
    return {
        enabled,
        intervalMin,
        lastSync,
        lastDurationMs,
        cachedCount
    };
};

export const setCalendarSyncConfig = (cfg: {
    enabled?: boolean;
    intervalMin?: number;
    lastSync?: string;
    lastDurationMs?: number;
}) => {
    if (typeof cfg.enabled === 'boolean') {
        setSetting('calendar_sync_enabled', cfg.enabled ? 'true' : 'false');
    }
    if (typeof cfg.intervalMin === 'number') {
        setSetting('calendar_sync_interval_min', String(Math.max(1, cfg.intervalMin)));
    }
    if (typeof cfg.lastSync === 'string') {
        setSetting('calendar_sync_last_run', cfg.lastSync);
    }
    if (typeof cfg.lastDurationMs === 'number') {
        setSetting('calendar_sync_last_duration_ms', String(cfg.lastDurationMs));
    }
    return getCalendarSyncConfig();
};

export interface InstantStreamDownloadRecord {
    id: string;
    media_type: 'movie' | 'series';
    title: string;
    year?: number;
    tmdb_id?: number;
    imdb_id?: string;
    tvdb_id?: number;
    instance_id?: string;
    arr_media_id?: number;
    root_folder_path?: string;
    season_number: number;
    episode_number: number;
    stream_source_name?: string;
    stream_source_url?: string;
    instant_file_path?: string;
    hq_file_path?: string;
    status: 'queued' | 'downloading' | 'available_instant' | 'upgraded_hq' | 'failed';
    progress: number;
    replace_when_hq: boolean;
    error_message?: string;
    created_at: string;
    updated_at: string;
}

const mapInstantDownloadRow = (r: any): InstantStreamDownloadRecord => ({
    id: r.id,
    media_type: r.media_type === 'series' ? 'series' : 'movie',
    title: r.title || 'Untitled',
    year: r.year ? Number(r.year) : undefined,
    tmdb_id: r.tmdb_id ? Number(r.tmdb_id) : undefined,
    imdb_id: r.imdb_id || undefined,
    tvdb_id: r.tvdb_id ? Number(r.tvdb_id) : undefined,
    instance_id: r.instance_id || undefined,
    arr_media_id: r.arr_media_id ? Number(r.arr_media_id) : undefined,
    root_folder_path: r.root_folder_path || undefined,
    season_number: Number(r.season_number ?? 1),
    episode_number: Number(r.episode_number ?? 1),
    stream_source_name: r.stream_source_name || undefined,
    stream_source_url: r.stream_source_url || undefined,
    instant_file_path: r.instant_file_path || undefined,
    hq_file_path: r.hq_file_path || undefined,
    status: (r.status || 'queued') as InstantStreamDownloadRecord['status'],
    progress: Number(r.progress ?? 0),
    replace_when_hq: r.replace_when_hq !== 0,
    error_message: r.error_message || undefined,
    created_at: r.created_at || new Date().toISOString(),
    updated_at: r.updated_at || new Date().toISOString()
});

export const upsertInstantStreamDownload = (rec: Partial<InstantStreamDownloadRecord> & { id: string; media_type?: 'movie' | 'series'; title?: string }): InstantStreamDownloadRecord => {
    const existingRow = db.prepare('SELECT * FROM instant_stream_downloads WHERE id = ?').get(rec.id) as any;
    const existing = existingRow ? mapInstantDownloadRow(existingRow) : null;
    const now = new Date().toISOString();

    const merged: InstantStreamDownloadRecord = {
        id: rec.id,
        media_type: rec.media_type ?? existing?.media_type ?? 'movie',
        title: rec.title ?? existing?.title ?? 'Untitled',
        year: rec.year ?? existing?.year,
        tmdb_id: rec.tmdb_id ?? existing?.tmdb_id,
        imdb_id: rec.imdb_id ?? existing?.imdb_id,
        tvdb_id: rec.tvdb_id ?? existing?.tvdb_id,
        instance_id: rec.instance_id ?? existing?.instance_id,
        arr_media_id: rec.arr_media_id ?? existing?.arr_media_id,
        root_folder_path: rec.root_folder_path ?? existing?.root_folder_path,
        season_number: rec.season_number ?? existing?.season_number ?? 1,
        episode_number: rec.episode_number ?? existing?.episode_number ?? 1,
        stream_source_name: rec.stream_source_name ?? existing?.stream_source_name,
        stream_source_url: rec.stream_source_url ?? existing?.stream_source_url,
        instant_file_path: rec.instant_file_path !== undefined ? rec.instant_file_path : existing?.instant_file_path,
        hq_file_path: rec.hq_file_path !== undefined ? rec.hq_file_path : existing?.hq_file_path,
        status: rec.status ?? existing?.status ?? 'queued',
        progress: rec.progress ?? existing?.progress ?? 0,
        replace_when_hq: rec.replace_when_hq !== undefined ? rec.replace_when_hq : (existing?.replace_when_hq ?? true),
        error_message: rec.error_message !== undefined ? rec.error_message : existing?.error_message,
        created_at: existing?.created_at || now,
        updated_at: now
    };

    db.prepare(`
        INSERT INTO instant_stream_downloads (
            id, media_type, title, year, tmdb_id, imdb_id, tvdb_id,
            instance_id, arr_media_id, root_folder_path,
            season_number, episode_number, stream_source_name, stream_source_url,
            instant_file_path, hq_file_path, status, progress, replace_when_hq,
            error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            media_type = excluded.media_type,
            title = excluded.title,
            year = COALESCE(excluded.year, instant_stream_downloads.year),
            tmdb_id = COALESCE(excluded.tmdb_id, instant_stream_downloads.tmdb_id),
            imdb_id = COALESCE(excluded.imdb_id, instant_stream_downloads.imdb_id),
            tvdb_id = COALESCE(excluded.tvdb_id, instant_stream_downloads.tvdb_id),
            instance_id = COALESCE(excluded.instance_id, instant_stream_downloads.instance_id),
            arr_media_id = COALESCE(excluded.arr_media_id, instant_stream_downloads.arr_media_id),
            root_folder_path = COALESCE(excluded.root_folder_path, instant_stream_downloads.root_folder_path),
            season_number = excluded.season_number,
            episode_number = excluded.episode_number,
            stream_source_name = COALESCE(excluded.stream_source_name, instant_stream_downloads.stream_source_name),
            stream_source_url = COALESCE(excluded.stream_source_url, instant_stream_downloads.stream_source_url),
            instant_file_path = excluded.instant_file_path,
            hq_file_path = excluded.hq_file_path,
            status = excluded.status,
            progress = excluded.progress,
            replace_when_hq = excluded.replace_when_hq,
            error_message = excluded.error_message,
            updated_at = excluded.updated_at
    `).run(
        merged.id,
        merged.media_type,
        merged.title,
        merged.year ?? null,
        merged.tmdb_id ?? null,
        merged.imdb_id ?? null,
        merged.tvdb_id ?? null,
        merged.instance_id ?? null,
        merged.arr_media_id ?? null,
        merged.root_folder_path ?? null,
        merged.season_number,
        merged.episode_number,
        merged.stream_source_name ?? null,
        merged.stream_source_url ?? null,
        merged.instant_file_path ?? null,
        merged.hq_file_path ?? null,
        merged.status,
        merged.progress,
        merged.replace_when_hq ? 1 : 0,
        merged.error_message ?? null,
        merged.created_at,
        merged.updated_at
    );

    return merged;
};

export const deleteInstantStreamDownload = (id: string): boolean => {
    try {
        db.prepare('DELETE FROM instant_stream_downloads WHERE id = ?').run(id);
        return true;
    } catch {
        return false;
    }
};

export const getInstantStreamDownloads = (statusFilter?: string): InstantStreamDownloadRecord[] => {
    try {
        const rows = statusFilter
            ? (db.prepare('SELECT * FROM instant_stream_downloads WHERE status = ? ORDER BY updated_at DESC').all(statusFilter) as any[])
            : (db.prepare('SELECT * FROM instant_stream_downloads ORDER BY updated_at DESC LIMIT 200').all() as any[]);
        return (rows || []).map(mapInstantDownloadRow);
    } catch {
        return [];
    }
};

export const getInstantStreamDownloadsForMedia = (params: { tmdbId?: number; imdbId?: string; tvdbId?: number; title?: string }): InstantStreamDownloadRecord[] => {
    try {
        const all = getInstantStreamDownloads();
        return all.filter(r =>
            (params.tmdbId && r.tmdb_id === Number(params.tmdbId)) ||
            (params.imdbId && r.imdb_id && r.imdb_id.toLowerCase() === params.imdbId.toLowerCase()) ||
            (params.tvdbId && r.tvdb_id === Number(params.tvdbId)) ||
            (params.title && r.title.toLowerCase() === params.title.toLowerCase())
        );
    } catch {
        return [];
    }
};

// ── Video AI Subtitles & History ──
export interface VideoAiSubtitle {
    id: string;
    video_path: string;
    media_title: string;
    media_type?: string;
    library_id?: string;
    library_name?: string;
    language?: string;
    language_name?: string;
    sub_path: string;
    sub_size_bytes?: number;
    status: 'completed' | 'processing' | 'failed' | 'queued';
    duration_ms?: number;
    cpu_power_pct?: number;
    cpu_threads?: number;
    created_at?: string;
    updated_at?: string;
    error_message?: string;
}

export interface VideoAiHistoryEntry {
    id: string;
    video_path: string;
    media_title: string;
    library_id?: string;
    library_name?: string;
    language?: string;
    action?: string;
    status: 'completed' | 'failed' | 'running';
    duration_ms?: number;
    cpu_power_pct?: number;
    cpu_threads?: number;
    details?: string;
    created_at?: string;
}

export const getVideoAiSubtitles = (limit = 200): VideoAiSubtitle[] => {
    try {
        const stmt = db.prepare('SELECT * FROM video_ai_subtitles ORDER BY created_at DESC LIMIT ?');
        return stmt.all(limit) as VideoAiSubtitle[];
    } catch {
        return [];
    }
};

export const upsertVideoAiSubtitle = (sub: VideoAiSubtitle) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO video_ai_subtitles (
                id, video_path, media_title, media_type, library_id, library_name,
                language, language_name, sub_path, sub_size_bytes, status,
                duration_ms, cpu_power_pct, cpu_threads, updated_at, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                sub_path = excluded.sub_path,
                sub_size_bytes = excluded.sub_size_bytes,
                duration_ms = excluded.duration_ms,
                cpu_power_pct = excluded.cpu_power_pct,
                cpu_threads = excluded.cpu_threads,
                updated_at = CURRENT_TIMESTAMP,
                error_message = excluded.error_message
        `);
        stmt.run(
            sub.id,
            sub.video_path,
            sub.media_title,
            sub.media_type || 'movie',
            sub.library_id || '',
            sub.library_name || '',
            sub.language || 'en',
            sub.language_name || 'English',
            sub.sub_path,
            sub.sub_size_bytes || 0,
            sub.status,
            sub.duration_ms || 0,
            sub.cpu_power_pct || 0,
            sub.cpu_threads || 2,
            sub.error_message || ''
        );
    } catch (e) {
        console.error('Error upserting video ai subtitle:', e);
    }
};

export const deleteVideoAiSubtitle = (id: string) => {
    try {
        const stmt = db.prepare('DELETE FROM video_ai_subtitles WHERE id = ?');
        stmt.run(id);
    } catch (e) {
        console.error('Error deleting video ai subtitle:', e);
    }
};

export const getVideoAiHistory = (limit = 100): VideoAiHistoryEntry[] => {
    try {
        const stmt = db.prepare('SELECT * FROM video_ai_history ORDER BY created_at DESC LIMIT ?');
        return stmt.all(limit) as VideoAiHistoryEntry[];
    } catch {
        return [];
    }
};

export const logVideoAiHistory = (entry: VideoAiHistoryEntry) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO video_ai_history (
                id, video_path, media_title, library_id, library_name,
                language, action, status, duration_ms, cpu_power_pct, cpu_threads, details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            entry.id,
            entry.video_path,
            entry.media_title,
            entry.library_id || '',
            entry.library_name || '',
            entry.language || 'en',
            entry.action || 'transcribe',
            entry.status,
            entry.duration_ms || 0,
            entry.cpu_power_pct || 0,
            entry.cpu_threads || 2,
            entry.details || ''
        );
    } catch (e) {
        console.error('Error logging video ai history:', e);
    }
};

export const clearVideoAiHistory = () => {
    try {
        db.prepare('DELETE FROM video_ai_history').run();
    } catch (e) {
        console.error('Error clearing video ai history:', e);
    }
};

export default db;





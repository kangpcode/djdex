//! Lapisan database SQLite lokal untuk Library musik, Crate, Playlist, dan History.

use std::path::PathBuf;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};

use crate::error::AudioError;

/// Satu rekaman track di dalam database library.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrack {
    pub id: i64,
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<u32>,
    pub bpm: Option<f64>,
    pub key_name: Option<String>,
    pub duration_secs: f64,
    pub rating: u32,
    pub color: Option<String>,
    pub play_count: u32,
    pub date_added: String,
    pub analyzed: bool,
    pub loudness_lufs: Option<f64>,
}

/// Satu entri Crate (kategori folder musik DJ).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrateItem {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub track_count: usize,
}

/// Definisi filter untuk Smart Playlist otomatis.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartFilter {
    pub min_bpm: Option<f64>,
    pub max_bpm: Option<f64>,
    pub key_name: Option<String>,
    pub genre: Option<String>,
    pub min_rating: Option<u32>,
}

/// Satu entri Playlist (manual atau smart playlist berbasis aturan).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub id: i64,
    pub name: String,
    pub is_smart: bool,
    pub smart_filter: Option<SmartFilter>,
    pub track_count: usize,
}

/// Riwayat pemutaran track (History).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: i64,
    pub track_id: i64,
    pub title: String,
    pub artist: String,
    pub deck_slot: usize,
    pub played_at: String,
    pub duration_secs: f64,
}

/// Parameter query pencarian dan penyortiran track.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackQuery {
    pub search: Option<String>,
    pub sort_column: Option<String>,
    pub sort_descending: Option<bool>,
    pub crate_id: Option<i64>,
    pub playlist_id: Option<i64>,
    pub limit: Option<usize>,
}

/// Pengelola koneksi dan query SQLite untuk Library.
pub struct LibraryDb {
    conn: parking_lot::Mutex<Connection>,
    #[allow(dead_code)]
    db_path: PathBuf,
}

impl LibraryDb {
    pub fn new(path: impl Into<PathBuf>) -> Result<Self, AudioError> {
        let db_path = path.into();
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(&db_path)
            .map_err(|e| AudioError::Io(format!("Gagal membuka DB SQLite: {e}")))?;
        let db = Self {
            conn: parking_lot::Mutex::new(conn),
            db_path,
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn in_memory() -> Result<Self, AudioError> {
        let conn = Connection::open_in_memory()
            .map_err(|e| AudioError::Io(format!("Gagal membuka in-memory DB: {e}")))?;
        let db = Self {
            conn: parking_lot::Mutex::new(conn),
            db_path: PathBuf::from(":memory:"),
        };
        db.init_schema()?;
        Ok(db)
    }

    #[inline]
    fn conn(&self) -> parking_lot::MutexGuard<'_, Connection> {
        self.conn.lock()
    }

    pub fn init_schema(&self) -> Result<(), AudioError> {
        let conn = self.conn();

        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT,
                genre TEXT,
                year INTEGER,
                bpm REAL,
                key_name TEXT,
                duration_secs REAL NOT NULL,
                rating INTEGER DEFAULT 0,
                color TEXT,
                play_count INTEGER DEFAULT 0,
                date_added TEXT NOT NULL,
                analyzed INTEGER DEFAULT 0,
                loudness_lufs REAL
            );

            CREATE INDEX IF NOT EXISTS idx_tracks_search ON tracks(title, artist, album, genre);
            CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
            CREATE INDEX IF NOT EXISTS idx_tracks_key ON tracks(key_name);

            CREATE TABLE IF NOT EXISTS crates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                color TEXT
            );

            CREATE TABLE IF NOT EXISTS crate_tracks (
                crate_id INTEGER REFERENCES crates(id) ON DELETE CASCADE,
                track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                position INTEGER DEFAULT 0,
                PRIMARY KEY (crate_id, track_id)
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                is_smart INTEGER DEFAULT 0,
                smart_filter TEXT
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
                track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                position INTEGER DEFAULT 0,
                PRIMARY KEY (playlist_id, track_id)
            );

            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                deck_slot INTEGER NOT NULL,
                played_at TEXT NOT NULL
            );
            ",
        )
        .map_err(|e| AudioError::Io(format!("Gagal inisialisasi schema database: {e}")))?;

        Ok(())
    }

    pub fn insert_or_update_track(&self, track: &LibraryTrack) -> Result<i64, AudioError> {
        let conn = self.conn();

        conn.execute(
            "
            INSERT INTO tracks (
                file_path, title, artist, album, genre, year, bpm, key_name,
                duration_secs, rating, color, play_count, date_added, analyzed, loudness_lufs
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(file_path) DO UPDATE SET
                title = excluded.title,
                artist = excluded.artist,
                album = excluded.album,
                genre = excluded.genre,
                year = excluded.year,
                duration_secs = excluded.duration_secs
            ",
            params![
                track.file_path,
                track.title,
                track.artist,
                track.album,
                track.genre,
                track.year,
                track.bpm,
                track.key_name,
                track.duration_secs,
                track.rating,
                track.color,
                track.play_count,
                track.date_added,
                if track.analyzed { 1 } else { 0 },
                track.loudness_lufs,
            ],
        )
        .map_err(|e| AudioError::Io(format!("Gagal simpan track: {e}")))?;

        let id = conn.last_insert_rowid();
        Ok(id)
    }

    pub fn update_track_analysis(
        &self,
        track_id: i64,
        bpm: f64,
        key_name: String,
        loudness_lufs: f64,
    ) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute(
            "
            UPDATE tracks SET
                bpm = ?1,
                key_name = ?2,
                loudness_lufs = ?3,
                analyzed = 1
            WHERE id = ?4
            ",
            params![bpm, key_name, loudness_lufs, track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn update_rating(&self, track_id: i64, rating: u32) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute(
            "UPDATE tracks SET rating = ?1 WHERE id = ?2",
            params![rating.min(5), track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn increment_play_count(&self, track_id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1",
            params![track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn get_tracks(&self, query: TrackQuery) -> Result<Vec<LibraryTrack>, AudioError> {
        let conn = self.conn();

        let mut sql = String::from(
            "
            SELECT t.id, t.file_path, t.title, t.artist, t.album, t.genre, t.year,
                   t.bpm, t.key_name, t.duration_secs, t.rating, t.color, t.play_count,
                   t.date_added, t.analyzed, t.loudness_lufs
            FROM tracks t
            ",
        );

        let mut conditions: Vec<String> = Vec::new();
        let mut param_values: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(crate_id) = query.crate_id {
            sql.push_str(" JOIN crate_tracks ct ON t.id = ct.track_id ");
            conditions.push(" ct.crate_id = ? ".to_string());
            param_values.push(crate_id.into());
        } else if let Some(playlist_id) = query.playlist_id {
            // Periksa apakah ini smart playlist
            let mut stmt = conn
                .prepare("SELECT is_smart, smart_filter FROM playlists WHERE id = ?1")
                .map_err(|e| AudioError::Io(e.to_string()))?;
            let playlist_meta = stmt
                .query_row(params![playlist_id], |row| {
                    let is_smart: bool = row.get(0)?;
                    let filter_str: Option<String> = row.get(1)?;
                    Ok((is_smart, filter_str))
                })
                .ok();

            if let Some((true, Some(filter_str))) = playlist_meta {
                if let Ok(filter) = serde_json::from_str::<SmartFilter>(&filter_str) {
                    if let Some(min_bpm) = filter.min_bpm {
                        conditions.push(" t.bpm >= ? ".to_string());
                        param_values.push(min_bpm.into());
                    }
                    if let Some(max_bpm) = filter.max_bpm {
                        conditions.push(" t.bpm <= ? ".to_string());
                        param_values.push(max_bpm.into());
                    }
                    if let Some(key) = filter.key_name {
                        conditions.push(" t.key_name = ? ".to_string());
                        param_values.push(key.into());
                    }
                    if let Some(genre) = filter.genre {
                        conditions.push(" t.genre LIKE ? ".to_string());
                        param_values.push(format!("%{genre}%").into());
                    }
                    if let Some(rating) = filter.min_rating {
                        conditions.push(" t.rating >= ? ".to_string());
                        param_values.push((rating as i64).into());
                    }
                }
            } else {
                sql.push_str(" JOIN playlist_tracks pt ON t.id = pt.track_id ");
                conditions.push(" pt.playlist_id = ? ".to_string());
                param_values.push(playlist_id.into());
            }
        }

        if let Some(ref search) = query.search {
            if !search.trim().is_empty() {
                conditions.push(" (t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ? OR t.genre LIKE ?) ".to_string());
                let pattern = format!("%{}%", search.trim());
                param_values.push(pattern.clone().into());
                param_values.push(pattern.clone().into());
                param_values.push(pattern.clone().into());
                param_values.push(pattern.into());
            }
        }

        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }

        // Sorting
        let sort_col = match query.sort_column.as_deref() {
            Some("artist") => "t.artist",
            Some("bpm") => "t.bpm",
            Some("keyName") | Some("key_name") => "t.key_name",
            Some("genre") => "t.genre",
            Some("durationSecs") | Some("duration_secs") => "t.duration_secs",
            Some("rating") => "t.rating",
            Some("playCount") | Some("play_count") => "t.play_count",
            Some("dateAdded") | Some("date_added") => "t.date_added",
            _ => "t.title",
        };
        let direction = if query.sort_descending.unwrap_or(false) {
            "DESC"
        } else {
            "ASC"
        };
        sql.push_str(&format!(" ORDER BY {sort_col} {direction} "));

        if let Some(limit) = query.limit {
            sql.push_str(&format!(" LIMIT {limit} "));
        }

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AudioError::Io(format!("SQL error: {e}")))?;

        let params_slice: Vec<&dyn rusqlite::ToSql> = param_values
            .iter()
            .map(|v| v as &dyn rusqlite::ToSql)
            .collect();

        let track_iter = stmt
            .query_map(params_slice.as_slice(), |row| {
                Ok(LibraryTrack {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album: row.get(4)?,
                    genre: row.get(5)?,
                    year: row.get(6)?,
                    bpm: row.get(7)?,
                    key_name: row.get(8)?,
                    duration_secs: row.get(9)?,
                    rating: row.get(10)?,
                    color: row.get(11)?,
                    play_count: row.get(12)?,
                    date_added: row.get(13)?,
                    analyzed: row.get::<_, i64>(14)? == 1,
                    loudness_lufs: row.get(15)?,
                })
            })
            .map_err(|e| AudioError::Io(e.to_string()))?;

        let mut out = Vec::new();
        for t in track_iter {
            out.push(t.map_err(|e| AudioError::Io(e.to_string()))?);
        }

        Ok(out)
    }

    pub fn delete_track(&self, id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
            .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    // ---- Crate Methods ----------------------------------------------------

    pub fn create_crate(&self, name: &str, color: Option<&str>) -> Result<i64, AudioError> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO crates (name, color) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING",
            params![name, color],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn delete_crate(&self, id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute("DELETE FROM crates WHERE id = ?1", params![id])
            .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn list_crates(&self) -> Result<Vec<CrateItem>, AudioError> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "
                SELECT c.id, c.name, c.color, COUNT(ct.track_id)
                FROM crates c
                LEFT JOIN crate_tracks ct ON c.id = ct.crate_id
                GROUP BY c.id
                ORDER BY c.name ASC
                ",
            )
            .map_err(|e| AudioError::Io(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(CrateItem {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    track_count: row.get::<_, i64>(3)? as usize,
                })
            })
            .map_err(|e| AudioError::Io(e.to_string()))?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| AudioError::Io(e.to_string()))?);
        }
        Ok(out)
    }

    pub fn add_track_to_crate(&self, crate_id: i64, track_id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO crate_tracks (crate_id, track_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
            params![crate_id, track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn remove_track_from_crate(&self, crate_id: i64, track_id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute(
            "DELETE FROM crate_tracks WHERE crate_id = ?1 AND track_id = ?2",
            params![crate_id, track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    // ---- Playlist Methods -------------------------------------------------

    pub fn create_playlist(
        &self,
        name: &str,
        smart_filter: Option<SmartFilter>,
    ) -> Result<i64, AudioError> {
        let conn = self.conn();
        let is_smart = smart_filter.is_some();
        let filter_json = smart_filter
            .as_ref()
            .and_then(|f| serde_json::to_string(f).ok());

        conn.execute(
            "INSERT INTO playlists (name, is_smart, smart_filter) VALUES (?1, ?2, ?3) ON CONFLICT(name) DO NOTHING",
            params![name, if is_smart { 1 } else { 0 }, filter_json],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn delete_playlist(&self, id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])
            .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn list_playlists(&self) -> Result<Vec<PlaylistItem>, AudioError> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "
                SELECT p.id, p.name, p.is_smart, p.smart_filter, COUNT(pt.track_id)
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                GROUP BY p.id
                ORDER BY p.name ASC
                ",
            )
            .map_err(|e| AudioError::Io(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let filter_str: Option<String> = row.get(3)?;
                let smart_filter = filter_str.and_then(|s| serde_json::from_str(&s).ok());
                Ok(PlaylistItem {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    is_smart: row.get::<_, i64>(2)? == 1,
                    smart_filter,
                    track_count: row.get::<_, i64>(4)? as usize,
                })
            })
            .map_err(|e| AudioError::Io(e.to_string()))?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| AudioError::Io(e.to_string()))?);
        }
        Ok(out)
    }

    pub fn add_track_to_playlist(&self, playlist_id: i64, track_id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
            params![playlist_id, track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn remove_track_from_playlist(&self, playlist_id: i64, track_id: i64) -> Result<(), AudioError> {
        let conn = self.conn();
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    // ---- History Methods --------------------------------------------------

    pub fn add_to_history(&self, track_id: i64, deck_slot: usize) -> Result<(), AudioError> {
        let conn = self.conn();
        let now = chrono_or_simple_timestamp();
        conn.execute(
            "INSERT INTO history (track_id, deck_slot, played_at) VALUES (?1, ?2, ?3)",
            params![track_id, deck_slot as i64, now],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1",
            params![track_id],
        )
        .map_err(|e| AudioError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn get_history(&self, limit: usize) -> Result<Vec<HistoryItem>, AudioError> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "
                SELECT h.id, h.track_id, t.title, t.artist, h.deck_slot, h.played_at, t.duration_secs
                FROM history h
                JOIN tracks t ON h.track_id = t.id
                ORDER BY h.id DESC
                LIMIT ?1
                ",
            )
            .map_err(|e| AudioError::Io(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(HistoryItem {
                    id: row.get(0)?,
                    track_id: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    deck_slot: row.get::<_, i64>(4)? as usize,
                    played_at: row.get(5)?,
                    duration_secs: row.get(6)?,
                })
            })
            .map_err(|e| AudioError::Io(e.to_string()))?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| AudioError::Io(e.to_string()))?);
        }
        Ok(out)
    }
}

fn chrono_or_simple_timestamp() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{now}")
}

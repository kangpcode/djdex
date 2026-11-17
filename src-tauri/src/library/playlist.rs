//! Impor dan Ekspor playlist format M3U dan PLS, serta evaluasi Smart Playlist.

use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::db::{LibraryDb, LibraryTrack};
use crate::error::AudioError;

/// Impor file playlist M3U / M3U8 ke dalam Library database.
pub fn import_m3u(file_path: &Path, db: &Arc<LibraryDb>) -> Result<i64, AudioError> {
    let file = File::open(file_path)
        .map_err(|e| AudioError::Io(format!("Gagal membuka file M3U: {e}")))?;
    let reader = BufReader::new(file);

    let playlist_name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported Playlist")
        .to_string();

    let playlist_id = db.create_playlist(&playlist_name, None)?;
    let parent_dir = file_path.parent().unwrap_or_else(|| Path::new("."));

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l.trim().to_string(),
            Err(_) => continue,
        };

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let audio_path = resolve_path(parent_dir, &line);
        if audio_path.exists() {
            // Ekstrak metadata bila belum ada di DB
            if let Ok(track) = super::scanner::extract_metadata(&audio_path) {
                if let Ok(track_id) = db.insert_or_update_track(&track) {
                    let _ = db.add_track_to_playlist(playlist_id, track_id);
                }
            }
        }
    }

    Ok(playlist_id)
}

/// Impor file playlist format PLS ke dalam Library database.
pub fn import_pls(file_path: &Path, db: &Arc<LibraryDb>) -> Result<i64, AudioError> {
    let file = File::open(file_path)
        .map_err(|e| AudioError::Io(format!("Gagal membuka file PLS: {e}")))?;
    let reader = BufReader::new(file);

    let playlist_name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported PLS")
        .to_string();

    let playlist_id = db.create_playlist(&playlist_name, None)?;
    let parent_dir = file_path.parent().unwrap_or_else(|| Path::new("."));

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l.trim().to_string(),
            Err(_) => continue,
        };

        if line.to_lowercase().starts_with("file") {
            if let Some((_, path_part)) = line.split_once('=') {
                let audio_path = resolve_path(parent_dir, path_part.trim());
                if audio_path.exists() {
                    if let Ok(track) = super::scanner::extract_metadata(&audio_path) {
                        if let Ok(track_id) = db.insert_or_update_track(&track) {
                            let _ = db.add_track_to_playlist(playlist_id, track_id);
                        }
                    }
                }
            }
        }
    }

    Ok(playlist_id)
}

/// Ekspor playlist dari Library database ke file format M3U8.
pub fn export_m3u(
    _playlist_id: i64,
    dest_path: &Path,
    tracks: &[LibraryTrack],
) -> Result<(), AudioError> {
    let mut file = File::create(dest_path)
        .map_err(|e| AudioError::Io(format!("Gagal membuat file M3U: {e}")))?;

    writeln!(file, "#EXTM3U")
        .map_err(|e| AudioError::Io(e.to_string()))?;

    for track in tracks {
        let dur = track.duration_secs.round() as i64;
        writeln!(file, "#EXTINF:{dur},{} - {}", track.artist, track.title)
            .map_err(|e| AudioError::Io(e.to_string()))?;
        writeln!(file, "{}", track.file_path)
            .map_err(|e| AudioError::Io(e.to_string()))?;
    }

    Ok(())
}

fn resolve_path(parent: &Path, raw: &str) -> PathBuf {
    let p = Path::new(raw);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        parent.join(p)
    }
}

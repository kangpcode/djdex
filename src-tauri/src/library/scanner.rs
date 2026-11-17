//! Pemindai folder musik, ekstraktor tag ID3/metadata dengan `lofty`,
//! dan worker analisis batch di background (BPM, Key Camelot, Loudness).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::SystemTime;

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};

use super::db::{LibraryDb, LibraryTrack};
use crate::analysis::bpm::estimate_bpm;
use crate::analysis::key::estimate_key;
use crate::audio::decoder::TrackDecoder;
use crate::error::AudioError;

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "m4a", "aac", "aiff", "aif", "alac",
];

/// Status proses pemindaian folder & analisis batch untuk UI.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub is_scanning: bool,
    pub is_analyzing: bool,
    pub scanned_files: usize,
    pub total_files: usize,
    pub analyzed_tracks: usize,
    pub total_analyze: usize,
    pub current_file: Option<String>,
}

pub struct ScannerManager {
    is_scanning: Arc<AtomicBool>,
    is_analyzing: Arc<AtomicBool>,
    scanned_files: Arc<AtomicUsize>,
    total_files: Arc<AtomicUsize>,
    analyzed_tracks: Arc<AtomicUsize>,
    total_analyze: Arc<AtomicUsize>,
}

impl ScannerManager {
    pub fn new() -> Self {
        Self {
            is_scanning: Arc::new(AtomicBool::new(false)),
            is_analyzing: Arc::new(AtomicBool::new(false)),
            scanned_files: Arc::new(AtomicUsize::new(0)),
            total_files: Arc::new(AtomicUsize::new(0)),
            analyzed_tracks: Arc::new(AtomicUsize::new(0)),
            total_analyze: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn status(&self) -> ScanProgress {
        ScanProgress {
            is_scanning: self.is_scanning.load(Ordering::Relaxed),
            is_analyzing: self.is_analyzing.load(Ordering::Relaxed),
            scanned_files: self.scanned_files.load(Ordering::Relaxed),
            total_files: self.total_files.load(Ordering::Relaxed),
            analyzed_tracks: self.analyzed_tracks.load(Ordering::Relaxed),
            total_analyze: self.total_analyze.load(Ordering::Relaxed),
            current_file: None,
        }
    }

    /// Pindai folder secara rekursif di background thread dan simpan metadata ke database.
    pub fn start_scan(&self, folder_path: PathBuf, db: Arc<LibraryDb>) -> Result<(), AudioError> {
        if self.is_scanning.load(Ordering::Relaxed) {
            return Ok(());
        }

        self.is_scanning.store(true, Ordering::Relaxed);
        self.scanned_files.store(0, Ordering::Relaxed);
        self.total_files.store(0, Ordering::Relaxed);

        let is_scanning = Arc::clone(&self.is_scanning);
        let scanned_count = Arc::clone(&self.scanned_files);
        let total_count = Arc::clone(&self.total_files);

        thread::Builder::new()
            .name("djdex-library-scanner".to_string())
            .spawn(move || {
                let mut audio_files = Vec::new();
                collect_audio_files(&folder_path, &mut audio_files);
                total_count.store(audio_files.len(), Ordering::Relaxed);

                for (idx, path) in audio_files.iter().enumerate() {
                    if let Ok(track) = extract_metadata(path) {
                        let _ = db.insert_or_update_track(&track);
                    }
                    scanned_count.store(idx + 1, Ordering::Relaxed);
                }

                is_scanning.store(false, Ordering::Relaxed);
            })
            .map_err(|e| AudioError::Io(format!("Gagal memulai thread scanner: {e}")))?;

        Ok(())
    }

    /// Jalankan analisis batch (BPM, Key Camelot, LUFS) untuk track yang belum dianalisis.
    pub fn start_batch_analyze(
        &self,
        track_ids: Option<Vec<i64>>,
        db: Arc<LibraryDb>,
    ) -> Result<(), AudioError> {
        if self.is_analyzing.load(Ordering::Relaxed) {
            return Ok(());
        }

        self.is_analyzing.store(true, Ordering::Relaxed);
        self.analyzed_tracks.store(0, Ordering::Relaxed);

        let is_analyzing = Arc::clone(&self.is_analyzing);
        let analyzed_count = Arc::clone(&self.analyzed_tracks);
        let total_analyze = Arc::clone(&self.total_analyze);

        thread::Builder::new()
            .name("djdex-batch-analyzer".to_string())
            .spawn(move || {
                let tracks_to_analyze: Vec<LibraryTrack> = match track_ids {
                    Some(ids) => {
                        let all = db.get_tracks(Default::default()).unwrap_or_default();
                        all.into_iter().filter(|t| ids.contains(&t.id)).collect()
                    }
                    None => {
                        let all = db.get_tracks(Default::default()).unwrap_or_default();
                        all.into_iter().filter(|t| !t.analyzed).collect()
                    }
                };

                total_analyze.store(tracks_to_analyze.len(), Ordering::Relaxed);

                for (idx, track) in tracks_to_analyze.iter().enumerate() {
                    let path = PathBuf::from(&track.file_path);
                    if let Ok((bpm, key, lufs)) = analyze_track_audio(&path) {
                        let _ = db.update_track_analysis(track.id, bpm, key, lufs);
                    }
                    analyzed_count.store(idx + 1, Ordering::Relaxed);
                }

                is_analyzing.store(false, Ordering::Relaxed);
            })
            .map_err(|e| AudioError::Io(format!("Gagal memulai thread analisis: {e}")))?;

        Ok(())
    }
}

/// Rekursif kumpulkan semua file audio di folder.
fn collect_audio_files(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_audio_files(&path, out);
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                        out.push(path);
                    }
                }
            }
        }
    }
}

/// Ekstrak tag metadata musik menggunakan `lofty`.
pub fn extract_metadata(path: &Path) -> Result<LibraryTrack, AudioError> {
    let tagged_file = Probe::open(path)
        .map_err(|e| AudioError::Io(e.to_string()))?
        .read()
        .map_err(|e| AudioError::Io(e.to_string()))?;

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
    let properties = tagged_file.properties();

    let duration = properties.duration().as_secs_f64();
    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let title = tag
        .and_then(|t| t.title())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(file_stem);

    let artist = tag
        .and_then(|t| t.artist())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Unknown Artist".to_string());

    let album = tag
        .and_then(|t| t.album())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let genre = tag
        .and_then(|t| t.genre())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let year = tag.and_then(|t| t.date().map(|d| d.year as u32));

    let now_ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(LibraryTrack {
        id: 0,
        filePath: path.to_string_lossy().to_string(),
        title,
        artist,
        album,
        genre,
        year,
        bpm: None,
        keyName: None,
        durationSecs: duration,
        rating: 0,
        color: None,
        playCount: 0,
        dateAdded: format!("{now_ts}"),
        analyzed: false,
        loudnessLufs: None,
    })
}

/// Analisis file audio secara menyeluruh: BPM, Key Camelot, dan LUFS loudness.
pub fn analyze_track_audio(path: &Path) -> Result<(f64, String, f64), AudioError> {
    let mut decoder = TrackDecoder::open(path)?;
    let sample_rate = decoder.info().source_sample_rate;
    let mut samples = Vec::new();

    // Baca hingga ~90 detik pertama untuk analisis cepat dan akurat
    let max_frames = (sample_rate as usize * 90).min(10_000_000);
    while samples.len() / 2 < max_frames {
        let prev = samples.len();
        let more = decoder.decode_next(&mut samples)?;
        if !more || samples.len() == prev {
            break;
        }
    }

    if samples.is_empty() {
        return Err(AudioError::TrackDecode("File audio kosong".to_string()));
    }

    let mono: Vec<f32> = samples
        .chunks_exact(2)
        .map(|c| 0.5 * (c[0] + c[1]))
        .collect();

    // Deteksi BPM
    let detected_bpm = estimate_bpm(&mono, sample_rate)
        .map(|b| b.bpm)
        .unwrap_or(128.0);

    // Deteksi Key Camelot
    let detected_key = estimate_key(&mono, sample_rate)
        .map(|k| k.camelot)
        .unwrap_or_else(|| "8A".to_string());

    // Hitung RMS/LUFS perkiraan
    let sum_sq: f64 = samples.iter().map(|&s| (s as f64) * (s as f64)).sum();
    let mean_sq = sum_sq / samples.len().max(1) as f64;
    let rms_db = 10.0 * (mean_sq.max(1e-9)).log10();
    let lufs = (rms_db - 0.691).clamp(-70.0, 0.0); // EBU R128 approx

    Ok((detected_bpm, detected_key, lufs))
}

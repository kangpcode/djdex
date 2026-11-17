//! Error domain untuk audio engine.
//!
//! Semua error audio memakai `thiserror` agar pesan bisa langsung ditampilkan
//! di UI, sementara batas IPC (`commands.rs`) mengubahnya menjadi `String`.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AudioError {
    #[error("Tidak ada perangkat audio output yang terdeteksi")]
    NoOutputDevice,

    #[error("Perangkat audio '{0}' tidak ditemukan")]
    DeviceNotFound(String),

    #[error("Gagal membaca daftar perangkat audio: {0}")]
    Enumerate(String),

    #[error("Konfigurasi output tidak didukung: {0}")]
    UnsupportedConfig(String),

    #[error("Format sample '{0}' belum didukung oleh engine")]
    UnsupportedSampleFormat(String),

    #[error("Gagal membuat stream audio: {0}")]
    BuildStream(String),

    #[error("Gagal memulai stream audio: {0}")]
    PlayStream(String),

    #[error("Gagal membuat thread audio host: {0}")]
    StreamThreadSpawn(String),

    #[error("Stream audio tidak siap dalam batas waktu")]
    StreamReadyTimeout,

    #[error("Audio engine belum diinisialisasi")]
    NotInitialized,

    #[error("Gagal membuka track: {0}")]
    TrackOpen(String),

    #[error("Gagal melakukan seek: {0}")]
    TrackSeek(String),

    #[error("Gagal decode audio: {0}")]
    TrackDecode(String),

    #[error("Deck audio tidak tersedia")]
    DeckUnavailable,

    #[error("Deck {0} tidak dikenal")]
    DeckNotFound(usize),

    #[error("Sync membutuhkan dua deck yang berbeda")]
    InvalidSync,

    #[error("Sync membutuhkan BPM dari kedua deck")]
    SyncNotReady,

    #[error("Deck tidak merespons dalam batas waktu")]
    DeckTimeout,

    #[error("Gagal memulai thread deck: {0}")]
    DeckThreadSpawn(String),

    #[error("Gagal memulai thread Auto DJ: {0}")]
    AutoDjThreadSpawn(String),

    #[error("Error I/O: {0}")]
    Io(String),

    #[error("Error serialisasi: {0}")]
    Serialize(String),

    #[error("Error sampler: {0}")]
    Sampler(String),
}

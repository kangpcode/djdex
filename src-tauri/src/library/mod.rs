//! Modul Manajemen Library Musik, Database SQLite, Scanner, Playlist, dan Cue Preview.

pub mod db;
pub mod playlist;
pub mod preview;
pub mod scanner;

pub use db::{
    CrateItem, HistoryItem, LibraryDb, LibraryTrack, PlaylistItem, SmartFilter, TrackQuery,
};
pub use playlist::{export_m3u, import_m3u, import_pls};
pub use preview::{PreviewCommand, PreviewController, PreviewPlayerRt, PreviewStatus};
pub use scanner::{analyze_track_audio, extract_metadata, ScanProgress, ScannerManager};

#[cfg(test)]
mod tests;

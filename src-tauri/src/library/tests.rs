//! Unit test untuk Library Database, Crates, Playlists, Smart Playlists, dan M3U.

use super::db::*;
use super::playlist::*;

fn sample_track(id: i64, title: &str, artist: &str, bpm: f64, key: &str, genre: &str) -> LibraryTrack {
    LibraryTrack {
        id,
        file_path: format!("/music/{artist} - {title}.mp3"),
        title: title.to_string(),
        artist: artist.to_string(),
        album: Some("Test Album".to_string()),
        genre: Some(genre.to_string()),
        year: Some(2024),
        bpm: Some(bpm),
        key_name: Some(key.to_string()),
        duration_secs: 210.0,
        rating: 4,
        color: None,
        play_count: 0,
        date_added: "1700000000".to_string(),
        analyzed: true,
        loudness_lufs: Some(-8.5),
    }
}

#[test]
fn test_database_crud_and_search() {
    let db = LibraryDb::in_memory().expect("db in memory");

    let t1 = sample_track(0, "Deep House Grooves", "DJ Alpha", 124.0, "8A", "House");
    let t2 = sample_track(0, "Festival Anthem", "Beta Beats", 128.0, "11B", "EDM");
    let t3 = sample_track(0, "Midnight Chill", "Chill Dave", 95.0, "4A", "Lo-Fi");

    let id1 = db.insert_or_update_track(&t1).expect("insert t1");
    let _id2 = db.insert_or_update_track(&t2).expect("insert t2");
    let _id3 = db.insert_or_update_track(&t3).expect("insert t3");

    // Cari dengan teks
    let res = db.get_tracks(TrackQuery {
        search: Some("House".to_string()),
        ..Default::default()
    }).expect("query");
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].title, "Deep House Grooves");

    // Sorting by BPM desc
    let sorted = db.get_tracks(TrackQuery {
        sort_column: Some("bpm".to_string()),
        sort_descending: Some(true),
        ..Default::default()
    }).expect("sorted");
    assert_eq!(sorted.len(), 3);
    assert_eq!(sorted[0].bpm, Some(128.0));
    assert_eq!(sorted[2].bpm, Some(95.0));

    // Update rating
    db.update_rating(id1, 5).expect("update rating");
    let updated = db.get_tracks(TrackQuery {
        search: Some("Deep House".to_string()),
        ..Default::default()
    }).expect("get updated");
    assert_eq!(updated[0].rating, 5);
}

#[test]
fn test_crates_management() {
    let db = LibraryDb::in_memory().expect("db");
    let t1 = sample_track(0, "Track One", "Artist", 120.0, "8A", "House");
    let id1 = db.insert_or_update_track(&t1).expect("insert");

    let crate_id = db.create_crate("Festival Crates", Some("#00e5ff")).expect("create crate");
    let crates = db.list_crates().expect("list");
    assert_eq!(crates.len(), 1);
    assert_eq!(crates[0].track_count, 0);

    db.add_track_to_crate(crate_id, id1).expect("add to crate");
    let crates_after = db.list_crates().expect("list after");
    assert_eq!(crates_after[0].track_count, 1);

    // Query track di crate
    let tracks_in_crate = db.get_tracks(TrackQuery {
        crate_id: Some(crate_id),
        ..Default::default()
    }).expect("tracks in crate");
    assert_eq!(tracks_in_crate.len(), 1);
    assert_eq!(tracks_in_crate[0].id, id1);

    db.remove_track_from_crate(crate_id, id1).expect("remove");
    let crates_empty = db.list_crates().expect("list empty");
    assert_eq!(crates_empty[0].track_count, 0);
}

#[test]
fn test_smart_playlists() {
    let db = LibraryDb::in_memory().expect("db");
    let t1 = sample_track(0, "Slow R&B", "Singer", 85.0, "5A", "R&B");
    let t2 = sample_track(0, "Peaktime Techno", "Producer", 132.0, "8A", "Techno");
    let t3 = sample_track(0, "Club House", "DJ Master", 126.0, "8A", "House");

    db.insert_or_update_track(&t1).expect("t1");
    db.insert_or_update_track(&t2).expect("t2");
    db.insert_or_update_track(&t3).expect("t3");

    // Buat Smart Playlist untuk BPM 120-130
    let filter = SmartFilter {
        min_bpm: Some(120.0),
        max_bpm: Some(130.0),
        ..Default::default()
    };
    let pl_id = db.create_playlist("House Zone 120-130", Some(filter)).expect("create smart pl");

    let tracks = db.get_tracks(TrackQuery {
        playlist_id: Some(pl_id),
        ..Default::default()
    }).expect("smart playlist tracks");

    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].title, "Club House");
}

#[test]
fn test_history_logging() {
    let db = LibraryDb::in_memory().expect("db");
    let t1 = sample_track(0, "Opening Track", "DJ", 125.0, "8A", "House");
    let id1 = db.insert_or_update_track(&t1).expect("t1");

    db.add_to_history(id1, 0).expect("add history");
    let history = db.get_history(10).expect("get history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].title, "Opening Track");
    assert_eq!(history[0].deck_slot, 0);

    // Play count naik
    let t = db.get_tracks(TrackQuery::default()).expect("tracks");
    assert_eq!(t[0].play_count, 1);
}

#[test]
fn test_m3u_export() {
    let temp_dir = std::env::temp_dir();
    let m3u_path = temp_dir.join("test_playlist.m3u8");

    let t1 = sample_track(1, "Track A", "Artist 1", 120.0, "8A", "House");
    let t2 = sample_track(2, "Track B", "Artist 2", 125.0, "9A", "Techno");
    let tracks = vec![t1, t2];

    export_m3u(1, &m3u_path, &tracks).expect("export m3u");
    assert!(m3u_path.exists());

    let content = std::fs::read_to_string(&m3u_path).expect("read");
    assert!(content.contains("#EXTM3U"));
    assert!(content.contains("Artist 1 - Track A"));
    assert!(content.contains("Artist 2 - Track B"));

    let _ = std::fs::remove_file(m3u_path);
}

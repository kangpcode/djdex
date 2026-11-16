//! DJDeX By Kangpcode - entry point library Tauri.

#![forbid(unsafe_code)]

mod analysis;
mod audio;
mod commands;
mod dsp;
mod error;
mod state;

use state::AppState;

/// Jalankan aplikasi desktop DJDeX.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_audio_devices,
            commands::get_engine_status,
            commands::start_audio_engine,
            commands::set_test_tone,
            commands::stop_audio_engine,
            commands::load_track,
            commands::get_deck_status,
            commands::deck_play,
            commands::deck_pause,
            commands::deck_seek,
            commands::deck_set_cue,
            commands::deck_cue_jump,
            commands::deck_set_gain,
            commands::deck_set_speed,
            commands::deck_set_pitch_range,
            commands::deck_set_keylock,
            commands::deck_set_semitones,
            commands::deck_set_bpm,
            commands::deck_set_hot_cue,
            commands::deck_trigger_hot_cue,
            commands::deck_clear_hot_cue,
            commands::deck_set_loop,
            commands::deck_exit_loop,
            commands::deck_beat_jump,
            commands::deck_set_bend,
            commands::deck_unload,
            commands::sync_decks,
            commands::get_waveform,
            commands::get_mixer_status,
            commands::set_mixer,
            commands::get_fx_status,
            commands::set_fx,
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi DJDeX");
}

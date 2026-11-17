//! DJDeX By Kangpcode - entry point library Tauri.

#![forbid(unsafe_code)]

mod analysis;
mod audio;
mod commands;
mod dsp;
mod error;
pub mod sampler;
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
            commands::get_auto_dj_status,
            commands::set_auto_dj,
            commands::auto_dj_trigger,
            commands::auto_dj_cancel,
            commands::get_sampler_status,
            commands::trigger_sampler_pad,
            commands::release_sampler_pad,
            commands::stop_sampler_pad,
            commands::stop_all_sampler_pads,
            commands::select_sampler_bank,
            commands::set_sampler_volume,
            commands::update_sampler_pad,
            commands::load_sampler_pad_file,
            commands::capture_deck_to_pad,
            commands::update_sequencer,
            commands::export_sample_pack,
            commands::import_sample_pack,
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi DJDeX");
}

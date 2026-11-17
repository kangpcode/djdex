//! DJDeX By Kangpcode - entry point library Tauri.

#![forbid(unsafe_code)]

mod analysis;
mod audio;
mod commands;
mod dsp;
mod error;
pub mod library;
pub mod midi;
pub mod sampler;
pub mod skin;
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
            commands::get_library_tracks,
            commands::scan_library_folder,
            commands::start_batch_analyze,
            commands::get_scan_progress,
            commands::create_crate,
            commands::delete_crate,
            commands::list_crates,
            commands::add_track_to_crate,
            commands::remove_track_from_crate,
            commands::create_playlist,
            commands::delete_playlist,
            commands::list_playlists,
            commands::add_track_to_playlist,
            commands::remove_track_from_playlist,
            commands::import_playlist,
            commands::export_playlist,
            commands::update_track_rating,
            commands::update_track_color,
            commands::delete_library_track,
            commands::get_library_history,
            commands::preview_play,
            commands::preview_stop,
            commands::preview_seek,
            commands::get_preview_status,
            commands::list_midi_inputs,
            commands::list_midi_outputs,
            commands::connect_midi_device,
            commands::disconnect_midi_device,
            commands::get_midi_status,
            commands::start_midi_learn,
            commands::cancel_midi_learn,
            commands::get_midi_mappings,
            commands::set_midi_mapping,
            commands::remove_midi_mapping,
            commands::clear_midi_mappings,
            commands::load_midi_preset,
            commands::save_midi_preset,
            commands::list_midi_presets,
            commands::get_keyboard_mappings,
            commands::set_keyboard_mapping,
            commands::remove_keyboard_mapping,
            commands::reset_keyboard_mappings,
            commands::handle_keyboard_shortcut,
            commands::list_skins,
            commands::get_active_skin,
            commands::set_active_skin,
            commands::save_custom_skin,
            commands::delete_skin,
            commands::export_skin_pack,
            commands::import_skin_pack,
            commands::start_recording,
            commands::stop_recording,
            commands::pause_recording,
            commands::resume_recording,
            commands::split_recording,
            commands::get_recorder_status,
            commands::start_broadcast,
            commands::stop_broadcast,
            commands::get_broadcast_status,
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi DJDeX");
}

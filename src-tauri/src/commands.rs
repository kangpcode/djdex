//! Command IPC Tauri: jembatan UI React -> audio engine.
//!
//! Semua command berjalan di thread non-RT. Argumen dari frontend memakai
//! camelCase (default Tauri v2), DTO keluar memakai `rename_all = "camelCase"`.

use tauri::State;

use crate::analysis::waveform::WaveformDto;
use crate::audio::autodj::{AutoDjStatus, AutoDjUpdate};
use crate::audio::deck::DeckStatus;
use crate::audio::device::{list_output_devices, AudioDeviceInfo};
use crate::audio::engine::{AudioEngine, EngineStatus, StartRequest};
use crate::audio::fx::{FxParams, FxSlotUpdate};
use crate::audio::mixer::{MixerParams, MixerUpdate};
use crate::library::db::{
    CrateItem, HistoryItem, LibraryTrack, PlaylistItem, SmartFilter, TrackQuery,
};
use crate::library::preview::PreviewStatus;
use crate::library::scanner::ScanProgress;
use crate::midi::{
    DjAction, KeyboardBinding, MidiLearnStatus, MidiMapping, MidiPortInfo, MidiStatus,
};
use crate::sampler::{PadUpdate, SamplerStatus, SequencerStatus, SequencerUpdate};
use crate::state::AppState;

type IpcResult<T> = Result<T, String>;

fn deck_slot(deck: Option<u8>) -> usize {
    usize::from(deck.unwrap_or(0))
}

/// Daftar perangkat output beserta kapabilitasnya.
#[tauri::command]
pub fn list_audio_devices() -> IpcResult<Vec<AudioDeviceInfo>> {
    list_output_devices().map_err(|err| err.to_string())
}

/// Status engine untuk polling meter/statistik.
#[tauri::command]
pub fn get_engine_status(state: State<'_, AppState>) -> EngineStatus {
    state.status()
}

/// Buka (atau buka ulang) stream output dengan konfigurasi tertentu.
#[tauri::command]
pub fn start_audio_engine(
    state: State<'_, AppState>,
    request: StartRequest,
) -> IpcResult<EngineStatus> {
    let engine = AudioEngine::start(request).map_err(|err| err.to_string())?;
    let status = engine.status();

    // Engine lama dimatikan setelah lock state dilepas.
    drop(state.install(engine));

    Ok(status)
}

/// Nyalakan/matikan test tone dan ubah frekuensi/gain-nya (lock-free).
#[tauri::command]
pub fn set_test_tone(
    state: State<'_, AppState>,
    enabled: Option<bool>,
    freq_hz: Option<f32>,
    gain_db: Option<f32>,
) -> IpcResult<EngineStatus> {
    state
        .set_tone(enabled, freq_hz, gain_db)
        .map_err(|err| err.to_string())
}

/// Tutup stream audio dan lepas engine.
#[tauri::command]
pub fn stop_audio_engine(state: State<'_, AppState>) -> EngineStatus {
    drop(state.take());
    EngineStatus::idle()
}

// ---- Deck (Fase 2–5) -----------------------------------------------------

/// Muat file audio ke deck 0/1 (path dari dialog/drag & drop).
#[tauri::command]
pub fn load_track(
    state: State<'_, AppState>,
    path: String,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .load_track(deck_slot(deck), path)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_deck_status(state: State<'_, AppState>, deck: Option<u8>) -> DeckStatus {
    state
        .deck_status(deck_slot(deck))
        .unwrap_or_else(|_| DeckStatus::idle())
}

#[tauri::command]
pub fn deck_play(state: State<'_, AppState>, deck: Option<u8>) -> IpcResult<DeckStatus> {
    state
        .deck_play(deck_slot(deck))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_pause(state: State<'_, AppState>, deck: Option<u8>) -> IpcResult<DeckStatus> {
    state
        .deck_pause(deck_slot(deck))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_seek(
    state: State<'_, AppState>,
    position_secs: f64,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_seek(deck_slot(deck), position_secs)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_cue(state: State<'_, AppState>, deck: Option<u8>) -> IpcResult<DeckStatus> {
    state
        .deck_set_cue(deck_slot(deck))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_cue_jump(state: State<'_, AppState>, deck: Option<u8>) -> IpcResult<DeckStatus> {
    state
        .deck_cue_jump(deck_slot(deck))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_gain(
    state: State<'_, AppState>,
    gain_db: f32,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_gain(deck_slot(deck), gain_db)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_speed(
    state: State<'_, AppState>,
    speed: f32,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_speed(deck_slot(deck), speed)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_pitch_range(
    state: State<'_, AppState>,
    range: f32,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_pitch_range(deck_slot(deck), range)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_keylock(
    state: State<'_, AppState>,
    enabled: bool,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_keylock(deck_slot(deck), enabled)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_semitones(
    state: State<'_, AppState>,
    semitones: f32,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_semitones(deck_slot(deck), semitones)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_bpm(
    state: State<'_, AppState>,
    bpm: f64,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_bpm(deck_slot(deck), bpm)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_hot_cue(
    state: State<'_, AppState>,
    cue: u8,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_hot_cue(deck_slot(deck), cue)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_trigger_hot_cue(
    state: State<'_, AppState>,
    cue: u8,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_trigger_hot_cue(deck_slot(deck), cue)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_clear_hot_cue(
    state: State<'_, AppState>,
    cue: u8,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_clear_hot_cue(deck_slot(deck), cue)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_loop(
    state: State<'_, AppState>,
    start_secs: f64,
    end_secs: f64,
    beats: f64,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_loop(deck_slot(deck), start_secs, end_secs, beats)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_exit_loop(state: State<'_, AppState>, deck: Option<u8>) -> IpcResult<DeckStatus> {
    state
        .deck_exit_loop(deck_slot(deck))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_beat_jump(
    state: State<'_, AppState>,
    seconds: f64,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_beat_jump(deck_slot(deck), seconds)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_set_bend(
    state: State<'_, AppState>,
    bend: f32,
    deck: Option<u8>,
) -> IpcResult<DeckStatus> {
    state
        .deck_set_bend(deck_slot(deck), bend)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn deck_unload(state: State<'_, AppState>, deck: Option<u8>) -> IpcResult<DeckStatus> {
    state
        .deck_unload(deck_slot(deck))
        .map_err(|err| err.to_string())
}

/// Selaraskan BPM + fase deck `target` ke deck `source`.
#[tauri::command]
pub fn sync_decks(state: State<'_, AppState>, source: u8, target: u8) -> IpcResult<DeckStatus> {
    state
        .sync_deck(usize::from(source), usize::from(target))
        .map_err(|err| err.to_string())
}

// ---- Mixer (Fase 4) ------------------------------------------------------

/// Snapshot parameter mixer (channel strip, crossfader, master, cue).
#[tauri::command]
pub fn get_mixer_status(state: State<'_, AppState>) -> MixerParams {
    state.mixer_status()
}

/// Terapkan update parsial mixer; field yang tidak dikirim tidak berubah.
#[tauri::command]
pub fn set_mixer(state: State<'_, AppState>, update: MixerUpdate) -> IpcResult<MixerParams> {
    state.set_mixer(update).map_err(|err| err.to_string())
}

// ---- FX (Fase 6) ---------------------------------------------------------

#[tauri::command]
pub fn get_fx_status(state: State<'_, AppState>) -> FxParams {
    state.fx_status()
}

#[tauri::command]
pub fn set_fx(state: State<'_, AppState>, update: FxSlotUpdate) -> IpcResult<FxParams> {
    state.set_fx(update).map_err(|err| err.to_string())
}

// ---- Auto DJ (Fase 6) ----------------------------------------------------

#[tauri::command]
pub fn get_auto_dj_status(state: State<'_, AppState>) -> AutoDjStatus {
    state.auto_dj_status()
}

#[tauri::command]
pub fn set_auto_dj(state: State<'_, AppState>, update: AutoDjUpdate) -> IpcResult<AutoDjStatus> {
    state.set_auto_dj(update).map_err(|err| err.to_string())
}

/// Mulai transisi sekarang tanpa menunggu akhir track.
#[tauri::command]
pub fn auto_dj_trigger(state: State<'_, AppState>) -> IpcResult<AutoDjStatus> {
    state.trigger_auto_dj().map_err(|err| err.to_string())
}

/// Batalkan transisi yang sedang berjalan dan kembalikan crossfader.
#[tauri::command]
pub fn auto_dj_cancel(state: State<'_, AppState>) -> IpcResult<AutoDjStatus> {
    state.cancel_auto_dj().map_err(|err| err.to_string())
}

/// Ambil waveform track aktif (downsample di Rust agar payload ringan).
#[tauri::command]
pub fn get_waveform(
    state: State<'_, AppState>,
    max_points: Option<usize>,
    deck: Option<u8>,
) -> IpcResult<Option<WaveformDto>> {
    state
        .waveform(
            deck_slot(deck),
            max_points.unwrap_or(4096).clamp(64, 16_384),
        )
        .map_err(|err| err.to_string())
}

// ---- Sampler / Remixer & Step Sequencer (Fase 7) -------------------------

#[tauri::command]
pub fn get_sampler_status(state: State<'_, AppState>) -> IpcResult<SamplerStatus> {
    state.sampler_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn trigger_sampler_pad(
    state: State<'_, AppState>,
    pad: usize,
    velocity: Option<f32>,
) -> IpcResult<()> {
    state.trigger_sampler_pad(pad, velocity).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn release_sampler_pad(state: State<'_, AppState>, pad: usize) -> IpcResult<()> {
    state.release_sampler_pad(pad).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_sampler_pad(state: State<'_, AppState>, pad: usize) -> IpcResult<()> {
    state.stop_sampler_pad(pad).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_all_sampler_pads(state: State<'_, AppState>) -> IpcResult<()> {
    state.stop_all_sampler_pads().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn select_sampler_bank(state: State<'_, AppState>, bank: usize) -> IpcResult<SamplerStatus> {
    state.select_sampler_bank(bank).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_sampler_volume(state: State<'_, AppState>, volume: f32) -> IpcResult<SamplerStatus> {
    state.set_sampler_volume(volume).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_sampler_pad(
    state: State<'_, AppState>,
    pad: usize,
    update: PadUpdate,
) -> IpcResult<SamplerStatus> {
    state.update_sampler_pad(pad, update).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_sampler_pad_file(
    state: State<'_, AppState>,
    pad: usize,
    path: String,
) -> IpcResult<SamplerStatus> {
    state.load_sampler_pad_file(pad, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn capture_deck_to_pad(
    state: State<'_, AppState>,
    pad: usize,
    deck: Option<u8>,
    beats: Option<f32>,
) -> IpcResult<SamplerStatus> {
    state
        .capture_deck_to_pad(pad, deck_slot(deck), beats)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_sequencer(
    state: State<'_, AppState>,
    update: SequencerUpdate,
) -> IpcResult<SequencerStatus> {
    state.update_sequencer(update).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_sample_pack(state: State<'_, AppState>, path: String) -> IpcResult<()> {
    state.export_sample_pack(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_sample_pack(
    state: State<'_, AppState>,
    path: String,
) -> IpcResult<SamplerStatus> {
    state.import_sample_pack(path).map_err(|e| e.to_string())
}

// ---- Library, Crate, Playlist & Preview (Fase 8) -------------------------

#[tauri::command]
pub fn get_library_tracks(
    state: State<'_, AppState>,
    query: Option<TrackQuery>,
) -> IpcResult<Vec<LibraryTrack>> {
    state
        .get_library_tracks(query.unwrap_or_default())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_library_folder(
    state: State<'_, AppState>,
    folder_path: String,
) -> IpcResult<ScanProgress> {
    state
        .scan_library_folder(folder_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_batch_analyze(
    state: State<'_, AppState>,
    track_ids: Option<Vec<i64>>,
) -> IpcResult<ScanProgress> {
    state
        .start_batch_analyze(track_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_scan_progress(state: State<'_, AppState>) -> ScanProgress {
    state.get_scan_progress()
}

#[tauri::command]
pub fn create_crate(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> IpcResult<i64> {
    state.create_crate(name, color).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_crate(state: State<'_, AppState>, id: i64) -> IpcResult<()> {
    state.delete_crate(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_crates(state: State<'_, AppState>) -> IpcResult<Vec<CrateItem>> {
    state.list_crates().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_track_to_crate(
    state: State<'_, AppState>,
    crate_id: i64,
    track_id: i64,
) -> IpcResult<()> {
    state
        .add_track_to_crate(crate_id, track_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_track_from_crate(
    state: State<'_, AppState>,
    crate_id: i64,
    track_id: i64,
) -> IpcResult<()> {
    state
        .remove_track_from_crate(crate_id, track_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_playlist(
    state: State<'_, AppState>,
    name: String,
    smart_filter: Option<SmartFilter>,
) -> IpcResult<i64> {
    state
        .create_playlist(name, smart_filter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, id: i64) -> IpcResult<()> {
    state.delete_playlist(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_playlists(state: State<'_, AppState>) -> IpcResult<Vec<PlaylistItem>> {
    state.list_playlists().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_track_to_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    track_id: i64,
) -> IpcResult<()> {
    state
        .add_track_to_playlist(playlist_id, track_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_track_from_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    track_id: i64,
) -> IpcResult<()> {
    state
        .remove_track_from_playlist(playlist_id, track_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_playlist(state: State<'_, AppState>, file_path: String) -> IpcResult<i64> {
    state.import_playlist(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    dest_path: String,
) -> IpcResult<()> {
    state
        .export_playlist(playlist_id, dest_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_track_rating(
    state: State<'_, AppState>,
    track_id: i64,
    rating: u32,
) -> IpcResult<()> {
    state
        .update_track_rating(track_id, rating)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_track_color(
    state: State<'_, AppState>,
    track_id: i64,
    color: Option<String>,
) -> IpcResult<()> {
    state
        .update_track_color(track_id, color)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_library_track(state: State<'_, AppState>, track_id: i64) -> IpcResult<()> {
    state
        .delete_library_track(track_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_library_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> IpcResult<Vec<HistoryItem>> {
    state
        .get_library_history(limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_play(
    state: State<'_, AppState>,
    path: String,
    start_secs: Option<f64>,
) -> IpcResult<PreviewStatus> {
    state
        .preview_play(path, start_secs.unwrap_or(0.0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_stop(state: State<'_, AppState>) -> IpcResult<PreviewStatus> {
    state.preview_stop().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_seek(state: State<'_, AppState>, seconds: f64) -> IpcResult<PreviewStatus> {
    state.preview_seek(seconds).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_preview_status(state: State<'_, AppState>) -> PreviewStatus {
    state.preview_status()
}

// ---- MIDI & Keyboard (Fase 9) --------------------------------------------

#[tauri::command]
pub fn list_midi_inputs(state: State<'_, AppState>) -> IpcResult<Vec<MidiPortInfo>> {
    state.list_midi_inputs()
}

#[tauri::command]
pub fn list_midi_outputs(state: State<'_, AppState>) -> IpcResult<Vec<MidiPortInfo>> {
    state.list_midi_outputs()
}

#[tauri::command]
pub fn connect_midi_device(
    state: State<'_, AppState>,
    input_index: Option<usize>,
    output_index: Option<usize>,
) -> IpcResult<MidiStatus> {
    state.connect_midi_device(input_index, output_index)
}

#[tauri::command]
pub fn disconnect_midi_device(state: State<'_, AppState>) -> MidiStatus {
    state.disconnect_midi_device()
}

#[tauri::command]
pub fn get_midi_status(state: State<'_, AppState>) -> MidiStatus {
    state.get_midi_status()
}

#[tauri::command]
pub fn start_midi_learn(state: State<'_, AppState>, action: DjAction) -> MidiLearnStatus {
    state.start_midi_learn(action)
}

#[tauri::command]
pub fn cancel_midi_learn(state: State<'_, AppState>) -> MidiLearnStatus {
    state.cancel_midi_learn()
}

#[tauri::command]
pub fn get_midi_mappings(state: State<'_, AppState>) -> Vec<MidiMapping> {
    state.get_midi_mappings()
}

#[tauri::command]
pub fn set_midi_mapping(state: State<'_, AppState>, mapping: MidiMapping) -> IpcResult<()> {
    state.set_midi_mapping(mapping);
    Ok(())
}

#[tauri::command]
pub fn remove_midi_mapping(state: State<'_, AppState>, id: String) -> IpcResult<bool> {
    Ok(state.remove_midi_mapping(&id))
}

#[tauri::command]
pub fn clear_midi_mappings(state: State<'_, AppState>) -> IpcResult<()> {
    state.clear_midi_mappings();
    Ok(())
}

#[tauri::command]
pub fn load_midi_preset(state: State<'_, AppState>, name: String) -> IpcResult<MidiStatus> {
    state.load_midi_preset(&name)
}

#[tauri::command]
pub fn save_midi_preset(state: State<'_, AppState>, name: String) -> IpcResult<MidiStatus> {
    state.save_midi_preset(&name)
}

#[tauri::command]
pub fn list_midi_presets(state: State<'_, AppState>) -> Vec<String> {
    state.list_midi_presets()
}

#[tauri::command]
pub fn get_keyboard_mappings(state: State<'_, AppState>) -> Vec<KeyboardBinding> {
    state.get_keyboard_mappings()
}

#[tauri::command]
pub fn set_keyboard_mapping(
    state: State<'_, AppState>,
    binding: KeyboardBinding,
) -> IpcResult<()> {
    state.set_keyboard_mapping(binding);
    Ok(())
}

#[tauri::command]
pub fn remove_keyboard_mapping(
    state: State<'_, AppState>,
    key: String,
    ctrl: Option<bool>,
    shift: Option<bool>,
    alt: Option<bool>,
) -> IpcResult<bool> {
    Ok(state.remove_keyboard_mapping(
        &key,
        ctrl.unwrap_or(false),
        shift.unwrap_or(false),
        alt.unwrap_or(false),
    ))
}

#[tauri::command]
pub fn reset_keyboard_mappings(state: State<'_, AppState>) -> Vec<KeyboardBinding> {
    state.reset_keyboard_mappings()
}

#[tauri::command]
pub fn handle_keyboard_shortcut(
    state: State<'_, AppState>,
    key: String,
    ctrl: Option<bool>,
    shift: Option<bool>,
    alt: Option<bool>,
) -> IpcResult<Option<DjAction>> {
    state.handle_keyboard_shortcut(
        &key,
        ctrl.unwrap_or(false),
        shift.unwrap_or(false),
        alt.unwrap_or(false),
    )
}

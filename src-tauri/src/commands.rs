//! Command IPC Tauri: jembatan UI React -> audio engine.
//!
//! Semua command berjalan di thread non-RT. Argumen dari frontend memakai
//! camelCase (default Tauri v2), DTO keluar memakai `rename_all = "camelCase"`.

use tauri::State;

use crate::analysis::waveform::WaveformDto;
use crate::audio::deck::DeckStatus;
use crate::audio::device::{list_output_devices, AudioDeviceInfo};
use crate::audio::engine::{AudioEngine, EngineStatus, StartRequest};
use crate::audio::mixer::{MixerParams, MixerUpdate};
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

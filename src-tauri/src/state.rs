//! State global aplikasi yang dikelola Tauri.
//!
//! Engine disimpan dalam `Mutex<Option<..>>` hanya karena lifecycle-nya perlu
//! bisa diganti/dimatikan dari command. Mutex ini TIDAK pernah dipakai di jalur
//! audio real-time.

use std::sync::Arc;
use parking_lot::Mutex;

use crate::analysis::waveform::WaveformDto;
use crate::audio::autodj::{AutoDjStatus, AutoDjUpdate};
use crate::audio::deck::{Deck, DeckStatus};
use crate::audio::decoder::TrackDecoder;
use crate::audio::engine::{AudioEngine, EngineStatus};
use crate::audio::fx::{FxParams, FxSlotUpdate};
use crate::audio::mixer::{MixerParams, MixerUpdate};
use crate::audio::resampler::StereoResampler;
use crate::error::AudioError;
use crate::library::db::{
    CrateItem, HistoryItem, LibraryDb, LibraryTrack, PlaylistItem, SmartFilter, TrackQuery,
};
use crate::library::preview::PreviewStatus;
use crate::library::scanner::{ScanProgress, ScannerManager};
use crate::midi::{
    DjAction, KeyboardBinding, MidiLearnStatus, MidiMapping, MidiPortInfo, MidiStatus,
    MidiManager,
};
use crate::sampler::{PadUpdate, SamplerStatus, SequencerStatus, SequencerUpdate};

pub struct AppState {
    engine: Arc<Mutex<Option<AudioEngine>>>,
    library: Arc<LibraryDb>,
    scanner: ScannerManager,
    midi: Arc<MidiManager>,
}

impl Default for AppState {
    fn default() -> Self {
        let db_path = default_db_path();
        let db = Arc::new(
            LibraryDb::new(db_path).unwrap_or_else(|_| LibraryDb::in_memory().unwrap()),
        );
        let scanner = ScannerManager::new();
        let engine = Arc::new(Mutex::new(None));
        let presets_dir = default_presets_dir();
        let midi = MidiManager::new(Some(presets_dir), Arc::clone(&engine));
        Self {
            engine,
            library: db,
            scanner,
            midi,
        }
    }
}

fn default_presets_dir() -> std::path::PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        std::path::PathBuf::from(appdata).join("djdex").join("presets")
    } else if let Ok(home) = std::env::var("HOME") {
        std::path::PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("djdex")
            .join("presets")
    } else {
        std::path::PathBuf::from("presets")
    }
}

fn default_db_path() -> std::path::PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        std::path::PathBuf::from(appdata).join("djdex").join("djdex_library.db")
    } else if let Ok(home) = std::env::var("HOME") {
        std::path::PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("djdex")
            .join("djdex_library.db")
    } else {
        std::path::PathBuf::from("djdex_library.db")
    }
}

impl AppState {
    /// Status engine saat ini, atau status idle bila belum diinisialisasi.
    pub fn status(&self) -> EngineStatus {
        self.engine
            .lock()
            .as_ref()
            .map(AudioEngine::status)
            .unwrap_or_else(EngineStatus::idle)
    }

    /// Status deck; error bila engine belum berjalan atau slot tidak valid.
    pub fn deck_status(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        self.with_engine(|engine| engine.deck_status(slot))
    }

    /// Jalankan aksi pada engine aktif.
    fn with_engine<T>(
        &self,
        action: impl FnOnce(&AudioEngine) -> Result<T, AudioError>,
    ) -> Result<T, AudioError> {
        let guard = self.engine.lock();
        let engine = guard.as_ref().ok_or(AudioError::NotInitialized)?;
        action(engine)
    }

    /// Jalankan aksi pada satu deck, lalu kembalikan status terbarunya.
    fn deck_action(
        &self,
        slot: usize,
        action: impl FnOnce(&Deck),
    ) -> Result<DeckStatus, AudioError> {
        self.with_engine(|engine| {
            let deck = engine.deck(slot)?;
            action(deck);
            engine.deck_status(slot)
        })
    }

    /// Pasang engine baru dan kembalikan engine lama (dimatikan pemanggil di
    /// luar lock agar thread audio tidak diblokir state global).
    pub fn install(&self, engine: AudioEngine) -> Option<AudioEngine> {
        self.engine.lock().replace(engine)
    }

    /// Lepas engine dari state tanpa mematikannya.
    pub fn take(&self) -> Option<AudioEngine> {
        self.engine.lock().take()
    }

    /// Update parameter test tone pada engine aktif.
    pub fn set_tone(
        &self,
        enabled: Option<bool>,
        freq_hz: Option<f32>,
        gain_db: Option<f32>,
    ) -> Result<EngineStatus, AudioError> {
        self.with_engine(|engine| {
            engine.set_tone(enabled, freq_hz, gain_db);
            Ok(engine.status())
        })
    }

    // ---- Deck (Fase 2–5) -------------------------------------------------

    pub fn load_track(&self, slot: usize, path: String) -> Result<DeckStatus, AudioError> {
        let status = self.with_engine(|engine| engine.load_track(slot, path.clone()))?;
        if let Ok(tracks) = self.library.get_tracks(TrackQuery {
            search: Some(path.clone()),
            ..Default::default()
        }) {
            if let Some(t) = tracks.iter().find(|t| t.file_path == path) {
                let _ = self.library.add_to_history(t.id, slot);
            }
        }
        Ok(status)
    }

    pub fn deck_play(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, Deck::play)
    }

    pub fn deck_pause(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, Deck::pause)
    }

    pub fn deck_seek(&self, slot: usize, position_secs: f64) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.seek(position_secs))
    }

    pub fn deck_set_cue(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, Deck::set_cue)
    }

    pub fn deck_cue_jump(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, Deck::cue_jump)
    }

    pub fn deck_set_gain(&self, slot: usize, gain_db: f32) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_gain_db(gain_db))
    }

    pub fn deck_set_speed(&self, slot: usize, speed: f32) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_speed(speed))
    }

    pub fn deck_set_pitch_range(&self, slot: usize, range: f32) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_pitch_range(range))
    }

    pub fn deck_set_keylock(&self, slot: usize, enabled: bool) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_keylock(enabled))
    }

    pub fn deck_set_semitones(
        &self,
        slot: usize,
        semitones: f32,
    ) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_semitones(semitones))
    }

    pub fn deck_set_bpm(&self, slot: usize, bpm: f64) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_bpm(bpm))
    }

    pub fn deck_set_hot_cue(&self, slot: usize, cue: u8) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.hot_cue_set(cue))
    }

    pub fn deck_trigger_hot_cue(&self, slot: usize, cue: u8) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.hot_cue_trigger(cue))
    }

    pub fn deck_clear_hot_cue(&self, slot: usize, cue: u8) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.hot_cue_clear(cue))
    }

    pub fn deck_set_loop(
        &self,
        slot: usize,
        start_secs: f64,
        end_secs: f64,
        beats: f64,
    ) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_loop(start_secs, end_secs, beats))
    }

    pub fn deck_exit_loop(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, Deck::exit_loop)
    }

    pub fn deck_beat_jump(&self, slot: usize, seconds: f64) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.beat_jump(seconds))
    }

    pub fn deck_set_bend(&self, slot: usize, bend: f32) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, |deck| deck.set_bend(bend))
    }

    pub fn deck_unload(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        self.deck_action(slot, Deck::unload)
    }

    pub fn sync_deck(&self, source: usize, target: usize) -> Result<DeckStatus, AudioError> {
        self.with_engine(|engine| engine.sync_deck(source, target))
    }

    pub fn waveform(
        &self,
        slot: usize,
        max_points: usize,
    ) -> Result<Option<WaveformDto>, AudioError> {
        self.with_engine(|engine| engine.waveform(slot, max_points))
    }

    // ---- Mixer (Fase 4) ---------------------------------------------------

    /// Snapshot mixer; default bila engine belum berjalan.
    pub fn mixer_status(&self) -> MixerParams {
        self.engine
            .lock()
            .as_ref()
            .map(AudioEngine::mixer_status)
            .unwrap_or_default()
    }

    pub fn set_mixer(&self, update: MixerUpdate) -> Result<MixerParams, AudioError> {
        self.with_engine(|engine| {
            engine.apply_mixer(update);
            Ok(engine.mixer_status())
        })
    }

    // ---- FX (Fase 6) ------------------------------------------------------

    pub fn fx_status(&self) -> FxParams {
        self.engine
            .lock()
            .as_ref()
            .map(AudioEngine::fx_status)
            .unwrap_or_default()
    }

    pub fn set_fx(&self, update: FxSlotUpdate) -> Result<FxParams, AudioError> {
        self.with_engine(|engine| {
            engine.apply_fx(update);
            Ok(engine.fx_status())
        })
    }

    // ---- Auto DJ (Fase 6) -------------------------------------------------

    pub fn auto_dj_status(&self) -> AutoDjStatus {
        self.engine
            .lock()
            .as_ref()
            .map(AudioEngine::auto_dj_status)
            .unwrap_or_default()
    }

    pub fn set_auto_dj(&self, update: AutoDjUpdate) -> Result<AutoDjStatus, AudioError> {
        self.with_engine(|engine| {
            engine.apply_auto_dj(update);
            Ok(engine.auto_dj_status())
        })
    }

    pub fn trigger_auto_dj(&self) -> Result<AutoDjStatus, AudioError> {
        self.with_engine(|engine| {
            engine.trigger_auto_dj();
            Ok(engine.auto_dj_status())
        })
    }

    pub fn cancel_auto_dj(&self) -> Result<AutoDjStatus, AudioError> {
        self.with_engine(|engine| {
            engine.cancel_auto_dj();
            Ok(engine.auto_dj_status())
        })
    }

    // ---- Sampler / Remixer & Step Sequencer (Fase 7) ----------------------

    pub fn sampler_status(&self) -> Result<SamplerStatus, AudioError> {
        self.with_engine(|engine| Ok(engine.sampler().status()))
    }

    pub fn trigger_sampler_pad(&self, pad_id: usize, velocity: Option<f32>) -> Result<(), AudioError> {
        self.with_engine(|engine| {
            engine.sampler().trigger_pad(pad_id, velocity);
            Ok(())
        })
    }

    pub fn release_sampler_pad(&self, pad_id: usize) -> Result<(), AudioError> {
        self.with_engine(|engine| {
            engine.sampler().release_pad(pad_id);
            Ok(())
        })
    }

    pub fn stop_sampler_pad(&self, pad_id: usize) -> Result<(), AudioError> {
        self.with_engine(|engine| {
            engine.sampler().stop_pad(pad_id);
            Ok(())
        })
    }

    pub fn stop_all_sampler_pads(&self) -> Result<(), AudioError> {
        self.with_engine(|engine| {
            engine.sampler().stop_all();
            Ok(())
        })
    }

    pub fn select_sampler_bank(&self, bank_id: usize) -> Result<SamplerStatus, AudioError> {
        self.with_engine(|engine| {
            engine.sampler().select_bank(bank_id);
            Ok(engine.sampler().status())
        })
    }

    pub fn set_sampler_volume(&self, vol: f32) -> Result<SamplerStatus, AudioError> {
        self.with_engine(|engine| {
            engine.sampler().set_master_volume(vol);
            Ok(engine.sampler().status())
        })
    }

    pub fn update_sampler_pad(&self, pad_id: usize, update: PadUpdate) -> Result<SamplerStatus, AudioError> {
        self.with_engine(|engine| {
            engine.sampler().update_pad(pad_id, update);
            Ok(engine.sampler().status())
        })
    }

    pub fn load_sampler_pad_file(&self, pad_id: usize, path_str: String) -> Result<SamplerStatus, AudioError> {
        self.with_engine(|engine| {
            let path = std::path::PathBuf::from(&path_str);
            let mut decoder = TrackDecoder::open(&path)?;
            let mut samples = Vec::new();
            while decoder.decode_next(&mut samples)? {}

            let source_rate = decoder.info().source_sample_rate;
            let target_rate = engine.sampler().sample_rate();

            let final_samples = if source_rate != target_rate && source_rate > 0 {
                let mut resampler = StereoResampler::new(source_rate, target_rate);
                let mut resampled = Vec::new();
                resampler.process(&samples, &mut resampled);
                resampled
            } else {
                samples
            };

            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Custom")
                .to_string();

            engine.sampler().load_pad_audio(pad_id, final_samples, target_rate, Some(name));
            Ok(engine.sampler().status())
        })
    }

    pub fn capture_deck_to_pad(
        &self,
        pad_id: usize,
        deck_slot: usize,
        beats: Option<f32>,
    ) -> Result<SamplerStatus, AudioError> {
        self.with_engine(|engine| {
            let deck = engine.deck(deck_slot)?;
            let deck_status = deck.status();
            let path = deck
                .source_path()
                .ok_or_else(|| AudioError::TrackOpen("Deck belum memuat track".to_string()))?;

            let bpm = if deck_status.bpm > 20.0 {
                deck_status.bpm
            } else {
                128.0
            };

            let (start_sec, duration_sec) = if deck_status.loop_active {
                let start = deck_status.loop_start_secs;
                let dur = (deck_status.loop_end_secs - start).max(0.05);
                (start, dur)
            } else {
                let dur = (beats.unwrap_or(4.0) as f64 * (60.0 / bpm)).clamp(0.1, 30.0);
                (deck_status.position_secs, dur)
            };

            let mut decoder = TrackDecoder::open(&path)?;
            let _ = decoder.seek(start_sec);

            let target_rate = engine.sampler().sample_rate();
            let source_rate = decoder.info().source_sample_rate;
            let target_frames = (duration_sec * source_rate as f64) as usize;

            let mut samples = Vec::new();
            while samples.len() / 2 < target_frames {
                let prev_len = samples.len();
                let more = decoder.decode_next(&mut samples)?;
                if !more || samples.len() == prev_len {
                    break;
                }
            }
            samples.truncate(target_frames * 2);

            let final_samples = if source_rate != target_rate && source_rate > 0 {
                let mut resampler = StereoResampler::new(source_rate, target_rate);
                let mut resampled = Vec::new();
                resampler.process(&samples, &mut resampled);
                resampled
            } else {
                samples
            };

            let name = format!(
                "Deck {} Slice",
                if deck_slot == 0 { "A" } else { "B" }
            );

            engine.sampler().load_pad_audio(pad_id, final_samples, target_rate, Some(name));
            Ok(engine.sampler().status())
        })
    }

    pub fn update_sequencer(&self, update: SequencerUpdate) -> Result<SequencerStatus, AudioError> {
        self.with_engine(|engine| {
            engine.sampler().update_sequencer(update);
            Ok(engine.sampler().status().sequencer)
        })
    }

    pub fn export_sample_pack(&self, dest_path: String) -> Result<(), AudioError> {
        self.with_engine(|engine| {
            engine.sampler().export_pack(std::path::Path::new(&dest_path))
        })
    }

    pub fn import_sample_pack(&self, zip_path: String) -> Result<SamplerStatus, AudioError> {
        self.with_engine(|engine| {
            engine.sampler().import_pack(std::path::Path::new(&zip_path))?;
            Ok(engine.sampler().status())
        })
    }

    // ---- Library, Crates, Playlists, and Cue Preview (Fase 8) -------------

    pub fn get_library_tracks(&self, query: TrackQuery) -> Result<Vec<LibraryTrack>, AudioError> {
        self.library.get_tracks(query)
    }

    pub fn scan_library_folder(&self, folder_path: String) -> Result<ScanProgress, AudioError> {
        let path = std::path::PathBuf::from(folder_path);
        self.scanner.start_scan(path, Arc::clone(&self.library))?;
        Ok(self.scanner.progress())
    }

    pub fn start_batch_analyze(
        &self,
        track_ids: Option<Vec<i64>>,
    ) -> Result<ScanProgress, AudioError> {
        self.scanner
            .start_batch_analyze(track_ids, Arc::clone(&self.library))?;
        Ok(self.scanner.progress())
    }

    pub fn get_scan_progress(&self) -> ScanProgress {
        self.scanner.progress()
    }

    pub fn create_crate(&self, name: String, color: Option<String>) -> Result<i64, AudioError> {
        self.library.create_crate(&name, color.as_deref())
    }

    pub fn delete_crate(&self, id: i64) -> Result<(), AudioError> {
        self.library.delete_crate(id)
    }

    pub fn list_crates(&self) -> Result<Vec<CrateItem>, AudioError> {
        self.library.list_crates()
    }

    pub fn add_track_to_crate(&self, crate_id: i64, track_id: i64) -> Result<(), AudioError> {
        self.library.add_track_to_crate(crate_id, track_id)
    }

    pub fn remove_track_from_crate(&self, crate_id: i64, track_id: i64) -> Result<(), AudioError> {
        self.library.remove_track_from_crate(crate_id, track_id)
    }

    pub fn create_playlist(
        &self,
        name: String,
        smart_filter: Option<SmartFilter>,
    ) -> Result<i64, AudioError> {
        self.library.create_playlist(&name, smart_filter)
    }

    pub fn delete_playlist(&self, id: i64) -> Result<(), AudioError> {
        self.library.delete_playlist(id)
    }

    pub fn list_playlists(&self) -> Result<Vec<PlaylistItem>, AudioError> {
        self.library.list_playlists()
    }

    pub fn add_track_to_playlist(&self, playlist_id: i64, track_id: i64) -> Result<(), AudioError> {
        self.library.add_track_to_playlist(playlist_id, track_id)
    }

    pub fn remove_track_from_playlist(
        &self,
        playlist_id: i64,
        track_id: i64,
    ) -> Result<(), AudioError> {
        self.library.remove_track_from_playlist(playlist_id, track_id)
    }

    pub fn import_playlist(&self, file_path: String) -> Result<i64, AudioError> {
        let p = std::path::Path::new(&file_path);
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext == "pls" {
            crate::library::playlist::import_pls(p, &self.library)
        } else {
            crate::library::playlist::import_m3u(p, &self.library)
        }
    }

    pub fn export_playlist(&self, playlist_id: i64, dest_path: String) -> Result<(), AudioError> {
        let tracks = self.library.get_tracks(TrackQuery {
            playlist_id: Some(playlist_id),
            ..Default::default()
        })?;
        let p = std::path::Path::new(&dest_path);
        crate::library::playlist::export_m3u(playlist_id, p, &tracks)
    }

    pub fn update_track_rating(&self, track_id: i64, rating: u32) -> Result<(), AudioError> {
        self.library.update_rating(track_id, rating)
    }

    pub fn update_track_color(
        &self,
        track_id: i64,
        color: Option<String>,
    ) -> Result<(), AudioError> {
        self.library.update_color(track_id, color.as_deref())
    }

    pub fn delete_library_track(&self, track_id: i64) -> Result<(), AudioError> {
        self.library.delete_track(track_id)
    }

    pub fn get_library_history(&self, limit: usize) -> Result<Vec<HistoryItem>, AudioError> {
        self.library.get_history(limit)
    }

    pub fn preview_play(
        &self,
        file_path: String,
        start_secs: f64,
    ) -> Result<PreviewStatus, AudioError> {
        self.with_engine(|engine| {
            engine.preview().play(file_path, start_secs)?;
            Ok(engine.preview().status())
        })
    }

    pub fn preview_stop(&self) -> Result<PreviewStatus, AudioError> {
        self.with_engine(|engine| {
            engine.preview().stop();
            Ok(engine.preview().status())
        })
    }

    pub fn preview_seek(&self, seconds: f64) -> Result<PreviewStatus, AudioError> {
        self.with_engine(|engine| {
            engine.preview().seek(seconds);
            Ok(engine.preview().status())
        })
    }

    pub fn preview_status(&self) -> PreviewStatus {
        let guard = self.engine.lock();
        if let Some(engine) = guard.as_ref() {
            engine.preview().status()
        } else {
            PreviewStatus::default()
        }
    }

    // ---- MIDI & Keyboard (Fase 9) --------------------------------------------

    pub fn list_midi_inputs(&self) -> Result<Vec<MidiPortInfo>, String> {
        self.midi.list_inputs()
    }

    pub fn list_midi_outputs(&self) -> Result<Vec<MidiPortInfo>, String> {
        self.midi.list_outputs()
    }

    pub fn connect_midi_device(
        &self,
        input_index: Option<usize>,
        output_index: Option<usize>,
    ) -> Result<MidiStatus, String> {
        self.midi.connect_device(input_index, output_index)
    }

    pub fn disconnect_midi_device(&self) -> MidiStatus {
        self.midi.disconnect_device()
    }

    pub fn get_midi_status(&self) -> MidiStatus {
        self.midi.status()
    }

    pub fn start_midi_learn(&self, action: DjAction) -> MidiLearnStatus {
        self.midi.start_learn(action)
    }

    pub fn cancel_midi_learn(&self) -> MidiLearnStatus {
        self.midi.cancel_learn()
    }

    pub fn get_midi_mappings(&self) -> Vec<MidiMapping> {
        self.midi.get_mappings()
    }

    pub fn set_midi_mapping(&self, mapping: MidiMapping) {
        self.midi.set_mapping(mapping);
    }

    pub fn remove_midi_mapping(&self, id: &str) -> bool {
        self.midi.remove_mapping(id)
    }

    pub fn clear_midi_mappings(&self) {
        self.midi.clear_mappings();
    }

    pub fn load_midi_preset(&self, name: &str) -> Result<MidiStatus, String> {
        self.midi.load_preset(name)
    }

    pub fn save_midi_preset(&self, name: &str) -> Result<MidiStatus, String> {
        self.midi.save_preset(name)
    }

    pub fn list_midi_presets(&self) -> Vec<String> {
        self.midi.list_presets()
    }

    pub fn get_keyboard_mappings(&self) -> Vec<KeyboardBinding> {
        self.midi.get_keyboard_bindings()
    }

    pub fn set_keyboard_mapping(&self, binding: KeyboardBinding) {
        self.midi.set_keyboard_binding(binding);
    }

    pub fn remove_keyboard_mapping(&self, key: &str, ctrl: bool, shift: bool, alt: bool) -> bool {
        self.midi.remove_keyboard_binding(key, ctrl, shift, alt)
    }

    pub fn reset_keyboard_mappings(&self) -> Vec<KeyboardBinding> {
        self.midi.reset_keyboard_bindings()
    }

    pub fn handle_keyboard_shortcut(
        &self,
        key: &str,
        ctrl: bool,
        shift: bool,
        alt: bool,
    ) -> Result<Option<DjAction>, String> {
        self.midi.handle_keyboard_shortcut(key, ctrl, shift, alt)
    }
}

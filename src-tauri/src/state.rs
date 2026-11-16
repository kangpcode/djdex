//! State global aplikasi yang dikelola Tauri.
//!
//! Engine disimpan dalam `Mutex<Option<..>>` hanya karena lifecycle-nya perlu
//! bisa diganti/dimatikan dari command. Mutex ini TIDAK pernah dipakai di jalur
//! audio real-time.

use parking_lot::Mutex;

use crate::analysis::waveform::WaveformDto;
use crate::audio::deck::{Deck, DeckStatus};
use crate::audio::engine::{AudioEngine, EngineStatus};
use crate::audio::mixer::{MixerParams, MixerUpdate};
use crate::error::AudioError;

#[derive(Default)]
pub struct AppState {
    engine: Mutex<Option<AudioEngine>>,
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
        self.with_engine(|engine| engine.load_track(slot, path))
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
}

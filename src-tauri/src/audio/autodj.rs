//! Auto DJ: transisi beat-synced antara dua deck yang sudah dimuat.
//!
//! Logika transisi sengaja berada di engine (thread kontrol non-RT), bukan di
//! UI. UI hanya mengirim konfigurasi dan membaca snapshot status. Thread ini
//! memakai API deck yang sudah aman dipanggil dari luar callback (channel +
//! atomic) serta menulis crossfader melalui `MixerControls`; callback audio
//! tetap tidak pernah melakukan lock, alokasi, atau I/O.
//!
//! Alur transisi:
//! 1. Deck tujuan di-sync BPM (opsional) dan di-seek ke downbeat yang sefase
//!    dengan deck aktif.
//! 2. Deck tujuan mulai playing.
//! 3. Crossfader digerakkan dari posisi saat ini ke sisi deck tujuan selama
//!    `crossfade_beats` ketukan (berdasarkan BPM efektif deck aktif).
//! 4. Deck lama di-pause setelah fade selesai; deck tujuan menjadi aktif.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver, Sender};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::audio::deck::{Deck, DeckTransport};
use crate::audio::mixer::{crossfader_gain, MixerControls};
use crate::error::AudioError;

/// Jumlah deck yang dikelola Auto DJ (selaras dengan `engine::DECK_COUNT`).
const DECK_COUNT: usize = 2;
/// Resolusi tick state machine. Cukup halus untuk crossfade dan jauh di bawah
/// ambang respons manusia; bukan jalur audio.
const TICK: Duration = Duration::from_millis(20);
/// Jeda setelah transisi agar Auto DJ tidak langsung memicu transisi balik.
const COOLDOWN: Duration = Duration::from_millis(1_200);
/// Mulai transisi otomatis sedini mungkin saat sisa track mendekati panjang
/// crossfade, ditambah margin agar target sempat mulai.
const AUTO_START_LEAD_SECS: f64 = 0.75;
const DEFAULT_BEATS: f64 = 16.0;
const MIN_BEATS: f64 = 2.0;
const MAX_BEATS: f64 = 64.0;
const MIN_FADE_SECS: f32 = 0.8;
const MAX_FADE_SECS: f32 = 120.0;
const FALLBACK_BPM: f64 = 120.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum AutoDjState {
    #[default]
    Disabled,
    Armed,
    Transitioning,
    Cooldown,
}

impl AutoDjState {
    fn to_code(self) -> u32 {
        match self {
            Self::Disabled => 0,
            Self::Armed => 1,
            Self::Transitioning => 2,
            Self::Cooldown => 3,
        }
    }

    fn from_code(code: u32) -> Self {
        match code {
            1 => Self::Armed,
            2 => Self::Transitioning,
            3 => Self::Cooldown,
            _ => Self::Disabled,
        }
    }
}

/// Update parsial konfigurasi Auto DJ; field `None` tidak diubah.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AutoDjUpdate {
    pub enabled: Option<bool>,
    pub auto_start: Option<bool>,
    pub beatmatch: Option<bool>,
    pub crossfade_beats: Option<f64>,
}

/// Snapshot Auto DJ untuk UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoDjStatus {
    pub enabled: bool,
    pub auto_start: bool,
    pub beatmatch: bool,
    pub crossfade_beats: f64,
    /// Panjang fade transisi yang sedang berjalan (0 bila tidak transisi).
    pub crossfade_secs: f32,
    /// 0..1 selama transisi.
    pub progress: f32,
    pub state: AutoDjState,
    pub active_deck: u8,
    pub next_deck: u8,
    pub message: Option<String>,
}

impl Default for AutoDjStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_start: true,
            beatmatch: true,
            crossfade_beats: DEFAULT_BEATS,
            crossfade_secs: 0.0,
            progress: 0.0,
            state: AutoDjState::Disabled,
            active_deck: 0,
            next_deck: 1,
            message: None,
        }
    }
}

fn store_f32(slot: &AtomicU32, value: f32) {
    slot.store(value.to_bits(), Ordering::Relaxed);
}

fn load_f32(slot: &AtomicU32) -> f32 {
    f32::from_bits(slot.load(Ordering::Relaxed))
}

fn store_f64(slot: &AtomicU64, value: f64) {
    slot.store(value.to_bits(), Ordering::Relaxed);
}

fn load_f64(slot: &AtomicU64) -> f64 {
    f64::from_bits(slot.load(Ordering::Relaxed))
}

/// Kontrol Auto DJ lock-free untuk UI <-> thread kontrol.
pub struct AutoDjControls {
    enabled: AtomicBool,
    auto_start: AtomicBool,
    beatmatch: AtomicBool,
    crossfade_beats: AtomicU64,
    trigger: AtomicBool,
    cancel: AtomicBool,
    state: AtomicU32,
    active_deck: AtomicU32,
    next_deck: AtomicU32,
    crossfade_secs: AtomicU32,
    progress: AtomicU32,
    message: Mutex<Option<String>>,
}

impl AutoDjControls {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            auto_start: AtomicBool::new(true),
            beatmatch: AtomicBool::new(true),
            crossfade_beats: AtomicU64::new(DEFAULT_BEATS.to_bits()),
            trigger: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
            state: AtomicU32::new(AutoDjState::Disabled.to_code()),
            active_deck: AtomicU32::new(0),
            next_deck: AtomicU32::new(1),
            crossfade_secs: AtomicU32::new(0.0_f32.to_bits()),
            progress: AtomicU32::new(0.0_f32.to_bits()),
            message: Mutex::new(None),
        }
    }

    fn apply(&self, update: AutoDjUpdate) {
        if let Some(value) = update.enabled {
            self.enabled.store(value, Ordering::Relaxed);
            if !value {
                self.cancel.store(true, Ordering::Relaxed);
            }
        }
        if let Some(value) = update.auto_start {
            self.auto_start.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.beatmatch {
            self.beatmatch.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.crossfade_beats {
            if value.is_finite() {
                store_f64(&self.crossfade_beats, value.clamp(MIN_BEATS, MAX_BEATS));
            }
        }
    }

    pub fn status(&self) -> AutoDjStatus {
        AutoDjStatus {
            enabled: self.enabled.load(Ordering::Relaxed),
            auto_start: self.auto_start.load(Ordering::Relaxed),
            beatmatch: self.beatmatch.load(Ordering::Relaxed),
            crossfade_beats: load_f64(&self.crossfade_beats),
            crossfade_secs: load_f32(&self.crossfade_secs),
            progress: load_f32(&self.progress),
            state: AutoDjState::from_code(self.state.load(Ordering::Relaxed)),
            active_deck: self.active_deck.load(Ordering::Relaxed).min(1) as u8,
            next_deck: self.next_deck.load(Ordering::Relaxed).min(1) as u8,
            message: self.message.lock().clone(),
        }
    }

    fn publish(
        &self,
        state: AutoDjState,
        active: usize,
        next: usize,
        crossfade_secs: f32,
        progress: f32,
    ) {
        self.state.store(state.to_code(), Ordering::Relaxed);
        self.active_deck
            .store(active.min(DECK_COUNT - 1) as u32, Ordering::Relaxed);
        self.next_deck
            .store(next.min(DECK_COUNT - 1) as u32, Ordering::Relaxed);
        store_f32(&self.crossfade_secs, crossfade_secs.max(0.0));
        store_f32(&self.progress, progress.clamp(0.0, 1.0));
    }

    fn set_message(&self, message: Option<&str>) {
        *self.message.lock() = message.map(str::to_string);
    }
}

impl Default for AutoDjControls {
    fn default() -> Self {
        Self::new()
    }
}

/// Handle Auto DJ yang dipegang `AudioEngine`.
pub struct AutoDj {
    controls: Arc<AutoDjControls>,
    stop: Option<Sender<()>>,
    worker: Option<JoinHandle<()>>,
}

impl AutoDj {
    pub fn start(
        decks: [Arc<Deck>; DECK_COUNT],
        mixer: Arc<MixerControls>,
    ) -> Result<Self, AudioError> {
        let controls = Arc::new(AutoDjControls::new());
        let (stop_tx, stop_rx) = bounded(1);

        let worker = AutoDjWorker {
            controls: Arc::clone(&controls),
            mixer,
            decks,
            phase: AutoDjState::Disabled,
            active: 0,
            fade: None,
            cooldown_until: None,
        };

        let handle = thread::Builder::new()
            .name("djdex-autodj".to_string())
            .spawn(move || worker.run(stop_rx))
            .map_err(|err| AudioError::AutoDjThreadSpawn(err.to_string()))?;

        Ok(Self {
            controls,
            stop: Some(stop_tx),
            worker: Some(handle),
        })
    }

    pub fn status(&self) -> AutoDjStatus {
        self.controls.status()
    }

    pub fn apply(&self, update: AutoDjUpdate) {
        self.controls.apply(update);
    }

    pub fn trigger(&self) {
        self.controls.trigger.store(true, Ordering::Relaxed);
    }

    pub fn cancel(&self) {
        self.controls.cancel.store(true, Ordering::Relaxed);
    }

    pub fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for AutoDj {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Debug, Clone, Copy)]
struct Fade {
    old: usize,
    new: usize,
    target_track_id: u64,
    start_crossfader: f32,
    target_crossfader: f32,
    started: Instant,
    duration_secs: f32,
}

struct AutoDjWorker {
    controls: Arc<AutoDjControls>,
    mixer: Arc<MixerControls>,
    decks: [Arc<Deck>; DECK_COUNT],
    phase: AutoDjState,
    active: usize,
    fade: Option<Fade>,
    cooldown_until: Option<Instant>,
}

impl AutoDjWorker {
    fn run(mut self, stop: Receiver<()>) {
        loop {
            match stop.recv_timeout(TICK) {
                Ok(()) | Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
            }
            self.tick(Instant::now());
        }
    }

    fn tick(&mut self, now: Instant) {
        let enabled = self.controls.enabled.load(Ordering::Relaxed);

        if self.controls.cancel.swap(false, Ordering::Relaxed) {
            self.cancel_transition();
        }

        if !enabled {
            if self.phase == AutoDjState::Transitioning {
                self.cancel_transition();
            }
            self.phase = AutoDjState::Disabled;
            self.publish_idle();
            return;
        }

        if self.controls.trigger.swap(false, Ordering::Relaxed)
            && self.phase != AutoDjState::Transitioning
        {
            self.try_begin(now, true);
        }

        let transports = self.transports();

        if self.phase == AutoDjState::Transitioning {
            self.tick_transition(now, transports);
            return;
        }

        if let Some(until) = self.cooldown_until {
            if now < until {
                self.phase = AutoDjState::Cooldown;
                self.publish_idle();
                return;
            }
            self.cooldown_until = None;
        }

        self.active = self.infer_active(&transports);
        self.phase = AutoDjState::Armed;
        self.controls.set_message(None);

        if self.controls.auto_start.load(Ordering::Relaxed) && self.phase == AutoDjState::Armed {
            self.maybe_auto_start(now, &transports);
        } else {
            self.publish_idle();
        }
    }

    fn transports(&self) -> [DeckTransport; DECK_COUNT] {
        [self.decks[0].transport(), self.decks[1].transport()]
    }

    /// Tentukan deck yang sedang dominan. Bila keduanya playing (mis. user
    /// memutar manual), bandingkan gain crossfader aktual.
    fn infer_active(&self, transports: &[DeckTransport; DECK_COUNT]) -> usize {
        let playing = transports.iter().filter(|deck| deck.playing).count();
        if playing == 1 {
            return transports
                .iter()
                .position(|deck| deck.playing)
                .unwrap_or(self.active);
        }
        if playing == 2 {
            let params = self.mixer.params();
            let gain_a = crossfader_gain(
                params.crossfader,
                params.crossfader_curve,
                params.channels[0].assign,
                params.crossfader_reverse,
            );
            let gain_b = crossfader_gain(
                params.crossfader,
                params.crossfader_curve,
                params.channels[1].assign,
                params.crossfader_reverse,
            );
            if (gain_b - gain_a).abs() > 0.01 {
                return if gain_b > gain_a { 1 } else { 0 };
            }
            if transports[self.active].playing {
                return self.active;
            }
            return 0;
        }

        if transports[self.active].loaded {
            self.active
        } else if transports[1 - self.active].loaded {
            1 - self.active
        } else {
            self.active
        }
    }

    fn maybe_auto_start(&mut self, now: Instant, transports: &[DeckTransport; DECK_COUNT]) {
        let active = transports[self.active];
        let next = transports[1 - self.active];
        if !active.loaded || !next.loaded {
            self.controls
                .set_message(Some("Muat track di kedua deck untuk Auto DJ."));
            self.publish_idle();
            return;
        }
        if next.playing {
            self.publish_idle();
            return;
        }

        let fade_secs = self.fade_secs(active);
        let remaining = (active.duration_secs - active.position_secs).max(0.0);
        let should_start =
            active.playing && remaining <= f64::from(fade_secs) + AUTO_START_LEAD_SECS;
        let ended = active.eof && !active.playing;

        if should_start || ended {
            self.try_begin(now, false);
        } else {
            self.controls.set_message(None);
            self.publish_idle();
        }
    }

    fn fade_secs(&self, active: DeckTransport) -> f32 {
        let bpm = effective_bpm(active);
        let beats = load_f64(&self.controls.crossfade_beats);
        ((beats * 60.0 / bpm) as f32).clamp(MIN_FADE_SECS, MAX_FADE_SECS)
    }

    fn try_begin(&mut self, now: Instant, manual: bool) {
        if self.phase == AutoDjState::Transitioning {
            return;
        }

        let transports = self.transports();
        self.active = self.infer_active(&transports);
        let next = 1 - self.active;
        let active = transports[self.active];
        let target = transports[next];

        if !active.loaded || !target.loaded {
            self.controls
                .set_message(Some("Auto DJ butuh track yang sudah dimuat di kedua deck."));
            self.publish_idle();
            return;
        }

        if target.playing && !manual {
            self.controls.set_message(Some(
                "Deck tujuan masih playing; transisi otomatis dilewati.",
            ));
            self.publish_idle();
            return;
        }

        self.prepare_target(next, &active, &target);

        let mixer = self.mixer.params();
        let start_crossfader = mixer.crossfader;
        let target_crossfader = deck_crossfader_position(next, mixer.crossfader_reverse);
        let duration_secs = self.fade_secs(active);

        self.fade = Some(Fade {
            old: self.active,
            new: next,
            target_track_id: self.decks[next].transport().track_id,
            start_crossfader,
            target_crossfader,
            started: now,
            duration_secs,
        });
        self.phase = AutoDjState::Transitioning;
        self.controls.set_message(None);
        self.publish(duration_secs, 0.0);

        // Langsung set posisi awal agar fade tidak menunggu tick berikutnya.
        self.mixer.set_crossfader(start_crossfader);
    }

    /// Sync BPM (opsional) lalu seek target ke downbeat yang sefase dengan
    /// deck aktif, dan mulai playing.
    fn prepare_target(&self, next: usize, active: &DeckTransport, target: &DeckTransport) {
        let beatmatch = self.controls.beatmatch.load(Ordering::Relaxed);
        if beatmatch && active.bpm > 0.0 && target.bpm > 0.0 {
            let source_bpm = active.bpm * f64::from(active.speed.max(0.01));
            let speed = (source_bpm / target.bpm) as f32;
            self.decks[next].set_speed(speed);
        }

        let mut start = if target.cue_secs > 0.001 {
            target.cue_secs
        } else {
            target.first_beat_secs.max(0.0)
        };

        if beatmatch {
            let bpm = effective_bpm(*active).max(1.0);
            let beat = 60.0 / bpm;
            let phase = (active.position_secs - active.first_beat_secs).rem_euclid(beat);
            let grid = target.first_beat_secs.max(0.0);
            start = grid + phase;
        }

        if target.duration_secs > 0.0 {
            start = start.min((target.duration_secs - 0.1).max(0.0));
        }

        self.decks[next].seek(start);
        self.decks[next].play();
    }

    fn tick_transition(&mut self, now: Instant, transports: [DeckTransport; DECK_COUNT]) {
        let Some(fade) = self.fade else {
            self.phase = AutoDjState::Armed;
            self.publish_idle();
            return;
        };

        let target = transports[fade.new];
        if !target.loaded || target.track_id != fade.target_track_id {
            self.controls.set_message(Some(
                "Transisi dibatalkan karena track di deck tujuan berubah.",
            ));
            self.fade = None;
            self.phase = AutoDjState::Armed;
            self.publish_idle();
            return;
        }

        let elapsed = now.saturating_duration_since(fade.started).as_secs_f32();
        let progress = (elapsed / fade.duration_secs.max(0.001)).clamp(0.0, 1.0);
        let crossfader =
            fade.start_crossfader + (fade.target_crossfader - fade.start_crossfader) * progress;
        self.mixer.set_crossfader(crossfader);

        if progress < 1.0 {
            self.publish(fade.duration_secs, progress);
            return;
        }

        self.mixer.set_crossfader(fade.target_crossfader);
        self.decks[fade.old].pause();
        self.active = fade.new;
        self.fade = None;
        self.phase = AutoDjState::Cooldown;
        self.cooldown_until = Some(now + COOLDOWN);
        self.controls.set_message(None);
        self.publish(fade.duration_secs, 1.0);
    }

    fn cancel_transition(&mut self) {
        if let Some(fade) = self.fade.take() {
            self.mixer.set_crossfader(fade.start_crossfader);
            self.decks[fade.new].pause();
            self.controls
                .set_message(Some("Transisi Auto DJ dibatalkan."));
        }
        if self.phase == AutoDjState::Transitioning {
            self.phase = if self.controls.enabled.load(Ordering::Relaxed) {
                AutoDjState::Armed
            } else {
                AutoDjState::Disabled
            };
            self.publish_idle();
        }
    }

    fn publish_idle(&self) {
        self.publish(0.0, 0.0);
    }

    fn publish(&self, crossfade_secs: f32, progress: f32) {
        self.controls.publish(
            self.phase,
            self.active,
            1 - self.active,
            crossfade_secs,
            progress,
        );
    }
}

/// BPM efektif deck setelah pitch fader (dan bend diabaikan karena sementara).
pub fn effective_bpm(deck: DeckTransport) -> f64 {
    let bpm = deck.bpm * f64::from(deck.speed.max(0.01));
    if bpm.is_finite() && bpm > 0.0 {
        bpm
    } else {
        FALLBACK_BPM
    }
}

/// Posisi crossfader mentah yang membuat `deck` paling keras, dengan
/// memperhitungkan tombol reverse.
pub fn deck_crossfader_position(deck: usize, reverse: bool) -> f32 {
    let normal = if deck == 0 { 0.0 } else { 1.0 };
    if reverse {
        1.0 - normal
    } else {
        normal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transport(bpm: f64, speed: f32) -> DeckTransport {
        DeckTransport {
            loaded: true,
            playing: true,
            eof: false,
            position_secs: 8.0,
            duration_secs: 180.0,
            cue_secs: 0.0,
            first_beat_secs: 0.25,
            bpm,
            speed,
            track_id: 1,
        }
    }

    #[test]
    fn effective_bpm_follows_pitch_and_falls_back() {
        assert!((effective_bpm(transport(128.0, 1.0)) - 128.0).abs() < 1e-9);
        assert!((effective_bpm(transport(128.0, 0.5)) - 64.0).abs() < 1e-9);
        assert!((effective_bpm(transport(0.0, 1.0)) - FALLBACK_BPM).abs() < 1e-9);
    }

    #[test]
    fn crossfader_target_accounts_for_reverse() {
        assert_eq!(deck_crossfader_position(0, false), 0.0);
        assert_eq!(deck_crossfader_position(1, false), 1.0);
        assert_eq!(deck_crossfader_position(0, true), 1.0);
        assert_eq!(deck_crossfader_position(1, true), 0.0);
    }

    #[test]
    fn controls_clamp_beats_and_report_defaults() {
        let controls = AutoDjControls::new();
        controls.apply(AutoDjUpdate {
            enabled: Some(true),
            auto_start: Some(false),
            beatmatch: Some(false),
            crossfade_beats: Some(1_000.0),
        });
        let status = controls.status();
        assert!(status.enabled);
        assert!(!status.auto_start);
        assert!(!status.beatmatch);
        assert_eq!(status.crossfade_beats, MAX_BEATS);

        controls.apply(AutoDjUpdate {
            crossfade_beats: Some(-4.0),
            ..Default::default()
        });
        assert_eq!(controls.status().crossfade_beats, MIN_BEATS);
    }

    #[test]
    fn disabling_requests_cancel() {
        let controls = AutoDjControls::new();
        controls.apply(AutoDjUpdate {
            enabled: Some(true),
            ..Default::default()
        });
        controls.cancel.store(false, Ordering::Relaxed);
        controls.apply(AutoDjUpdate {
            enabled: Some(false),
            ..Default::default()
        });
        assert!(controls.cancel.swap(false, Ordering::Relaxed));
    }

    #[test]
    fn state_codes_roundtrip() {
        for state in [
            AutoDjState::Disabled,
            AutoDjState::Armed,
            AutoDjState::Transitioning,
            AutoDjState::Cooldown,
        ] {
            assert_eq!(AutoDjState::from_code(state.to_code()), state);
        }
    }
}

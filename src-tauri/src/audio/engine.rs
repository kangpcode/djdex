//! Audio engine: deteksi perangkat, generator sine, dan deck playback.
//!
//! Arsitektur thread:
//!
//! ```text
//! UI thread (Tauri command)
//!    |  AudioEngine::set_tone()  -> AtomicBool / AtomicU32  (tanpa lock)
//!    |  AudioEngine::start()     -> spawn "djdex-audio-host"
//!    v
//! "djdex-audio-host" (thread non-RT, pemilik cpal::Stream)
//!    |  membuka stream, menyimpan status, menunggu AudioCommand::Shutdown
//!    v
//! callback audio CPAL (RT)
//!    - hanya baca atomic, tulis sample, hitung peak/waktu
//!    - tanpa alokasi, tanpa lock, tanpa I/O, tanpa panic
//! ```
//!
//! `cpal::Stream` tidak `Send` di semua platform, jadi stream sengaja dimiliki
//! thread khusus. UI tidak pernah menyentuh stream secara langsung.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{
    BufferSize, Device, FromSample, SampleFormat, SizedSample, Stream, StreamConfig,
    SupportedBufferSize, SupportedStreamConfig,
};
use crossbeam_channel::{bounded, unbounded, Receiver, Sender};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::audio::autodj::{AutoDj, AutoDjStatus, AutoDjUpdate};
use crate::audio::broadcast::{BroadcastController, BroadcastProducer};
use crate::audio::deck::{Deck, DeckReader, DeckStatus};
use crate::audio::device::{find_output_device, host_label, sample_format_label};
use crate::audio::fx::{FxControls, FxParams, FxSlotUpdate};
use crate::audio::gain::{db_to_linear, linear_to_db};
use crate::audio::mixer::{Mixer, MixerControls, MixerParams, MixerUpdate};
use crate::audio::recorder::{RecorderController, RecorderProducer};
use crate::error::AudioError;
use crate::library::preview::{PreviewController, PreviewPlayerRt};
use crate::sampler::{SamplerController, SamplerRt};

/// Batas frekuensi test tone (Hz).
pub const TONE_MIN_HZ: f32 = 20.0;
pub const TONE_MAX_HZ: f32 = 20_000.0;
/// Batas gain test tone (dBFS).
pub const TONE_MIN_DB: f32 = -60.0;
pub const TONE_MAX_DB: f32 = 0.0;
pub const TONE_DEFAULT_HZ: f32 = 440.0;
pub const TONE_DEFAULT_DB: f32 = -12.0;

/// Batas waktu pembukaan stream sebelum command dianggap gagal.
const OPEN_TIMEOUT: Duration = Duration::from_secs(5);
/// Konstanta waktu smoothing gain agar on/off tone tidak menimbulkan klik.
const GAIN_SMOOTHING_SECONDS: f32 = 0.005;
/// Smoothing gain deck (sedikit lebih panjang agar fader terasa halus).
const DECK_GAIN_SMOOTHING_SECONDS: f32 = 0.01;

/// Permintaan inisialisasi/re-inisialisasi engine dari UI.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StartRequest {
    pub device_name: Option<String>,
    pub buffer_size: Option<u32>,
    pub sample_rate: Option<u32>,
    /// Jumlah channel output. `None`/0 = otomatis (stereo, paling kompatibel).
    pub channels: Option<u16>,
    pub tone_freq_hz: Option<f32>,
    pub tone_gain_db: Option<f32>,
}

/// Snapshot status engine untuk frontend (di-polling ringan, bukan jalur RT).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub initialized: bool,
    pub running: bool,
    pub device_name: Option<String>,
    pub host: Option<String>,
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: Option<String>,
    pub buffer_frames: Option<u32>,
    pub latency_ms: Option<f64>,
    pub tone_enabled: bool,
    pub tone_freq_hz: f32,
    pub tone_gain_db: f32,
    pub callbacks: u64,
    pub frames: u64,
    pub peak: f32,
    pub master_peak_l: f32,
    pub master_peak_r: f32,
    pub limiter_reduction_db: f32,
    pub callback_us_last: u32,
    pub callback_us_max: u32,
    pub xruns: u64,
    pub last_error: Option<String>,
}

impl EngineStatus {
    /// Status sebelum engine pernah diinisialisasi.
    pub fn idle() -> Self {
        Self {
            initialized: false,
            running: false,
            device_name: None,
            host: None,
            sample_rate: 0,
            channels: 0,
            sample_format: None,
            buffer_frames: None,
            latency_ms: None,
            tone_enabled: false,
            tone_freq_hz: TONE_DEFAULT_HZ,
            tone_gain_db: TONE_DEFAULT_DB,
            callbacks: 0,
            frames: 0,
            peak: 0.0,
            master_peak_l: 0.0,
            master_peak_r: 0.0,
            limiter_reduction_db: 0.0,
            callback_us_last: 0,
            callback_us_max: 0,
            xruns: 0,
            last_error: None,
        }
    }
}

/// Parameter yang dibaca callback audio. Semua atomic, bebas lock.
struct RtState {
    tone_enabled: AtomicBool,
    tone_freq: AtomicU32,
    tone_gain: AtomicU32,
    mixer: Arc<MixerControls>,
    fx: FxControls,
    peak: AtomicU32,
    master_peak_l: AtomicU32,
    master_peak_r: AtomicU32,
    limiter_reduction: AtomicU32,
    callbacks: AtomicU64,
    frames: AtomicU64,
    callback_us_last: AtomicU32,
    callback_us_max: AtomicU32,
    xruns: AtomicU64,
}

impl RtState {
    fn new(request: &StartRequest) -> Self {
        let frequency = request
            .tone_freq_hz
            .unwrap_or(TONE_DEFAULT_HZ)
            .clamp(TONE_MIN_HZ, TONE_MAX_HZ);
        let gain_db = request
            .tone_gain_db
            .unwrap_or(TONE_DEFAULT_DB)
            .clamp(TONE_MIN_DB, TONE_MAX_DB);

        Self {
            tone_enabled: AtomicBool::new(false),
            tone_freq: AtomicU32::new(frequency.to_bits()),
            tone_gain: AtomicU32::new(db_to_linear(gain_db).to_bits()),
            mixer: Arc::new(MixerControls::new()),
            fx: FxControls::new(),
            peak: AtomicU32::new(0.0_f32.to_bits()),
            master_peak_l: AtomicU32::new(0.0_f32.to_bits()),
            master_peak_r: AtomicU32::new(0.0_f32.to_bits()),
            limiter_reduction: AtomicU32::new(0.0_f32.to_bits()),
            callbacks: AtomicU64::new(0),
            frames: AtomicU64::new(0),
            callback_us_last: AtomicU32::new(0),
            callback_us_max: AtomicU32::new(0),
            xruns: AtomicU64::new(0),
        }
    }
}

/// Info stream yang dibuka, hanya diubah oleh audio host thread.
#[derive(Debug, Clone, Default)]
struct StreamInfo {
    running: bool,
    device_name: Option<String>,
    host: Option<String>,
    sample_rate: u32,
    channels: u16,
    sample_format: Option<String>,
    buffer_frames: Option<u32>,
    latency_ms: Option<f64>,
    last_error: Option<String>,
}

enum AudioCommand {
    Shutdown,
}

struct StreamReport {
    device_name: String,
    host: String,
    sample_rate: u32,
    channels: u16,
    sample_format: String,
    buffer_frames: Option<u32>,
    latency_ms: Option<f64>,
}

/// Jumlah deck yang dibuka engine. Fase 5 memakai dua deck.
pub const DECK_COUNT: usize = 2;

struct OpenedStream {
    stream: Stream,
    decks: [Arc<Deck>; DECK_COUNT],
    sampler: Arc<SamplerController>,
    preview: Arc<PreviewController>,
    recorder: Arc<RecorderController>,
    broadcast: Arc<BroadcastController>,
    report: StreamReport,
}

/// Handle publik engine. Aman dikirim antar-thread (`Send + Sync`).
pub struct AudioEngine {
    rt: Arc<RtState>,
    info: Arc<Mutex<StreamInfo>>,
    commands: Sender<AudioCommand>,
    worker: Option<JoinHandle<()>>,
    decks: [Arc<Deck>; DECK_COUNT],
    sampler: Arc<SamplerController>,
    preview: Arc<PreviewController>,
    recorder: Arc<RecorderController>,
    broadcast: Arc<BroadcastController>,
    auto_dj: AutoDj,
}

impl AudioEngine {
    /// Buka stream output dan mulai thread audio host.
    ///
    /// Error pembukaan stream dikembalikan secara sinkron agar UI bisa
    /// menampilkan penyebabnya (device hilang, buffer tidak didukung, dst).
    pub fn start(request: StartRequest) -> Result<Self, AudioError> {
        let rt = Arc::new(RtState::new(&request));
        let info = Arc::new(Mutex::new(StreamInfo::default()));
        let (commands, command_rx) = unbounded();
        let (ready_tx, ready_rx) = bounded(1);

        let host_rt = Arc::clone(&rt);
        let host_info = Arc::clone(&info);

        let worker = thread::Builder::new()
            .name("djdex-audio-host".to_string())
            .spawn(move || audio_host_loop(request, host_rt, host_info, command_rx, ready_tx))
            .map_err(|err| AudioError::StreamThreadSpawn(err.to_string()))?;

        match ready_rx.recv_timeout(OPEN_TIMEOUT) {
            Ok(Ok((_report, decks, sampler, preview, recorder, broadcast))) => {
                let auto_dj = match AutoDj::start(
                    [Arc::clone(&decks[0]), Arc::clone(&decks[1])],
                    Arc::clone(&rt.mixer),
                ) {
                    Ok(auto_dj) => auto_dj,
                    Err(err) => {
                        let _ = commands.send(AudioCommand::Shutdown);
                        let _ = worker.join();
                        return Err(err);
                    }
                };
                Ok(Self {
                    rt,
                    info,
                    commands,
                    worker: Some(worker),
                    decks,
                    sampler,
                    preview,
                    recorder,
                    broadcast,
                    auto_dj,
                })
            }
            Ok(Err(err)) => {
                let _ = worker.join();
                Err(err)
            }
            Err(_) => {
                let _ = commands.send(AudioCommand::Shutdown);
                let _ = worker.join();
                Err(AudioError::StreamReadyTimeout)
            }
        }
    }

    /// Snapshot status + level peak sejak pembacaan terakhir.
    pub fn status(&self) -> EngineStatus {
        let info = self.info.lock().clone();

        EngineStatus {
            initialized: true,
            running: info.running,
            device_name: info.device_name,
            host: info.host,
            sample_rate: info.sample_rate,
            channels: info.channels,
            sample_format: info.sample_format,
            buffer_frames: info.buffer_frames,
            latency_ms: info.latency_ms,
            tone_enabled: self.rt.tone_enabled.load(Ordering::Relaxed),
            tone_freq_hz: load_f32(&self.rt.tone_freq),
            tone_gain_db: linear_to_db(load_f32(&self.rt.tone_gain)),
            callbacks: self.rt.callbacks.load(Ordering::Relaxed),
            frames: self.rt.frames.load(Ordering::Relaxed),
            peak: f32::from_bits(self.rt.peak.swap(0, Ordering::Relaxed)),
            master_peak_l: f32::from_bits(self.rt.master_peak_l.swap(0, Ordering::Relaxed)),
            master_peak_r: f32::from_bits(self.rt.master_peak_r.swap(0, Ordering::Relaxed)),
            limiter_reduction_db: f32::from_bits(
                self.rt.limiter_reduction.swap(0, Ordering::Relaxed),
            ),
            callback_us_last: self.rt.callback_us_last.load(Ordering::Relaxed),
            callback_us_max: self.rt.callback_us_max.load(Ordering::Relaxed),
            xruns: self.rt.xruns.load(Ordering::Relaxed),
            last_error: info.last_error,
        }
    }

    /// Ubah parameter test tone secara lock-free. Nilai `None` = tidak diubah.
    pub fn set_tone(&self, enabled: Option<bool>, freq_hz: Option<f32>, gain_db: Option<f32>) {
        if let Some(enabled) = enabled {
            self.rt.tone_enabled.store(enabled, Ordering::Relaxed);
        }
        if let Some(freq_hz) = freq_hz {
            store_f32(&self.rt.tone_freq, freq_hz.clamp(TONE_MIN_HZ, TONE_MAX_HZ));
        }
        if let Some(gain_db) = gain_db {
            store_f32(
                &self.rt.tone_gain,
                db_to_linear(gain_db.clamp(TONE_MIN_DB, TONE_MAX_DB)),
            );
        }
    }

    // ---- Deck API (Fase 2-5) ------------------------------------------

    pub fn deck(&self, slot: usize) -> Result<&Deck, AudioError> {
        self.decks
            .get(slot)
            .map(Arc::as_ref)
            .ok_or(AudioError::DeckNotFound(slot))
    }

    pub fn deck_status(&self, slot: usize) -> Result<DeckStatus, AudioError> {
        Ok(self.deck(slot)?.status())
    }

    pub fn sampler(&self) -> &Arc<SamplerController> {
        &self.sampler
    }

    pub fn preview(&self) -> &Arc<PreviewController> {
        &self.preview
    }

    pub fn recorder(&self) -> &Arc<RecorderController> {
        &self.recorder
    }

    pub fn broadcast(&self) -> &Arc<BroadcastController> {
        &self.broadcast
    }

    pub fn load_track(
        &self,
        slot: usize,
        path: impl Into<std::path::PathBuf>,
    ) -> Result<DeckStatus, AudioError> {
        self.deck(slot)?.load(path.into())
    }

    pub fn waveform(
        &self,
        slot: usize,
        max_points: usize,
    ) -> Result<Option<crate::analysis::waveform::WaveformDto>, AudioError> {
        Ok(self.deck(slot)?.waveform(max_points))
    }

    /// Sinkronkan BPM (dan fase ketukan bila beatgrid tersedia) deck `target`
    /// ke deck `source`. Speed target dihitung dari BPM efektif source.
    pub fn sync_deck(&self, source: usize, target: usize) -> Result<DeckStatus, AudioError> {
        if source == target {
            return Err(AudioError::InvalidSync);
        }
        let source_status = self.deck_status(source)?;
        let target_status = self.deck_status(target)?;
        if !source_status.loaded || !target_status.loaded {
            return Err(AudioError::SyncNotReady);
        }
        if source_status.bpm <= 0.0 || target_status.bpm <= 0.0 {
            return Err(AudioError::SyncNotReady);
        }

        let source_bpm = source_status.bpm * f64::from(source_status.speed);
        let target_deck = self.deck(target)?;
        target_deck.set_speed((source_bpm / target_status.bpm) as f32);

        // Selaraskan fase ketukan bila kedua beatgrid diketahui. Geser maksimal
        // setengah ketukan agar sync tidak melompat jauh dari posisi DJ.
        let source_grid = source_status.first_beat_secs;
        let target_grid = target_status.first_beat_secs;
        if source_grid > 0.0 && target_grid > 0.0 {
            let beat = 60.0 / source_bpm.max(1.0);
            let source_phase = (source_status.position_secs - source_grid).rem_euclid(beat);
            let target_phase = (target_status.position_secs - target_grid).rem_euclid(beat);
            let mut delta = (source_phase - target_phase).rem_euclid(beat);
            if delta > beat / 2.0 {
                delta -= beat;
            }
            if delta.abs() > 0.01 && delta.abs() < beat / 2.0 {
                let position = (target_status.position_secs + delta).max(0.0);
                target_deck.seek(position);
            }
        }

        Ok(target_deck.status())
    }

    // ---- Mixer (Fase 4) ------------------------------------------------

    pub fn mixer_status(&self) -> MixerParams {
        self.rt.mixer.params()
    }

    pub fn apply_mixer(&self, update: MixerUpdate) {
        self.rt.mixer.apply(update);
    }

    // ---- FX (Fase 6) ------------------------------------------------------

    pub fn fx_status(&self) -> FxParams {
        self.rt.fx.params()
    }

    pub fn apply_fx(&self, update: FxSlotUpdate) {
        self.rt.fx.apply(&update);
    }

    // ---- Auto DJ (Fase 6) ------------------------------------------------

    pub fn auto_dj_status(&self) -> AutoDjStatus {
        self.auto_dj.status()
    }

    pub fn apply_auto_dj(&self, update: AutoDjUpdate) {
        self.auto_dj.apply(update);
    }

    pub fn trigger_auto_dj(&self) {
        self.auto_dj.trigger();
    }

    pub fn cancel_auto_dj(&self) {
        self.auto_dj.cancel();
    }

    fn stop(&mut self) {
        // Hentikan kontrol Auto DJ lebih dulu agar tidak menulis crossfader
        // saat stream sedang ditutup.
        self.auto_dj.stop();
        let _ = self.commands.send(AudioCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Hasil inisialisasi engine yang dikirim dari audio host ke pemanggil.
type EngineReady = Sender<
    Result<
        (
            StreamReport,
            [Arc<Deck>; DECK_COUNT],
            Arc<SamplerController>,
            Arc<PreviewController>,
            Arc<RecorderController>,
            Arc<BroadcastController>,
        ),
        AudioError,
    >,
>;

/// Consumer RT (sampler, preview, recorder, broadcast) milik callback audio.
struct RtConsumers {
    sampler: SamplerRt,
    preview: PreviewPlayerRt,
    recorder: RecorderProducer,
    broadcast: BroadcastProducer,
}

/// State callback audio: oscillator, mixer, deck reader, dan consumer RT.
struct CallbackContext {
    oscillator: ToneOscillator,
    mixer: Mixer,
    decks: [DeckReader; DECK_COUNT],
    consumers: RtConsumers,
}

fn audio_host_loop(
    request: StartRequest,
    rt: Arc<RtState>,
    info: Arc<Mutex<StreamInfo>>,
    commands: Receiver<AudioCommand>,
    ready: EngineReady,
) {
    let opened = match open_stream(&request, Arc::clone(&rt)) {
        Ok(opened) => opened,
        Err(err) => {
            info.lock().last_error = Some(err.to_string());
            let _ = ready.send(Err(err));
            return;
        }
    };

    {
        let mut guard = info.lock();
        guard.running = true;
        guard.device_name = Some(opened.report.device_name.clone());
        guard.host = Some(opened.report.host.clone());
        guard.sample_rate = opened.report.sample_rate;
        guard.channels = opened.report.channels;
        guard.sample_format = Some(opened.report.sample_format.clone());
        guard.buffer_frames = opened.report.buffer_frames;
        guard.latency_ms = opened.report.latency_ms;
        guard.last_error = None;
    }

    if ready
        .send(Ok((
            opened.report,
            opened.decks,
            opened.sampler,
            opened.preview,
            opened.recorder,
            opened.broadcast,
        )))
        .is_err()
    {
        // Pemanggil sudah menyerah; stream akan ditutup saat fungsi kembali.
        info.lock().running = false;
        return;
    }

    let _stream = opened.stream;

    // Tunggu perintah struktural (saat ini hanya shutdown). Parameter audio
    // berjalan lewat atomic sehingga tidak butuh perintah per perubahan.
    // Fase berikutnya: loop `recv()` yang menangani Reopen/LoadTrack dkk.
    let _ = commands.recv();

    info.lock().running = false;
}

fn open_stream(request: &StartRequest, rt: Arc<RtState>) -> Result<OpenedStream, AudioError> {
    let device = find_output_device(request.device_name.as_deref())?;
    let device_name = device.to_string();
    let candidates = config_candidates(&device, request)?;

    // Coba kandidat berurutan. Ini yang membuat aplikasi tetap bisa bunyi di
    // ALSA ketika perangkat menolak channel map tertentu: kandidat stereo selalu
    // tersedia sebagai fallback, sehingga pesan `find_matching_chmap` tidak
    // menggagalkan inisialisasi engine.
    let mut attempts: Vec<String> = Vec::new();

    for candidate in candidates {
        let sample_rate = candidate.sample_rate();
        let channels = candidate.channels();
        let sample_format = candidate.sample_format();
        let buffer_frames = candidate.buffer_frames();
        let latency_ms =
            buffer_frames.map(|frames| f64::from(frames) / f64::from(sample_rate) * 1_000.0);

        let mut config = candidate.config.config();
        config.buffer_size = candidate.buffer;

        // Deck dibuat sebelum stream agar consumer ring buffer bisa langsung
        // dimiliki callback audio. Bila percobaan ini gagal, semuanya dibuang
        // (worker thread ikut berhenti) sebelum kandidat berikutnya dicoba.
        let (decks, readers) = create_decks(sample_rate)?;
        let (sampler_controller, sampler_rt) = SamplerController::new(sample_rate);
        let sampler = Arc::new(sampler_controller);
        let (preview_controller, preview_rt) = PreviewController::new(sample_rate);
        let preview = Arc::new(preview_controller);
        let (recorder, recorder_rt) = RecorderController::new(sample_rate);
        let (broadcast, broadcast_rt) = BroadcastController::new(sample_rate);

        let consumers = RtConsumers {
            sampler: sampler_rt,
            preview: preview_rt,
            recorder: recorder_rt,
            broadcast: broadcast_rt,
        };
        let stream = match build_for_format(
            &device,
            sample_format,
            config,
            Arc::clone(&rt),
            readers,
            consumers,
        ) {
            Ok(stream) => stream,
            Err(err) => {
                attempts.push(format!("{} ch @ {} Hz: {}", channels, sample_rate, err));
                continue;
            }
        };

        if let Err(err) = stream.play() {
            attempts.push(format!(
                "{} ch @ {} Hz: gagal start stream: {}",
                channels, sample_rate, err
            ));
            continue;
        }

        return Ok(OpenedStream {
            stream,
            decks,
            sampler,
            preview,
            recorder,
            broadcast,
            report: StreamReport {
                device_name,
                host: host_label().to_string(),
                sample_rate,
                channels,
                sample_format: sample_format_label(sample_format),
                buffer_frames,
                latency_ms,
            },
        });
    }

    Err(AudioError::UnsupportedConfig(open_error_hint(&attempts)))
}

/// Buat dua deck + reader-nya untuk satu percobaan stream.
fn create_decks(
    sample_rate: u32,
) -> Result<([Arc<Deck>; DECK_COUNT], [DeckReader; DECK_COUNT]), AudioError> {
    let (deck_a, reader_a) = Deck::new(sample_rate)?;
    let (deck_b, reader_b) = Deck::new(sample_rate)?;
    let decks: [Arc<Deck>; DECK_COUNT] = [Arc::new(deck_a), Arc::new(deck_b)];
    Ok((decks, [reader_a, reader_b]))
}

/// Satu kandidat konfigurasi stream yang sudah divalidasi terhadap kapabilitas
/// perangkat (sample format, channel, sample rate, dan buffer).
struct ConfigCandidate {
    config: SupportedStreamConfig,
    buffer: BufferSize,
}

impl ConfigCandidate {
    fn sample_rate(&self) -> u32 {
        self.config.sample_rate()
    }

    fn channels(&self) -> u16 {
        self.config.channels()
    }

    fn sample_format(&self) -> SampleFormat {
        self.config.sample_format()
    }

    fn buffer_frames(&self) -> Option<u32> {
        match self.buffer {
            BufferSize::Fixed(frames) => Some(frames),
            BufferSize::Default => None,
        }
    }
}

/// Urutan channel yang dicoba: permintaan pengguna lebih dulu, lalu stereo
/// (channel map universal), lalu default perangkat, lalu mono.
fn channel_preference(requested: Option<u16>, default_channels: u16) -> Vec<u16> {
    let mut channels = Vec::new();
    if let Some(channel) = requested.filter(|channel| *channel > 0) {
        channels.push(channel);
    }
    for channel in [2u16, default_channels, 1u16] {
        if channel > 0 && !channels.contains(&channel) {
            channels.push(channel);
        }
    }
    channels
}

/// Validasi buffer terhadap rentang perangkat. Nilai di luar rentang di-clamp
/// (bukan ditolak) supaya pilihan 64–1024 frame tetap berfungsi di semua driver.
fn select_buffer(config: &SupportedStreamConfig, requested: Option<u32>) -> BufferSize {
    let Some(frames) = requested.filter(|frames| *frames > 0) else {
        return BufferSize::Default;
    };
    match config.buffer_size() {
        SupportedBufferSize::Range { min, max } => BufferSize::Fixed(frames.clamp(*min, *max)),
        SupportedBufferSize::Unknown => BufferSize::Default,
    }
}

/// Susun daftar konfigurasi stream yang layak dicoba, paling diinginkan lebih
/// dulu. Hanya sample format yang didukung engine (f32/i16/u16) yang masuk.
fn config_candidates(
    device: &Device,
    request: &StartRequest,
) -> Result<Vec<ConfigCandidate>, AudioError> {
    let default_config = device.default_output_config().map_err(|err| {
        AudioError::UnsupportedConfig(format!("konfigurasi default tidak tersedia: {err}"))
    })?;
    let default_rate = default_config.sample_rate();
    let default_channels = default_config.channels();
    let default_format = default_config.sample_format();

    let mut candidates: Vec<ConfigCandidate> = Vec::new();

    // Prioritas #1: Jika pengguna tidak meminta channel atau sample rate berbeda,
    // pasang default_config di urutan pertama. Ini mencegah ALSA pcm_route mencoba
    // kombinasi channel/rate yang tidak cocok yang memicu error `find_matching_chmap`.
    let user_requested_other_channels =
        request.channels.is_some_and(|c| c > 0 && c != default_channels);
    let user_requested_other_rate =
        request.sample_rate.is_some_and(|r| r > 0 && r != default_rate);

    if !user_requested_other_channels && !user_requested_other_rate {
        push_candidate(&mut candidates, default_config.clone(), request.buffer_size);
    }

    let channel_prefs = channel_preference(request.channels, default_channels);
    let rate_prefs: Vec<u32> = match request.sample_rate.filter(|rate| *rate > 0) {
        Some(rate) if rate != default_rate => vec![rate, default_rate],
        _ => vec![default_rate],
    };

    let ranges: Vec<_> = device
        .supported_output_configs()
        .map_err(|err| AudioError::Enumerate(err.to_string()))?
        .collect();

    for sample_format in [
        default_format,
        SampleFormat::F32,
        SampleFormat::I16,
        SampleFormat::U16,
    ] {
        for channel in &channel_prefs {
            for rate in &rate_prefs {
                let Some(range) = ranges.iter().find(|range| {
                    range.sample_format() == sample_format
                        && range.channels() == *channel
                        && range.contains_rate(*rate)
                }) else {
                    continue;
                };
                if let Some(config) = range.try_with_sample_rate(*rate) {
                    push_candidate(&mut candidates, config, request.buffer_size);
                }
            }
        }
    }

    // Jaring pengaman terakhir: konfigurasi default perangkat apa adanya.
    push_candidate(&mut candidates, default_config, request.buffer_size);

    if candidates.is_empty() {
        return Err(AudioError::UnsupportedConfig(
            "perangkat tidak mengekspos konfigurasi output yang didukung (f32/i16/u16)".to_string(),
        ));
    }

    Ok(candidates)
}

fn push_candidate(
    list: &mut Vec<ConfigCandidate>,
    config: SupportedStreamConfig,
    requested_buffer: Option<u32>,
) {
    let buffer = select_buffer(&config, requested_buffer);
    let buffer_frames = match buffer {
        BufferSize::Fixed(frames) => Some(frames),
        BufferSize::Default => None,
    };
    let duplicate = list.iter().any(|existing| {
        existing.sample_rate() == config.sample_rate()
            && existing.channels() == config.channels()
            && existing.sample_format() == config.sample_format()
            && existing.buffer_frames() == buffer_frames
    });
    if !duplicate {
        list.push(ConfigCandidate { config, buffer });
    }
}

/// Bangun stream untuk sample format tertentu, lalu terjemahkan error backend
/// menjadi pesan yang bisa ditindaklanjuti.
fn build_for_format(
    device: &Device,
    sample_format: SampleFormat,
    config: StreamConfig,
    rt: Arc<RtState>,
    readers: [DeckReader; DECK_COUNT],
    consumers: RtConsumers,
) -> Result<Stream, AudioError> {
    match sample_format {
        SampleFormat::F32 => build_output::<f32>(device, config, rt, readers, consumers),
        SampleFormat::I16 => build_output::<i16>(device, config, rt, readers, consumers),
        SampleFormat::U16 => build_output::<u16>(device, config, rt, readers, consumers),
        other => Err(AudioError::UnsupportedSampleFormat(sample_format_label(
            other,
        ))),
    }
}

/// Gabungkan percobaan yang gagal menjadi satu pesan, plus panduan ALSA.
fn open_error_hint(attempts: &[String]) -> String {
    let detail = if attempts.is_empty() {
        "perangkat tidak menyediakan konfigurasi output yang bisa dibuka".to_string()
    } else {
        attempts.join("; ")
    };

    if cfg!(target_os = "linux") {
        format!(
            "Gagal membuka stream audio. {detail}. Tip ALSA: pilih channel 'Stereo (2 ch)'. \
             Pesan 'pcm_route.c ... find_matching_chmap: Found no matching channel map' berarti \
             perangkat tidak punya channel map untuk jumlah channel yang diminta; stereo selalu \
             aman, dan untuk headphone gunakan SPLIT CUE atau perangkat dengan 4 channel."
        )
    } else {
        format!("Gagal membuka stream audio. {detail}")
    }
}

fn build_output<T>(
    device: &Device,
    config: StreamConfig,
    rt: Arc<RtState>,
    decks: [DeckReader; DECK_COUNT],
    consumers: RtConsumers,
) -> Result<Stream, AudioError>
where
    T: SizedSample + FromSample<f32> + Send + 'static,
{
    let channels = usize::from(config.channels.max(1));
    let sample_rate = config.sample_rate as f32;
    let mut context = CallbackContext::new(sample_rate, decks, consumers);

    let callback_rt = Arc::clone(&rt);
    let error_rt = Arc::clone(&rt);

    device
        .build_output_stream::<T, _, _>(
            config,
            move |data: &mut [T], _info: &cpal::OutputCallbackInfo| {
                context.render_block(data, channels, sample_rate, &callback_rt);
            },
            move |_err| {
                // Error backend (underrun/device dicabut). Hitung saja; stream
                // dibiarkan hidup dan UI menampilkan statistik xrun.
                error_rt.xruns.fetch_add(1, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|err| AudioError::BuildStream(err.to_string()))
}

impl CallbackContext {
    fn new(sample_rate: f32, decks: [DeckReader; DECK_COUNT], consumers: RtConsumers) -> Self {
        Self {
            oscillator: ToneOscillator::new(sample_rate),
            mixer: Mixer::new(sample_rate),
            decks,
            consumers,
        }
    }

    /// Isi satu buffer output. Fungsi ini berjalan di jalur RT:
    /// tidak ada alokasi, lock, I/O, maupun panic.
    fn render_block<T>(&mut self, data: &mut [T], channels: usize, sample_rate: f32, rt: &RtState)
    where
        T: SizedSample + FromSample<f32>,
    {
        let started = Instant::now();
        let channels = channels.max(1);
        let params = rt.mixer.params();
        let fx_params = rt.fx.params();
        self.mixer.configure(&params, &fx_params);
        let split_cue = params.split_cue && channels == 2;
        let enabled = rt.tone_enabled.load(Ordering::Relaxed);
        let frequency = load_f32(&rt.tone_freq).clamp(TONE_MIN_HZ, TONE_MAX_HZ);
        let tone_target = if enabled {
            load_f32(&rt.tone_gain)
        } else {
            0.0
        };
        let tone_smoothing = 1.0 - (-1.0 / (GAIN_SMOOTHING_SECONDS * sample_rate)).exp();

        // Gain deck di-ramp per blok agar perubahan fader tidak klik.
        let deck_smoothing = 1.0 - (-1.0 / (DECK_GAIN_SMOOTHING_SECONDS * sample_rate)).exp();
        let (deck_a_target, deck_b_target) =
            (self.decks[0].target_gain(), self.decks[1].target_gain());
        let (mut deck_a_gain, mut deck_b_gain) =
            (self.decks[0].current_gain(), self.decks[1].current_gain());

        let frames = data.len() / channels;
        let (first, second) = self.decks.split_at_mut(1);
        let deck_a_reader = &mut first[0];
        let deck_b_reader = &mut second[0];
        let deck_a_samples = deck_a_reader.prepare(frames);
        let deck_a_frames = deck_a_samples.len() / 2;
        let deck_b_samples = deck_b_reader.prepare(frames);
        let deck_b_frames = deck_b_samples.len() / 2;

        self.consumers.sampler.process_block(frames, 128.0);
        self.consumers.preview.prepare_block();

        let mut peak = 0.0_f32;
        let mut deck_a_peak = 0.0_f32;
        let mut deck_b_peak = 0.0_f32;
        let mut master_peak_l = 0.0_f32;
        let mut master_peak_r = 0.0_f32;

        for (index, frame) in data.chunks_mut(channels).enumerate() {
            let tone = self.oscillator.next(frequency, tone_target, tone_smoothing);
            deck_a_gain += (deck_a_target - deck_a_gain) * deck_smoothing;
            deck_b_gain += (deck_b_target - deck_b_gain) * deck_smoothing;

            let (left, right) = if index < deck_a_frames {
                (
                    deck_a_samples[index * 2] * deck_a_gain,
                    deck_a_samples[index * 2 + 1] * deck_a_gain,
                )
            } else {
                (0.0, 0.0)
            };
            let (left_b, right_b) = if index < deck_b_frames {
                (
                    deck_b_samples[index * 2] * deck_b_gain,
                    deck_b_samples[index * 2 + 1] * deck_b_gain,
                )
            } else {
                (0.0, 0.0)
            };

            deck_a_peak = deck_a_peak.max(left.abs()).max(right.abs());
            deck_b_peak = deck_b_peak.max(left_b.abs()).max(right_b.abs());

            let sampler_sample = if index < frames {
                self.consumers.sampler.sample_at(index)
            } else {
                (0.0, 0.0)
            };
            let preview_sample = self.consumers.preview.next_sample();

            let mix = self.mixer.process(
                (left, right),
                (left_b, right_b),
                sampler_sample,
                preview_sample,
                tone,
            );
            master_peak_l = master_peak_l.max(mix.master_l.abs());
            master_peak_r = master_peak_r.max(mix.master_r.abs());

            let mut out_left = soft_clip(mix.master_l);
            let mut out_right = soft_clip(mix.master_r);

            // Rekam dan broadcast master mix stereo murni (lock-free)
            self.consumers.recorder.push(out_left, out_right);
            self.consumers.broadcast.push(out_left, out_right);

            // Perangkat stereo: split cue menaruh cue di L dan master di R.
            if split_cue {
                out_left = soft_clip(0.5 * (mix.head_l + mix.head_r));
                out_right = soft_clip(0.5 * (mix.master_l + mix.master_r));
            }

            let head_left = soft_clip(mix.head_l);
            let head_right = soft_clip(mix.head_r);
            peak = peak.max(out_left.abs()).max(out_right.abs());

            for (channel, slot) in frame.iter_mut().enumerate() {
                let value = match channel {
                    0 => out_left,
                    1 => out_right,
                    2 if channels >= 4 => head_left,
                    3 if channels >= 4 => head_right,
                    _ => 0.0,
                };
                *slot = T::from_sample_(value);
            }
        }

        deck_a_reader.set_current_gain(deck_a_gain);
        deck_b_reader.set_current_gain(deck_b_gain);
        deck_a_reader.report_peak(deck_a_peak);
        deck_b_reader.report_peak(deck_b_peak);

        rt.master_peak_l
            .fetch_max(master_peak_l.to_bits(), Ordering::Relaxed);
        rt.master_peak_r
            .fetch_max(master_peak_r.to_bits(), Ordering::Relaxed);
        let reduction = self.mixer.take_limiter_reduction_db();
        if reduction > 0.0 {
            rt.limiter_reduction
                .fetch_max(reduction.to_bits(), Ordering::Relaxed);
        }

        rt.callbacks.fetch_add(1, Ordering::Relaxed);
        rt.frames.fetch_add(frames as u64, Ordering::Relaxed);
        rt.peak.fetch_max(peak.to_bits(), Ordering::Relaxed);

        self.consumers.preview.finish_block();

        let elapsed_us = started.elapsed().as_micros().min(u128::from(u32::MAX)) as u32;
        rt.callback_us_last.store(elapsed_us, Ordering::Relaxed);
        rt.callback_us_max.fetch_max(elapsed_us, Ordering::Relaxed);
    }
}

/// Generator sine dengan phase accumulator + smoothing gain 5 ms.
struct ToneOscillator {
    phase: f32,
    gain: f32,
    sample_rate: f32,
}

impl ToneOscillator {
    fn new(sample_rate: f32) -> Self {
        Self {
            phase: 0.0,
            gain: 0.0,
            sample_rate: sample_rate.max(1.0),
        }
    }

    #[inline]
    fn next(&mut self, frequency: f32, target_gain: f32, smoothing: f32) -> f32 {
        self.gain += (target_gain - self.gain) * smoothing;

        let value = (self.phase * std::f32::consts::TAU).sin() * self.gain;

        self.phase += frequency / self.sample_rate;
        if self.phase >= 1.0 {
            self.phase -= self.phase.floor();
        }

        value
    }
}

/// Pengaman akhir master: linear sampai 0.99, lalu menekuk mulus menuju 0.999.
/// Limiter sudah menahan peak di bawah knee ini, sehingga level normal tidak
/// ikut teredam (soft clip lama mengurangi 1.0 menjadi 0.777).
const CLIP_KNEE: f32 = 0.99;
const CLIP_CEILING: f32 = 0.999;

#[inline]
fn soft_clip(x: f32) -> f32 {
    if !x.is_finite() {
        return 0.0;
    }

    let magnitude = x.abs();
    if magnitude <= CLIP_KNEE {
        return x;
    }

    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let range = CLIP_CEILING - CLIP_KNEE;
    let over = magnitude - CLIP_KNEE;
    sign * (CLIP_KNEE + range * (1.0 - (-over / range).exp()))
}

#[inline]
fn store_f32(slot: &AtomicU32, value: f32) {
    slot.store(value.to_bits(), Ordering::Relaxed);
}

#[inline]
fn load_f32(slot: &AtomicU32) -> f32 {
    f32::from_bits(slot.load(Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn soft_clip_is_bounded_and_odd() {
        for x in [-2.0_f32, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0] {
            let y = soft_clip(x);
            assert!(y.abs() <= 1.0, "soft_clip({x}) = {y}");
            assert!((y + soft_clip(-x)).abs() < 1e-6);
        }
        // Level normal harus bit-identik (tidak ada kompresi dini).
        assert_eq!(soft_clip(0.5), 0.5);
        assert_eq!(soft_clip(-0.98), -0.98);
        assert_eq!(soft_clip(f32::NAN), 0.0);
    }

    #[test]
    fn oscillator_ramps_from_silence_without_jump() {
        let mut oscillator = ToneOscillator::new(48_000.0);
        let smoothing = 1.0 - (-1.0 / (GAIN_SMOOTHING_SECONDS * 48_000.0)).exp();
        let first = oscillator.next(440.0, 0.5, smoothing);
        assert_eq!(first, 0.0);

        let second = oscillator.next(440.0, 0.5, smoothing);
        assert!(second.abs() < 0.001, "ramp awal harus halus: {second}");
    }

    #[test]
    fn render_block_fills_every_frame_and_tracks_peak() {
        let request = StartRequest {
            tone_gain_db: Some(-6.0),
            ..Default::default()
        };
        let rt = RtState::new(&request);
        rt.tone_enabled.store(true, Ordering::Relaxed);

        let (_deck_a, deck_a_reader) = Deck::new(48_000).expect("deck a");
        let (_deck_b, deck_b_reader) = Deck::new(48_000).expect("deck b");
        let (_sampler_ctrl, sampler_rt) = SamplerController::new(48_000);
        let (_preview_ctrl, preview_rt) = PreviewController::new(48_000);
        let (_rec_ctrl, rec_rt) = RecorderController::new(48_000);
        let (_bc_ctrl, bc_rt) = BroadcastController::new(48_000);
        let consumers = RtConsumers {
            sampler: sampler_rt,
            preview: preview_rt,
            recorder: rec_rt,
            broadcast: bc_rt,
        };
        let mut context = CallbackContext::new(48_000.0, [deck_a_reader, deck_b_reader], consumers);
        let mut buffer = vec![0.0_f32; 256 * 2];
        // Paksa gain ramp mencapai target supaya peak terdeteksi.
        for _ in 0..64 {
            context.render_block(&mut buffer, 2, 48_000.0, &rt);
        }

        assert!(buffer.iter().all(|sample| sample.is_finite()));
        assert_eq!(rt.callbacks.load(Ordering::Relaxed), 64);
        assert_eq!(rt.frames.load(Ordering::Relaxed), 64 * 256);
        assert!(f32::from_bits(rt.peak.load(Ordering::Relaxed)) > 0.0);
        assert_eq!(buffer[1], buffer[0], "test tone mono pada L/R");
    }

    #[test]
    fn channel_preference_keeps_stereo_as_safe_fallback() {
        assert_eq!(channel_preference(Some(4), 6), vec![4, 2, 6, 1]);
        assert_eq!(channel_preference(Some(0), 2), vec![2, 1]);
        assert_eq!(channel_preference(None, 8), vec![2, 8, 1]);
        // Stereo selalu hadir di daftar sehingga channel map ALSA tidak pernah
        // diminta untuk jumlah channel yang tidak diketahui driver.
        for requested in [None, Some(2), Some(4), Some(6), Some(8)] {
            assert!(channel_preference(requested, 2).contains(&2));
        }
    }

    #[test]
    fn open_error_hint_explains_alsa_channel_map() {
        let hint = open_error_hint(&[
            "BackendSpecific: ALSA lib pcm_route.c find_matching_chmap: Found no matching channel map"
                .to_string(),
        ]);
        assert!(hint.contains("Gagal membuka stream audio"));
        if cfg!(target_os = "linux") {
            assert!(hint.contains("channel map"));
            assert!(hint.contains("SPLIT CUE"));
        }
    }

    #[test]
    fn start_default_engine_logs_check() {
        let res = AudioEngine::start(StartRequest::default());
        eprintln!("AudioEngine::start default: {:?}", res.as_ref().map(|_| "OK"));
        let res4 = AudioEngine::start(StartRequest {
            channels: Some(4),
            ..Default::default()
        });
        eprintln!("AudioEngine::start 4ch: {:?}", res4.as_ref().map(|_| "OK"));
    }
}

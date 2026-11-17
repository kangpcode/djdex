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

fn audio_host_loop(
    request: StartRequest,
    rt: Arc<RtState>,
    info: Arc<Mutex<StreamInfo>>,
    commands: Receiver<AudioCommand>,
    ready: Sender<
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
    >,
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

    let supported = select_config(&device, request)?;
    let sample_rate = supported.sample_rate();
    let channels = supported.channels();
    let sample_format = supported.sample_format();

    let mut config = supported.config();
    config.buffer_size = match request.buffer_size {
        Some(frames) => BufferSize::Fixed(frames),
        None => BufferSize::Default,
    };

    let buffer_frames = match config.buffer_size {
        BufferSize::Fixed(frames) => Some(frames),
        BufferSize::Default => None,
    };
    let latency_ms =
        buffer_frames.map(|frames| f64::from(frames) / f64::from(sample_rate) * 1_000.0);

    // Deck dibuat sebelum stream agar consumer ring buffer bisa langsung
    // dimiliki callback audio.
    let (deck_a, reader_a) = Deck::new(sample_rate)?;
    let (deck_b, reader_b) = Deck::new(sample_rate)?;
    let decks = [Arc::new(deck_a), Arc::new(deck_b)];
    let (sampler_controller, sampler_rt) = SamplerController::new(sample_rate);
    let sampler = Arc::new(sampler_controller);
    let (preview_controller, preview_rt) = PreviewController::new(sample_rate);
    let preview = Arc::new(preview_controller);
    let (recorder, recorder_rt) = RecorderController::new(sample_rate);
    let (broadcast, broadcast_rt) = BroadcastController::new(sample_rate);

    let stream = match sample_format {
        SampleFormat::F32 => {
            build_output::<f32>(&device, config, Arc::clone(&rt), [reader_a, reader_b], sampler_rt, preview_rt, recorder_rt, broadcast_rt)?
        }
        SampleFormat::I16 => {
            build_output::<i16>(&device, config, Arc::clone(&rt), [reader_a, reader_b], sampler_rt, preview_rt, recorder_rt, broadcast_rt)?
        }
        SampleFormat::U16 => {
            build_output::<u16>(&device, config, Arc::clone(&rt), [reader_a, reader_b], sampler_rt, preview_rt, recorder_rt, broadcast_rt)?
        }
        other => {
            return Err(AudioError::UnsupportedSampleFormat(sample_format_label(
                other,
            )))
        }
    };

    stream
        .play()
        .map_err(|err| AudioError::PlayStream(err.to_string()))?;

    Ok(OpenedStream {
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
    })
}

/// Pilih konfigurasi stream: default device, dengan override sample rate/buffer
/// bila diminta dan didukung perangkat.
fn select_config(
    device: &Device,
    request: &StartRequest,
) -> Result<SupportedStreamConfig, AudioError> {
    let default_config = device.default_output_config().map_err(|err| {
        AudioError::UnsupportedConfig(format!("konfigurasi default tidak tersedia: {err}"))
    })?;

    let config = match request.sample_rate {
        Some(rate) if rate != default_config.sample_rate() => {
            let ranges = device
                .supported_output_configs()
                .map_err(|err| AudioError::Enumerate(err.to_string()))?;

            let mut matched = None;
            for range in ranges {
                if range.channels() == default_config.channels()
                    && range.sample_format() == default_config.sample_format()
                    && range.contains_rate(rate)
                {
                    // Non-panicking: rentang sudah dicek, `try_` tetap dipakai
                    // agar tidak ada jalur panic sama sekali.
                    matched = range.try_with_sample_rate(rate);
                    break;
                }
            }

            matched.ok_or_else(|| {
                AudioError::UnsupportedConfig(format!(
                    "sample rate {rate} Hz tidak didukung perangkat ini"
                ))
            })?
        }
        _ => default_config,
    };

    let buffer_out_of_range = match (request.buffer_size, config.buffer_size()) {
        (Some(frames), SupportedBufferSize::Range { min, max }) => frames < *min || frames > *max,
        _ => false,
    };

    if buffer_out_of_range {
        let (min, max) = match config.buffer_size() {
            SupportedBufferSize::Range { min, max } => (*min, *max),
            SupportedBufferSize::Unknown => (0, 0),
        };
        let frames = request.buffer_size.unwrap_or_default();
        return Err(AudioError::UnsupportedConfig(format!(
            "buffer {frames} frame di luar rentang perangkat ({min}-{max})"
        )));
    }

    Ok(config)
}

fn build_output<T>(
    device: &Device,
    config: StreamConfig,
    rt: Arc<RtState>,
    mut decks: [DeckReader; DECK_COUNT],
    mut sampler_rt: SamplerRt,
    mut preview_rt: PreviewPlayerRt,
    mut recorder_rt: RecorderProducer,
    mut broadcast_rt: BroadcastProducer,
) -> Result<Stream, AudioError>
where
    T: SizedSample + FromSample<f32> + Send + 'static,
{
    let channels = usize::from(config.channels.max(1));
    let sample_rate = config.sample_rate as f32;
    let mut oscillator = ToneOscillator::new(sample_rate);
    let mut mixer = Mixer::new(sample_rate);

    let callback_rt = Arc::clone(&rt);
    let error_rt = Arc::clone(&rt);

    device
        .build_output_stream::<T, _, _>(
            config,
            move |data: &mut [T], _info: &cpal::OutputCallbackInfo| {
                render_block(
                    data,
                    channels,
                    sample_rate,
                    &callback_rt,
                    &mut oscillator,
                    &mut decks,
                    &mut sampler_rt,
                    &mut preview_rt,
                    &mut recorder_rt,
                    &mut broadcast_rt,
                    &mut mixer,
                );
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

/// Isi satu buffer output. Fungsi ini berjalan di jalur RT:
/// tidak ada alokasi, lock, I/O, maupun panic.
fn render_block<T>(
    data: &mut [T],
    channels: usize,
    sample_rate: f32,
    rt: &RtState,
    oscillator: &mut ToneOscillator,
    decks: &mut [DeckReader; DECK_COUNT],
    sampler: &mut SamplerRt,
    preview: &mut PreviewPlayerRt,
    recorder: &mut RecorderProducer,
    broadcast: &mut BroadcastProducer,
    mixer: &mut Mixer,
) where
    T: SizedSample + FromSample<f32>,
{
    let started = Instant::now();
    let channels = channels.max(1);
    let params = rt.mixer.params();
    let fx_params = rt.fx.params();
    mixer.configure(&params, &fx_params);
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
    let (deck_a_target, deck_b_target) = (decks[0].target_gain(), decks[1].target_gain());
    let (mut deck_a_gain, mut deck_b_gain) = (decks[0].current_gain(), decks[1].current_gain());

    let frames = data.len() / channels;
    let (first, second) = decks.split_at_mut(1);
    let deck_a_reader = &mut first[0];
    let deck_b_reader = &mut second[0];
    let deck_a_samples = deck_a_reader.prepare(frames);
    let deck_a_frames = deck_a_samples.len() / 2;
    let deck_b_samples = deck_b_reader.prepare(frames);
    let deck_b_frames = deck_b_samples.len() / 2;

    sampler.process_block(frames, 128.0);
    preview.prepare_block();

    let mut peak = 0.0_f32;
    let mut deck_a_peak = 0.0_f32;
    let mut deck_b_peak = 0.0_f32;
    let mut master_peak_l = 0.0_f32;
    let mut master_peak_r = 0.0_f32;

    for (index, frame) in data.chunks_mut(channels).enumerate() {
        let tone = oscillator.next(frequency, tone_target, tone_smoothing);
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
            sampler.sample_at(index)
        } else {
            (0.0, 0.0)
        };
        let preview_sample = preview.next_sample();

        let mix = mixer.process(
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
        recorder.push(out_left, out_right);
        broadcast.push(out_left, out_right);

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
    let reduction = mixer.take_limiter_reduction_db();
    if reduction > 0.0 {
        rt.limiter_reduction
            .fetch_max(reduction.to_bits(), Ordering::Relaxed);
    }

    rt.callbacks.fetch_add(1, Ordering::Relaxed);
    rt.frames.fetch_add(frames as u64, Ordering::Relaxed);
    rt.peak.fetch_max(peak.to_bits(), Ordering::Relaxed);

    preview.finish_block();

    let elapsed_us = started.elapsed().as_micros().min(u128::from(u32::MAX)) as u32;
    rt.callback_us_last.store(elapsed_us, Ordering::Relaxed);
    rt.callback_us_max.fetch_max(elapsed_us, Ordering::Relaxed);
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

        let mut oscillator = ToneOscillator::new(48_000.0);
        let (_deck_a, deck_a_reader) = Deck::new(48_000).expect("deck a");
        let (_deck_b, deck_b_reader) = Deck::new(48_000).expect("deck b");
        let mut decks = [deck_a_reader, deck_b_reader];
        let (_sampler_ctrl, mut sampler_rt) = SamplerController::new(48_000);
        let (_preview_ctrl, mut preview_rt) = PreviewController::new(48_000);
        let (_rec_ctrl, mut rec_rt) = RecorderController::new(48_000);
        let (_bc_ctrl, mut bc_rt) = BroadcastController::new(48_000);
        let mut mixer = Mixer::new(48_000.0);
        let mut buffer = vec![0.0_f32; 256 * 2];
        // Paksa gain ramp mencapai target supaya peak terdeteksi.
        for _ in 0..64 {
            render_block(
                &mut buffer,
                2,
                48_000.0,
                &rt,
                &mut oscillator,
                &mut decks,
                &mut sampler_rt,
                &mut preview_rt,
                &mut rec_rt,
                &mut bc_rt,
                &mut mixer,
            );
        }

        assert!(buffer.iter().all(|sample| sample.is_finite()));
        assert_eq!(rt.callbacks.load(Ordering::Relaxed), 64);
        assert_eq!(rt.frames.load(Ordering::Relaxed), 64 * 256);
        assert!(f32::from_bits(rt.peak.load(Ordering::Relaxed)) > 0.0);
        assert_eq!(buffer[1], buffer[0], "test tone mono pada L/R");
    }
}

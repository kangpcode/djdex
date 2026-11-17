//! Deck: streaming decode → resample → time-stretch → ring buffer → callback.
//!
//! Pembagian tugas:
//! - **Worker deck** memiliki decoder Symphonia dan mengisi ring buffer dengan
//!   audio stereo pada sample rate engine. Prebuffer berjalan walau paused.
//! - **Callback audio** hanya membaca ring, mengurus play/pause, menghitung
//!   posisi, dan melaporkan peak/underrun. Tidak ada alokasi atau lock.
//! - **UI thread** mengirim command (load/seek/cue) dan membaca status.
//!
//! Fase 3 menambahkan tempo/key lock:
//! - Key lock OFF: resampler worker memakai step `base * speed` sehingga tempo
//!   dan pitch berubah bersama (perilaku turntable).
//! - Key lock ON: resampler menjadi pitch-shifter (`speed = pitch`), lalu WSOLA
//!   time-stretch dengan rasio `speed / pitch` agar durasi mengikuti tempo tanpa
//!   mengubah pitch. `keyshift` mengubah pitch via semitone.
//!
//! Sinkronisasi seek memakai epoch: worker menaikkan `reset_epoch` dan menulis
//! `reset_position`; callback mendeteksi perubahan, membuang isi ring lama, dan
//! memulai hitungan posisi dari titik baru. Ini menghindari lock bersama.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver, Sender};
use parking_lot::Mutex;
use rtrb::{Consumer, Producer, RingBuffer};
use serde::Serialize;

use crate::analysis::track::{analyze, TrackAnalysis};
use crate::analysis::waveform::{Waveform, WaveformDto};
use crate::audio::decoder::TrackDecoder;
use crate::audio::gain::linear_to_db;
use crate::audio::resampler::StereoResampler;
use crate::audio::timestretch::{TimeStretcher, WsolaStretcher};
use crate::error::AudioError;

/// Kapasitas ring: 1 detik audio pada sample rate engine. Prebuffer yang
/// dipakai ±0,3 detik (lihat `FILL_MARGIN_RATIO`) agar perubahan tempo/keylock
/// terdengar cepat tanpa mengorbankan ketahanan terhadap underrun.
const RING_SECONDS: usize = 1;
/// Worker berhenti decode saat ruang bebas < 70% kapasitas, sehingga buffer
/// terisi ±30%. Nilai ini menentukan latensi respons pitch fader.
const FILL_MARGIN_RATIO: usize = 70;
/// Ukuran scratch stereo callback (frame) — cukup untuk buffer backend besar.
const CALLBACK_SCRATCH_FRAMES: usize = 32_768;

const DEFAULT_GAIN_DB: f32 = 0.0;
const DEFAULT_SPEED: f32 = 1.0;
const DEFAULT_PITCH_RANGE: f32 = 8.0;
/// Pilihan rentang pitch fader dalam persen.
const PITCH_RANGES: [f32; 3] = [8.0, 16.0, 50.0];
/// Batas tunggu ack discard dari callback setelah load/seek.
const RESET_ACK_TIMEOUT: Duration = Duration::from_millis(120);
/// Jumlah hot cue per deck.
pub const HOT_CUE_SLOTS: usize = 8;
/// Sentinel slot hot cue kosong (bit f64).
const HOT_CUE_UNSET: u64 = u64::MAX;
/// Panjang fade di batas loop agar sambungan tidak berbunyi klik.
const LOOP_FADE_SECONDS: f32 = 0.002;

fn store_f64(slot: &AtomicU64, value: f64) {
    slot.store(value.to_bits(), Ordering::Relaxed);
}

fn load_f64(slot: &AtomicU64) -> f64 {
    f64::from_bits(slot.load(Ordering::Relaxed))
}

fn store_f32(slot: &AtomicU32, value: f32) {
    slot.store(value.to_bits(), Ordering::Relaxed);
}

fn load_f32(slot: &AtomicU32) -> f32 {
    f32::from_bits(slot.load(Ordering::Relaxed))
}

/// State yang dibagi antara callback, worker, dan UI.
struct DeckShared {
    loaded: AtomicBool,
    playing: AtomicBool,
    eof: AtomicBool,
    position_secs: AtomicU64,
    duration_secs: AtomicU64,
    cue_secs: AtomicU64,
    reset_epoch: AtomicU64,
    reset_ack_epoch: AtomicU64,
    reset_position_secs: AtomicU64,
    gain: AtomicU32,
    speed: AtomicU32,
    pitch_range: AtomicU32,
    keylock: AtomicBool,
    semitones: AtomicU32,
    bpm_override: AtomicU64,
    peak: AtomicU32,
    underruns: AtomicU64,
    buffered_frames: AtomicU32,
    waveform_ready: AtomicBool,
    track_id: AtomicU64,
    hot_cues: [AtomicU64; HOT_CUE_SLOTS],
    loop_active: AtomicBool,
    loop_start_secs: AtomicU64,
    loop_end_secs: AtomicU64,
    loop_beats: AtomicU32,
    bend: AtomicU32,
    engine_sample_rate: u32,
}

impl DeckShared {
    fn new(engine_sample_rate: u32) -> Self {
        Self {
            loaded: AtomicBool::new(false),
            playing: AtomicBool::new(false),
            eof: AtomicBool::new(false),
            position_secs: AtomicU64::new(0.0_f64.to_bits()),
            duration_secs: AtomicU64::new(0.0_f64.to_bits()),
            cue_secs: AtomicU64::new(0.0_f64.to_bits()),
            reset_epoch: AtomicU64::new(0),
            reset_ack_epoch: AtomicU64::new(0),
            reset_position_secs: AtomicU64::new(0.0_f64.to_bits()),
            gain: AtomicU32::new(crate::audio::gain::db_to_linear(DEFAULT_GAIN_DB).to_bits()),
            speed: AtomicU32::new(DEFAULT_SPEED.to_bits()),
            pitch_range: AtomicU32::new(DEFAULT_PITCH_RANGE.to_bits()),
            keylock: AtomicBool::new(false),
            semitones: AtomicU32::new(0.0_f32.to_bits()),
            bpm_override: AtomicU64::new(0.0_f64.to_bits()),
            peak: AtomicU32::new(0.0_f32.to_bits()),
            underruns: AtomicU64::new(0),
            buffered_frames: AtomicU32::new(0),
            waveform_ready: AtomicBool::new(false),
            track_id: AtomicU64::new(0),
            hot_cues: std::array::from_fn(|_| AtomicU64::new(HOT_CUE_UNSET)),
            loop_active: AtomicBool::new(false),
            loop_start_secs: AtomicU64::new(0.0_f64.to_bits()),
            loop_end_secs: AtomicU64::new(0.0_f64.to_bits()),
            loop_beats: AtomicU32::new(0.0_f32.to_bits()),
            bend: AtomicU32::new(1.0_f32.to_bits()),
            engine_sample_rate,
        }
    }

    /// Minta callback membuang buffer lama dan mulai dari posisi baru.
    /// Mengembalikan epoch yang harus di-ack callback sebelum worker mengisi
    /// data baru (mencegah data baru ikut terbuang).
    fn request_reset(&self, position_secs: f64) -> u64 {
        store_f64(&self.reset_position_secs, position_secs);
        store_f64(&self.position_secs, position_secs);
        self.reset_epoch.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Tunggu callback menyelesaikan discard (maksimum `timeout`).
    fn wait_reset_ack(&self, epoch: u64, timeout: Duration) {
        let deadline = Instant::now() + timeout;
        while self.reset_ack_epoch.load(Ordering::Relaxed) < epoch {
            if Instant::now() >= deadline {
                break;
            }
            thread::sleep(Duration::from_millis(1));
        }
    }
}

/// Metadata non-RT track yang sedang dimuat.
#[derive(Debug, Clone, Default)]
struct DeckMeta {
    file_name: Option<String>,
    codec: Option<String>,
    source_sample_rate: u32,
    channels: u16,
    last_error: Option<String>,
}

/// Snapshot status deck untuk UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckStatus {
    pub loaded: bool,
    pub playing: bool,
    pub eof: bool,
    pub file_name: Option<String>,
    pub codec: Option<String>,
    pub duration_secs: f64,
    pub position_secs: f64,
    pub source_sample_rate: u32,
    pub engine_sample_rate: u32,
    pub channels: u16,
    pub gain_db: f32,
    pub cue_secs: f64,
    pub buffered_ms: f64,
    pub underruns: u64,
    pub peak: f32,
    pub waveform_ready: bool,
    pub track_id: u64,
    // Fase 3: tempo & key.
    pub speed: f32,
    pub pitch_range: f32,
    pub keylock: bool,
    pub semitones: f32,
    pub bpm: f64,
    pub detected_bpm: f64,
    pub bpm_confidence: f32,
    pub first_beat_secs: f64,
    pub key_name: Option<String>,
    pub camelot: Option<String>,
    pub key_confidence: f32,
    pub analysis_ready: bool,
    // Fase 5: hot cue, loop, dan jog bend.
    pub hot_cues: Vec<Option<f64>>,
    pub loop_active: bool,
    pub loop_start_secs: f64,
    pub loop_end_secs: f64,
    pub loop_beats: f64,
    pub bend: f32,
    pub error: Option<String>,
}

impl DeckStatus {
    /// Status sebelum engine/deck tersedia.
    pub fn idle() -> Self {
        Self {
            loaded: false,
            playing: false,
            eof: false,
            file_name: None,
            codec: None,
            duration_secs: 0.0,
            position_secs: 0.0,
            source_sample_rate: 0,
            engine_sample_rate: 0,
            channels: 0,
            gain_db: DEFAULT_GAIN_DB,
            cue_secs: 0.0,
            buffered_ms: 0.0,
            underruns: 0,
            peak: 0.0,
            waveform_ready: false,
            track_id: 0,
            speed: DEFAULT_SPEED,
            pitch_range: DEFAULT_PITCH_RANGE,
            keylock: false,
            semitones: 0.0,
            bpm: 0.0,
            detected_bpm: 0.0,
            bpm_confidence: 0.0,
            first_beat_secs: 0.0,
            key_name: None,
            camelot: None,
            key_confidence: 0.0,
            analysis_ready: false,
            hot_cues: vec![None; HOT_CUE_SLOTS],
            loop_active: false,
            loop_start_secs: 0.0,
            loop_end_secs: 0.0,
            loop_beats: 0.0,
            bend: 1.0,
            error: None,
        }
    }
}

/// Snapshot ringan untuk Auto DJ / kontrol non-UI. Tidak mengambil (swap)
/// meter peak, sehingga polling kontrol tidak mencuri data meter dari UI.
#[derive(Debug, Clone, Copy)]
pub struct DeckTransport {
    pub loaded: bool,
    pub playing: bool,
    pub eof: bool,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub cue_secs: f64,
    pub first_beat_secs: f64,
    pub bpm: f64,
    pub speed: f32,
    pub track_id: u64,
}

/// Sisi callback audio: membaca ring buffer tanpa alokasi maupun lock.
pub struct DeckReader {
    consumer: Consumer<f32>,
    shared: Arc<DeckShared>,
    scratch: Vec<f32>,
    epoch: u64,
    /// Posisi track (detik sumber) yang diintegrasikan per blok audio.
    position_secs: f64,
    gain: f32,
}

impl DeckReader {
    fn new(consumer: Consumer<f32>, shared: Arc<DeckShared>) -> Self {
        let gain = load_f32(&shared.gain);
        Self {
            consumer,
            shared,
            scratch: vec![0.0; CALLBACK_SCRATCH_FRAMES * 2],
            epoch: u64::MAX,
            position_secs: 0.0,
            gain,
        }
    }

    /// Ambil audio untuk satu blok output. Mengembalikan stereo interleaved
    /// (maksimal sepanjang scratch); sisa frame harus diisi senyap oleh mixer.
    pub fn prepare(&mut self, frames: usize) -> &[f32] {
        self.sync_epoch();
        let sample_rate = f64::from(self.shared.engine_sample_rate.max(1));

        // Track habis: hentikan transport dan kunci posisi di durasi. Jika
        // prebuffer belum terisi, callback menunggu (underrun) tanpa memajukan
        // posisi agar tidak ada lompatan waktu.
        if self.shared.playing.load(Ordering::Relaxed)
            && self.shared.eof.load(Ordering::Relaxed)
            && self.consumer.slots() == 0
            && !self.shared.loop_active.load(Ordering::Relaxed)
        {
            self.shared.playing.store(false, Ordering::Relaxed);
            let duration = load_f64(&self.shared.duration_secs);
            store_f64(&self.shared.position_secs, duration);
            self.position_secs = duration;
        }

        let playing = self.shared.playing.load(Ordering::Relaxed);
        let want_frames = frames.min(self.scratch.len() / 2);
        let mut got_frames = 0_usize;

        if playing && want_frames > 0 {
            let (filled, _) = self
                .consumer
                .pop_partial_slice(&mut self.scratch[..want_frames * 2]);
            got_frames = filled.len() / 2;

            if got_frames < want_frames {
                self.shared.underruns.fetch_add(1, Ordering::Relaxed);
            }

            if got_frames > 0 {
                // Integrasi per blok memakai speed + bend saat ini, sehingga
                // perubahan tempo tidak membuat posisi melompat.
                let speed = f64::from(load_f32(&self.shared.speed).clamp(0.25, 4.0));
                let bend = f64::from(load_f32(&self.shared.bend).clamp(0.5, 2.0));
                self.position_secs += got_frames as f64 / sample_rate * speed * bend;

                // Loop menahan playhead di dalam region yang sama dengan worker.
                if self.shared.loop_active.load(Ordering::Relaxed) {
                    let start = load_f64(&self.shared.loop_start_secs);
                    let end = load_f64(&self.shared.loop_end_secs);
                    if end > start && self.position_secs >= end {
                        let length = end - start;
                        self.position_secs =
                            start + (self.position_secs - start).rem_euclid(length);
                    }
                }

                let duration = load_f64(&self.shared.duration_secs);
                let position = if duration > 0.0 {
                    self.position_secs.min(duration)
                } else {
                    self.position_secs
                };
                store_f64(&self.shared.position_secs, position);
            }
        }

        self.shared
            .buffered_frames
            .store((self.consumer.slots() / 2) as u32, Ordering::Relaxed);

        &self.scratch[..got_frames * 2]
    }

    pub fn target_gain(&self) -> f32 {
        load_f32(&self.shared.gain)
    }

    pub fn current_gain(&self) -> f32 {
        self.gain
    }

    pub fn set_current_gain(&mut self, gain: f32) {
        self.gain = gain;
    }

    pub fn report_peak(&self, peak: f32) {
        if peak > 0.0 {
            self.shared
                .peak
                .fetch_max(peak.to_bits(), Ordering::Relaxed);
        }
    }

    /// Deteksi seek/load baru: buang buffer lama dan mulai dari epoch baru.
    fn sync_epoch(&mut self) {
        let epoch = self.shared.reset_epoch.load(Ordering::Relaxed);
        if epoch == self.epoch {
            return;
        }
        self.epoch = epoch;

        loop {
            let (filled, _) = self.consumer.pop_partial_slice(&mut self.scratch);
            if filled.is_empty() {
                break;
            }
        }

        self.position_secs = load_f64(&self.shared.reset_position_secs);
        store_f64(&self.shared.position_secs, self.position_secs);
        self.gain = load_f32(&self.shared.gain);
        self.shared
            .reset_ack_epoch
            .store(self.epoch, Ordering::Relaxed);
    }
}

struct LoadedTrack {
    decoder: TrackDecoder,
    resampler: StereoResampler,
    stretcher: WsolaStretcher,
    source: Vec<f32>,
    stereo: Vec<f32>,
    resampled: Vec<f32>,
    output: Vec<f32>,
    source_channels: usize,
    source_rate: u32,
    decoded_frames: u64,
    fade_in_pending: bool,
    eof: bool,
    keylock: bool,
}

impl LoadedTrack {
    fn new(decoder: TrackDecoder, engine_rate: u32) -> Self {
        let info = decoder.info();
        Self {
            resampler: StereoResampler::new(info.source_sample_rate, engine_rate),
            stretcher: WsolaStretcher::new(),
            source_channels: usize::from(info.channels.max(1)),
            source_rate: info.source_sample_rate.max(1),
            decoded_frames: 0,
            fade_in_pending: true,
            decoder,
            source: Vec::with_capacity(32_768),
            stereo: Vec::with_capacity(32_768),
            resampled: Vec::with_capacity(32_768),
            output: Vec::with_capacity(32_768),
            eof: false,
            keylock: false,
        }
    }

    fn reset_tempo_state(&mut self) {
        self.resampler.reset();
        self.stretcher.reset();
        self.keylock = false;
    }

    /// Seek decoder sekaligus memperbarui timeline frame sumber.
    fn seek_source(&mut self, target: f64) -> Result<(), AudioError> {
        self.decoder.seek(target)?;
        self.eof = false;
        self.decoded_frames = (target.max(0.0) * f64::from(self.source_rate)).round() as u64;
        self.fade_in_pending = true;
        Ok(())
    }

    /// Decode satu paket, ubah ke stereo, terapkan tempo/key lock, lalu isi
    /// ring. Seluruh alokasi sudah dilakukan sebelumnya; `process()` WSOLA
    /// hanya memperluas buffer yang sudah ada.
    fn fill(
        &mut self,
        producer: &mut Producer<f32>,
        shared: &DeckShared,
    ) -> Result<bool, AudioError> {
        if self.eof {
            return Ok(false);
        }

        let loop_region = active_loop(shared);
        if !self.decoder.decode_next(&mut self.source)? {
            if let Some((start, _)) = loop_region {
                // Loop yang berakhir tepat di EOF tetap harus berulang.
                self.seek_source(start)?;
                return Ok(true);
            }
            self.eof = true;
            return Ok(false);
        }

        let channels = self.source_channels;
        let packet_start = self.decoded_frames;
        let mut packet_frames = self.source.len() / channels;
        let mut wrap_at = None;

        // Potong paket tepat di akhir loop, lalu putar ulang decoder dari awal
        // loop. Fade 2 ms meredam diskontinuitas pada waveform yang tidak pas.
        if let Some((start, end)) = loop_region {
            let start_frame = (start * f64::from(self.source_rate)).round().max(0.0) as u64;
            let end_frame = (end * f64::from(self.source_rate)).round().max(0.0) as u64;
            if end_frame > start_frame && packet_start + packet_frames as u64 > end_frame {
                let keep = end_frame.saturating_sub(packet_start) as usize;
                if keep == 0 {
                    self.seek_source(start)?;
                    return Ok(true);
                }
                if keep < packet_frames {
                    self.source.truncate(keep * channels);
                    packet_frames = keep;
                    wrap_at = Some((start, start_frame));
                }
            }
        }
        self.decoded_frames = packet_start + packet_frames as u64;

        self.stereo.clear();
        for frame in self.source.chunks_exact(channels) {
            let left = frame[0];
            let right = if channels > 1 { frame[1] } else { left };
            self.stereo.push(left);
            self.stereo.push(right);
        }

        let speed =
            load_f32(&shared.speed).clamp(0.25, 4.0) * load_f32(&shared.bend).clamp(0.5, 2.0);
        let keylock = shared.keylock.load(Ordering::Relaxed);
        let semitones = load_f32(&shared.semitones).clamp(-12.0, 12.0);

        if keylock != self.keylock {
            // Transisi mode: buang state WSOLA agar tidak memutar history lama.
            self.stretcher.reset();
            self.keylock = keylock;
        }

        self.output.clear();
        if keylock {
            let pitch = 2.0_f32.powf(semitones / 12.0);
            self.resampler.set_speed(pitch);
            self.resampled.clear();
            self.resampler.process(&self.stereo, &mut self.resampled);

            let stretch_speed = (speed / pitch).clamp(0.25, 4.0);
            self.stretcher
                .process(&self.resampled, stretch_speed, &mut self.output);
        } else {
            self.resampler.set_speed(speed);
            self.resampler.process(&self.stereo, &mut self.output);
        }

        let fade_frames =
            (f64::from(shared.engine_sample_rate) * f64::from(LOOP_FADE_SECONDS)) as usize;
        if self.fade_in_pending && !self.output.is_empty() {
            fade_in(&mut self.output, fade_frames);
            self.fade_in_pending = false;
        }
        if wrap_at.is_some() {
            fade_out(&mut self.output, fade_frames);
        }

        let mut remaining: &[f32] = &self.output;
        while !remaining.is_empty() {
            if producer.is_abandoned() {
                return Ok(false);
            }
            let (_, rest) = producer.push_partial_slice(remaining);
            if rest.is_empty() {
                break;
            }
            remaining = rest;
            thread::sleep(Duration::from_millis(1));
        }

        if let Some((start, start_frame)) = wrap_at {
            if let Err(err) = self.decoder.seek(start) {
                self.eof = true;
                return Err(err);
            }
            self.decoded_frames = start_frame;
            self.fade_in_pending = true;
            self.eof = false;
        }

        Ok(true)
    }
}

fn active_loop(shared: &DeckShared) -> Option<(f64, f64)> {
    if !shared.loop_active.load(Ordering::Relaxed) {
        return None;
    }
    let start = load_f64(&shared.loop_start_secs);
    let end = load_f64(&shared.loop_end_secs);
    if end > start + 0.005 {
        Some((start, end))
    } else {
        None
    }
}

fn fade_in(buffer: &mut [f32], frames: usize) {
    let frames = frames.min(buffer.len() / 2);
    if frames == 0 {
        return;
    }
    for index in 0..frames {
        let gain = (index + 1) as f32 / frames as f32;
        buffer[index * 2] *= gain;
        buffer[index * 2 + 1] *= gain;
    }
}

fn fade_out(buffer: &mut [f32], frames: usize) {
    let total = buffer.len() / 2;
    let frames = frames.min(total);
    if frames == 0 {
        return;
    }
    for index in 0..frames {
        let gain = (frames - index) as f32 / frames as f32;
        let offset = (total - frames + index) * 2;
        buffer[offset] *= gain;
        buffer[offset + 1] *= gain;
    }
}

enum DeckCommand {
    Load {
        path: PathBuf,
        reply: Sender<Result<(), AudioError>>,
    },
    Seek(f64),
    SetCue,
    CueJump,
    HotCueSet(u8),
    HotCueTrigger(u8),
    HotCueClear(u8),
    SetLoop {
        start: f64,
        end: f64,
        beats: f64,
    },
    ExitLoop,
    BeatJump(f64),
    Unload,
    Shutdown,
}

struct DeckWorker {
    engine_rate: u32,
    fill_margin: usize,
    shared: Arc<DeckShared>,
    meta: Arc<Mutex<DeckMeta>>,
    waveform: Arc<Mutex<Option<Waveform>>>,
    analysis: Arc<Mutex<Option<TrackAnalysis>>>,
    current_track: Arc<AtomicU64>,
    loaded: Option<LoadedTrack>,
}

impl DeckWorker {
    fn run(mut self, mut producer: Producer<f32>, commands: Receiver<DeckCommand>) {
        loop {
            let producing = self
                .loaded
                .as_ref()
                .map(|track| !track.eof)
                .unwrap_or(false);

            if producing {
                if producer.is_abandoned() {
                    // Engine berhenti: consumer sudah dilepas, hentikan worker.
                    return;
                }

                while let Ok(command) = commands.try_recv() {
                    if !self.handle(command) {
                        return;
                    }
                }

                if producer.slots() < self.fill_margin {
                    if let Ok(command) = commands.recv_timeout(Duration::from_millis(15)) {
                        if !self.handle(command) {
                            return;
                        }
                    }
                    continue;
                }

                let Some(track) = self.loaded.as_mut() else {
                    continue;
                };

                match track.fill(&mut producer, &self.shared) {
                    Ok(true) => {}
                    Ok(false) => {
                        self.shared.eof.store(true, Ordering::Relaxed);
                    }
                    Err(err) => {
                        self.shared.eof.store(true, Ordering::Relaxed);
                        self.meta.lock().last_error = Some(err.to_string());
                    }
                }
            } else {
                match commands.recv() {
                    Ok(command) => {
                        if !self.handle(command) {
                            return;
                        }
                    }
                    Err(_) => return,
                }
            }
        }
    }

    /// Mengembalikan `false` bila worker harus berhenti.
    fn handle(&mut self, command: DeckCommand) -> bool {
        match command {
            DeckCommand::Load { path, reply } => {
                let result = self.load(path);
                let _ = reply.send(result);
                true
            }
            DeckCommand::Seek(seconds) => {
                self.seek(seconds);
                true
            }
            DeckCommand::SetCue => {
                let position = load_f64(&self.shared.position_secs);
                store_f64(&self.shared.cue_secs, position);
                true
            }
            DeckCommand::CueJump => {
                self.cue_jump();
                true
            }
            DeckCommand::HotCueSet(slot) => {
                self.hot_cue_set(slot);
                true
            }
            DeckCommand::HotCueTrigger(slot) => {
                self.hot_cue_trigger(slot);
                true
            }
            DeckCommand::HotCueClear(slot) => {
                self.hot_cue_clear(slot);
                true
            }
            DeckCommand::SetLoop { start, end, beats } => {
                self.set_loop(start, end, beats);
                true
            }
            DeckCommand::ExitLoop => {
                self.exit_loop();
                true
            }
            DeckCommand::BeatJump(seconds) => {
                let position = load_f64(&self.shared.position_secs) + seconds;
                self.seek(position);
                true
            }
            DeckCommand::Unload => {
                self.unload();
                true
            }
            DeckCommand::Shutdown => false,
        }
    }

    fn load(&mut self, path: PathBuf) -> Result<(), AudioError> {
        self.shared.playing.store(false, Ordering::Relaxed);

        let decoder = TrackDecoder::open(&path)?;
        let info = decoder.info().clone();
        let track_id = self.shared.track_id.fetch_add(1, Ordering::Relaxed) + 1;

        self.loaded = Some(LoadedTrack::new(decoder, self.engine_rate));
        self.shared.loaded.store(true, Ordering::Relaxed);
        self.shared.eof.store(false, Ordering::Relaxed);
        self.shared.waveform_ready.store(false, Ordering::Relaxed);
        store_f64(&self.shared.bpm_override, 0.0);
        store_f64(&self.shared.duration_secs, info.duration_secs);
        store_f64(&self.shared.cue_secs, 0.0);
        for slot in &self.shared.hot_cues {
            slot.store(HOT_CUE_UNSET, Ordering::Relaxed);
        }
        self.shared.loop_active.store(false, Ordering::Relaxed);
        store_f64(&self.shared.loop_start_secs, 0.0);
        store_f64(&self.shared.loop_end_secs, 0.0);
        store_f32(&self.shared.loop_beats, 0.0);
        store_f32(&self.shared.bend, 1.0);
        let epoch = self.shared.request_reset(0.0);
        self.shared.wait_reset_ack(epoch, RESET_ACK_TIMEOUT);
        self.current_track.store(track_id, Ordering::Relaxed);

        *self.meta.lock() = DeckMeta {
            file_name: Some(info.file_name.clone()),
            codec: Some(info.codec.clone()),
            source_sample_rate: info.source_sample_rate,
            channels: info.channels,
            last_error: None,
        };
        *self.waveform.lock() = None;
        *self.analysis.lock() = None;

        self.spawn_analysis(path, track_id);
        Ok(())
    }

    fn seek(&mut self, target: f64) {
        let Some(track) = self.loaded.as_mut() else {
            return;
        };

        let duration = load_f64(&self.shared.duration_secs);
        let upper = if duration > 0.0 {
            duration
        } else {
            target.max(0.0)
        };
        let target = target.clamp(0.0, upper);

        match track.seek_source(target) {
            Ok(()) => {
                track.reset_tempo_state();
                self.shared.eof.store(false, Ordering::Relaxed);
                let epoch = self.shared.request_reset(target);
                self.shared.wait_reset_ack(epoch, RESET_ACK_TIMEOUT);
            }
            Err(err) => {
                self.meta.lock().last_error = Some(err.to_string());
            }
        }
    }

    fn hot_cue_set(&mut self, slot: u8) {
        let slot = usize::from(slot);
        if slot >= HOT_CUE_SLOTS || self.loaded.is_none() {
            return;
        }
        let position = load_f64(&self.shared.position_secs);
        self.shared.hot_cues[slot].store(position.to_bits(), Ordering::Relaxed);
    }

    fn hot_cue_trigger(&mut self, slot: u8) {
        let slot = usize::from(slot);
        if slot >= HOT_CUE_SLOTS || self.loaded.is_none() {
            return;
        }
        let bits = self.shared.hot_cues[slot].load(Ordering::Relaxed);
        if bits == HOT_CUE_UNSET {
            return;
        }
        self.shared.playing.store(true, Ordering::Relaxed);
        self.seek(f64::from_bits(bits));
    }

    fn hot_cue_clear(&mut self, slot: u8) {
        let slot = usize::from(slot);
        if slot < HOT_CUE_SLOTS {
            self.shared.hot_cues[slot].store(HOT_CUE_UNSET, Ordering::Relaxed);
        }
    }

    /// Aktifkan loop dan pindahkan playhead ke awal loop agar worker dan UI
    /// mulai dari sampel yang sama.
    fn set_loop(&mut self, start: f64, end: f64, beats: f64) {
        if self.loaded.is_none() {
            return;
        }
        let duration = load_f64(&self.shared.duration_secs);
        let upper = if duration > 0.0 {
            duration
        } else {
            end.max(start)
        };
        let start = start.clamp(0.0, upper);
        let end = end.clamp(0.0, upper);
        if end - start < 0.01 {
            return;
        }

        store_f64(&self.shared.loop_start_secs, start);
        store_f64(&self.shared.loop_end_secs, end);
        store_f32(&self.shared.loop_beats, beats.max(0.0) as f32);
        self.shared.loop_active.store(true, Ordering::Relaxed);
        self.seek(start);
    }

    fn exit_loop(&mut self) {
        if self.loaded.is_none() {
            return;
        }
        let position = load_f64(&self.shared.position_secs);
        self.shared.loop_active.store(false, Ordering::Relaxed);
        self.seek(position);
    }

    /// Perilaku CUE gaya CDJ: saat playing kembali ke cue & pause; saat sudah di
    /// cue mulai play; saat paused di posisi lain lompat ke cue.
    fn cue_jump(&mut self) {
        if self.loaded.is_none() {
            return;
        }

        let cue = load_f64(&self.shared.cue_secs);
        let position = load_f64(&self.shared.position_secs);
        let playing = self.shared.playing.load(Ordering::Relaxed);

        if playing {
            self.shared.playing.store(false, Ordering::Relaxed);
            self.seek(cue);
        } else if (position - cue).abs() <= 0.05 {
            self.shared.playing.store(true, Ordering::Relaxed);
        } else {
            self.seek(cue);
        }
    }

    fn unload(&mut self) {
        self.shared.playing.store(false, Ordering::Relaxed);
        self.shared.loaded.store(false, Ordering::Relaxed);
        self.shared.eof.store(true, Ordering::Relaxed);
        self.shared.waveform_ready.store(false, Ordering::Relaxed);
        store_f64(&self.shared.bpm_override, 0.0);
        store_f64(&self.shared.duration_secs, 0.0);
        store_f64(&self.shared.cue_secs, 0.0);
        for slot in &self.shared.hot_cues {
            slot.store(HOT_CUE_UNSET, Ordering::Relaxed);
        }
        self.shared.loop_active.store(false, Ordering::Relaxed);
        store_f64(&self.shared.loop_start_secs, 0.0);
        store_f64(&self.shared.loop_end_secs, 0.0);
        store_f32(&self.shared.loop_beats, 0.0);
        store_f32(&self.shared.bend, 1.0);
        let epoch = self.shared.request_reset(0.0);
        self.shared.wait_reset_ack(epoch, RESET_ACK_TIMEOUT);
        self.current_track.fetch_add(1, Ordering::Relaxed);
        *self.waveform.lock() = None;
        *self.analysis.lock() = None;
        *self.meta.lock() = DeckMeta::default();
        self.loaded = None;
    }

    fn spawn_analysis(&self, path: PathBuf, track_id: u64) {
        let waveform_store = Arc::clone(&self.waveform);
        let analysis_store = Arc::clone(&self.analysis);
        let shared = Arc::clone(&self.shared);
        let current = Arc::clone(&self.current_track);

        let _ = thread::Builder::new()
            .name("djdex-analysis".to_string())
            .spawn(move || match analyze(&path, &current, track_id) {
                Ok(Some((waveform, analysis))) => {
                    if current.load(Ordering::Relaxed) != track_id {
                        return;
                    }
                    if waveform.duration_secs > 0.0 {
                        store_f64(&shared.duration_secs, waveform.duration_secs);
                    }
                    *waveform_store.lock() = Some(waveform);
                    *analysis_store.lock() = Some(analysis);
                    shared.waveform_ready.store(true, Ordering::Relaxed);
                }
                Ok(None) => {}
                Err(_) => {
                    // Analisis bersifat opsional: kegagalan tidak boleh
                    // menghentikan playback.
                }
            });
    }
}

/// Handle publik deck untuk command layer dan engine.
pub struct Deck {
    shared: Arc<DeckShared>,
    meta: Arc<Mutex<DeckMeta>>,
    waveform: Arc<Mutex<Option<Waveform>>>,
    analysis: Arc<Mutex<Option<TrackAnalysis>>>,
    commands: Sender<DeckCommand>,
    worker: Option<JoinHandle<()>>,
    engine_sample_rate: u32,
}

impl Deck {
    /// Buat deck + worker; `DeckReader` diserahkan ke callback audio.
    pub fn new(engine_sample_rate: u32) -> Result<(Self, DeckReader), AudioError> {
        let ring_frames = (engine_sample_rate as usize * RING_SECONDS).max(16_384);
        let ring_samples = ring_frames * 2;
        let fill_margin = ring_samples * FILL_MARGIN_RATIO / 100;
        let (producer, consumer) = RingBuffer::<f32>::new(ring_samples);

        let shared = Arc::new(DeckShared::new(engine_sample_rate));
        let meta = Arc::new(Mutex::new(DeckMeta::default()));
        let waveform = Arc::new(Mutex::new(None));
        let analysis = Arc::new(Mutex::new(None));
        let current_track = Arc::new(AtomicU64::new(0));
        let (commands, command_rx) = unbounded_commands();

        let worker = DeckWorker {
            engine_rate: engine_sample_rate,
            fill_margin,
            shared: Arc::clone(&shared),
            meta: Arc::clone(&meta),
            waveform: Arc::clone(&waveform),
            analysis: Arc::clone(&analysis),
            current_track: Arc::clone(&current_track),
            loaded: None,
        };

        let handle = thread::Builder::new()
            .name("djdex-deck".to_string())
            .spawn(move || worker.run(producer, command_rx))
            .map_err(|err| AudioError::DeckThreadSpawn(err.to_string()))?;

        let reader = DeckReader::new(consumer, Arc::clone(&shared));

        Ok((
            Self {
                shared,
                meta,
                waveform,
                analysis,
                commands,
                worker: Some(handle),
                engine_sample_rate,
            },
            reader,
        ))
    }

    /// Snapshot transport tanpa efek samping pada meter. Dipakai Auto DJ agar
    /// polling 50 Hz tidak mengosongkan peak yang dibaca UI.
    pub fn transport(&self) -> DeckTransport {
        let analysis = self.analysis.lock();
        let detected_bpm = analysis.as_ref().map_or(0.0, |item| item.bpm);
        let first_beat_secs = analysis.as_ref().map_or(0.0, |item| item.first_beat_secs);
        let override_bpm = load_f64(&self.shared.bpm_override);

        DeckTransport {
            loaded: self.shared.loaded.load(Ordering::Relaxed),
            playing: self.shared.playing.load(Ordering::Relaxed),
            eof: self.shared.eof.load(Ordering::Relaxed),
            position_secs: load_f64(&self.shared.position_secs),
            duration_secs: load_f64(&self.shared.duration_secs),
            cue_secs: load_f64(&self.shared.cue_secs),
            first_beat_secs,
            bpm: if override_bpm > 0.0 {
                override_bpm
            } else {
                detected_bpm
            },
            speed: load_f32(&self.shared.speed),
            track_id: self.shared.track_id.load(Ordering::Relaxed),
        }
    }

    pub fn status(&self) -> DeckStatus {
        let meta = self.meta.lock().clone();
        let analysis = self.analysis.lock().clone();
        let buffered_frames = f64::from(self.shared.buffered_frames.load(Ordering::Relaxed));

        let detected_bpm = analysis.as_ref().map_or(0.0, |item| item.bpm);
        let override_bpm = load_f64(&self.shared.bpm_override);
        let bpm = if override_bpm > 0.0 {
            override_bpm
        } else {
            detected_bpm
        };
        let bpm_confidence = analysis.as_ref().map_or(0.0, |item| item.bpm_confidence);
        let first_beat_secs = analysis.as_ref().map_or(0.0, |item| item.first_beat_secs);
        let key_name = analysis.as_ref().and_then(|item| item.key_name.clone());
        let camelot = analysis.as_ref().and_then(|item| item.camelot.clone());
        let key_confidence = analysis.as_ref().map_or(0.0, |item| item.key_confidence);

        DeckStatus {
            loaded: self.shared.loaded.load(Ordering::Relaxed),
            playing: self.shared.playing.load(Ordering::Relaxed),
            eof: self.shared.eof.load(Ordering::Relaxed),
            file_name: meta.file_name,
            codec: meta.codec,
            duration_secs: load_f64(&self.shared.duration_secs),
            position_secs: load_f64(&self.shared.position_secs),
            source_sample_rate: meta.source_sample_rate,
            engine_sample_rate: self.engine_sample_rate,
            channels: meta.channels,
            gain_db: linear_to_db(load_f32(&self.shared.gain)),
            cue_secs: load_f64(&self.shared.cue_secs),
            buffered_ms: buffered_frames / f64::from(self.engine_sample_rate.max(1)) * 1_000.0,
            underruns: self.shared.underruns.load(Ordering::Relaxed),
            peak: f32::from_bits(self.shared.peak.swap(0, Ordering::Relaxed)),
            waveform_ready: self.shared.waveform_ready.load(Ordering::Relaxed),
            track_id: self.shared.track_id.load(Ordering::Relaxed),
            speed: load_f32(&self.shared.speed),
            pitch_range: load_f32(&self.shared.pitch_range),
            keylock: self.shared.keylock.load(Ordering::Relaxed),
            semitones: load_f32(&self.shared.semitones),
            bpm,
            detected_bpm,
            bpm_confidence,
            first_beat_secs,
            key_name,
            camelot,
            key_confidence,
            analysis_ready: analysis.is_some(),
            hot_cues: self
                .shared
                .hot_cues
                .iter()
                .map(|slot| {
                    let bits = slot.load(Ordering::Relaxed);
                    if bits == HOT_CUE_UNSET {
                        None
                    } else {
                        Some(f64::from_bits(bits))
                    }
                })
                .collect(),
            loop_active: self.shared.loop_active.load(Ordering::Relaxed),
            loop_start_secs: load_f64(&self.shared.loop_start_secs),
            loop_end_secs: load_f64(&self.shared.loop_end_secs),
            loop_beats: f64::from(load_f32(&self.shared.loop_beats)),
            bend: load_f32(&self.shared.bend),
            error: meta.last_error,
        }
    }

    /// Muat track; menunggu worker membuka decoder agar error bisa ditampilkan
    /// langsung di UI.
    pub fn load(&self, path: PathBuf) -> Result<DeckStatus, AudioError> {
        let (reply_tx, reply_rx) = bounded(1);
        self.commands
            .send(DeckCommand::Load {
                path,
                reply: reply_tx,
            })
            .map_err(|_| AudioError::DeckUnavailable)?;

        match reply_rx.recv_timeout(Duration::from_secs(8)) {
            Ok(Ok(())) => Ok(self.status()),
            Ok(Err(err)) => Err(err),
            Err(_) => Err(AudioError::DeckTimeout),
        }
    }

    pub fn play(&self) {
        if !self.shared.loaded.load(Ordering::Relaxed) {
            return;
        }

        let duration = load_f64(&self.shared.duration_secs);
        let position = load_f64(&self.shared.position_secs);
        let at_end = self.shared.eof.load(Ordering::Relaxed)
            || (duration > 0.0 && position >= duration - 0.05);

        if at_end {
            let _ = self.commands.send(DeckCommand::Seek(0.0));
        }

        self.shared.playing.store(true, Ordering::Relaxed);
    }

    pub fn pause(&self) {
        self.shared.playing.store(false, Ordering::Relaxed);
    }

    pub fn seek(&self, seconds: f64) {
        let _ = self.commands.send(DeckCommand::Seek(seconds));
    }

    pub fn set_cue(&self) {
        let _ = self.commands.send(DeckCommand::SetCue);
    }

    pub fn cue_jump(&self) {
        let _ = self.commands.send(DeckCommand::CueJump);
    }

    pub fn hot_cue_set(&self, slot: u8) {
        let _ = self.commands.send(DeckCommand::HotCueSet(slot));
    }

    pub fn hot_cue_trigger(&self, slot: u8) {
        let _ = self.commands.send(DeckCommand::HotCueTrigger(slot));
    }

    pub fn hot_cue_clear(&self, slot: u8) {
        let _ = self.commands.send(DeckCommand::HotCueClear(slot));
    }

    pub fn set_loop(&self, start: f64, end: f64, beats: f64) {
        let _ = self
            .commands
            .send(DeckCommand::SetLoop { start, end, beats });
    }

    pub fn exit_loop(&self) {
        let _ = self.commands.send(DeckCommand::ExitLoop);
    }

    /// Lompat relatif sebesar `seconds` (UI menghitung dari BPM).
    pub fn beat_jump(&self, seconds: f64) {
        let _ = self.commands.send(DeckCommand::BeatJump(seconds));
    }

    /// Bend sementara untuk jog wheel CDJ (0.5..2.0). 1.0 = netral.
    pub fn set_bend(&self, bend: f32) {
        store_f32(&self.shared.bend, bend.clamp(0.5, 2.0));
    }

    pub fn unload(&self) {
        let _ = self.commands.send(DeckCommand::Unload);
    }

    pub fn set_gain_db(&self, gain_db: f32) {
        store_f32(
            &self.shared.gain,
            crate::audio::gain::db_to_linear(gain_db.clamp(-60.0, 12.0)),
        );
    }

    /// Ubah tempo (1.0 = normal). Nilai dijepit ke rentang pitch fader aktif.
    pub fn set_speed(&self, speed: f32) {
        let range = load_f32(&self.shared.pitch_range) / 100.0;
        store_f32(&self.shared.speed, speed.clamp(1.0 - range, 1.0 + range));
    }

    /// Pilih rentang pitch fader: 8%, 16%, atau 50%.
    pub fn set_pitch_range(&self, range: f32) {
        let range = PITCH_RANGES
            .iter()
            .copied()
            .find(|candidate| (*candidate - range).abs() < 0.5)
            .unwrap_or(DEFAULT_PITCH_RANGE);
        store_f32(&self.shared.pitch_range, range);

        // Jaga speed agar tetap di dalam rentang baru.
        let current = load_f32(&self.shared.speed);
        self.set_speed(current);
    }

    pub fn set_keylock(&self, enabled: bool) {
        self.shared.keylock.store(enabled, Ordering::Relaxed);
    }

    /// Transpose dalam semitone (-12..+12), hanya berpengaruh saat key lock ON.
    pub fn set_semitones(&self, semitones: f32) {
        store_f32(&self.shared.semitones, semitones.clamp(-12.0, 12.0));
    }

    /// Override BPM hasil analisis (tap tempo / ×2 / ÷2). Nilai 0 = auto.
    pub fn set_bpm(&self, bpm: f64) {
        let value = if bpm.is_finite() {
            bpm.clamp(40.0, 300.0)
        } else {
            0.0
        };
        store_f64(&self.shared.bpm_override, value);
    }

    pub fn waveform(&self, max_points: usize) -> Option<WaveformDto> {
        let waveform = self.waveform.lock();
        let track_id = self.shared.track_id.load(Ordering::Relaxed);
        waveform
            .as_ref()
            .map(|waveform| waveform.to_dto(track_id, max_points))
    }
}

impl Drop for Deck {
    fn drop(&mut self) {
        let _ = self.commands.send(DeckCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn unbounded_commands() -> (Sender<DeckCommand>, Receiver<DeckCommand>) {
    crossbeam_channel::unbounded()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_test_wav(path: &std::path::Path, seconds: f32, rate: u32) {
        let frames = (seconds * rate as f32) as u32;
        let channels = 2_u16;
        let data_len = frames * u32::from(channels) * 2;
        let mut file = std::fs::File::create(path).expect("wav");
        let mut header = Vec::new();
        header.extend_from_slice(b"RIFF");
        header.extend_from_slice(&(36 + data_len).to_le_bytes());
        header.extend_from_slice(b"WAVEfmt ");
        header.extend_from_slice(&16_u32.to_le_bytes());
        header.extend_from_slice(&1_u16.to_le_bytes());
        header.extend_from_slice(&channels.to_le_bytes());
        header.extend_from_slice(&rate.to_le_bytes());
        header.extend_from_slice(&(rate * u32::from(channels) * 2).to_le_bytes());
        header.extend_from_slice(&(channels * 2).to_le_bytes());
        header.extend_from_slice(&16_u16.to_le_bytes());
        header.extend_from_slice(b"data");
        header.extend_from_slice(&data_len.to_le_bytes());
        file.write_all(&header).expect("header");

        for index in 0..frames {
            let value =
                (2.0 * std::f32::consts::PI * 330.0 * index as f32 / rate as f32).sin() * 0.4;
            let sample = (value * f32::from(i16::MAX)) as i16;
            for _ in 0..channels {
                file.write_all(&sample.to_le_bytes()).expect("sample");
            }
        }
        file.flush().expect("flush");
    }

    #[test]
    fn transport_plays_pauses_seeks_and_unloads() {
        let path = std::env::temp_dir().join(format!("djdex-deck-{}.wav", std::process::id()));
        write_test_wav(&path, 2.0, 44_100);

        let (deck, mut reader) = Deck::new(48_000).expect("deck");
        deck.load(path.clone()).expect("load");
        deck.play();

        // Tunggu prebuffer worker terisi, lalu simulasikan blok callback.
        let mut heard = 0_usize;
        for _ in 0..200 {
            let block = reader.prepare(256);
            heard = block.len();
            if heard >= 512 {
                break;
            }
            thread::sleep(Duration::from_millis(5));
        }
        assert!(heard >= 512, "prebuffer kosong: {heard} sample");
        let playing_position = load_f64(&reader.shared.position_secs);
        assert!(playing_position > 0.0, "posisi tidak maju");

        deck.pause();
        let _ = reader.prepare(256);
        let paused_position = load_f64(&reader.shared.position_secs);
        thread::sleep(Duration::from_millis(20));
        let _ = reader.prepare(256);
        assert!(
            (load_f64(&reader.shared.position_secs) - paused_position).abs() < 0.001,
            "posisi berubah saat pause"
        );

        // Seek diproses worker secara asinkron; polling seperti UI.
        deck.seek(1.0);
        let mut seek_position = 0.0;
        for _ in 0..100 {
            let _ = reader.prepare(256);
            seek_position = load_f64(&reader.shared.position_secs);
            if seek_position >= 0.95 {
                break;
            }
            thread::sleep(Duration::from_millis(5));
        }
        assert!(
            (0.95..=1.2).contains(&seek_position),
            "posisi setelah seek: {seek_position}"
        );

        deck.unload();
        for _ in 0..100 {
            if !deck.status().loaded {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(!deck.status().loaded);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn deck_starts_unloaded_and_reports_missing_file() {
        let (deck, _reader) = Deck::new(48_000).expect("deck");
        let status = deck.status();
        assert!(!status.loaded);
        assert!(!status.playing);
        assert_eq!(status.engine_sample_rate, 48_000);

        let error = deck
            .load(PathBuf::from("/tmp/djdex-file-yang-tidak-ada.mp3"))
            .expect_err("harus gagal");
        assert!(matches!(error, AudioError::TrackOpen(_)));
    }

    #[test]
    fn gain_is_clamped_and_stored_as_linear() {
        let (deck, _reader) = Deck::new(44_100).expect("deck");
        deck.set_gain_db(100.0);
        assert!((deck.status().gain_db - 12.0).abs() < 0.01);
        deck.set_gain_db(-120.0);
        assert!((deck.status().gain_db + 60.0).abs() < 0.01);
    }

    #[test]
    fn speed_is_clamped_to_pitch_range() {
        let (deck, _reader) = Deck::new(44_100).expect("deck");
        deck.set_pitch_range(8.0);
        deck.set_speed(1.5);
        assert!((deck.status().speed - 1.08).abs() < 1e-4);
        deck.set_speed(0.5);
        assert!((deck.status().speed - 0.92).abs() < 1e-4);

        deck.set_pitch_range(50.0);
        deck.set_speed(1.5);
        assert!((deck.status().speed - 1.5).abs() < 1e-4);
    }

    #[test]
    fn keylock_and_keyshift_are_reflected_in_status() {
        let (deck, _reader) = Deck::new(44_100).expect("deck");
        deck.set_keylock(true);
        deck.set_semitones(2.0);
        let status = deck.status();
        assert!(status.keylock);
        assert!((status.semitones - 2.0).abs() < 1e-4);
        assert_eq!(status.pitch_range, 8.0);
    }

    #[test]
    fn bpm_override_wins_over_detected_bpm() {
        let (deck, _reader) = Deck::new(44_100).expect("deck");
        deck.set_bpm(174.0);
        assert!((deck.status().bpm - 174.0).abs() < 1e-6);
        assert!((deck.status().detected_bpm - 0.0).abs() < 1e-6);
    }
}

//! Player preview cue di browser perpustakaan musik (Headphone Cue Preview).
//!
//! Mengizinkan DJ mendengarkan cuplikan track apa pun langsung melalui headphone (Cue Bus)
//! sebelum memuatnya ke Deck A atau Deck B, tanpa terdengar di Master output.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;

use crossbeam_channel::{bounded, Receiver, Sender};
use serde::{Deserialize, Serialize};

use crate::audio::decoder::TrackDecoder;
use crate::audio::resampler::StereoResampler;
use crate::error::AudioError;

pub enum PreviewCommand {
    Play {
        audio: Arc<Vec<f32>>,
        start_frame: usize,
        path: String,
        duration_secs: f64,
    },
    Stop,
    Seek(f64),
}

/// Status preview player untuk UI.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewStatus {
    pub is_playing: bool,
    pub current_path: Option<String>,
    pub position_secs: f64,
    pub duration_secs: f64,
}

pub struct PreviewPlayerRt {
    command_rx: Receiver<PreviewCommand>,
    audio: Arc<Vec<f32>>,
    cursor: f64,
    is_playing: bool,
    duration_secs: f64,
    sample_rate: f32,
    pos_atomic: Arc<AtomicU32>,
    playing_atomic: Arc<AtomicBool>,
}

impl PreviewPlayerRt {
    pub fn new(
        sample_rate: f32,
        command_rx: Receiver<PreviewCommand>,
        pos_atomic: Arc<AtomicU32>,
        playing_atomic: Arc<AtomicBool>,
    ) -> Self {
        Self {
            command_rx,
            audio: Arc::new(Vec::new()),
            cursor: 0.0,
            is_playing: false,
            duration_secs: 0.0,
            sample_rate,
            pos_atomic,
            playing_atomic,
        }
    }

    #[inline]
    pub fn prepare_block(&mut self) {
        self.handle_commands();
    }

    fn handle_commands(&mut self) {
        while let Ok(cmd) = self.command_rx.try_recv() {
            match cmd {
                PreviewCommand::Play {
                    audio,
                    start_frame,
                    duration_secs,
                    ..
                } => {
                    self.audio = audio;
                    self.cursor = start_frame as f64;
                    self.duration_secs = duration_secs;
                    self.is_playing = true;
                }
                PreviewCommand::Stop => {
                    self.is_playing = false;
                    self.cursor = 0.0;
                }
                PreviewCommand::Seek(secs) => {
                    self.cursor = (secs * self.sample_rate as f64).max(0.0);
                }
            }
        }
    }

    /// Ambil satu sampel stereo preview untuk frame saat ini di audio callback.
    /// Tanpa alokasi dan tanpa lock.
    #[inline]
    pub fn next_sample(&mut self) -> (f32, f32) {
        if !self.is_playing {
            return (0.0, 0.0);
        }

        let total_frames = self.audio.len() / 2;
        let idx = self.cursor as usize;
        if idx >= total_frames {
            self.is_playing = false;
            self.cursor = 0.0;
            return (0.0, 0.0);
        }

        let l = self.audio[idx * 2];
        let r = self.audio[idx * 2 + 1];
        self.cursor += 1.0;

        (l, r)
    }

    #[inline]
    pub fn finish_block(&self) {
        self.update_ui_atomics();
    }

    pub fn update_ui_atomics(&self) {
        self.playing_atomic
            .store(self.is_playing, Ordering::Relaxed);
        let pos_sec = (self.cursor / self.sample_rate as f64) as f32;
        self.pos_atomic.store(pos_sec.to_bits(), Ordering::Relaxed);
    }
}

pub struct PreviewController {
    command_tx: Sender<PreviewCommand>,
    pos_atomic: Arc<AtomicU32>,
    playing_atomic: Arc<AtomicBool>,
    current_path: Arc<parking_lot::RwLock<Option<String>>>,
    duration: Arc<parking_lot::RwLock<f64>>,
    sample_rate: u32,
}

impl PreviewController {
    pub fn new(sample_rate: u32) -> (Self, PreviewPlayerRt) {
        let (command_tx, command_rx) = bounded(64);
        let pos_atomic = Arc::new(AtomicU32::new(0.0_f32.to_bits()));
        let playing_atomic = Arc::new(AtomicBool::new(false));
        let current_path = Arc::new(parking_lot::RwLock::new(None));
        let duration = Arc::new(parking_lot::RwLock::new(0.0));

        let rt = PreviewPlayerRt::new(
            sample_rate as f32,
            command_rx,
            Arc::clone(&pos_atomic),
            Arc::clone(&playing_atomic),
        );

        let controller = Self {
            command_tx,
            pos_atomic,
            playing_atomic,
            current_path,
            duration,
            sample_rate,
        };

        (controller, rt)
    }

    /// Mulai memutar preview track dari detik tertentu di background thread.
    pub fn play(&self, path_str: String, start_secs: f64) -> Result<(), AudioError> {
        let target_rate = self.sample_rate;
        let command_tx = self.command_tx.clone();
        let path_clone = path_str.clone();
        let current_path_store = Arc::clone(&self.current_path);
        let duration_store = Arc::clone(&self.duration);

        *current_path_store.write() = Some(path_str.clone());

        thread::Builder::new()
            .name("djdex-preview-decoder".to_string())
            .spawn(move || {
                let path = PathBuf::from(&path_clone);
                let Ok(mut decoder) = TrackDecoder::open(&path) else {
                    return;
                };

                let info = decoder.info().clone();
                *duration_store.write() = info.duration_secs;

                let _ = decoder.seek(start_secs);
                let source_rate = info.source_sample_rate;

                let mut samples = Vec::new();
                // Decode hingga ~60 detik untuk cuplikan instan
                let max_frames = (source_rate as usize * 60).min(5_000_000);
                while samples.len() / 2 < max_frames {
                    let prev = samples.len();
                    if let Ok(more) = decoder.decode_next(&mut samples) {
                        if !more || samples.len() == prev {
                            break;
                        }
                    } else {
                        break;
                    }
                }

                let final_samples = if source_rate != target_rate && source_rate > 0 {
                    let mut resampler = StereoResampler::new(source_rate, target_rate);
                    let mut resampled = Vec::new();
                    resampler.process(&samples, &mut resampled);
                    resampled
                } else {
                    samples
                };

                let _ = command_tx.send(PreviewCommand::Play {
                    audio: Arc::new(final_samples),
                    start_frame: 0,
                    path: path_clone,
                    duration_secs: info.duration_secs,
                });
            })
            .map_err(|e| AudioError::Io(e.to_string()))?;

        Ok(())
    }

    pub fn stop(&self) {
        *self.current_path.write() = None;
        let _ = self.command_tx.send(PreviewCommand::Stop);
    }

    pub fn seek(&self, seconds: f64) {
        let _ = self.command_tx.send(PreviewCommand::Seek(seconds));
    }

    pub fn status(&self) -> PreviewStatus {
        let is_playing = self.playing_atomic.load(Ordering::Relaxed);
        let pos = f32::from_bits(self.pos_atomic.load(Ordering::Relaxed)) as f64;
        let path = self.current_path.read().clone();
        let duration = *self.duration.read();

        PreviewStatus {
            is_playing,
            current_path: path,
            position_secs: pos,
            duration_secs: duration,
        }
    }
}

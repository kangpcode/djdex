//! Definisi Sample Pad, mode trigger, dan DTO untuk UI.

use std::sync::Arc;
use serde::{Deserialize, Serialize};

/// Mode trigger pad sampler.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PadMode {
    /// Mainkan sekali sampai akhir saat dipicu.
    OneShot,
    /// Mainkan terus berulang sampai dimatikan / dipicu lagi.
    Loop,
    /// Mainkan hanya saat tombol ditekan / ditahan; berhenti saat dilepas.
    Hold,
    /// Pemicu ulang langsung dari awal setiap kali ditekan (stutter roll).
    Stutter,
    /// Pad drum responsif sentuhan instan (one-shot tanpa toggle).
    DrumPad,
    /// Lompat / mainkan dari cue point.
    CuePad,
}

impl Default for PadMode {
    fn default() -> Self {
        Self::OneShot
    }
}

/// Satu slot sample pad di engine sampler.
#[derive(Clone)]
pub struct SamplePad {
    pub id: usize,
    pub name: String,
    pub color: String,
    pub mode: PadMode,
    pub volume: f32,
    pub pitch_semitones: f32,
    pub mute_group: Option<u8>,
    pub sync_bpm: bool,
    pub base_bpm: f32,
    pub quantize: bool,
    /// Buffer audio stereo interleaved (L, R, L, R...).
    pub audio: Arc<Vec<f32>>,
    pub sample_rate: u32,
    pub duration_secs: f32,
}

impl SamplePad {
    pub fn new(id: usize, name: impl Into<String>, color: impl Into<String>) -> Self {
        Self {
            id,
            name: name.into(),
            color: color.into(),
            mode: PadMode::OneShot,
            volume: 1.0,
            pitch_semitones: 0.0,
            mute_group: None,
            sync_bpm: false,
            base_bpm: 128.0,
            quantize: false,
            audio: Arc::new(Vec::new()),
            sample_rate: 44_100,
            duration_secs: 0.0,
        }
    }

    pub fn with_audio(
        mut self,
        name: impl Into<String>,
        color: impl Into<String>,
        audio: Vec<f32>,
        sample_rate: u32,
    ) -> Self {
        let frames = audio.len() / 2;
        let duration = if sample_rate > 0 {
            frames as f32 / sample_rate as f32
        } else {
            0.0
        };
        self.name = name.into();
        self.color = color.into();
        self.audio = Arc::new(audio);
        self.sample_rate = sample_rate;
        self.duration_secs = duration;
        self
    }

    pub fn set_audio(&mut self, audio: Vec<f32>, sample_rate: u32) {
        let frames = audio.len() / 2;
        self.duration_secs = if sample_rate > 0 {
            frames as f32 / sample_rate as f32
        } else {
            0.0
        };
        self.audio = Arc::new(audio);
        self.sample_rate = sample_rate;
    }

    pub fn is_loaded(&self) -> bool {
        !self.audio.is_empty()
    }
}

/// DTO status satu pad untuk UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadDto {
    pub id: usize,
    pub name: String,
    pub color: String,
    pub mode: PadMode,
    pub volume: f32,
    pub pitch_semitones: f32,
    pub mute_group: Option<u8>,
    pub sync_bpm: bool,
    pub base_bpm: f32,
    pub quantize: bool,
    pub loaded: bool,
    pub duration_secs: f32,
    pub is_playing: bool,
    pub progress: f32,
}

/// Parameter update parsial pad dari UI.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadUpdate {
    pub name: Option<String>,
    pub color: Option<String>,
    pub mode: Option<PadMode>,
    pub volume: Option<f32>,
    pub pitch_semitones: Option<f32>,
    pub mute_group: Option<Option<u8>>,
    pub sync_bpm: Option<bool>,
    pub base_bpm: Option<f32>,
    pub quantize: Option<bool>,
}

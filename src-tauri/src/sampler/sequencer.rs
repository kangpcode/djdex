//! Step Sequencer 16-step (drum machine mini) dengan swing dan pattern bank.

use serde::{Deserialize, Serialize};

pub const TRACK_COUNT: usize = 4;
pub const STEP_COUNT: usize = 16;
pub const PATTERN_COUNT: usize = 4;

/// Satu pattern sequencer dengan 4 track x 16 step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    /// Matriks `[track][step]`: true bila step aktif.
    pub steps: [[bool; STEP_COUNT]; TRACK_COUNT],
    /// Velocity per step (0..127).
    pub velocities: [[u8; STEP_COUNT]; TRACK_COUNT],
}

impl Default for Pattern {
    fn default() -> Self {
        let mut steps = [[false; STEP_COUNT]; TRACK_COUNT];
        let mut velocities = [[100; STEP_COUNT]; TRACK_COUNT];

        // Pattern default drum beat standar 4-on-the-floor:
        // Track 0 (Kick): beat 1, 5, 9, 13 (indeks 0, 4, 8, 12)
        steps[0][0] = true;
        steps[0][4] = true;
        steps[0][8] = true;
        steps[0][12] = true;

        // Track 1 (Snare/Clap): beat 5, 13 (indeks 4, 12)
        steps[1][4] = true;
        steps[1][12] = true;

        // Track 2 (Closed Hat): setiap 2 step (off-beat)
        for i in (2..STEP_COUNT).step_by(2) {
            steps[2][i] = true;
        }

        // Track 3 (Perc/Open Hat): step 2, 10
        steps[3][2] = true;
        steps[3][10] = true;

        for track in &mut velocities {
            for vel in track.iter_mut() {
                *vel = 100;
            }
        }

        Self { steps, velocities }
    }
}

/// State Step Sequencer.
#[derive(Clone)]
pub struct StepSequencer {
    pub running: bool,
    pub bpm: f32,
    pub sync_to_master: bool,
    pub swing: f32, // 0.0 .. 0.75
    pub current_step: usize,
    pub current_pattern: usize,
    pub patterns: [Pattern; PATTERN_COUNT],
    /// Pemetaan track ke indeks pad sampler (default: Track 0 -> Pad 0, dll.)
    pub pad_mappings: [usize; TRACK_COUNT],
    /// Akumulator frame untuk perhitungan timing step.
    frame_clock: f64,
    /// Durasi frame yang telah dilalui di step saat ini.
    step_frame_cursor: f64,
}

impl StepSequencer {
    pub fn new(bpm: f32) -> Self {
        Self {
            running: false,
            bpm: bpm.max(20.0),
            sync_to_master: true,
            swing: 0.0,
            current_step: 0,
            current_pattern: 0,
            patterns: [
                Pattern::default(),
                Pattern::default(),
                Pattern::default(),
                Pattern::default(),
            ],
            pad_mappings: [0, 1, 2, 3],
            frame_clock: 0.0,
            step_frame_cursor: 0.0,
        }
    }

    /// Reset playhead ke step 0.
    pub fn reset(&mut self) {
        self.current_step = 0;
        self.frame_clock = 0.0;
        self.step_frame_cursor = 0.0;
    }

    pub fn set_running(&mut self, run: bool) {
        self.running = run;
        if !run {
            self.reset();
        }
    }

    pub fn toggle_running(&mut self) -> bool {
        self.set_running(!self.running);
        self.running
    }

    /// Hitung durasi dasar 1 step (16th note) dalam satuan frame sampel.
    pub fn base_step_frames(&self, sample_rate: f32, effective_bpm: f32) -> f64 {
        let bpm = effective_bpm.max(20.0);
        // 1 beat (quarter note) = 60 / bpm detik.
        // 1 step (16th note) = (60 / bpm / 4) detik.
        ((60.0 / bpm as f64) / 4.0) * sample_rate as f64
    }

    /// Hitung durasi step saat ini dengan memperhitungkan swing.
    /// Step ganjil (indeks 1, 3, 5, ...) dimajukan/ditunda untuk shuffle groove.
    pub fn current_step_target_frames(&self, sample_rate: f32, effective_bpm: f32) -> f64 {
        let base = self.base_step_frames(sample_rate, effective_bpm);
        let swing_amount = self.swing.clamp(0.0, 0.75) as f64;
        if self.current_step.is_multiple_of(2) {
            // Step genap diperpanjang sedikit
            base * (1.0 + swing_amount * 0.5)
        } else {
            // Step ganjil diperpendek sebanding agar total 2 step tetap sama
            base * (1.0 - swing_amount * 0.5)
        }
    }

    /// Proses per frame sampel di audio callback thread.
    /// Kembalikan daftar pad yang harus dipicu pada frame ini: `Vec<(pad_index, velocity)>`.
    /// Menggunakan array tetap tanpa alokasi di heap untuk keamanan RT audio!
    #[inline]
    pub fn tick_frame(
        &mut self,
        sample_rate: f32,
        master_bpm: f32,
        out_triggers: &mut [(usize, u8); TRACK_COUNT],
        out_count: &mut usize,
    ) {
        *out_count = 0;
        if !self.running {
            return;
        }

        let effective_bpm = if self.sync_to_master && master_bpm >= 20.0 {
            master_bpm
        } else {
            self.bpm
        };

        let target_frames = self.current_step_target_frames(sample_rate, effective_bpm);
        self.step_frame_cursor += 1.0;
        self.frame_clock += 1.0;

        if self.step_frame_cursor >= target_frames {
            // Pindah ke step berikutnya
            self.step_frame_cursor -= target_frames;
            self.current_step = (self.current_step + 1) % STEP_COUNT;

            // Kumpulkan pemicu untuk step baru ini
            let pattern = &self.patterns[self.current_pattern];
            for track in 0..TRACK_COUNT {
                if pattern.steps[track][self.current_step] {
                    let pad = self.pad_mappings[track];
                    let vel = pattern.velocities[track][self.current_step];
                    out_triggers[*out_count] = (pad, vel);
                    *out_count += 1;
                }
            }
        }
    }

    pub fn set_step(&mut self, track: usize, step: usize, active: bool) {
        if track < TRACK_COUNT && step < STEP_COUNT {
            self.patterns[self.current_pattern].steps[track][step] = active;
        }
    }

    pub fn set_velocity(&mut self, track: usize, step: usize, velocity: u8) {
        if track < TRACK_COUNT && step < STEP_COUNT {
            self.patterns[self.current_pattern].velocities[track][step] = velocity.min(127);
        }
    }

    pub fn clear_pattern(&mut self) {
        for track in 0..TRACK_COUNT {
            for step in 0..STEP_COUNT {
                self.patterns[self.current_pattern].steps[track][step] = false;
            }
        }
    }

    pub fn status(&self) -> SequencerStatus {
        SequencerStatus {
            running: self.running,
            bpm: self.bpm,
            sync_to_master: self.sync_to_master,
            swing: self.swing,
            current_step: self.current_step,
            current_pattern: self.current_pattern,
            pattern: self.patterns[self.current_pattern].clone(),
            pad_mappings: self.pad_mappings,
        }
    }
}

/// DTO status sequencer untuk UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequencerStatus {
    pub running: bool,
    pub bpm: f32,
    pub sync_to_master: bool,
    pub swing: f32,
    pub current_step: usize,
    pub current_pattern: usize,
    pub pattern: Pattern,
    pub pad_mappings: [usize; TRACK_COUNT],
}

/// Parameter update sequencer dari UI.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequencerUpdate {
    pub running: Option<bool>,
    pub bpm: Option<f32>,
    pub sync_to_master: Option<bool>,
    pub swing: Option<f32>,
    pub current_pattern: Option<usize>,
    pub track_step: Option<(usize, usize, bool)>,
    pub pad_mappings: Option<[usize; TRACK_COUNT]>,
}

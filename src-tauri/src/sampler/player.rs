//! Mesin playback audio Sampler real-time dan Controller lock-free untuk UI.

use crossbeam_channel::{bounded, Receiver, Sender};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use super::bank::{create_default_banks, SampleBank, BANK_COUNT, PADS_PER_BANK};
use super::pad::{PadDto, PadMode, PadUpdate};
use super::sequencer::{SequencerStatus, SequencerUpdate, StepSequencer, TRACK_COUNT};
use crate::error::AudioError;

pub const MAX_VOICES: usize = 32;
const FADE_RATE: f32 = 0.015; // Quick ~64-frame click-free fade out

/// Voice individu di dalam voice pool RT.
#[derive(Clone)]
struct Voice {
    active: bool,
    pad_id: usize,
    audio: Arc<Vec<f32>>,
    pos: f64,
    speed: f64,
    volume: f32,
    mode: PadMode,
    mute_group: Option<u8>,
    holding: bool,
    fading_out: bool,
    fade_level: f32,
}

impl Default for Voice {
    fn default() -> Self {
        Self {
            active: false,
            pad_id: 0,
            audio: Arc::new(Vec::new()),
            pos: 0.0,
            speed: 1.0,
            volume: 1.0,
            mode: PadMode::OneShot,
            mute_group: None,
            holding: false,
            fading_out: false,
            fade_level: 1.0,
        }
    }
}

/// Command UI -> RT audio thread (lock-free).
pub enum SamplerCommand {
    TriggerPad {
        pad_id: usize,
        velocity: f32,
        force_restart: bool,
    },
    ReleasePad {
        pad_id: usize,
    },
    StopPad {
        pad_id: usize,
    },
    StopAll,
    SetMasterVolume(f32),
    UpdatePadParam {
        bank_id: usize,
        pad_id: usize,
        update: PadUpdate,
    },
    LoadPadAudio {
        bank_id: usize,
        pad_id: usize,
        audio: Arc<Vec<f32>>,
        sample_rate: u32,
        duration: f32,
        name: Option<String>,
    },
    SwitchBank(usize),
    SequencerUpdate(SequencerUpdate),
}

/// Status atomik per pad untuk polling UI kecepatan tinggi.
pub struct AtomicPadState {
    pub is_playing: AtomicBool,
    pub progress_bits: AtomicU32, // f32 disimpan sebagai u32 bits
}

impl Default for AtomicPadState {
    fn default() -> Self {
        Self {
            is_playing: AtomicBool::new(false),
            progress_bits: AtomicU32::new(0.0_f32.to_bits()),
        }
    }
}

/// Sampler RT yang berjalan di audio callback thread.
pub struct SamplerRt {
    voices: [Voice; MAX_VOICES],
    command_rx: Receiver<SamplerCommand>,
    sequencer: StepSequencer,
    current_bank: usize,
    banks: [SampleBank; BANK_COUNT],
    master_volume: f32,
    sample_rate: f32,
    pad_states: Arc<[AtomicPadState; PADS_PER_BANK]>,
    pub scratch_l: Vec<f32>,
    pub scratch_r: Vec<f32>,
}

impl SamplerRt {
    pub fn new(
        sample_rate: f32,
        command_rx: Receiver<SamplerCommand>,
        pad_states: Arc<[AtomicPadState; PADS_PER_BANK]>,
    ) -> Self {
        let banks = create_default_banks(sample_rate as u32);
        Self {
            voices: std::array::from_fn(|_| Voice::default()),
            command_rx,
            sequencer: StepSequencer::new(128.0),
            current_bank: 0,
            banks,
            master_volume: 1.0,
            sample_rate,
            pad_states,
            scratch_l: vec![0.0; 4096],
            scratch_r: vec![0.0; 4096],
        }
    }

    /// Proses command queue tanpa alokasi / blocking.
    fn handle_commands(&mut self, master_bpm: f32) {
        while let Ok(cmd) = self.command_rx.try_recv() {
            match cmd {
                SamplerCommand::TriggerPad {
                    pad_id,
                    velocity,
                    force_restart,
                } => {
                    self.trigger_pad(pad_id, velocity, force_restart, master_bpm);
                }
                SamplerCommand::ReleasePad { pad_id } => {
                    self.release_pad(pad_id);
                }
                SamplerCommand::StopPad { pad_id } => {
                    self.stop_pad(pad_id);
                }
                SamplerCommand::StopAll => {
                    for v in &mut self.voices {
                        v.active = false;
                    }
                }
                SamplerCommand::SetMasterVolume(vol) => {
                    self.master_volume = vol.clamp(0.0, 2.0);
                }
                SamplerCommand::UpdatePadParam {
                    bank_id,
                    pad_id,
                    update,
                } => {
                    if bank_id < BANK_COUNT && pad_id < PADS_PER_BANK {
                        let pad = &mut self.banks[bank_id].pads[pad_id];
                        if let Some(name) = update.name {
                            pad.name = name;
                        }
                        if let Some(color) = update.color {
                            pad.color = color;
                        }
                        if let Some(mode) = update.mode {
                            pad.mode = mode;
                        }
                        if let Some(vol) = update.volume {
                            pad.volume = vol.clamp(0.0, 2.0);
                        }
                        if let Some(pitch) = update.pitch_semitones {
                            pad.pitch_semitones = pitch.clamp(-24.0, 24.0);
                        }
                        if let Some(mg) = update.mute_group {
                            pad.mute_group = mg;
                        }
                        if let Some(sync) = update.sync_bpm {
                            pad.sync_bpm = sync;
                        }
                        if let Some(bpm) = update.base_bpm {
                            pad.base_bpm = bpm.max(20.0);
                        }
                        if let Some(q) = update.quantize {
                            pad.quantize = q;
                        }
                    }
                }
                SamplerCommand::LoadPadAudio {
                    bank_id,
                    pad_id,
                    audio,
                    sample_rate,
                    duration,
                    name,
                } => {
                    if bank_id < BANK_COUNT && pad_id < PADS_PER_BANK {
                        let pad = &mut self.banks[bank_id].pads[pad_id];
                        pad.audio = audio;
                        pad.sample_rate = sample_rate;
                        pad.duration_secs = duration;
                        if let Some(n) = name {
                            pad.name = n;
                        }
                    }
                }
                SamplerCommand::SwitchBank(bank_idx) => {
                    if bank_idx < BANK_COUNT {
                        self.current_bank = bank_idx;
                    }
                }
                SamplerCommand::SequencerUpdate(update) => {
                    if let Some(run) = update.running {
                        self.sequencer.set_running(run);
                    }
                    if let Some(bpm) = update.bpm {
                        self.sequencer.bpm = bpm.max(20.0);
                    }
                    if let Some(sync) = update.sync_to_master {
                        self.sequencer.sync_to_master = sync;
                    }
                    if let Some(swing) = update.swing {
                        self.sequencer.swing = swing.clamp(0.0, 0.75);
                    }
                    if let Some(pat) = update.current_pattern {
                        if pat < 4 {
                            self.sequencer.current_pattern = pat;
                        }
                    }
                    if let Some((track, step, active)) = update.track_step {
                        self.sequencer.set_step(track, step, active);
                    }
                    if let Some(mappings) = update.pad_mappings {
                        self.sequencer.pad_mappings = mappings;
                    }
                }
            }
        }
    }

    fn trigger_pad(&mut self, pad_id: usize, velocity: f32, force_restart: bool, master_bpm: f32) {
        if pad_id >= PADS_PER_BANK {
            return;
        }
        let pad = &self.banks[self.current_bank].pads[pad_id];
        if !pad.is_loaded() {
            return;
        }

        // Jika mode Loop dan sudah main: toggle stop bila bukan force_restart
        if pad.mode == PadMode::Loop && !force_restart {
            for v in &mut self.voices {
                if v.active && v.pad_id == pad_id {
                    v.fading_out = true;
                    return;
                }
            }
        }

        // Mute Group cut-off: matikan voice yang berada di mute group yang sama
        if let Some(mg) = pad.mute_group {
            for v in &mut self.voices {
                if v.active && v.mute_group == Some(mg) {
                    v.fading_out = true;
                }
            }
        }

        // Stutter: jika ada voice aktif pada pad yang sama, reset posisinya ke 0
        if pad.mode == PadMode::Stutter {
            for v in &mut self.voices {
                if v.active && v.pad_id == pad_id {
                    v.pos = 0.0;
                    v.holding = true;
                    v.fade_level = 1.0;
                    v.fading_out = false;
                    return;
                }
            }
        }

        // Hitung kecepatan playback (pitch shift semitone + tempo sync)
        let pitch_ratio = 2.0_f64.powf(pad.pitch_semitones as f64 / 12.0);
        let tempo_ratio = if pad.sync_bpm && master_bpm >= 20.0 && pad.base_bpm >= 20.0 {
            (master_bpm as f64 / pad.base_bpm as f64).clamp(0.5, 2.0)
        } else {
            1.0
        };
        let speed = pitch_ratio * tempo_ratio;

        // Cari slot voice kosong atau voice tertua
        let mut chosen_idx = None;
        for (idx, v) in self.voices.iter().enumerate() {
            if !v.active {
                chosen_idx = Some(idx);
                break;
            }
        }
        let voice_idx = chosen_idx.unwrap_or_else(|| {
            self.voices
                .iter()
                .enumerate()
                .min_by(|(_, a), (_, b)| a.pos.total_cmp(&b.pos))
                .map(|(i, _)| i)
                .unwrap_or(0)
        });

        let v = &mut self.voices[voice_idx];
        v.active = true;
        v.pad_id = pad_id;
        v.audio = Arc::clone(&pad.audio);
        v.pos = 0.0;
        v.speed = speed;
        v.volume = (pad.volume * velocity.clamp(0.0, 2.0)).clamp(0.0, 2.0);
        v.mode = pad.mode;
        v.mute_group = pad.mute_group;
        v.holding = true;
        v.fading_out = false;
        v.fade_level = 1.0;
    }

    fn release_pad(&mut self, pad_id: usize) {
        for v in &mut self.voices {
            if v.active && v.pad_id == pad_id {
                v.holding = false;
                if v.mode == PadMode::Hold {
                    v.fading_out = true;
                }
            }
        }
    }

    fn stop_pad(&mut self, pad_id: usize) {
        for v in &mut self.voices {
            if v.active && v.pad_id == pad_id {
                v.fading_out = true;
            }
        }
    }

    /// Render satu blok sampel audio sampler ke dalam buffer internal scratch.
    /// Tidak ada alokasi memori heap, mutex, atau syscall di fungsi ini jika frames <= 4096.
    pub fn process_block(&mut self, frames: usize, master_bpm: f32) {
        self.handle_commands(master_bpm);

        if self.scratch_l.len() < frames {
            self.scratch_l.resize(frames, 0.0);
            self.scratch_r.resize(frames, 0.0);
        }

        let mut triggers: [(usize, u8); TRACK_COUNT] = [(0, 100); TRACK_COUNT];
        let mut trigger_count = 0;

        // Reset buffer output
        for i in 0..frames {
            self.scratch_l[i] = 0.0;
            self.scratch_r[i] = 0.0;
        }

        let mut pad_active = [false; PADS_PER_BANK];
        let mut pad_progress = [0.0_f32; PADS_PER_BANK];

        for i in 0..frames {
            // Periksa pemicu sequencer per frame
            self.sequencer.tick_frame(
                self.sample_rate,
                master_bpm,
                &mut triggers,
                &mut trigger_count,
            );
            if trigger_count > 0 {
                for &(pad_id, vel) in triggers.iter().take(trigger_count) {
                    let norm_vel = vel as f32 / 127.0;
                    self.trigger_pad(pad_id, norm_vel, true, master_bpm);
                }
            }

            // Render semua voice aktif
            let mut sum_l = 0.0_f32;
            let mut sum_r = 0.0_f32;

            for v in &mut self.voices {
                if !v.active {
                    continue;
                }
                let buf = &v.audio;
                let total_frames = buf.len() / 2;
                if total_frames == 0 {
                    v.active = false;
                    continue;
                }

                let idx = v.pos as usize;
                if idx + 1 >= total_frames {
                    if v.mode == PadMode::Loop {
                        v.pos %= total_frames as f64;
                    } else {
                        v.active = false;
                        continue;
                    }
                }

                // Interpolasi linear antar sample
                let idx = v.pos as usize;
                let frac = (v.pos - idx as f64) as f32;
                let s0_l = buf[idx * 2];
                let s0_r = buf[idx * 2 + 1];
                let (s1_l, s1_r) = if idx + 1 < total_frames {
                    (buf[(idx + 1) * 2], buf[(idx + 1) * 2 + 1])
                } else if v.mode == PadMode::Loop {
                    (buf[0], buf[1])
                } else {
                    (0.0, 0.0)
                };

                let sample_l = s0_l + frac * (s1_l - s0_l);
                let sample_r = s0_r + frac * (s1_r - s0_r);

                if v.fading_out {
                    v.fade_level -= FADE_RATE;
                    if v.fade_level <= 0.0 {
                        v.active = false;
                        continue;
                    }
                }

                let amp = v.volume * v.fade_level * self.master_volume;
                sum_l += sample_l * amp;
                sum_r += sample_r * amp;

                v.pos += v.speed;

                // Tandai pad sedang main untuk DTO UI
                if v.pad_id < PADS_PER_BANK {
                    pad_active[v.pad_id] = true;
                    let prog = (v.pos / total_frames as f64) as f32;
                    pad_progress[v.pad_id] = prog.clamp(0.0, 1.0);
                }
            }

            self.scratch_l[i] = sum_l;
            self.scratch_r[i] = sum_r;
        }

        // Update atomik untuk polling UI cepat
        for p in 0..PADS_PER_BANK {
            self.pad_states[p]
                .is_playing
                .store(pad_active[p], Ordering::Relaxed);
            self.pad_states[p]
                .progress_bits
                .store(pad_progress[p].to_bits(), Ordering::Relaxed);
        }
    }

    #[inline]
    pub fn sample_at(&self, index: usize) -> (f32, f32) {
        if index < self.scratch_l.len() {
            (self.scratch_l[index], self.scratch_r[index])
        } else {
            (0.0, 0.0)
        }
    }
}

/// Controller sampler untuk thread UI & IPC commands.
pub struct SamplerController {
    command_tx: Sender<SamplerCommand>,
    pad_states: Arc<[AtomicPadState; PADS_PER_BANK]>,
    banks: Arc<RwLock<[SampleBank; BANK_COUNT]>>,
    active_bank: Arc<RwLock<usize>>,
    sequencer_cache: Arc<RwLock<StepSequencer>>,
    master_volume: Arc<RwLock<f32>>,
    sample_rate: u32,
}

impl SamplerController {
    pub fn new(sample_rate: u32) -> (Self, SamplerRt) {
        let (command_tx, command_rx) = bounded(256);
        let pad_states: Arc<[AtomicPadState; PADS_PER_BANK]> =
            Arc::new(std::array::from_fn(|_| AtomicPadState::default()));
        let default_banks = create_default_banks(sample_rate);
        let banks = Arc::new(RwLock::new(default_banks));
        let active_bank = Arc::new(RwLock::new(0));
        let sequencer_cache = Arc::new(RwLock::new(StepSequencer::new(128.0)));
        let master_volume = Arc::new(RwLock::new(1.0));

        let rt = SamplerRt::new(sample_rate as f32, command_rx, Arc::clone(&pad_states));

        let controller = Self {
            command_tx,
            pad_states,
            banks,
            active_bank,
            sequencer_cache,
            master_volume,
            sample_rate,
        };

        (controller, rt)
    }

    pub fn trigger_pad(&self, pad_id: usize, velocity: Option<f32>) {
        let _ = self.command_tx.send(SamplerCommand::TriggerPad {
            pad_id,
            velocity: velocity.unwrap_or(1.0),
            force_restart: false,
        });
    }

    pub fn release_pad(&self, pad_id: usize) {
        let _ = self.command_tx.send(SamplerCommand::ReleasePad { pad_id });
    }

    pub fn stop_pad(&self, pad_id: usize) {
        let _ = self.command_tx.send(SamplerCommand::StopPad { pad_id });
    }

    pub fn stop_all(&self) {
        let _ = self.command_tx.send(SamplerCommand::StopAll);
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn select_bank(&self, bank_id: usize) {
        if bank_id < BANK_COUNT {
            *self.active_bank.write() = bank_id;
            let _ = self.command_tx.send(SamplerCommand::SwitchBank(bank_id));
        }
    }

    pub fn set_master_volume(&self, vol: f32) {
        let clamped = vol.clamp(0.0, 2.0);
        *self.master_volume.write() = clamped;
        let _ = self
            .command_tx
            .send(SamplerCommand::SetMasterVolume(clamped));
    }

    pub fn update_pad(&self, pad_id: usize, update: PadUpdate) {
        let active_bank = *self.active_bank.read();
        if active_bank < BANK_COUNT && pad_id < PADS_PER_BANK {
            {
                let mut banks = self.banks.write();
                let pad = &mut banks[active_bank].pads[pad_id];
                if let Some(ref name) = update.name {
                    pad.name = name.clone();
                }
                if let Some(ref color) = update.color {
                    pad.color = color.clone();
                }
                if let Some(mode) = update.mode {
                    pad.mode = mode;
                }
                if let Some(vol) = update.volume {
                    pad.volume = vol.clamp(0.0, 2.0);
                }
                if let Some(pitch) = update.pitch_semitones {
                    pad.pitch_semitones = pitch.clamp(-24.0, 24.0);
                }
                if let Some(mg) = update.mute_group {
                    pad.mute_group = mg;
                }
                if let Some(sync) = update.sync_bpm {
                    pad.sync_bpm = sync;
                }
                if let Some(bpm) = update.base_bpm {
                    pad.base_bpm = bpm.max(20.0);
                }
                if let Some(q) = update.quantize {
                    pad.quantize = q;
                }
            }
            let _ = self.command_tx.send(SamplerCommand::UpdatePadParam {
                bank_id: active_bank,
                pad_id,
                update,
            });
        }
    }

    pub fn load_pad_audio(
        &self,
        pad_id: usize,
        audio: Vec<f32>,
        sample_rate: u32,
        name: Option<String>,
    ) {
        let active_bank = *self.active_bank.read();
        let frames = audio.len() / 2;
        let duration = if sample_rate > 0 {
            frames as f32 / sample_rate as f32
        } else {
            0.0
        };
        let audio_arc = Arc::new(audio);

        {
            let mut banks = self.banks.write();
            let pad = &mut banks[active_bank].pads[pad_id];
            pad.audio = Arc::clone(&audio_arc);
            pad.sample_rate = sample_rate;
            pad.duration_secs = duration;
            if let Some(ref n) = name {
                pad.name = n.clone();
            }
        }

        let _ = self.command_tx.send(SamplerCommand::LoadPadAudio {
            bank_id: active_bank,
            pad_id,
            audio: audio_arc,
            sample_rate,
            duration,
            name,
        });
    }

    pub fn update_sequencer(&self, update: SequencerUpdate) {
        {
            let mut seq = self.sequencer_cache.write();
            if let Some(run) = update.running {
                seq.set_running(run);
            }
            if let Some(bpm) = update.bpm {
                seq.bpm = bpm.max(20.0);
            }
            if let Some(sync) = update.sync_to_master {
                seq.sync_to_master = sync;
            }
            if let Some(swing) = update.swing {
                seq.swing = swing.clamp(0.0, 0.75);
            }
            if let Some(pat) = update.current_pattern {
                if pat < 4 {
                    seq.current_pattern = pat;
                }
            }
            if let Some((track, step, active)) = update.track_step {
                seq.set_step(track, step, active);
            }
            if let Some(mappings) = update.pad_mappings {
                seq.pad_mappings = mappings;
            }
        }
        let _ = self
            .command_tx
            .send(SamplerCommand::SequencerUpdate(update));
    }

    pub fn export_pack(&self, dest_path: &std::path::Path) -> Result<(), AudioError> {
        let active_bank = *self.active_bank.read();
        let banks = self.banks.read();
        super::bank::export_sample_pack(&banks[active_bank], dest_path)
    }

    pub fn import_pack(&self, zip_path: &std::path::Path) -> Result<(), AudioError> {
        let active_bank = *self.active_bank.read();
        {
            let mut banks = self.banks.write();
            super::bank::import_sample_pack(zip_path, &mut banks[active_bank])?;
        }
        // Sinkronkan bank ke RT thread
        let banks = self.banks.read();
        for pad in &banks[active_bank].pads {
            let _ = self.command_tx.send(SamplerCommand::LoadPadAudio {
                bank_id: active_bank,
                pad_id: pad.id,
                audio: Arc::clone(&pad.audio),
                sample_rate: pad.sample_rate,
                duration: pad.duration_secs,
                name: Some(pad.name.clone()),
            });
            let _ = self.command_tx.send(SamplerCommand::UpdatePadParam {
                bank_id: active_bank,
                pad_id: pad.id,
                update: PadUpdate {
                    name: Some(pad.name.clone()),
                    color: Some(pad.color.clone()),
                    mode: Some(pad.mode),
                    volume: Some(pad.volume),
                    pitch_semitones: Some(pad.pitch_semitones),
                    mute_group: Some(pad.mute_group),
                    sync_bpm: Some(pad.sync_bpm),
                    base_bpm: Some(pad.base_bpm),
                    quantize: Some(pad.quantize),
                },
            });
        }
        Ok(())
    }

    pub fn status(&self) -> SamplerStatus {
        let active_bank = *self.active_bank.read();
        let banks = self.banks.read();
        let bank_names = [
            banks[0].name.clone(),
            banks[1].name.clone(),
            banks[2].name.clone(),
            banks[3].name.clone(),
        ];

        let mut playing_states: [(bool, f32); PADS_PER_BANK] = [(false, 0.0); PADS_PER_BANK];
        for (i, state) in self.pad_states.iter().enumerate() {
            let is_p = state.is_playing.load(Ordering::Relaxed);
            let prog = f32::from_bits(state.progress_bits.load(Ordering::Relaxed));
            playing_states[i] = (is_p, prog);
        }

        let pads = banks[active_bank].pad_dto_list(&playing_states);
        let sequencer = self.sequencer_cache.read().status();
        let master_volume = *self.master_volume.read();

        SamplerStatus {
            active_bank,
            bank_names,
            pads,
            sequencer,
            master_volume,
        }
    }
}

/// DTO keseluruhan sampler untuk UI React.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamplerStatus {
    pub active_bank: usize,
    pub bank_names: [String; BANK_COUNT],
    pub pads: Vec<PadDto>,
    pub sequencer: SequencerStatus,
    pub master_volume: f32,
}
